import type { Cents } from '../src/money.ts';

/**
 * The trades domain model — everything a self-serve payroll product for the
 * specialized construction trades (plumbing, electrical, HVAC, sheet metal,
 * pipefitting, …) needs that neither the tax engine (src/) nor the general
 * payroll layer (payroll/) knows about: prevailing-wage determinations, the
 * jobs a crew splits its week across, and the per-classification rates a
 * worker is owed on public-works contracts.
 *
 * WHY this is its own layer, not more fields on payroll/types.ts's Employee:
 * a trades worker is not paid one rate for the period. A plumber can spend
 * Monday and Tuesday roughing-in a private remodel at the shop rate, then
 * Wednesday–Friday on a federally funded school under a Davis-Bacon wage
 * determination that dictates a HIGHER basic hourly rate AND an hourly
 * fringe obligation for the "Plumber" classification in that county. The
 * general engine's `hourlyRate × hours` (payroll/engine.ts `baseEarnings`)
 * cannot express that; this layer computes the compliant, multi-rate,
 * multi-job earnings for the week and hands the total to that engine through
 * its own `earningsOverride` seam, so tax, garnishment and direct deposit
 * still run once, unchanged.
 *
 * DISCLOSED, NOT BUILT — the wage-determination DATABASE. The federal
 * Davis-Bacon determinations (published at SAM.gov / beta.SAM) and the state
 * "little Davis-Bacon" schedules are a living legal dataset of the same size
 * and shape as this project's own minimum-wage and NCCI-workers'-comp
 * datasets: thousands of county × classification × construction-type rows,
 * reissued as modifications throughout the year. This layer does NOT ship or
 * maintain that dataset. A `WageDetermination` is caller-supplied — the same
 * "the rate is a fact you give us, never one we guess" discipline
 * src/types.ts's EmployerContext uses for the SUI rate and
 * payroll/workersComp.ts uses for a class-code rate. What this layer OWNS is
 * the arithmetic and compliance logic that a correct rate flows through.
 */

/**
 * A labor category as a wage determination names it. The `code` is a stable
 * key the caller assigns and reuses across WorkedHours, worker profiles and
 * the determination itself — the determination's own printed title (e.g.
 * "Plumber", "Plumber, Apprentice — 1st period, 50%") lives in `title`.
 */
export interface TradeClassification {
  code: string;
  title: string;
  /** The trade grouping this classification sits under — 'Plumbing', 'Electrical', 'HVAC/Sheet Metal', … — for rollups and for defaulting a workers'-comp class code. Descriptive only; the wage math keys on `code`. */
  trade: string;
  /**
   * Apprentice percentage of the journeyworker rate, when this classification
   * is a registered-apprenticeship step (0.50 = 50% of journeyworker base).
   * Absent for a journeyworker classification. Purely informational here —
   * the determination still carries this apprentice step's OWN absolute base
   * and fringe rates, which is what the math uses; this field just records
   * why one classification's rate is a fraction of another's.
   */
  apprenticePercent?: number;
}

/**
 * One effective-dated prevailing-wage line: for a single classification, the
 * basic hourly rate ("BHR") and the hourly fringe obligation in force from
 * `effectiveDate` forward, until a later line for the same classification
 * supersedes it. The exact effective-dated, "selected by the date on the
 * cheque" shape src/registry.ts uses for tax rulesets — a determination
 * modification mid-project changes rates going forward without rewriting
 * history, and a paycheck always resolves the line in force on its own work
 * dates.
 */
export interface WageDeterminationRate {
  classificationCode: string;
  /** The basic hourly rate — the cash wage floor for straight time, and the ONLY component the overtime premium is computed on (fringe is excluded — see prevailingWage.ts). */
  baseHourlyRateCents: Cents;
  /** The fringe-benefit obligation per hour worked, discharged in cash, by bona-fide plan contributions, or a mix. Paid on ALL hours at straight value (never multiplied by the overtime premium). */
  fringePerHourCents: Cents;
  /** ISO yyyy-mm-dd; this line is in force on work performed on or after this date, until a later line for the same classification takes over. */
  effectiveDate: string;
}

export type ConstructionType = 'building' | 'residential' | 'highway' | 'heavy';

/**
 * A published wage determination the employer is working under on a public
 * contract — a federal Davis-Bacon "WD" or a state prevailing-wage schedule.
 * Scoped to a jurisdiction and construction type (a determination's rates are
 * specific to both), holding one or more effective-dated rate lines per
 * classification.
 */
export interface WageDetermination {
  /** The determination's own published identifier, e.g. a Davis-Bacon number like 'OH20240012' or a state schedule id. Caller-supplied and opaque to this layer. */
  id: string;
  authority: 'davis-bacon' | 'state-prevailing-wage';
  /** Two-letter state code the determination covers. */
  state: string;
  /** County or locality the determination names — kept as the determination itself prints it, not resolved to a FIPS code here. */
  locality: string;
  constructionType: ConstructionType;
  rates: WageDeterminationRate[];
}

/** An employer contribution to a bona-fide fringe plan, per hour worked, creditable against a prevailing-wage fringe obligation — see prevailingWage.ts on what "creditable" requires. */
export interface FringeCredit {
  /** The plan the contribution goes to — 'Health & Welfare', 'Pension', 'Apprenticeship Training', 'Vacation/Holiday'. Free text; used on the Statement of Compliance. */
  plan: string;
  ratePerHourCents: Cents;
}

/**
 * The trades-specific profile layered onto a payroll Employee, keyed by that
 * employee's id. Separate record (not fields on Employee) because most of a
 * company's employees are not tradesworkers, and because a worker's per-
 * classification rates and fringe-plan contributions are exactly the data a
 * prevailing-wage calculation needs and ordinary payroll never touches.
 */
export interface TradeWorkerProfile {
  employeeId: string;
  /**
   * The cash base rates the employer pays THIS worker per classification —
   * the worker's own "shop rate" for that kind of work. A classification the
   * worker performs but has no entry for here falls back to the Employee's
   * single payType hourlyRate. On a public job the effective base rate is
   * the HIGHER of this shop rate and the determination's basic hourly rate,
   * so a shop rate below prevailing is automatically made up (and surfaced as
   * a compliance finding — see prevailingWage.ts).
   */
  classificationRates: { classificationCode: string; baseRateCents: Cents }[];
  /**
   * Employer contributions to bona-fide fringe plans on this worker's behalf,
   * per hour worked, that offset a prevailing-wage fringe obligation. Applied
   * to hours worked on ANY public job unless a job overrides them; a private
   * job has no fringe obligation for them to offset, but the employer still
   * pays them (they remain a real labor cost — see jobCosting.ts).
   */
  fringeCredits: FringeCredit[];
  /**
   * Regular crew vs. a seasonal helper (a summer laborer, a storm-season temp).
   * Seasonal is purely a label for the roster and billing views — it changes no
   * pay math; a seasonal helper's `seasonEndDate` and the payroll Employee's own
   * terminationDate are what actually take them off active payroll. Defaults to
   * regular when absent.
   */
  employmentType?: 'regular' | 'seasonal';
  /** For a seasonal helper: the last day of their season (ISO yyyy-mm-dd), shown on the roster so a temp isn't left on the books past their season. */
  seasonEndDate?: string;
  /** Mobile number for hour-log nudges (see nudge.ts). E.164 or local; this layer does not validate it — the SMS carrier does. */
  phone?: string;
}

/**
 * Hours a worker reported against one job, one classification, on one day.
 * The atomic input to the whole trades pipeline — a week of these for a
 * worker is what the prevailing-wage resolver splits into straight time and
 * overtime and prices. Overtime is NEVER entered here: it is DERIVED from the
 * 40-hour weekly threshold across all of a worker's hours (see
 * prevailingWage.ts), because a single day's entry cannot know whether it
 * crosses 40 for the week until every other day is counted.
 */
export interface WorkedHours {
  employeeId: string;
  jobId: string;
  date: string; // ISO yyyy-mm-dd
  classificationCode: string;
  hours: number;
}

/**
 * A job (project) the company runs payroll against. A private job has no
 * `prevailingWage` block and no fringe obligation; a public-works job carries
 * the determination it falls under, which turns on prevailing-wage pricing
 * and makes a weekly certified-payroll report (WH-347) owed for it.
 */
export interface Job {
  id: string;
  companyId: string;
  name: string;
  /** Two-letter state the work is performed in — drives which state's overtime overlay and workers'-comp rules apply. */
  workState: string;
  /** County/locality label, for matching against a determination's own locality and for the certified-payroll header. */
  workLocality?: string;
  /**
   * Present only on a public-works job. `determinationId` must resolve to a
   * WageDetermination the caller supplies to the resolver; a job that names a
   * determination the resolver was not given is a hard error there, never a
   * silent fall-through to private-job pricing (a silent fall-through is how
   * an employer underpays prevailing wage without knowing it).
   */
  prevailingWage?: {
    determinationId: string;
    /** The federal contract/project number, for the WH-347 header. */
    contractNumber?: string;
    /** A human label for the awarding agency / project, for the WH-347 header. */
    projectName?: string;
  };
  /**
   * The workers'-comp classification code for work on this job, overriding
   * each worker's own default. Trades WC codes are assigned by the kind of
   * work, not the worker (the same plumber is a different class code doing
   * new construction vs. service work), so the job is the natural place for
   * it. Falls back to the Employee.workersCompClassCode when absent.
   */
  workersCompClassCode?: string;
  /** General-ledger cost code for this job, passed through to job-cost output for the caller's accounting export. */
  glCostCode?: string;
  /**
   * The job-site location and how close a worker must be to clock in there.
   * Present turns on geofenced clock-ins for the job (see trades/geofence.ts):
   * a punch outside the radius is recorded but flagged, so time from the wrong
   * site is caught at the source instead of on the certified payroll. Absent
   * means clock-ins are accepted anywhere (a shop with no field geofencing).
   */
  location?: { lat: number; lng: number; radiusMeters: number };
}
