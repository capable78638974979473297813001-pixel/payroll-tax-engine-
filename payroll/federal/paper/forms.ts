import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmt, type Cents } from '../../../src/money.ts';
import type { Form941, ScheduleB } from '../form941.ts';

/**
 * PAPER FILING: the IRS's own fillable Form 941, Schedule B (Form 941) and
 * Form 941-V, filled with the figures this module computed, ready to print,
 * sign and mail.
 *
 * Why this exists. Form 941 is not required to be e-filed ("You're encouraged to
 * file Form 941 electronically ... If you file a paper return, where you file
 * depends on whether you include a payment" - Instructions for Form 941, Rev.
 * 3-2026), and the IRS's e-file schemas are available only to registered
 * software developers. A correctly filled, signed paper return mailed to the
 * right address is a complete, legal filing that needs no enrollment.
 *
 * What it will NOT do:
 *  - sign. Part 5 is left blank for the responsible person. Nothing here
 *    transmits anything or mails anything.
 *  - guess. The mapping below was written for exactly one revision of each form
 *    (see forms/MANIFEST.json). fill_pdf.py refuses a blank whose revision text or
 *    field count differs, and refuses any field name that is not on the blank.
 *  - fill a form it was not built for. There is no mapping for Form 940 yet (the
 *    2026 form is not published); asking for one is an error, not a guess.
 *
 * The field names are the PDF's own. They were mapped from the field rectangles
 * against the printed layout, and checked by rendering the filled pages.
 */

export const FORMS_DIR = join(import.meta.dirname, 'forms');
const FILL_SCRIPT = join(import.meta.dirname, 'fill_pdf.py');

export interface PaperSpec {
  form: string;
  /** The blank in forms/ this spec is for. */
  blank: string;
  /** Text that must appear on the blank, proving it is the revision this mapping was written for. */
  revision: string;
  expectedFieldCount: number;
  text: Record<string, string>;
  checks: string[];
  /** Pages of the filled PDF to print (1-based). The 941 PDF also carries the 941-V voucher on page 3. */
  pages: number[];
}

/** 12345.67 -> { dollars: "12,345", cents: "67" }; negatives keep the minus in the dollars box, as the instructions ask ("-10.59"). */
export function moneyParts(cents: Cents): { dollars: string; cents: string } {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  return {
    dollars: `${neg ? '-' : ''}${whole.toLocaleString('en-US')}`,
    cents: String(abs % 100).padStart(2, '0'),
  };
}

// ---------------------------------------------------------------------------
// Form 941 (Rev. 3-2026): field names
// ---------------------------------------------------------------------------

const P1 = 'topmostSubform[0].Page1[0].';
const P2 = 'topmostSubform[0].Page2[0].';
const P3 = 'topmostSubform[0].Page3[0].';
const ENTITY = `${P1}Header[0].EntityArea[0].`;

/** Money lines on page 1: [dollars field, cents field]. Verified by rendering. */
const LINE: Record<string, [string, string]> = {
  '2': [`${P1}f1_13[0]`, `${P1}f1_14[0]`],
  '3': [`${P1}f1_15[0]`, `${P1}f1_16[0]`],
  '5a1': [`${P1}f1_17[0]`, `${P1}f1_18[0]`],
  '5a2': [`${P1}f1_19[0]`, `${P1}f1_20[0]`],
  '5b1': [`${P1}f1_21[0]`, `${P1}f1_22[0]`],
  '5b2': [`${P1}f1_23[0]`, `${P1}f1_24[0]`],
  '5c1': [`${P1}f1_25[0]`, `${P1}f1_26[0]`],
  '5c2': [`${P1}f1_27[0]`, `${P1}f1_28[0]`],
  '5d1': [`${P1}f1_29[0]`, `${P1}f1_30[0]`],
  '5d2': [`${P1}f1_31[0]`, `${P1}f1_32[0]`],
  '5e': [`${P1}f1_33[0]`, `${P1}f1_34[0]`],
  '5f': [`${P1}f1_35[0]`, `${P1}f1_36[0]`],
  '6': [`${P1}f1_37[0]`, `${P1}f1_38[0]`],
  '7': [`${P1}f1_39[0]`, `${P1}f1_40[0]`],
  '8': [`${P1}f1_41[0]`, `${P1}f1_42[0]`],
  '9': [`${P1}f1_43[0]`, `${P1}f1_44[0]`],
  '10': [`${P1}f1_45[0]`, `${P1}f1_46[0]`],
  '11': [`${P1}f1_47[0]`, `${P1}f1_48[0]`],
  '12': [`${P1}f1_49[0]`, `${P1}f1_50[0]`],
  '13': [`${P1}f1_51[0]`, `${P1}f1_52[0]`],
  '14': [`${P1}f1_53[0]`, `${P1}f1_54[0]`],
  '15a': [`${P1}f1_55[0]`, `${P1}f1_56[0]`],
};
const QUARTER_BOX = [0, 1, 2, 3].map((i) => `${P1}Header[0].ReportForQuarter[0].c1_1[${i}]`);
const LINE16_BOX = [0, 1, 2].map((i) => `${P2}c2_1[${i}]`); // de minimis, monthly, semiweekly
const MONTH_LIABILITY: [string, string][] = [
  [`${P2}f2_1[0]`, `${P2}f2_2[0]`],
  [`${P2}f2_3[0]`, `${P2}f2_4[0]`],
  [`${P2}f2_5[0]`, `${P2}f2_6[0]`],
];
const LINE16_TOTAL: [string, string] = [`${P2}f2_7[0]`, `${P2}f2_8[0]`];
const VOUCHER_QUARTER = [0, 1, 2, 3].map((i) => `${P3}Line3_ReadOrder[0].c4_1[${i}]`);

export interface PaperEmployer {
  ein: string;
  legalName: string;
  tradeName?: string;
  address: { street: string; suite?: string; city: string; state: string; zip: string };
}

/** Lines that are filled even when zero; the rest are left blank at zero, which the IRS reads as nothing to report. */
const ALWAYS = new Set(['2', '3', '5a1', '5a2', '5c1', '5c2', '5d1', '5d2', '5e', '6', '10', '12', '13']);

/**
 * The Form 941 pages (1 and 2) and, when asked, the 941-V voucher (page 3).
 * Part 4 (third-party designee) and Part 5 (signature, title, date, preparer)
 * are deliberately left blank: only a person can sign.
 */
export function form941PaperSpec(f: Form941, options: { voucher?: boolean } = {}): PaperSpec {
  const text: Record<string, string> = {};
  const checks: string[] = [];
  const e = f.employer;
  const ein = e.ein;
  const set = (key: string, cents: Cents) => {
    if (cents === 0 && !ALWAYS.has(key)) return;
    const [d, c] = LINE[key];
    const m = moneyParts(cents);
    text[d] = m.dollars;
    text[c] = m.cents;
  };

  // Header: EIN (2 + 7), name, trade name, address, quarter
  text[`${ENTITY}f1_1[0]`] = ein.slice(0, 2);
  text[`${ENTITY}f1_2[0]`] = ein.slice(2);
  text[`${ENTITY}f1_3[0]`] = e.legalName;
  if (e.tradeName) text[`${ENTITY}f1_4[0]`] = e.tradeName;
  text[`${ENTITY}f1_5[0]`] = [e.address.street, e.address.suite].filter(Boolean).join(' ');
  text[`${ENTITY}f1_6[0]`] = e.address.city;
  text[`${ENTITY}f1_7[0]`] = e.address.state;
  text[`${ENTITY}f1_8[0]`] = e.address.zip;
  checks.push(QUARTER_BOX[f.quarter - 1]);

  // Part 1
  if (f.line1_numberOfEmployees !== null) text[`${P1}f1_12[0]`] = String(f.line1_numberOfEmployees);
  set('2', f.line2_wagesTipsOtherCompensation);
  set('3', f.line3_federalIncomeTaxWithheld);
  if (f.line4_noWagesSubjectToSocialSecurityOrMedicare) checks.push(`${P1}c1_3[0]`);
  set('5a1', f.line5a_socialSecurityWages.column1);
  set('5a2', f.line5a_socialSecurityWages.column2);
  set('5b1', f.line5b_socialSecurityTips.column1);
  set('5b2', f.line5b_socialSecurityTips.column2);
  set('5c1', f.line5c_medicareWagesAndTips.column1);
  set('5c2', f.line5c_medicareWagesAndTips.column2);
  set('5d1', f.line5d_additionalMedicare.column1);
  set('5d2', f.line5d_additionalMedicare.column2);
  set('5e', f.line5e_totalSocialSecurityAndMedicare);
  set('5f', f.line5f_section3121qNoticeAndDemand);
  set('6', f.line6_totalTaxesBeforeAdjustments);
  set('7', f.line7_fractionsOfCents);
  set('8', f.line8_sickPayAdjustment);
  set('9', f.line9_tipsAndGroupTermLifeAdjustment);
  set('10', f.line10_totalTaxesAfterAdjustments);
  set('11', f.line11_researchCredit);
  set('12', f.line12_totalAfterAdjustmentsAndCredits);
  set('13', f.line13_totalDeposits);
  set('14', f.line14_balanceDue);
  set('15a', f.line15a_overpayment);

  const election = f.line15b_overpaymentElection;
  if (f.line15a_overpayment > 0 && election) {
    if (election.kind === 'apply_to_next_return') checks.push(`${P1}c1_4[0]`);
    else {
      checks.push(`${P1}c1_4[1]`);
      if (election.routingNumber) text[`${P1}RoutingNo[0].f1_57[0]`] = election.routingNumber;
      if (election.accountType) checks.push(`${P1}c1_5[${election.accountType === 'checking' ? 0 : 1}]`);
      if (election.accountNumber) text[`${P1}AccountNo[0].f1_58[0]`] = election.accountNumber;
    }
  }

  // Page 2: header repeats, Part 2, Part 3
  text[`${P2}Name_ReadOrder[0].f1_3[0]`] = e.legalName;
  text[`${P2}EIN_Number[0].f1_1[0]`] = ein.slice(0, 2);
  text[`${P2}EIN_Number[0].f1_2[0]`] = ein.slice(2);
  const choice = f.part2.choice;
  checks.push(LINE16_BOX[choice === 'de_minimis' ? 0 : choice === 'monthly' ? 1 : 2]);
  if (f.part2.monthlyLiability) {
    const l = f.part2.monthlyLiability;
    [l.month1, l.month2, l.month3].forEach((v, i) => {
      const m = moneyParts(v);
      text[MONTH_LIABILITY[i][0]] = m.dollars;
      text[MONTH_LIABILITY[i][1]] = m.cents;
    });
    const t = moneyParts(l.total);
    text[LINE16_TOTAL[0]] = t.dollars;
    text[LINE16_TOTAL[1]] = t.cents;
  }
  if (f.line17_finalWageDate) {
    checks.push(`${P2}c2_2[0]`);
    const [y, mo, d] = f.line17_finalWageDate.split('-');
    text[`${P2}f2_9[0]`] = `${mo}${d}${y}`;
  }
  if (f.line18_seasonalEmployer) checks.push(`${P2}c2_3[0]`);

  // Page 3: Form 941-V, only for a balance paid by check or money order
  if (options.voucher && f.line14_balanceDue > 0) {
    text[`${P3}EIN_Number[0].f1_1[0]`] = ein.slice(0, 2);
    text[`${P3}EIN_Number[0].f1_2[0]`] = ein.slice(2);
    const m = moneyParts(f.line14_balanceDue);
    text[`${P3}f4_2[0]`] = m.dollars;
    text[`${P3}f4_3[0]`] = m.cents;
    checks.push(VOUCHER_QUARTER[f.quarter - 1]);
    text[`${P3}f1_3[0]`] = e.legalName;
    text[`${P3}f4_5[0]`] = [e.address.street, e.address.suite].filter(Boolean).join(' ');
    text[`${P3}f4_6[0]`] = `${e.address.city}, ${e.address.state} ${e.address.zip}`;
  }

  return {
    form: '941',
    blank: 'f941.pdf',
    revision: 'Rev. 3-2026',
    expectedFieldCount: 130,
    text,
    checks,
    pages: options.voucher && f.line14_balanceDue > 0 ? [1, 2, 3] : [1, 2],
  };
}

// ---------------------------------------------------------------------------
// Schedule B (Form 941), Rev. 3-2024
// ---------------------------------------------------------------------------

const SB = 'topmostSubform[0].Page1[0].';
const SB_GROUPS: [string, number, number][] = [
  ['Day1-8', 1, 8],
  ['Day9-16', 9, 16],
  ['Day17-24', 17, 24],
  ['Day25-31', 25, 31],
];
/** First field number of each month's first group: Month 1 starts at f1_15, Month 2 at f1_79, Month 3 at f1_143 (64 fields per month, then 2 total fields). */
const SB_MONTH_START = [15, 79, 143];
const SB_MONTH_TOTAL: [string, string][] = [
  [`${SB}f1_77[0]`, `${SB}f1_78[0]`],
  [`${SB}f1_141[0]`, `${SB}f1_142[0]`],
  [`${SB}f1_205[0]`, `${SB}f1_206[0]`],
];
const SB_QUARTER_TOTAL: [string, string] = [`${SB}f1_207[0]`, `${SB}f1_208[0]`];

/** The field name for a day's dollars and cents boxes: month 1-3, day 1-31. */
export function scheduleBFieldFor(month: 1 | 2 | 3, day: number): [string, string] {
  const group = SB_GROUPS.find(([, a, b]) => day >= a && day <= b);
  if (!group) throw new Error(`day ${day} is not a day of the month`);
  const [name, start] = group;
  const groupIndex = SB_GROUPS.indexOf(group);
  const first = SB_MONTH_START[month - 1] + groupIndex * 16 + (day - start) * 2;
  const prefix = `${SB}${name}_Month${month}[0].`;
  return [`${prefix}f1_${first}[0]`, `${prefix}f1_${first + 1}[0]`];
}

export function scheduleBPaperSpec(sb: ScheduleB, employerName: string): PaperSpec {
  const text: Record<string, string> = {};
  const checks: string[] = [];
  const hdr = `${SB}Header-Entity[0].Entity[0].`;
  [...sb.ein].forEach((digit, i) => {
    text[`${hdr}f1_0${i + 1}[0]`] = digit;
  });
  text[`${hdr}f1_10[0]`] = employerName;
  [...String(sb.year)].forEach((digit, i) => {
    text[`${hdr}f1_${11 + i}[0]`] = digit;
  });
  checks.push(`${SB}c1_1[${sb.quarter - 1}]`);
  for (const month of sb.months) {
    for (const d of month.days) {
      const [dollarsField, centsField] = scheduleBFieldFor(month.month, d.day);
      const m = moneyParts(d.liability);
      text[dollarsField] = m.dollars;
      text[centsField] = m.cents;
    }
    const t = moneyParts(month.total);
    text[SB_MONTH_TOTAL[month.month - 1][0]] = t.dollars;
    text[SB_MONTH_TOTAL[month.month - 1][1]] = t.cents;
  }
  const q = moneyParts(sb.totalLiabilityForQuarter);
  text[SB_QUARTER_TOTAL[0]] = q.dollars;
  text[SB_QUARTER_TOTAL[1]] = q.cents;
  return { form: '941sb', blank: 'f941sb.pdf', revision: 'Rev. March 2024', expectedFieldCount: 228, text, checks, pages: [1] };
}

// ---------------------------------------------------------------------------
// Where to mail it (Instructions for Form 941, Rev. 3-2026, "Mailing Addresses for Form 941")
// ---------------------------------------------------------------------------

const EAST = ['CT', 'DE', 'DC', 'GA', 'IL', 'IN', 'KY', 'ME', 'MD', 'MA', 'MI', 'NH', 'NJ', 'NY', 'NC', 'OH', 'PA', 'RI', 'SC', 'TN', 'VT', 'VA', 'WV', 'WI'];
const WEST = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'FL', 'HI', 'ID', 'IA', 'KS', 'LA', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NM', 'ND', 'OK', 'OR', 'SD', 'TX', 'UT', 'WA', 'WY'];
const LOUISVILLE = ['Internal Revenue Service', 'P.O. Box 932100', 'Louisville, KY 40293-2100'];

export interface MailingAddress {
  lines: string[];
  /** Which row of the IRS table this came from. */
  group: 'east' | 'west' | 'no_state';
  withPayment: boolean;
}

/**
 * Where a paper Form 941 goes, by the state of the employer's legal residence or
 * principal place of business. "No legal residence or principal place of business
 * in any state" (including territories) has its own address. Government and exempt
 * organizations have a special address and are not handled here (throws).
 */
export function mailingAddress941(state: string | null, withPayment: boolean): MailingAddress {
  const st = state?.toUpperCase() ?? null;
  const group = st && EAST.includes(st) ? 'east' : st && WEST.includes(st) ? 'west' : 'no_state';
  if (withPayment) return { lines: LOUISVILLE, group, withPayment };
  if (group === 'east') return { lines: ['Department of the Treasury', 'Internal Revenue Service', 'Kansas City, MO 64999-0005'], group, withPayment };
  if (group === 'west') return { lines: ['Department of the Treasury', 'Internal Revenue Service', 'Ogden, UT 84201-0005'], group, withPayment };
  return { lines: ['Internal Revenue Service', 'P.O. Box 409101', 'Ogden, UT 84409'], group, withPayment };
}

// ---------------------------------------------------------------------------
// The packet
// ---------------------------------------------------------------------------

export interface PaperPacket {
  specs: PaperSpec[];
  mailTo: MailingAddress;
  /** What the person signing and mailing must do. Nothing here is done for them. */
  checklist: string[];
}

export function paperPacket941(f: Form941, options: { payByCheck?: boolean } = {}): PaperPacket {
  const withPayment = Boolean(options.payByCheck) && f.line14_balanceDue > 0;
  const specs = [form941PaperSpec(f, { voucher: withPayment })];
  if (f.scheduleB) specs.push(scheduleBPaperSpec(f.scheduleB, f.employer.legalName));
  const mailTo = mailingAddress941(f.employer.address.state, withPayment);
  const checklist = [
    `Review every line against your payroll records. This packet is ready only if the return has no errors${f.readyToSign ? ' (it has none)' : ': IT HAS ERRORS, resolve them first'}.`,
    `Due ${f.due.dueDate}${f.due.extendedDueDate ? `; ${f.due.extendedDueDate} if every deposit for the quarter was made in full and on time` : ''}. Paper returns count as timely if postmarked by the due date (USPS or an IRS-designated private delivery service).`,
    'Sign and date page 2, Part 5, in ink, and print your name and title. Only an authorized person may sign (the instructions list who). A paid preparer also completes the preparer section. This packet leaves Part 5 and Part 4 blank on purpose.',
    ...(f.scheduleB ? ['Attach Schedule B (Form 941) behind the return: you were a semiweekly schedule depositor for part of the quarter.'] : []),
    f.line14_balanceDue >= 100
      ? `Balance due ${fmt(f.line14_balanceDue)}: pay it electronically (EFTPS, IRS Direct Pay or your business tax account); the IRS asks for electronic payment in 2026. If you pay by EFT, mail the return to the "without a payment" address and do not send Form 941-V.`
      : 'No balance due (or under $1).',
    ...(withPayment ? ['You chose to pay by check or money order: make it payable to "United States Treasury" with your EIN, "Form 941" and the tax period on it, detach and enclose Form 941-V, do not staple the voucher or payment to the return, and mail to the "with a payment" address.'] : []),
    `Mail to: ${mailTo.lines.join(', ')}. This is the address for ${mailTo.withPayment ? 'returns sent with a payment' : 'returns sent without a payment'} from ${mailTo.group === 'east' ? 'the eastern group of states' : mailTo.group === 'west' ? 'the western group of states' : 'an employer with no state'}; the IRS notes your filing address may have changed from prior years.`,
    'Do not send Form 941 or any payment to the SSA.',
    'Keep a copy of the signed return, Schedule B and your EFT trace numbers (the receipts for your deposits).',
    'W-2 and W-3 are filed separately with the SSA (Business Services Online); see the W-2 entry sheet.',
  ];
  return { specs, mailTo, checklist };
}

export interface FilledPacket {
  /** Paths of the filled PDFs, in the order of `packet.specs`. */
  files: string[];
}

/**
 * Fill the blanks in forms/ with python3 + pypdf (fill_pdf.py). Throws if python or
 * pypdf is missing, if the blank is not the revision the mapping was written for,
 * or if any value fails to read back. Pages not meant to be printed (the 941-V when
 * not used) stay in the PDF; print only `spec.pages`.
 */
export function fillPacket(packet: PaperPacket, outDir: string, formsDir: string = FORMS_DIR): FilledPacket {
  mkdirSync(outDir, { recursive: true });
  const files: string[] = [];
  for (const spec of packet.specs) {
    const blank = join(formsDir, spec.blank);
    if (!existsSync(blank)) throw new Error(`The blank ${spec.blank} is not in ${formsDir}.`);
    const specPath = join(outDir, `${spec.form}.spec.json`);
    writeFileSync(specPath, JSON.stringify(spec, null, 2));
    const out = join(outDir, `${spec.form}-filled.pdf`);
    const r = spawnSync('python3', ['-I', FILL_SCRIPT, '--blank', blank, '--spec', specPath, '--out', out], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`Filling Form ${spec.form} failed (${r.status ?? 'no python'}): ${(r.stderr || r.error?.message || '').split('\n').filter((l) => /REFUSED|VERIFY|Error/.test(l)).join(' ') || r.stderr}`);
    files.push(out);
  }
  return { files };
}
