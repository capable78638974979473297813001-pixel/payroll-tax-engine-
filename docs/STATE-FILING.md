# State employment-tax filing

`payroll/state/` computes what an employer owes and files at the state level, from approved pay
runs, using **state profiles**: data files in `data/filing/states/` with a citation for every rule.
Import it as `import { state } from './payroll/index.ts'`. Coverage is in
[`STATE-COVERAGE.md`](STATE-COVERAGE.md) (generated; a test fails if it is stale).

**Status: pilot.** Nine states are modelled (California, Colorado, Connecticut, Nebraska, New York, Rhode Island, Texas, Utah, Virginia), chosen to
cover the different shapes a state deposit rule takes: a table keyed to the federal schedule (CA), a frequency
the state assigns (CT, CO, VA, UT, RI), a monthly threshold (NE), a combined quarterly return (NY), and an
unemployment-only state with no wage income tax (TX). The other **44 jurisdictions
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

## What is verified, for the nine states

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
- **Colorado (Wage Withholding Tax Guide, January 2026).** Withholding only. Frequency from annual Colorado
  withholding: quarterly under $7,000, monthly $7,000 to $50,000, weekly above (the guide puts exactly $50,000 in
  both rows; the profile treats it as monthly and says so). Weekly: Saturday-to-Friday, due the 3rd business day after
  the Friday, the final period of the year ends December 31, and a week is not split at quarter ends. The guide's
  own worked example is a test. Monthly the 15th, quarterly the last day of the month after; DR 1094; DR 1093 by
  January 31; EFT mandatory for weekly remitters.
- **Virginia (Employer Withholding Instructions, Rev. 10/26).** Withholding only. Status from average monthly
  withholding: under $100 quarterly, $100 to under $1,000 monthly (the 25th), $1,000 or more semi-weekly (more than
  $500 at the close of a Wednesday-Friday or Saturday-Tuesday period, due in 3 banking days; the remainder with
  Form VA-16). **The booklet gives no worked example of how the $500 test accumulates**, so the reading applied
  (balance not yet paid, restarting each quarter) is in the profile and repeated in every result. VA-6 by January 31.
- **Utah (Publication 14, Rev. 4/25 - the June 2025 edition).** Withholding only. Under $1,000 a month: quarterly
  return and payment. $1,000 or more a month: quarterly return, MONTHLY payments due the last day of the following
  month. Household/944 filers may pay annually (January 31). Utah says the IRS semiweekly and next-day rules do not
  apply. Electronic filing is mandatory.
- **Rhode Island (2026 Withholding Tax Booklet).** Withholding only. Weekly at $600 or more in a month, monthly at
  $50 to under $600, quarterly under $50. RI's due dates are not a clean rule (weeks are cut at quarter ends, stub
  weeks have their own dates, holidays move Monday to Tuesday), so the profile holds **the agency's printed 2026
  calendar** (52 weekly rows, 12 monthly, 4 quarterly), and 2027 pay dates draw an error until that year's calendar is
  added. Two printed weekly rows around July 3-7, 2026 are flagged for a look against the PDF, because the stored
  text loses the calendar's colour coding. Bulk RI-941 filing needs a Payroll Letter of Intent to Rhode Island.
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
- Colorado and Virginia: unemployment (CDLE, VEC) and Colorado FAMLI; registration steps; holiday lists. Virginia:
  seasonal status and the small-employer monthly waiver.
- Utah and Rhode Island: unemployment (Workforce Services; DLT and temporary disability insurance); Rhode Island
  years after 2026; the registration steps; holiday lists.
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
   (the state assigns weekly/monthly/quarterly, see CT; CO adds `weekSplit: "year"`, VA adds a
   `semiweekly_threshold` frequency; UT adds a `last_day_of_following_month` due rule; RI uses a
   `published_calendar` frequency that holds the agency's printed periods and due dates), or `quarter_month_threshold` (deposit a month's tax once
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
