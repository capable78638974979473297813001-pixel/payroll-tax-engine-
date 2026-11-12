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

Everything modelled is **withholding and its returns**, plus the **quarterly unemployment report** (due date, wage base, what it carries) for every state and DC except Kansas, whose labor agency pages refuse automated access and whose contributing-employer due date is not in the statute or regulation text that could be read. Kansas says NOT MODELLED for unemployment. **New-hire reporting** (deadline in calendar days, the directory agency) is modelled for all 50 states and DC; the paycheck engine's new-hire worklist (`payroll/newHireReporting.ts`) now uses each state's own number of days. Rate notices, charges, claims and benefit-side filings are not modelled anywhere. **Nothing is transmitted to any state**: no state transport is connected.

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
- Unemployment reporting (batch 8): Kansas is not modelled; every other state's section records
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
- **Arizona and Massachusetts** (agency pages refuse automated access) are read from their own rules as republished by Cornell's Legal Information Institute: Arizona Administrative Code R6-3-1704 and Massachusetts 430 CMR 5.03 and 5.06.
- **Kansas stays NOT MODELLED for unemployment.** K.S.A. 44-710 gives the last-day-of-month date only for reimbursing employers, K.A.R. 50-2-3 gives a weekend rule and a 25th-day rule for a newly liable employer's first payment, and neither states the regular date for contributing employers. The profile records what was read; nothing was filled in from memory or search summaries.

## Batch 9: new-hire reporting for every state and DC (2026-11-06)

Every state and DC now has a `newHire` rule (`daysFromStart`, the directory agency, a source) except none: 51 of 51. Territories (Puerto Rico, the Virgin Islands) are left out by decision.

- **Source:** the U.S. Department of Health and Human Services, Office of Child Support Services, *State New Hire Reporting Contacts and Program Information* matrix (fetched 2026-11-06; each profile cites its own state's entry and that entry's update date). It lists each state's reporting timeframe, directory website and contact. The state statutes were not separately read, except where the matrix entry names one (Arizona, Kentucky, New York, Pennsylvania, Virginia).
- **Shorter than the federal 20 days:** Alabama and Maine 7; Georgia and Vermont 10; Massachusetts, Rhode Island and West Virginia 14; Iowa and Mississippi 15. All others are 20. The days are calendar days; some states count from hire, some from the start date or first day of work (recorded per state in `notModelled`).
- **Maryland** is the exception to the source: the matrix entry gives no number of days, so the 20 days come from the Maryland Department of Human Services page.
- Federal law also lets an employer reporting electronically or by magnetic medium transmit twice a month, 12 to 16 days apart; the deadline recorded is the non-magnetic one the matrix lists. Data elements, transmission methods and independent-contractor rules are in the matrix and were not transcribed.
- `deadlineDaysForState()` (the HR worklist) now reads the state's profile; it falls back to the federal 20 only for the territories and unknown codes.

## Batch 10: stale notes removed, agency holiday lists (2026-11-06)

- **Stale "not read" notes removed or reworded (116 notes).** The unemployment-insurance and new-hire notes that said "not read" were left over from before batches 8 and 9. They are gone from every profile that now models those; the notes that named a second program were reworded to name only what is still unread (Colorado FAMLI, Minnesota Paid Leave, Oregon Paid Leave, Rhode Island temporary disability, DC Paid Family Leave, Connecticut paid leave, New Jersey disability and family-leave deposits, Ohio municipal and Pennsylvania local taxes). Puerto Rico and the Virgin Islands keep theirs. 409 notes remain across the profiles.
- **Legal-holiday lists, from the agency's own list only.** California (EDD's observed-legal-holiday table, 2026), Delaware (Division of Revenue's holiday table, 2026-2029; 2026 and 2027 loaded, verified) and Minnesota (Department of Revenue's withholding holiday schedule, 2026) now apply their holidays to due dates. California and Minnesota publish 2026 only, so they keep a warning for other years (`calendar.holidays.years`). **Every other state still skips weekends only and warns.** A state *employee* holiday schedule was deliberately not substituted: those lists differ from the tax agencies' (Minnesota's Emancipation Day, Delaware's county-only Return Day, California's Lunar New Year), and applying a holiday the agency does not observe could push a computed due date later than the real one, whereas skipping an observed holiday only ever computes an earlier, safe date.
- California's EDD table prints February 17, 2026 both as Lunar New Year (next business day February 18) and as Presidents' Day's next business day (February 17). The date is left out of the holiday dates so the computed date is never later than either reading.
- Colorado's Department of Revenue holiday page and Wisconsin's DOR calendar were found but not used (Colorado's answers a bot challenge; Wisconsin's calendar prints legal holidays inside a property-tax calendar whose columns could not be read reliably).
- **Unemployment penalties and electronic-filing rules read from the stored agency texts** and added to the quarterly return for AR, DC, HI, IA, ID, ME, MD, MT, NC, ND, NE, OK, PA and WI (late-report and late-payment penalties, interest, and where the text states them the electronic-filing size threshold: NC 10 or more employees, WI 25 or more with a $25 paper penalty, PA mandatory). The generic "penalties were not read" note is narrowed to file formats and portal enrollment for those states; the others still carry the wider note.

## Batch 11: notes consolidated (2026-11-06)

Stored `notModelled` entries fall from 409 to 291 without dropping any fact. Gaps that were the same in every profile are stated once in code (`COMMON_NOT_MODELLED` in `payroll/state/profile.ts`) and `notModelledFor(profile)` returns a profile's own notes followed by the common ones that apply to it:

- **File formats and portal enrollment** (was repeated in about 40 profiles): the agencies' bulk-upload specifications and enrollment steps were not read beyond what each profile's `channels` records.
- **New-hire details** (was 49 copies): the federal matrix's data elements, transmission methods and independent-contractor rules were not transcribed. The per-state clock (from hire or from the start date) is already in `newHire.form`.
- **Legal-holiday lists** (was about 40 copies): derived from `calendar.holidays.verified`; the runtime warning is unchanged.
- **Weekend or holiday rule not printed by the source** (was 20 copies): now `ui.weekendRuleStated: false` (or `withholding.weekendRuleStated`), and the common note is derived from it. AL, AR, DC, DE, HI, IL, IN, LA, ME, NC, NE, NH, NV, OH, OK, SC, TN, UT, VA, WV. States with a more specific weekend finding (MA, MD, RI, VT, SC's contrary source summary) keep their own note.

What remains stored is specific to a jurisdiction: an unread rule, an older edition, a deliberate exclusion, or a source conflict.

## Batch 12: editions refreshed and one threshold found (2026-11-06)

- **Arkansas** now reads the DFA employer instructions effective 01/01/2026 (revised 4/27/26) and **Utah** Publication 14 Rev. 4/26; both state the same deposit rules as the older editions read before, so `rulesYear` is 2026 and the "older edition" notes are gone.
- **South Carolina**: the Department's live withholding page confirms the 2023 guide's resident and nonresident payment rules and the return dates, so the rules are read for 2026 (the guide itself stays the 2023 edition and the profile says so).
- **Kansas**: the Department's live KW-100 is still Rev. 10-24 and its forms page lists no newer one, so the October 2024 guide is the current edition; the rules-year warning on 2026 pay dates is gone.
- **Hawaii**: the Department's withholding FAQ states what the booklet text lacked: above $40,000 of annual liability the schedule is semi-weekly (Wednesday for wages paid the preceding Wednesday to Friday, Friday for Saturday to Tuesday). The look-back now derives it, and the profile records the electronic-filing and electronic-payment mandates over $40,000 (with their $25-per-form and 2% penalties). Booklet A (Rev. 2025, 12/1/2025) is the current edition.
- Still older than the year: New Jersey (September 2025 NJ-WT; the Division's forms page could not be read to confirm nothing newer), Connecticut, DC, Delaware (no edition date on the page), Maryland.
- Stored notes: 286.

## Batch 13: remaining current-effect items closed (2026-11-06)

- **Pennsylvania local taxes**: the DCED statewide EIT/LST register downloaded 2026-11-06 was compared with `data/local/PA-EIT-LST-2026.json` for every municipality (resident, nonresident and school-district EIT, total resident rate, municipal and school-district LST, low-income exemptions). Nothing differs except Collingdale Boro, Liberty Twp and Springfield Twp, whose register rate is the 1% EIT the file already schedules for 2026-07-01 over a 0 base. Philadelphia and McKeesport Area SD are unchanged.
- **Rhode Island tipped cash wage**: $3.89 confirmed in R.I. Gen. Laws 28-12-5(c); the engine was already correct.
- **Local exceptions, read 2026-11-07 from the cities' and county's own pages** (the user approved the TinyFish reader after plain fetches returned 403/404):
  - **Petaluma**: $18.31 for 2026 confirmed; the city already publishes **$18.93 from 2027-01-01** (3.4% CPI-W step), which the 2027 file now carries. Learner wage (age 14-17, first 160 hours, no related experience): city prints $15.56 for 2026 and $16.10 for 2027, recorded as informational variants (the engine cannot see age or experience). 85% of $18.31 rounded to the nearest five cents would be $15.55; the printed $15.56 is stored as published and the discrepancy is noted on the variant. The ordinance text (Municipal Code 8.35) was bot-blocked and not read.
  - **Sonoma**: $18.47 (26 or more employees) / $17.38 (25 or fewer) confirmed. Learner: age 14-17, not less than 85% of the local rate rounded to the nearest nickel for the first 160 hours. The page prints no learner dollar figure, so only the rule is recorded (on the source note). No 2027 rate is posted yet.
  - **Fremont**: $17.75 (2025) and $18.05 (from 2026-07-01) confirmed; the page says the ordinance exempts employees of non-profit corporations (recorded; the engine cannot see employer type). The 2027 rate is "2026 wage plus inflation adjustment", not yet published.
  - **Cook County**: the county's own 2026-06-01 notice confirms $15.40 / $9.25 from 2026-07-01 and the coverage test (employer with four or more employees; employees over 18). **No training-wage reduction appears on any page the county publishes that was readable; the ordinance text itself (Code ch. 42, art. XI) was not readable, so that exception stays unverified.**
- **Defect found and fixed while doing this**: thirteen 2027 local entries (11 California cities, Flagstaff, Santa Fe) whose rate was raised for 2027 still carried the 2026 tipped cash wage, so a tipped query returned the old rate even though none of those jurisdictions allows a tip credit. The tipped cash wage now equals the rate, and a test covers every 2027 local file.

## Batch 14: paired-field sweep over the 2026 minimum-wage data (2026-11-07)

A script compared every dollar field with its cents twin, checked that a no-tip-credit jurisdiction's cash wage equals its rate, and that cash wage plus maximum tip credit equals the rate where a credit is allowed. It then queried the engine for every state and local jurisdiction on six 2026 dates and six employee counts, tipped and not, and flagged any tipped answer above the standard answer or any no-credit city whose tipped answer differed.

- **Data files**: no mismatch. The one exception is intended: South Dakota's $5.925 tipped wage keeps its half cent (documented on the file).
- **Engine defect found and fixed**: a tipped query for a city that allows no tip credit used the single tipped figure stored on the city (its large-employer rate) and ignored employer-size tiers. Hayward and Novato returned $17.79 and $17.46 for employers below their thresholds (whose floor is the $16.90 state rate), and Novato returned $17.46 for employers of 100 or more whose standard rate is $17.73, an underpayment. Those queries now use the tier-aware standard rate. A regression test pins Hayward and Novato.

## Batch 15: whole-data consistency sweep (2026-11-07)

Beyond the minimum-wage sweep in batch 14, every data file was checked for dollar fields that disagree with their cents twins, for the research and normalized unemployment blocks disagreeing, and for year fields that disagree with the file name. The engine was then run for all 50 states and DC on four 2026 dates, three pay frequencies and six pay levels (no throws; every line a non-negative whole number of cents; employee and employer totals equal the sum of the lines; net pay equals gross less deductions less employee tax; state income tax does not fall as pay rises), and for the same inputs across 2025, 2026 and 2027 to look for unexplained jumps. The checks are now `tests/data-consistency.test.ts`.

- **Fixed**: Missouri's and West Virginia's 2027 research blocks still showed the 2026 wage base ($9,000) and new-employer rate (2.7%); they now match the normalized block the engine reads ($8,500 and 2.511%). No paycheck effect, since the engine reads the normalized block.
- **Seven 2026 new-employer rates were backed only by a secondary table (OnPay)**: Colorado, Maine, North Dakota, Pennsylvania, Tennessee, Vermont, Wisconsin. The Department of Labor's January 2026 table (read directly) confirms North Dakota 1.00%, Pennsylvania 3.822%, Tennessee 2.70% and Vermont 1.00%, which are now marked primary. It lists only a BASE rate for the others: Colorado 1.53% (engine 3.05%), Maine 2.23% (engine 2.54%), Wisconsin 2.50% (engine 3.05%). The engine's higher figures are all-in estimates that could not be confirmed because the states' own pages refuse automated reads (Colorado and Maine 403; Wisconsin's 2026 schedule page was not readable). They are kept, marked as estimates in the file, and a test fails if any carried rate drops below DOL's base. The result is a default for an employer that has not supplied its assigned rate; the three states do not require one.
- **Reviewed and left as is**: Maryland's new-employer rate is deliberately empty (the state publishes a 1.0%-10.5% range, so the employer must supply its rate); California's FUTA shows 0.6% for 2026 because the credit-reduction determination is made after this ruleset (the result text says so); South Dakota's half-cent tipped wage.
- **Still not covered by a sweep**: whether an employee's address maps to the right municipality or school district, and whether a value is consistent but wrong at the source.

### Batch 15 addendum: Colorado, Maine and Wisconsin new-employer rates (read 2026-11-07)

The states' own pages, read through the TinyFish reader after plain fetches returned 403:

- **Colorado: confirmed, and one 2027 error fixed.** CDLE's Introductory Rates page: 2026 non-construction (also general construction and trades) is 0.0153 beginning + 0.0017 support + 0.0135 solvency surcharge = **3.05%**, matching the engine. For **2027** the solvency surcharge is not in effect, so the combined rate is 0.0153 + 0.0017 = **1.70%**; the 2027 file had carried the 2026 figure (3.05%) and now has 1.70% with a log entry. Wage base $30,600 (2026) and $32,100 (2027) confirmed. Heavy construction (6.285% in 2026, 4.06% in 2027) is not modelled.
- **Wisconsin: confirmed.** DWD's 2026 and 2027 tax-rate pages: new employer, payroll under $500,000, non-construction: basic 2.50 + solvency 0.55 = **3.05%** in both years (matching the engine); payroll of $500,000 or more 3.25%; construction 2.50% / 2.70%. Wage base $14,000. Only the 3.05% case is modelled.
- **Maine: still unconfirmed.** Maine DOL's employer FAQ confirms the $12,000 wage base, but the 2026 tax-rate PDF is unreachable (403 to a plain download, unreachable through the reader). The DOL January 2026 base rate is 2.23%; the engine carries 2.54% (secondary). It stays marked as an estimate.

## Batch 16: Connecticut bartender tipped wage selectable (2026-11-07)

- **Defect**: the data carried Connecticut's bartender cash wage ($8.23) as a variant, but nothing in `minimumWage()` could select it, so every tipped lookup returned the hotel and restaurant staff figure ($6.38). A bartender paid on that floor would be $1.85 an hour short, $74.00 over 40 hours, before tax.
- **Statute**: Conn. Gen. Stat. 31-60(d)(3), read 2026-11-07: "employer's share" means $6.38 per hour for persons, other than bartenders, in the hotel and restaurant industry who customarily and regularly receive gratuities, and $8.23 per hour for bartenders who do.
- **Fix**: `occupation: 'bartender'` now selects the bartender variant (2026 and 2027). Without it the answer is still $6.38, but the result's caveat now says bartenders are owed $8.23, so the lower floor is never returned silently. The occupation list in the paycheck extras validator and the example server accepts `bartender`.

## Batch 17: local ordinance text read (2026-11-07)

The user supplied the ordinance and rule text for the three local exceptions that the cities' pages could not settle.

- **Petaluma (Municipal Code ch. 8.35)**: one CPI-W adjusted wage for all employers since 2021-01-01 (the 2020 size tiers ended); no tip credit; collective bargaining waiver. Learner (14-17, first 160 hours, no related experience) is not less than 85 percent of the minimum wage rounded to the nearest five cents, which is **$15.55** for 2026 ($18.31), not the $15.56 the city's web page prints; the stored informational variant now holds $15.55 and says so. 2027 is $16.10 under both the ordinance and the city's page.
- **Sonoma (Municipal Code ch. 2.80)**: large employer 26 or more, small 25 or fewer, counted across the whole enterprise including outside the city (a franchisee is not small if its franchise network exceeds 25); annual increase of 3.5 percent or an index, whichever is less; no tip credit; governmental agencies and collective bargaining waivers. Learner is 85 percent rounded to the nearest nickel, first 160 hours: **$15.70** (large) and **$14.75** (small) for 2026, computed from the ordinance because the city prints no learner figure; recorded as informational variants.
- **Cook County**: the County's June 2026 notice gives the coverage test (four or more employees, or a domestic worker, and a Cook County business facility or license). The older 2018 rules were dropped from the data: nothing in the engine reads them and they disagree with the County's current FAQ.
- **Fremont**: the ordinance text was not supplied; the city's page (non-profit employees exempt) remains the only source.

### Batch 17 addendum: Cook County trainees and youth (2026-11-07)

- **County FAQ (July 2026) question 11**, as supplied by the user (this session did not load the page): employers may pay up to 50 cents under the County wage during the first 90 days of employment; not for day laborers or temporary or seasonal workers; after 90 days the full County wage. **Question 5**, as relayed: workers under 18 are outside the County ordinance and fall under the Illinois youth rate of $13.00.
- **Illinois statute read directly** (820 ILCS 105/4): (a)(2) an employer may pay an employee 18 or older, in the first 90 consecutive calendar days, up to 50 cents under the $15.00 wage ($14.50), except day or temporary laborers; (a)(3) an employee under 18 who has not worked more than 650 hours for the employer in the calendar year is paid $13.00 (after 650 hours, the adult wage). Illinois's `youthAndTraining` was empty and now carries both.
- The FAQ's reduction ($15.40 - $0.50 = **$14.90**) is stored as the informational Cook trainee variant; the Illinois statute figures ($14.50 and $13.00) are in Illinois's youth and training list. The statute confirms the FAQ's $13.00 under-18 figure.
- The engine cannot see tenure, age or worker type, so the headline $15.40 binds either way.

## Batch 18: local tax re-check against current sources (2026-11-07)

Each local dataset was diffed against a fresh download of its official source.

- **Ohio municipal income tax (Ohio Department of Taxation's Finder feed):** 679 of 679 open rows match. Four entries differ from the feed on purpose and each carries a dated note and local source: Indian Hill 0.5% (feed 0.45%), Washington 1.75% (feed 1.95%), and the added Germantown, North Hampton, Stockport and Woodville.
- **Ohio JEDD and JEDZ zones:** all 153 zones in force match the feed.
- **Ohio school district income tax:** all 214 districts with a 2026 rate match the feed. One data error fixed: James A. Garfield LSD (district 6704) carried Rootstown LSD's IRN (49213); the Finder lists it as 49205. The IRN is not used in any calculation (districts are looked up by district number), so no paycheck was affected.
- **Indiana county income tax:** all 92 counties match Departmental Notice #1 (R47 / 10-26, effective October 1, 2026); Boone is the only changed county (1.71%).
- **Pennsylvania EIT and LST:** checked earlier today against the DCED register (all municipalities).
- **Maryland county rates:** all 24 jurisdictions, including Anne Arundel's and Frederick's tiers, match the Comptroller's 2026 attachment.
- **New York:** the New York City and Yonkers tables (NYS-50-T-NYC and NYS-50-T-Y, 1/26) contain 219 of the 222 stored figures; MCTMT thresholds and zone rates for quarters from July 1, 2025 match the Tax Department's page exactly.
- **Oregon:** Workers' Benefit Fund 1.8 cents per hour (DCBS page), TriMet 0.8237%, Lane Transit 0.80% and the statewide transit tax 0.1% (Oregon Department of Revenue 2026 combined payroll tax report) match. Oregon announced a 2.2-cent WBF rate for 2027 that is still proposed; the 2027 file keeps 1.8 cents.
- **Alabama municipal occupational tax:** the League's page matches except Opelika (1%, city's own announcement) and Tuskegee (3%, the city's own form); both are documented overrides of the League's survey.
- **Michigan cities:** only Grand Rapids was re-read against its city page (1.5% resident, 0.75% nonresident, since July 1, 2010). The other 23 cities, Kentucky occupational taxes, Colorado, Missouri, Pennsylvania's Pittsburgh payroll tax, Seattle's payroll expense tax, West Virginia service fees, Newark and Wilmington were not re-read.

## Batch 19: Michigan cities and Kentucky occupational taxes re-checked (2026-11-07)

- **Michigan (24 cities).** Michigan's City Income Tax Act (MCL 141.503, 141.503a-c, 141.611) fixes the rate structure: the uniform ordinance is 1% resident / 0.5% nonresident unless the city's governing body adopts a lower rate; Detroit may levy up to 2.40% / 1.20% (141.503(2)(d)); Grand Rapids and Saginaw 1.5% / 0.75% and Highland Park 2% / 1% are the stored higher rates. Ten cities state their rates on their own pages today and all match: Grand Rapids (1.5% / 0.75% since July 1, 2010), Saginaw (1.5% / 0.75%), Flint, East Lansing, Ionia, Jackson, Muskegon, Portland, Benton Harbor and Big Rapids (1% / 0.5%). The other 14 (Albion, Battle Creek, Detroit, Grayling, Hamtramck, Highland Park, Hudson, Lansing, Lapeer, Muskegon Heights, Pontiac, Port Huron, Springfield, Walker) publish no rate on the pages that load without a browser, so they rest on the statute and the earlier Treasury-list read. A city that adopted a lower rate by resolution would not be caught.
- **Kentucky (256 entries).** The Secretary of State's occupational tax database (KRS 67.766) offers an Excel export of every district; it was downloaded today (228 districts). Every district with a rate shown agrees with ours; the differences are text only (for example "$75 Flat Fee" against "$75 flat") or districts where the state's own list is stale or blank and we hold a newer city source (Somerset 1.2% from 2026, the state shows 0.6% from 2018). The four districts the state changed in 2026 are consistent with the file: Brandenburg, Walton, Salem (1%), Whitesville (1.15% from January 1, 2027, already scheduled). Louisville Metro (2.2% resident including the school board, 1.45% nonresident) matches the state row exactly; Lexington-Fayette's 2.25% matches the state row and our 2.75% resident figure adds the school board's 0.5%. All 87 county payroll rates match KACo's 2026 table.
- No data changed in this batch.

### Batch 19 addendum: Michigan cities, completed (2026-11-07)

Twenty-three of the 24 cities now have their rate confirmed from the city's own page, form or booklet (listed with their sources on the Michigan file): Detroit's 2.4% / 1.2% is confirmed by the Michigan Treasury's own TY2025 withholding guide and TY2026 estimated-tax form; Highland Park is 2% / 1%; Grand Rapids and Saginaw 1.5% / 0.75%; the other 19 read 1% / 0.5%. **Muskegon Heights** is the one city whose own site and tax portal state no rate; East Lansing's FAQ lists it among the communities with the standard 1% resident rate, so its 1% / 0.5% rests on the statute and that listing, and the project owner confirmed it directly on 2026-11-07. No rate changed. A test now pins all 24.

## Batch 20: city payroll and head taxes re-read (2026-11-07)

Each figure below was read from the city's own page or form today; nothing needed to change and a test now pins them.

- **Colorado head taxes:** Denver $5.75 employee and $4.00 employer at $500 or more a month; Glendale $5 and $5 above $750; Greenwood Village $2 and $2 at $250 or more; Sheridan $3 and $3; Aurora's tax was repealed effective January 1, 2025.
- **Missouri:** Kansas City 1% earnings tax; St. Louis 1% earnings tax and the employer's 0.5% payroll expense tax.
- **Pittsburgh** payroll expense tax 0.55% (the city's 2025 annual financial report, published June 2026).
- **Seattle:** the 2026 payroll expense tax form matches every threshold ($9,074,409 payroll, $194,452 and $518,538 compensation, $129,634,413 and $1,296,344,132 tiers) and all six rates; social housing tax 5% above $1,000,000.
- **Newark** payroll tax 1% (the city's page also describes a reduced 0.50% for employers whose workforce is more than half Newark residents, which the engine discloses but cannot apply from one paycheck). The $2,500 quarterly threshold rests on the city's older booklets (the 2026 booklet could not be opened) and was confirmed by the project owner on 2026-11-07.
- **Wilmington** wage tax 1.25%: Delaware Code Title 22 ch. 9 caps it at 1.25% and a municipal document states the rate; the city's own wage tax page would not load, and the project owner confirmed the 1.25% on 2026-11-07.
- **West Virginia city service fees:** already sourced city by city to ordinances and forms (Charleston $3 a week confirmed on the city's own page).
- **Michigan, Muskegon Heights:** confirmed by the project owner.

## Batch 21: Kentucky, Michigan and Vermont withholding read from the agencies (2026-11-07)

- **Vermont:** the Department of Taxes' GB-1210-2026 (effective January 1 to December 31, 2026) was read through the TinyFish reader; all 108 stored figures (rates, bracket limits, base amounts and the withholding allowance) appear in it. Earlier this was the one state where the agency PDF was a bot-check page and nothing could be compared.
- **Kentucky:** the Department of Revenue's 2026 withholding formula and withholding tax tables state the 3.5% flat rate and the $3,360 standard deduction (an increase of $90), matching the file.
- **Michigan:** the Treasury's 2026 withholding information states the 4.25% rate and the $5,900 personal exemption ($5,800 in 2025), matching the file.
- Test added for all three.

## Batch 22: engine checked against the agencies' own tables (2026-11-07)

Most states' formulas were already proven against the agency's published worked examples when they were built (Iowa's ten examples, Georgia's, California's six, Utah's six, Delaware's three, Rhode Island's, Missouri's and others; they are in the test suite). The states with no such proof were Massachusetts, New Jersey, Connecticut and Ohio, and Massachusetts's formula had been rebuilt from a secondary source because Circular M could not be fetched.

- **Massachusetts: Circular M (2026) read and the engine compared with it.** All 102 weekly, 102 biweekly, 102 semimonthly, 102 monthly and 100 daily wage-bracket rows, each at 0 to 10 exemptions (1,859 cells where the table's own assumptions apply), match the engine to the cent, with one exception that was a real defect: **daily pay.** Circular M's daily tables divide the annual figures by 365 (one exemption is $12, the no-withholding floor $22, the head-of-household credit $0.33, the blind credit $0.30). The engine used its generic 260 workdays, so a daily-paid employee with an exemption was withheld too little (for example $0.59 instead of $0.83 on $31) and was treated as under the no-withholding floor up to about $31 instead of $22. Fixed with a per-frequency divisor in the Massachusetts data (`annualizeMultiplier: { daily: 365 }`, 2026 and 2027) and tests from the table's own cells. The 2025 file was not changed because the 2025 Circular was not read.
- **The six remaining differences are not defects.** They are the table rows that straddle the no-withholding floor ($333 semimonthly, $667 monthly): the table prints a figure for the whole row, while the percentage method (and the engine) withholds nothing below the floor.
- **Table versus percentage method above about $500 a week.** The wage-bracket tables cap the FICA deduction at $2,000 divided by the pay periods in each paycheck, so for wages above that point they withhold slightly more than the percentage method, which caps the deduction at $2,000 cumulatively over the year. The engine follows the percentage method (Circular M step 1: "When, during the year, the total amount subtracted reaches the equivalent of the $2,000 maximum ... discontinue this step"), so it can differ from a table lookup by up to a few tens of cents on a single high-wage paycheck early in the year.
- The surtax threshold ($1,107,750) and the step order of the percentage method also match the Circular.

## Batch 23: engine compared cell by cell with the agencies' wage-bracket tables (2026-11-07 / 08)

Each agency's own wage-bracket table was downloaded, parsed, and every cell compared with what the engine returns for the same wage, filing status and allowance count (wage taken at the middle of each row unless the table says otherwise). Differences of more than a dollar (cents for Georgia and Wisconsin) were investigated.

**Defects found and fixed (all the same class: daily pay annualized at the generic 260 workdays, where the agency's daily table is built on 365 days; Massachusetts was fixed in Batch 22):**

- **Hawaii (Booklet A):** the daily allowance ($3.13) and lump sum ($11.92) are $1,144 and $4,350 divided by 365. The engine returned $0.88 for a $65 daily wage at zero allowances; the table gives $2.
- **Georgia (G-4 Tables E and F):** the $30,000 / $15,000 deductions are $82.19 / $41.10 a day. 776 daily cells were wrong.
- **Wisconsin (W-166):** the daily table's cents-precision rows are reproduced only at 365 ($61.50 a day gives $1.70, $96.50 gives $3.60).
- **Minnesota (withholding instructions):** the daily table is reproduced by 365 (692 of 748 cells exactly, the rest .5 rounding ties); 260 left 308 cells off.

Each now carries an `annualizeMultiplier` of `{ "daily": 365 }` in its 2025, 2026 and 2027 files (the mechanism already used by Delaware, Louisiana, Massachusetts and others), with regression tests in `tests/data-consistency.test.ts`.

**Compared with no difference:**

| State | Cells compared | Result |
| --- | --- | --- |
| Hawaii | 41,987 (weekly, biweekly, semimonthly, monthly, daily; single and married; 0 to 10 allowances) | 0 differences after the fix |
| Georgia | 14,300 (Tables A to D, five frequencies, 0 to 10 dependents) | 0 differences after the fix |
| Wisconsin | 17,710 including the "excess over" formula rows | 0 differences after the fix |
| North Carolina | 23,760 (NC-30 wage-bracket tables, single/married and head of household) | 0 differences |
| North Dakota | 2,664 (2020-and-later W-4 tables, three statuses, five frequencies) | 0 differences |
| Kansas | 11,440 (KW-100 tables) | 11,436 match; 4 cells are row-boundary cells where the engine's unrounded value is about $1 above a table 0. The tables count the first allowance as $9,160 (two for married) and each later one as $2,320, which is how the certificate fields map |
| Utah | all 8 schedules, single and married | every base allowance and threshold in the data equals the Publication 14 figure |

**Where the agency's own publications disagree with each other (engine follows the formula; not changed):**

- **Montana:** the 2026 wage-bracket tables differ from the Guide's own formula by up to about $3 a period (for example, monthly $1,300 to $1,400: table $3, formula $0, and the table fits a zero point near $1,281 to $1,331 against the formula's $1,342). 750 of 1,440 cells differ. The engine implements the formula.
- **Minnesota:** the printed "percent of the excess over" rows at high wages are linear approximations; with two or more allowances the engine's exact calculation differs from them by up to a few dollars (152 cells).

**Not compared:** Alabama and Mississippi (table layouts that did not parse reliably), California Method A (the engine implements the exact method), Arkansas, Nebraska, Rhode Island and New York tables.

### Batch 23 addendum: Mississippi, Nebraska, Rhode Island, Arkansas (2026-11-08)

- **Mississippi: defect found and fixed.** The Department of Revenue's own 2026 Table D (married, both spouses employed) is reproduced by the full $4,600 married standard deduction in all five payroll periods (16,836 of 17,234 cells exactly, the rest within $1 on .5 ties). The engine had used half ($2,300) from Section 13(d)'s "divided equally" sentence and a USDA NFC bulletin, so a married-both-employed employee was over-withheld by about $92 a year ($1.77 a week). At monthly $3,000 with no exemption the table gives $72 (same as Table C) and the engine had returned $79. Fixed in the 2026 and 2027 files; the 2025 file is unchanged because no 2025 table was read. Tables A, B and C: 28,660 cells compared in all, 10 differ, all in places where the printed table itself is odd (for example Table C weekly, $430 to $510, exemption $12,000 column, prints a short ramp that the percentage formula cannot produce). Mississippi's daily table uses 260 days (checked, no override needed).
- **Nebraska:** 13,860 cells (Circular EN, five frequencies, single and married, 0 to 10 allowances): every figure the table prints matches to the cent. Where the table prints "-", the engine's figure is always under $0.50.
- **Rhode Island:** 6,600 cells, cent for cent.
- **Arkansas low-income tables:** the data file matches the *current* DFA PDF (the older URL carries superseded figures, for example $0.56 against the current $0.55 at $281.61 weekly). All 734 wage bands in the current PDF exist in the data; rows were compared on the left-hand table only because the PDF prints two tables side by side.

### Batch 23 addendum 2: the previously uncompared tables (2026-11-08)

No engine change came out of these; each is recorded so the limits are known.

- **New York State (NYS-50-T-NYS, 2026), Method I tables I to V:** 6,567 cells, single and married, 0 to 10 exemptions. Largest difference $0.13; the tables print in ten-cent steps. **New York City (NYS-50-T-NYC):** 14,850 cells, 14,806 within 6 cents; the other 44 are rows the PDF wraps across lines (the engine's figures there are in line with the neighbouring rows). Yonkers tables not compared.
- **California (DE 44 Method A tables 3 to 17):** 5,687 cells above the low-income exemption threshold (the tables print rows below it, which are never used). 5,327 match within $1. The other 360 are all in two married tables, **biweekly (Table 7) and daily (Table 16), for employees claiming 2 or more allowances**: those two printed tables omit the larger standard deduction that Method B, and the weekly, semimonthly and monthly married tables, apply at 2 or more allowances (up to about $5 biweekly, $1.50 daily). The engine implements Method B, which DE 44 calls the exact method; it was not changed.
- **Alabama (Pub A-4 tables, 115,200 cells across weekly to annual):** the booklet's formula subtracts "the actual Federal withholding for this payroll period", which the printed tables cannot know, so they embed an unstated federal assumption. Against the engine (which uses the real federal figure) every weekly cell is within $2, biweekly and semimonthly within $5, monthly within $15; the implied federal assumption is a steady 1% (single) to 4% (married) away from the engine's, which accounts for the growth with pay period. The formula, standard-deduction schedule, personal exemptions and dependent tiers are the booklet's own. The tables cannot be matched exactly by any employer's software.

### Batch 23 addendum 3: Yonkers, Louisiana, North Dakota pre-2020 forms (2026-11-08)

- **Yonkers resident surcharge (NYS-50-T-Y tables I to V):** 5,819 cells, largest difference 4 cents.
- **Louisiana (Form L-1 tables):** weekly, biweekly, semimonthly, monthly and annual tables: 2,173 cells, no difference. **Daily table: the booklet disagrees with itself.** Its formula page says daily pay uses 365 pay periods (12,875 / 365 = $35.27 a day of standard deduction, which is what the engine does), but the printed daily table is reproduced only by 260 periods ($49.52 a day). The engine follows the formula; the printed table withholds up to about $0.44 a day less. Not changed.
- **North Dakota, employees on pre-2020 W-4s:** the daily table matches. The weekly to monthly wage-bracket tables withhold more than the booklet's own percentage method (which the engine implements with the stated $97 weekly / $420 monthly allowance): the tables are reproduced by an allowance of about $85 weekly / $360 monthly, with the gap growing from $2 to about $11 a month at 10 allowances. The agency's tables and its stated method disagree; the engine follows the stated method.

### Batch 24: 2026 open items (2026-11-08)

- **FUTA credit reduction, 2026:** DOL's *potential* list was read directly (potential_credit_states_2026.xlsx): California 1.5% outstanding-advance reduction plus an estimated 3.8% benefit-cost-rate add-on, 5.3% in total, and the U.S. Virgin Islands 4.8%. The final list is determined after November 10, 2026, and a state can repay before then (Connecticut and New York did in 2025), so nothing is applied. The ruleset now records the potential list, and a FUTA line for a listed state says so in its detail text. When DOL publishes the final list (a few days after November 10), move the confirmed states into `futa.creditReduction.states` in `data/federal/2026.json`; a California employer's FUTA would then be 5.9% on the first $7,000 ($413 a year) instead of 0.6% ($42), retroactively for the whole year.
- **Maine new-employer rate:** the official PDF still cannot be read in full, but a search result quoting it gives 2.23% plus 0.14% (CSSF) plus 0.17% (UPAF), which sums to the 2.54% carried. Still tiered as cross-source, with the quoting noted.
- **Maryland:** the state publishes only a range (1.0% to 2.6%) for new employers, so the file requires the employer's assigned rate; unchanged.
- **Left as the agency's formula** (see the Batch 23 addenda): Montana table versus formula, Minnesota high-wage approximation rows, California biweekly and daily married tables, Louisiana's daily table, North Dakota pre-2020 tables, Alabama's federal-withholding assumption. In each the agency's own documents disagree with each other and the formula is the stated rule.

### Batch 24 addendum: the table-versus-formula disagreements, resolved (2026-11-08)

Re-examined with the rule that a wage-bracket table is usually the formula evaluated at one point in each wage row and rounded.

- **Montana: not a disagreement.** The printed tables equal the Guide's formula evaluated at the **top** of each wage row and **rounded up**: 1,421 of 1,440 cells reproduce exactly and the other 19 are off by one dollar at a bracket edge. The engine's formula is the exact value; a Montana table is a slightly conservative version of it (up to about $3 a period more near the bottom of the schedule, because the zero bracket is entered at the row top). Nothing to change. This corrects the Batch 23 note, which treated it as an unexplained gap.
- **Maine: the printed tables were not regenerated for the August 2026 revision.** They are reproduced (87% of cells, the rest are parsing losses in the merged semimonthly/monthly married pages) by the **pre-revision** deduction ($12,450 single, $27,750 married) evaluated at the top of each row. The revised percentage method on the same booklet (Step 3: $12,850 / $28,550, plus the surcharge above $1,000,000 / $1,500,000) is what the engine follows from 2026-08-01. A payroll run from the printed Maine table therefore withholds roughly $2 a week more on a $1,000 weekly wage than one run from the revised method.
- **Left as the stated rule, with the reason:** Louisiana daily (the formula page says 365 periods; the printed daily table is built on 260), California Method A biweekly and daily married tables (Method B is DE 44's exact method and the weekly, semimonthly and monthly married tables agree with it), North Dakota pre-2020 W-4 tables (the booklet's own percentage method states the $97 / $420 allowance), and Alabama (the tables embed a federal-withholding assumption the formula cannot know). In each, switching to the printed table would make the engine disagree with the rule the same document states.

## Batch 25: three reported changes checked against official sources (2026-11-09)

A reviewer reported two changes that affect paychecks and one missing tax. Each was checked; two needed code or data and one was already right.

- **Salem, Kentucky: real, fixed.** City Ordinance No. 2026-05 (read directly from cityofsalemky.gov/occu; the pages are scanned images, read visually) sets 1.00% of all wages and compensation for work done in the city by every resident and nonresident employee, and Section Fourteen says the ordinance and the new rate "shall take effect on October 1, 2026, and apply to tax year 2026 and forward". First reading 2026-06-16, adopted 2026-06-30 (4 yes, 0 no). A companion amendment only makes filing quarterly. Bloomberg Tax (2026-10-30) independently reports Salem among two Kentucky cities that introduced occupational taxes effective Oct. 1. The data had carried 1% for the whole year (and for 2025) from a statewide scrape taken after the ordinance existed. Now: 2025 none; 2026 none before 2026-10-01 and 1% from then (`rateChanges`, the same mechanism as Falmouth); 2027 1%. Paychecks dated today were already right; January to September 2026 paychecks had withheld tax that was not owed.
- **Boone County, Indiana: already correct.** 1.71% for periods beginning on or after 2026-10-01 per Departmental Notice #1 R47 / 10-26 is already in `data/local/IN-counties-2026.json` as a `rateChanges` step (1.70% before), read directly from the DOR notice on 2026-10-01, and tested. One caveat stays: the notice keys the rate to pay periods that BEGIN on or after October 1 while the engine selects by check date.
- **Eugene, Oregon: real, added.** The City of Eugene's own pages (eugene-or.gov/4281, /4863) confirm the Community Safety Payroll Tax (Ordinance 20616, effective 2021-01-01, sunset 2028-12-31) has an Employee Payroll Tax that the employer withholds and remits, for employers with a physical location inside the city limits, and that the rate is set by charts on "gross wages, less overtime wages, for the pay period". The engine had no line for it. Added `OR_EUGENE_CSPT`: 0.44% of the period's wages for an employee paid more than the annual threshold divided by the pay periods in a year ($31,304 from 2025-07-01, $32,344 from 2026-07-01, which is the Oregon standard minimum wage x 2,080 hours: $15.05 and $15.55), overtime left out of the comparison, dispatched off `workState.certificate.locality` (or `localities`) containing `Eugene`. **Limits:** the city's rate-chart PDF, FAQ and return instructions could not be retrieved, so the 0.44% rate and the thresholds rest on payroll-vendor release notes and the minimum-wage relationship; every line carries a secondary-source notice. The 0.21% EMPLOYER payroll tax (0.15% on the first $100,000 for employers with two or fewer employees) is not modelled. The address resolver does not yet set the Eugene locality, so the caller has to.
- **Whitesville, Kentucky:** the same report says its tax starts in 2027; not changed here and not independently confirmed.
- **Maine's start date:** Maine Revenue Services' August 2026 booklet states the new surcharge applies "for tax years beginning on or after January 1, 2026" but gives no date from which employers must use the revised deduction and rates; the engine's 2026-08-01 date is the revision month, an inference. It does not affect checks dated today.

## Batch 26: the "present, no known holes" local-tax states confirmed (2026-11-09)

Each of Colorado, Missouri, New Jersey, Delaware, Washington, New York and Maryland was checked two ways: are the taxes the engine holds still right, and is there another local payroll tax in that state it lacks.

- **New Jersey: a real hole, fixed.** Besides Newark, **Jersey City** levies an employer payroll tax: 1% of an employer's payroll for services performed in the city or supervised from it, with Jersey City residents' wages exempt (Ordinance 18-133, adopted 2018-11-20, effective 2019-01-01, read in full from the city's ordinance; the city's own page confirms the resident exemption and the $2,500-a-quarter employer minimum). Section 304-21 forbids withholding it from the employee, so it is an employer line only. Added `JERSEYCITY_PAYROLL_ER` (certificate.locality `Jersey City`; `jerseyCityResident` exempts a resident), the NJ 2025-2027 data, and the address resolver now sets the Jersey City locality and the resident flag. The $2,500 quarterly minimum and the exempt-employer list (government, interstate agencies, foreign insurers, charities) are employer-wide facts the engine cannot test. Newark's page was re-read: 1% of wages for services performed in or supervised from Newark, reduced to 0.50% for employers whose workforce is more than half Newark residents; unchanged.
- **Maryland: confirmed, no change.** All 24 jurisdictions' local withholding rates, including Anne Arundel's and Frederick's tiers and thresholds, equal the Comptroller of Maryland's 2026 memo (Central Payroll Bureau, dated 2026-02-04, Attachment 1); the state brackets (with the 4.75% withholding floor and the new 6.25% / 6.5% tiers) match too. A test now pins the county table to the memo.
- **Colorado: confirmed.** The cities that levy an occupational privilege tax are Denver, Glendale, Greenwood Village and Sheridan; Aurora repealed its tax effective 2025-01-01 (the engine already dates that). Payroll vendors and city pages agree with the figures held.
- **Delaware: confirmed.** Wilmington (1.25%, owner-confirmed earlier) is the only Delaware city levying a wage tax; state law lets cities over 50,000 levy up to 1.25% and none other does.
- **Washington: confirmed.** Seattle's JumpStart payroll expense tax and Social Housing tax are the city payroll taxes; both were checked against Seattle's own 2026 form in Batch 20. No other Washington city payroll tax found.
- **Missouri: confirmed.** Kansas City and St. Louis are the two cities that levy an earnings tax (RSMo 92.111 bars any other city from imposing one after 2011); both 1% rates were confirmed in Batch 20. Voters rejected Amendment 5 on 2026-08-04 (83% to 16%), so the state income tax stays; Amendment 7 was on the 2026-11-03 ballot and its effect on withholding was not established here.
- **New York: confirmed.** New York City and Yonkers are the only localities with an employer-withheld local income tax (the Tax Department's own page names them with the MCTMT); the NYS, NYC and Yonkers wage-bracket tables were compared cell by cell in Batch 23.

### Batch 26 addendum: New Jersey S.B. 4219 (2026-11-09)

> Superseded 2026-11-10: the enacted text, P.L.2025, c.314, was read directly; see Batch 33. The paragraph below is the earlier, report-based account.

A law signed February 2026 and effective immediately (S.B. 4219, reported by EY on 2026-02-18 and by counsel on 2026-02-11; the bill text itself was not retrieved) exempts from Newark's and Jersey City's employer payroll tax the wages of a New Jersey resident employee who is already subject to an employer payroll tax in another state for services performed there. It also lets the cities keep up to 3% of collections and requires the state to share employer return data with them. Added `certificate.njOutOfStateEmployerPayrollTaxExempt` (the employer's own determination), which zeroes both cities' lines and says why. The rate, base and residency rules of both taxes are otherwise unchanged.

## Batch 27: Oregon, West Virginia and Alabama local payroll taxes (2026-11-09)

The three states that were curated by hand rather than built from an official list.

**Oregon**
- **Eugene, employer side added:** 0.21% of gross wages (the city's own return instructions, as quoted by its site; the reduced 0.15% rate for employers with two or fewer employees and the public-employer exemption are employer-wide and not applied). `OR_EUGENE_CSPT_ER`, secondary-source notice.
- **Springfield, new, from 2027-01-01:** read directly from the City of Springfield's program overview (updated 2026-10-14), tax page and FAQ. The council adopted it 2026-06-01: 0.1% employee (withheld by the employer) and 0.1% employer, tied to the employer's taxable Springfield business location rather than where the employee lives or works, for pay periods *beginning* on or after 2027-01-01, W-2 locality code SPFLD. Added `OR_SPRINGFIELD_PT` and `OR_SPRINGFIELD_PT_ER` (certificate.locality `Springfield`) with an inferred-tier notice: the ordinance's list of excluded compensation was not read (gross wages are taxed), the engine keys the start to the check date, and an employer's election to pay the employee share is not modelled.
- Nothing else found: the other Oregon payroll taxes are the statewide transit tax, the six transit districts, Metro, Multnomah County and Eugene, all already held.

**West Virginia**
- **Madison changed from $3.00 to $1.25 a week, flagged as conflicting.** The 2017 ordinance (read in full) schedules $3.00 from 2020, but Bloomberg Tax reported on 2020-01-09 that the council cancelled the increase, and later payroll guides list $1.25. The city's document index returned HTTP 503, so no post-2020 city document was read.
- **Smithers added at $0.50 a week as a flagged estimate.** The city's own legal notice (2021-12-02) confirms the ordinance exists; the rate comes from two payroll vendors and conflicts with a third ($52 a year). Residency treatment is unconfirmed.
- Both now carry a conflicting-sources notice on the line. This reverses the earlier decision to leave them as they were; the reason is that $0 for Smithers and a figure the city appears to have cancelled for Madison were the two errors most likely to reach a paycheck. Fourteen cities are now configured; the list is still not a certified register.

**Alabama**
- The data holds all 25 municipalities on the Alabama League of Municipalities' live occupational tax list plus the four towns the League never listed (Beaverton, Irondale, Notasulga, Tarrant), 29 in all, and Macon County and Jefferson County at county level. The Treasury's Appendix 2 list of local taxes with federal withholding agreements (Bessemer, Birmingham, Gadsden, Jefferson County, Macon County) is a subset of it. A web search for other Alabama towns with a new occupational wage tax found none. Press reports from 2022 say Alabama law froze the list at the taxes then in force, which would make it effectively closed; the statute was not read.
- Still survey-only: Bear Creek, Brilliant, Lynn; Tuskegee's own form says 3% against the League's 2%.

## Batch 28: 2026 paid-leave, disability and employee-UI parameters; independent number check (2026-11-09)

- **2026 paid-leave, disability and employee-UI parameters were re-read from the agencies' own 2026 publications and all matched the engine's data.** No data change.
- **West Virginia withholding tables: confirmed, not a defect.** An independent number-presence check of WV-2026.json against the live March 2026 IT-100.2A first reported 131 of 234 bracket numbers missing, because it read the base tables, which are the October 2024 figures. The data applies SB 392's tables (2.11/2.81/3.16/4.22/4.58%, signed 2026-03-31, effective 2026-06-12) as an `effectiveDated` overlay for both the two-earner and one-earner tables in all six pay frequencies. Every overlay bracket threshold and base appears in the live PDF (0 missing). The engine gives $25 for an $800 weekly check dated 2026-06-11 and $24 from 2026-06-12 (one-earner election $21), now pinned in `tests/engine.test.ts`. The 2027 file carries the overlay forward.
- **Number-presence check of withholding constants against the agencies' PDFs:** Virginia 2 unmatched (both zeros), South Carolina 0, Arkansas 0, West Virginia 0 after the overlay. Colorado's rate (4.4%), standard deductions and annualize multipliers are not printed in the guide text that was read, so that check is inconclusive for Colorado rather than a match.
- **Not yet independently checked this way:** AZ, DC, DE, ID, IA, IL, IN, KY (the Department's PDF returned 403), MI, NM, OR and PA formula constants.

## Batch 29: filing-system and agency announcements, 2026-11-10

Each item was read on the agency's own page on 2026-11-10 before anything was changed.

- **Michigan, MiUI:** the UIA's page now says "Say HELLO to MiUI!" and describes the transition from MiWAM to MiUI (MiLogin sign-in through Pure Michigan Talent Connect). The page prints no go-live date, so the 2026-11-09 date rests on the report only. The stale MiWAM note in the profile is rewritten. Which wage-report upload formats MiUI accepts was not read, so none is scheduled.
- **Nevada, electronic submission:** the Department of Taxation's FAQ (dated 2026-10-20) confirms December 7, 2026 for returns, payments, refund claims, registrations and permits, with waivers requested at least 20 days before the first covered document is due and none for payments of $10,000 or more. It is recorded as not modelled because it reaches the Modified Business Tax, which the engine documents but does not calculate; it is separate from the Employment Security Division's own rule (NAC 612.035).
- **Idaho:** the Commission's 2026-11-05 release confirms 1099 e-filing moves to the IRS IRIS XML and CSV templates, uploaded in TAP, starting in 2027, and that TXT is withdrawn; Combined Federal/State filers see no change but file Form 967 with Idaho withholding. `tap.tax.idaho.gov` loads as "Idaho TAP - Home", but no page read says TAP moved there, so that part is recorded as unconfirmed. Withholding, due dates and rates are unaffected.
- **SSA, Business Services Online:** SSA's BSO page confirms a new authorization process for Electronic Wage Reporting effective 2026-11-07. Organizations that used the earlier process must re-register unless they received a registration code by mail in the January 2026 limited release; codes are mailed. The channel text in `payroll/federal/agency.ts` and the two federal filing docs now say so. SSNVS is unaffected. This only matters to employers who file W-2s with SSA themselves.
- **Ohio, CCA:** the 2026 W-2 and 1099 file layout is read and recorded as not encoded. Reading it against CCA's own member pages found that the document's member list differs from the website's (the document omits Seville and Shreve and includes Waynesfield). The website list was used. The same pages name "Oakwood (Paulding County)" as a CCA member at 1.00%, which resolves that one of the three Oakwoods to CCA in the 2025, 2026 and 2027 files; the Cuyahoga and Montgomery Oakwoods stay unresolved. No rate changed.
- **South Carolina, 2027:** confirmed. DEW's page (fetched with the cache bypassed) now carries the 2027 table: rates the same or lower than 2026, no solvency surcharge, $14,000 wage base, class 30 new employers at 1.060%. The engine already held $14,000 and 1.06% for 2027, so no value changed; the wage-base confidence note is updated.
- **Connecticut Paid Leave, 2027:** confirmed. The Board voted to keep 0.5% for 2027 (ctpaidleave.org, read directly); `statePaidLeaveEmployee.rate` is 0.005 in the 2027 file already. No change.

## Batch 30: owner-supplied answers on the Oregon, West Virginia and Alabama open items (2026-11-10)

The owner supplied answers from a reviewer. Each was checked against what this project could read; where it could not be read it is recorded as reported.

- **Eugene employee tax, per-period cutoffs applied.** The reviewer reports the City's 2026-27 chart (updated 2026-10-27) prints 0% at or below, and 0.44% above, twice-annual $16,172, monthly $2,695, twice-monthly $1,348, biweekly $1,244, weekly $622 and daily $124, with overtime left out of the wage test and the rate taken on subject wages. The chart PDF and Eugene Code 3.754 were unreachable and bot-blocked on 2026-11-10 and were not read here. The figures equal $32,344 divided by the periods and rounded to a dollar, so they agree with the annual figure. The engine now uses the printed cutoff for those six frequencies (twice-monthly pay of $1,347.80 was taxed before and is not now). Quarterly and annual keep the evenly divided figure. The notice stays at the secondary-source tier. Eugene's July 1, 2027 threshold is still not published.
- **Eugene employer tax:** the reduced 0.15% rate on the first $100,000 for employers averaging two or fewer employees (claimed on the fourth-quarter or final return with form EUG-RTR) and the exemptions for governments are reported, not read, and stay employer-wide facts the engine cannot see.
- **Springfield:** the code exhibit was read directly. It confirms 0.1% employer and 0.1% employee, no tax on hours worked at an employer location outside the city (7.1204(3)), employer withholding, rates held for three years from the start of collection, and the full list of excluded wages in 7.1202. This is the version attached to the council's March 2026 materials, not the adopted ordinance. The engine still taxes gross wages and does not remove those exclusions or the outside-city hours; both are now stated in the code and the data. The 2027-03-01 registration date is reported and not read.
- **Madison:** the city's own notice "No User Fee Increase!" (madisonwv.org, 2020-01-08) appears in a search result saying the council voted on January 6 not to increase the fee. The page itself returned HTTP 503, so only the snippet was seen. $1.25 stays, flagged.
- **Smithers:** the vendor figures conflict in amount, not only in frequency: $52 a year is twice the $26 that $0.50 a week gives. $0.50 stays, flagged.
- **West Virginia unemployment surtax:** the second reading is recorded in the data. Cutting WorkForce's 8.5% combined starting rate by 7% gives 7.905% for out-of-state construction; the engine keeps 7.975% (cut the 7.5% rate, add the 1% surtax). No WorkForce notice after 2026-07-01 was found that decides between them.
- **West Virginia automation fee:** an annual invoice, not computed per paycheck (unchanged).
- **Alabama:** the January 2026 withholding booklet was read directly. Formula step 2B deducts "the employee's annual Federal withholding tax. Actual amount for this payroll period multiplied by number of such payroll periods in a year", which is what the engine does. Form A-4 is required. Bear Creek, Brilliant, Lynn and Tuskegee (2% survey against 3% brochure, brochure URL reported 404) remain unsettled.

## Batch 31: second pass on the open items (2026-11-10)

- **Missouri Amendment 7: rejected** on 2026-11-03 (a proposal to create a fund aimed at eventually eliminating state taxes; report by KOMU, not an agency page). Nothing in withholding changes; no engine change. Amendment 5 was rejected 2026-08-04.
- **Tuskegee, Alabama: now primary-source at 3%.** The engine already used 3% (corrected 2026-09-28). The city's business license and tax brochure is now read in full: "The fee amounts to 3% of the gross wages earned within the City of Tuskegee." Together with the city's own return form (3%), both city documents agree; the League's 2% is a survey figure the League says needs verifying. The data file's tier moves from conflicting_sources to primary_source and the notice on the line is gone. The ordinance text is still not online. (The earlier suggestion that the brochure URL returns 404 was wrong for the current URL, which serves the Word file.)
- **Eugene employer tax, confirmed on the city's own page** (eugene-or.gov/4864, read directly): 0.0021 for all employers on total subject wages paid to all employees including those exempt from the employee tax; 0.0015 on the first $100,000 for employers with two or fewer average annual employees, claimed on the fourth-quarter or final return; subject only with a physical location in the city limits. The engine still cannot apply the reduced rate or government exemption.
- **West Virginia SB 1053, enrolled text read directly:** it amends only 21A-5-5 and adds 21A-9-10 (the title and body list nothing else); 21A-5-5(d) cuts "the otherwise applicable unemployment contribution rate for each employer" by seven percent from 2026-07-01, and 21A-9-10(c)(1) sets the annual fee. It does not mention the 1% surtax in 21A-5-10(b), so the engine's 7.5% x 0.93 + 1% = 7.975% for out-of-state construction follows the text literally; the 7.905% reading is not supported by anything in the act. No WorkForce notice after 2026-07-01 was found.
- **Madison, West Virginia: not resolved.** The city's own employer worksheet on its site is the January-December 2017 form ($1.25, $2.50, $3.75 a week; $5.00 monthly; $60.00 yearly), from before the planned increase, so it does not show the current fee. The city's "No User Fee Increase!" notice and its fee-ordinance page return HTTP 503 (only the notice's search snippet is visible). $1.25 stays, flagged.
- **Not resolved, no primary document found in this pass:** Smithers, WV (no ordinance or rate found; the 2022 state home-rule progress report is a scanned PDF that was not read); Bear Creek, Brilliant and Lynn, AL (only the League survey and vendor lists; the Lynn code at revenue.alabama.gov is a 2007 gross-receipts license schedule, not the wage-based occupational tax); Eugene's 2026-27 chart (unreachable; Bloomberg Tax's August 2026 item on it is behind a login).
- **Maine's new-employer rate:** the maine.gov rates PDF is still unreachable to this project; a search result quoting it gives 2.23% plus 0.14% (CSSF) plus 0.17% (UPAF) = 2.54%, which is what the data holds.
- **FUTA:** DOL's final 2026 credit-reduction list is published after November 10, 2026 and was not yet out; California (5.3% potential) and the Virgin Islands (4.8%) remain potentials.

### Batch 31 addendum: primary-source hunt and the FUTA determination (2026-11-10)

- **FUTA final list: not published yet.** DOL's FUTA Credit Reductions page and the IRS page both state the list is announced after November 10; the page read on 2026-11-10 shows no 2026 table. Nothing was added to `futa.creditReduction.states`. EY reports the Virgin Islands finished repaying its loan on 2026-04-30 (secondary). A follow-up check is scheduled; when DOL posts the final list, the confirmed states and rates go into `data/federal/2026.json`.
- **Neumo occupational return, updated 10/2026, read in full:** Attalla 2%, Beaverton 1%, Guin 1%, Hackleburg 1%, Hamilton 1%, Leeds 1%, Macon County 1%, Midfield 1%, Mosses 1%, Shorter 1%, Southside 2%, Sulligent 1%, Tarrant 0.5%. All match the data (Hackleburg is stored under the League's spelling "Hacklebug" with an alias). Bear Creek, Brilliant and Lynn are not on it. The Neumo "rate sheet" for those towns (3% for Bear Creek and Brilliant) is the sales and use tax sheet and is not the occupational rate.
- **Still no primary source for Bear Creek, Brilliant, Lynn, Smithers or Madison's current fee.** Brilliant's own site (brilliantal.org) loads but carries no tax page; Bear Creek's site blocks automated reads; Madison's site returned HTTP 503 again. Lynn's page at Mosey (secondary) says employers withhold the tax and gives no rate. Bloomberg Tax's report of Madison's cancellation says "the city said on its website" the council voted January 6, 2020 not to increase the fee, which matches the city's own notice's snippet.

## Batch 32: Whitesville, Kentucky ordinance read; start date corrected (2026-11-10)

The signed Ordinance No. 25.07 (City of Whitesville, cityofwhitesvilleky.org, a scanned image read page by page) was read in full. The owner reported the same points; each was checked against the pages.

- **Start date was wrong, corrected to 2026-10-01.** Section 14: "The occupational tax enacted and levied herein shall be effective commencing upon the first full pay period of October 1, 2026." The commission read it on 2026-06-23 and adopted it on 2026-07-07 (five ayes). The data and the test had 2027-01-01, taken from the headers of the city's forms. Batch 24's remark that Whitesville "starts in 2027" is superseded.
- **Rate and base confirmed.** Section 2(1)(a): 1.15% of wages and compensation paid or payable in the city for work done in the city, by residents and nonresidents. Section 1(4): compensation adds back 401(k), 457 and similar deferrals and Section 125/132 reductions, so the base is gross pay, which is what the engine already used.
- **Apportionment added.** Section 3(1): when pay is for work both inside and outside the city, the tax is measured by the share of compensation for work done inside it. The engine had no way to express that for a Kentucky city, so a new optional certificate field `workCityWageShare` (0 to 1, default 1; out-of-range values are ignored) reduces the city's taxable wages and the line's detail says so. It applies to the city entry only, not the county's separate 1.00%. Only Whitesville's ordinance was read for this rule; other Kentucky cities' ordinances were not, so the field is opt-in everywhere.
- **The forms' header is unexplained.** The city's Form E-1 and Quarterly Individual Employee Return say "For Periods Ending After 12/31/2026 Only", which does not match Section 4(2) (the first return is for the quarter ending December 31, 2026). The ordinance is the law and is used; the forms were not changed to match, and why they say that is not known.
- **Approximation to know about.** The ordinance starts with a pay PERIOD and the engine keys to the check date, so a check dated on or after 2026-10-01 for a period that began in September is taxed here and is not under the ordinance. The input has no period start date to test against.

## Batch 33: owner's answers on items 1 to 5 and 12 (2026-11-10)

The owner read each source on 2026-11-10. Where this project could fetch the same page it did, and says so.

- **FUTA:** unavailable. DOL's FUTA page was last updated 2026-09-11 and the potential list still has California at 5.3% (1.5% plus a 3.8% benefit-cost add-on) and the Virgin Islands at 4.8%. Nothing applied; the scheduled re-check on 2026-11-11 stands.
- **Eugene employee chart, confirmed by the owner:** every cutoff the engine applies (annual $32,344, twice-annual $16,172, monthly $2,695, twice-monthly $1,348, biweekly $1,244, weekly $622, daily $124); "Exempt" at or below a cutoff, 0.0044 above; overtime left out only when picking the rate; no quarterly row. This project's own reads of the chart and of Eugene Code 3.754 are still blocked, so it relies on the owner's reading. Because the chart prints a cutoff for every frequency Oregon's withholding supports, the employee line no longer carries a secondary-source notice. The definition of "subject wages" for the employer 0.21% tax is still unavailable, and that line keeps its notice.
- **Springfield, partly confirmed.** The city's adopted-ordinance FAQ (2026-06-03) was read directly: 0.1% employer and 0.1% employee; wages for work outside the city limits are not taxed; the municipal code lists excluded remuneration; the ordinance is effective 30 days after adoption; and the date the tax becomes due is set by administrative rule and is "no sooner than January 1, 2027". The engine's 2027-01-01 start is therefore the earliest possible date, not a confirmed one, and the notice on the line now says so. The ordinance number (6515), the full exclusion list as adopted and the 2027-03-01 registration date remain unread.
- **Maine new-employer rate confirmed by the owner** from the Maine DOL 2026 rate array: "New Employer Rate is 2.23% plus the CSSF Rate of 0.14% and UPAF rate of 0.17% for a Combined Rate of 2.54%". The stored 2.54% is right. The booklet prints no date from which employers must use the August withholding booklet, so that stays open. This project's own reads of the PDF are still blocked.
- **New Jersey, enacted text read directly.** P.L.2025, c.314 (S4219 3R), approved 2026-01-20, effective immediately. New C.40:48C-18(b): if an out-of-state state, municipality or local entity imposes an employer payroll tax on an employee for service performed out of state, the Newark or Jersey City employer payroll tax does not apply to that employee, but only after the employer submits documentation, in the manner the municipality prescribes, of the employee's residency, the out-of-state services and the other tax. Amended C.40:48C-15(c) also lets an ordinance exempt pay to residents. The engine's flag `njOutOfStateEmployerPayrollTaxExempt` now cites the statute and says the employer must have filed that documentation first. The owner reports Jersey City wrote this into Ordinance 26-006 and kept its resident exemption; that ordinance was not read.
- **Michigan, confirmed.** The Department of Labor and Economic Opportunity's release of 2026-11-09 (read directly) says the UIA "today fully launches its MiUI platform", replacing MiWAM, "which is now permanently offline". **Idaho:** the Commission's TAP Help page links to tap.tax.idaho.gov (per the owner; that address loads as the Commission's own TAP site), so it is the state's portal. No page read says TAP moved there from another address.

## Batch 34: full answer list applied (2026-11-10)

Read directly by this project where noted; the rest is the owner's reading.

- **Springfield, OR: the adopted ordinance changes the wage base.** Ordinance No. 6515 (ecode360.com, adopted 2026-06-01, 6 to 0) was read in full and supersedes the draft exhibit read earlier. Its definition of wages (7.1202) **includes** employee deferrals into 401(k), 403(b), 457 and similar plans and **excludes** benefits under a Section 125 plan that the employee does not take in cash, qualified fringe benefits, employer retirement contributions, accountable-plan reimbursements and small amounts (domestic service under $1,000 a year, seasonal agricultural labor under $300, casual labor under $50). The engine now takes gross pay less the `section125`, `hsa`, `fsa`, `dependent_care` and `commuter` categories and keeps retirement deferrals in. Section 5 has the City Manager set the first date the tax is owed by administrative rule, no sooner than 2027-01-01, so 2027-01-01 stays an assumed earliest date, flagged on the line. 7.1204(5), read literally, has employers withhold both rates; the city's FAQ and the owner's guidance are to withhold only the employee's 0.1%, which is what the engine does. Not applied: the small-amount exclusions and the exclusion of hours worked at an employer location outside the city (7.1204(4)). The 2027-03-01 registration date is from the owner and was not read.
- **New optional input `payPeriodStart` (decision 13, recommended and adopted).** The first day of the pay period, yyyy-mm-dd, on or before the check date; a bad value is ignored with a warning. Only taxes whose ordinance starts with a pay period read it. **Whitesville, KY:** the 1.15% applies from the first period that begins on or after 2026-10-01, so a period beginning 2026-09-21 and paid 2026-10-02 is not taxed; without `payPeriodStart` the check date is used and a check dated within 35 days of 2026-10-01 carries an inferred notice. **Springfield, OR:** the start is keyed to the period's first day when given. The sandbox form, its page and the paycheck docs list the field.
- **Eugene employer tax, subject wages.** Per the city's employer guide as read by the owner (this project could not retrieve it): Oregon withholding wages after pretax deductions, which is the base the engine takes. Eugene Code 3.754 was read by no one. Cutoffs: confirmed in Batch 33; the chart has no quarterly row.
- **Maine.** The MRS Tax Alert of August 2026 (Volume 36, Issue 10, read directly) says "EFFECTIVE IMMEDIATELY" for the revised withholding tables and gives no day, so the engine's 2026-08-01 start is the earliest possible date. The new-employer rate is 2.54% (Batch 33).
- **Ohio.** Read directly from RITA: Oakwood in Cuyahoga County is a RITA member (since 1972, 2.500%, 100% credit), so it is now tagged RITA in the 2025 to 2027 files; Waynesfield is a RITA member from 2025-01-01 at 1.000% (already RITA in the data; CCA's own rates page still lists it in older tables). Seville and Shreve are on CCA's member list (already CCA). The Montgomery County Oakwood is on neither agency's list read and stays unconfirmed. The owner's credit details for Seville (0%) and Shreve (up to 0.50%) match CCA's rates page; the engine does not hold per-municipality credit factors.
- **Decisions 14 to 16, adopted as recommended:** keep the agency formula over its printed table for Louisiana daily pay, California Method A (biweekly and married daily) and the Maine tables; keep Maryland's new-employer rate for the employer to supply; leave figures that are not read from an agency's own document marked as secondary-source.
- **Still open:** Madison and Smithers fees and the Bear Creek, Brilliant and Lynn rates (clerk calls); WorkForce West Virginia's written answer on the surtax and the meaning of "7%" (multiply by 0.93 is what the engine does); the Montgomery County Oakwood; the final FUTA list.

## Batch 35: Madison confirmed; Whitesville re-verified (2026-11-11)

- **Madison, WV: $1.25 a week, confirmed by the owner on 2026-11-11.** The source the owner used was not given to this project, which read no current city document (the city's site returned HTTP 503 and its 2022-hosted worksheet is the 2017 form). The conflicting-sources notice on the line is removed in the 2025 to 2027 files and its test updated; the data note keeps the history. Smithers stays flagged.
- **Whitesville, KY: already fixed; re-run today.** The engine starts the 1.15% with the first full pay period of 2026-10-01 (Batch 32 and Batch 34). Checked on 2026-11-11: a biweekly $2,000 check dated 2026-11-11 withholds $23.00; a check dated 2026-10-02 for a pay period that began 2026-09-14 withholds $0; a check dated 2026-10-16 for a period that began 2026-10-05 withholds $23.00; and a check dated 2026-09-25 withholds $0. Supply `payPeriodStart` for exactness; without it, checks dated within 35 days of 2026-10-01 carry an inferred notice.

## Batch 36: withholding-constant sweep and paid-leave parameters (2026-11-11)

**Withholding constants, engine data against each agency's own 2026 document** (every number in the engine's config, base tables and effective-dated overlays checked for presence in the downloaded document):
- **Matched with nothing unmatched:** Delaware (employer guide, 35 numbers), Iowa (formula), Illinois (IL-700-T guide), Indiana (Departmental Notice 1), Pennsylvania (employer withholding page), Oregon (150-206-436, 84 numbers), New Mexico (FYI-104, 936 numbers), Colorado (DR 1098 and the January 2026 guide, 11 numbers; this closes the earlier inconclusive check on its 4.4% rate and status deductions), Arizona (A-4 offers 0.5% to 3.5%; the 3.0% was missed only by a formatting quirk).
- **Idaho:** the engine's 2026-07-31 overlay (annual $16,100 single and $32,200 married, monthly $1,342 and $2,683, semimonthly $671, biweekly $619, weekly $310, daily $62) matches EPB00744 revised 07-23-2026; the unmatched numbers were the superseded earlier table. The nonresident-alien add-ons ($15, $31, $33, $66) are on Idaho's Form W-4.
- **Kentucky:** the standard deduction of $3,360 is confirmed on the Department of Revenue's own announcement page. The 3.5% rate comes from a search result quoting the 2026 formula PDF; the PDF itself returns 403 here, so it was not read directly.
- **Michigan:** the guide (Form 446) returns 403 here; a search result quoting it gives a 4.25% rate and a $5,900 personal exemption, matching the engine. Not read directly.
- **District of Columbia:** not a defect. The Office of Tax and Revenue has published no FR-230 since 2018 and tells employers to use the rate schedule with the federal allowance; the data already documents that and uses the $4,300 allowance.

**Employee-side paid leave, disability and unemployment parameters, read on each program's own page (all matched):** Alaska 0.50% on $54,200; California SDI 1.3% with no wage limit; Colorado FAMLI 0.44% employee of 0.88%; Connecticut 0.5% (also 2027); Hawaii $1,500.21 weekly base x 0.5% = $7.50; Massachusetts 0.46%; Minnesota 0.88% total and the $185,000 limit; New Jersey 2026 worker UI 0.3825% + 0.0425%, DI 0.19%, FLI 0.23%, bases $44,800 and $171,100, and 2027 DI 0.24%, FLI 0.24%, bases $46,400 and $177,100 (already in the 2027 file); New York PFL 0.432% reproducing the $411.91 maximum; Oregon 60% of 1% up to the $184,500 cap; Pennsylvania 0.07%; Rhode Island 1.1% on $100,000; Washington 1.13% x 71.43% and WA Cares 0.58%. They are now pinned in `tests/paid-leave-parameters-2026.test.ts`. Not pinned: Maine's employee share (its pages do not state it) and New York's SDI ($0.60 weekly, statutory, not re-read).

**Result: no constant in these states was found wrong.**

## Batch 37: PR #192 close-out answers (2026-11-12)

The owner read each source on 2026-11-11; where this project could fetch the page too, it did and says so.

- **West Virginia 7% cut and the 1% surtax: no change, still needs WorkForce WV in writing.** 21A-5-5(d) says "the otherwise applicable unemployment contribution rate ... shall be reduced by seven percent", never below zero, which reads as a relative cut (x 0.93, not minus 7 points). Whether the surtax in 21A-5-10(b) is part of the "otherwise applicable" rate is not decided by the statute: that section says it is paid "in addition to any other tax provided for in this section" (leaning to 7.5% x 0.93 + 1% = 7.975%, which the engine uses) but also calls it "contributions at the rate of one percent" (leaning to cutting the combined 8.5% to 7.905%). WorkForce WV's handbook (rev. Feb 2025) shows the two together as 8.5%. The engine stays at 7.975% until WorkForce answers; the annual automation and administration fee is still not a per-paycheck item.
- **FUTA final 2026 list: still not posted.** DOL's page shows only the potential list (California and the Virgin Islands at 4.8%). The scheduled check on 2026-11-13 stands.
- **Oakwood, OH (Montgomery County): city-collected.** The City of Oakwood's own site, read directly, shows its Income Tax Department collecting at 2.50% with monthly remittance when prior-year withholding exceeded $2,399 (or any month of the preceding quarter exceeded $200), quarterly otherwise, and an annual reconciliation due February 28. The owner reports CityTax has administered filing and payments since 2026-01-01 with remittance to PO Box 269, Eaton Rapids, MI 48827; that address is on the city's forms page and the CityTax detail was not read. Tagged `self_or_other` in the 2025 to 2027 files; the last "unknown" administrator tag is gone.
- **Springfield, OR: start date confirmed by the city.** Its FAQ (published 2026-11-09, read directly) says the tax begins 2027-01-01 and employers withhold for pay periods beginning on or after that date (a period beginning in December 2026 and paid in January is not taxed); employer registration opens 2027-03-01; the first quarterly return for 2027-01-01 to 2027-03-31 is due 2027-04-30; W-2 locality code SPFLD. The engine already keys to `payPeriodStart` when given. The City Manager's administrative rule and the location-allocation rules are still "coming soon". The "assumed earliest date" wording on the line is replaced.
- **Eugene, confirmed by the owner.** Code 3.754 matches the engine (employer 0.0021; 0.0015 on the first $100,000 for two or fewer employees; employee 0.0044; hours at locations outside the city not taxed; Ordinance 20616). The old 0.30% tier for non-minimum-wage workers at $15.00 an hour or less ended 2025-07-01 and is not in the 2026 data. The employer guide and 2026 EUG-PY-1: subject wages are gross less pretax deductions, the 0.0015 rate is claimed only on the fourth-quarter or final return, and employers with no physical Eugene location are not subject.
- **Jersey City Ordinance 26-006: title confirmed, text not read.** The city's 2026-02-11 council agenda titles it as authorizing use of up to 3% of payroll taxes collected for administration and a waiver for entities subject to an out-of-state payroll tax under the new state law; a minutes tracker records adoption 9-0 on 2026-02-25. It does not change the 1% rate. How the waiver works in the ordinance was not read; the engine's `njOutOfStateEmployerPayrollTaxExempt` flag follows the state statute.
