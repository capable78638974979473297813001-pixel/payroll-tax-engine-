import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import { resolveAddress, resolveEmployee } from '../geocode/index.ts';

/**
 * The scenario: an employer has three new hires' street addresses and
 * nothing else. Symmetry's own core product is turning that address into
 * the jurisdiction fields this engine's calculatePaycheck() already knows
 * how to read — this demo runs that resolution live against the real
 * Census Bureau geocoder, then feeds the result straight into a real
 * paycheck calculation. Requires network access (unlike `npm test`, which
 * never touches it — see resolve.ts's own doc comment for why that split
 * exists).
 */

const CHECK_DATE = '2026-08-15';
const rule = (s: string) => console.log(`\n\x1b[2m${'─'.repeat(70)}\x1b[0m\n  ${s}\n`);

async function demo(label: string, address: string, workState: string) {
  rule(label);
  console.log(`  Address: ${address}`);

  const result = await resolveAddress(address, 'work', CHECK_DATE);
  if (!result.matched) {
    console.log(`  \x1b[31mCensus could not match this address — no paycheck computed.\x1b[0m`);
    return;
  }

  console.log(`  Resolved certificate fields: ${JSON.stringify(result.certificateFields)}`);
  if (!result.fullyResolved) {
    console.log(
      `  \x1b[33m⚠ ambiguous match on at least one field — a human should confirm before this address goes live.\x1b[0m`,
    );
  }

  const paycheck = calculatePaycheck({
    checkDate: CHECK_DATE,
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
    deductions: [],
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: workState, certificate: result.certificateFields },
  });

  console.log(`\n  Paycheck taxes for a $3,000 biweekly employee at this address:`);
  for (const line of paycheck.taxes) {
    console.log(`    ${line.id.padEnd(14)} ${line.detail}`);
  }
}

await demo('Bluffton, Ohio — a village that taxes AND a school district that taxes', '136 N Main St, Bluffton, OH 45817', 'OH');
await demo('Columbus, Ohio — a city that taxes, a school district that does NOT', '90 W Broad St, Columbus, OH 43215', 'OH');
await demo('Detroit, Michigan', '2 Woodward Ave, Detroit, MI 48226', 'MI');
await demo('Indianapolis, Indiana — county tax, not city', '200 E Washington St, Indianapolis, IN 46204', 'IN');
await demo('Abington, Pennsylvania — PSD code resolved from county + township', '1176 Old York Rd, Abington, PA 19001', 'PA');
await demo('Baltimore, Maryland — independent city, not a county', '100 N Holliday St, Baltimore, MD 21202', 'MD');
await demo('Rockville, Maryland — an ordinary city resolves via its county', '100 N Washington St, Rockville, MD 20850', 'MD');

/**
 * The cross-address cases: NYC/Yonkers/Missouri's/Multnomah's taxes are
 * keyed off a COMPARISON between work and residence, not either address
 * alone — resolveEmployee() (not resolveAddress()) is what handles that.
 */
async function demoEmployee(
  label: string,
  workState: string,
  addresses: { work?: string; residence?: string },
) {
  rule(label);
  if (addresses.work) console.log(`  Work address:      ${addresses.work}`);
  if (addresses.residence) console.log(`  Residence address: ${addresses.residence}`);

  const result = await resolveEmployee(addresses, CHECK_DATE);
  console.log(`  Merged certificate fields: ${JSON.stringify(result.certificateFields)}`);
  if (result.notResolvable.length) {
    console.log(`  \x1b[33m⚠ not resolvable from Census data: ${result.notResolvable.join(' / ')}\x1b[0m`);
  }

  const paycheck = calculatePaycheck({
    checkDate: CHECK_DATE,
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
    deductions: [],
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: workState, certificate: result.certificateFields },
  });

  console.log(`\n  Paycheck taxes for a $3,000 biweekly employee:`);
  for (const line of paycheck.taxes) {
    console.log(`    ${line.id.padEnd(16)} ${line.detail}`);
  }
}

await demoEmployee('An employee who lives AND works in Yonkers — the RESIDENT surcharge fires', 'NY', {
  work: '40 Main St, Yonkers, NY 10701',
  residence: '40 Main St, Yonkers, NY 10701',
});
await demoEmployee('An employee who lives in Manhattan but WORKS in Yonkers — the NONRESIDENT-WORKER tax fires instead', 'NY', {
  work: '40 Main St, Yonkers, NY 10701',
  residence: '1600 Broadway, New York, NY 10019',
});
await demoEmployee('A Manhattan resident — NYC resident tax fires from the RESIDENCE address alone', 'NY', {
  residence: '1600 Broadway, New York, NY 10019',
});
await demoEmployee('An employee who lives in the St. Louis suburbs but works in Kansas City — Missouri\'s "either address" rule', 'MO', {
  work: '414 E 12th St, Kansas City, MO 64106',
  residence: '6801 Delmar Blvd, University City, MO 63130',
});
await demoEmployee('An employee working in Newark, NJ — the employer-paid payroll tax', 'NJ', {
  work: '920 Broad St, Newark, NJ 07102',
});
await demoEmployee('An employee working in downtown Portland (Multnomah County), Oregon', 'OR', {
  work: '200 SE Salmon St, Portland, OR 97214',
});

console.log(
  `\n  \x1b[2mThis resolution ran once, live, for this demo. In real use it runs\n` +
    `  once per employee address (onboarding / address change), never per\n` +
    `  paycheck — calculatePaycheck() itself still never touches the network.\x1b[0m\n`,
);
