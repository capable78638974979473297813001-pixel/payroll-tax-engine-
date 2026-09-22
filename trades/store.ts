import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ClockEvent } from './geofence.ts';
import type { Job, TradeWorkerProfile, WageDetermination, WorkedHours } from './types.ts';

/**
 * A file-backed store for the trades-specific records — wage determinations,
 * jobs, worker profiles, and reported hours — the exact same pattern and
 * boundary payroll/store.ts documents: this project's Supabase instance
 * isn't reachable from here, so a JSON file stands in for what db/ describes,
 * and swapping these functions for real queries later is mechanical.
 *
 * It is a SEPARATE file (trades-db.json) from the general payroll store, for
 * the same reason trades/ is a separate layer: most companies on the payroll
 * store never touch prevailing wage, and keeping the trades records apart
 * means the general store carries no columns it doesn't use. The two are
 * joined only by shared ids — a Job.companyId is a payroll Company.id, a
 * TradeWorkerProfile.employeeId is a payroll Employee.id, a WorkedHours row
 * points at both — never by embedding one store's records in the other.
 */

/**
 * Resolved lazily on each call (not once at import) so a test — or a caller
 * that wants an isolated store — can point it elsewhere with TRADES_DB_DIR.
 */
function dataDir(): string {
  return process.env.TRADES_DB_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '.data');
}

function dbFile(): string {
  return join(dataDir(), 'trades-db.json');
}

interface TradesDB {
  determinations: Record<string, WageDetermination>;
  jobs: Record<string, Job>;
  /** Keyed by employeeId — one trades profile per employee. */
  workerProfiles: Record<string, TradeWorkerProfile>;
  /** Append-only log of reported hours; queried by employee, job, and date range. WorkedHours carries no id of its own (it is a fact about a day, not an entity), so this is a flat list, not a keyed map. */
  workedHours: WorkedHours[];
  /** Append-only log of clock punches with their geofence verification (see geofence.ts). */
  clockEvents: ClockEvent[];
}

function emptyDb(): TradesDB {
  return { determinations: {}, jobs: {}, workerProfiles: {}, workedHours: [], clockEvents: [] };
}

function ensureDataDir(): void {
  const dir = dataDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function load(): TradesDB {
  ensureDataDir();
  const file = dbFile();
  if (!existsSync(file)) return emptyDb();
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<TradesDB>;
    const base = emptyDb();
    return {
      determinations: parsed.determinations ?? base.determinations,
      jobs: parsed.jobs ?? base.jobs,
      workerProfiles: parsed.workerProfiles ?? base.workerProfiles,
      workedHours: parsed.workedHours ?? base.workedHours,
      clockEvents: parsed.clockEvents ?? base.clockEvents,
    };
  } catch {
    return emptyDb();
  }
}

function save(db: TradesDB): void {
  ensureDataDir();
  writeFileSync(dbFile(), JSON.stringify(db, null, 2), 'utf8');
}

export function withTradesDb<T>(fn: (db: TradesDB) => T): T {
  const db = load();
  const result = fn(db);
  save(db);
  return result;
}

export function readTradesDb<T>(fn: (db: TradesDB) => T): T {
  return fn(load());
}

// ----------------------------------------------------------------------------
// Wage determinations
// ----------------------------------------------------------------------------

export function saveWageDetermination(determination: WageDetermination): void {
  withTradesDb((db) => {
    db.determinations[determination.id] = determination;
  });
}

export function getWageDetermination(id: string): WageDetermination | null {
  return readTradesDb((db) => db.determinations[id] ?? null);
}

export function allWageDeterminations(): WageDetermination[] {
  return readTradesDb((db) => Object.values(db.determinations));
}

// ----------------------------------------------------------------------------
// Jobs
// ----------------------------------------------------------------------------

export function saveJob(job: Job): void {
  withTradesDb((db) => {
    db.jobs[job.id] = job;
  });
}

export function getJob(id: string): Job | null {
  return readTradesDb((db) => db.jobs[id] ?? null);
}

export function jobsForCompany(companyId: string): Job[] {
  return readTradesDb((db) => Object.values(db.jobs).filter((j) => j.companyId === companyId));
}

// ----------------------------------------------------------------------------
// Worker profiles
// ----------------------------------------------------------------------------

export function saveWorkerProfile(profile: TradeWorkerProfile): void {
  withTradesDb((db) => {
    db.workerProfiles[profile.employeeId] = profile;
  });
}

export function getWorkerProfile(employeeId: string): TradeWorkerProfile | null {
  return readTradesDb((db) => db.workerProfiles[employeeId] ?? null);
}

// ----------------------------------------------------------------------------
// Worked hours
// ----------------------------------------------------------------------------

export function addWorkedHours(entries: readonly WorkedHours[]): void {
  if (entries.length === 0) return;
  withTradesDb((db) => {
    db.workedHours.push(...entries);
  });
}

/** One employee's hours whose date falls in [start, end] inclusive — the set a pay run for that period feeds to the resolver. */
export function workedHoursForEmployeeInRange(employeeId: string, start: string, end: string): WorkedHours[] {
  return readTradesDb((db) =>
    db.workedHours.filter((w) => w.employeeId === employeeId && w.date >= start && w.date <= end),
  );
}

/**
 * Every reported hour in [start, end] for any employee, restricted to a
 * company's own jobs. WorkedHours carries no companyId, so the company link
 * is resolved through each row's job — the same "join through the id the row
 * already has, don't duplicate the column" choice payroll/store.ts makes for
 * benefit elections and PTO requests.
 */
export function workedHoursForCompanyInRange(companyId: string, start: string, end: string): WorkedHours[] {
  return readTradesDb((db) => {
    const companyJobIds = new Set(Object.values(db.jobs).filter((j) => j.companyId === companyId).map((j) => j.id));
    return db.workedHours.filter((w) => w.date >= start && w.date <= end && companyJobIds.has(w.jobId));
  });
}

// ----------------------------------------------------------------------------
// Clock events
// ----------------------------------------------------------------------------

export function addClockEvent(event: ClockEvent): void {
  withTradesDb((db) => {
    db.clockEvents.push(event);
  });
}

/** A company's clock punches whose calendar day (the ISO date prefix of `at`) falls in [startDate, endDate] inclusive — newest first. */
export function clockEventsForCompanyInRange(companyId: string, startDate: string, endDate: string): ClockEvent[] {
  return readTradesDb((db) =>
    db.clockEvents
      .filter((e) => e.companyId === companyId && e.at.slice(0, 10) >= startDate && e.at.slice(0, 10) <= endDate)
      .sort((a, b) => b.at.localeCompare(a.at)),
  );
}
