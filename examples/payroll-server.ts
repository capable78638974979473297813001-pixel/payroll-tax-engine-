import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { dollars } from '../src/money.ts';
import {
  activeEmployeesFor,
  approvePayRun,
  computeForm941,
  computeW2FromEmployee,
  draftPayRun,
  freshYearToDate,
  generatePayPeriods,
  renderPaystubText,
} from '../payroll/index.ts';
import {
  employeesForCompany,
  getCompany,
  getEmployee,
  getPayRun,
  payRunsForCompany,
  saveCompany,
  saveEmployees,
  savePayRun,
} from '../payroll/store.ts';
import type { Company, Employee } from '../payroll/types.ts';

/**
 * A small admin UI for running payroll — the piece README.md's own
 * Payroll processing section names as still missing ("any UI beyond the
 * plain-text paystub and the worked demo script"). Backed directly by
 * payroll/store.ts, the same file-backed store the demo script bypasses
 * by building everything in memory; this is what a real session of
 * "open the app, click run payroll" looks like against it.
 *
 *   npm run ui:payroll
 *   then open http://localhost:4323
 *
 * On first run, with an empty store, this seeds one demo company (the
 * same Riverside Bakery / Alice+Bob data examples/payroll-demo.ts builds
 * in memory) so there's something to click on immediately.
 */

const PORT = Number(process.env.PORT ?? 4323);
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(HERE, 'payroll-ui.html');

function seedDemoDataIfEmpty(): void {
  const existing = getCompany('co-demo');
  if (existing) return;

  const company: Company = {
    id: 'co-demo',
    legalName: 'Riverside Bakery LLC',
    ein: '84-1234567',
    homeState: 'IL',
    paySchedule: { frequency: 'biweekly', anchorPeriodStart: '2026-01-04', checkDateLagDays: 5 },
  };
  const alice: Employee = {
    id: 'emp-alice',
    companyId: company.id,
    firstName: 'Alice',
    lastName: 'Nguyen',
    hireDate: '2024-03-01',
    employmentCategory: 'standard',
    payType: { kind: 'salary', annualSalary: dollars(78_000) },
    residenceState: { code: 'IL' },
    federalW4: {
      filingStatus: 'married_joint',
      multipleJobs: false,
      dependentCredit: dollars(2_000),
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    deductionPlans: [
      { id: 'dp-401k', code: '401K', category: 'deferral_401k', amount: { kind: 'percentOfGross', percent: 6 }, active: true },
      { id: 'dp-health', code: 'HEALTH', category: 'section125', amount: { kind: 'flat', cents: dollars(120) }, active: true },
    ],
    directDepositAccounts: [
      { id: 'dd-alice', routingNumber: '021000021', accountNumber: '4441002233', accountType: 'checking', allocation: { kind: 'remainder' } },
    ],
    garnishmentOrders: [],
    ytd: freshYearToDate(),
    ytdYear: 2026,
  };
  const bob: Employee = {
    id: 'emp-bob',
    companyId: company.id,
    firstName: 'Bob',
    lastName: 'Carter',
    hireDate: '2025-07-15',
    employmentCategory: 'standard',
    payType: { kind: 'hourly', hourlyRate: dollars(22) },
    residenceState: { code: 'IL' },
    federalW4: { filingStatus: 'single', multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    deductionPlans: [],
    directDepositAccounts: [
      { id: 'dd-bob-checking', routingNumber: '021000021', accountNumber: '990044556', accountType: 'checking', allocation: { kind: 'remainder' } },
    ],
    garnishmentOrders: [{ id: 'ORDER-1', type: 'child_support', amountOrdered: dollars(150), supportingOtherFamily: false }],
    ytd: freshYearToDate(),
    ytdYear: 2026,
  };

  saveCompany(company);
  saveEmployees([alice, bob]);
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(payload) });
  res.end(payload);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

/** The next period this company's schedule hasn't already run payroll for, found by walking its own calendar rather than assuming "today". */
function nextUnrunPeriod(company: Company): { periodStart: string; periodEnd: string; checkDate: string } | null {
  const runs = payRunsForCompany(company.id).filter((r) => r.status !== 'voided');
  const ranCheckDates = new Set(runs.map((r) => r.checkDate));
  for (const year of [2026, 2027]) {
    for (const period of generatePayPeriods(company.paySchedule, year)) {
      if (!ranCheckDates.has(period.checkDate)) return period;
    }
  }
  return null;
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(HTML_PATH, 'utf8'));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/companies') {
      const company = getCompany('co-demo')!;
      sendJson(res, 200, { companies: [company] });
      return;
    }

    const employeesMatch = req.url?.match(/^\/api\/companies\/([^/]+)\/employees$/);
    if (req.method === 'GET' && employeesMatch) {
      sendJson(res, 200, { employees: employeesForCompany(decodeURIComponent(employeesMatch[1])) });
      return;
    }

    const runsMatch = req.url?.match(/^\/api\/companies\/([^/]+)\/pay-runs$/);
    if (req.method === 'GET' && runsMatch) {
      sendJson(res, 200, { payRuns: payRunsForCompany(decodeURIComponent(runsMatch[1])) });
      return;
    }

    const nextPeriodMatch = req.url?.match(/^\/api\/companies\/([^/]+)\/next-period$/);
    if (req.method === 'GET' && nextPeriodMatch) {
      const company = getCompany(decodeURIComponent(nextPeriodMatch[1]));
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      sendJson(res, 200, { period: nextUnrunPeriod(company) });
      return;
    }

    const runPayrollMatch = req.url?.match(/^\/api\/companies\/([^/]+)\/run-payroll$/);
    if (req.method === 'POST' && runPayrollMatch) {
      const company = getCompany(decodeURIComponent(runPayrollMatch[1]));
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      const period = nextUnrunPeriod(company);
      if (!period) return sendJson(res, 409, { error: 'No unrun period found on this schedule for 2026-2027.' });

      const employees = employeesForCompany(company.id);
      const active = activeEmployeesFor(company, employees, period.checkDate);
      if (active.length === 0) return sendJson(res, 409, { error: 'No active employees for this period.' });

      // Hourly employees are paid $0 for any period nobody reports hours
      // for — that's the tax engine's own "absent input changes nothing"
      // convention working correctly, not a bug, but it means an admin
      // running payroll from this UI must be able to supply them. The
      // request body is optional so existing salaried-only companies
      // (and every test/demo script that calls this endpoint directly)
      // keep working with no body at all.
      const rawBody = await readBody(req);
      let timeEntries: { employeeId: string; regularHours: number; overtimeHours: number }[] = [];
      if (rawBody) {
        try {
          const parsed = JSON.parse(rawBody) as { timeEntries?: typeof timeEntries };
          timeEntries = parsed.timeEntries ?? [];
        } catch {
          return sendJson(res, 400, { error: 'Request body was not valid JSON.' });
        }
      }

      const draft = draftPayRun(company, employees, period.periodStart, period.periodEnd, period.checkDate, timeEntries);
      const { run: approved, updatedEmployees } = approvePayRun(draft, employees);
      saveEmployees(updatedEmployees);
      savePayRun(approved);
      sendJson(res, 200, { payRun: approved });
      return;
    }

    const paystubMatch = req.url?.match(/^\/api\/pay-runs\/([^/]+)\/paystub\/([^/]+)$/);
    if (req.method === 'GET' && paystubMatch) {
      const run = getPayRun(decodeURIComponent(paystubMatch[1]));
      const employeeId = decodeURIComponent(paystubMatch[2]);
      if (!run) return sendJson(res, 404, { error: 'No such pay run.' });
      const company = getCompany(run.companyId);
      const employee = getEmployee(employeeId);
      const line = run.lines.find((l) => l.employeeId === employeeId);
      if (!company || !employee || !line) return sendJson(res, 404, { error: 'No such paystub.' });
      const text = renderPaystubText(company, employee, run, line);
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(text);
      return;
    }

    const url = new URL(req.url ?? '/', 'http://localhost');

    const form941Match = url.pathname.match(/^\/api\/companies\/([^/]+)\/941$/);
    if (req.method === 'GET' && form941Match) {
      const companyId = decodeURIComponent(form941Match[1]);
      const year = Number(url.searchParams.get('year'));
      const quarter = Number(url.searchParams.get('quarter')) as 1 | 2 | 3 | 4;
      if (!year || ![1, 2, 3, 4].includes(quarter)) return sendJson(res, 400, { error: 'year and quarter (1-4) are required.' });
      const runs = payRunsForCompany(companyId);
      sendJson(res, 200, { form941: computeForm941(companyId, year, quarter, runs) });
      return;
    }

    const w2Match = url.pathname.match(/^\/api\/employees\/([^/]+)\/w2$/);
    if (req.method === 'GET' && w2Match) {
      const employee = getEmployee(decodeURIComponent(w2Match[1]));
      const year = Number(url.searchParams.get('year'));
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      if (!year) return sendJson(res, 400, { error: 'year is required.' });
      const runs = payRunsForCompany(employee.companyId);
      sendJson(res, 200, { w2: computeW2FromEmployee(employee, year, runs) });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

seedDemoDataIfEmpty();
server.listen(PORT, () => {
  console.log(`Payroll admin UI: http://localhost:${PORT}`);
});
