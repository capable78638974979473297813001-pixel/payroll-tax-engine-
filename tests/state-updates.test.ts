import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { analyzeStateDeposits, loadProfile, type StateDay } from '../payroll/state/index.ts';
import { dollars } from '../src/money.ts';

function day(date: string, pit: number): StateDay {
  return { date, withholding: dollars(pit), withholdingWages: 0, employeeInsurance: 0, employerUi: 0, uiWages: 0, employeeIds: [] };
}

describe('Hawaii: the Department states the semi-weekly threshold', () => {
  const HI = loadProfile('HI');
  test('above $40,000 a year the frequency is derived: Wednesday-Friday wages are due the next Wednesday', () => {
    const r = analyzeStateDeposits(HI, [day('2026-11-04', 100)], undefined, { lookbackLiability: dollars(50_000) });
    assert.equal(r.obligations[0].dueDate, '2026-11-11');
    assert.equal(r.findings.some((f) => f.code === 'state_frequency_not_derivable'), false);
  });
  test('$40,000 exactly is still monthly (15th of the following month)', () => {
    const r = analyzeStateDeposits(HI, [day('2026-11-04', 100)], undefined, { lookbackLiability: dollars(40_000) });
    assert.equal(r.obligations[0].dueDate, '2026-12-15');
  });
  test('electronic filing and payment mandates over $40,000 are recorded with their penalties', () => {
    assert.match(HI.mandates.efile!.text, /\$40,000.*\$25 per form/);
    assert.match(HI.mandates.epay!.text, /2% penalty/);
  });
});

describe('editions refreshed on 2026-11-06', () => {
  test('Arkansas (instructions effective 01/01/2026, revised 4/27/26) and Utah (Pub 14 Rev. 4/26) now read the 2026 edition', () => {
    for (const st of ['AR', 'UT']) {
      const p = loadProfile(st);
      assert.equal((p.withholding!.deposits as { rulesYear?: number }).rulesYear, 2026, st);
      assert.match(p.sources[0].revision, /2026|4\/26|4\/27\/26/, st);
    }
  });
});
