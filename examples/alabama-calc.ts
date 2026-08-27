import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import readline from 'node:readline';
import { stdin, stdout } from 'node:process';

import { calculateAlabamaPaycheck, AlabamaInputError, formatAlabamaPaystub } from '../src/alabama/index.ts';
import type { A4ExemptionCode, AlabamaPaycheckInput } from '../src/alabama/types.ts';
import type { EmploymentCategory, FilingStatus, PayFrequency } from '../src/types.ts';

/**
 * Run your own Alabama paycheck: type your numbers in, get a real paystub
 * back.
 *
 *   npm run alabama                         interactive prompts
 *   npm run alabama -- my-paycheck.json      calculate a saved input file
 *   npm run alabama -- --new my-paycheck.json  prompt, then save what you entered
 *
 * A JSON file follows the same shape as examples/alabama-input.example.json
 * — copy that file, edit the numbers, and pass its path in. Every field has
 * a plain-English meaning; see src/alabama/types.ts for the full reference
 * (what each one does, and what it defaults to when left out).
 */

function usage(): void {
  console.log(`
  Alabama paycheck calculator

  Usage:
    npm run alabama                          interactive — answer questions, see the result
    npm run alabama -- path/to/input.json    calculate from a saved JSON file
    npm run alabama -- --new path/to.json    interactive, then save your answers to that file
    npm run alabama -- --help                this message

  A template you can copy and edit by hand:
    examples/alabama-input.example.json
`);
}

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

const saveTo = args.includes('--new') ? args[args.indexOf('--new') + 1] : undefined;
const loadFrom = !saveTo ? args.find((a) => a.endsWith('.json')) : undefined;

async function main(): Promise<void> {
  let paycheckInput: AlabamaPaycheckInput;

  if (loadFrom) {
    if (!existsSync(loadFrom)) {
      console.error(`No such file: ${loadFrom}`);
      process.exit(1);
    }
    paycheckInput = JSON.parse(readFileSync(loadFrom, 'utf8'));
  } else {
    paycheckInput = await interview();
    if (saveTo) {
      writeFileSync(saveTo, JSON.stringify(paycheckInput, null, 2) + '\n');
      console.log(`\nSaved your answers to ${saveTo} — re-run "npm run alabama -- ${saveTo}" any time to recompute it.`);
    }
  }

  try {
    const output = calculateAlabamaPaycheck(paycheckInput);
    console.log(formatAlabamaPaystub(output));
  } catch (err) {
    if (err instanceof AlabamaInputError) {
      console.error(`\n${err.message}\n`);
      process.exit(1);
    }
    throw err;
  }
}

// --- interactive prompts ---------------------------------------------
//
// Deliberately NOT node:readline/promises' own rl.question(): under this
// environment (piped, non-TTY stdin — the shape any automated caller uses,
// and how this was tested), Node can deliver several buffered lines to
// readline in one synchronous 'line' burst. rl.question() only has a
// listener armed for the line it's currently waiting on; a question asked
// on the next microtask (as every `await ask(...)` here is) arms its
// listener too late to catch a line that arrived in that same burst, and
// the call hangs forever waiting for input that already went by. A
// self-owned queue fed by a single, permanently-attached 'line' listener
// has no such gap: a line that arrives before anyone asks for it just
// waits in the queue instead of vanishing.

const rl = readline.createInterface({ input: stdin, terminal: false });
const lineQueue: string[] = [];
const waiters: ((line: string) => void)[] = [];
rl.on('line', (line) => {
  const waiter = waiters.shift();
  if (waiter) waiter(line);
  else lineQueue.push(line);
});

function nextLine(): Promise<string> {
  const queued = lineQueue.shift();
  if (queued !== undefined) return Promise.resolve(queued);
  return new Promise((resolve) => waiters.push(resolve));
}

async function ask(question: string, fallback: string): Promise<string> {
  const suffix = fallback ? ` [${fallback}]` : '';
  stdout.write(`${question}${suffix}: `);
  const answer = (await nextLine()).trim();
  return answer || fallback;
}

async function askNumber(question: string, fallback: number): Promise<number> {
  while (true) {
    const raw = await ask(question, String(fallback));
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
    console.log(`  "${raw}" isn't a number — try again.`);
  }
}

async function askYesNo(question: string, fallback: boolean): Promise<boolean> {
  const raw = (await ask(`${question} (y/n)`, fallback ? 'y' : 'n')).toLowerCase();
  return raw.startsWith('y');
}

async function askChoice<T extends string>(
  question: string,
  choices: readonly T[],
  fallback: T,
): Promise<T> {
  while (true) {
    const raw = await ask(`${question} [${choices.join('/')}]`, fallback);
    if ((choices as readonly string[]).includes(raw)) return raw as T;
    console.log(`  Must be one of: ${choices.join(', ')}`);
  }
}

async function interview(): Promise<AlabamaPaycheckInput> {
  console.log('\nAlabama paycheck calculator — press Enter to accept the default in [brackets].\n');

  const checkDate = await ask('Check date (YYYY-MM-DD)', '2026-06-15');
  const payFrequency = await askChoice<PayFrequency>(
    'Pay frequency',
    ['weekly', 'biweekly', 'semimonthly', 'monthly', 'quarterly', 'semiannual', 'annual', 'daily'],
    'biweekly',
  );
  const employeeName = await ask('Employee name (optional)', '');

  console.log('\n-- Earnings for this cheque, in dollars --');
  const regular = await askNumber('Regular pay', 3000);
  const overtime = await askNumber('Overtime pay', 0);
  const bonus = await askNumber('Bonus', 0);
  const commission = await askNumber('Commission', 0);
  const severance = await askNumber('Severance / termination pay', 0);

  let severanceExemption: AlabamaPaycheckInput['severanceExemption'];
  if (severance > 0) {
    const approvalOnFile = await askYesNo(
      '  Has the Department of Revenue approved a severance exemption for this employer?',
      false,
    );
    severanceExemption = { approvalOnFile };
  }

  console.log('\n-- Pre-tax deductions this cheque, in dollars (leave 0 to skip) --');
  const deduction401k = await askNumber('401(k) deferral', 0);
  const section125 = await askNumber('Section 125 / medical premium', 0);

  const deductions: AlabamaPaycheckInput['deductions'] = [];
  if (deduction401k > 0) deductions.push({ code: '401K', category: 'deferral_401k', amount: deduction401k });
  if (section125 > 0) deductions.push({ code: 'MEDICAL', category: 'section125', amount: section125 });

  console.log('\n-- Form A-4 --');
  const exemptionCode = await askChoice<A4ExemptionCode>(
    "Exemption code (0=none, S=single, MS=married filing separately, M=married, H=head of family)",
    ['0', 'S', 'MS', 'M', 'H'],
    '0',
  );
  const dependents = await askNumber('Dependents (not counting spouse)', 0);

  console.log('\n-- Federal W-4 --');
  const filingStatus = await askChoice<FilingStatus>(
    'Filing status',
    ['single', 'married_joint', 'married_separate', 'head_of_household'],
    'single',
  );

  console.log('\n-- Work location and residency --');
  const workCity = await ask(
    'Work city (blank if none of Alabama\'s 25 occupational-tax cities apply)',
    '',
  );
  const residenceState = await ask('State the employee lives in (2-letter code)', 'AL');

  let daysWorkedInAlabamaThisYear: number | undefined;
  if (residenceState.toUpperCase() !== 'AL') {
    daysWorkedInAlabamaThisYear = await askNumber(
      'Days worked in Alabama so far this year (Act 2025-334 exempts 30 or fewer)',
      31,
    );
  }

  console.log('\n-- Employment category --');
  const employmentCategory = await askChoice<EmploymentCategory>(
    'Category',
    ['standard', 'clergy', 'statutory_employee', 'household', 'agricultural', 'railroad', 'election_worker'],
    'standard',
  );

  console.log('\n-- Year-to-date figures, in dollars (0 if this is an early cheque) --');
  const ytdSocialSecurity = await askNumber('YTD Social Security wages', 0);
  const ytdMedicare = await askNumber('YTD Medicare wages', 0);
  const ytdFuta = await askNumber('YTD FUTA wages', 0);
  const ytdAlabamaUnemployment = await askNumber('YTD Alabama unemployment wages', 0);

  console.log('\n-- Employer --');
  const employerName = await ask('Employer name (optional)', '');
  const hasOwnRate = await askYesNo("Does the employer have its own assigned Alabama SUI rate?", false);
  const unemploymentRate = hasOwnRate ? await askNumber('  Rate as a decimal (0.027 = 2.7%)', 0.027) : undefined;
  const electFivePercent =
    bonus > 0 || commission > 0
      ? await askYesNo('Elect Alabama\'s 5% flat withholding rate on this bonus/commission?', false)
      : false;

  rl.close();

  const input: AlabamaPaycheckInput = {
    checkDate,
    payFrequency,
    ...(employeeName ? { employeeName } : {}),
    earnings: { regular, overtime, bonus, commission, severance },
    ...(deductions.length > 0 ? { deductions } : {}),
    a4: { exemptionCode, dependents },
    federalW4: { filingStatus },
    residency: {
      residenceState: residenceState.toUpperCase(),
      ...(daysWorkedInAlabamaThisYear !== undefined ? { daysWorkedInAlabamaThisYear } : {}),
    },
    ...(workCity ? { workCity } : {}),
    ...(employmentCategory !== 'standard' ? { employmentCategory } : {}),
    ...(severanceExemption ? { severanceExemption } : {}),
    ytd: {
      socialSecurity: ytdSocialSecurity,
      medicare: ytdMedicare,
      futa: ytdFuta,
      alabamaUnemployment: ytdAlabamaUnemployment,
    },
    employer: {
      ...(employerName ? { name: employerName } : {}),
      ...(unemploymentRate !== undefined ? { unemploymentRate } : {}),
      ...(electFivePercent ? { useFivePercentSupplementalRate: true } : {}),
    },
  };

  return input;
}

main().catch((err) => {
  rl.close();
  console.error(err);
  process.exit(1);
});
