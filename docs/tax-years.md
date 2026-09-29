# Tax years

Withholding is decided by the check date's year, never by the clock. A
correction or retroactive payment for an earlier year needs that year's
rules, so each year has its own files: `data/federal/<year>.json`,
`data/states/<ST>-<year>.json` and `data/local/*-<year>.json`.

## What each year covers

| Year | Federal | States | Local registries |
|---|---|---|---|
| 2026 | yes | all 50 + DC | all (PA, OH, MI, KY, AL, IN, ...) |
| 2025 | yes | AK, FL, NH, NV, SD, TN, TX, WA, WY | none needed for these nine; Seattle's payroll expense tax is in WA-2025.json |

The nine 2025 states are the ones with no tax on wages, so a 2025 file only
needs their unemployment, paid-leave, WA Cares and Seattle figures. Those
were taken from the U.S. Department of Labor's *Significant Provisions of
State UI Laws, January 2025* and each agency's own 2025 notices; each file
lists its sources.

The 2025 federal file comes from IRS Publication 15-T (2025), SSA's $176,100
wage base, IRS Notice 2024-80 (deferral limits) and RRB Program Letter
2025-01. The 2025 tables were not revised after OBBBA passed in July 2025,
and the IRS told employers to keep using them, so they are what a 2025
cheque should have withheld.

## What happens for a year that isn't fully covered

A paycheck is refused, not computed without its state tax:

- `calculatePaycheck()` throws `UnsupportedTaxYearError` when the federal
  rules, the work state or the residence state has no file for the year.
- The site API rejects the request at validation (422, field
  `workState.code` or `residenceState.code`) and names the year;
  `GET /api/states?year=2025` lists the states that year covers.

## Adding a state to 2025

Add `data/states/<ST>-2025.json` with that year's figures and sources. It
must have the same shape as the 2026 file, which matters most for states
whose 2026 code reads year-named fields (for example `rate2026` in the Ohio
school-district file and the dated table switches in Utah and Georgia). If
the state has local taxes, add its `data/local/*-2025.json` registries too.
The year gate picks the new file up with no code change. Then run
`npm run edge:build`.
