import { applyRate, atLeastZero, dollars, fmt, roundHalfUp, toWholeDollars, underCap } from '../money.ts';
import type { StateRuleset } from '../registry.ts';
import {
  countyRuleset,
  federalRuleset,
  hasCountyRuleset,
  hasStateRuleset,
  stateRuleset,
} from '../registry.ts';
import { supplementalEarnings } from '../wages.ts';
import type {
  ComputeContext,
  PaycheckInput,
  PretaxCategory,
  TaxLine,
} from '../types.ts';

/**
 * State income tax withholding.
 *
 * Methods are dispatched from the ruleset's `method` field rather than from
 * code branches keyed on state code, so adding a state that fits an existing
 * pattern is a data-only change. Only genuinely novel formulas need a new
 * method here.
 */
export function stateIncomeTax(
  input: PaycheckInput,
  ctx: ComputeContext,
): TaxLine[] {
  const state = input.workState;
  if (!state) return [];

  if (!hasStateRuleset(state.code, input.checkDate)) {
    // Silence here would be the dangerous outcome: a missing state would look
    // like a state with no income tax. Surface it as an explicit line.
    return [
      {
        id: `${state.code}_SIT`,
        name: `${state.code} Income Tax`,
        payer: 'employee',
        jurisdiction: 'state',
        taxableWages: 0,
        amount: 0,
        detail: `NOT MODELLED — no ruleset for ${state.code} in ${input.checkDate.slice(0, 4)}. Do not treat as zero-tax.`,
      },
    ];
  }

  const rules = stateRuleset(state.code, input.checkDate);

  // incomeTaxLines() ALWAYS runs first, even when reciprocity/de minimis/an
  // exemption certificate will zero the result — deliberately, NOT an
  // early-return. Indiana is why: its own reciprocity block documents that a
  // reciprocal nonresident is exempt from STATE tax only, and the employer
  // "remains responsible for withholding any applicable Indiana County
  // taxes" regardless. flatRateMultiExemption() returns BOTH an IN_SIT line
  // and an IN_COUNTY line; an early-return that replaced the whole array
  // with one $0 line would have silently deleted a county tax that was still
  // legally owed. Zeroing by id PREFIX (`${code}_SIT`) instead of replacing
  // the array keeps IN_COUNTY (and any other non-`_SIT`-prefixed line, e.g.
  // stateUnemploymentEmployeeTax's `${code}_UC_EE`) untouched no matter which
  // of these exemptions applies.
  let lines = incomeTaxLines(input, ctx, rules);

  // Reciprocity and the nonresident de minimis threshold are both read
  // generically off rules.reciprocity, so every state file that already
  // documents reciprocalStates (IL/IN/KY/MI/MN/OH/PA/WI) goes live the
  // moment a caller populates input.residenceState — no per-state code
  // change needed, matching this file's "data-only" ethos. Reciprocity is
  // checked first; de minimis only matters when reciprocity didn't already
  // resolve it.
  const reciprocityReason = reciprocityExemptionReason(input, rules);
  const deMinimisReason = reciprocityReason
    ? null
    : nonresidentDeMinimisReason(input, ctx, rules);
  const exemptReason = reciprocityReason ?? deMinimisReason;
  if (exemptReason) {
    lines = zeroStateIncomeTaxLines(rules, lines, exemptReason);
  } else {
    lines = applyStateWithholdingExemption(input, rules, lines);
  }

  // Additional withholding never applies once reciprocity/de minimis/an
  // exemption certificate has already zeroed the state line — an employee
  // legally owing $0 to this state isn't also topping that $0 up.
  if (!exemptReason) {
    lines = applyAdditionalStateWithholding(input, rules, lines);
  }

  // Employee-paid state unemployment withholding (Pennsylvania's UC tax is
  // the first state in this project to have one) is ORTHOGONAL to the
  // income-tax method above — it's a separate levy under separate law, not
  // another income-tax bracket — so it's dispatched on the presence of a
  // `stateUnemploymentEmployee` config block rather than being wired into
  // any one method. Any future state with an employee-paid SUTA/UC
  // component gets this for free by adding the config, no code change.
  // Runs regardless of income-tax reciprocity/exemption above: UC and Paid
  // Leave are separate levies under separate statutes, not exemptable via an
  // income-tax reciprocity agreement or a Section-2-style income-tax
  // exemption certificate.
  if (rules.stateUnemploymentEmployee) {
    lines.push(stateUnemploymentEmployeeTax(input, ctx, rules));
  }

  const paidLeave = statePaidLeaveEmployeeTax(input, ctx, rules);
  if (paidLeave) lines.push(paidLeave);

  const disability = stateDisabilityEmployeeTax(input, ctx, rules);
  if (disability) lines.push(disability);

  // New York City resident tax — a genuine LOCAL tax layered on top of NYS
  // withholding for NYC residents only, dispatched off certificate.nycResident
  // (IT-2104's own Yes/No question) rather than a separate certificate.
  // Runs regardless of NYS reciprocity/exemption above: NYC's own tax has no
  // reciprocity concept (it only ever applies to NYC residents, who by
  // definition aren't a reciprocal-state nonresident) and no exemption
  // certificate of its own was found in NYS-50-T-NYC or IT-2104.
  const nyc = nycLocalTax(input, ctx, rules);
  if (nyc) lines.push(nyc);
  const nycSupp = nycSupplementalTax(input, ctx, rules);
  if (nycSupp) lines.push(nycSupp);

  // Yonkers — a genuine LOCAL tax with two mutually exclusive shapes: a
  // RESIDENT surcharge (16.75% of the exact same NYS-style calculation
  // above, via computeNYSStyleTax()) or a NONRESIDENT earnings tax (a flat
  // 0.50% of gross wages after a wage-level step-function exemption, for
  // people who work in Yonkers without residing there) — never both.
  const yonkers = yonkersLocalTax(input, ctx, rules);
  if (yonkers) lines.push(yonkers);
  const yonkersSupp = yonkersSupplementalTax(input, ctx, rules);
  if (yonkersSupp) lines.push(yonkersSupp);

  return lines;
}

interface ReciprocityConfig {
  reciprocalStates?: string[];
  nonresidentDeMinimisThreshold?: number; // dollars, annual
}

/**
 * Zeroes every line whose id starts with `${rules.code}_SIT` — the
 * income-tax line(s) specifically — leaving every other line (a mandatory
 * local/county add-on like Indiana's IN_COUNTY, stateUnemploymentEmployeeTax's
 * `${code}_UC_EE`, Paid Leave's `${code}_PFML_EE`) untouched. This is the ONE
 * shared mechanism behind reciprocity, the nonresident de minimis threshold,
 * and an employee-claimed withholding-exemption certificate — all three are
 * "this employee owes $0 of THIS STATE's income tax," never "this employee
 * owes $0 of everything this state might ever withhold." Indiana is why this
 * matters concretely: WH-47 reciprocity exempts state tax only, and the
 * employer "remains responsible for withholding any applicable Indiana
 * County taxes" regardless — a wholesale line-array replacement would have
 * silently deleted a county tax still legally owed.
 */
function zeroStateIncomeTaxLines(
  rules: StateRuleset,
  lines: TaxLine[],
  reason: string,
): TaxLine[] {
  const prefix = `${rules.code}_SIT`;
  return lines.map((line) =>
    line.id.startsWith(prefix)
      ? { ...line, taxableWages: 0, amount: 0, detail: reason }
      : line,
  );
}

/**
 * Reciprocity exemption — a resident of a state with an ACTIVE reciprocal
 * agreement working here owes no INCOME TAX withholding to the work state
 * (e.g. a Michigan resident working in Minnesota with Form MWR on file).
 * Read generically off rules.reciprocity.reciprocalStates, which every
 * reciprocity block in this project already carries in the same shape.
 *
 * Simplification, disclosed rather than hidden: this checks ONLY that
 * input.residenceState.code appears in the work state's reciprocalStates
 * list. It does not model the underlying paperwork (Form MWR, REV-419, Form
 * K-4, WH-47, etc.) that a real employer would need on file before stopping
 * withholding — the same trust-the-input assumption this engine already
 * makes for W-4 elections generally. Returns null (no exemption) whenever
 * residenceState is absent, matching the work state, or not on the list, so
 * every existing caller that never sets residenceState is unaffected.
 *
 * Returns a REASON STRING, not a TaxLine — the caller decides what to zero
 * (see zeroStateIncomeTaxLines) rather than this function assuming it should
 * replace everything.
 */
function reciprocityExemptionReason(
  input: PaycheckInput,
  rules: StateRuleset,
): string | null {
  const reciprocity = rules.reciprocity as ReciprocityConfig | undefined;
  const reciprocalStates = reciprocity?.reciprocalStates;
  if (!reciprocalStates || reciprocalStates.length === 0) return null;

  const residence = input.residenceState?.code;
  if (!residence || residence === rules.code) return null;
  if (!reciprocalStates.includes(residence)) return null;

  return (
    `$0 — reciprocity exemption: employee resides in ${residence}, which has an ` +
    `active reciprocal agreement with ${rules.code}. Assumes the required reciprocity ` +
    `certificate is on file; this engine does not separately verify that filing. Applies ` +
    `to ${rules.code} income tax only — any separate local/county tax this state levies ` +
    `is unaffected.`
  );
}

/**
 * Nonresident de minimis threshold — some states (Minnesota, via wh-inst-26
 * p.4) don't require ANY income-tax withholding from a nonresident if the
 * employer doesn't expect to pay them at least a stated annual amount,
 * independent of reciprocity. Read generically off
 * rules.reciprocity.nonresidentDeMinimisThreshold; states without that field
 * (most of them) simply never trigger this.
 *
 * Uses the SAME annualization ctx.taxableWagesFor()/periodsPerYear already
 * uses elsewhere in this file — an estimate from the current cheque, not a
 * true year-to-date total, the same approximation every other
 * annualize-then-bracket method in this project already makes.
 */
function nonresidentDeMinimisReason(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): string | null {
  const reciprocity = rules.reciprocity as ReciprocityConfig | undefined;
  const threshold = reciprocity?.nonresidentDeMinimisThreshold;
  if (threshold === undefined) return null;

  const residence = input.residenceState?.code;
  if (!residence || residence === rules.code) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const estimatedAnnualWages = ctx.taxableWagesFor(exempt) * ctx.periodsPerYear;
  if (estimatedAnnualWages >= dollars(threshold)) return null;

  return (
    `$0 — nonresident de minimis: estimated annual wages ${fmt(estimatedAnnualWages)} are ` +
    `below ${rules.name}'s $${threshold} nonresident withholding threshold.`
  );
}

/**
 * Employee-claimed exemption from state withholding (Minnesota's W-4MN
 * Section 2 is the first concrete, enumerable example in this project, but
 * read generically off certificate.exempt so any future state's own
 * exemption certificate gets this for free). Mirrors federalW4.exempt's
 * short-circuit-to-$0 behavior in taxes/federal.ts, but implemented as a
 * post-processing step here rather than inside every method function, so it
 * doesn't have to be re-implemented per method the way federal's single
 * function could just early-return.
 */
function applyStateWithholdingExemption(
  input: PaycheckInput,
  rules: StateRuleset,
  lines: TaxLine[],
): TaxLine[] {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (!cert.exempt) return lines;

  return zeroStateIncomeTaxLines(
    rules,
    lines,
    `$0 — employee claimed exempt from ${rules.name} withholding (certificate.exempt).`,
  );
}

/**
 * Additional flat per-period withholding requested by the employee beyond
 * what the formula computes — Minnesota's W-4MN Section 1 Line 2 is the
 * first concrete example, but read generically off
 * certificate.additionalWithholding, the state-level equivalent of
 * federalW4.extraWithholding (Step 4(c)) in taxes/federal.ts. Skipped
 * entirely when the employee is exempt (cert.exempt), mirroring federal's
 * own precedence: exempt short-circuits before extra withholding is ever
 * considered. Applied only to the PRIMARY `${code}_SIT` line, not the
 * supplemental line, matching the form's own framing of "per pay period"
 * regular withholding.
 */
function applyAdditionalStateWithholding(
  input: PaycheckInput,
  rules: StateRuleset,
  lines: TaxLine[],
): TaxLine[] {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.exempt) return lines;

  // Montana's Form MW-4 is explicit that its own "extra withholding" (line
  // 3) and "specified withholding" (line 4) are mutually exclusive — "If
  // you are an employee and enter an amount on this line, DO NOT complete
  // lines 1, 2, or 3." bracketPerPeriodGross() already produces the
  // specified-withholding line without ever reading additionalWithholding,
  // but this guard keeps that true even if a caller populates both fields
  // by mistake, rather than silently stacking them.
  if (Number(cert.specifiedWithholding ?? 0) > 0) return lines;

  // Cents already, matching federalW4.extraWithholding's convention — NOT a
  // dollars-file figure needing dollars() conversion. A caller supplies
  // dollars(50), not 50.
  const extra = Number(cert.additionalWithholding ?? 0);
  if (extra <= 0) return lines;

  const primaryId = `${rules.code}_SIT`;
  return lines.map((line) =>
    line.id === primaryId
      ? {
          ...line,
          amount: line.amount + extra,
          detail: `${line.detail}; plus ${fmt(extra)} additional withholding requested (certificate.additionalWithholding)`,
        }
      : line,
  );
}

function incomeTaxLines(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine[] {
  switch (rules.method) {
    case 'flat_rate':
      return [flatRate(input, ctx, rules)];
    case 'flat_rate_multi_exemption':
      return flatRateMultiExemption(input, ctx, rules);
    case 'flat_rate_two_tier_exemption':
      return [flatRateTwoTierExemption(input, ctx, rules)];
    case 'bracket_phaseout_deduction': {
      const lines: TaxLine[] = [bracketPhaseoutDeduction(input, ctx, rules)];
      const supplemental = bracketSupplementalTax(input, ctx, rules);
      if (supplemental) lines.push(supplemental);
      return lines;
    }
    case 'flat_rate_fixed_deduction':
      return [flatRateFixedDeduction(input, ctx, rules)];
    case 'bracket_flat_allowance': {
      const lines: TaxLine[] = [bracketFlatAllowance(input, ctx, rules)];
      const supplemental = flatRateSupplementalTax(input, ctx, rules);
      if (supplemental) lines.push(supplemental);
      return lines;
    }
    case 'bracket_per_period_gross': {
      const lines: TaxLine[] = [bracketPerPeriodGross(input, ctx, rules)];
      const supplemental = montanaSupplementalTax(input, ctx, rules);
      if (supplemental) lines.push(supplemental);
      return lines;
    }
    case 'bracket_per_period_net': {
      const lines: TaxLine[] = [bracketPerPeriodNet(input, ctx, rules)];
      const supplemental = flatRateSupplementalFromConfig(input, ctx, rules);
      if (supplemental) lines.push(supplemental);
      return lines;
    }
    case 'bracket_per_period_rate_table':
      return [bracketPerPeriodRateTable(input, ctx, rules)];
    case 'bracket_two_status_per_period':
      return [bracketTwoStatusPerPeriod(input, ctx, rules)];
    case 'no_income_tax':
      return [];
    default:
      throw new Error(
        `Unsupported withholding method "${rules.method}" for ${rules.code}`,
      );
  }
}

interface StateUnemploymentEmployeeConfig {
  rate: number;
  wageBase: number | null;
}

/**
 * Employee-paid state unemployment compensation withholding — Pennsylvania
 * is unusual among states in taxing the EMPLOYEE for UC, not just the
 * employer (see futa() in taxes/federal.ts for the ordinary employer-only
 * shape). Confirmed uncapped for PA (wageBase: null) directly from the
 * Department of Labor & Industry: "Employee contributions are based on an
 * individual's total (gross) wages and are not limited to the taxable wage
 * base in effect for employer contributions."
 *
 * A non-null wageBase routes through underCap() with YTD wages tracked in
 * input.ytd.stateUnemployment, the same wage-base/YTD mechanism
 * statePaidLeaveEmployeeTax() already uses — added for New Jersey, whose
 * combined UI/Workforce/Supplemental-Workforce employee contribution IS
 * capped at the state's UI taxable wage base (unlike PA's UC, which is not).
 * Before New Jersey, this field only ever held null (PA), so this branch was
 * previously unreachable — a latent gap in what the detail string already
 * claimed ("capped at X/yr") versus what amount actually computed, now
 * fixed.
 */
function stateUnemploymentEmployeeTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.stateUnemploymentEmployee as StateUnemploymentEmployeeConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const currentWages = ctx.taxableWagesFor(exempt);

  const cap = cfg.wageBase === null ? null : dollars(cfg.wageBase);
  const ytd = input.ytd.stateUnemployment?.[rules.code] ?? 0;
  const taxableWages = cap === null ? currentWages : underCap(currentWages, ytd, cap);
  const amount = applyRate(taxableWages, cfg.rate);

  return {
    id: `${rules.code}_UC_EE`,
    name: `${rules.name} Unemployment Compensation (Employee)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      cfg.wageBase === null
        ? `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%, no wage cap`
        : `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%, capped at ${fmt(dollars(cfg.wageBase))}/yr (${fmt(ytd)} YTD already counted)`,
  };
}

interface FlatRateConfig {
  rate: number;
  allowanceAmount: number;
}

function flatRate(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRate as FlatRateConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);

  // Annualise so that allowances (an annual figure) apply proportionally.
  const allowances = Number(input.workState?.certificate?.allowances ?? 0);
  const annualAllowance = dollars(cfg.allowanceAmount) * allowances;
  const annualWages = taxableWages * ctx.periodsPerYear;
  const annualTaxable = atLeastZero(annualWages - annualAllowance);

  const annualTax = applyRate(annualTaxable, cfg.rate);
  const amount = Math.round(annualTax / ctx.periodsPerYear);

  const detail = annualAllowance
    ? `${fmt(annualWages)}/yr less ${fmt(annualAllowance)} allowances @ ${(cfg.rate * 100).toFixed(2)}%`
    : `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%`;

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail,
  };
}

interface FixedDeductionConfig {
  rate: number;
  deductionAmount: number; // dollars, flat ANNUAL amount subtracted once
}

/**
 * Flat state rate over annual wages less a FIXED annual deduction — no
 * certificate-driven multiplier at all, unlike flatRate() (PA/MI's
 * allowanceAmount × certificate.allowances). Built for Kentucky: Form K-4
 * (fetched and read directly from revenue.ky.gov) has no personal/dependent
 * exemption COUNT field anywhere on it — the $3,360 standard deduction
 * applies once per employee, unconditionally, regardless of dependents.
 * Reusing flatRate() here would require every caller to remember to pass
 * certificate.allowances = 1 (never the natural default of 0) to get the
 * correct deduction — a footgun this method removes by construction instead
 * of documenting around it.
 *
 * SUPPLEMENTAL WAGES ARE DELIBERATELY NOT CARVED OUT of `taxableWages` here.
 * An earlier version of this function copied Wisconsin's pattern (split
 * supplemental into its own flat-rate line) on the assumption that Kentucky
 * would need the same double-counting guard federal/WI supplemental wages
 * need. That assumption was wrong: 103 KAR 18:070 Section 3 (fetched and
 * read directly) prescribes AGGREGATION, not a separate rate — "If
 * supplemental wages are paid at the same time as regular wages, the tax to
 * be withheld shall be determined as if the aggregate of the supplemental
 * and regular wages were a single wage payment." So for any single
 * calculatePaycheck() call (which models one paycheck, i.e. wages paid "at
 * the same time"), the CORRECT behavior is exactly what taxableWagesFor()
 * already returns with no special-casing — regular and supplemental cash
 * combined, deduction applied once to the combined total. Carving
 * supplemental out and taxing it flatly, as the earlier version did, would
 * have UNDER-withheld relative to Kentucky's own prescribed method whenever
 * combined annual wages crossed into taxable territory only because of the
 * supplemental amount.
 *
 * NOT MODELLED (disclosed, not guessed): 103 KAR 18:070 Section 3(2) — when
 * supplemental wages are paid on a SEPARATE cheque from regular wages, they
 * must be aggregated with the CURRENT or LAST PRECEDING payroll period's
 * regular wages, not treated as their own standalone payment. A standalone
 * bonus run through calculatePaycheck() by itself (no earnings but the
 * bonus) cannot reproduce this — the engine has no mechanism to look back at
 * a prior period's regular wages, the same class of cross-period gap already
 * disclosed for Indiana's 30-day nonresident rule and Michigan's Renaissance
 * Zone. A standalone-bonus cheque will therefore UNDER-withhold relative to
 * Kentucky's actual rule (it gets the $3,360 deduction as if it were a full
 * period's only wages, when 103 KAR 18:070 says it should be combined with
 * an already-deduction-consuming regular payment instead).
 *
 * DATE CAVEAT: the fetched copy of 103 KAR 18:070 is captioned "[Effective
 * 7/27/2026]" by Cornell LII — a recertification date, not necessarily a
 * substantive rule change (KAR regulations are periodically re-filed under
 * Kentucky's administrative review process). Whether the aggregation
 * mechanic itself differs from what was in force 2026-01-01 through
 * 2026-07-26 was NOT separately checked this session — same class of
 * disclosed gap as Ohio's HB96 mid-year rate change, and this engine has no
 * date-based dispatch for either.
 *
 * Verified against the DOR's own 2026 Withholding Tax Formula (42A003 TCF)
 * worked examples — see tests/engine.test.ts, describe('Kentucky'). The
 * monthly example reproduces to the cent ($104.65); the biweekly example
 * reproduces the CORRECTED figure ($47.98), not the source document's own
 * truncated "$47" — see that test's comment for the arithmetic.
 */
function flatRateFixedDeduction(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRate as FixedDeductionConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);

  const annualWages = taxableWages * ctx.periodsPerYear;
  const annualDeduction = dollars(cfg.deductionAmount);
  const annualTaxable = atLeastZero(annualWages - annualDeduction);

  const annualTax = applyRate(annualTaxable, cfg.rate);
  const amount = Math.round(annualTax / ctx.periodsPerYear);

  const detail =
    `${fmt(annualWages)}/yr less ${fmt(annualDeduction)} standard deduction ` +
    `@ ${(cfg.rate * 100).toFixed(2)}%, ÷ ${ctx.periodsPerYear}`;

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail,
  };
}

/**
 * Per-period constant for one exemption tier: an ANNUAL dollar amount times a
 * claimed count, divided by pay periods, rounded at THIS step rather than
 * summed-then-rounded-once. Shared by every multi-tier-exemption state
 * because each one's own published tables are pre-computed and pre-rounded
 * per period the same way (Indiana's Table A/B/C, Illinois's per-period
 * exemption figures) — rounding once at the end can differ from that by a
 * cent, so this reproduces the states' own arithmetic instead of a cleaner
 * but non-matching approximation.
 */
function perPeriodExemptionConstant(
  annualPerExemption: number,
  count: number,
  periodsPerYear: number,
): number {
  return roundHalfUp((dollars(annualPerExemption) * count) / periodsPerYear);
}

interface MultiExemptionRateConfig {
  rate: number;
}

interface ExemptionTiers {
  personal: number;
  dependent: number;
  firstTimeDependent: number;
  adoptedChild: number;
}

/**
 * Flat state rate over a base reduced by MULTIPLE exemption tiers (Indiana's
 * WH-4: personal, dependent, first-time-additional-dependent, adopted child —
 * each a different annual dollar amount), stacked with a MANDATORY county
 * add-on rate resolved from workState.certificate.county.
 *
 * Unlike flatRate() (built for PA/MI's single allowance-amount-times-count
 * model), this method also emits a `jurisdiction: 'local'` line alongside the
 * state line, because Indiana's own published method computes both taxes off
 * the exact same reduced base in one step (see Departmental Notice #1's own
 * worked example) — splitting them into two engine passes would risk the two
 * lines disagreeing on taxable wages for no real reason.
 */
function flatRateMultiExemption(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine[] {
  const cfg = rules.flatRate as MultiExemptionRateConfig;
  const tiers = rules.exemptionTiers as ExemptionTiers;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const personal = Number(cert.personalExemptions ?? 0);
  const dependent = Number(cert.dependentExemptions ?? 0);
  const firstTimeDependent = Number(cert.firstTimeDependentExemptions ?? 0);
  const adoptedChild = Number(cert.adoptedChildExemptions ?? 0);

  const perPeriod = ctx.periodsPerYear;
  const periodAllowance =
    perPeriodExemptionConstant(tiers.personal, personal, perPeriod) +
    perPeriodExemptionConstant(tiers.dependent, dependent, perPeriod) +
    perPeriodExemptionConstant(tiers.firstTimeDependent, firstTimeDependent, perPeriod) +
    perPeriodExemptionConstant(tiers.adoptedChild, adoptedChild, perPeriod);

  const periodTaxable = atLeastZero(taxableWages - periodAllowance);
  const stateAmount = applyRate(periodTaxable, cfg.rate);

  const stateLine: TaxLine = {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodTaxable,
    amount: stateAmount,
    detail: periodAllowance
      ? `${fmt(taxableWages)} less ${fmt(periodAllowance)} exemptions @ ${(cfg.rate * 100).toFixed(2)}%`
      : `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%`,
  };

  return [stateLine, countyAddOnLine(input, rules, periodTaxable)];
}

/**
 * County add-on line for states where county tax is mandatory and shares the
 * state's own reduced taxable base (Indiana). Resolved from
 * workState.certificate.county — NOT from any residence-vs-work-location
 * determination, which this engine does not implement for any state yet;
 * the caller is responsible for having already resolved which county
 * applies (see data/local/IN-counties-2026.json's rateBasis.rule).
 */
function countyAddOnLine(
  input: PaycheckInput,
  rules: StateRuleset,
  periodTaxable: number,
): TaxLine {
  const state = rules.code;
  const notModelled = (detail: string): TaxLine => ({
    id: `${state}_COUNTY`,
    name: `${state} County Income Tax`,
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: 0,
    amount: 0,
    detail: `NOT MODELLED — ${detail} Do not treat as zero-tax.`,
  });

  if (!hasCountyRuleset(state, input.checkDate)) {
    return notModelled(`no county registry for ${state}.`);
  }

  const countyName = input.workState?.certificate?.county;
  if (typeof countyName !== 'string' || countyName.trim() === '') {
    return notModelled(
      `no county specified on workState.certificate.county. ${state} taxes every address.`,
    );
  }

  const county = countyRuleset(state, countyName, input.checkDate);
  if (!county) {
    return notModelled(`"${countyName}" not found in the ${state} county registry.`);
  }

  return {
    id: `${state}_COUNTY`,
    name: `${county.name} County Income Tax`,
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: periodTaxable,
    amount: applyRate(periodTaxable, county.rate),
    detail: `${fmt(periodTaxable)} @ ${(county.rate * 100).toFixed(4)}% (${county.name} County)`,
  };
}

interface TwoTierRateConfig {
  rate: number;
}

interface TwoTierExemptionTiers {
  basic: number;
  additional: number;
}

/**
 * Flat state rate over a base reduced by TWO exemption tiers (Illinois's
 * IL-W-4: Line 1 basic personal/dependency allowances, Line 2 "additional"
 * allowances covering 65-or-older/blind plus a federal-W-4-deductions-linked
 * amount) — genuinely different from both flatRate() (PA/MI's single tier)
 * and flatRateMultiExemption() (Indiana's four tiers PLUS a mandatory county
 * add-on). Illinois has NO local income tax anywhere in the state, so unlike
 * Indiana this returns a single TaxLine, not a pair — emitting a spurious
 * "county" line here would misrepresent a jurisdiction type that simply
 * doesn't exist for Illinois, which is different from Indiana's "exists but
 * unresolved" case.
 */
function flatRateTwoTierExemption(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRate as TwoTierRateConfig;
  const tiers = rules.exemptionTiers as TwoTierExemptionTiers;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const basic = Number(cert.basicAllowances ?? 0);
  const additional = Number(cert.additionalAllowances ?? 0);

  const perPeriod = ctx.periodsPerYear;
  const periodAllowance =
    perPeriodExemptionConstant(tiers.basic, basic, perPeriod) +
    perPeriodExemptionConstant(tiers.additional, additional, perPeriod);

  const periodTaxable = atLeastZero(taxableWages - periodAllowance);
  const amount = applyRate(periodTaxable, cfg.rate);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodTaxable,
    amount,
    detail: periodAllowance
      ? `${fmt(taxableWages)} less ${fmt(periodAllowance)} allowances @ ${(cfg.rate * 100).toFixed(2)}%`
      : `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%`,
  };
}

interface WIBracket {
  from: number; // dollars
  to: number | null; // dollars, null = no ceiling
  base: number; // dollars, pre-computed tax at `from` — taken from the
  // published table verbatim rather than recomputed (from × rate), because
  // Wisconsin's own table rounds each bracket's base to the cent and
  // recomputing would drift from it by fractions of a cent.
  rate: number;
}

interface WIStandardDeductionBand {
  max: number; // dollars, full deduction below phaseOutStart
  phaseOutStart: number; // dollars, annual wages
  phaseOutEnd: number; // dollars, annual wages — deduction is $0 at/above this
  phaseOutRate: number; // fraction subtracted per dollar of annual wages over phaseOutStart
}

interface BracketPhaseoutConfig {
  brackets: WIBracket[];
  exemptionAmount: number; // dollars, flat per exemption claimed
  standardDeduction: {
    single: WIStandardDeductionBand;
    married: WIStandardDeductionBand;
  };
}

function findWIBracket(brackets: WIBracket[], annualNetWage: number): WIBracket {
  for (const b of brackets) {
    const from = dollars(b.from);
    const to = b.to === null ? Infinity : dollars(b.to);
    if (annualNetWage >= from && annualNetWage < to) return b;
  }
  return brackets[brackets.length - 1];
}

/**
 * Wisconsin's withholding formula (Publication W-166's "Alternate Method"):
 * a genuinely different shape from every flat-rate method above — a
 * PHASED-OUT STANDARD DEDUCTION (not a flat allowance; it shrinks linearly
 * as annual wages rise, reaching $0 at a filing-status-specific income
 * level), then a small flat per-exemption amount, THEN a 4-bracket
 * progressive schedule on what's left. Reuses the `{from,to,base,rate}`
 * bracket shape already proven in taxes/federal.ts's schedules, since it's
 * the same kind of table.
 *
 * Verified against three of Publication W-166's own worked examples (one
 * married, two single, one with 0 exemptions) — see tests/engine.test.ts,
 * describe('Wisconsin') — reproduced to the cent, including the phase-out
 * arithmetic and the bracket lookup.
 *
 * Supplemental (bonus) wages are carved out of this base and taxed
 * separately on the flat bracket-lookup path instead — see
 * bracketSupplementalTax() — the same regular/supplemental split
 * taxes/federal.ts already uses, so the two lines together still cover the
 * full base exactly once.
 */
function bracketPhaseoutDeduction(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketPhaseoutDeduction as BracketPhaseoutConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const fullBase = ctx.taxableWagesFor(exempt);
  const supplementalCash = supplementalEarnings(input.earnings);
  const taxableWages = atLeastZero(fullBase - supplementalCash);
  const annualWages = taxableWages * ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  // WI's own formula only distinguishes single vs. married — head-of-household
  // has no third band in Publication W-166, so it maps to 'single' by
  // convention (a disclosed simplification, not a WI-published rule).
  const maritalStatus = cert.maritalStatus === 'married' ? 'married' : 'single';
  const exemptions = Number(cert.exemptions ?? 0);

  const band = cfg.standardDeduction[maritalStatus];
  const phaseOutStart = dollars(band.phaseOutStart);
  const phaseOutEnd = dollars(band.phaseOutEnd);
  const maxDeduction = dollars(band.max);

  let deductionAmount: number;
  if (annualWages < phaseOutStart) {
    deductionAmount = maxDeduction;
  } else if (annualWages >= phaseOutEnd) {
    deductionAmount = 0;
  } else {
    const reduction = roundHalfUp(band.phaseOutRate * (annualWages - phaseOutStart));
    deductionAmount = atLeastZero(maxDeduction - reduction);
  }

  const exemptionAmount = dollars(cfg.exemptionAmount) * exemptions;
  const annualNetWage = atLeastZero(annualWages - deductionAmount - exemptionAmount);

  const bracket = findWIBracket(cfg.brackets, annualNetWage);
  const excess = annualNetWage - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);
  const amount = Math.round(annualTax / ctx.periodsPerYear);

  const detail =
    `${fmt(annualWages)}/yr less ${fmt(deductionAmount)} standard deduction ` +
    `(${maritalStatus}) less ${fmt(exemptionAmount)} exemptions (${exemptions} × $${cfg.exemptionAmount}) ` +
    `= ${fmt(annualNetWage)} net @ ${(bracket.rate * 100).toFixed(2)}% bracket, ÷ ${ctx.periodsPerYear}`;

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: Math.round(annualNetWage / ctx.periodsPerYear),
    amount,
    detail,
  };
}

/**
 * Wisconsin supplemental (bonus) wages — Publication W-166's "Approved Flat
 * Percentages" alternate method: estimate the employee's annual GROSS salary
 * (regular wages only, annualized — not net of the standard deduction or
 * exemptions, per the source's own "annual gross salary" wording), find
 * which of the same four brackets that estimate falls into, and apply THAT
 * bracket's marginal RATE flatly to the supplemental payment — no base
 * added, unlike the regular-wages bracket lookup. Returns null when there's
 * no supplemental income, so a plain paycheck is unaffected.
 */
function bracketSupplementalTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const supplementalCash = supplementalEarnings(input.earnings);
  if (supplementalCash <= 0) return null;

  const cfg = rules.bracketPhaseoutDeduction as BracketPhaseoutConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const fullBase = ctx.taxableWagesFor(exempt);
  const regularWages = atLeastZero(fullBase - supplementalCash);
  const estimatedAnnualSalary = regularWages * ctx.periodsPerYear;

  const bracket = findWIBracket(cfg.brackets, estimatedAnnualSalary);
  const amount = applyRate(supplementalCash, bracket.rate);

  return {
    id: `${rules.code}_SIT_SUPP`,
    name: `${rules.name} Income Tax (Supplemental)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: supplementalCash,
    amount,
    detail:
      `${fmt(supplementalCash)} @ ${(bracket.rate * 100).toFixed(2)}% flat ` +
      `(estimated annual gross salary ${fmt(estimatedAnnualSalary)} falls in this bracket)`,
  };
}

interface BracketFlatAllowanceConfig {
  // Unlike Wisconsin (one shared bracket schedule regardless of marital
  // status — only its deduction phase-out differs by status), Minnesota
  // publishes genuinely DIFFERENT bracket thresholds/bases for single vs.
  // married (e.g. the 0%-band ends at $4,700 single but $14,700 married) —
  // confirmed from wh-inst-26's own Computer Formula chart, so this config
  // must carry two full schedules, not one.
  brackets: { single: WIBracket[]; married: WIBracket[] };
  allowanceAmount: number; // dollars, flat amount per withholding allowance (W-4MN)
  supplementalRate: number; // flat rate applied to supplemental wages, unrelated to bracket
}

/**
 * Minnesota's withholding formula (wh-inst-26's own "Computer Formula",
 * p.34) — a genuine progressive bracket schedule like Wisconsin's, but with
 * a FLAT per-allowance subtraction ($5,300 × allowances claimed on Form
 * W-4MN) instead of Wisconsin's income-phased-out standard deduction. Reuses
 * the same {from,to,base,rate} WIBracket shape and findWIBracket() lookup —
 * genuinely the same kind of table, just a simpler reduction step ahead of
 * it, so introducing a second bracket-lookup helper would just be
 * duplication.
 *
 * Verified against wh-inst-26's own published withholding tables (pp.16-33),
 * not just the formula: reproduced three table cells by hand using this
 * exact formula at the midpoint wage of each "at least / but less than" row
 * (single/0-allowance $600-610 → $28, single/2-allowance $600-610 → $17,
 * married/3-allowance $900-910 → $17), all matching to the whole dollar the
 * tables themselves round to. Not to-the-cent worked examples the way
 * Wisconsin's W-166 provides — Minnesota's own document doesn't publish
 * those — so whole-dollar table agreement is the strongest verification
 * this source actually offers.
 *
 * Supplemental wages are carved out of this base (same regular/supplemental
 * split as Wisconsin) and taxed on the separate flat-rate path instead — see
 * flatRateSupplementalTax().
 */
/**
 * Resolves Form W-4MN's marital-status checkbox to the bracket schedule it
 * actually selects. W-4MN has THREE checkboxes, not two — 'Single', 'Married',
 * and 'Married, but withhold at higher Single rate' — and wh-inst-26's
 * tables only publish two schedules, so the third checkbox is single's
 * schedule despite the employee being married. Absence (no certificate, no
 * field set) defaults to 'single' per Form W-4MN's OWN documented fallback:
 * "If a valid Form W-4MN is not completed by the employee, withhold taxes
 * as if the employee is single and claiming zero withholding allowances."
 * An unrecognized non-empty value is a caller bug, not a "no form" case —
 * thrown rather than silently folded into 'single', so a typo doesn't quietly
 * produce a plausible-looking wrong number.
 */
function resolveMNMaritalStatus(cert: Record<string, unknown>): 'single' | 'married' {
  const raw = cert.maritalStatus;
  if (raw === undefined || raw === null) return 'single';
  if (raw === 'single' || raw === 'married_withhold_as_single') return 'single';
  if (raw === 'married') return 'married';
  throw new Error(
    `Unrecognized MN certificate.maritalStatus ${JSON.stringify(raw)} — expected ` +
      `'single', 'married', or 'married_withhold_as_single' (Form W-4MN's third ` +
      `checkbox, which withholds at the single rate despite the employee being married).`,
  );
}

function bracketFlatAllowance(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketFlatAllowance as BracketFlatAllowanceConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const fullBase = ctx.taxableWagesFor(exempt);
  const supplementalCash = supplementalEarnings(input.earnings);
  const taxableWages = atLeastZero(fullBase - supplementalCash);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;

  // Form W-4MN's own employer instructions route nonresident alien
  // employees to "Table 1 and the procedure under Withholding Adjustment
  // for Nonresident Alien Employees in IRS Publication 15-T" to compute
  // MINNESOTA withholding, not just federal — an unusual explicit borrowing
  // of a federal procedure/table for state purposes. Reuses federal.ts's
  // own nonresidentAlienAdjustment table via federalRuleset() rather than
  // duplicating the dollar figures here. NOTE the source text literally
  // says "Table 1" (the pre-2020-W-4 table), but this engine's FederalW4
  // type — and by extension its state certificates — only ever represents
  // a 2020+-style form, so Table 2 is what's actually reused; that
  // discrepancy in MN's own source text is disclosed in MN-2026.json rather
  // than silently resolved.
  const nraAdjustment = cert.nonresidentAlien
    ? dollars(
        federalRuleset(input.checkDate).incomeTax.nonresidentAlienAdjustment[
          input.payFrequency
        ] ?? 0,
      )
    : 0;

  const annualWages = (taxableWages + nraAdjustment) * ctx.periodsPerYear;

  // wh-inst-26's tables only distinguish single vs. married — no separate
  // head-of-household schedule — so it maps to 'single' by convention, the
  // same disclosed simplification as Wisconsin's file.
  const maritalStatus = resolveMNMaritalStatus(cert);
  const allowances = Number(cert.allowances ?? 0);

  const annualAllowance = dollars(cfg.allowanceAmount) * allowances;
  const annualNetWage = atLeastZero(annualWages - annualAllowance);

  const brackets = cfg.brackets[maritalStatus];
  const bracket = findWIBracket(brackets, annualNetWage);
  const excess = annualNetWage - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);
  const amount = Math.round(annualTax / ctx.periodsPerYear);

  const detail =
    (nraAdjustment
      ? `NRA adjustment +${fmt(nraAdjustment)}/period (Pub 15-T Table 2, per W-4MN's own instructions); `
      : '') +
    `${fmt(annualWages)}/yr less ${fmt(annualAllowance)} allowances ` +
    `(${allowances} × $${cfg.allowanceAmount}, ${maritalStatus}) = ${fmt(annualNetWage)} net ` +
    `@ ${(bracket.rate * 100).toFixed(2)}% bracket, ÷ ${ctx.periodsPerYear}`;

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    // This field reports the NET (post-allowance) wage this bracket lookup
    // ran on, the same "derived calculation figure" convention as Wisconsin's
    // bracketPhaseoutDeduction() — not literal gross wages either way. When
    // an NRA adjustment applies, that derived figure legitimately includes
    // it, since the adjustment genuinely changed which bracket got selected.
    taxableWages: Math.round(annualNetWage / ctx.periodsPerYear),
    amount,
    detail,
  };
}

/**
 * Minnesota's supplemental (bonus) wages — wh-inst-26's own "Method 2":
 * unlike Wisconsin's bracket-dependent supplemental rate, Minnesota applies
 * ONE FLAT RATE (6.25%) to every supplemental payment regardless of the
 * employee's regular-wage bracket or allowances claimed. Quoted directly:
 * "Supplemental payments made to an employee separately from regular wages
 * are subject to the 6.25% Minnesota withholding rate regardless of how many
 * allowances employees claim." Returns null when there's no supplemental
 * income, so a plain paycheck is unaffected — same convention as Wisconsin's
 * bracketSupplementalTax().
 */
function flatRateSupplementalTax(
  input: PaycheckInput,
  _ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const supplementalCash = supplementalEarnings(input.earnings);
  if (supplementalCash <= 0) return null;

  const cfg = rules.bracketFlatAllowance as BracketFlatAllowanceConfig;
  const amount = applyRate(supplementalCash, cfg.supplementalRate);

  return {
    id: `${rules.code}_SIT_SUPP`,
    name: `${rules.name} Income Tax (Supplemental)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: supplementalCash,
    amount,
    detail: `${fmt(supplementalCash)} @ ${(cfg.supplementalRate * 100).toFixed(2)}% flat, regardless of allowances or bracket`,
  };
}

interface StatePaidLeaveEmployeeConfig {
  rate: number;
  wageBase: number | null; // dollars, annual — null means uncapped
  exemptPretax?: string[]; // overrides the shared rules.exemptPretax when present
}

/**
 * Employee-paid state Paid Family & Medical Leave premium — Minnesota Paid
 * Leave (launched 2026-01-01) is the first example in this project, but
 * dispatched generically off a `statePaidLeaveEmployee` config block, the
 * same orthogonal-to-income-tax pattern stateUnemploymentEmployeeTax()
 * already uses for Pennsylvania's employee-paid UC. Genuinely a different
 * levy from state UC, though structurally identical (flat rate over a
 * wage-base-capped base) — reuses underCap() the same way, keyed by YTD
 * wages already paid toward THIS specific premium
 * (input.ytd.statePaidLeave[code]), not toward UC's own YTD tracker.
 *
 * Runs unconditionally (see stateIncomeTax()) — NOT gated by income-tax
 * reciprocity or a Section-2-style withholding-exemption certificate, since
 * Minn. Stat. 268B is a separate statute from the income-tax reciprocity
 * statute (290.081) it happens to sit next to in this file.
 *
 * cfg.exemptPretax, when present, OVERRIDES the shared rules.exemptPretax —
 * added because New York's PFL premium base turned out NOT to share NYS
 * income tax's pretax exclusions (NY Tax Dept. Notice N-17-12 confirms PFL
 * premiums are deducted from employees' AFTER-TAX wages, i.e. this is
 * structurally NOT a pretax-eligible deduction the way 401(k)/section 125
 * are, and paidfamilyleave.ny.gov's own cost page consistently describes
 * the premium as a percentage of "gross wages"). Minnesota's config has no
 * exemptPretax override, so it keeps its original behavior unchanged.
 */
function statePaidLeaveEmployeeTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cfg = rules.statePaidLeaveEmployee as StatePaidLeaveEmployeeConfig | undefined;
  if (!cfg) return null;

  const exempt = (cfg.exemptPretax ?? rules.exemptPretax ?? []) as PretaxCategory[];
  const currentWages = ctx.taxableWagesFor(exempt);
  const ytd = input.ytd.statePaidLeave?.[rules.code] ?? 0;
  const cap = cfg.wageBase === null ? null : dollars(cfg.wageBase);
  const taxableWages = underCap(currentWages, ytd, cap);
  const amount = applyRate(taxableWages, cfg.rate);

  return {
    id: `${rules.code}_PFML_EE`,
    name: `${rules.name} Paid Leave (Employee)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      cfg.wageBase === null
        ? `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%, no wage cap`
        : `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%, capped at ${fmt(dollars(cfg.wageBase))}/yr (${fmt(ytd)} YTD already counted)`,
  };
}

type MTSchedule = 'single_mfs_bothWorking' | 'mfj_qss' | 'hoh';

interface BracketPerPeriodGrossConfig {
  brackets: Record<MTSchedule, Record<string, WIBracket[]>>; // second key is PayFrequency
}

/**
 * Resolves Form MW-4's filing-status lines (1a/1b/1c/2) to which of
 * Montana's THREE published bracket schedules applies. Critically, marking
 * line 2 (both spouses working) does NOT select a fourth schedule — MW-4's
 * own tables are headed "Use these tables if the employee marks the box on
 * line 1a OR line 2," i.e. both-spouses-working reuses the SAME
 * single/MFS table, not a separately-halved one. It only LOOKS like a
 * halved MFJ table because MFJ's own thresholds happen to be exactly double
 * single's — that's Montana's bracket design, not a computed halving this
 * engine performs.
 *
 * Default (no MW-4, or lines 1/2 both empty with no line-4 override): the
 * single/MFS schedule — confirmed directly from Form MW-4's own employer
 * instructions, "If you do not complete your Form MW-4, your employer will
 * withhold taxes for you using the single filing status on line 1a."
 */
function resolveMTSchedule(cert: Record<string, unknown>): MTSchedule {
  const filingStatus = cert.filingStatus;
  if (filingStatus === undefined || filingStatus === null || filingStatus === 'single' || filingStatus === 'mfs') {
    return 'single_mfs_bothWorking';
  }
  if (filingStatus === 'mfj' || filingStatus === 'qss') {
    return cert.bothSpousesWorking ? 'single_mfs_bothWorking' : 'mfj_qss';
  }
  if (filingStatus === 'hoh') return 'hoh';
  throw new Error(
    `Unrecognized MT certificate.filingStatus ${JSON.stringify(filingStatus)} — expected ` +
      `'single', 'mfs', 'mfj', 'qss', or 'hoh'.`,
  );
}

/**
 * Montana's withholding formula (2026 Employer and Information Agent
 * Guide's "Montana Withholding Tax Formula", W = A + (B × (G - C))) — the
 * simplest bracket mechanic in this project so far: NO annualization step
 * and NO separate standard-deduction subtraction. The guide's own
 * "Definitions" section states plainly 'G = Gross Earnings for the payroll
 * period' — the bracket table is applied DIRECTLY to gross per-period
 * wages, with the standard deduction already baked into each schedule's
 * own 0%-rate first bracket rather than subtracted as a separate step. (The
 * table column headers say "of the net taxable earnings over C", which
 * reads as if there's a separate net-taxable-earnings variable — but no
 * such subtraction appears anywhere in the formula's own definitions or
 * its three worked examples, which all plug raw per-period earnings
 * straight into the bracket lookup. Treated the formula's own worked
 * arithmetic as authoritative over that one inconsistent phrase.)
 *
 * Montana publishes a SEPARATE bracket table per pay frequency (Monthly,
 * Semi-Monthly, Bi-Weekly, Weekly, Daily, Annual) rather than one annual
 * table scaled by periodsPerYear the way every other bracket state in this
 * project works — so periodsPerYear is never used here at all. Montana's
 * own guide does not publish Quarterly or Semiannual tables, so those two
 * PayFrequency values throw rather than being silently guessed at via
 * interpolation.
 *
 * ROUNDING: the guide's prose says "rounded up to the nearest dollar" in
 * two places, but its own worked examples contradict that — Example 1
 * (single/MFS, semi-monthly, $1,375) computes to $33.088, and the guide's
 * OWN stated answer is $33, not $34. Ceiling rounding would have produced
 * $34. Verified independently against a second example in the same section
 * (biweekly $2,950 → $114.476 → stated $114, not $115). Ordinary
 * nearest-dollar rounding (Math.round, this project's usual roundHalfUp) is
 * what the primary source's own arithmetic actually does, so that's what
 * this function uses — the "rounded up" prose is treated as imprecise, not
 * authoritative.
 *
 * Line 4 ("specified withholding") is a full REPLACEMENT of the ordinary
 * calculation, not an addition — Form MW-4 itself: "If you are an employee
 * and enter an amount on this line, DO NOT complete lines 1, 2, or 3."
 * Checked FIRST, before the bracket lookup, and short-circuits it entirely.
 */
function bracketPerPeriodGross(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketPerPeriodGross as BracketPerPeriodGrossConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const fullBase = ctx.taxableWagesFor(exempt);
  // Supplemental wages are carved out and taxed separately on the flat
  // 5%-of-supplemental path instead (montanaSupplementalTax()) — same
  // regular/supplemental split every other bracket state in this project
  // uses, so the two lines together still tax the full base exactly once.
  const supplementalCash = supplementalEarnings(input.earnings);
  const grossWages = atLeastZero(fullBase - supplementalCash);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;

  const specified = Number(cert.specifiedWithholding ?? 0);
  if (specified > 0) {
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: grossWages,
      amount: specified,
      detail: `Form MW-4 line 4 specified withholding: ${fmt(specified)} flat, replacing the normal bracket calculation (lines 1-3 not applied).`,
    };
  }

  const schedule = resolveMTSchedule(cert);
  const perFrequencyTables = cfg.brackets[schedule];
  const brackets = perFrequencyTables[input.payFrequency];
  if (!brackets) {
    throw new Error(
      `Montana's own withholding tables don't publish a "${input.payFrequency}" schedule ` +
        `(only monthly/semimonthly/biweekly/weekly/daily/annual are published) — cannot compute ${rules.code}_SIT.`,
    );
  }

  const bracket = findWIBracket(brackets, grossWages);
  const excess = grossWages - dollars(bracket.from);
  // Montana states withholding amounts in WHOLE DOLLARS, not dollars-and-
  // cents — confirmed by every worked example in the source (e.g. $33.088
  // computed → the guide's own stated answer is $33, not $33.09). Caught
  // this against the guide's own examples before trusting it: an earlier
  // draft that stopped at cent-level rounding produced $33.09 here, which
  // does not match the source at all.
  const amount = toWholeDollars(dollars(bracket.base) + applyRate(excess, bracket.rate));

  const detail =
    `${fmt(grossWages)} gross (${schedule}, ${input.payFrequency}) @ ${(bracket.rate * 100).toFixed(2)}% ` +
    `over ${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))}`;

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: grossWages,
    amount,
    detail,
  };
}

/**
 * Montana's supplemental wages "Method 3" — a flat 5.00% of the supplemental
 * payment alone, the only one of the guide's three separately-paid-
 * supplemental methods that doesn't require reaching into a different
 * payroll period's wages (Methods 1/2 both combine the supplemental with
 * SOME period's regular wages first — not modelled, same class of gap as
 * Kentucky's supplementalTreatment.engineGap). Returns null when there's no
 * supplemental income, or when MW-4 line 4 (specifiedWithholding) is active
 * — the form's own instruction to skip lines 1-3 when line 4 is used applies
 * here too: a flat specified amount replaces ALL of this employee's
 * withholding for the period, not just the regular-wages line.
 */
function montanaSupplementalTax(
  input: PaycheckInput,
  _ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const supplementalCash = supplementalEarnings(input.earnings);
  if (supplementalCash <= 0) return null;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (Number(cert.specifiedWithholding ?? 0) > 0) return null;

  const rate = (rules.supplementalWages as { flatRate: number }).flatRate;
  const amount = toWholeDollars(applyRate(supplementalCash, rate));

  return {
    id: `${rules.code}_SIT_SUPP`,
    name: `${rules.name} Income Tax (Supplemental)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: supplementalCash,
    amount,
    detail: `${fmt(supplementalCash)} @ ${(rate * 100).toFixed(2)}% flat (Method 3), rounded to the nearest dollar`,
  };
}

interface NYBracket extends WIBracket {
  useMethodIII?: boolean;
}

interface NYMethodIIIBand {
  from: number; // dollars, annual
  to: number | null;
  rate: number;
}

interface NYRulesetShape {
  combinedAllowanceTable: Record<'single' | 'married', Record<string, number[]>>;
  brackets: Record<'single' | 'married', Record<string, NYBracket[]>>;
  methodIII: Record<'single' | 'married', NYMethodIIIBand[]>;
  supplementalWages: { flatRate: number };
}

/**
 * Resolves IT-2104's marital-status checkbox to which of New York's two
 * published schedules applies — the same three-checkbox shape (single,
 * married, married-but-withhold-at-higher-single-rate) already seen in
 * Minnesota's W-4MN and Montana's MW-4, now a recurring cross-state pattern
 * in this project rather than a one-off. Absence defaults to 'single',
 * matching every other state's no-certificate convention.
 */
function resolveNYMaritalStatus(cert: Record<string, unknown>): 'single' | 'married' {
  const raw = cert.maritalStatus;
  if (raw === undefined || raw === null) return 'single';
  if (raw === 'single' || raw === 'married_withhold_as_single') return 'single';
  if (raw === 'married') return 'married';
  throw new Error(
    `Unrecognized NY certificate.maritalStatus ${JSON.stringify(raw)} — expected ` +
      `'single', 'married', or 'married_withhold_as_single'.`,
  );
}

function findMethodIIIBand(bands: NYMethodIIIBand[], annualNetWages: number): NYMethodIIIBand {
  for (const b of bands) {
    const from = dollars(b.from);
    const to = b.to === null ? Infinity : dollars(b.to);
    if (annualNetWages >= from && annualNetWages < to) return b;
  }
  return bands[bands.length - 1];
}

/**
 * New York State's withholding formula (NYS-50-T-NYS's Method II "Exact
 * Calculation Method", with a Method III fallback for very high earners) —
 * a genuinely new shape in this project: (1) subtract a COMBINED
 * deduction+exemption allowance (a single precomputed per-period,
 * per-marital-status, per-exemption-count dollar figure — Table A — not a
 * flat per-exemption multiplier) directly from PER-PERIOD gross wages, no
 * annualizing first; (2) look up the result in a bracket table published
 * SEPARATELY per pay frequency (like Montana — not one annual table divided
 * down); (3) ONLY when net wages exceed the top published bracket
 * (annualized above $1,077,550 single / $2,155,350 married for 2026) does
 * Method III apply instead — a flat percentage of ANNUALIZED net wages,
 * which DOES require annualizing, unlike the ordinary per-period path.
 *
 * Verified against the source's own worked examples: weekly $400 single 3
 * exemptions → $8.01; monthly $50,000 single 3 exemptions → $3,576.63 — see
 * tests/engine.test.ts, describe('New York').
 */
interface NYSStyleTaxResult {
  grossWages: number;
  allowance: number;
  netWages: number;
  amount: number;
  detail: string;
}

/**
 * The shared NYS-style computation — subtract Table A's combined allowance
 * from per-period gross wages, look up the result in a per-period bracket
 * table, falling back to Method III for very high earners. Factored out of
 * bracketPerPeriodNet() specifically because Yonkers' resident tax surcharge
 * (NYS-50-T-Y) is DEFINED as 16.75% of this EXACT same calculation — same
 * Table A, same brackets, same Method III, confirmed by direct comparison
 * (Yonkers' own Table A is byte-for-byte identical to NYS's). Reusing this
 * helper rather than re-deriving the tax independently guarantees the two
 * can never silently drift apart.
 */
function computeNYSStyleTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
  cfg: NYRulesetShape,
): NYSStyleTaxResult {
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const fullBase = ctx.taxableWagesFor(exempt);
  const supplementalCash = supplementalEarnings(input.earnings);
  const grossWages = atLeastZero(fullBase - supplementalCash);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const maritalStatus = resolveNYMaritalStatus(cert);
  const exemptions = Number(cert.exemptions ?? 0);
  if (exemptions < 0 || !Number.isInteger(exemptions)) {
    throw new Error(`NY certificate.exemptions (${exemptions}) must be a non-negative integer.`);
  }

  const allowanceTable = cfg.combinedAllowanceTable[maritalStatus][input.payFrequency];
  if (!allowanceTable) {
    throw new Error(
      `New York's own withholding tables don't publish a "${input.payFrequency}" allowance ` +
        `schedule (only daily/weekly/biweekly/semimonthly/monthly/annual are published) — ` +
        `cannot compute ${rules.code}_SIT.`,
    );
  }
  // NY's own Table A only publishes 0-10 directly; above 10, its own
  // instructions say to use Table B (the 0-exemption baseline, already
  // table[0]) plus Table C ($X per exemption, a flat per-period constant
  // confirmed equal to the increment between any two consecutive Table A
  // entries) — so linear extrapolation past index 10 reproduces exactly
  // what NY's own B+C method would compute, without needing separately
  // transcribed data.
  const allowanceDollars =
    exemptions <= 10
      ? allowanceTable[exemptions]
      : allowanceTable[10] + (allowanceTable[10] - allowanceTable[9]) * (exemptions - 10);
  const allowance = dollars(allowanceDollars);
  const netWages = atLeastZero(grossWages - allowance);

  const brackets = cfg.brackets[maritalStatus][input.payFrequency];
  if (!brackets) {
    throw new Error(
      `New York's own withholding tables don't publish a "${input.payFrequency}" bracket ` +
        `schedule — cannot compute ${rules.code}_SIT.`,
    );
  }
  const bracket = findWIBracket(brackets, netWages) as NYBracket;

  let amount: number;
  let detail: string;

  if (bracket.useMethodIII) {
    const annualNetWages = netWages * ctx.periodsPerYear;
    const band = findMethodIIIBand(cfg.methodIII[maritalStatus], annualNetWages);
    const annualTax = applyRate(annualNetWages, band.rate);
    amount = Math.round(annualTax / ctx.periodsPerYear);
    detail =
      `${fmt(grossWages)} gross less ${fmt(allowance)} allowance = ${fmt(netWages)} net; ` +
      `annualized ${fmt(annualNetWages)} triggers Method III @ ${(band.rate * 100).toFixed(2)}% ` +
      `flat, ÷ ${ctx.periodsPerYear}`;
  } else {
    const excess = netWages - dollars(bracket.from);
    amount = dollars(bracket.base) + applyRate(excess, bracket.rate);
    detail =
      `${fmt(grossWages)} gross less ${fmt(allowance)} allowance = ${fmt(netWages)} net ` +
      `@ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))}`;
  }

  return { grossWages, allowance, netWages, amount, detail };
}

/**
 * UNLIKE Minnesota's W-4MN, neither NYS-50-T-NYS nor IT-2104 says anything
 * about nonresident alien employees anywhere (searched directly — zero
 * mentions in either document) — so, unlike bracketFlatAllowance() for
 * Minnesota, this deliberately does NOT apply the federal Pub 15-T Table 2
 * adjustment. Building that in by analogy without an NY-specific
 * instruction would risk a confidently-wrong number rather than a disclosed
 * gap; see NY-2026.json's knownGaps.
 */
function bracketPerPeriodNet(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules as unknown as NYRulesetShape;
  const result = computeNYSStyleTax(input, ctx, rules, cfg);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: result.netWages,
    amount: result.amount,
    detail: result.detail,
  };
}

interface NJRateTableConfig {
  // NJ-WT's own "Withholding Allowance Value Table" — a flat per-exemption
  // dollar figure per pay period (NOT a precomputed combined table the way
  // NY's Table A is), so a single number per period rather than
  // combinedAllowanceTable's per-exemption-count array.
  allowanceAmount: Record<string, number>;
  // NJ-WT's five "Rate Tables" (A-E), each a full {from,to,base,rate}
  // schedule PER PAY PERIOD (published separately per period, like Montana
  // and New York — not one annual table divided down). Which table applies
  // is a Form NJ-W4 election, not a marital-status computation — see
  // resolveNJRateTable().
  brackets: Record<'A' | 'B' | 'C' | 'D' | 'E', Record<string, WIBracket[]>>;
}

/**
 * Resolves Form NJ-W4's filing-status boxes (Line 2) and its own explicit
 * rate-table override (Line 3) to which of NJ-WT's five published Rate
 * Tables applies. Per NJ-WT's own "Which Rate Table to Use" instructions:
 * Rate A if Line 2 Box 1 (Single) or Box 3 (Married/CU Partner Separate) is
 * checked; Rate B if Box 2 (Married/CU Joint), 4 (Head of Household), or 5
 * (Qualifying Widow(er)) is checked AND Line 3 is blank; otherwise — Line 3
 * completed — withhold at whichever specific table (A-E) the employee
 * selected there. NJ-WT documents C/D/E only as employee-selectable
 * higher-withholding options (typically used by two-earner households to
 * avoid underwithholding), not as filing-status-determined defaults, so
 * certificate.rateTableOverride is the ONLY way this function ever returns
 * C, D, or E.
 *
 * Default (no certificate at all): Rate A, matching Form NJ-W4's own
 * Box-1(Single)-is-the-baseline framing and this project's standing
 * no-form-means-single convention.
 */
function resolveNJRateTable(cert: Record<string, unknown>): 'A' | 'B' | 'C' | 'D' | 'E' {
  const override = cert.rateTableOverride;
  if (override !== undefined && override !== null) {
    if (override === 'A' || override === 'B' || override === 'C' || override === 'D' || override === 'E') {
      return override;
    }
    throw new Error(
      `Unrecognized NJ certificate.rateTableOverride ${JSON.stringify(override)} — expected 'A', 'B', 'C', 'D', or 'E'.`,
    );
  }

  const filingStatus = cert.filingStatus;
  if (filingStatus === undefined || filingStatus === null || filingStatus === 'single' || filingStatus === 'mfs') {
    return 'A';
  }
  if (filingStatus === 'mfj' || filingStatus === 'hoh' || filingStatus === 'qw') {
    return 'B';
  }
  throw new Error(
    `Unrecognized NJ certificate.filingStatus ${JSON.stringify(filingStatus)} — expected 'single', 'mfs', 'mfj', 'hoh', or 'qw'.`,
  );
}

/**
 * New Jersey's withholding formula (NJ-WT's own "Percentage Method"/Rate
 * Tables) — structurally the closest existing shape in this project is New
 * York's bracket_per_period_net (subtract an allowance from PER-PERIOD gross
 * wages, no annualizing, then look up the result in a bracket table
 * published separately per pay frequency) — but genuinely different in two
 * ways: (1) the allowance is a FLAT per-exemption dollar amount times the
 * count claimed (NJ-WT's own worked instructions: "Multiply the proper
 * withholding allowance ... by the number of exemptions claimed ... Subtract
 * this amount from the wages"), not NY's precomputed combined-allowance
 * table; (2) which bracket SCHEDULE applies is a direct Form NJ-W4 election
 * (Rate A-E) rather than a marital-status lookup. Both differences are small
 * enough that reusing bracketPerPeriodNet()/computeNYSStyleTax() outright
 * would require threading a NY-specific combinedAllowanceTable shape through
 * a state that doesn't have one — a new function, sharing the same
 * findWIBracket() bracket-lookup helper, was more honest than forcing the
 * fit.
 *
 * Supplemental wages are DELIBERATELY NOT carved out or given a separate
 * rate — NJ-WT is explicit: "If the supplemental wages are paid at the same
 * time as regular wages: Total the employee's regular wage and supplemental
 * wages and withhold at the appropriate rate based on the combined
 * payment." Aggregation, the same shape as Kentucky's flatRateFixedDeduction
 * — ctx.taxableWagesFor() already returns the combined total with no special
 * casing needed for a single calculatePaycheck() call.
 *
 * NOT MODELLED (disclosed, not guessed): NJ-WT's own alternate rule for
 * supplemental wages paid on a SEPARATE cheque from regular wages ("withhold
 * from the supplemental wages without any exemption allowances") — the same
 * class of cross-period gap already disclosed for Kentucky's separate-cheque
 * supplemental rule and Indiana's 30-day nonresident rule; this engine
 * models one paycheck at a time and has no mechanism to detect "this cheque
 * is supplemental-only."
 *
 * Every bracket base figure in NJ-2026.json's Rate Tables was reconstructed
 * from NJ-WT's own annual boundaries+rates (the cleanly-extracted table) and
 * verified to reproduce every one of NJ-WT's own per-period base figures to
 * the cent for weekly, monthly, and annual — see the file's own $methodComment.
 */
function bracketPerPeriodRateTable(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketPerPeriodRateTable as NJRateTableConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const grossWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const exemptions = Number(cert.exemptions ?? 0);
  if (exemptions < 0 || !Number.isInteger(exemptions)) {
    throw new Error(`NJ certificate.exemptions (${exemptions}) must be a non-negative integer.`);
  }

  const allowancePerExemption = cfg.allowanceAmount[input.payFrequency];
  if (allowancePerExemption === undefined) {
    throw new Error(
      `New Jersey's own withholding allowance table doesn't publish a "${input.payFrequency}" ` +
        `figure — cannot compute ${rules.code}_SIT.`,
    );
  }
  const allowance = roundHalfUp(dollars(allowancePerExemption) * exemptions);
  const netWages = atLeastZero(grossWages - allowance);

  const rateTable = resolveNJRateTable(cert);
  const brackets = cfg.brackets[rateTable][input.payFrequency];
  if (!brackets) {
    throw new Error(
      `New Jersey's own Rate Table "${rateTable}" doesn't publish a "${input.payFrequency}" ` +
        `bracket schedule — cannot compute ${rules.code}_SIT.`,
    );
  }
  const bracket = findWIBracket(brackets, netWages);
  const excess = netWages - dollars(bracket.from);
  const amount = dollars(bracket.base) + applyRate(excess, bracket.rate);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: netWages,
    amount,
    detail:
      `${fmt(grossWages)} gross less ${fmt(allowance)} allowance (${exemptions} × $${allowancePerExemption}) ` +
      `= ${fmt(netWages)} net, Rate Table ${rateTable} @ ${(bracket.rate * 100).toFixed(2)}% over ` +
      `${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))}`,
  };
}

/**
 * Flat-rate supplemental wages read generically off rules.supplementalWages
 * .flatRate — New York's own 11.70% (Method A) is the first user, but this
 * is written to read the config rather than hardcode NY's number, so a
 * future state with the same shape (flat % of supplemental, no bracket
 * lookup) gets it for free.
 */
function flatRateSupplementalFromConfig(
  input: PaycheckInput,
  _ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const supplementalCash = supplementalEarnings(input.earnings);
  if (supplementalCash <= 0) return null;

  const cfg = rules.supplementalWages as { flatRate: number } | undefined;
  if (!cfg) return null;

  const amount = applyRate(supplementalCash, cfg.flatRate);

  return {
    id: `${rules.code}_SIT_SUPP`,
    name: `${rules.name} Income Tax (Supplemental)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: supplementalCash,
    amount,
    detail: `${fmt(supplementalCash)} @ ${(cfg.flatRate * 100).toFixed(2)}% flat`,
  };
}

interface NYCLocalTaxConfig {
  combinedAllowanceTable: Record<'single' | 'married', Record<string, number[]>>;
  brackets: Record<string, NYBracket[]>;
  supplementalRate: number;
}

/**
 * New York City resident income tax — a genuine LOCAL tax (jurisdiction:
 * 'local'), structurally the SAME shape as bracketPerPeriodNet() (subtract a
 * combined deduction+exemption allowance from per-period gross wages, look
 * up the result in a per-period bracket table) but with two real
 * differences: (1) NYC's bracket schedule is IDENTICAL between single and
 * married — only the allowance differs by status, confirmed by direct
 * comparison of the source's own published tables — so there's only one
 * `brackets` table, not two; (2) NYC has no Method III equivalent at all —
 * its own top bracket just keeps applying the top rate indefinitely, no
 * escape hatch for very high earners.
 *
 * Only computed when certificate.nycResident is true — NYC's own tax
 * applies to residents only (the pre-1999 NYC nonresident commuter tax was
 * repealed and is not modelled, see NY-2026.json's own scope notes).
 *
 * Verified against all 8 of NYS-50-T-NYC's own worked examples (4 single, 4
 * married) — see tests/engine.test.ts, describe('New York City').
 */
function nycLocalTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (!cert.nycResident) return null;

  const cfg = rules.nycLocalTax as NYCLocalTaxConfig | undefined;
  if (!cfg) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const fullBase = ctx.taxableWagesFor(exempt);
  const supplementalCash = supplementalEarnings(input.earnings);
  const grossWages = atLeastZero(fullBase - supplementalCash);

  const maritalStatus = resolveNYMaritalStatus(cert);
  // IT-2104 Line 2 is a genuinely SEPARATE NYC-specific exemption count from
  // Line 1's NYS+Yonkers count — falls back to certificate.exemptions only
  // when nycExemptions isn't explicitly supplied.
  const exemptions = Number(cert.nycExemptions ?? cert.exemptions ?? 0);
  if (exemptions < 0 || !Number.isInteger(exemptions)) {
    throw new Error(`NYC certificate.nycExemptions (${exemptions}) must be a non-negative integer.`);
  }

  const allowanceTable = cfg.combinedAllowanceTable[maritalStatus][input.payFrequency];
  if (!allowanceTable) {
    throw new Error(
      `NYS-50-T-NYC doesn't publish a "${input.payFrequency}" allowance schedule — ` +
        `cannot compute NY_NYC_SIT.`,
    );
  }
  const allowanceDollars =
    exemptions <= 10
      ? allowanceTable[exemptions]
      : allowanceTable[10] + (allowanceTable[10] - allowanceTable[9]) * (exemptions - 10);
  const allowance = dollars(allowanceDollars);
  const netWages = atLeastZero(grossWages - allowance);

  const brackets = cfg.brackets[input.payFrequency];
  if (!brackets) {
    throw new Error(
      `NYS-50-T-NYC doesn't publish a "${input.payFrequency}" bracket schedule — ` +
        `cannot compute NY_NYC_SIT.`,
    );
  }
  const bracket = findWIBracket(brackets, netWages);
  const excess = netWages - dollars(bracket.from);
  const baseAmount = dollars(bracket.base) + applyRate(excess, bracket.rate);

  // IT-2104 Line 4 — a NYC-SPECIFIC flat per-period additional-withholding
  // amount, genuinely distinct from NYS's own Line 3 (certificate.
  // additionalWithholding). Cents already, matching that field's own
  // convention — a caller supplies dollars(50), not 50.
  const extra = Number(cert.additionalWithholdingNYC ?? 0);
  const amount = baseAmount + (extra > 0 ? extra : 0);

  return {
    id: `${rules.code}_NYC_SIT`,
    name: 'New York City Income Tax',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: netWages,
    amount,
    detail:
      `${fmt(grossWages)} gross less ${fmt(allowance)} allowance = ${fmt(netWages)} net ` +
      `@ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))}` +
      (extra > 0 ? `; plus ${fmt(extra)} additional withholding requested (certificate.additionalWithholdingNYC)` : ''),
  };
}

/**
 * NYC's flat 4.25% supplemental-wage rate (NYS-50-T-NYC's own "Method a"),
 * the same shape as flatRateSupplementalFromConfig() but reading a
 * different config namespace (rules.nycLocalTax.supplementalRate) and
 * emitting a distinctly-prefixed id, since this is a separate LOCAL levy,
 * not the state one. Only applies when certificate.nycResident is true — no
 * supplemental line for a non-NYC-resident regardless of supplemental pay.
 */
function nycSupplementalTax(
  input: PaycheckInput,
  _ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (!cert.nycResident) return null;

  const supplementalCash = supplementalEarnings(input.earnings);
  if (supplementalCash <= 0) return null;

  const cfg = rules.nycLocalTax as NYCLocalTaxConfig | undefined;
  if (!cfg) return null;

  const amount = applyRate(supplementalCash, cfg.supplementalRate);

  return {
    id: `${rules.code}_NYC_SIT_SUPP`,
    name: 'New York City Income Tax (Supplemental)',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: supplementalCash,
    amount,
    detail: `${fmt(supplementalCash)} @ ${(cfg.supplementalRate * 100).toFixed(2)}% flat`,
  };
}

interface YonkersExemptionTier {
  from: number; // dollars, gross wages
  to: number | null;
  exemption: number | null; // dollars; null = fully exempt, no tax at all
}

interface YonkersLocalTaxConfig {
  residentSurcharge: { rate: number };
  residentSupplementalRate: number;
  nonresidentRate: number;
  nonresidentSupplementalRate: number;
  nonresidentExemptionTiers: Record<string, YonkersExemptionTier[]>;
}

function findYonkersExemptionTier(
  tiers: YonkersExemptionTier[],
  grossWages: number,
): YonkersExemptionTier {
  for (const t of tiers) {
    const from = dollars(t.from);
    const to = t.to === null ? Infinity : dollars(t.to);
    if (grossWages >= from && grossWages < to) return t;
  }
  return tiers[tiers.length - 1];
}

/**
 * Yonkers has two mutually exclusive, structurally VERY different taxes:
 *
 * RESIDENT surcharge (certificate.yonkersResident): NYS-50-T-Y's own
 * instructions define this as 16.75% of the exact same NYS-style tax
 * computation NYS itself uses — same Table A (byte-for-byte identical to
 * NYS's, confirmed by direct comparison), same brackets, same Method III.
 * Reuses computeNYSStyleTax() rather than re-deriving the calculation, so
 * the two can never silently drift apart. Verified against NYS-50-T-Y's own
 * 4 worked examples, each of which is literally "compute the NYS example,
 * then multiply by 0.1675" — e.g. $8.01 (NYS Example 1's own answer) x
 * 0.1675 = $1.34.
 *
 * NONRESIDENT earnings tax (certificate.yonkersNonresidentWorker, for
 * someone who works in Yonkers without residing there): a completely
 * different shape — flat 0.50% of GROSS wages (no marital status, no
 * exemption-count allowance) after subtracting a WAGE-LEVEL step-function
 * exemption (5 tiers per pay period, decreasing to $0 as wages rise, with
 * a "no tax at all" floor for the lowest tier) — genuinely different from
 * every other exemption/allowance shape in this project, none of which are
 * keyed off the wage amount itself rather than a claimed exemption count.
 */
function yonkersLocalTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const cfg = rules.yonkersLocalTax as YonkersLocalTaxConfig | undefined;
  if (!cfg) return null;

  // IT-2104 Line 5 — a YONKERS-SPECIFIC flat per-period additional-
  // withholding amount, distinct from NYS's Line 3 (certificate.
  // additionalWithholding) and NYC's Line 4 (certificate.
  // additionalWithholdingNYC). Applies regardless of resident/nonresident
  // status — IT-2104's own instructions don't restrict Line 5 to residents
  // only. Cents already, matching every other additionalWithholding*
  // field's convention.
  const extraYonkers = Number(cert.additionalWithholdingYonkers ?? 0);
  const extra = extraYonkers > 0 ? extraYonkers : 0;

  if (cert.yonkersResident) {
    const nyCfg = rules as unknown as NYRulesetShape;
    const base = computeNYSStyleTax(input, ctx, rules, nyCfg);
    const baseAmount = applyRate(base.amount, cfg.residentSurcharge.rate);
    const amount = baseAmount + extra;

    return {
      id: `${rules.code}_YONKERS_SIT`,
      name: 'Yonkers Resident Income Tax Surcharge',
      payer: 'employee',
      // taxableWages reports the underlying NYS-style NET WAGES the
      // surcharge is indirectly based on (via that calculation's own tax
      // amount) — the most honest "wage base" figure available, since this
      // tax's literal base is a dollar amount of TAX, not wages, which the
      // detail string spells out explicitly.
      jurisdiction: 'local',
      taxableWages: base.netWages,
      amount,
      detail:
        `${(cfg.residentSurcharge.rate * 100).toFixed(2)}% of ${fmt(base.amount)} NYS-style base tax (${base.detail}) = ${fmt(baseAmount)}` +
        (extra > 0 ? `; plus ${fmt(extra)} additional withholding requested (certificate.additionalWithholdingYonkers)` : ''),
    };
  }

  if (cert.yonkersNonresidentWorker) {
    const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
    const fullBase = ctx.taxableWagesFor(exempt);
    const supplementalCash = supplementalEarnings(input.earnings);
    const grossWages = atLeastZero(fullBase - supplementalCash);

    const tiers = cfg.nonresidentExemptionTiers[input.payFrequency];
    if (!tiers) {
      throw new Error(
        `NYS-50-T-Y doesn't publish a "${input.payFrequency}" nonresident exemption ` +
          `schedule — cannot compute ${rules.code}_YONKERS_SIT.`,
      );
    }
    const tier = findYonkersExemptionTier(tiers, grossWages);

    if (tier.exemption === null) {
      return {
        id: `${rules.code}_YONKERS_SIT`,
        name: 'Yonkers Nonresident Earnings Tax',
        payer: 'employee',
        jurisdiction: 'local',
        taxableWages: 0,
        amount: extra,
        detail:
          `$0 — ${fmt(grossWages)} gross wages are below Yonkers' no-withholding threshold for this pay period.` +
          (extra > 0 ? ` Plus ${fmt(extra)} additional withholding requested (certificate.additionalWithholdingYonkers).` : ''),
      };
    }

    const taxable = atLeastZero(grossWages - dollars(tier.exemption));
    const baseAmount = applyRate(taxable, cfg.nonresidentRate);
    const amount = baseAmount + extra;

    return {
      id: `${rules.code}_YONKERS_SIT`,
      name: 'Yonkers Nonresident Earnings Tax',
      payer: 'employee',
      jurisdiction: 'local',
      taxableWages: taxable,
      amount,
      detail:
        `${fmt(grossWages)} gross less ${fmt(dollars(tier.exemption))} wage-level exemption ` +
        `= ${fmt(taxable)} taxable @ ${(cfg.nonresidentRate * 100).toFixed(2)}% = ${fmt(baseAmount)}` +
        (extra > 0 ? `; plus ${fmt(extra)} additional withholding requested (certificate.additionalWithholdingYonkers)` : ''),
    };
  }

  return null;
}

/**
 * Yonkers supplemental wages — RESIDENT rate (1.95975%) is confirmed to be
 * exactly NYS's own 11.70% supplemental rate x Yonkers' 16.75% surcharge
 * (0.1170 x 0.1675 = 0.0195975 precisely), the same "surcharge on NYS's own
 * figure" relationship as the regular-wages case. NONRESIDENT rate is flat
 * 0.50%, identical to the ordinary nonresident earnings tax rate — no
 * separate supplemental treatment needed since that tax is already flat
 * with no bracket to bypass, unlike every rate-schedule-based supplemental
 * method elsewhere in this project.
 */
function yonkersSupplementalTax(
  input: PaycheckInput,
  _ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const cfg = rules.yonkersLocalTax as YonkersLocalTaxConfig | undefined;
  if (!cfg) return null;

  const supplementalCash = supplementalEarnings(input.earnings);
  if (supplementalCash <= 0) return null;

  let rate: number;
  if (cert.yonkersResident) {
    rate = cfg.residentSupplementalRate;
  } else if (cert.yonkersNonresidentWorker) {
    rate = cfg.nonresidentSupplementalRate;
  } else {
    return null;
  }

  const amount = applyRate(supplementalCash, rate);

  return {
    id: `${rules.code}_YONKERS_SIT_SUPP`,
    name: 'Yonkers Income Tax (Supplemental)',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: supplementalCash,
    amount,
    detail: `${fmt(supplementalCash)} @ ${(rate * 100).toFixed(4)}% flat`,
  };
}

interface StateDisabilityEmployeeConfig {
  rate: number;
  weeklyCapDollars?: number; // dollars, e.g. 0.60 — a PER-WEEK cap, not annual (New York's DBL shape)
  wageBase?: number; // dollars, ANNUAL wage base — YTD-tracked like statePaidLeaveEmployee (New Jersey's TDI shape)
  exemptPretax?: string[]; // overrides the shared rules.exemptPretax when present
}

/**
 * Employee-paid state disability insurance — New York's DBL was the first
 * state in this project with a cap that resets EVERY PAY PERIOD rather than
 * accumulating across the year (WCB's own page: 'no more than 60 cents a
 * week'), genuinely different from every other capped employee-paid program
 * here at the time (PA's UC is uncapped; MN's Paid Leave caps an ANNUAL
 * cumulative dollar total via YTD tracking). That per-period shape is
 * config-driven via weeklyCapDollars, scaling the weekly figure by how many
 * weeks are actually in one pay period (52 / periodsPerYear) rather than
 * storing a separately-transcribed per-frequency table.
 *
 * New Jersey's TDI is the ordinary ANNUAL-wage-base shape instead (same
 * mechanism as statePaidLeaveEmployeeTax()) — config-driven via `wageBase`,
 * mutually exclusive with weeklyCapDollars. A state config is expected to set
 * exactly one of the two; which branch runs is decided by which field is
 * present, not by state code, so this stays data-only for any future state
 * that fits either existing shape.
 */
function stateDisabilityEmployeeTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cfg = rules.stateDisabilityEmployee as StateDisabilityEmployeeConfig | undefined;
  if (!cfg) return null;

  const exempt = (cfg.exemptPretax ?? rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);
  const uncapped = applyRate(taxableWages, cfg.rate);

  let amount: number;
  if (cfg.wageBase !== undefined) {
    const ytd = input.ytd.stateDisabilityEmployee?.[rules.code] ?? 0;
    const cappedWages = underCap(taxableWages, ytd, dollars(cfg.wageBase));
    amount = applyRate(cappedWages, cfg.rate);
    return {
      id: `${rules.code}_DBL_EE`,
      name: `${rules.name} Disability Benefits (Employee)`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: cappedWages,
      amount,
      detail: `${fmt(cappedWages)} @ ${(cfg.rate * 100).toFixed(2)}%, capped at ${fmt(dollars(cfg.wageBase))}/yr (${fmt(ytd)} YTD already counted)`,
    };
  }

  const weeksInPeriod = 52 / ctx.periodsPerYear;
  const periodCap = roundHalfUp(dollars(cfg.weeklyCapDollars!) * weeksInPeriod);
  amount = Math.min(uncapped, periodCap);

  return {
    id: `${rules.code}_DBL_EE`,
    name: `${rules.name} Disability Benefits (Employee)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%, capped at $${cfg.weeklyCapDollars!.toFixed(2)}/week ` +
      `(${fmt(periodCap)} this ${weeksInPeriod === 1 ? 'period' : `${weeksInPeriod.toFixed(2)}-week period`})` +
      (uncapped > periodCap ? ' — cap applied' : ''),
  };
}

interface BracketTwoStatusConfig {
  brackets: Record<'single' | 'married', Record<string, WIBracket[]>>; // second key is PayFrequency
  nonresidentAlienAdjustment?: Record<string, number>; // dollars, keyed by PayFrequency
}

/**
 * Resolves Form ID W-4's filing status to which of Idaho's two published
 * bracket schedules applies. Idaho's own Table for Percentage Computation
 * Method (EPB00744) publishes exactly two schedules, "Single Persons
 * Including Head of Household" and "Married Persons," so head-of-household
 * maps to the single schedule BY THE SOURCE'S OWN HEADING, not by this
 * engine's convention (unlike Wisconsin's/Minnesota's disclosed HOH→single
 * simplification, which those states' own tables don't actually make —
 * Idaho's genuinely does). Form ID W-4 (EFO00307, 04-28-2025 revision —
 * fetched and read directly, confirmed the current one applicable for 2026)
 * ALSO has a third checkbox, "C (Married, but withhold at Single rate)" —
 * the same recurring 3-checkbox shape already seen on MN's W-4MN, MT's
 * MW-4, and NY's IT-2104 — which resolves to the SINGLE schedule despite
 * the employee being married, the same convention used by
 * resolveMNMaritalStatus()/resolveNYMaritalStatus() for that exact
 * checkbox. An earlier version of this file only recognized 'single' and
 * 'married' and would have THROWN for this real, form-documented option —
 * caught by re-reading the actual form rather than trusting the withholding
 * table's own two schedule NAMES as the complete list of certificate inputs.
 * Default (no ID W-4 on file) is 'single', the same no-form convention used
 * everywhere else in this project — Idaho's own computing-withholding guide
 * requires a form be kept on file but does not itself state a default, so
 * this is the project's standing convention, not an Idaho-specific
 * instruction.
 */
function resolveIDMaritalStatus(cert: Record<string, unknown>): 'single' | 'married' {
  const raw = cert.maritalStatus;
  if (
    raw === undefined ||
    raw === null ||
    raw === 'single' ||
    raw === 'hoh' ||
    raw === 'married_withhold_as_single'
  ) {
    return 'single';
  }
  if (raw === 'married') return 'married';
  throw new Error(
    `Unrecognized ID certificate.maritalStatus ${JSON.stringify(raw)} — expected 'single', ` +
      `'married', 'hoh' (folds into the single schedule per Idaho's own table heading), or ` +
      `'married_withhold_as_single' (Form ID W-4's Box C, which also withholds at the single rate).`,
  );
}

/**
 * Idaho's Percentage Computation Method (EPB00744, effective 2026-07-23) —
 * the simplest bracket shape in this project: ONE flat 5.3% rate above a
 * filing-status-only threshold (no progressive brackets at all — Idaho
 * became a true flat-tax state), published as an independently-rounded
 * per-period table (like Montana/NY/New Jersey) rather than one annual
 * figure divided down, so the {from,to,base,rate} WIBracket shape covers it
 * with exactly two rows per period: {0, threshold, 0, 0%} and {threshold,
 * null, 0, 5.3%}. married's threshold is exactly 2x single's in every
 * period published (verified: annual $16,100/$32,200, monthly $1,342/
 * $2,683, semimonthly $671/$1,342, biweekly $619/$1,238, weekly $310/$619,
 * daily $62/$124) — Idaho's own design, not a computed doubling here.
 *
 * Nonresident aliens: Form ID W-4's own instructions (fetched and read
 * directly) are genuinely different from every other NRA adjustment in this
 * project — Minnesota's W-4MN borrows FEDERAL Pub 15-T Table 2 and ADDS it
 * to WAGES before the bracket lookup runs; Idaho instead publishes its OWN
 * Pay Period table and tells the employee to force Box A (single), enter 0
 * allowances, and put the table's dollar figure directly on Line 2
 * (additional withholding) — a flat dollar ADD-ON TO THE COMPUTED TAX, not
 * a wage adjustment that could shift which bracket applies. Modeled here as
 * such: certificate.nonresidentAlien forces the single schedule and adds
 * cfg.nonresidentAlienAdjustment[payFrequency] to the final amount, rather
 * than requiring the caller to separately populate
 * certificate.additionalWithholding with a precomputed number (which would
 * also have worked, since that field is already generic, but doing it here
 * matches every other state's engine-consumed NRA handling instead of
 * leaving it as a caller obligation).
 *
 * NOT MODELLED (disclosed, not guessed): Form ID W-4's "Idaho Child Tax
 * Credit allowance" count. EPB00744 headlines every table "wages after
 * subtracting child tax credit allowances," but tax.idaho.gov/ictcat states
 * directly: "The Idaho Child Tax Credit has sunsetted per Idaho Code
 * Section 63-3029L. Because the credit is no longer in effect, the
 * allowance amount will be zero." A $0-per-allowance subtraction is a
 * no-op regardless of certificate.allowances, so this engine skips reading
 * that field entirely for 2026 rather than wiring a subtraction step that
 * can never do anything — same reasoning as Kentucky's K-4 having no
 * exemption-count field to read.
 */
function bracketTwoStatusPerPeriod(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketTwoStatus as BracketTwoStatusConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  // Form ID W-4's own NRA instructions: "Check the 'A' box (Single)
  // withholding regardless of your marital status" — forced, not merely
  // defaulted, so this overrides whatever certificate.maritalStatus says.
  const maritalStatus = cert.nonresidentAlien ? 'single' : resolveIDMaritalStatus(cert);

  const brackets = cfg.brackets[maritalStatus][input.payFrequency];
  if (!brackets) {
    throw new Error(
      `Idaho's own withholding tables don't publish a "${input.payFrequency}" bracket ` +
        `schedule — cannot compute ${rules.code}_SIT.`,
    );
  }
  const bracket = findWIBracket(brackets, taxableWages);
  const excess = taxableWages - dollars(bracket.from);
  const nraAdjustment = cert.nonresidentAlien
    ? dollars(cfg.nonresidentAlienAdjustment?.[input.payFrequency] ?? 0)
    : 0;
  const amount = dollars(bracket.base) + applyRate(excess, bracket.rate) + nraAdjustment;

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      (bracket.rate === 0
        ? `${fmt(taxableWages)} below the ${maritalStatus} ${fmt(dollars(bracket.to ?? 0))} threshold — $0`
        : `${fmt(taxableWages)} less ${fmt(dollars(bracket.from))} ${maritalStatus} threshold ` +
          `@ ${(bracket.rate * 100).toFixed(2)}%`) +
      (nraAdjustment
        ? `; plus ${fmt(nraAdjustment)}/period nonresident alien adjustment (Form ID W-4's own Pay Period table)`
        : ''),
  };
}
