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
    lines = applyReducedStateWithholding(input, rules, lines);
  }

  // Maine is the first (and so far only) state in this project whose OWN
  // formula rounds to the nearest WHOLE DOLLAR, not the nearest cent — and
  // critically, USDA NFC's own bulletin (fetched directly) documents that
  // this re-rounds AGAIN after Line 2/5-style additional withholding is
  // added, not just once at the base-tax step. maineWithholding() already
  // rounds its own base amount to the nearest dollar, but
  // applyAdditionalStateWithholding() (shared by every state, and correct
  // as-is for every cent-rounding state) adds raw cents without
  // re-rounding — so a caller-supplied additionalWithholding that isn't
  // itself a whole-dollar figure would otherwise leave a non-whole-dollar
  // final amount for Maine specifically. Gated by a generic
  // rules.roundFinalToWholeDollar flag (not Maine-specific code) so any
  // future state with the same rounding convention gets this for free.
  if (rules.roundFinalToWholeDollar) {
    const primaryId = `${rules.code}_SIT`;
    lines = lines.map((line) =>
      line.id === primaryId ? { ...line, amount: toWholeDollars(line.amount) } : line,
    );
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

  // Employer's share of a Paid Leave-style premium — Washington PFML is the
  // first state in this project where the EMPLOYER also pays a share of the
  // same premium as the employee (New York/Minnesota's Paid Leave programs
  // are employee-only). Genuinely separate from statePaidLeaveEmployeeTax()
  // rather than a shared helper, because the employer share is defined as
  // "total premium minus employee share," not its own independent rate.
  const paidLeaveEmployer = statePaidLeaveEmployerTax(input, ctx, rules);
  if (paidLeaveEmployer) lines.push(paidLeaveEmployer);

  const disability = stateDisabilityEmployeeTax(input, ctx, rules);
  if (disability) lines.push(disability);

  // Long-term care insurance premium — Washington's WA Cares Fund is the
  // first state in this project with this specific levy (distinct from
  // Paid Leave/PFML, which funds job-protected leave; WA Cares funds a
  // long-term-care benefit). Structurally identical to
  // statePaidLeaveEmployeeTax() (flat rate, optionally wage-base-capped)
  // but genuinely a different program under a different statute, and the
  // existing statePaidLeaveEmployee config slot is already claimed by
  // Washington's own actual Paid Leave program in the same file — reusing
  // it for WA Cares too would silently overwrite one config with the other.
  const longTermCare = stateLongTermCareEmployeeTax(input, ctx, rules);
  if (longTermCare) lines.push(longTermCare);

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

  // Newark's payroll tax — a genuinely DIFFERENT shape from every other
  // local tax in this project: EMPLOYER-paid (not employee withholding —
  // the ordinance is explicit: "The Employer is responsible for the
  // Payroll Tax"), so it never touches net pay, and dispatched off
  // certificate.locality rather than a residency flag, since Newark taxes
  // by WHERE SERVICES ARE PERFORMED/SUPERVISED, not residence.
  const newark = newarkPayrollTaxEmployer(input, ctx, rules);
  if (newark) lines.push(newark);

  // Resident-working-elsewhere credit — a DIFFERENT direction from every
  // reciprocity mechanism above: those zero THIS state's tax when the
  // employee resides in a reciprocal state; this instead adds an
  // ADDITIONAL line for the employee's RESIDENCE state (Kansas is the
  // first — KW-100: "withhold... the amount of withholding tax due
  // Kansas, less the amount of withholding tax required by the other
  // state(s)"). Computed last, using the FINAL work-state SIT amount
  // (after this state's own reciprocity/exemption/additional/reduced
  // adjustments above), since "withholding tax required by the other
  // state" means what was actually withheld, not a pre-adjustment figure.
  const residentCredit = residentWorkingElsewhereCreditLine(input, ctx, lines);
  if (residentCredit) lines.push(residentCredit);

  return lines;
}

/**
 * See stateIncomeTax()'s own call site for the direction this runs in.
 * Gated by rules.residentWorkingElsewhereCredit on the RESIDENCE state's
 * OWN ruleset (opt-in per state, data-only — every other state silently
 * does nothing here, matching this file's existing convention for every
 * other generically-dispatched mechanism).
 *
 * Computes the residence state's OWN base income tax via incomeTaxLines()
 * DIRECTLY, not the full stateIncomeTax() wrapper — this is the raw
 * "amount due" KW-100 describes, not layered with the residence state's
 * own UC/PFML/disability/reciprocity machinery, none of which bears on
 * this specific credit calculation. Runs on a VIRTUAL input with workState
 * swapped to the residence state (and ITS OWN certificate) because every
 * existing method function reads input.workState?.certificate — the
 * employee's actual K-4-equivalent filed FOR the residence state lives at
 * input.residenceState.certificate, a different certificate than whatever
 * (if anything) applies to the real work state.
 *
 * Emits an explicit line even when the credit computes to $0 (the other
 * state withheld at least as much as the residence state would have) —
 * that is a normal, expected outcome KW-100 itself documents, not a
 * missing-data signal, so it gets the same "explicit, not silent" $0
 * treatment as every other zeroed line in this file.
 */
function residentWorkingElsewhereCreditLine(
  input: PaycheckInput,
  ctx: ComputeContext,
  workStateLines: TaxLine[],
): TaxLine | null {
  const residence = input.residenceState;
  const work = input.workState;
  if (!residence || !work || residence.code === work.code) return null;
  if (!hasStateRuleset(residence.code, input.checkDate)) return null;

  const residenceRules = stateRuleset(residence.code, input.checkDate);
  if (!residenceRules.residentWorkingElsewhereCredit) return null;

  const virtualInput: PaycheckInput = {
    ...input,
    workState: { code: residence.code, certificate: residence.certificate },
  };
  const residenceLines = incomeTaxLines(virtualInput, ctx, residenceRules);
  const residenceTax = residenceLines
    .filter((l) => l.id === `${residence.code}_SIT`)
    .reduce((sum, l) => sum + l.amount, 0);

  const workTax = workStateLines
    .filter((l) => l.id === `${work.code}_SIT`)
    .reduce((sum, l) => sum + l.amount, 0);

  const credit = atLeastZero(residenceTax - workTax);

  return {
    id: `${residence.code}_SIT_CREDIT`,
    name: `${residenceRules.name} Income Tax (Resident Working Elsewhere)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: residenceLines[0]?.taxableWages ?? 0,
    amount: credit,
    detail:
      `${fmt(residenceTax)} ${residence.code} tax due on these wages, less ${fmt(workTax)} ` +
      `${work.code} withholding actually withheld = ${fmt(credit)}` +
      (credit === 0 && residenceTax > 0
        ? ` (${work.code} withholding covers or exceeds the ${residence.code} amount — no ${residence.code} withholding due)`
        : ''),
  };
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

/**
 * Reduced per-period withholding requested by the employee — Connecticut's
 * Form CT-W4 is the first (and so far only) state form in this project with
 * a REQUEST-LESS-WITHHOLDING line (Line 3), the mirror image of every other
 * state's additional-withholding line (Line 2 on the same form, already
 * handled generically by applyAdditionalStateWithholding()). Connecticut's
 * own Withholding Calculation Rules Step 15/16 state the amount "cannot
 * exceed the total withholding amount" and the final result "cannot be less
 * than zero" — enforced here via atLeastZero() rather than trusting the
 * caller to have already capped certificate.reducedWithholding correctly.
 * Generic by design (reads certificate.reducedWithholding, not gated to
 * Connecticut specifically) so any future state with the same request-less
 * mechanic gets this for free, the same reusability convention as
 * applyAdditionalStateWithholding().
 */
function applyReducedStateWithholding(
  input: PaycheckInput,
  rules: StateRuleset,
  lines: TaxLine[],
): TaxLine[] {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.exempt) return lines;

  const reduction = Number(cert.reducedWithholding ?? 0);
  if (reduction <= 0) return lines;

  const primaryId = `${rules.code}_SIT`;
  return lines.map((line) =>
    line.id === primaryId
      ? {
          ...line,
          amount: atLeastZero(line.amount - reduction),
          detail: `${line.detail}; less ${fmt(reduction)} reduced withholding requested (certificate.reducedWithholding), floored at $0`,
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
    case 'connecticut_withholding_code':
      return [connecticutWithholdingCode(input, ctx, rules)];
    case 'flat_rate_marital_deduction':
      return [flatRateMaritalDeduction(input, ctx, rules)];
    case 'bracket_per_period_allowance':
      return [bracketPerPeriodAllowance(input, ctx, rules)];
    case 'flat_rate_surtax_credit':
      return [flatRateSurtaxCredit(input, ctx, rules)];
    case 'bracket_per_period_kansas':
      return [bracketPerPeriodKansas(input, ctx, rules)];
    case 'bracket_phaseout_deduction_whole_dollar':
      return [maineWithholding(input, ctx, rules)];
    case 'bracket_per_period':
      return [ohioWithholding(input, ctx, rules)];
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

  // Generic exemption gate, added for Washington PFML (whose own program
  // exempts federal employers/employees, federally-recognized Tribes,
  // self-employed individuals, and pre-Oct-2017 collective-bargaining
  // units — several of which MAY opt in, which this engine treats no
  // differently from any other elected coverage) but deliberately NOT
  // Washington-specific: certificate.paidLeaveExempt is read the same way
  // for any state using this shared function, the same "state-agnostic,
  // opt-in via a certificate field" convention as certificate.exempt for
  // income tax. Minnesota/New York's own Paid Leave programs are simply
  // never expected to set this field, so their existing behavior is
  // unaffected either way.
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.paidLeaveExempt) {
    return {
      id: `${rules.code}_PFML_EE`,
      name: `${rules.name} Paid Leave (Employee)`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages,
      amount: 0,
      detail:
        '$0 — Paid Leave exemption on file (certificate.paidLeaveExempt); this engine does not verify the ' +
        'underlying eligibility category.',
    };
  }

  // Rate override, added for Maine: employers under 15 employees have a
  // LOWER total obligation (0.5%, vs 1.0% for 15+) and may legally choose
  // to absorb some of it themselves rather than passing the full amount to
  // the employee — a genuine employer-discretion fact this engine cannot
  // derive from statute alone (unlike the wage-base cap or the exemption
  // gate above, there's no single correct number; it's a per-employer
  // choice). Rather than leave that as an unfixable disclosed gap, this
  // lets the CALLER supply the actual negotiated/chosen rate when they
  // know it, while cfg.rate remains the correct default (the statutory
  // MAXIMUM either employer-size tier may charge — Maine's own FAQ: "no
  // more than 0.5 percent can come from the employee" applies uniformly to
  // both tiers, so the default is already right for the common case).
  // State-agnostic, like every other certificate gate on this shared
  // function — Minnesota/New York/Washington are never expected to set it.
  const rateOverride = cert.paidLeaveEmployeeRateOverride;
  const rate = typeof rateOverride === 'number' ? rateOverride : cfg.rate;
  const amount = applyRate(taxableWages, rate);

  return {
    id: `${rules.code}_PFML_EE`,
    name: `${rules.name} Paid Leave (Employee)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      (typeof rateOverride === 'number'
        ? `rate overridden via certificate.paidLeaveEmployeeRateOverride (this employer's own chosen rate, ` +
          `not the ${(cfg.rate * 100).toFixed(2)}% statutory maximum); `
        : '') +
      (cfg.wageBase === null
        ? `${fmt(taxableWages)} @ ${(rate * 100).toFixed(2)}%, no wage cap`
        : `${fmt(taxableWages)} @ ${(rate * 100).toFixed(2)}%, capped at ${fmt(dollars(cfg.wageBase))}/yr (${fmt(ytd)} YTD already counted)`),
  };
}

interface StatePaidLeaveEmployerConfig {
  totalRate: number; // e.g. 0.0113 — Washington's own combined premium rate
  employeeShareFraction: number; // e.g. 0.7143 — fraction of totalRate the EMPLOYEE pays
  wageBase: number | null; // dollars, annual — shares the SAME cap as the employee share
  exemptPretax?: string[];
}

/**
 * Employer's share of a Paid Leave-style premium — Washington's own
 * "Employer Wage Reporting and Premiums Toolkit" (fetched and read
 * directly) gives the EXACT formula: "Gross wages x 0.0113 = Total Premium
 * ... Gross wages x 0.0113 x 0.7143 = Employee Share ... Total Premium −
 * Employee Share = Employer Share." Computed here the same way — total and
 * employee share both derived directly from taxableWages (not by
 * subtracting two independently-rounded numbers, which could drift by a
 * cent from the source's own single-multiplication-per-line method) — then
 * subtracted, matching the source's own Step 3 exactly.
 *
 * Washington's own rule: employers with fewer than 50 WA employees are NOT
 * required to pay this share (though they must still withhold/remit the
 * EMPLOYEE share regardless). Whether THIS employer clears that 50-employee
 * threshold is an EMPLOYER-AGGREGATE fact this engine cannot see from one
 * employee's paycheck — the same class of gap already disclosed for
 * Newark's payroll tax. Gated by certificate.employerLiableForPaidLeaveShare,
 * which the CALLER sets after the employer's own headcount determination —
 * absent or false, this returns null (no line at all), matching the "small
 * employers have no obligation here" default rather than emitting a
 * confusing $0 line for the common case.
 */
function statePaidLeaveEmployerTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cfg = rules.statePaidLeaveEmployer as StatePaidLeaveEmployerConfig | undefined;
  if (!cfg) return null;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (!cert.employerLiableForPaidLeaveShare) return null;
  // Same exemption gate as statePaidLeaveEmployeeTax() — an exempt employee
  // (federal, Tribal, self-employed opt-out, etc.) generates no premium at
  // all, employee or employer share, since there's no total premium to
  // split in the first place.
  if (cert.paidLeaveExempt) return null;

  const exempt = (cfg.exemptPretax ?? rules.exemptPretax ?? []) as PretaxCategory[];
  const currentWages = ctx.taxableWagesFor(exempt);
  const ytd = input.ytd.statePaidLeave?.[rules.code] ?? 0;
  const cap = cfg.wageBase === null ? null : dollars(cfg.wageBase);
  const taxableWages = underCap(currentWages, ytd, cap);

  const totalPremium = applyRate(taxableWages, cfg.totalRate);
  const employeeShare = applyRate(taxableWages, cfg.totalRate * cfg.employeeShareFraction);
  const amount = atLeastZero(totalPremium - employeeShare);

  return {
    id: `${rules.code}_PFML_ER`,
    name: `${rules.name} Paid Leave (Employer)`,
    payer: 'employer',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      `${fmt(totalPremium)} total premium (${fmt(taxableWages)} @ ${(cfg.totalRate * 100).toFixed(2)}%) ` +
      `less ${fmt(employeeShare)} employee share = ${fmt(amount)} employer share ` +
      `(certificate.employerLiableForPaidLeaveShare — caller's own employer-size determination; ` +
      `the exact headcount threshold is state-specific, e.g. Washington's 50+ vs Massachusetts's 25+, ` +
      `and is not itself encoded here since this function is shared across states)`,
  };
}

interface StateLongTermCareEmployeeConfig {
  rate: number;
  wageBase: number | null;
  exemptPretax?: string[];
}

/**
 * Long-term care insurance premium — Washington's WA Cares Fund is the
 * first state in this project with this specific levy, genuinely distinct
 * from Paid Leave/PFML (which funds job-protected leave) even though it's
 * structurally identical (flat rate, optionally wage-base-capped) to
 * statePaidLeaveEmployeeTax(). 100% employee-paid, per Washington's own
 * toolkit, quoted verbatim: "Employees are responsible for the full WA
 * Cares premium... The Social Security cap does not apply" — confirmed
 * UNCAPPED (wageBase: null), unlike PFML which shares the SS cap.
 */
function stateLongTermCareEmployeeTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cfg = rules.stateLongTermCareEmployee as StateLongTermCareEmployeeConfig | undefined;
  if (!cfg) return null;

  const exempt = (cfg.exemptPretax ?? rules.exemptPretax ?? []) as PretaxCategory[];
  const currentWages = ctx.taxableWagesFor(exempt);
  const ytd = input.ytd.stateLongTermCare?.[rules.code] ?? 0;
  const cap = cfg.wageBase === null ? null : dollars(cfg.wageBase);
  const taxableWages = underCap(currentWages, ytd, cap);

  // wacaresfund.wa.gov's own exemptions page (fetched directly): FIVE
  // distinct exemption categories exist for Washington specifically —
  // residency outside WA, active-duty military (or spouse), a 70%+
  // service-connected veteran disability rating, an approved pre-2023
  // private-LTC-insurance exemption (closed to new applicants but still
  // permanently binding for existing holders), and — genuinely unlike
  // every other exemption in this project — non-immigrant work-visa
  // holders are AUTOMATICALLY exempt as of 2026-01-01 UNLESS they
  // proactively opt IN. This engine does not adjudicate eligibility for
  // any of these (the same scope boundary as every other state's
  // certificate.exempt) — the caller is responsible for having already
  // resolved which category (if any) applies, including the visa-holder
  // default-exemption logic, and passes the single resulting boolean.
  // Not reusing the income-tax certificate.exempt field/mechanism: that
  // one is scoped to zeroing `${code}_SIT`-prefixed lines only (see
  // zeroStateIncomeTaxLines()) and Washington has no income tax at all —
  // this is a genuinely separate levy with its own exemption concept.
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.wacaresExempt) {
    return {
      id: `${rules.code}_LTC_EE`,
      name: `${rules.name} Long-Term Care (Employee)`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages,
      amount: 0,
      detail:
        '$0 — WA Cares Fund exemption on file (certificate.wacaresExempt); this engine does not verify ' +
        'the underlying approval letter or eligibility category (residency/military/veteran-disability/' +
        'private-LTC-insurance/non-immigrant-visa).',
    };
  }

  const amount = applyRate(taxableWages, cfg.rate);

  return {
    id: `${rules.code}_LTC_EE`,
    name: `${rules.name} Long-Term Care (Employee)`,
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
 * NJ-WT's own ALTERNATE rule for supplemental wages paid on a SEPARATE
 * cheque from regular wages ("withhold from the supplemental wages without
 * any exemption allowances") IS modelled: detected structurally, not via a
 * separate certificate flag — a paycheck with supplemental cash and NO
 * 'regular'-category earning at all IS a standalone supplemental cheque by
 * definition, a signal the earnings array already carries. (This does NOT
 * close the cross-period class of gap already disclosed for Kentucky's own
 * separate-cheque rule and Indiana's 30-day nonresident rule — NJ-WT's own
 * "different time" language implicitly assumes a prior regular cheque
 * already existed this period, which a standalone calculatePaycheck() call
 * has no way to look back at; this only distinguishes the WITHIN-this-cheque
 * shape NJ-WT itself describes: allowance subtracted, or not.)
 *
 * Every bracket base figure in NJ-2026.json's Rate Tables was reconstructed
 * from NJ-WT's own annual boundaries+rates (the cleanly-extracted table) and
 * verified to reproduce every one of NJ-WT's own per-period base figures to
 * the cent for all 8 pay periods — see the file's own $methodComment/
 * $extractionNote (the "daily" period needed real care: NJ-WT's own table
 * divides the annual figure by 365, not this engine's usual 260-workday
 * convention).
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

  const rateTable = resolveNJRateTable(cert);
  const brackets = cfg.brackets[rateTable][input.payFrequency];
  if (!brackets) {
    throw new Error(
      `New Jersey's own Rate Table "${rateTable}" doesn't publish a "${input.payFrequency}" ` +
        `bracket schedule — cannot compute ${rules.code}_SIT.`,
    );
  }

  const supplementalCash = supplementalEarnings(input.earnings);
  const hasRegularWages = input.earnings.some((e) => e.category === 'regular');
  if (!hasRegularWages && supplementalCash > 0) {
    const bracket = findWIBracket(brackets, grossWages);
    const excess = grossWages - dollars(bracket.from);
    const amount = dollars(bracket.base) + applyRate(excess, bracket.rate);
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: grossWages,
      amount,
      detail:
        `${fmt(grossWages)} supplemental wages on a separate cheque (no regular wages this ` +
        `period) — NJ-WT: withheld WITHOUT exemption allowances, Rate Table ${rateTable} @ ` +
        `${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))}`,
    };
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

type CTCode = 'A' | 'B' | 'C' | 'D' | 'F';

interface CTStepRow {
  from: number; // dollars, annualized salary
  to: number | null; // dollars, null = no ceiling
}
interface CTExemptionRow extends CTStepRow {
  exemption: number; // dollars
}
interface CTCreditRow extends CTStepRow {
  credit: number; // decimal fraction, e.g. 0.75 -- NOT a dollar figure, never passed through dollars()
}

interface ConnecticutTablesConfig {
  tableA: Record<CTCode, CTExemptionRow[] | 'ZERO'>;
  tableB: Record<CTCode, WIBracket[]>;
  tableC: Record<CTCode, WIBracket[]>;
  tableD: Record<CTCode, WIBracket[]>;
  tableE: Record<CTCode, CTCreditRow[] | 'ZERO'>;
  noFormRate: number; // flat rate withheld when no Form CT-W4 is on file
}

/**
 * Resolves Form CT-W4's own "Withholding Code" (Line 1: A, B, C, D, or F —
 * Code E is EXEMPT, already handled generically upstream by
 * certificate.exempt / zeroStateIncomeTaxLines(), never reaches this
 * function). Genuinely different from every other state's certificate
 * shape in this project: Connecticut's own code ISN'T a marital-status
 * field with a documented single/no-form default — Circular CT (fetched
 * and read directly) states plainly: "If an employee fails to give you a
 * completed Form CTW4, you must withhold at a flat rate of 6.99%, without
 * allowance [for exemption]." Returning null (rather than a code) signals
 * that no-form case to connecticutWithholdingCode(), which routes to the
 * flat-rate path instead of guessing a code.
 */
function resolveCTCode(cert: Record<string, unknown>): CTCode | null {
  const raw = cert.withholdingCode;
  if (raw === undefined || raw === null) return null;
  if (raw === 'A' || raw === 'B' || raw === 'C' || raw === 'D' || raw === 'F') return raw;
  throw new Error(
    `Unrecognized CT certificate.withholdingCode ${JSON.stringify(raw)} — expected 'A', 'B', ` +
      `'C', 'D', or 'F' (Form CT-W4's own Withholding Code letters; 'E' is exempt, handled ` +
      `via certificate.exempt instead of a withholding code).`,
  );
}

function findCTStep<T extends CTStepRow>(rows: T[], salaryCents: number): T {
  for (const r of rows) {
    const from = dollars(r.from);
    const to = r.to === null ? Infinity : dollars(r.to);
    if (salaryCents >= from && salaryCents < to) return r;
  }
  return rows[rows.length - 1];
}

/**
 * Connecticut's Withholding Calculation Rules (IP 2026(1) / TPG-211,
 * effective 2026-01-01, "unchanged from 2025") — by far the most involved
 * formula in this project: FIVE separate tables chained together (Table A
 * personal exemption phase-DOWN, Table B a genuine progressive bracket,
 * Table C a step-function "2% bracket phase-out add-back" for
 * upper-middle incomes, Table D a step-function "tax recapture" that claws
 * back the benefit of the lower brackets entirely for high earners, Table E
 * a step-function personal-credit DECIMAL multiplier applied last), all
 * keyed off ANNUALIZED salary (Step 3) rather than per-period wages
 * directly, then divided back down to a per-period amount at the very end
 * (Step 13) — closer in spirit to NY's Method II than to any single-table
 * bracket state already in this project, but with two additional
 * step-function adjustments NY doesn't have.
 *
 * Implements Steps 1-13 only. Steps 14-16 (Form CT-W4 Line 2 "additional"
 * and Line 3 "reduced" withholding, floored at $0) are NOT duplicated here
 * — Line 2 is already the exact same certificate.additionalWithholding
 * mechanism every other state's form uses (applyAdditionalStateWithholding,
 * called generically by stateIncomeTax()), and Line 3 is the new
 * applyReducedStateWithholding() this state introduced. Keeping those two
 * steps in the shared outer wrapper rather than re-implementing them here
 * avoids double-applying certificate.additionalWithholding.
 *
 * Table C and Table D are step functions (a single flat dollar amount for
 * the whole row, no marginal rate within the row) rather than genuine
 * brackets, confirmed from Circular CT's own column headers ("2% Tax Rate
 * Phase-Out Add-Back" / "Recapture Amount", not "of excess over") — modeled
 * by reusing the WIBracket {from,to,base,rate} shape with rate ALWAYS 0, so
 * findWIBracket()'s existing base+rate×excess arithmetic collapses to just
 * `base` for every row, without needing a separate step-only lookup type.
 */
function connecticutWithholdingCode(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.connecticutTables as ConnecticutTablesConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt); // Step 1

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const code = resolveCTCode(cert); // Step 4

  if (code === null) {
    const amount = applyRate(taxableWages, cfg.noFormRate);
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages,
      amount,
      detail:
        `${fmt(taxableWages)} @ ${(cfg.noFormRate * 100).toFixed(2)}% flat, no allowance — ` +
        `no Form CT-W4 on file (certificate.withholdingCode not set)`,
    };
  }

  const annualizedSalary = taxableWages * ctx.periodsPerYear; // Step 3

  const exemptionTable = cfg.tableA[code];
  const exemption =
    exemptionTable === 'ZERO' ? 0 : dollars(findCTStep(exemptionTable, annualizedSalary).exemption); // Step 5
  const annualizedTaxable = annualizedSalary - exemption; // Step 6

  let annualTotal: number;
  let detail: string;

  if (annualizedTaxable <= 0) {
    annualTotal = 0;
    detail = `${fmt(annualizedSalary)}/yr less ${fmt(exemption)} Code ${code} exemption = $0 taxable`;
  } else {
    const initialBracket = findWIBracket(cfg.tableB[code], annualizedTaxable);
    const initialTax =
      dollars(initialBracket.base) + applyRate(annualizedTaxable - dollars(initialBracket.from), initialBracket.rate); // Step 7

    const phaseOutAddBack = dollars(findWIBracket(cfg.tableC[code], annualizedSalary).base); // Step 8
    const recapture = dollars(findWIBracket(cfg.tableD[code], annualizedSalary).base); // Step 9
    const withholdingAmount = initialTax + phaseOutAddBack + recapture; // Step 10

    const creditTable = cfg.tableE[code];
    const credit = creditTable === 'ZERO' ? 0 : findCTStep(creditTable, annualizedSalary).credit; // Step 11
    annualTotal = roundHalfUp(withholdingAmount * (1 - credit)); // Step 12

    detail =
      `${fmt(annualizedSalary)}/yr less ${fmt(exemption)} Code ${code} exemption = ${fmt(annualizedTaxable)} taxable; ` +
      `initial tax ${fmt(initialTax)} + ${fmt(phaseOutAddBack)} 2% phase-out add-back + ${fmt(recapture)} recapture ` +
      `= ${fmt(withholdingAmount)}, less ${(credit * 100).toFixed(0)}% personal credit`;
  }

  const amount = Math.round(annualTotal / ctx.periodsPerYear); // Step 13

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail: `${detail}, ÷ ${ctx.periodsPerYear}`,
  };
}

interface IowaConfig {
  rate: number;
  deduction2024Plus: { other: number; hoh: number; mfj_no_spouse_income: number }; // ANNUAL dollars
  deductionLegacy: { single: number; married: number }; // ANNUAL dollars
  legacyAllowanceAmount: number; // dollars per allowance, pre-2024 IA W-4 only
}

/**
 * Resolves the 2026 IA W-4's own "Filing Status" checkboxes (Other/Single,
 * Head of Household, Married filing jointly or Qualifying Surviving Spouse)
 * plus its "does your spouse also have earned income?" Yes/No sub-question
 * to which of Iowa's THREE deduction columns applies. Per the form's own
 * instructions (fetched and read directly): checking "Yes" to the spouse
 * question routes to the SAME deduction column as "Other" (i.e. computed as
 * if single) — "This means the deduction for taxpayers using the filing
 * status single will be used in the calculation" — while "No" OR LEFT BLANK
 * routes to the wider joint-filer column. Default (no form, or marital
 * status missing) is 'other', matching the Withholding Formula document's
 * own explicit fallback: "the employee's marital status is missing" is one
 * of the three named conditions for column (A).
 */
function resolveIA2024Status(
  cert: Record<string, unknown>,
): 'other' | 'hoh' | 'mfj_no_spouse_income' {
  const raw = cert.maritalStatus;
  if (raw === undefined || raw === null || raw === 'other') return 'other';
  if (raw === 'hoh') return 'hoh';
  if (raw === 'mfj') return cert.spouseHasEarnedIncome === true ? 'other' : 'mfj_no_spouse_income';
  throw new Error(
    `Unrecognized IA certificate.maritalStatus ${JSON.stringify(raw)} — expected 'other' ` +
      `(includes Single/MFS), 'hoh', or 'mfj' (with certificate.spouseHasEarnedIncome deciding ` +
      `which of the two MFJ deduction columns applies).`,
  );
}

/**
 * Resolves the LEGACY (2023-or-earlier) IA W-4's own two-column marital
 * status — Single (or married but legally separated) vs. Married — used
 * only when certificate.formVintage is 'pre_2024'. Iowa's 2026 Withholding
 * Formula document (fetched and read directly) explicitly preserves this
 * path: "employers may continue to compute withholding based on the
 * information from the employee's most recently furnished Form W-4," with
 * its own Steps 1B/3B for exactly this case, because Iowa does not require
 * existing employees to refile after a form redesign.
 */
function resolveIALegacyStatus(cert: Record<string, unknown>): 'single' | 'married' {
  const raw = cert.maritalStatus;
  if (raw === undefined || raw === null || raw === 'single') return 'single';
  if (raw === 'married') return 'married';
  throw new Error(
    `Unrecognized IA certificate.maritalStatus ${JSON.stringify(raw)} for a pre-2024 IA W-4 — ` +
      `expected 'single' or 'married'.`,
  );
}

/**
 * Iowa's 2026 Withholding Formula (revenue.iowa.gov, effective 2026-01-01,
 * fetched and read directly, including all 10 of the document's own
 * to-the-cent worked examples — reproduced exactly in
 * tests/engine.test.ts). Flat 3.80% (Iowa became a true flat-tax state
 * under SF2442) over wages less a marital-status-dependent deduction, less
 * a dollar allowance amount divided by pay periods:
 * T1 = G − D, T2 = T1 × 3.80%, T3 = T2 − (W ÷ P).
 *
 * The source publishes D as a SEPARATE pre-rounded dollar figure per pay
 * period (daily/weekly/biweekly/semimonthly/monthly/annual) rather than one
 * annual figure divided down — but verified BY CONSTRUCTION that every
 * published per-period D figure equals the annual figure divided by that
 * period's own periodsPerYear, rounded to the cent (e.g. semimonthly
 * $541.67 = $13,000 ÷ 24). This engine stores only the annual figure and
 * computes D_period = annualD ÷ periodsPerYear UNROUNDED, rounding only
 * once at final emission — algebraically proven equivalent to the source's
 * own explicit fallback for pay frequencies it doesn't publish a table for
 * (quarterly/semiannual): "use the annual payroll formulas to get T3, [then]
 * divide this amount by 4" (or 2). Distributing that single division across
 * G, D, and W individually before combining, versus doing it once at the
 * end, produces the identical result by simple algebra — so ONE code path
 * correctly covers all 8 PayFrequency values, not just the 6 the source
 * tabulates directly.
 *
 * Two IA W-4 vintages are both live in practice (Iowa does not require
 * existing employees to refile after a form redesign): the CURRENT
 * (2024-or-later) form has the employee compute and report a single TOTAL
 * dollar allowance amount (Line 7 — this engine takes that figure directly
 * via certificate.totalAllowanceAmount, the same "caller supplies the
 * already-computed number" convention as every other state's
 * additionalWithholding, rather than re-deriving the form's own six-line
 * worksheet); the LEGACY (2023-or-earlier) form instead reports a plain
 * allowance COUNT multiplied by a flat $40 each. Selected via
 * certificate.formVintage — default (unset) is the current form.
 *
 * Step 4 (add certificate.additionalWithholding, Line 8) is NOT handled
 * here — it's already covered generically by applyAdditionalStateWithholding()
 * in the caller, the same as every other state's own "Line 2"-equivalent.
 */
function flatRateMaritalDeduction(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.iowaWithholding as IowaConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const periodsPerYear = ctx.periodsPerYear;

  let annualDeduction: number; // dollars
  let allowanceCents: number;
  let pathNote: string;

  if (cert.formVintage === 'pre_2024') {
    const status = resolveIALegacyStatus(cert);
    annualDeduction = cfg.deductionLegacy[status];
    const count = Number(cert.allowances ?? 0);
    allowanceCents = dollars(cfg.legacyAllowanceAmount) * count;
    pathNote = `pre-2024 IA W-4, ${status}, ${count} allowance(s) × $${cfg.legacyAllowanceAmount}`;
  } else {
    const status = resolveIA2024Status(cert);
    annualDeduction = cfg.deduction2024Plus[status];
    allowanceCents = Number(cert.totalAllowanceAmount ?? 0);
    pathNote = `2024+ IA W-4, ${status}`;
  }

  const deductionPerPeriod = dollars(annualDeduction) / periodsPerYear;
  const allowancePerPeriod = allowanceCents / periodsPerYear;

  const t1 = taxableWages - deductionPerPeriod;
  const t2 = t1 * cfg.rate;
  const t3 = t2 - allowancePerPeriod;
  const amount = atLeastZero(roundHalfUp(t3));

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      `${fmt(taxableWages)} less ${fmt(roundHalfUp(deductionPerPeriod))} deduction (${pathNote}) ` +
      `@ ${(cfg.rate * 100).toFixed(2)}%, less ${fmt(roundHalfUp(allowancePerPeriod))} allowance/period`,
  };
}

interface VTBracketConfig {
  allowanceAmount: Record<string, number>; // dollars, keyed by PayFrequency
  brackets: Record<'single' | 'married', Record<string, WIBracket[]>>;
}

/**
 * Resolves Form W-4VT's filing-status checkboxes to which of Vermont's TWO
 * published bracket schedules applies. The form (fetched and read
 * directly) actually has FOUR boxes — Single, Married/Civil Union Filing
 * Jointly, Married/Civil Union Filing Separately, and "Married, but
 * withhold at higher Single rate" — not two, a real gap the withholding
 * TABLES document alone (which only shows "Single"/"Married" schedule
 * headers) would never have surfaced; caught by deliberately fetching the
 * actual form the same way Idaho's Box C was caught. Married-filing-
 * separately and the explicit higher-single-rate checkbox BOTH resolve to
 * the single schedule — confirmed both directly (the form's own general
 * information: "'Married, but withhold at higher Single rate' should be
 * used if you are married but filing separately, or if both spouses work")
 * and cross-source. Head of household has NO checkbox on this form at
 * all — HOH filers check "Single" and add one extra allowance via the
 * allowance worksheet's own Line 4, so it never reaches this resolver as a
 * distinct status; certificate.allowances is expected to already include
 * that +1, the same "caller supplies the already-computed total" convention
 * as every other state's own allowance count.
 */
function resolveVTMaritalStatus(cert: Record<string, unknown>): 'single' | 'married' {
  const raw = cert.maritalStatus;
  if (
    raw === undefined ||
    raw === null ||
    raw === 'single' ||
    raw === 'mfs' ||
    raw === 'married_withhold_as_single'
  ) {
    return 'single';
  }
  if (raw === 'mfj') return 'married';
  throw new Error(
    `Unrecognized VT certificate.maritalStatus ${JSON.stringify(raw)} — expected 'single', ` +
      `'mfs', 'married_withhold_as_single', or 'mfj' (civil union partners use the same ` +
      `'mfj' schedule per Form W-4VT's own "Civil union partners use Married table" note).`,
  );
}

/**
 * Vermont's Percentage Method Withholding (GB-1210-2026, effective
 * 2026-01-01, fetched and read directly): subtract a flat per-allowance
 * dollar amount (times the count claimed on Form W-4VT) from PER-PERIOD
 * gross wages, then look up the result in one of Vermont's own two
 * per-period bracket tables (Single or Married) — genuinely the same shape
 * as New Jersey's Rate Table method (bracketPerPeriodRateTable), just with
 * 2 schedules selected by marital status instead of 5 selected by W-4
 * checkboxes, so this is a small parallel function rather than a forced
 * reuse of NJ's NJ-specific resolver. Brackets are published independently
 * PER PERIOD (like Montana/NY/NJ/Connecticut), not derived by dividing one
 * annual table — transcribed verbatim per period rather than derived from
 * the annual figures, unlike Iowa's flat 2-bracket shape, because a real
 * marginal bracket schedule is more sensitive to exact boundary/base cents
 * than Iowa's single flat-rate-above-a-threshold shape was proven to be.
 * Verified against the source's own worked example: weekly $1,800, married,
 * 2 allowances ($103.85 x2=$207.70) → $45.77 — see
 * tests/engine.test.ts, describe('Vermont').
 *
 * NOT MODELLED (disclosed, not guessed): Vermont's own guidance that
 * NON-PERIODIC supplemental payments "can be ESTIMATED at 30% of the
 * federal withholding" — permissive wording ("can be"), not a required
 * formula the way New York's 11.70% Method A is, and it would require
 * reading federal's OWN supplemental rate (22%/37% tiers) at calculation
 * time to reproduce faithfully. Periodic supplemental wages paid at the
 * SAME time as regular wages already aggregate correctly through this
 * function via the normal taxableWagesFor() base, no special-casing
 * needed — the same convention as Kentucky/Idaho/Connecticut/Iowa.
 */
function bracketPerPeriodAllowance(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.vermontWithholding as VTBracketConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const grossWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const allowances = Number(cert.allowances ?? 0);
  const allowancePerUnit = cfg.allowanceAmount[input.payFrequency];
  if (allowancePerUnit === undefined) {
    throw new Error(
      `Vermont's own withholding allowance table doesn't publish a "${input.payFrequency}" ` +
        `figure — cannot compute ${rules.code}_SIT.`,
    );
  }
  const allowance = roundHalfUp(dollars(allowancePerUnit) * allowances);
  const netWages = atLeastZero(grossWages - allowance);

  const status = resolveVTMaritalStatus(cert);
  const brackets = cfg.brackets[status][input.payFrequency];
  if (!brackets) {
    throw new Error(
      `Vermont's own withholding tables don't publish a "${input.payFrequency}" bracket ` +
        `schedule — cannot compute ${rules.code}_SIT.`,
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
      `${fmt(grossWages)} gross less ${fmt(allowance)} allowance (${allowances} × $${allowancePerUnit}) ` +
      `= ${fmt(netWages)} net, ${status} @ ${(bracket.rate * 100).toFixed(2)}% over ` +
      `${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))}`,
  };
}

interface KSExemptionTiers {
  personal: number; // dollars, ANNUAL, per B/C line claimed on Form K-4 ($9,160 each)
  hohAdditional: number; // dollars, ANNUAL, Line D if filing head of household ($2,320)
  dependent: number; // dollars, ANNUAL, per dependent on Line E ($2,320 each)
}

interface KSConfig {
  exemptionTiers: KSExemptionTiers;
  brackets: Record<'single' | 'joint', Record<string, WIBracket[]>>; // second key is PayFrequency
}

/**
 * Resolves Form K-4's own "Allowance Rate" (Line 3 / Line A of the Personal
 * Allowance Worksheet — Single or Joint) to which of Kansas's two published
 * bracket tables applies. Head of Household uses the SAME table as Single
 * — Table 3's own heading is literally "(a) SINGLE person (including Head
 * of Household)" — HOH only affects the EXEMPTION AMOUNT (via Line D's
 * $2,320 bonus, see kansasExemptionAmount()), never which bracket table is
 * looked up. Default (no K-4 on file) is 'single', matching the guide's own
 * explicit instruction: "If your employer does not receive a K-4 form from
 * you, they must withhold Kansas income tax from your wages without
 * exemption at the 'Single' allowance rate" — a rare case in this project
 * where the no-form default is a directly quoted state instruction, not
 * just this project's own standing convention.
 */
function resolveKSAllowanceRate(cert: Record<string, unknown>): 'single' | 'joint' {
  const raw = cert.allowanceRate;
  if (raw === undefined || raw === null || raw === 'single') return 'single';
  if (raw === 'joint') return 'joint';
  throw new Error(
    `Unrecognized KS certificate.allowanceRate ${JSON.stringify(raw)} — expected 'single' or 'joint'.`,
  );
}

/**
 * Form K-4's Personal Allowance Worksheet does NOT compute a single flat
 * per-allowance dollar figure the way most other states' allowance
 * mechanisms do — each line is worth a DIFFERENT amount: Line B ("married
 * or single") and Line C ("spouse does not work") are each worth Kansas's
 * flat personal exemption ($9,160) INDEPENDENTLY (a married couple who
 * both claim B and C gets $18,320 total — two $9,160 units, not one
 * "married" constant), Line D (head of household) adds a further $2,320,
 * and Line E is $2,320 per dependent. Verified against KW-100's own worked
 * example (Esmeralda: married, spouse not working, 1 dependent — claims
 * B=1, C=1, D=0, E=1 — $9,160 + $9,160 + $2,320 = $20,640, matching the
 * guide's own "$18,320 (equivalent to two exemptions of $9,160) + $2,320"
 * arithmetic exactly). Because of this, certificate.personalAllowances (a
 * caller-supplied count of how many $9,160 units are claimed — normally 1
 * for a single filer, 0-2 for a married one) is what this engine reads,
 * NOT Form K-4's own Line F total (B+C+D+E summed together), which would
 * silently misattribute dollar value if read as a single flat multiplier.
 */
function kansasExemptionAmount(cert: Record<string, unknown>, tiers: KSExemptionTiers): number {
  const personalUnits = Number(cert.personalAllowances ?? 0);
  const dependents = Number(cert.dependents ?? 0);
  const hoh = cert.headOfHousehold === true;
  return (
    tiers.personal * personalUnits +
    (hoh ? tiers.hohAdditional : 0) +
    tiers.dependent * dependents
  );
}

/**
 * Kansas's Percentage Formula (KW-100, "for wages paid on and after
 * 2024-07-01" — Kansas's SB 1 (2024) tax reform reduced this to a genuine
 * 2-bracket system, 5.20%/5.58%, still current for 2026 per the KDOR's own
 * guide having no newer revision). Subtract the ANNUAL exemption amount,
 * computed continuously (not pre-rounded) and divided by periodsPerYear —
 * per the guide's OWN literal instruction: "An individual's withholding
 * allowance amount is their total Kansas individual income tax personal
 * exemption amount divided by the number of payroll periods in the
 * calendar year" — from per-period gross wages, then look up the result in
 * one of Kansas's own EIGHT independently-published per-period bracket
 * tables (Tables 1-8: weekly/biweekly/semimonthly/monthly/quarterly/
 * semiannual/annual/daily — the full PayFrequency set, transcribed
 * verbatim per period rather than derived, unlike the allowance amount —
 * see bracketPerPeriodAllowance's own doc comment for why a genuine
 * marginal bracket's boundary values are transcribed rather than derived,
 * while a pure deduction amount is safe to compute continuously).
 *
 * Verified against the guide's own fully worked example: semimonthly
 * $2,000, married (spouse not working), 1 dependent, 3 allowances (B=1,
 * C=1, E=1) → $41.44, rounds to $41 — see tests/engine.test.ts,
 * describe('Kansas'). This engine does NOT apply KW-100's own "round to
 * the nearest whole dollar" step, matching every other state's own
 * cents-precision convention in this project (KW-100's whole-dollar
 * rounding is a paper-table simplification, same category as Wisconsin's
 * whole-dollar table rounding disclosed elsewhere).
 */
function bracketPerPeriodKansas(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.kansasWithholding as KSConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const grossWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const annualExemption = kansasExemptionAmount(cert, cfg.exemptionTiers);
  const allowance = dollars(annualExemption) / ctx.periodsPerYear;
  const netWages = atLeastZero(grossWages - allowance);

  const rate = resolveKSAllowanceRate(cert);
  const brackets = cfg.brackets[rate][input.payFrequency];
  if (!brackets) {
    throw new Error(
      `Kansas's own withholding tables don't publish a "${input.payFrequency}" bracket ` +
        `schedule — cannot compute ${rules.code}_SIT.`,
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
      `${fmt(grossWages)} gross less ${fmt(roundHalfUp(allowance))} allowance ($${annualExemption}/yr ÷ ` +
      `${ctx.periodsPerYear}) = ${fmt(netWages)} net, ${rate} @ ${(bracket.rate * 100).toFixed(2)}% over ` +
      `${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))}`,
  };
}

interface NewarkPayrollTaxConfig {
  rate: number;
  quarterlyThresholdDollars: number; // whole-EMPLOYER aggregate — see doc comment
}

/**
 * Newark's Payroll Tax — City of Newark ordinance #6S & FE, per the City's
 * own 2026 Payroll Tax Booklet (fetched and read directly). Genuinely
 * different from every other local tax in this project on THREE axes at
 * once: (1) EMPLOYER-paid, not an employee withholding — quoted verbatim,
 * "The Employer is responsible for the Payroll Tax" — so this returns a
 * `payer: 'employer'` line, which calculate.ts already excludes from net
 * pay (same as US_FUTA/US_SS_ER/US_MED_ER); (2) triggered by WHERE WORK IS
 * PERFORMED/SUPERVISED/REPORTED, not residence — dispatched off
 * certificate.locality === 'Newark', a NEW certificate concept in this
 * file since New Jersey has no other local tax to have already needed one;
 * (3) assessed on the EMPLOYER'S AGGREGATE QUARTERLY PAYROLL across every
 * Newark-linked employee combined, not per employee per paycheck.
 *
 * That third point is the real architectural mismatch, disclosed rather
 * than silently worked around: this engine's calculatePaycheck() computes
 * exactly one employee's one paycheck, with no visibility into what OTHER
 * employees the same employer is paying this quarter. Two aggregate facts
 * the ordinance's own form (Lines 1-2) requires the EMPLOYER to determine
 * across their whole Newark workforce are therefore NOT verified here:
 *   - The $2,500/quarter minimum (ordinance: "If line 1 is less than
 *     $2,500.00 enter... zero on line 3") — this function has no way to
 *     know the employer's total quarterly Newark payroll, so it always
 *     computes a nonzero amount whenever THIS employee's own Newark wages
 *     are nonzero. In practice this rarely matters (an employer running
 *     real payroll through this engine has almost certainly cleared
 *     $2,500/quarter in aggregate), but it is not independently checked.
 *   - The >50%-Newark-resident-workforce apportionment (ordinance Line 2:
 *     wages of Newark-resident employees ABOVE the 50% threshold are
 *     EXCLUDED from the taxable base entirely — not a reduced 0.5% rate on
 *     everyone, a claim a secondary source made that this ordinance's own
 *     text does not support) — modeled as an opt-in per-employee exclusion
 *     via certificate.newarkResidentApportionmentExcluded, which the
 *     EMPLOYER must set after doing their own workforce-wide residency
 *     determination (the same "caller supplies the pre-computed worksheet
 *     result" boundary as Iowa's totalAllowanceAmount or NJ's own
 *     rateTableOverride) — this engine cannot determine, from one
 *     employee's data, whether that employee falls above or below the
 *     employer's 50% threshold.
 *
 * Taxable base is federal-withholding wages ("subject to withholding by
 * the employer for Federal income tax purposes") — reuses
 * rules.exemptPretax, the same NJ-wide conformity list, since the
 * ordinance's own wage definition tracks the federal one, not NJ's own
 * (non-conforming, gross-wages) state income tax base.
 */
function newarkPayrollTaxEmployer(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.locality !== 'Newark') return null;

  const cfg = rules.newarkPayrollTax as NewarkPayrollTaxConfig | undefined;
  if (!cfg) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);

  if (cert.newarkResidentApportionmentExcluded) {
    return {
      id: 'NEWARK_PAYROLL_ER',
      name: 'Newark Payroll Tax (Employer)',
      payer: 'employer',
      jurisdiction: 'local',
      taxableWages: 0,
      amount: 0,
      detail:
        `$0 — certificate.newarkResidentApportionmentExcluded: this employee's wages are excluded ` +
        `from the taxable base under the ordinance's >50%-Newark-resident-workforce apportionment ` +
        `(the employer's own aggregate determination, not verified by this engine).`,
    };
  }

  const amount = applyRate(taxableWages, cfg.rate);

  return {
    id: 'NEWARK_PAYROLL_ER',
    name: 'Newark Payroll Tax (Employer)',
    payer: 'employer',
    jurisdiction: 'local',
    taxableWages,
    amount,
    detail:
      `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(2)}%, this employee's contribution toward ` +
      `the employer's quarterly Newark payroll — the $${cfg.quarterlyThresholdDollars}/quarter ` +
      `minimum and the >50%-resident-workforce apportionment are EMPLOYER-AGGREGATE facts this ` +
      `engine cannot verify per paycheck (see newarkPayrollTaxEmployer()'s own doc comment).`,
  };
}

interface MAExemptionConfig {
  perExemptionPoint: number; // dollars, annual — $1,000 per point in Line 4's own summed total
  baseAddOn: number; // dollars, annual — $3,400 flat add-on, only once Line 4's total is 1 or more
}

interface FlatRateSurtaxCreditConfig {
  rate: number; // 0.05
  surtaxRate: number; // 0.04 — ADDITIONAL rate on the excess (so 0.09 total)
  surtaxThreshold: number; // dollars, annual, applied to annualized post-exemption wages
  exemptionTiers: MAExemptionConfig;
  creditsAnnual: {
    headOfHousehold: number; // dollars, annual — M-4 Box A
    blind: number; // dollars, annual — M-4 Box B
  };
}

/**
 * Validates Form M-4's own Line 1/Line 2 numeric codes — NOT a dollar
 * lookup (see the correction note on flatRateSurtaxCredit() for why an
 * earlier version of this function wrongly treated it as one). M-4's own
 * text: Line 1 is "1" (personal), or "2" if the employee is 65 or older.
 * Line 2 is "4" if claiming a spouse exemption, or "5" if the spouse is
 * also 65+. These raw numbers get SUMMED directly into Line 4's own total
 * — the form's own Line 4 instruction is literally "Add the number of
 * exemptions which you have claimed above" — so this function's only job
 * is to reject anything Form M-4 doesn't actually offer as a checkbox/code,
 * not to convert a code into a dollar figure.
 */
function validateMACode(code: number, line: 1 | 2): number {
  if (line === 1) {
    if (code === 0 || code === 1 || code === 2) return code;
    throw new Error(
      `Unrecognized MA certificate.personalExemptionCode ${JSON.stringify(code)} — Form M-4's ` +
        `own Line 1 only ever takes 0 (no certificate filed), 1, or 2 (age 65+).`,
    );
  }
  if (code === 0 || code === 4 || code === 5) return code;
  throw new Error(
    `Unrecognized MA certificate.spouseExemptionCode ${JSON.stringify(code)} — Form M-4's own ` +
      `Line 2 only ever takes 0 (no spouse exemption), 4, or 5 (spouse age 65+).`,
  );
}

/**
 * Massachusetts's withholding formula (Circular M, effective 2026-01-01) —
 * a flat 5% rate, but with THREE genuinely separate mechanisms layered on
 * top that no single existing method in this project combines: (1) an
 * exemption subtracted from wages BEFORE the rate applies, computed from
 * Form M-4's own Line 4 "total number of exemptions" — NOT, as an earlier
 * version of this file modeled it, a separate dollar lookup per category
 * (personal/spouse/dependent each with their own amount). CORRECTED on a
 * verification pass, using the USDA National Finance Center's own detailed
 * Massachusetts withholding bulletin (a federal payroll shared-service
 * that independently re-derives every state's formula for its own
 * processing — about as close to a primary source as this file could
 * reach once Circular M itself proved completely unfetchable, see
 * $extractionNote) cross-checked against Form M-4's own text for exactly
 * how Line 4 is built: Line 4 = Line 1 (1, or 2 if 65+) + Line 2 (0, or 4
 * if claiming a spouse, or 5 if the spouse is also 65+) + Line 3 (the
 * dependent count) — a literal sum of the form's own raw numeric codes,
 * confirmed by NFC's own instruction ("Second and Third Positions - Enter
 * the total number of exemptions claimed on LINE 4 of the M-4") pointing
 * at exactly that sum. The dollar exemption is then $1,000 x that Line-4
 * total + a flat $3,400, EXCEPT when the total is 0 (no certificate filed
 * at all — Form M-4's own margin note: withholding is "without
 * exemptions," i.e. $0, not the formula's own $3,400 floor). A married
 * employee with 2 dependents (Line 4 = 1+4+2 = 7) gets $1,000x7+$3,400 =
 * $10,400/yr, NOT the $10,800 an earlier per-category model computed by
 * treating personal/spouse as two independent $4,400 amounts. (2) the 2023
 * "Fair Share Amendment" 4% surtax on ANNUALIZED post-exemption wages over
 * $1,107,750 (2026), modeled as a second WIBracket row (9% = 5% + 4%)
 * reusing the same findWIBracket() helper as every bracket state in this
 * project, computed at the annual scale then divided once — the same
 * algebraically-proven annualize-then-divide equivalence already used for
 * Iowa; (3) FLAT DOLLAR CREDITS (not exemptions) subtracted from the
 * computed TAX itself, not from wages — Head of Household ($120/yr) and
 * blindness ($110/yr), per Form M-4's own Boxes A and B, confirmed
 * unchanged by the same NFC bulletin's own Step 8 ("Subtract the following
 * tax credits... from the annual Massachusetts tax withholding").
 */
function flatRateSurtaxCredit(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRateSurtaxCredit as FlatRateSurtaxCreditConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);
  const periodsPerYear = ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  // Form M-4's own left-margin instruction to the employee: "Otherwise,
  // Massachusetts Income Taxes will be withheld from your wages WITHOUT
  // EXEMPTIONS" — a no-certificate employee gets $0 exemption, not even
  // the base personal amount. Defaulting personalExemptionCode to 1 (as an
  // earlier version of this file did) would have silently granted the
  // full $4,400 personal exemption to an employee who never filed a
  // certificate at all — the opposite of every other state's own "absent
  // certificate defaults to the LEAST generous outcome" convention in this
  // project (e.g. PA/MI's certificate.allowances defaults to 0, not some
  // standard nonzero figure). Caught on a dedicated verification pass by
  // re-reading text already on file, not new research.
  const personalCode = validateMACode(Number(cert.personalExemptionCode ?? 0), 1);
  const spouseCode = validateMACode(Number(cert.spouseExemptionCode ?? 0), 2);
  const dependents = Number(cert.dependents ?? 0);

  // Form M-4's own Line 4: a literal sum of the raw codes above (NOT a
  // count of "how many categories are claimed" — see this function's own
  // doc comment for why 1+4+2 = 7, not 4).
  const line4Total = personalCode + spouseCode + dependents;
  const annualExemption =
    line4Total === 0
      ? 0
      : dollars(cfg.exemptionTiers.perExemptionPoint) * line4Total + dollars(cfg.exemptionTiers.baseAddOn);
  const exemptionPerPeriod = annualExemption / periodsPerYear;

  const netWages = atLeastZero(taxableWages - exemptionPerPeriod);
  const annualNetWages = netWages * periodsPerYear;

  const brackets: WIBracket[] = [
    { from: 0, to: cfg.surtaxThreshold, base: 0, rate: cfg.rate },
    {
      from: cfg.surtaxThreshold,
      to: null,
      base: cfg.surtaxThreshold * cfg.rate,
      rate: cfg.rate + cfg.surtaxRate,
    },
  ];
  const bracket = findWIBracket(brackets, annualNetWages);
  const excess = annualNetWages - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);

  const hohCredit = cert.headOfHousehold ? dollars(cfg.creditsAnnual.headOfHousehold) / periodsPerYear : 0;
  const blindCredit = cert.blind ? dollars(cfg.creditsAnnual.blind) / periodsPerYear : 0;

  const amount = atLeastZero(roundHalfUp(annualTax / periodsPerYear - hohCredit - blindCredit));
  const netWagesRounded = roundHalfUp(netWages);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: netWagesRounded,
    amount,
    detail:
      `${fmt(taxableWages)} less ${fmt(roundHalfUp(exemptionPerPeriod))} exemption = ${fmt(netWagesRounded)} net ` +
      `@ ${(bracket.rate * 100).toFixed(0)}%${bracket.rate > cfg.rate ? ' (surtax bracket)' : ''}` +
      (hohCredit || blindCredit
        ? `, less ${fmt(roundHalfUp(hohCredit + blindCredit))} credits (HOH/blind)`
        : ''),
  };
}

interface MaineStandardDeductionBand {
  max: number; // dollars, full deduction below phaseOutStart
  phaseOutStart: number; // dollars, annualized wages
  phaseOutEnd: number; // dollars, annualized wages — deduction is $0 at/above this
}

interface MaineConfig {
  allowanceAmount: number; // dollars, annual, flat per allowance (Form W-4ME Step 2)
  standardDeduction: { single: MaineStandardDeductionBand; married: MaineStandardDeductionBand };
  brackets: { single: WIBracket[]; married: WIBracket[] };
}

/**
 * Resolves Form W-4ME's own Line 3 (Single or Head of Household / Married /
 * Married-but-withholding-at-higher-Single-rate) to which of Maine's two
 * published bracket schedules applies — the same recurring 3-checkbox shape
 * already seen on MN/MT/NY/ID's own forms, where the third option
 * deliberately routes to the SINGLE schedule despite the employee being
 * married. Form W-4ME's own instructions are explicit that MFS and
 * nonresident aliens must ALSO check the single box regardless of actual
 * marital status. Default (no form, or an invalid one) is single with zero
 * allowances, per the form's own instructions to employers: "the employer
 * or payer must withhold as if the employee or payee were single and
 * claiming no allowances."
 */
function resolveMaineStatus(cert: Record<string, unknown>): 'single' | 'married' {
  const raw = cert.maritalStatus;
  if (raw === undefined || raw === null || raw === 'single' || raw === 'married_withhold_as_single') {
    return 'single';
  }
  if (raw === 'married') return 'married';
  throw new Error(
    `Unrecognized ME certificate.maritalStatus ${JSON.stringify(raw)} — expected 'single' ` +
      `(includes Head of Household, MFS, and nonresident aliens), 'married', or ` +
      `'married_withhold_as_single' (Form W-4ME's own higher-single-rate option).`,
  );
}

/**
 * Maine's Percentage Method (Maine Revenue Services' own 2026 Withholding
 * Tables booklet, fetched and read directly, including all 3 of the
 * document's own worked examples — reproduced exactly in
 * tests/engine.test.ts). Structurally the closest existing shape in this
 * project is Wisconsin's bracketPhaseoutDeduction() — a standard deduction
 * that phases linearly down to $0 as annualized wages rise between two
 * thresholds, a flat per-allowance amount subtracted alongside it, then a
 * progressive bracket schedule — but with ONE genuinely different, and
 * easy to get wrong, feature: Maine's own instructions round to the
 * NEAREST WHOLE DOLLAR at multiple intermediate steps, not once at the end
 * the way every other bracket state in this project does. Confirmed
 * against the source's own Example 3: the phased standard deduction itself
 * is rounded to the nearest dollar ($27,750×$120,550/$150,000 = $22,301.75,
 * which the source's own worked arithmetic uses as $22,302, not the
 * unrounded fraction) BEFORE being subtracted from annualized wages, and
 * again the annualized withholding amount (Step 5) is rounded to the
 * nearest dollar BEFORE being divided by periodsPerYear for the final
 * per-period figure (Step 6) — reproducing Example 2's own displayed
 * $1,693.625 → $1,694 → ($1,694÷52=$32.58) → $33 chain exactly requires
 * this exact staged rounding, not a single continuous computation rounded
 * once. toWholeDollars() (money.ts) is used at each of these stages.
 *
 * A genuine oddity, verified not a transcription slip: married thresholds
 * are NOT exactly double the single ones ($54,850/$129,750 vs $27,400×2=
 * $54,800/$64,850×2=$129,700, each off by $50) — Maine's own design, not
 * computed here.
 */
function maineWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.maineWithholding as MaineConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;

  // Form W-4ME's Line 7 tribal-member exemption is scoped to wages earned
  // FOR WORK PERFORMED ON TRIBAL LAND specifically, not the whole
  // paycheck — genuinely narrower than the generic certificate.exempt
  // flag this file also honors (which zeroes the ENTIRE _SIT line via
  // zeroStateIncomeTaxLines(), correct for a tribal member whose Maine
  // wages are ALL tribal-land-sourced, the common case). For the mixed
  // case — some wages on tribal land, some off — certificate.exemptWages
  // (cents, this pay period) lets the caller exclude just the tribal-land
  // portion from the taxable base directly, rather than forcing an
  // all-or-nothing choice the real exemption doesn't require. The caller
  // is still responsible for knowing which wages qualify (the same
  // eligibility-adjudication boundary as every exemption in this project);
  // this only changes WHAT gets excluded once that split is known, not who
  // determines it.
  const exemptWages = atLeastZero(Number(cert.exemptWages ?? 0));
  const taxableWages = atLeastZero(ctx.taxableWagesFor(exempt) - exemptWages);
  const periodsPerYear = ctx.periodsPerYear;
  const annualWages = toWholeDollars(taxableWages * periodsPerYear);

  const status = resolveMaineStatus(cert);
  const allowances = Number(cert.allowances ?? 0);
  const allowanceAmount = toWholeDollars(dollars(cfg.allowanceAmount) * allowances);

  const band = cfg.standardDeduction[status];
  const maxDeduction = dollars(band.max);
  const phaseOutStart = dollars(band.phaseOutStart);
  const phaseOutEnd = dollars(band.phaseOutEnd);

  let standardDeduction: number;
  if (annualWages <= phaseOutStart) {
    standardDeduction = maxDeduction;
  } else if (annualWages >= phaseOutEnd) {
    standardDeduction = 0;
  } else {
    const raw = (maxDeduction * (phaseOutEnd - annualWages)) / (phaseOutEnd - phaseOutStart);
    standardDeduction = toWholeDollars(atLeastZero(raw));
  }

  const annualIncome = atLeastZero(annualWages - allowanceAmount - standardDeduction);

  const brackets = cfg.brackets[status];
  const bracket = findWIBracket(brackets, annualIncome);
  const excess = annualIncome - dollars(bracket.from);
  const annualWithholding = toWholeDollars(dollars(bracket.base) + applyRate(excess, bracket.rate));

  const amount = toWholeDollars(Math.round(annualWithholding / periodsPerYear));

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(allowanceAmount)} allowances (${allowances} × $${cfg.allowanceAmount}) ` +
      `less ${fmt(standardDeduction)} standard deduction (${status}) = ${fmt(annualIncome)} annualized income ` +
      `@ ${(bracket.rate * 100).toFixed(2)}% bracket, annualized withholding ${fmt(annualWithholding)} ÷ ${periodsPerYear}, rounded to the nearest dollar`,
  };
}

interface OhioBracket {
  floor: number; // dollars
  ceiling: number | null; // dollars
  base: number; // dollars
  rate: number;
}

interface OhioPeriodTable {
  exemptionPerPeriod: number; // dollars, flat per exemption claimed
  brackets: OhioBracket[];
}

/**
 * Ohio's Percentage Method (Ohio Department of Taxation's own withholding
 * tables, fetched and read directly in an earlier session — see
 * data/states/OH-2026.json's own $extractionNote/sources). Closes a real,
 * previously-disclosed gap: this method had NO dispatch case here at all,
 * so calculatePaycheck() threw for every Ohio input, which in turn meant
 * OH's own reciprocity data (IN/KY/MI/PA/WV, already primary-confirmed via
 * Form IT 4NR) was structurally unreachable — reciprocityExemptionReason()
 * in this file already reads reciprocalStates generically and would zero
 * OH_SIT correctly, but stateIncomeTax() never got far enough to call it.
 * Fixing THIS is what actually fixes Ohio's reciprocal-tax handling, not a
 * change to the reciprocity logic itself, which was already correct.
 *
 * The simplest per-period bracket shape in this project so far: ONE
 * schedule per period (no separate single/married tables the way NY/NJ/
 * Montana/Idaho/Iowa all have), and the exemption is a flat per-period
 * dollar amount times a straight exemption COUNT (Form IT-4's own Section
 * II is a simplified 0/1 checklist summed into one number) — not a
 * precomputed combined-allowance table or a multi-tier personal/spouse/
 * dependent split. Subtract the exemption from per-period wages directly
 * (no annualizing), then look up the result in the period's own bracket
 * table — the same "per-period table, no annual division" shape already
 * established for Montana/NY/New Jersey/Kansas.
 *
 * Uses rules.periodTables (the August 1, 2026-onward table) unconditionally
 * for any 2026 check date — see OH-2026.json's own midYearEffectiveDating
 * note for why: this engine's ruleset lookup is year-only, with no
 * mechanism yet to switch to priorTable2026 for a pre-August check date.
 * That mechanism gap is real and disclosed, and deliberately NOT solved
 * here — a much bigger change (registry.ts's yearOf()/date-range lookup)
 * than fixing the missing dispatch case this function addresses.
 */
function ohioWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const tables = rules.periodTables as Record<string, OhioPeriodTable>;
  const table = tables[input.payFrequency];
  if (!table) {
    throw new Error(
      `Ohio's own withholding tables don't publish a "${input.payFrequency}" schedule — cannot ` +
        `compute ${rules.code}_SIT.`,
    );
  }

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const exemptions = Number(cert.exemptions ?? 0);
  const exemptionAmount = dollars(table.exemptionPerPeriod) * exemptions;
  const netWages = atLeastZero(taxableWages - exemptionAmount);

  const bracket =
    table.brackets.find(
      (b) => netWages >= dollars(b.floor) && (b.ceiling === null || netWages < dollars(b.ceiling)),
    ) ?? table.brackets[table.brackets.length - 1];
  const excess = netWages - dollars(bracket.floor);
  const amount = dollars(bracket.base) + applyRate(excess, bracket.rate);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: netWages,
    amount,
    detail:
      `${fmt(taxableWages)} less ${fmt(exemptionAmount)} exemptions (${exemptions} × $${table.exemptionPerPeriod}) ` +
      `= ${fmt(netWages)} net @ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.floor))}, base ${fmt(dollars(bracket.base))}`,
  };
}
