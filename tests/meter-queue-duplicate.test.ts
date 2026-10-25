import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { deliverMeterEvent, isDuplicateMeterEvent, type QueuedMeterEvent } from '../api/meter-queue.ts';

/**
 * Stripe answers 400 when a meter event identifier was already accepted.
 * That delivery happened, so the queue must treat it as success. Any other
 * Stripe error stays a failure and is retried.
 */

const item: QueuedMeterEvent = {
  identifier: 'evt_123',
  customerId: 'cus_1',
  value: 1,
  at: new Date().toISOString(),
  attempts: 1,
  lastAttemptAt: null,
};

let server: Server;
const replies: { status: number; body: unknown }[] = [];

before(async () => {
  server = createServer((_req, res) => {
    const next = replies.shift() ?? { status: 500, body: { error: { message: 'no stub reply queued' } } };
    res.writeHead(next.status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(next.body));
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  process.env.STRIPE_API_BASE = `http://127.0.0.1:${port}`;
  process.env.STRIPE_SECRET_KEY = 'sk_test_meter_duplicate';
  process.env.STRIPE_ALLOW_LIVE = '';
});

after(() => {
  server?.close();
  delete process.env.STRIPE_API_BASE;
  delete process.env.STRIPE_SECRET_KEY;
});

describe('isDuplicateMeterEvent', () => {
  test('matches Stripe’s already-exists identifier error', () => {
    const err = Object.assign(new Error('An event already exists with identifier evt_123'), { code: 'resource_already_exists' });
    assert.equal(isDuplicateMeterEvent(err), true);
    assert.equal(isDuplicateMeterEvent(new Error('duplicate identifier evt_9')), true);
    assert.equal(isDuplicateMeterEvent(new Error('already exists')), false);
    assert.equal(isDuplicateMeterEvent(new Error('Request rate limit exceeded.')), false);
  });
});

describe('deliverMeterEvent', () => {
  test('a duplicate identifier is delivered, and a different Stripe error is not', async () => {
    replies.push({
      status: 400,
      body: {
        error: {
          message: 'An event already exists with identifier evt_123',
          type: 'invalid_request_error',
          code: 'resource_already_exists',
        },
      },
    });
    assert.deepEqual(await deliverMeterEvent(item, 'paycheck_calculation'), { delivered: true });

    replies.push({
      status: 400,
      body: {
        error: {
          message: 'An event already exists with identifier evt_123',
          type: 'invalid_request_error',
        },
      },
    });
    assert.deepEqual(await deliverMeterEvent({ ...item, identifier: 'evt_msg_only' }, 'paycheck_calculation'), { delivered: true });

    replies.push({
      status: 429,
      body: { error: { message: 'Request rate limit exceeded.', type: 'rate_limit_error', code: 'rate_limit' } },
    });
    const failed = await deliverMeterEvent({ ...item, identifier: 'evt_limited' }, 'paycheck_calculation');
    assert.equal(failed.delivered, false);
    if (!failed.delivered) assert.match(failed.error, /rate limit/i);
  });
});
