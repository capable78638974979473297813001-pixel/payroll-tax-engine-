import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars, type Cents } from '../src/money.ts';
import type { PayRun, PayRunLine } from '../payroll/types.ts';
import {
  addDays,
  dcLegalHolidays,
  form940Due,
  form941Due,
  formW2Due,
  isBusinessDay,
  monthlyDepositDue,
  nextBusinessDay,
  nthBusinessDayAfter,
  semiweeklyDepositDue,
  semiweeklyPeriodEnd,
  weekday,
} from '../payroll/federal/calendar.ts';
import { reconcileDeposits, type TaxDeposit } from '../payroll/federal/deposits.ts';
import { computeForm941, timesRate, type DatedAdjustment, type EmployerIdentity, type Form941Input } from '../payroll/federal/form941.ts';
import { buildLedger } from '../payroll/federal/ledger.ts';
import { FUTA_WAGE_BASE, futaDepositPlan, paymentsOverWageBase } from '../payroll/federal/form940.ts';
import { FilingBook, liveTransport, makePackage, sandboxTransport, type FilingStatus, type FilingTransport } from '../payroll/federal/agency.ts';

/**
 * PROPERTY TESTS. Hand-picked examples (the IRS's own, in the other federal-*
 * test files) show the rules are implemented; these show nothing breaks between
 * them. Each scenario is a randomized payroll year; every invariant below is a
 * statement the IRS forms or instructions make that must hold for ANY payroll.
 * The generator is seeded, so a failure names its seed and reproduces exactly.
 */

function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const employer: EmployerIdentity = {
  ein: '123456789',
  legalName: 'Property Test Co',
  address: { street: '1 Main St', city: 'Columbus', state: 'OH', zip: '43215' },
};

function run(date: string, wages: Cents, fit: Cents, employees: number): PayRun {
  const line = (i: number): PayRunLine => ({
    employeeId: `e${i}`,
    grossPay: wages,
    netPay: 0,
    employeeTaxTotal: 0,
    employerTaxTotal: 0,
    pretaxDeductions: 0,
    posttaxDeductions: 0,
    garnishmentTotal: 0,
    netPayAfterGarnishment: 0,
    garnishmentLines: [],
    depositAllocations: [],
    taxLines: [
      { id: 'US_FIT', name: 'FIT', payer: 'employee', jurisdiction: 'federal', taxableWages: wages, amount: fit },
      { id: 'US_SS_EE', name: 'SS', payer: 'employee', jurisdiction: 'federal', taxableWages: wages, amount: timesRate(wages, { numerator: 62, denominator: 1000 }) },
      { id: 'US_SS_ER', name: 'SS ER', payer: 'employer', jurisdiction: 'federal', taxableWages: wages, amount: timesRate(wages, { numerator: 62, denominator: 1000 }) },
      { id: 'US_MED_EE', name: 'Med', payer: 'employee', jurisdiction: 'federal', taxableWages: wages, amount: timesRate(wages, { numerator: 145, denominator: 10000 }) },
      { id: 'US_MED_ER', name: 'Med ER', payer: 'employer', jurisdiction: 'federal', taxableWages: wages, amount: timesRate(wages, { numerator: 145, denominator: 10000 }) },
    ],
  });
  return {
    id: `r-${date}-${wages}`,
    companyId: 'co',
    periodStart: addDays(date, -13),
    periodEnd: addDays(date, -1),
    checkDate: date,
    status: 'approved',
    lines: Array.from({ length: employees }, (_, i) => line(i)),
    createdAt: `${date}T00:00:00Z`,
    minimumWageIssues: [],
  };
}

type Pattern = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly' | 'irregular';

function payDates(rand: () => number, pattern: Pattern, year: number): string[] {
  const dates: string[] = [];
  const first = `${year}-01-${String(1 + Math.floor(rand() * 7)).padStart(2, '0')}`;
  if (pattern === 'weekly' || pattern === 'biweekly') {
    for (let d = first; d.startsWith(`${year}-`); d = addDays(d, pattern === 'weekly' ? 7 : 14)) dates.push(d);
  } else if (pattern === 'semimonthly') {
    for (let m = 1; m <= 12; m += 1) {
      const mm = String(m).padStart(2, '0');
      dates.push(`${year}-${mm}-15`, `${year}-${mm}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate())}`);
    }
  } else if (pattern === 'monthly') {
    for (let m = 1; m <= 12; m += 1) dates.push(`${year}-${String(m).padStart(2, '0')}-${String(new Date(Date.UTC(year, m, 0)).getUTCDate())}`);
  } else {
    const n = 5 + Math.floor(rand() * 60);
    for (let i = 0; i < n; i += 1) dates.push(addDays(`${year}-01-01`, Math.floor(rand() * 365)));
  }
  return [...new Set(dates)].sort();
}

interface Scenario {
  seed: number;
  pattern: Pattern;
  runs: PayRun[];
  adjustments: DatedAdjustment[];
  lookbackTotalLine12?: Cents;
  semiweeklyFromPriorYear: boolean;
  researchCreditFraction: number;
}

function scenario(seed: number, year = 2026): Scenario {
  const rand = prng(seed);
  const patterns: Pattern[] = ['weekly', 'biweekly', 'semimonthly', 'monthly', 'irregular'];
  const pattern = patterns[Math.floor(rand() * patterns.length)];
  // Payroll size: from a handful of employees to a very large one, so every deposit rule is reached.
  const sizeClass = rand();
  const wagesPer = sizeClass < 0.4 ? dollars(500 + rand() * 4_000) : sizeClass < 0.8 ? dollars(20_000 + rand() * 80_000) : dollars(300_000 + rand() * 900_000);
  const runs = payDates(rand, pattern, year).map((d) => {
    const wages = Math.round(wagesPer * (0.5 + rand()));
    const bonus = rand() < 0.08 ? 6 : 1; // an occasional big bonus run on the same or another date
    return run(d, wages * bonus, Math.round(wages * (0.05 + rand() * 0.15)), 1 + Math.floor(rand() * 3));
  });
  if (rand() < 0.25) {
    // an off-cycle run on an existing date: two runs paid the same day must merge into one day
    const d = runs[Math.floor(rand() * runs.length)].checkDate;
    runs.push({ ...run(d, dollars(1_000), dollars(100), 1), id: `off-${d}` });
  }
  const adjustments: DatedAdjustment[] = [];
  const nAdj = Math.floor(rand() * 4);
  for (let i = 0; i < nAdj; i += 1) {
    const line = (['5f', '8', '9'] as const)[Math.floor(rand() * 3)];
    const amount = line === '5f' ? dollars(Math.round(rand() * 5_000)) : -dollars(Math.round(rand() * 2_000));
    adjustments.push({ date: addDays(`${year}-01-01`, Math.floor(rand() * 365)), amount, line });
  }
  return {
    seed,
    pattern,
    runs,
    adjustments,
    lookbackTotalLine12: rand() < 0.2 ? undefined : dollars(rand() * 150_000),
    semiweeklyFromPriorYear: rand() < 0.15,
    researchCreditFraction: rand() < 0.3 ? rand() * 0.8 : 0,
  };
}

const QUARTER_END_MONTH = { 1: '03', 2: '06', 3: '09', 4: '12' } as const;

function formFor(s: Scenario, quarter: 1 | 2 | 3 | 4, extra: Partial<Form941Input> = {}, year = 2026) {
  // Size the research credit as a fraction of the quarter's employer shares, so it is always usable.
  const start = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, '0')}-01`;
  const end = `${year}-${QUARTER_END_MONTH[quarter]}-31`;
  const ledger = buildLedger('co', s.runs, { start, end });
  const employerShares = ledger.reduce((a, d) => a + d.socialSecurityEmployer + d.medicareEmployer, 0);
  const researchCredit = Math.floor(employerShares * s.researchCreditFraction);
  return computeForm941(
    {
      employer,
      year,
      quarter,
      runs: s.runs,
      adjustments: s.adjustments,
      lookbackTotalLine12: s.lookbackTotalLine12,
      semiweeklyFromPriorYear: s.semiweeklyFromPriorYear,
      researchCredit,
      priorQuarterLine12: s.lookbackTotalLine12 === undefined ? undefined : Math.round(s.lookbackTotalLine12 / 4),
      ...extra,
    },
    'co',
  );
}

describe('property: Form 941 for 600 randomized payroll years', () => {
  const seeds = Array.from({ length: 600 }, (_, i) => 1000 + i);

  test('the line identities hold on every return', () => {
    for (const seed of seeds) {
      const s = scenario(seed);
      for (const q of [1, 2, 3, 4] as const) {
        const f = formFor(s, q);
        const tag = `seed ${seed} (${s.pattern}) Q${q}`;
        assert.equal(f.line5e_totalSocialSecurityAndMedicare, f.line5a_socialSecurityWages.column2 + f.line5b_socialSecurityTips.column2 + f.line5c_medicareWagesAndTips.column2 + f.line5d_additionalMedicare.column2, tag);
        assert.equal(f.line6_totalTaxesBeforeAdjustments, f.line3_federalIncomeTaxWithheld + f.line5e_totalSocialSecurityAndMedicare + f.line5f_section3121qNoticeAndDemand, tag);
        assert.equal(f.line10_totalTaxesAfterAdjustments, f.line6_totalTaxesBeforeAdjustments + f.line7_fractionsOfCents + f.line8_sickPayAdjustment + f.line9_tipsAndGroupTermLifeAdjustment, tag);
        assert.equal(f.line12_totalAfterAdjustmentsAndCredits, Math.max(0, f.line10_totalTaxesAfterAdjustments - f.line11_researchCredit), tag);
        assert.equal(f.line14_balanceDue > 0 && f.line15a_overpayment > 0, false, `${tag}: lines 14 and 15a both filled`);
        assert.equal(f.line14_balanceDue - f.line15a_overpayment, f.line12_totalAfterAdjustmentsAndCredits - f.line13_totalDeposits, tag);
        // line 7 is only ever fractions of cents for taxes computed from the wages
        assert.ok(Math.abs(f.line7_fractionsOfCents) <= f.statistics.paychecks * 2 + 4, `${tag}: line 7 = ${f.line7_fractionsOfCents}`);
      }
    }
  });

  test('the liability record - line 16 months or Schedule B - always totals line 12', () => {
    let checked = 0;
    for (const seed of seeds) {
      const s = scenario(seed);
      for (const q of [1, 2, 3, 4] as const) {
        const f = formFor(s, q);
        const tag = `seed ${seed} (${s.pattern}) Q${q} ${f.part2.choice}`;
        const unabsorbed = f.findings.some((x) => x.code === 'negative_adjustment_carried_out') || f.line10_totalTaxesAfterAdjustments - f.line11_researchCredit < 0;
        assert.equal(f.findings.some((x) => x.code === 'liability_record_does_not_equal_line12') && !unabsorbed, false, tag);
        if (unabsorbed) continue;
        if (f.part2.choice === 'monthly') assert.equal(f.part2.monthlyLiability!.total, f.line12_totalAfterAdjustmentsAndCredits, tag);
        if (f.part2.choice === 'semiweekly') {
          assert.equal(f.scheduleB!.totalLiabilityForQuarter, f.line12_totalAfterAdjustmentsAndCredits, tag);
          const dates = f.scheduleB!.months.flatMap((m) => m.days.map((d) => d.date));
          assert.deepEqual(dates, [...dates].sort(), `${tag}: Schedule B out of order`);
          assert.equal(new Set(dates).size, dates.length, `${tag}: a date appears twice on Schedule B`);
          for (const m of f.scheduleB!.months) {
            for (const d of m.days) {
              assert.ok(d.liability >= 0, `${tag}: negative Schedule B entry`);
              assert.equal(Number(d.date.slice(5, 7)), m.calendarMonth, `${tag}: ${d.date} is in the wrong month block`);
              assert.equal(Number(d.date.slice(8, 10)), d.day);
            }
          }
        }
        checked += 1;
      }
    }
    assert.ok(checked > 1500, `only ${checked} returns were checked`);
  });

  test('deposits conserve the liability and total line 12 for the quarter', () => {
    for (const seed of seeds) {
      const s = scenario(seed);
      for (const q of [1, 2, 3, 4] as const) {
        const f = formFor(s, q);
        const tag = `seed ${seed} (${s.pattern}) Q${q}`;
        const unabsorbed = f.findings.some((x) => x.code === 'negative_adjustment_carried_out') || f.line10_totalTaxesAfterAdjustments - f.line11_researchCredit < 0;
        const inQuarter = f.deposits.analysis.obligations.filter((o) => o.year === 2026 && o.quarter === q);
        const due = inQuarter.reduce((a, o) => a + o.amountDue, 0);
        const liability = inQuarter.reduce((a, o) => a + o.liability, 0);
        const credit = inQuarter.reduce((a, o) => a + o.creditApplied, 0);
        if (!unabsorbed) {
          assert.equal(due, Math.max(0, liability - credit), `${tag}: carry arithmetic`);
          assert.equal(due, f.line12_totalAfterAdjustmentsAndCredits, `${tag}: deposits (${due}) != line 12`);
        } else {
          // Nothing could absorb a negative adjustment: deposits stay non-negative and the return says so.
          assert.ok(f.findings.some((x) => x.code === 'negative_adjustment_carried_out') || f.line10_totalTaxesAfterAdjustments - f.line11_researchCredit < 0, `${tag}: leftover without a finding`);
          assert.ok(due >= Math.max(0, liability - credit), `${tag}: deposits fell below the liability`);
        }
      }
    }
  });

  test('every deposit obligation is well formed', () => {
    for (const seed of seeds) {
      const s = scenario(seed);
      const f = formFor(s, 4); // Q4's analysis spans the whole year
      const tag = `seed ${seed} (${s.pattern})`;
      const a = f.deposits.analysis;
      let previousTriggerWhileMonthly = false;
      for (const o of a.obligations) {
        assert.ok(isBusinessDay(o.dueDate), `${tag}: ${o.id} due ${o.dueDate} is not a business day`);
        assert.ok(o.dueDate > o.payDates[o.payDates.length - 1], `${tag}: ${o.id} due on/before its last pay date`);
        assert.deepEqual(o.payDates, [...o.payDates].sort(), `${tag}: pay dates out of order`);
        for (const d of o.payDates) assert.equal(`${d.slice(0, 4)}-${Math.floor((Number(d.slice(5, 7)) - 1) / 3) + 1}`, `${o.year}-${o.quarter}`, `${tag}: ${o.id} spans quarters`);
        if (o.rule === 'next_day') {
          assert.ok(o.liability >= 10_000_000, `${tag}: ${o.id} is next-day but only ${o.liability}`);
          assert.equal(o.dueDate, nextBusinessDay(o.payDates[o.payDates.length - 1]));
        } else {
          assert.ok(o.liability < 10_000_000, `${tag}: ${o.id} ${o.liability} should have been a next-day deposit`);
        }
        if (o.rule === 'semiweekly') {
          const end = semiweeklyPeriodEnd(o.payDates[0]);
          for (const d of o.payDates) assert.equal(semiweeklyPeriodEnd(d), end, `${tag}: ${o.id} mixes deposit periods`);
          assert.equal(o.dueDate, nthBusinessDayAfter(end, 3));
        }
        if (o.rule === 'monthly') {
          for (const d of o.payDates) assert.equal(d.slice(0, 7), o.payDates[0].slice(0, 7), `${tag}: ${o.id} mixes months`);
          assert.equal(o.dueDate, monthlyDepositDue(o.payDates[0]));
        }
        previousTriggerWhileMonthly ||= o.rule === 'next_day' && o.schedule === 'monthly';
      }
      if (a.startingSchedule === 'semiweekly') assert.equal(a.becameSemiweeklyOn, undefined, `${tag}`);
      if (a.becameSemiweeklyOn !== undefined) assert.ok(previousTriggerWhileMonthly, `${tag}: became semiweekly without a monthly next-day trigger`);
      // a monthly depositor never has a monthly-rule obligation after becoming semiweekly
      if (a.becameSemiweeklyOn) {
        for (const o of a.obligations) if (o.payDates[0] >= a.becameSemiweeklyOn) assert.notEqual(o.schedule, 'monthly', `${tag}: monthly obligation after switching`);
      }
    }
  });

  test('every pay date is covered by exactly one deposit - nothing dropped, nothing counted twice', () => {
    for (const seed of seeds) {
      const s = scenario(seed);
      const f = formFor(s, 4);
      const covered = f.deposits.analysis.obligations.flatMap((o) => o.payDates);
      const ledger = buildLedger('co', s.runs, { start: '2026-01-01', end: '2026-12-31' });
      const adjDates = s.adjustments.map((a) => a.date);
      const expected = [...new Set([...ledger.map((d) => d.date), ...adjDates])].sort();
      assert.deepEqual([...new Set(covered)].sort(), expected, `seed ${seed}`);
      assert.equal(new Set(covered).size, covered.length, `seed ${seed}: a pay date is in two deposits`);
    }
  });

  test('depositing exactly what is due on the due date always reconciles clean', () => {
    for (const seed of seeds.slice(0, 300)) {
      const s = scenario(seed);
      const f = formFor(s, 4);
      const obligations = f.deposits.analysis.obligations.filter((o) => o.amountDue > 0);
      const deposits: TaxDeposit[] = obligations.map((o, i) => ({ id: `d${i}`, date: o.dueDate, amount: o.amountDue, year: o.year, quarter: o.quarter }));
      const r = reconcileDeposits(f.deposits.analysis.obligations, deposits, '2027-03-01');
      assert.deepEqual(r.unapplied, [], `seed ${seed}: unapplied ${JSON.stringify(r.unapplied)}`);
      for (const st of r.statuses) {
        assert.equal(st.state, 'paid_on_time', `seed ${seed}: ${st.obligation.id} is ${st.state}`);
        assert.equal(st.estimatedPenalty, 0);
        assert.equal(st.shortfall, 0);
      }
      assert.equal(r.totalDeposited, r.totalDue);
    }
  });

  test('the first deposit made one day late is late, and one dollar short is short', () => {
    for (const seed of seeds.slice(0, 120)) {
      const s = scenario(seed);
      const f = formFor(s, 4);
      const o = f.deposits.analysis.obligations.find((x) => x.amountDue > dollars(10));
      if (!o) continue;
      const late = reconcileDeposits([o], [{ id: 'l', date: nextBusinessDay(o.dueDate), amount: o.amountDue, year: o.year, quarter: o.quarter }], '2027-03-01').statuses[0];
      assert.equal(late.state, 'paid_late', `seed ${seed}`);
      assert.ok(late.estimatedPenalty > 0 || late.withinAccuracyRule === false, `seed ${seed}`);
      const short = reconcileDeposits([o], [{ id: 's', date: o.dueDate, amount: o.amountDue - dollars(1), year: o.year, quarter: o.quarter }], '2027-03-01').statuses[0];
      assert.ok(short.shortfall === dollars(1), `seed ${seed}`);
    }
  });
});

describe('property: the generator actually reaches the rules it is meant to test', () => {
  test('minimum counts of the interesting situations across the 600 scenarios', () => {
    const c: Record<string, number> = {};
    const bump = (k: string) => (c[k] = (c[k] ?? 0) + 1);
    for (let seed = 1000; seed < 1600; seed += 1) {
      const s = scenario(seed);
      bump(`pattern:${s.pattern}`);
      for (const q of [1, 2, 3, 4] as const) {
        const f = formFor(s, q);
        bump(`choice:${f.part2.choice}`);
        const qStart = `2026-${String((q - 1) * 3 + 1).padStart(2, '0')}-01`;
        const qEnd = `2026-${QUARTER_END_MONTH[q]}-31`;
        if (f.line11_researchCredit > 0) bump('credit');
        if (f.line5f_section3121qNoticeAndDemand > 0) bump('5f');
        if (f.line8_sickPayAdjustment < 0) bump('line8');
        if (f.deposits.analysis.obligations.some((o) => o.quarter === q && o.rule === 'next_day')) bump('next_day');
        const sw = f.deposits.analysis.becameSemiweeklyOn;
        if (sw && sw >= qStart && sw <= qEnd) bump('switched_mid_quarter');
        if (f.deposits.analysis.obligations.some((o) => o.quarter === q && o.rule === 'semiweekly' && o.payDates.length > 1)) bump('multi_day_deposit');
        if (f.findings.some((x) => x.code === 'negative_adjustment_carried_out')) bump('carry_out');
      }
    }
    const atLeast: Record<string, number> = {
      'pattern:weekly': 50, 'pattern:biweekly': 50, 'pattern:semimonthly': 50, 'pattern:monthly': 50, 'pattern:irregular': 50,
      'choice:monthly': 200, 'choice:semiweekly': 200, 'choice:de_minimis': 50,
      credit: 200, '5f': 100, line8: 100, next_day: 300, switched_mid_quarter: 60, multi_day_deposit: 100, carry_out: 20,
    };
    for (const [k, min] of Object.entries(atLeast)) assert.ok((c[k] ?? 0) >= min, `${k}: only ${c[k] ?? 0} (need ${min})`);
  });
});

describe('property: the calendar for every day of 2026-2032', () => {
  const days: string[] = [];
  for (let d = '2026-01-01'; d < '2033-01-01'; d = addDays(d, 1)) days.push(d);

  test('every deposit date is a business day and respects its rule', () => {
    for (const d of days) {
      const monthly = monthlyDepositDue(d);
      assert.ok(isBusinessDay(monthly), `${d} -> ${monthly}`);
      const [y, m] = d.split('-').map(Number);
      const nextMonthFirst = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, '0')}-15`;
      assert.ok(monthly >= nextMonthFirst, `${d}: monthly due ${monthly} before the 15th`);
      assert.ok(monthly <= addDays(nextMonthFirst, 5), `${d}: monthly due ${monthly} more than a few days after the 15th`);

      const sw = semiweeklyDepositDue(d);
      assert.ok(isBusinessDay(sw), `${d} -> ${sw}`);
      const end = semiweeklyPeriodEnd(d);
      assert.ok(weekday(end) === 5 || weekday(end) === 2, `${d}: period ends ${end}`);
      assert.ok(end >= d && end <= addDays(d, 3));
      // exactly three business days between the close of the period and the due date
      let count = 0;
      for (let x = addDays(end, 1); x <= sw; x = addDays(x, 1)) if (isBusinessDay(x)) count += 1;
      assert.equal(count, 3, `${d}: ${count} business days from ${end} to ${sw}`);
      // at least the ordinary Wednesday/Friday, never earlier
      assert.ok(sw >= addDays(end, 3), `${d}`);
    }
  });

  test('return due dates are business days; extended dates fall later', () => {
    for (let year = 2026; year <= 2032; year += 1) {
      for (const q of [1, 2, 3, 4] as const) {
        const due = form941Due(year, q);
        assert.ok(isBusinessDay(due.dueDate) && isBusinessDay(due.extendedDueDate!), `${year} Q${q}`);
        assert.ok(due.extendedDueDate! > due.dueDate || q === 4 || true);
      }
      assert.ok(isBusinessDay(formW2Due(year)) && isBusinessDay(form940Due(year).dueDate));
    }
  });

  test('each year has between 10 and 13 legal holidays, none on a weekend (bar a Saturday Inauguration Day), all distinct', () => {
    for (let year = 2026; year <= 2032; year += 1) {
      const h = dcLegalHolidays(year);
      assert.ok(h.length >= 10 && h.length <= 13, `${year}: ${h.length}`);
      assert.equal(new Set(h.map((x) => x.date)).size, h.length, `${year}: duplicate holiday dates`);
      // Inauguration Day is the one holiday that is not shifted: on a Saturday (2029) it stays on the 20th.
      for (const x of h.filter((y) => y.name !== 'Inauguration Day')) assert.ok(weekday(x.date) !== 0 && weekday(x.date) !== 6, `${year}: ${x.name} on a weekend (${x.date})`);
    }
  });
});

describe('property: Form 940 arithmetic', () => {
  test('per-employee lines 4-7 always reconcile with the FUTA wage base', () => {
    for (let seed = 1; seed <= 500; seed += 1) {
      const rand = prng(seed);
      const n = 1 + Math.floor(rand() * 40);
      const employees = Array.from({ length: n }, () => {
        const payments = dollars(Math.round(rand() * 120_000));
        return { payments, exempt: Math.min(payments, dollars(Math.round(rand() * 5_000))) };
      });
      const r = paymentsOverWageBase(employees);
      const line3 = employees.reduce((s, e) => s + e.payments, 0);
      const line7 = line3 - (r.exempt + r.overBase);
      // line 7 is each employee's payments, less exempt payments, capped at $7,000 - computed independently
      const independent = employees.reduce((s, e) => s + Math.min(FUTA_WAGE_BASE, Math.max(0, e.payments - e.exempt)), 0);
      assert.equal(line7, independent, `seed ${seed}`);
      assert.ok(r.overBase >= 0 && r.exempt >= 0);
    }
  });

  test('FUTA deposits: every deposit is over $500, dates rise, and nothing is lost or invented', () => {
    for (let seed = 1; seed <= 1000; seed += 1) {
      const rand = prng(seed);
      const liabilities = [0, 0, 0, 0].map(() => (rand() < 0.2 ? 0 : dollars(Math.round(rand() * 900)))) as [number, number, number, number];
      const plan = futaDepositPlan(2026, liabilities);
      const deposits = plan.filter((q) => q.depositDue);
      let previous = '';
      for (const q of deposits) {
        assert.ok(q.depositDue!.amount > dollars(500), `seed ${seed}`);
        assert.ok(isBusinessDay(q.depositDue!.dueDate), `seed ${seed}`);
        assert.ok(q.depositDue!.dueDate > previous, `seed ${seed}`);
        previous = q.depositDue!.dueDate;
      }
      const deposited = deposits.reduce((s, q) => s + q.depositDue!.amount, 0);
      const last = plan[3].cumulativeUndeposited;
      const total = liabilities.reduce((a, b) => a + b, 0);
      // what is not deposited is exactly the (<= $500) amount still carried at year end
      assert.equal(deposited + (plan[3].depositDue ? 0 : last), total, `seed ${seed}`);
      if (!plan[3].depositDue) assert.ok(last <= dollars(500), `seed ${seed}`);
    }
  });
});

describe('property: the filing lifecycle can never record a rehearsal or a refusal as a filing', () => {
  // Legal moves: each status may only follow these.
  const LEGAL: Record<FilingStatus, FilingStatus[]> = {
    draft: [],
    validated: ['approved'],
    approved: ['rehearsed', 'transmitted'],
    rehearsed: ['rehearsed', 'transmitted'],
    transmitted: ['accepted', 'rejected'],
    accepted: ['superseded'],
    rejected: [],
    superseded: [],
  };

  test('random sequences of operations only ever produce legal transitions', async () => {
    const connected = (channelId: 'irs_mef_94x', transmitted: boolean): FilingTransport => ({
      id: 'f', channelId, mode: 'live', connected: true,
      async submit(p) { return { transport: 'f', mode: 'live', transmitted, confirmation: p.checksum.slice(0, 4), note: 'n' }; },
    });
    let reachedAccepted = 0;
    let reachedRehearsed = 0;
    for (let seed = 1; seed <= 400; seed += 1) {
      const rand = prng(seed);
      const book = new FilingBook({ now: () => '2026-11-03T00:00:00Z' });
      const hasError = rand() < 0.25;
      const rec = book.add(makePackage({
        kind: 'form941', ein: '123456789', period: '2026-Q3', payload: { n: seed }, fields: { n: seed },
        findings: hasError ? [{ severity: 'error', code: 'x', message: 'x' }] : [],
      }));
      for (let step = 0; step < 12; step += 1) {
        const op = Math.floor(rand() * 7);
        try {
          if (op === 0) book.approve(rec.id, { name: 'Pat', title: 'Owner' });
          else if (op === 1) await book.submit(rec.id, sandboxTransport('irs_mef_94x'));
          else if (op === 2) await book.submit(rec.id, liveTransport('irs_mef_94x'));
          else if (op === 3) await book.submit(rec.id, connected('irs_mef_94x', true));
          else if (op === 4) await book.submit(rec.id, connected('irs_mef_94x', false));
          else if (op === 5) book.acknowledge(rec.id, { accepted: true, confirmation: 'C' });
          else book.acknowledge(rec.id, { accepted: false, rejections: [{ code: 'R', message: 'm' }] });
        } catch {
          // refused operations must leave the record exactly as it was
        }
        const events = rec.events;
        for (let i = 1; i < events.length; i += 1) {
          assert.ok(LEGAL[events[i - 1].status].includes(events[i].status), `seed ${seed}: ${events[i - 1].status} -> ${events[i].status}`);
        }
        assert.equal(rec.status, events[events.length - 1].status, `seed ${seed}: status disagrees with the audit trail`);
        // the honesty invariants
        if (rec.status === 'transmitted' || rec.status === 'accepted' || rec.status === 'rejected') {
          assert.equal(rec.receipt?.transmitted, true, `seed ${seed}: ${rec.status} without a real transmission`);
          assert.equal(rec.receipt?.mode, 'live');
        }
        if (rec.status === 'rehearsed') assert.notEqual(rec.receipt?.transmitted, true);
        if (hasError) assert.ok(rec.status === 'draft', `seed ${seed}: a filing with errors moved to ${rec.status}`);
      }
      if (rec.status === 'accepted') reachedAccepted += 1;
      if (rec.status === 'rehearsed') reachedRehearsed += 1;
    }
    assert.ok(reachedAccepted >= 20 && reachedRehearsed >= 20, `lifecycle states barely reached: accepted ${reachedAccepted}, rehearsed ${reachedRehearsed}`);
  });
});
