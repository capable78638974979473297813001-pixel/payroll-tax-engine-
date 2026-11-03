import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { dollars } from '../src/money.ts';
import type { PayRun, PayRunLine } from '../payroll/types.ts';
import { computeForm941, timesRate } from '../payroll/federal/form941.ts';
import {
  FORMS_DIR,
  fillPacket,
  form941PaperSpec,
  mailingAddress941,
  moneyParts,
  paperPacket941,
  scheduleBFieldFor,
  scheduleBPaperSpec,
} from '../payroll/federal/paper/forms.ts';

const employer = {
  ein: '123456789',
  legalName: 'Rooter Bros LLC',
  tradeName: 'Rooter Bros Plumbing',
  address: { street: '1 Main St', suite: 'Suite 200', city: 'Columbus', state: 'OH', zip: '43215' },
};

function run(date: string, wages: number, fit: number): PayRun {
  const w = dollars(wages);
  const line = (i: number): PayRunLine => ({
    employeeId: `e${i}`, grossPay: w, netPay: 0, employeeTaxTotal: 0, employerTaxTotal: 0, pretaxDeductions: 0, posttaxDeductions: 0,
    garnishmentTotal: 0, netPayAfterGarnishment: 0, garnishmentLines: [], depositAllocations: [],
    taxLines: [
      { id: 'US_FIT', name: 'FIT', payer: 'employee', jurisdiction: 'federal', taxableWages: w, amount: dollars(fit) },
      { id: 'US_SS_EE', name: 'SS', payer: 'employee', jurisdiction: 'federal', taxableWages: w, amount: timesRate(w, { numerator: 62, denominator: 1000 }) },
      { id: 'US_SS_ER', name: 'SS', payer: 'employer', jurisdiction: 'federal', taxableWages: w, amount: timesRate(w, { numerator: 62, denominator: 1000 }) },
      { id: 'US_MED_EE', name: 'M', payer: 'employee', jurisdiction: 'federal', taxableWages: w, amount: timesRate(w, { numerator: 145, denominator: 10000 }) },
      { id: 'US_MED_ER', name: 'M', payer: 'employer', jurisdiction: 'federal', taxableWages: w, amount: timesRate(w, { numerator: 145, denominator: 10000 }) },
    ],
  });
  return { id: `r${date}`, companyId: 'co', periodStart: date.replace(/..$/, '01'), periodEnd: date, checkDate: date, status: 'approved', lines: [line(1), line(2), line(3)], createdAt: date, minimumWageIssues: [] };
}

const pythonReady = (() => {
  const r = spawnSync('python3', ['-I', '-c', 'import pypdf, fontTools'], { encoding: 'utf8' });
  return r.status === 0;
})();

describe('money boxes', () => {
  test('dollars with separators and two-digit cents; negatives keep the minus in the dollars box', () => {
    assert.deepEqual(moneyParts(1_234_567), { dollars: '12,345', cents: '67' });
    assert.deepEqual(moneyParts(5), { dollars: '0', cents: '05' });
    assert.deepEqual(moneyParts(0), { dollars: '0', cents: '00' });
    assert.deepEqual(moneyParts(-1059), { dollars: '-10', cents: '59' }); // the instructions' own example: "-10.59"
    assert.deepEqual(moneyParts(-3), { dollars: '-0', cents: '03' });
    assert.deepEqual(moneyParts(100_000_000_00), { dollars: '100,000,000', cents: '00' });
  });
});

describe('Schedule B field mapping (verified against the rendered form)', () => {
  test('known positions: month 1 day 1, month 1 day 8, month 1 day 9, month 3 day 31', () => {
    assert.deepEqual(scheduleBFieldFor(1, 1), ['topmostSubform[0].Page1[0].Day1-8_Month1[0].f1_15[0]', 'topmostSubform[0].Page1[0].Day1-8_Month1[0].f1_16[0]']);
    assert.deepEqual(scheduleBFieldFor(1, 8), ['topmostSubform[0].Page1[0].Day1-8_Month1[0].f1_29[0]', 'topmostSubform[0].Page1[0].Day1-8_Month1[0].f1_30[0]']);
    assert.deepEqual(scheduleBFieldFor(1, 9), ['topmostSubform[0].Page1[0].Day9-16_Month1[0].f1_31[0]', 'topmostSubform[0].Page1[0].Day9-16_Month1[0].f1_32[0]']);
    assert.deepEqual(scheduleBFieldFor(3, 31), ['topmostSubform[0].Page1[0].Day25-31_Month3[0].f1_203[0]', 'topmostSubform[0].Page1[0].Day25-31_Month3[0].f1_204[0]']);
  });
  test('all 93 days map to 93 distinct pairs of fields', () => {
    const names = new Set<string>();
    for (const m of [1, 2, 3] as const) for (let d = 1; d <= 31; d += 1) for (const n of scheduleBFieldFor(m, d)) names.add(n);
    assert.equal(names.size, 93 * 2);
  });
  test('day 32 is refused', () => {
    assert.throws(() => scheduleBFieldFor(1, 32), /not a day/);
  });
});

describe('mailing addresses (Instructions for Form 941, Rev. 3-2026)', () => {
  const east = ['CT', 'DE', 'DC', 'GA', 'IL', 'IN', 'KY', 'ME', 'MD', 'MA', 'MI', 'NH', 'NJ', 'NY', 'NC', 'OH', 'PA', 'RI', 'SC', 'TN', 'VT', 'VA', 'WV', 'WI'];
  const all50plusDc = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
  test('every state and DC maps to exactly one group; 24 east and 27 west', () => {
    assert.equal(all50plusDc.length, 51);
    const groups = all50plusDc.map((s) => mailingAddress941(s, false).group);
    assert.equal(groups.filter((g) => g === 'east').length, 24);
    assert.equal(groups.filter((g) => g === 'west').length, 27);
    assert.equal(groups.includes('no_state'), false);
    for (const s of east) assert.equal(mailingAddress941(s, false).group, 'east', s);
  });
  test('without a payment: Kansas City for the east, Ogden for the west', () => {
    assert.deepEqual(mailingAddress941('OH', false).lines, ['Department of the Treasury', 'Internal Revenue Service', 'Kansas City, MO 64999-0005']);
    assert.deepEqual(mailingAddress941('CA', false).lines, ['Department of the Treasury', 'Internal Revenue Service', 'Ogden, UT 84201-0005']);
    assert.deepEqual(mailingAddress941('oh', false).lines, mailingAddress941('OH', false).lines, 'case does not matter');
  });
  test('with a payment: always Louisville, for every state', () => {
    for (const s of all50plusDc) assert.deepEqual(mailingAddress941(s, true).lines, ['Internal Revenue Service', 'P.O. Box 932100', 'Louisville, KY 40293-2100'], s);
  });
  test('no state (territories, abroad) has its own address', () => {
    assert.deepEqual(mailingAddress941(null, false).lines, ['Internal Revenue Service', 'P.O. Box 409101', 'Ogden, UT 84409']);
    assert.equal(mailingAddress941('PR', false).group, 'no_state');
  });
});

describe('the pinned blank forms', () => {
  test('match the manifest exactly (a revised form must be a deliberate update)', () => {
    const manifest = JSON.parse(readFileSync(join(FORMS_DIR, 'MANIFEST.json'), 'utf8')) as { forms: { file: string; sha256: string; bytes: number; fieldCount: number; revision: string }[] };
    assert.equal(manifest.forms.length, 2);
    for (const f of manifest.forms) {
      const bytes = readFileSync(join(FORMS_DIR, f.file));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), f.sha256, f.file);
      assert.equal(bytes.length, f.bytes);
    }
  });
  test("the mapping's expected field counts and revisions are the manifest's", () => {
    const manifest = JSON.parse(readFileSync(join(FORMS_DIR, 'MANIFEST.json'), 'utf8')) as { forms: { file: string; fieldCount: number; revision: string }[] };
    const f941 = computeForm941({ employer, year: 2026, quarter: 3, runs: [run('2026-07-10', 9000, 1000)] }, 'co');
    const s = form941PaperSpec(f941);
    const m941 = manifest.forms.find((f) => f.file === s.blank)!;
    assert.equal(s.expectedFieldCount, m941.fieldCount);
    assert.match(m941.revision.replace('March', '3').replace(/ (\d{4})$/, '-$1'), /Rev\. 3-2026/);
  });
});

function quarterReturn() {
  const fridays = ['2026-07-10', '2026-07-24', '2026-08-07', '2026-08-21', '2026-09-04', '2026-09-18'];
  const runs = fridays.map((d) => run(d, 9000 + (d.endsWith('04') ? 1234.56 : 0), 1100));
  return computeForm941({
    employer, year: 2026, quarter: 3, runs, lookbackTotalLine12: dollars(90_000),
    deposits: [{ id: 'd1', date: '2026-07-15', amount: dollars(10_000), year: 2026, quarter: 3 }],
  }, 'co');
}

describe('Form 941 spec', () => {
  test('lines carry the computed values into the right boxes; Parts 4 and 5 are never filled', () => {
    const f = quarterReturn();
    const s = form941PaperSpec(f);
    const P1 = 'topmostSubform[0].Page1[0].';
    assert.equal(s.text[`${P1}f1_13[0]`], '165,703'); // line 2
    assert.equal(s.text[`${P1}f1_14[0]`], '68');
    assert.equal(s.text[`${P1}f1_19[0]`], '20,547'); // 5a column 2
    assert.equal(s.text[`${P1}f1_20[0]`], '26');
    assert.equal(s.text[`${P1}f1_53[0]`], '35,152'); // line 14 balance due
    assert.ok(s.checks.includes(`${P1}Header[0].ReportForQuarter[0].c1_1[2]`), 'quarter 3');
    assert.ok(s.checks.includes('topmostSubform[0].Page2[0].c2_1[2]'), 'semiweekly box');
    // nothing in Part 4 (designee) or Part 5 (signature, name, title, date, preparer)
    const forbidden = ['f2_10', 'f2_11', 'f2_12', 'f2_13', 'f2_14', 'f2_15', 'f2_16', 'f2_17', 'f2_18', 'f2_19', 'f2_20', 'f2_21', 'f2_22', 'f2_23', 'f2_24', 'c2_4', 'c2_5'];
    for (const key of [...Object.keys(s.text), ...s.checks]) for (const bad of forbidden) assert.equal(key.includes(bad), false, `${key} is in Part 4/5`);
  });
  test('zero optional lines are left blank; required ones are filled even at zero', () => {
    const f = computeForm941({ employer, year: 2026, quarter: 1, runs: [run('2026-03-27', 1000, 100)] }, 'co');
    const s = form941PaperSpec(f);
    const P1 = 'topmostSubform[0].Page1[0].';
    assert.equal(s.text[`${P1}f1_21[0]`], undefined, '5b tips at zero stays blank');
    assert.equal(s.text[`${P1}f1_55[0]`], undefined, '15a at zero stays blank');
    assert.equal(s.text[`${P1}f1_31[0]`], '0', '5d is filled even at zero');
  });
  test('the voucher page is included only when paying by check and there is a balance', () => {
    const f = quarterReturn();
    assert.deepEqual(form941PaperSpec(f).pages, [1, 2]);
    assert.deepEqual(form941PaperSpec(f, { voucher: true }).pages, [1, 2, 3]);
    const voucher = form941PaperSpec(f, { voucher: true });
    assert.equal(voucher.text['topmostSubform[0].Page3[0].f4_2[0]'], '35,152');
    assert.ok(voucher.checks.includes('topmostSubform[0].Page3[0].Line3_ReadOrder[0].c4_1[2]'));
  });
  test('a refund election fills 15b-15e only when there is an overpayment', () => {
    const base = { employer, year: 2026 as const, quarter: 1 as const, runs: [run('2026-03-27', 1000, 100)] };
    const f0 = computeForm941(base, 'co');
    const over = computeForm941({ ...base, deposits: [{ id: 'd', date: '2026-04-15', amount: f0.line12_totalAfterAdjustmentsAndCredits + dollars(50), year: 2026, quarter: 1 }], overpaymentElection: { kind: 'refund', routingNumber: '021000021', accountType: 'checking', accountNumber: '123456789' } }, 'co');
    const s = form941PaperSpec(over);
    assert.equal(s.text['topmostSubform[0].Page1[0].RoutingNo[0].f1_57[0]'], '021000021');
    assert.ok(s.checks.includes('topmostSubform[0].Page1[0].c1_4[1]'), 'send a refund');
    assert.ok(s.checks.includes('topmostSubform[0].Page1[0].c1_5[0]'), 'checking');
    const none = form941PaperSpec(computeForm941({ ...base, overpaymentElection: { kind: 'refund', routingNumber: '021000021' } }, 'co'));
    assert.equal(none.text['topmostSubform[0].Page1[0].RoutingNo[0].f1_57[0]'], undefined, 'no overpayment, no refund details');
  });
});

describe('the packet', () => {
  test('includes Schedule B for a semiweekly depositor, with the right mailing address and a signing checklist', () => {
    const f = quarterReturn();
    const p = paperPacket941(f, { payByCheck: false });
    assert.deepEqual(p.specs.map((s) => s.form), ['941', '941sb']);
    assert.deepEqual(p.mailTo.lines, ['Department of the Treasury', 'Internal Revenue Service', 'Kansas City, MO 64999-0005']);
    const text = p.checklist.join('\n');
    assert.match(text, /Sign and date page 2, Part 5/);
    assert.match(text, /Attach Schedule B/);
    assert.match(text, /pay it electronically/);
    assert.match(text, /Do not send Form 941 or any payment to the SSA/);
    assert.match(text, /Due 2026-11-02; 2026-11-10 if every deposit/);
  });
  test('paying by check sends it to Louisville with the voucher', () => {
    const p = paperPacket941(quarterReturn(), { payByCheck: true });
    assert.deepEqual(p.mailTo.lines, ['Internal Revenue Service', 'P.O. Box 932100', 'Louisville, KY 40293-2100']);
    assert.deepEqual(p.specs[0].pages, [1, 2, 3]);
    assert.match(p.checklist.join('\n'), /Form 941-V/);
  });
  test('a return with errors says so in the first line of the checklist', () => {
    const bad = computeForm941({ employer: { ...employer, ein: '12' }, year: 2026, quarter: 1, runs: [run('2026-03-27', 1000, 100)] }, 'co');
    assert.match(paperPacket941(bad).checklist[0], /IT HAS ERRORS/);
  });
  test('Schedule B carries the employer name, EIN digit by digit, the year digit by digit and the quarter', () => {
    const f = quarterReturn();
    const s = scheduleBPaperSpec(f.scheduleB!, f.employer.legalName);
    const hdr = 'topmostSubform[0].Page1[0].Header-Entity[0].Entity[0].';
    assert.equal(s.text[`${hdr}f1_01[0]`], '1');
    assert.equal(s.text[`${hdr}f1_09[0]`], '9');
    assert.equal(s.text[`${hdr}f1_10[0]`], 'Rooter Bros LLC');
    assert.deepEqual([11, 12, 13, 14].map((n) => s.text[`${hdr}f1_${n}[0]`]), ['2', '0', '2', '6']);
    assert.ok(s.checks.includes('topmostSubform[0].Page1[0].c1_1[2]'));
    assert.equal(s.text['topmostSubform[0].Page1[0].f1_207[0]'], '45,152');
  });
});

describe('filling the real IRS forms (needs python3 with pypdf and fontTools)', { skip: pythonReady ? false : 'python3 with pypdf and fonttools is not installed' }, () => {
  test('fills a whole packet and every value reads back from the PDF', () => {
    const dir = mkdtempSync(join(tmpdir(), 'packet-'));
    const out = fillPacket(paperPacket941(quarterReturn(), { payByCheck: true }), dir);
    assert.equal(out.files.length, 2);
    // independently read the filled 941 back and check a few figures
    const r = spawnSync('python3', ['-I', '-c', `
import pypdf,sys
f=pypdf.PdfReader(sys.argv[1]).get_fields()
get=lambda n:f['topmostSubform[0].'+n].get('/V')
print(get('Page1[0].f1_13[0]'), get('Page1[0].f1_14[0]'), get('Page1[0].f1_53[0]'), get('Page3[0].f4_2[0]'))
`, out.files[0]], { encoding: 'utf8' });
    assert.equal(r.stdout.trim(), '165,703 68 35,152 35,152');
  });

  test('refuses a blank that is not the revision the mapping was written for', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wrong-'));
    copyFileSync(join(FORMS_DIR, 'f941sb.pdf'), join(dir, 'f941.pdf')); // Schedule B posing as Form 941
    assert.throws(() => fillPacket(paperPacket941(quarterReturn()), join(dir, 'out'), dir), /REFUSED|revised|fields/);
  });

  test('refuses a value that does not fit its box', () => {
    const f = quarterReturn();
    const spec = form941PaperSpec(f);
    spec.text['topmostSubform[0].Page1[0].Header[0].EntityArea[0].f1_7[0]'] = 'OHIO'; // state box allows 2
    const dir = mkdtempSync(join(tmpdir(), 'long-'));
    assert.throws(() => fillPacket({ specs: [spec], mailTo: mailingAddress941('OH', false), checklist: [] }, dir), /longer than field/);
  });
});

import { w2EntrySheet } from '../payroll/federal/paper/w2Sheet.ts';
import type { W2Summary } from '../payroll/filings.ts';

describe('W-2 entry sheet for BSO online forms', () => {
  const w2 = (id: string, over: Partial<W2Summary> = {}): W2Summary => ({
    employeeId: id, year: 2026, box1_wages: dollars(50_000), box2_federalIncomeTaxWithheld: dollars(5_000), box3_socialSecurityWages: dollars(50_000),
    box4_socialSecurityTaxWithheld: dollars(3_100), box5_medicareWages: dollars(50_000), box6_medicareTaxWithheld: dollars(725), box10_dependentCareBenefits: 0,
    box12: [{ code: 'D', amount: dollars(2_000) }], box15to17_state: [{ state: 'OH', wages: dollars(50_000), incomeTaxWithheld: dollars(900) }], box18to20_local: [], ...over,
  });
  const recipients = { a: { name: 'Pat Example', ssn: '123456789' }, b: { name: 'Sam Sample' } };

  test('lists each employee in box order, masks SSNs by default, and totals the W-3', () => {
    const s = w2EntrySheet({ year: 2026, employer, w2s: [w2('a'), w2('b')], recipients });
    assert.equal(s.route, 'bso_online_forms');
    assert.match(s.text, /W-2 1 of 2: Pat Example/);
    assert.match(s.text, /\*\*\*-\*\*-6789/);
    assert.doesNotMatch(s.text, /123-45-6789/);
    assert.match(s.text, /enter from the employee's Form W-4/);
    assert.match(s.text, /Box 12 Code D/);
    assert.match(s.text, /Boxes 15-17 State OH/);
    assert.equal(s.w3.box1_wages, dollars(100_000));
    assert.match(s.text, /Box c {2}Number of W-2s: {6}2/);
    assert.equal(s.usable, true);
  });
  test('the SSN is shown in full only when asked', () => {
    const s = w2EntrySheet({ year: 2026, employer, w2s: [w2('a')], recipients, unmaskSsn: true });
    assert.match(s.text, /123-45-6789/);
  });
  test('an invalid SSN, a missing name or a failing W-2 makes it unusable', () => {
    assert.equal(w2EntrySheet({ year: 2026, employer, w2s: [w2('a')], recipients: { a: { name: 'P', ssn: '123' } } }).usable, false);
    assert.equal(w2EntrySheet({ year: 2026, employer, w2s: [w2('zzz')], recipients }).usable, false);
    assert.equal(w2EntrySheet({ year: 2026, employer, w2s: [w2('a', { box3_socialSecurityWages: 0 })], recipients }).usable, false);
  });
  test('over 50 W-2s there is no entry sheet: the SSA expects a wage file', () => {
    const many = Array.from({ length: 51 }, (_, i) => w2(`e${i}`));
    const rec = Object.fromEntries(many.map((w) => [w.employeeId, { name: w.employeeId }]));
    const s = w2EntrySheet({ year: 2026, employer, w2s: many, recipients: rec });
    assert.equal(s.route, 'bso_file_upload');
    assert.equal(s.usable, false);
    assert.match(s.text, /EFW2 specification/);
    assert.equal(s.mustEfile, true);
  });
  test('the e-file mandate counts other information returns', () => {
    assert.equal(w2EntrySheet({ year: 2026, employer, w2s: [w2('a')], recipients, otherInformationReturns: 9 }).mustEfile, true);
    assert.equal(w2EntrySheet({ year: 2026, employer, w2s: [w2('a')], recipients, otherInformationReturns: 8 }).mustEfile, false);
  });
});
