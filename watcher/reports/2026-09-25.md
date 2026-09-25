# Source watch - 2026-09-25

**1 source changed**

| Changed | Minor | Unchanged | New | Unstable | Unreachable | Gone (404) | Blocks bots | Total |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 1 | 385 | 0 | 1 | 16 | 3 | 12 | 419 |

_Run took 489 s. A change is only reported after a second fetch confirms it._

## Changed

### US - IRS draft tax forms: payroll forms only (W-4, W-4P/R, Pub 15/15-T, 940/941/944, W-2/W-3)

<https://www.irs.gov/draft-tax-forms>  
read with a headless browser; 2 lines added, 103 removed; 0 links added, 39 removed

- Figures now present: none
- Figures no longer present: $10, 1.861
- Removed link: [Title](https://www.irs.gov/draft-tax-forms?find=&items_per_page=25&order=draft_tax_forms_picklist_title&sort=asc)
- Removed link: [Product Number](https://www.irs.gov/draft-tax-forms?find=&items_per_page=25&order=natural_sort_field&sort=asc)
- Removed link: [Revision Date](https://www.irs.gov/draft-tax-forms?find=&items_per_page=25&order=picklist_revision_date_iso&sort=desc)
- Removed link: [Posted Date](https://www.irs.gov/draft-tax-forms?find=&items_per_page=25&order=posted_date&sort=desc)
- Removed link: [2](https://www.irs.gov/draft-tax-forms?page=1)
- Removed link: [3](https://www.irs.gov/draft-tax-forms?page=2)
- Removed link: [4](https://www.irs.gov/draft-tax-forms?page=3)
- Removed link: [5](https://www.irs.gov/draft-tax-forms?page=4)
- Removed link: [Last » Last page](https://www.irs.gov/draft-tax-forms?page=49)
- Removed link: [6](https://www.irs.gov/draft-tax-forms?page=5)
- Removed link: [7](https://www.irs.gov/draft-tax-forms?page=6)
- Removed link: [8](https://www.irs.gov/draft-tax-forms?page=7)
- Removed link: [9](https://www.irs.gov/draft-tax-forms?page=8)
- Removed link: [Using IRS Forms, Instructions, Publications and Other Item Files](https://www.irs.gov/forms-pubs/using-irs-forms-instructions-publications-and-other-item-files)
- Removed link: [Find Help](https://www.irs.gov/help/find-help)

<details><summary>What changed</summary>

```diff
-Draft versions of tax forms, instructions, and publications. Do not file draft forms and do not rely on information in draft instructions or publications.
-If a PDF file won't open, try downloading the file to your device and opening it using Adobe Acrobat. View more information about Using IRS Forms, Instructions, Publications and Other Item Files.
-Click on a column heading to sort the list by the contents of that column.
-Enter a term in the Find box
-Click the Search button
-Showing 1 - 25 of 1238
-Find Help
-Find
-Show per page
-Product Number
-Title
-Revision Date
-Posted Date
-Form 1099-LPS
-Long-Term Care Premiums Paid Statement
-Dec 2026
-Instruction 1040 (Schedule E)
-Instructions for Schedule E (Form 1040), Supplemental Income and Loss
-2026
-Instruction 1120-F (Schedule H)
-Instructions for Schedule H (Form 1120-F), Deductions Allocated To Effectively Connected Income Under Regulations Section 1.861-8
-Dec 2026
-Instruction 1120-S (Schedule M-3)
-Instructions for Schedule M-3 (Form 1120S), Net Income (Loss) Reconciliation for S Corporations With Total Assets of $10 Million or More
-Dec 2026
-Instruction 4835
-Instructions for Form 4835, Farm Rental Income and Expenses
-2026
-Form 1099-DA
-Digital Asset Proceeds from Broker Transactions
-2027
-Form 1120-F
-U.S. Income Tax Return of a Foreign Corporation
-2026
-Form 1099-R
-Distributions From Pensions, Annuities, Retirement or Profit-Sharing Plans, IRAs, Insurance Contracts, etc.
-2027
-Instruction 8606
-Instructions for Form 8606, Nondeductible IRAs
-2026
... 65 more changed lines
```
</details>

## Minor changes: link lists and headlines only (1)

Recorded, but only the text of links to other pages changed (news boxes, menus).

<details><summary>Show</summary>

### MI - Michigan LEO -- Michigan's Minimum Wage Set to Increase on Jan. 1, 2026

<https://www.michigan.gov/leo/news/2025/12/08/michigans-minimum-wage-set-to-increase-on-jan-1-2026>  
1 lines added, 1 removed (link lists / headlines only)
  
Used by: `data/minimum-wage/states/MI-2026.json`

- Figures now present: $1
- Figures no longer present: none

<details><summary>What changed</summary>

```diff
+$1M investment helps 10 Michigan communities navigate industry transitions, prepare for future
-UIA offices closed Monday for Labor Day, but you still can access online resources
```
</details>

</details>

## Broken - failing for 3+ runs (11)

These URLs need replacing in `watcher/sources.json` (or the site blocks automated fetches).

| Jurisdiction | Source | Detail |
|---|---|---|
| IL | [Illinois State Income Tax Exemptions - 2026 (Illinois Office of Comptroller, Payroll Bulle](https://illinoiscomptroller.gov/state-agencies/bulletins-forms/payroll-bulletins/illinois-state-income-tax-exemptions-2026) | HTTP 500 |
| KY | [Kentucky Office of Unemployment Insurance -- Tax Rate Schedules](https://kewes.ky.gov/Contact/contacts.aspx?strid=4) | now redirects to the site's home page (https://ui.ky.gov/) |
| KY | [Kentucky Office of Unemployment Insurance -- Taxable Wage Base and Surcharge Information](https://kewes.ky.gov/Contact/contacts.aspx?strid=2) | now redirects to the site's home page (https://ui.ky.gov/) |
| ME | [City of Portland, Maine minimum wage -- November 2025 voter-approved schedule](https://www.portlandmaine.gov/1016/Minimum-Wage) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| MI | [MCL 141.631 — City Income Tax Act, Sec. 31 (personal/dependency exemptions)](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-141-631) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| MI | [MCL 206.30 — retirement/pension income deductions (subsection (1)(f) etc.), the basis for ](https://www.legislature.mi.gov/Laws/MCL?objectName=MCL-206-30) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| MI | [MCL 206.703(2) — Every employer required under the Internal Revenue Code to withhold on an](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-206-703) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| MN | [Minnesota Paid Leave -- Premium rate and contributions](https://pl.mn.gov/resources/calculators/premium-rate-and-contributions) | HTTP 405 |
| OR | [City of Wilsonville Transit Payroll Tax Information](https://www.wilsonvilleoregon.gov/finance/page/transit-payroll-tax-information) | HTTP 404 |
| US | [735 ILCS 5/12-803 — maximum wage deduction: lesser of 15% of GROSS weekly wages, or the am](https://www.ilga.gov/legislation/ilcs/ilcs4.asp?DocName=073500050K12-803) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| US | [MCL 600.4012 and Michigan's own garnishment procedure — tracks the federal CCPA floor (25%](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-600-4012) | site's TLS certificate failed verification (unable to get local issuer certificate) |

## Unreachable this run (8)

| Jurisdiction | Source | Detail |
|---|---|---|
| TN | [TN Department of Labor and Workforce Development -- UI Tax Rates](https://www.tn.gov/workforce/employers/tax-and-insurance-redirect/unemployment-insurance-tax/ui-tax-rates.html) | URLError: <urlopen error [Errno 104] Connection reset by peer> |
| US | [Wis. Stat. § 812.34 — 80% of disposable earnings exempt from garnishment (i.e. 20% reachab](https://docs.legis.wisconsin.gov/document/statutes/812.34) | URLError: <urlopen error timed out> |
| WI | [DOR General Withholding Tax Questions (reciprocity, thresholds, WT-4)](https://www.revenue.wi.gov/Pages/FAQS/pcs-with.aspx) | URLError: <urlopen error timed out> |
| WI | [DOR Tax Rates FAQ (annual Form 1 individual income tax brackets)](https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx) | URLError: <urlopen error timed out> |
| WI | [Wis. Stat. § 71.03(13) — 'Wisconsin adjusted gross income' defined](https://docs.legis.wisconsin.gov/document/statutes/71.03) | URLError: <urlopen error timed out> |
| WI | [Wisconsin Legislature -- Wis. Stat. 104.035 (minimum wage; opportunity employees)](https://docs.legis.wisconsin.gov/2017/statutes/statutes/104/035/9) | URLError: <urlopen error timed out> |
| WI | [Wisconsin W-166 withholding guide](https://www.revenue.wi.gov/DOR%20Publications/pb166.pdf) | URLError: <urlopen error timed out> |
| WI | [Wisconsin withholding](https://www.revenue.wi.gov/Pages/Withholding/home.aspx) | URLError: <urlopen error timed out> |

## Unstable (1)

| Jurisdiction | Source | Detail |
|---|---|---|
| IN | [Indiana Departmental Notice #1 (county rates)](https://www.in.gov/dor/files/dn01.pdf) | content differed, but the confirming fetch failed (URLError: <urlopen error [Errno 111] Connection refused>); snapshot kept |

## Redirected (21)

These still work but redirect elsewhere; consider updating the URL in data/ or curated.json.

| Jurisdiction | Source | Detail |
|---|---|---|
| AZ | [City of Flagstaff -- City of Flagstaff announces minimum wage for 2026](https://www.flagstaff.az.gov/CivicAlerts.aspx?AID=2165) | -> https://www.flagstaff.az.gov/m/newsflash/Archive/Item/2165?arcId=3969 |
| CA | [California Employer's Guide (DE 44), Rev. 52 (4-26) -- "How to Withhold PIT on Supplementa](https://www.edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) | -> https://edd.ca.gov:443/siteassets/files/pdf_pub_ctr/de44.pdf |
| CO | [Colorado Department of Labor & Employment — UI Premium Rates](https://cdle.colorado.gov/employers/unemployment-insurance-premiums/premium-rates) | -> https://cdle.colorado.gov/ui/employers/requirements/premiums/premium-rates |
| ID | [EPB00744 — Table for Percentage Computation Method of Withholding](https://tax.idaho.gov/document-mngr/pubs_EPB00744) | -> https://tax.idaho.gov/wp-content/uploads/pubs/EPB00744/EPB00744_07-23-2026.pdf |
| ID | [Form ID W-4, Employee's Withholding Allowance Certificate (EFO00307, 04-28-2025 revision)](https://tax.idaho.gov/w4form) | -> https://tax.idaho.gov/wp-content/uploads/forms/EFO00307/EFO00307_04-28-2025.pdf |
| ID | [Idaho Child Tax Credit Allowance Table (ICTCAT) page](https://tax.idaho.gov/ictcat) | -> https://tax.idaho.gov/taxes/income-tax/withholding/computing/#ictcat |
| KY | [City of Georgetown, KY — Taxes and license fees (occupational license tax: net profits vs ](https://www.georgetownky.gov/2167/Taxes-License-Fees) | -> https://www.georgetownky.gov/2167/City-Property-Taxes |
| MA | [Massachusetts DOR withholding tax forms (new Circular M editions are listed here)](https://www.mass.gov/lists/dor-withholding-tax-forms) | read with a headless browser |
| MD | [Montgomery County, MD tipped-employee cash wage ($4.00/hr, Montgomery County Code Sec. 27-](https://www.montgomerycountymd.gov/humanrights/min-wage.html) | -> https://www.montgomerycountymd.gov/office-human-rights |
| MI | [Revenue Administrative Bulletin 1988-27 — Section 125 cafeteria plan benefits excluded fro](https://michigan.gov/treasury/0,4679,7-121-44402_44415_44416-7351--,00.html) | -> https://www.michigan.gov/en/treasury/reference/rab/content/1988/revenue-administrative-bulletin-1988-27 |
| MN | [Minnesota Department of Labor and Industry -- Minimum wage in Minnesota](https://www.dli.mn.gov/business/employment-practices/minimum-wage-minnesota) | -> https://www.dli.mn.gov/minwage |
| NC | [NCDOR -- Withholding Tax Frequently Asked Questions](https://www.ncdor.gov/withholding-tax-frequently-asked-questions) | -> https://www.ncdor.gov/taxes-forms/withholding-tax/withholding-tax-frequently-asked-questions |
| NM | [Texas Workforce Commission cross-reference for New Mexico UI figures -- New Mexico DWS 'Ho](https://www.dws.state.nm.us/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated) | -> https://www.dws.nm.gov/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated |
| NY | [New York State Department of Labor -- Home Care Aide Minimum Wage Fact Sheet (P105)](https://dol.ny.gov/home-care-aide-minimum-wage-fact-sheet-p105) | -> https://dol.ny.gov/system/files/documents/2024/12/p105-home-health-aide-10-23-24.pdf |
| NY | [New York State Department of Labor -- Minimum Wage (rates effective 01/01/2026)](https://dol.ny.gov/minimum-wage-0) | -> https://dol.ny.gov/minimum-wage |
| OH | [Combined Form IT 4 — Employee's Withholding Exemption Certificate (post-2020-12-07 combine](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth-it4-combined-fi.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/employer_withholding/generic/wth-it4-combined-fi.pdf |
| OH | [Ohio Dept of Taxation - School District Income Tax rate list, Tax Year 2026](https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf |
| OH | [Ohio Form IT 4NR — Employee's Statement of Residency in a Reciprocity State (Rev. 5/07), O](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth_it4nr.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/employer_withholding/generic/wth_it4nr.pdf |
| PA | [PA Department of Revenue -- Employer Withholding](https://www.pa.gov/en/agencies/revenue/resources/tax-types-and-information/employer-withholding.html) | -> https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/employer-withholding |
| WI | [2026 Tax Rate Schedule for Employers (DWD, full Schedule D reserve-percentage rate table)](https://dwd.wisconsin.gov/ui/employers/taxrates.htm) | read with a headless browser |
| WY | [Wyoming Dept of Workforce Services -- Unemployment Tax Rates](https://dws.wyo.gov/dws-division/unemployment-insurance/wyui/unemployment-tax-rates/) | -> https://dws.wyo.gov/dws-division/unemployment-insurance/employers/unemployment-tax-rates/ |

## Sites that block automated checks (12)

These can't be watched by a script (bot protection or JavaScript-only pages). Check them by hand now and then, or find the same document at an address that allows it.

<details><summary>Show all</summary>

| Jurisdiction | Source | Detail |
|---|---|---|
| AR | [Arkansas Department of Labor and Licensing -- Minimum Wage and Overtime](https://labor.arkansas.gov/labor/labor-standards/minimum-wage-and-overtime/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AZ | [UIT-0603A (FY26), Unemployment Insurance Tax Rate Chart](https://des.az.gov/sites/default/files/dl/UIT-0603A_FY26.pdf) | read with a browser last time; a real browser was refused too |
| DC | [DC Department of Employment Services -- Office of Wage-Hour Compliance](https://does.dc.gov/service/office-wage-hour-compliance-0) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DC | [DC OTR withholding](https://otr.cfo.dc.gov/page/withholding-tax-forms-and-publications) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NM | [City of Las Cruces -- Official Notice, Minimum Wage Ordinance (2026)](https://lascruces.gov/wp-content/uploads/2025/09/MinimumWageEng26.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NV | [UI Information for Employers (Nevada DETR)](https://detr.nv.gov/Page/UI_Information_for_Employers) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NY Department of Financial Services -- COBRA and Premium Assistance](https://www.dfs.ny.gov/consumers/health_insurance/cobra_and_premium_assistance) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NY Election Law 3-400 via NY Senate Open Legislation API (free key: NYSENATE_API_KEY)](https://legislation.nysenate.gov/api/3/laws/ELN/3-400?key={env:NYSENATE_API_KEY}) | needs a free API key: add repository secret NYSENATE_API_KEY; a real browser was refused too |
| NY | [NY Labor Law 651 via NY Senate Open Legislation API (free key: NYSENATE_API_KEY)](https://legislation.nysenate.gov/api/3/laws/LAB/651?key={env:NYSENATE_API_KEY}) | needs a free API key: add repository secret NYSENATE_API_KEY; a real browser was refused too |
| NY | [NY.gov -- New York State Paid Sick Leave FAQ](https://www.ny.gov/sites/default/files/atoms/files/PSL_FAQ_PaidSickLeaveFAQ.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| OH | [Ohio Municipal Income Tax Rates (The Finder, bulk CSV download)](https://api.thefinder.tax.ohio.gov/finder/api/v1/tax-rates/downloads/Muni/OHMuniRateTable.csv) | HTTP 401: the site refuses automated requests; a real browser was refused too |
| US | [HHS/ASPE 2026 Poverty Guidelines for the 48 Contiguous States and DC — household of 1: $15](https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines) | HTTP 403: the site refuses automated requests; a real browser was refused too |

</details>

## Unchanged (385)

<details><summary>Show all</summary>

- AK - [Alaska Dept of Labor and Workforce Development, Employment Security Tax -- 2026 Unemployment Insuran](https://labor.alaska.gov/estax/2026-experience-rates.html) (last changed: 2026-09-24)
- AK - [Alaska Statutes 23.20 -- Alaska Employment Security Act (reciprocity/local tax context)](https://www.akleg.gov/basis/statutes.asp#23.20) (last changed: 2026-09-24)
- AL - [Alabama DOR withholding tax](https://www.revenue.alabama.gov/individual-corporate/withholding-tax-2/) (last changed: 2026-09-24)
- AL - [Alabama Department of Labor -- 2026 UI wage base and rate figures (cross-source)](https://www2.labor.alabama.gov/) (last changed: 2026-09-24)
- AL - [Alabama Department of Revenue -- NOTICE: Overtime Exemption Ends June 30, 2025](https://www.revenue.alabama.gov/notice-overtime-exemption-ends-june-30-2025/) (last changed: 2026-09-24)
- AL - [Alabama State Comptroller -- Memorandum, 'Jefferson County Occupational Tax'](https://comptroller.alabama.gov/wp-content/uploads/2018/01/Jefferson-County-Occupational-Tax.pdf) (last changed: 2026-09-24)
- AL - [Form A4 (Rev. 4/2025) -- Employee's Withholding Tax Exemption Certificate](https://www.revenue.alabama.gov/wp-content/uploads/2025/04/A4_0425.pdf) (last changed: 2026-09-24)
- AL - [USDA National Finance Center -- Alabama State Income Tax Withholding bulletin (TAXES 22-24)](https://help.nfc.usda.gov/bulletins/2022/1666037747.htm?taxmap=true) (last changed: 2026-09-24)
- AL - [Withholding Tax Tables and Instructions for Employers and Withholding Agents (Rev. 01/26)](https://www.revenue.alabama.gov/wp-content/uploads/2026/01/whbooklet_0126.pdf) (last changed: 2026-09-24)
- AR - [AR4EC -- Employee's Withholding Exemption Certificate (R 02/07/2025)](https://www.dfa.arkansas.gov/wp-content/uploads/AR4EC2025_FI.pdf) (last changed: 2026-09-24)
- AR - [Arkansas DFA withholding tax](https://www.dfa.arkansas.gov/office/taxes/income-tax-administration/withholding-tax-branch/) (last changed: 2026-09-24)
- AR - [Arkansas UI Information Handbook 2026 (wage base, rates)](https://dws.arkansas.gov/wp-content/uploads/UI-Handbook-2026-Final.pdf) (last changed: 2026-09-24)
- AR - [Arkansas withholding formula (current)](https://www.dfa.arkansas.gov/wp-content/uploads/Withholding-Tax-Formula.pdf) (last changed: 2026-09-24)
- AR - [State of Arkansas Withholding Tax -- Low Income Tax Tables, Tax Year 2026 (Effective 01/01/2026)](https://www.dfa.arkansas.gov/wp-content/uploads/withholdTaxTablesLowIncome_2026.pdf) (last changed: 2026-09-24)
- AS - [U.S. DOL WH1088 AMS (Rev. 09/24) -- Federal Minimum Wage in American Samoa by Industry (required wor](https://www.dol.gov/sites/dolgov/files/WHD/legacy/files/ASminwagePoster.pdf) (last changed: 2026-09-24)
- AZ - [150-206-692, Oregon's out-of-state/nonresident-employer guide (cross-referenced from OR-2026.json)](https://www.oregon.gov/dor/forms/FormsPubs/withholding-transit-tax-non-resident_206-692.pdf) (last changed: 2026-09-24)
- AZ - [2026 Form A-4, Employee's Arizona Withholding Election](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_A-4_f.pdf) (last changed: 2026-09-24)
- AZ - [2026 Form WEC, Employee Withholding Exemption Certificate (Instructions)](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_WECi.pdf) (last changed: 2026-09-24)
- AZ - [Arizona DOR withholding](https://azdor.gov/business/withholding-tax) (last changed: 2026-09-24)
- AZ - [City of Flagstaff -- City of Flagstaff announces minimum wage for 2026](https://www.flagstaff.az.gov/CivicAlerts.aspx?AID=2165) (last changed: 2026-09-24)
- AZ - [City of Tucson -- Tucson Minimum Wage Act (Proposition 206, November 2021)](https://www.tucsonaz.gov/Departments/Business-Services-Department/Tucson-Minimum-Wage-Act) (last changed: 2026-09-24)
- CA - [California DE 44 employer's guide](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) (last changed: 2026-09-24)
- CA - [California Department of Industrial Relations -- Fast Food Minimum Wage Frequently Asked Questions](https://www.dir.ca.gov/dlse/Fast-Food-Minimum-Wage-FAQ.htm) (last changed: 2026-09-24)
- CA - [California Department of Industrial Relations -- Health Care Worker Minimum Wage Frequently Asked Qu](https://www.dir.ca.gov/dlse/Health-Care-Worker-Minimum-Wage-FAQ.htm) (last changed: 2026-09-24)
- CA - [California EDD rates and withholding](https://edd.ca.gov/en/payroll_taxes/rates_and_withholding/) (last changed: 2026-09-24)
- CA - [California Employer's Guide (DE 44), Rev. 52 (4-26) -- "How to Withhold PIT on Supplemental Wages"](https://www.edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) (last changed: 2026-09-24)
- CA - [California Withholding Schedules for 2026 (Method B - Exact Calculation Method)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26methb.pdf) (last changed: 2026-09-24)
- CA - [City of Long Beach -- Notice of Annual Adjustment, Hotel Worker Hourly Rate $26.50 (Measure RW, effe](https://www.longbeach.gov/globalassets/city-clerk/media-library/documents/public-notices/public-notices/measure-rw-bulletin-effective-july-1-2026) (last changed: 2026-09-24)
- CA - [City of Santa Monica -- Minimum Wage](https://www.santamonica.gov/minimum-wage) (last changed: 2026-09-24)
- CA - [Form DE 4, Employee's Withholding Allowance Certificate, Rev. 56 (1-26)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de4.pdf) (last changed: 2026-09-24)
- CA - [Unincorporated Los Angeles County minimum wage, July 1, 2025 step ($17.81)](https://dcba.lacounty.gov/newsroom/new-worker-protections-for-july-1-2025/) (last changed: 2026-09-24)
- CO - [Boulder County -- Local Minimum Wage](https://bouldercounty.gov/departments/commissioners/local-minimum-wage/) (last changed: 2026-09-24)
- CO - [City and County of Denver -- Denver Local Minimum Wage Adjusts to $19.29 per Hour for 2026](https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Department-of-Finance/News/2025/Denver-Local-Minimum-Wage-Adjusts-to-19.29-per-Hour-for-2026) (last changed: 2026-09-24)
- CO - [City and County of Denver Tax Guide Topic No. 61 -- Occupational Privilege Taxes (OPT or Head Tax)](https://www.denvergov.org/content/dam/denvergov/Portals/571/documents/TaxGuide/TaxGuideTopic61_OccupationalPrivilegeTaxes.pdf) (last changed: 2026-09-24)
- CO - [City of Boulder -- Local Minimum Wage](https://bouldercolorado.gov/local-minimum-wage) (last changed: 2026-09-24)
- CO - [City of Glendale, CO — Occupational Privilege Tax (municipal code Chapter 3.21 and the city's own OP](https://www.glendale.co.us/355/Occupational-Privilege-Tax) (last changed: 2026-09-24)
- CO - [City of Sheridan, CO — Occupational Privilege Tax](https://ci.sheridan.co.us/288/Occupational-Privilege-Tax) (last changed: 2026-09-24)
- CO - [Colorado Department of Labor & Employment — UI Premium Rates](https://cdle.colorado.gov/employers/unemployment-insurance-premiums/premium-rates) (last changed: 2026-09-24)
- CO - [Colorado Division of Labor Standards (local minimum wage notices, INFO #19)](https://cdle.colorado.gov/dlss) (last changed: 2026-09-24)
- CO - [Colorado Wage Withholding Tax Guide, January 2026](https://tax.colorado.gov/sites/tax/files/documents/Wage_Withholding_Tax_Guide_Jan_2026.pdf) (last changed: 2026-09-24)
- CO - [Colorado wage withholding](https://tax.colorado.gov/withholding-tax) (last changed: 2026-09-24)
- CO - [Colorado withholding tax guide](https://tax.colorado.gov/withholding-tax-guide) (last changed: 2026-09-24)
- CO - [DR 1098 (10/21/25), 2026 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/sites/tax/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf) (last changed: 2026-09-24)
- CO - [Family and Medical Leave Insurance (FAMLI) — Employers page](https://famli.colorado.gov/employers) (last changed: 2026-09-24)
- CT - [Connecticut 2026 Informational Publications (Circular CT is IP 2026(1))](https://portal.ct.gov/drs/publications/informational-publications/2026/2026-informational-publications) (last changed: 2026-09-24)
- CT - [Connecticut DRS publications (new years' publication lists appear here)](https://portal.ct.gov/drs/publications/publications-page) (last changed: 2026-09-24)
- CT - [Form CT-W4, Employee's Withholding Certificate (Rev. 12/25, effective 2026-01-01)](https://portal.ct.gov/-/media/drs/forms/2026/wth/ct-w4_1225fillable.pdf?rev=9e9e0216cd394f579961e1d4cd5c7ab3&hash=4D496BCBD10659462D3799732B5A91F2) (last changed: 2026-09-24)
- CT - [IP 2026(1), Connecticut Employer's Tax Guide, Circular CT](https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-1.pdf?rev=4482a3dca0a44b28ae39381a91fb0916&hash=57C34787EE2C1D4A7F989EE1F6B8F0F8) (last changed: 2026-09-24)
- CT - [TPG-211, 2026 Withholding Calculation Rules (Rev. 12/25)](https://portal.ct.gov/-/media/drs/forms/2025/wth/tpg-211_1225.pdf?rev=e16ef13773ec42d4bf0afd2e192e0176&hash=CCF9990D8EE0AA580A11BC6E97235650) (last changed: 2026-09-24)
- DC - [D.C. Home Rule Act of 1973 nonresident-taxation prohibition](https://code.dccouncil.gov/us/dc/council/code/sections/47-1806.04) (last changed: 2026-09-24)
- DC - [DC Department of Employment Services, Office of Wage and Hour -- District of Columbia Minimum Wage I](https://does.dc.gov/sites/default/files/dc/sites/does/publication/attachments/2026%20Minimum%20Wage%20Increase%20Notice_0.pdf) (last changed: 2026-09-24)
- DC - [NFC-22-1668460546, District of Columbia Income Tax Withholding (USDA National Finance Center bulleti](https://help.nfc.usda.gov/bulletins/2022/1668460546.htm) (last changed: 2026-09-24)
- DE - [Delaware Department of Labor -- Employer Services / Unemployment Insurance Tax (Merit Rate Table)](https://labor.delaware.gov/divisions/unemployment-insurance/employer-services/) (last changed: 2026-09-24)
- DE - [Delaware House Bill 13 (153rd General Assembly) + House Substitute No. 2 for HB13 -- bracket-restruc](https://legis.delaware.gov/BillDetail?LegislationId=141813) (last changed: 2026-09-24)
- DE - [Delaware withholding forms and guide](https://revenue.delaware.gov/employers-guide-withholding-regulations-employers-duties/) (last changed: 2026-09-24)
- DE - [Employer's & TPAs' Guide to Delaware Paid Leave](https://laborfiles.delaware.gov/main/pfl/Employer_and_TPAs_Guide_to_DPL.pdf) (last changed: 2026-09-24)
- DE - [Form DE-W4, Employee's Withholding Allowance Certificate + DE-W4R Resident Allowance Worksheet (Revi](https://revenuefiles.delaware.gov/2021/DE-W4.pdf) (last changed: 2026-09-24)
- DE - [Form W-4NR, Non-Resident Withholding Computation Worksheet (Revision 20220304)](https://revenuefiles.delaware.gov/docs/w4nr.pdf) (last changed: 2026-09-24)
- FL - [Fla. Stat. sec. 218.077 -- Local government employment benefit mandates preempted](https://www.flsenate.gov/Laws/Statutes/2025/218.077) (last changed: 2026-09-24)
- GA - [Employer's Withholding Tax Guide 2026 (Revised June 2026, reflecting HB 463 signed 2026-05-11)](https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-june-2026/download) (last changed: 2026-09-24)
- GA - [Form G-4 (Rev. 06/03/26) -- State of Georgia Employee's Withholding Allowance Certificate](https://dor.georgia.gov/document/form/tsdemployeeswithholdingallowancecertificateg-4pdf/download) (last changed: 2026-09-24)
- GA - [Georgia DOR withholding](https://dor.georgia.gov/taxes/withholding-tax-employers) (last changed: 2026-09-24)
- GA - [Georgia Employer's Tax Guide (current)](https://dor.georgia.gov/employers-tax-guide) (last changed: 2026-09-24)
- GA - [Governor Brian Kemp -- press release, HB 463 signed 2026-05-11](https://gov.georgia.gov/press-releases/2026-05-11/gov-kemp-signs-legislation-lowering-taxes-and-supporting-economic-growth) (last changed: 2026-09-24)
- GA - [USDA National Finance Center -- Georgia State Income Tax Withholding bulletin (2026)](https://help.nfc.usda.gov/bulletins/2026/1784643404.htm) (last changed: 2026-09-24)
- HI - [Booklet A, Employer's Tax Guide, Appendix -- Hawaii Income Tax Withholding Rates, Methods, and Tax T](https://files.hawaii.gov/tax/news/pubs/25BkltA.pdf) (last changed: 2026-09-24)
- HI - [Hawaii DOTAX withholding](https://tax.hawaii.gov/geninfo/a2_b2_4empl_whhold/) (last changed: 2026-09-24)
- HI - [Hawaii Dept of Labor and Industrial Relations -- Tax Rate Schedule and Weekly Benefit Amount (Unempl](https://labor.hawaii.gov/ui/tax-rate-schedule-and-weekly-benefit-amount/) (last changed: 2026-09-24)
- HI - [Hawaii Dept of Labor and Industrial Relations, Disability Compensation Division -- 2026 Maximum Week](https://labor.hawaii.gov/dcd/files/2025/12/2026-Maximum-Weekly-Wage-Base.pdf) (last changed: 2026-09-24)
- HI - [Hawaii Dept of Labor and Industrial Relations, Wage Standards Division -- Hawaii Family Leave (HFLL)](https://labor.hawaii.gov/wsd/hawaii-family-leave/) (last changed: 2026-09-24)
- HI - [Hawaii employer payroll updates](https://tax.hawaii.gov/payrollupdate/) (last changed: 2026-09-24)
- IA - [2026 IA W-4, Employee Withholding Allowance Certificate](https://revenue.iowa.gov/media/4324/download?inline=) (last changed: 2026-09-24)
- IA - [House File 2631 (91st General Assembly) — proposed Iowa Family and Medical Leave Act](https://www.legis.iowa.gov/docs/publications/LGI/91/HF2631.pdf) (last changed: 2026-09-24)
- IA - [Iowa - Illinois Reciprocal Agreement — Iowa Department of Revenue](https://revenue.iowa.gov/taxes/tax-guidance/individual-income-tax/iowa-illinois-reciprocal-agreement) (last changed: 2026-09-24)
- IA - [Iowa Individual Income Tax Withholding Formula, Effective January 1, 2026](https://revenue.iowa.gov/media/53/download?inline=) (last changed: 2026-09-24)
- IA - [Iowa Workforce Development / Iowa Division of Labor -- Your Rights Under the Iowa Minimum Wage Law a](https://workforce.iowa.gov/media/234/download) (last changed: 2026-09-24)
- IA - [Iowa withholding](https://revenue.iowa.gov/taxes/tax-guidance/withholding-tax) (last changed: 2026-09-24)
- ID - [EPB00744 — Table for Percentage Computation Method of Withholding](https://tax.idaho.gov/document-mngr/pubs_EPB00744) (last changed: 2026-09-24)
- ID - [Form ID W-4, Employee's Withholding Allowance Certificate (EFO00307, 04-28-2025 revision)](https://tax.idaho.gov/w4form) (last changed: 2026-09-24)
- ID - [Idaho Child Tax Credit Allowance Table (ICTCAT) page](https://tax.idaho.gov/ictcat) (last changed: 2026-09-24)
- ID - [Idaho Department of Labor — 2026 UI Rate Class Array](https://www.labor.idaho.gov/wp-content/uploads/2024/12/Tax-rate_Class-array_2026.pdf) (last changed: 2026-09-24)
- ID - [Idaho computing withholding](https://tax.idaho.gov/taxes/income-tax/withholding/computing/) (last changed: 2026-09-24)
- ID - [Withholding tables updated for 2026 — Idaho State Tax Commission press release](https://tax.idaho.gov/pressrelease/withholding-tables-updated-for-2026/) (last changed: 2026-09-24)
- IL - [2026 IL-700-T Illinois Withholding Tax Tables](https://tax.illinois.gov/forms/withholding/currentyear/il-700-t-withholding-guide-tables.html) (last changed: 2026-09-24)
- IL - [2026 State Experience Factor and Employers' UI Contribution Rates (EA-50 Report, Illinois Department](https://ides.illinois.gov/content/dam/soi/en/web/ides/ides_forms_and_publications/EA-50_2026.pdf) (last changed: 2026-09-24)
- IL - [City of Chicago / Cook County July 1, 2026 minimum wage announcements](https://www.cookcountyil.gov/news/cook-county-issues-notice-minimum-wage-ordinance-5) (last changed: 2026-09-24)
- IL - [Form IL-W-4 — Employee's and other Payee's Illinois Withholding Allowance Certificate and Instructio](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-w-4.pdf) (last changed: 2026-09-24)
- IL - [IL-W-5-NR — Employee's Statement of Nonresidence in Illinois (R-12/10)](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/2025/il-w-5-nr.pdf) (last changed: 2026-09-24)
- IL - [Illinois withholding income tax](https://tax.illinois.gov/research/taxinformation/withholdingincometax.html) (last changed: 2026-09-24)
- IL - [Pub-130, Withholding Illinois Income Tax for My Employees](https://tax.illinois.gov/research/publications/pubs/who-is-required-to-withhold-illinois-income-tax/withholding-illinois-income-tax-for-my-employees.html) (last changed: 2026-09-24)
- IN - [DOR: Withholding Tax Forms — WH-4 (State Form 48845), 'Employee's Withholding Exemption & County Sta](https://www.in.gov/dor/tax-forms/withholding-tax-forms/) (last changed: 2026-09-24)
- IN - [Form WH-47 — Certificate of Residence (State Form 9686, R3/3-21)](https://forms.in.gov/download.aspx?id=2419) (last changed: 2026-09-24)
- IN - [Indiana DOR withholding](https://www.in.gov/dor/i-am-a/business-corp/withholding/) (last changed: 2026-09-24)
- IN - [Indiana Unemployment for Employers: New Employer Premium Rate (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/new-employer-premium-rate/) (last changed: 2026-09-24)
- IN - [Indiana Unemployment for Employers: Rate Computation (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/) (last changed: 2026-09-24)
- IN - [Indiana Unemployment for Employers: State Premium Rate Computation (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/state-premium-rate-computation/) (last changed: 2026-09-25)
- KS - [Form 200, Local Intangibles Tax Return (Rev. 9-23-25)](https://www.ksrevenue.gov/pdf/20026.pdf) (last changed: 2026-09-24)
- KS - [KW-100, Kansas Withholding Tax Guide (Rev. 10-24) -- SUPPLEMENTAL WAGES section, page 8](https://ksrevenue.gov/pdf/kw100.pdf) (last changed: 2026-09-24)
- KS - [Kansas withholding tax guide KW-100](https://www.ksrevenue.gov/pdf/kw100.pdf) (last changed: 2026-09-24)
- KY - [103 KAR 17:140 -- Individual income tax - reciprocity - nonresidents](https://revenue.ky.gov/Dor%20Training%20Materials/103%20KAR%2017.140.%20Individual%20income%20tax%20-%20reciprocity%20-%20nonresidents.pdf) (last changed: 2026-09-24)
- KY - [42A804 (K-4)(12-2025) -- Kentucky's Withholding Certificate 2026](https://revenue.ky.gov/Forms/42A804%20(K-4)%20(2026).pdf) (last changed: 2026-09-24)
- KY - [City of Covington, KY — Finance Department, business licensing and occupational license fee](https://www.covingtonky.gov/government/departments/finance/business-licensing-occupational-license-fee) (last changed: 2026-09-24)
- KY - [City of Georgetown, KY — Taxes and license fees (occupational license tax: net profits vs gross rece](https://www.georgetownky.gov/2167/Taxes-License-Fees) (last changed: 2026-09-24)
- KY - [City of Henderson, KY — Occupational License Tax](https://www.hendersonky.gov/174/Occupational-License-Tax) (last changed: 2026-09-24)
- KY - [City of Lexington -- Occupational license fee: rates and current forms](https://www.lexingtonky.gov/working/business-licensing-taxes/occupational-license-fee-rates-current-forms) (last changed: 2026-09-24)
- KY - [KRS 67.750 -- Definitions for KRS 67.750 to 67.790](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=48677) (last changed: 2026-09-24)
- KY - [KRS 68.180 -- Occupational license tax in counties containing 300,000 population](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=50960) (last changed: 2026-09-24)
- KY - [KRS 68.197 -- License fees in counties of 30,000 or more](https://apps.legislature.ky.gov/law/Statutes/statute.aspx?id=54832) (last changed: 2026-09-24)
- KY - [KRS 92.281 -- Levy of all taxes authorized by Constitution Section 181 -- Exceptions -- License fees](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=48683) (last changed: 2026-09-24)
- KY - [Kentucky 2026 withholding formula](https://revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf) (last changed: 2026-09-24)
- KY - [Kentucky Secretary of State -- Occupational License Tax Forms Database (KRS 67.766)](https://web.sos.ky.gov/occupationaltax/) (last changed: 2026-09-24)
- KY - [Kentucky Technical Advice Memorandum KY-TAM-18-03 -- Credit for Income Tax Paid to Another State](https://revenue.ky.gov/DOR%20Training%20Materials/KY-TAM-18-03%20Credit%20for%20Income%20Tax%20Paid%20to%20Another%20State%20FINAL%20(UPDATED%20HYPERLINKS).pdf) (last changed: 2026-09-24)
- KY - [Kentucky withholding](https://revenue.ky.gov/Business/Pages/Employer-Payroll-Withholding.aspx) (last changed: 2026-09-24)
- KY - [Louisville Metro Revenue Commission -- W-1KJC Instructions and Louisville Metro Code Sec. 110.02](https://louisvilleky.gov/sites/default/files/2024-12/w-1kjc_instructions_2025.pdf) (last changed: 2026-09-24)
- KY - [USDA National Finance Center -- Kentucky City (Local) Income Tax Withholding bulletin](https://help.nfc.usda.gov/bulletins/2024/1709749757.htm) (last changed: 2026-09-24)
- LA - [Louisiana Revised Statutes 47:293 -- Tax table income (residents)](https://legis.la.gov/Legis/Law.aspx?d=101760) (last changed: 2026-09-24)
- LA - [Louisiana withholding](https://revenue.louisiana.gov/businesses/widely-used-tax-types/withholding/) (last changed: 2026-09-24)
- LA - [Louisiana withholding tax tables](https://revenue.louisiana.gov/tax-professionals/general-resources/louisiana-withholding-tax-tables/) (last changed: 2026-09-24)
- LA - [R-1300 (1/26) -- Employee's Withholding Certificate (Form L-4)](https://dam.ldr.la.gov/taxforms/1300-1-26-F.pdf) (last changed: 2026-09-24)
- LA - [R-1306 (1/26) -- Louisiana Withholding Tables and Formulas, effective on or after January 1, 2026](https://dam.ldr.la.gov/taxforms/1306-1-26.pdf) (last changed: 2026-09-24)
- LA - [USDA National Finance Center -- Louisiana State Income Tax Withholding bulletin (2025)](https://help.nfc.usda.gov/bulletins/2025/1740487316.htm) (last changed: 2026-09-24)
- MA - [Form M-4, Massachusetts Employee's Withholding Exemption Certificate (Rev. 11/19)](https://www.miltonma.gov/DocumentCenter/View/6586/Massachusetts-Withholding-Form--M-4) (last changed: 2026-09-24)
- MA - [Massachusetts 4% Surtax on Taxable Income — cross-source (multiple tax-guide sources agreeing)](https://www.mass.gov/info-details/massachusetts-4-surtax-on-taxable-income) (last changed: 2026-09-24)
- MA - [Massachusetts Circular M (2026, effective January 1)](https://www.mass.gov/doc/massachusetts-circular-m-income-tax-withholding-tables-at-50-effective-january-1-2026/download) (last changed: 2026-09-24)
- MA - [Massachusetts Constitution, Article LXXXIX (Home Rule Amendment), Section 7 — Limitations on Local P](https://malegislature.gov/Laws/Constitution) (last changed: 2026-09-24)
- MA - [Massachusetts DOR withholding tax forms (new Circular M editions are listed here)](https://www.mass.gov/lists/dor-withholding-tax-forms) (last changed: 2026-09-24)
- MA - [Massachusetts General Laws Chapter 175M, Section 6 — PFML Contributions](https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXII/Chapter175M/Section6) (last changed: 2026-09-24)
- MA - [Massachusetts General Laws Chapter 62B, Section 2 — Duty of employer to withhold](https://malegislature.gov/Laws/GeneralLaws/PartI/TitleIX/Chapter62B/Section2) (last changed: 2026-09-24)
- MA - [USDA National Finance Center — Massachusetts State Income Tax Withholding (NFC-26-1769797447)](https://help.nfc.usda.gov/bulletins/2026/1769797447.htm) (last changed: 2026-09-24)
- MD - [2026 Maryland State and Local Income Tax Withholding Information (Central Payroll Bureau memo, Attac](https://www.marylandcomptroller.gov/content/dam/mdcomp/md/state-payroll/memos/2026/2026-maryland-state-and-local-withholding-information.pdf) (last changed: 2026-09-24)
- MD - [Howard County, MD -- Minimum Wage schedule (Finance Department)](https://www.howardcountymd.gov/finance/minimum-wage) (last changed: 2026-09-24)
- MD - [Maryland Division of Labor and Industry -- Maryland Minimum Wage and Overtime Law (Employment Standa](https://www.labor.maryland.gov/labor/wages/wagehrfacts.shtml) (last changed: 2026-09-24)
- MD - [Maryland employer withholding](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf) (last changed: 2026-09-24)
- MD - [Maryland withholding tax facts](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/facts/withholding-tax-facts-2026.pdf) (last changed: 2026-09-24)
- MD - [Montgomery County, MD Office of Human Rights -- Minimum Wage Increase (July 1, 2026)](https://www.montgomerycountymd.gov/office-human-rights/minimum-wage-increase) (last changed: 2026-09-24)
- MD - [Montgomery County, MD tipped-employee cash wage ($4.00/hr, Montgomery County Code Sec. 27-69)](https://www.montgomerycountymd.gov/humanrights/min-wage.html) (last changed: 2026-09-24)
- ME - [City of Rockland, Maine -- 2026 Minimum Wage Notice](https://rocklandmaine.gov/DocumentCenter/View/2670/2026-Minimum-Wage-Notice---Rockland) (last changed: 2026-09-24)
- ME - [Form W-4ME, Employee's Withholding Allowance Certificate (Revised: December 2025)](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_form_w-4me_fillable.pdf) (last changed: 2026-09-24)
- ME - [Maine Department of Labor — June 2026 Paid Family and Medical Leave (PFML) Employer FAQ](https://www.maine.gov/paidleave/docs/2026/employers/faq/employerFAQenglish.pdf) (last changed: 2026-09-24)
- ME - [Maine Revenue Services — Withholding Tables for Individual Income Tax (2026)](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_wh_tab_instr.pdf) (last changed: 2026-09-24)
- ME - [Maine withholding tables](https://www.maine.gov/revenue/taxes/income-estate-tax/employer-withholding) (last changed: 2026-09-24)
- ME - [USDA National Finance Center — Maine State Income Tax Withholding (NFC-26-1771620053)](https://help.nfc.usda.gov/bulletins/2026/1771620053.htm) (last changed: 2026-09-24)
- MI - [2026 Michigan Income Tax Withholding Guide, Form 446 (Rev. 02-26)](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2026/446_Withholding-Guide_2026.pdf) (last changed: 2026-09-24)
- MI - [4.25% Income Tax Rate for Individuals and Fiduciaries in 2026 Tax Year (Treasury taxpayer notice, 20](https://www.michigan.gov/treasury/reference/taxpayer-notices/2026/04/15/425-income-tax-rate-for-individuals-and-fiduciaries-in-2026-tax-year) (last changed: 2026-09-24)
- MI - [5469 (Rev. 05-24) — 2025 City of Detroit Income Tax Withholding Guide (Treasury administers Detroit ](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/City-Withholding/TY2025/5469_ty2025.pdf) (last changed: 2026-09-24)
- MI - [MI-W4 (Rev. 12-20) — Employee's Michigan Withholding Exemption Certificate](https://www.michigan.gov/-/media/Project/Websites/taxes/Forms/All-Years/MIW4.pdf) (last changed: 2026-09-24)
- MI - [Michigan LEO/UIA — Taxable Wage Base FAQ](https://www.michigan.gov/leo/bureaus-agencies/uia/employers/forms/accordion/taxable-wage-base) (last changed: 2026-09-24)
- MI - [Michigan LEO/UIA — Unemployment Tax Rate (statutory formula, Section 19 of the Michigan Employment S](https://www.michigan.gov/leo/bureaus-agencies/uia/assets/unemployment-tax-rate) (last changed: 2026-09-24)
- MI - [Michigan Treasury — Withholding Reciprocity Examples (Analysis section: MCL 206.703(2), MCL 206.110,](https://www.michigan.gov/taxes/business-taxes/payroll-service-providers/withholding-reciprocity-examples) (last changed: 2026-09-24)
- MI - [Michigan withholding tax](https://www.michigan.gov/taxes/business-taxes/withholding) (last changed: 2026-09-24)
- MI - [Other Michigan Cities with Income Tax (City of Grand Rapids consolidated rate/exemption table)](https://www.grandrapidsmi.gov/departments/fiscal-services/income-tax/other-michigan-cities-with-income-tax/) (last changed: 2026-09-24)
- MI - [Revenue Administrative Bulletin 1988-27 — Section 125 cafeteria plan benefits excluded from AGI are ](https://michigan.gov/treasury/0,4679,7-121-44402_44415_44416-7351--,00.html) (last changed: 2026-09-24)
- MI - [Which cities impose an income tax? (Michigan Dept of Treasury — authoritative list of all 24 cities)](https://www.michigan.gov/taxes/questions/iit/accordion/general/what-cities-impose-an-income-tax) (last changed: 2026-09-24)
- MN - [2026 Form W-4MN, Minnesota Employee Withholding Certificate](https://www.revenue.state.mn.us/sites/default/files/2026-04/w-4mn.pdf) (last changed: 2026-09-24)
- MN - [2026 Minnesota Withholding Tax Instructions and Tables (wh-inst-26)](https://www.revenue.state.mn.us/sites/default/files/2025-12/wh-inst-26.pdf) (last changed: 2026-09-24)
- MN - [City of Minneapolis -- Minimum wage increases to $16.37 for all employers](https://www.minneapolismn.gov/news/2025/december/minimum-wage/) (last changed: 2026-09-24)
- MN - [City of Saint Paul -- Minimum Wage Increases for Small and Micro Businesses (effective July 1, 2026)](https://www.stpaul.gov/news/city-saint-paul-minimum-wage-increases-small-and-micro-businesses) (last changed: 2026-09-24)
- MN - [Minn. R. 8002.0200 (administrative rule implementing 290.081's reciprocity exclusion)](https://www.revisor.mn.gov/rules/8002.0200/) (last changed: 2026-09-25)
- MN - [Minn. Stat. § 268B.14 (Premium rates)](https://www.revisor.mn.gov/statutes/cite/268B.14) (last changed: 2026-09-25)
- MN - [Minn. Stat. § 290.081 (Income of nonresidents, reciprocity)](https://www.revisor.mn.gov/statutes/cite/290.081) (last changed: 2026-09-25)
- MN - [Minn. Stat. § 477A.016](https://www.revisor.mn.gov/statutes/cite/477A.016) (last changed: 2026-09-25)
- MN - [Minnesota Department of Labor and Industry -- Minimum wage in Minnesota](https://www.dli.mn.gov/business/employment-practices/minimum-wage-minnesota) (last changed: 2026-09-24)
- MN - [Minnesota Department of Revenue -- Reciprocity for Individuals, and wh-inst-26 p.4 ('Reciprocity for](https://www.revenue.state.mn.us/reciprocity) (last changed: 2026-09-24)
- MN - [Minnesota withholding tax](https://www.revenue.state.mn.us/withholding-tax) (last changed: 2026-09-24)
- MO - [2026 Missouri Withholding Tax Formula](https://dor.mo.gov/forms/Withholding%20Formula_2026.pdf) (last changed: 2026-09-24)
- MO - [Form MO W-4, Employee's Withholding Certificate](https://dor.mo.gov/forms/MO%20W-4.pdf) (last changed: 2026-09-24)
- MO - [Missouri Department of Labor and Industrial Relations -- Minimum Wage](https://labor.mo.gov/dls/minimum-wage) (last changed: 2026-09-24)
- MO - [Missouri unemployment insurance 2026 rate/wage-base reporting (Bloomberg Tax, Vensure, MO DOLIR's ow](https://labor.mo.gov/des/employers/tax-rates) (last changed: 2026-09-24)
- MO - [Missouri withholding](https://dor.mo.gov/taxation/business/tax-types/withholding/) (last changed: 2026-09-24)
- MS - [Mississippi Department of Employment Security -- Employer FAQs](https://mdes.ms.gov/employer-faqs/) (last changed: 2026-09-24)
- MS - [Mississippi withholding](https://www.dor.ms.gov/business/withholding-tax) (last changed: 2026-09-24)
- MS - [Pub 89-700-25-1 (Rev. 07/25) -- Withholding Income Tax Tables and Employer Instructions, effective J](https://www.dor.ms.gov/sites/default/files/tax-forms/business/89700251revised1.13.2026.pdf) (last changed: 2026-09-24)
- MS - [USDA National Finance Center -- Mississippi State Income Tax Withholding bulletin (NFC-26-1768327516](https://help.nfc.usda.gov/bulletins/2026/1768327516.htm) (last changed: 2026-09-24)
- MT - [2026 Form MW-4, Montana Employee's Withholding and Exemption Certificate](https://revenuefiles.mt.gov/files/Forms/Montana_Employee_Withholding_Allowance_and_Exemption_Certificate_Form_MW-4.pdf) (last changed: 2026-09-24)
- MT - [2026 Montana Publication 1, A Guide to Montana Tax Withholding and Estimated Payments](https://revenuefiles.mt.gov/files/Forms/Publication-1/Publication-1-2026.pdf) (last changed: 2026-09-24)
- MT - [Montana DLI -- UI Contribution Rate Schedules (all 12 schedules, I-XII)](https://uid.dli.mt.gov/employers/schedule-of-contribution-rates) (last changed: 2026-09-24)
- MT - [Montana Employer and Information Agent Guide (publication page)](https://revenue.mt.gov/publications/montana-employer-and-information-agent-guide) (last changed: 2026-09-24)
- MT - [Montana Employer and Information Agent Guide with Montana Withholding Tax Tables (V4, November 2025)](https://revenuefiles.mt.gov/files/Forms/Montana_Employer_and_Information_Agent_Guide_with_Tax_Tables.pdf) (last changed: 2026-09-24)
- MT - [Montana withholding](https://revenue.mt.gov/taxes/withholding-tax/wage-withholding-returns-and-payments) (last changed: 2026-09-24)
- MT - [Montana withholding news](https://revenue.mt.gov/news/recent-news/2026-withholding-updates) (last changed: 2026-09-24)
- NC - [NC Division of Employment Security -- Tax Rate Information](https://www.des.nc.gov/employers/tax-rate-information) (last changed: 2026-09-24)
- NC - [NC-30 (Web 11-25) -- 2026 Income Tax Withholding Tables and Instructions for Employers](https://www.ncdor.gov/income-tax-withholding-tables-and-instructions-employers/open) (last changed: 2026-09-24)
- NC - [NCDOR -- Withholding Tax Frequently Asked Questions](https://www.ncdor.gov/withholding-tax-frequently-asked-questions) (last changed: 2026-09-24)
- NC - [North Carolina withholding](https://www.ncdor.gov/taxes-forms/withholding-tax) (last changed: 2026-09-24)
- ND - [2026 Income Tax Withholding Rates and Instructions (North Dakota Office of State Tax Commissioner)](https://www.tax.nd.gov/sites/www/files/documents/forms/individual/2026-iit/2026-income-tax-withholding-rates-booklet.pdf) (last changed: 2026-09-24)
- ND - [Form NDW-R -- Reciprocity Exemption from Withholding for Qualifying Minnesota and Montana Residents](https://www.tax.nd.gov/sites/www/files/documents/forms/business/ndwrfillable.pdf) (last changed: 2026-09-24)
- ND - [North Dakota withholding](https://www.tax.nd.gov/income-tax-withholding) (last changed: 2026-09-24)
- NE - [2026 Nebraska Circular EN (full withholding guide)](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026cir_en_whole.pdf) (last changed: 2026-09-24)
- NE - [A Guide to Understanding Nebraska's Unemployment Insurance Combined Tax Rates (2026)](https://dol.nebraska.gov/webdocs/Resources/Items/2026%20UI%20guide%20to%20understanding.pdf) (last changed: 2026-09-24)
- NE - [Nebraska Attorney General -- suit against the City of Omaha over its minimum wage ordinance, and con](https://ago.nebraska.gov/news/attorney-general-hilgers-sues-city-omaha-over-unconstitutional-minimum-wage-ordinance) (last changed: 2026-09-24)
- NE - [Nebraska Department of Labor -- Nebraska's Minimum Wage Increases to $15 Effective January 1, 2026](https://dol.nebraska.gov/PressRelease/Details/338) (last changed: 2026-09-24)
- NE - [Nebraska Income Tax Withholding Percentage Method — Withholding Allowance Table](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026_percent.pdf) (last changed: 2026-09-24)
- NE - [Nebraska Legislative Bill 258 (2026), approved by the Governor February 9, 2026](https://nebraskalegislature.gov/FloorDocs/109/PDF/Slip/LB258.pdf) (last changed: 2026-09-24)
- NE - [Nebraska withholding](https://revenue.nebraska.gov/businesses/nebraska-income-tax-withholding) (last changed: 2026-09-24)
- NH - [NH RSA 279:21 minimum hourly rate (statute)](https://gc.nh.gov/rsa/html/XXIII/279/279-21.htm) (last changed: 2026-09-24)
- NJ - [City of Newark Q1 2026 Payroll Tax Booklet](https://www.newarknj.gov/DocumentCenter/View/2741/Payroll-Tax-Booklet-2026-PDF) (last changed: 2026-09-24)
- NJ - [Form NJ-165 -- Employee's Certificate of Nonresidence in New Jersey](https://www.nj.gov/treasury/taxation/pdf/current/nj165.pdf) (last changed: 2026-09-24)
- NJ - [Form NJ-W4, Employee's Withholding Allowance Certificate (1-21, last modified 2022-12-06)](https://nj.gov/treasury/taxation/pdf/current/njw4.pdf) (last changed: 2026-09-24)
- NJ - [NJ Division of Employer Accounts — 2026 employee UI / Workforce Development / Supplemental Workforce](https://www.nj.gov/labor/ea/employer-services/rate-info/) (last changed: 2026-09-24)
- NJ - [NJ Division of Temporary Disability and Family Leave Insurance — Worker FLI contribution rate](https://www.nj.gov/labor/myleavebenefits/worker/fli/) (last changed: 2026-09-24)
- NJ - [NJ Division of Temporary Disability and Family Leave Insurance — Worker TDI contribution rate](https://www.nj.gov/labor/myleavebenefits/worker/tdi/) (last changed: 2026-09-24)
- NJ - [NJDOL — New Benefit Rates for 2026 (taxable wage bases)](https://www.nj.gov/labor/lwdhome/press/2025/20251229_newbenefitrates2026.shtml) (last changed: 2026-09-24)
- NJ - [New Jersey Department of Labor and Workforce Development -- minimum wage increase announcement for J](https://www.nj.gov/labor/lwdhome/press/2025/20251001_Minimum_Wage.shtml) (last changed: 2026-09-24)
- NJ - [New Jersey NJ-WT withholding instructions](https://www.nj.gov/treasury/taxation/pdf/current/njwt.pdf) (last changed: 2026-09-24)
- NJ - [New Jersey Office of Administrative Law -- Notice of Administrative Changes, Minimum Wage (N.J.A.C. ](https://www.nj.gov/labor/assets/PDFs/Legal%20Notices/Other/Public%20Notice%20Minimum%20Wage%202026_FINAL.pdf) (last changed: 2026-09-24)
- NJ - [New Jersey Withholding Rate Tables (Percentage Method, effective Oct 1, 2020)](https://www.nj.gov/treasury/taxation/pdf/withholdingtables.pdf) (last changed: 2026-09-24)
- NJ - [New Jersey employer payroll tax](https://www.nj.gov/treasury/taxation/businesses/payroll/index.shtml) (last changed: 2026-09-24)
- NM - [City of Albuquerque -- Albuquerque Minimum Wage Information](https://www.cabq.gov/legal/albuquerque-minimum-wage-information) (last changed: 2026-09-24)
- NM - [City of Santa Fe -- Living Wage Ordinance notice (Municipal Code Sec. 28-1 SFCC 1987)](https://santafenm.gov/media/news_pdf/2025_Living_Wage_Ordinance.pdf) (last changed: 2026-09-24)
- NM - [New Mexico Taxation and Revenue Department — FYI-104, New Mexico Withholding Tax](https://www.tax.newmexico.gov/forms-publications/) (last changed: 2026-09-24)
- NM - [New Mexico withholding (FYI-104)](https://realfile.tax.newmexico.gov/FYI-104.pdf) (last changed: 2026-09-24)
- NM - [New Mexico workers' compensation FAQ (fee amounts)](https://www.workerscomp.nm.gov/faqs/) (last changed: 2026-09-24)
- NM - [Santa Fe County -- Living Wage Ordinance and 2026 living wage adjustment announcement](https://www.santafecountynm.gov/livingwage) (last changed: 2026-09-24)
- NM - [Santa Fe city and county living wage figures in effect through February 2026](https://www.santafecountynm.gov/news/detail/santa-fe-county-announces-living-wage-increase-effective-march-1-2025) (last changed: 2026-09-24)
- NM - [Texas Workforce Commission cross-reference for New Mexico UI figures -- New Mexico DWS 'How UI Tax R](https://www.dws.state.nm.us/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated) (last changed: 2026-09-24)
- NM - [USDA National Finance Center -- New Mexico State Income Tax Withholding bulletin (2025)](https://help.nfc.usda.gov/bulletins/2025/1741189057.htm) (last changed: 2026-09-24)
- NV - [Modified Business Tax (MBT) FAQs](https://tax.nv.gov/faqs/modified-business-tax-faqs/) (last changed: 2026-09-24)
- NV - [Modified Business Tax (MBT) program page](https://tax.nv.gov/tax-types/modified-business-tax) (last changed: 2026-09-24)
- NY - [29 U.S.C. 2611(4)(A)(i)-(ii)](https://www.dol.gov/agencies/whd/fmla) (last changed: 2026-09-24)
- NY - [DOL -- Calculating an Employer's UI Contribution Rate](https://dol.ny.gov/calculating-employers-ui-contribution-rate) (last changed: 2026-09-24)
- NY - [DOL -- Employer Contribution Rate Table](https://dol.ny.gov/employer-contribution-rate-table) (last changed: 2026-09-24)
- NY - [DOL -- Unemployment Insurance Rate Information](https://dol.ny.gov/unemployment-insurance-rate-information) (last changed: 2026-09-24)
- NY - [EEOC -- Section 2, Threshold Issues](https://www.eeoc.gov/laws/guidance/section-2-threshold-issues) (last changed: 2026-09-24)
- NY - [IRS -- Determining if an employer is an applicable large employer](https://www.irs.gov/affordable-care-act/employers/determining-if-an-employer-is-an-applicable-large-employer) (last changed: 2026-09-24)
- NY - [IT-2104, Employee's Withholding Allowance Certificate (2026)](https://www.tax.ny.gov/pdf/current_forms/it/it2104_fill_in.pdf) (last changed: 2026-09-24)
- NY - [Instructions for Form NYS-45 (tax.ny.gov)](https://www.tax.ny.gov/pdf/current_forms/wt/nys45i.pdf) (last changed: 2026-09-24)
- NY - [NY Department of Labor -- Register for Unemployment Insurance](https://dol.ny.gov/register-unemployment-insurance-0) (last changed: 2026-09-24)
- NY - [NY Department of Labor -- Worker Adjustment and Retraining Notification (WARN)](https://dol.ny.gov/worker-adjustment-and-retraining-notification-warn) (last changed: 2026-09-24)
- NY - [NY Paid Family Leave payroll deduction notice 2026 (rate and cap)](https://www.wcb.ny.gov/content/main/forms/PFLDocs/pfl-pay-deduction-notice-2026.pdf) (last changed: 2026-09-24)
- NY - [NY State Comptroller payroll bulletins (PFL, withholding changes)](https://www.osc.ny.gov/state-agencies/payroll-bulletins) (last changed: 2026-09-24)
- NY - [NY Workers' Compensation Board: Paid Family Leave 2026 announcement](https://www.wcb.ny.gov/content/main/PressRe/paid-family-leave-2026.jsp) (last changed: 2026-09-24)
- NY - [New York NYS-50-T-NYS](https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf) (last changed: 2026-09-24)
- NY - [New York State Department of Labor -- Home Care Aide Minimum Wage Fact Sheet (P105)](https://dol.ny.gov/home-care-aide-minimum-wage-fact-sheet-p105) (last changed: 2026-09-24)
- NY - [New York State Department of Labor -- Minimum Wage (rates effective 01/01/2026)](https://dol.ny.gov/minimum-wage-0) (last changed: 2026-09-24)
- NY - [New York withholding tax](https://www.tax.ny.gov/bus/wt/wtidx.htm) (last changed: 2026-09-24)
- NY - [U.S. DOL -- COBRA Continuation Coverage](https://www.dol.gov/general/topic/health-plans/cobra) (last changed: 2026-09-24)
- NY - [U.S. DOL Wage and Hour Opinion Letter (1986-05-07) on county-appointed poll workers](https://www.dol.gov/agencies/whd/compliance-assistance/handy-reference-guide-flsa) (last changed: 2026-09-24)
- NY - [data/minimum-wage/federal-2026.json (this engine's own federal minimum wage file)](https://www.dol.gov/agencies/whd/flsa) (last changed: 2026-09-24)
- NY - [eCFR 29 CFR 553.106 amendment history - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?section=553.106) (last changed: 2026-09-24)
- OH - [https://www.ccaohio.gov/member-municipalities](https://www.ccaohio.gov/member-municipalities) (last changed: 2026-09-24)
- OH - [Combined Form IT 4 — Employee's Withholding Exemption Certificate (post-2020-12-07 combined version)](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth-it4-combined-fi.pdf) (last changed: 2026-09-24)
- OH - [Employer Withholding Taxes - Percentage Method (Effective August 1, 2026)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2026%20Withholding%20Tables/WHT_PercentageMethod_2026.pdf) (last changed: 2026-09-24)
- OH - [Employer Withholding Taxes - Percentage Method (Effective October 1, 2025)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_PercentageMethod_2025.pdf) (last changed: 2026-09-24)
- OH - [Ohio Department of Commerce -- Ohio Minimum Wage Set to Increase in 2026](https://com.ohio.gov/about-us/media-center/news/ohio%20minimum%20wage%20set%20to%20increase%20in%202026) (last changed: 2026-09-24)
- OH - [Ohio Dept of Taxation - School District Income Tax rate list, Tax Year 2026](https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf) (last changed: 2026-09-24)
- OH - [Ohio Form IT 4NR — Employee's Statement of Residency in a Reciprocity State (Rev. 5/07), Ohio Depart](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth_it4nr.pdf) (last changed: 2026-09-24)
- OH - [Ohio JEDD/JEDZ Income Tax Rate Database Table (The Finder, bulk CSV download)](https://thefinder.tax.ohio.gov/api/file-downloads/content?target=https%3A%2F%2Fapi.thefinder.tax.ohio.gov%2Ffinder%2Fapi%2Fv1%2Ftax-rates%2Fdownloads%2FJEDTaxRates.csv) (last changed: 2026-09-24)
- OH - [Ohio Revised Code Section 5747.06(A) -- Withholding exemptions, paragraphs (1) through (6)](https://codes.ohio.gov/ohio-revised-code/section-5747.06) (last changed: 2026-09-24)
- OH - [Ohio Revised Code Section 718.011 — Withholding requirements for casual entrant employers](https://codes.ohio.gov/ohio-revised-code/section-718.011) (last changed: 2026-09-24)
- OH - [Ohio Revised Code Section 718.121 — Second municipality imposing tax after time period allowed for r](https://codes.ohio.gov/ohio-revised-code/section-718.121) (last changed: 2026-09-24)
- OH - [Ohio Unemployment Contribution Rates for Calendar Year 2023-2026](https://jfs.ohio.gov/unemployment-services/for-employers/file-unemployment-taxes/tax-resources/contribution-rates) (last changed: 2026-09-24)
- OH - [Ohio employer withholding](https://tax.ohio.gov/business/employer-withholding) (last changed: 2026-09-24)
- OK - [Form OK-W-4 (Rev. 3-2021) -- Employee's State Withholding Allowance Certificate](https://oklahoma.gov/content/dam/ok/en/tax/documents/forms/businesses/general/OK-W-4.pdf) (last changed: 2026-09-24)
- OK - [Oklahoma Employment Security Commission -- Important Numbers for Employers 2026](https://oklahoma.gov/content/dam/ok/en/oesc/images/misc/Employer-Improtant-Numbers-2026.pdf) (last changed: 2026-09-24)
- OK - [Oklahoma withholding OW-2](https://oklahoma.gov/tax/businesses/withholding.html) (last changed: 2026-09-24)
- OK - [Packet OW-2 (Revised 11-2025) -- 2026 Oklahoma Income Tax Withholding Tables](https://www.oklahoma.gov/content/dam/ok/en/tax/documents/resources/publications/businesses/withholding-tables/WHTables-2026.pdf) (last changed: 2026-09-24)
- OR - [150-206-436 (Rev. 12-31-25) Oregon Withholding Tax Formulas, effective 2026-01-01](https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf) (last changed: 2026-09-24)
- OR - [150-211-503 (Rev. 11-18-25) A Guide to TriMet and Lane Transit Payroll Taxes](https://www.oregon.gov/dor/forms/formspubs/transit-payroll-taxes_211-503.pdf) (last changed: 2026-09-24)
- OR - [2026 Oregon Combined Payroll Tax Report Instructions](https://www.oregon.gov/dor/forms/FormsPubs/combined-payroll_211-155-2_2026.pdf) (last changed: 2026-09-24)
- OR - [Canby Area Transit Taxes: A guide for businesses](https://www.canbyoregon.gov/sites/default/files/fileattachments/transit_tax/page/2041/transit_tax_guide_for_businesses.pdf) (last changed: 2026-09-24)
- OR - [Current Tax and Contribution Rates (Oregon Employment Department)](https://www.oregon.gov/employ/businesses/pages/current-tax-rate.aspx) (last changed: 2026-09-24)
- OR - [Metro Supportive Housing Services (SHS) Personal Income Tax and Multnomah County Preschool for All (](https://www.portland.gov/revenue/withholding) (last changed: 2026-09-24)
- OR - [Oregon Department of Revenue: Statewide Transit Tax (webpage)](https://www.oregon.gov/dor/programs/businesses/pages/statewide-transit-tax.aspx) (last changed: 2026-09-24)
- OR - [Oregon Workers' Benefit Fund rule changes](https://wcd.oregon.gov/laws/Pages/new-rules.aspx) (last changed: 2026-09-24)
- OR - [Oregon local minimum-wage/regional rate history (July 2025 - June 2026 figures)](https://www.oregon.gov/boli/workers/pages/minimum-wage.aspx) (last changed: 2026-09-24)
- OR - [Oregon payroll tax](https://www.oregon.gov/dor/programs/businesses/pages/payroll-updates.aspx) (last changed: 2026-09-24)
- OR - [Oregon withholding and payroll tax](https://www.oregon.gov/dor/programs/businesses/pages/withholding-and-payroll-tax.aspx) (last changed: 2026-09-24)
- OR - [Paid Leave Oregon — Contributions Calculator / rate page](https://paidleave.oregon.gov/employers/contributions-calculator.html) (last changed: 2026-09-24)
- OR - [Sandy Area Metro (SAM) Payroll and Self-Employment Tax Instructions](https://www.ci.sandy.or.us/sites/default/files/fileattachments/economic_development/page/4671/transit_tax_instructions.pdf) (last changed: 2026-09-24)
- PA - [Maryland Form MW507 (COM/RAD-036, 07/25 revision) -- 2026 Employee's Maryland Withholding Exemption ](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/forms/2026/mw507.pdf) (last changed: 2026-09-24)
- PA - [NJ Division of Taxation -- Reciprocal Personal Income Tax Agreement (PA/NJ)](https://www.nj.gov/treasury/taxation/njit25.shtml) (last changed: 2026-09-24)
- PA - [PA DCED -- Local Services Tax (LST)](https://dced.pa.gov/local-government/local-income-tax-information/local-services-tax/) (last changed: 2026-09-24)
- PA - [PA DCED Municipal Statistics -- EIT/PIT/LST Tax Register with Collector (statewide, official)](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2026) (last changed: 2026-09-24)
- PA - [PA Department of Labor & Industry -- Employee Withholding (UC)](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/employee-withholding) (last changed: 2026-09-24)
- PA - [PA Department of Labor & Industry -- UC Computation of Rates](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/computation-of-rates) (last changed: 2026-09-24)
- PA - [PA Department of Labor & Industry -- Yearly Tax Highlights (UC)](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/yearly-tax-highlights) (last changed: 2026-09-24)
- PA - [PA Department of Revenue -- Employer Withholding](https://www.pa.gov/en/agencies/revenue/resources/tax-types-and-information/employer-withholding.html) (last changed: 2026-09-24)
- PA - [Pennsylvania employer withholding](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/employer-withholding) (last changed: 2026-09-24)
- PA - [REV-415 (SU) 01-23 -- Employer Withholding Information Guide](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/employerwithholding/documents/rev-415.pdf) (last changed: 2026-09-24)
- PA - [REV-419 (EX) 09-20, instructions REV-419 IN (EX) 03-24 -- Employee's Nonwithholding Application Cert](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/employerwithholding/documents/rev-419.pdf) (last changed: 2026-09-24)
- PA - [UC-748 (REV 09-25) -- Contribution Rates Effective January 1, 2026](https://www.pa.gov/content/dam/copapwp-pagov/en/dli/documents/uc/employer/uc-tax-rates/uc-748%20rev%2009-25.pdf) (last changed: 2026-09-24)
- RI - [2026 Rhode Island Employer's Income Tax Withholding Tables (RI Division of Taxation)](https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-12/2026%20Withholding%20Tax%20Booklet.pdf) (last changed: 2026-09-24)
- RI - [RI Department of Labor & Training: 2026 TDI/TCI and UI Tax Rates](https://dlt.ri.gov/press-releases/2026-tax-rates-unemployment-insurance-and-temporary-disability-insurance) (last changed: 2026-09-24)
- RI - [Reciprocity check (Rhode Island has NONE with Massachusetts or Connecticut, its only bordering state](https://www.mass.gov/info-details/learn-about-the-income-tax-paid-to-another-jurisdiction-credit) (last changed: 2026-09-24)
- RI - [Rhode Island withholding](https://tax.ri.gov/tax-sections/withholding-tax) (last changed: 2026-09-24)
- SC - [SC Department of Employment and Workforce -- 2026 Tax Rate Cuts Press Release](https://dew.sc.gov/news/2025-11/2026-tax-rate-cuts-press-release) (last changed: 2026-09-24)
- SC - [SC W-4 (Rev. 12/5/25) -- South Carolina Employee's Withholding Allowance Certificate, 2026](https://dor.sc.gov/sites/dor/files/forms/SCW4_2026.pdf) (last changed: 2026-09-24)
- SC - [South Carolina withholding](https://dor.sc.gov/withholding) (last changed: 2026-09-24)
- SC - [WH-105 (Rev. 2/13/23) -- South Carolina Withholding Tax Information Guide](https://dor.sc.gov/sites/dor/files/forms/WH105.pdf) (last changed: 2026-09-24)
- SC - [WH-1603F (Rev. 11/4/25) -- Formula for Computing South Carolina 2026 Withholding Tax](https://dor.sc.gov/sites/dor/files/forms/WH1603F_2026.pdf) (last changed: 2026-09-24)
- SD - [South Dakota DLR -- Reemployment Assistance for Businesses (rate notices)](https://dlr.sd.gov/ra/businesses/default.aspx) (last changed: 2026-09-24)
- SD - [South Dakota Department of Labor and Regulation -- Minimum Wage FAQ](https://dlr.sd.gov/employment_laws/minimum_wage_faq.aspx) (last changed: 2026-09-24)
- SD - [South Dakota Department of Labor and Regulation -- Reemployment Assistance Tax FAQ](https://dlr.sd.gov/ra/businesses/faq.aspx) (last changed: 2026-09-24)
- TX - [Tex. Const. Art. VIII, sec. 24 -- prohibition on a state income tax](https://statutes.capitol.texas.gov/Docs/CN/htm/CN.8.htm) (last changed: 2026-09-24)
- TX - [Texas Workforce Commission: your tax rates](https://www.twc.texas.gov/programs/unemployment-tax/your-tax-rates) (last changed: 2026-09-24)
- US - [https://apps.dced.pa.gov/munstats-public/FindLocalTax.aspx](https://apps.dced.pa.gov/munstats-public/FindLocalTax.aspx) (last changed: 2026-09-24)
- US - [https://thefinder.tax.ohio.gov/?tab=fileDownloads](https://thefinder.tax.ohio.gov/?tab=fileDownloads) (last changed: 2026-09-24)
- US - [14 M.R.S. § 3126 — ordinary garnishment limited to the lesser of 25% of disposable earnings or the a](https://legislature.maine.gov/statutes/14/title14sec3126-A.html) (last changed: 2026-09-24)
- US - [42 Pa. Cons. Stat. § 8127 — wages/salaries/commissions exempt from attachment, execution or other pr](https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/42/00.081.027.000..HTM) (last changed: 2026-09-24)
- US - [A.R.S. § 33-1131(B) — maximum part of disposable earnings subject to garnishment: the lesser of 10% ](https://www.azleg.gov/ars/33/01131.htm) (last changed: 2026-09-24)
- US - [AS 09.38.030(a) and 8 AAC 95.030 — regular earnings exemption: the greater of $473/week or 75% of we](https://public.courts.alaska.gov/web/forms/docs/civ-511.pdf) (last changed: 2026-09-24)
- US - [Cal. Civ. Proc. Code § 706.050 — ordinary garnishment limited to the lesser of 20% of disposable ear](https://selfhelp.courts.ca.gov/guide-earnings-withholding-orders-employers) (last changed: 2026-09-24)
- US - [California Department of Industrial Relations — state minimum wage $16.90/hr effective 2026-01-01](https://www.dir.ca.gov/dlse/minimum_wage.htm) (last changed: 2026-09-24)
- US - [D.C. Code § 16-572 (as amended by the Wage Garnishment Fairness Amendment Act of 2018) — ordinary ga](https://code.dccouncil.gov/us/dc/council/laws/22-296) (last changed: 2026-09-24)
- US - [DC Department of Employment Services — DC minimum wage $18.40/hr effective 2026-07-01 (up from a low](https://does.dc.gov/sites/default/files/dc/sites/does/publication/attachments/2026%20Minimum%20Wage%20Poster.pdf) (last changed: 2026-09-24)
- US - [DOL FUTA credit reduction states](https://oui.doleta.gov/unemploy/futa_credit.asp) (last changed: 2026-09-24)
- US - [DOL Fact Sheet #30: Wage Garnishment Protections of the Consumer Credit Protection Act (CCPA)](https://www.dol.gov/agencies/whd/fact-sheets/30-cppa) (last changed: 2026-09-24)
- US - [DOL consolidated state minimum wage table](https://www.dol.gov/agencies/whd/mw-consolidated) (last changed: 2026-09-24)
- US - [DOL elaws: FLSA/CCPA Wage Garnishment — Basic Provisions/Requirements](https://webapps.dol.gov/elaws/elg/garnish.htm) (last changed: 2026-09-24)
- US - [DOL state minimum wage laws](https://www.dol.gov/agencies/whd/minimum-wage/state) (last changed: 2026-09-24)
- US - [Executive Order 14236, Additional Rescissions of Harmful Executive Orders and Actions (2025-03-14), ](https://www.dol.gov/agencies/whd/government-contracts/eo14026) (last changed: 2026-09-24)
- US - [Federal Register: Railroad Retirement Board notices (RUIA/RRTA rates) - official API](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=railroad-retirement-board) (last changed: 2026-09-24)
- US - [Federal Register: SSA yearly wage base notice (Cost-of-Living Increase and Other Determinations) - o](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=social-security-administration&conditions%5Bterm%5D=%22cost-of-living+increase+and+other+determinations%22) (last changed: 2026-09-24)
- US - [Federal Register: new IRS withholding rules and proposed rules - official API](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=internal-revenue-service&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&conditions%5Bterm%5D=withholding) (last changed: 2026-09-24)
- US - [Federal Register: new Wage and Hour Division documents (minimum wage, overtime, garnishment) - offic](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=wage-and-hour-division) (last changed: 2026-09-24)
- US - [Fla. Stat. § 222.11 — ALL disposable earnings of a 'head of family' (providing more than half the su](https://www.flsenate.gov/Laws/Statutes/2010/222.11) (last changed: 2026-09-24)
- US - [Haw. Rev. Stat. § 652-1 — MARGINAL brackets on monthly disposable earnings: 5% of the first $100/mon](https://www.capitol.hawaii.gov/hrscurrent/Vol13_Ch0601-0676/HRS0652/HRS_0652-0001.htm) (last changed: 2026-09-24)
- US - [IRS Form W-4](https://www.irs.gov/pub/irs-pdf/fw4.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15 (2026) and SSA, Election Workers — State and Local Government Employers](https://www.ssa.gov/slge/election_workers.htm) (last changed: 2026-09-24)
- US - [IRS Publication 15 (Circular E, Employer's Tax Guide)](https://www.irs.gov/pub/irs-pdf/p15.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15-A (supplemental guide)](https://www.irs.gov/pub/irs-pdf/p15a.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15-B (fringe benefits)](https://www.irs.gov/pub/irs-pdf/p15b.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15-T (Federal Income Tax Withholding Methods)](https://www.irs.gov/pub/irs-pdf/p15t.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15-T (web page)](https://www.irs.gov/publications/p15t) (last changed: 2026-09-24)
- US - [IRS Publication 926 (2026), Household Employer's Tax Guide](https://www.irs.gov/pub/irs-pdf/p926.pdf) (last changed: 2026-09-24)
- US - [IRS retirement plan contribution limits (401(k)/403(b)/457)](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits) (last changed: 2026-09-24)
- US - [IRS — Members of the clergy / Publication 15-A, Special Rules for Ministers](https://www.irs.gov/businesses/small-businesses-self-employed/members-of-the-clergy) (last changed: 2026-09-24)
- US - [Idaho Code § 11-207 — restriction on garnishment, maximum: lesser of 25% of disposable earnings, or ](https://legislature.idaho.gov/statutesrules/idstat/title11/t11ch2/sect11-207/) (last changed: 2026-09-24)
- US - [Illinois Department of Labor — Minimum Wage Law (current state minimum hourly wage)](https://labor.illinois.gov/laws-rules/fls/minimum-wage-law.html) (last changed: 2026-09-24)
- US - [Iowa Code § 642.21 — disposable earnings exempt to the extent provided by the federal CCPA, PLUS an ](https://www.legis.iowa.gov/docs/code/642.21.pdf) (last changed: 2026-09-24)
- US - [K.S.A. § 60-2310 — wage garnishment: maximum part of earnings subject to garnishment is the lesser o](https://www.ksrevisor.gov/statutes/chapters/ch60/060_023_0010.html) (last changed: 2026-09-24)
- US - [KRS 425.506 — a judgment creditor may reach only the lesser of 25% of disposable earnings, or the am](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=18419) (last changed: 2026-09-24)
- US - [Maine Department of Labor — 2026 minimum wage ($15.10/hr, effective 2026-01-01, cost-of-living index](https://www.maine.gov/labor/news_events/article.shtml?id=13338762) (last changed: 2026-09-24)
- US - [Minn. Stat. § 571.922 — non-support garnishment: fully exempt at or below 40x the applicable minimum](https://www.revisor.mn.gov/statutes/cite/571.922) (last changed: 2026-09-25)
- US - [Minnesota Department of Labor and Industry — 2026 statewide minimum wage ($11.41/hr, single rate for](https://dli.mn.gov/news/minimum-wage-rate-adjusted-inflation-jan-1-2026) (last changed: 2026-09-24)
- US - [N.C. Gen. Stat. § 1-362 — wages/personal earnings exempt from attachment/garnishment for ordinary ju](https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_1/GS_1-362.html) (last changed: 2026-09-24)
- US - [P.L. 119-21 on govinfo.gov (official text)](https://www.govinfo.gov/app/details/PLAW-119publ21) (last changed: 2026-09-24)
- US - [R.C. 2716.02 — maximum garnishment is the lesser of 25% of disposable earnings, or the amount by whi](https://codes.ohio.gov/ohio-revised-code/section-2716.02) (last changed: 2026-09-24)
- US - [RSA 512:21 — New Hampshire's trustee process: wages earned by the defendant AFTER service of the wri](https://gc.nh.gov/rsa/html/LII/512/512-21.htm) (last changed: 2026-09-24)
- US - [S.C. Code Ann. § 15-39-410 — earnings of the debtor for personal services excluded from property rea](https://www.scstatehouse.gov/code/t15c039.php) (last changed: 2026-09-24)
- US - [South Dakota Department of Labor and Regulation — 2026 minimum wage poster, $11.85/hr](https://dlr.sd.gov/employment_laws/publications/min-wage-poster-2026-english.pdf) (last changed: 2026-09-24)
- US - [Tex. Prop. Code Ann. § 42.001(b)(1) — current wages for personal services exempt from garnishment, a](https://statutes.capitol.texas.gov/Docs/PR/htm/PR.42.htm) (last changed: 2026-09-24)
- US - [U.S. DOL Wage and Hour Division -- Fact Sheet 17A: Exemption for Executive, Administrative, Professi](https://www.dol.gov/agencies/whd/fact-sheets/17a-overtime) (last changed: 2026-09-24)
- US - [U.S. DOL Wage and Hour Division -- Minimum Wages for Tipped Employees (table current as of July 1, 2](https://www.dol.gov/agencies/whd/state/minimum-wage/tipped) (last changed: 2026-09-24)
- US - [Va. Code Ann. § 34-29 — ordinary garnishment limited to the lesser of 25% of disposable earnings, or](https://law.lis.virginia.gov/vacode/title34/chapter4/section34-29/) (last changed: 2026-09-24)
- US - [Virginia Department of Labor and Industry — 2026 minimum wage $12.77/hr effective 2026-01-01](https://doli.virginia.gov/2025/07/29/virginia-minimum-wage-rate-increasing-effective-january-1-2026/) (last changed: 2026-09-24)
- US - [W. Va. Code § 38-5A-3 — ordinary (consumer credit sale/consumer loan judgment) garnishment limited t](https://code.wvlegislature.gov/38-5A-3/) (last changed: 2026-09-24)
- US - [Washington State Department of Labor & Industries — 2026 minimum wage ($17.13/hr effective 2026-01-0](https://ofm.wa.gov/wp-content/uploads/sites/default/files/public/legacy/policy/25.60.pdf) (last changed: 2026-09-24)
- US - [eCFR 29 CFR 870 amendment history (garnishment limits) - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?part=870) (last changed: 2026-09-24)
- US - [eCFR 34 CFR 34 amendment history (administrative wage garnishment) - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-34.json?part=34) (last changed: 2026-09-24)
- UT - [Utah Pub 14 page](https://tax.utah.gov/forms-pubs/pub-14/) (last changed: 2026-09-24)
- UT - [Utah Publication 14 (withholding)](https://files.tax.utah.gov/tax/forms/pubs/pub-14.pdf) (last changed: 2026-09-24)
- UT - [Utah State Tax Commission UI wage base / tax rate page](https://jobs.utah.gov/ui/employer/Public/Questions/TaxRates.aspx) (last changed: 2026-09-24)
- VA - [Form VA-4, Employee's Virginia Income Tax Withholding Exemption Certificate (Rev. 04/26) + Personal ](https://www.tax.virginia.gov/sites/default/files/taxforms/withholding/any/va-4-any.pdf) (last changed: 2026-09-24)
- VA - [Income Tax Withholding Guide for Employers (Rev. 05/25, 'Effective for wages paid after July 1, 2025](https://www.tax.virginia.gov/sites/default/files/vatax-pdf/employer-withholding-instructions.pdf) (last changed: 2026-09-24)
- VA - [Virginia Paid Family and Medical Leave Insurance Program -- Governor's own press release](https://www.governor.virginia.gov/newsroom/news-releases/2026/may-releases/name-1117602-en.html) (last changed: 2026-09-24)
- VA - [Virginia unemployment insurance -- VEC's own wage-base FAQ](https://www.vec.virginia.gov/FAQs/employers/what-wage-base-each-employee-i-will-pay-taxes) (last changed: 2026-09-24)
- VA - [Virginia withholding](https://www.tax.virginia.gov/withholding-tax) (last changed: 2026-09-24)
- VT - [Form W-4VT, Employee's Withholding Allowance Certificate (Rev. 12/18)](https://tax.vermont.gov/sites/tax/files/documents/W-4VT.pdf) (last changed: 2026-09-24)
- VT - [GB-1210-2026, 2026 Income Tax Withholding Instructions, Tables, and Charts](https://tax.vermont.gov/sites/tax/files/documents/GB-1210-2026.pdf) (last changed: 2026-09-24)
- VT - [Governor Phil Scott Launches Voluntary Paid Family and Medical Leave Program — Office of Governor Ph](https://governor.vermont.gov/vtfmli) (last changed: 2026-09-24)
- VT - [Vermont withholding](https://tax.vermont.gov/business/withholding) (last changed: 2026-09-24)
- WA - [City of Seattle Office of Labor Standards -- Minimum Wage Ordinance](https://www.seattle.gov/laborstandards/ordinances/minimum-wage) (last changed: 2026-09-24)
- WA - [City of Seattle, City Finance — Payroll expense tax](https://www.seattle.gov/city-finance/business-taxes-and-licenses/seattle-taxes/payroll-expense-tax) (last changed: 2026-09-24)
- WA - [ESD — Paid Family and Medical Leave premium rate increases to 1.13% in 2026](https://esd.wa.gov/about-us/news-release/2025/paid-family-medical-leave-premium-rate-increases-113-2026) (last changed: 2026-09-24)
- WA - [Employer Wage Reporting and Premiums Toolkit (v25.1, June 2026)](https://paidleave.wa.gov/app/uploads/2021/12/Employer-Wage-Reporting-and-Premiums-Toolkit-v25.1-2026.06.26.pdf) (last changed: 2026-09-24)
- WA - [L&I — Paid Family & Medical Leave (exempt employer/employee categories)](https://www.lni.wa.gov/workers-rights/leave/paid-family-and-medical-leave) (last changed: 2026-09-24)
- WA - [RCW 1.90.100 — Personal Income Tax Prohibition](https://app.leg.wa.gov/RCW/default.aspx?cite=1.90.100) (last changed: 2026-09-24)
- WA - [RCW 36.65.030 — Tax on net income prohibited](https://app.leg.wa.gov/RCW/default.aspx?cite=36.65.030) (last changed: 2026-09-24)
- WA - [WA Cares Fund — Exemptions](https://wacaresfund.wa.gov/exemptions) (last changed: 2026-09-24)
- WA - [Washington Cares Fund premiums](https://wacaresfund.wa.gov/employers/) (last changed: 2026-09-24)
- WA - [Washington Paid Leave premium rates](https://paidleave.wa.gov/employers/) (last changed: 2026-09-24)
- WA - [Washington State Department of Labor & Industries -- Local Minimum Wage Rates](https://lni.wa.gov/workers-rights/wages/minimum-wage/local-minimum-wage-rates) (last changed: 2026-09-24)
- WA - [Washington State Department of Labor & Industries -- Washington's minimum wage going up to $17.13 an](https://www.lni.wa.gov/news-events/article/25-27) (last changed: 2026-09-24)
- WA - [Washington State's Paid Family and Medical Leave — Estimate your Paid Leave payments](https://paidleave.wa.gov/estimate-your-paid-leave-payments/) (last changed: 2026-09-24)
- WI - [2026 Tax Rate Schedule for Employers (DWD, full Schedule D reserve-percentage rate table)](https://dwd.wisconsin.gov/ui/employers/taxrates.htm) (last changed: 2026-09-24)
- WI - [UCT-1-E, 2026 Wisconsin Employer's Quarterly Contribution Report (SUTA initial rates)](https://dwd.wisconsin.gov/dwd/forms/ui/pdf/uct-1-e-2026.pdf) (last changed: 2026-09-24)
- WV - [WV IT-100.2A -- Tables for Percentage Method of Withholding (March 2026 revision)](https://tax.wv.gov/Documents/Withholding/it100.2a.pdf) (last changed: 2026-09-24)
- WV - [WV State Tax Division -- Withholding Help and General Information page, "Supplemental Wages" guidanc](https://tax.wv.gov/Business/Withholding/HelpAndGeneralInformation/Pages/WithholdingHelpAndGeneralInformation.aspx) (last changed: 2026-09-24)
- WV - [WV/IT-104 -- Employee's Withholding Exemption Certificate (Rev. 03/2023) + WV/IT-104NR Certificate o](https://tax.wv.gov/Documents/Withholding/it104.pdf) (last changed: 2026-09-24)
- WV - [West Virginia Division of Labor -- Minimum Wage](https://labor.wv.gov/wage-hour/jobs-act/minimum-wage) (last changed: 2026-09-24)
- WV - [West Virginia withholding](https://tax.wv.gov/Business/Withholding/Publications/Pages/WithholdingPublications.aspx) (last changed: 2026-09-24)
- WV - [West Virginia withholding forms](https://tax.wv.gov/business/withholding/pages/withholdingtaxforms.aspx) (last changed: 2026-09-24)
- WY - [Wyoming Constitution -- no personal income tax; Wyoming Dept of Workforce Services -- Unemployment T](https://dws.wyo.gov/dws-division/unemployment-insurance/wyui/unemployment-taxable-wage-base/) (last changed: 2026-09-24)
- WY - [Wyoming Dept of Workforce Services -- Unemployment Tax Rates](https://dws.wyo.gov/dws-division/unemployment-insurance/wyui/unemployment-tax-rates/) (last changed: 2026-09-24)

</details>

