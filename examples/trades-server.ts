import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

import { dollars } from '../src/money.ts';
import { freshYearToDate } from '../payroll/ytd.ts';
import { saveCompany, saveEmployees } from '../payroll/store.ts';
import type { Company, Employee } from '../payroll/types.ts';
import {
  addWorkedHours,
  approveRunById,
  draftWeeklyTradesRun,
  jobsForCompany,
  saveJob,
  saveWageDetermination,
  saveWorkerProfile,
  weeklyCertifiedPayroll,
  weeklyJobCosts,
  UnknownCompanyError,
  type Job,
  type TradeWorkerProfile,
  type WageDetermination,
  type WorkedHours,
  type WorkersCompRating,
} from '../trades/index.ts';

/**
 * A thin JSON HTTP surface over the trades application service
 * (trades/service.ts) — the endpoints a self-serve UI for a plumbing or
 * electrical shop would call. It holds NO business logic: every route parses
 * a request, calls one service or store function, and serializes the result.
 * The prevailing-wage arithmetic, certified payroll, and job costing all live
 * below the service; this file is transport only.
 *
 *   npm run trades:server
 *   curl -X POST localhost:4325/api/demo/seed         # sample shop + crew + job
 *   curl -X POST localhost:4325/api/companies/shop-1/runs/draft \
 *        -d '{"periodStart":"2026-01-04","periodEnd":"2026-01-10","checkDate":"2026-01-14"}'
 *   curl localhost:4325/api/companies/shop-1/certified-payroll?periodStart=2026-01-04\&periodEnd=2026-01-10\&checkDate=2026-01-14
 */

const PORT = Number(process.env.PORT ?? 4325);

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 2_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    throw new Error('Request body must be valid JSON.');
  }
}

/** A demo plumbing shop, one journeyman, one apprentice, a public and a private job, and a week of hours — enough to exercise every route end to end. */
function seedDemo(): { companyId: string; jobIds: string[]; employeeIds: string[] } {
  const company: Company = {
    id: 'shop-1',
    legalName: 'Rooter Bros LLC',
    ein: '74-1234567',
    homeState: 'TX',
    paySchedule: { frequency: 'weekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 },
  };
  const baseEmployee = (id: string, first: string, rate: number): Employee => ({
    id,
    companyId: 'shop-1',
    firstName: first,
    lastName: 'Crew',
    hireDate: '2025-01-01',
    employmentCategory: 'standard',
    payType: { kind: 'hourly', hourlyRate: dollars(rate) },
    workersCompClassCode: '5183',
    residenceState: { code: 'TX' },
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    deductionPlans: [],
    directDepositAccounts: [],
    garnishmentOrders: [],
    ytd: freshYearToDate(),
    ytdYear: 2026,
  });

  const determination: WageDetermination = {
    id: 'TX20260001',
    authority: 'davis-bacon',
    state: 'TX',
    locality: 'Travis County',
    constructionType: 'building',
    rates: [
      { classificationCode: 'PLUMBER', baseHourlyRateCents: dollars(50), fringePerHourCents: dollars(15), effectiveDate: '2026-01-01' },
      { classificationCode: 'PLUMBER_APPRENTICE', baseHourlyRateCents: dollars(30), fringePerHourCents: dollars(9), effectiveDate: '2026-01-01' },
    ],
  };
  const publicJob: Job = {
    id: 'J1',
    companyId: 'shop-1',
    name: 'Travis County School — building',
    workState: 'TX',
    workLocality: 'Travis County',
    prevailingWage: { determinationId: 'TX20260001', contractNumber: 'DBA-778', projectName: 'Travis County School' },
    workersCompClassCode: '5183',
    glCostCode: '01-100',
  };
  const privateJob: Job = { id: 'J2', companyId: 'shop-1', name: 'Elm St service call', workState: 'TX', workersCompClassCode: '5183', glCostCode: '02-200' };

  const profile: TradeWorkerProfile = {
    employeeId: 'joe',
    classificationRates: [{ classificationCode: 'PLUMBER', baseRateCents: dollars(40) }],
    fringeCredits: [{ plan: 'Health & Welfare', ratePerHourCents: dollars(5) }],
  };

  saveCompany(company);
  saveEmployees([baseEmployee('joe', 'Joe', 30), baseEmployee('amy', 'Amy', 22)]);
  saveWageDetermination(determination);
  saveJob(publicJob);
  saveJob(privateJob);
  saveWorkerProfile(profile);
  addWorkedHours([
    { employeeId: 'joe', jobId: 'J1', date: '2026-01-05', classificationCode: 'PLUMBER', hours: 10 },
    { employeeId: 'joe', jobId: 'J1', date: '2026-01-06', classificationCode: 'PLUMBER', hours: 10 },
    { employeeId: 'joe', jobId: 'J1', date: '2026-01-07', classificationCode: 'PLUMBER', hours: 10 },
    { employeeId: 'joe', jobId: 'J1', date: '2026-01-08', classificationCode: 'PLUMBER', hours: 10 },
    { employeeId: 'joe', jobId: 'J2', date: '2026-01-09', classificationCode: 'SERVICE', hours: 8 },
    { employeeId: 'amy', jobId: 'J1', date: '2026-01-05', classificationCode: 'PLUMBER_APPRENTICE', hours: 8 },
    { employeeId: 'amy', jobId: 'J1', date: '2026-01-06', classificationCode: 'PLUMBER_APPRENTICE', hours: 8 },
  ]);

  return { companyId: 'shop-1', jobIds: ['J1', 'J2'], employeeIds: ['joe', 'amy'] };
}

/** A run request built from a query string or a JSON body sharing the same field names. */
function runRequestFrom(companyId: string, source: Record<string, string | undefined>) {
  return {
    companyId,
    periodStart: source.periodStart ?? '',
    periodEnd: source.periodEnd ?? '',
    checkDate: source.checkDate ?? '',
    weekStartsOn: source.weekStartsOn !== undefined ? Number(source.weekStartsOn) : undefined,
  };
}

/** A run summary that's useful over the wire without dumping every resolved entry. */
function summarizeRun(result: ReturnType<typeof draftWeeklyTradesRun>) {
  return {
    runId: result.run.id,
    status: result.run.status,
    checkDate: result.run.checkDate,
    lines: result.run.lines.map((l) => ({ employeeId: l.employeeId, grossPay: l.grossPay, netPay: l.netPay })),
    adjustments: result.employees.flatMap((e) => e.prevailingWage?.adjustments ?? []),
  };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';
  const params = Object.fromEntries(url.searchParams.entries());

  try {
    if (method === 'POST' && path === '/api/demo/seed') {
      return sendJson(res, 200, seedDemo());
    }
    if (method === 'POST' && path === '/api/determinations') {
      const det = await readJson<WageDetermination>(req);
      saveWageDetermination(det);
      return sendJson(res, 201, { ok: true, id: det.id });
    }
    if (method === 'POST' && path === '/api/jobs') {
      const job = await readJson<Job>(req);
      saveJob(job);
      return sendJson(res, 201, { ok: true, id: job.id });
    }
    if (method === 'POST' && path === '/api/profiles') {
      const profile = await readJson<TradeWorkerProfile>(req);
      saveWorkerProfile(profile);
      return sendJson(res, 201, { ok: true, employeeId: profile.employeeId });
    }
    if (method === 'POST' && path === '/api/hours') {
      const body = await readJson<{ entries: WorkedHours[] }>(req);
      addWorkedHours(body.entries ?? []);
      return sendJson(res, 201, { ok: true, added: body.entries?.length ?? 0 });
    }

    const jobsMatch = path.match(/^\/api\/companies\/([^/]+)\/jobs$/);
    if (method === 'GET' && jobsMatch) {
      return sendJson(res, 200, { jobs: jobsForCompany(decodeURIComponent(jobsMatch[1])) });
    }

    const draftMatch = path.match(/^\/api\/companies\/([^/]+)\/runs\/draft$/);
    if (method === 'POST' && draftMatch) {
      const body = await readJson<Record<string, string>>(req);
      const result = draftWeeklyTradesRun(runRequestFrom(decodeURIComponent(draftMatch[1]), body));
      return sendJson(res, 200, summarizeRun(result));
    }

    const approveMatch = path.match(/^\/api\/runs\/([^/]+)\/approve$/);
    if (method === 'POST' && approveMatch) {
      const approved = approveRunById(decodeURIComponent(approveMatch[1]));
      return sendJson(res, 200, { runId: approved.run.id, status: approved.run.status, employeesUpdated: approved.updatedEmployees.length });
    }

    const cprMatch = path.match(/^\/api\/companies\/([^/]+)\/certified-payroll$/);
    if (method === 'GET' && cprMatch) {
      const reports = weeklyCertifiedPayroll(runRequestFrom(decodeURIComponent(cprMatch[1]), params));
      return sendJson(res, 200, { reports });
    }

    const costsMatch = path.match(/^\/api\/companies\/([^/]+)\/job-costs$/);
    if (method === 'POST' && costsMatch) {
      const body = await readJson<Record<string, string> & { wcRatings?: WorkersCompRating[] }>(req);
      const ratings = new Map((body.wcRatings ?? []).map((r) => [r.classCode, r]));
      const costs = weeklyJobCosts(runRequestFrom(decodeURIComponent(costsMatch[1]), body), ratings);
      return sendJson(res, 200, { jobCosts: costs });
    }

    return sendJson(res, 404, { error: 'Not found' });
  } catch (err) {
    if (err instanceof UnknownCompanyError) return sendJson(res, 404, { error: err.message });
    return sendJson(res, 400, { error: err instanceof Error ? err.message : 'Request failed.' });
  }
});

server.listen(PORT, () => {
  console.log(`Trades payroll API: http://localhost:${PORT}`);
  console.log(`Seed a demo shop:    curl -X POST http://localhost:${PORT}/api/demo/seed`);
});
