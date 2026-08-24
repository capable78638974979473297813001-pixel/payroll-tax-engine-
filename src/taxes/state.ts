import {
  applyRate,
  atLeastZero,
  dollars,
  fmt,
  overThreshold,
  roundDownToCent,
  roundHalfUp,
  toWholeDollars,
  underCap,
} from '../money.ts';
import type { MICityEntry, OHMunicipalityEntry, PALocalEntry, StateRuleset } from '../registry.ts';
import {
  countyRuleset,
  federalRuleset,
  hasCountyRuleset,
  hasMICityRuleset,
  hasOHMunicipalityRuleset,
  hasOHSchoolDistrictRuleset,
  hasPALocalRuleset,
  hasStateRuleset,
  miCityRuleset,
  ohMunicipalityRuleset,
  ohSchoolDistrictRuleset,
  paLocalRuleset,
  stateRuleset,
} from '../registry.ts';
import { federalIncomeTax } from './federal.ts';
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

  // Denver's Occupational Privilege Tax — see denverOccupationalPrivilegeTax()'s
  // own doc comment for the $500/month threshold and the caller-supplied
  // monthly-aggregation fields this genuinely different tax SHAPE requires.
  lines.push(...denverOccupationalPrivilegeTax(input, rules));

  // West Virginia's per-city Municipal Service Fee — see
  // westVirginiaMunicipalServiceFee()'s own doc comment for why this is a
  // genuinely new calc-code shape (flat per-week fee, not a wage
  // percentage).
  const wvFee = westVirginiaMunicipalServiceFee(input, ctx, rules);
  if (wvFee) lines.push(wvFee);

  // A flat, uncapped, universal employee excise — Oregon's Statewide
  // Transit Tax is the first (and so far only) user, but written
  // generically (dispatched off rules.stateExciseEmployee) the same way
  // stateLongTermCareEmployeeTax() was for Washington, in case a future
  // state needs the same trivial shape (flat rate, no allowances, no cap).
  const excise = stateExciseEmployeeTax(input, ctx, rules);
  if (excise) lines.push(excise);

  // Missouri's Kansas City / St. Louis earnings taxes — the employee side,
  // gated on certificate.locality the same way Newark's employer tax is
  // gated, since which city (if any) applies is a caller-resolved fact
  // (residence OR work location, either one triggers it) this engine
  // cannot derive from the state code alone.
  const moLocal = missouriLocalEarningsTax(input, ctx, rules);
  if (moLocal) lines.push(moLocal);

  // St. Louis's Payroll Expense Tax — a SEPARATE employer-only levy layered
  // on top of the employee earnings tax above, unique to St. Louis (Kansas
  // City has no equivalent). Genuinely additive, not a replacement, unlike
  // Newark's payroll tax which has no accompanying employee-side tax.
  const stlPayrollExpense = stLouisPayrollExpenseTaxEmployer(input, ctx, rules);
  if (stlPayrollExpense) lines.push(stlPayrollExpense);

  // Oregon's TriMet / Lane Transit District taxes — employer-paid excises
  // on payroll for work performed within the district, gated on
  // certificate.locality ('TriMet' or 'LTD') since transit-district
  // membership depends on WHERE SERVICES ARE PERFORMED, the same
  // caller-resolved-locality shape as Newark's and Missouri's local taxes.
  const orTransit = oregonTransitDistrictTaxEmployer(input, ctx, rules);
  if (orTransit) lines.push(orTransit);

  // Portland-area local personal income taxes (Metro SHS + Multnomah PFA)
  // — genuinely different shape from every other local tax in this
  // project: THRESHOLD-triggered (no tax at all below a flat YTD-wage
  // trigger, then a flat rate on everything above it, forever, not just
  // the first dollar past the line), closer to federal Additional Medicare
  // than to a bracket or flat-rate local tax. Can emit ZERO, ONE, or TWO
  // lines depending on certificate.metroDistrict / certificate.multnomahCounty
  // (an employee can be in one, both, or neither).
  const portlandLocal = portlandAreaLocalTax(input, ctx, rules);
  lines.push(...portlandLocal);

  // Pennsylvania's Act 32 local Earned Income Tax + Local Services Tax —
  // see pennsylvaniaLocalTax()'s own doc comment for the withholding rule
  // and the 2,627-jurisdiction data file it reads from.
  const paLocal = pennsylvaniaLocalTax(input, ctx, rules);
  lines.push(...paLocal);

  // Michigan's 24-city local income tax (Uniform City Income Tax Ordinance,
  // Act 284) — see michiganLocalTax()'s own doc comment for the resident/
  // nonresident rule and the inter-city credit it applies.
  const miLocal = michiganLocalTax(input, ctx, rules);
  if (miLocal) lines.push(miLocal);

  // Ohio's municipal income tax (679 currently-active jurisdictions) plus
  // School District Income Tax (214 districts) — see ohioLocalTax()'s and
  // ohioSchoolDistrictTax()'s own doc comments for the ORC 718.121
  // inter-municipal credit and the SDIT lookup respectively.
  const ohLocal = ohioLocalTax(input, ctx, rules);
  if (ohLocal) lines.push(ohLocal);
  const ohSchool = ohioSchoolDistrictTax(input, ctx, rules);
  if (ohSchool) lines.push(ohSchool);

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

  // Reciprocity SWAP — a third direction, distinct from both the plain
  // exemption above (zeroes this state's tax, full stop) and Kansas's
  // credit line above (adds a RESIDENCE-state line computed elsewhere in
  // this same function). Pennsylvania's REV-419 is the reason this exists:
  // its own text doesn't just exempt a reciprocal-state resident from PA
  // tax, it obligates the PA employer to withhold the EMPLOYEE'S HOME
  // STATE's tax instead ("If you agree not to withhold PA tax... you must
  // withhold the other state's tax") — the same certificate box that
  // grants the exemption also authorizes the swap, per REV-419's own
  // Section II(b) wording ("I claim an exemption... AND authorize my
  // employer to withhold income tax for my resident state"), so this
  // fires automatically whenever the exemption already did — no separate
  // certificate flag, consistent with reciprocityExemptionReason()'s own
  // documented assumption that the underlying certificate is on file.
  // Gated by rules.reciprocity.swapWithholdsResidenceState (opt-in,
  // data-only) so no other state's behavior changes.
  const swapLine = reciprocitySwapWithholdingLine(input, ctx, rules, reciprocityReason);
  if (swapLine) lines.push(swapLine);

  return lines;
}

/**
 * Computes the employee's RESIDENCE state's tax on the same wages and adds
 * it as its own line — the "swap" half of Pennsylvania's REV-419 mechanism
 * (see stateIncomeTax()'s own call site for the full explanation). Reuses
 * the exact virtual-input pattern residentWorkingElsewhereCreditLine()
 * already established (workState swapped to the residence state + ITS OWN
 * certificate, since every method function reads input.workState?.certificate)
 * — the only real difference is this adds the residence state's FULL tax as
 * a new line rather than netting it against a credit, because the WORK
 * state's own tax is already $0 here (that's what triggered this in the
 * first place), so there's nothing to net against.
 */
function reciprocitySwapWithholdingLine(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
  reciprocityReason: string | null,
): TaxLine | null {
  if (!reciprocityReason) return null;
  if (!(rules.reciprocity as ReciprocityConfig | undefined)?.swapWithholdsResidenceState) {
    return null;
  }

  const residence = input.residenceState;
  if (!residence) return null;
  if (!hasStateRuleset(residence.code, input.checkDate)) return null;

  const residenceRules = stateRuleset(residence.code, input.checkDate);
  const virtualInput: PaycheckInput = {
    ...input,
    workState: { code: residence.code, certificate: residence.certificate },
  };
  const residenceLines = incomeTaxLines(virtualInput, ctx, residenceRules);
  const residenceTax = residenceLines
    .filter((l) => l.id === `${residence.code}_SIT`)
    .reduce((sum, l) => sum + l.amount, 0);

  return {
    id: `${residence.code}_SIT_RECIPROCITY_SWAP`,
    name: `${residenceRules.name} Income Tax (withheld by ${rules.code} employer under reciprocity)`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: residenceLines[0]?.taxableWages ?? 0,
    amount: residenceTax,
    detail:
      `${fmt(residenceTax)} ${residence.code} tax withheld by the ${rules.code} employer instead of ` +
      `${rules.code} tax, per ${rules.code}'s reciprocity swap mechanism — the employer has agreed not ` +
      `to withhold ${rules.code} tax, so ${residence.code}'s own withholding rules apply to these wages instead.`,
  };
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
  // Subset of reciprocalStates whose exemption is CONDITIONAL on a daily
  // commute, not the plain "resides there" test every other entry in
  // reciprocalStates uses. Kentucky's own 103 KAR 17:140 is the reason
  // this exists: it exempts Illinois/Indiana/Michigan/Ohio/West Virginia/
  // Wisconsin residents unconditionally, but Virginia residents ONLY if
  // they commute DAILY to the Kentucky workplace — the same condition
  // Virginia's own VA-4 instructions independently confirm from the other
  // side (Line 3(c), "Kentucky or DC residents who commute daily"). A bare
  // reciprocalStates list has no way to represent this — the ONLY
  // difference between a commuter-only entry and an ordinary one is here.
  commuterOnlyStates?: string[];
  // Pennsylvania-originated (REV-419): once this state's own reciprocity
  // exemption fires for a resident of a reciprocalStates entry, ALSO emit
  // an additional line for that employee's residence-state tax on the same
  // wages — see reciprocitySwapWithholdingLine(). Opt-in, data-only, so
  // every other state's plain-exemption behavior is unchanged.
  swapWithholdsResidenceState?: boolean;
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

  // Kentucky/Virginia's own bug class: some reciprocity entries are gated
  // on a daily commute, not bare residence. A caller who never sets
  // certificate.dailyCommuter gets NO exemption here — the safer default,
  // matching this project's "absent input defaults to the LEAST generous
  // outcome" convention (same reasoning Massachusetts's M-4 exemption-code
  // default already uses) — rather than silently granting an exemption
  // the underlying regulation would actually deny to a non-commuter.
  if (reciprocity?.commuterOnlyStates?.includes(residence)) {
    const dailyCommuter = input.residenceState?.certificate?.dailyCommuter === true;
    if (!dailyCommuter) return null;
  }

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
    case 'flat_rate': {
      const lines: TaxLine[] = [flatRate(input, ctx, rules)];
      const supplemental = flatRateSupplementalFromConfig(input, ctx, rules);
      if (supplemental) lines.push(supplemental);
      return lines;
    }
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
    case 'bracket_annual_exemption_credit':
      return [delawareWithholding(input, ctx, rules)];
    case 'employee_elected_flat':
      return [employeeElectedFlat(input, ctx, rules)];
    case 'flat_rate_marital_deduction_whole_dollar':
      return [missouriWithholding(input, ctx, rules)];
    case 'bracket_federal_subtraction_phaseout':
      return [oregonWithholding(input, ctx, rules)];
    case 'bracket_per_period_three_status':
      return [californiaWithholding(input, ctx, rules)];
    case 'flat_rate_status_deduction':
      return [coloradoWithholding(input, ctx, rules)];
    case 'flat_rate_phaseout_allowance':
      return [utahWithholding(input, ctx, rules)];
    case 'bracket_state_plus_local':
      return [marylandWithholding(input, ctx, rules)];
    case 'bracket_per_period_single_table':
      return [rhodeIslandWithholding(input, ctx, rules)];
    case 'bracket_annual_allowance_deduction':
      return [dcWithholding(input, ctx, rules)];
    case 'virginia_annual_dual_allowance':
      return [virginiaWithholding(input, ctx, rules)];
    case 'west_virginia_dual_table':
      return [westVirginiaWithholding(input, ctx, rules)];
    case 'north_carolina_status_deduction':
      return [northCarolinaWithholding(input, ctx, rules)];
    case 'south_carolina_allowance_deduction':
      return [southCarolinaWithholding(input, ctx, rules)];
    case 'arkansas_bracket_credit':
      return [arkansasWithholding(input, ctx, rules)];
    case 'alabama_federal_subtraction':
      return [alabamaWithholding(input, ctx, rules)];
    case 'georgia_status_deduction':
      return [georgiaWithholding(input, ctx, rules)];
    case 'louisiana_blockA_deduction':
      return [louisianaWithholding(input, ctx, rules)];
    case 'mississippi_bracket_deduction':
      return [mississippiWithholding(input, ctx, rules)];
    case 'new_mexico_percentage_method': {
      const lines: TaxLine[] = [newMexicoWithholding(input, ctx, rules)];
      const supplemental = flatRateSupplementalFromConfig(input, ctx, rules);
      if (supplemental) lines.push(supplemental);
      return lines;
    }
    case 'hawaii_annual_bracket':
      return [hawaiiWithholding(input, ctx, rules)];
    case 'oklahoma_percentage_method':
      return [oklahomaWithholding(input, ctx, rules)];
    case 'north_dakota_dual_vintage':
      return [northDakotaWithholding(input, ctx, rules)];
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
  const fullBase = ctx.taxableWagesFor(exempt);
  // Carve supplemental wages out of the regular base ONLY when this
  // ruleset actually has a supplementalWages config (Michigan does; PA
  // doesn't) — the caller (incomeTaxLines()'s 'flat_rate' case) attaches a
  // separate flat-rate supplemental line precisely when that config is
  // present, so this must stay conditional: flat_rate is shared by PA and
  // MI, and unconditionally carving out supplementalCash for PA (which
  // never emits a supplemental line to pick it back up) would silently
  // leave a bonus untaxed entirely rather than just double-taxed. Found
  // and fixed the double-taxation direction of this bug via a live check
  // right after wiring Michigan's supplementalWages config: MI_SIT was
  // still taxing the full base INCLUDING the bonus while MI_SIT_SUPP taxed
  // the bonus again on top — the same class of gap bracketPhaseoutDeduction
  // (WI)/bracketFlatAllowance (MN)/bracketPerPeriodGross (MT) had already
  // closed for their own single-state methods.
  const supplementalCash = rules.supplementalWages !== undefined ? supplementalEarnings(input.earnings) : 0;
  const taxableWages = atLeastZero(fullBase - supplementalCash);

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
  wageBase?: number | null; // dollars, ANNUAL wage base — YTD-tracked like statePaidLeaveEmployee (New Jersey's TDI shape); null means genuinely uncapped (California's SDI shape)
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
    // BUG FOUND on an audit pass: this branch used to call dollars(cfg.wageBase)
    // unconditionally, INCLUDING when wageBase was the literal JSON `null` —
    // dollars(null) coerces to Math.round(null * 100) = 0, so underCap() saw
    // cap=0 (a real, non-null cap of $0) rather than "uncapped," and every
    // wage was capped to $0. Never triggered before because no state used
    // wageBase: null here (NJ has a real numeric cap; NY uses the OTHER
    // branch, weeklyCapDollars) — California's genuinely-uncapped SDI (SB
    // 951, uncapped since 2024) was the first. Fixed to match the exact
    // guard stateLongTermCareEmployeeTax() (WA Cares) already used correctly.
    const cap = cfg.wageBase === null ? null : dollars(cfg.wageBase);
    const ytd = input.ytd.stateDisabilityEmployee?.[rules.code] ?? 0;
    const cappedWages = underCap(taxableWages, ytd, cap);
    amount = applyRate(cappedWages, cfg.rate);
    return {
      id: `${rules.code}_DBL_EE`,
      name: `${rules.name} Disability Benefits (Employee)`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: cappedWages,
      amount,
      detail:
        cap === null
          ? `${fmt(cappedWages)} @ ${(cfg.rate * 100).toFixed(2)}%, no wage cap`
          : `${fmt(cappedWages)} @ ${(cfg.rate * 100).toFixed(2)}%, capped at ${fmt(cap)}/yr (${fmt(ytd)} YTD already counted)`,
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
/**
 * Shared by Vermont AND Nebraska now that both use bracketPerPeriodAllowance()
 * — VT's own certificate vocabulary is richer (mfs, married_withhold_as_single,
 * civil unions) since Form W-4VT has those explicit checkboxes; Nebraska's
 * Circular EN has no such nuance (its own table header is simply "MARRIED
 * Person-Including Surviving Spouse", one unified status), so 'married' is
 * accepted as a plain synonym for 'mfj' rather than forcing Nebraska callers
 * to learn Vermont's own form-specific vocabulary for a distinction Nebraska
 * doesn't have.
 */
function resolveMFJMaritalStatus(cert: Record<string, unknown>): 'single' | 'married' {
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
  if (raw === 'mfj' || raw === 'married') return 'married';
  throw new Error(
    `Unrecognized certificate.maritalStatus ${JSON.stringify(raw)} — expected 'single', 'mfs', ` +
      `'married_withhold_as_single', 'mfj', or 'married' (civil union partners use the same ` +
      `'mfj'/'married' schedule per Form W-4VT's own "Civil union partners use Married table" note).`,
  );
}

/**
 * A flat per-allowance dollar amount subtracted from PER-PERIOD gross
 * wages, then looked up in a bracket table published independently PER
 * PERIOD (like Montana/NY/NJ/Connecticut, not derived by dividing one
 * annual table) and selected by marital status. Built for Vermont's
 * Percentage Method Withholding (GB-1210-2026, fetched and read directly;
 * verified against the source's own worked example — weekly $1,800,
 * married, 2 allowances ($103.85 x2=$207.70) → $45.77) and REUSED DIRECTLY
 * for Nebraska once Circular EN's own per-period tables were successfully
 * re-extracted (an earlier pass kept Nebraska on a bespoke approximation
 * function because only its ANNUAL table had extracted cleanly at the
 * time — see NE-2026.json's own $methodComment for that history). The two
 * states' configs live under the SAME rules.bracketPerPeriodAllowance key
 * now, dispatched by the same 'bracket_per_period_allowance' method name,
 * genuinely the same shape rather than two similar-looking ones forced
 * together.
 *
 * NOT MODELLED (disclosed, not guessed) for Vermont specifically: its own
 * guidance that NON-PERIODIC supplemental payments "can be ESTIMATED at
 * 30% of the federal withholding" — permissive wording ("can be"), not a
 * required formula the way New York's 11.70% Method A is, and it would
 * require reading federal's OWN supplemental rate (22%/37% tiers) at
 * calculation time to reproduce faithfully. Periodic supplemental wages
 * paid at the SAME time as regular wages already aggregate correctly
 * through this function via the normal taxableWagesFor() base, no
 * special-casing needed — the same convention as Kentucky/Idaho/
 * Connecticut/Iowa. Nebraska's own supplemental rule (flat 3.5%,
 * documented in NE-2026.json) is likewise not modelled here.
 */
function bracketPerPeriodAllowance(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketPerPeriodAllowance as VTBracketConfig;
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

  const status = resolveMFJMaritalStatus(cert);
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

interface DenverOPTConfig {
  employeeRate: number; // dollars per MONTH, not per pay period
  employerRatePerEmployee: number; // dollars per MONTH, not per pay period
  monthlyEarningsThreshold: number; // dollars per calendar month
}

/**
 * Denver's Occupational Privilege Tax (OPT, a.k.a. "head tax") — a flat
 * DOLLAR-PER-MONTH tax, not a percentage of wages, the only tax of this
 * shape in this project. Two separate levies fire together, verbatim from
 * Denver's own Tax Guide Topic 61 (fetched directly): "Employees who
 * perform sufficient services in Denver to receive compensation of at
 * least $500 per month... are liable for the Employee OPT... to be
 * withheld by the employer at a rate of $5.75 per month. The employer is
 * also required to pay the Business OPT at a rate of $4.00 per month for
 * each taxable employee."
 *
 * A genuinely different SHAPE from every other tax in this engine: the
 * $500 test and the $5.75/$4.00 amounts are PER CALENDAR MONTH, not per
 * pay period — a real employer typically withholds the full monthly
 * amount on ONE paycheck per month, not split across every check that
 * month. This engine has no cross-paycheck monthly-aggregation state of
 * its own (its only running totals are input.ytd's YEAR-to-date figures),
 * so the caller supplies what only the caller can already know from
 * tracking every paycheck in the month: certificate.denverMonthlyCompensation
 * (this month's cumulative Denver-sourced compensation AS OF this check,
 * inclusive, in cents) and certificate.denverOPTWithheldThisMonth
 * (whether an earlier paycheck this same calendar month already withheld
 * it, to avoid double-charging a flat monthly amount).
 *
 * Deliberately NOT modelled, disclosed rather than guessed at: the
 * owner/partner/manager variant of the Business OPT (owed regardless of
 * earnings, no $500 test — this engine has no "is this person an
 * owner/partner" input); the governmental/charitable-entity exemption
 * from the Business OPT specifically (the Employee OPT still applies to
 * them, no exemption); the >1-Denver-employer Form TD269 coordination
 * (this engine computes one employer's paycheck at a time, the same
 * scoping limit already disclosed for Newark's own multi-employer
 * apportionment above); and the same-employer, multiple-head-tax-
 * jurisdiction "majority of working hours" exemption (e.g. an employee
 * split between Denver and a former head-tax city) — this engine
 * evaluates Denver in isolation, per certificate.locality.
 */
function denverOccupationalPrivilegeTax(
  input: PaycheckInput,
  rules: StateRuleset,
): TaxLine[] {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.locality !== 'Denver') return [];

  const cfg = (rules.localIncomeTax as { denver?: DenverOPTConfig } | undefined)?.denver;
  if (!cfg) return [];

  if (cert.denverOPTWithheldThisMonth) {
    return [
      {
        id: 'DENVER_OPT_EE',
        name: 'Denver Occupational Privilege Tax (Employee)',
        payer: 'employee',
        jurisdiction: 'local',
        taxableWages: 0,
        amount: 0,
        detail:
          '$0 — certificate.denverOPTWithheldThisMonth: already withheld on an earlier paycheck ' +
          'this calendar month; the flat monthly amount is not withheld twice.',
      },
    ];
  }

  const monthlyComp = Number(cert.denverMonthlyCompensation ?? 0);
  const threshold = dollars(cfg.monthlyEarningsThreshold);
  if (monthlyComp < threshold) {
    return [
      {
        id: 'DENVER_OPT_EE',
        name: 'Denver Occupational Privilege Tax (Employee)',
        payer: 'employee',
        jurisdiction: 'local',
        taxableWages: 0,
        amount: 0,
        detail:
          `$0 — ${fmt(monthlyComp)} of this month's Denver-sourced compensation ` +
          `(certificate.denverMonthlyCompensation) is below the $${cfg.monthlyEarningsThreshold}/month ` +
          `taxable-employee threshold.`,
      },
    ];
  }

  const employeeAmount = dollars(cfg.employeeRate);
  const employerAmount = dollars(cfg.employerRatePerEmployee);

  return [
    {
      id: 'DENVER_OPT_EE',
      name: 'Denver Occupational Privilege Tax (Employee)',
      payer: 'employee',
      jurisdiction: 'local',
      taxableWages: 0,
      amount: employeeAmount,
      detail:
        `Flat $${cfg.employeeRate}/month — ${fmt(monthlyComp)} of Denver-sourced compensation this ` +
        `month (certificate.denverMonthlyCompensation) meets the $${cfg.monthlyEarningsThreshold} ` +
        `taxable-employee threshold.`,
    },
    {
      id: 'DENVER_OPT_ER',
      name: 'Denver Occupational Privilege Tax (Business)',
      payer: 'employer',
      jurisdiction: 'local',
      taxableWages: 0,
      amount: employerAmount,
      detail: `Flat $${cfg.employerRatePerEmployee}/month per taxable employee.`,
    },
  ];
}

interface WVServiceFeeCityConfig {
  weeklyRate: number; // dollars per week
}

/**
 * West Virginia's per-city Municipal/City Service Fee (WV Code 8-13-13) —
 * a FLAT FEE PER WEEK, not a percentage of wages, imposed by an employee's
 * DUTY-STATION city (work-location-based, like Newark's tax, not
 * residence-based) rather than any bracket or flat-rate income tax. A
 * genuinely different shape from every other local tax in this project:
 * even PA's Local Services Tax — this project's other flat-fee local tax —
 * is stated as an ANNUAL cap ($52/yr) prorated across pay periods; West
 * Virginia's cities instead each publish a bare WEEKLY dollar figure with
 * no per-pay-period breakdown in any source consulted. This function
 * infers a per-period amount the same way PA's LST prorates ($weeklyRate
 * × 52 annualized, then divided across this employee's actual pay
 * periods, rounded DOWN to the cent) — a reasonable but NOT verbatim-
 * sourced convention, disclosed as an assumption in WV-2026.json's own
 * knownGap rather than presented as confirmed.
 *
 * Gated on certificate.locality, the same caller-resolved-locality shape
 * as Newark's/Denver's/Missouri's local taxes — this engine does not
 * resolve an address to a city itself.
 *
 * NOT modelled, disclosed rather than guessed at: Wheeling's own 30-
 * consecutive-day-in-the-city threshold before the fee first attaches
 * (no employment-duration input exists anywhere in this engine — every
 * duty-station-in-Wheeling case is treated as already past the
 * threshold); the multi-job dedup rule (an employee working multiple jobs
 * in the same WV city is only assessed once — the same class of
 * un-modelled multi-employer coordination as Newark's Form-based
 * exemption elsewhere in this project); and Weirton's mid-2026 rate
 * change from $2.00 to $5.00/week has no effective-dating mechanism (this
 * function always uses the current $5.00 figure, correct only for check
 * dates on/after the ordinance's ~2026-05-14 effective date).
 */
function westVirginiaMunicipalServiceFee(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const locality = typeof cert.locality === 'string' ? cert.locality : undefined;
  if (!locality) return null;

  const cities = (rules.localIncomeTax as { serviceFeeCities?: Record<string, WVServiceFeeCityConfig> } | undefined)
    ?.serviceFeeCities;
  const city = cities?.[locality];
  if (!city) return null;

  const annualFee = dollars(city.weeklyRate) * 52;
  const amount = roundDownToCent(annualFee / ctx.periodsPerYear);

  return {
    id: 'WV_LOCAL_FEE',
    name: `${locality} Municipal Service Fee`,
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: 0,
    amount,
    detail:
      `$${city.weeklyRate}/week flat fee (WV Code 8-13-13), annualized (×52) and divided across ` +
      `${ctx.periodsPerYear} pay periods/yr, rounded down to the cent (same convention as PA's LST) ` +
      `— certificate.locality = "${locality}"`,
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
  // Mid-year effective dating: Ohio's HB96 cut rates for payroll periods
  // ending on/after 2026-08-01 (periodTables); priorTable2026 held from
  // 2026-01-01 through 2026-07-31 (the October 2025 table, never replaced
  // by a separate January 2026 one). Both tables already live in THIS
  // ruleset object regardless of check date — registry.ts's year-only file
  // lookup was never the actual blocker, since OH-2026.json covers all of
  // 2026 either way. What was missing is choosing between them, done here
  // via a plain string comparison against rules.midYearEffectiveDating's
  // own thresholdDate (ISO yyyy-mm-dd sorts correctly as a string).
  const dating = rules.midYearEffectiveDating as { thresholdDate: string } | undefined;
  const usePriorTable = dating && input.checkDate < dating.thresholdDate;
  const tables = (usePriorTable ? rules.priorTable2026 : rules.periodTables) as Record<
    string,
    OhioPeriodTable
  >;
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
      `= ${fmt(netWages)} net @ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.floor))}, base ${fmt(dollars(bracket.base))}` +
      (usePriorTable ? ` (pre-2026-08-01 table)` : ''),
  };
}

interface DEWithholdingConfig {
  standardDeduction: { single: number; married: number }; // dollars, ANNUAL
  personalCreditPerExemption: number; // dollars, ANNUAL, subtracted from TAX not from wages
  brackets: WIBracket[]; // reuses the {from,to,base,rate} shape already proven for WI/ME
  // Delaware's own Employer's Guide annualizes by a DIFFERENT multiplier per
  // period than this engine's generic PERIODS_PER_YEAR table — most notably
  // daily x300, not the engine-wide 260-workday convention (the same class
  // of mismatch New Jersey's daily table hit at x365). Keyed by PayFrequency
  // string; only the 5 frequencies Delaware's guide actually publishes.
  annualizeMultiplier: Partial<Record<string, number>>;
}

/**
 * Delaware's withholding formula (Employer's Guide, Section 17 "Computing
 * Withholding Taxes" — "An approved method, based on annualized wages"),
 * fetched and read directly, both as the Guide's own HTML page and via its
 * separately-published DE-W4NR worksheet, which independently states and
 * demonstrates the identical rate table). Genuinely new shape in this
 * project: annualize wages, subtract a flat STANDARD DEDUCTION by filing
 * status (single/MFS $3,250, MFJ $6,500 — MFS uses the SINGLE figure, not a
 * half-of-joint figure, confirmed by the Guide's own third worked example),
 * look up a 7-bracket progressive schedule, THEN subtract a flat $110 PER
 * EXEMPTION as a CREDIT AGAINST THE COMPUTED TAX (not a deduction from
 * wages, unlike every other exemption-amount state in this project — Ohio's
 * exemptionPerPeriod and Wisconsin's exemptionAmount both reduce the taxable
 * base pre-bracket; Delaware's reduces the tax itself post-bracket), floor
 * at $0, divide by the per-period multiplier.
 *
 * Verified against all THREE of the Employer's Guide's own worked examples
 * (single/1 exemption, MFJ/3 exemptions, MFS/2 exemptions — each reproduced
 * across all four published per-period divisors: weekly/biweekly/
 * semi-monthly/monthly) — see tests/engine.test.ts, describe('Delaware').
 *
 * The 2.20%-6.60% rate table itself was double-checked against a real,
 * disclosed risk: Delaware HB13/HS2 (153rd General Assembly) proposed a
 * restructured bracket schedule "for taxable years beginning after December
 * 31, 2025" — i.e. this exact tax year. Checked the bill's own legislative
 * history directly rather than assuming either "it must be old news" or
 * "it must already be law": HS2 for HB13 did NOT pass before the General
 * Assembly adjourned in 2025 ("failed to advance this session"), so the
 * pre-existing 2.20%-6.60% table (unchanged since HB1 in 2013, per the
 * Guide's own "Effective January 1, 2025" table — Delaware hasn't touched
 * these seven numbers since 2014) remains the one actually in force for
 * 2026. Cross-confirmed the OLD table is still current on Delaware's own
 * software-developer tax-rate-changes page, which shows no update.
 */
function delawareWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.delawareWithholding as DEWithholdingConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const multiplier = cfg.annualizeMultiplier[input.payFrequency];
  if (multiplier === undefined) {
    throw new Error(
      `Delaware's own Employer's Guide doesn't publish an annualizing multiplier for ` +
        `"${input.payFrequency}" — cannot compute ${rules.code}_SIT.`,
    );
  }
  const annualWages = periodWages * multiplier;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  // The Guide's own regulation text (Section 15(a)) is explicit: absent a
  // certificate, "withhold tax as if the employee is a single person who
  // has no withholding allowances" — the same no-certificate default this
  // project uses everywhere else, here made a direct quote rather than an
  // inferred convention. MFS uses the single-column standard deduction per
  // the Guide's own third worked example; only 'mfj' selects the married
  // (double) figure.
  const maritalStatus = cert.maritalStatus === 'mfj' ? 'married' : 'single';
  const exemptions = Number(cert.exemptions ?? 0);

  const standardDeduction = dollars(cfg.standardDeduction[maritalStatus]);
  const taxableIncome = atLeastZero(annualWages - standardDeduction);

  const bracket = findWIBracket(cfg.brackets, taxableIncome);
  const excess = taxableIncome - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);

  const credit = dollars(cfg.personalCreditPerExemption) * exemptions;
  const annualLiability = atLeastZero(annualTax - credit);

  const amount = roundHalfUp(annualLiability / multiplier);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr (×${multiplier}) less ${fmt(standardDeduction)} standard deduction ` +
      `(${maritalStatus}) = ${fmt(taxableIncome)} taxable @ ${(bracket.rate * 100).toFixed(2)}% ` +
      `over ${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))} = ${fmt(annualTax)} ` +
      `less ${fmt(credit)} exemption credit (${exemptions} × $${cfg.personalCreditPerExemption}) ` +
      `= ${fmt(annualLiability)}/yr ÷ ${multiplier}`,
  };
}

interface AZFlatConfig {
  availableRates: number[];
  defaultRate: number;
}

/**
 * Arizona's withholding — the simplest method in this project by a wide
 * margin. No bracket table, no standard deduction, no exemption count: the
 * EMPLOYEE picks a flat percentage of gross taxable wages on Form A-4 (2026,
 * fetched and read directly), 0.5%-3.5% in 0.5% steps, or elects zero via a
 * separate certification of no expected tax liability. No-form default is
 * ALSO a flat rate (2.0%) rather than "single, zero allowances" run through
 * a table, since there's no table to fall back to — Form A-4's own words:
 * "If you do not give this form to your employer the department requires
 * your employer to withhold 2.0% of your gross taxable wages."
 */
function employeeElectedFlat(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.employeeElectedFlat as AZFlatConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;

  if (cert.zeroElection) {
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages,
      amount: 0,
      detail: 'Form A-4 zero-withholding election on file',
    };
  }

  let rate: number;
  if (cert.electedRate !== undefined) {
    rate = Number(cert.electedRate);
    if (!cfg.availableRates.includes(rate)) {
      throw new Error(
        `Unrecognized AZ certificate.electedRate ${JSON.stringify(cert.electedRate)} — Form A-4 only ` +
          `offers ${cfg.availableRates.map((r) => `${(r * 100).toFixed(1)}%`).join(', ')} (or the zero ` +
          `election via certificate.zeroElection). Cannot compute ${rules.code}_SIT.`,
      );
    }
  } else {
    rate = cfg.defaultRate;
  }
  const amount = applyRate(taxableWages, rate);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail:
      cert.electedRate !== undefined
        ? `${fmt(taxableWages)} @ ${(rate * 100).toFixed(1)}% (Form A-4 election)`
        : `${fmt(taxableWages)} @ ${(rate * 100).toFixed(1)}% (no Form A-4 on file — HB 2119 default)`,
  };
}

interface MOConfig {
  standardDeduction: {
    singleOrMarriedSpouseWorksOrMFS: number;
    marriedSpouseDoesNotWork: number;
    headOfHousehold: number;
  };
  brackets: WIBracket[];
  annualizeMultiplier: Partial<Record<string, number>>;
}

function resolveMOFilingStatus(
  cert: Record<string, unknown>,
): 'singleOrMarriedSpouseWorksOrMFS' | 'marriedSpouseDoesNotWork' | 'headOfHousehold' {
  const raw = cert.filingStatus;
  if (raw === 'married_spouse_does_not_work') return 'marriedSpouseDoesNotWork';
  if (raw === 'head_of_household') return 'headOfHousehold';
  // Form MO W-4's own default box order and this project's standing
  // no-certificate convention both land here: 'Single or Married Spouse
  // Works or Married Filing Separate' is the form's FIRST checkbox and
  // covers three real filing situations under one shared deduction figure.
  return 'singleOrMarriedSpouseWorksOrMFS';
}

/**
 * Missouri's withholding formula (2026 Withholding Tax Formula, fetched and
 * read directly): annualize wages, subtract a flat standard deduction keyed
 * off Form MO W-4's THREE checkboxes (not five filing statuses — Single,
 * Married-spouse-works, and MFS all share ONE deduction figure; Married-
 * spouse-doesn't-work gets exactly double; HOH is independent), apply a
 * 8-bracket annual schedule, divide by periods.
 *
 * IMPORTANT ROUNDING NOTE, worked out carefully from the source's own
 * example rather than assumed: the document's worksheet LOOKS like it
 * rounds each $1,348-wide bracket's incremental tax to the whole dollar
 * before summing (26.96 -> 27, 33.70 -> 34, etc.), which could easily be
 * misread as "round every bracket step to the dollar." It does NOT. Those
 * whole-dollar sums are how the precomputed 'base' figures in this file's
 * bracket table were themselves built (verified: 0+27+34+40+47+54+61=263,
 * matching the top bracket's base exactly) — they are baked into the data,
 * not recomputed here. The CURRENT bracket's own marginal tax on the actual
 * excess uses ORDINARY cent rounding (verified against the source's own
 * example: excess $9,464 x 4.70% = $444.808, rounds to $444.81 — NOT
 * whole-dollar), and the two combine to $707.81 (also not whole-dollar) —
 * matching the source's own annual figure exactly. Only the FINAL per-period
 * amount is rounded to the whole dollar, via the generic
 * rules.roundFinalToWholeDollar mechanism this file already built for
 * Maine — re-verified end to end: $707.81 / 12 = $58.9841..., rounds to
 * $59, matching the source's own stated answer.
 */
function missouriWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRateMaritalDeduction as MOConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const multiplier = cfg.annualizeMultiplier[input.payFrequency];
  if (multiplier === undefined) {
    throw new Error(
      `Missouri's own withholding formula doesn't publish an annualizing multiplier for ` +
        `"${input.payFrequency}" — cannot compute ${rules.code}_SIT.`,
    );
  }
  const annualWages = periodWages * multiplier;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const status = resolveMOFilingStatus(cert);
  const standardDeduction = dollars(cfg.standardDeduction[status]);
  const taxableIncome = atLeastZero(annualWages - standardDeduction);

  const bracket = findWIBracket(cfg.brackets, taxableIncome);
  const excess = taxableIncome - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);

  const amount = roundHalfUp(annualTax / multiplier);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr (×${multiplier}) less ${fmt(standardDeduction)} standard deduction ` +
      `(${status}) = ${fmt(taxableIncome)} taxable @ ${(bracket.rate * 100).toFixed(2)}% over ` +
      `${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))} = ${fmt(annualTax)}/yr ÷ ${multiplier}`,
  };
}

interface ORCapTier {
  wagesAtLeast: number;
  wagesLessThan: number | null;
  cap: number;
}

interface ORConfig {
  standardDeduction: {
    singleOrHOHUnder3Allowances: number;
    marriedOrSingle3PlusAllowances: number;
  };
  federalTaxSubtractionCap: {
    underAnnualWages50000: number;
    at50000AndAbove: { singleSchedule: ORCapTier[]; marriedSchedule: ORCapTier[] };
  };
  brackets: {
    annualWagesUnder50000: {
      singleFewerThan3Allowances: WIBracket[];
      single3PlusAllowancesOrMarried: WIBracket[];
    };
    annualWages50000AndUp: {
      singleFewerThan3Allowances: WIBracket[];
      single3PlusAllowancesOrMarried: WIBracket[];
    };
    annualizeMultiplier: Partial<Record<string, number>>;
  };
  personalExemptionCredit: { perAllowance: number };
}

function findORCapTier(schedule: ORCapTier[], annualWages: number): ORCapTier {
  for (const t of schedule) {
    const at = dollars(t.wagesAtLeast);
    const lt = t.wagesLessThan === null ? Infinity : dollars(t.wagesLessThan);
    if (annualWages >= at && annualWages < lt) return t;
  }
  return schedule[schedule.length - 1];
}

/**
 * Oregon's withholding "computer formula" (150-206-436, Rev. 12-31-25,
 * fetched and read directly): by far the most structurally involved method
 * in this project. BASE = annual wages - federal tax withheld (capped, and
 * for high earners phased down to $0) - a filing-status/allowance-count
 * standard deduction. BASE is then run through one of FOUR bracket tables
 * (selected by both which side of $50,000 annual wages the EMPLOYEE falls
 * on, and which schedule — single-few-allowances vs. married-or-3+-
 * allowances — applies), and a flat $263-per-allowance PERSONAL EXEMPTION
 * CREDIT is subtracted AFTER the bracket lookup, Delaware-style.
 *
 * Genuinely new engine capability: this is the first state whose formula
 * depends on the EMPLOYEE'S OWN COMPUTED FEDERAL WITHHOLDING as an input,
 * not just federally-defined wage categories. Rather than changing
 * calculatePaycheck()'s shared signature (which would touch every other
 * state), this function reuses the existing exported federalIncomeTax()
 * directly — a pure function of the same input/ctx/federal ruleset, so
 * calling it here a second time (once here, once for the real US_FIT line)
 * is deterministic and produces an identical figure, not a source of drift.
 *
 * TWO SEPARATE schedule-selection rules, not one — verified against the
 * formula document's own FAQ #4 and #7 rather than assumed symmetric:
 * (1) the STANDARD DEDUCTION and BRACKET TABLE use "single with 3+
 * allowances OR married" as one combined bucket (Form OR-W-4's own
 * convention — a single filer with 3+ allowances gets promoted to the
 * married figures). (2) the FEDERAL-SUBTRACTION PHASE-OUT SCHEDULE instead
 * keys OFF THE RAW MARITAL-STATUS BOX ONLY, ignoring the 3+-allowances
 * promotion — FAQ #7's own words: "Use the single phase-out amounts. Only
 * use married phase-out amounts for employees who check the 'Married' box."
 * Collapsing these into one resolver would have been a real, silent bug.
 *
 * Verified against the source's own Example 1 via an independent hand
 * calculation (single, $25,000 annual, 0 allowances, assumed $1,000
 * federal withheld, $2,910 standard deduction -> BASE $21,090 -> bracket
 * [11,400-50,000, base 941, rate 8.75%] -> $941+(21,090-11,400)x0.0875=
 * $1,789.375, rounds to $1,789 — matches the document's own stated answer
 * exactly). That verification used the DOCUMENT'S OWN assumed $1,000
 * federal-withheld figure, which is illustrative rather than something
 * this engine's real 2026 federal formula would necessarily produce for
 * that exact wage/certificate combination — see tests/engine.test.ts,
 * describe('Oregon') for how the ENGINE-level tests instead hand-verify
 * Oregon's formula using the REAL federal withholding this engine computes
 * as the input, which is what happens in an actual paycheck.
 *
 * No-certificate default is a flat 8% of taxable wages (HB 2119, 2019) —
 * gated on the certificate being entirely ABSENT, not merely defaulted,
 * since Oregon's own rule is about no OR-W-4 being on file at all, not
 * about an employee who filed one claiming single/zero allowances.
 */
function oregonWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  if (!input.workState?.certificate) {
    const amount = applyRate(periodWages, 0.08);
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: periodWages,
      amount,
      detail: `${fmt(periodWages)} @ 8.00% (no Form OR-W-4 on file — HB 2119 default)`,
    };
  }

  const cfg = rules.bracketFederalSubtractionPhaseout as ORConfig;
  const multiplier = cfg.brackets.annualizeMultiplier[input.payFrequency];
  if (multiplier === undefined) {
    throw new Error(
      `Oregon's own withholding formula doesn't publish an annualizing multiplier for ` +
        `"${input.payFrequency}" — cannot compute ${rules.code}_SIT.`,
    );
  }
  const annualWages = periodWages * multiplier;

  const cert = input.workState.certificate as Record<string, unknown>;
  const maritalStatusBox = cert.maritalStatus === 'married' ? 'married' : 'single';
  const allowances = Number(cert.allowances ?? 0);
  const promoted = maritalStatusBox === 'married' || allowances >= 3;

  const standardDeduction = dollars(
    promoted
      ? cfg.standardDeduction.marriedOrSingle3PlusAllowances
      : cfg.standardDeduction.singleOrHOHUnder3Allowances,
  );

  const fedLine = federalIncomeTax(input, ctx, federalRuleset(input.checkDate));
  const federalWithheldAnnual = fedLine.amount * multiplier;

  const under50k = annualWages < dollars(50000);
  const cap = under50k
    ? dollars(cfg.federalTaxSubtractionCap.underAnnualWages50000)
    : dollars(
        findORCapTier(
          maritalStatusBox === 'married'
            ? cfg.federalTaxSubtractionCap.at50000AndAbove.marriedSchedule
            : cfg.federalTaxSubtractionCap.at50000AndAbove.singleSchedule,
          annualWages,
        ).cap,
      );
  const federalSubtraction = Math.min(federalWithheldAnnual, cap);

  const BASE = atLeastZero(annualWages - federalSubtraction - standardDeduction);

  const bracketGroup = under50k ? cfg.brackets.annualWagesUnder50000 : cfg.brackets.annualWages50000AndUp;
  const brackets = promoted
    ? bracketGroup.single3PlusAllowancesOrMarried
    : bracketGroup.singleFewerThan3Allowances;
  const bracket = findWIBracket(brackets, BASE);
  const excess = BASE - dollars(bracket.from);
  const annualTaxBeforeCredit = dollars(bracket.base) + applyRate(excess, bracket.rate);

  const credit = dollars(cfg.personalExemptionCredit.perAllowance) * allowances;
  const annualTax = atLeastZero(annualTaxBeforeCredit - credit);

  const amount = roundHalfUp(annualTax / multiplier);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(federalSubtraction)} federal (capped ${fmt(cap)}) less ` +
      `${fmt(standardDeduction)} std. deduction = ${fmt(BASE)} BASE @ ${(bracket.rate * 100).toFixed(2)}% over ` +
      `${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))} = ${fmt(annualTaxBeforeCredit)} less ` +
      `${fmt(credit)} exemption credit (${allowances} × $${cfg.personalExemptionCredit.perAllowance}) = ` +
      `${fmt(annualTax)}/yr ÷ ${multiplier}`,
  };
}

interface StateExciseEmployeeConfig {
  idSuffix: string; // e.g. 'STT'
  name: string; // e.g. 'Statewide Transit Tax'
  rate: number;
  exemptPretax?: string[];
}

/**
 * A flat, uncapped, universal EMPLOYEE excise on wages — no allowances, no
 * standard deduction, no wage base. Oregon's Statewide Transit Tax (ORS
 * 320.550, 0.1%, "wages of Oregon residents regardless of where the work is
 * performed... wages of nonresidents who perform services in Oregon") is
 * the first user, but this is written generically (dispatched off
 * rules.stateExciseEmployee) rather than as OR-specific code, the same
 * "generic shape, single current user" pattern already established for
 * stateLongTermCareEmployeeTax(). Genuinely simpler than that function:
 * Oregon's own guide never mentions a wage base or a certificate-driven
 * exemption for this specific tax, so neither is modelled — a future
 * state that DOES need one would need its own config field added, not
 * silently assumed here.
 */
function stateExciseEmployeeTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cfg = rules.stateExciseEmployee as StateExciseEmployeeConfig | undefined;
  if (!cfg) return null;

  const exempt = (cfg.exemptPretax ?? rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);
  const amount = applyRate(taxableWages, cfg.rate);

  return {
    id: `${rules.code}_${cfg.idSuffix}`,
    name: `${rules.name} ${cfg.name}`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages,
    amount,
    detail: `${fmt(taxableWages)} @ ${(cfg.rate * 100).toFixed(3)}%, no wage cap`,
  };
}

interface MOLocalityConfig {
  kansasCity?: { rate: number };
  stLouis?: { earningsTaxRate: number; payrollExpenseTax?: { rate: number } };
}

/**
 * Kansas City's and St. Louis's 1% earnings taxes — the EMPLOYEE side.
 * Both apply to residents AND nonresidents who work in the city, so
 * dispatched off certificate.locality (the caller's own resolution of
 * "does this employee's residence OR work location put them in scope"),
 * the same caller-resolved-locality shape as Newark's payroll tax rather
 * than an engine-computed residence/work-location comparison.
 */
function missouriLocalEarningsTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const locality = cert.locality;
  if (locality !== 'Kansas City' && locality !== 'St. Louis') return null;

  const cfg = rules.localIncomeTax as MOLocalityConfig | undefined;
  if (!cfg) return null;
  const rate = locality === 'Kansas City' ? cfg.kansasCity?.rate : cfg.stLouis?.earningsTaxRate;
  if (rate === undefined) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);
  const amount = applyRate(taxableWages, rate);
  const idSuffix = locality === 'Kansas City' ? 'KC_EARN' : 'STL_EARN';

  return {
    id: idSuffix,
    name: `${locality} Earnings Tax`,
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages,
    amount,
    detail:
      `${fmt(taxableWages)} @ ${(rate * 100).toFixed(2)}% (certificate.locality = "${locality}", the ` +
      `caller's own residence-or-work-location determination)`,
  };
}

/**
 * St. Louis's Payroll Expense Tax — 0.5%, EMPLOYER-only, layered on top of
 * (not instead of) the 1% employee earnings tax above. Kansas City has no
 * equivalent, which is why this is its own separate function rather than a
 * second branch inside missouriLocalEarningsTax() — the two taxes have
 * different payers and only one of the two cities even has this one.
 */
function stLouisPayrollExpenseTaxEmployer(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.locality !== 'St. Louis') return null;

  const cfg = rules.localIncomeTax as MOLocalityConfig | undefined;
  const rate = cfg?.stLouis?.payrollExpenseTax?.rate;
  if (rate === undefined) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);
  const amount = applyRate(taxableWages, rate);

  return {
    id: 'STL_PAYROLL_ER',
    name: 'St. Louis Payroll Expense Tax (Employer)',
    payer: 'employer',
    jurisdiction: 'local',
    taxableWages,
    amount,
    detail: `${fmt(taxableWages)} @ ${(rate * 100).toFixed(2)}%, employer-only, layered on top of the employee earnings tax`,
  };
}

interface ORTransitDistrictConfig {
  triMet?: { rate: number };
  laneTransit?: { rate: number };
}

/**
 * Oregon's TriMet / Lane Transit District payroll excises — EMPLOYER-paid
 * (Oregon's own guide: "The transit tax is imposed directly on the
 * employer"), on payroll for services performed within the district.
 * Dispatched off certificate.locality ('TriMet' or 'LTD'), the same
 * caller-resolved-locality shape as Newark's and Missouri's local taxes.
 *
 * TriMet rounds DOWN to the nearest cent, not this project's usual
 * round-half-up — Oregon's own Combined Payroll Tax Report Instructions,
 * quoted verbatim: "Multiply box 5a by box 6a. Round down to the nearest
 * cent." Applied to LTD too, since the combined report's own box-6a/6b
 * instructions for the two districts are structurally parallel and no
 * contrary instruction was found for LTD specifically — disclosed as an
 * assumption, not independently confirmed for LTD's own box.
 */
function oregonTransitDistrictTaxEmployer(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const district = cert.locality;
  if (district !== 'TriMet' && district !== 'LTD') return null;

  const cfg = rules.tripDistrictPayrollTaxes as ORTransitDistrictConfig | undefined;
  if (!cfg) return null;
  const rate = district === 'TriMet' ? cfg.triMet?.rate : cfg.laneTransit?.rate;
  if (rate === undefined) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);
  const amount = Math.floor(taxableWages * rate);
  const name = district === 'TriMet' ? 'TriMet Transit District Tax' : 'Lane Transit District Tax';
  const idSuffix = district === 'TriMet' ? 'TRIMET_ER' : 'LTD_ER';

  return {
    id: idSuffix,
    name,
    payer: 'employer',
    jurisdiction: 'local',
    taxableWages,
    amount,
    detail: `${fmt(taxableWages)} @ ${(rate * 100).toFixed(4)}%, rounded DOWN to the nearest cent per Oregon's own instructions`,
  };
}

interface PortlandLocalTaxConfig {
  metroSHS: { rate: number; threshold: number };
  multnomahPFA: { tier1Rate: number; tier1Threshold: number; tier2Rate: number; tier2Threshold: number };
}

/**
 * Portland-area local personal income taxes — Metro Supportive Housing
 * Services (1%) and Multnomah County Preschool For All (1.5% + an
 * ADDITIONAL 1.5% above a second threshold). Genuinely different shape
 * from every other local tax in this project: THRESHOLD-triggered, not
 * bracket- or flat-rate — no tax at all below a flat YTD-wage trigger,
 * then a flat rate on every dollar above it, closer in shape to federal
 * Additional Medicare (money.ts's overThreshold()) than to any state
 * income tax method in this file. Portland's own withholding page is
 * explicit that the withholding TRIGGER is a flat $200,000/$400,000 wage
 * level, NOT the same filing-status-indexed thresholds the actual tax
 * uses on the employee's return — this function implements the
 * WITHHOLDING trigger only, correctly.
 *
 * Multnomah's "additional 1.5% above $400k" collapses algebraically to
 * applying tier1Rate to the $200k-$400k slice AND tier2Rate to the $400k+
 * slice independently (rather than tier1Rate everywhere above $200k plus
 * a separate top-up), since (portionAbove200k - portionAbove400k) x
 * tier1Rate + portionAbove400k x (tier1Rate + tier2Rate) simplifies to
 * portionAbove200k x tier1Rate + portionAbove400k x tier2Rate when
 * tier1Rate and tier2Rate are equal (both 1.5% here) — verified this
 * holds algebraically before relying on the simplified form.
 *
 * Can return 0, 1, or 2 lines: an employee can be in the Metro district,
 * Multnomah County, both (Multnomah County sits entirely within the
 * Metro district in practice, so "both" is the common case for anyone
 * inside Multnomah), or neither.
 */
function portlandAreaLocalTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine[] {
  const cfg = rules.portlandAreaLocalIncomeTax as PortlandLocalTaxConfig | undefined;
  if (!cfg) return [];

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const currentWages = ctx.taxableWagesFor(exempt);
  const lines: TaxLine[] = [];

  if (cert.metroDistrict) {
    const ytd = input.ytd.localIncomeTax?.['OR_METRO'] ?? 0;
    const threshold = dollars(cfg.metroSHS.threshold);
    const taxableExcess = overThreshold(currentWages, ytd, threshold);
    const amount = applyRate(taxableExcess, cfg.metroSHS.rate);
    lines.push({
      id: 'OR_METRO_SHS',
      name: 'Metro Supportive Housing Services Tax',
      payer: 'employee',
      jurisdiction: 'local',
      taxableWages: taxableExcess,
      amount,
      detail:
        `${fmt(currentWages)} wages (${fmt(ytd)} YTD already counted), ${fmt(taxableExcess)} above the ` +
        `$${cfg.metroSHS.threshold.toLocaleString()} withholding trigger @ ${(cfg.metroSHS.rate * 100).toFixed(1)}%`,
    });
  }

  if (cert.multnomahCounty) {
    const ytd = input.ytd.localIncomeTax?.['OR_MULTNOMAH'] ?? 0;
    const tier1Threshold = dollars(cfg.multnomahPFA.tier1Threshold);
    const tier2Threshold = dollars(cfg.multnomahPFA.tier2Threshold);
    const above1 = overThreshold(currentWages, ytd, tier1Threshold);
    const above2 = overThreshold(currentWages, ytd, tier2Threshold);
    const amount = applyRate(above1, cfg.multnomahPFA.tier1Rate) + applyRate(above2, cfg.multnomahPFA.tier2Rate);
    lines.push({
      id: 'OR_MULTNOMAH_PFA',
      name: 'Multnomah County Preschool For All Tax',
      payer: 'employee',
      jurisdiction: 'local',
      taxableWages: above1,
      amount,
      detail:
        `${fmt(currentWages)} wages (${fmt(ytd)} YTD), ${fmt(above1)} above $${cfg.multnomahPFA.tier1Threshold.toLocaleString()} ` +
        `@ ${(cfg.multnomahPFA.tier1Rate * 100).toFixed(1)}%, plus ${fmt(above2)} above ` +
        `$${cfg.multnomahPFA.tier2Threshold.toLocaleString()} @ an ADDITIONAL ${(cfg.multnomahPFA.tier2Rate * 100).toFixed(1)}%`,
    });
  }

  return lines;
}

interface CATwoBucketTable extends Partial<Record<string, number>> {}

interface CAConfig {
  lowIncomeExemption: { lower: CATwoBucketTable; higher: CATwoBucketTable };
  estimatedDeductionTable: Partial<Record<string, number[]>>;
  standardDeduction: { lower: CATwoBucketTable; higher: CATwoBucketTable };
  exemptionCreditTable: Partial<Record<string, number[]>>;
  brackets: {
    singleOrMarriedTwoIncomes: Partial<Record<string, WIBracket[]>>;
    marriedOneIncome: Partial<Record<string, WIBracket[]>>;
    hoh: Partial<Record<string, WIBracket[]>>;
  };
}

type CAFilingStatus = 'singleOrMarriedTwoIncomes' | 'marriedOneIncome' | 'hoh';

// Certificate values stay in DE 4's own snake_case-ish wording
// ('single_or_married_two_incomes', 'married_one_income', 'hoh') since
// that's the natural way to write a certificate field; this resolver is
// the ONE place that translates them to the camelCase keys CA-2026.json's
// brackets/standardDeduction/lowIncomeExemption objects are actually keyed
// by, so a caller never needs to know about that internal naming choice.
function resolveCAFilingStatus(cert: Record<string, unknown>): CAFilingStatus {
  const raw = cert.filingStatus;
  // DE 4's own instruction: "If you do not provide your employer a completed
  // DE 4, your employer must use Single with Zero withholding allowance."
  if (raw === undefined || raw === null) return 'singleOrMarriedTwoIncomes';
  if (raw === 'single_or_married_two_incomes') return 'singleOrMarriedTwoIncomes';
  if (raw === 'married_one_income') return 'marriedOneIncome';
  if (raw === 'hoh') return 'hoh';
  throw new Error(
    `Unrecognized CA certificate.filingStatus ${JSON.stringify(raw)} — Form DE 4 only offers 'single_or_married_two_incomes' ` +
      `('Single or Married (with two or more incomes)'), 'married_one_income' ('Married (one income)'), or 'hoh' ('Head of Household').`,
  );
}

/**
 * Looks up a Table-4-shaped array (index 0 = 0 allowances, indices 1-10 = 1
 * through 10 allowances directly) and extrapolates past 10 by multiplying
 * the 1-allowance figure by the count — Method B's own footnote 1, verified
 * against its own worked example ('a married taxpayer with 15 allowances...
 * weekly... would be $48.60' = $3.24 × 15, reproduced exactly).
 */
function caTableLookup(table: number[], count: number): number {
  if (count <= 10) return table[count] ?? 0;
  return table[1] * count;
}

/**
 * Looks up a Table-2-shaped array (index 0 = 1 allowance, indices 1-9 = 2
 * through 10 allowances) and extrapolates past 10 the same way — footnote 2:
 * "multiply the amount shown for one Additional Allowance by the number
 * claimed."
 */
function caEstimatedDeductionLookup(table: number[], count: number): number {
  if (count <= 0) return 0;
  if (count <= 10) return table[count - 1] ?? 0;
  return table[0] * count;
}

/**
 * California's Method B - Exact Calculation Method (2026 Withholding
 * Schedules, EDD, fetched and read directly). Six sequential steps — see
 * this file's own $methodComment in CA-2026.json for the full derivation.
 * The one piece NOT mechanically obvious from the source: which of TWO
 * "low income exemption" / "standard deduction" threshold sets applies to a
 * MARRIED (one-income) employee depends on their OWN regular-allowance
 * count (0-1 vs. 2+), not on filing status alone — 'single_or_married_two_
 * incomes' always uses the lower set, 'hoh' always uses the higher set, but
 * 'married_one_income' straddles both depending on regularAllowances.
 *
 * DISCLOSED, NOT SILENTLY RESOLVED: EDD's own Examples E and F use a
 * DIFFERENT valid method than this function implements — annualizing gross
 * wages and the ANNUAL standard deduction first, computing on the ANNUAL
 * bracket table, then dividing the result back down — explicitly offered
 * as a convenience for "employers who... want to conserve computer memory
 * by storing only the annual... values" (the document's own words). This
 * function instead uses the PRIMARY per-period Tables 5-28 directly (no
 * annualizing step at all), which is what Examples A-D themselves use and
 * what this function reproduces to the cent. Because EDD's own per-period
 * standard-deduction figures are INDEPENDENTLY ROUNDED rather than derived
 * by pure division from the annual figure (e.g. semimonthly $476 vs.
 * annual $11,412 ÷ 24 = $475.50), the two methods can differ by a cent or
 * two on the exact same inputs — verified concretely: Example E's own
 * scenario reproduces as $4.11 via this function's method vs. the
 * document's own annualized-method answer of $4.13; Example F reproduces
 * as $7.15 vs. the document's $7.17. This is a genuine two-valid-methods
 * divergence in the source itself, not a transcription error — Examples
 * A-D (which use the SAME direct per-period method this function does)
 * match exactly, with zero discrepancy, which is what actually validates
 * the Tables 5-28 transcription.
 */
function californiaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketPerPeriodThreeStatus as CAConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const status = resolveCAFilingStatus(cert);
  const regularAllowances = Number(cert.regularAllowances ?? 0);
  const estimatedAllowances = Number(cert.estimatedDeductionAllowances ?? 0);

  const period = input.payFrequency;
  const higherBucket = status === 'hoh' || (status === 'marriedOneIncome' && regularAllowances >= 2);
  const bucket = higherBucket ? 'higher' : 'lower';

  const lowIncomeThreshold = cfg.lowIncomeExemption[bucket][period];
  if (lowIncomeThreshold === undefined) {
    throw new Error(
      `California's own Low Income Exemption table doesn't publish a "${period}" figure — cannot compute ${rules.code}_SIT.`,
    );
  }
  if (periodWages <= dollars(lowIncomeThreshold)) {
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: 0,
      amount: 0,
      detail: `${fmt(periodWages)} at or below the $${lowIncomeThreshold} Low Income Exemption threshold (${status}) — $0, no further steps computed.`,
    };
  }

  const estimatedDeductionTable = cfg.estimatedDeductionTable[period];
  if (estimatedAllowances > 0 && !estimatedDeductionTable) {
    throw new Error(
      `California's own Estimated Deduction table doesn't publish a "${period}" figure — cannot compute ${rules.code}_SIT.`,
    );
  }
  const estimatedDeduction = estimatedDeductionTable
    ? dollars(caEstimatedDeductionLookup(estimatedDeductionTable, estimatedAllowances))
    : 0;
  const afterEstimatedDeduction = atLeastZero(periodWages - estimatedDeduction);

  const standardDeduction = dollars(cfg.standardDeduction[bucket][period] ?? 0);
  const taxableIncome = atLeastZero(afterEstimatedDeduction - standardDeduction);

  const brackets = cfg.brackets[status][period];
  if (!brackets) {
    throw new Error(
      `California's own Method B Tax Rate Tables don't publish a "${period}" schedule for "${status}" — cannot compute ${rules.code}_SIT.`,
    );
  }
  const bracket = findWIBracket(brackets, taxableIncome);
  const excess = taxableIncome - dollars(bracket.from);
  const computedTax = dollars(bracket.base) + applyRate(excess, bracket.rate);

  const creditTable = cfg.exemptionCreditTable[period];
  if (!creditTable) {
    throw new Error(
      `California's own Exemption Allowance Table doesn't publish a "${period}" figure — cannot compute ${rules.code}_SIT.`,
    );
  }
  const credit = dollars(caTableLookup(creditTable, regularAllowances));

  const amount = atLeastZero(computedTax - credit);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: taxableIncome,
    amount,
    detail:
      `${fmt(periodWages)} gross` +
      (estimatedDeduction ? ` less ${fmt(estimatedDeduction)} estimated deduction (${estimatedAllowances} allowance(s))` : '') +
      ` less ${fmt(standardDeduction)} standard deduction (${status}) = ${fmt(taxableIncome)} taxable ` +
      `@ ${(bracket.rate * 100).toFixed(3)}% over ${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))} ` +
      `= ${fmt(computedTax)} less ${fmt(credit)} exemption credit (${regularAllowances} regular allowance(s))`,
  };
}

interface COConfig {
  standardDeduction: { mfj: number; other: number };
  rate: number;
  annualizeMultiplier: Partial<Record<string, number>>;
}

/**
 * Colorado's withholding (DR 1098, 2026 Colorado Withholding Worksheet for
 * Employers, fetched and read directly): the simplest formula in this
 * project in some time. Annualize wages, subtract a flat filing-status
 * deduction ($11,000 MFJ / $5,500 otherwise — or a caller-supplied DR 0004
 * Line 2 override, which REPLACES rather than adjusts the flat figure),
 * floor at $0, x 4.40%, divide by periods. No allowance-count mechanism at
 * all — unlike every other 'flat deduction' state in this project (Iowa,
 * Kentucky), there is no per-exemption dollar figure to multiply by a
 * count, just the one flat deduction bucket.
 */
function coloradoWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRateStatusDeduction as COConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const multiplier = cfg.annualizeMultiplier[input.payFrequency];
  if (multiplier === undefined) {
    throw new Error(
      `Colorado's own Pay Period Table doesn't publish a "${input.payFrequency}" multiplier — cannot compute ${rules.code}_SIT.`,
    );
  }
  const annualWages = periodWages * multiplier;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  let deductionDollars: number;
  let deductionNote: string;
  if (cert.dr0004Line2Amount !== undefined) {
    deductionDollars = Number(cert.dr0004Line2Amount);
    deductionNote = 'DR 0004 Line 2';
  } else {
    const mfj = cert.filingStatus === 'mfj';
    deductionDollars = mfj ? cfg.standardDeduction.mfj : cfg.standardDeduction.other;
    deductionNote = mfj ? 'MFJ default' : 'single/other default';
  }
  const deduction = dollars(deductionDollars);

  const taxable = atLeastZero(annualWages - deduction);
  const annualTax = applyRate(taxable, cfg.rate);
  const amount = roundHalfUp(annualTax / multiplier);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(deduction)} deduction (${deductionNote}) = ${fmt(taxable)} taxable ` +
      `@ ${(cfg.rate * 100).toFixed(2)}% = ${fmt(annualTax)}/yr ÷ ${multiplier}`,
  };
}

interface UTTable {
  rate: number;
  phaseOutRate: number;
  baseAllowance: { single: Partial<Record<string, number>>; married: Partial<Record<string, number>> };
  phaseOutThreshold: { single: Partial<Record<string, number>>; married: Partial<Record<string, number>> };
}

interface UTConfig {
  effectiveDateOfNewTable: string;
  beforeJune2026: UTTable;
  fromJune2026: UTTable;
}

function resolveUTMaritalStatus(cert: Record<string, unknown>): 'single' | 'married' {
  // Publication 14's own note: "Use the Single column for taxpayers who
  // file as head-of-household on their federal return."
  return cert.maritalStatus === 'married' ? 'married' : 'single';
}

/**
 * Utah's withholding (Publication 14, effective 2026-06-01, fetched and
 * read directly): a flat-rate gross tax reduced by a PHASING-OUT credit,
 * genuinely combining two shapes this project has seen separately —
 * Delaware/Oregon's "credit subtracted after the bracket/rate" and
 * Wisconsin's "the deduction/credit itself shrinks with income." No
 * allowance-count field: Utah relies entirely on the federal W-4's filing
 * status, nothing state-specific to count.
 *
 * ROUNDING IS THE LOAD-BEARING DETAIL HERE, verified against all 6 of the
 * source's own worked examples: lines 2 and 5 are EACH independently
 * rounded to the nearest WHOLE DOLLAR (not cent) the moment they're
 * computed — reusing the generic roundFinalToWholeDollar mechanism (which
 * rounds only once, at the very end) would NOT reproduce Publication 14's
 * own answers. toWholeDollars() is applied directly to each of those two
 * raw (fractional-cent) products rather than rounding to the cent first —
 * confirmed by Example 5 (quarterly/single/$9,000): $9,000 x 4.45% =
 * $400.50 exactly, which must round HALF-UP to $401 to reproduce the
 * source's own stated $401 and, downstream, its own stated $367 final
 * answer.
 *
 * GENUINE MID-YEAR CUT (found on a later "go to every state" pass, same
 * shape as Ohio's HB96 and Georgia's HB463): SB60 cut the rate 4.50% ->
 * 4.45% for tax year 2026, but Publication 14's own withholding-table
 * revision only took effect 2026-06-01 — an archived Rev. 4/25 revision
 * (fetched via the Wayback Machine, since the live URL had already been
 * overwritten by the newer one) confirms the OLD 4.5%/$450/$900 table
 * governed every 2026 pay period before that date. Dispatches on
 * cfg.effectiveDateOfNewTable via a plain checkDate string-compare.
 */
function utahWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRatePhaseoutAllowance as UTConfig;
  const table = input.checkDate >= cfg.effectiveDateOfNewTable ? cfg.fromJune2026 : cfg.beforeJune2026;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const status = resolveUTMaritalStatus(cert);
  const period = input.payFrequency;

  const baseAllowanceDollars = table.baseAllowance[status][period];
  const phaseOutThresholdDollars = table.phaseOutThreshold[status][period];
  if (baseAllowanceDollars === undefined || phaseOutThresholdDollars === undefined) {
    throw new Error(
      `Utah's own Publication 14 doesn't publish a "${period}" schedule — cannot compute ${rules.code}_SIT.`,
    );
  }

  const line2 = toWholeDollars(periodWages * table.rate);
  const line3 = dollars(baseAllowanceDollars);
  const line4 = atLeastZero(periodWages - dollars(phaseOutThresholdDollars));
  const line5 = toWholeDollars(line4 * table.phaseOutRate);
  const line6 = atLeastZero(line3 - line5);
  const amount = atLeastZero(line2 - line6);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(periodWages)} @ ${(table.rate * 100).toFixed(2)}% = ${fmt(line2)} gross tax; base allowance ` +
      `${fmt(line3)} less ${fmt(line5)} phase-out (${(table.phaseOutRate * 100).toFixed(1)}% of ${fmt(line4)} over ` +
      `$${phaseOutThresholdDollars}) = ${fmt(line6)} net allowance (${status}); withholding = ${fmt(line2)} - ${fmt(line6)} ` +
      `(${table === cfg.fromJune2026 ? 'post' : 'pre'}-2026-06-01 table)`,
  };
}

interface MDCountyRate {
  flat?: number;
  tiered?: { single: WIBracket[]; mfjHoh: WIBracket[] };
}

interface MDConfig {
  stateBrackets: { mfjHoh: WIBracket[]; single: WIBracket[] };
  standardDeductionAnnual: number;
  standardDeductionPerPeriod: Partial<Record<string, number>>;
  exemptionAmountAnnual: number;
  exemptionAmountPerPeriod: Partial<Record<string, number>>;
  noCertificateDefault: { filingStatus: string; exemptions: number; localRate: number };
  nonresidentSpecialRate: number;
}

function resolveMDFilingStatus(cert: Record<string, unknown>): 'single' | 'mfjHoh' {
  return cert.filingStatus === 'mfjHoh' ? 'mfjHoh' : 'single';
}

/**
 * Maryland's withholding (2026 Employer Withholding Guide, fetched and read
 * directly): STATE tax (a 10-tier graduated bracket) plus LOCAL tax (each
 * county sets its own rate, applied to the SAME taxable income) summed into
 * one combined line — never separated into two lines, matching the guide's
 * own convention that the combined figure appears as a single "STATE TAX"
 * amount. Computed at the ANNUAL level and divided by periods, rather than
 * reproducing the guide's own separately-published per-period tables —
 * verified that this reproduces the guide's own combined MARGINAL RATES
 * exactly (see this file's own doc comment in MD-2026.json), though the
 * exact per-period CENTS may differ by a small amount from the guide's own
 * independently-rounded per-period tables, the same class of two-valid-
 * methods divergence already documented for California's Examples E/F.
 *
 * Two of Maryland's 24 local jurisdictions (Anne Arundel, Frederick) have
 * their OWN internally tiered rate, not a flat percentage — a genuinely
 * different local-tax shape from every other state's local tax in this
 * project. certificate.county selects a key into rules.countyRates;
 * certificate.nonresident bypasses the county lookup entirely in favor of
 * a flat 2.25% "Special Nonresident Rate" applied on top of the same state
 * bracket, replacing rather than stacking with any county figure.
 */
function marylandWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketStatePlusLocal as MDConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualWages = periodWages * ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const hasCertificate = Boolean(input.workState?.certificate);
  const status = hasCertificate
    ? resolveMDFilingStatus(cert)
    : (cfg.noCertificateDefault.filingStatus as 'single' | 'mfjHoh');
  const exemptions = hasCertificate ? Number(cert.exemptions ?? 0) : cfg.noCertificateDefault.exemptions;

  const standardDeduction = dollars(cfg.standardDeductionAnnual);
  const exemptionAmount = dollars(cfg.exemptionAmountAnnual) * exemptions;
  const taxableIncome = atLeastZero(annualWages - standardDeduction - exemptionAmount);

  const stateBrackets = cfg.stateBrackets[status];
  const stateBracket = findWIBracket(stateBrackets, taxableIncome);
  const stateExcess = taxableIncome - dollars(stateBracket.from);
  const stateTax = dollars(stateBracket.base) + applyRate(stateExcess, stateBracket.rate);

  let localTax: number;
  let localNote: string;
  const nonresident = Boolean(cert.nonresident);
  if (nonresident) {
    localTax = applyRate(taxableIncome, cfg.nonresidentSpecialRate);
    localNote = `nonresident, Special ${(cfg.nonresidentSpecialRate * 100).toFixed(2)}% rate`;
  } else {
    const countyName = hasCertificate ? (cert.county as string | undefined) : undefined;
    const countyRates = (rules.countyRates ?? {}) as Record<string, MDCountyRate>;
    const county = countyName ? countyRates[countyName] : undefined;
    if (!hasCertificate || !county) {
      localTax = applyRate(taxableIncome, cfg.noCertificateDefault.localRate);
      localNote = `no certificate/unrecognized county — max local rate ${(cfg.noCertificateDefault.localRate * 100).toFixed(2)}%`;
    } else if (county.flat !== undefined) {
      localTax = applyRate(taxableIncome, county.flat);
      localNote = `${countyName} @ ${(county.flat * 100).toFixed(2)}% flat`;
    } else if (county.tiered) {
      const localBrackets = county.tiered[status];
      const localBracket = findWIBracket(localBrackets, taxableIncome);
      const localExcess = taxableIncome - dollars(localBracket.from);
      localTax = dollars(localBracket.base) + applyRate(localExcess, localBracket.rate);
      localNote = `${countyName} @ ${(localBracket.rate * 100).toFixed(2)}% tiered over ${fmt(dollars(localBracket.from))}`;
    } else {
      throw new Error(`MD county "${countyName}" has neither a flat nor a tiered rate configured.`);
    }
  }

  const annualTax = stateTax + localTax;
  const amount = roundHalfUp(annualTax / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(standardDeduction)} std. deduction less ${fmt(exemptionAmount)} ` +
      `exemptions (${exemptions}) = ${fmt(taxableIncome)} taxable; state ${fmt(stateTax)} + local ${fmt(localTax)} ` +
      `(${localNote}) = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear}`,
  };
}

interface RIConfig {
  exemptionAmountPerPeriod: Partial<Record<string, number>>;
  exemptionPhaseOutThresholdPerPeriod: Partial<Record<string, number>>;
  brackets: Partial<Record<string, WIBracket[]>>;
}

/**
 * Rhode Island's withholding (2026 Withholding Tax Booklet, fetched and
 * read directly): ONE bracket schedule for every filing status — 'TABLES
 * ARE FOR ALL FILING STATUS TYPES,' the booklet's own words. Subtract
 * (exemptions x per-period exemption amount) from wages, look up the
 * result directly in the genuine PER-PERIOD table (not derived from the
 * annual one — see this file's own doc comment in RI-2026.json for why
 * that specifically matters here, a real one-cent divergence). The one
 * real wrinkle: the exemption amount is a CLIFF, not a gradual phase-out —
 * once period wages exceed the published threshold, the exemption is $0
 * for that period, not partially reduced.
 */
function rhodeIslandWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketPerPeriodSingleTable as RIConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const period = input.payFrequency;

  const exemptionPerUnit = cfg.exemptionAmountPerPeriod[period];
  const phaseOutThreshold = cfg.exemptionPhaseOutThresholdPerPeriod[period];
  const brackets = cfg.brackets[period];
  if (exemptionPerUnit === undefined || phaseOutThreshold === undefined || !brackets) {
    throw new Error(
      `Rhode Island's own withholding tables don't publish a "${period}" schedule — cannot compute ${rules.code}_SIT.`,
    );
  }

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const exemptions = Number(cert.exemptions ?? 0);

  const phasedOut = periodWages > dollars(phaseOutThreshold);
  const exemption = phasedOut ? 0 : roundHalfUp(dollars(exemptionPerUnit) * exemptions);
  const netWages = atLeastZero(periodWages - exemption);

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
      `${fmt(periodWages)} less ${fmt(exemption)} exemption (${exemptions} × $${exemptionPerUnit}` +
      (phasedOut ? `, phased out — wages exceed $${phaseOutThreshold}` : '') +
      `) = ${fmt(netWages)} net @ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.from))}, base ${fmt(dollars(bracket.base))}`,
  };
}

interface DCConfig {
  brackets: WIBracket[];
  allowanceAmountAnnual: number;
  annualizeMultiplier: Partial<Record<string, number>>;
}

/**
 * DC's withholding (NFC-22-1668460546, effective Pay Period 22, 2022, the
 * fullest formula source found for DC's actual withholding — see
 * DC-2026.json's own sources for the cross-check that confirmed the
 * BRACKETS specifically are still current for 2026 even though this
 * exact bulletin is older). ONE bracket table for every filing status,
 * a flat per-ALLOWANCE amount subtracted from wages BEFORE the bracket
 * lookup (a deduction, not a post-tax credit — Delaware/Oregon's shape
 * is the opposite of this). DC does not tax nonresidents' wages AT ALL
 * under a federal statutory prohibition (the Home Rule Act) — modelled
 * as a direct certificate.nonresident check, not this project's usual
 * reciprocalStates list mechanism, since the real rule applies to
 * residents of all 50 states uniformly rather than a handful of named
 * ones.
 */
function dcWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketAnnualAllowanceDeduction as DCConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  if (cert.nonresident) {
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: 0,
      amount: 0,
      detail: `$0 — DC does not tax nonresident wages (Home Rule Act of 1973, federal statutory prohibition, not a bilateral reciprocity agreement)`,
    };
  }

  const multiplier = cfg.annualizeMultiplier[input.payFrequency];
  if (multiplier === undefined) {
    throw new Error(
      `DC's own withholding formula doesn't publish an annualizing multiplier for "${input.payFrequency}" — cannot compute ${rules.code}_SIT.`,
    );
  }
  const annualWages = periodWages * multiplier;

  const allowances = Number(cert.allowances ?? 0);
  const allowanceAmount = dollars(cfg.allowanceAmountAnnual) * allowances;
  const taxableIncome = atLeastZero(annualWages - allowanceAmount);

  const bracket = findWIBracket(cfg.brackets, taxableIncome);
  const excess = taxableIncome - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);
  const amount = roundHalfUp(annualTax / multiplier);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(allowanceAmount)} allowances (${allowances} × $${cfg.allowanceAmountAnnual}) ` +
      `= ${fmt(taxableIncome)} taxable @ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.from))}, ` +
      `base ${fmt(dollars(bracket.base))} = ${fmt(annualTax)}/yr ÷ ${multiplier}`,
  };
}

interface VAWithholdingConfig {
  standardDeductionAnnual: number;
  personalExemptionAnnual: number;
  ageOrBlindExemptionAnnual: number;
  brackets: { annual: WIBracket[] };
}

/**
 * Virginia's withholding formula (Income Tax Withholding Guide for
 * Employers, Rev. 05/25): annualize wages (periodWages × ctx.periodsPerYear
 * — no custom multiplier needed, unlike NJ/DE, since VA never publishes a
 * non-standard daily divisor), subtract a FLAT standard deduction that does
 * NOT vary by marital status (VA-4's own worksheet has no marital-status
 * field at all — a spouse is just one more $930 exemption unit, see
 * VA-2026.json's standardDeductionQuirk), then subtract two separately-
 * valued per-unit exemption counts (personal/dependent at $930 each,
 * age-65/blind at $800 each), then look up ONE bracket table (Virginia
 * publishes no separate schedule by filing status — the marital difference
 * lives entirely in the exemption count, never the rate table).
 *
 * Non-obvious rounding step, confirmed necessary by matching the Guide's
 * own worked example exactly: the (excess × rate) marginal-tax component is
 * rounded to the nearest WHOLE DOLLAR before adding to the bracket's base —
 * full-cent-precision math throughout produces $109.48/period for the
 * worked example below, not the Guide's own $109.50.
 */
function virginiaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.withholdingStructure as unknown as VAWithholdingConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualWages = periodWages * ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const personalExemptions = Number(cert.personalExemptions ?? 0);
  const ageOrBlindExemptions = Number(cert.ageOrBlindExemptions ?? 0);

  const standardDeduction = dollars(cfg.standardDeductionAnnual);
  const personalDeduction = dollars(cfg.personalExemptionAnnual) * personalExemptions;
  const ageBlindDeduction = dollars(cfg.ageOrBlindExemptionAnnual) * ageOrBlindExemptions;
  const taxableIncome = atLeastZero(
    annualWages - standardDeduction - personalDeduction - ageBlindDeduction,
  );

  const bracket = findWIBracket(cfg.brackets.annual, taxableIncome);
  const excess = taxableIncome - dollars(bracket.from);
  const marginalTax = toWholeDollars(applyRate(excess, bracket.rate));
  const annualTax = dollars(bracket.base) + marginalTax;
  const amount = roundHalfUp(annualTax / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(standardDeduction)} standard deduction, ` +
      `${fmt(personalDeduction)} (${personalExemptions} × $${cfg.personalExemptionAnnual} personal), ` +
      `${fmt(ageBlindDeduction)} (${ageOrBlindExemptions} × $${cfg.ageOrBlindExemptionAnnual} age/blind) ` +
      `= ${fmt(taxableIncome)} taxable @ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.from))} ` +
      `(rounded to nearest $1) + base ${fmt(dollars(bracket.base))} = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear}`,
  };
}

interface WVWithholdingConfig {
  exemptionAmountByPeriod: Partial<Record<string, number>>;
  brackets: {
    twoEarnerOrTwoJobs_default: Partial<Record<string, WIBracket[]>>;
    oneEarnerOneJob_electedViaLine5: Partial<Record<string, WIBracket[]>>;
  };
}

/**
 * West Virginia's withholding formula (IT-100.2A, March 2026 revision): NO
 * annualize-then-divide step, unlike most bracket states in this project —
 * WV publishes genuine, independently-set PER-PERIOD tables (confirmed by
 * spot-check: annual $7,500/52 = $144.23, but the source's own weekly
 * boundary is $144 flat), so this dispatches straight off input.payFrequency
 * against the matching table. A flat per-exemption amount (also published
 * per-period, not derived) is subtracted from gross wages first.
 *
 * The table SELECTION is the genuinely unusual part: not marital status.
 * IT-104 Line 5 is an employee ELECTION — checking it opts into the "One
 * Earner/One Job" table (higher thresholds, less withheld); leaving it
 * unchecked (the default, including when no certificate is on file at all)
 * uses the "Two Earner/Two or More Jobs" table (lower thresholds, more
 * withheld) regardless of the employee's actual marital status.
 */
function westVirginiaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.withholdingStructure as unknown as WVWithholdingConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const exemptions = Number(cert.exemptions ?? 0);
  const oneEarnerElection = cert.oneEarnerElection === true;

  const exemptionPerUnit = cfg.exemptionAmountByPeriod[input.payFrequency];
  const tableSet = oneEarnerElection
    ? cfg.brackets.oneEarnerOneJob_electedViaLine5
    : cfg.brackets.twoEarnerOrTwoJobs_default;
  const brackets = tableSet[input.payFrequency];

  if (exemptionPerUnit === undefined || !brackets) {
    throw new Error(
      `West Virginia's own IT-100.2A doesn't publish a withholding table for ` +
        `"${input.payFrequency}" — cannot compute ${rules.code}_SIT.`,
    );
  }

  const exemptionDeduction = dollars(exemptionPerUnit) * exemptions;
  const taxableWage = atLeastZero(periodWages - exemptionDeduction);

  const bracket = findWIBracket(brackets, taxableWage);
  const excess = taxableWage - dollars(bracket.from);
  const amount = dollars(bracket.base) + applyRate(excess, bracket.rate);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(periodWages)} less ${fmt(exemptionDeduction)} (${exemptions} × $${exemptionPerUnit} exemptions) ` +
      `= ${fmt(taxableWage)} taxable @ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.from))}, ` +
      `base ${fmt(dollars(bracket.base))} — ${oneEarnerElection ? 'One Earner/One Job (IT-104 Line 5 elected)' : 'Two Earner/Two or More Jobs (default)'} table`,
  };
}

/**
 * Pennsylvania's Act 32 local Earned Income Tax + Local Services Tax —
 * genuinely different shape from every other local tax in this project.
 * Reads data/local/PA-EIT-LST-2026.json (2,627 PSD-code jurisdictions,
 * built and cross-checked in an earlier pass) via registry.ts's
 * paLocalRuleset(), the same "separate large local file, looked up by
 * code" pattern Indiana's countyRuleset() already established — except PA
 * needs TWO lookups per paycheck (residence PSD and work PSD), not one,
 * because the withholding RULE itself compares both jurisdictions'
 * rates: "withhold at the HIGHER of the employee's resident EIT rate or
 * the work-location's nonresident EIT rate" (documented directly in
 * PA-2026.json's localTax.eit.withholdingRule, quoted from PA DCED).
 *
 * Same convention as Indiana's countyAddOnLine(): this engine does NOT
 * resolve an address to a PSD code itself — the caller supplies the
 * already-resolved 6-digit codes via certificate.workPSD (required) and
 * certificate.residencePSD (optional; absent or "88000" is treated as
 * PA DCED's own out-of-state-resident convention, a 0% resident rate,
 * per PA-2026.json's localTax.eit.psdCodes note — 88000 is a documented
 * convention, not an actual row in the bulk register, so it's handled
 * directly here rather than looked up).
 *
 * NOT YET independently verified: whether Act 32's own "earned income"
 * base definition is identical to PA's state PIT compensation base (this
 * function assumes it is, reusing rules.exemptPretax — the same list
 * PA_SIT and PA_UC_EE already share) — both are creatures of the same
 * underlying PA "compensation" concept, but that specific equivalence for
 * the LOCAL tax specifically was not independently sourced this pass.
 * Flagged in PA-2026.json's knownGaps, not silently assumed away.
 */
function pennsylvaniaLocalTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine[] {
  if (rules.code !== 'PA') return [];
  if (!hasPALocalRuleset(input.checkDate)) return [];

  const notModelled = (detail: string): TaxLine => ({
    id: 'PA_EIT',
    name: 'PA Local Earned Income Tax',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: 0,
    amount: 0,
    detail: `NOT MODELLED — ${detail} Do not treat as zero-tax.`,
  });

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const workPSD = typeof cert.workPSD === 'string' ? cert.workPSD : undefined;
  if (!workPSD) {
    return [
      notModelled(
        'No certificate.workPSD supplied — this engine requires the already-resolved 6-digit PSD ' +
          'code, the same convention as Indiana\'s county tax; it does not resolve an address itself.',
      ),
    ];
  }

  const workEntry = paLocalRuleset(workPSD, input.checkDate);
  if (!workEntry) {
    return [notModelled(`PSD code "${workPSD}" not found in the 2,627-jurisdiction registry.`)];
  }

  const residencePSD = typeof cert.residencePSD === 'string' ? cert.residencePSD : undefined;
  const residenceEntry =
    residencePSD && residencePSD !== '88000'
      ? paLocalRuleset(residencePSD, input.checkDate)
      : undefined;
  const residentRate = residenceEntry ? residenceEntry.totalResidentEIT : 0;
  const nonresidentRate = workEntry.nonresidentEIT;
  const rate = Math.max(residentRate, nonresidentRate);
  const higherSide = residentRate >= nonresidentRate ? 'resident' : 'nonresident';

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const taxableWages = ctx.taxableWagesFor(exempt);
  const eitAmount = applyRate(taxableWages, rate);

  const eitLine: TaxLine = {
    id: 'PA_EIT',
    name: 'PA Local Earned Income Tax',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages,
    amount: eitAmount,
    detail:
      `${fmt(taxableWages)} @ ${(rate * 100).toFixed(2)}% (the ${higherSide} rate is higher) — resident ` +
      `${(residentRate * 100).toFixed(2)}% (PSD ${residencePSD ?? '88000/out-of-state'}) vs. work-location ` +
      `nonresident ${(nonresidentRate * 100).toFixed(2)}% (PSD ${workPSD}, ${workEntry.municipality})`,
  };

  const lines: TaxLine[] = [eitLine];
  const lstLine = pennsylvaniaLST(ctx, rules, workEntry);
  if (lstLine) lines.push(lstLine);

  return lines;
}

/**
 * Michigan's 24-city local income tax (Uniform City Income Tax Ordinance,
 * Act 284, reading data/local/MI-cities-2026.json via registry.ts's
 * miCityRuleset() — the same "separate large local file, looked up by
 * name" pattern already established for Indiana's counties and PA's PSD
 * codes). This engine does NOT resolve an address to a city itself — the
 * caller supplies certificate.residenceCity and/or certificate.workCity
 * (already-resolved city names, case-insensitive), the same convention as
 * Indiana's/PA's certificate.county/workPSD.
 *
 * Rule (Act 284, cross-confirmed via MI-cities-2026.json's own
 * localTaxScope): a resident of one of the 24 cities owes that city's
 * RESIDENT rate on ALL earnings, regardless of where they work. An
 * employee who WORKS in a (different) taxing city but doesn't live there
 * owes that city's lower NONRESIDENT rate on wages earned there. Both can
 * apply simultaneously (a resident of one taxing city working in another)
 * — this engine withholds BOTH lines rather than netting them, because
 * MI-cities-2026.json's own interCityCredit block documents the credit as
 * a RETURN-level mechanism ("include page 1 of the other city's income
 * tax return with your home city return"), not something the employer
 * computes at withholding time — inventing a withholding-time net-credit
 * figure would go beyond what any source here actually describes. If
 * residenceCity and workCity are the SAME taxing city, tax fires ONCE at
 * the (higher) resident rate, not twice. Neither city being one of the 24
 * (or no certificate at all) correctly produces $0, not silent omission —
 * MI-cities-2026.json's own localTaxScope is explicit that this is a
 * closed list with a default-zero case, the same guarantee already
 * established for "a random guy in rural Michigan."
 *
 * Exemption: reuses certificate.allowances, the SAME count already used
 * for state MI_SIT, since Michigan's city exemption concept is modelled
 * on the state's own system and MI-cities-2026.json documents no separate
 * per-city allowance count a caller would supply instead — a disclosed
 * assumption, not an independently-confirmed one-to-one mapping.
 */
function michiganLocalTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  if (rules.code !== 'MI') return null;
  if (!hasMICityRuleset(input.checkDate)) return null;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const residenceCityName = typeof cert.residenceCity === 'string' ? cert.residenceCity : undefined;
  const workCityName = typeof cert.workCity === 'string' ? cert.workCity : undefined;
  if (!residenceCityName && !workCityName) return null;

  const residenceEntry = residenceCityName ? miCityRuleset(residenceCityName, input.checkDate) : undefined;
  const workEntry = workCityName ? miCityRuleset(workCityName, input.checkDate) : undefined;

  if (!residenceEntry && !workEntry) {
    return {
      id: 'MI_LOCAL',
      name: 'Michigan Local Income Tax',
      payer: 'employee',
      jurisdiction: 'local',
      taxableWages: 0,
      amount: 0,
      detail:
        `$0 — neither "${residenceCityName ?? ''}" nor "${workCityName ?? ''}" is one of Michigan's ` +
        `24 taxing cities (Act 284 closed list; every other MI address owes $0 local tax by default).`,
    };
  }

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualWages = periodWages * ctx.periodsPerYear;
  const allowances = Number(cert.allowances ?? 0);
  const sameCity =
    residenceEntry !== undefined &&
    workEntry !== undefined &&
    residenceEntry.name.toLowerCase() === workEntry.name.toLowerCase();

  const perPeriodTax = (entry: MICityEntry, rate: number): number => {
    const annualExemption = dollars(entry.exemptionAmount) * allowances;
    const annualTaxable = atLeastZero(annualWages - annualExemption);
    return roundHalfUp(applyRate(annualTaxable, rate) / ctx.periodsPerYear);
  };

  let amount = 0;
  const details: string[] = [];

  if (residenceEntry) {
    const t = perPeriodTax(residenceEntry, residenceEntry.residentRate);
    amount += t;
    details.push(
      `${fmt(t)} resident tax to ${residenceEntry.name} @ ${(residenceEntry.residentRate * 100).toFixed(2)}% on all earnings`,
    );
  }
  if (workEntry && !sameCity) {
    const t = perPeriodTax(workEntry, workEntry.nonresidentRate);
    amount += t;
    details.push(
      `${fmt(t)} nonresident tax to ${workEntry.name} @ ${(workEntry.nonresidentRate * 100).toFixed(2)}% on wages earned there`,
    );
  }

  return {
    id: 'MI_LOCAL',
    name: 'Michigan Local Income Tax',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: periodWages,
    amount,
    detail:
      details.join('; ') +
      (residenceEntry && workEntry && !sameCity
        ? ' — inter-city credit for the second city\'s tax is a RETURN-level mechanism (files with the home city\'s return), not applied at withholding time'
        : ''),
  };
}

/**
 * Ohio's municipal income tax (Ohio Dept of Taxation's own Finder database,
 * 679 currently-active jurisdictions, reading data/local/OH-municipalities-
 * 2026.json via registry.ts's ohMunicipalityRuleset() — the same "separate
 * large local file, looked up by name" pattern already established for
 * Michigan's cities and PA's PSD codes). Same caller-resolves-the-address
 * convention as those two: certificate.residenceCity / certificate.workCity
 * are already-resolved municipality names, case-insensitive.
 *
 * Structurally DIFFERENT from Michigan: OH-municipalities-2026.json's own
 * residencyNote is explicit that there is only ONE rate per municipality
 * (no resident/nonresident split) — that single rate applies to income
 * EARNED WITHIN the municipality regardless of who earned it, and
 * separately to a RESIDENT's full income if their home municipality is
 * also on this list. A resident of one taxing municipality who works in a
 * DIFFERENT taxing municipality can owe both roles at once.
 *
 * Where the two roles collide, ORC 718.121 (quoted directly in
 * OH-2026.json's interMunicipalCredit block) requires the home
 * municipality to grant a NONREFUNDABLE credit for tax paid to the work
 * municipality, capped at the home rate — computed here at WITHHOLDING
 * time (not deferred to the return, the way Michigan's equivalent credit
 * is), because the statute's own text frames it as a credit "against the
 * tax or withholding the second municipality claims is due," not a
 * return-only mechanism. If residenceCity and workCity are the SAME
 * taxing municipality, tax fires ONCE, not twice. Neither city being one
 * of the 679 (or no certificate at all) correctly produces no line at all
 * — this is the closed-list-with-a-zero-case pattern already established
 * for MI/PA, not a silent omission.
 */
function ohioLocalTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  if (rules.code !== 'OH') return null;
  if (!hasOHMunicipalityRuleset(input.checkDate)) return null;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const residenceCityName = typeof cert.residenceCity === 'string' ? cert.residenceCity : undefined;
  const workCityName = typeof cert.workCity === 'string' ? cert.workCity : undefined;
  if (!residenceCityName && !workCityName) return null;

  const residenceEntry = residenceCityName
    ? ohMunicipalityRuleset(residenceCityName, input.checkDate)
    : undefined;
  const workEntry = workCityName ? ohMunicipalityRuleset(workCityName, input.checkDate) : undefined;

  if (!residenceEntry && !workEntry) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const sameCity =
    residenceEntry !== undefined &&
    workEntry !== undefined &&
    residenceEntry.name.toLowerCase() === workEntry.name.toLowerCase();

  const taxFor = (entry: OHMunicipalityEntry): number => applyRate(periodWages, entry.rate);

  if (sameCity) {
    const t = taxFor(residenceEntry as OHMunicipalityEntry);
    return {
      id: 'OH_LOCAL',
      name: 'Ohio Municipal Income Tax',
      payer: 'employee',
      jurisdiction: 'local',
      taxableWages: periodWages,
      amount: t,
      detail: `${fmt(t)} to ${residenceEntry!.name} @ ${(residenceEntry!.rate * 100).toFixed(2)}% (residence and work municipality are the same)`,
    };
  }

  const workTax = workEntry ? taxFor(workEntry) : 0;
  const homeTax = residenceEntry ? taxFor(residenceEntry) : 0;
  const credit = Math.min(workTax, homeTax);
  const netHomeTax = atLeastZero(homeTax - credit);
  const amount = workTax + netHomeTax;

  const details: string[] = [];
  if (workEntry) {
    details.push(`${fmt(workTax)} to ${workEntry.name} @ ${(workEntry.rate * 100).toFixed(2)}% on wages earned there`);
  }
  if (residenceEntry) {
    details.push(
      workEntry
        ? `${fmt(netHomeTax)} to ${residenceEntry.name} @ ${(residenceEntry.rate * 100).toFixed(2)}% on all earnings, less a ${fmt(credit)} ORC 718.121 nonrefundable credit for tax paid to ${workEntry!.name} (capped at the home rate, no carryforward)`
        : `${fmt(homeTax)} to ${residenceEntry.name} @ ${(residenceEntry.rate * 100).toFixed(2)}% on all earnings`,
    );
  }

  return {
    id: 'OH_LOCAL',
    name: 'Ohio Municipal Income Tax',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: periodWages,
    amount,
    detail: details.join('; '),
  };
}

/**
 * Ohio's School District Income Tax (SDIT) — a tax category layered on top
 * of both state and municipal income tax, levied independently by 214 of
 * Ohio's school districts (data/local/OH-school-districts-2026.json,
 * Ohio Dept of Taxation's own official SDIT_LIST.pdf). Looked up by the
 * district's 4-digit sdNumber (certificate.schoolDistrictCode) rather than
 * by name — see ohSchoolDistrictRuleset()'s own doc comment for why. A
 * caller-resolved code, the same convention as every other local lookup
 * in this file: this engine does not resolve an address to a district.
 *
 * Applied to the same taxable wage base as the state tax regardless of
 * whether the district's own ballot measure taxes "traditional" (modified
 * AGI, which can include non-wage income) or "earned income only" — the
 * traditional/earned-income distinction governs what counts on the
 * district's year-end RETURN, not what an employer withholds from wages;
 * Ohio's own SD 100 withholding guidance applies the district rate to
 * wages paid either way. A code absent from or expired out of the 214-row
 * list correctly produces no line, not a silent $0 assumption for an
 * unrecognised code — same closed-list convention as ohioLocalTax().
 */
function ohioSchoolDistrictTax(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine | null {
  if (rules.code !== 'OH') return null;
  if (!hasOHSchoolDistrictRuleset(input.checkDate)) return null;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const sdNumber = typeof cert.schoolDistrictCode === 'string' ? cert.schoolDistrictCode : undefined;
  if (!sdNumber) return null;

  const entry = ohSchoolDistrictRuleset(sdNumber, input.checkDate);
  if (!entry) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const amount = applyRate(periodWages, entry.rate2026);

  return {
    id: 'OH_SDIT',
    name: 'Ohio School District Income Tax',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: periodWages,
    amount,
    detail: `${fmt(amount)} to ${entry.name} (SD ${entry.sdNumber}) @ ${(entry.rate2026 * 100).toFixed(2)}% on wages (${entry.earnedIncomeOnlyBase ? 'earned-income-only' : 'traditional MAGI'} base, same wage figure withheld either way)`,
  };
}

/**
 * Local Services Tax — a flat per-period FEE, not a percentage of wages,
 * capped statewide at $52/yr (Act 32) and prorated ROUNDED DOWN to the
 * cent (the opposite rounding direction from every other tax in this
 * project — see money.ts's roundDownToCent()). Uses the WORK PSD's own
 * lst.total figure directly rather than re-deriving/re-capping it in
 * code — the data itself is already primary-sourced and spot-checked
 * against the $52/$12,000 figures in PA-2026.json's own localTax.lst
 * block, so re-imposing a cap here would only risk MASKING a real data
 * discrepancy rather than catching one.
 *
 * Low-income exemption: estimates ANNUAL wages by annualizing this one
 * cheque (periodWages × periodsPerYear) — the same approximation
 * nonresidentDeMinimisReason() already makes elsewhere in this file, not
 * a true year-to-date figure. Uses the municipal LIE threshold if
 * present, falling back to the school district's, matching how the
 * combined municipal+school total is what's actually being exempted.
 */
function pennsylvaniaLST(
  ctx: ComputeContext,
  rules: StateRuleset,
  workEntry: PALocalEntry,
): TaxLine | null {
  const lst = workEntry.lst;
  if (!lst || lst.total <= 0) return null;

  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const estimatedAnnualWages = periodWages * ctx.periodsPerYear;

  const lie = lst.lowIncomeExemption?.municipal || lst.lowIncomeExemption?.schoolDistrict;
  if (lie && estimatedAnnualWages < dollars(lie)) {
    return {
      id: 'PA_LST',
      name: 'PA Local Services Tax',
      payer: 'employee',
      jurisdiction: 'local',
      taxableWages: 0,
      amount: 0,
      detail:
        `$0 — estimated annual wages ${fmt(estimatedAnnualWages)} (this cheque annualized, not a true ` +
        `YTD figure) fall below the $${lie.toLocaleString()} Act 32 low-income exemption threshold`,
    };
  }

  const annualLST = dollars(lst.total);
  const perPeriod = roundDownToCent(annualLST / ctx.periodsPerYear);

  return {
    id: 'PA_LST',
    name: 'PA Local Services Tax',
    payer: 'employee',
    jurisdiction: 'local',
    taxableWages: 0,
    amount: perPeriod,
    detail:
      `${fmt(annualLST)}/yr ÷ ${ctx.periodsPerYear} periods, rounded DOWN to the cent (Act 32's own ` +
      `proration rule, the opposite direction from every other tax in this engine) = ${fmt(perPeriod)}/period`,
  };
}

interface NCConfig {
  rate: number;
  standardDeductionAnnual: {
    single_married_survivingSpouse: number;
    headOfHousehold: number;
  };
  allowanceAmountAnnual: number;
}

/**
 * North Carolina's withholding formula (NC-30's own Annualized Wages
 * Method table, read directly): annualize wages, subtract a flat standard
 * deduction (ONLY two tiers — Single/Married/Surviving Spouse share one
 * figure, $12,750; Head of Household gets $19,125 — no separate Married
 * table at all, unlike most bracket/deduction states in this project) plus
 * $2,500 per allowance, then multiply the whole remainder by a SINGLE flat
 * rate. That rate, 4.09%, is NOT the bare 3.99% individual income tax rate
 * — NC-30 states directly that withholding itself is computed at "3.99%
 * plus 0.1%," so 0.0409 is the correct multiplier here, already baked in.
 * Final amount rounds to the nearest WHOLE DOLLAR — handled generically by
 * rules.roundFinalToWholeDollar in stateIncomeTax(), not here.
 */
function northCarolinaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRateStatusDeduction as NCConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualWages = periodWages * ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const isHoH = cert.filingStatus === 'head_of_household';
  const standardDeduction = dollars(
    isHoH
      ? cfg.standardDeductionAnnual.headOfHousehold
      : cfg.standardDeductionAnnual.single_married_survivingSpouse,
  );
  const allowances = Number(cert.allowances ?? 0);
  const allowanceDeduction = dollars(cfg.allowanceAmountAnnual) * allowances;

  const taxableIncome = atLeastZero(annualWages - standardDeduction - allowanceDeduction);
  const annualTax = applyRate(taxableIncome, cfg.rate);
  const amount = roundHalfUp(annualTax / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(standardDeduction)} standard deduction (${isHoH ? 'HoH' : 'Single/Married/Surviving Spouse'}) ` +
      `less ${fmt(allowanceDeduction)} (${allowances} × $${cfg.allowanceAmountAnnual} allowances) ` +
      `= ${fmt(taxableIncome)} taxable @ ${(cfg.rate * 100).toFixed(2)}% = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear}`,
  };
}

interface SCConfig {
  allowanceAmountAnnual: number;
  standardDeductionRate: number;
  standardDeductionCapAnnual: number;
  brackets: { annual: WIBracket[] };
}

/**
 * South Carolina's withholding formula (WH-1603F, read directly):
 * annualize wages, then — ONLY if at least 1 allowance is claimed — subtract
 * a Personal Allowance ($5,000/allowance) AND a Standard Deduction (10% of
 * annual wages, capped at $7,500). Claiming 0 allowances forfeits BOTH
 * deductions at once, a genuine all-or-nothing quirk confirmed directly
 * from the source, not assumed. Runs the result through a 3-bracket table
 * (0%/3%/6%) and divides by periods — no whole-dollar rounding (unlike
 * North Carolina/Virginia), cent-precision throughout, matching WH-1603F's
 * own worked example exactly ($10.58/week).
 */
function southCarolinaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRateAllowanceDeduction as SCConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualWages = periodWages * ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const allowances = Number(cert.allowances ?? 0);

  let personalAllowance = 0;
  let standardDeduction = 0;
  if (allowances > 0) {
    personalAllowance = dollars(cfg.allowanceAmountAnnual) * allowances;
    standardDeduction = Math.min(
      roundHalfUp(annualWages * cfg.standardDeductionRate),
      dollars(cfg.standardDeductionCapAnnual),
    );
  }
  const taxableIncome = atLeastZero(annualWages - personalAllowance - standardDeduction);

  const bracket = findWIBracket(cfg.brackets.annual, taxableIncome);
  const excess = taxableIncome - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);
  const amount = roundHalfUp(annualTax / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(personalAllowance)} personal allowance (${allowances} × $${cfg.allowanceAmountAnnual}) ` +
      `less ${fmt(standardDeduction)} standard deduction (10% capped at $${cfg.standardDeductionCapAnnual}) ` +
      `= ${fmt(taxableIncome)} taxable @ ${(bracket.rate * 100).toFixed(2)}% over ${fmt(dollars(bracket.from))}, ` +
      `base ${fmt(dollars(bracket.base))} = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear}`,
  };
}

interface ARBracket {
  from: number; // dollars
  to: number | null; // dollars, null = no ceiling
  rate: number;
  adjustment: number; // dollars, subtracted from (taxableIncome × rate) directly
}

function findARBracket(brackets: ARBracket[], annualTaxableIncome: number): ARBracket {
  for (const b of brackets) {
    const from = dollars(b.from);
    const to = b.to === null ? Infinity : dollars(b.to);
    if (annualTaxableIncome >= from && annualTaxableIncome < to) return b;
  }
  return brackets[brackets.length - 1];
}

interface ARConfig {
  standardDeductionAnnual: number;
  personalCreditPerExemption: number;
  annualizeMultiplier: Partial<Record<string, number>>;
  midrangeRoundingThreshold: number;
  brackets: ARBracket[];
}

/**
 * Arkansas's withholding formula (whformula_2026.pdf, read directly):
 * annualize, subtract a flat $2,470 standard deduction (no filing-status
 * variation — status only matters for the separate low-income election,
 * not this formula), round to the nearest $50 MIDRANGE of each $100 band
 * for taxable income under $100,001 (a real, source-required step — the
 * document's own worked example rounds $23,054 to $23,050 before the
 * bracket lookup, even deep inside a wide bracket), look up a bracket
 * using tax = income × rate − adjustment (NOT base+excess — verified these
 * are not numerically interchangeable for AR's own published constants),
 * round THAT to the nearest whole dollar, then subtract a flat $29-per-
 * exemption CREDIT (post-bracket, like Delaware's, not a pre-tax
 * deduction) to reach the annual net tax, then divide by periods.
 */
function arkansasWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.arkansasBracketCredit as ARConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const multiplier = cfg.annualizeMultiplier[input.payFrequency];
  if (multiplier === undefined) {
    throw new Error(
      `Arkansas's own Formula Method doesn't publish an annualizing multiplier for ` +
        `"${input.payFrequency}" — cannot compute ${rules.code}_SIT.`,
    );
  }
  const annualWages = periodWages * multiplier;

  const standardDeduction = dollars(cfg.standardDeductionAnnual);
  let taxableIncome = atLeastZero(annualWages - standardDeduction);

  const midrangeThreshold = dollars(cfg.midrangeRoundingThreshold);
  let midrangeNote = 'no midrange rounding (≥ $100,001)';
  if (taxableIncome < midrangeThreshold) {
    const band = dollars(100);
    const half = dollars(50);
    const rounded = Math.floor(taxableIncome / band) * band + half;
    midrangeNote = `midrange-rounded from ${fmt(taxableIncome)} to ${fmt(rounded)}`;
    taxableIncome = rounded;
  }

  const bracket = findARBracket(cfg.brackets, taxableIncome);
  const rawTax = applyRate(taxableIncome, bracket.rate);
  const adjustment = dollars(bracket.adjustment);
  const annualGrossTax = toWholeDollars(atLeastZero(rawTax - adjustment));

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const exemptions = Number(cert.exemptions ?? 0);
  const credit = dollars(cfg.personalCreditPerExemption) * exemptions;
  const annualNetTax = atLeastZero(annualGrossTax - credit);

  const amount = roundHalfUp(annualNetTax / multiplier);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(standardDeduction)} standard deduction, ${midrangeNote} ` +
      `@ ${(bracket.rate * 100).toFixed(2)}% less ${fmt(adjustment)} adjustment = ${fmt(annualGrossTax)} gross tax, ` +
      `less ${fmt(credit)} (${exemptions} × $${cfg.personalCreditPerExemption} credit) = ${fmt(annualNetTax)}/yr ÷ ${multiplier}`,
  };
}

interface ALStandardDeductionStep {
  base: number;
  floor: number;
  threshold: number;
  ceiling: number;
  stepAmount: number;
  stepIncrement: number;
}

interface ALConfig {
  standardDeduction: {
    single_0: ALStandardDeductionStep;
    marriedFilingSeparately: ALStandardDeductionStep;
    marriedFilingJointly: ALStandardDeductionStep;
    headOfFamily: ALStandardDeductionStep;
  };
  personalExemption: { code0: number; codeS: number; codeMS: number; codeM: number; codeH: number };
  dependentAllowance: {
    tiers: { giLessOrEqual?: number; giGreaterThan?: number; perDependent: number }[];
  };
  brackets: { nonMarried: WIBracket[]; married: WIBracket[] };
}

function resolveALDeductionKey(
  code: string,
): keyof ALConfig['standardDeduction'] {
  if (code === 'MS') return 'marriedFilingSeparately';
  if (code === 'M') return 'marriedFilingJointly';
  if (code === 'H') return 'headOfFamily';
  return 'single_0'; // '0' or 'S', or no certificate on file
}

function alabamaStandardDeduction(cfg: ALStandardDeductionStep, gi: number): number {
  const threshold = dollars(cfg.threshold);
  const ceiling = dollars(cfg.ceiling);
  const base = dollars(cfg.base);
  const floor = dollars(cfg.floor);
  if (gi <= threshold) return base;
  if (gi >= ceiling) return floor;
  const stepIncrement = dollars(cfg.stepIncrement);
  const steps = Math.ceil((gi - threshold) / stepIncrement);
  return Math.max(floor, base - dollars(cfg.stepAmount) * steps);
}

function alabamaPersonalExemption(cfg: ALConfig['personalExemption'], code: string): number {
  if (code === 'S') return dollars(cfg.codeS);
  if (code === 'MS') return dollars(cfg.codeMS);
  if (code === 'M') return dollars(cfg.codeM);
  if (code === 'H') return dollars(cfg.codeH);
  return dollars(cfg.code0); // '0' or unset
}

function alabamaDependentPerUnit(
  tiers: ALConfig['dependentAllowance']['tiers'],
  gi: number,
): number {
  for (const t of tiers) {
    if (t.giLessOrEqual !== undefined && gi <= dollars(t.giLessOrEqual)) {
      return dollars(t.perDependent);
    }
  }
  return dollars(tiers[tiers.length - 1].perDependent);
}

/**
 * Alabama's withholding formula (Formula For Computing Alabama Withholding
 * Tax, read directly): a genuinely unusual shape among every state in this
 * project — the employee's own ANNUAL FEDERAL WITHHOLDING is one of the
 * deductions, alongside a standard deduction that steps DOWN as income
 * rises (a different threshold/step-size per filing status), a flat
 * personal exemption by status, and a per-dependent allowance that steps
 * down by GROSS INCOME (not status). Two 3-bracket schedules: "M" (married
 * filing jointly) gets double-width brackets; every other status shares
 * the narrower one.
 *
 * Computes federal withholding by calling federalIncomeTax() directly —
 * the same "compute another tax's line, read its .amount" pattern this
 * project's own Oregon method (bracketFederalSubtractionPhaseout) already
 * established, just without Oregon's cap.
 */
function alabamaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.alabamaFederalSubtraction as ALConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualGI = periodWages * ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const code = typeof cert.alabamaExemptionCode === 'string' ? cert.alabamaExemptionCode : '0';
  const isMarried = code === 'M';

  const standardDeduction = alabamaStandardDeduction(
    cfg.standardDeduction[resolveALDeductionKey(code)],
    annualGI,
  );
  const personalExemption = alabamaPersonalExemption(cfg.personalExemption, code);
  const dependents = Number(cert.dependents ?? 0);
  const dependentTotal = alabamaDependentPerUnit(cfg.dependentAllowance.tiers, annualGI) * dependents;

  const fedLine = federalIncomeTax(input, ctx, federalRuleset(input.checkDate));
  const federalWithheldAnnual = fedLine.amount * ctx.periodsPerYear;

  const totalDeductions = standardDeduction + federalWithheldAnnual + personalExemption + dependentTotal;
  const taxableAmount = atLeastZero(annualGI - totalDeductions);

  const brackets = isMarried ? cfg.brackets.married : cfg.brackets.nonMarried;
  const bracket = findWIBracket(brackets, taxableAmount);
  const excess = taxableAmount - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);
  const amount = roundHalfUp(annualTax / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualGI)}/yr GI less ${fmt(standardDeduction)} standard deduction, ` +
      `${fmt(federalWithheldAnnual)} annual federal withholding, ${fmt(personalExemption)} personal exemption (${code}), ` +
      `${fmt(dependentTotal)} (${dependents} dependents) = ${fmt(taxableAmount)} taxable @ ` +
      `${(bracket.rate * 100).toFixed(2)}% (${isMarried ? 'M' : 'non-M'} schedule) = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear}`,
  };
}

interface GATablePeriod {
  rate: number;
  standardDeductionAnnual: {
    marriedFilingJointOneSpouseWorks: number;
    everyoneElse: number;
  };
  dependentAllowanceAnnual: number;
}

interface GAConfig {
  effectiveDateOfNewTable: string;
  beforeMay11_2026: GATablePeriod;
  fromMay11_2026: GATablePeriod;
}

/**
 * Georgia's withholding formula (Employer's Withholding Tax Guide, read
 * directly): a genuine MID-YEAR change from HB 463 — the statute cut the
 * rate and raised the standard deduction/dependent allowance retroactive
 * to 2026-01-01, but the employer WITHHOLDING transition date is
 * 2026-05-11 specifically (both tables verified against the guide's own
 * before/after worked examples). Same shape as Ohio's HB96 mid-year cut —
 * a plain string-compare against effectiveDateOfNewTable, no new
 * mechanism. Otherwise simple: annualize, subtract a 3-tier standard
 * deduction (MFJ gets its own figure; Single/HoH/MFS all share the same
 * lower one) plus a flat per-dependent allowance, multiply by the single
 * flat rate. No whole-dollar rounding.
 */
function georgiaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.georgiaStatusDeduction as GAConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualWages = periodWages * ctx.periodsPerYear;

  const table = input.checkDate >= cfg.effectiveDateOfNewTable ? cfg.fromMay11_2026 : cfg.beforeMay11_2026;

  // G-4's own Line 3 letter codes (A=Single, B=MFJ-BOTH-spouses-working or
  // MFS, C=MFJ-ONE-spouse-working, D=Head of Household) — cross-confirmed
  // independently via USDA NFC's own bulletin, which uses different
  // letters (S/M/N/H) but the identical substance: ONLY "one spouse
  // working" MFJ gets the higher standard deduction. B (both spouses
  // working) is a real, easy-to-miss trap — it LOOKS like ordinary MFJ but
  // gets the LOWER bucket, same as Single/HoH/MFS. Caught by an
  // independent NFC cross-check after this file's first version only
  // checked for a generic 'married_filing_joint' string with no
  // one-vs-both-working distinction at all.
  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const higherDeduction = cert.georgiaMaritalStatus === 'C';
  const standardDeduction = dollars(
    higherDeduction
      ? table.standardDeductionAnnual.marriedFilingJointOneSpouseWorks
      : table.standardDeductionAnnual.everyoneElse,
  );

  const dependents = Number(cert.dependents ?? 0);
  const dependentAllowance = dollars(table.dependentAllowanceAnnual) * dependents;

  const taxableIncome = atLeastZero(annualWages - standardDeduction - dependentAllowance);
  const annualTax = applyRate(taxableIncome, table.rate);
  const amount = roundHalfUp(annualTax / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(standardDeduction)} standard deduction ` +
      `(${higherDeduction ? 'MFJ, one spouse working' : 'Single/HoH/MFS/MFJ-both-working'}) ` +
      `less ${fmt(dependentAllowance)} (${dependents} dependents) = ${fmt(taxableIncome)} taxable ` +
      `@ ${(table.rate * 100).toFixed(2)}% = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear} ` +
      `(${table === cfg.fromMay11_2026 ? 'post' : 'pre'}-2026-05-11 table)`,
  };
}

interface LAConfig {
  rate: number;
  standardDeductionAnnual: {
    claim1_single_marriedSeparate: number;
    claim2_marriedJoint_hoh_qss: number;
  };
  // R-1306's own "Number of Pay Periods in a year" table uses DIFFERENT
  // period counts than this engine's generic PERIODS_PER_YEAR for 'daily'
  // specifically (365, not the engine-wide 260-workday convention) — the
  // same class of mismatch New Jersey's and Delaware's daily tables hit.
  // Keyed by PayFrequency string; only the 6 frequencies R-1306 actually
  // publishes (daily/weekly/biweekly/semimonthly/monthly/annual).
  annualizeMultiplier: Partial<Record<string, number>>;
}

/**
 * Louisiana's withholding formula (R-1306, read directly): annualize wages,
 * subtract a standard deduction selected ENTIRELY by the employee's Form
 * L-4 Block A claim — "0" (no deduction), "1" (single/married-separate,
 * $12,875), or "2" (married-joint/qualifying-surviving-spouse/head-of-
 * household, $25,750) — then multiply the whole remainder by the single
 * flat rate. Genuinely different from every other status-deduction state in
 * this project: the controlling input isn't filingStatus at all, it's the
 * literal claim number the employee wrote on the form (Block A doesn't even
 * require the claim to match the employee's actual filing status — R-1306's
 * own text says "Any taxpayer may use 1 or 2 as the standard deduction").
 * Reproduced both of R-1306's own worked examples exactly (weekly $700,
 * claim 1 -> $13.98; bi-weekly $4,600, claim 2 -> $111.54). No dependent
 * allowance, no whole-dollar rounding (cent precision throughout, matching
 * both worked examples' own cent-level answers) — roundHalfUp only.
 * Annualizes via R-1306's OWN published multiplier per frequency, NOT
 * ctx.periodsPerYear — caught during a 'verify' pass: R-1306's daily figure
 * is 365, not this engine's generic 260-workday daily convention (the same
 * mismatch NJ's and Delaware's daily tables required their own override
 * for). Throws for any frequency R-1306 doesn't itself publish (quarterly/
 * semiannual) rather than guessing, same discipline as Delaware's.
 * Form L-4's own Line 7 (signed additional-or-reduced withholding, capped
 * at $0) is NOT special-cased here — it's already covered for free by the
 * two generic post-processing steps every state gets
 * (applyAdditionalStateWithholding()/applyReducedStateWithholding()), the
 * same pattern Connecticut's Line 3 established.
 */
function louisianaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.flatRateBlockADeduction as LAConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const multiplier = cfg.annualizeMultiplier[input.payFrequency];
  if (multiplier === undefined) {
    throw new Error(
      `Louisiana's own R-1306 doesn't publish an annualizing multiplier for ` +
        `"${input.payFrequency}" — cannot compute ${rules.code}_SIT.`,
    );
  }
  const annualWages = periodWages * multiplier;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const blockA = Number(cert.louisianaBlockA ?? 0);
  const standardDeduction = dollars(
    blockA === 2
      ? cfg.standardDeductionAnnual.claim2_marriedJoint_hoh_qss
      : blockA === 1
        ? cfg.standardDeductionAnnual.claim1_single_marriedSeparate
        : 0,
  );

  const taxableIncome = atLeastZero(annualWages - standardDeduction);
  const annualTax = applyRate(taxableIncome, cfg.rate);
  const amount = roundHalfUp(annualTax / multiplier);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(standardDeduction)} standard deduction (Form L-4 Block A claim ${blockA}) ` +
      `= ${fmt(taxableIncome)} taxable @ ${(cfg.rate * 100).toFixed(2)}% = ${fmt(annualTax)}/yr ÷ ${multiplier}`,
  };
}

interface MSConfig {
  rate: number;
  bracketThresholdAnnual: number;
  standardDeductionAnnual: {
    single: number;
    headOfFamily: number;
    marriedSpouseNotEmployed: number;
    marriedBothEmployed: number;
  };
}

/**
 * Mississippi's withholding formula, reverse-derived from Pub 89-700's own
 * published wage-bracket tables (the document itself has no separate
 * formula page — Table A/B/C/D are the primary artifact) and verified by
 * reproducing 3 of Table A's own cells exactly before trusting it: annual
 * wages less a filing-status standard deduction (Single $2,300 / Head of
 * Family $3,400 / Married-spouse-not-employed $4,600 / Married-both-
 * employed $2,300, i.e. Table D's own documented half-of-$4,600 split) less
 * the employee's own TOTAL exemption figure (Form 89-350's Line 6 — the
 * form itself has the employee sum personal + $1,500/dependent +
 * $1,500/age-or-blind-block into one number, so this engine consumes that
 * total directly rather than re-deriving it, the same mechanism the form
 * uses) is taxed at 0% for the first $10,000 and a flat 4.0% above that
 * (Pub 89-700's own summary box: "First $10,000 ... 0% / Remaining balance
 * (excess of $10,000) ... 4.0%" for tax year 2026 — NOT the 4.1% figure
 * several secondary aggregators repeat uncited; the primary document and
 * this reproduction both say 4.0%). Verified against Table A (Single),
 * weekly period: wages $505/exemption $0 -> $11, $605/$0 -> $15, $495/
 * $6,000 -> $6, all three reproduced exactly. Pub 89-700 Section 13(e)
 * states the per-period result "should be rounded to the nearest whole
 * dollar" — handled generically via rules.roundFinalToWholeDollar in
 * stateIncomeTax(), not duplicated here (roundHalfUp below is cent-level;
 * the outer whole-dollar pass runs after). Absent certificate: Pub 89-700
 * Section 12 states explicitly the employer "shall withhold based on zero
 * exemption" — totalExemptionClaimed defaults to 0. filingStatus absent
 * defaults to 'single' (the smallest standard deduction), consistent with
 * this project's standing "absent certificate = least generous outcome"
 * convention for the one input Pub 89-700 doesn't itself address.
 */
function mississippiWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.bracketStatusDeduction as MSConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualWages = periodWages * ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const status = (cert.filingStatus as string) ?? 'single';
  const standardDeduction = dollars(
    status === 'married_spouse_not_employed'
      ? cfg.standardDeductionAnnual.marriedSpouseNotEmployed
      : status === 'married_both_employed'
        ? cfg.standardDeductionAnnual.marriedBothEmployed
        : status === 'head_of_family'
          ? cfg.standardDeductionAnnual.headOfFamily
          : cfg.standardDeductionAnnual.single,
  );
  const totalExemptionClaimed = dollars(Number(cert.totalExemptionClaimed ?? 0));

  const afterDeductions = atLeastZero(annualWages - standardDeduction - totalExemptionClaimed);
  const excessOverThreshold = atLeastZero(afterDeductions - dollars(cfg.bracketThresholdAnnual));
  const annualTax = applyRate(excessOverThreshold, cfg.rate);
  const amount = roundHalfUp(annualTax / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(standardDeduction)} standard deduction (${status}) ` +
      `less ${fmt(totalExemptionClaimed)} exemption claimed (Form 89-350 Line 6) = ${fmt(afterDeductions)}, ` +
      `less ${fmt(dollars(cfg.bracketThresholdAnnual))} 0%-bracket threshold = ${fmt(excessOverThreshold)} taxable ` +
      `@ ${(cfg.rate * 100).toFixed(2)}% = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear}`,
  };
}

interface NMConfig {
  brackets: {
    single: Partial<Record<string, WIBracket[]>>;
    married: Partial<Record<string, WIBracket[]>>;
    hoh: Partial<Record<string, WIBracket[]>>;
  };
}

type NMFilingStatus = 'single' | 'married' | 'hoh';

// New Mexico has no state-specific withholding certificate at all — FYI-104
// itself tells employees to complete a copy of the FEDERAL Form W-4 and
// write "For New Mexico State Withholding Only" across the top. That form's
// own 2020+ redesign has exactly 3 filing-status checkboxes ("Single or
// Married filing separately" / "Married filing jointly" / "Head of
// household"), which map 1:1 onto FYI-104's own three lettered tables — so
// this resolver deliberately reuses the SAME certificate.filingStatus
// vocabulary already used for federalW4 (rather than inventing a NM-specific
// field) and folds 'married_separate' into the Single table, exactly as the
// federal checkbox itself bundles them. Absent/unrecognized status defaults
// to 'single' — the narrowest brackets, this project's standing "absent
// certificate = least generous outcome" convention (FYI-104 doesn't itself
// state a no-form default, since there is no NM-specific form to fail to
// file).
function resolveNMFilingStatus(cert: Record<string, unknown>): NMFilingStatus {
  const raw = cert.filingStatus;
  if (raw === 'married_joint') return 'married';
  if (raw === 'head_of_household') return 'hoh';
  return 'single';
}

/**
 * New Mexico's withholding formula (FYI-104 REV. 11/2025, "New Mexico State
 * Wage Withholding Tax Tables for Percentage Method of Withholding," fetched
 * and read directly — effective for wages paid on or after 2026-01-01).
 * Genuinely simpler than most bracket states in this project: NO annualize/
 * divide step at all — FYI-104 publishes a COMPLETE, independent {from, to,
 * base, rate} bracket schedule for each of 8 native pay periods (daily,
 * weekly, biweekly, semimonthly, monthly, quarterly, semiannual, annual) ×
 * 3 filing statuses, so the period wage is looked up directly against that
 * period's own table — no periodsPerYear conversion, and therefore none of
 * the daily-divisor class of bug Louisiana's own table needed a fix for.
 * Reproduced FYI-104's own worked example exactly: weekly $1,000, married,
 * "over $790 but not over $1,098... $12.77 + 4.3% of excess over $790" ->
 * (1,000-790)*.043 + 12.77 = $21.80.
 *
 * Transcription note (important): this document's own PDF text extracts
 * with a real multi-column layout hazard (the same class already
 * documented for CT/NJ/PA elsewhere in this project) — a naive column-
 * preserving extraction shifts every bracket's BASE value one tier too
 * early (e.g. it would attribute the $12.77 base to the $617-$790 bracket
 * instead of the $790-$1,098 bracket the worked example itself proves it
 * belongs to). Every one of the 24 bracket schedules below (8 periods × 3
 * statuses) was instead built from a sequential, non-column-reconstructed
 * extraction and independently verified by recomputing each bracket's own
 * base from the previous bracket's base + rate × width and confirming it
 * lands within a cent or two of the printed figure (small residual drift is
 * expected — the source's own bases are independently rounded per bracket,
 * not chained, the same phenomenon already documented for Wisconsin's
 * bracket tables) — not just eyeballed once.
 *
 * A second real, documented artifact: the Semi-Monthly table's own summary
 * "Not Over" line prints $304/$608/$456 (single/married/HoH), but the
 * table's own first bracket row, AND algebraic scaling from the (internally
 * self-consistent) Annual table, both independently confirm the correct
 * figures are $335/$671/$503 — an error in New Mexico's own published PDF,
 * not a transcription artifact on this project's end. The correct
 * ($335/$671/$503) figures are what's encoded below.
 */
function newMexicoWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.percentageMethodTables as NMConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const fullBase = ctx.taxableWagesFor(exempt);
  // Carve supplemental wages out of the regular bracket base — this
  // ruleset ALWAYS pairs with a separate flat-rate supplemental line (see
  // the 'new_mexico_percentage_method' dispatch case), so unlike flatRate()
  // this doesn't need a presence check. FOUND AND FIXED as a genuine
  // double-taxation bug: periodWages previously included the bonus, so a
  // supplemental payment was taxed once via this bracket AND again via
  // NM_SIT_SUPP — the same class of gap NY's computeNYSStyleTax() already
  // avoided by doing exactly this subtraction.
  const supplementalCash = supplementalEarnings(input.earnings);
  const periodWages = atLeastZero(fullBase - supplementalCash);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const status = resolveNMFilingStatus(cert);

  const period = input.payFrequency;
  const table = cfg.brackets[status][period];
  if (!table) {
    throw new Error(
      `New Mexico's own FYI-104 doesn't publish a "${period}" table for "${status}" — cannot compute ${rules.code}_SIT.`,
    );
  }

  const bracket = findWIBracket(table, periodWages);
  const excess = periodWages - dollars(bracket.from);
  const amount = dollars(bracket.base) + applyRate(excess, bracket.rate);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(periodWages)} (${status}, ${period}) in bracket ${fmt(dollars(bracket.from))}-` +
      `${bracket.to === null ? '∞' : fmt(dollars(bracket.to))}: ${fmt(dollars(bracket.base))} + ` +
      `${(bracket.rate * 100).toFixed(1)}% × ${fmt(excess)} = ${fmt(amount)}`,
  };
}

interface HIConfig {
  allowanceAmountAnnual: number;
  extraLumpSumAllowanceAnnual: number;
  brackets: {
    single: WIBracket[];
    married: WIBracket[];
  };
}

/**
 * Hawaii's withholding formula (Booklet A, Employer's Tax Guide, Appendix
 * Part 1 "Annualized Income Tax Withholding" — read directly, all figures
 * effective for wages paid 2026-01-01 and after): annualize wages, subtract
 * $1,144 per withholding allowance PLUS a separate, unconditional "extra
 * lump sum withholding allowance amount" ($4,350 — a TCJA-standard-
 * deduction-offset introduced when Hawaii adopted the redesigned 2020+-
 * style W-4 concept; raised from $1,650 for 2026), then run the remainder
 * through an 8-bracket annual schedule (1.40%-7.90%) keyed by only TWO
 * statuses — Single (which Form HW-4's own instructions state explicitly
 * ALSO covers unmarried Head of Household: "you are treated as Single for
 * withholding tax purposes") and Married. Chose Part 1's annualize-then-
 * divide method over Part 2's 8 separately-published per-period tables
 * (Weekly/Biweekly/Semimonthly/Monthly/Quarterly/Semiannual/Annual/Daily) —
 * the Guide itself sanctions this explicitly ("You may determine the tax to
 * be withheld on the basis of annualized wages... Only the annual rates
 * below, wage brackets and allowance values need to be stored") — reproduced
 * the Guide's own worked example exactly (single, weekly $500, 3 allowances:
 * 26,000 - 3,432 - 4,350 = 18,218 taxable -> $497.99/yr -> $9.58/wk). NOT
 * verified against Part 2's own per-period tables, which round each period's
 * boundaries independently (annual/N rounded to the dollar) rather than
 * dividing an exact annual figure — a small, disclosed divergence at bracket
 * boundaries, the same class of choice this project has made for PA/DC/VA/
 * Delaware. Step 1(c)'s extra-lump-sum deduction is read as UNCONDITIONAL —
 * applied even at zero allowances claimed — since it's listed as its own
 * lettered step outside the allowance-count branch (a) and the worked
 * example applies it as an independent subtraction; this is an inference
 * from the instruction's structure, not a directly quoted "always applies"
 * sentence, so it's disclosed rather than asserted with full confidence.
 * Hawaii law does NOT allow ordinary certificate.exempt-style exemption —
 * HW-4's own instructions state this directly — so the two real routes to
 * $0 HI withholding (certified disabled person; nonresident military
 * spouse under the Service Members Civil Relief Act) are modelled as
 * distinct certificate.hawaiiMaritalStatus values rather than reusing the
 * generic exempt flag other states share.
 */
function hawaiiWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.annualBracket as HIConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);
  const annualWages = periodWages * ctx.periodsPerYear;

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const status = (cert.hawaiiMaritalStatus as string) ?? 'single';

  if (status === 'certified_disabled' || status === 'nonresident_military_spouse') {
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: 0,
      amount: 0,
      detail:
        status === 'certified_disabled'
          ? '$0 — certified disabled person, not subject to Hawaii withholding (Form HW-4 Line 3).'
          : "$0 — nonresident military spouse, exempt under the Service Members Civil Relief Act as amended by the Military Spouses Residency Relief Act (Form HW-4 Line 3).",
    };
  }

  const brackets = status === 'married' ? cfg.brackets.married : cfg.brackets.single;
  const allowances = Number(cert.allowances ?? 0);
  const allowanceDeduction = dollars(cfg.allowanceAmountAnnual) * allowances;
  const lumpSumDeduction = dollars(cfg.extraLumpSumAllowanceAnnual);

  const taxableIncome = atLeastZero(annualWages - allowanceDeduction - lumpSumDeduction);
  const bracket = findWIBracket(brackets, taxableIncome);
  const excess = taxableIncome - dollars(bracket.from);
  const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);
  const amount = roundHalfUp(annualTax / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(annualWages)}/yr less ${fmt(allowanceDeduction)} (${allowances} × $${cfg.allowanceAmountAnnual} allowances) ` +
      `less ${fmt(lumpSumDeduction)} extra lump sum allowance = ${fmt(taxableIncome)} taxable ` +
      `(${status === 'married' ? 'Married' : 'Single incl. unmarried HoH'}), bracket ${fmt(dollars(bracket.from))}-` +
      `${bracket.to === null ? '∞' : fmt(dollars(bracket.to))}: ${fmt(dollars(bracket.base))} + ` +
      `${(bracket.rate * 100).toFixed(2)}% × ${fmt(excess)} = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear}`,
  };
}

interface OKConfig {
  allowanceAmount: Partial<Record<string, number>>; // dollars per allowance, keyed by payFrequency — each is $1,000 (the personal exemption) / periodsPerYear
  brackets: {
    single: Partial<Record<string, WIBracket[]>>;
    married: Partial<Record<string, WIBracket[]>>;
  };
}

/**
 * Oklahoma's Percentage Formula Method (Packet OW-2, Tables 1-8, read
 * directly): subtract $1,000/allowance-claimed/periodsPerYear (a single
 * undifferentiated allowance value — Form OK-W-4's own self/spouse/
 * dependent/additional-itemized lines all add into ONE count, unlike
 * Mississippi's differently-valued categories) from period wages, then look
 * up a genuine PER-PERIOD 4-bracket table (0%/2.5%/3.5%/4.5%) keyed by only
 * two statuses — Single, and Married ("Married, but withhold at higher
 * Single rate" resolves to the Single table per OW-2's own instruction:
 * "If a taxpayer has elected [that] option... use the appropriate Single
 * Persons withholding table"). All 8 published periods (Weekly/Biweekly/
 * Semimonthly/Monthly/Quarterly/Semiannual/Annual/Daily) transcribed
 * directly rather than annualized-and-divided, since OW-2 publishes exact
 * per-period tables with no annualize/divide guidance the way Hawaii's
 * Guide offers — verified for internal consistency (Semiannual = 2x
 * Quarterly, Annual = 4x Quarterly / 2x Semiannual, Married = 2x Single
 * throughout) and reproduced OW-2's own Sample Computation exactly
 * (semi-monthly $1,825, married, 2 allowances: 1,825 - (41.67x2=83.34) =
 * 1,741.66 net; bracket [1,129,∞): 9.10 + 4.5% x 612.66 = $36.6697 ->
 * rounds to $37.00). Note: OW-2's own worked-example NARRATIVE sentence
 * says "$12.19 plus 4.5%" but then correctly uses and states the table's
 * real $9.10 base in the actual arithmetic and final answer — a genuine
 * typo in Oklahoma's own document, not followed. Rounding is OW-2's own
 * stated rule ("drop under 50 cents, round 50-99 cents up to the next
 * dollar" — ordinary round-half-up to the whole dollar) via the generic
 * rules.roundFinalToWholeDollar flag, not duplicated here. This is the
 * first state in this project confirmed to have RECENTLY changed its own
 * bracket COUNT, not just its rates — HB 2764 collapsed 6 narrow brackets
 * (0.25%-4.75%) into these 4 (0%-4.5%) for 2026, independently corroborated
 * by a second source before trusting the reconstructed table.
 */
function oklahomaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const cfg = rules.percentageMethod as OKConfig;
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const statusRaw = (cert.filingStatus as string) ?? 'single';
  const status = statusRaw === 'married' ? 'married' : 'single';

  const period = input.payFrequency;
  const allowanceAmount = cfg.allowanceAmount[period];
  if (allowanceAmount === undefined) {
    throw new Error(
      `Oklahoma's own OW-2 doesn't publish a "${period}" withholding allowance amount — cannot compute ${rules.code}_SIT.`,
    );
  }
  const allowances = Number(cert.allowances ?? 0);
  const allowanceDeduction = dollars(allowanceAmount) * allowances;
  const netWages = atLeastZero(periodWages - allowanceDeduction);

  const table = cfg.brackets[status][period];
  if (!table) {
    throw new Error(
      `Oklahoma's own OW-2 doesn't publish a "${period}" bracket table for "${status}" — cannot compute ${rules.code}_SIT.`,
    );
  }

  const bracket = findWIBracket(table, netWages);
  const excess = netWages - dollars(bracket.from);
  const amount = dollars(bracket.base) + applyRate(excess, bracket.rate);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount,
    detail:
      `${fmt(periodWages)} less ${fmt(allowanceDeduction)} (${allowances} × $${allowanceAmount} allowances) ` +
      `= ${fmt(netWages)} net (${status === 'married' ? 'Married' : 'Single'}, ${period}), bracket ${fmt(dollars(bracket.from))}-` +
      `${bracket.to === null ? '∞' : fmt(dollars(bracket.to))}: ${fmt(dollars(bracket.base))} + ` +
      `${(bracket.rate * 100).toFixed(1)}% × ${fmt(excess)} = ${fmt(amount)}`,
  };
}

/**
 * North Dakota's dual-vintage withholding (2026 Income Tax Withholding
 * Rates and Instructions, read directly). This was documented data-only
 * in an earlier pass ("just for the data") and is wired to calc code here.
 * Section 1 (pre-2020 federal W-4 still on file): subtract
 * allowances x a per-period dollar amount from wages, then look up the
 * SINGLE-or-MARRIED annual bracket table. Section 2 (2020+ federal W-4, or
 * no W-4 at all for a new hire — ND's own instruction treats a missing
 * form as Single, the modern default): NO allowance subtraction at all —
 * the input is already the federal-adjusted wage figure, so pretax
 * deferrals are excluded from the ND base by construction — annualize
 * directly and look up one of THREE tables (Married Filing Jointly / Head
 * of Household / Single) keyed off input.federalW4.filingStatus itself,
 * since ND's own booklet says the status comes "straight from the
 * employee's Form W-4 Step 1(c) checkbox" — there is no separate
 * ND-specific certificate for this vintage at all. federalW4's own
 * 'married_separate' value has no ND table (the 2020+ federal form bundles
 * "Single or Married filing separately" into one checkbox), so it resolves
 * to the Single table, the same bundling this project already established
 * for New Mexico. Both sections round to the nearest whole dollar (ND's
 * own stated convention, matching Maine's) via the generic
 * rules.roundFinalToWholeDollar flag, not duplicated here. Fixed a real
 * transcription bug found while wiring this in: Section 1's own Single
 * bracket table had rate 0.0195 (not 0) on its first bracket ([0,57625)),
 * inconsistent with both this file's own bracketNote prose ("0% up to
 * $57,625") and with Section 2's OWN Single table, which covers the
 * identical boundaries/base/rate and correctly has rate 0 there — the two
 * sections share the same Single and Married/MFJ tables by ND's own
 * design, so the mismatch was a straightforward transcription slip in
 * Section 1's copy, corrected in data/states/ND-2026.json rather than
 * silently worked around in code.
 */
function northDakotaWithholding(
  input: PaycheckInput,
  ctx: ComputeContext,
  rules: StateRuleset,
): TaxLine {
  const structure = rules.withholdingStructure as {
    section1_preFederal2020W4: {
      allowanceAmountByPeriod: Partial<Record<string, number>>;
      annualBrackets: { single: WIBracket[]; married: WIBracket[] };
    };
    section2_2020AndLaterW4: {
      annualBrackets: { marriedFilingJointly: WIBracket[]; headOfHousehold: WIBracket[]; single: WIBracket[] };
    };
  };
  const exempt = (rules.exemptPretax ?? []) as PretaxCategory[];
  const periodWages = ctx.taxableWagesFor(exempt);

  const cert = (input.workState?.certificate ?? {}) as Record<string, unknown>;
  const period = input.payFrequency;

  if (cert.formVintage === 'pre_2020') {
    const section1 = structure.section1_preFederal2020W4;
    const status = cert.maritalStatus === 'married' ? 'married' : 'single';
    const allowanceAmount = section1.allowanceAmountByPeriod[period];
    if (allowanceAmount === undefined) {
      throw new Error(
        `North Dakota's own withholding booklet doesn't publish a "${period}" allowance amount for Section 1 — cannot compute ${rules.code}_SIT.`,
      );
    }
    const allowances = Number(cert.allowances ?? 0);
    const allowanceDeduction = dollars(allowanceAmount) * allowances;
    const netWages = atLeastZero(periodWages - allowanceDeduction);
    const annualTaxable = netWages * ctx.periodsPerYear;
    const bracket = findWIBracket(section1.annualBrackets[status], annualTaxable);
    const excess = annualTaxable - dollars(bracket.from);
    const annualTax = dollars(bracket.base) + applyRate(excess, bracket.rate);
    const amount = roundHalfUp(annualTax / ctx.periodsPerYear);
    return {
      id: `${rules.code}_SIT`,
      name: `${rules.name} Income Tax`,
      payer: 'employee',
      jurisdiction: 'state',
      taxableWages: periodWages,
      amount,
      detail:
        `Section 1 (pre-2020 W-4): ${fmt(periodWages)} less ${fmt(allowanceDeduction)} (${allowances} × $${allowanceAmount}) ` +
        `= ${fmt(netWages)} net (${status}), annualized bracket ${fmt(dollars(bracket.from))}-` +
        `${bracket.to === null ? '∞' : fmt(dollars(bracket.to))}: ${fmt(dollars(bracket.base))} + ` +
        `${(bracket.rate * 100).toFixed(2)}% × ${fmt(excess)} = ${fmt(annualTax)}/yr ÷ ${ctx.periodsPerYear}`,
    };
  }

  const section2 = structure.section2_2020AndLaterW4;
  const fedStatus = input.federalW4?.filingStatus ?? 'single';
  const status2 =
    fedStatus === 'married_joint'
      ? 'marriedFilingJointly'
      : fedStatus === 'head_of_household'
        ? 'headOfHousehold'
        : 'single';
  const annualWages = periodWages * ctx.periodsPerYear;
  const bracket2 = findWIBracket(section2.annualBrackets[status2], annualWages);
  const excess2 = annualWages - dollars(bracket2.from);
  const annualTax2 = dollars(bracket2.base) + applyRate(excess2, bracket2.rate);
  const amount2 = roundHalfUp(annualTax2 / ctx.periodsPerYear);

  return {
    id: `${rules.code}_SIT`,
    name: `${rules.name} Income Tax`,
    payer: 'employee',
    jurisdiction: 'state',
    taxableWages: periodWages,
    amount: amount2,
    detail:
      `Section 2 (2020+ W-4): ${fmt(annualWages)}/yr (${status2}), bracket ${fmt(dollars(bracket2.from))}-` +
      `${bracket2.to === null ? '∞' : fmt(dollars(bracket2.to))}: ${fmt(dollars(bracket2.base))} + ` +
      `${(bracket2.rate * 100).toFixed(2)}% × ${fmt(excess2)} = ${fmt(annualTax2)}/yr ÷ ${ctx.periodsPerYear}`,
  };
}
