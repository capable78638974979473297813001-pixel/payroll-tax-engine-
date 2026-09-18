import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeMissingHoursNudges,
  consoleNudgeSender,
  distanceMeters,
  monthlyBill,
  renderNudgeText,
  sendNudges,
  verifyClockIn,
  type Job,
  type NudgeWorker,
} from '../trades/index.ts';

// ============================================================================
// Geofenced clock-ins (trades/geofence.ts)
// ============================================================================

describe('geofenced clock-ins (trades/geofence.ts)', () => {
  test('distance is 0 for the same point and ~111 m per 0.001° of latitude', () => {
    assert.equal(distanceMeters({ lat: 30, lng: -97 }, { lat: 30, lng: -97 }), 0);
    const d = distanceMeters({ lat: 0, lng: 0 }, { lat: 0.001, lng: 0 });
    assert.ok(Math.abs(d - 111) <= 1, `expected ~111 m, got ${d}`);
  });

  const fencedJob: Job = { id: 'J1', companyId: 'c', name: 'Site', workState: 'TX', location: { lat: 30, lng: -97.75, radiusMeters: 150 } };

  test('a punch inside the radius is on site; outside is recorded but flagged', () => {
    const inside = verifyClockIn(fencedJob, { lat: 30.0009, lng: -97.75 }); // ~100 m north
    assert.equal(inside.onSite, true);
    assert.ok(inside.distanceMeters !== null && inside.distanceMeters <= 150);

    const outside = verifyClockIn(fencedJob, { lat: 30.005, lng: -97.75 }); // ~556 m north
    assert.equal(outside.onSite, false);
    assert.match(outside.note, /Off site/i);
  });

  test('a job with no geofence, or a punch with no coordinates, is accepted (not flagged)', () => {
    const noFence = verifyClockIn({ ...fencedJob, location: undefined }, { lat: 0, lng: 0 });
    assert.equal(noFence.onSite, true);
    assert.equal(noFence.distanceMeters, null);

    const noCoords = verifyClockIn(fencedJob, null);
    assert.equal(noCoords.onSite, true);
    assert.match(noCoords.note, /unverified/i);
  });
});

// ============================================================================
// Hour-log nudges (trades/nudge.ts)
// ============================================================================

describe('hour-log nudges (trades/nudge.ts)', () => {
  test('the reminder names the worker and the day in plain language', () => {
    const text = renderNudgeText('Joe Pipe', '2026-01-09');
    assert.match(text, /Joe/);
    assert.match(text, /Fri Jan 9/);
    assert.match(text, /Crewtally/);
  });

  test('only active workers who logged nothing that day are nudged', () => {
    const crew: NudgeWorker[] = [
      { employeeId: 'joe', name: 'Joe Pipe', phone: '+15125551000' },
      { employeeId: 'amy', name: 'Amy Wire' },
      { employeeId: 'pat', name: 'Pat Ledger', phone: '+15125552000' },
    ];
    const nudges = computeMissingHoursNudges(crew, ['joe'], '2026-01-09'); // joe already logged
    assert.deepEqual(nudges.map((n) => n.employeeId).sort(), ['amy', 'pat']);
    assert.equal(nudges.find((n) => n.employeeId === 'amy')!.phone, null); // no number on file
  });

  test('the default sender stages the message honestly — never claims delivery', () => {
    const results = sendNudges(computeMissingHoursNudges([{ employeeId: 'pat', name: 'Pat' }], [], '2026-01-09'), consoleNudgeSender);
    assert.equal(results.length, 1);
    assert.equal(results[0].delivered, false);
    assert.match(results[0].via, /no SMS carrier/i);
  });
});

// ============================================================================
// $5 / employee billing (trades/billing.ts)
// ============================================================================

describe('per-employee billing (trades/billing.ts)', () => {
  test('$5 per active employee per month', () => {
    assert.deepEqual(monthlyBill(3), { headcount: 3, perEmployeeCents: 500, totalCents: 1500 });
  });
  test('a zero or negative headcount bills nothing', () => {
    assert.equal(monthlyBill(0).totalCents, 0);
    assert.equal(monthlyBill(-4).totalCents, 0);
  });
});
