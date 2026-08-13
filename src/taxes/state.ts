import { applyRate, atLeastZero, dollars, fmt, roundHalfUp } from '../money.ts';
import type { StateRuleset } from '../registry.ts';
import {
  countyRuleset,
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
    case 'no_income_tax':
      return [];
    default:
      throw new Error(
        `Unsupported withholding method "${rules.method}" for ${state.code}`,
      );
  }
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
