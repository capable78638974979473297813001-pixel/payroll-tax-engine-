# payroll-tax-engine

A gross-to-net US payroll tax engine. Zero runtime dependencies, integer-cents
arithmetic, effective-dated rulesets loaded from JSON — every jurisdiction,
federal through local, computed by the same driver.

```bash
npm test                  # 1200+ tests
npm run demo               # prints a worked paystub
npm run demo:garnishment   # same, layered with a child-support + creditor garnishment
npm run demo:payroll       # a full payroll RUN: two employees, draft -> approve -> paystubs -> a real NACHA ACH file
npm run ui:calculator      # any-state calculator UI, address-based local tax lookup
```

## Status

| Area | State |
|---|---|
| Federal income tax (Pub 15-T Worksheet 1A, 2026) | Complete — all 6 rate schedules |
| Social Security / Medicare / Additional Medicare | Complete, wage-base and threshold aware |
| FUTA | Complete at the standard net rate, plus credit-reduction wired for when DOL publishes its 2026 list (empty as shipped — see Known gaps) |
| State income tax | **51 / 51 jurisdictions** (50 states + DC), 41 distinct `method` cases — one of them (`no_income_tax`) shared by the 9 states with no wage income tax, the other 40 each a real published formula shape |
| State unemployment (employer) | 51 / 51 — 44 with a computable new-employer rate, 7 industry-assigned (`employerSuppliedRateRequired`); Kansas further branches its own new-employer rate by industry (`EmployerContext.suiIndustry`) rather than requiring one |
| State UC/SDI/PFML/LTC (employee-paid) | 14 states + DC, wherever the state actually levies one |
| Local income tax | Every state known to levy one, at the depth each state's own public data allows: OH (~600 municipalities + school districts + JEDD/JEDZ), PA (~2,600 Act 32 EIT/LST jurisdictions), MI (24 cities — the full statewide list), KY (227 occupational districts), IN (92/92 counties), AL (25/25 municipalities), MD (24 counties + Baltimore City, wired into the state ruleset), NYC + Yonkers, Kansas City/St. Louis earnings tax, Newark payroll tax, Portland Metro/Multnomah + TriMet/LTD transit excise, Denver-cluster Colorado OPT, Wilmington wage tax, Seattle's JumpStart payroll tax, WV municipal service fees (10 cities — see below, the one state with no central registry to bulk-load from) |
| Reciprocity / multi-state | Wired generically off each state's own `reciprocalStates` (`input.residenceState` vs. `input.workState`) — 16 states carry a real agreement (AZ, IA, IL, IN, KY, MD, MI, MN, MT, ND, NJ, OH, PA, VA, WI, WV), every other state's file explicitly says none exists rather than leaving the question open, plus DC's blanket nonresident-commuter exemption. Two conditional variants layer on top of the plain "resides there" test: `commuterOnlyStates` (Kentucky/Virginia's daily-commute gate) and `creditEligibilityRequiredStates` (Arizona's Form-WEC credit-eligibility gate) — both default to NO exemption absent an explicit `certificate` assertion, never a silently-granted one |
| Garnishments (court-ordered / administrative) | CCPA federal ceilings for ordinary consumer/creditor judgment, child support/alimony (50/55/60/65%), and federal student loan default (34 CFR 34.19) — multiple simultaneous orders share one aggregate ceiling, never stacked. **All 51 jurisdictions researched** — 32 states carry a modelled departure across 7 distinct formula shapes (flat-fraction + minimum-wage floor, a flat-dollar legislated floor, per-dependent reduction, cliff-bracket tiers on minimum-wage multiples or a fixed gross-weekly dollar line, marginal brackets, a poverty-guideline income tier, and Iowa's own cumulative-annual-dollar cap — the only shape spanning multiple paychecks); 10 states (Georgia, Alabama, Louisiana, Michigan, Montana, Ohio, Oklahoma, Rhode Island, Utah, Wyoming) confirmed to have no departure at all; Arkansas/Mississippi/New Hampshire carry a disclosed structural nuance (a narrow occupational carve-out, a service-date grace period, and a trustee-process mismatch respectively) rather than a full formula. Federal tax levies are out of scope (IRS Pub 1494's own table, not a fixed CCPA fraction) — see `src/garnishment.ts` and `data/garnishment/state-overrides-2026.json` |
| Address → jurisdiction | Five-tier geocoding pipeline that PREFERS rooftop precision and refuses to guess when it can't get there (see below) — a live run lands 36/51 on an authoritative rooftop point, not all 51, plus a gated county-parcel fallback (1 state, so far) for where the free federal registry has nothing at all; measured every run, not assumed, and the split moves day to day |
| Staying current | Automated daily harvester watching 105 registered sources, human review gate before anything reaches `data/` |

Run `npm run coverage:taxes` for the live, generated version of the table
above — one worked paycheck through all 51 jurisdictions, printed fresh, not
transcribed here.

Every rate lives in `data/` with a source URL and a `verifiedOn` date. No rate
is hardcoded in a `.ts` file, and there is no fallback default — a missing
ruleset throws rather than quietly returning zero, and a state with no single
new-employer UI rate (industry-assigned) requires the caller to supply one
rather than silently computing with a wrong number.

## Payroll processing (`payroll/`)

The tax engine (`src/`) is deliberately a stateless per-cheque function — no
employee records, no memory of the last paycheck. `payroll/` is the layer a
real payroll company runs on top of it: company/employee records, a pay
schedule (`payroll/schedule.ts`), running an actual pay cycle from draft
through approval (`payroll/run.ts`), rolling each approved run into every
employee's running YTD so the engine's own wage-base caps see it on the next
one (`payroll/ytd.ts`), splitting net pay across direct deposit accounts and
writing a real NACHA ACH file (`payroll/directDeposit.ts`), and rendering a
paystub (`payroll/paystub.ts`). `npm run demo:payroll` runs the whole
lifecycle for two employees — one salaried, one hourly with overtime and a
child-support order — end to end, paystubs and ACH file included.

Persistence follows the same convention `site/lib/store.ts` already
established for the API-key product: a file-backed store
(`payroll/store.ts`) that mirrors a canonical, normalized schema
(`db/payroll-schema.sql`) closely enough that swapping in real queries later
is mechanical, because this project's Supabase instance isn't linked to a
live URL from this environment.

Two YTD trackers are explicitly NOT derived generically, and `payroll/ytd.ts`
own header comment says so rather than force-fitting them: Seattle's
per-employee payroll-expense compensation band (the tax line itself only
reports the portion already above threshold, not the full period
compensation a running total needs) and Kentucky's two-city SS-wage-base
credit (Walton/Florence combine into one `KY_LOCAL` tax line with no way to
recover each city's own half from the output). Both need the caller to track
that one figure directly — the same "caller-supplied, never guessed"
discipline `src/types.ts`'s own `EmployerContext` uses throughout the tax
engine itself. Everything else — every wage-base cap, every state-keyed
UC/PFML/SDI/LTC tracker, the Additional Medicare threshold, RUIA's monthly
reset — accumulates correctly across runs, proven in `tests/payroll.test.ts`
by literally crossing the 2026 Social Security wage base and the Additional
Medicare threshold across two periods and checking the exact cent figure
that lands.

What `payroll/` does NOT attempt, named plainly rather than left to be
discovered: quarterly/annual tax FILING (941/940, state UI returns, W-2/1099
generation), benefits carrier EDI, time-and-attendance beyond a plain
hours-per-period input, a live bank-linking integration (see
`payroll/directDeposit.ts`'s own header note on the account-number custody
boundary a real system draws that this one doesn't attempt to build), and
any UI beyond the plain-text paystub and the worked demo script. Each is a
real, separate subsystem a full HCM platform builds — not a corner cut here.

## The one idea that matters

Naive payroll code computes a single `taxableWages` number and multiplies it
by each rate. That is wrong, and it is wrong on a large fraction of real
paychecks.

**Every tax has its own taxable base.** The same $240 of 401(k) deferral:

- reduces federal income tax wages
- does **not** reduce Social Security or Medicare wages
- does **not** reduce Pennsylvania wages (PA taxes deferrals when earned)

So one paycheck legitimately produces three different bases:

```
Federal Income Tax     base $2,665
Social Security        base $2,905
Pennsylvania            base $2,905
```

Each tax declares its exemptions as data (`exemptPretax` in its ruleset), and
`makeTaxableWagesFn` resolves the base per tax. Adding a jurisdiction with an
unusual rule is a data change, not a code change — the same mechanism that
made adding state 51 no different in kind from adding state 2.

A pretax deduction only gets to be pretax up to a real dollar ceiling,
though, and that ceiling is IRC law, not this engine's own convention:
`capElectiveDeferrals()` (`src/wages.ts`) checks every 401(k)/403(b)/457/
SIMPLE deduction against its 2026 annual limit — $24,500 combined for
401(k)+403(b) (one shared IRC 402(g) limit), $24,500 separately for a
457(b) (a genuinely independent limit, not aggregated with the other two —
an employee with both can legally defer up to both in the same year), and
$17,000 separately for a SIMPLE plan — before `makeTaxableWagesFn` ever
sees the deduction list. Anything over the applicable limit stops being
pretax: net pay is unaffected (the same money still leaves the paycheck),
but the excess becomes taxable the same way any other post-tax deduction
would be. This was a real, previously-undisclosed gap until a manual
verification pass (2026-09-06) found it: before this, a caller could
supply a 401(k) deduction of any size — $40,000 in one check, say — and
every dollar of it was excluded from federal/state/local taxable wages
with no ceiling at all. Deliberately NOT modelled: catch-up contributions
for employees 50+ (this engine has no age/birthdate input anywhere, and
guessing eligibility risks *under*-capping — the wrong direction for a tax
engine to guess in), and contributions at a different employer earlier in
the same calendar year (the YTD figures here only ever reflect what
*this* employer has paid — see `data/federal/2026.json`'s own
`knownGaps`).

## Architecture

```
data/federal/2026.json         rates + brackets + sources
data/states/XX-2026.json       one file per state per year, all 51
data/local/*.json              8 bulk local registers (OH x3, PA, MI, KY, IN, AL)

src/money.ts                   integer cents; wage caps; half-up rounding
src/wages.ts                   per-tax taxable base resolution
src/registry.ts                effective-dated ruleset loading
src/types.ts                   PaycheckInput / PaycheckResult / TaxLine
src/taxes/federal.ts           Worksheet 1A, FICA, FUTA
src/taxes/state.ts             method dispatch, local taxes, SUI, SDI/PFML,
                                reciprocity — ~8,800 lines, one function per
                                jurisdiction's actual published mechanism
src/calculate.ts               driver — knows nothing about specific taxes
src/garnishment.ts             court-ordered / administrative wage garnishment —
                                runs AFTER calculatePaycheck(), CCPA ceilings +
                                researched state overrides for ordinary garnishment
src/alabama/                   a fully-worked reference module (input
                                normalization, output shaping, scenario
                                fixtures) kept as the pattern other states'
                                integration code follows

geocode/census.ts              Census TIGERweb interpolation + boundary lookup
geocode/rooftop.ts             National Address Database rooftop precision
geocode/nominatim.ts           OpenStreetMap corroboration (never trusted alone)
geocode/buildings.ts           traced building-footprint cross-check
geocode/districts.ts           districts Census doesn't publish (Ohio JEDD/JEDZ,
                                Portland Metro) resolved against their own source
geocode/resolve.ts             ties every tier together into one call

harvester/sources.json         105 authoritative registers to monitor
harvester/snapshot.ts          content-addressed immutable captures
harvester/diff.ts              change detection + severity + parser guard
harvester/harvest.ts           decisions and the review queue
harvester/run.ts               the daily sweep (also runs as a GitHub Action)

supabase/functions/            an Edge Function wrapping calculatePaycheck()
                                for anyone who wants this as a hosted API
```

The ruleset is selected by **check date**, never by the clock, so a
correction run in March for a December check uses December's rules.

## Local taxes and address → jurisdiction

Local tax selection is a geospatial lookup, not a ZIP lookup — ZIP codes
cross municipal boundaries, and getting this wrong is a silent, systematic
error. `geocode/resolve.ts` runs an address through five tiers, each of which
**refuses rather than guesses**:

| Tier | What it means | Source |
| --- | --- | --- |
| `rooftop` | A point published for this exact address by the government that assigns addresses. | National Address Database (US DOT), ~98M points |
| `rooftop-osm` | OpenStreetMap holds a house-level point AND it agrees with Census's own position. | Nominatim, corroborated against Census, never trusted alone |
| `neighbor` | Interpolated between the two nearest *published* points on the same street. Block-level. | National Address Database |
| `parcel-centroid` | A COUNTY's own tax-parcel polygon matched this address and its area passed a "single building" gate — used in place of `rooftop-osm` only when it lands measurably closer. | An individually-verified county GIS service — see `geocode/parcel.ts` |
| `interpolated` | Census's own TIGER/Line address-range position, at the curb. | Census geocoder |

Measured, not assumed — `npm run coverage:geocode` resolves one real address
per jurisdiction through this exact pipeline and reports which tier answered.
A run just now: **36/51 land on authoritative rooftop points, 12/51 on
OSM-corroborated house-level points, 2/51 on a between-published-points
`neighbor` estimate, 1/51 on a county parcel centroid (Pennsylvania, 68m —
see Known gaps for the story and the failure mode it took two tries to
close), and 0/51 fall back to Census's own interpolation** — North Dakota,
the last holdout, turned out to have a real published point after all, just
444m from Census's interpolated position and outside the pipeline's normal
search radius (see `docs/geocoding-coverage.md`'s own writeup of that fix).
These counts are a live measurement, not a fixed claim — they move day to
day as OSM/NAD coverage changes underneath the pipeline, so re-run the
command above rather than trusting a number written down here; see that same
doc's "these numbers still move" section. Building footprints add a third,
independent cross-check where OSM has traced the structure.

Once a coordinate is resolved, jurisdictions not published by Census — Ohio's
JEDD/JEDZ districts, Portland's Metro Supportive Housing boundary — are
looked up against their own government's boundary service, joined on the
government's own ID, never on a name match.

## Resident vs. nonresident: which input actually controls it

There is no single `isResident: boolean` field, because US employers don't
have one rule to represent — real statutes decide residency five genuinely
different ways, and treating them as interchangeable is exactly the kind of
mistake that produces a confidently-wrong paycheck. Every mechanism below
defaults to the LESS generous outcome when its input is missing (full tax,
never a silent exemption) — the same convention this whole engine uses for
every other optional certificate field.

| Mechanism | Set this | What it decides |
| --- | --- | --- |
| Cross-state reciprocity | `input.residenceState` (a full `{ code, certificate }`, separate from `input.workState`) | Whether the WORK state's income tax applies at all to a resident of a different, agreeing state — see `rules.reciprocity.reciprocalStates` per state. Two states need an extra assertion on `residenceState.certificate` beyond bare residence: Kentucky/Virginia's daily-commute condition (`dailyCommuter: true`) and Arizona's Form-WEC credit-eligibility condition for CA/IN/OR/VA residents (`nonresidentCreditEligible: true`) — both absent-means-no-exemption. |
| Maryland's local tax | `workState.certificate.nonresident: true/false` | Switches between the employee's COUNTY rate (resident) and a flat 2.25% "Special Nonresident Rate" that replaces it entirely. |
| DC | `workState.certificate.nonresident: true/false` | `true` zeroes DC income tax completely — the Home Rule Act bars DC from taxing nonresident commuters at all, not a rate difference. |
| Kentucky local (Louisville Metro, Lexington-Fayette, Lyndon, Middletown, Lynnview) | `workState.certificate.residenceCity` (compared by name against the work jurisdiction) | Whether that ONE jurisdiction's resident or nonresident rate applies — no separate boolean; the engine derives it by matching city names. |
| Michigan's 24 taxing cities | `workState.certificate.residenceCity` AND `workState.certificate.workCity` | NOT an either/or: a resident of one taxing city who works in a DIFFERENT taxing city owes BOTH cities' tax (resident rate at home, nonresident rate at work) — same city on both sides taxes once, at the resident rate. |
| Pennsylvania's ~2,600 Act 32 EIT jurisdictions | `workState.certificate.residencePSD` AND `workState.certificate.workPSD` | The engine computes BOTH sides' combined municipal+school rate and withholds the HIGHER one — real PA law, not a simplification. |
| NYC | `workState.certificate.nycResident: true/false` | Whether the NYC resident tax layers on top of NYS tax at all (NYC does not tax nonresidents — no rate for them exists to switch to). |
| Yonkers | `workState.certificate.yonkersResident` / `yonkersNonresidentWorker` (two independent booleans) | Resident surcharge (16.75% of the NYS-style base tax) vs. a structurally different flat nonresident-earnings tax. Both `true` at once resolves to resident (a real caller can't actually produce this — Form IT-2104 has one residency checkbox — but the engine picks a defined answer rather than an undefined one). |

Every boolean above is validated strictly: `true`/`false`/absent are the only
accepted values, and anything else — including the string `"false"`, which
is truthy in JavaScript — throws rather than being silently misread. That
guard (`resolveCertBoolean()` in `src/taxes/state.ts`) closed a real gap
found auditing this table: Yonkers' two flags were read as bare `if`
checks until this pass, the one place in this cluster that didn't already
have it.

## Minimum wage

A minimum wage is not a tax — it is a floor on gross pay, before any withholding
happens — so it lives in its own dataset, `data/minimum-wage/`, with its own loader
(`src/minimum-wage.ts`) and its own test suite. It covers the FLSA floor, all 50
states plus DC, all five territories, **69 city and county ordinances** across ten
states, and California's nine industry-wide rates (fast food, plus seven separately-scheduled
SB 525 health care categories, plus the LA hotel-worker rate).

The whole calculation is one rule, DOL's own: where federal, state and local minimum
wage laws all cover the same hour of work, the employer owes the **highest** of them.
So the levels are stored separately and merged at query time, never pre-flattened:

```ts
minimumWage({ checkDate: '2026-08-15', state: 'WA', locality: 'renton', employeeCount: 200 });
// → 2157 cents. Renton's mid-size tier stepped up on July 1; the same query
//   dated 2026-06-15 correctly returns 2057.
```

The answer always carries the levels that lost, so a caller can see why it is what it
is. Some of what that shape is protecting against, all of it covered by tests:
Albuquerque's standard rate has been overtaken by New Mexico's but its **tipped** rate
still binds at more than double the state's; American Samoa has no single minimum wage
at all but 18 industry rates set by federal law; Florida steps on September 30 and Santa
Fe on March 1; Montana's $4.00 and Oklahoma's $2.00 are live state rates that must never
be mistaken for the standard one; and the federal contractor rate a stale table still
carries ($17.75 under EO 14026) was revoked in 2025.

Two states — New York and Oregon — split their STANDARD rate itself by named geographic
region (NYC/Nassau/Suffolk/Westchester vs. the rest of New York; Portland metro vs.
standard vs. non-urban Oregon), and New York separately splits its TIPPED rate by
occupation within each region. Neither axis is a headcount tier, so it needs its own
query field rather than falling out of `employeeCount`:

```ts
minimumWage({ checkDate: D, state: 'NY', region: 'downstate' }).cents;              // 1700 — not 1600
minimumWage({ checkDate: D, state: 'NY', region: 'upstate', tipped: true }).cents;  // 1070 (food_service, the default)
minimumWage({ checkDate: D, state: 'NY', region: 'upstate', tipped: true, occupation: 'service_employee' }).cents; // 1330
```

The middle case is the one worth noticing: upstate's food-service tipped rate has no
separate `variants` entry at all — it *is* the state's own baseline tipped figure — so a
resolver that only ever looks inside `variants` for an occupation match would silently
return the wrong number (or none) for it. `minimumWage()` falls through to the baseline
correctly instead.

See `data/minimum-wage/README.md` for the full sourcing story, the trap list, and the
known gaps. `npm run coverage:minimum-wage` runs every state, named region and local
ordinance through the resolver and flags anything that looks wrong (a tipped figure
above the standard rate, a region silently matching its neighbor's number) — the same
"measure it, don't assert it" convention as `coverage:taxes` and `coverage:geocode`. It
found the Oregon regional-tipped bug above; it now reports clean.

### Who a rate doesn't apply to at all, and NY's own exempt-salary floor

`states/NY-2026.json` also carries `exemptions` (New York Labor Law 651's full list
excluding executives/administrators/professionals, outside salespeople, farm labor,
government employees and a dozen other categories from the "employee" definition
entirely — prose, not a machine-tested field, the same discipline as every other
coverage question here) and `exemptSalaryThresholds` (the SALARY half of the
executive/administrative exemption: $1,275/week downstate, $1,199.10/week upstate for
2026, well above the federal $684/week floor carried in `federal-2026.json`'s own new
`whiteCollarExemptions`). One entry inside `exemptions` is worth calling out
specifically: **election inspectors and poll workers**, researched at both the federal
and New York level and documented as genuinely unsettled — likely outside both the FLSA
(as a "public agency volunteer" paid a nominal per-diem, 29 CFR 553.106) and New York's
own Article 19 (via its ordinary government-employee exclusion, not an election-specific
carve-out) — rather than asserting a clean exemption a court has never actually ruled on
nationally.

### Employee-count-triggered obligations that are not about wages at all

`data/employer-thresholds/NY-2026.json` is a separate, deliberately out-of-band dataset
answering a different question than anything above: at how many employees does an
entire OTHER law start applying to a New York employer — paid sick leave's 4/99/100
ladder (with a net-income test at the bottom tier that headcount alone can't answer),
the state WARN Act's 50-employee/90-day-notice floor (stricter than federal WARN's
100/60), federal ACA/FMLA/COBRA/Title VII/ADA/ADEA thresholds, and New York's own
mini-COBRA filling exactly the gap federal COBRA's 20-employee floor leaves. None of it
is wired into `calculatePaycheck()` — it changes what OTHER obligations exist, not what
a given paycheck looks like — see that folder's own README for the full scope and its
disclosed gaps.

## Staying current without fetching at calculation time

```bash
npm run demo:harvest
npm run harvest:status
```

The obvious idea is to fetch rates live so you are never stale. It is the
wrong trade, for three reasons:

1. **Reproducibility.** Payroll must be deterministic forever — same check
   date and inputs, same answer, for audits, amended 941s and W-2c
   corrections. If the rate comes off the network at calculation time, last
   March's cheque can never be reproduced, because the source moved
   underneath it.
2. **Availability.** A payroll batch is thousands of cheques. You cannot make
   an HTTP call per cheque, and a municipal web server being down on payday
   cannot be a reason not to run payroll.
3. **Blast radius.** Live fetch means a reformatted page silently becomes
   wrong money, with no human in the loop.

So the network and the arithmetic are separated completely:

```
harvester (daily, GitHub Action) → hash → snapshot → diff → REVIEW GATE → data/ → engine (offline)
```

**Watch registers, not towns.** The single most useful fact about this
problem: you never monitor an individual municipality's website. Ohio's
~600 municipalities are legally required to report into the Department of
Taxation's downloadable rate database; Pennsylvania's ~2,600 Act 32
jurisdictions report into DCED, the only legally recognised source for PSD
codes and EIT rates. That collapses thousands of jurisdictions into **105
registers** (`harvester/sources.json`) — every state's income-tax and UI
source, plus the bulk local aggregators.

The harvester runs daily as a GitHub Action, posts its findings to a single
tracking issue, and retries transient failures before flagging a source as
actually broken:

| Decision | When | Effect |
|---|---|---|
| `unchanged` | hash matches, or bytes moved but no rate did | nothing |
| `needs_review` | real rate movement | queued; **nothing published** |
| `blocked_suspect_parser` | too much of the register moved at once | queued and flagged as a likely broken parse |

Changes are classified by effective date, because `retroactive` is the case
that actually costs money:

```
▲ 1 rate change already in force.
  Chagrin Falls: effective 2026-01-01, 222 days ago.
  Every cheque withheld at 1.75% instead of 2.25% needs a correction run.
```

Nothing auto-publishes. A rate reaches the engine only through a recorded
human decision, and every capture is retained content-addressed so there is a
file — not a memory of a website — behind every historical calculation.

## Adding a state

If it fits an existing method, it is data only. Drop in `data/states/XX-2026.json`:

```json
{
  "code": "XX", "name": "Example", "year": 2026, "method": "flat_rate",
  "sources": [{ "title": "…", "url": "…", "verifiedOn": "2026-08-11" }],
  "flatRate": { "rate": 0.0495, "allowanceAmount": 2775.0 },
  "exemptPretax": ["section125", "hsa", "fsa", "deferral_401k"],
  "suiEmployer": { "wageBase": 9000, "newEmployerRate": 0.027, "experienceRange": { "min": 0.001, "max": 0.07 } }
}
```

The `exemptPretax` list and the `suiEmployer` sourcing are the parts that
need real research per state — the flat rate is the easy half. A state whose
formula doesn't fit an existing shape needs a new `method` case in
`src/taxes/state.ts`; 41 exist already, so a genuinely novel mechanism is
rare at this point, not the common case.

## Running it

- `npm run ui:calculator` — a general, any-state calculator UI backed
  directly by `calculatePaycheck()`, with address-based local tax resolution
  through the geocoding pipeline. No separate tax logic lives in the server.
- `npm run ui:alabama` — the Alabama reference implementation's own UI.
- `npm run edge:build` then deploy `supabase/functions/calculate-paycheck` —
  the same engine as a hosted API (`npm run edge:key` issues an API key).

## Verification

Federal figures were cross-checked two ways before being committed:

1. Every bracket's cumulative `base` was re-derived from the previous row.
   Example, Single: `1,240 + 0.12 × (57,900 − 19,900) = 5,800` ✓
2. The Step-1 adjustment plus the 0% bracket reconciles to the published 2026
   standard deduction: `12,900 + 19,300 = 32,200` (MFJ), `8,600 + 7,500 =
   16,100` (single), `8,600 + 15,550 = 24,150` (HoH) ✓

Test expectations were computed by hand from the worksheet before the code
ran. A golden file regenerated from its own engine proves nothing.

State and local figures carry the same discipline, recorded per-file: a
`sources[]` entry with a URL and `verifiedOn` date, a `confidence` tier
(`primary_source_confirmed`, `cross_source_confirmed`, or lower), and — where
the number came from a live re-check rather than the original research pass
— a `$note` explaining what changed and why, so a wrong number's history is
visible instead of overwritten silently.

## Known gaps

- Four state sites — **KS, MA, NH, NV** — block automated access outright
  (confirmed HTTP 403 on live re-checks, from this project's own sandbox and
  independently from GitHub Actions runs); those states' unemployment
  figures rest on the best cross-source confirmation available rather than a
  direct primary fetch, and are marked `manualOnly` in
  `harvester/sources.json` and cross-source-confirmed in their own
  `data/states/*.json`. This list has turned over since it was last written
  up here — **AZ and AR are not blocked** (both fetch primary PDFs
  successfully; AZ's DES rate chart is `primary_source_confirmed` directly
  off the agency's own PDF) and simply have no dedicated state UI source at
  all, falling back to the DOL's own wage-base report instead (see
  `uiCoverage.backstopOnly` in `harvester/sources.json`); **DC and TX are
  not blocked either** — both have working sources (DC's UI-rates page, and
  TX via the DOL's own Significant Measures report). Re-verifying these four
  states' figures another way (Wayback Machine, alternate URLs, varied
  browser headers — all still blocked) surfaced two new, real findings while
  looking. **Kansas assigns new CONSTRUCTION-industry employers a 5.55%
  new-employer SUI rate versus 1.75% for everyone else** (confirmed via the
  Kansas Legislative Research Department's own published briefing) — this is
  now wired: `EmployerContext.suiIndustry` (keyed by state code) lets a
  caller say which industry classification applies, checked against
  `suiEmployer.industryNewEmployerRates` before falling back to the flat
  rate, so the many non-construction KS callers aren't forced to supply a
  rate they already got correctly by default.
  **New Hampshire's 1.7% new-employer rate is confirmed only for H1 2026** —
  it's actually NHES's statutory 2.7% less a quarterly "Fund Balance
  Reduction" (currently 1.00%, giving 1.7%), and no secondary source has
  surfaced the Q3/Q4 2026 reduction figure yet, so a real mid-year change is
  possible and currently unverifiable (`data/states/NH-2026.json`'s own
  `newEmployerRateSource`). Re-attempted 2026-09-06, now that Q3 2026 is
  actually underway: nhes.nh.gov is still a confirmed 403, and this time the
  Wayback Machine's own CDX index and its closest saved snapshot were tried
  too — also blocked, and no snapshot from June 2026 onward exists to check
  regardless. Still unresolved after two genuinely different routes, not one
  repeated attempt.
- **Not every state resolves at rooftop precision, and that's expected, not a
  bug.** A live re-run just now (`npm run coverage:geocode`) puts 35/51 on an
  authoritative rooftop point, 12/51 on an OSM-corroborated house-level
  point (one tier down), 2/51 on a between-published-points estimate (lower
  still), 1/51 on a county tax-parcel centroid (see below), and 1/51 — North
  Dakota — all the way back to plain Census interpolation: nothing published
  at or below that sample address's own house number to bracket from, a
  real data gap, not a code limitation. These counts have already moved
  within this same project's history — the "these numbers still move"
  section of `docs/geocoding-coverage.md` explains why (OSM/NAD coverage
  changes underneath this pipeline day to day) and should be treated as the
  live source of truth over any specific count frozen here. Directly
  querying the National Address Database confirmed 9 states have ZERO
  points within 300m of their sample address — not a bug in this project's
  query, a genuine gap in what the free federal registry has. One of those
  9 (Pennsylvania) now closes a different way: county governments often
  publish their OWN tax-parcel GIS separately from NAD, and that parcel's
  centroid can substitute for a rooftop point — Dauphin County, PA's own
  287 sqm parcel for the Capitol address lands 68m out, beating the 131m
  `rooftop-osm` fallback. Proven live to be unreliable in TWO distinct ways
  before it shipped, both now hard-gated in `geocode/parcel.ts`: (1)
  Mississippi's own Hinds County parcel for the same KIND of address is
  31,551 sqm — the whole capitol grounds, not one building — and its
  centroid lands 146m out, *worse* than that state's existing 8m OSM
  result, so parcel-centroid area-gates at 2,000 sqm and simply contributes
  nothing where a matching parcel is oversized; (2) the nearest small
  parcel to Pennsylvania's own target address turned out to be a real,
  different, nearby building (house number 400, not the target's 501) —
  caught before shipping, fixed by requiring an actual address-field match
  (or an honestly-unattributed government parcel) before a parcel is ever
  used, never mere proximity. No national registry of county parcel
  services exists — `PARCEL_SOURCES` in `geocode/parcel.ts` is a registry
  of individually-verified counties (one, so far: Dauphin County, PA), not
  a formula that covers a state once one county in it is added.
- FUTA credit-reduction **is wired** (`futa()` in `src/taxes/federal.ts` adds
  a state's additional rate from `futa.creditReduction.states` whenever that
  map carries an entry) — DOL just hasn't published the 2026 list yet, since
  the determination is made after November 10 of the wage year. The map is
  correctly empty for 2026 as shipped, and the engine says the determination
  is pending rather than silently assuming the full 5.4% credit; 2025's
  finals (CA 1.2%, VI 4.5%) ride along as `priorYear` reference only. What
  is genuinely not automated is populating that map once DOL does publish —
  it still needs a human edit to `data/federal/2026.json`.
- **All 51 jurisdictions' garnishment law is now researched — none left as
  an unconfirmed federal-default guess.** 32 states carry a modelled
  departure from the plain federal CCPA formula; 10 (Georgia, Alabama,
  Louisiana, Michigan, Montana, Ohio, Oklahoma, Rhode Island, Utah,
  Wyoming) were actively researched and *confirmed* to have no departure at
  all — a stronger claim than simple absence would have been; the
  remaining few (Arkansas, Mississippi, New Hampshire) carry a real,
  disclosed structural nuance this engine's per-paycheck model can't fully
  capture (see below), rather than a silently-assumed match. Seven
  distinct formula shapes now exist (`GarnishmentFormula` in
  `src/registry.ts`):
  TX, PA, NC, SC bar ordinary consumer garnishment outright; FL exempts a
  "head of family" debtor at any income (until affirmatively waived in
  writing); MO gives a head-of-family debtor a reduced 10% instead of a full
  exemption; IL, NY, MA, CT, DE, CO, WA, WI, ME, VT and MD each cap it by a
  flat-fraction formula (of gross and/or disposable earnings, plus a
  minimum-wage floor — New York's is a dual 10%-of-gross/25%-of-disposable
  test, Vermont's resolves a real dual-rule statute to the more protective of
  its two rates, Maryland's floor uses its own $15.00 state minimum wage
  rather than the federal one); ND uses that same flat-fraction shape with a
  further $20/week-per-dependent reduction layered on top
  (`GarnishmentOrder.dependents` — the one state in this file keyed to
  headcount rather than income alone); MN cliff-brackets by income (10/15/25%,
  indexed to multiples of minimum wage — crossing a threshold reclassifies
  the WHOLE amount, not a "lesser of" test); NV cliff-brackets too, but on a
  fixed $770 gross-weekly dollar line instead of a minimum-wage multiple; HI
  alone uses genuine MARGINAL brackets (5%/10%/20% of monthly-prorated
  disposable earnings, only the slice within each band — actual
  income-tax-bracket math, see `GarnishmentMarginalBracket`'s own doc
  comment); NJ uses a fifth shape, `GarnishmentFormula.povertyGuidelineTier`
  — 10% of gross while the debtor's annualized income sits at or under 250%
  of the HHS federal poverty guideline for their household size
  (`GarnishmentOrder.householdSize`, never guessed when absent — the same
  discipline as an unset `headOfFamily`), reverting to the plain federal
  default above that threshold because N.J. Stat. 2A:17-56 itself leaves
  that case to court discretion rather than naming a fixed percentage, plus
  a separate flat $48/week exemption (N.J. Stat. 2A:17-50) layered on top.
  Maryland's own previously-disclosed gap (a county-by-county variation) was
  re-researched rather than built around: a 2020 amendment had already
  repealed that variation and made the state's rule uniform, so it needed no
  new sub-state-geography plumbing at all, just the correction above.
  **California's own formula (Cal. Civ. Proc. Code § 706.050) needed a
  genuinely new sixth shape**, `GarnishmentFormula.minimumWageExcessFraction`
  — every other capFractions state takes 100% of the excess once a
  minimum-wage floor is crossed, but California only exposes 40% of that
  excess to garnishment (lesser of 20% of disposable earnings, or 40% of the
  amount by which disposable earnings exceed 48x its own $16.90 minimum
  wage) — confirmed directly from the California Courts' own self-help
  guide for employers, worked example included. New Mexico, South Dakota,
  Virginia, West Virginia, DC and Nebraska all turned out to fit the
  existing flat-fraction shape (South Dakota adds ND's own
  per-dependent-reduction mechanism at a different dollar figure; Nebraska's
  head-of-family variant is structurally identical to Missouri's, just a
  different reduced fraction). Adding California's own real override
  surfaced a real test-suite hazard worth naming: `tests/garnishment.test.ts`
  had been defaulting its `workState` to `'CA'` specifically *because*
  California had no override before this pass — every test that omitted
  `workState` was unknowingly relying on that absence to isolate the plain
  federal formula, and would have silently started computing California's
  new real formula instead the moment it shipped; the default was moved to
  `'AL'` (confirmed to have no departure) before any of this landed.
  A later pass researched the remaining 21 states outright rather than
  leave them as an unconfirmed baseline: Arizona's Prop 209 cut ordinary
  garnishment to 10%/60x its own $15.15 minimum wage; Alaska needed a
  **genuinely new flat-dollar-floor shape** (`flatWeeklyFloor` /
  `flatWeeklyFloorSoleSupport`) since its $473/$743-per-week figures are
  legislated dollar amounts, not a minimum-wage multiple — Oregon's own
  $254/week floor reuses the same shape; Tennessee reuses the existing
  per-dependent-reduction mechanism ND already established, at its own
  $2.50/week figure, gated on the debtor actually informing the employer;
  Iowa needed a **genuinely new seventh shape**, `annualCapTiers` — the
  only one in this file that caps a CUMULATIVE total across an entire
  calendar year rather than one paycheck at a time, keyed to the debtor's
  own earnings "reasonably expected" for the year
  (`GarnishmentOrder.expectedAnnualEarnings`, a projection this engine
  can't derive from any single paycheck) with a running per-creditor
  annual total the caller maintains (`.garnishedThisYearForThisOrder`).
  Idaho, Indiana, Kansas, Kentucky, Alabama, Louisiana, Michigan, Montana,
  Ohio, Oklahoma, Rhode Island, Utah and Wyoming all turned out to
  re-enact the plain federal test verbatim — confirmed, not assumed, the
  same class of finding as Georgia's. Arkansas's real departure
  (A.C.A. § 16-66-208) turned out to protect only a narrow, statutorily-
  undefined occupational category ("laborers and mechanics") at a dollar
  figure smaller than the federal floor already in place regardless, so
  it's disclosed rather than force-fit; Mississippi's real departure is a
  30-day post-service grace period this engine's one-paycheck-at-a-time
  model has no "days since service" concept to represent; New
  Hampshire's trustee process is the most structurally different of all —
  wages earned *after* a writ is served are exempt outright, so there is
  no ongoing per-paycheck percentage to compute at all for a standing
  garnishment order the way every other state in this file has, closest
  in practical effect to a prohibition without literally being one. See
  `data/garnishment/state-overrides-2026.json`'s own `$scopeNote` for the
  complete state-by-state accounting. Several modelled states also set higher LOCAL minimum
  wages this file doesn't reach (Denver/Boulder in CO, Minneapolis/St. Paul
  in MN, NYC/Long Island/Westchester in NY, Portland in ME, and now several
  New Mexico and California cities/counties too) — disclosed per-state, not
  silently assumed away. A federal tax levy is out
  of scope entirely: its exempt amount comes from IRS Publication 1494's own
  table (filing status, dependents, standard deduction), not a fixed CCPA
  fraction. Multiple simultaneous support orders are prorated by this
  engine's own proportional rule when their combined demand exceeds the
  shared ceiling — a live case defers to the state child-support-
  enforcement agency's own allocation rule instead.
- **West Virginia's municipal service fee has NO central registry to
  bulk-load from — confirmed, not assumed, by a genuinely completed
  canvass, not just repeated keyword search.** WV Code 8-13-13 lets any of
  ~230 chartered municipalities levy the fee independently, with no
  Ohio-Finder- or Kentucky-SOS-style state database to pull a complete list
  from. Six early passes tried keyword/aggregator search (news coverage,
  payroll-industry compilers, state agency pages, an academic study blocked
  by a Cloudflare challenge) and kept converging on the same 9-10 well-known
  cities. A later pass abandoned keyword search for an actual **city-by-city
  canvass of the full ~230-municipality roster** (`localIncomeTax.
  canvassProgress` in `data/states/WV-2026.json` — `notYetChecked` is now
  genuinely empty, not just small) and found exactly ONE more real city out
  of the ~160 towns nobody had individually checked before: **11 cities are
  now confirmed** (Charleston, Huntington, Morgantown, Parkersburg, Wheeling,
  Weirton, Fairmont, Madison, Romney, Montgomery, Glen Dale), each
  individually ordinance-sourced. That roughly 1-in-160 hit rate among
  never-before-checked towns is itself informative — it means the true
  universe of adopters is genuinely small, not merely under-searched, which
  is why this is now treated as closed rather than perpetually "20% done."
  A WV city absent from `serviceFeeCities` now means "individually checked
  and found no evidence," not "not yet looked up" — the one exception is a
  single Home Rule filing (Shinnston) that exists only as a non-OCR'd scanned
  PDF this project has no tooling to read. Several real "Municipal Service
  Fee"-titled ordinances were run down and correctly excluded rather than
  assumed to match: Nitro, Weston, Dunbar, Mannington, Chester, Bridgeport,
  Bluefield, Wellsburg and Paden City all turned out to be the WRONG shape —
  a flat charge billed to property owners, households, or per building unit,
  not the per-employee payroll withholding this engine models. That
  structural finding is worth naming on its own: WV Code 8-13-13 is used by
  far more than 11 cities, but mostly for a property-billed fee, so a
  newly-found "service fee" ordinance is a coin flip needing its basis
  checked every time, never assumed. Separately, WV Code § 7-20-12 lets any
  COUNTY (not municipality) impose an equivalent countywide fee, but only
  after a voter referendum — no county has been found to have actually run
  one, so nothing is modelled there. What remains genuinely open needs a
  records request to the WV State Auditor or Municipal Home Rule Board, or a
  live phone canvass of town clerks — not more web search, which this
  file's own `canvassProgress.$status` documents as exhausted.
- **Structurally out of scope, not missing:** a few real local levies exist
  that no per-paycheck engine can compute at all — New York's MCTMT and San
  Francisco's Administrative Office Tax are both quarterly taxes on an
  employer's *aggregate* payroll, with no per-employee, per-cheque figure
  to emit. Both are researched and documented in their state files
  (`data/states/NY-2026.json`, `data/states/CA-2026.json`) specifically so
  the absence reads as a deliberate boundary, not an oversight.
- Every other state's local income tax coverage matches what that state's
  own public data supports in full (a bulk register, a complete named-city
  list, or a fixed small set like Colorado's OPT cluster) — a jurisdiction
  not producing a line for a resolved address should be checked against
  that state file's own `knownGaps` before being assumed untaxed.

Every one of these is disclosed in the file it affects, not just here — this
list is a map to the disclosures, not a substitute for reading them.

## Sources

- [IRS Publication 15-T (2026)](https://www.irs.gov/pub/irs-pdf/p15t.pdf)
- [SSA contribution and benefit base](https://www.ssa.gov/oact/cola/cbb.html)
- [National Address Database](https://www.transportation.gov/gis/national-address-database) (US DOT)
- Each state's own file in `data/states/` and `data/local/` cites its own
  primary source — there is no single national withholding source to point
  at, which is the whole reason this project exists.
