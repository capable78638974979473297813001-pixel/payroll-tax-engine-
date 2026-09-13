import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BenefitElection, BenefitPlan } from './benefits.ts';
import type { Contractor, ContractorPayment } from './contractors.ts';
import type { I9Record } from './i9.ts';
import type { Candidate, JobPosting } from './onboarding.ts';
import type { PtoBalance, PtoPolicy } from './pto.ts';
import type { TimePunch } from './timeAndAttendance.ts';
import type { Company, Employee, PayRun } from './types.ts';

/**
 * A file-backed store for companies, employees and pay runs — the same
 * pattern site/lib/store.ts already uses for accounts and API keys, for
 * the same reason stated there: this project's Supabase instance isn't
 * linked to a live URL from this environment, so there's nothing to
 * connect to. db/payroll-schema.sql is the canonical, normalized target
 * this mirrors closely enough (one row per company/employee/pay run, no
 * denormalized blobs beyond what JSON columns in that schema already
 * allow) that swapping these functions for real queries later is
 * mechanical, not a redesign.
 *
 * Same boundary as site/lib/store.ts draws for payment methods: a real
 * system NEVER holds a bank account number in a plain JSON file on disk
 * the way this demo store does (see payroll/directDeposit.ts's own header
 * comment on that same boundary) — this file is the reference
 * implementation of the SHAPE of the data, not a production secret store.
 */

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '.data');

interface DB {
  companies: Record<string, Company>;
  employees: Record<string, Employee>;
  payRuns: Record<string, PayRun>;
  benefitPlans: Record<string, BenefitPlan>;
  benefitElections: Record<string, BenefitElection>;
  jobPostings: Record<string, JobPosting>;
  candidates: Record<string, Candidate>;
  ptoPolicies: Record<string, PtoPolicy>;
  /** Keyed by `${employeeId}:${policyId}` — PtoBalance's own composite key, see db/payroll-schema.sql's pto_balance table. */
  ptoBalances: Record<string, PtoBalance>;
  timePunches: TimePunch[];
  i9Records: Record<string, I9Record>;
  contractors: Record<string, Contractor>;
  contractorPayments: ContractorPayment[];
}

function emptyDb(): DB {
  return {
    companies: {},
    employees: {},
    payRuns: {},
    benefitPlans: {},
    benefitElections: {},
    jobPostings: {},
    candidates: {},
    ptoPolicies: {},
    ptoBalances: {},
    timePunches: [],
    i9Records: {},
    contractors: {},
    contractorPayments: [],
  };
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

const FILE = join(DATA_DIR, 'payroll-db.json');

function load(): DB {
  ensureDataDir();
  if (!existsSync(FILE)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(FILE, 'utf8')) as Partial<DB>;
    const base = emptyDb();
    return {
      companies: parsed.companies ?? base.companies,
      employees: parsed.employees ?? base.employees,
      payRuns: parsed.payRuns ?? base.payRuns,
      benefitPlans: parsed.benefitPlans ?? base.benefitPlans,
      benefitElections: parsed.benefitElections ?? base.benefitElections,
      jobPostings: parsed.jobPostings ?? base.jobPostings,
      candidates: parsed.candidates ?? base.candidates,
      ptoPolicies: parsed.ptoPolicies ?? base.ptoPolicies,
      ptoBalances: parsed.ptoBalances ?? base.ptoBalances,
      timePunches: parsed.timePunches ?? base.timePunches,
      i9Records: parsed.i9Records ?? base.i9Records,
      contractors: parsed.contractors ?? base.contractors,
      contractorPayments: parsed.contractorPayments ?? base.contractorPayments,
    };
  } catch {
    return emptyDb();
  }
}

function save(db: DB): void {
  ensureDataDir();
  writeFileSync(FILE, JSON.stringify(db, null, 2), 'utf8');
}

export function withPayrollDb<T>(fn: (db: DB) => T): T {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

export function readPayrollDb<T>(fn: (db: DB) => T): T {
  return fn(load());
}

export function saveCompany(company: Company): void {
  withPayrollDb((db) => {
    db.companies[company.id] = company;
  });
}

export function getCompany(id: string): Company | null {
  return readPayrollDb((db) => db.companies[id] ?? null);
}

export function allCompanies(): Company[] {
  return readPayrollDb((db) => Object.values(db.companies));
}

export function saveEmployee(employee: Employee): void {
  withPayrollDb((db) => {
    db.employees[employee.id] = employee;
  });
}

export function saveEmployees(employees: readonly Employee[]): void {
  withPayrollDb((db) => {
    for (const e of employees) db.employees[e.id] = e;
  });
}

export function getEmployee(id: string): Employee | null {
  return readPayrollDb((db) => db.employees[id] ?? null);
}

export function employeesForCompany(companyId: string): Employee[] {
  return readPayrollDb((db) => Object.values(db.employees).filter((e) => e.companyId === companyId));
}

export function savePayRun(run: PayRun): void {
  withPayrollDb((db) => {
    db.payRuns[run.id] = run;
  });
}

export function getPayRun(id: string): PayRun | null {
  return readPayrollDb((db) => db.payRuns[id] ?? null);
}

export function payRunsForCompany(companyId: string): PayRun[] {
  return readPayrollDb((db) =>
    Object.values(db.payRuns)
      .filter((r) => r.companyId === companyId)
      .sort((a, b) => a.checkDate.localeCompare(b.checkDate)),
  );
}

// ----------------------------------------------------------------------------
// Benefits
// ----------------------------------------------------------------------------

export function saveBenefitPlan(plan: BenefitPlan): void {
  withPayrollDb((db) => {
    db.benefitPlans[plan.id] = plan;
  });
}

export function benefitPlansForCompany(companyId: string): BenefitPlan[] {
  return readPayrollDb((db) => Object.values(db.benefitPlans).filter((p) => p.companyId === companyId));
}

export function getBenefitPlan(id: string): BenefitPlan | null {
  return readPayrollDb((db) => db.benefitPlans[id] ?? null);
}

export function saveBenefitElection(election: BenefitElection): void {
  withPayrollDb((db) => {
    db.benefitElections[election.id] = election;
  });
}

export function benefitElectionsForEmployee(employeeId: string): BenefitElection[] {
  return readPayrollDb((db) => Object.values(db.benefitElections).filter((e) => e.employeeId === employeeId));
}

// ----------------------------------------------------------------------------
// Recruiting / onboarding
// ----------------------------------------------------------------------------

export function saveJobPosting(posting: JobPosting): void {
  withPayrollDb((db) => {
    db.jobPostings[posting.id] = posting;
  });
}

export function jobPostingsForCompany(companyId: string): JobPosting[] {
  return readPayrollDb((db) => Object.values(db.jobPostings).filter((p) => p.companyId === companyId));
}

export function getJobPosting(id: string): JobPosting | null {
  return readPayrollDb((db) => db.jobPostings[id] ?? null);
}

export function saveCandidate(candidate: Candidate): void {
  withPayrollDb((db) => {
    db.candidates[candidate.id] = candidate;
  });
}

export function getCandidate(id: string): Candidate | null {
  return readPayrollDb((db) => db.candidates[id] ?? null);
}

export function candidatesForJobPosting(jobPostingId: string): Candidate[] {
  return readPayrollDb((db) => Object.values(db.candidates).filter((c) => c.jobPostingId === jobPostingId));
}

export function candidatesForCompany(companyId: string): Candidate[] {
  return readPayrollDb((db) => {
    const postingIds = new Set(Object.values(db.jobPostings).filter((p) => p.companyId === companyId).map((p) => p.id));
    return Object.values(db.candidates).filter((c) => postingIds.has(c.jobPostingId));
  });
}

// ----------------------------------------------------------------------------
// PTO
// ----------------------------------------------------------------------------

export function savePtoPolicy(policy: PtoPolicy): void {
  withPayrollDb((db) => {
    db.ptoPolicies[policy.id] = policy;
  });
}

export function ptoPoliciesForCompany(companyId: string): PtoPolicy[] {
  // PtoPolicy itself carries no companyId (see payroll/pto.ts) — callers
  // key it by their OWN company's known policy ids instead. This helper
  // exists anyway for the common case of one company, one shared policy
  // set, by returning every policy on file; a multi-company deployment
  // built on this store would need to add that column itself, the same
  // "extend the shape when you actually need it" convention this file
  // uses throughout rather than pre-building for a case with no caller yet.
  return readPayrollDb((db) => Object.values(db.ptoPolicies));
}

export function getPtoPolicy(id: string): PtoPolicy | null {
  return readPayrollDb((db) => db.ptoPolicies[id] ?? null);
}

function ptoBalanceKey(employeeId: string, policyId: string): string {
  return `${employeeId}:${policyId}`;
}

export function savePtoBalance(balance: PtoBalance): void {
  withPayrollDb((db) => {
    db.ptoBalances[ptoBalanceKey(balance.employeeId, balance.policyId)] = balance;
  });
}

export function getPtoBalance(employeeId: string, policyId: string): PtoBalance | null {
  return readPayrollDb((db) => db.ptoBalances[ptoBalanceKey(employeeId, policyId)] ?? null);
}

export function ptoBalancesForEmployee(employeeId: string): PtoBalance[] {
  return readPayrollDb((db) => Object.values(db.ptoBalances).filter((b) => b.employeeId === employeeId));
}

// ----------------------------------------------------------------------------
// Time & attendance
// ----------------------------------------------------------------------------

export function addTimePunch(punch: TimePunch): void {
  withPayrollDb((db) => {
    db.timePunches.push(punch);
  });
}

export function timePunchesForEmployee(employeeId: string): TimePunch[] {
  return readPayrollDb((db) => db.timePunches.filter((p) => p.employeeId === employeeId));
}

// ----------------------------------------------------------------------------
// I-9
// ----------------------------------------------------------------------------

export function saveI9Record(record: I9Record): void {
  withPayrollDb((db) => {
    db.i9Records[record.employeeId] = record;
  });
}

export function getI9Record(employeeId: string): I9Record | null {
  return readPayrollDb((db) => db.i9Records[employeeId] ?? null);
}

// ----------------------------------------------------------------------------
// 1099 contractors
// ----------------------------------------------------------------------------

export function saveContractor(contractor: Contractor): void {
  withPayrollDb((db) => {
    db.contractors[contractor.id] = contractor;
  });
}

export function getContractor(id: string): Contractor | null {
  return readPayrollDb((db) => db.contractors[id] ?? null);
}

export function contractorsForCompany(companyId: string): Contractor[] {
  return readPayrollDb((db) => Object.values(db.contractors).filter((c) => c.companyId === companyId));
}

export function saveContractorPayment(payment: ContractorPayment): void {
  withPayrollDb((db) => {
    db.contractorPayments.push(payment);
  });
}

export function paymentsForContractor(contractorId: string): ContractorPayment[] {
  return readPayrollDb((db) => db.contractorPayments.filter((p) => p.contractorId === contractorId));
}
