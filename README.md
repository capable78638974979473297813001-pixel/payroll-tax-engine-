# payroll-tax-engine remember this is from two weeks ago not accurate 

A gross-to-net US payroll tax engine. Zero dependencies, integer-cents arithmetic,
effective-dated rulesets loaded from JSON.

```bash
npm test     # 33 tests
npm run demo # prints a worked paystub
```

## Status

| Area | State |
|---|---|
| Federal income tax (Pub 15-T Worksheet 1A, 2026) | Complete — all 6 rate schedules |
| Social Security / Medicare / Additional Medicare | Complete, wage-base and threshold aware |
| FUTA | Complete at the standard net rate |
| Per-tax taxable wage bases | Complete — the core abstraction |
| State income tax | Framework + Pennsylvania. **40 states outstanding** |
| Local income tax | Not started |
| Reciprocity / multi-state | Not started |
| SUI, SDI, PFML | Not started |

Every rate lives in `data/` with a source URL and a `verifiedOn` date. No rate is
hardcoded in a `.ts` file, and there is no fallback default — a missing ruleset
throws rather than quietly returning zero.

## The one idea that matters

Naive payroll code computes a single `taxableWages` number and multiplies it by
each rate. That is wrong, and it is wrong on a large fraction of real paychecks.

**Every tax has its own taxable base.** The same $240 of 401(k) deferral:

- reduces federal income tax wages
- does **not** reduce Social Security or Medicare wages
- does **not** reduce Pennsylvania wages (PA taxes deferrals when earned)

So one paycheck legitimately produces three different bases:

```
Federal Income Tax     base $2,665
Social Security        base $2,905
Pennsylvania           base $2,905
```

Each tax declares its exemptions as data (`exemptPretax` in its ruleset), and
`makeTaxableWagesFn` resolves the base per tax. Adding a jurisdiction with an
unusual rule is a data change, not a code change.

## Architecture

```
data/federal/2026.json     rates + brackets + sources
data/states/PA-2026.json   one file per state per year
src/money.ts               integer cents; wage caps; half-up rounding
src/wages.ts               per-tax taxable base resolution
src/registry.ts            effective-dated ruleset loading
src/taxes/federal.ts       Worksheet 1A, FICA, FUTA
src/taxes/state.ts         method dispatch (flat_rate, …)
src/calculate.ts           driver — knows nothing about specific taxes

harvester/sources.json     authoritative registers to monitor
harvester/snapshot.ts      content-addressed immutable captures
harvester/diff.ts          change detection + severity + parser guard
harvester/harvest.ts       decisions and the review queue
```

The ruleset is selected by **check date**, never by the clock, so a correction
run in March for a December check uses December's rules.

## Staying current without fetching at calculation time

```bash
npm run demo:harvest
```

The obvious idea is to fetch rates live so you are never stale. It is the wrong
trade, for three reasons:

1. **Reproducibility.** Payroll must be deterministic forever — same check
   date and inputs, same answer, for audits, amended 941s and W-2c corrections.
   If the rate comes off the network at calculation time, last March's cheque
   can never be reproduced, because the source moved underneath it.
2. **Availability.** A payroll batch is thousands of cheques. You cannot make
   an HTTP call per cheque, and a municipal web server being down on payday
   cannot be a reason not to run payroll.
3. **Blast radius.** Live fetch means a reformatted page silently becomes wrong
   money, with no human in the loop.

So the network and the arithmetic are separated completely:

```
harvester (daily) → hash → snapshot → diff → REVIEW GATE → data/ → engine (offline)
```

**Watch registers, not towns.** The single most useful fact about this problem:
you never monitor an individual municipality's website. Ohio's ~600
municipalities are legally required to report into the Department of Taxation's
downloadable rate database; Pennsylvania's ~2,500 Act 32 jurisdictions report
into DCED, which is the only legally recognised source for PSD codes and EIT
rates. That collapses "7,400 jurisdictions" into roughly **60 registers**.

The harvester's decisions:

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
human approval, and every capture is retained content-addressed so there is a
file — not a memory of a website — behind every historical calculation.

## Adding a state

If it fits an existing method, it is data only. Drop in `data/states/XX-2026.json`:

```json
{
  "code": "XX", "name": "Example", "year": 2026, "method": "flat_rate",
  "sources": [{ "title": "…", "url": "…", "verifiedOn": "2026-08-11" }],
  "flatRate": { "rate": 0.0495, "allowanceAmount": 2775.0 },
  "exemptPretax": ["section125", "hsa", "fsa", "deferral_401k"]
}
```

The `exemptPretax` list is the part that needs real research per state — the
rate is the easy half. States with bracketed tables or credit-based formulas
need a new `method` in `src/taxes/state.ts`.

## Honest assessment of what's left

The calculator is not the hard part; it is largely done above. The remaining
work is data acquisition and data maintenance.

**Roughly tractable:**

- *40 remaining states.* Perhaps 1–3 days each including verification and test
  fixtures. Around a dozen are flat-rate and nearly free; California, New York
  and Oregon have genuinely intricate formulas.
- *SUI/SDI/PFML.* Per-state wage bases and rates, plus employer-specific
  experience rates that must be a per-customer input, not a constant.

**Genuinely hard:**

- *Local taxes.* This is most of the "7,400 jurisdictions" figure. Pennsylvania
  alone has ~2,500 Act 32 EIT jurisdictions; Ohio has ~600 municipalities plus
  school districts. Both states do publish machine-readable registers, which
  helps a lot. Kentucky, Michigan, Indiana, Missouri, Maryland, Alabama, New
  York and Colorado each add their own model.
- *Address → jurisdiction.* Local tax selection is a geospatial lookup, not a
  ZIP lookup — ZIP codes cross municipal boundaries, and getting this wrong is
  a silent, systematic error. Census TIGER/Line shapefiles are free and make
  this solvable; it is a real subsystem, not a lookup table.
- *Reciprocity and nexus.* Around 30 interstate agreements, plus resident vs.
  non-resident sourcing and credit-for-taxes-paid.

**Not a software problem at all:**

- *Maintenance.* There is no public API for any of this. It is ~45 PDFs a year
  on 45 different schedules, some revised mid-year with retroactive effect.
  This is the actual product a vendor sells.
- *Liability.* Withholding errors produce agency penalties for the employer.
  A vendor's price includes being the party who is wrong.

## When to build vs. buy

Build if payroll tax is your product, you can staff ongoing compliance research,
and you need control over the calculation. Buy if payroll is a feature of
something else — the $200k is mostly buying the maintenance treadmill and the
liability, and neither goes away because the arithmetic turned out to be easy.

A credible middle path: run this engine for federal + FICA + flat-rate states
(a large share of paychecks, fully verifiable), and buy or defer coverage for
locals and the complex states.

## Verification

Federal figures were cross-checked two ways before being committed:

1. Every bracket's cumulative `base` was re-derived from the previous row.
   Example, Single: `1,240 + 0.12 × (57,900 − 19,900) = 5,800` ✓
2. The Step-1 adjustment plus the 0% bracket reconciles to the published 2026
   standard deduction: `12,900 + 19,300 = 32,200` (MFJ), `8,600 + 7,500 =
   16,100` (single), `8,600 + 15,550 = 24,150` (HoH) ✓

Test expectations were computed by hand from the worksheet before the code ran.
A golden file regenerated from its own engine proves nothing.

## Known gaps in shipped data

- PA employee unemployment (UC) withholding — rate not yet verified from a
  primary source, so deliberately absent rather than guessed.
- FUTA credit-reduction states (published by DOL each November).

## National source registry

`data/sources/us-registry.json` maps every US wage-withholding jurisdiction to
its **primary government source** and a verification status — it holds no rate
values by design. Status ladder:

- `structural_fact` — the 9 states with no wage income tax (nothing to withhold).
- `source_verified` — official withholding source URL confirmed on the web; rate
  values not yet transcribed or human-checked.
- `modelled` — rates are in the engine (`data/`) and locked by hand-derived tests.

As of 2026-08-11: 9 structural facts, 40 states source-verified, 2 (PA, MI)
modelled, plus the two local aggregators (PA DCED Act 32 — corrected this
session to `apps.dced.pa.gov/munstats-public/FindLocalTax.aspx` after the
originally-recorded `munstats.pa.gov` was found not to resolve — and Ohio
`thefinder.tax.ohio.gov`) that collapse ~3,100 local jurisdictions into 2 feeds.
A state moves to `modelled` only after a human verifies its rates against the
cited source — the registry never carries a guessed number.

**Caution on `source_verified` entries:** spot-checking this session found two
concrete errors in previously-recorded data — Oklahoma's URL 404'd (a
constructed path, since fixed) and Michigan's exemption amount was a stale
2025 figure ($5,800 vs. the actual 2026 $5,900). Treat `source_verified` as
"a source was located," not "the URL and every detail were re-fetched and
confirmed this session" — each entry should be spot-checked again before
being trusted for a `modelled` promotion.

## Michigan (`data/states/MI-2026.json`, `data/local/MI-cities-2026.json`)

State: flat 4.25%, $5,900 annual personal exemption — both read directly from
the primary-source PDF (Form 446, Rev. 02-26), fixture-ready like PA. Pretax
treatment is the mirror image of PA: MCL 206.30(l) ties MI taxable income to
federal AGI, so 401(k)/403(b)/457/SIMPLE deferrals reduce the MI base (they
don't in PA) — sourced from a statute citation, not the 446 guide itself, so
flagged for a second check before this ruleset is called production-verified.

All 24 city income taxes are catalogued with rates and exemption amounts.
Detroit (2.4%/1.2%) and Saginaw (1.5%/0.75%) were checked directly against
their own primary sources; **Saginaw's rate had to be corrected** — a
consolidated third-party municipal table had it wrong (1.00%/0.50%), a real
example of exactly the failure mode this project's verification discipline
exists to catch. The other 22 cities carry the consolidated table's numbers
un-reconfirmed per city, marked `source_verified` rather than `verified`.
Local calculation is not yet wired into the engine — data only, per Build
order (Phase 5 comes after Phase 4 extends the engine itself to new states).

## Sources

- [IRS Publication 15-T (2026)](https://www.irs.gov/pub/irs-pdf/p15t.pdf)
- [SSA contribution and benefit base](https://www.ssa.gov/oact/cola/cbb.html)
- [PA DOR employer withholding](https://www.revenue.pa.gov/TaxTypes/EmployerWithholding/)
