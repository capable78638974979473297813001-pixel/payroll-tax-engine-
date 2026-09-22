import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { keyLifeFor, KEY_TTL_MS } from '../site/lib/keylife.ts';
import type { SubscriptionRecord } from '../site/lib/store.ts';

const now = Date.UTC(2026, 0, 1); // 2026-01-01
const sub = (over: Partial<SubscriptionRecord>): SubscriptionRecord => ({
  email: 'a@b.co', legalName: '', billingContact: '', billingEmail: '', address: '',
  expectedEmployees: 0, payFrequency: 'biweekly', rooftop: false, estimatedAnnual: 0,
  status: 'unverified', trialStartsAt: null, trialEndsAt: null, termMonths: 12,
  termEndsAt: null, createdAt: '', activatedAt: null, ...over,
});

describe('keyLifeFor (key lifetime by commercial status)', () => {
  test('no subscription -> a 14-day evaluation key', () => {
    const l = keyLifeFor(undefined, now);
    assert.equal(l.plan, 'evaluation');
    assert.equal(new Date(l.expiresAt).getTime(), now + KEY_TTL_MS);
  });

  test('a trialing subscription -> a trial key that lives to the committed term end', () => {
    const termEnd = now + 400 * 86_400_000;
    const l = keyLifeFor(sub({ status: 'trialing', termEndsAt: new Date(termEnd).toISOString() }), now);
    assert.equal(l.plan, 'trial');
    assert.equal(new Date(l.expiresAt).getTime(), termEnd);
  });

  test('an active subscription -> an active key to the term end', () => {
    const termEnd = now + 365 * 86_400_000;
    const l = keyLifeFor(sub({ status: 'active', termEndsAt: new Date(termEnd).toISOString() }), now);
    assert.equal(l.plan, 'active');
    assert.equal(new Date(l.expiresAt).getTime(), termEnd);
  });

  test('never shorter than the evaluation window, even with a near-term end', () => {
    const l = keyLifeFor(sub({ status: 'trialing', termEndsAt: new Date(now + 1000).toISOString() }), now);
    assert.equal(new Date(l.expiresAt).getTime(), now + KEY_TTL_MS);
  });

  test('trialing with no recorded term end still gets a long-lived key (a year out)', () => {
    const l = keyLifeFor(sub({ status: 'trialing', termEndsAt: null }), now);
    assert.ok(new Date(l.expiresAt).getTime() >= now + 364 * 86_400_000);
  });

  test('a cancelled subscription falls back to an evaluation key', () => {
    const l = keyLifeFor(sub({ status: 'cancelled' }), now);
    assert.equal(l.plan, 'evaluation');
  });
});
