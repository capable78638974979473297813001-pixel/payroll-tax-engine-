import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import { resolveAddress } from '../geocode/index.ts';

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

console.log(
  `\n  \x1b[2mThis resolution ran once, live, for this demo. In real use it runs\n` +
    `  once per employee address (onboarding / address change), never per\n` +
    `  paycheck — calculatePaycheck() itself still never touches the network.\x1b[0m\n`,
);
