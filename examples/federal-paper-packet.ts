/**
 * Build a filing-ready paper packet for a quarter's Form 941: the IRS's own fillable
 * Form 941 (and Schedule B / Form 941-V when needed), filled with the computed figures.
 *
 *   pip install -r payroll/federal/paper/requirements.txt
 *   node examples/federal-paper-packet.ts ./out
 *
 * It signs nothing and mails nothing. Read docs/FEDERAL-FILING-RUNBOOK.md.
 * The pay runs below are sample data: replace them with the company's approved runs.
 */
import { dollars } from '../src/money.ts';
import { federal } from '../payroll/index.ts';
import type { PayRun } from '../payroll/types.ts';

const outDir = process.argv[2] ?? './federal-packet';

function sampleRun(date: string, wages: number, fit: number): PayRun {
  const w = dollars(wages);
  const rate = (n: number, d: number) => federal.timesRate(w, { numerator: n, denominator: d });
  return {
    id: `sample-${date}`, companyId: 'co', periodStart: date, periodEnd: date, checkDate: date, status: 'approved', createdAt: date, minimumWageIssues: [],
    lines: [{
      employeeId: 'e1', grossPay: w, netPay: 0, employeeTaxTotal: 0, employerTaxTotal: 0, pretaxDeductions: 0, posttaxDeductions: 0,
      garnishmentTotal: 0, netPayAfterGarnishment: 0, garnishmentLines: [], depositAllocations: [],
      taxLines: [
        { id: 'US_FIT', name: 'FIT', payer: 'employee', jurisdiction: 'federal', taxableWages: w, amount: dollars(fit) },
        { id: 'US_SS_EE', name: 'SS', payer: 'employee', jurisdiction: 'federal', taxableWages: w, amount: rate(62, 1000) },
        { id: 'US_SS_ER', name: 'SS', payer: 'employer', jurisdiction: 'federal', taxableWages: w, amount: rate(62, 1000) },
        { id: 'US_MED_EE', name: 'Medicare', payer: 'employee', jurisdiction: 'federal', taxableWages: w, amount: rate(145, 10000) },
        { id: 'US_MED_ER', name: 'Medicare', payer: 'employer', jurisdiction: 'federal', taxableWages: w, amount: rate(145, 10000) },
      ],
    }],
  };
}

const runs = ['2026-07-10', '2026-07-24', '2026-08-07', '2026-08-21', '2026-09-04', '2026-09-18'].map((d) => sampleRun(d, 9_000, 1_100));

const form = federal.computeForm941(
  {
    employer: { ein: '123456789', legalName: 'Sample Co LLC', address: { street: '1 Main St', city: 'Columbus', state: 'OH', zip: '43215' } },
    year: 2026,
    quarter: 3,
    runs,
    lookbackTotalLine12: dollars(90_000),
    deposits: [], // the deposits EFTPS confirmed, with trace numbers
  },
  'co',
);

console.log(federal.renderForm941(form));

const packet = federal.paperPacket941(form, { payByCheck: false });
console.log('\nBefore you sign:\n' + packet.checklist.map((c, i) => `${i + 1}. ${c}`).join('\n'));

const { files } = federal.fillPacket(packet, outDir);
console.log(`\nFilled forms (print the pages named in each spec):\n${files.join('\n')}`);
