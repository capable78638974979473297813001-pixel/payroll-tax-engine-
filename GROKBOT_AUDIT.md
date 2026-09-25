# Tax calculation engine audit

**Audit date:** 2026-09-25  
**Repository:** payroll tax engine (`calculatePaycheck` and supporting data)  
**Auditor:** read-only code and data review (no application or data files were modified)

This document is the only change in the pull request. Nothing under `src/`, `data/`, `api/`, `geocode/`, or any other application path was edited.

---

## Scope and exclusions

**In scope**

- Calculation code: `src/` (including `src/taxes/`, `src/alabama/`, garnishment, minimum wage), and the generated copy at `supabase/functions/_shared/engine/` (byte-identical to `src/` at audit time; findings apply to both).
- Jurisdiction and rate data: `data/federal/`, `data/states/`, `data/local/`, `data/garnishment/`, `data/minimum-wage/` (state files fully; local minimum-wage city files sampled), `data/employer-thresholds/`, `data/sources/us-registry.json`.
- Callers that change tax, jurisdiction, or money: `geocode/`, `api/ste-compat.ts`, `api/billing.ts`, `api/keys.ts`, `examples/api-server.ts`, `site/lib/pricing.ts`.
- Schema, edge function entry, scripts, and docs where they contradict the engine (`docs/rounding-and-precision.md`, `supabase/functions/calculate-paycheck/`, `scripts/build-*.ts`).

**Excluded, as requested**

- Entire trees `trades/` and `payroll/`.
- Tests whose only subject is those trees (`tests/payroll-*.test.ts`, `tests/trades*.test.ts`) were not used as defect sources. `tests/engine.test.ts` was consulted only to see which behaviors are already asserted.

**Sampled, not line-audited**

- `watcher/state/snapshots/*.txt.gz` (397 compressed page captures). Freshness logic in `watcher/` was not treated as a tax calculator.
- `examples/pcc-results/*.json` (PaycheckCity comparison fixtures). Not re-diffed against a live calculator.
- Every city ordinance inside `data/minimum-wage/local/`. State-level minimum-wage files were checked for scheduled steps the engine never reads.

---

## Method

1. Inventoried the tree and confirmed `supabase/functions/_shared/engine/` matches `src/` (`diff -rq` empty).
2. Read the paycheck driver (`src/calculate.ts`), money helpers, wage-base and pretax rules, and `src/taxes/federal.ts` in full.
3. Read the state dispatcher in `src/taxes/state.ts` (`stateIncomeTax`, reciprocity swap, residence withholding, method switch) and the local-tax functions called out below (PA EIT/LST, IN county, OR transit, NYC).
4. Tied out every 2026 federal percentage-method bracket row in integer cents. Spot-checked New York annual withholding bases the same way.
5. Structurally checked local registries: PA PSD format and duplicate rates (2,627 rows), Ohio school-district numbers (214), Ohio municipalities (679), Indiana county codes (92).
6. Compared geocode name matching and the Symmetry-shaped `payCalc` catalog to the certificate fields the tax functions actually read.
7. Did **not** re-download IRS Publication 15-T, state booklets, or RRB releases in this pass. Where a figure is only “internally consistent,” that limit is in [Open questions](#open-questions--could-not-verify).

Severity is the effect on a paycheck or a legal cap if the path is used, not how often the path is hit.

---

## Findings

### Critical

None filed. The defects below mis-withhold on real paths, but none of them zero every tax for an ordinary W-2 employee with a well-formed W-4.

### High

#### 1. Railroad Tier II and RUIA use the income-tax pretax list, so 401(k) deferrals drop out of the base

`src/taxes/federal.ts`, `railroadTier2` and `railroadUnemployment`.

```605:606:src/taxes/federal.ts
  const exempt = (rules.incomeTax.exemptPretax ?? []) as PretaxCategory[];
  const compensation = ctx.taxableWagesFor(exempt);
```

The same pattern is at lines 572–573 for RUIA. `incomeTax.exemptPretax` in `data/federal/2026.json` includes `deferral_401k`, `deferral_403b`, `deferral_457`, and `deferral_simple`. Tier I does **not**: it reuses `socialSecurity()` / `medicare()`, whose exempt list stops at cafeteria, HSA, FSA, dependent care, and commuter.

RRTA compensation tracks FICA wages for elective deferrals (they stay in the base). A rail employee with $1,800 of pay and a $400 401(k) deferral is taxed Tier I on $1,800 and Tier II on $1,400. At the 4.9% employee Tier II rate that is $68.60 instead of $88.20. RUIA uses the same reduced compensation, so the employer contribution is low as well. The monthly RUIA cap and the $137,100 Tier II cap are then applied to the wrong wage.

**Fix direction:** pass `rules.socialSecurity.exemptPretax` (or an explicit RRTA list) into both functions.

#### 2. Reciprocity swap and residence withholding keep only `*_SIT` and drop Indiana county tax (and any other line `incomeTaxLines` emits)

`src/taxes/state.ts`, `reciprocitySwapWithholdingLine` (about 450–453), `residenceStateWithholdingLine` (518–520), `residentWorkingElsewhereCreditLine` (583–585).

Each helper runs `incomeTaxLines()` on a virtual input whose work state is the residence state, then sums only lines whose id is `` `${residence.code}_SIT` ``.

Indiana’s method `flatRateMultiExemption` returns both `IN_SIT` and `IN_COUNTY` (`countyAddOnLine`, lines 1865 and 1908). Pennsylvania’s reciprocity list includes Indiana, and `PA-2026.json` sets `reciprocity.swapWithholdsResidenceState: true`. An Indiana resident working in Pennsylvania therefore gets `IN_SIT_RECIPROCITY_SWAP` and **no** county line, even when `certificate.county` is set on the residence certificate. County LIT is part of the same Indiana withholding computation (Departmental Notice #1), not an optional local add-on the swap was written to ignore.

The inbound direction is handled correctly: when Indiana is the **work** state, reciprocity zeroes `IN_SIT` by id prefix and leaves `IN_COUNTY` (comment at lines 86–97). Only the outbound swap drops the county component.

The same filter also drops any other non-`_SIT` line that `incomeTaxLines` might return. New York City and Yonkers are worse: `nycLocalTax` / `yonkersLocalTax` are **not** inside `incomeTaxLines` at all (they are appended later in `stateIncomeTax`, lines 242–255) and they read `input.workState.certificate`. A courtesy or nexus withholding election for an NYC resident working outside New York (`residenceStateWithholding`) produces NYS tax only. `NY_NYC_SIT` never appears.

**Fix direction:** when building the swap or residence line, either emit every employee income-tax line from the virtual run (state plus county/city), or call the local add-on functions against the residence ruleset. Do not sum a single id.

#### 3. Oregon Statewide Transit Tax never runs unless the work state is Oregon

`stateExciseEmployeeTax` (lines 6360–6380) is only invoked from `stateIncomeTax` for `input.workState`’s ruleset (lines 300–306). The function comment and `data/states/OR-2026.json` (`stateExciseEmployee`, rate `0.001`) both describe the statutory base: wages of **Oregon residents wherever the work is performed**, and wages of nonresidents for services **in** Oregon.

An Oregon resident with `workState: { code: 'WA' }` (or any non-OR code) gets no `OR_STT` line. Nonresidents working in Oregon are handled, because the work state is OR. Residence-state withholding does not repair this: that path calls `incomeTaxLines`, which never calls `stateExciseEmployeeTax`.

**Fix direction:** if `residenceState.code === 'OR'` and the work state is not OR, still emit `OR_STT` on the Oregon wage base (subject to whatever nexus rule you decide the caller must assert).

#### 4. Geocoder ignores Alabama municipality aliases, so Hackleburg resolves to no occupational tax

`geocode/resolve.ts`, `matchALMunicipalityByName` (lines 224–237) matches `c.name` only.

`alMunicipalityRuleset()` in `src/registry.ts` (lines 460–463) also matches `aliases`. `data/local/AL-municipalities-2026.json` keeps the source spelling `"Hacklebug"` as the canonical name and puts the real town on `"aliases": ["Hackleburg"]` at rate 1%. Census and any normal address say Hackleburg. The geocoder returns `no_match`, `toCertificateFields` never sets `workCity`, and `alabamaLocalTax()` does not run. A direct `workCity: 'Hackleburg'` through the registry still taxes at 1%.

**Fix direction:** use the same alias check as `alMunicipalityRuleset`, or resolve through that function.

#### 5. `payCalc` writes a Pennsylvania residence PSD onto the wrong certificate field

`api/ste-compat.ts` catalog builder, lines 220–221: every PA jurisdiction is registered as `field: 'workPSD', role: 'either'`.

`resolveIds` for `liveUniqueTaxIds` therefore sets `residenceState.certificate.workPSD`. `pennsylvaniaLocalTax` (lines 7925–7944) reads only `input.workState.certificate.workPSD` and `input.workState.certificate.residencePSD`. A residence PSD supplied the way the catalog documents is never seen. Resident vs nonresident EIT then uses a 0% resident rate (the out-of-state / missing-PSD path) and withholds only the work-location nonresident rate.

`geocode/resolve.ts` `toCertificateFields` (lines 519–520) does this correctly (`workPSD` vs `residencePSD` by role). The STE-shaped adapter does not.

**Fix direction:** catalog entries need a residence field (`residencePSD`) when `role === 'residence'`, or `payCalc` should map a live PSD id onto `residencePSD` instead of reusing `workPSD`.

#### 6. Child-support CCPA ceiling defaults to 60% when `supportingOtherFamily` is omitted

`src/garnishment.ts`, `calculateGarnishments`, lines 601–608:

```601:608:src/garnishment.ts
  if (supportOrders.length > 0) {
    const supportingOtherFamily = supportOrders.some((o) => o.supportingOtherFamily);
    const inArrears = supportOrders.some((o) => o.arrearsOver12Weeks);
    let fraction = supportingOtherFamily
      ? fed.supportOrder.supportingOtherFamilyFraction
      : fed.supportOrder.notSupportingOtherFamilyFraction;
```

Omitted flag → `false` → `notSupportingOtherFamilyFraction` (0.50 in the data is the **supporting** case; the not-supporting fraction is 0.60). `data/garnishment/federal-2026.json` says the opposite of the code: “This engine does NOT assume a default for supportingOtherFamily — the caller states it.” The implementation does assume one, and it is the higher cap (60%, or 65% with the arrears add-on). That is the direction that over-withholds relative to 15 U.S.C. 1673(b) when the employee does support another spouse or child.

**Fix direction:** require an explicit boolean on every support order and refuse to compute when it is missing. Do not treat absence as “not supporting.”

#### 7. Optional whole-dollar rounding is applied to FICA and every other line

`src/calculate.ts`, lines 59–61, maps `toWholeDollars` over **all** tax lines when `roundToWholeDollars` is set.

`docs/rounding-and-precision.md` rule 7 (lines 81–86) says this option is for withheld **income** tax and “never applied to FICA.” Social Security on a wage that is not a multiple of a dollar (for example $2,412.50 × 6.2% = $149.575 → $149.58) becomes $150.00. Medicare, Additional Medicare, SUTA, and local taxes move the same way. Form 941 wage and tax totals will not tie to the pennies the rest of the engine computed.

**Fix direction:** restrict the flag to income-tax line ids (`US_FIT`, `US_FIT_SUPP`, and `*_SIT` / explicit income-tax locals), or document and implement a per-line opt-in.

#### 8. Florida minimum wage steps to $15.00 on 2026-09-30, and nothing in the engine reads that step

`data/minimum-wage/states/FL-2026.json`:

- `standard.hourly` is `14.0` with `effectiveFrom: "2025-09-30"` and **no** `effectiveTo`.
- `tipped.cashWage` is `10.98`.
- `scheduledChanges[0]` is `{ hourly: 15.0, tippedCashWage: 11.98, effectiveDate: "2026-09-30" }`.
- The file’s own note says the $14.00 figure “is correct today and wrong from 2026-09-30.”

`src/minimum-wage.ts` never references `scheduledChanges` (repo-wide search under `src/` is empty). `historicalPredecessor` only looks at `variants[].historicalPredecessorOf`. Florida’s `variants` array is empty, so a check date of `2026-09-30` or later still returns $14.00 / $10.98 tipped. Audit date is 2026-09-25, so this is wrong on the next payroll week.

**Fix direction:** either encode the $15 / $11.98 figures as a dated variant the existing `dateInRange` path already understands, and put `effectiveTo: "2026-09-29"` on the $14 headline, or teach `minimumWage()` to apply `scheduledChanges` when `checkDate >= effectiveDate`.

#### 9. Employer SUTA (and employee UC) reuse the state’s income-tax pretax list

`stateUnemploymentEmployerTax` (lines 1579–1580) and `stateUnemploymentEmployeeTax` (lines 1615–1616) both call `ctx.taxableWagesFor(rules.exemptPretax)`.

The comment at lines 1530–1537 already says elective deferrals are frequently **in** the unemployment wage base and **out** of income tax, and that the code does not have a verified per-state answer. The implementation still excludes whatever the income-tax list excludes. For a typical state that copies the federal income-tax exempt list, a 401(k) deferral reduces SUTA wages. FUTA in `federal.ts` does not do that (`futa.exemptPretax` omits the deferral categories). Pennsylvania is a special case that is accidentally right: `PA-2026.json` `exemptPretax` deliberately omits deferrals because Pennsylvania taxes them, and the UC test expects that.

**Fix direction:** give `suiEmployer` its own `exemptPretax`, defaulting to the FUTA-style list, and override only where the state statute excludes deferrals.

#### 10. API success path accrues a local per-call balance and a Stripe meter event for the same call

`examples/api-server.ts` lines 221–224 (and the same pair at 260–261). A successful calculate does both:

- `recordUsage(...)`, which adds `pricePerCallCents` (default 15¢ in `api/keys.ts` `PLAN_PRICING_CENTS`) to `balanceDueCents`.
- `reportCall(key.id)`, which sends Stripe meter value `1` when metering is configured (`api/billing.ts` lines 156–165).

`chargeOutstanding()` can then collect the ledger balance while the subscription invoice collects the meter. The batch route (lines 314–316) is inconsistent in the other direction as well: `recordUsage` runs per result, but `reportCall` runs **once** for the whole batch if any row succeeded.

`site/lib/pricing.ts` describes a different price (graduated about $0.12 down to $0.04 per call). `docs/GO-LIVE.md` follows the site tiers. The demo API bills a flat $0.15. Those are three commercial models for one endpoint.

**Fix direction:** pick ledger **or** meter per key, and meter one unit per successful calculation in a batch. Align the published tier with `pricePerCallCents`.

### Medium

#### 11. Household FUTA coverage ignores this check’s cash wages

`categoryCoverage` in `src/taxes/federal.ts` lines 479–502. FICA coverage is `(ytd.categoryCashWages ?? 0) + cashThisCheque` compared with $3,000. FUTA coverage is only `input.employer.householdQuarterlyCashWages >= $1,000`. The type comment (`src/types.ts` lines 441–446) calls that field “cash wages paid … in the current calendar quarter” and does not say whether the check being calculated is included. A caller who stores quarter-to-date **before** this check (the same convention `categoryCashWages` uses) will show $0 FUTA on the paycheck that crosses $1,000.

#### 12. `federalSupplementalTax` treats any truthy `exempt` as exempt

`src/taxes/federal.ts` line 203: `if (input.federalW4.exempt)`. `federalIncomeTax` uses `resolveCertBoolean` (line 102), which throws on a string `"false"`. The supplemental function does not. `calculatePaycheck` calls FIT first, so a bad string currently throws before a result is returned. A direct call to `federalSupplementalTax`, or any future reorder, would treat `"false"` as exempt and withhold $0 on the bonus.

#### 13. Symmetry-shaped catalog has no South Clackamas transit district, Metro, or Multnomah flags

`NAMED_LOCALITIES` in `api/ste-compat.ts` (lines 143–147) lists TriMet, LTD, Canby, Sandy, and SMART. `geocode/districts.ts` maps South Clackamas to locality `'SCTD'`, which `state.ts` expects. There is no catalog id for `certificate.metroDistrict` or `certificate.multnomahCounty`. An integrator that only sends `uniqueTaxId`s cannot turn those taxes on. Geocode-native input can.

#### 14. New York garnishment floor uses the upstate $16 minimum wage for the whole state

`data/garnishment/state-overrides-2026.json`, `NY.ordinaryGarnishment.stateMinimumHourlyWage` = `16.00`. The same entry’s `$note` says NYC, Long Island, and Westchester are $17.00 in 2026, and that the engine has no region on `workState`. The 30× floor is therefore too low downstate, and the engine can withhold a garnishment that the $17 floor would still fully protect. Disclosed in the file; still wrong for those employees. The garnishment module does not consult `src/minimum-wage.ts`, so fixing the minimum-wage data alone does not fix this.

#### 15. District of Columbia garnishment uses $18.40 for the whole year, and the note has the direction backwards

`DC.ordinaryGarnishment.stateMinimumHourlyWage` is `18.40` with no effective date. The minimum wage was $17.95 through 2026-06-30 (`data/minimum-wage/states/DC-2026.json` variant `pre_2026_06_30`). For a check **before** 2026-07-01 the $18.40 floor is **higher** than the law, so the engine withholds **less** than the H1 cap allowed (debtor over-protected, creditor short). The `$note` says a pre-July check “would understate the true floor,” which is the opposite of using the later, higher wage. After 2026-07-01 the $18.40 figure matches the current minimum wage. Lower urgency on the audit date; the note should still be corrected so the next July step is not copied the wrong way.

### Low

#### 16. Railroad FUTA detail still says RUIA is not modelled

`applyEmploymentCategory`, railroad branch, lines 661–662. The zeroed `US_FUTA` detail says unemployment contributions under RUIA are “at an experience-rated rate this engine does not model.” `railroadUnemployment()` (lines 563–594) does emit `US_RUIA_ER` on the same paycheck. Amounts can be right; the FUTA explanation is not.

#### 17. Oregon no-W-4 default rate is hardcoded at 8%

`oregonWithholding`, lines 6258–6267, uses `applyRate(periodWages, 0.08)` when `workState.certificate` is missing. `OR-2026.json` stores the same 8% on the no-certificate default and on `supplementalWages.flatRate`. A JSON update will not move this branch. Behavior matches 2026 data today.

#### 18. Stale narrative that contradicts newer data in the same repo

These do not change a computed rate by themselves. They will send the next editor looking for missing files that exist.

| Location | What it still says | What the data actually is |
| --- | --- | --- |
| `data/states/OH-2026.json` `schoolDistrictIncomeTax.knownGap` | “The 2 districts absent from the 214-row source file remain unaccounted for” | `perDistrictData` and `knownGaps` in the same file say 214/214 are in `data/local/OH-school-districts-2026.json` |
| `data/sources/us-registry.json` `localAggregators` `pa-dced-act32` and `oh-finder` | “rates NOT yet imported” (verifiedOn 2026-08-11) | PA file has 2,627 PSD rows; Ohio municipalities, school districts, and JEDDs are populated |
| `data/sources/us-registry.json` `states[AL].sourceDoc` | local occupational taxes “documented structurally, not built”; 31-day rule “not modelled” | `alabamaLocalTax()` and `nonresidentDayCountReason()` are wired; `AL-2026.json` `exemptWhenDaysWorkedAtMost` is 30 |
| `data/federal/2026.json` `knownGaps` first bullet | long text that NRA withholding and several employment categories are “not modelled,” then later sentences that retract it | `federalW4.nonresidentAlien`, clergy, household, agricultural, election workers, and RRTA are implemented. The bullet is a changelog, not a gap list |
| `src/taxes/state.ts` `pennsylvaniaLST` doc comment, lines 8396–8398 | still describes picking one LST low-income threshold and exempting the whole fee | the function body (8444–8465) tests municipal and school portions separately. The earlier “BUG FIXED” comment is the one that matches the code |

#### 19. New York annual withholding “base” amounts miss a pure chain by $2.00–$2.61

Internal check of `data/states/NY-2026.json` `brackets.single.annual` and `brackets.married.annual`: four rows differ from `prior.base + (prior.to - prior.from) * prior.rate` by more than $1.

| Path | Stored `base` | Chained expectation | Delta |
| --- | --- | --- | --- |
| `brackets.single.annual[7]` | 9673 | 9671.00 | +2.00 |
| `brackets.single.annual[9]` | 19091 | 19089.00 | +2.00 |
| `brackets.married.annual[7]` | 9388 | 9390.00 | −2.00 |
| `brackets.married.annual[8]` | 13708 | 13705.39 | +2.61 |

Per-period tables were not all chained (many use a different shape). This is small enough to be official table rounding rather than a shifted column. It is listed because every other progressive schedule that was chained, including all six federal 2026 worksheets, tied out in cents. Confirm against NYS-50-T before “correcting” the JSON.

#### 20. `roundDownToCent` does not reject NaN

`src/money.ts` lines 125–127. `roundHalfUp` and `atLeastZero` call `assertFiniteMoney`. `roundDownToCent` is `Math.floor(raw)` only. Pennsylvania LST uses it. A NaN wage becomes `NaN` on `PA_LST.amount` instead of the explicit error those other helpers throw. `toWholeDollars` (line 112) has the same hole.

### Notes (checked, not filed as defects)

- **Federal 2026 brackets** in `data/federal/2026.json`: every standard and Step-2 (multiple jobs) row ties in cents (`base` equals prior cumulative tax). `step1StandardAdjustment` plus the 0% band width is 16100 / 32200 / 24150 for single / married joint / head of household, matching the file’s own standard-deduction comment. Dollar amounts were **not** re-read from the 2026 Pub 15-T PDF in this pass.
- **OASDI wage base $184,500**, Medicare 1.45% plus 0.9% over $200,000, FUTA 0.6% on $7,000, elective deferral limits $24,500 / $24,500 / $17,000: internally consistent with the comments in `data/federal/2026.json`. Not re-fetched from SSA/IRS on this date.
- **FUTA credit-reduction map** is empty for 2026, with `determinationDate: "2026-11-10"`. That is correct until DOL publishes the list. 2025 CA 1.2% and VI 4.5% are stored under `priorYear` and are not applied.
- **Supplemental pretax spillover** onto the federal bonus (`federalSupplementalTax` caps at `min(fullBase, supplementalCash)`) matches the regular-wage side. Not re-opened.
- **State method dispatch:** every `method` value in `data/states/*-2026.json` has a `case` in `incomeTaxLinesByMethod`. Unknown methods throw. A missing state ruleset returns an explicit `NOT MODELLED` line rather than a silent $0.
- **PA PSD registry:** 2,627 codes, all 6-digit; duplicate PSD rows that exist (border municipalities) do not carry conflicting rates; `totalResidentEIT` equals resident municipal plus school EIT on the rows checked. Philadelphia PSD `510101` is 3.735% / 3.425% with `effective` 2026-07-01 in the file.
- **Ohio:** 214 school-district numbers, all 4-digit; 679 municipalities keyed by `municode`; mid-year withholding table switches on `checkDate < midYearEffectiveDating.thresholdDate` (`2026-08-01`) in `ohioWithholding`.
- **Indiana counties:** codes 1–92 contiguous in `data/local/IN-counties-2026.json`.
- **Headline 2026 rates read from state files** (not re-proven against booklets here): CA SDI 1.3%; PA flat 3.07%; IL 4.95%; IN state 2.95%; KY 3.5%; MI 4.25%; CO 4.40%; NC withholding 4.09%; MA 5% plus 4% surtax over $1,107,750; OH withholding tables 1.775/2.99/3.64% before 2026-08-01 and 1.6/2.99/3.4% on and after that date; GA 5.19% then 4.99% from 2026-05-11; WA PFML employee factor about 0.807% of the SS wage base.
- **Minimum-wage `scheduledChanges` other than Florida** are 2027 or later (AK, HI, MI, NE, RI, and the local files sampled). They are dormant on this audit date. The engine still will not apply them when those dates arrive, for the same reason as finding 8.
- **Edge bundle:** `scripts/build-edge-function.ts` copies `src/` into the Supabase function. A deploy that skips `edge:build` after a data or code change will serve a stale copy. Not a logic bug in the current tree, because the copy matches.

---

## Open questions / could not verify

1. **Publication 15-T (2026) PDF.** Federal bracket breakpoints, the $8,600 / $12,900 Step 1g adjustments, and Table 2 nonresident-alien add-ons were not re-fetched. Internal chain checks passed. The daily NRA add-on (`61.9 × 260 = 16,094`) does not annualize to the `annual` figure of `16,100` (about $6/year). Weekly and biweekly land on `16,099.20`. That may be the published rounded table, or it may be drift. Needs the PDF.
2. **RRTA compensation regulation.** Finding 1 assumes Tier II and RUIA compensation follow FICA on elective deferrals (included) and cafeteria plans (excluded). The RRB 2026 tax release was not re-read in this pass. If RRB excludes a category that FICA includes, the recommended exempt list would be wrong in that direction.
3. **Pennsylvania REV-419 vs Indiana county LIT.** Finding 2 treats county tax as part of “the other state’s tax” the PA employer must withhold. Indiana’s own withholding booklet computes them together. REV-419’s certificate text was not re-fetched here to see whether it says “Indiana state tax” only. If PA DOR expects state tax only, the missing `IN_COUNTY` line is a product gap rather than a REV-419 violation — it is still missing Indiana tax the employee owes.
4. **Oregon STT and out-of-state employers.** The statute covers Oregon residents regardless of worksite. Whether a given employer has an Oregon withholding account is a nexus fact this engine does not store. Finding 3 is that the engine **cannot** emit the line when work state is not OR, including for an Oregon employer paying an Oregon resident for work performed elsewhere.
5. **SUTA wage definitions, state by state.** Finding 9 is the common case (deferrals in the UI base). A minority of states exclude some cafeteria or retirement amounts. Per-state statutes were not re-read; the code has one list per state and it is the income-tax list.
6. **`householdQuarterlyCashWages` contract.** Types do not say “excluding this check” or “including this check.” Finding 11 is the inconsistency with the FICA threshold, which explicitly adds the current check.
7. **NYS-50-T annual table rounding** for the $2-class deltas in finding 19.
8. **Garnishment statutes** (Minnesota cliffs, Nebraska head-of-family 15%, state minimum-wage floors other than NY and DC) were read as encoded, not re-fetched from the code sites. The federal CCPA fractions in `data/garnishment/federal-2026.json` match the usual 50/55/60/65 and 25% consumer caps.
9. **Local minimum-wage ordinances** under `data/minimum-wage/local/` were not compared city-by-city to current posters. State files were.
10. **PaycheckCity fixtures** in `examples/pcc-results/` were not re-run.
11. **Test suite was not executed.** This was a static audit. A green `npm test` would not clear the path bugs above if no test constructs an Indiana resident working in Pennsylvania, a rail employee with a 401(k), an Oregon resident working in Washington, a Hackleburg geocode, or a Florida check dated 2026-09-30.
12. **`payroll/` and `trades/`** were not reviewed, including any tax logic that might live only there.
