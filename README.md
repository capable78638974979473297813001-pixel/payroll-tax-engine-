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
| FUTA | Complete at the standard net rate |
| State income tax | **51 / 51 jurisdictions** (50 states + DC), 41 distinct `method` cases — one of them (`no_income_tax`) shared by the 9 states with no wage income tax, the other 40 each a real published formula shape |
| State unemployment (employer) | 51 / 51 — 44 with a computable new-employer rate, 7 industry-assigned (`employerSuppliedRateRequired`) |
| State UC/SDI/PFML/LTC (employee-paid) | 14 states + DC, wherever the state actually levies one |
| Local income tax | Every state known to levy one, at the depth each state's own public data allows: OH (~600 municipalities + school districts + JEDD/JEDZ), PA (~2,600 Act 32 EIT/LST jurisdictions), MI (24 cities — the full statewide list), KY (227 occupational districts), IN (92/92 counties), AL (25/25 municipalities), MD (24 counties + Baltimore City, wired into the state ruleset), NYC + Yonkers, Kansas City/St. Louis earnings tax, Newark payroll tax, Portland Metro/Multnomah + TriMet/LTD transit excise, Denver-cluster Colorado OPT, Wilmington wage tax, Seattle's JumpStart payroll tax, WV municipal service fees (10 cities — see below, the one state with no central registry to bulk-load from) |
| Reciprocity / multi-state | Wired generically off each state's own `reciprocalStates` — IL/IN/KY/MI/MN/OH/PA/WI's bilateral agreements, DC's blanket nonresident exemption, WV's 5-state cluster |
| Garnishments (court-ordered / administrative) | CCPA federal ceilings for ordinary consumer/creditor judgment, child support/alimony (50/55/60/65%), and federal student loan default (34 CFR 34.19) — multiple simultaneous orders share one aggregate ceiling, never stacked. 5 states' own departures researched (TX/PA/NC/SC bar ordinary garnishment outright, IL's 15%-of-gross/45x rule); every other state uses the federal default as an unconfirmed baseline, not a researched "no departure exists." Federal tax levies are out of scope (IRS Pub 1494's own table, not a fixed CCPA fraction) — see `src/garnishment.ts` |
| Address → jurisdiction | Rooftop-precision geocoding pipeline (see below) — 35/51 authoritative, 14/51 OSM-corroborated, measured, not assumed |
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
error. `geocode/resolve.ts` runs an address through four tiers, each of which
**refuses rather than guesses**:

| Tier | What it means | Source |
| --- | --- | --- |
| `rooftop` | A point published for this exact address by the government that assigns addresses. | National Address Database (US DOT), ~98M points |
| `rooftop-osm` | OpenStreetMap holds a house-level point AND it agrees with Census's own position. | Nominatim, corroborated against Census, never trusted alone |
| `neighbor` | Interpolated between the two nearest *published* points on the same street. Block-level. | National Address Database |
| `interpolated` | Census's own TIGER/Line address-range position, at the curb. | Census geocoder |

Measured, not assumed — `npm run coverage:geocode` resolves one real address
per jurisdiction through this exact pipeline and reports which tier answered:
**35/51 land on authoritative rooftop points, 14/51 on OSM-corroborated
house-level points; only 1/51 falls all the way back to Census's own
interpolation** (a genuine North Dakota data gap: nothing published at or
below that address's own house number to bracket from — see
`docs/geocoding-coverage.md`). Building footprints add a third, independent
cross-check where OSM has traced the structure.

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

- A handful of state UI sites (AZ, AR, DC, KS, NH, TX at last check) block
  automated access outright; those states' unemployment figures rest on the
  best cross-source confirmation available rather than a direct primary
  fetch, and are marked as such in their own `data/states/*.json`.
- North Dakota's sample address falls back to Census interpolation rather
  than a rooftop point — a genuine gap in what's been published near that
  address, not a code limitation (see `docs/geocoding-coverage.md`).
- FUTA credit-reduction states are published by DOL each November and are
  not yet wired to auto-update from that publication.
- **Garnishment state overrides are researched for 5 states only** (TX, PA,
  NC, SC — ordinary consumer garnishment barred outright; IL — its own
  15%-of-gross/45x-minimum-wage formula). Every other state computes
  ordinary garnishment against the plain federal CCPA default, which is
  correct for most states but is an unconfirmed baseline, not a researched
  "no state departure exists" — see `data/garnishment/state-overrides-2026.json`'s
  own `$scopeNote`. A federal tax levy is out of scope entirely: its exempt
  amount comes from IRS Publication 1494's own table (filing status,
  dependents, standard deduction), not a fixed CCPA fraction. Multiple
  simultaneous support orders are prorated by this engine's own
  proportional rule when their combined demand exceeds the shared ceiling —
  a live case defers to the state child-support-enforcement agency's own
  allocation rule instead.
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
  one at a time, not finding one more source.
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
