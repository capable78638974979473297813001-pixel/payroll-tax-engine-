import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
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
}

function emptyDb(): DB {
  return { companies: {}, employees: {}, payRuns: {} };
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
