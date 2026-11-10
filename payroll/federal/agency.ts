import { createHash } from 'node:crypto';
import { fmt, type Cents } from '../../src/money.ts';
import { addDays, isBusinessDay } from './calendar.ts';
import type { DepositObligation, ObligationStatus } from './deposits.ts';
import type { Finding } from './form941.ts';

/**
 * The FEDERAL AGENCY layer: who a filing goes to, how, what stands between this
 * code and a live connection, and the lifecycle a filing passes through from
 * draft to the agency's acknowledgement.
 *
 * HONESTY BOUNDARY (same discipline as paymentRun.ts and embeddedProvider.ts).
 * A live connection to the IRS or SSA is not a missing function; it is an
 * enrollment. This module therefore:
 *   - builds, validates, approves, freezes and audits every filing;
 *   - rehearses submission against a sandbox transport that says plainly it
 *     transmitted nothing;
 *   - has the three live transports refuse, naming exactly what the operator
 *     must obtain first, rather than guess an interface it cannot test.
 * Nothing here ever reports a filing as transmitted, accepted or paid unless a
 * transport returns that. `status: 'rehearsed'` is not a filing.
 *
 * Where the specs stand (verified when this module was written):
 *   - IRS 94x MeF schemas: distributed only through the e-Services Registered
 *     User Portal / Secure Object Repository mailbox to a registered software
 *     developer ("you must have an active e-Services account and be listed on an
 *     e-file application with the provider option of software developer"). They
 *     are not publicly retrievable, so the XML mapping cannot be written or
 *     schema-checked from here. The line values it would fill are in
 *     Form941.fields / Form940.fields.
 *   - SSA EFW2 / EFW2C file specification: published at SSA.gov/employer; the
 *     site refuses automated retrieval (HTTP 403), so the W-2 wage-file layout is
 *     likewise not generated here.
 */

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export type FederalChannelId = 'irs_mef_94x' | 'irs_eft_deposit' | 'ssa_bso_w2';
/** A state channel, e.g. `state:CA:e_services`; defined by that state's profile (payroll/state/agency.ts). */
export type StateChannelId = `state:${string}`;
export type ChannelId = FederalChannelId | StateChannelId;
/** 'IRS' or 'SSA' for the federal channels; a two-letter state code for state channels. */
export type AgencyId = string;

export interface SourceRef {
  title: string;
  url: string;
}

export interface SpecStatus {
  name: string;
  /** Whether this repository can read the specification to build against it. 'not_read' means nobody has tried yet (state profiles). */
  availability: 'public' | 'registered_developers_only' | 'blocks_automated_access' | 'not_read';
  note: string;
}

export interface AgencyChannel {
  id: ChannelId;
  agencyId: AgencyId;
  agency: string;
  purpose: string;
  forms: string[];
  /** What an operator must have in place before a live transport can be written or used. */
  enrollment: string[];
  specs: SpecStatus[];
  /** When the channel is mandatory, per the agency's own instructions. */
  mandate?: string;
  sources: SourceRef[];
}

export const FEDERAL_CHANNELS: readonly AgencyChannel[] = [
  {
    id: 'irs_mef_94x',
    agencyId: 'IRS',
    agency: 'Internal Revenue Service',
    purpose: 'E-file the employment tax returns',
    forms: ['941', 'Schedule B (941)', '940', 'Schedule A (940)', '941-X'],
    enrollment: [
      'An IRS e-Services account.',
      'An e-file application listing the provider option "software developer"; your role on it must be principal, responsible official, or a delegated user with MeF authorities.',
      'Assurance Testing System (ATS) testing for the tax year\'s 94x forms before production transmission.',
      'Receipt of the tax year\'s 94x schema and business-rules package from the e-Services mailbox (Secure Object Repository).',
    ],
    specs: [
      {
        name: 'Tax year 2026 94x MeF schemas and business rules',
        availability: 'registered_developers_only',
        note: 'Distributed through the e-Services Registered User Portal and the SOR mailbox, not published for download.',
      },
    ],
    sources: [
      { title: 'Schemas and business rules for employment tax MeF forms', url: 'https://www.irs.gov/e-file-providers/schemas-and-business-rules-for-employment-tax-modernized-e-file-mef-forms' },
      { title: 'Release memo, 94xX quarterly forms 2026Q1-Q4v4.0', url: 'https://www.irs.gov/e-file-providers/94xx-ty2026q1-q4v40-release-memo-0' },
    ],
  },
  {
    id: 'irs_eft_deposit',
    agencyId: 'IRS',
    agency: 'Internal Revenue Service / Treasury (EFTPS)',
    purpose: 'Make federal tax deposits by electronic funds transfer',
    forms: ['941 deposits', '940 deposits', '941 balance due'],
    enrollment: [
      'EFTPS enrollment (EFTPS.gov), or use of IRS Direct Pay, or the IRS business tax account - Pub. 15: an EFT "can be made using EFTPS, IRS Direct Pay, or your IRS business tax account."',
      'Or a third party (payroll service, tax professional, financial institution) that makes the deposits on your behalf and returns the EFT Trace Number for each.',
    ],
    specs: [{ name: 'EFTPS payment instructions', availability: 'public', note: 'Pub. 15 section 11 states the cutoffs, which instructions below encode.' }],
    mandate: 'You must use EFT for all federal tax deposits (Pub. 15, "Electronic deposit requirement").',
    sources: [{ title: 'Publication 15 (2026), section 11 - How To Deposit', url: 'https://www.irs.gov/pub/irs-pdf/p15.pdf' }],
  },
  {
    id: 'ssa_bso_w2',
    agencyId: 'SSA',
    agency: 'Social Security Administration',
    purpose: 'File Forms W-2 and W-3 (and W-2c / W-3c corrections)',
    forms: ['W-2', 'W-3', 'W-2c', 'W-3c'],
    enrollment: [
      'Business Services Online (BSO) registration at SSA.gov/bso; the W-2/W-3 instructions say to allow at least 2 weeks and that credentials not updated since March 25, 2023 must be renewed.',
      'Since 2026-11-07 BSO Electronic Wage Reporting uses a new authorization process (SSA\'s BSO page, read 2026-11-10): organizations that used the earlier process must re-register under Employers, "Sign in or create account for Electronic Wage Reporting", unless they received a registration code by mail in the January 2026 limited release; registration codes are mailed, so register well before a filing deadline. It covers W-2 and W-2c Online, Wage File Upload, Submission Status, Employer Report Status, AccuWage Online and the wage-report name/SSN errors view; SSNVS is unaffected.',
      'For more than 50 W-2s (or 25 W-2c), the BSO "file upload" feature takes a wage file built to the EFW2 / EFW2C specification (SSA.gov/employer/EFW2&EFW2C.htm).',
      'For 50 or fewer W-2s, BSO\'s online forms need no wage file; they take the W-2 figures this module produces.',
    ],
    specs: [
      {
        name: 'EFW2 / EFW2C wage file specification',
        availability: 'blocks_automated_access',
        note: 'Published by the SSA; its site returned HTTP 403 to automated retrieval, so the file layout is not generated here.',
      },
    ],
    mandate: 'You must e-file W-2s if you must file at least 10 information returns in total across W-2s, the 1099 series, 1095s, 1098s and the other forms the instructions list.',
    sources: [{ title: 'General Instructions for Forms W-2 and W-3 (2026) - E-filing', url: 'https://www.irs.gov/pub/irs-pdf/iw2w3.pdf' }],
  },
];

const registered = new Map<string, AgencyChannel>();

/** Add a channel defined elsewhere (state profiles register theirs). Replaces a channel with the same id. */
export function registerChannel(c: AgencyChannel): void {
  registered.set(c.id, c);
}

export function channel(id: ChannelId): AgencyChannel {
  const c = FEDERAL_CHANNELS.find((x) => x.id === id) ?? registered.get(id);
  if (!c) throw new Error(`Unknown channel ${id}`);
  return c;
}

/** Whether the W-2 e-file mandate applies (SSA: at least 10 information returns in the year). */
export function mustEfileW2(w2Count: number, otherInformationReturns = 0): boolean {
  return w2Count + otherInformationReturns >= 10;
}

/** Which SSA route fits a W-2 volume (BSO online forms up to 50 W-2s, file upload above). */
export function ssaBsoRoute(w2Count: number): 'bso_online_forms' | 'bso_file_upload' {
  return w2Count <= 50 ? 'bso_online_forms' : 'bso_file_upload';
}

// ---------------------------------------------------------------------------
// Filing packages and the lifecycle
// ---------------------------------------------------------------------------

export type FilingKind = 'form941' | 'form940' | 'w2_w3' | 'deposit' | 'state_return' | 'state_deposit' | 'state_new_hire';

export interface FilingPackage {
  id: string;
  kind: FilingKind;
  channelId: ChannelId;
  ein: string;
  /** e.g. "2026-Q3", "2026". */
  period: string;
  /** The fully computed return/record; frozen by `checksum`. */
  payload: unknown;
  /** The line values an e-file mapping fills in. */
  fields: Record<string, unknown>;
  findings: Finding[];
  /** SHA-256 over a canonical serialization of payload + fields. Changes if the figures change. */
  checksum: string;
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function packageChecksum(payload: unknown, fields: Record<string, unknown>): string {
  return createHash('sha256').update(canonical({ payload, fields })).digest('hex');
}

export function makePackage(args: {
  kind: FilingKind;
  ein: string;
  period: string;
  payload: unknown;
  fields: Record<string, unknown>;
  findings: Finding[];
  /** Required for state kinds (the state profile's channel id); federal kinds derive theirs. */
  channelId?: ChannelId;
}): FilingPackage {
  const { channelId: given, ...rest } = args;
  const channelId: ChannelId =
    given ?? (args.kind === 'w2_w3' ? 'ssa_bso_w2' : args.kind === 'deposit' ? 'irs_eft_deposit' : 'irs_mef_94x');
  if (args.kind.startsWith('state_') && !given) throw new Error(`A ${args.kind} filing needs the state channel id it goes through.`);
  const checksum = packageChecksum(args.payload, args.fields);
  return { id: `${args.kind}:${args.ein}:${args.period}:${checksum.slice(0, 12)}`, channelId, checksum, ...rest };
}

export type FilingStatus =
  | 'draft' // has blocking errors
  | 'validated' // no errors; awaiting a responsible person
  | 'approved' // signed off, frozen, ready to send
  | 'rehearsed' // run through the sandbox: NOT a filing
  | 'transmitted' // handed to the agency by a live transport; no acknowledgement yet
  | 'accepted'
  | 'rejected'
  | 'superseded';

export interface FilingEvent {
  at: string;
  status: FilingStatus;
  actor: string;
  note?: string;
}

export interface Approver {
  name: string;
  /** Form 941 Part 5 / 940 Part 7: who may sign (owner, officer, trustee ...). */
  title: string;
}

export interface Receipt {
  transport: string;
  mode: 'sandbox' | 'live';
  /** True only if the agency actually received it. */
  transmitted: boolean;
  /** Set by the agency's acknowledgement, never by this code. */
  accepted?: boolean;
  confirmation?: string;
  rejections?: { code: string; message: string }[];
  note: string;
}

export interface FilingRecord {
  id: string;
  package: FilingPackage;
  status: FilingStatus;
  approver?: Approver;
  receipt?: Receipt;
  supersedes?: string;
  events: FilingEvent[];
}

export interface FilingTransport {
  id: string;
  channelId: ChannelId;
  mode: 'sandbox' | 'live';
  /**
   * Whether this transport can actually deliver. The sandbox always can (it
   * delivers to nowhere and says so); a live transport is connected only once
   * its enrollment is done and its adapter exists. Readiness reporting trusts
   * this flag, so a stub that refuses must say false.
   */
  connected: boolean;
  submit(pkg: FilingPackage): Promise<Receipt>;
}

export class AgencyNotConnectedError extends Error {
  readonly channelId: ChannelId;
  readonly prerequisites: string[];
  constructor(channelId: ChannelId) {
    const c = channel(channelId);
    super(
      `The ${c.agency} connection (${channelId}) is not set up. A live transport needs: ${c.enrollment.join(' ')} ` +
        `Specification status: ${c.specs.map((s) => `${s.name} - ${s.availability.replace(/_/g, ' ')}`).join('; ')}. ` +
        'Until then use the sandbox transport, which rehearses a filing and transmits nothing.',
    );
    this.name = 'AgencyNotConnectedError';
    this.channelId = channelId;
    this.prerequisites = c.enrollment;
  }
}

/** The honest default: accepts the package, checks it is whole, and says nothing was sent. */
export function sandboxTransport(channelId: ChannelId): FilingTransport {
  return {
    id: `sandbox:${channelId}`,
    channelId,
    mode: 'sandbox',
    connected: true,
    async submit(pkg) {
      return {
        transport: `sandbox:${channelId}`,
        mode: 'sandbox',
        transmitted: false,
        confirmation: `SANDBOX-${pkg.checksum.slice(0, 10).toUpperCase()}`,
        note: `REHEARSAL ONLY. Nothing was transmitted to the ${channel(channelId).agency}; this is not a filing and no confirmation from the agency exists.`,
      };
    },
  };
}

/** The live transports exist so callers can resolve them by channel; each refuses until its enrollment is done. */
export function liveTransport(channelId: ChannelId): FilingTransport {
  return {
    id: `live:${channelId}`,
    channelId,
    mode: 'live',
    connected: false,
    async submit() {
      throw new AgencyNotConnectedError(channelId);
    },
  };
}

export class FilingBook {
  private readonly records = new Map<string, FilingRecord>();
  private readonly now: () => string;

  constructor(options: { now?: () => string } = {}) {
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private event(rec: FilingRecord, status: FilingStatus, actor: string, note?: string): void {
    rec.status = status;
    rec.events.push({ at: this.now(), status, actor, note });
  }

  get(id: string): FilingRecord {
    const rec = this.records.get(id);
    if (!rec) throw new Error(`No filing ${id}`);
    return rec;
  }

  list(): FilingRecord[] {
    return [...this.records.values()];
  }

  /**
   * Add a package. It starts as 'draft' when it carries errors and 'validated'
   * when it does not. A package for a period that already has an accepted
   * filing is recorded as the amendment that will supersede it once accepted.
   */
  add(pkg: FilingPackage, actor = 'system'): FilingRecord {
    if (this.records.has(pkg.id)) return this.records.get(pkg.id)!;
    const prior = this.list().find((r) => r.package.kind === pkg.kind && r.package.ein === pkg.ein && r.package.period === pkg.period && r.status === 'accepted');
    const rec: FilingRecord = { id: pkg.id, package: pkg, status: 'draft', events: [], supersedes: prior?.id };
    const errors = pkg.findings.filter((f) => f.severity === 'error');
    this.event(rec, errors.length ? 'draft' : 'validated', actor, errors.length ? `${errors.length} error(s): ${errors.map((e) => e.code).join(', ')}` : 'No blocking findings.');
    this.records.set(rec.id, rec);
    return rec;
  }

  private assertIntact(rec: FilingRecord): void {
    const now = packageChecksum(rec.package.payload, rec.package.fields);
    if (now !== rec.package.checksum) {
      throw new Error(`Filing ${rec.id}: the figures changed after the package was built (checksum mismatch). Rebuild the package and approve it again.`);
    }
  }

  /** A responsible person signs off. Refused while any error stands, or if the figures changed. */
  approve(id: string, approver: Approver): FilingRecord {
    const rec = this.get(id);
    if (rec.status !== 'validated') throw new Error(`Filing ${id} is ${rec.status}; only a validated filing can be approved.`);
    if (!approver.name.trim() || !approver.title.trim()) throw new Error('Approval needs the signer\'s name and title.');
    this.assertIntact(rec);
    rec.approver = approver;
    this.event(rec, 'approved', approver.name, `Approved by ${approver.name}, ${approver.title}.`);
    return rec;
  }

  /**
   * Send an approved filing through a transport. A sandbox transport leaves the
   * filing 'rehearsed' (and approved filings can be rehearsed repeatedly); only a
   * live transport that reports `transmitted: true` makes it 'transmitted'. The
   * channel must match, and the figures must not have changed since approval.
   */
  async submit(id: string, transport: FilingTransport, actor = 'system'): Promise<FilingRecord> {
    const rec = this.get(id);
    if (rec.status !== 'approved' && rec.status !== 'rehearsed') {
      throw new Error(`Filing ${id} is ${rec.status}; it must be approved before it can be submitted.`);
    }
    if (transport.channelId !== rec.package.channelId) {
      throw new Error(`Transport ${transport.id} serves ${transport.channelId} but this filing goes through ${rec.package.channelId}.`);
    }
    this.assertIntact(rec);
    const receipt = await transport.submit(rec.package);
    rec.receipt = receipt;
    if (transport.mode === 'sandbox' || !receipt.transmitted) {
      this.event(rec, 'rehearsed', actor, receipt.note);
    } else {
      this.event(rec, 'transmitted', actor, receipt.note);
    }
    return rec;
  }

  /**
   * Record the agency's acknowledgement. Only a filing that was really
   * transmitted can be accepted or rejected, and acceptance supersedes the
   * filing it amends.
   */
  acknowledge(id: string, ack: { accepted: boolean; confirmation?: string; rejections?: { code: string; message: string }[] }, actor = 'agency'): FilingRecord {
    const rec = this.get(id);
    if (rec.status !== 'transmitted') throw new Error(`Filing ${id} is ${rec.status}; an acknowledgement applies only to a transmitted filing.`);
    rec.receipt = { ...rec.receipt!, accepted: ack.accepted, confirmation: ack.confirmation ?? rec.receipt!.confirmation, rejections: ack.rejections };
    this.event(rec, ack.accepted ? 'accepted' : 'rejected', actor, ack.accepted ? `Accepted${ack.confirmation ? ` (${ack.confirmation})` : ''}.` : `Rejected: ${(ack.rejections ?? []).map((r) => `${r.code} ${r.message}`).join('; ') || 'no reason given'}.`);
    if (ack.accepted && rec.supersedes) {
      const old = this.records.get(rec.supersedes);
      if (old && old.status === 'accepted') this.event(old, 'superseded', actor, `Superseded by ${rec.id}.`);
    }
    return rec;
  }
}

// ---------------------------------------------------------------------------
// Paying: the EFTPS instruction
// ---------------------------------------------------------------------------

export interface PaymentInstruction {
  channelId: 'irs_eft_deposit';
  form: '941' | '940';
  ein: string;
  taxPeriod: { year: number; quarter: 1 | 2 | 3 | 4 };
  amount: Cents;
  /** The date the deposit is due (already moved off weekends and holidays). */
  dueDate: string;
  /** The last moment to submit and still be timely, per Pub. 15. */
  submitBy: { date: string; timeEastern: '3:00 p.m.' | '8:00 p.m.'; rule: string };
  /** What this tool will not do. */
  status: 'NOT TRANSMITTED';
  notes: string[];
}

const ONE_MILLION: Cents = 100_000_000;

/**
 * Pub. 15, "Depositing on time": EFTPS accepts same-day payments of $1 million
 * or less if submitted before 3:00 p.m. Eastern on a business day; a payment of
 * more than $1 million must be submitted by 8:00 p.m. Eastern the day before the
 * due date. A third party making the deposit "may have different cutoff times."
 */
export function paymentInstruction(args: {
  form: '941' | '940';
  ein: string;
  year: number;
  quarter: 1 | 2 | 3 | 4;
  amount: Cents;
  dueDate: string;
}): PaymentInstruction {
  const big = args.amount > ONE_MILLION;
  let submitDate = args.dueDate;
  if (big) {
    submitDate = addDays(args.dueDate, -1);
    while (!isBusinessDay(submitDate)) submitDate = addDays(submitDate, -1);
  }
  return {
    channelId: 'irs_eft_deposit',
    form: args.form,
    ein: args.ein,
    taxPeriod: { year: args.year, quarter: args.quarter },
    amount: args.amount,
    dueDate: args.dueDate,
    submitBy: big
      ? { date: submitDate, timeEastern: '8:00 p.m.', rule: 'More than $1,000,000: submit by 8:00 p.m. Eastern the business day before the due date.' }
      : { date: submitDate, timeEastern: '3:00 p.m.', rule: '$1,000,000 or less: same-day payment if submitted before 3:00 p.m. Eastern on a business day.' },
    status: 'NOT TRANSMITTED',
    notes: [
      `Designate the payment to the ${args.year} quarter ${args.quarter} tax period for Form ${args.form}; the IRS applies a deposit within that quarter (Pub. 15).`,
      'Keep the EFT Trace Number EFTPS returns for each payment; it is the receipt.',
      'A third party making the deposit may have earlier cutoffs.',
      'If a deposit is missed, a same-day wire through the Federal Tax Collection Service is the fallback (arranged in advance with a financial institution).',
    ],
  };
}

// ---------------------------------------------------------------------------
// The compliance calendar
// ---------------------------------------------------------------------------

export type CalendarKind = 'deposit' | 'return_941' | 'futa_deposit' | 'return_940' | 'w2_w3';
export type Urgency = 'done' | 'overdue' | 'due_today' | 'due_soon' | 'upcoming';

export interface CalendarItem {
  kind: CalendarKind;
  title: string;
  dueDate: string;
  amount?: Cents;
  urgency: Urgency;
  detail: string;
  /** The filing record or obligation this item tracks. */
  ref?: string;
}

function daysUntil(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function urgencyFor(today: string, due: string, done: boolean): Urgency {
  if (done) return 'done';
  const d = daysUntil(today, due);
  if (d < 0) return 'overdue';
  if (d === 0) return 'due_today';
  if (d <= 7) return 'due_soon';
  return 'upcoming';
}

const URGENCY_ORDER: Record<Urgency, number> = { overdue: 0, due_today: 1, due_soon: 2, upcoming: 3, done: 4 };

/**
 * One list of everything the employer owes the federal government and its
 * state: overdue first, then by date. Deposits come from the reconciliation
 * (so a paid deposit is "done" and a short one is not), returns from the filing
 * book (a return is done when accepted - or transmitted, awaiting
 * acknowledgement - never merely because a draft exists).
 */
export function federalCalendar(args: {
  today: string;
  ein: string;
  depositStatuses?: readonly ObligationStatus[];
  futaDeposits?: readonly { quarter: 1 | 2 | 3 | 4; amount: Cents; dueDate: string; paid: boolean }[];
  returns?: readonly { kind: 'return_941' | 'return_940' | 'w2_w3'; title: string; dueDate: string; filingId?: string }[];
  book?: FilingBook;
}): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const s of args.depositStatuses ?? []) {
    const o: DepositObligation = s.obligation;
    const done = s.state === 'paid_on_time' || s.state === 'paid_late';
    items.push({
      kind: 'deposit',
      title: `Federal tax deposit for ${o.payDates.join(', ')}`,
      dueDate: o.dueDate,
      amount: o.amountDue,
      urgency: urgencyFor(args.today, o.dueDate, done && s.shortfall === 0),
      detail:
        s.shortfall > 0
          ? `${fmt(s.shortfall)} outstanding (${s.state.replace('_', ' ')}${s.daysLate ? `, ${s.daysLate} day(s) late, est. penalty ${fmt(s.estimatedPenalty)}` : ''}).`
          : `${o.rule === 'next_day' ? '$100,000 next-day rule. ' : ''}${s.state.replace(/_/g, ' ')}.`,
      ref: o.id,
    });
  }
  for (const f of args.futaDeposits ?? []) {
    items.push({
      kind: 'futa_deposit',
      title: `FUTA deposit, quarter ${f.quarter}`,
      dueDate: f.dueDate,
      amount: f.amount,
      urgency: urgencyFor(args.today, f.dueDate, f.paid),
      detail: f.paid ? 'Deposited.' : 'Accumulated FUTA tax is over $500.',
    });
  }
  for (const r of args.returns ?? []) {
    const rec = r.filingId ? args.book?.list().find((x) => x.id === r.filingId) : undefined;
    const done = rec?.status === 'accepted' || rec?.status === 'transmitted';
    items.push({
      kind: r.kind,
      title: r.title,
      dueDate: r.dueDate,
      urgency: urgencyFor(args.today, r.dueDate, done),
      detail: rec ? `Filing ${rec.status}${rec.status === 'rehearsed' ? ' (a rehearsal is not a filing)' : ''}.` : 'Not yet prepared.',
      ref: r.filingId,
    });
  }
  return items.sort((a, b) => URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] || a.dueDate.localeCompare(b.dueDate));
}

/** Connection readiness per channel: what is configured and what is still needed. */
export function connectionReadiness(transports: readonly FilingTransport[] = []): {
  channelId: ChannelId;
  agency: string;
  mode: 'none' | 'sandbox' | 'live';
  missing: string[];
}[] {
  return FEDERAL_CHANNELS.map((c) => {
    const mine = transports.filter((t) => t.channelId === c.id && t.connected);
    const mode = mine.some((t) => t.mode === 'live') ? 'live' : mine.some((t) => t.mode === 'sandbox') ? 'sandbox' : 'none';
    return { channelId: c.id, agency: c.agency, mode, missing: mode === 'live' ? [] : c.enrollment };
  });
}

