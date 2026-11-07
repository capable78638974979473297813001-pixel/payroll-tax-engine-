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
