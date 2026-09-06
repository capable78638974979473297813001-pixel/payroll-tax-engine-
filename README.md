# payroll-tax-engine

A gross-to-net US payroll tax engine. Zero runtime dependencies, integer-cents
arithmetic, effective-dated rulesets loaded from JSON — every jurisdiction,
federal through local, computed by the same driver.

```bash
npm test                  # 1000+ tests
npm run demo               # prints a worked paystub
npm run demo:garnishment   # same, layered with a child-support + creditor garnishment
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
| Reciprocity / multi-state | Wired generically off each state's own `reciprocalStates` — IL/IN/KY/MI/MN/OH/PA/WI's bilateral agreements, DC's blanket nonresident exemption, WV's 5-state cluster |
| Garnishments (court-ordered / administrative) | CCPA federal ceilings for ordinary consumer/creditor judgment, child support/alimony (50/55/60/65%), and federal student loan default (34 CFR 34.19) — multiple simultaneous orders share one aggregate ceiling, never stacked. 22 states' own departures researched and modelled across 5 distinct formula shapes: TX/PA/NC/SC bar ordinary garnishment outright; FL exempts a "head of family" debtor at any income; MO gives one a reduced 10% instead; IL/NY/MA/CT/DE/CO/WA/WI/ME/VT/MD cap it by a flat-fraction formula (of gross and/or disposable, plus a minimum-wage floor — VT resolves a real dual-rule statute to the more protective consumer-credit-transaction figure, MD's floor uses its own $15.00 state minimum wage in place of the federal one); ND applies that same flat-fraction shape with an added $20/week-per-dependent reduction; MN cliff-brackets by income (10/15/25%, the WHOLE amount reclassified at each threshold); NV cliff-brackets on a fixed gross-weekly dollar line instead; HI uses genuine MARGINAL brackets (5%/10%/20%, only the slice within each band, income-tax-bracket style); NJ ties its 10% cap to the debtor's household size against the HHS federal poverty guideline, reverting to the federal default above 250% of it (the statute leaves that case to court discretion, not a fixed number). Every other state uses the federal default as an unconfirmed baseline, not a researched "no departure exists." Federal tax levies are out of scope (IRS Pub 1494's own table, not a fixed CCPA fraction) — see `src/garnishment.ts` and `data/garnishment/state-overrides-2026.json` |
| Address → jurisdiction | Five-tier geocoding pipeline that PREFERS rooftop precision and refuses to guess when it can't get there (see below) — a live run lands 35/51 on an authoritative rooftop point, not all 51, plus a gated county-parcel fallback (1 state, so far) for where the free federal registry has nothing at all; measured every run, not assumed, and the split moves day to day |
| Staying current | Automated daily harvester watching 105 registered sources, human review gate before anything reaches `data/` |

Run `npm run coverage:taxes` for the live, generated version of the table
above — one worked paycheck through all 51 jurisdictions, printed fresh, not
transcribed here.

Every rate lives in `data/` with a source URL and a `verifiedOn` date. No rate
is hardcoded in a `.ts` file, and there is no fallback default — a missing
ruleset throws rather than quietly returning zero, and a state with no single
new-employer UI rate (industry-assigned) requires the caller to supply one
rather than silently computing with a wrong number.

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
A run just now: **35/51 land on authoritative rooftop points, 12/51 on
OSM-corroborated house-level points, 2/51 on a between-published-points
`neighbor` estimate, 1/51 on a county parcel centroid (Pennsylvania, 68m —
see Known gaps for the story and the failure mode it took two tries to
close), and 1/51 falls all the way back to Census's own interpolation**
(North Dakota this run: nothing published at or below that address's own
house number to bracket from). These counts are a live measurement, not a
fixed claim — they move day to day as OSM/NAD coverage changes underneath
the pipeline, so re-run the command above rather than trusting a number
written down here; see `docs/geocoding-coverage.md`'s own "these numbers
still move" section. Building footprints add a third,
independent cross-check where OSM has traced the structure.

Once a coordinate is resolved, jurisdictions not published by Census — Ohio's
JEDD/JEDZ districts, Portland's Metro Supportive Housing boundary — are
looked up against their own government's boundary service, joined on the
government's own ID, never on a name match.

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
  `newEmployerRateSource`).
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
- **Garnishment state overrides are researched and modelled for 22 states**,
  across 5 distinct formula shapes (`GarnishmentFormula` in `src/registry.ts`):
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
  new sub-state-geography plumbing at all, just the correction above. Every
  OTHER state (28 + DC) computes ordinary garnishment against the plain
  federal CCPA default, which is correct for most of them but is an
  unconfirmed baseline, not a researched "no state departure exists" — see
  `data/garnishment/state-overrides-2026.json`'s own `$scopeNote`. Several
  modelled states also set higher LOCAL minimum
  wages this file doesn't reach (Denver/Boulder in CO, Minneapolis/St. Paul
  in MN, NYC/Long Island/Westchester in NY, Portland in ME) — disclosed
  per-state, not silently assumed away. A federal tax levy is out
  of scope entirely: its exempt amount comes from IRS Publication 1494's own
  table (filing status, dependents, standard deduction), not a fixed CCPA
  fraction. Multiple simultaneous support orders are prorated by this
  engine's own proportional rule when their combined demand exceeds the
  shared ceiling — a live case defers to the state child-support-
  enforcement agency's own allocation rule instead.
- **West Virginia's municipal service fee is the one local tax with no
  central registry to bulk-load from.** WV Code 8-13-13 lets any of ~230
  chartered municipalities levy the fee independently; unlike every other
  state above, there is no Ohio-Finder- or Kentucky-SOS-style state
  database to pull a complete list from — confirmed by a dedicated search,
  not assumed. 10 cities are on file (Charleston, Huntington, Morgantown,
  Parkersburg, Wheeling, Weirton, Fairmont, Madison, Romney, Montgomery),
  each individually ordinance-sourced, and more exist that aren't yet
  researched. A WV city missing from `serviceFeeCities` in
  `data/states/WV-2026.json` means "not yet looked up," never "confirmed no
  fee" — closing this one requires reading roughly 220 more municipal codes
  one at a time, not finding one more source. A fresh research pass
  (2026-09-05) retried the previously-blocked leads (still blocked) and
  surfaced a genuinely new, DISTINCT mechanism worth naming even though no
  city was added: WV Code § 7-20-12 lets any COUNTY (not municipality)
  impose its own countywide service fee via the same payroll-withholding
  shape, but only after a voter referendum most counties don't appear to
  have run — no confirmed instance was found anywhere in the state, so
  nothing was added, but a future pass should check county-commission
  records rather than assume this is purely a municipal-level tax. That
  same pass also caught a real error in an existing city — Charleston's
  rate was 2.50 with no citation behind it at all; the city's own official
  fee-overview PDF puts it at 3.00/week, corroborated independently by its
  own ordinance text and a federal payroll bulletin, both dating the same
  2018 increase — and ran down four newly-found "Municipal Service Fee"
  ordinances (Nitro, Weston, Dunbar, Mannington) that all turned out to be
  the WRONG shape once actually read: a flat charge billed to property
  owners or per building unit, not the per-employee payroll withholding
  this engine models, the same class of exclusion as Chester's fee. That
  turned into a structural finding worth naming: WV Code 8-13-13 is being
  used by far more than 10 cities, but seemingly mostly for a
  property-billed fee rather than the payroll-withheld one — a newly-found
  city's ordinance needs its basis checked every time, not assumed.
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
