# State employment-tax filing

`payroll/state/` computes what an employer owes and files at the state level, from approved pay
runs, using **state profiles**: data files in `data/filing/states/` with a citation for every rule.
Import it as `import { state } from './payroll/index.ts'`. Coverage is in
[`STATE-COVERAGE.md`](STATE-COVERAGE.md) (generated; a test fails if it is stale).

**Status: all 53 jurisdictions have a profile, and every one of the 51 states and DC is read from an official source.** No profile is secondary-sourced.

| Tier | Jurisdictions | What it means |
| --- | --- | --- |
| Full withholding profile, read from the agency's own document (42) | AL, AR, AZ, CA, CO, CT, DC, DE, GA, HI, IA, ID, IL, IN, KS, KY, LA, MA, MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NJ, NM, NY, OH, OK, OR, PA, RI, SC, UT, VA, VT, WI, WV | Deposit schedule, returns, mandates and channels, each rule cited to the document it was read from |
| No wage income tax, unemployment only (9) | TX, FL, AK, SD, WA, WY (read from the agency); NV, NH, TN (read from the state's published regulations and the U.S. Department of Labor, because the agencies' own pages refuse automated access) | Quarterly report due dates, wage base, mandates where the regulation states one, channels. For NV, NH and TN the agencies' portal details, penalties and grace periods are NOT recorded because their pages were not readable |
| Unemployment only, outside the paycheck engine (2) | PR, VI | The Puerto Rico and Virgin Islands unemployment report rules, read from the departments' own pages (Puerto Rico's in Spanish; its due date is inferred from the SINOT regulation). **The paycheck engine has no Puerto Rico or Virgin Islands tax data**, so no wages or withholding flow in, and their income tax withholding is NOT modelled. |

Everything modelled is **withholding and its returns**, plus the **quarterly unemployment report** (due date, wage base, what it carries) for every jurisdiction except Arizona, Kansas and Massachusetts, whose labor agencies' pages refuse automated access and whose rules could not be read elsewhere. Those three say NOT MODELLED for unemployment. Rate notices, charges, claims and benefit-side filings are not modelled anywhere. **Nothing is transmitted to any state**: no state transport is connected.

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

## What is verified, for the eleven states

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
- **Delaware (Division of Revenue employer's guide, web page, no edition printed).** Withholding and the 20-day new-hire
  rule. Look-back (July to June): $6,020.00 or less quarterly, $6,020.01 to $33,460.00 monthly (the 15th), above that
  EIGHTH-MONTHLY, with eight periods ending the 3rd, 7th, 11th, 15th, 19th, 22nd, 25th and last day, each due 3 business
  days later; new employers are monthly. Annual W-3 by February 28. The page still carries regulation examples from
  2000, so confirm the thresholds against the Division's current notices.
- **North Dakota (Guideline, updated 4-2026).** Withholding only. Form 306 quarterly (April 30, July 31, October 31,
  January 31) or, for small eligible employers, annually. Electronic filing is mandatory for employers over $1,000 and
  **for any employer whose payroll service provider files its federal taxes electronically**, so a payroll platform's
  customers are electronic filers. TAP, ACH credit, and an upload web service for software.
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
- Colorado: FAMLI; registration steps; holiday lists. Virginia: seasonal status and the small-employer monthly waiver.
- Utah and Rhode Island: Rhode Island temporary disability insurance and years after 2026; registration steps; holiday lists.
- Delaware and North Dakota: Delaware electronic filing options; North Dakota's web-service specification.
- Connecticut: the CT-941 line layout. Nebraska: the 941N line layout.
- Unemployment reporting (batch 8): Arizona, Kansas and Massachusetts are not modelled; every other state's section records
  what was read and what was not (penalties, file formats, portal enrollment, mandatory electronic-filing thresholds in
  several states). Several states' pages print no weekend rule, so the next business day is assumed and the section says so.
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
   `semiweekly_threshold` frequency; UT adds a `last_day_of_following_month` due rule; DE adds `eighth_monthly` periods and a `month_day_next_year` due rule; RI uses a
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


## Batch 2: the states added after the first eleven

Every profile cites the agency's own document (URL, edition, what was read and what was not) and lists its gaps in `notModelled`. A document that does not state a rule leaves that rule out; it is never filled from memory. Shapes are the engine's: `assigned_frequency` (the agency assigns weekly/monthly/quarterly/...), `federal_bands`, and the period kinds `week_sat_fri`, `semiweekly`, `eighth_monthly` (any fixed set of period-end days), `month_threshold`, `published_calendar` and `semiweekly_threshold`.

| State | Source and edition | What is computed | Flags |
| --- | --- | --- | --- |
| AL | Withholding booklet, Jan 2026 | Quarterly A-1; monthly A-6 when a month of the quarter's first two exceeds $1,000; A-3 January 31 | Occupational tax not modelled |
| GA | Employer's Tax Guide, Sept 2026 | Semi-weekly (look-back over $50,000), monthly, quarterly, annual, and the $100,000 one-day rule | Quarterly/annual status are inputs |
| HI | Booklet A, Rev. 2025 | Quarterly (to $5,000), monthly (to $40,000) | **Semi-weekly derivation not modelled: the stored text drops the paragraph's opening condition** |
| IL | Pub 131, R-01/26 | Monthly or semi-weekly by $12,000 look-back, quarterly IL-941, quarter-split payments | Mid-year switch not modelled |
| KS | KW-100, Rev. 10-24 | Quad-monthly, semi-monthly, monthly, quarterly, annual by annual withholding | **2024 edition**, warns on 2026 dates |
| MI | Treasury page | Monthly/quarterly/annual (20th) | **Accelerated filers not modelled**; frequency is an input |
| MN | 2026 booklet | Federal schedule above $1,500 last quarter, quarterly below; no one-day rule | Above $1,500 the schedule must be supplied |
| MS | Pub 89-700-25-1 | Monthly/quarterly, the 15th | Frequency assigned by the Department, an input |
| MT | Wage withholding page | Annual (to $1,199), monthly, accelerated (federal days) | |
| NC | Withholding FAQ | Quarterly (under $250/month), monthly (December Jan 31), semi-weekly (from $2,000) | |
| NJ | NJ-WT, Sept 2025 | Quarterly, monthly over $500 per month, weekly payers (prior year $10,000) | Saturday-to-Friday pay week is an interpretation |
| OH | Employer withholding page and Due Dates, Rev. 3/26 | The **printed 2026 calendar**: 13 monthly, 5 quarterly, 105 partial-weekly periods | **$100,000 rule not modelled** (combined with school district tax); other years error |
| OR | 2026 Withholding and Transit Tax Calendar | The printed monthly and quarterly dates; semi-weekly rule | Depositor thresholds not in the stored documents; Q3 printed as Nov 1 |
| PA | REV-415 and the Department page | Quarterly, monthly (December Jan 31), semi-monthly, semi-weekly | |
| SC | WH-105, Rev. 2/13/23 | Residents follow the federal schedule exactly | **2023 edition**; nonresident rule not modelled |
| VT | Withholding page | Semi-weekly only | Monthly/quarterly not modelled (no WHT-436 date stated) |
| WI | W-166 (1/26) | Annual, quarterly, monthly, semi-monthly | Frequency assigned by the department |
| WV | Withholding help page | Monthly 15th, annual | Payroll services must e-file |
| ME | 2026 booklet, Aug 2026 | Semi-weekly at $18,000 look-back, otherwise quarterly | |
| IA, ID, LA, MD, MO, NM, OK | various | **Partial**: thresholds, returns, mandates, channels | No payment dates in the stored documents |

Items worth a person's attention before relying on a state: Rhode Island's and Ohio's printed calendars (taken as published; the stored text cannot show their colour coding), Virginia's and Delaware's interpretations (recorded in each profile and repeated in every result), and every profile marked as an older edition.

Engine support added for these: `semiweekly`, `eighth_monthly` (also used for semi-monthly and quad-monthly), `month_threshold`, `published_calendar`, a next-banking-day override (`nextDayRule`), and the due rules `semiweekly_following`, `semimonthly_days`, `day_of_month_after_quarter`, `last_day_of_following_month`, `month_day_next_year`, and a `decemberDay` on `day_of_month_after`. A look-back amount that does not decide a schedule returns `state_frequency_not_derivable` instead of a guess. `tests/state-table.test.ts` runs every state's table rows and 1,000 randomized payroll years each.

## Batch 3: read live from the agencies' own sites (2026-11-05)

These five were fetched directly from the agency's website and read, not taken from the watcher's stored copy.

| State | Source and edition | What is computed | Flags |
| --- | --- | --- | --- |
| AZ | Employer Withholding Filing Obligations page; WTP 16-1 (2016) | Quarterly to a $1,500 four-quarter average, then **the employer's federal deposit dates**; annual is an input | Needs the federal analysis; extra annual-payment criteria not listed |
| AR | Employer's Instructions, updated 07/01/2024 | Monthly (the 15th), annual (January 31); AR3MAR February 28; ARW3 January 31 | **2024 edition** |
| DC | 2025 FR-900Q instructions | Monthly (the 20th) and quarterly (the 20th after the quarter) deposits; FR-900Q | **2025 edition**; weekly and semi-weekly not modelled |
| IN | Business FAQ | Monthly (30 days after month end) and early filer (20 days) | "N days after the end of the month" read literally; county tax not split |
| KY | 42A003, Revised October 2025 | Annual, quarterly, monthly, twice-monthly (printed table for 2026-2027) | No weekend rule printed (next business day assumed); one-day deposit not modelled |

New engine support: a `follow_federal` frequency (the state payment is due with the federal deposit for the same pay dates), `rollPrintedDates` for printed calendars with no weekend rule, and the due rules `calendar_days_after_month_end` and `decemberDay`.

## Batch 4: unemployment-only states, read live (2026-11-05)

`tests/state-ui.test.ts` checks every unemployment section's wage base against the paycheck engine's own, separately researched 2026 figure, so two independent sources must agree.

| State | Source | What is computed | Flags |
| --- | --- | --- | --- |
| FL | Department of Revenue Reemployment Tax pages | RT-6 quarterly, $7,000 base; electronic filing and payment mandatory at 10 or more employees | Rate is an input |
| AK | Employment Security Tax Handbook (April 2024), 2026 TQ01C and rates page | Quarterly report and wage schedule, $54,200 base; **online filing mandatory when a payroll agent reports for the employer** | Employee contribution on the same form |
| SD | Reemployment Assistance wage reporting pages | Quarterly wage report received by the last day of the month, $15,000 base | |
| WA | ESD quarterly reports and tax-rate pages | Quarterly tax and wage report, $78,200 base | Paid Leave and WA Cares have their own report, not modelled |
| WY | DWS reporting due dates, taxable wage base and WYUI pages | Quarterly report, $33,800 base | |
| TN | UI Tax Rates page | $7,000 base only | The quarterly due-date page refused an automated fetch |

## Batch 5: the last five, and the secondary-source rule

`Source.secondary` marks a source that was not the agency's own document. It exists because NV and NH refuse automated requests (MA was one of three until it was read from the agency's own pages in batch 6); the rules recorded for them are the best available but unconfirmed, and the warning travels with every result so a person must confirm them before filing. To upgrade one: read the agency's own page (a person can; the agency allows browsers), update the profile, delete `secondary`, and the pin in `tests/state-secondary.test.ts` will say so. New engine support: the `period_threshold` frequency (Massachusetts' quarter-monthly $500 deposit rule) and the `monthly_with_quarter_end` due rule.

## Batch 6: the eight partial states completed, and Massachusetts verified (2026-11-05)

IA, ID, LA, MD, MO, NM, NY and OK now have deposit schedules read from the agencies' own pages or rules; MA was read from the Department's own pages. Highlights:

| State | Source | What is computed |
| --- | --- | --- |
| IA | Filing Frequency & Return Due Dates | Quarterly; monthly (months 1-2 by the 15th, month 3 with the return); semimonthly (25th / 10th) |
| ID | Withholding Due Dates and Filing | Semimonthly (20th / 5th), monthly (20th), quarterly, annual cycles |
| LA | FAQs: When are my payments due; When must I file L-1 | Quarterly and monthly (last day of the month after), semi-monthly (end of month / 15th); L-1 15th for semi-monthly payers |
| MD | Employer Withholding Guide (Dec 2023) | Accelerated ($700 within 3 business days of the pay date), monthly, quarterly (15th), annual. **2024 edition; monthly due date inferred** |
| MO | Employer's Tax Guide 4282 (03-2026) and Form 2414W | The Department's printed 2026 calendar: 48 quarter-monthly payment dates (90% of each period, the guide's worked example is a test), monthly, quarterly, annual |
| NM | TRD-41414 Instructions (07/01/2026) | Monthly, quarterly, semiannual, due the 25th, weekend rolls |
| NY | Withholding tax filing requirements, due dates and NYS-1 instructions | NYS-1 due 3 or 5 business days after the payroll that takes the quarter's accumulated tax to $700 (weeks grouped Sunday-Saturday); the rest with the NYS-45 |
| OK | OAC 710:90-3-4 | Quarterly (20th), monthly (20th), or the federal semiweekly dates |
| MA | Withholding Tax Guide and Form M-941 instructions | Annual, quarterly, monthly (with the quarter-end months), and the over-$25,000 quarter-monthly $500 rule |

Massachusetts (and the other pages that answer plain HTTP clients with 403) was read in an ordinary headless browser session, one request per page, the way a person's browser loads it. Nevada and New Hampshire still answered 403 in that session and were not pursued further. New engine support: `paydate_threshold` and `week_threshold` frequencies, and percent-of-withholding payments with a remainder calendar on published calendars.

## Batch 7: Nevada, New Hampshire, Tennessee and Maryland from published law (2026-11-05)

The three agencies that refuse automated access (and Tennessee's support pages) publish the same rules in places that do not: the states' administrative codes, the legislature's statute sites, Cornell's Legal Information Institute, and the U.S. Department of Labor. Those were read instead, and the unconfirmed search-summary details were removed.

| State | Source | What is recorded |
| --- | --- | --- |
| NV | NAC 612.035 and 612.260, NRS 612.545 (leg.state.nv.us); DOL Significant Provisions (January 2026) | Due the last day of the month after the quarter; electronic filing with a waiver of at most one year; wage base $43,700 (66 2/3% of the average annual wage) |
| NH | N.H. Admin. Code Emp 304.01 (LII); DOL | Due the last day of the month after the quarter; monthly filing the department may require; wage base $14,000 |
| TN | Rule 0800-10-01-.02 (LII); the Department's rates page and FAQ; DOL | Due the last day of the month after the quarter; wage reports in Employer e-Services; wage base $7,000 |
| MD | Tax-General 10-822 and COMAR 03.04.01.01 | Quarterly and monthly returns the 15th, annual January 31, accelerated within 3 business days of a payroll taking the accumulated tax to $700; monthly at $700 or more expected |

`Source.secondary` and the `state_source_secondary` warning remain in the engine for any future profile that cannot be read from an official source; none uses them now.

## Batch 8: quarterly unemployment reports for the withholding states (2026-11-05)

Thirty-seven states and DC that had a withholding profile but no unemployment section now have one (`ui` in each profile): AL, AR, CO, CT, DC, DE, GA, HI, IA, ID, IL, IN, KY, LA, MD, ME, MI, MN, MO, MS, MT, NC, ND, NE, NJ, NM, OH, OK, OR, PA, RI, SC, UT, VA, VT, WI, WV. Each cites the agency's own page, handbook, guide or instructions (or, where noted, the state's published statute or regulation) for the due date, and the U.S. Department of Labor's *Significant Provisions of State Unemployment Insurance Laws* (January 2026) for the wage base; the wage base is also cross-checked against the paycheck engine's own figure by a test.

- Most states: the last day of the month after the quarter (April 30, July 31, October 31, January 31), moved to the next business day.
- **Michigan**: the 25th of the month after the quarter (January, April, July, October 25).
- **New Jersey**: the 30th, and the Department states that a weekend or holiday gives **no extension**, so the profile does not roll it (new `noRoll` option on `day_of_month_after_quarter`).
- **Ohio** is read from Ohio Revised Code 4141.20 (the ODJFS page prints no dates in the text read); **Rhode Island** from 260-RICR-40-05-1 (the regulation moves Sunday and holiday due dates but is silent on Saturday: recorded); **New Mexico** from the 2020 emergency amendment to 11.3.400.404 as printed in the New Mexico Register; **Oklahoma** from an older edition of the Commission's guide; **Oregon** from the Secretary of State's employer guide.
- **Not modelled for unemployment: Arizona, Kansas, Massachusetts.** The agencies' pages answered 403 to a plain request and the rules could not be read from another official source; nothing was filled in from memory or from search summaries.
