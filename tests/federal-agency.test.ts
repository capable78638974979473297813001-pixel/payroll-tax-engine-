import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import {
  AgencyNotConnectedError,
  FEDERAL_CHANNELS,
  FilingBook,
  channel,
  connectionReadiness,
  federalCalendar,
  liveTransport,
  makePackage,
  mustEfileW2,
  packageChecksum,
  paymentInstruction,
  sandboxTransport,
  ssaBsoRoute,
  type FilingTransport,
} from '../payroll/federal/agency.ts';
import type { ObligationStatus } from '../payroll/federal/deposits.ts';
import type { Finding } from '../payroll/federal/form941.ts';

const ein = '123456789';

function pkg(findings: Finding[] = [], kind: 'form941' | 'form940' | 'w2_w3' = 'form941', period = '2026-Q1', line12 = 1000) {
  return makePackage({ kind, ein, period, payload: { line12 }, fields: { Line12: line12 }, findings });
}

/** A transport that behaves like a connected live agency, for exercising the lifecycle. */
function fakeLive(channelId: 'irs_mef_94x' | 'ssa_bso_w2' | 'irs_eft_deposit', transmitted = true): FilingTransport {
  return {
    id: 'fake-live',
    channelId,
    mode: 'live',
    connected: true,
    async submit(p) {
      return { transport: 'fake-live', mode: 'live', transmitted, confirmation: `CONF-${p.checksum.slice(0, 6)}`, note: transmitted ? 'Received.' : 'Not received.' };
    },
  };
}

describe('registry', () => {
  test('every channel states its enrollment and where its specification stands', () => {
    for (const c of FEDERAL_CHANNELS) {
      assert.ok(c.enrollment.length > 0, c.id);
      assert.ok(c.specs.length > 0, c.id);
      assert.ok(c.sources.every((s) => s.url.startsWith('https://')), c.id);
    }
    assert.equal(channel('irs_mef_94x').specs[0].availability, 'registered_developers_only');
    assert.equal(channel('ssa_bso_w2').specs[0].availability, 'blocks_automated_access');
  });

  test('the W-2 e-file mandate is "at least 10 information returns"; BSO online forms cover up to 50', () => {
    assert.equal(mustEfileW2(9), false);
    assert.equal(mustEfileW2(10), true);
    assert.equal(mustEfileW2(6, 4), true); // W-2s plus other information returns count together
    assert.equal(ssaBsoRoute(50), 'bso_online_forms');
    assert.equal(ssaBsoRoute(51), 'bso_file_upload');
  });
});

describe('filing lifecycle', () => {
  test('a package with errors is a draft and cannot be approved; a clean one is validated', () => {
    const book = new FilingBook();
    const bad = book.add(pkg([{ severity: 'error', code: 'x', message: 'broken' }], 'form941', '2026-Q1', 1));
    assert.equal(bad.status, 'draft');
    assert.throws(() => book.approve(bad.id, { name: 'Pat', title: 'Owner' }), /only a validated filing/);
    const ok = book.add(pkg([], 'form941', '2026-Q2', 2));
    assert.equal(ok.status, 'validated');
  });

  test('approval needs a named signer with a title, and is recorded in the audit trail', () => {
    const book = new FilingBook({ now: () => '2026-10-30T12:00:00Z' });
    const rec = book.add(pkg());
    assert.throws(() => book.approve(rec.id, { name: ' ', title: 'Owner' }), /name and title/);
    book.approve(rec.id, { name: 'Pat Rooter', title: 'Owner' });
    assert.equal(rec.status, 'approved');
    assert.deepEqual(rec.events.map((e) => e.status), ['validated', 'approved']);
    assert.equal(rec.events[1].actor, 'Pat Rooter');
    assert.equal(rec.events[1].at, '2026-10-30T12:00:00Z');
  });

  test('figures changed after the package was built are refused (checksum)', () => {
    const book = new FilingBook();
    const rec = book.add(pkg());
    (rec.package.payload as { line12: number }).line12 = 999_999; // tamper
    assert.throws(() => book.approve(rec.id, { name: 'Pat', title: 'Owner' }), /checksum mismatch/);
  });

  test('a rehearsal through the sandbox is not a filing: nothing is transmitted and it cannot be acknowledged', async () => {
    const book = new FilingBook();
    const rec = book.add(pkg());
    book.approve(rec.id, { name: 'Pat', title: 'Owner' });
    await book.submit(rec.id, sandboxTransport('irs_mef_94x'));
    assert.equal(rec.status, 'rehearsed');
    assert.equal(rec.receipt!.transmitted, false);
    assert.equal(rec.receipt!.mode, 'sandbox');
    assert.match(rec.receipt!.note, /not a filing/i);
    assert.throws(() => book.acknowledge(rec.id, { accepted: true }), /applies only to a transmitted filing/);
    // and it can be rehearsed again
    await book.submit(rec.id, sandboxTransport('irs_mef_94x'));
    assert.equal(rec.status, 'rehearsed');
  });

  test('an unapproved filing cannot be submitted, and the transport must serve the filing\'s channel', async () => {
    const book = new FilingBook();
    const rec = book.add(pkg());
    await assert.rejects(book.submit(rec.id, sandboxTransport('irs_mef_94x')), /must be approved/);
    book.approve(rec.id, { name: 'Pat', title: 'Owner' });
    await assert.rejects(book.submit(rec.id, sandboxTransport('ssa_bso_w2')), /serves ssa_bso_w2/);
  });

  test('the live transports refuse, naming what the operator must obtain first', async () => {
    const book = new FilingBook();
    const rec = book.add(pkg());
    book.approve(rec.id, { name: 'Pat', title: 'Owner' });
    await assert.rejects(book.submit(rec.id, liveTransport('irs_mef_94x')), (e: unknown) => {
      assert.ok(e instanceof AgencyNotConnectedError);
      assert.match(e.message, /e-Services account/);
      assert.match(e.message, /registered developers only/);
      assert.ok(e.prerequisites.length >= 3);
      return true;
    });
    assert.equal(rec.status, 'approved', 'a refused submission leaves the filing exactly as it was');
  });

  test('transmitted then accepted: the full path, with the audit trail', async () => {
    const book = new FilingBook();
    const rec = book.add(pkg());
    book.approve(rec.id, { name: 'Pat', title: 'Owner' });
    await book.submit(rec.id, fakeLive('irs_mef_94x'));
    assert.equal(rec.status, 'transmitted');
    book.acknowledge(rec.id, { accepted: true, confirmation: 'SUB-123' });
    assert.equal(rec.status, 'accepted');
    assert.equal(rec.receipt!.confirmation, 'SUB-123');
    assert.deepEqual(rec.events.map((e) => e.status), ['validated', 'approved', 'transmitted', 'accepted']);
  });

  test('a live transport that reports transmitted:false does not make the filing transmitted', async () => {
    const book = new FilingBook();
    const rec = book.add(pkg());
    book.approve(rec.id, { name: 'Pat', title: 'Owner' });
    await book.submit(rec.id, fakeLive('irs_mef_94x', false));
    assert.notEqual(rec.status, 'transmitted');
  });

  test('rejected with reasons; an amendment that is accepted supersedes the original', async () => {
    const book = new FilingBook();
    const first = book.add(pkg([], 'form941', '2026-Q1', 1000));
    book.approve(first.id, { name: 'Pat', title: 'Owner' });
    await book.submit(first.id, fakeLive('irs_mef_94x'));
    book.acknowledge(first.id, { accepted: false, rejections: [{ code: 'R1', message: 'EIN does not match' }] });
    assert.equal(first.status, 'rejected');
    assert.match(first.events.at(-1)!.note!, /R1 EIN does not match/);

    const ok = book.add(pkg([], 'form941', '2026-Q2', 2000));
    book.approve(ok.id, { name: 'Pat', title: 'Owner' });
    await book.submit(ok.id, fakeLive('irs_mef_94x'));
    book.acknowledge(ok.id, { accepted: true });

    const amended = book.add(pkg([], 'form941', '2026-Q2', 2100)); // same period, different figures
    assert.equal(amended.supersedes, ok.id);
    book.approve(amended.id, { name: 'Pat', title: 'Owner' });
    await book.submit(amended.id, fakeLive('irs_mef_94x'));
    book.acknowledge(amended.id, { accepted: true });
    assert.equal(ok.status, 'superseded');
    assert.equal(amended.status, 'accepted');
  });

  test('checksums depend on the figures and not on key order', () => {
    assert.equal(packageChecksum({ a: 1, b: 2 }, { x: 1 }), packageChecksum({ b: 2, a: 1 }, { x: 1 }));
    assert.notEqual(packageChecksum({ a: 1 }, {}), packageChecksum({ a: 2 }, {}));
  });
});

describe('connection readiness', () => {
  test('a stub live transport that refuses is not "live"', () => {
    const r = connectionReadiness([liveTransport('irs_mef_94x'), sandboxTransport('irs_mef_94x')]);
    const mef = r.find((x) => x.channelId === 'irs_mef_94x')!;
    assert.equal(mef.mode, 'sandbox');
    assert.ok(mef.missing.length > 0);
  });
  test('nothing configured reports none; a connected live transport reports live', () => {
    assert.equal(connectionReadiness().every((r) => r.mode === 'none'), true);
    const r = connectionReadiness([fakeLive('ssa_bso_w2')]);
    assert.equal(r.find((x) => x.channelId === 'ssa_bso_w2')!.mode, 'live');
    assert.deepEqual(r.find((x) => x.channelId === 'ssa_bso_w2')!.missing, []);
  });
});

describe('payment instruction (Pub. 15 cutoffs)', () => {
  const base = { form: '941' as const, ein, year: 2026, quarter: 2 as const, dueDate: '2026-07-31' };
  test('$1 million or less: same-day before 3:00 p.m. Eastern on the due date', () => {
    const i = paymentInstruction({ ...base, amount: dollars(1_000_000) });
    assert.deepEqual(i.submitBy, { date: '2026-07-31', timeEastern: '3:00 p.m.', rule: i.submitBy.rule });
    assert.equal(i.status, 'NOT TRANSMITTED');
  });
  test('more than $1 million: by 8:00 p.m. Eastern the business day before', () => {
    const i = paymentInstruction({ ...base, amount: dollars(1_000_000) + 1, dueDate: '2026-07-31' });
    assert.equal(i.submitBy.date, '2026-07-30');
    assert.equal(i.submitBy.timeEastern, '8:00 p.m.');
  });
  test('"the day before" skips weekends and holidays (due Monday Jun 22, 2026 -> Friday Jun 19 is Juneteenth -> Thursday Jun 18)', () => {
    const i = paymentInstruction({ ...base, amount: dollars(2_000_000), dueDate: '2026-06-22' });
    assert.equal(i.submitBy.date, '2026-06-18');
  });
});

describe('compliance calendar', () => {
  const status = (dueDate: string, state: ObligationStatus['state'], shortfall = 0): ObligationStatus => ({
    obligation: { id: `o-${dueDate}`, year: 2026, quarter: 2, payDates: ['2026-06-03'], liability: dollars(1_000), creditApplied: 0, amountDue: dollars(1_000), dueDate, rule: 'semiweekly', schedule: 'semiweekly' },
    state,
    applications: [],
    deposited: shortfall ? 0 : dollars(1_000),
    shortfall,
    daysLate: 0,
    penaltyRate: 0,
    withinAccuracyRule: false,
    estimatedPenalty: 0,
  });

  test('overdue first, then due-soon, then upcoming, then done; ties by date', () => {
    const cal = federalCalendar({
      today: '2026-07-10',
      ein,
      depositStatuses: [
        status('2026-07-01', 'paid_on_time'),
        status('2026-07-08', 'unpaid', dollars(1_000)),
        status('2026-07-15', 'not_due', dollars(1_000)),
        status('2026-09-01', 'not_due', dollars(1_000)),
      ],
      returns: [{ kind: 'return_941', title: 'Form 941, Q2 2026', dueDate: '2026-07-31' }],
    });
    assert.deepEqual(cal.map((c) => [c.dueDate, c.urgency]), [
      ['2026-07-08', 'overdue'],
      ['2026-07-15', 'due_soon'],
      ['2026-07-31', 'upcoming'],
      ['2026-09-01', 'upcoming'],
      ['2026-07-01', 'done'],
    ]);
    assert.match(cal[0].detail, /\$1000\.00 outstanding/);
  });

  test('a return is done only when transmitted or accepted - a draft, validated or rehearsed filing is not', async () => {
    const book = new FilingBook();
    const rec = book.add(pkg());
    const item = () => federalCalendar({ today: '2026-04-20', ein, book, returns: [{ kind: 'return_941', title: '941 Q1', dueDate: '2026-04-30', filingId: rec.id }] })[0];
    assert.equal(item().urgency, 'upcoming');
    book.approve(rec.id, { name: 'Pat', title: 'Owner' });
    await book.submit(rec.id, sandboxTransport('irs_mef_94x'));
    assert.equal(item().urgency, 'upcoming');
    assert.match(item().detail, /a rehearsal is not a filing/);
    await book.submit(rec.id, fakeLive('irs_mef_94x'));
    assert.equal(item().urgency, 'done');
  });

  test('due today is its own urgency', () => {
    const cal = federalCalendar({ today: '2026-07-15', ein, depositStatuses: [status('2026-07-15', 'not_due', dollars(1_000))] });
    assert.equal(cal[0].urgency, 'due_today');
  });
});
