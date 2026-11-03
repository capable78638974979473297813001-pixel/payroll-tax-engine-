# State employment-tax filing

`payroll/state/` computes what an employer owes and files at the state level, from approved pay
runs, using **state profiles**: data files in `data/filing/states/` with a citation for every rule.
Import it as `import { state } from './payroll/index.ts'`. Coverage is in
[`STATE-COVERAGE.md`](STATE-COVERAGE.md) (generated; a test fails if it is stale).

**Status: pilot.** Five states are modelled (California, Connecticut, Nebraska, New York, Texas), chosen to
cover the different shapes a state deposit rule takes: a table keyed to the federal schedule (CA), a frequency
the state assigns from a look-back (CT), a monthly threshold (NE), a combined quarterly return (NY), and an
unemployment-only state with no wage income tax (TX). The other **48 jurisdictions
are NOT MODELLED**: nothing is assumed for them, and a lookup for one fails loudly. **Nothing is
transmitted to any state**: no state transport is connected.

## What it does

| Module | Does |
| --- | --- |
| `profile.ts` | Loads and validates profiles (every rule must cite a source with a URL, revision and `verifiedOn`); `coverage()` for every jurisdiction |
| `ledger.ts` | State income-tax withheld, employee insurance and employer UI **by pay date** from the engine's `XX_SIT`, `XX_DBL_EE`, `XX_SUI_ER` lines; per-employee quarter wages |
| `calendar.ts` | Business days and due dates from a profile's rules. A state's holiday list is its own; if it was not read, dates skip weekends only and carry `state_holidays_not_modelled` |
| `deposits.ts` | The withholding deposit schedule from the **federal** schedule and the amount accumulated, interpreting a state's rule table as data. A state with no table returns an **error finding**, never a guess |
| `ui.ts` | The quarterly unemployment report: each employee's wages, wages taxed for UI (checked against the annual wage base), totals, contribution due, each return's due date |
| `newhire.ts` | New-hire deadline from a state's days-from-start rule; refuses if the profile has none |
| `agency.ts` | Each profile's channels as registry entries (with the enrollment steps the profile records), and filing packages for the shared `FilingBook` lifecycle |

## What is verified, for the five states

From each agency's own documents, read in full (the stored watcher copy or the live page, as cited):

- **California (DE 44, Rev. 52 (4-26)).** The complete withholding deposit table (federal next-day /
  semiweekly / monthly rows against under $350, $350-$400, over $400); the 2026 quarterly payment table
  (last timely date and settlement date); DE 9/DE 9C due and delinquent dates; the 20-day DE 34 new-hire
  rule; the 15-day registration rule; the mandate that all employers file and pay electronically;
  UI wage limit $7,000. Every cell of the deposit table and the boundaries ($349.99, $350.00, $400.00,
  $400.01) are tests.
- **New York (NYS-45-I, 1/26).** Quarterly due dates (last day of the month after the quarter, next
  business day if needed), the electronic-filing mandate, the three electronic methods, the 2026 UI wage base
  ($17,600). **Not read: the NYS-1 deposit frequency rules**, so no New York deposit schedule is computed.
- **Connecticut (Circular CT, IP 2025(1)).** Withholding only (no unemployment guide was read). Remitter
  class from the look-back: weekly above $10,000, monthly above $2,000 up to $10,000, quarterly $2,000 or less,
  new employers quarterly. Weekly: the Saturday-to-Friday week, due the Wednesday after; monthly the 15th;
  quarterly the last day of the month after. CT-941 and CT-W3 dates; the electronic mandate. The guide is the
  **2025** edition, so 2026 pay dates carry a `state_rules_year_mismatch` warning.
- **Nebraska (2026 Circular EN).** Monthly deposit when month 1 or 2 of a quarter exceeds $500 (month 2 is also
  triggered by month 1), due the 15th of the next month; the rest paid with Form 941N by the last day of the
  month after the quarter; annual filers January 31; Form W-3N.
- **Texas (TWC pages).** $9,000 wage base, quarterly report and tax due the last day of the month after the
  quarter, the 10-day registration rule, the wage-report contents, UTS/QuickFile.

The **interpretation** California's guide leaves open (how PIT accumulates across periods) is written into
the profile and repeated in every result as `state_deposit_interpretation`. Each federal deposit group is
banded on the PIT withheld in it; a group in the $350-$400 band, or a federal-monthly month at $350 or more, goes
to the monthly deposit; the rest to the quarterly one. If EDD's reading differs, change the profile.

## Known gaps (also in each profile's `notModelled`)

- California: the DE 9 line-by-line layout and the wage-report file format; ETT (0.1% on the first $7,000) is
  **not emitted by the paycheck engine** so it is not in the totals; California's legal-holiday list.
- New York: deposit schedule; the NYS-45 part and box layout and Publication 72.5's flat-file format.
- Texas: the QuickFile layout; Texas legal holidays; new-hire reporting.
- Connecticut: unemployment; the CT-941 line layout. Nebraska: unemployment; the 941N line layout.
- Every state: no state transport is connected, so no filing is sent. Subject-wages definitions are the
  agencies' own; gross pay is used as a proxy and the report says so. SSNs are never held by the engine.

## Adding a state

Follow `STATE-LAYER-SPEC.md`. In short:

1. Read the state's own documents in full (the watcher's stored copies in `watcher/state/snapshots/`, found
   by source id in `watcher/state/state.json`, or the live page). Never a vendor summary. If a site blocks
   automated access, do not work around it: record it in `notModelled`.
2. Write `data/filing/states/<ST>.json`. Every section names a `source` that appears in `sources` with its
   URL, revision and `verifiedOn`. Anything unread goes in `notModelled`. `loadProfile` rejects a profile that
   cites nothing.
3. Express the state's deposit rule in `withholding.deposits` using one of the three shapes the engine
   interprets: `federal_bands` (a table of federal schedule x amount band, see CA), `assigned_frequency`
   (the state assigns weekly/monthly/quarterly, see CT), or `quarter_month_threshold` (deposit a month's tax once
   it passes a threshold, see NE). A rule that fits none of them stays out, with the reason in `notModelled`:
   adding a new shape means extending `deposits.ts` and `profile.ts` and testing it from the agency's examples.
4. Add tests from the agency's own examples and dates, run `node scripts/state-coverage.ts`, run
   `npm test`, and `python watcher/build_sources.py` so the new URLs are watched.

## Not connected

Filing with a state is a separate enrollment from the engine: each channel in a profile lists what the state
requires (for California, registering for an employer payroll tax account at e-Services for Business; for Texas,
registering on UTR and waiting for the Employer Liability Notice). The live transports refuse until those exist.
Which of them your product itself needs, versus your customers, is the same filer-of-record decision as the
federal one (`IRS-EFILE-ENROLLMENT-PLAN.md`).
