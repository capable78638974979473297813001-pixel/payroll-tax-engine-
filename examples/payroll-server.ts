import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { randomUUID } from 'node:crypto';
import { dollars } from '../src/money.ts';
import {
  accruePto,
  activeEmployeesFor,
  advanceCandidate,
  acceptOffer,
  approvePayRun,
  classifyWeeklyHours,
  computeForm940,
  computeForm941,
  computeW2FromEmployee,
  declineOffer,
  applyElection,
  draftPayRun,
  emptyPtoBalance,
  extendOffer,
  freshYearToDate,
  generatePayPeriods,
  hireCandidate,
  overtimeRuleForState,
  pairPunchesIntoDailyHours,
  renderPaystubText,
  terminateEmployee,
  usePto,
} from '../payroll/index.ts';
import type { BenefitPlan, CoverageTier } from '../payroll/benefits.ts';
import type { Candidate, CandidateStage, OfferDetails } from '../payroll/onboarding.ts';
import type { TerminationReason } from '../payroll/termination.ts';
import {
  addTimePunch,
  benefitElectionsForEmployee,
  benefitPlansForCompany,
  candidatesForCompany,
  employeesForCompany,
  getBenefitPlan,
  getCandidate,
  getCompany,
  getEmployee,
  getPayRun,
  getPtoBalance,
  getPtoPolicy,
  jobPostingsForCompany,
  payRunsForCompany,
  ptoBalancesForEmployee,
  ptoPoliciesForCompany,
  saveBenefitElection,
  saveBenefitPlan,
  saveCandidate,
  saveCompany,
  saveEmployee,
  saveEmployees,
  saveJobPosting,
  savePayRun,
  savePtoBalance,
  savePtoPolicy,
  timePunchesForEmployee,
} from '../payroll/store.ts';
import { PERIODS_PER_YEAR } from '../src/types.ts';
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

class BadJsonError extends Error {}

async function parseJsonBody<T>(req: IncomingMessage): Promise<T> {
  const raw = await readBody(req);
  try {
    return raw ? (JSON.parse(raw) as T) : ({} as T);
  } catch {
    throw new BadJsonError('Request body was not valid JSON.');
  }
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

/**
 * "The next regular payday" a departing employee would have been paid on
 * — a DIFFERENT question from nextUnrunPeriod() above, which tracks
 * where the payroll-RUN workflow left off regardless of what date it is
 * today. A termination on June 15th needs the payday on or after June
 * 15th, not "whichever period this demo company hasn't gotten around to
 * running yet" (which could be much earlier, if payroll runs are behind).
 */
function nextPayDateOnOrAfter(company: Company, date: string): string | null {
  const year = Number(date.slice(0, 4));
  for (const y of [year, year + 1]) {
    const onOrAfter = generatePayPeriods(company.paySchedule, y)
      .map((p) => p.checkDate)
      .filter((checkDate) => checkDate >= date)
      .sort();
    if (onOrAfter.length > 0) return onOrAfter[0];
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

    const form940Match = url.pathname.match(/^\/api\/companies\/([^/]+)\/940$/);
    if (req.method === 'GET' && form940Match) {
      const companyId = decodeURIComponent(form940Match[1]);
      const year = Number(url.searchParams.get('year'));
      if (!year) return sendJson(res, 400, { error: 'year is required.' });
      sendJson(res, 200, { form940: computeForm940(companyId, year, payRunsForCompany(companyId)) });
      return;
    }

    // ------------------------------------------------------------------
    // Benefits
    // ------------------------------------------------------------------

    const benefitPlansMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/benefit-plans$/);
    if (req.method === 'GET' && benefitPlansMatch) {
      sendJson(res, 200, { benefitPlans: benefitPlansForCompany(decodeURIComponent(benefitPlansMatch[1])) });
      return;
    }
    if (req.method === 'POST' && benefitPlansMatch) {
      const companyId = decodeURIComponent(benefitPlansMatch[1]);
      const body = await parseJsonBody<Omit<BenefitPlan, 'id' | 'companyId'>>(req);
      const plan: BenefitPlan = { id: randomUUID(), companyId, ...body };
      saveBenefitPlan(plan);
      sendJson(res, 200, { benefitPlan: plan });
      return;
    }

    const electionsMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/benefit-elections$/);
    if (req.method === 'GET' && electionsMatch) {
      sendJson(res, 200, { benefitElections: benefitElectionsForEmployee(decodeURIComponent(electionsMatch[1])) });
      return;
    }
    if (req.method === 'POST' && electionsMatch) {
      const employeeId = decodeURIComponent(electionsMatch[1]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const company = getCompany(employee.companyId)!;
      const body = await parseJsonBody<{ planId: string; coverageTier: CoverageTier; effectiveDate: string }>(req);
      const plan = getBenefitPlan(body.planId);
      if (!plan) return sendJson(res, 404, { error: 'No such benefit plan.' });

      const periodsPerYear = PERIODS_PER_YEAR[company.paySchedule.frequency];
      const result = applyElection(
        employee,
        benefitElectionsForEmployee(employeeId),
        plan,
        body.coverageTier,
        body.effectiveDate,
        periodsPerYear,
      );
      for (const ended of result.endedElections) saveBenefitElection(ended);
      saveBenefitElection(result.election);
      saveEmployee(result.employee);
      sendJson(res, 200, { election: result.election, employee: result.employee });
      return;
    }

    // ------------------------------------------------------------------
    // Recruiting / onboarding
    // ------------------------------------------------------------------

    const jobPostingsMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/job-postings$/);
    if (req.method === 'GET' && jobPostingsMatch) {
      sendJson(res, 200, { jobPostings: jobPostingsForCompany(decodeURIComponent(jobPostingsMatch[1])) });
      return;
    }
    if (req.method === 'POST' && jobPostingsMatch) {
      const companyId = decodeURIComponent(jobPostingsMatch[1]);
      const body = await parseJsonBody<{ title: string; department?: string }>(req);
      const posting = { id: randomUUID(), companyId, title: body.title, department: body.department, openedAt: new Date().toISOString().slice(0, 10) };
      saveJobPosting(posting);
      sendJson(res, 200, { jobPosting: posting });
      return;
    }

    const candidatesMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/candidates$/);
    if (req.method === 'GET' && candidatesMatch) {
      sendJson(res, 200, { candidates: candidatesForCompany(decodeURIComponent(candidatesMatch[1])) });
      return;
    }
    if (req.method === 'POST' && candidatesMatch) {
      const body = await parseJsonBody<{ jobPostingId: string; firstName: string; lastName: string; email: string }>(req);
      const candidate: Candidate = {
        id: randomUUID(),
        jobPostingId: body.jobPostingId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        stage: 'applied',
        appliedAt: new Date().toISOString().slice(0, 10),
      };
      saveCandidate(candidate);
      sendJson(res, 200, { candidate });
      return;
    }

    const candidateActionMatch = url.pathname.match(/^\/api\/candidates\/([^/]+)\/(advance|extend-offer|accept|decline|hire)$/);
    if (req.method === 'POST' && candidateActionMatch) {
      const candidate = getCandidate(decodeURIComponent(candidateActionMatch[1]));
      if (!candidate) return sendJson(res, 404, { error: 'No such candidate.' });
      const action = candidateActionMatch[2];

      if (action === 'advance') {
        const body = await parseJsonBody<{ to: Exclude<CandidateStage, 'offer_extended' | 'hired'> }>(req);
        const updated = advanceCandidate(candidate, body.to);
        saveCandidate(updated);
        return sendJson(res, 200, { candidate: updated });
      }
      if (action === 'extend-offer') {
        const body = await parseJsonBody<{ offer: OfferDetails }>(req);
        const updated = extendOffer(candidate, body.offer);
        saveCandidate(updated);
        return sendJson(res, 200, { candidate: updated });
      }
      if (action === 'accept') {
        const updated = acceptOffer(candidate);
        saveCandidate(updated);
        return sendJson(res, 200, { candidate: updated });
      }
      if (action === 'decline') {
        const updated = declineOffer(candidate);
        saveCandidate(updated);
        return sendJson(res, 200, { candidate: updated });
      }
      // action === 'hire'
      const body = await parseJsonBody<{
        companyId: string;
        federalW4: Employee['federalW4'];
        residenceState: Employee['residenceState'];
      }>(req);
      const { employee, candidate: hired } = hireCandidate(candidate, body.companyId, body.federalW4, body.residenceState);
      saveEmployee(employee);
      saveCandidate(hired);
      sendJson(res, 200, { employee, candidate: hired });
      return;
    }

    // ------------------------------------------------------------------
    // Termination / offboarding
    // ------------------------------------------------------------------

    const terminateMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/terminate$/);
    if (req.method === 'POST' && terminateMatch) {
      const employee = getEmployee(decodeURIComponent(terminateMatch[1]));
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const company = getCompany(employee.companyId)!;
      const body = await parseJsonBody<{
        terminationDate: string;
        reason: TerminationReason;
        employerPolicyPaysOutPto: boolean;
        ptoPolicyId?: string;
      }>(req);

      const nextRegularPayDate = nextPayDateOnOrAfter(company, body.terminationDate) ?? body.terminationDate;
      const ptoBalance = body.ptoPolicyId ? getPtoBalance(employee.id, body.ptoPolicyId) : ptoBalancesForEmployee(employee.id)[0] ?? null;

      const result = terminateEmployee(employee, body.terminationDate, body.reason, nextRegularPayDate, ptoBalance, body.employerPolicyPaysOutPto);
      saveEmployee(result.employee);
      sendJson(res, 200, result);
      return;
    }

    // ------------------------------------------------------------------
    // Time & attendance
    // ------------------------------------------------------------------

    const punchesMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/punches$/);
    if (req.method === 'GET' && punchesMatch) {
      sendJson(res, 200, { punches: timePunchesForEmployee(decodeURIComponent(punchesMatch[1])) });
      return;
    }
    if (req.method === 'POST' && punchesMatch) {
      const employeeId = decodeURIComponent(punchesMatch[1]);
      const body = await parseJsonBody<{ timestamp: string; type: 'clock_in' | 'clock_out' }>(req);
      const punch = { employeeId, timestamp: body.timestamp, type: body.type };
      addTimePunch(punch);
      sendJson(res, 200, { punch });
      return;
    }

    const classifiedHoursMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/classified-hours$/);
    if (req.method === 'GET' && classifiedHoursMatch) {
      const employee = getEmployee(decodeURIComponent(classifiedHoursMatch[1]));
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const company = getCompany(employee.companyId)!;
      const periodStart = url.searchParams.get('periodStart');
      const periodEnd = url.searchParams.get('periodEnd');
      if (!periodStart || !periodEnd) return sendJson(res, 400, { error: 'periodStart and periodEnd are required.' });

      const punches = timePunchesForEmployee(employee.id).filter((p) => {
        const date = p.timestamp.slice(0, 10);
        return date >= periodStart && date <= periodEnd;
      });
      const dailyHours = pairPunchesIntoDailyHours(punches);
      const stateCode = employee.workState?.code ?? company.homeState;
      const classification = classifyWeeklyHours(dailyHours, overtimeRuleForState(stateCode));
      sendJson(res, 200, { dailyHours, classification });
      return;
    }

    // ------------------------------------------------------------------
    // PTO
    // ------------------------------------------------------------------

    const ptoPoliciesMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/pto-policies$/);
    if (req.method === 'GET' && ptoPoliciesMatch) {
      sendJson(res, 200, { ptoPolicies: ptoPoliciesForCompany(decodeURIComponent(ptoPoliciesMatch[1])) });
      return;
    }
    if (req.method === 'POST' && ptoPoliciesMatch) {
      const body = await parseJsonBody<Omit<import('../payroll/pto.ts').PtoPolicy, 'id'>>(req);
      const policy = { id: randomUUID(), ...body };
      savePtoPolicy(policy);
      sendJson(res, 200, { ptoPolicy: policy });
      return;
    }

    const ptoBalancesMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/pto-balances$/);
    if (req.method === 'GET' && ptoBalancesMatch) {
      sendJson(res, 200, { ptoBalances: ptoBalancesForEmployee(decodeURIComponent(ptoBalancesMatch[1])) });
      return;
    }

    const ptoAccrueMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/pto-accrue$/);
    if (req.method === 'POST' && ptoAccrueMatch) {
      const employeeId = decodeURIComponent(ptoAccrueMatch[1]);
      const body = await parseJsonBody<{ policyId: string; hoursWorkedThisPeriod?: number }>(req);
      const policy = getPtoPolicy(body.policyId);
      if (!policy) return sendJson(res, 404, { error: 'No such PTO policy.' });
      const current = getPtoBalance(employeeId, body.policyId) ?? emptyPtoBalance(employeeId, body.policyId);
      const updated = accruePto(current, policy, body.hoursWorkedThisPeriod ?? 0);
      savePtoBalance(updated);
      sendJson(res, 200, { ptoBalance: updated });
      return;
    }

    const ptoUseMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/pto-use$/);
    if (req.method === 'POST' && ptoUseMatch) {
      const employeeId = decodeURIComponent(ptoUseMatch[1]);
      const body = await parseJsonBody<{ policyId: string; hours: number }>(req);
      const current = getPtoBalance(employeeId, body.policyId) ?? emptyPtoBalance(employeeId, body.policyId);
      const result = usePto(current, body.hours);
      if (result.approved) savePtoBalance(result.balance);
      sendJson(res, 200, result);
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    const status = err instanceof BadJsonError ? 400 : 500;
    sendJson(res, status, { error: err instanceof Error ? err.message : String(err) });
  }
});

seedDemoDataIfEmpty();
server.listen(PORT, () => {
  console.log(`Payroll admin UI: http://localhost:${PORT}`);
});
