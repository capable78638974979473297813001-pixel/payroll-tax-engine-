import { calculatePaycheck } from '../src/calculate.ts';
import { calculateGarnishments } from '../src/garnishment.ts';
import { dollars, fmt } from '../src/money.ts';

const checkDate = '2026-06-15';
const payFrequency = 'weekly' as const;
const workState = 'IL';

const paycheck = calculatePaycheck({
  checkDate,
  payFrequency,
  earnings: [{ code: 'REG', category: 'regular', amount: dollars(900) }],
  deductions: [{ code: '401K', category: 'deferral_401k', amount: dollars(50) }],
  federalW4: {
    filingStatus: 'single',
    multipleJobs: false,
    dependentCredit: 0,
    otherIncome: 0,
    deductions: 0,
    extraWithholding: 0,
  },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: workState },
});

const garnishment = calculateGarnishments({
  checkDate,
  payFrequency,
  workState,
  paycheck,
  orders: [
    {
      id: 'CHILD-SUPPORT-1',
      type: 'child_support',
      amountOrdered: dollars(150),
      supportingOtherFamily: false,
    },
    {
      id: 'CREDIT-CARD-JUDGMENT',
      type: 'consumer_creditor',
      amountOrdered: dollars(500),
      priority: 1,
    },
  ],
});

const pad = (s: string, n: number) => s.padEnd(n);
const rpad = (s: string, n: number) => s.padStart(n);

console.log(`\n  PAYCHEQUE  ${checkDate}   ${payFrequency}   work state ${workState}\n`);
console.log(`  ${pad('Gross (cash)', 30)}${rpad(fmt(paycheck.grossPay), 12)}`);
console.log(`  ${pad('Pre-tax deductions', 30)}${rpad('-' + fmt(paycheck.pretaxDeductions), 12)}`);
console.log(`  ${pad('Employee taxes withheld', 30)}${rpad('-' + fmt(paycheck.employeeTaxTotal), 12)}`);
console.log(`  ${pad('Net pay before garnishment', 30)}${rpad(fmt(paycheck.netPay), 12)}`);

console.log(`\n  Disposable earnings (CCPA): ${fmt(garnishment.disposableEarnings)}`);
console.log(`  Aggregate ceiling this cheque: ${fmt(garnishment.aggregateCeiling)}\n`);

console.log(`  ${pad('GARNISHMENT ORDER', 30)}${rpad('withheld', 12)}`);
for (const line of garnishment.lines) {
  console.log(`  ${pad(line.orderId, 30)}${rpad(fmt(line.withheld), 12)}`);
  console.log(`    ${line.detail}`);
}
console.log(`  ${pad('', 30)}${rpad('-'.repeat(10), 12)}`);
console.log(`  ${pad('Total garnished', 30)}${rpad(fmt(garnishment.totalWithheld), 12)}`);

console.log(`\n  ${pad('NET PAY after garnishment', 30)}${rpad(fmt(paycheck.netPay - garnishment.totalWithheld), 12)}\n`);

console.log(
  `  Note: the child support order draws first, up to its own 60% CCPA\n` +
    `  ceiling; the credit-card judgment only gets whatever room is left\n` +
    `  under that SAME ceiling — never a separate 25% stacked on top.\n`,
);
