import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { minimumWage } from '../src/minimum-wage.ts';

/**
 * Invariants that hold across the whole data set, so a figure that is updated in one field but not
 * in its twin (a rate and its cents, a rate and its tipped cash wage, the research block and the
 * normalized block) fails here instead of reaching a paycheck.
 */

const root = new URL('../data/', import.meta.url);
const jsonFiles = (dir: string): string[] =>
  readdirSync(new URL(dir, root), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? jsonFiles(`${dir}${e.name}/`) : e.name.endsWith('.json') ? [`${dir}${e.name}`] : [],
  );
const read = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function walk(o: unknown, path: string, visit: (o: Record<string, unknown>, path: string) => void): void {
  if (Array.isArray(o)) o.forEach((v, i) => walk(v, `${path}[${i}]`, visit));
  else if (o && typeof o === 'object') {
    visit(o as Record<string, unknown>, path);
    for (const [k, v] of Object.entries(o)) walk(v, `${path}/${k}`, visit);
  }
}

describe('dollar fields agree with their cents twins in every data file', () => {
  for (const f of jsonFiles('')) {
    test(f, () => {
      const bad: string[] = [];
      walk(read(f), '', (o, path) => {
        for (const [k, v] of Object.entries(o)) {
          if (!k.endsWith('Cents') || !num(v)) continue;
          const base = o[k.slice(0, -5)];
          // South Dakota's $5.925 tipped wage is the one documented half-cent figure.
          if (num(base) && Math.abs(Math.round(base * 100) - v) > 1e-6 && Math.abs(base * 100 - v) > 1e-6) bad.push(`${path}: ${k.slice(0, -5)}=${base} ${k}=${v}`);
        }
      });
      assert.deepEqual(bad, []);
    });
  }
});

describe('minimum-wage tip fields are consistent', () => {
  const files = jsonFiles('minimum-wage/').filter((f) => /\/(states|local)\//.test(f));
  for (const f of files) {
    test(f, () => {
      const d = read(f);
      const items: Array<[string, { hourly?: number } | undefined, any]> = f.includes('/states/')
        ? [['state', d.standard, d.tipped]]
        : (d.jurisdictions ?? []).map((j: any) => [j.id, j, j.tipped]);
      for (const [id, rate, t] of items) {
        if (!t || !num(rate?.hourly)) continue;
        if (t.tipCreditAllowed === false) {
          assert.ok(Math.abs(t.cashWage - rate.hourly) < 0.0051, `${f} ${id}: no tip credit but cash wage ${t.cashWage} != rate ${rate.hourly}`);
        } else if (num(t.cashWage) && num(t.maxTipCredit)) {
          assert.ok(Math.abs(t.cashWage + t.maxTipCredit - rate.hourly) < 0.0051, `${f} ${id}: cash wage ${t.cashWage} + credit ${t.maxTipCredit} != rate ${rate.hourly}`);
        }
      }
    });
  }

  test('a tipped answer never exceeds the standard answer, in any 2026 or 2027 local jurisdiction, for any employer size', () => {
    const bad: string[] = [];
    for (const f of jsonFiles('minimum-wage/local/')) {
      const st = f.split('/').pop()!.slice(0, 2);
      const year = f.includes('2027') ? '2027' : '2026';
      for (const j of read(f).jurisdictions) {
        for (const date of [`${year}-01-01`, `${year}-07-01`, `${year}-12-31`]) {
          for (const employeeCount of [undefined, 3, 12, 30, 150, 600]) {
            const a = minimumWage({ checkDate: date, state: st, locality: j.id, employeeCount });
            const b = minimumWage({ checkDate: date, state: st, locality: j.id, employeeCount, tipped: true });
            if (b.cents > a.cents) bad.push(`${st} ${j.id} ${date} n=${employeeCount}: tipped ${b.cents} > standard ${a.cents}`);
          }
        }
      }
    }
    assert.deepEqual(bad, []);
  });
});

describe('state files: the research block and the normalized unemployment block agree', () => {
  for (const f of jsonFiles('states/').filter((n) => /-20\d\d\.json$/.test(n))) {
    test(f, () => {
      const d = read(f);
      const ui = d.unemploymentInsurance ?? {};
      const sui = d.suiEmployer ?? {};
      for (const k of ['wageBase', 'newEmployerRate']) {
        if (num(ui[k]) && num(sui[k])) assert.equal(ui[k], sui[k], `${f}: unemploymentInsurance.${k} != suiEmployer.${k}`);
      }
      const year = Number(f.match(/-(\d{4})\.json$/)![1]);
      assert.equal(d.year, year, `${f}: year field`);
    });
  }
});

describe('new-employer rates against the Department of Labor January 2026 table', () => {
  // DOL, Significant Provisions of State UI Laws, January 2026: the new-employer BASE rate.
  const dol: Record<string, number> = { CO: 0.0153, ME: 0.0223, WI: 0.025, ND: 0.01, PA: 0.03822, TN: 0.027, VT: 0.01, KS: 0.0175, MI: 0.027, MA: 0.0242, NV: 0.0295, NJ: 0.028 };
  for (const [st, base] of Object.entries(dol)) {
    test(`${st}: the rate carried is at least DOL's base ${base}`, () => {
      const rate = read(`states/${st}-2026.json`).suiEmployer.newEmployerRate as number;
      assert.ok(rate >= base - 1e-9, `${st} carries ${rate}, below DOL's base rate ${base}`);
    });
  }
  test("Colorado and Wisconsin are confirmed from the states' own pages (read 2026-11-07)", () => {
    // CDLE Introductory Rates: non-construction 2026 0.0153 + 0.0017 + 0.0135 = 0.0305; 2027 0.0153 + 0.0017 + 0 = 0.0170.
    assert.equal(read('states/CO-2026.json').suiEmployer.newEmployerRate, 0.0305);
    assert.equal(read('states/CO-2027.json').suiEmployer.newEmployerRate, 0.017);
    assert.equal(read('states/CO-2026.json').suiEmployer.wageBase, 30600);
    assert.equal(read('states/CO-2027.json').suiEmployer.wageBase, 32100);
    // DWD: new employer, payroll under $500,000, all others: 3.05% in 2026 and 2027; wage base $14,000.
    for (const y of [2026, 2027]) {
      assert.equal(read(`states/WI-${y}.json`).suiEmployer.newEmployerRate, 0.0305);
      assert.equal(read(`states/WI-${y}.json`).suiEmployer.wageBase, 14000);
    }
    assert.equal(read('states/CO-2026.json').suiEmployer.confidence, 'primary_source_confirmed');
    assert.equal(read('states/WI-2026.json').suiEmployer.confidence, 'primary_source_confirmed');
  });
  test('Maine carries a secondary all-in figure above the DOL base and says it is unconfirmed', () => {
    const s = read('states/ME-2026.json').suiEmployer;
    assert.ok(s.newEmployerRate > dol.ME);
    assert.match(s.newEmployerRateSource, /January2026\.pdf/);
    assert.match(s.newEmployerRateSource, /Treat as an estimate/);
    assert.match(s.newEmployerRateSource, /stays unconfirmed/);
  });
});

describe('Ohio school district identifiers (Finder feed, 2026-11-07)', () => {
  test('James A. Garfield LSD (district 6704) carries its own IRN 49205, not Rootstown LSD\'s 49213, in every year', () => {
    for (const y of [2025, 2026, 2027]) {
      const d = read(`local/OH-school-districts-${y}.json`).districts.find((x: { sdNumber: string }) => x.sdNumber === '6704');
      assert.equal(d.irn, '49205', String(y));
    }
  });
  test('no two Ohio school districts share an IRN', () => {
    const irns = read('local/OH-school-districts-2026.json').districts.map((x: { irn: string }) => x.irn);
    assert.equal(new Set(irns).size, irns.length);
  });
});

describe('Michigan city income tax rates (each city\'s own page, read 2026-11-07)', () => {
  const expected: Record<string, [number, number]> = {
    Detroit: [0.024, 0.012], 'Grand Rapids': [0.015, 0.0075], Saginaw: [0.015, 0.0075], 'Highland Park': [0.02, 0.01],
  };
  const standard = ['Albion', 'Battle Creek', 'Benton Harbor', 'Big Rapids', 'East Lansing', 'Flint', 'Grayling', 'Hamtramck', 'Hudson', 'Ionia', 'Jackson',
    'Lansing', 'Lapeer', 'Muskegon', 'Muskegon Heights', 'Pontiac', 'Port Huron', 'Portland', 'Springfield', 'Walker'];
  for (const c of standard) expected[c] = [0.01, 0.005];
  test('all 24 cities carry the rates their own pages state, nonresident exactly half of resident', () => {
    const cities = read('local/MI-cities-2026.json').cities as Array<{ name: string; residentRate: number; nonresidentRate: number }>;
    assert.equal(cities.length, 24);
    for (const c of cities) {
      const e = expected[c.name];
      assert.ok(e, `unexpected city ${c.name}`);
      assert.deepEqual([c.residentRate, c.nonresidentRate], e, c.name);
      assert.equal(c.nonresidentRate * 2, c.residentRate, c.name);
    }
  });
});

describe('City payroll and head taxes read from the cities\' own pages (2026-11-07)', () => {
  test('Colorado head taxes: Denver $5.75 employee / $4.00 employer at $500 a month; Glendale $5 / $5 above $750; Greenwood Village $2 / $2 at $250; Sheridan $3 / $3; Aurora repealed 2025-01-01', () => {
    const l = read('states/CO-2026.json').localIncomeTax;
    assert.equal(l.denver.employeeRate, 5.75);
    assert.equal(l.denver.employerRatePerEmployee, 4);
    assert.equal(l.denver.monthlyEarningsThreshold, 500);
    assert.deepEqual([l.occupationalPrivilegeTax.Glendale.employeeRate, l.occupationalPrivilegeTax.Glendale.employerRatePerEmployee, l.occupationalPrivilegeTax.Glendale.monthlyEarningsThreshold], [5, 5, 750]);
    assert.deepEqual([l.occupationalPrivilegeTax['Greenwood Village'].employeeRate, l.occupationalPrivilegeTax['Greenwood Village'].monthlyEarningsThreshold], [2, 250]);
    assert.equal(l.occupationalPrivilegeTax.Sheridan.employeeRate, 3);
    assert.equal(l.aurora.repealed, true);
  });
  test('Missouri: Kansas City earnings tax 1%; St. Louis earnings tax 1% and employer payroll expense tax 0.5%', () => {
    const l = read('states/MO-2026.json').localIncomeTax;
    assert.equal(l.kansasCity.rate, 0.01);
    assert.equal(l.stLouis.earningsTaxRate, 0.01);
    assert.equal(l.stLouis.payrollExpenseTax.rate, 0.005);
  });
  test('Pittsburgh payroll expense tax 0.55%; Newark payroll tax 1%; Charleston WV $3 a week', () => {
    assert.equal(read('states/PA-2026.json').localTax.pittsburghPayrollExpenseTax.rate, 0.0055);
    assert.equal(read('states/NJ-2026.json').newarkPayrollTax.rate, 0.01);
    assert.equal(read('states/WV-2026.json').localIncomeTax.serviceFeeCities.Charleston.weeklyRate, 3);
  });
  test('Seattle 2026 payroll expense tax thresholds and tier rates match the city\'s form; social housing tax 5% over $1,000,000', () => {
    const w = read('states/WA-2026.json').localIncomeTax;
    const p = w.seattlePayrollExpenseTax;
    assert.equal(p.employerPayrollThreshold, 9074409);
    assert.equal(p.compensationThreshold, 194452);
    assert.equal(p.upperCompensationBand, 518538);
    assert.deepEqual(p.tiers.map((t: { lowerBandRate: number; upperBandRate: number }) => [t.lowerBandRate, t.upperBandRate]), [[0.00746, 0.01811], [0.00746, 0.02024], [0.01492, 0.02557]]);
    assert.equal(w.seattleSocialHousingTax.rate, 0.05);
    assert.equal(w.seattleSocialHousingTax.compensationThreshold, 1000000);
  });
});

describe('Kentucky, Michigan and Vermont income tax withholding (agency documents, read 2026-11-07)', () => {
  test('Kentucky: 3.5% flat rate and $3,360 standard deduction (Department of Revenue 2026 withholding formula)', () => {
    const k = read('states/KY-2026.json').flatRate;
    assert.equal(k.rate, 0.035);
    assert.equal(k.deductionAmount, 3360);
  });
  test('Michigan: 4.25% rate and $5,900 personal exemption (Treasury withholding information for 2026)', () => {
    const m = read('states/MI-2026.json').flatRate;
    assert.equal(m.rate, 0.0425);
    assert.equal(m.allowanceAmount, 5900);
  });
  test('Vermont: single-filer bracket rates 3.35%, 6.6%, 7.6% and 8.75% (GB-1210-2026)', () => {
    const rates = read('states/VT-2026.json').bracketPerPeriodAllowance.brackets.single.weekly.map((b: { rate: number }) => b.rate);
    assert.deepEqual(rates.slice(1, 5), [0.0335, 0.066, 0.076, 0.0875]);
  });
});

describe('Massachusetts withholding against Circular M\'s own wage-bracket tables (effective 2026-01-01, read 2026-11-07)', () => {
  const sit = async (freq: string, wages: number, k: number) => {
    const { calculatePaycheck } = await import('../src/calculate.ts');
    const cert = k === 0 ? {} : { personalExemptionCode: 1, spouseExemptionCode: 0, dependents: k - 1 };
    const r = calculatePaycheck({
      checkDate: '2026-06-15', payFrequency: freq as never, earnings: [{ code: 'REG', category: 'regular', amount: Math.round(wages * 100) }], deductions: [],
      federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
      ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: 'MA', certificate: cert },
    } as never);
    return r.taxes.find((t: { id: string }) => t.id === 'MA_SIT')!.amount / 100;
  };
  test('weekly table rows, wages $205 and $305 (0, 1 and 2 exemptions)', async () => {
    assert.deepEqual([await sit('weekly', 205, 0), await sit('weekly', 205, 1), await sit('weekly', 205, 2)], [9.47, 5.24, 4.27]);
    assert.deepEqual([await sit('weekly', 305, 0), await sit('weekly', 305, 1), await sit('weekly', 305, 2)], [14.08, 9.85, 8.89]);
  });
  test('daily table rows use 365 days: wages $31 and $23 (the engine had used 260 and returned $0.59 and $0)', async () => {
    assert.deepEqual([await sit('daily', 31, 0), await sit('daily', 31, 1), await sit('daily', 31, 2)], [1.43, 0.83, 0.69]);
    assert.equal(await sit('daily', 23, 1), 0.46);
  });
  test('no withholding below the $22 daily and $154 weekly floors when an exemption is claimed', async () => {
    assert.equal(await sit('daily', 21, 1), 0);
    assert.equal(await sit('weekly', 150, 1), 0);
    assert.equal(await sit('weekly', 155, 1), 2.93);
  });
});

describe('Daily pay is annualized at 365 days in Hawaii, Georgia, Minnesota and Wisconsin, as their own published daily tables require (read 2026-11-07)', () => {
  const sit = async (st: string, freq: string, wages: number, cert: Record<string, unknown>) => {
    const { calculatePaycheck } = await import('../src/calculate.ts');
    const r = calculatePaycheck({
      checkDate: '2026-11-07', payFrequency: freq as never, earnings: [{ code: 'REG', category: 'regular', amount: Math.round(wages * 100) }], deductions: [],
      federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
      ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: st, certificate: cert },
    } as never);
    return r.taxes.find((t: { id: string }) => t.id === `${st}_SIT`)!.amount / 100;
  };
  test('Hawaii Booklet A daily table, single: $60-70 row 2/1, $90-100 row 4/3/3 (whole dollars); the engine had returned $0.88 for the first', async () => {
    assert.equal(Math.round(await sit('HI', 'daily', 65, { hawaiiMaritalStatus: 'single', allowances: 0 })), 2);
    assert.equal(Math.round(await sit('HI', 'daily', 95, { hawaiiMaritalStatus: 'single', allowances: 0 })), 4);
    assert.equal(Math.round(await sit('HI', 'daily', 95, { hawaiiMaritalStatus: 'single', allowances: 2 })), 3);
  });
  test('Georgia G-4 Table A daily: $44 -> 0.14, $61 -> 0.99 with 0 dependents and 0.31 with 1', async () => {
    assert.equal(await sit('GA', 'daily', 44, { georgiaMaritalStatus: 'A', dependents: 0 }), 0.14);
    assert.equal(await sit('GA', 'daily', 61, { georgiaMaritalStatus: 'A', dependents: 0 }), 0.99);
    assert.equal(await sit('GA', 'daily', 61, { georgiaMaritalStatus: 'A', dependents: 1 }), 0.31);
  });
  test('Wisconsin W-166 daily table, single: $59-64 row 1.70 and $94-99 row 3.60 / 3.50 (0 and 2 exemptions)', async () => {
    assert.ok(Math.abs((await sit('WI', 'daily', 61.5, { maritalStatus: 'single', exemptions: 0 })) - 1.7) <= 0.011 + 0.0);
    assert.ok(Math.abs((await sit('WI', 'daily', 96.5, { maritalStatus: 'single', exemptions: 0 })) - 3.6) <= 0.011);
    assert.ok(Math.abs((await sit('WI', 'daily', 96.5, { maritalStatus: 'single', exemptions: 2 })) - 3.5) <= 0.011);
  });
  test('Minnesota wh-inst daily table, single: $72-76 row (2 allowances) 2, $88-92 row 3 / 2 (2 and 3 allowances), $92-96 row (1 allowance) 4', async () => {
    assert.equal(Math.round(await sit('MN', 'daily', 74, { maritalStatus: 'single', allowances: 2 })), 2);
    assert.equal(Math.round(await sit('MN', 'daily', 90, { maritalStatus: 'single', allowances: 2 })), 3);
    assert.equal(Math.round(await sit('MN', 'daily', 90, { maritalStatus: 'single', allowances: 3 })), 2);
    assert.equal(Math.round(await sit('MN', 'daily', 94, { maritalStatus: 'single', allowances: 1 })), 4);
  });
});

describe('Cross-frequency and sanity sweep over every state (2026)', () => {
  const PERIODS: Record<string, number> = { weekly: 52, biweekly: 26, semimonthly: 24, monthly: 12 };
  const codes = readdirSync(new URL('states/', root)).filter((f) => f.endsWith('-2026.json')).map((f) => f.slice(0, 2));
  test('annualized state income tax is the same whichever of weekly/biweekly/semimonthly/monthly the pay is made in (Massachusetts excepted: Circular M deducts actual FICA against a year-to-date cap)', async () => {
    const { calculatePaycheck } = await import('../src/calculate.ts');
    const offenders: string[] = [];
    for (const st of codes.filter((c) => c !== 'MA')) {
      for (const annual of [18000, 36000, 60000, 100000, 200000]) {
        const vals: number[] = [];
        for (const [f, p] of Object.entries(PERIODS)) {
          const r = calculatePaycheck({
            checkDate: '2026-11-07', payFrequency: f as never, earnings: [{ code: 'REG', category: 'regular', amount: Math.round((annual / p) * 100) }], deductions: [],
            federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
            ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: st, certificate: {} },
          } as never);
          const t = r.taxes.filter((x: { id: string; payer: string }) => x.payer === 'employee' && x.id.startsWith(st) && /_SIT$/.test(x.id)).reduce((a: number, x: { amount: number }) => a + x.amount, 0);
          assert.ok(Number.isInteger(t) && t >= 0, `${st} ${f} ${annual}: ${t}`);
          vals.push((t / 100) * p);
        }
        if (Math.max(...vals) - Math.min(...vals) > Math.max(60, 0.04 * Math.max(...vals))) offenders.push(`${st} ${annual}: ${vals.map(Math.round).join('/')}`);
      }
    }
    assert.deepEqual(offenders, []);
  });
});

describe('A paid-leave line that depends on an employer fact is never left out silently', () => {
  const run = async (st: string, certificate: Record<string, unknown>, employer?: Record<string, unknown>) => {
    const { calculatePaycheck } = await import('../src/calculate.ts');
    return calculatePaycheck({
      checkDate: '2026-11-08', payFrequency: 'biweekly', earnings: [{ code: 'REG', category: 'regular', amount: 300000 }], deductions: [],
      federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
      ytd: { socialSecurity: 0, medicare: 0, futa: 0 }, workState: { code: st, certificate }, ...(employer ? { employer } : {}),
    } as never);
  };
  test('Colorado, Maine and Washington say the employer share needs the headcount fact, and stop saying so once it is given', async () => {
    for (const st of ['CO', 'ME', 'WA']) {
      assert.match((await run(st, {})).warnings?.join(' ') ?? '', new RegExp(`${st} paid leave: the employer's share was not computed`));
      assert.equal(((await run(st, { employerLiableForPaidLeaveShare: true })).warnings ?? []).some((w) => /paid leave/.test(w)), false);
    }
  });
  test('Delaware says its paid leave needs the employer tier, then the employee-share election', async () => {
    assert.match((await run('DE', {})).warnings?.join(' ') ?? '', /DE paid leave was not computed/);
    const withTier = await run('DE', {}, { paidLeaveTier: { DE: 'full' } });
    assert.match(withTier.warnings?.join(' ') ?? '', /no employee share was withheld/);
    const full = await run('DE', {}, { paidLeaveTier: { DE: 'full' }, paidLeaveEmployeeShareFraction: { DE: 0.5 } });
    assert.equal((full.warnings ?? []).some((w) => /paid leave/.test(w)), false);
  });
  test('states with a fixed employee rate and no size gate (New Jersey, Minnesota) add no such warning', async () => {
    for (const st of ['NJ', 'MN']) assert.equal(((await run(st, {})).warnings ?? []).some((w) => /paid leave/.test(w)), false);
  });
});
