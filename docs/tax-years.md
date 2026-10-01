# Tax years

Withholding is decided by the check date's year, never by the clock. A
correction or retroactive payment for an earlier year needs that year's
rules, so each year has its own files: `data/federal/<year>.json`,
`data/states/<ST>-<year>.json` and `data/local/*-<year>.json`.

## What each year covers

| Year | Federal | States | Local registries |
|---|---|---|---|
| 2026 | yes | all 50 + DC | AL, IN, KY, MI, OH (municipal, school district, JEDD), PA |
| 2025 | yes | all 50 + DC | the same set, each with its own 2025 file |
| 2027 | no | NV, WA, NJ, WY only | none |

2027 is a partial year. A paycheck dated in 2027 is still refused, because
there is no `data/federal/2027.json`. The files that do exist record
announced final figures effective 2027-01-01 and carry the rest of the 2026
ruleset forward, marked unconfirmed in `$yearNote` and
`carriedForwardUnconfirmed`:

| File | Confirmed 2027 figure |
|---|---|
| `data/states/NV-2027.json` | UI taxable wage base $45,400 |
| `data/states/WA-2027.json` | UI taxable wage base $82,000 |
| `data/states/NJ-2027.json` | UI/WF/SWF and employer TDI wage base $46,400; worker TDI/FLI wage base $177,100. Worker DI/FLI/WF rates are the 2026 figures with `rateStatus: "provisional"` — NJ has not published 2027 worker rates. |
| `data/states/WY-2027.json` | UI taxable wage base $34,900 |
| `data/minimum-wage/states/CA-2027.json` | Statewide minimum wage $17.40/hr |
| `data/minimum-wage/federal-2027.json` | FLSA floor only, so `minimumWage()` can compare the California rate. The $7.25 figure is the statutory floor. The EO 13658 contractor rate in that file is the 2026 figure, carried forward unconfirmed. |

`scheduledChanges` was not used for these. That list is applied only after
the loader has already chosen the file for the check date's year, so a
change dated 2027-01-01 stored on a 2026 file never loads for a 2027 check.
The 2026 files are unchanged. `data/minimum-wage/federal-2027.json` does not
make 2027 a supported paycheck year: withholding still requires
`data/federal/2027.json`, which is not in this build.

Every 2025 state file names its sources in `sources` (each with a
`verifiedOn` date and, where the source was read, the quoted passage) and
says in `$yearNote` how 2025 differs from 2026. Unemployment wage bases,
experience ranges and new-employer rates come from the U.S. Department of
Labor's *Significant Provisions of State UI Laws, January 2025* unless the
state's own notice is cited instead.

Where a state has no year-specific 2025 document online any more (it was
replaced at the same URL), the file says which substitute was used: an
Internet Archive copy of the original, the USDA National Finance Center's
transcription of the formula, or the state's unchanged statutory formula.
Each is disclosed in that file's `knownGaps`.

The 2025 federal file comes from IRS Publication 15-T (2025), SSA's $176,100
wage base, IRS Notice 2024-80 (deferral limits) and RRB Program Letter
2025-01. The 2025 tables were not revised after OBBBA passed in July 2025,
and the IRS told employers to keep using them, so they are what a 2025
cheque should have withheld.

## Changes during a year

A rule that changed part-way through a year is read by check date:

- `effectiveDated` in a state file: a list of `{from, set: {path: value},
  note}` overlays, applied in order to check dates on or after `from`
  (`src/registry.ts`, `applyEffectiveDated`). 2025 uses it for Idaho's
  May tables, Maryland's July formula, New Mexico's workers' comp fee,
  Virginia's July standard deduction and New Jersey's July new-employer
  rate.
- Method-specific switches: Utah's and Georgia's dated tables, Ohio's
  `midYearEffectiveDating` (July 2024 table until 2025-10-01, then the
  October 2025 table), and Alabama's `overtimeExemption` (overtime pay
  excluded through 2025-06-30; flag the earning `overtime: true`).
- Local registries: `rateHistory` on Alabama and Ohio municipalities and
  Ohio JEDDs, and `rateChanges` on Pennsylvania PSDs. Each picks the latest
  entry dated on or before the check date.

## What happens for a year that isn't fully covered

A paycheck is refused, not computed without its state tax:

- `calculatePaycheck()` throws `UnsupportedTaxYearError` when the federal
  rules, the work state or the residence state has no file for the year.
  2024 and earlier are not covered. 2027 state files exist for NV, WA, NJ
  and WY, but a 2027 check is still refused until `data/federal/2027.json`
  exists — federal withholding for 2027 has not been published into this
  build.
- The site API rejects the request at validation (422, field
  `workState.code` or `residenceState.code`) and names the year;
  `GET /api/states?year=2025` lists the states that year covers.

## Adding a year

Add `data/federal/<year>.json`, `data/states/<ST>-<year>.json` for every
state, and each `data/local/*-<year>.json` registry, with the same shape as
the latest year's files. The year gate picks them up with no code change.
Then run `npm run edge:build`.
