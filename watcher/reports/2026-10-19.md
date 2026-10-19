# Source watch - 2026-10-19

**1 source changed**

| Changed | Minor | Unchanged | New | Unstable | Unreachable | Gone (404) | Blocks bots | Total |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 0 | 379 | 14 | 0 | 0 | 2 | 4 | 400 |

_Run took 2609 s. A change is only reported after a second fetch confirms it._

**Coverage: 394 of 400 sources were read this run; 6 could not be checked**, and 3 of those have never been read successfully, so nothing about them is being watched.
182 of those are documents linked from index pages. 8 other linked documents could not be read (a dead link, or a file the site won't serve) and are not counted above.

## Data checks against official files: for information (9)

No change needed, but worth knowing: a variance the data file already explains, a row added by hand that the official file hasn't caught up to, or a municode that can now be filled in.

<details><summary>Show</summary>

| Jurisdiction | Name | Code | Detail |
|---|---|---|---|
| OH | Indian Hill | 76582 | official 0.450% vs engine 0.500% (acknowledged in the data file's own note) |
| OH | Washington | 81214 | official 1.950% vs engine 1.750% (acknowledged in the data file's own note) |
| OH | Germantown | 29932 | added by hand; the official rate file has no row for it yet (the Finder's directory lists it as code 29932) |
| OH | Germantown | 29932 | the Finder's directory lists it as code 29932; the engine entry has no municode |
| OH | North Hampton | 56588 | added by hand; the official rate file has no row for it yet (the Finder's directory lists it as code 56588) |
| OH | North Hampton | 56588 | the Finder's directory lists it as code 56588; the engine entry has no municode |
| OH | Stockport | 74748 | added by hand; the official rate file has no row for it yet (the Finder's directory lists it as code 74748) |
| OH | Stockport | 74748 | the Finder's directory lists it as code 74748; the engine entry has no municode |
| OH | Woodville | 86492 | added by hand; the official rate file has no row for it yet (the Finder's directory lists it as code 86492) |

</details>

## Changed

### IN - WH-4, State Form 48845

<https://www.in.gov/dor/tax-forms/withholding-tax-forms/>  
8 lines added, 8 removed; 1 links added, 1 removed
  
Used by: `data/states/IN-2025.json`, `data/states/IN-2026.json`, `data/states/IN-2027.json`

- New link: [Departmental Notice #1](https://www.in.gov/dA/92797e5a5f/dn01.pdf?language_id=1)
- Removed link: [Departmental Notice #1](https://www.in.gov/dor/files/dn01.pdf)

<details><summary>What changed</summary>

```diff
-Current: Withholding Tax Forms
+Withholding Tax Forms
-Claim a gambling loss on my Indiana return.
-Have more time to file my taxes and I think I will owe the Department.
-State Information Live Chat
+State Information Center Live Chat
-State Employee Resources
+State Employee
+Resources
-IN.gov News & Events
+IN.gov News &
+Events
-Report Accessibility Issues
-Screen Reader - Speak
+Report
+Accessibility Issues
```
</details>

## Never read successfully - no baseline, so changes here go unnoticed (3)

Each of these has failed on every run so far. Replace the URL, or check the document by hand.

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Tuskegee -- Occupational Tax Reporting form](https://www.tuskegeealabama.gov/finance-department/files/occupational-tax-form) | HTTP 404 |
| AR | [Arkansas Department of Labor and Licensing -- Minimum Wage and Overtime](https://labor.arkansas.gov/labor/labor-standards/minimum-wage-and-overtime/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Pikeville -- Business Licenses](https://pikevilleky.gov/business/) | HTTP 403: the site refuses automated requests; a real browser was refused too |

## Broken - failing for 3+ runs (2)

These URLs need replacing in `watcher/sources.json` (or the site blocks automated fetches).

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Tuskegee -- Occupational Tax Reporting form](https://www.tuskegeealabama.gov/finance-department/files/occupational-tax-form) | HTTP 404 |
| AL | [City of Tuskegee -- business information brochure](https://www.tuskegeealabama.gov/sites/g/files/vyhlif3946/f/uploads/infobrochure_word.pdf) | HTTP 404 |

## New (first snapshot taken) (14)

| Jurisdiction | Source | Detail |
|---|---|---|
| IN | [Indiana deductions and credits (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/ca4e8ec452/nn-IN-deductions-credits.pdf?language_id=1) | first snapshot (585 words, pdf) |
| SC | [2025 SC Withholding Tables​ (linked from South Carolina withholding)](https://dor.sc.gov/sites/dor/files/forms/WH1603_2025.pdf) | first snapshot (4219 words, pdf) |
| SC | [2026 SC Withholding Tables​ (linked from South Carolina withholding)](https://dor.sc.gov/sites/dor/files/forms/WH1603_2026.pdf) | first snapshot (4709 words, pdf) |
| SC | [20​25 SC W-4​ (linked from South Carolina withholding)](https://dor.sc.gov/sites/dor/files/forms/SCW4_2025.pdf) | first snapshot (2971 words, pdf) |
| SC | [S.C. Code Ann. § 15-39-410 — earnings of the debtor for personal services excluded from pr](https://www.scstatehouse.gov/code/t15c039.php) | first snapshot (9301 words, html) |
| SC | [SC Department of Employment and Workforce -- 2026 Tax Rate Cuts Press Release](https://dew.sc.gov/news/2025-11/2026-tax-rate-cuts-press-release) | first snapshot (490 words, html) |
| SC | [SC Information Letter #26-20 (Aug. 31, 2026) -- Individual Income Tax Reform (Act 110 of 2](https://dor.sc.gov/sites/dor/files/policies/IL26-20.pdf) | first snapshot (1176 words, pdf) |
| SC | [SC W-4 (Rev. 12/5/25) -- South Carolina Employee's Withholding Allowance Certificate, 2026](https://dor.sc.gov/sites/dor/files/forms/SCW4_2026.pdf) | first snapshot (2966 words, pdf) |
| SC | [South Carolina DOR -- WH-1603F Formula for Computing South Carolina 2025 Withholding Tax (](https://dor.sc.gov/sites/dor/files/forms/WH1603F_2025.pdf) | first snapshot (348 words, pdf) |
| SC | [South Carolina withholding](https://dor.sc.gov/withholding) | first snapshot (887 words, html) |
| SC | [WH-105 (Rev. 2/13/23) -- South Carolina Withholding Tax Information Guide](https://dor.sc.gov/sites/dor/files/forms/WH105.pdf) | first snapshot (1227 words, pdf) |
| SC | [WH-1603F (Rev. 11/4/25) -- Formula for Computing South Carolina 2026 Withholding Tax](https://dor.sc.gov/sites/dor/files/forms/WH1603F_2026.pdf) | first snapshot (348 words, pdf) |
| SC | [WH-1605 (linked from South Carolina withholding)](https://dor.sc.gov/sites/dor/files/forms/WH1605.pdf) | first snapshot (936 words, pdf) |
| SC | [WH-1606 (linked from South Carolina withholding)](https://dor.sc.gov/sites/dor/files/forms/WH1606.pdf) | first snapshot (1142 words, pdf) |

## Redirected (20)

These still work but redirect elsewhere; consider updating the URL in data/ or curated.json.

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [Alabama DOR: local tax (rates and codes for cities and counties)](https://www.revenue.alabama.gov/local-tax/) | -> https://www.revenue.alabama.gov/sales-use/local-tax-liaisons/ |
| AL | [City of Opelika -- announcement of the occupational tax cut](https://www.opelika-al.gov/CivicAlerts.aspx?AID=1092) | -> https://www.opelika-al.gov/m/newsflash/home/detail/1092 |
| AR | [Arkansas DFA: news](https://www.dfa.arkansas.gov/news/) | -> https://www.dfa.arkansas.gov/about/news/ |
| GA | [Employer's Withholding Tax Guide 2026 (Revised June 2026, reflecting HB 463 signed 2026-05](https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-june-2026/download) | -> https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-september-2026/download |
| ID | [EPB00744 — Table for Percentage Computation Method of Withholding](https://tax.idaho.gov/document-mngr/pubs_EPB00744) | -> https://tax.idaho.gov/wp-content/uploads/pubs/EPB00744/EPB00744_07-23-2026.pdf |
| ID | [Form ID W-4, Employee's Withholding Allowance Certificate (EFO00307, 04-28-2025 revision)](https://tax.idaho.gov/w4form) | -> https://tax.idaho.gov/wp-content/uploads/forms/EFO00307/EFO00307_04-28-2025.pdf |
| ID | [Idaho Child Tax Credit Allowance Table (ICTCAT) page](https://tax.idaho.gov/ictcat) | -> https://tax.idaho.gov/taxes/income-tax/withholding/computing/#ictcat |
| IN | [Indiana DOR: departmental notices](https://www.in.gov/dor/legal-resources/tax-library/departmental-notices/) | -> https://www.in.gov/dor/resources/tax-library/departmental-notices/ |
| MI | [Revenue Administrative Bulletin 1988-27 — Section 125 cafeteria plan benefits excluded fro](https://michigan.gov/treasury/0,4679,7-121-44402_44415_44416-7351--,00.html) | -> https://www.michigan.gov/en/treasury/reference/rab/content/1988/revenue-administrative-bulletin-1988-27 |
| OH | [Combined Form IT 4 — Employee's Withholding Exemption Certificate (post-2020-12-07 combine](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth-it4-combined-fi.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/employer_withholding/generic/wth-it4-combined-fi.pdf |
| OH | [Declaration of Estimated Payments (linked from Ohio Department of Taxation: municipal inco](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/ascii%20-%20declaration%20of%20estimated%20payments%208-21-18.xlsx) | -> https://dam.assets.ohio.gov/raw/upload/tax.ohio.gov/muni-net-profit/ascii%20and%20xml/ascii%20-%20declaration%20of%20estimated%20payments%208-21-18.xlsx |
| OH | [Excel File Generator Tool (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/oh%20muni%20ascii%20dev%20v017%202_19_2020.xls) | -> https://dam.assets.ohio.gov/raw/upload/tax.ohio.gov/muni-net-profit/ascii%20and%20xml/oh%20muni%20ascii%20dev%20v017%202_19_2020.xls |
| OH | [MNP10 Tax Return (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/ascii%20-%20mnp10%20return%208-21-18.xlsx) | -> https://dam.assets.ohio.gov/raw/upload/tax.ohio.gov/muni-net-profit/ascii%20and%20xml/ascii%20-%20mnp10%20return%208-21-18.xlsx |
| OH | [Ohio Department of Taxation: all news](https://tax.ohio.gov/wps/portal/gov/tax/home/news-and-events/all-news/) | -> https://tax.ohio.gov/home/news-and-events/all-news/ |
| OH | [Ohio Department of Taxation: information releases](https://tax.ohio.gov/wps/portal/gov/tax/help-center/communications/information-releases) | -> https://tax.ohio.gov/help-center/communications/information-releases |
| OH | [Ohio Department of Taxation: municipal income tax (state page for municipalities and emplo](https://tax.ohio.gov/business/municipalities) | -> https://tax.ohio.gov/business/municipal-net-profit-tax |
| OH | [Ohio Dept of Taxation - School District Income Tax rate list, Tax Year 2026](https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf |
| OH | [Ohio Form IT 4NR — Employee's Statement of Residency in a Reciprocity State (Rev. 5/07), O](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth_it4nr.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/employer_withholding/generic/wth_it4nr.pdf |
| PA | [PA Department of Revenue -- Employer Withholding (reciprocal agreements)](https://www.pa.gov/en/agencies/revenue/resources/tax-types-and-information/employer-withholding.html) | -> https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/employer-withholding |
| WV | [West Virginia State Tax Department: home page (news and notices)](https://tax.wv.gov/) | -> https://tax.wv.gov/Pages/default.aspx |

## Sites that block automated checks (4)

These can't be watched by a script (bot protection or JavaScript-only pages). Check them by hand now and then, or find the same document at an address that allows it.

<details><summary>Show all</summary>

| Jurisdiction | Source | Detail |
|---|---|---|
| AR | [Arkansas Department of Labor and Licensing -- Minimum Wage and Overtime](https://labor.arkansas.gov/labor/labor-standards/minimum-wage-and-overtime/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Georgetown, KY — Taxes and license fees (occupational license tax: net profits vs ](https://www.georgetownky.gov/2167/Taxes-License-Fees) | read with a browser last time; a real browser was refused too |
| KY | [City of Pikeville -- Business Licenses](https://pikevilleky.gov/business/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| US | [IRS draft tax forms: payroll forms only (W-4, W-4P/R, Pub 15/15-T, 940/941/944, W-2/W-3)](https://www.irs.gov/draft-tax-forms) | read with a browser last time; a real browser was refused too |

</details>

## Unchanged (379)

<details><summary>Show all</summary>

- AL - [Alabama DOR withholding tax](https://www.revenue.alabama.gov/individual-corporate/withholding-tax-2/) (last changed: 2026-10-15)
- AL - [Alabama DOR: local tax (rates and codes for cities and counties)](https://www.revenue.alabama.gov/local-tax/) (last changed: 2026-10-18)
- AL - [Alabama DOR: news](https://www.revenue.alabama.gov/news) (last changed: 2026-10-18)
- AL - [Alabama Department of Labor -- 2026 UI wage base and rate figures (cross-source)](https://www2.labor.alabama.gov/) (last changed: 2026-10-17)
- AL - [Alabama Department of Revenue -- NOTICE: Overtime Exemption Ends June 30, 2025](https://www.revenue.alabama.gov/notice-overtime-exemption-ends-june-30-2025/) (last changed: 2026-10-16)
- AL - [Alabama State Comptroller -- Memorandum, 'Jefferson County Occupational Tax'](https://comptroller.alabama.gov/wp-content/uploads/2018/01/Jefferson-County-Occupational-Tax.pdf) (last changed: 2026-09-24)
- AL - [City of Auburn -- Occupational License Fee](https://www.auburnal.gov/revenue/tax-information/occupational-license-fee/) (last changed: 2026-09-30)
- AL - [City of Irondale -- Occupational License Fee](https://cityofirondaleal.gov/occupational-license-fee/) (last changed: 2026-09-30)
- AL - [City of Leeds -- Occupational Tax](https://www.leedsalabama.gov/471/Occupational-Tax) (last changed: 2026-09-30)
- AL - [City of Opelika -- announcement of the occupational tax cut](https://www.opelika-al.gov/CivicAlerts.aspx?AID=1092) (last changed: 2026-10-16)
- AL - [City of Tarrant -- occupational license fee ordinance (Municode)](https://mcclibraryfunctions.azurewebsites.us/api/ordinanceDownload/10178/1047327/pdf) (last changed: 2026-09-30)
- AL - [Form 10 (linked from Alabama DOR withholding tax)](https://www.revenue.alabama.gov/wp-content/uploads/2024/10/Form_10_0824.pdf) (last changed: 2026-10-18)
- AL - [Form 2848A (linked from Alabama DOR withholding tax)](https://www.revenue.alabama.gov/wp-content/uploads/2018/09/Form_2848A_rev918.pdf) (last changed: 2026-10-18)
- AL - [Form 4506–W (linked from Alabama DOR withholding tax)](https://www.revenue.alabama.gov/wp-content/uploads/2021/10/4506w.pdf) (last changed: 2026-10-18)
- AL - [Form A4 (Rev. 4/2025) -- Employee's Withholding Tax Exemption Certificate](https://www.revenue.alabama.gov/wp-content/uploads/2025/04/A4_0425.pdf) (last changed: 2026-09-24)
- AL - [Form A4–MS (linked from Alabama DOR withholding tax)](https://www.revenue.alabama.gov/wp-content/uploads/2025/04/A4MS_0425.pdf) (last changed: 2026-10-18)
- AL - [Form A–1 (linked from Alabama DOR withholding tax)](https://www.revenue.alabama.gov/wp-content/uploads/2026/03/A-1.pdf) (last changed: 2026-10-18)
- AL - [Form A–3 (linked from Alabama DOR withholding tax)](https://www.revenue.alabama.gov/wp-content/uploads/2026/03/A-3.pdf) (last changed: 2026-10-18)
- AL - [Form A–6 (linked from Alabama DOR withholding tax)](https://www.revenue.alabama.gov/wp-content/uploads/2026/03/A-6.pdf) (last changed: 2026-10-18)
- AL - [Forma A4 (linked from Alabama DOR withholding tax)](https://www.revenue.alabama.gov/wp-content/uploads/2025/04/A4_0425_sp.pdf) (last changed: 2026-10-18)
- AL - [USDA National Finance Center -- Alabama State Income Tax Withholding (NFC-22-1666037747, still the c](https://help.nfc.usda.gov/bulletins/2022/1666037747.htm?taxmap=true) (last changed: 2026-09-24)
- AL - [Withholding Tax Tables and Instructions for Employers and Withholding Agents (Rev. 01/26)](https://www.revenue.alabama.gov/wp-content/uploads/2026/01/whbooklet_0126.pdf) (last changed: 2026-09-24)
- AL - [tax collection and administrative services for local governments (linked from Alabama DOR: local tax](https://www.revenue.alabama.gov/wp-content/uploads/2026/05/ALDOR_Local_Tax_Services-PowerPoint-05.19.2026.pdf) (last changed: 2026-10-18)
- AR - [AR4EC -- Employee's Withholding Exemption Certificate (R 02/07/2025)](https://www.dfa.arkansas.gov/wp-content/uploads/AR4EC2025_FI.pdf) (last changed: 2026-09-24)
- AR - [Arkansas DFA withholding tax](https://www.dfa.arkansas.gov/office/taxes/income-tax-administration/withholding-tax-branch/) (last changed: 2026-10-02)
- AR - [Arkansas DFA: news](https://www.dfa.arkansas.gov/news/) (last changed: 2026-10-18)
- AR - [Arkansas UI Information Handbook 2026 (wage base, rates)](https://dws.arkansas.gov/wp-content/uploads/UI-Handbook-2026-Final.pdf) (last changed: 2026-09-24)
- AR - [Arkansas withholding formula (current)](https://www.dfa.arkansas.gov/wp-content/uploads/Withholding-Tax-Formula.pdf) (last changed: 2026-09-24)
- AR - [Authorization for Release of Account Registration Numbers (linked from Arkansas DFA withholding tax)](https://www.dfa.arkansas.gov/wp-content/uploads/Authorization_For_Release_of_AccountRegistrationNumbers-1.pdf) (last changed: 2026-10-18)
- AR - [Exemption Statistics (linked from Arkansas DFA withholding tax)](https://www.dfa.arkansas.gov/wp-content/uploads/SalesTaxExemptionsFY2025.pdf) (last changed: 2026-10-18)
- AR - [Sales & Use Tax Law Changes (linked from Arkansas DFA withholding tax)](https://www.dfa.arkansas.gov/wp-content/uploads/Whatsnew2025_1.pdf) (last changed: 2026-10-18)
- AR - [State of Arkansas Withholding Tax -- Low Income Tax Tables, Effective 01/01/2026](https://www.dfa.arkansas.gov/wp-content/uploads/Withholding-Tax-Tables-for-Low-Income.pdf) (last changed: 2026-09-30)
- AR - [State of Arkansas Withholding Tax -- Low Income Tax Tables, Tax Year 2026 (Effective 01/01/2026)](https://www.dfa.arkansas.gov/wp-content/uploads/withholdTaxTablesLowIncome_2026.pdf) (last changed: 2026-09-24)
- AR - [State of Arkansas Withholding Tax -- Regular Income Tax Tables, Effective 01/01/2025](https://www.dfa.arkansas.gov/wp-content/uploads/withholdTaxTablesRegularIncome_1.pdf) (last changed: 2026-09-30)
- AR - [USDA National Finance Center -- Arkansas State Income Tax Withholding (NFC-25-1736280741, 2025 formu](https://help.nfc.usda.gov/bulletins/2025/1736280741.htm) (last changed: 2026-10-01)
- AR - [Withholding Tax Change News Release (linked from Arkansas DFA withholding tax)](https://www.dfa.arkansas.gov/wp-content/uploads/NEWSRELEASE_WithholdingChanges.pdf) (last changed: 2026-10-18)
- GA - [2023 Employers Tax Guide (linked from Georgia Employer's Tax Guide (current))](https://dor.georgia.gov/document/document/2023-employers-tax-guidepdf/download) (last changed: 2026-10-18)
- GA - [2024 Employers Tax Guide (linked from Georgia Employer's Tax Guide (current))](https://dor.georgia.gov/document/document/2024-employers-tax-guide/download) (last changed: 2026-10-18)
- GA - [2026 Employers Tax Guide (updated September 2026) (linked from Georgia Employer's Tax Guide (current](https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-september-2026/download) (last changed: 2026-10-18)
- GA - [Employer's Withholding Tax Guide 2026 (Revised June 2026, reflecting HB 463 signed 2026-05-11)](https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-june-2026/download) (last changed: 2026-09-26)
- GA - [Form G-4 (Rev. 06/03/26) -- State of Georgia Employee's Withholding Allowance Certificate](https://dor.georgia.gov/document/form/tsdemployeeswithholdingallowancecertificateg-4pdf/download) (last changed: 2026-09-24)
- GA - [Georgia DOR -- 2025 Employer's Tax Guide (updated June 2025)](https://dor.georgia.gov/document/document-document/2025-employers-tax-guide-updated-june-2025/download) (last changed: 2026-09-30)
- GA - [Georgia DOR withholding](https://dor.georgia.gov/taxes/withholding-tax-employers) (last changed: 2026-10-13)
- GA - [Georgia DOR: press releases](https://dor.georgia.gov/press-releases) (last changed: 2026-10-18)
- GA - [Georgia Employer's Tax Guide (current)](https://dor.georgia.gov/employers-tax-guide) (last changed: 2026-10-13)
- GA - [Governor Brian Kemp -- press release, HB 463 signed 2026-05-11](https://gov.georgia.gov/press-releases/2026-05-11/gov-kemp-signs-legislation-lowering-taxes-and-supporting-economic-growth) (last changed: 2026-09-24)
- GA - [USDA National Finance Center -- Georgia State Income Tax Withholding bulletin (2026)](https://help.nfc.usda.gov/bulletins/2026/1784643404.htm) (last changed: 2026-09-24)
- ID - [EPB00744 — Table for Percentage Computation Method of Withholding](https://tax.idaho.gov/document-mngr/pubs_EPB00744) (last changed: 2026-09-24)
- ID - [Form ID W-4, Employee's Withholding Allowance Certificate (EFO00307, 04-28-2025 revision)](https://tax.idaho.gov/w4form) (last changed: 2026-09-24)
- ID - [Idaho Child Tax Credit Allowance Table (ICTCAT) page](https://tax.idaho.gov/ictcat) (last changed: 2026-09-24)
- ID - [Idaho Code § 11-207 — restriction on garnishment, maximum: lesser of 25% of disposable earnings, or ](https://legislature.idaho.gov/statutesrules/idstat/title11/t11ch2/sect11-207/) (last changed: 2026-10-18)
- ID - [Idaho Department of Labor — 2026 UI Rate Class Array](https://www.labor.idaho.gov/wp-content/uploads/2024/12/Tax-rate_Class-array_2026.pdf) (last changed: 2026-09-24)
- ID - [Idaho State Tax Commission -- Withholding tables updated for 2025 (press release, 2025-05-01)](https://tax.idaho.gov/pressrelease/withholding-tables-updated-for-2025/) (last changed: 2026-09-30)
- ID - [Idaho State Tax Commission: press releases](https://tax.idaho.gov/pressrelease) (last changed: 2026-10-18)
- ID - [Idaho computing withholding](https://tax.idaho.gov/taxes/income-tax/withholding/computing/) (last changed: 2026-09-24)
- ID - [Withholding tables updated for 2026 — Idaho State Tax Commission press release](https://tax.idaho.gov/pressrelease/withholding-tables-updated-for-2026/) (last changed: 2026-09-24)
- IN - [1 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/1c13cef183/dn01.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [1220 Flat File Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dA/be2052e7c3/business-rules-1220-flat-file.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [1220 Specifications (linked from Indiana DOR withholding)](https://www.irs.gov/pub/irs-pdf/p1220.pdf) (last changed: 2026-10-18)
- IN - [1220 Specifications/Deviations for Indiana (includes W-2Gs and 1099) (linked from Indiana DOR withho](https://www.in.gov/dA/06b8f7f762/guide-1220-w-2g-1099.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [16 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/dbdab50b66/dn16.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [2 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/4303779d38/dn02.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [3 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/e466396cf5/dn03.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [33 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/846e009a54/dn33.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [36 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/c7308ef71f/dn36.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [37 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/fa61e1bc2b/dn37.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [40 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/cd91fc13f4/dn40.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [41 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/4f00d6bd37/dn41.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [42 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/b597a0cf17/dn42.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [43 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/b8bf9db542/dn43.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [44 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/eb284a415f/dn44.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [45 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/08b0a91827/dn45.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [5 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/380e7e58fd/dn05.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [8 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/08aee5849a/dn08.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [ACH Debit Block Information (linked from Indiana DOR withholding)](https://intime.dor.in.gov/eServices/WebFiles/ACHDebitBlockGuide.pdf) (last changed: 2026-10-18)
- IN - [Change Log (linked from Indiana DOR withholding)](https://www.in.gov/dA/bbb0b69ed4/2016WTH_change_log.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Changes for Tax Year 2024 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/84c9a6182f/tax-changes-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR 2025 Fiscal Annual Report (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/2e20fab1df/NP-DOR_2025_Fiscal_Annual_Report.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR recognized as Top Workplace (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/552b6a0877/nn-twp-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR's Annual Public Hearing set for May 19 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/47da49aef6/2026-news-release-annual-public-hearing.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Departmental Notice #1 (linked from Indiana DOR withholding)](https://www.in.gov/dA/92797e5a5f/dn01.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Departmental Notice #26 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/4e9d38318e/dn26.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [EFW2 Flat File Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dA/7ad2e03d76/business-rules-efw2-flat-file.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [EFW2 Specifications/Deviations for Indiana (includes W-2 and WH-3) (linked from Indiana DOR withhold](https://www.in.gov/dA/982ff2641c/guide-efw2-w2-wh3.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Electronic payments and payment plans (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/7a5ed24c42/nn-pay-online-plans.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Eligible Hoosiers can file for a tax credit online (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/14378de7b3/NP-Eligible_Hoosiers_can_file_for_the_SC-40_online.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Estimated payments (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/76c648ed2e/nn-estimated-payments.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Form WH-47 — Certificate of Residence](https://forms.in.gov/download.aspx?id=2419) (last changed: 2026-09-24)
- IN - [Get help preparing your taxes (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/2b697b6110/nn-help-prep-taxes.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Guide to Filing Withholding via SFTP Bulk Upload (linked from Indiana DOR withholding)](https://www.in.gov/dA/0a9a6c9175/guide-withholding-sftp.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [How to send us a message (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/1a94ade629/nn-how-to-send-message.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [INTIME Guide to Withholding Taxes (linked from Indiana DOR withholding)](https://www.in.gov/dA/5bba4274a2/guide-withholding-intime.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [INTIME customer portal keybot now available (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/3c2619280a/nn-keybot.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [INTIME for Business Customers (linked from Indiana DOR withholding)](https://www.in.gov/dA/a3107df03b/intime-business-guide.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [IRIS Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dor/files/IRIS-Business-Rules.pdf) (last changed: 2026-10-18)
- IN - [Income Tax to Residents With Out-of-State Income (Reciprocal Agreement (linked from Indiana DOR with](https://www.in.gov/dA/ca58e65593/ib28.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR Launches Amnesty Eligibility Tool (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/a2e30e47fc/News-Release-Amnesty-Eligibility-Tool-May-18-2026.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR shares changes for 2025 tax returns (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/a26f05261b/NP-Indiana_DOR_shares_changes_for_2025_tax_returns.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR withholding](https://www.in.gov/dor/i-am-a/business-corp/withholding/) (last changed: 2026-10-17)
- IN - [Indiana DOR: departmental notices](https://www.in.gov/dor/legal-resources/tax-library/departmental-notices/) (last changed: 2026-10-18)
- IN - [Indiana DOR: news and publications](https://www.in.gov/dor/about/news-publications/) (last changed: 2026-10-18)
- IN - [Indiana Department of Revenue Warns of Text Message Scam (linked from Indiana DOR: news and publicat](https://www.in.gov/dA/2a75116158/NP-Indiana_Department_of_Revenue_Warns_of_Text_Message_Scam.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana Departmental Notice #1 (county rates)](https://www.in.gov/dor/files/dn01.pdf) (last changed: 2026-10-13)
- IN - [Indiana Unemployment for Employers: New Employer Premium Rate (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/new-employer-premium-rate/) (last changed: 2026-09-24)
- IN - [Indiana Unemployment for Employers: Rate Computation (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/) (last changed: 2026-09-24)
- IN - [Indiana Unemployment for Employers: State Premium Rate Computation (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/state-premium-rate-computation/) (last changed: 2026-09-25)
- IN - [Indiana's Individual income tax filing opens Jan. 29 (linked from Indiana DOR: news and publications](https://www.in.gov/dA/44250c9fad/nn-tax-filing-opening.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Individual Income tax filings opens Jan. 26 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/30dc04562e/NP-Individual_Income_tax_filings_opens_Jan._26.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Legislative Session 2026 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/ae3c2bf398/legislative-session-2026-news-release.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Need more time to file? (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/bb787aec91/nn-need-time-to-file.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [New tax information for Indiana's Military Service members (linked from Indiana DOR: news and public](https://www.in.gov/dA/a34e5f83c0/nn-military-tax-info.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Penny-rounding for retailers (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/41e8fed88f/penny-rounding-for-retailers.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [SFTP Bulk Upload Guide (linked from Indiana DOR withholding)](https://www.in.gov/dA/efe5e47b07/guide-bulk-file.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax Amnesty 2026 Window Opens (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/d1e7c10cad/2026-news-release-tax-amnesty-opens.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax Day is here! (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/7b4c8addc7/nn-tax-day-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax information for seniors and snowbirds (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/0fc4c3fa53/nn-tax-info-seniors.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Time's Running Out: Indiana’s Tax Amnesty 2026 Ends Sept. 9 (linked from Indiana DOR: news and publi](https://www.in.gov/dA/82b7e62e1f/2026-news-release-tax-amnesty-times-running-out.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [WH-1 XML Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dA/d2a2c3ce66/business-rules-wh1-xml.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Where's my refund? (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/01d4f0b348/nn-wheres-my-refund.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Withholding Information for Part-Time Employees (linked from Indiana DOR withholding)](https://www.in.gov/dA/f205e0a637/ib52.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [electronic methods and options for filing Withholding (linked from Indiana DOR withholding)](https://www.in.gov/dA/8abea3ed05/dor-efile-methods-bulk.pdf?language_id=1) (last changed: 2026-10-18)
- KY - [103 KAR 17:140 -- Individual income tax - reciprocity - nonresidents](https://revenue.ky.gov/Dor%20Training%20Materials/103%20KAR%2017.140.%20Individual%20income%20tax%20-%20reciprocity%20-%20nonresidents.pdf) (last changed: 2026-09-24)
- KY - [103 KAR 18:150​ (linked from Kentucky withholding)](https://revenue.ky.gov/DOR%20Training%20Materials/103%20KAR%2018.150.%20Employer%27s%20withholding%20reporting%20requirements.pdf) (last changed: 2026-10-18)
- KY - [2020 Employer Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/Documents/2020%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2021 Employer Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2021%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2022 Employer ​Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2022%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2025 Employer Withholding Ca​lculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2025%20Withholding%20Tax%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2025 Specifications for Electronic Submission of 1099 and W​2G (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/2025%20Specifications%20for%20Electronic%20Submission%20of%201099B,%201099DIV,%201099G,%201099INT,%201099K,%201099MISC,%201099NEC,%201099OID,%201099R%20and%20W2G%20Tax%20Information%20on%20CD%20or%20MyTaxes.ky.gov.pdf) (last changed: 2026-10-18)
- KY - [2026 Employer Withholding Ca​lculator.xl​sx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/Documents/2026%20Withholding%20Tax%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2​023 Employer Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2023%20Employer%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [42A804 (K-4)(12-2025)](https://revenue.ky.gov/Forms/42A804%20(K-4)%20(2026).pdf) (last changed: 2026-09-24)
- KY - [City of Brandenburg -- Ordinance 648 (June 2025)](https://brandenburg.ky.gov/wp-content/uploads/2025/06/ORD-648-Occupational-Tax-.33-JUNE-2025.pdf) (last changed: 2026-09-30)
- KY - [City of Corbin Occupational Tax Office](https://www.corbin-ky.gov/assets/files/uploads/_20240118110308388_3c4b72d27552424881504b851b27ab70.pdf) (last changed: 2026-10-18)
- KY - [City of Covington, KY — Finance Department, business licensing and occupational license fee](https://www.covingtonky.gov/government/departments/finance/business-licensing-occupational-license-fee) (last changed: 2026-09-24)
- KY - [City of Franklin -- Business Licensing & Taxes](https://www.franklinky.gov/departments/finance_accounting/business_licensing_taxes.php) (last changed: 2026-09-30)
- KY - [City of Henderson, KY — Occupational License Tax](https://www.hendersonky.gov/174/Occupational-License-Tax) (last changed: 2026-09-29)
- KY - [City of Lexington -- Occupational license fee: rates and current forms](https://www.lexingtonky.gov/working/business-licensing-taxes/occupational-license-fee-rates-current-forms) (last changed: 2026-09-24)
- KY - [City of Paducah -- Business License and Payroll Tax](https://paducahky.gov/departments/finance/business-license-and-payroll-tax) (last changed: 2026-09-30)
- KY - [City of Perryville -- Employer's Quarterly Return of License Fee Withheld (2023)](https://www.perryvilleky.gov/wp-content/uploads/2022/12/Employers-Qtrly-Return-of-License-Fee-WH-2023.pdf) (last changed: 2026-10-01)
- KY - [City of Russell -- Occupational License Fee](https://www.russellky.gov/departments/finance___revenue_department/occupational_license_fee/index.php) (last changed: 2026-09-30)
- KY - [City of Russellville -- Return of Payroll Taxes Withheld](https://russellvilleky.gov/index.php/forms-applications/occupational-tax?download=19:return-of-payroll-taxes-withheld) (last changed: 2026-10-18)
- KY - [City of St. Matthews -- Occupational Tax](https://www.stmatthewsky.gov/occupational-tax/) (last changed: 2026-09-30)
- KY - [City of West Liberty -- Occupational Tax Ordinance Amendment](https://westliberty.ky.gov/Ordinances/Occupational-Tax-Ordinance-Amendment.pdf) (last changed: 2026-10-01)
- KY - [Form K-5 Instructions (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/42A805-K5(I)%20(03-2025)-%20Final.pdf) (last changed: 2026-10-18)
- KY - [Grant County Fiscal Court -- Occupational Licensing](https://grantcounty.ky.gov/occupational-licensing/) (last changed: 2026-09-30)
- KY - [Hardin County -- Occupational Tax](https://www.hardincountyky.gov/365/Occupational-Tax) (last changed: 2026-09-30)
- KY - [How to Guide for Transmitters (linked from Kentucky withholding)](https://revenue.ky.gov/Documents/MyTaxes%20-%20How%20To%20Guide%20for%20Transmitters.pdf) (last changed: 2026-10-18)
- KY - [IRS Form 4506-T (linked from Kentucky withholding)](https://www.irs.gov/pub/irs-pdf/f4506t.pdf) (last changed: 2026-10-18)
- KY - [KRS 425.506 — a judgment creditor may reach only the lesser of 25% of disposable earnings, or the am](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=18419) (last changed: 2026-10-18)
- KY - [KRS 67.750 -- Definitions for KRS 67.750 to 67.790](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=48677) (last changed: 2026-09-24)
- KY - [KRS 68.180 -- Occupational license tax in counties containing 300,000 population](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=50960) (last changed: 2026-09-24)
- KY - [KRS 68.197 -- License fees in counties of 30,000 or more](https://apps.legislature.ky.gov/law/Statutes/statute.aspx?id=54832) (last changed: 2026-09-24)
- KY - [KRS 92.281 -- Levy of all taxes authorized by Constitution Section 181 -- Exceptions -- License fees](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=48683) (last changed: 2026-09-24)
- KY - [KY-TAM-18-03 -- Credit for Income Tax Paid to Another State](https://revenue.ky.gov/DOR%20Training%20Materials/KY-TAM-18-03%20Credit%20for%20Income%20Tax%20Paid%20to%20Another%20State%20FINAL%20(UPDATED%20HYPERLINKS).pdf) (last changed: 2026-09-24)
- KY - [Kentucky 2026 withholding formula](https://revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf) (last changed: 2026-09-24)
- KY - [Kentucky DOR -- 2025 Form K-4](https://revenue.ky.gov/Documents/42A804%20(K-4)%20(2025).pdf) (last changed: 2026-09-30)
- KY - [Kentucky DOR -- 2025 Kentucky Withholding Tax Formula](https://revenue.ky.gov/Forms/Withholding%20Computer%20Formula.pdf) (last changed: 2026-09-30)
- KY - [Kentucky DOR -- Kentucky DOR Announces 2025 Standard Deduction](https://revenue.ky.gov/News/pages/kentucky-dor-announces-2025-standard-deduction.aspx) (last changed: 2026-09-30)
- KY - [Kentucky DOR: news](https://revenue.ky.gov/News/Pages/default.aspx) (last changed: 2026-10-18)
- KY - [Kentucky OUI Employer Guide to Unemployment Insurance 2026 (rate schedules, taxable wage base): ui.k](https://ui.ky.gov/Documents/KY-OUI_Employer%20Guide_2026.pdf) (last changed: 2026-10-18)
- KY - [Kentucky Secretary of State -- Occupational License Tax Forms Database (KRS 67.766)](https://web.sos.ky.gov/occupationaltax/) (last changed: 2026-09-24)
- KY - [Kentucky Unemployment Insurance self-service site (employer notices)](https://ui.ky.gov/Redesign/home.aspx) (last changed: 2026-10-18)
- KY - [Kentucky withholding](https://revenue.ky.gov/Business/Pages/Employer-Payroll-Withholding.aspx) (last changed: 2026-09-24)
- KY - [Louisville Metro Revenue Commission -- W-1KJC Instructions and Louisville Metro Code Sec. 110.02](https://louisvilleky.gov/sites/default/files/2024-12/w-1kjc_instructions_2025.pdf) (last changed: 2026-09-24)
- KY - [Need to update or cancel a business account? (linked from Kentucky withholding)](http://revenue.ky.gov/Forms/10A104.pdf) (last changed: 2026-10-18)
- KY - [Powell County -- Ordinance 2025-07](http://www.powellcountyky.us/ordinances/Ordinance%202025-07.pdf) (last changed: 2026-10-18)
- KY - [Simpson County -- Occupational Tax Administration](https://simpsoncountyky.gov/occupational-tax-administration/) (last changed: 2026-09-30)
- KY - [USDA National Finance Center -- Kentucky City (Local) Income Tax Withholding bulletin](https://help.nfc.usda.gov/bulletins/2024/1709749757.htm) (last changed: 2026-09-24)
- KY - [her​e​ (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/2025%20Specifications%20for%20Electronic%20Submission%20of%201099B%2C%201099DIV%2C%201099G%2C%201099INT%2C%201099K%2C%201099MISC%2C%201099NEC%2C%201099OID%2C%201099R%20and%20W2G%20Tax%20Information%20on%20CD%20or%20MyTaxes.ky.gov.pdf) (last changed: 2026-10-18)
- KY - [h​​e​​re (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/2025%20Specifications%20for%20Electronic%20Submission%20of%20Annual%20wage%20and%20Tax%20Information%20Via%20Electronic%20Media%20or%20Web.pdf) (last changed: 2026-10-18)
- KY - [​ (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2024%20Withholding%20Calculator%20(Team%20KY)-%20Final%20version%20to%20publish.xlsx) (last changed: 2026-10-18)
- MI - [2026 Michigan Income Tax Withholding Guide, Form 446 (Rev. 02-26)](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2026/446_Withholding-Guide_2026.pdf) (last changed: 2026-09-24)
- MI - [4.25% Income Tax Rate for Individuals and Fiduciaries in 2026 Tax Year (Treasury taxpayer notice, 20](https://www.michigan.gov/treasury/reference/taxpayer-notices/2026/04/15/425-income-tax-rate-for-individuals-and-fiduciaries-in-2026-tax-year) (last changed: 2026-09-24)
- MI - [5469 (Rev. 05-24) — 2025 City of Detroit Income Tax Withholding Guide (Treasury administers Detroit ](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/City-Withholding/TY2025/5469_ty2025.pdf) (last changed: 2026-09-24)
- MI - [Application for State Real Estate Transfer Tax (SRETT) Refund (linked from Michigan Treasury: taxes ](https://www.michigan.gov/taxes/-/media/Project/Websites/treasury/Forms/Misc/2796.pdf) (last changed: 2026-10-18)
- MI - [MCL 141.631 — City Income Tax Act, Sec. 31 (personal/dependency exemptions)](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-141-631) (last changed: 2026-09-26)
- MI - [MCL 206.30 — retirement/pension income deductions (subsection (1)(f) etc.), the basis for MI taxable](https://www.legislature.mi.gov/Laws/MCL?objectName=MCL-206-30) (last changed: 2026-09-26)
- MI - [MCL 206.703(2) — Every employer required under the Internal Revenue Code to withhold on an individua](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-206-703) (last changed: 2026-09-26)
- MI - [MCL 600.4012 and Michigan's own garnishment procedure — tracks the federal CCPA floor (25%/30x-feder](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-600-4012) (last changed: 2026-10-18)
- MI - [MI-W4 (Rev. 12-20) — Employee's Michigan Withholding Exemption Certificate](https://www.michigan.gov/-/media/Project/Websites/taxes/Forms/All-Years/MIW4.pdf) (last changed: 2026-09-24)
- MI - [Michigan LEO -- Michigan's Minimum Wage Set to Increase on Jan. 1, 2026](https://www.michigan.gov/leo/news/2025/12/08/michigans-minimum-wage-set-to-increase-on-jan-1-2026) (last changed: 2026-10-15)
- MI - [Michigan LEO/UIA — Taxable Wage Base FAQ](https://www.michigan.gov/leo/bureaus-agencies/uia/employers/forms/accordion/taxable-wage-base) (last changed: 2026-09-24)
- MI - [Michigan LEO/UIA — Unemployment Tax Rate (statutory formula, Section 19 of the Michigan Employment S](https://www.michigan.gov/leo/bureaus-agencies/uia/assets/unemployment-tax-rate) (last changed: 2026-09-24)
- MI - [Michigan Treasury -- 446 Michigan Income Tax Withholding Guide (2025)](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2025/446_Withholding-Guide_2025.pdf) (last changed: 2026-09-30)
- MI - [Michigan Treasury -- Withholding Tax Information by Calendar Year](https://www.michigan.gov/taxes/business-taxes/withholding/calendar-year-tax-information) (last changed: 2026-09-30)
- MI - [Michigan Treasury — Withholding Reciprocity Examples (Analysis section: MCL 206.703(2), MCL 206.110,](https://www.michigan.gov/taxes/business-taxes/payroll-service-providers/withholding-reciprocity-examples) (last changed: 2026-09-24)
- MI - [Michigan Treasury: taxes home (notices and withholding news)](https://www.michigan.gov/taxes) (last changed: 2026-10-18)
- MI - [Michigan Treasury: taxpayer notices](https://www.michigan.gov/treasury/reference/taxpayer-notices) (last changed: 2026-10-18)
- MI - [Michigan withholding tax](https://www.michigan.gov/taxes/business-taxes/withholding) (last changed: 2026-09-24)
- MI - [Other Michigan Cities with Income Tax (City of Grand Rapids consolidated rate/exemption table)](https://www.grandrapidsmi.gov/departments/fiscal-services/income-tax/other-michigan-cities-with-income-tax/) (last changed: 2026-10-12)
- MI - [Questions and Answers About Paying Your Withholding Tax on an Accelera (linked from Michigan withhol](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/4285-Instructions.pdf?hash=EA587E841C309AB5B9A4CD6A9AEB8C77) (last changed: 2026-10-18)
- MI - [Revenue Administrative Bulletin 1988-27 — Section 125 cafeteria plan benefits excluded from AGI are ](https://michigan.gov/treasury/0,4679,7-121-44402_44415_44416-7351--,00.html) (last changed: 2026-09-24)
- MI - [Which cities impose an income tax? (Michigan Dept of Treasury — authoritative list of all 24 cities)](https://www.michigan.gov/taxes/questions/iit/accordion/general/what-cities-impose-an-income-tax) (last changed: 2026-09-24)
- OH - [https://www.ccaohio.gov/member-municipalities](https://www.ccaohio.gov/member-municipalities) (last changed: 2026-10-13)
- OH - [1099 Common Errors (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/1099_common_errors_2021.pdf) (last changed: 2026-10-18)
- OH - [1099 Submission Error Descriptions (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/1099uploadsubmissionerrordescriptions2021.pdf) (last changed: 2026-10-18)
- OH - [2025 1099-MISC Upload Specifications (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/2025_1099MISC_Specs_V1.pdf) (last changed: 2026-10-18)
- OH - [2025 1099-NEC Upload Specifications (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/2025_1099NEC_Specs_V1.pdf) (last changed: 2026-10-18)
- OH - [2025 1099-R Upload Specifications (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/2025_1099R_Specs_V1.pdf) (last changed: 2026-10-18)
- OH - [2025 EFW2 Upload Specifications (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/2025_W2_Specs_V1.pdf) (last changed: 2026-10-18)
- OH - [2025 EFW2C Upload Specifications (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/2025_W2C_Specs_v1.pdf) (last changed: 2026-10-18)
- OH - [2025 Simplified W-2 Method Specifications Create CSV Guide (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/2025_W2_CSV_Specs_V1.pdf) (last changed: 2026-10-18)
- OH - [2025 Simplified W-2 Method Specifications Easy Entry Guide (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/2025_Simplified_Upload_Specs_Easy_Entry_V1.pdf) (last changed: 2026-10-18)
- OH - [ASCII Guidelines (linked from Ohio Department of Taxation: municipal income tax )](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/ascii%20and%20xml/ASCII%20Instructions%207.19.23.pdf) (last changed: 2026-10-18)
- OH - [BUSINESS TAX NOTIFICATION (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_5f60f5fa78e64495b52690728f655b41.pdf) (last changed: 2026-10-18)
- OH - [Biweekly Withholding (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_BiweeklyRate_2025.pdf) (last changed: 2026-10-18)
- OH - [Biweekly Withholding (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2026%20Withholding%20Tables/WHT_BiweeklyRate_2026.pdf) (last changed: 2026-10-18)
- OH - [CCA (Central Collection Agency): municipal income tax calendar and notices](https://www.ccaohio.gov/due-dates/municipal-income-tax-calendar) (last changed: 2026-10-18)
- OH - [CCA Division of Taxation -- Tax Rates (2026 and 2025 tables)](https://www.ccaohio.gov/tax-rates) (last changed: 2026-09-30)
- OH - [City of Dayton -- Joint Economic Development District](https://www.daytonohio.gov/261/Joint-Economic-Development-District) (last changed: 2026-09-30)
- OH - [Combined Form IT 4 — Employee's Withholding Exemption Certificate (post-2020-12-07 combined version)](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth-it4-combined-fi.pdf) (last changed: 2026-09-24)
- OH - [Daily Withholding Tables (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_DailyRate_2025.pdf) (last changed: 2026-10-18)
- OH - [Daily Withholding Tables (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2026%20Withholding%20Tables/WHT_DailyRate_2026.pdf) (last changed: 2026-10-18)
- OH - [Declaration of Estimated Payments (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/ascii%20-%20declaration%20of%20estimated%20payments%208-21-18.xlsx) (last changed: 2026-10-18)
- OH - [Due Dates and Payment Schedule (2025) (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2024-2025%20NYP%20Updates/Due_Dates_2024-2025.pdf) (last changed: 2026-10-18)
- OH - [Due Dates and Payment Schedule (2026) (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/Due_Dates_2025-2026.pdf) (last changed: 2026-10-18)
- OH - [EFW2 Common Submission Errors (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2021-efw2-upload-common-submission-errors.pdf) (last changed: 2026-10-18)
- OH - [EMPLOYER ANNUAL W-3 RECONCILIATION (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_547e5bf4650c4ac4917f6505c1a6cd9c.pdf) (last changed: 2026-10-18)
- OH - [Employer Withholding Taxes - Percentage Method (Effective August 1, 2026)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2026%20Withholding%20Tables/WHT_PercentageMethod_2026.pdf) (last changed: 2026-09-24)
- OH - [Excel File Generator Tool (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/oh%20muni%20ascii%20dev%20v017%202_19_2020.xls) (last changed: 2026-10-18)
- OH - [FREQUENTLY ASKED BUSINESS QUESTIONS (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_671d3095bbb94e7b855bd7177f85501c.pdf) (last changed: 2026-10-18)
- OH - [FREQUENTLY ASKED QUESTIONS (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_c4df5a9b47eb40408b719b1a032a0952.pdf) (last changed: 2026-10-18)
- OH - [Form MNP-TTI (linked from Ohio Department of Taxation: municipal income tax )](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/municipal-net-profit/2021/mnp_transfer_of_info.pdf) (last changed: 2026-10-18)
- OH - [IMPORTANT TAX NOTIFICATION (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_7f2c69d239cb4b4280d39b32dcae18ad.pdf) (last changed: 2026-10-18)
- OH - [INCOME TAX RETURN FORM (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_79b4f5e4750649cb8c98764b7d509c71.pdf) (last changed: 2026-10-18)
- OH - [Information Booklet for Taxpayers (linked from Ohio Department of Taxation: municipal income tax )](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/forms/taxpayer_booklet_042023.pdf) (last changed: 2026-10-18)
- OH - [Instructions for Declaration of Estimated Payments (linked from Ohio Department of Taxation: municip](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/instructions_for_declaration_of_estimated_payments_ohio_taxation-municipal_net_profit_tax_rev3.1.21.pdf) (last changed: 2026-10-18)
- OH - [JANUARY 12TH 2026 MEETING MINUTES (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_b51c292022524d29b3b925318000fbed.pdf) (last changed: 2026-10-18)
- OH - [JANUARY 26TH 2026 MEETING MINUTES (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_5ff4eff4f9a846d3852598a970090c39.pdf) (last changed: 2026-10-18)
- OH - [MNP 2017-01: Information for JEDDs and JEDZs information release (linked from Ohio Department of Tax](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/information-releases/mnp2017-01_information_for_jedds_and_jedzs-1.5.24.pdf) (last changed: 2026-10-18)
- OH - [MNP10 Tax Return (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/ascii%20-%20mnp10%20return%208-21-18.xlsx) (last changed: 2026-10-18)
- OH - [MONTHLY TAX WITHHOLDING FORM (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_3609a1bbc1ec47fcbb0ae4054a1365b5.pdf) (last changed: 2026-10-18)
- OH - [Monthly Withholding Tables (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_MonthlyRate_2025.pdf) (last changed: 2026-10-18)
- OH - [Municipalities and Municipality Codes List (linked from Ohio Department of Taxation: municipal incom](https://dam.assets.ohio.gov/image/upload/v1741618460/tax.ohio.gov/muni-net-profit/municipal.tax.rate-3.7.25.pdf) (last changed: 2026-10-18)
- OH - [Municipality Address List (linked from Ohio Department of Taxation: municipal income tax )](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/muni%20address%20list%203-5-18.pdf) (last changed: 2026-10-18)
- OH - [Municipality/Local Government Portal User Guide (linked from Ohio Department of Taxation: municipal ](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/local%20gov%20portal%20user%20guide%2012-13-19.pdf) (last changed: 2026-10-18)
- OH - [Ohio Auditor of State, Liberty Township (Henry County) regular audit 2021-2022: 'The JEDD was dissol](https://ohioauditor.gov/Auditsearch/Reports/2023/Liberty_Township_22_21_Henry_FINAL.pdf) (last changed: 2026-10-06)
- OH - [Ohio Business Gateway Registration Instructions (linked from Ohio Department of Taxation: municipal ](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/modernized_gateway_registration_for_municipal_net_profit_tax_rev3.1.21.pdf) (last changed: 2026-10-18)
- OH - [Ohio Department of Commerce -- Ohio Minimum Wage Set to Increase in 2026](https://com.ohio.gov/about-us/media-center/news/ohio%20minimum%20wage%20set%20to%20increase%20in%202026) (last changed: 2026-09-24)
- OH - [Ohio Department of Taxation -- Employer Withholding Taxes, Percentage Method (Effective October 1, 2](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_PercentageMethod_2025.pdf) (last changed: 2026-09-24)
- OH - [Ohio Department of Taxation -- School Districts With an Income Tax for 2025 (Updated School District](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2024-2025%20NYP%20Updates/School_Districts_2025.pdf) (last changed: 2026-09-30)
- OH - [Ohio Department of Taxation: all news](https://tax.ohio.gov/wps/portal/gov/tax/home/news-and-events/all-news/) (last changed: 2026-10-18)
- OH - [Ohio Department of Taxation: information releases](https://tax.ohio.gov/wps/portal/gov/tax/help-center/communications/information-releases) (last changed: 2026-10-18)
- OH - [Ohio Department of Taxation: municipal income tax (state page for municipalities and employers)](https://tax.ohio.gov/business/municipalities) (last changed: 2026-10-18)
- OH - [Ohio Dept of Taxation - School District Income Tax rate list, Tax Year 2026](https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf) (last changed: 2026-09-24)
- OH - [Ohio Form IT 4NR — Employee's Statement of Residency in a Reciprocity State (Rev. 5/07), Ohio Depart](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth_it4nr.pdf) (last changed: 2026-09-24)
- OH - [Ohio JEDD/JEDZ Income Tax Rate Database Table (The Finder, bulk CSV)](https://thefinder.tax.ohio.gov/api/file-downloads/content?target=https%3A%2F%2Fapi.thefinder.tax.ohio.gov%2Ffinder%2Fapi%2Fv1%2Ftax-rates%2Fdownloads%2FJEDTaxRates.csv) (last changed: 2026-09-24)
- OH - [Ohio Municipal Income Tax Rates (The Finder, bulk CSV: read through the Finder's own download link)](https://thefinder.tax.ohio.gov/api/file-downloads/content?target=https%3A%2F%2Fapi.thefinder.tax.ohio.gov%2Ffinder%2Fapi%2Fv1%2Ftax-rates%2Fdownloads%2FMuni%2FOHMuniRateTable.csv) (last changed: 2026-10-18)
- OH - [Ohio Revised Code 5748.01(E), definition of "taxable income" for school district income tax](https://codes.ohio.gov/ohio-revised-code/section-5748.01) (last changed: 2026-09-26)
- OH - [Ohio Revised Code 715.691 (joint economic development zones)](https://codes.ohio.gov/ohio-revised-code/section-715.691) (last changed: 2026-09-26)
- OH - [Ohio Revised Code 715.72 (joint economic development districts)](https://codes.ohio.gov/ohio-revised-code/section-715.72) (last changed: 2026-09-26)
- OH - [Ohio Revised Code 718.01(R), definition of "qualifying wages"](https://codes.ohio.gov/ohio-revised-code/section-718.01) (last changed: 2026-09-26)
- OH - [Ohio Revised Code Section 5747.06(A) -- Withholding exemptions, paragraphs (1) through (6)](https://codes.ohio.gov/ohio-revised-code/section-5747.06) (last changed: 2026-09-24)
- OH - [Ohio Revised Code Section 718.011 — Withholding requirements for casual entrant employers](https://codes.ohio.gov/ohio-revised-code/section-718.011) (last changed: 2026-09-24)
- OH - [Ohio Revised Code Section 718.121 — Second municipality imposing tax after time period allowed for r](https://codes.ohio.gov/ohio-revised-code/section-718.121) (last changed: 2026-09-24)
- OH - [Ohio Unemployment Contribution Rates for Calendar Year 2023-2026](https://jfs.ohio.gov/unemployment-services/for-employers/file-unemployment-taxes/tax-resources/contribution-rates) (last changed: 2026-10-15)
- OH - [Ohio employer withholding](https://tax.ohio.gov/business/employer-withholding) (last changed: 2026-10-07)
- OH - [QUARTERLY TAX WITHHOLDING FORM (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_bf1167c7bfba4bb9a22a04b6b0dbbd1e.pdf) (last changed: 2026-10-18)
- OH - [QUARTERLY VOUCHER (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_04f52afe0409481fad8c2157a8933a33.pdf) (last changed: 2026-10-18)
- OH - [R.C. 2716.02 — maximum garnishment is the lesser of 25% of disposable earnings, or the amount by whi](https://codes.ohio.gov/ohio-revised-code/section-2716.02) (last changed: 2026-10-18)
- OH - [RITA (Regional Income Tax Agency): news and updates (municipal rate and law changes)](https://www.ritaohio.com/Resources/News) (last changed: 2026-10-18)
- OH - [RITA: tax professionals news](https://www.ritaohio.com/TaxProfessionals/News) (last changed: 2026-10-18)
- OH - [School district rates (2026) (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/School_Districts_2026.pdf) (last changed: 2026-10-18)
- OH - [Semi-monthly Withholding (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_Semi-MonthlyRate_2025.pdf) (last changed: 2026-10-18)
- OH - [Simplified W-2 Field Descriptions and Error Messages (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2021-simplifed-w2-field-descriptions-error-messages.pdf) (last changed: 2026-10-18)
- OH - [TAX ORDINANCE PASSED 02.09.2026 (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_fc1ed5429f25479b939fd57201b684f7.pdf) (last changed: 2026-10-18)
- OH - [TAXABLE VS NONTAXABLE INCOME (linked from Village of Woodville: income tax page (withholding)](https://www.villageofwoodville.com/_files/ugd/ef2ef5_51de34806c534a27a18322c185722de7.pdf) (last changed: 2026-10-18)
- OH - [Tax Withholding Tables - Optional Computer Method (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_OptionalComputerFormula_2025.pdf) (last changed: 2026-10-18)
- OH - [The Finder: directory of every Ohio municipality (a new entry here is a new jurisdiction)](https://thefinder.tax.ohio.gov/api/file-downloads?type=municipality) (last changed: 2026-10-17)
- OH - [The Finder: directory of every Ohio school district](https://thefinder.tax.ohio.gov/api/file-downloads?type=schoolDistrict) (last changed: 2026-10-18)
- OH - [Village of Georgetown -- Income Tax](https://georgetownohio.gov/income-tax/) (last changed: 2026-10-04)
- OH - [Village of Indian Hill -- Tax](https://indianhill.gov/departments/tax/) (last changed: 2026-09-30)
- OH - [Village of Woodville: income tax page (withholding notice, forms, ordinance)](https://www.villageofwoodville.com/tax-information) (last changed: 2026-10-18)
- OH - [W-2G Winners Report specifications (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/W2G_Winners_Report_Specs.pdf) (last changed: 2026-10-18)
- OH - [Weekly Withholding (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_WeeklyRate_2025.pdf) (last changed: 2026-10-18)
- OH - [Withholding Tax Filing Guidelines (linked from Ohio employer withholding)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025-2026%20NYP%20Updates/2026_OH_Employer_School_District_Withholding_Tax_Filing_Guidelines.pdf) (last changed: 2026-10-18)
- OH - [XML Guidelines (linked from Ohio Department of Taxation: municipal income tax )](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/ascii%20and%20xml/XML%20Instructions%207.19.23.pdf) (last changed: 2026-10-18)
- PA - [42 Pa. Cons. Stat. § 8127 — wages/salaries/commissions exempt from attachment, execution or other pr](https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/42/00.081.027.000..HTM) (last changed: 2026-10-18)
- PA - [Mailing Addresses [PDF] (linked from Pennsylvania Department of Revenue: newsroom)](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/contactus/documents/address_directory.pdf) (last changed: 2026-10-18)
- PA - [Mailing Addresses [PDF] (linked from Pennsylvania employer withholding)](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/contactus/documents/address_directory.pdf) (last changed: 2026-10-18)
- PA - [Maryland Form MW507 (COM/RAD-036, 07/25 revision) -- 2026 Employee's Maryland Withholding Exemption ](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/forms/2026/mw507.pdf) (last changed: 2026-09-24)
- PA - [NJ Division of Taxation -- Reciprocal Personal Income Tax Agreement (PA/NJ)](https://www.nj.gov/treasury/taxation/njit25.shtml) (last changed: 2026-09-24)
- PA - [PA DCED -- Local Services Tax (LST)](https://dced.pa.gov/local-government/local-income-tax-information/local-services-tax/) (last changed: 2026-09-24)
- PA - [PA DCED Municipal Statistics -- EIT/PIT/LST Tax Register with Collector (statewide, official)](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2026) (last changed: 2026-09-24)
- PA - [PA DCED Municipal Statistics -- EIT/PIT/LST Tax Register with Collector (statewide, official) -- 202](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2025) (last changed: 2026-09-30)
- PA - [PA Department of Labor & Industry -- UC Computation of Rates](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/computation-of-rates) (last changed: 2026-10-02)
- PA - [PA Department of Labor & Industry -- UC employee withholding (0.07% since 2018)](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/employee-withholding) (last changed: 2026-09-24)
- PA - [PA Department of Labor & Industry -- Yearly Tax Highlights (UC)](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/yearly-tax-highlights) (last changed: 2026-10-07)
- PA - [PA Department of Revenue -- Employer Withholding (reciprocal agreements)](https://www.pa.gov/en/agencies/revenue/resources/tax-types-and-information/employer-withholding.html) (last changed: 2026-10-17)
- PA - [PA Department of Revenue -- Personal Income Tax (3.07%)](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) (last changed: 2026-10-17)
- PA - [Pennsylvania Department of Revenue: newsroom](https://www.pa.gov/agencies/revenue/newsroom) (last changed: 2026-10-18)
- PA - [Pennsylvania employer withholding](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/employer-withholding) (last changed: 2026-10-17)
- PA - [REV-415 (SU) 01-23 -- Employer Withholding Information Guide](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/employerwithholding/documents/rev-415.pdf) (last changed: 2026-09-24)
- PA - [REV-419 (EX) 09-20, instructions REV-419 IN (EX) 03-24 -- Employee's Nonwithholding Application Cert](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/employerwithholding/documents/rev-419.pdf) (last changed: 2026-09-24)
- PA - [UC-748 (REV 09-25) -- Contribution Rates Effective January 1, 2026](https://www.pa.gov/content/dam/copapwp-pagov/en/dli/documents/uc/employer/uc-tax-rates/uc-748%20rev%2009-25.pdf) (last changed: 2026-09-24)
- US - [https://apps.dced.pa.gov/munstats-public/FindLocalTax.aspx](https://apps.dced.pa.gov/munstats-public/FindLocalTax.aspx) (last changed: 2026-09-24)
- US - [https://thefinder.tax.ohio.gov/?tab=fileDownloads](https://thefinder.tax.ohio.gov/?tab=fileDownloads) (last changed: 2026-09-24)
- US - [2021 PDF (linked from IRS Publication 51 (Circular A), Agricultural Empl)](https://www.irs.gov/pub/irs-prior/p51--2021.pdf) (last changed: 2026-10-18)
- US - [2022 PDF (linked from IRS Publication 51 (Circular A), Agricultural Empl)](https://www.irs.gov/pub/irs-prior/p51--2022.pdf) (last changed: 2026-10-18)
- US - [2023 PDF (linked from IRS Publication 51 (Circular A), Agricultural Empl)](https://www.irs.gov/pub/irs-prior/p51--2023.pdf) (last changed: 2026-10-18)
- US - [DOL FUTA credit reduction states](https://oui.doleta.gov/unemploy/futa_credit.asp) (last changed: 2026-09-24)
- US - [DOL Fact Sheet #30: Wage Garnishment Protections of the Consumer Credit Protection Act (CCPA)](https://www.dol.gov/agencies/whd/fact-sheets/30-cppa) (last changed: 2026-09-24)
- US - [DOL consolidated state minimum wage table](https://www.dol.gov/agencies/whd/mw-consolidated) (last changed: 2026-09-24)
- US - [DOL elaws: FLSA/CCPA Wage Garnishment — Basic Provisions/Requirements](https://webapps.dol.gov/elaws/elg/garnish.htm) (last changed: 2026-09-24)
- US - [DOL state minimum wage laws](https://www.dol.gov/agencies/whd/minimum-wage/state) (last changed: 2026-09-24)
- US - [Executive Order 14236, Additional Rescissions of Harmful Executive Orders and Actions (2025-03-14), ](https://www.dol.gov/agencies/whd/government-contracts/eo14026) (last changed: 2026-09-24)
- US - [Federal Register: Railroad Retirement Board notices (RUIA/RRTA rates) - official API](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=railroad-retirement-board) (last changed: 2026-09-30)
- US - [Federal Register: SSA yearly wage base notice (Cost-of-Living Increase and Other Determinations) - o](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=social-security-administration&conditions%5Bterm%5D=%22cost-of-living+increase+and+other+determinations%22) (last changed: 2026-09-24)
- US - [Federal Register: new IRS withholding rules and proposed rules - official API](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=internal-revenue-service&conditions%5Btype%5D%5B%5D=RULE&conditions%5Btype%5D%5B%5D=PRORULE&conditions%5Bterm%5D=withholding) (last changed: 2026-09-24)
- US - [Federal Register: new Wage and Hour Division documents (minimum wage, overtime, garnishment) - offic](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=wage-and-hour-division) (last changed: 2026-10-16)
- US - [IRS Form W-4](https://www.irs.gov/pub/irs-pdf/fw4.pdf) (last changed: 2026-09-24)
- US - [IRS Instructions for Schedule H (2025)](https://www.irs.gov/instructions/i1040sh) (last changed: 2026-09-30)
- US - [IRS Notice 2024-80, 2025 Amounts Relating to Retirement Plans and IRAs](https://www.irs.gov/pub/irs-drop/n-24-80.pdf) (last changed: 2026-09-30)
- US - [IRS Publication 15 (2025), Employer's Tax Guide](https://www.irs.gov/pub/irs-prior/p15--2025.pdf) (last changed: 2026-09-30)
- US - [IRS Publication 15 (2026) and SSA, Election Workers — State and Local Government Employers](https://www.ssa.gov/slge/election_workers.htm) (last changed: 2026-09-24)
- US - [IRS Publication 15 (Circular E, Employer's Tax Guide)](https://www.irs.gov/pub/irs-pdf/p15.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15-A (supplemental guide)](https://www.irs.gov/pub/irs-pdf/p15a.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15-B (fringe benefits)](https://www.irs.gov/pub/irs-pdf/p15b.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15-T (2025), Federal Income Tax Withholding Methods (prior-year copy)](https://www.irs.gov/pub/irs-prior/p15t--2025.pdf) (last changed: 2026-09-30)
- US - [IRS Publication 15-T (Federal Income Tax Withholding Methods)](https://www.irs.gov/pub/irs-pdf/p15t.pdf) (last changed: 2026-09-24)
- US - [IRS Publication 15-T (web page)](https://www.irs.gov/publications/p15t) (last changed: 2026-09-24)
- US - [IRS Publication 51 (Circular A), Agricultural Employer's Tax Guide: current edition page](https://www.irs.gov/forms-pubs/about-publication-51) (last changed: 2026-10-18)
- US - [IRS Publication 926 (2026), Household Employer's Tax Guide](https://www.irs.gov/pub/irs-pdf/p926.pdf) (last changed: 2026-09-24)
- US - [IRS retirement plan contribution limits (401(k)/403(b)/457)](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-401k-and-profit-sharing-plan-contribution-limits) (last changed: 2026-09-24)
- US - [IRS — Members of the clergy / Publication 15-A, Special Rules for Ministers](https://www.irs.gov/businesses/small-businesses-self-employed/members-of-the-clergy) (last changed: 2026-09-24)
- US - [Instruction 940 (linked from IRS draft tax forms: payroll forms only (W-4, W-4P)](https://www.irs.gov/pub/irs-dft/i940--dft.pdf) (last changed: 2026-10-18)
- US - [Notice 2021-31 provides guidance on temporary premium assistance for C (linked from IRS Publication ](https://www.irs.gov/pub/irs-drop/n-21-31.pdf) (last changed: 2026-10-18)
- US - [Notice 2021-46 supplements Notice 2021-31 on temporary premium assista (linked from IRS Publication ](https://www.irs.gov/pub/irs-drop/n-21-46.pdf) (last changed: 2026-10-18)
- US - [P.L. 119-21 on govinfo.gov (official text)](https://www.govinfo.gov/app/details/PLAW-119publ21) (last changed: 2026-09-24)
- US - [Publication 1635, Employer Identification Number Understanding Your EI (linked from IRS Publication ](https://www.irs.gov/pub/irs-pdf/p1635.pdf) (last changed: 2026-10-18)
- US - [RRB Program Letter 2025-01 (monthly base) and RRB FY2026 Justification of Budget Estimates (rates)](https://www.rrb.gov/sites/default/files/2025-07/JBE2026.pdf) (last changed: 2026-09-30)
- US - [U.S. DOL Wage and Hour Division -- Fact Sheet 17A: Exemption for Executive, Administrative, Professi](https://www.dol.gov/agencies/whd/fact-sheets/17a-overtime) (last changed: 2026-09-24)
- US - [U.S. DOL Wage and Hour Division -- Minimum Wages for Tipped Employees (table current as of July 1, 2](https://www.dol.gov/agencies/whd/state/minimum-wage/tipped) (last changed: 2026-09-24)
- US - [US Railroad Retirement Board, Program Letter 2025-01](https://www.rrb.gov/Employers/Publications/ProgramAndCircularLetters/PL25-01) (last changed: 2026-09-30)
- US - [eCFR 29 CFR 870 amendment history (garnishment limits) - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?part=870) (last changed: 2026-09-24)
- US - [eCFR 34 CFR 34 amendment history (administrative wage garnishment) - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-34.json?part=34) (last changed: 2026-09-24)
- UT - [Utah Pub 14 page](https://tax.utah.gov/forms-pubs/pub-14/) (last changed: 2026-09-24)
- UT - [Utah Publication 14 (withholding)](https://files.tax.utah.gov/tax/forms/pubs/pub-14.pdf) (last changed: 2026-09-24)
- UT - [Utah State Tax Commission -- Publication 14 Rev. 4/24, Withholding Tax Guide](https://files.tax.utah.gov/tax/forms/2024/pub-14.pdf) (last changed: 2026-09-30)
- UT - [Utah State Tax Commission -- Publication 14 Rev. 4/25, Withholding Tax Guide](https://files.tax.utah.gov/tax/forms/2025/pub-14.pdf) (last changed: 2026-09-30)
- UT - [Utah State Tax Commission UI wage base / tax rate page](https://jobs.utah.gov/ui/employer/Public/Questions/TaxRates.aspx) (last changed: 2026-09-24)
- UT - [Utah State Tax Commission: news releases](https://tax.utah.gov/news/) (last changed: 2026-10-18)
- UT - [Utah State Tax Commission: tax bulletins](https://tax.utah.gov/tax-bulletins/) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-01-10.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-03-16-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-03-17-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-03-19-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-03-20-dmv-psa.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-03-20-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-03-26-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-03-28-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-03-30-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-04-03-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-04-10-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-04-29-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-05-11-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-06-15-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-06-23-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-07-13-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-07-17-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-08-25-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-09-14-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-09-15-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-09-17-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-12-01-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-12-02-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2020-12-16-release.pdf) (last changed: 2026-10-18)
- UT - [pdf (linked from Utah State Tax Commission: news releases)](https://files.tax.utah.gov/tax/commission/releases/2021-06-14-release.pdf) (last changed: 2026-10-18)
- WV - [TSD 381 (linked from West Virginia withholding)](https://tax.wv.gov/Documents/TSD/tsd381.pdf) (last changed: 2026-10-18)
- WV - [TSD 389 (linked from West Virginia withholding)](https://tax.wv.gov/Documents/TSD/tsd389.pdf) (last changed: 2026-10-18)
- WV - [W. Va. Code § 38-5A-3 — ordinary (consumer credit sale/consumer loan judgment) garnishment limited t](https://code.wvlegislature.gov/38-5A-3/) (last changed: 2026-10-18)
- WV - [WV IT-100.2A -- Tables for Percentage Method of Withholding (March 2026 revision)](https://tax.wv.gov/Documents/Withholding/it100.2a.pdf) (last changed: 2026-09-24)
- WV - [WV State Tax Division -- Withholding Help and General Information page, "Supplemental Wages" guidanc](https://tax.wv.gov/Business/Withholding/HelpAndGeneralInformation/Pages/WithholdingHelpAndGeneralInformation.aspx) (last changed: 2026-09-24)
- WV - [WV/IT-104 -- Employee's Withholding Exemption Certificate (Rev. 03/2023) + WV/IT-104NR Certificate o](https://tax.wv.gov/Documents/Withholding/it104.pdf) (last changed: 2026-09-24)
- WV - [West Virginia Division of Labor -- Minimum Wage](https://labor.wv.gov/wage-hour/jobs-act/minimum-wage) (last changed: 2026-09-24)
- WV - [West Virginia State Tax Department: home page (news and notices)](https://tax.wv.gov/) (last changed: 2026-10-18)
- WV - [West Virginia Tax Division -- 2026 Income Tax Rate Cut](https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx) (last changed: 2026-09-30)
- WV - [West Virginia withholding](https://tax.wv.gov/Business/Withholding/Publications/Pages/WithholdingPublications.aspx) (last changed: 2026-09-24)
- WV - [West Virginia withholding forms](https://tax.wv.gov/business/withholding/pages/withholdingtaxforms.aspx) (last changed: 2026-09-30)

</details>

