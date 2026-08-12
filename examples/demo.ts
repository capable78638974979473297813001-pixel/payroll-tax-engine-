import { calculatePaycheck } from '../src/calculate.ts';
import { dollars, fmt } from '../src/money.ts';

const result = calculatePaycheck({
  checkDate: '2026-06-15',
  payFrequency: 'biweekly',
  earnings: [
    { code: 'REG', category: 'regular', amount: dollars(3000) },
    { code: 'GTL', category: 'imputed', amount: dollars(25) },
  ],
  deductions: [
    { code: 'MEDICAL', category: 'section125', amount: dollars(120) },
    { code: '401K', category: 'deferral_401k', amount: dollars(240) },
    { code: 'UNION', category: null, amount: dollars(15) },
  ],
  federalW4: {
    filingStatus: 'married_joint',
    multipleJobs: false,
    dependentCredit: dollars(2200),
    otherIncome: 0,
    deductions: 0,
    extraWithholding: 0,
  },
  ytd: { socialSecurity: dollars(39_000), medicare: dollars(39_000), futa: dollars(7000) },
  workState: { code: 'PA' },
});

const pad = (s: string, n: number) => s.padEnd(n);
const rpad = (s: string, n: number) => s.padStart(n);

console.log(`\n  PAYCHEQUE  ${result.checkDate}   biweekly\n`);
console.log(`  ${pad('Gross (cash)', 34)}${rpad(fmt(result.grossPay), 12)}`);
console.log(`  ${pad('Pre-tax deductions', 34)}${rpad('-' + fmt(result.pretaxDeductions), 12)}`);
console.log(`  ${pad('Post-tax deductions', 34)}${rpad('-' + fmt(result.posttaxDeductions), 12)}`);

console.log(`\n  ${pad('EMPLOYEE TAXES', 34)}${rpad('base', 12)}${rpad('amount', 12)}`);
for (const t of result.taxes.filter((x) => x.payer === 'employee')) {
  console.log(`  ${pad(t.name, 34)}${rpad(fmt(t.taxableWages), 12)}${rpad(fmt(t.amount), 12)}`);
}
console.log(`  ${pad('', 34)}${rpad('', 12)}${rpad('-'.repeat(10), 12)}`);
console.log(`  ${pad('Total withheld', 34)}${rpad('', 12)}${rpad(fmt(result.employeeTaxTotal), 12)}`);

console.log(`\n  ${pad('NET PAY', 34)}${rpad('', 12)}${rpad(fmt(result.netPay), 12)}`);

console.log(`\n  ${pad('EMPLOYER COST (not withheld)', 34)}${rpad('base', 12)}${rpad('amount', 12)}`);
for (const t of result.taxes.filter((x) => x.payer === 'employer')) {
  console.log(`  ${pad(t.name, 34)}${rpad(fmt(t.taxableWages), 12)}${rpad(fmt(t.amount), 12)}`);
}
console.log(`  ${pad('Total employer tax', 34)}${rpad('', 12)}${rpad(fmt(result.employerTaxTotal), 12)}`);

console.log(`\n  Note the three different taxable bases above: the 401(k)`);
console.log(`  deferral cuts the federal base but not FICA, and not PA.\n`);
