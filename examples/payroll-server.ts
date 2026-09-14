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
  auditLogEntry,
  advanceCandidate,
  acceptOffer,
  approvePayRun,
  approvePtoRequest,
  cancelPtoRequest,
  classifyWeeklyHours,
  checkStateRegistrationCompliance,
  createPtoRequest,
  denyPtoRequest,
  compute1099Nec,
  computeCompanyReport,
  computeForm940,
  computeForm941,
  computeW2FromEmployee,
  declineOffer,
  applyElection,
  buildOrgChart,
  canElectBenefit,
  checkFmlaEligibility,
  workersCompPremium,
  workersCompSubjectWages,
  accrueCaSickLeaveHours,
  caSickLeaveUseEligibleDate,
  isEligibleToUseCaSickLeave,
  maxUsableCaSickLeaveHours,
  annualElectiveDeferralLimit,
  cappedDeferralForPayPeriod,
  isRothCatchUpRequired,
  remainingElectiveDeferralRoom,
  hsaContributionLimit,
  remainingHsaContributionRoom,
  cappedHsaContributionForPayPeriod,
  remainingHealthFsaRoom,
  cappedHealthFsaContributionForPayPeriod,
  dependentCareFsaLimit,
  remainingDependentCareFsaRoom,
  cappedDependentCareFsaContributionForPayPeriod,
  isWarnCoveredEmployer,
  isPlantClosing,
  isMassLayoff,
  warnNoticeDeadline,
  isWarnNoticeLate,
  isFirstMealPeriodRequired,
  isFirstMealPeriodWaivable,
  isSecondMealPeriodRequired,
  isSecondMealPeriodWaivable,
  restBreaksRequired,
  dailyMealAndRestPremium,
  nyWageNoticeComplianceIssues,
  isNewNoticeRequiredForRateChange,
  estimatedNoticeViolationDamages,
  estimatedWageStatementViolationDamages,
  meetsSalaryLevelRequirement,
  requiresSalaryLevelTest,
  isCaBereavementLeaveEmployerCovered,
  isCaBereavementLeaveEligible,
  caBereavementLeaveCompletionDeadline,
  isCaBereavementLeaveTimely,
  caBereavementDocumentationRequestDeadline,
  caBereavementLeavePaidDays,
  caBereavementLeaveUnpaidDays,
  pumpActCoverageEndDate,
  isWithinPumpActCoveragePeriod,
  mayQualifyForSmallEmployerExemption,
  isPumpBreakPaymentRequired,
  isCompliantPumpingSpace,
  isWithinAwaitingTinGracePeriod,
  isBackupWithholdingRequired,
  backupWithholdingAmount,
  netPaymentAfterBackupWithholding,
  isPwfaCoveredEmployer,
  isPwfaInEffect,
  isPredictableAssessmentAccommodation,
  requiresMedicalDocumentation,
  isCalSaversMandatory,
  calSaversDefaultContributionRate,
  calSaversPenaltyExposure,
  userraReemploymentTier,
  userraApplicationDeadlineDays,
  isWithinCumulativeServiceLimit,
  userraDisabilityReportDeadline,
  isHealthContinuationElectionRequired,
  userraMaxHealthContinuationPremium,
  waitingTimePenaltyDaysLate,
  waitingTimeDailyRate,
  waitingTimePenaltyAmount,
  caWageStatementComplianceIssues,
  caWageStatementPenaltyExposure,
  isIlSecureChoiceMandatory,
  ilSecureChoicePenaltyExposure,
  ilSecureChoiceCureDeadline,
  isOregonSavesMandatory,
  oregonSavesContributionRate,
  oregonSavesPenaltyExposure,
  stateTipCredit,
  tipCreditShortfall,
  isEligibleForTipPool,
  caPayDataReportRequired,
  classifyCaPayBand,
  caPayDataFilingDeadline,
  caPayDataPenaltyExposure,
  miniWarnNoticePeriodDays,
  isNyWarnCoveredEmployer,
  isNyPlantClosing,
  isNyMassLayoff,
  isNjWarnCoveredEmployer,
  isNjWarnTriggered,
  njTotalSeveranceOwed,
  isCaWarnCoveredEmployer,
  isCaWarnTriggered,
  isCaWarnRelocationTriggered,
  miniWarnNoticeDeadline,
  isOrFairWorkWeekCoveredEmployer,
  isOrFairWorkWeekChangeDeMinimis,
  orFairWorkWeekAdditiveChangePay,
  orFairWorkWeekSubtractiveChangePay,
  isOrFairWorkWeekRestPeriodViolation,
  orFairWorkWeekRestPeriodPremiumPay,
  isSecureAutoEnrollmentMandatory,
  isSecureAutoEnrollmentInitialRateValid,
  isSecureAutoEnrollmentCeilingValid,
  secureAutoEnrollmentRateForPlanYear,
  secureAutoEnrollmentWithdrawalDeadline,
  isWithinSecureAutoEnrollmentWithdrawalWindow,
  isWithinIlSecureChoiceCurePeriod,
  isPflEligible,
  nyPflWeeklyBenefit,
  isNjFliEligible,
  njFliWeeklyBenefit,
  njFliRemainingContinuousWeeks,
  njFliRemainingIntermittentDays,
  maPfmlWeeklyBenefit,
  isMaPfmlEligible,
  checkCfraEligibility,
  cfraHoursEntitlement,
  cfraHoursRemaining,
  cfraDesignatedPersonsRemaining,
  isWaPfmlEligible,
  waPfmlWeeklyBenefit,
  compute1095CForEmployee,
  computeComplianceDashboard,
  continuationCoverageEndDate,
  generalNoticeDeadline,
  generalNoticeDeadlineGivenPossibleElectionNotice,
  erisaNoticePenaltyExposure,
  exciseTaxExposure,
  isFairChanceActCoveredEmployer,
  isCriminalHistoryInquiryPermitted,
  fairChanceResponseDeadline,
  fairChanceExtendedResponseDeadline,
  fairChanceDeemedReceivedDate,
  isJobPostingPayScaleRequired,
  salaryHistoryBanPenaltyOwed,
  isNyPayTransparencyRequired,
  nyPayTransparencyPenaltyForViolationNumber,
  coPromotionalNoticeScope,
  coEpewaComplaintDeadline,
  coEpewaTotalPenalty,
  coFamliWeeklyBenefit,
  isCoFamliEligible,
  coFamliMaxWeeksAvailable,
  orPaidLeaveWeeklyBenefit,
  isOrPaidLeaveEligible,
  orPaidLeaveMaxWeeksAvailable,
  ctPaidLeaveWeeklyBenefit,
  isCtPaidLeaveEligible,
  mePfmlWeeklyBenefit,
  isMePfmlEligible,
  isNonCompeteVoidInTotalBanState,
  isCoNonCompeteEnforceable,
  isCoNonSolicitEnforceable,
  coNonSolicitThreshold2026,
  isIlNonCompeteEnforceable,
  isIlNonSolicitEnforceable,
  isWaNonCompeteEnforceable,
  isOrNonCompeteEnforceable,
  depositDeadlineFor,
  determineAleStatus,
  determineDepositorSchedule,
  directHire,
  buildNewHireReport,
  draftPayRun,
  emptyPtoBalance,
  extendOffer,
  fplSafeHarborMonthlyCeiling,
  freshYearToDate,
  generatePayPeriods,
  hireCandidate,
  caseCreationDeadline,
  everifyComplianceIssues,
  i9ComplianceIssues,
  i9Deadlines,
  i9Status,
  initiateMicroDepositVerification,
  initiatePrenoteVerification,
  electionNoticeDeadline,
  isAffordableUnderW2SafeHarbor,
  isCobraApplicable,
  isQualifyingTermination,
  lookbackPeriodQuarters,
  newHireReportingIssuesForCompany,
  nextDayDepositRuleApplies,
  overtimeRuleForState,
  pairPunchesIntoDailyHours,
  ratePayHourlySafeHarborMonthlyCeiling,
  ratePaySalariedSafeHarborMonthlyCeiling,
  recordContractorPayment,
  renderCarrierEligibilityRoster,
  renderGlJournalCsv,
  renderPaystubText,
  renderPayrollRegister,
  resolvePrenoteVerification,
  terminateEmployee,
  usePto,
  verifyMicroDeposits,
} from '../payroll/index.ts';
import type { EmployeeMonthlyHours } from '../payroll/aca.ts';
import type { EmployerCoverageOfferPolicy } from '../payroll/form1095c.ts';
import type { GlAccountMapping } from '../payroll/glExport.ts';
import type { DirectHireInput } from '../payroll/onboarding.ts';
import type { DirectDepositVerification } from '../payroll/directDepositVerification.ts';
import type { StateEmployerRegistration } from '../payroll/types.ts';
import type { BenefitPlan, CoverageTier } from '../payroll/benefits.ts';
import type { Contractor } from '../payroll/contractors.ts';
import type { EverifyCase, EverifyCaseStatus } from '../payroll/everify.ts';
import type { HdhpCoverageTier } from '../payroll/hsaFsaLimits.ts';
import type { NyWageBasisOfPay } from '../payroll/nyWageNotice.ts';
import type { BackupWithholdingPaymentType } from '../payroll/backupWithholding.ts';
import type { CaHourlyRateLine } from '../payroll/caWageStatement.ts';
import type { FairChanceMailingAddressType } from '../payroll/fairChanceAct.ts';
import type { FlsaExemptionCategory } from '../payroll/flsaExemption.ts';
import type { I9Record } from '../payroll/i9.ts';
import type { Candidate, CandidateStage, OfferDetails } from '../payroll/onboarding.ts';
import type { TerminationReason } from '../payroll/termination.ts';
import type { GarnishmentOrder } from '../src/garnishment.ts';
import {
  addAuditLogEntry,
  addTimePunch,
  allCompanies,
  auditLogForEntityIds,
  benefitElectionsForEmployee,
  benefitElectionsForEmployeeIds,
  benefitPlansForCompany,
  candidatesForCompany,
  contractorsForCompany,
  employeesForCompany,
  getBenefitPlan,
  getCandidate,
  getCompany,
  getContractor,
  getDirectDepositVerification,
  getEmployee,
  getEverifyCase,
  getI9Record,
  getPayRun,
  getPtoBalance,
  getPtoPolicy,
  getPtoRequest,
  jobPostingsForCompany,
  markNewHireReportFiled,
  newHireReportFiledEmployeeIds,
  paymentsForContractor,
  payRunsForCompany,
  ptoBalancesForEmployee,
  ptoPoliciesForCompany,
  ptoRequestsForEmployee,
  ptoRequestsForEmployeeIds,
  saveBenefitElection,
  saveBenefitPlan,
  saveCandidate,
  saveCompany,
  saveContractor,
  saveContractorPayment,
  saveDirectDepositVerification,
  saveEmployee,
  saveEmployees,
  saveEverifyCase,
  saveI9Record,
  saveJobPosting,
  savePayRun,
  savePtoBalance,
  savePtoPolicy,
  savePtoRequest,
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
// This demo-scale server has no real login (see payroll/auditLog.ts's own
// header comment on that boundary) — every entry it writes names this
// fixed actor, which a real deployment replaces with its own session user.
const AUDIT_ACTOR = 'admin';
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(HERE, 'payroll-ui.html');
const PORTAL_HTML_PATH = join(HERE, 'employee-portal.html');

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

    if (req.method === 'GET' && req.url === '/portal') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(readFileSync(PORTAL_HTML_PATH, 'utf8'));
      return;
    }

    if (req.method === 'GET' && req.url === '/api/companies') {
      sendJson(res, 200, { companies: allCompanies() });
      return;
    }

    const employeesMatch = req.url?.match(/^\/api\/companies\/([^/]+)\/employees$/);
    if (req.method === 'GET' && employeesMatch) {
      sendJson(res, 200, { employees: employeesForCompany(decodeURIComponent(employeesMatch[1])) });
      return;
    }
    if (req.method === 'POST' && employeesMatch) {
      const companyId = decodeURIComponent(employeesMatch[1]);
      if (!getCompany(companyId)) return sendJson(res, 404, { error: 'No such company.' });
      const body = await parseJsonBody<DirectHireInput>(req);
      const employee = directHire(companyId, body);
      saveEmployee(employee);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'employee.direct_hire', 'Employee', employee.id, { firstName: employee.firstName, lastName: employee.lastName }));
      sendJson(res, 200, { employee });
      return;
    }

    // Core-HR profile fields only — jobTitle/department/managerId (the org
    // chart's own spine), pay type, work/residence state, and workers'
    // comp class code. Deliberately
    // NOT a path to touch ytd, deductionPlans, directDepositAccounts,
    // garnishmentOrders, federalW4, ssn or mailingAddress: those already
    // have their own dedicated, more careful flows (or are sensitive
    // enough that a generic "patch anything" route is the wrong shape for
    // them), the same "no shortcut around the real workflow" boundary
    // payroll/termination.ts's own terminateEmployee() draws against
    // just setting terminationDate by hand.
    const employeeUpdateMatch = req.url?.match(/^\/api\/employees\/([^/]+)$/);
    if (req.method === 'PATCH' && employeeUpdateMatch) {
      const employeeId = decodeURIComponent(employeeUpdateMatch[1]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const body = await parseJsonBody<{
        jobTitle?: string | null;
        department?: string | null;
        managerId?: string | null;
        payType?: Employee['payType'];
        workState?: { code: string } | null;
        residenceState?: { code: string };
        workersCompClassCode?: string | null;
      }>(req);

      if (body.managerId === employeeId) {
        return sendJson(res, 400, { error: 'An employee cannot be their own manager.' });
      }

      const updated: Employee = { ...employee };
      if ('jobTitle' in body) updated.jobTitle = body.jobTitle ?? undefined;
      if ('department' in body) updated.department = body.department ?? undefined;
      if ('managerId' in body) updated.managerId = body.managerId ?? undefined;
      if (body.payType) updated.payType = body.payType;
      if ('workState' in body) updated.workState = body.workState ?? undefined;
      if (body.residenceState) updated.residenceState = body.residenceState;
      if ('workersCompClassCode' in body) updated.workersCompClassCode = body.workersCompClassCode ?? undefined;

      saveEmployee(updated);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'employee.updated', 'Employee', employeeId, body));
      sendJson(res, 200, { employee: updated });
      return;
    }

    // A dedicated route, not folded into the generic PATCH above: a W-4
    // change directly changes federal withholding on someone's very next
    // paycheck, the same "real, sensitive, auditable event deserves its
    // own deliberate handling" reasoning the PATCH route's own header
    // comment gives for excluding it. Self-service employees hit this
    // same route (see examples/employee-portal.html) — actor in the
    // audit log is always AUDIT_ACTOR ('admin') here too, since this
    // demo has no real per-employee auth session to attribute the change
    // to instead (same disclosed limitation as payroll/auditLog.ts's own
    // header).
    const federalW4Match = req.url?.match(/^\/api\/employees\/([^/]+)\/federal-w4$/);
    if (req.method === 'POST' && federalW4Match) {
      const employeeId = decodeURIComponent(federalW4Match[1]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const federalW4 = await parseJsonBody<Employee['federalW4']>(req);
      const updated: Employee = { ...employee, federalW4 };
      saveEmployee(updated);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'employee.federal_w4_updated', 'Employee', employeeId, {}));
      sendJson(res, 200, { employee: updated });
      return;
    }

    const selfServiceMatch = req.url?.match(/^\/api\/employees\/([^/]+)\/self-service$/);
    if (req.method === 'GET' && selfServiceMatch) {
      const employee = getEmployee(decodeURIComponent(selfServiceMatch[1]));
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const company = getCompany(employee.companyId)!;

      // Only THIS employee's own line out of every run they appear in —
      // an employee's own view must never leak a coworker's pay, even in
      // a demo with no real access control otherwise enforcing that.
      const myPayRuns = payRunsForCompany(employee.companyId)
        .filter((r) => r.status === 'approved')
        .map((r) => ({
          payRunId: r.id,
          checkDate: r.checkDate,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          line: r.lines.find((l) => l.employeeId === employee.id) ?? null,
        }))
        .filter((r) => r.line !== null);

      const i9Record = getI9Record(employee.id) ?? { employeeId: employee.id };

      sendJson(res, 200, {
        employee: {
          id: employee.id,
          firstName: employee.firstName,
          lastName: employee.lastName,
          jobTitle: employee.jobTitle,
          department: employee.department,
          payType: employee.payType,
          hireDate: employee.hireDate,
          federalW4: employee.federalW4,
        },
        companyName: company.legalName,
        myPayRuns,
        ptoBalances: ptoBalancesForEmployee(employee.id),
        benefitElections: benefitElectionsForEmployee(employee.id).filter((e) => e.endDate === undefined),
        i9Status: i9Status(i9Record),
      });
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
      addAuditLogEntry(
        auditLogEntry(AUDIT_ACTOR, 'pay_run.approved', 'PayRun', approved.id, {
          checkDate: approved.checkDate,
          employeeCount: approved.lines.length,
          minimumWageIssueCount: approved.minimumWageIssues.length,
        }),
      );
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

    const depositScheduleMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/deposit-schedule$/);
    if (req.method === 'GET' && depositScheduleMatch) {
      const companyId = decodeURIComponent(depositScheduleMatch[1]);
      const year = Number(url.searchParams.get('year')) || new Date().getFullYear();
      const runs = payRunsForCompany(companyId);
      const quarters = lookbackPeriodQuarters(year).map(({ year: y, quarter: q }) => ({
        year: y,
        quarter: q,
        totalTaxesBeforeAdjustments: computeForm941(companyId, y, q, runs).totalTaxesBeforeAdjustments,
      }));
      const lookbackPeriodTotalLiability = quarters.reduce((sum, q) => sum + q.totalTaxesBeforeAdjustments, 0);
      const hasAnyLookbackData = quarters.some((q) => q.totalTaxesBeforeAdjustments > 0);
      const schedule = determineDepositorSchedule(hasAnyLookbackData ? lookbackPeriodTotalLiability : undefined);
      sendJson(res, 200, { schedule, lookbackPeriodTotalLiability, quarters, hasAnyLookbackData });
      return;
    }

    const depositDeadlineMatch = url.pathname.match(/^\/api\/pay-runs\/([^/]+)\/deposit-deadline$/);
    if (req.method === 'GET' && depositDeadlineMatch) {
      const payRun = getPayRun(decodeURIComponent(depositDeadlineMatch[1]));
      if (!payRun) return sendJson(res, 404, { error: 'No such pay run.' });
      const schedule = (url.searchParams.get('schedule') as 'monthly' | 'semiweekly' | null) ?? 'monthly';
      const accumulatedLiability = payRun.lines.reduce(
        (sum, line) => sum + line.taxLines.filter((t) => t.jurisdiction === 'federal').reduce((s, t) => s + t.amount, 0),
        0,
      );
      const nextDayRuleTriggered = nextDayDepositRuleApplies(accumulatedLiability);
      const deadline = depositDeadlineFor(schedule, payRun.checkDate, accumulatedLiability);
      sendJson(res, 200, { accumulatedLiability, nextDayRuleTriggered, deadline });
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
      const body = await parseJsonBody<{ planId: string; coverageTier: CoverageTier; effectiveDate: string; hasQualifyingLifeEvent?: boolean }>(req);
      const plan = getBenefitPlan(body.planId);
      if (!plan) return sendJson(res, 404, { error: 'No such benefit plan.' });

      const priorElections = benefitElectionsForEmployee(employeeId);
      const eligibility = canElectBenefit(priorElections, body.effectiveDate, company.openEnrollmentWindow, body.hasQualifyingLifeEvent ?? false);
      if (!eligibility.allowed) return sendJson(res, 400, { error: eligibility.reason });

      const periodsPerYear = PERIODS_PER_YEAR[company.paySchedule.frequency];
      const result = applyElection(
        employee,
        priorElections,
        plan,
        body.coverageTier,
        body.effectiveDate,
        periodsPerYear,
      );
      for (const ended of result.endedElections) saveBenefitElection(ended);
      saveBenefitElection(result.election);
      saveEmployee(result.employee);
      addAuditLogEntry(
        auditLogEntry(AUDIT_ACTOR, 'benefit_election.applied', 'Employee', employeeId, {
          planId: plan.id,
          coverageTier: body.coverageTier,
          supersededElectionIds: result.endedElections.map((e) => e.id),
        }),
      );
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
        ssn?: string;
        mailingAddress?: string;
      }>(req);
      const { employee, candidate: hired } = hireCandidate(candidate, body.companyId, body.federalW4, body.residenceState, body.ssn, body.mailingAddress);
      saveEmployee(employee);
      saveCandidate(hired);
      addAuditLogEntry(
        auditLogEntry(AUDIT_ACTOR, 'candidate.hired', 'Employee', employee.id, { candidateId: candidate.id, hireDate: employee.hireDate }),
      );
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
      addAuditLogEntry(
        auditLogEntry(AUDIT_ACTOR, 'employee.terminated', 'Employee', employee.id, {
          reason: body.reason,
          terminationDate: body.terminationDate,
          finalPayDueDate: result.finalPay.dueDate,
          ptoPayoutHours: result.ptoPayoutHours,
        }),
      );

      // Current headcount stands in for "typical employee count in the
      // PRIOR calendar year" (see payroll/cobra.ts's own header on why
      // this project doesn't track that history) — a real simplification,
      // disclosed in the response itself rather than silently assumed.
      const currentHeadcount = employeesForCompany(company.id).length;
      const cobra = !isQualifyingTermination(body.reason)
        ? { applicable: false, reason: 'Termination for gross misconduct is not a COBRA qualifying event.' }
        : !isCobraApplicable(currentHeadcount)
          ? { applicable: false, reason: `Employer headcount (${currentHeadcount}) is below the 20-employee COBRA threshold (measured here from CURRENT headcount, not last year's — see this project's own disclosed simplification).` }
          : {
              applicable: true,
              qualifyingEventDate: body.terminationDate,
              electionNoticeDeadline: electionNoticeDeadline(body.terminationDate),
              continuationCoverageEndDate: continuationCoverageEndDate(body.terminationDate, 'termination'),
            };

      sendJson(res, 200, { ...result, cobra });
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

    // ------------------------------------------------------------------
    // PTO requests — the employee-facing pending/approve/deny workflow,
    // distinct from the direct admin-side pto-use above.
    // ------------------------------------------------------------------

    const ptoRequestsMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/pto-requests$/);
    if (req.method === 'GET' && ptoRequestsMatch) {
      sendJson(res, 200, { requests: ptoRequestsForEmployee(decodeURIComponent(ptoRequestsMatch[1])) });
      return;
    }
    if (req.method === 'POST' && ptoRequestsMatch) {
      const employeeId = decodeURIComponent(ptoRequestsMatch[1]);
      const body = await parseJsonBody<{ policyId: string; hoursRequested: number; startDate: string; endDate: string }>(req);
      try {
        const request = createPtoRequest(employeeId, body.policyId, body.hoursRequested, body.startDate, body.endDate, new Date().toISOString().slice(0, 10));
        savePtoRequest(request);
        sendJson(res, 200, { request });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    const companyPtoRequestsMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/pto-requests$/);
    if (req.method === 'GET' && companyPtoRequestsMatch) {
      const companyId = decodeURIComponent(companyPtoRequestsMatch[1]);
      const employeeIds = employeesForCompany(companyId).map((e) => e.id);
      sendJson(res, 200, { requests: ptoRequestsForEmployeeIds(employeeIds) });
      return;
    }

    const ptoRequestApproveMatch = url.pathname.match(/^\/api\/pto-requests\/([^/]+)\/approve$/);
    if (req.method === 'POST' && ptoRequestApproveMatch) {
      const requestId = decodeURIComponent(ptoRequestApproveMatch[1]);
      const request = getPtoRequest(requestId);
      if (!request) return sendJson(res, 404, { error: 'No such PTO request.' });
      try {
        const current = getPtoBalance(request.employeeId, request.policyId) ?? emptyPtoBalance(request.employeeId, request.policyId);
        const result = approvePtoRequest(request, current, AUDIT_ACTOR, new Date().toISOString().slice(0, 10));
        savePtoRequest(result.request);
        if (result.approved) savePtoBalance(result.balance);
        addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'pto_request.approved', 'Employee', request.employeeId, { requestId, approved: result.approved }));
        sendJson(res, 200, { request: result.request, balance: result.balance, approved: result.approved, shortfallHours: result.shortfallHours });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    const ptoRequestDenyMatch = url.pathname.match(/^\/api\/pto-requests\/([^/]+)\/deny$/);
    if (req.method === 'POST' && ptoRequestDenyMatch) {
      const requestId = decodeURIComponent(ptoRequestDenyMatch[1]);
      const request = getPtoRequest(requestId);
      if (!request) return sendJson(res, 404, { error: 'No such PTO request.' });
      const body = await parseJsonBody<{ reason?: string }>(req);
      try {
        const denied = denyPtoRequest(request, AUDIT_ACTOR, new Date().toISOString().slice(0, 10), body.reason);
        savePtoRequest(denied);
        addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'pto_request.denied', 'Employee', request.employeeId, { requestId, reason: body.reason }));
        sendJson(res, 200, { request: denied });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    const ptoRequestCancelMatch = url.pathname.match(/^\/api\/pto-requests\/([^/]+)\/cancel$/);
    if (req.method === 'POST' && ptoRequestCancelMatch) {
      const requestId = decodeURIComponent(ptoRequestCancelMatch[1]);
      const request = getPtoRequest(requestId);
      if (!request) return sendJson(res, 404, { error: 'No such PTO request.' });
      try {
        const cancelled = cancelPtoRequest(request);
        savePtoRequest(cancelled);
        sendJson(res, 200, { request: cancelled });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    // ------------------------------------------------------------------
    // I-9
    // ------------------------------------------------------------------

    const i9Match = url.pathname.match(/^\/api\/employees\/([^/]+)\/i9$/);
    if (req.method === 'GET' && i9Match) {
      const employee = getEmployee(decodeURIComponent(i9Match[1]));
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const record = getI9Record(employee.id) ?? { employeeId: employee.id };
      sendJson(res, 200, {
        record,
        status: i9Status(record),
        deadlines: i9Deadlines(employee.hireDate),
        issues: i9ComplianceIssues(employee, record, new Date().toISOString().slice(0, 10)),
      });
      return;
    }
    if (req.method === 'POST' && i9Match) {
      const employeeId = decodeURIComponent(i9Match[1]);
      const body = await parseJsonBody<{ section: 1 | 2; completedAt: string }>(req);
      const existing: I9Record = getI9Record(employeeId) ?? { employeeId };
      const updated: I9Record =
        body.section === 1 ? { ...existing, section1CompletedAt: body.completedAt } : { ...existing, section2CompletedAt: body.completedAt };
      saveI9Record(updated);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, `i9.section${body.section}_completed`, 'Employee', employeeId, { completedAt: body.completedAt }));
      sendJson(res, 200, { record: updated, status: i9Status(updated) });
      return;
    }

    const i9ComplianceMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/i9-compliance$/);
    if (req.method === 'GET' && i9ComplianceMatch) {
      const companyId = decodeURIComponent(i9ComplianceMatch[1]);
      const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().slice(0, 10);
      const findings = employeesForCompany(companyId)
        .map((employee) => ({ employeeId: employee.id, issues: i9ComplianceIssues(employee, getI9Record(employee.id) ?? undefined, asOfDate) }))
        .filter((f) => f.issues.length > 0);
      sendJson(res, 200, { findings });
      return;
    }

    // ------------------------------------------------------------------
    // E-Verify case tracking
    // ------------------------------------------------------------------

    const everifyMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/everify$/);
    if (req.method === 'GET' && everifyMatch) {
      const employee = getEmployee(decodeURIComponent(everifyMatch[1]));
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const everifyCase = getEverifyCase(employee.id) ?? { employeeId: employee.id, status: 'not_created' as const };
      sendJson(res, 200, {
        case: everifyCase,
        caseCreationDeadline: caseCreationDeadline(employee.hireDate),
        issues: everifyComplianceIssues(employee, everifyCase, new Date().toISOString().slice(0, 10)),
      });
      return;
    }
    if (req.method === 'POST' && everifyMatch) {
      const employeeId = decodeURIComponent(everifyMatch[1]);
      if (!getEmployee(employeeId)) return sendJson(res, 404, { error: 'No such employee.' });
      const body = await parseJsonBody<{ status: EverifyCaseStatus; caseNumber?: string; createdAt?: string; tncIssuedAt?: string }>(req);
      const existing = getEverifyCase(employeeId) ?? { employeeId, status: 'not_created' as const };
      const updated = { ...existing, ...body };
      saveEverifyCase(updated);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'everify.case_updated', 'Employee', employeeId, { status: updated.status }));
      sendJson(res, 200, { case: updated });
      return;
    }

    const everifyComplianceMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/everify-compliance$/);
    if (req.method === 'GET' && everifyComplianceMatch) {
      const companyId = decodeURIComponent(everifyComplianceMatch[1]);
      const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().slice(0, 10);
      const findings = employeesForCompany(companyId)
        .map((employee) => ({ employeeId: employee.id, issues: everifyComplianceIssues(employee, getEverifyCase(employee.id) ?? undefined, asOfDate) }))
        .filter((f) => f.issues.length > 0);
      sendJson(res, 200, { findings });
      return;
    }

    // ------------------------------------------------------------------
    // Compliance dashboard — every check below, in one place
    // ------------------------------------------------------------------

    const complianceDashboardMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/compliance-dashboard$/);
    if (req.method === 'GET' && complianceDashboardMatch) {
      const companyId = decodeURIComponent(complianceDashboardMatch[1]);
      const company = getCompany(companyId);
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().slice(0, 10);
      const employees = employeesForCompany(companyId);
      const i9Records = new Map(employees.map((e) => [e.id, getI9Record(e.id)]).filter((entry): entry is [string, I9Record] => entry[1] !== null));
      const everifyCases = new Map(employees.map((e) => [e.id, getEverifyCase(e.id)]).filter((entry): entry is [string, EverifyCase] => entry[1] !== null));
      const dashboard = computeComplianceDashboard(company, employees, i9Records, everifyCases, newHireReportFiledEmployeeIds(), asOfDate);
      sendJson(res, 200, { dashboard });
      return;
    }

    // ------------------------------------------------------------------
    // New-hire reporting (PRWORA)
    // ------------------------------------------------------------------

    const newHireReportingMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/new-hire-reporting$/);
    if (req.method === 'GET' && newHireReportingMatch) {
      const companyId = decodeURIComponent(newHireReportingMatch[1]);
      const company = getCompany(companyId);
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().slice(0, 10);
      const issues = newHireReportingIssuesForCompany(company, employeesForCompany(companyId), newHireReportFiledEmployeeIds(), asOfDate);
      sendJson(res, 200, { issues });
      return;
    }

    const newHireReportMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/new-hire-report$/);
    if (req.method === 'GET' && newHireReportMatch) {
      const employeeId = decodeURIComponent(newHireReportMatch[1]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const company = getCompany(employee.companyId)!;
      try {
        sendJson(res, 200, { report: buildNewHireReport(company, employee) });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    const newHireReportFiledMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/new-hire-report\/mark-filed$/);
    if (req.method === 'POST' && newHireReportFiledMatch) {
      const employeeId = decodeURIComponent(newHireReportFiledMatch[1]);
      if (!getEmployee(employeeId)) return sendJson(res, 404, { error: 'No such employee.' });
      const body = await parseJsonBody<{ filedAt?: string }>(req);
      const filedAt = body.filedAt ?? new Date().toISOString().slice(0, 10);
      markNewHireReportFiled(employeeId, filedAt);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'new_hire_report.marked_filed', 'Employee', employeeId, { filedAt }));
      sendJson(res, 200, { employeeId, filedAt });
      return;
    }

    // ------------------------------------------------------------------
    // State employer registrations (SUI/withholding)
    // ------------------------------------------------------------------

    const stateRegistrationsMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/state-registrations$/);
    if (req.method === 'GET' && stateRegistrationsMatch) {
      const company = getCompany(decodeURIComponent(stateRegistrationsMatch[1]));
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      sendJson(res, 200, { registrations: company.stateRegistrations ?? [] });
      return;
    }
    if (req.method === 'POST' && stateRegistrationsMatch) {
      const companyId = decodeURIComponent(stateRegistrationsMatch[1]);
      const company = getCompany(companyId);
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      const body = await parseJsonBody<StateEmployerRegistration>(req);
      const existing = (company.stateRegistrations ?? []).filter((r) => r.stateCode !== body.stateCode);
      const updated: Company = { ...company, stateRegistrations: [...existing, body] };
      saveCompany(updated);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'state_registration.saved', 'Company', companyId, { stateCode: body.stateCode }));
      sendJson(res, 200, { registrations: updated.stateRegistrations });
      return;
    }

    const stateRegistrationComplianceMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/state-registration-compliance$/);
    if (req.method === 'GET' && stateRegistrationComplianceMatch) {
      const companyId = decodeURIComponent(stateRegistrationComplianceMatch[1]);
      const company = getCompany(companyId);
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().slice(0, 10);
      const issues = checkStateRegistrationCompliance(company, employeesForCompany(companyId), asOfDate);
      sendJson(res, 200, { issues });
      return;
    }

    const openEnrollmentMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/open-enrollment-window$/);
    if (req.method === 'POST' && openEnrollmentMatch) {
      const companyId = decodeURIComponent(openEnrollmentMatch[1]);
      const company = getCompany(companyId);
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      const body = await parseJsonBody<{ start: string; end: string }>(req);
      const updated: Company = { ...company, openEnrollmentWindow: body };
      saveCompany(updated);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'open_enrollment_window.set', 'Company', companyId, body));
      sendJson(res, 200, { company: updated });
      return;
    }

    // ------------------------------------------------------------------
    // Garnishment orders
    // ------------------------------------------------------------------

    const garnishmentMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/garnishment-orders$/);
    if (req.method === 'GET' && garnishmentMatch) {
      const employee = getEmployee(decodeURIComponent(garnishmentMatch[1]));
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      sendJson(res, 200, { garnishmentOrders: employee.garnishmentOrders });
      return;
    }
    if (req.method === 'POST' && garnishmentMatch) {
      const employeeId = decodeURIComponent(garnishmentMatch[1]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const body = await parseJsonBody<Omit<GarnishmentOrder, 'id'>>(req);
      const order: GarnishmentOrder = { id: randomUUID(), ...body };
      const updated: Employee = { ...employee, garnishmentOrders: [...employee.garnishmentOrders, order] };
      saveEmployee(updated);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'garnishment_order.added', 'Employee', employeeId, { orderId: order.id, type: order.type }));
      sendJson(res, 200, { garnishmentOrders: updated.garnishmentOrders });
      return;
    }

    const garnishmentDeleteMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/garnishment-orders\/([^/]+)$/);
    if (req.method === 'DELETE' && garnishmentDeleteMatch) {
      const employeeId = decodeURIComponent(garnishmentDeleteMatch[1]);
      const orderId = decodeURIComponent(garnishmentDeleteMatch[2]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const updated: Employee = { ...employee, garnishmentOrders: employee.garnishmentOrders.filter((o) => o.id !== orderId) };
      saveEmployee(updated);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, 'garnishment_order.removed', 'Employee', employeeId, { orderId }));
      sendJson(res, 200, { garnishmentOrders: updated.garnishmentOrders });
      return;
    }

    // ------------------------------------------------------------------
    // Direct deposit accounts and verification
    // ------------------------------------------------------------------

    /** Strips microDepositAmounts before a verification record leaves this server — see payroll/directDepositVerification.ts's own header on why an API response must never carry them. */
    function safeVerificationView(v: DirectDepositVerification) {
      const { microDepositAmounts: _omit, ...safe } = v;
      return safe;
    }

    const directDepositAccountsMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/direct-deposit-accounts$/);
    if (req.method === 'GET' && directDepositAccountsMatch) {
      const employee = getEmployee(decodeURIComponent(directDepositAccountsMatch[1]));
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      sendJson(res, 200, { accounts: employee.directDepositAccounts });
      return;
    }
    if (req.method === 'POST' && directDepositAccountsMatch) {
      const employeeId = decodeURIComponent(directDepositAccountsMatch[1]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const body = await parseJsonBody<Omit<Employee['directDepositAccounts'][number], 'id'>>(req);
      const account = { id: randomUUID(), ...body };
      const updated: Employee = { ...employee, directDepositAccounts: [...employee.directDepositAccounts, account] };
      saveEmployee(updated);
      sendJson(res, 200, { accounts: updated.directDepositAccounts });
      return;
    }

    const initiateVerificationMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/direct-deposit-accounts\/([^/]+)\/initiate-verification$/);
    if (req.method === 'POST' && initiateVerificationMatch) {
      const employeeId = decodeURIComponent(initiateVerificationMatch[1]);
      const accountId = decodeURIComponent(initiateVerificationMatch[2]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      if (!employee.directDepositAccounts.some((a) => a.id === accountId)) return sendJson(res, 404, { error: 'No such account.' });
      const body = await parseJsonBody<{ method: 'prenote' | 'micro-deposit'; date: string }>(req);
      const verification = body.method === 'prenote'
        ? initiatePrenoteVerification(accountId, body.date)
        : initiateMicroDepositVerification(accountId, body.date);
      saveDirectDepositVerification(verification);
      addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, `direct_deposit_verification.${body.method}_initiated`, 'Employee', employeeId, { accountId }));
      // Demo-only: this server has no real bank to actually move the micro-deposits or prenote through, so the
      // generated amounts are surfaced here for a human to key into the "verify micro deposits" step below rather
      // than being lost — a real deployment's ACH origination pipeline is what would actually deposit them, and
      // no OTHER endpoint (see the GET below) ever exposes this field again once initiated.
      sendJson(res, 200, { verification });
      return;
    }

    const verificationStatusMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/direct-deposit-accounts\/([^/]+)\/verification$/);
    if (req.method === 'GET' && verificationStatusMatch) {
      const accountId = decodeURIComponent(verificationStatusMatch[2]);
      const verification = getDirectDepositVerification(accountId);
      if (!verification) return sendJson(res, 404, { error: 'No verification on file for this account.' });
      sendJson(res, 200, { verification: safeVerificationView(verification) });
      return;
    }

    const resolvePrenoteMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/direct-deposit-accounts\/([^/]+)\/resolve-prenote$/);
    if (req.method === 'POST' && resolvePrenoteMatch) {
      const employeeId = decodeURIComponent(resolvePrenoteMatch[1]);
      const accountId = decodeURIComponent(resolvePrenoteMatch[2]);
      const verification = getDirectDepositVerification(accountId);
      if (!verification) return sendJson(res, 404, { error: 'No verification on file for this account.' });
      const body = await parseJsonBody<{ asOfDate: string; receivedReturnOrNoc?: boolean }>(req);
      const resolved = resolvePrenoteVerification(verification, body.asOfDate, body.receivedReturnOrNoc ?? false);
      saveDirectDepositVerification(resolved);
      if (resolved.status !== verification.status) {
        addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, `direct_deposit_verification.${resolved.status}`, 'Employee', employeeId, { accountId }));
      }
      sendJson(res, 200, { verification: safeVerificationView(resolved) });
      return;
    }

    const verifyMicroDepositsMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/direct-deposit-accounts\/([^/]+)\/verify-micro-deposits$/);
    if (req.method === 'POST' && verifyMicroDepositsMatch) {
      const employeeId = decodeURIComponent(verifyMicroDepositsMatch[1]);
      const accountId = decodeURIComponent(verifyMicroDepositsMatch[2]);
      const verification = getDirectDepositVerification(accountId);
      if (!verification) return sendJson(res, 404, { error: 'No verification on file for this account.' });
      const body = await parseJsonBody<{ amounts: [number, number] }>(req);
      const { verification: updated, correct } = verifyMicroDeposits(verification, body.amounts);
      saveDirectDepositVerification(updated);
      if (updated.status !== verification.status) {
        addAuditLogEntry(auditLogEntry(AUDIT_ACTOR, `direct_deposit_verification.${updated.status}`, 'Employee', employeeId, { accountId }));
      }
      sendJson(res, 200, { correct, verification: safeVerificationView(updated) });
      return;
    }

    // ------------------------------------------------------------------
    // Companies (create) and reports
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/companies') {
      const body = await parseJsonBody<Omit<Company, 'id'>>(req);
      const created: Company = { id: randomUUID(), ...body };
      saveCompany(created);
      sendJson(res, 200, { company: created });
      return;
    }

    const reportMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/report$/);
    if (req.method === 'GET' && reportMatch) {
      const companyId = decodeURIComponent(reportMatch[1]);
      const company = getCompany(companyId);
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().slice(0, 10);
      const report = computeCompanyReport(company, employeesForCompany(companyId), payRunsForCompany(companyId), asOfDate);
      sendJson(res, 200, { report });
      return;
    }

    const orgChartMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/org-chart$/);
    if (req.method === 'GET' && orgChartMatch) {
      const companyId = decodeURIComponent(orgChartMatch[1]);
      const company = getCompany(companyId);
      if (!company) return sendJson(res, 404, { error: 'No such company.' });
      const asOfDate = url.searchParams.get('asOfDate') ?? new Date().toISOString().slice(0, 10);
      sendJson(res, 200, { chart: buildOrgChart(company, employeesForCompany(companyId), asOfDate) });
      return;
    }

    const auditLogMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/audit-log$/);
    if (req.method === 'GET' && auditLogMatch) {
      const companyId = decodeURIComponent(auditLogMatch[1]);
      const entityIds = [
        companyId,
        ...employeesForCompany(companyId).map((e) => e.id),
        ...payRunsForCompany(companyId).map((r) => r.id),
      ];
      sendJson(res, 200, { auditLog: auditLogForEntityIds(entityIds) });
      return;
    }

    const registerMatch = url.pathname.match(/^\/api\/pay-runs\/([^/]+)\/register$/);
    if (req.method === 'GET' && registerMatch) {
      const payRun = getPayRun(decodeURIComponent(registerMatch[1]));
      if (!payRun) return sendJson(res, 404, { error: 'No such pay run.' });
      const csv = renderPayrollRegister(employeesForCompany(payRun.companyId), payRun);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
      res.end(csv);
      return;
    }

    const glJournalMatch = url.pathname.match(/^\/api\/pay-runs\/([^/]+)\/gl-journal$/);
    if (req.method === 'POST' && glJournalMatch) {
      const payRun = getPayRun(decodeURIComponent(glJournalMatch[1]));
      if (!payRun) return sendJson(res, 404, { error: 'No such pay run.' });
      const mapping = await parseJsonBody<GlAccountMapping>(req);
      try {
        const csv = renderGlJournalCsv(payRun, mapping);
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
        res.end(csv);
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    const carrierRosterMatch = url.pathname.match(/^\/api\/benefit-plans\/([^/]+)\/carrier-roster$/);
    if (req.method === 'GET' && carrierRosterMatch) {
      const plan = getBenefitPlan(decodeURIComponent(carrierRosterMatch[1]));
      if (!plan) return sendJson(res, 404, { error: 'No such benefit plan.' });
      const companyEmployees = employeesForCompany(plan.companyId);
      const elections = benefitElectionsForEmployeeIds(companyEmployees.map((e) => e.id));
      const csv = renderCarrierEligibilityRoster(companyEmployees, plan, elections);
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
      res.end(csv);
      return;
    }

    // ------------------------------------------------------------------
    // 1099 contractors
    // ------------------------------------------------------------------

    const contractorsMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/contractors$/);
    if (req.method === 'GET' && contractorsMatch) {
      sendJson(res, 200, { contractors: contractorsForCompany(decodeURIComponent(contractorsMatch[1])) });
      return;
    }
    if (req.method === 'POST' && contractorsMatch) {
      const companyId = decodeURIComponent(contractorsMatch[1]);
      const body = await parseJsonBody<{ legalName: string; tin: string; address: string }>(req);
      const contractor: Contractor = { id: randomUUID(), companyId, active: true, ...body };
      saveContractor(contractor);
      sendJson(res, 200, { contractor });
      return;
    }

    const contractorPaymentsMatch = url.pathname.match(/^\/api\/contractors\/([^/]+)\/payments$/);
    if (req.method === 'GET' && contractorPaymentsMatch) {
      sendJson(res, 200, { payments: paymentsForContractor(decodeURIComponent(contractorPaymentsMatch[1])) });
      return;
    }
    if (req.method === 'POST' && contractorPaymentsMatch) {
      const contractorId = decodeURIComponent(contractorPaymentsMatch[1]);
      if (!getContractor(contractorId)) return sendJson(res, 404, { error: 'No such contractor.' });
      const body = await parseJsonBody<{ amount: number; paymentDate: string; description?: string }>(req);
      const payment = recordContractorPayment(contractorId, body.amount, body.paymentDate, body.description);
      saveContractorPayment(payment);
      sendJson(res, 200, { payment });
      return;
    }

    const contractor1099Match = url.pathname.match(/^\/api\/contractors\/([^/]+)\/1099$/);
    if (req.method === 'GET' && contractor1099Match) {
      const contractorId = decodeURIComponent(contractor1099Match[1]);
      const year = Number(url.searchParams.get('year'));
      if (!year) return sendJson(res, 400, { error: 'year is required.' });
      sendJson(res, 200, { form1099: compute1099Nec(contractorId, year, paymentsForContractor(contractorId)) });
      return;
    }

    // ------------------------------------------------------------------
    // ACA — Applicable Large Employer status and affordability checks
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/aca/ale-status') {
      const body = await parseJsonBody<{ hours: EmployeeMonthlyHours[] }>(req);
      try {
        sendJson(res, 200, { determination: determineAleStatus(body.hours ?? []) });
      } catch (err) {
        sendJson(res, 400, { error: err instanceof Error ? err.message : String(err) });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/aca/affordability-check') {
      const body = await parseJsonBody<{
        safeHarbor: 'fpl' | 'rate-of-pay-hourly' | 'rate-of-pay-salaried' | 'w2';
        affordabilityPercentage: number;
        employeeMonthlyContribution?: number;
        employeeAnnualContribution?: number;
        federalPovertyLineAnnual?: number;
        hourlyRate?: number;
        monthlySalary?: number;
        annualBox1Wages?: number;
      }>(req);
      const pct = body.affordabilityPercentage;
      if (body.safeHarbor === 'fpl') {
        const ceiling = fplSafeHarborMonthlyCeiling(dollars(body.federalPovertyLineAnnual ?? 0), pct);
        sendJson(res, 200, { ceilingCents: ceiling, affordable: dollars(body.employeeMonthlyContribution ?? 0) <= ceiling });
      } else if (body.safeHarbor === 'rate-of-pay-hourly') {
        const ceiling = ratePayHourlySafeHarborMonthlyCeiling(dollars(body.hourlyRate ?? 0), pct);
        sendJson(res, 200, { ceilingCents: ceiling, affordable: dollars(body.employeeMonthlyContribution ?? 0) <= ceiling });
      } else if (body.safeHarbor === 'rate-of-pay-salaried') {
        const ceiling = ratePaySalariedSafeHarborMonthlyCeiling(dollars(body.monthlySalary ?? 0), pct);
        sendJson(res, 200, { ceilingCents: ceiling, affordable: dollars(body.employeeMonthlyContribution ?? 0) <= ceiling });
      } else if (body.safeHarbor === 'w2') {
        const affordable = isAffordableUnderW2SafeHarbor(dollars(body.employeeAnnualContribution ?? 0), dollars(body.annualBox1Wages ?? 0), pct);
        sendJson(res, 200, { affordable });
      } else {
        sendJson(res, 400, { error: 'Unknown safeHarbor.' });
      }
      return;
    }

    // ------------------------------------------------------------------
    // FMLA eligibility
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/fmla/eligibility') {
      const body = await parseJsonBody<{ monthsEmployed: number; hoursOfServicePastTwelveMonths: number; employeeCountAtWorksite: number }>(req);
      sendJson(res, 200, { result: checkFmlaEligibility(body) });
      return;
    }

    // ------------------------------------------------------------------
    // Workers' compensation premium estimate
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/workers-comp/premium-estimate') {
      const body = await parseJsonBody<{
        grossWages: number;
        overtimePremiumPortion: number;
        workStateCode: string;
        ratePerHundredOfPayroll: number;
        experienceModificationFactor: number;
      }>(req);
      const subjectWages = workersCompSubjectWages(dollars(body.grossWages), dollars(body.overtimePremiumPortion), body.workStateCode);
      const premium = workersCompPremium(subjectWages, dollars(body.ratePerHundredOfPayroll), body.experienceModificationFactor);
      sendJson(res, 200, { subjectWages, premium });
      return;
    }

    // ------------------------------------------------------------------
    // California paid sick leave calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/paid-sick-leave/ca-calculator') {
      const body = await parseJsonBody<{
        hireDate: string;
        asOfDate: string;
        currentBalanceHours: number;
        hoursWorkedSinceLastAccrual: number;
        hoursUsedThisYear: number;
      }>(req);
      const newBalanceHours = accrueCaSickLeaveHours(body.currentBalanceHours, body.hoursWorkedSinceLastAccrual);
      sendJson(res, 200, {
        useEligibleDate: caSickLeaveUseEligibleDate(body.hireDate),
        isEligibleToUseToday: isEligibleToUseCaSickLeave(body.hireDate, body.asOfDate),
        newBalanceHours,
        maxUsableHours: maxUsableCaSickLeaveHours(newBalanceHours, body.hoursUsedThisYear),
      });
      return;
    }

    // ------------------------------------------------------------------
    // 401(k) elective deferral limit calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/retirement-limits/401k-calculator') {
      const body = await parseJsonBody<{
        age: number;
        ytdElectiveDeferrals: number;
        requestedDeferral: number;
        priorYearFicaWagesFromThisEmployer: number;
      }>(req);
      sendJson(res, 200, {
        annualLimit: annualElectiveDeferralLimit(body.age),
        remainingRoom: remainingElectiveDeferralRoom(dollars(body.ytdElectiveDeferrals), body.age),
        cappedDeferral: cappedDeferralForPayPeriod(dollars(body.requestedDeferral), dollars(body.ytdElectiveDeferrals), body.age),
        rothCatchUpRequired: isRothCatchUpRequired(body.age, dollars(body.priorYearFicaWagesFromThisEmployer)),
      });
      return;
    }

    // ------------------------------------------------------------------
    // HSA / FSA / dependent-care FSA contribution limit calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/hsa-fsa-limits/calculator') {
      const body = await parseJsonBody<{
        age: number;
        hdhpCoverageTier: HdhpCoverageTier;
        ytdHsaContributions: number;
        requestedHsaContribution: number;
        ytdHealthFsaContributions: number;
        requestedHealthFsaContribution: number;
        isMarriedFilingSeparately: boolean;
        ytdDependentCareFsaContributions: number;
        requestedDependentCareFsaContribution: number;
      }>(req);
      sendJson(res, 200, {
        hsaAnnualLimit: hsaContributionLimit(body.hdhpCoverageTier, body.age),
        hsaRemainingRoom: remainingHsaContributionRoom(dollars(body.ytdHsaContributions), body.hdhpCoverageTier, body.age),
        hsaCappedContribution: cappedHsaContributionForPayPeriod(dollars(body.requestedHsaContribution), dollars(body.ytdHsaContributions), body.hdhpCoverageTier, body.age),
        healthFsaRemainingRoom: remainingHealthFsaRoom(dollars(body.ytdHealthFsaContributions)),
        healthFsaCappedContribution: cappedHealthFsaContributionForPayPeriod(dollars(body.requestedHealthFsaContribution), dollars(body.ytdHealthFsaContributions)),
        dependentCareFsaAnnualLimit: dependentCareFsaLimit(body.isMarriedFilingSeparately),
        dependentCareFsaRemainingRoom: remainingDependentCareFsaRoom(dollars(body.ytdDependentCareFsaContributions), body.isMarriedFilingSeparately),
        dependentCareFsaCappedContribution: cappedDependentCareFsaContributionForPayPeriod(
          dollars(body.requestedDependentCareFsaContribution),
          dollars(body.ytdDependentCareFsaContributions),
          body.isMarriedFilingSeparately,
        ),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Federal WARN Act calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/warn-act/calculator') {
      const body = await parseJsonBody<{
        employeeCountExcludingPartTime: number;
        employeesLosingEmploymentExcludingPartTime: number;
        activeWorkforceAtSiteBeforeLayoff: number;
        plannedActionDate: string;
        noticeServedDate?: string;
      }>(req);
      const plantClosing = isPlantClosing(body.employeesLosingEmploymentExcludingPartTime);
      const massLayoff = !plantClosing && isMassLayoff(body.employeesLosingEmploymentExcludingPartTime, body.activeWorkforceAtSiteBeforeLayoff);
      sendJson(res, 200, {
        isCoveredEmployer: isWarnCoveredEmployer(body.employeeCountExcludingPartTime),
        isPlantClosing: plantClosing,
        isMassLayoff: massLayoff,
        noticeRequired: plantClosing || massLayoff,
        noticeDeadline: warnNoticeDeadline(body.plannedActionDate),
        noticeLate: body.noticeServedDate ? isWarnNoticeLate(body.noticeServedDate, body.plannedActionDate) : null,
      });
      return;
    }

    // ------------------------------------------------------------------
    // California meal/rest break calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/meal-rest-breaks/ca-calculator') {
      const body = await parseJsonBody<{
        hoursWorked: number;
        firstMealPeriodWaived: boolean;
        regularRateDollars: number;
        mealPeriodViolationOccurred: boolean;
        restPeriodViolationOccurred: boolean;
      }>(req);
      sendJson(res, 200, {
        firstMealPeriodRequired: isFirstMealPeriodRequired(body.hoursWorked),
        firstMealPeriodWaivable: isFirstMealPeriodWaivable(body.hoursWorked),
        secondMealPeriodRequired: isSecondMealPeriodRequired(body.hoursWorked),
        secondMealPeriodWaivable: isSecondMealPeriodWaivable(body.hoursWorked, body.firstMealPeriodWaived),
        restBreaksRequired: restBreaksRequired(body.hoursWorked),
        premiumOwed: dailyMealAndRestPremium(body.mealPeriodViolationOccurred, body.restPeriodViolationOccurred, dollars(body.regularRateDollars)),
      });
      return;
    }

    // ------------------------------------------------------------------
    // New York wage notice calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/ny-wage-notice/calculator') {
      const body = await parseJsonBody<{
        rateOfPayDollars?: number;
        basisOfPay?: NyWageBasisOfPay;
        allowancesClaimedDollars?: number;
        regularPayDay?: string;
        employerLegalName?: string;
        employerAddress?: string;
        employerPhone?: string;
        isRateIncrease: boolean;
        willAppearOnNextWageStatement: boolean;
        isHospitalityIndustry: boolean;
        daysWithoutCompliantNotice: number;
        daysWithoutCompliantStatement: number;
      }>(req);
      const issues = nyWageNoticeComplianceIssues({
        rateOfPayCents: body.rateOfPayDollars === undefined ? undefined : dollars(body.rateOfPayDollars),
        basisOfPay: body.basisOfPay,
        allowancesClaimedCents: body.allowancesClaimedDollars === undefined ? undefined : dollars(body.allowancesClaimedDollars),
        regularPayDay: body.regularPayDay,
        employerLegalName: body.employerLegalName,
        employerAddress: body.employerAddress,
        employerPhone: body.employerPhone,
      });
      sendJson(res, 200, {
        noticeComplianceIssues: issues,
        newNoticeRequiredForRateChange: isNewNoticeRequiredForRateChange(body.isRateIncrease, body.willAppearOnNextWageStatement, body.isHospitalityIndustry),
        estimatedNoticeViolationDamages: estimatedNoticeViolationDamages(body.daysWithoutCompliantNotice),
        estimatedWageStatementViolationDamages: estimatedWageStatementViolationDamages(body.daysWithoutCompliantStatement),
      });
      return;
    }

    // ------------------------------------------------------------------
    // FLSA white-collar exemption salary-level calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/flsa-exemption/calculator') {
      const body = await parseJsonBody<{
        category: FlsaExemptionCategory;
        weeklySalaryDollars: number | null;
        hourlyRateDollars: number | null;
        totalAnnualCompensationDollars: number | null;
      }>(req);
      sendJson(res, 200, {
        salaryLevelTestRequired: requiresSalaryLevelTest(body.category),
        meetsSalaryLevelRequirement: meetsSalaryLevelRequirement(
          body.category,
          body.weeklySalaryDollars === null ? null : dollars(body.weeklySalaryDollars),
          body.hourlyRateDollars === null ? null : dollars(body.hourlyRateDollars),
          body.totalAnnualCompensationDollars === null ? null : dollars(body.totalAnnualCompensationDollars),
        ),
      });
      return;
    }

    // ------------------------------------------------------------------
    // California bereavement leave calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/ca-bereavement-leave/calculator') {
      const body = await parseJsonBody<{
        employeeCount: number;
        daysEmployedBeforeLeaveStarts: number;
        dateOfDeath: string;
        leaveDate: string;
        existingPolicyPaidDays: number;
      }>(req);
      sendJson(res, 200, {
        employerCovered: isCaBereavementLeaveEmployerCovered(body.employeeCount),
        employeeEligible: isCaBereavementLeaveEligible(body.daysEmployedBeforeLeaveStarts),
        completionDeadline: caBereavementLeaveCompletionDeadline(body.dateOfDeath),
        leaveTimely: isCaBereavementLeaveTimely(body.dateOfDeath, body.leaveDate),
        documentationRequestDeadline: caBereavementDocumentationRequestDeadline(body.leaveDate),
        paidDays: caBereavementLeavePaidDays(body.existingPolicyPaidDays),
        unpaidDays: caBereavementLeaveUnpaidDays(body.existingPolicyPaidDays),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Federal PUMP Act calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/pump-act/calculator') {
      const body = await parseJsonBody<{
        childBirthDate: string;
        asOfDate: string;
        totalEmployeeCountAllWorksites: number;
        isCompletelyRelievedOfDuty: boolean;
        coincidesWithAlreadyPaidBreak: boolean;
        isBathroom: boolean;
        isShieldedFromView: boolean;
        isFreeFromIntrusion: boolean;
      }>(req);
      sendJson(res, 200, {
        coverageEndDate: pumpActCoverageEndDate(body.childBirthDate),
        withinCoveragePeriod: isWithinPumpActCoveragePeriod(body.childBirthDate, body.asOfDate),
        mayQualifyForSmallEmployerExemption: mayQualifyForSmallEmployerExemption(body.totalEmployeeCountAllWorksites),
        paymentRequired: isPumpBreakPaymentRequired(body.isCompletelyRelievedOfDuty, body.coincidesWithAlreadyPaidBreak),
        compliantSpace: isCompliantPumpingSpace(body.isBathroom, body.isShieldedFromView, body.isFreeFromIntrusion),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Backup withholding calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/backup-withholding/calculator') {
      const body = await parseJsonBody<{
        paymentType: BackupWithholdingPaymentType;
        hasValidTinOnFile: boolean;
        awaitingTinCertificateDate: string | null;
        paymentDate: string;
        grossPaymentDollars: number;
      }>(req);
      const withinGracePeriod = body.awaitingTinCertificateDate !== null && isWithinAwaitingTinGracePeriod(body.awaitingTinCertificateDate, body.paymentDate);
      const required = isBackupWithholdingRequired(body.paymentType, body.hasValidTinOnFile, withinGracePeriod);
      const grossCents = dollars(body.grossPaymentDollars);
      sendJson(res, 200, {
        withinAwaitingTinGracePeriod: withinGracePeriod,
        backupWithholdingRequired: required,
        backupWithholdingAmount: required ? backupWithholdingAmount(grossCents) : 0,
        netPayment: netPaymentAfterBackupWithholding(grossCents, required),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Pregnant Workers Fairness Act calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/pwfa/calculator') {
      const body = await parseJsonBody<{ employeeCount: number; requestDate: string; accommodation: string }>(req);
      sendJson(res, 200, {
        employerCovered: isPwfaCoveredEmployer(body.employeeCount),
        lawInEffect: isPwfaInEffect(body.requestDate),
        isPredictableAssessment: isPredictableAssessmentAccommodation(body.accommodation),
        medicalDocumentationRequired: requiresMedicalDocumentation(body.accommodation),
      });
      return;
    }

    // ------------------------------------------------------------------
    // CalSavers calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/calsavers/calculator') {
      const body = await parseJsonBody<{
        employeeCount: number;
        hasQualifiedRetirementPlan: boolean;
        asOfDate: string;
        fullYearsEnrolled: number;
        eligibleEmployeeCount: number;
        noncomplianceContinues: boolean;
      }>(req);
      sendJson(res, 200, {
        mandatory: isCalSaversMandatory(body.employeeCount, body.hasQualifiedRetirementPlan, body.asOfDate),
        defaultContributionRate: calSaversDefaultContributionRate(body.fullYearsEnrolled),
        penaltyExposure: calSaversPenaltyExposure(body.eligibleEmployeeCount, body.noncomplianceContinues),
      });
      return;
    }

    // ------------------------------------------------------------------
    // USERRA calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/userra/calculator') {
      const body = await parseJsonBody<{
        serviceDurationDays: number;
        cumulativeServiceYearsExcludingExceptions: number;
        serviceCompletionDate: string;
        fullMonthlyPremiumDollars: number;
      }>(req);
      sendJson(res, 200, {
        tier: userraReemploymentTier(body.serviceDurationDays),
        applicationDeadlineDays: userraApplicationDeadlineDays(body.serviceDurationDays),
        withinCumulativeServiceLimit: isWithinCumulativeServiceLimit(body.cumulativeServiceYearsExcludingExceptions),
        disabilityReportDeadline: userraDisabilityReportDeadline(body.serviceCompletionDate),
        healthContinuationElectionRequired: isHealthContinuationElectionRequired(body.serviceDurationDays),
        maxHealthContinuationPremium: userraMaxHealthContinuationPremium(dollars(body.fullMonthlyPremiumDollars)),
      });
      return;
    }

    // ------------------------------------------------------------------
    // California waiting time penalty calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/waiting-time-penalty/calculator') {
      const body = await parseJsonBody<{ dueDate: string; actualPaymentDate: string; hourlyRateDollars: number; normalDailyHours: number }>(req);
      const daysLate = waitingTimePenaltyDaysLate(body.dueDate, body.actualPaymentDate);
      const dailyRate = waitingTimeDailyRate(dollars(body.hourlyRateDollars), body.normalDailyHours);
      sendJson(res, 200, {
        daysLate,
        dailyRate,
        penaltyAmount: waitingTimePenaltyAmount(dailyRate, daysLate),
      });
      return;
    }

    // ------------------------------------------------------------------
    // California itemized wage statement calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/ca-wage-statement/calculator') {
      const body = await parseJsonBody<{
        grossWagesDollars?: number;
        isExemptSalaried: boolean;
        totalHoursWorked: number | null;
        isPieceRateWork: boolean;
        pieceRateUnitsEarned: number | null;
        deductionsDollars?: number;
        netWagesDollars?: number;
        payPeriodStart?: string;
        payPeriodEnd?: string;
        employeeName?: string;
        lastFourSsn?: string;
        employerLegalName?: string;
        employerAddress?: string;
        hourlyRateLines: CaHourlyRateLine[];
        payPeriodsWithViolations: number;
      }>(req);
      const issues = caWageStatementComplianceIssues({
        grossWagesCents: body.grossWagesDollars === undefined ? undefined : dollars(body.grossWagesDollars),
        isExemptSalaried: body.isExemptSalaried,
        totalHoursWorked: body.totalHoursWorked,
        isPieceRateWork: body.isPieceRateWork,
        pieceRateUnitsEarned: body.pieceRateUnitsEarned,
        deductionsCents: body.deductionsDollars === undefined ? undefined : dollars(body.deductionsDollars),
        netWagesCents: body.netWagesDollars === undefined ? undefined : dollars(body.netWagesDollars),
        payPeriodStart: body.payPeriodStart,
        payPeriodEnd: body.payPeriodEnd,
        employeeName: body.employeeName,
        lastFourSsn: body.lastFourSsn,
        employerLegalName: body.employerLegalName,
        employerAddress: body.employerAddress,
        hourlyRateLines: body.hourlyRateLines,
      });
      sendJson(res, 200, {
        complianceIssues: issues,
        penaltyExposure: caWageStatementPenaltyExposure(body.payPeriodsWithViolations),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Illinois Secure Choice calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/il-secure-choice/calculator') {
      const body = await parseJsonBody<{
        employeeCount: number;
        yearsInBusiness: number;
        hasQualifiedRetirementPlan: boolean;
        eligibleEmployeeCount: number;
        noncompliantCalendarYears: number;
        noticeIssueDate: string;
        asOfDate: string;
      }>(req);
      sendJson(res, 200, {
        mandatory: isIlSecureChoiceMandatory(body.employeeCount, body.yearsInBusiness, body.hasQualifiedRetirementPlan),
        penaltyExposure: ilSecureChoicePenaltyExposure(body.eligibleEmployeeCount, body.noncompliantCalendarYears),
        cureDeadline: ilSecureChoiceCureDeadline(body.noticeIssueDate),
        withinCurePeriod: isWithinIlSecureChoiceCurePeriod(body.noticeIssueDate, body.asOfDate),
      });
      return;
    }

    // ------------------------------------------------------------------
    // New York Paid Family Leave calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/ny-pfl/calculator') {
      const body = await parseJsonBody<{
        hoursPerWeek: number;
        consecutiveWeeksEmployed: number;
        totalDaysWorked: number;
        averageWeeklyWageDollars: number;
      }>(req);
      sendJson(res, 200, {
        eligible: isPflEligible(body.hoursPerWeek, body.consecutiveWeeksEmployed, body.totalDaysWorked),
        weeklyBenefit: nyPflWeeklyBenefit(dollars(body.averageWeeklyWageDollars)),
      });
      return;
    }

    // ------------------------------------------------------------------
    // New Jersey Family Leave Insurance calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/nj-fli/calculator') {
      const body = await parseJsonBody<{
        baseWeeksWorked: number;
        weeklyEarningsDollars: number;
        baseYearEarningsDollars: number;
        averageWeeklyWageDollars: number;
        continuousWeeksAlreadyUsed: number;
        intermittentDaysAlreadyUsed: number;
      }>(req);
      sendJson(res, 200, {
        eligible: isNjFliEligible(body.baseWeeksWorked, dollars(body.weeklyEarningsDollars), dollars(body.baseYearEarningsDollars)),
        weeklyBenefit: njFliWeeklyBenefit(dollars(body.averageWeeklyWageDollars)),
        remainingContinuousWeeks: njFliRemainingContinuousWeeks(body.continuousWeeksAlreadyUsed),
        remainingIntermittentDays: njFliRemainingIntermittentDays(body.intermittentDaysAlreadyUsed),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Massachusetts PFML calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/ma-pfml/calculator') {
      const body = await parseJsonBody<{ averageWeeklyWageDollars: number; basePeriodEarningsDollars: number }>(req);
      const weeklyBenefit = maPfmlWeeklyBenefit(dollars(body.averageWeeklyWageDollars));
      sendJson(res, 200, {
        weeklyBenefit,
        eligible: isMaPfmlEligible(dollars(body.basePeriodEarningsDollars), weeklyBenefit),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Colorado FAMLI calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/co-famli/calculator') {
      const body = await parseJsonBody<{
        averageWeeklyWageDollars: number;
        basePeriodEarningsDollars: number;
        hasPregnancyOrChildbirthComplications: boolean;
      }>(req);
      const weeklyBenefit = coFamliWeeklyBenefit(dollars(body.averageWeeklyWageDollars));
      sendJson(res, 200, {
        weeklyBenefit,
        eligible: isCoFamliEligible(dollars(body.basePeriodEarningsDollars)),
        maxWeeksAvailable: coFamliMaxWeeksAvailable(body.hasPregnancyOrChildbirthComplications),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Paid Leave Oregon calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/or-paid-leave/calculator') {
      const body = await parseJsonBody<{
        averageWeeklyWageDollars: number;
        baseYearEarningsDollars: number;
        hasPregnancyOrChildbirthRelatedCondition: boolean;
      }>(req);
      const weeklyBenefit = orPaidLeaveWeeklyBenefit(dollars(body.averageWeeklyWageDollars));
      sendJson(res, 200, {
        weeklyBenefit,
        eligible: isOrPaidLeaveEligible(dollars(body.baseYearEarningsDollars)),
        maxWeeksAvailable: orPaidLeaveMaxWeeksAvailable(body.hasPregnancyOrChildbirthRelatedCondition),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Connecticut Paid Leave calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/ct-paid-leave/calculator') {
      const body = await parseJsonBody<{
        averageWeeklyWageDollars: number;
        highestQuarterEarningsDollars: number;
        isCurrentlyEmployed: boolean;
        weeksSinceSeparation: number;
      }>(req);
      sendJson(res, 200, {
        weeklyBenefit: ctPaidLeaveWeeklyBenefit(dollars(body.averageWeeklyWageDollars)),
        eligible: isCtPaidLeaveEligible(
          dollars(body.highestQuarterEarningsDollars),
          body.isCurrentlyEmployed,
          body.weeksSinceSeparation,
        ),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Maine PFML calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/me-pfml/calculator') {
      const body = await parseJsonBody<{ averageWeeklyWageDollars: number; basePeriodEarningsDollars: number }>(req);
      sendJson(res, 200, {
        weeklyBenefit: mePfmlWeeklyBenefit(dollars(body.averageWeeklyWageDollars)),
        eligible: isMePfmlEligible(dollars(body.basePeriodEarningsDollars)),
      });
      return;
    }

    // ------------------------------------------------------------------
    // State non-compete ban/threshold calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/non-compete/calculator') {
      const body = await parseJsonBody<{
        state: string;
        annualCompensationDollars: number;
        isIndependentContractor: boolean;
        asOfDate: string;
        termMonths: number;
        advanceNoticeDays: number;
      }>(req);
      const comp = dollars(body.annualCompensationDollars);
      const totalBanStates = ['CA', 'MN', 'ND', 'OK'];
      if (totalBanStates.includes(body.state)) {
        sendJson(res, 200, {
          kind: 'total_ban',
          enforceable: !isNonCompeteVoidInTotalBanState(body.state as 'CA' | 'MN' | 'ND' | 'OK', body.asOfDate),
        });
        return;
      }
      if (body.state === 'CO') {
        sendJson(res, 200, {
          kind: 'threshold',
          nonCompeteEnforceable: isCoNonCompeteEnforceable(comp),
          nonSolicitEnforceable: isCoNonSolicitEnforceable(comp),
          nonSolicitThreshold: coNonSolicitThreshold2026(),
        });
        return;
      }
      if (body.state === 'IL') {
        sendJson(res, 200, {
          kind: 'threshold',
          nonCompeteEnforceable: isIlNonCompeteEnforceable(comp, body.asOfDate),
          nonSolicitEnforceable: isIlNonSolicitEnforceable(comp, body.asOfDate),
        });
        return;
      }
      if (body.state === 'WA') {
        sendJson(res, 200, {
          kind: 'threshold',
          nonCompeteEnforceable: isWaNonCompeteEnforceable(comp, body.isIndependentContractor, body.asOfDate),
        });
        return;
      }
      if (body.state === 'OR') {
        sendJson(res, 200, {
          kind: 'threshold',
          nonCompeteEnforceable: isOrNonCompeteEnforceable({
            annualCompensationCents: comp,
            termMonths: body.termMonths,
            advanceNoticeDays: body.advanceNoticeDays,
          }),
        });
        return;
      }
      sendJson(res, 200, { kind: 'not_modeled' });
      return;
    }

    // ------------------------------------------------------------------
    // OregonSaves calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/oregon-saves/calculator') {
      const body = await parseJsonBody<{
        employeeCount: number;
        hasQualifiedRetirementPlan: boolean;
        fullYearsEnrolled: number;
        affectedEmployeeCount: number;
      }>(req);
      sendJson(res, 200, {
        mandatory: isOregonSavesMandatory(body.employeeCount, body.hasQualifiedRetirementPlan),
        contributionRate: oregonSavesContributionRate(body.fullYearsEnrolled),
        penaltyExposure: oregonSavesPenaltyExposure(body.affectedEmployeeCount),
      });
      return;
    }

    // ------------------------------------------------------------------
    // FLSA tip credit calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/tip-credit/calculator') {
      const body = await parseJsonBody<{
        checkDate: string;
        state: string;
        hoursWorked: number;
        tipsReceivedDollars: number;
        isManagerOrSupervisor: boolean;
        customarilyReceivesTips: boolean;
        employerTakesTipCredit: boolean;
      }>(req);
      const stateAnswer = stateTipCredit(body.checkDate, body.state);
      sendJson(res, 200, {
        stateAnswer,
        shortfall: tipCreditShortfall({
          hoursWorked: body.hoursWorked,
          cashWageCentsPerHour: stateAnswer.cashFloorCentsPerHour,
          tipsReceivedCents: dollars(body.tipsReceivedDollars),
          requiredMinimumWageCentsPerHour: stateAnswer.standardFloorCentsPerHour,
        }),
        tipPoolEligible: isEligibleForTipPool({
          isManagerOrSupervisor: body.isManagerOrSupervisor,
          customarilyReceivesTips: body.customarilyReceivesTips,
          employerTakesTipCredit: body.employerTakesTipCredit,
        }),
      });
      return;
    }

    // ------------------------------------------------------------------
    // California pay data reporting calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/ca-pay-data-report/calculator') {
      const body = await parseJsonBody<{
        payrollEmployeeCount: number;
        laborContractorEmployeeCount: number;
        annualEarningsDollars: number;
        reportingYear: number;
        penaltyEmployeeCount: number;
        isSubsequentFailure: boolean;
      }>(req);
      sendJson(res, 200, {
        requirement: caPayDataReportRequired(body.payrollEmployeeCount, body.laborContractorEmployeeCount),
        payBand: classifyCaPayBand(dollars(body.annualEarningsDollars)),
        filingDeadline: caPayDataFilingDeadline(body.reportingYear),
        penaltyExposure: caPayDataPenaltyExposure(body.penaltyEmployeeCount, body.isSubsequentFailure),
      });
      return;
    }

    // ------------------------------------------------------------------
    // State mini-WARN act calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/mini-warn/calculator') {
      const body = await parseJsonBody<{
        state: 'NY' | 'NJ' | 'CA';
        employerHeadcount: number;
        employeesAffected: number;
        activeWorkforceAtSite: number;
        relocationDistanceMiles: number;
        plannedActionDate: string;
        noticeServedDate: string;
        fullYearsOfService: number;
        weeklyPayDollars: number;
        noticeWasAdequate: boolean;
      }>(req);
      const result: Record<string, unknown> = {
        noticePeriodDays: miniWarnNoticePeriodDays(body.state),
        noticeDeadline: miniWarnNoticeDeadline(body.state, body.plannedActionDate),
      };
      if (body.state === 'NY') {
        result.coveredEmployer = isNyWarnCoveredEmployer(body.employerHeadcount);
        result.plantClosing = isNyPlantClosing(body.employeesAffected);
        result.massLayoff = isNyMassLayoff(body.employeesAffected, body.activeWorkforceAtSite);
      } else if (body.state === 'NJ') {
        result.coveredEmployer = isNjWarnCoveredEmployer(body.employerHeadcount);
        result.triggered = isNjWarnTriggered(body.employeesAffected);
        result.severanceOwed = njTotalSeveranceOwed(body.fullYearsOfService, dollars(body.weeklyPayDollars), body.noticeWasAdequate);
      } else if (body.state === 'CA') {
        result.coveredEmployer = isCaWarnCoveredEmployer(body.employerHeadcount);
        result.triggered = isCaWarnTriggered(body.employeesAffected);
        result.relocationTriggered = isCaWarnRelocationTriggered(body.relocationDistanceMiles);
      }
      sendJson(res, 200, result);
      return;
    }

    // ------------------------------------------------------------------
    // Oregon Fair Work Week Act calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/or-fair-work-week/calculator') {
      const body = await parseJsonBody<{
        employeeCountWorldwide: number;
        isNonExemptHourlyEmployee: boolean;
        changeMinutes: number;
        regularRateDollars: number;
        scheduledHoursNotWorked: number;
        hoursBetweenShifts: number;
        hoursWorkedDuringRestPeriod: number;
      }>(req);
      const rate = dollars(body.regularRateDollars);
      sendJson(res, 200, {
        coveredEmployer: isOrFairWorkWeekCoveredEmployer(body.employeeCountWorldwide, body.isNonExemptHourlyEmployee),
        deMinimis: isOrFairWorkWeekChangeDeMinimis(body.changeMinutes),
        additiveChangePay: orFairWorkWeekAdditiveChangePay(rate),
        subtractiveChangePay: orFairWorkWeekSubtractiveChangePay(rate, body.scheduledHoursNotWorked),
        restPeriodViolation: isOrFairWorkWeekRestPeriodViolation(body.hoursBetweenShifts),
        restPeriodPremiumPay: orFairWorkWeekRestPeriodPremiumPay(rate, body.hoursWorkedDuringRestPeriod),
      });
      return;
    }

    // ------------------------------------------------------------------
    // SECURE 2.0 auto-enrollment mandate calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/secure-auto-enrollment/calculator') {
      const body = await parseJsonBody<{
        planEstablishedDate: string;
        employeeCount: number;
        yearsInExistence: number;
        isGovernmentalPlan: boolean;
        isChurchPlan: boolean;
        isSimple401kPlan: boolean;
        planYearStartDate: string;
        initialRate: number;
        ceiling: number;
        fullPlanYearsElapsed: number;
        firstDefaultContributionDate: string;
        withdrawalRequestDate: string;
      }>(req);
      const exemption = {
        planEstablishedDate: body.planEstablishedDate,
        employeeCount: body.employeeCount,
        yearsInExistence: body.yearsInExistence,
        isGovernmentalPlan: body.isGovernmentalPlan,
        isChurchPlan: body.isChurchPlan,
        isSimple401kPlan: body.isSimple401kPlan,
      };
      sendJson(res, 200, {
        mandatory: isSecureAutoEnrollmentMandatory(exemption, body.planYearStartDate),
        initialRateValid: isSecureAutoEnrollmentInitialRateValid(body.initialRate),
        ceilingValid: isSecureAutoEnrollmentCeilingValid(body.ceiling),
        rateForPlanYear: secureAutoEnrollmentRateForPlanYear(body.initialRate, body.ceiling, body.fullPlanYearsElapsed),
        withdrawalDeadline: secureAutoEnrollmentWithdrawalDeadline(body.firstDefaultContributionDate),
        withinWithdrawalWindow: isWithinSecureAutoEnrollmentWithdrawalWindow(body.firstDefaultContributionDate, body.withdrawalRequestDate),
      });
      return;
    }

    // ------------------------------------------------------------------
    // CFRA (California Family Rights Act) calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/cfra/calculator') {
      const body = await parseJsonBody<{
        monthsEmployed: number;
        hoursOfServicePastTwelveMonths: number;
        employeeCount: number;
        regularlyScheduledWeeklyHours: number;
        hoursUsedThisPeriod: number;
        designatedPersonsUsedThisPeriod: number;
      }>(req);
      const eligibility = checkCfraEligibility({
        monthsEmployed: body.monthsEmployed,
        hoursOfServicePastTwelveMonths: body.hoursOfServicePastTwelveMonths,
        employeeCount: body.employeeCount,
      });
      const totalEntitlementHours = cfraHoursEntitlement(body.regularlyScheduledWeeklyHours);
      sendJson(res, 200, {
        eligibility,
        totalEntitlementHours,
        remainingHours: cfraHoursRemaining(totalEntitlementHours, body.hoursUsedThisPeriod),
        remainingDesignatedPersons: cfraDesignatedPersonsRemaining(body.designatedPersonsUsedThisPeriod),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Washington PFML calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/wa-pfml/calculator') {
      const body = await parseJsonBody<{ hoursWorkedInQualifyingPeriod: number; averageWeeklyWageDollars: number }>(req);
      sendJson(res, 200, {
        eligible: isWaPfmlEligible(body.hoursWorkedInQualifyingPeriod),
        weeklyBenefit: waPfmlWeeklyBenefit(dollars(body.averageWeeklyWageDollars)),
      });
      return;
    }

    // ------------------------------------------------------------------
    // COBRA general notice calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/cobra/general-notice-calculator') {
      const body = await parseJsonBody<{
        firstCoverageDate: string;
        electionNoticeDeadlineIfApplicable: string | null;
        daysLate: number;
        affectedBeneficiaryCount: number;
        moreThanOneFamilyMemberAffected: boolean;
      }>(req);
      sendJson(res, 200, {
        standardDeadline: generalNoticeDeadline(body.firstCoverageDate),
        applicableDeadline: generalNoticeDeadlineGivenPossibleElectionNotice(body.firstCoverageDate, body.electionNoticeDeadlineIfApplicable),
        erisaPenaltyExposure: erisaNoticePenaltyExposure(body.daysLate, body.affectedBeneficiaryCount),
        exciseTaxExposure: exciseTaxExposure(body.daysLate, body.moreThanOneFamilyMemberAffected),
      });
      return;
    }

    // ------------------------------------------------------------------
    // California Fair Chance Act calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/fair-chance-act/calculator') {
      const body = await parseJsonBody<{
        employeeCount: number;
        conditionalOfferMade: boolean;
        preliminaryNoticeDate: string;
        mailedDate: string;
        addressType: FairChanceMailingAddressType;
      }>(req);
      sendJson(res, 200, {
        coveredEmployer: isFairChanceActCoveredEmployer(body.employeeCount),
        inquiryPermitted: isCriminalHistoryInquiryPermitted(body.conditionalOfferMade),
        responseDeadline: fairChanceResponseDeadline(body.preliminaryNoticeDate),
        extendedResponseDeadline: fairChanceExtendedResponseDeadline(body.preliminaryNoticeDate),
        deemedReceivedDate: fairChanceDeemedReceivedDate(body.mailedDate, body.addressType),
      });
      return;
    }

    // ------------------------------------------------------------------
    // California salary history ban / pay scale transparency calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/salary-history-ban/calculator') {
      const body = await parseJsonBody<{
        employeeCount: number;
        isFirstViolation: boolean;
        allJobPostingsNowUpdated: boolean;
        consideredPenaltyDollars: number;
      }>(req);
      sendJson(res, 200, {
        jobPostingPayScaleRequired: isJobPostingPayScaleRequired(body.employeeCount),
        penaltyOwed: salaryHistoryBanPenaltyOwed(body.isFirstViolation, body.allJobPostingsNowUpdated, dollars(body.consideredPenaltyDollars)),
      });
      return;
    }

    // ------------------------------------------------------------------
    // New York pay transparency calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/ny-pay-transparency/calculator') {
      const body = await parseJsonBody<{ employeeCount: number; violationNumber: number }>(req);
      sendJson(res, 200, {
        required: isNyPayTransparencyRequired(body.employeeCount),
        penalty: nyPayTransparencyPenaltyForViolationNumber(body.violationNumber),
      });
      return;
    }

    // ------------------------------------------------------------------
    // Colorado Equal Pay for Equal Work Act, Part 2 calculator
    // ------------------------------------------------------------------

    if (req.method === 'POST' && url.pathname === '/api/co-epewa/calculator') {
      const body = await parseJsonBody<{
        employerPhysicallyLocatedInColorado: boolean;
        coloradoEmployeeCount: number;
        allColoradoEmployeesFullyRemote: boolean;
        decisionDate: string;
        dateLearnedOfViolation: string;
        consideredPerViolationPenalties: number[];
      }>(req);
      sendJson(res, 200, {
        noticeScope: coPromotionalNoticeScope({
          employerPhysicallyLocatedInColorado: body.employerPhysicallyLocatedInColorado,
          coloradoEmployeeCount: body.coloradoEmployeeCount,
          allColoradoEmployeesFullyRemote: body.allColoradoEmployeesFullyRemote,
          decisionDate: body.decisionDate,
        }),
        complaintDeadline: coEpewaComplaintDeadline(body.dateLearnedOfViolation),
        totalPenalty: coEpewaTotalPenalty(body.consideredPerViolationPenalties ?? []),
      });
      return;
    }

    const form1095cMatch = url.pathname.match(/^\/api\/employees\/([^/]+)\/1095c$/);
    if (req.method === 'POST' && form1095cMatch) {
      const employeeId = decodeURIComponent(form1095cMatch[1]);
      const employee = getEmployee(employeeId);
      if (!employee) return sendJson(res, 404, { error: 'No such employee.' });
      const body = await parseJsonBody<{ year: number; isFullTimeAllYear: boolean; policy: EmployerCoverageOfferPolicy }>(req);
      const summary = compute1095CForEmployee(employee, benefitElectionsForEmployee(employeeId), body.isFullTimeAllYear, body.policy, body.year);
      sendJson(res, 200, { form1095c: summary });
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
