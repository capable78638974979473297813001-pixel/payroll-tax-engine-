import { fmt, type Cents } from '../../../src/money.ts';
import type { W2Summary } from '../../filings.ts';
import { ssaBsoRoute, mustEfileW2 } from '../agency.ts';
import type { EmployerIdentity, Finding } from '../form941.ts';
import { buildW3, validateW2, type W3 } from '../w3.ts';

/**
 * A W-2 ENTRY SHEET for the SSA's Business Services Online (BSO) online forms.
 *
 * BSO lets an employer with 50 or fewer W-2s create, save and submit them through
 * its online fill-in forms, and "generates Form W-3 automatically based on your
 * Forms W-2" (General Instructions for Forms W-2 and W-3, 2026). That route needs
 * a BSO account in the employer's name and no wage-file specification, so it is the
 * way to file W-2s today. This module produces what a person types in: each
 * employee's boxes in order, each W-2 checked against the instructions' checklist,
 * and the W-3 totals to compare with what BSO generates.
 *
 * It does NOT file anything. Over 50 W-2s the SSA expects an EFW2 file upload, which
 * is not built (see agency.ts).
 *
 * Social security numbers are never stored by this engine. The sheet shows an SSN
 * only if the caller supplies one for the run, and masks it unless asked not to; the
 * output is as sensitive as the payroll register and should be handled that way.
 */

export interface W2Recipient {
  name: string;
  /** Nine digits. Supplied at run time; never stored by the engine. */
  ssn?: string;
  address?: string;
}

export interface W2Sheet {
  year: number;
  route: 'bso_online_forms' | 'bso_file_upload';
  mustEfile: boolean;
  /** Present only for the online-forms route. */
  text: string;
  w3: W3;
  findings: Finding[];
  /** False when any W-2 has an error or the route needs a file upload. */
  usable: boolean;
}

const money = (c: Cents) => fmt(c).replace('$', '');

function maskSsn(ssn: string | undefined, unmasked: boolean): string {
  if (!ssn) return '(enter from the employee\'s Form W-4)';
  if (!/^\d{9}$/.test(ssn)) return '(INVALID: must be nine digits)';
  return unmasked ? `${ssn.slice(0, 3)}-${ssn.slice(3, 5)}-${ssn.slice(5)}` : `***-**-${ssn.slice(5)}`;
}

export function w2EntrySheet(args: {
  year: number;
  employer: EmployerIdentity;
  w2s: readonly W2Summary[];
  recipients: Readonly<Record<string, W2Recipient>>;
  /** Other information returns (1099s, 1095s ...) this year, which count toward the e-file mandate. */
  otherInformationReturns?: number;
  unmaskSsn?: boolean;
}): W2Sheet {
  const { year, employer, w2s, recipients } = args;
  const findings: Finding[] = [];
  const route = ssaBsoRoute(w2s.length);
  const mustEfile = mustEfileW2(w2s.length, args.otherInformationReturns ?? 0);
  for (const w of w2s) {
    findings.push(...validateW2(w, year));
    const r = recipients[w.employeeId];
    if (!r) findings.push({ severity: 'error', code: 'missing_recipient', message: `Employee ${w.employeeId}: no name supplied for the W-2.` });
    else if (r.ssn !== undefined && !/^\d{9}$/.test(r.ssn)) findings.push({ severity: 'error', code: 'invalid_ssn', message: `Employee ${w.employeeId}: the SSN is not nine digits.` });
  }
  const w3 = buildW3(year, employer, w2s);
  const lines: string[] = [
    `W-2 entry sheet, tax year ${year}: ${employer.legalName}  EIN ${employer.ein.slice(0, 2)}-${employer.ein.slice(2)}`,
    `Forms W-2: ${w2s.length}. Due to the SSA ${w3.due} (paper or electronic). ${mustEfile ? 'You must e-file (10 or more information returns).' : 'E-filing is optional below 10 information returns.'}`,
    '',
  ];
  if (route === 'bso_file_upload') {
    lines.push(`More than 50 W-2s: BSO's online forms are not the route; the SSA expects a wage file built to its EFW2 specification (not built here). No entry sheet is produced.`);
    return { year, route, mustEfile, text: lines.join('\n'), w3, findings, usable: false };
  }
  lines.push('Enter into BSO > Electronic Wage Reporting > Forms W-2/W-3 Online. Copy A is not printed from the IRS PDF; BSO files it.', '');
  w2s.forEach((w, i) => {
    const r = recipients[w.employeeId];
    lines.push(
      `--- W-2 ${i + 1} of ${w2s.length}: ${r?.name ?? `(employee ${w.employeeId})`}`,
      `  SSN (box a):                       ${maskSsn(r?.ssn, args.unmaskSsn ?? false)}`,
      ...(r?.address ? [`  Address (box f):                   ${r.address}`] : []),
      `  Box 1  Wages, tips, other comp.:    ${money(w.box1_wages)}`,
      `  Box 2  Federal income tax withheld: ${money(w.box2_federalIncomeTaxWithheld)}`,
      `  Box 3  Social security wages:       ${money(w.box3_socialSecurityWages)}`,
      `  Box 4  Social security tax withheld:${money(w.box4_socialSecurityTaxWithheld).padStart(12)}`,
      `  Box 5  Medicare wages and tips:     ${money(w.box5_medicareWages)}`,
      `  Box 6  Medicare tax withheld:       ${money(w.box6_medicareTaxWithheld)}`,
      ...(w.box10_dependentCareBenefits ? [`  Box 10 Dependent care benefits:     ${money(w.box10_dependentCareBenefits)}`] : []),
      ...w.box12.map((b) => `  Box 12 Code ${b.code.padEnd(2)}:                      ${money(b.amount)}`),
      ...w.box15to17_state.map((s) => `  Boxes 15-17 State ${s.state}: wages ${money(s.wages)}, tax withheld ${money(s.incomeTaxWithheld)}`),
      ...w.box18to20_local.map((l) => `  Boxes 18-20 Local "${l.localityLabel}": wages ${money(l.wages)}, tax withheld ${money(l.incomeTaxWithheld)}`),
      '',
    );
  });
  lines.push(
    'W-3 totals (BSO generates the W-3 from your W-2s; these should agree with it):',
    `  Box c  Number of W-2s:      ${w3.totalForms}`,
    `  Box 1  Wages:               ${money(w3.box1_wages)}`,
    `  Box 2  Federal tax:         ${money(w3.box2_federalIncomeTaxWithheld)}`,
    `  Box 3  SS wages:            ${money(w3.box3_socialSecurityWages)}`,
    `  Box 4  SS tax:              ${money(w3.box4_socialSecurityTaxWithheld)}`,
    `  Box 5  Medicare wages:      ${money(w3.box5_medicareWages)}`,
    `  Box 6  Medicare tax:        ${money(w3.box6_medicareTaxWithheld)}`,
    '',
    'Before you submit: reconcile boxes 2, 3, 5 and 7 and the box 4 / 6 taxes with your four Forms 941 (see reconcileW3With941).',
    'Furnish Copies B, C and 2 to each employee by the same due date; those may be printed on plain paper from the IRS site.',
  );
  if (findings.length) lines.push('', 'Review:', ...findings.map((f) => `  [${f.severity}] ${f.code}: ${f.message}`));
  return { year, route, mustEfile, text: lines.join('\n'), w3, findings, usable: !findings.some((f) => f.severity === 'error') };
}
