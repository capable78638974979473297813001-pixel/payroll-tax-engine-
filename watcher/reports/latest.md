# Source watch - 2026-11-02

**75 sources changed**

**1 item need attention: see "Needs attention" below.** A run with no changes is not an all-clear while this list is not empty.

| Changed | Minor | Unchanged | New | Unstable | Unreachable | Gone (404) | Blocks bots | Total |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 75 | 10 | 896 | 30 | 1 | 5 | 6 | 37 | 1060 |

_Run took 2563 s. A change is only reported after a second fetch confirms it._

**Coverage: 1012 of 1060 sources were read this run; 48 could not be checked**, and 33 of those have never been read successfully, so nothing about them is being watched.
378 of those are documents linked from pages. 6 other linked documents could not be read (a dead link, or a file the site won't serve) and are not counted above.
**708 linked documents were not read this run** (the time budget ran out) and will be read first thing in the next run; until then they are not being watched.

## Needs attention (1)

| What | Detail |
|---|---|
| KY Whitesville | the Secretary of State's record changed 2026-10-06, after the data was scraped on 2026-08-13 (rate ''); re-read the ordinance |

## Data checks against official files: for information (14)

No change needed, but worth knowing: a variance the data file already explains, a row added by hand that the official file hasn't caught up to, or a municode that can now be filled in.

<details><summary>Show</summary>

| Jurisdiction | Name | Code | Detail |
|---|---|---|---|
| AL | Opelika |  | the League's survey list says 1.5%; the data has 1% (confirmed from the city's own document: tier primary_source) |
| AL | Tuskegee |  | the League's survey list says 2%; the data has 3% (confirmed from the city's own document: tier conflicting_sources) |
| MI | Saginaw |  | resident rate table 0.01 vs data 0.015; nonresident rate table 0.005 vs data 0.0075; exemption table 1000 vs data 750 (the data's own note records that this table is wrong for this city) |
| OH | Indian Hill | 76582 | official 0.450% vs engine 0.500% (acknowledged in the data file's own note) |
| OH | Washington | 81214 | official 1.950% vs engine 1.750% (acknowledged in the data file's own note) |
| OH | Germantown | 29932 | added by hand; the official rate file has no row for it yet (the Finder's directory lists it as code 29932) |
| OH | Germantown | 29932 | the Finder's directory lists it as code 29932; the engine entry has no municode |
| OH | North Hampton | 56588 | added by hand; the official rate file has no row for it yet (the Finder's directory lists it as code 56588) |
| OH | North Hampton | 56588 | the Finder's directory lists it as code 56588; the engine entry has no municode |
| OH | Stockport | 74748 | added by hand; the official rate file has no row for it yet (the Finder's directory lists it as code 74748) |
| OH | Stockport | 74748 | the Finder's directory lists it as code 74748; the engine entry has no municode |
| OH | Woodville | 86492 | added by hand; the official rate file has no row for it yet (the Finder's directory lists it as code 86492) |
| PA | Philadelphia City (Philadelphia) | 510101 | residentEIT official 0.0374 vs engine 0.03735; nonresidentEIT official 0.0343 vs engine 0.03425; totalResidentEIT official 0.0374 vs engine 0.03735 (the entry carries its own note or dated changes) |
| PA | Pennsylvania register 2027 |  | only 0 of 2627 rows carry a rate, so the 2027 register is not published yet; nothing to compare |

</details>

## Changed

### AL - Alabama DOR: local tax (rates and codes for cities and counties)

<https://www.revenue.alabama.gov/local-tax/>  
3 lines added, 3 removed


<details><summary>What changed</summary>

```diff
+Alabama Severe Weather Preparedness Sales Tax Holiday
+Local Cities and Counties Tax Rates Text File
+Contact Information for All Localities
-Local Cities and Counties Tax Rates Text File
-Alabama Severe Weather Preparedness Sales Tax Holiday
-Contact Information for All Localities
```
</details>

### AL - Alabama Department of Labor -- 2026 UI wage base and rate figures (cross-source)

<https://www2.labor.alabama.gov/>  
2 lines added, 0 removed
  
Used by: `data/states/AL-2026.json`, `data/states/AL-2027.json`


<details><summary>What changed</summary>

```diff
+Reference Maps
+Maps as used by the different BLS programs within Alabama Department of Workforce.
```
</details>

### AL - Alabama Department of Revenue -- NOTICE: Overtime Exemption Ends June 30, 2025

<https://www.revenue.alabama.gov/notice-overtime-exemption-ends-june-30-2025/>  
0 lines added, 1 removed; 0 links added, 1 removed
  
Used by: `data/states/AL-2025.json`, `data/states/AL-2026.json`, `data/states/AL-2027.json`

- Removed link: [Download a pdf of this notice](https://www.revenue.alabama.gov/wp-content/uploads/2025/06/250529_NOTICE_IT_OvertimeExemptionSunset.pdf)

<details><summary>What changed</summary>

```diff
-Download a pdf of this notice.
```
</details>

### AZ - Arizona DOR: news

<https://azdor.gov/news>  
4 lines added, 4 removed; 2 links added, 2 removed

- New link: [Simple Steps to Renew 2027 TPT Licenses](https://azdor.gov/news-center/simple-steps-renew-2027-tpt-licenses)
- New link: [Last » Last page](https://azdor.gov/news?page=132)
- Removed link: [TPT Filer - Please Submit Your Return - October 2026](https://azdor.gov/news-center/tpt-filer-please-submit-your-return-october-2026)
- Removed link: [Last » Last page](https://azdor.gov/news?page=131)

<details><summary>What changed</summary>

```diff
-TPT Filer - Please Submit Your Return - October 2026
-October 20, 2026
-Taxpayers can file now and schedule payments up until the deadline.
-The Arizona Department of Revenue (ADOR) reminds transaction privilege tax (TPT) filers that monthly and quarterly returns are
+Simple Steps to Renew 2027 TPT Licenses
+October 27, 2026
+Renew by January 1 to avoid penalties
+Phoenix, AZ-Businesses have until January 1 to renew their Transaction Privilege Tax (TPT) accounts, with late penalties assessed on any renewals filed after
```
</details>

### AZ - City of Tucson -- Tucson Minimum Wage Act (Proposition 206, November 2021)

<https://www.tucsonaz.gov/Departments/Business-Services-Department/Tucson-Minimum-Wage-Act>  
read with a headless browser; 9 lines added, 7 removed; 2 links added, 2 removed
  
Used by: `data/minimum-wage/local/AZ-local-2026.json`, `data/minimum-wage/local/AZ-local-2027.json`

- Figures now present: $16.00, $16.00
- Figures no longer present: none
- New link: [Minimum Wage English 2027(PDF, 3MB)](https://www.tucsonaz.gov/files/sharedassets/public/v/1/bsd/documents/minimum-wage-materials/2027_cot_minimum_wage_ltr-poster-eng.pdf)
- New link: [Minimum Wage Spanish 2027(PDF, 3MB)](https://www.tucsonaz.gov/files/sharedassets/public/v/1/bsd/documents/minimum-wage-materials/2027_cot_minimum_wage_ltr-poster-span.pdf)
- Removed link: [Minimum Wage English 2026(PDF, 2MB)](https://www.tucsonaz.gov/files/sharedassets/public/v/1/bsd/documents/minimum-wage-materials/cot_minimum_wage_eng_2026.pdf)
- Removed link: [Minimum Wage Spanish 2026(PDF, 3MB)](https://www.tucsonaz.gov/files/sharedassets/public/v/1/bsd/documents/minimum-wage-materials/cot_minimum_wage_span_2026.pdf)

<details><summary>What changed</summary>

```diff
-At the November 2021 General Election, Tucson voters approved Proposition 206, "The Tucson Minimum Wage Act". The act established a local minimum hourly wage of $13, beginning on April 1, 2022, which then increased to $15.00 an hour by ...
+At the November 2021 General Election, Tucson voters approved Proposition 206, "The Tucson Minimum Wage Act". The act established a local minimum hourly wage of $13, beginning on April 1, 2022, which then increased to $15.00 an hour by ...
-The Tucson's Minimum Wage Act applies to full-time, part-time, or temporary employees who perform at least 5 hours of work per pay cycle within the City of Tucson's boundaries. The Act does not apply to employees of the State of Arizona...
+The City of Tucson minimum wage will increase to $16.00 per hour, effective from January 1, 2027 through December 31, 2027. The rate set for 2027 in the Tucson Minimum Wage Act is higher than both the state and federal minimum wage rates.
+The City of Tucson's Minimum Wage Act applies to full-time, part-time, or temporary employees who perform at least 5 hours of work per pay cycle within the City of Tucson's boundaries. The Act does not apply to employees of the State of...
+$16.00 effective January 1, 2027 - The rate set for 2027 according to the terms of the Tucson Minimum Wage Act is higher than both the state and federal minimum wage rates.
-Online employer video training sessions will are posted at the City of Tucson YouTube Channel and available via these links:
+Online employer video training sessions are posted at the City of Tucson YouTube Channel and available via these links:
-Employer Resources - (2026 posters are available below)
-Minimum Wage English 2026(PDF, 2MB)
-Minimum Wage Spanish 2026(PDF, 3MB)
+Employer Resources - (2027 posters are available below)
+Minimum Wage English 2027(PDF, 3MB)
+Minimum Wage Spanish 2027(PDF, 3MB)
-Legal Action and Penatlites:
+Legal Action and Penalties:
```
</details>

### CA - Aviso Legal (Spanish) FY25-26 (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/25-26%20Notices/2025-26__Notification_Spanish%202025-09-08.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Aviso Legal (Spanish) FY26-27 (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Spanish%202026-06-09.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - California DIR -- minimum wage set to increase to $17.40 per hour (News Release 2026-66)

<https://www.dir.ca.gov/DIRNews/2026/2026-66.html>  
4 lines added, 0 removed
  
Used by: `data/minimum-wage/states/CA-2027.json`


<details><summary>What changed</summary>

```diff
+October 30, 2026
+DWC updates inpatient hospital fee schedule for December 2026 Medicare changes
+October 28, 2026
+DWC posts revised draft regulation establishing ranges for attorney deposition rates to online forum for public comment
```
</details>

### CA - California EDD rates and withholding

<https://edd.ca.gov/en/payroll_taxes/rates_and_withholding/>  
20 lines added, 20 removed; 2 links added, 2 removed
  
Used by: `data/states/CA-2025.json`, `data/states/CA-2026.json`, `data/states/CA-2027.json`

- Figures now present: none
- Figures no longer present: $1,378.48, $153,164
- New link: [2027 Withholding Schedules - Method A – Wage Bracket Table Method (PDF)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/27metha.pdf)
- New link: [2027 Withholding Schedules - Method B – Exact Calculation Method (PDF)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/27methb.pdf)
- Removed link: [Method A – Wage Bracket Table Method (PDF)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/23metha.pdf)
- Removed link: [Method B – Exact Calculation Method (PDF)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/23methb.pdf)

<details><summary>What changed</summary>

```diff
-The UI rate schedule for 2026 is Schedule F+. This is Schedule F, plus a 15 percent emergency surcharge, rounded to the nearest tenth. Schedule F+ provides for UI contribution rates from 1.5 percent to 6.2 percent. The taxable wage limi...
-ETT Rate
-The ETT rate for 2026 is 0.1 percent. The ETT taxable wage limit is $7,000 per employee, per calendar year.
-SDI Rate
-The SDI withholding rate for 2026 is 1.3 percent. Effective January 1, 2024, all wages are subject to SDI contributions.
+The UI rate schedule for 2027 is Schedule F+. This is Schedule F, plus a 15 percent emergency surcharge, rounded to the nearest tenth. Schedule F+ provides for UI contribution rates from 1.5 percent to 6.2 percent. The taxable wage limi...
+ETT Rate
+The ETT rate for 2027 is 0.1 percent. The ETT taxable wage limit is $7,000 per employee, per calendar year.
+SDI Rate
+The SDI withholding rate for 2027 is 1.4 percent. Effective January 1, 2024, all wages are subject to SDI contributions.
-2026 Withholding Schedules - Method A - Wage Bracket Table Method (PDF) - Includes instructions for:
+2027 Withholding Schedules - Method A - Wage Bracket Table Method (PDF) - Includes instructions for:
-2026 Withholding Schedules - Method B - Exact Calculation Method (PDF) - Includes instructions for:
+2027 Withholding Schedules - Method B - Exact Calculation Method (PDF) - Includes instructions for:
+2026
+Tax rates and taxable wage limits for the last several years are listed on Tax Rates, Wage Limits, and Value of Meals and Lodging (DE 3395) (PDF).
+UI Rate
+The UI rate schedule for 2026 is Schedule F+. This is Schedule F, plus a 15 percent emergency surcharge, rounded to the nearest tenth. Schedule F+ provides for UI contribution rates from 1.5 percent to 6.2 percent. The taxable wage limi...
+Exception: Employers subject to section 977(c) of the CUIC must pay at the highest rate provided by law plus an additional 2 percent, see SUTA Dumping (AB 664).
+The taxable wage limit is $7,000 per employee. For more information about how your UI rate is determined, refer to Information Sheet: California System of Experience Rating (DE 231Z) (PDF).
+ETT Rate
+The ETT rate for 2026 is 0.1 percent. The ETT taxable wage limit is $7,000 per employee, per calendar year.
+SDI Rate
+The SDI withholding rate for 2026 is 1.3 percent. Effective January 1, 2024, Senate Bill 951 removes the taxable wage limit and maximum withholdings for each employee subject to SDI contributions.
-2023
-Tax rates and taxable wage limits for the last several years are listed on Tax Rates, Wage Limits, and Value of Meals and Lodging (DE 3395) (PDF).
-UI Rate
-The UI rate schedule for 2023 is Schedule F+. This is Schedule F, plus a 15 percent emergency surcharge, rounded to the nearest tenth. Schedule F+ provides for UI contribution rates from 1.5 percent to 6.2 percent. The taxable wage limi...
-Exception: Employers subject to section 977(c) of the CUIC must pay at the highest rate provided by law plus an additional 2 percent, see SUTA Dumping (AB 664).
-The taxable wage limit is $7,000 per employee. For more information about how your UI rate is determined, refer to Information Sheet: California System of Experience Rating (DE 231Z) (PDF).
-ETT Rate
-The ETT rate for 2023 is 0.1 percent. The ETT taxable wage limit is $7,000 per employee, per calendar year.
-SDI Rate
-The SDI withholding rate for 2023 is 0.9 percent. The taxable wage limit is $153,164 for each employee per calendar year. The maximum to withhold for each employee is $1,378.48.
-2025
+2026
-2024
+2025
-2023
+2024
```
</details>

### CA - Enforcement Guide (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/Media/Minimum_Wage/MinimumWage_Enforcement-Businesses.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Hotel Wage Fact Sheet (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/Media/Minimum_Wage/SantaMonicaWageLaw-Hotels.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Impressum [German] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_German.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Legal Notice FY25-26 (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/25-26%20Notices/2025-26__Notification_English%202025-09-08.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Legal Notice FY26-27 (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_English%202026-06-09.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Legal na Paunawa [Tagalog] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Tagalog.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Paid Sick Leave Checklist (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/Media/Minimum_Wage/PaidSickLeave-ChecklistforBusinesses.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Paid Sick Leave Tips (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/Media/Minimum_Wage/PaidSickLeaveTips-Employees.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Paid Sick Leave: Must do/ Should do (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/Media/Minimum_Wage/MinimumWagePostcard_MustShouldDo.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Thông báo pháp lý [Vietnamese] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Vietnamese.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Официальное уведомление [Russian] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Russian.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - Իրավական ծանուցում [Armenian] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Armenian.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - คำบอกกล่าวทางกฎหมาย [Thai] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Thai.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - 法律声明 [Simplified Chinese] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Simplified_Chinese.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - 法律聲明 [Traditional Chinese] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Traditional_Chinese.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CA - 법적 고지 [Korean] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Korean.pdf>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`, `data/minimum-wage/sectoral/CA-sectoral-2027.json`


<details><summary>What changed</summary>

```diff
-A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running. Additional information is available in this support article.
+A third-party browser plugin, such as Ghostery or NoScript, is preventing JavaScript from running.
```
</details>

### CO - Boulder County -- Local Minimum Wage

<https://bouldercounty.gov/departments/commissioners/local-minimum-wage/>  
1 lines added, 0 removed
  
Used by: `data/minimum-wage/local/CO-local-2026.json`, `data/minimum-wage/local/CO-local-2027.json`


<details><summary>What changed</summary>

```diff
+Boulder County government offices, except the Elections Division, closed Nov. 3 for Election Day.
```
</details>

### CO - Commissioners’ Agenda (linked from Boulder County -- Local Minimum Wage)

<https://assets.bouldercounty.gov/wp-content/uploads/2017/08/bocc-advance-agenda.pdf>  
80 lines added, 46 removed
  
Used by: `data/minimum-wage/local/CO-local-2026.json`, `data/minimum-wage/local/CO-local-2027.json`


<details><summary>What changed</summary>

```diff
-October 26 - November 6, 2026
+November 2 - 13, 2026
-Monday, October 26
-Commissioners meet with University of Colorado Boulder staff
+Monday, November 2
-Commissioners attend Boards and Commissions New Member Orientation
-Administrative Meeting
-Tuesday, October 27
-Business Meeting and Public Hearing of the Boulder County Housing Authority
-Item No. 1: Business Meeting
-Location - Hybrid: Hearing Room and Zoom Webinar
-More information on virtual business meetings can be found in the Open Meeting Portal
-agenda packet.
-Item No. 2: Public Hearing of the Boulder County Housing Authority
-Staff Contact: Susana Lopez-Baker
-Location - Hybrid: Hearing Room and Zoom Webinar
-Boulder County Housing Authority: General update to the Board of County
-Commissioners.
-Action Requested: Public testimony taken; no action requested.
-Virtual Attendee Link for Commissioners' October 27 Morning Session
-Call-in information: 1-833-568-8864, Webinar ID: 165 674 5785
-Registration Required
-In-Person Comment Registration for Commissioners' October 27 Morning Session
-Executive Session
-Administrative Meeting
-Administrative Meeting
-Emergency Services Grant Program Advisory Committee Meeting
-Staff Contact: Barb Halpin
-Location - Boulder County Historic Courthouse, Dickey Lee Hullinghorst Room, 3rd Floor,
-1325 Pearl St., Boulder
-The Emergency Services Grant Program Advisory Committee (ESGPAC) will meet to review
-Fall 2026 Fire Protection District grant applications. Members of the public are invited to attend
-and observe all ESGPAC meetings.
-Note: There is no virtual option for this meeting.
-Wednesday, October 28
-Commissioners meet with the Cultural Responsiveness and Inclusion Advisory Committee
-(CRIAC)
-Administrative Meeting
-Administrative Meeting
-Executive Session
... 86 more changed lines
```
</details>

### IA - Iowa Department of Revenue: press releases

<https://revenue.iowa.gov/press-releases>  
3 lines added, 2 removed; 1 links added, 0 removed

- New link: [Federal Education Freedom Tax Credit](https://revenue.iowa.gov/resources/federal-education-freedom-tax-credit)

<details><summary>What changed</summary>

```diff
+Federal Education Freedom Tax Credit
+Research & Statistics
-Research & Statistics
+Revenue Research Library
-Revenue Research Library
```
</details>

### ID - Idaho State Tax Commission: press releases

<https://tax.idaho.gov/pressrelease>  
3 lines added, 0 removed; 1 links added, 0 removed

- New link: [TAP upcoming maintenance means downtime, new TAP URL](https://tax.idaho.gov/pressrelease/tap-upcoming-maintenance-means-downtime-new-tap-url/)

<details><summary>What changed</summary>

```diff
+TAP upcoming maintenance means downtime, new TAP URL
+October 30, 2026
+We're taking TAP (Taxpayer Access Point) down for maintenance starting on Friday, Nov. 6 at 5 p.m. Mountain Time. TAP will be back online by Sunday, Nov. 8 at 5 p.m. Mountain Time.The maintenance is to update our systems and add a new, ...
```
</details>

### IN - Indiana DOR withholding

<https://www.in.gov/dor/i-am-a/business-corp/withholding/>  
47 lines added, 51 removed; 15 links added, 22 removed

- Figures now present: none
- Figures no longer present: $10, $5, 20%
- New link: [electronic methods and options for filing Withholding](https://www.in.gov/dor/files//dor-efile-methods-bulk.pdf)
- New link: [DOR Withholding Schema: IDORWTH2016V1.0](https://www.in.gov/dor/files/IDORWTH2016V1.0)
- New link: [IRIS XML Guide](https://www.in.gov/dor/files/IRIS-2026-Tax-Year-Guide.pdf)
- New link: [1220 Flat File Business Rules for Indiana](https://www.in.gov/dor/files/business-rules-1220-flat-file.pdf)
- New link: [EFW2 Flat File Business Rules for Indiana](https://www.in.gov/dor/files/business-rules-efw2-flat-file.pdf)
- New link: [DOR WH-1 XML Business Rules](https://www.in.gov/dor/files/business-rules-wh1-xml.pdf)
- New link: [DOR WH-3 XML Business Rules](https://www.in.gov/dor/files/business-rules-wh3-xml.pdf)
- New link: [Departmental Notice #1,](https://www.in.gov/dor/files/dn01.pdf)
- New link: [This chart](https://www.in.gov/dor/files/dor-efile-methods-bulk.pdf)
- New link: [1220 Specifications/Deviations for Indiana](https://www.in.gov/dor/files/guide-1220-w-2g-1099.pdf)
- New link: [EFW2 Specifications/Deviations for Indiana](https://www.in.gov/dor/files/guide-efw2-w2-wh3.pdf)
- New link: [INTIME: If a file size is under 10 MB, manually enter or upload via INTIME.](https://www.in.gov/dor/files/guide-withholding-intime.pdf)
- New link: [SFTP: If a file size exceeds 10 MB, register for and use SFTP bulk filing.](https://www.in.gov/dor/files/guide-withholding-sftp.pdf)
- New link: [Income Tax to Residents With Out-of-State Income (Reciprocal Agreement States)](https://www.in.gov/dor/files/ib28.pdf)
- New link: [Withholding Information for Part-Time Employees](https://www.in.gov/dor/files/ib52.pdf)
- Removed link: [Indiana Secretary of State](http://www.in.gov/sos/)
- Removed link: [1220 Specifications/Deviations for Indiana (includes W-2Gs and 1099)](https://www.in.gov/dA/06b8f7f762/guide-1220-w-2g-1099.pdf?language_id=1)
- Removed link: [Guide to Filing Withholding via SFTP Bulk Upload](https://www.in.gov/dA/0a9a6c9175/guide-withholding-sftp.pdf?language_id=1)
- Removed link: [INTIME Guide to Withholding Taxes](https://www.in.gov/dA/5bba4274a2/guide-withholding-intime.pdf?language_id=1)
- Removed link: [WH-3 XML Business Rules](https://www.in.gov/dA/734e099191/business-rules-wh3-xml.pdf?language_id=1)
- Removed link: [EFW2 Flat File Business Rules](https://www.in.gov/dA/7ad2e03d76/business-rules-efw2-flat-file.pdf?language_id=1)
- Removed link: [electronic methods and options for filing Withholding](https://www.in.gov/dA/8abea3ed05/dor-efile-methods-bulk.pdf?language_id=1)
- Removed link: [Withholding Schema: IDORWTH2016V1.0](https://www.in.gov/dA/90b32bce8e/IDORWTH2016V1.0.zip?language_id=1)
- Removed link: [Departmental Notice #1](https://www.in.gov/dA/92797e5a5f/dn01.pdf?language_id=1)
- Removed link: [EFW2 Specifications/Deviations for Indiana (includes W-2 and WH-3)](https://www.in.gov/dA/982ff2641c/guide-efw2-w2-wh3.pdf?language_id=1)
- Removed link: [INTIME for Business Customers](https://www.in.gov/dA/a3107df03b/intime-business-guide.pdf?language_id=1)
- Removed link: [Change Log](https://www.in.gov/dA/bbb0b69ed4/2016WTH_change_log.pdf?language_id=1)
- Removed link: [1220 Flat File Business Rules](https://www.in.gov/dA/be2052e7c3/business-rules-1220-flat-file.pdf?language_id=1)
- Removed link: [Income Tax to Residents With Out-of-State Income (Reciprocal Agreement States)](https://www.in.gov/dA/ca58e65593/ib28.pdf?language_id=1)
- Removed link: [WH-1 XML Business Rules](https://www.in.gov/dA/d2a2c3ce66/business-rules-wh1-xml.pdf?language_id=1)

<details><summary>What changed</summary>

```diff
-If you previously registered to file withholding tax, you must still file Forms WH-1 and WH-3 for each period even if no tax is due or to report no employees for that time period. Late filed returns are subject to a penalty of up to 20%...
-As of 2023, if you file a paper version of Form WH-3, you must also complete the new Schedule IN-WH3. Schedule IN-WH3 will also be required for prior year returns.
-To register for withholding in Indiana, the business must have an Employer Identification Number (EIN) from the federal government. In addition, the employer should review Departmental Notice #1 which details the withholding rates for e...
-What is a WH-3
-The WH-3 (Annual Withholding Reconciliation Form) is a reconciliation form for the amount of state and county income taxes withheld throughout the year. All employers must file the WH-3 by Jan. 31 each year. If you previously registered...
+To register for withholding in Indiana, the business must have an Employer Identification Number (EIN) from the federal government. In addition, the employer should review Departmental Notice #1, which details the withholding rates for ...
+Forms WH-1 and WH-3
+Form WH-1
+Form WH-3
+What is it?
+Periodic withholding tax return
+Annual withholding reconciliation
+Purpose
+Report & remit tax withheld each period
+Match yearly WH-1 totals to wage statements
+Filing Schedule
+Monthly, early-monthly, or annual
+Annually (due January 31)
+Where to File
+INTIME or SFTP
+INTIME or SFTP
+Late Penalty
+Up to 20% of tax owed (min $5)
+$10 per wage statement
+If you previously registered to file withholding tax, you must still file Forms WH-1 and WH-3 for each period even if no tax is due or no employees are reportable for that time period.
-Any business who files more than 25 W-2, W-2G, or 1099-R statements must file them electronically (per Indiana Code 6-3-4-16.5).
-A list of electronic methods and options for filing Withholding is available.
-Bulk upload files are created offline and then submitted to DOR for processing. The files are processed sequentially within a couple of hours. During high-volume processing, the delay can be longer. When the process is complete, an ackn...
-Customers can electronically submit withholding files with DOR via one of the following options:
-The Indiana Taxpayer Information Management Engine (INTIME), DOR's e-services portal at intime.dor.in.gov, enables customers to manage tax obligations in one convenient location, 24/7.
-Withholding tax obligations can be submitted and paid directly through INTIME. Also, when filing securely via INTIME, bulk files do not require a file naming convention or encryption.
-In order to use INTIME to manage Withholding taxes, customers must create a logon using an Indiana taxpayer identification number (TID) and a Letter ID (located at the top right corner of any letter) provided by DOR. If you do not have ...
-For more information on filing and paying Withholding tax obligations via INTIME, the following guides are available:
-INTIME for Business Customers
-INTIME Guide to Withholding Taxes
-FAQs for bulk filing Withholding
-Register for and use SFTP bulk filing. A file must be rejected by INTIME for exceeding the 10 MB size restriction before it is eligible for submission via SFTP (Secure File Transfer Protocol). Registration for SFTP is then required. Whe...
-For more information on filing and paying Withholding tax obligations via SFTP, the following guides are available:
-SFTP Bulk Upload Guide
-Guide to Filing Withholding via SFTP Bulk Upload
... 58 more changed lines
```
</details>

### IN - Indiana DOR: news and publications

<https://www.in.gov/dor/about/news-publications/>  
0 lines added, 1 removed; 0 links added, 1 removed

- Removed link: [Tax Advisory Council](https://www.in.gov/dor/about/news-publications/our-team/advisory-council)

<details><summary>What changed</summary>

```diff
-Tax Advisory Council
```
</details>

### MA - Massachusetts Department of Revenue: home (news and notices)

<https://www.mass.gov/orgs/massachusetts-department-of-revenue>  
read with a headless browser; 2 lines added, 2 removed; 1 links added, 1 removed

- New link: [DRAFT 2026 Tax Forms We provide draft forms and schedules to our vendor partners and tax professionals.](https://www.mass.gov/info-details/draft-2026-tax-forms-and-schedules)
- Removed link: [DRAFT 2026 Income Forms DRAFT 2026 personal income tax forms are now available.](https://www.mass.gov/lists/draft-2026-personal-income-tax-forms-and-instructions)

<details><summary>What changed</summary>

```diff
-DRAFT 2026 Income Forms
-DRAFT 2026 personal income tax forms are now available.
+DRAFT 2026 Tax Forms
+We provide draft forms and schedules to our vendor partners and tax professionals.
```
</details>

### ME - Maine Revenue Services: home (announcements)

<https://www.maine.gov/revenue/>  
1 lines added, 1 removed


<details><summary>What changed</summary>

```diff
-Maine Tax Alert - October 2026 - #2 (PDF)
+Maine Tax Alert - October 2026 - #3 (PDF)
```
</details>

### MI - Michigan Treasury: taxes home (notices and withholding news)

<https://www.michigan.gov/taxes>  
2 lines added, 1 removed; 1 links added, 0 removed

- New link: [Disclosure Requests](https://www.michigan.gov/taxes/disclosure)

<details><summary>What changed</summary>

```diff
-City Tax
+City Taxes
+Disclosure Requests
```
</details>

### MN - City of Saint Paul -- Minimum Wage Increases for Small and Micro Businesses (effective July 1, 2026)

<https://www.stpaul.gov/news/city-saint-paul-minimum-wage-increases-small-and-micro-businesses>  
12 lines added, 12 removed
  
Used by: `data/minimum-wage/local/MN-local-2026.json`, `data/minimum-wage/local/MN-local-2027.json`

- Figures now present: $300,000
- Figures no longer present: none

<details><summary>What changed</summary>

```diff
-Saint Paul City Council Votes 6-0 to Advance Coordinated Encampment Resolution Plan Resolution establishes 60-day services-first approach, temporary winter shelter, and pathway to permanent low-barrier shelter
-City Council
-Saint Paul City Council today voted 6-0 to approve Resolution 26-1765 supporting a coordinated response to unsheltered homelessness that centers services before encampment closures.
+Happy Halloween from Saint Paul Parks and Recreation!
+Parks & Recreation
+Each year, Saint Paul Parks and Recreation staff celebrate Halloween by dressing up as our favorite characters from the TV show "Parks and Recreation". From all of us at Saint Paul Parks and Recreation, we wish you a safe and happy Hall...
-Saint Paul To Test Snow Emergency Text Alerts on October 21
-Public Works
-Early text messaging alerts reminds residents to get ready for winter
+Mayor Kaohly Her Nominates Assistant Chief Jeramiah Melquist to Serve as Saint Paul Fire Chief
+Mayor's Office
+Veteran firefighter brings more than 26 years of department experience; City Council vote expected in the coming weeks
-CORRECTION: Clarification on Wednesday Press Conference on Encampment Resolution
-City Council
-Wednesday's press conference on encampment resolution is a Ward 5 event, not a full Saint Paul City Council event.
+Saint Paul Fire Department Announces Historic ISO Class 1 Rating
+Fire & Safety
+Saint Paul becomes the only fire department in Minnesota currently holding a class 1 rating.
-Saint Paul invites community to explore future of Mississippi River Learning Center at Bdóte on October 24
-Parks & Recreation
-Free Fall Play Day will showcase final design concepts and plans for the project's first phase, alongside family-friendly activities celebrating the Mississippi River on Saturday, October 24, 1-at the future home of the Mississippi Rive...
+Saint Paul Commits $300,000 to Keep Evie Carshare Alive
+Mayor's Office
+Mayor Kaohly Her is leading a regional push to preserve a transportation option that served thousands of residents before the service shut down.
```
</details>

### MN - Minn. Stat. § 268B.14 (Premium rates)

<https://www.revisor.mn.gov/statutes/cite/268B.14>  
5 lines added, 8 removed
  
Used by: `data/states/MN-2026.json`, `data/states/MN-2027.json`


<details><summary>What changed</summary>

```diff
-2025 Minnesota Statutes
+2026 Minnesota Statutes
-2025 Minnesota Statutes
+2026 Minnesota Statutes
-2025 Statutes New, Amended or Repealed
-2025 Table of Chapters
-2025 Statutes Topics (Index)
+2026 Statutes New, Amended or Repealed
+2026 Table of Chapters
+2026 Statutes Topics (Index)
-[See Note.]
-NOTE: This section, as added by Laws 2023, chapter 59, article 1, section 23, is effective January 1, 2026. Laws 2023, chapter 59, article 1, section 23, the effective date.
-NOTE: The amendment to subdivision 3 by Laws 2024, chapter 127, article 73, section 38, is effective January 1, 2026. Laws 2024, chapter 127, article 73, section 38, the effective date.
```
</details>

### MO - Missouri unemployment insurance 2026 rate/wage-base reporting (Bloomberg Tax, Vensure, MO DOLIR's own labor.mo.gov/des/employers/tax-rates page referenced)

<https://labor.mo.gov/des/employers/tax-rates>  
164 lines added, 56 removed
  
Used by: `data/states/MO-2026.json`, `data/states/MO-2027.json`

- Figures now present: $8,500, 0.6%
- Figures no longer present: $11,000, 6%

<details><summary>What changed</summary>

```diff
-All employers, except those making reimbursable payments, have an assigned tax rate. An employer's rate may change each year. The Division of Employment Security (DES) calculates the tax rates for all employers.
-For its first two or three years, an employer receives the new employer rate. This is a rate assigned to all new employers of the same industrial classification. Once an employer becomes eligible for an experience rate, a rate is calcul...
+All employers, except those making reimbursable payments, have an assigned
+tax rate. An employer's rate may change each year. The Division of Employment Security (DES) calculates the tax
+rates for all employers.
+For its first two or three years, an employer receives the new employer rate.
+This is a rate assigned to all new employers of the same industrial classification. Once an employer becomes
+eligible for an experience rate, a rate is calculated based on the ratio of an
+employer's average annual taxable payroll, unemployment claims against its account, and taxes previously paid by the
+employer. Scroll down for a general explanation of tax rates, or choose a topic for additional or more detailed
+information.
-Each employer that becomes liable to report workers' wages and pay unemployment taxes is assigned to an industrial classification division. Until eligible for an experience rate, regular employers (not including governmental entities an...
-New Employer Rates - 2022 through 2026
+Each employer that becomes liable to report workers' wages and pay unemployment taxes is assigned to an industrial
+classification division. Until eligible for an experience rate, regular employers
+(not including governmental entities and certain nonprofit organizations) are assigned an annual tax rate that is
+the average tax rate computed during the preceding year of all employers within the industrial classification
+division to which the employer is assigned (prior to CRA), or 2.7 percent, whichever is the
+highest.
+New Employer Rates - 2023 through 2027
+2027
+2.376
+2.376
+1.00
+2.376
-2022
-2.376
-2.376
-1.00
-2.376
-Based on the average cash balance of the Unemployment Trust Fund, there may be an increase or decrease to these annual rates (see Contribution Rate Adjustment).
-Nonprofit organizations described under Section 501(c)(3) of the Internal Revenue Code and governmental entities are assigned an annual tax rate of 1.0 percent until eligible for an experience rate. These organizations also have the opt...
-Employers participating in the Shared Work Program would be assigned a rate of 9.0 percent plus any applicable maximum rate surcharge and contribution rate adjustment, if applicable, until eligible for an experience rate.
+Based on the average cash balance of the Unemployment Trust Fund, there may be an increase or decrease to these
+annual rates (see Contribution Rate Adjustment).
+Nonprofit organizations described under Section 501(c)(3) of the Internal Revenue Code and governmental entities are
+assigned an annual tax rate of 1.0 percent until eligible for an experience rate. These organizations also have the
+option of making reimbursable payments.
+Employers participating in the Shared Work Program would be assigned a rate of 9.0 percent plus any applicable maximum rate surcharge and contribution rate adjustment, if applicable, until eligible for an experience
+rate.
... 180 more changed lines
```
</details>

### MO - St. Louis: earnings tax department

<https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/index.cfm>  
1 lines added, 1 removed; 1 links added, 1 removed

- New link: [Zip Code Directory](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/documents/zip-code-booklet.cfm)
- Removed link: [W-10/P-10 Forms (Fillable)](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/documents/p-10-w-10-form-fillable.cfm)

<details><summary>What changed</summary>

```diff
+Zip Code Directory
-W-10/P-10 Forms (Fillable)
```
</details>

### NC - NC Division of Employment Security -- Tax Rate Information

<https://www.des.nc.gov/employers/tax-rate-information>  
0 lines added, 13 removed
  
Used by: `data/states/NC-2026.json`, `data/states/NC-2027.json`

- Figures now present: none
- Figures no longer present: 20%, 20%, 20%

<details><summary>What changed</summary>

```diff
-When do I receive my tax rate assignment?
-How can I find my tax rate information?
-How can I download and view my Tax Rate Notice?
-Are tax rates assigned to all employers equally?
-How do I protest my assigned tax rate?
-How do I reduce my employer tax rate?
-How do I make a voluntary contribution?
-Will DES send another Unemployment Tax Rate Assignment (Form NCUI 104) if I make a timely voluntary contribution?
-Can the tax rate increase with no benefit charges?
-When is a 20% surtax for the Unemployment Insurance Trust Fund imposed?
-Is the 20% surtax FUTA certified?
-Does the 20% surtax affect all employers?
-How do I verify my account numbers?
```
</details>

### NC - NCDOR -- Withholding Tax Frequently Asked Questions

<https://www.ncdor.gov/withholding-tax-frequently-asked-questions>  
0 lines added, 41 removed
  
Used by: `data/states/NC-2026.json`, `data/states/NC-2027.json`


<details><summary>What changed</summary>

```diff
-Withholding Categories
-Registration
-File and Pay
-Employer Requirements
-Penalties and Assessments
-Employee Requirements
-Employee Withholding Allowance Certificates
-Withholding for Personal Services Performed in NC by Nonresidents
-Exceptions to Withholding
-Contract Between Venue and Entertainer
-Contract Between Venue and Promoter (Agent)
-Withholding from ITIN Contractors
-Withholding from Vendors Who Provide Service but Fail to Provide their Taxpayer Identification Number
-Military Spouses
-Lottery and Sports Wagering Winnings
-Miscellaneous
-Refunds
-File & Pay
-Taxes & Forms
-Individual Income Tax
-Sales and Use Tax
-Corporate Income & Franchise Tax
-Motor Carrier Tax (IFTA/IN)
-Privilege License Tax
-Motor Fuels Tax
-Alcoholic Beverages Tax
-Tobacco Products Tax
-Partnership Tax
-Property Tax
-Business Registration
-Information for Tax Professionals
-Policies
-Order Tax Forms and Instructions
-Other Taxes And Fees
-Frequently Asked Questions About Traditional and Web Fill-In Forms
-Business & Income Tax Seminars
-Power of Attorney
-Received a Notice
-News
-About Us
... 1 more changed lines
```
</details>

### NJ - NJ Division of Employer Accounts -- Rate information, contributions, and due dates

<https://www.nj.gov/labor/ea/employer-services/rate-info/>  
18 lines added, 17 removed
  
Used by: `data/states/NJ-2025.json`, `data/states/NJ-2026.json`, `data/states/NJ-2027.json`

- Figures now present: 0.0024, 0.0024, 0.0024, 0.0024
- Figures no longer present: 0.0000, 0.0000, 0.0000, 0.0000

<details><summary>What changed</summary>

```diff
+Here's the cleaned-up HTML with all table cells consistently centered both horizontally and vertically: ```html
-0.0000
-0.0000
-2027 rates will be available later this year.
-Worker - Governmental Reimbursable Employer
-U.I.
-D.I.
-W.F./S.W.F.
-F.L.I
-0.0000
-0.0000
-2027 rates will be available later this year.
-U.I. - Unemployment Insurance
-D.I. - Disability Insurance
-W.F./S.W.F. - Workforce Development/Supplemental Workforce Funds
-F.L.I -Family Leave Insurance
+0.0024
+0.0024
+January 1, 2027 to December 31, 2027
+Worker - Governmental Reimbursable Employer
+U.I.
+D.I.
+W.F./S.W.F.
+F.L.I
+0.0024
+0.0024
+January 1, 2027 to December 31, 2027
+U.I. - Unemployment Insurance
+D.I. - Disability Insurance
+W.F./S.W.F. - Workforce Development/Supplemental Workforce Funds
+F.L.I - Family Leave Insurance
-2027 Alternative earnings test amount for UI and TDI : $16,000
+2027 Alternative earnings test amount for UI and TDI: $16,000
-2027 Taxable Wage Base (TDI , FLI - workers only): $177,100
+2027 Taxable Wage Base (TDI, FLI - workers only): $177,100
```
</details>

### NJ - New Jersey Division of Taxation: what's new

<https://www.nj.gov/treasury/taxation/whatsnew.shtml>  
5 lines added, 0 removed


<details><summary>What changed</summary>

```diff
+Property Tax Relief Application Filing Event
+Monday, November 2, 2026
+to p.m.
+The event will take place at the NJ Division of Taxation, 3 John Fitch Way, 1st Floor, Trenton, NJ 08611. Division representatives will be available to assist individuals with filing their Property Tax Relief Applications (PAS-1 and ANC...
+Additionally, the Galloway, Freehold, Fair Lawn, and Cranford locations will remain open until on Monday, November 2, 2026, to provide filing assistance.
```
</details>

### NJ - New Jersey employer payroll tax

<https://www.nj.gov/treasury/taxation/businesses/payroll/index.shtml>  
5 lines added, 0 removed


<details><summary>What changed</summary>

```diff
+Property Tax Relief Application Filing Event
+Monday, November 2, 2026
+to p.m.
+The event will take place at the NJ Division of Taxation, 3 John Fitch Way, 1st Floor, Trenton, NJ 08611. Division representatives will be available to assist individuals with filing their Property Tax Relief Applications (PAS-1 and ANC...
+Additionally, the Galloway, Freehold, Fair Lawn, and Cranford locations will remain open until on Monday, November 2, 2026, to provide filing assistance.
```
</details>

### NM - New Mexico Taxation and Revenue: news

<https://www.tax.newmexico.gov/news/>  
1 lines added, 0 removed; 1 links added, 0 removed

- New link: [Tax Department grants additional extensions for flood-harmed businesses](https://www.tax.newmexico.gov/wp-content/uploads/2026/10/20261027_Tax-Department-grants-additional-extensions-for-flood-harmed-businesses.pdf)

<details><summary>What changed</summary>

```diff
+Tax Department grants additional extensions for flood-harmed businesses
```
</details>

### OH - https://www.ritaohio.com/municipalities

<https://www.ritaohio.com/municipalities>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`, `data/local/OH-municipalities-2026.json`, `data/local/OH-municipalities-2027.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA (Regional Income Tax Agency): news and updates (municipal rate and law changes)

<https://www.ritaohio.com/Resources/News>  
0 lines added, 1 removed


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA -- Tax Rates Table, 2025 new municipalities and tax rate changes

<https://www.ritaohio.com/TaxRatesTable>  
0 lines added, 1 removed
  
Used by: `data/local/OH-jedd-jedz-2025.json`, `data/local/OH-jedd-jedz-2026.json`, `data/local/OH-jedd-jedz-2027.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page (the JEDD's administering agency) -- Recent Tax and Credit History

<https://www.ritaohio.com/Municipalities/Home/MemberPage?id=047>  
0 lines added, 1 removed
  
Used by: `data/local/OH-jedd-jedz-2025.json`, `data/local/OH-jedd-jedz-2026.json`, `data/local/OH-jedd-jedz-2027.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page (the JEDD's administering agency) -- Recent Tax and Credit History

<https://www.ritaohio.com/Municipalities/Home/MemberPage?id=247>  
0 lines added, 1 removed
  
Used by: `data/local/OH-jedd-jedz-2025.json`, `data/local/OH-jedd-jedz-2026.json`, `data/local/OH-jedd-jedz-2027.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Avon (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=020>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Circleville (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=190>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- DeGraff (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=249>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Germantown (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=353>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`, `data/local/OH-municipalities-2026.json`, `data/local/OH-municipalities-2027.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Hanging Rock (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=616>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Lockbourne (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=427>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Milford JEDD VIII

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=869>  
0 lines added, 1 removed
  
Used by: `data/local/OH-jedd-jedz-2025.json`, `data/local/OH-jedd-jedz-2026.json`, `data/local/OH-jedd-jedz-2027.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Millville (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=691>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- North Canton (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=546>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- North Hampton (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=695>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`, `data/local/OH-municipalities-2026.json`, `data/local/OH-municipalities-2027.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Oak Hill (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=624>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Rio Grande (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=588>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA member page -- Stockport (rate history)

<https://www.ritaohio.com/municipalities/Home/MemberPage?id=719>  
0 lines added, 1 removed
  
Used by: `data/local/OH-municipalities-2025.json`, `data/local/OH-municipalities-2026.json`, `data/local/OH-municipalities-2027.json`


<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OH - RITA: tax professionals news

<https://www.ritaohio.com/TaxProfessionals/News>  
0 lines added, 1 removed; 0 links added, 1 removed

- Removed link: [October 29](https://www.ritaohio.com/Resources/News/ViewNews?gid=5a631cf5-960a-4dd5-a1d3-e48205f7b184)

<details><summary>What changed</summary>

```diff
-Credit Card Processor Maintenance October 29
```
</details>

### OR - Oregon Department of Revenue: news

<https://www.oregon.gov/dor/news/Pages/default.aspx>  
43 lines added, 47 removed; 15 links added, 19 removed

- Figures now present: none
- Figures no longer present: $7
- New link: [Nick Kaasa: Honoring the 2026 Ross Ryan Self Advocacy Award Recipient](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/blog-nick-kaasa-honoring-2026-ross-ryan-self-advocacy-award-recipient)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/blog-odhs-oha-remind-new-parents-about-safe-sleep-practices](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/blog-odhs-oha-remind-new-parents-about-safe-sleep-practices)
- New link: [STEP Navigators are here to help people on SNAP get training, education and employment](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/blog-step-navigators-here-to-help-people-on-snap-get-training-education-employment)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/odhs-publishes-second-semi-annual-child-welfare-report-under-wyatt-b-v-kotek](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/odhs-publishes-second-semi-annual-child-welfare-report-under-wyatt-b-v-kotek)
- New link: [Oregon Department of Human Services shares information on support for survivors in recognition of Domestic Violence Awareness Month](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/odhs-shares-info-on-support-for-survivors-in-recognition-of-domestic-violence-awareness-month)
- New link: [Seasonal jobs and SNAP benefits: What Oregonians should know before the holidays](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/seasonal-jobs-and-snap-benefits-what-oregonians-should-know-before-the-holidays)
- New link: [Oregon Judicial Department](https://apps.oregon.gov/oregon-newsroom/OR/OJD/Posts)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/OJD/Posts/Post/Oregon-judicial-department-ombudsman-launches-feedback-on-judicial-performance](https://apps.oregon.gov/oregon-newsroom/OR/OJD/Posts/Post/Oregon-judicial-department-ombudsman-launches-feedback-on-judicial-performance)
- New link: [10/27/26](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?from=10%2F27%2F2026&to=10%2F27%2F2026)
- New link: [10/28/26](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?from=10%2F28%2F2026&to=10%2F28%2F2026)
- New link: [10/29/26](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?from=10%2F29%2F2026&to=10%2F29%2F2026)
- New link: [Oct 30](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?from=10%2F30%2F2026&to=10%2F30%2F2026)
- New link: [November 2, 2026](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?from=11%2F2%2F2026&to=11%2F2%2F2026)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/SOS/Posts/Post/election-integrity-TV-PSA-launched-oregon-secretary-of-state](https://apps.oregon.gov/oregon-newsroom/OR/SOS/Posts/Post/election-integrity-TV-PSA-launched-oregon-secretary-of-state)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/SOS/Posts/Post/secretary-read-to-hold-election-day-press-conference-with-sen-wyden-attorney-general-rayfield-PSU-president-cudd](https://apps.oregon.gov/oregon-newsroom/OR/SOS/Posts/Post/secretary-read-to-hold-election-day-press-conference-with-sen-wyden-attorney-general-rayfield-PSU-president-cudd)
- Removed link: [Department of Environmental Quality](https://apps.oregon.gov/oregon-newsroom/OR/DEQ/Posts)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/DEQ/Posts/Post/deq-issues-nine-penalties-in-sept-2026](https://apps.oregon.gov/oregon-newsroom/OR/DEQ/Posts/Post/deq-issues-nine-penalties-in-sept-2026)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/GOV/Posts/Post/governor-kotek-outlines-next-steps-of-state-response-to-silver-rail-elementary-tragedy](https://apps.oregon.gov/oregon-newsroom/OR/GOV/Posts/Post/governor-kotek-outlines-next-steps-of-state-response-to-silver-rail-elementary-tragedy)
- Removed link: [SNAP-Ed closes due to federal budget cuts](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/blog-snap-ed-closes-due-to-federal-budget-cuts)
- Removed link: [Oregon program offers free help to compare plans, save on costs during Medicare Open Enrollment](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/oregon-program-offers-free-help-to-compare-plans-save-on-costs-during-medicare-open-enrollment)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/public-notice-and-request-for-comment-on-odds-medicaid-waiver-updates-10-2026](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/public-notice-and-request-for-comment-on-odds-medicaid-waiver-updates-10-2026)
- Removed link: [Oregon Dept. of Emergency Management](https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts)
- Removed link: [Oregon Department of Emergency Management Highlights Role in ECSO 911 Radio System Go Live](https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/oem-helps-launch-ecso-911-system)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/OHCS/Posts/Post/oregon-housing-and-community-services-celebrates-grand-reopening-of-233-affordable-homes-for-older-adults-in-portland](https://apps.oregon.gov/oregon-newsroom/OR/OHCS/Posts/Post/oregon-housing-and-community-services-celebrates-grand-reopening-of-233-affordable-homes-for-older-adults-in-portland)
- Removed link: [Oregon State Fire Marshal](https://apps.oregon.gov/oregon-newsroom/OR/OSFM/Posts)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/OSFM/Posts/Post/newport-fire](https://apps.oregon.gov/oregon-newsroom/OR/OSFM/Posts/Post/newport-fire)
- Removed link: [Oregon State Treasury](https://apps.oregon.gov/oregon-newsroom/OR/OST/Posts)
- Removed link: [Treasury to Return $7 Million in Unclaimed Funds Directly to Oregonians](https://apps.oregon.gov/oregon-newsroom/OR/OST/Posts/Post/Treasury-to-Return-7-Million-Directly-to-Oregonians)
- Removed link: [Housing](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?cat=Housing)
- Removed link: [10/22/26](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?from=10%2F22%2F2026&to=10%2F22%2F2026)

<details><summary>What changed</summary>

```diff
-Environment & Energy
-October 26, 2026
-DEQ issues nine enforcement actions in September for environmental violations
-And more from DEQ: Food Waste Processing Infrastructure Grant
-Department of Environmental Quality
+Courts
+November 2, 2026
+The Oregon Judicial Department's Office of the Ombudsman launches to hear court users' feedback on judicial performance
+Oregon Judicial Department
-Emergency
-Oct 25
-State fire marshal mobilizes hazmat team, firefighters to structure fire at seafood plant in Newport
-Oregon State Fire Marshal
-·
-Pr. Release
-Oct 23
-Public notice and request for comment on ODDS Medicaid waiver updates
+Oct 30
+The Oregon Department of Human Services and the Oregon Health Authority remind new parents about safe sleep practices
-Pr. Release
-Consumer Information
-·
-Treasury to Return $7 Million in Unclaimed Funds Directly to Oregonians
-Oregon State Treasury
+Article
+Social Services
+Oct 30
+ODHS publishes second semi-annual Child Welfare report under Wyatt B. v. Kotek; shares progress on Child Welfare improvement efforts
+Oregon Dept. of Human Services
-Oregon program offers free help to compare plans, save on costs during Medicare Open Enrollment
+STEP Navigators are here to help people on SNAP get training, education and employment
-Pr. Release
-911
+Article
+Social Services
-Oregon Department of Emergency Management Highlights Role in ECSO 911 Radio System Go Live
-Oregon Dept. of Emergency Management
+Nick Kaasa: Honoring the 2026 Ross Ryan Self Advocacy Award Recipient
+Oregon Dept. of Human Services
+·
... 50 more changed lines
```
</details>

### PA - NJ Division of Taxation -- Reciprocal Personal Income Tax Agreement (PA/NJ)

<https://www.nj.gov/treasury/taxation/njit25.shtml>  
5 lines added, 0 removed
  
Used by: `data/states/PA-2025.json`, `data/states/PA-2026.json`, `data/states/PA-2027.json`


<details><summary>What changed</summary>

```diff
+Property Tax Relief Application Filing Event
+Monday, November 2, 2026
+to p.m.
+The event will take place at the NJ Division of Taxation, 3 John Fitch Way, 1st Floor, Trenton, NJ 08611. Division representatives will be available to assist individuals with filing their Property Tax Relief Applications (PAS-1 and ANC...
+Additionally, the Galloway, Freehold, Fair Lawn, and Cranford locations will remain open until on Monday, November 2, 2026, to provide filing assistance.
```
</details>

### PA - Pennsylvania Department of Revenue: newsroom

<https://www.pa.gov/agencies/revenue/newsroom>  
1 lines added, 0 removed; 1 links added, 0 removed

- Figures now present: $662.3
- Figures no longer present: none
- New link: [Revenue Department Releases October 2026 Collections; Year-to-Date General Fund Collections $662.3 Million Above Estimate](https://www.pa.gov/agencies/revenue/newsroom/revenue-department-releases-october-2026-collections--year-to-date-general-fund-collections--662-3-million-above-estimate)

<details><summary>What changed</summary>

```diff
+Revenue Department Releases October 2026 Collections; Year-to-Date General Fund Collections $662.3 Million Above Estimate
```
</details>

### PA - Pennsylvania employer withholding

<https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/employer-withholding>  
1 lines added, 0 removed; 1 links added, 0 removed

- Figures now present: $662.3
- Figures no longer present: none
- New link: [Revenue Department Releases October 2026 Collections; Year-to-Date General Fund Collections $662.3 Million Above Estimate](https://www.pa.gov/agencies/revenue/newsroom/revenue-department-releases-october-2026-collections--year-to-date-general-fund-collections--662-3-million-above-estimate)

<details><summary>What changed</summary>

```diff
+Revenue Department Releases October 2026 Collections; Year-to-Date General Fund Collections $662.3 Million Above Estimate
```
</details>

### US - Federal Register -- Minimum Wage for Federal Contracts Covered by Executive Order 13658: Notice of Rate Change in Effect

<https://www.federalregister.gov/documents/2026/10/08/2026-20646/minimum-wage-for-federal-contracts-covered-by-executive-order-13658-notice-of-rate-change-in-effect>  
2 lines added, 2 removed
  
Used by: `data/minimum-wage/federal-2027.json`


<details><summary>What changed</summary>

```diff
-745
+886
-10/27/2026 at
+11/02/2026 at
```
</details>

### US - Federal Register: Railroad Retirement Board notices (RUIA/RRTA rates) - official API

<https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=railroad-retirement-board>  
10 lines added, 10 removed
  
Used by: `data/federal/2026.json`, `data/federal/2027.json`


<details><summary>What changed</summary>

```diff
-"count": 1443,
+"count": 1444,
-"next_page_url": "https://www.federalregister.gov/api/v1/documents?conditions%5Bagencies%5D%5B%5D=railroad-retirement-board&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=eff...
+"next_page_url": "https://www.federalregister.gov/api/v1/documents?conditions%5Bagencies%5D%5B%5D=railroad-retirement-board&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=eff...
+{
+"document_number": "2026-22031",
+"effective_on": null,
+"html_url": "https://www.federalregister.",
+"publication_date": "2026-10-29",
+"title": "Proposed Collection; Comment Request",
+"type": "Notice"
+},
-},
-{
-"document_number": "2025-22996",
-"effective_on": null,
-"html_url": "https://www.federalregister.",
-"publication_date": "2025-12-17",
-"title": "Proposed Collection; Comment Request",
-"type": "Notice"
```
</details>

### US - IRS draft tax forms: payroll forms only (W-4, W-4P/R, Pub 15/15-T, 940/941/944, W-2/W-3)

<https://www.irs.gov/draft-tax-forms>  
read with a headless browser; 1 lines added, 1 removed


<details><summary>What changed</summary>

```diff
-Product Number Publication 15-A
+Product Number Publication 15-A
```
</details>

### VA - Virginia withholding

<https://www.tax.virginia.gov/withholding-tax>  
1 lines added, 0 removed; 1 links added, 0 removed

- New link: [Online Service Options](https://www.tax.virginia.gov/online-service-options)

<details><summary>What changed</summary>

```diff
+Online Service Options
```
</details>

### VT - Vermont Department of Taxes: news

<https://tax.vermont.gov/news>  
3 lines added, 3 removed; 2 links added, 2 removed

- Figures now present: $57,000
- Figures no longer present: none
- New link: [Tax Commissioner Shouldice Challenges $57,000 Tax Cut Claim In this op-ed, Commissioner Bill Shouldice breaks down why he sees a popularly cited claim as inaccurate](https://tax.vermont.gov/blog/tax-commissioner-shouldice-challenges-57000-tax-cut-claim)
- New link: [Last](https://tax.vermont.gov/news?page=12)
- Removed link: [Last](https://tax.vermont.gov/news?page=11)
- Removed link: [Commentary: Don't Leave Money on the Table this Tax Season Vermont Commissioner of Taxes Bill Shouldice encourages all Vermonters to file and claim their tax credits.](https://tax.vermont.gov/press-release/commentary-dont-leave-money-table-tax-season)

<details><summary>What changed</summary>

```diff
+October 27, 2026
+Tax Commissioner Shouldice Challenges $57,000 Tax Cut Claim
+In this op-ed, Commissioner Bill Shouldice breaks down why he sees a popularly cited claim as inaccurate
-March 26, 2026
-Commentary: Don't Leave Money on the Table this Tax Season
-Vermont Commissioner of Taxes Bill Shouldice encourages all Vermonters to file and claim their tax credits.
```
</details>

### WA - City of Burien -- Minimum Wage (BMC Chapter 5.16, Administrative Rule 2026-01)

<https://www.burienwa.gov/MinimumWage>  
4 lines added, 4 removed
  
Used by: `data/minimum-wage/local/WA-local-2026.json`, `data/minimum-wage/local/WA-local-2027.json`


<details><summary>What changed</summary>

```diff
+Departments
-Departments
+Departments
-Departments
-2028 and beyond Burien large employer minimum wage hourly rate: prior year's rate + CPI
+2028 (and beyond) Burien large employer minimum wage hourly rate: prior year's rate + CPI
-2027 and beyond Burien medium employer minimum wage hourly rate: Equal to the then-current large employer rate
+2027 (and beyond) Burien medium employer minimum wage hourly rate: Equal to the then-current large employer rate
```
</details>

### WA - Washington Department of Revenue: news releases

<https://dor.wa.gov/about/news-releases>  
1 lines added, 1 removed


<details><summary>What changed</summary>

```diff
-(4)
+(3)
```
</details>

### WV - West Virginia withholding forms

<https://tax.wv.gov/business/withholding/pages/withholdingtaxforms.aspx>  
64 lines added, 0 removed; 28 links added, 0 removed

- New link: [IT-104.1](https://tax.wv.gov/Documents/PIT/it104.1.pdf)
- New link: [TSD 381](https://tax.wv.gov/Documents/TSD/tsd381.pdf)
- New link: [TSD 389](https://tax.wv.gov/Documents/TSD/tsd389.pdf)
- New link: [TSD 432](https://tax.wv.gov/Documents/TSD/tsd432.pdf)
- New link: [WV-945](https://tax.wv.gov/Documents/TaxForms/945.pdf)
- New link: [WV-945V](https://tax.wv.gov/Documents/TaxForms/945v.pdf)
- New link: [IT-101V](https://tax.wv.gov/Documents/TaxForms/it101v.pdf)
- New link: [IT-102-1](https://tax.wv.gov/Documents/TaxForms/it102-1.pdf)
- New link: [2023 IT-105](https://tax.wv.gov/Documents/Withholding/2023/it105.2023.pdf)
- New link: [IT-103 2024](https://tax.wv.gov/Documents/Withholding/2024/it103.2024.pdf)
- New link: [2024 IT-105](https://tax.wv.gov/Documents/Withholding/2024/it105.2024.pdf)
- New link: [IT-103 2025](https://tax.wv.gov/Documents/Withholding/2025/it103.2025.pdf)
- New link: [2025 IT-105](https://tax.wv.gov/Documents/Withholding/2025/it105.2025.pdf)
- New link: [WV-1096](https://tax.wv.gov/Documents/Withholding/2025/wv1096.2025.pdf)
- New link: [Residence Certification](https://tax.wv.gov/Documents/Withholding/ResidenceCertification.pdf)

<details><summary>What changed</summary>

```diff
+Questions and Answers
+Withholding Tax Webinar for New Businesses - Registration
+Employer Withholding Requirements
+Every employer making payment of any wage or salary subject to the West Virginia personal income tax is required to deduct and withhold the tax from such wages or salaries and remit the tax withheld to the Tax Division.
+Employers are required to remit the withheld tax on or before the fifteenth day of the succeeding month.
+Quarterly returns are due on or before the last day of the month following the end of the calendar quarter.
+2026 Income Tax Rate Cut
+You can view the updated Withholding Tables from the 2026 Income Tax Rate Cut on our
+2026 Income Tax Rate Cut page.
+IT-101Q (Quarterly Return) Bulk File
+IT-101Q (Quarterly Return) Bulk File will be available for periods after December 31, 2025.
+In accordance with IRS regulations, if you file for 10 or more employers you are required to file returns electronically.
+All users with third-party access will now have the ability to bulk file Form IT-101Q through
+MyTaxes.
+This option can be found under the "Bulk Submissions" tab on
+MyTaxes.
+IT-101Q Bulk Submission Instructions
+IT-101Q Bulk Filing Questions and Answers
+Employers
+The withholding tax tables have been updated for the 2026 tax year.
+IT-100.2.A Percentage Method of Withholding
+IT-100.2.B Table Method of Withholding
+IT-104 Employee's Withholding/Exemption Certificate
+IT-101A Employer's Annual Return of Income Tax Withheld.
+*Note: The IT-101A is now a combined form. No separate reconciliation is required*
+IT-101Q Employer's Quarterly Return of Income Tax Withheld - Form and Instructions
+IT-101V Employer's West Virginia Income Tax Withheld
+IT-102-1 Affidavit of West Virginia Income Tax Withheld by Employer
+IT-103 2025 Withholding Year End Reconciliation
+IT-103 2024 Withholding Year End Reconciliation for Tax Years 2024 and Prior
+IT-104.1 Low-Income Earned Income Exclusion Election Out-Of-State Withholding Instructions
+Electronic Media Specifications
+Information Returns Intake System (IRIS)
+Beginning tax year 2026/filing season 2027, the
+Information Returns Intake System (IRIS) will be the only intake system for information returns.
+West Virginia will also conform with this requirement beginning January 1, 2027.
+IT-105 Electronic Media Specifications W-2
+2026 IT-105 Electronic Media Specifications W-2 - Draft
+2025 IT-105 Electronic Media Specifications W-2
+2024 IT-105 Electronic Media Specifications W-2
... 24 more changed lines
```
</details>

## Minor changes: link lists and headlines only (10)

Recorded, but only the text of links to other pages changed (news boxes, menus).

<details><summary>Show</summary>

### AL - City of Opelika -- announcement of the occupational tax cut

<https://www.opelika-al.gov/CivicAlerts.aspx?AID=1092>  
4 lines added, 4 removed (link lists / headlines only)
  
Used by: `data/local/AL-municipalities-2025.json`, `data/local/AL-municipalities-2026.json`, `data/local/AL-municipalities-2027.json`


<details><summary>What changed</summary>

```diff
+OPELIKA NEIGHBORHOOD TRICK OR TREATING
+Home
+OPELIKA FIRE DEPARTMENT EQUIPS ALL FIREFIGHTERS WITH ADVANCED SCBA FACEPIECES
+Home
-CITY OF OPELIKA LAUNCHES MUNICIPAL MAYHEM TO SUPPORT UNITED WAY OF LEE COUNTY
-Home
-RPF: EMPLOYEE HEALTH AND WELLNESS SERVICES
-Home
```
</details>

### AZ - City of Flagstaff -- City of Flagstaff announces minimum wage for 2026

<https://www.flagstaff.az.gov/CivicAlerts.aspx?AID=2165>  
5 lines added, 5 removed (link lists / headlines only)
  
Used by: `data/minimum-wage/local/AZ-local-2026.json`, `data/minimum-wage/local/AZ-local-2027.json`


<details><summary>What changed</summary>

```diff
-Winter Parking Restrictions Begin Nov. 1
+Residents Impacted by Flooding Asked to Submit Damage Reports
-Pedestrian Improvements Complete along Soliere Avenue!
+Drowning Update
-Stuff the Bus Food Drive Event - Nov. 7 at Plaza Safeway
+City Facilities Closed Nov. 2 for Flood Response
-Council Selects Moses Milazzo to Fill Vacant Council Seat
+Numerous Road Closures in Flagstaff; Avoid Travel
-Final Public Notice Fanning Flood Mitigations
+New Federal Opportunity Zones Offer Investors Federal Tax Benefits for Long-Term Investment in 2027
```
</details>

### KY - City of Nicholasville, KY — Tax Office

<https://nicholasville.org/tax-office/>  
1 lines added, 1 removed (link lists / headlines only)
  
Used by: `data/local/KY-occupational-2025.json`, `data/local/KY-occupational-2026.json`, `data/local/KY-occupational-2027.json`


<details><summary>What changed</summary>

```diff
+Nicholasville Installing Major Water Line to Support Growth
-Nicholasville Fire Department Push-In Ceremony
```
</details>

### MI - Michigan LEO -- Michigan's Minimum Wage Set to Increase on Jan. 1, 2026

<https://www.michigan.gov/leo/news/2025/12/08/michigans-minimum-wage-set-to-increase-on-jan-1-2026>  
5 lines added, 5 removed (link lists / headlines only)
  
Used by: `data/minimum-wage/states/MI-2026.json`, `data/minimum-wage/states/MI-2027.json`

- Figures now present: $1, $450,000
- Figures no longer present: $500,000

<details><summary>What changed</summary>

```diff
+Get Ready for MiUI: Your Michigan unemployment system transition Downtime Period checklist
+$1 million investment will support Registered Apprenticeship pathways for special education teachers in Michigan
+Get Ready for MiUI: Five things to know about the new unemployment system
+33 Michiganders be honored at 2026 Governors Service Awards
+State Land Bank Authority invests $450,000 to strengthen local land banks across Michigan
-Michigan moves broadband expansion projects closer to construction with 23 BEAD agreements signed
-MIOSHA Announces $500,000 in Grant Funding Available to Michigan Small Businesses for Enhanced Worker Protections
-Unemployment agency promotes online safety during Cybersecurity Awareness Month
-Operating Engineers Local 324 members gain expanded pathway to college credit through apprenticeships
-Michigan is a national leader in connecting workers to careers, businesses to talent
```
</details>

### MN - Minn. Stat. § 290.081 (Income of nonresidents, reciprocity)

<https://www.revisor.mn.gov/statutes/cite/290.081>  
5 lines added, 5 removed (link lists / headlines only)
  
Used by: `data/states/MN-2025.json`, `data/states/MN-2026.json`, `data/states/MN-2027.json`


<details><summary>What changed</summary>

```diff
-2025 Minnesota Statutes
+2026 Minnesota Statutes
-2025 Minnesota Statutes
+2026 Minnesota Statutes
-2025 Statutes New, Amended or Repealed
-2025 Table of Chapters
-2025 Statutes Topics (Index)
+2026 Statutes New, Amended or Repealed
+2026 Table of Chapters
+2026 Statutes Topics (Index)
```
</details>

### MN - Minn. Stat. § 477A.016

<https://www.revisor.mn.gov/statutes/cite/477A.016>  
5 lines added, 5 removed (link lists / headlines only)
  
Used by: `data/states/MN-2025.json`, `data/states/MN-2026.json`, `data/states/MN-2027.json`


<details><summary>What changed</summary>

```diff
-2025 Minnesota Statutes
+2026 Minnesota Statutes
-2025 Minnesota Statutes
+2026 Minnesota Statutes
-2025 Statutes New, Amended or Repealed
-2025 Table of Chapters
-2025 Statutes Topics (Index)
+2026 Statutes New, Amended or Repealed
+2026 Table of Chapters
+2026 Statutes Topics (Index)
```
</details>

### MN - Minn. Stat. § 571.922 — non-support garnishment: fully exempt at or below 40x the applicable minimum wage; 10% between 40x-60x; 15% between 60x-80x; 25% above 80x (a cliff schedule — crossing a threshold puts the WHOLE disposable-earnings figure in that bracket, not just the excess, unlike the federal formula)

<https://www.revisor.mn.gov/statutes/cite/571.922>  
5 lines added, 5 removed (link lists / headlines only)
  
Used by: `data/garnishment/state-overrides-2026.json`, `data/garnishment/state-overrides-2027.json`


<details><summary>What changed</summary>

```diff
-2025 Minnesota Statutes
+2026 Minnesota Statutes
-2025 Minnesota Statutes
+2026 Minnesota Statutes
-2025 Statutes New, Amended or Repealed
-2025 Table of Chapters
-2025 Statutes Topics (Index)
+2026 Statutes New, Amended or Repealed
+2026 Table of Chapters
+2026 Statutes Topics (Index)
```
</details>

### MN - Minnesota Department of Revenue -- Reciprocity for Individuals, and wh-inst-26 p.4 ('Reciprocity for Residents of Michigan or North Dakota')

<https://www.revenue.state.mn.us/reciprocity>  
1 lines added, 0 removed (link lists / headlines only)
  
Used by: `data/states/MN-2025.json`, `data/states/MN-2026.json`, `data/states/MN-2027.json`


<details><summary>What changed</summary>

```diff
+e-Services
```
</details>

### PA - PA Department of Revenue -- Employer Withholding (reciprocal agreements)

<https://www.pa.gov/en/agencies/revenue/resources/tax-types-and-information/employer-withholding.html>  
1 lines added, 0 removed (link lists / headlines only)
  
Used by: `data/states/PA-2025.json`, `data/states/PA-2026.json`, `data/states/PA-2027.json`

- Figures now present: $662.3
- Figures no longer present: none

<details><summary>What changed</summary>

```diff
+Revenue Department Releases October 2026 Collections; Year-to-Date General Fund Collections $662.3 Million Above Estimate
```
</details>

### PA - PA Department of Revenue -- Personal Income Tax (3.07%)

<https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax>  
1 lines added, 0 removed (link lists / headlines only)
  
Used by: `data/states/PA-2025.json`

- Figures now present: $662.3
- Figures no longer present: none

<details><summary>What changed</summary>

```diff
+Revenue Department Releases October 2026 Collections; Year-to-Date General Fund Collections $662.3 Million Above Estimate
```
</details>

</details>

## Never read successfully - no baseline, so changes here go unnoticed (33)

Each of these has failed on every run so far. Replace the URL, or check the document by hand.

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Birmingham -- Employers Return of Occupational Tax Withheld](https://birminghamal.hdlgov.com/base64files/TAXES_FORM_4.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AL | [City of Gadsden, Code of Ordinances, Sec. 74-112 (Levy of fee), Municode](https://library.municode.com/al/gadsden/codes/code_of_ordinances) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AL | [City of Tuskegee -- Occupational Tax Reporting form](https://www.tuskegeealabama.gov/finance-department/files/occupational-tax-form) | HTTP 404 |
| AL | [Rainbow City -- Form G-1 (Rev 12/20), occupational license fee return](https://www.rbcalabama.com/download/revenue-g-1/?wpdmdl=730&masterkey=60c8bce41072f) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AR | [Arkansas Department of Labor and Licensing -- Minimum Wage and Overtime](https://labor.arkansas.gov/labor/labor-standards/minimum-wage-and-overtime/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AZ | [UIT-0603A (FY26), Unemployment Insurance Tax Rate Chart](https://des.az.gov/sites/default/files/dl/UIT-0603A_FY26.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [City of Aurora — Occupational Privilege Tax repeal](https://www.auroragov.org/business_services/taxes__licensing/occupational_privilege_tax) | HTTP 404 |
| CO | [City of Greenwood Village occupational privilege tax](https://www.greenwoodvillage.com/206/Occupational-Privilege-Tax) | HTTP 404 |
| CO | [Colorado DOR -- DR 1098 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/DR1098) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado Department of Revenue: news](https://tax.colorado.gov/news) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado wage withholding](https://tax.colorado.gov/withholding-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DC | [DC Department of Employment Services -- Office of Wage-Hour Compliance](https://does.dc.gov/service/office-wage-hour-compliance-0) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DC | [DC OTR withholding](https://otr.cfo.dc.gov/page/withholding-tax-forms-and-publications) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DE | [City of Wilmington: City wage and net profits taxes](https://www.wilmingtonde.gov/residents/earned-income-tax-and-net-profits-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| IL | [735 ILCS 5/12-803 — maximum wage deduction: lesser of 15% of GROSS weekly wages, or the am](https://www.ilga.gov/legislation/ilcs/ilcs4.asp?DocName=073500050K12-803) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| IL | [Illinois State Income Tax Exemptions - 2026 (Illinois Office of Comptroller, Payroll Bulle](https://illinoiscomptroller.gov/state-agencies/bulletins-forms/payroll-bulletins/illinois-state-income-tax-exemptions-2026) | HTTP 500 |
| KY | [City of Elizabethtown, KY — Code of Ordinances Chapter 110, § 110.03 Occupational License ](https://codelibrary.amlegal.com/codes/elizabethtownky/latest/elizabethtown_ky/0-0-0-3203) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Hickman Code of Ordinances Secs. 14-13 and 14-15 (Ord. No. 08-07)](https://library.municode.com/ky/hickman/codes/code_of_ordinances?nodeId=COOR_CH14LIBURE_ARTIIOCLITA) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Marion Code of Ordinances Sec. 110.22](https://codelibrary.amlegal.com/codes/marionky/latest/marion_ky/0-0-0-22684) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Mayfield Code of Ordinances Sec. 9-42, Earnings and net profits tax payment requir](https://library.municode.com/ky/mayfield/codes/code_of_ordinances?nodeId=COOR_CH9OCLITARE_ARTIIOCLITA_S9-42EANEPRTAPARE) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of McKee Code of Ordinances § 110.02 LICENSE REQUIRED; FEES](https://codelibrary.amlegal.com/codes/mckeeky/latest/mckee_ky/0-0-0-2883) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Pikeville -- Business Licenses](https://pikevilleky.gov/business/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| MO | [Kansas City, MO: earnings tax](https://www.kcmo.gov/city-hall/departments/finance/earnings-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| MO | [Kansas City, MO: tax guide for non-resident businesses (employer withholding of the earnin](https://www.kcmo.gov/city-hall/departments/finance/tax-home/tax-guides/tax-guide-for-non-resident-businesses) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NM | [City of Las Cruces -- Official Notice, Minimum Wage Ordinance (2026)](https://lascruces.gov/wp-content/uploads/2025/09/MinimumWageEng26.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NY Department of Financial Services -- COBRA and Premium Assistance](https://www.dfs.ny.gov/consumers/health_insurance/cobra_and_premium_assistance) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NY Election Law 3-400 via NY Senate Open Legislation API (free key: NYSENATE_API_KEY)](https://legislation.nysenate.gov/api/3/laws/ELN/3-400?key={env:NYSENATE_API_KEY}) | needs a free API key: add repository secret NYSENATE_API_KEY; a real browser was refused too |
| NY | [NY Labor Law 651 via NY Senate Open Legislation API (free key: NYSENATE_API_KEY)](https://legislation.nysenate.gov/api/3/laws/LAB/651?key={env:NYSENATE_API_KEY}) | needs a free API key: add repository secret NYSENATE_API_KEY; a real browser was refused too |
| NY | [NY.gov -- New York State Paid Sick Leave FAQ](https://www.ny.gov/sites/default/files/atoms/files/PSL_FAQ_PaidSickLeaveFAQ.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NYS Paid Family Leave -- 2025 contribution rate 0.388%, maximum annual contribution $354.5](https://paidfamilyleave.ny.gov/2025) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| OH | [Village of College Corner income tax ordinance (1%) and repeal resolution](https://villageofcollegecorner.org/wp-content/uploads/2025/04/Rita-Repeal.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| OK | [Oklahoma OW-2 percentage method tables (top bracket 4.5%)](https://oklahoma.gov/tax/businesses/withholding-tax.html) | HTTP 404 |
| OR | [City of Wilsonville Transit Payroll Tax Information](https://www.wilsonvilleoregon.gov/finance/page/transit-payroll-tax-information) | HTTP 404 |

## Broken - failing for 3+ runs (8)

These URLs need replacing in `watcher/sources.json` (or the site blocks automated fetches).

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Tuskegee -- Occupational Tax Reporting form](https://www.tuskegeealabama.gov/finance-department/files/occupational-tax-form) | HTTP 404 |
| AL | [City of Tuskegee -- business information brochure](https://www.tuskegeealabama.gov/sites/g/files/vyhlif3946/f/uploads/infobrochure_word.pdf) | HTTP 404 |
| CO | [City of Aurora — Occupational Privilege Tax repeal](https://www.auroragov.org/business_services/taxes__licensing/occupational_privilege_tax) | HTTP 404 |
| CO | [City of Greenwood Village occupational privilege tax](https://www.greenwoodvillage.com/206/Occupational-Privilege-Tax) | HTTP 404 |
| IL | [735 ILCS 5/12-803 — maximum wage deduction: lesser of 15% of GROSS weekly wages, or the am](https://www.ilga.gov/legislation/ilcs/ilcs4.asp?DocName=073500050K12-803) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| IL | [Illinois State Income Tax Exemptions - 2026 (Illinois Office of Comptroller, Payroll Bulle](https://illinoiscomptroller.gov/state-agencies/bulletins-forms/payroll-bulletins/illinois-state-income-tax-exemptions-2026) | HTTP 500 |
| MN | [Minnesota Paid Leave -- Premium rate and contributions](https://pl.mn.gov/resources/calculators/premium-rate-and-contributions) | HTTP 405 |
| OR | [City of Wilsonville Transit Payroll Tax Information](https://www.wilsonvilleoregon.gov/finance/page/transit-payroll-tax-information) | HTTP 404 |

## Gone (404) (1)

A 404 on an official document often means a new version was published at a new address.

| Jurisdiction | Source | Detail |
|---|---|---|
| OK | [Oklahoma OW-2 percentage method tables (top bracket 4.5%)](https://oklahoma.gov/tax/businesses/withholding-tax.html) | HTTP 404 |

## Unreachable this run (2)

| Jurisdiction | Source | Detail |
|---|---|---|
| KY | [Grant County Fiscal Court -- Occupational Licensing](https://grantcounty.ky.gov/occupational-licensing/) | URLError: <urlopen error timed out> |
| OH | [Ohio Auditor of State, Liberty Township (Henry County) regular audit 2021-2022: 'The JEDD ](https://ohioauditor.gov/Auditsearch/Reports/2023/Liberty_Township_22_21_Henry_FINAL.pdf) | URLError: <urlopen error [Errno -5] No address associated with hostname> |

## Unstable (1)

| Jurisdiction | Source | Detail |
|---|---|---|
| CA | [FAQ (English) (linked from City of Santa Monica -- Minimum Wage)](https://santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_English2023.pdf) | content differs on every request (rotating content); snapshot kept - add an 'ignore' pattern or a 'contains' range for this source |

## New (first snapshot taken) (30)

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [Alabama Admin. Code r. 810-3-75-.04, Voluntary Withholding](https://www.revenue.alabama.gov/wp-content/uploads/2021/12/810-3-75-.04.pdf) | first snapshot (345 words, pdf) |
| AR | [Arkansas Form AR4P (R 12/04/2025) and instructions](https://www.dfa.arkansas.gov/wp-content/uploads/AR4P2026.pdf) | first snapshot (1779 words, pdf) |
| AZ | [Arizona Form A-4P (2026), Request for Voluntary Withholding on Retirement Income](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_A-4P_f.pdf) | first snapshot (698 words, pdf) |
| CA | [EDD DE 231P, Withholding from Pensions, Annuities, and Certain Other Deferred Income](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de231p.pdf) | first snapshot (955 words, pdf) |
| CA | [EDD DE 4P (Rev. 46, 1-26)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de4p.pdf) | first snapshot (2700 words, pdf) |
| CT | [CT DRS, Pension Payers](https://portal.ct.gov/drs/withholding-taxes/pension-payers) | first snapshot (274 words, html) |
| CT | [Form CT-W4P (Rev. 12/21)](https://portal.ct.gov/-/media/DRS/Forms/2022/WTH/CT-W4P_1221.pdf) | first snapshot (1698 words, pdf) |
| DC | [DC OTR, 2024 FR-900NP instructions](https://otr.cfo.dc.gov/sites/default/files/dc/sites/otr/publication/attachments/2024_FR900NP_Instructions_v1.0.pdf) | first snapshot (2102 words, pdf) |
| GA | [Georgia DOR 2023 Employer's Tax Guide: pension and annuity payments](https://dor.georgia.gov/document/document/2023-employers-tax-guidepdf/download) | first snapshot (28897 words, pdf) |
| GA | [Georgia Form G-4P (Rev. 06/03/26)](https://dor.georgia.gov/document/form/withholdingcertificateforpensionorannuitypaymentsg-4ppdf/download) | first snapshot (632 words, pdf) |
| IA | [Iowa Department of Revenue, Withholding Tax Information (IAC 701-307.1(2))](https://revenue.iowa.gov/taxes/tax-guidance/withholding-tax/iowa-withholding-tax-information) | first snapshot (4519 words, html) |
| ID | [Idaho State Tax Commission, withholding: retirement-income payers](https://tax.idaho.gov/search-category/income-tax/withholding/) | first snapshot (2484 words, html) |
| IL | [Illinois Publication 131 / Form IL-941 instructions: voluntary withholding agreements](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-131.pdf) | first snapshot (2692 words, pdf) |
| IN | [Indiana Information Bulletin #13 and Form WH-4P](https://www.in.gov/dor/files/reference/ib13.pdf) | first snapshot (468 words, pdf) |
| LA | [Louisiana Department of Revenue FAQ: Does Louisiana require withholding on pensions, retir](https://revenue.louisiana.gov/tax-education-and-faqs/faqs/withholding-tax/does-louisiana-require-withholding-on-pensions-retirement-income-and-annuities/) | first snapshot (43 words, html) |
| MA | [Massachusetts Form M-4P](https://www.mass.gov/doc/form-m-4p-massachusetts-withholding-exemption-certificate-for-pension-annuity-and-other-periodic-and-nonperiodic-payments/download) | read with a headless browser; first snapshot (766 words, pdf) |
| MD | [Maryland Administrative Release No. 41, Withholding on Designated Distributions from Retir](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/administrative-releases/income-and-estate-tax/ar_it41.pdf) | first snapshot (1284 words, pdf) |
| MD | [Maryland Form MW507P](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/forms/2026/mw507p.pdf) | first snapshot (449 words, pdf) |
| MI | [Michigan: Withholding for Pension Administrators FAQ](https://www.michigan.gov/taxes/questions/iit/accordion/pension/withholding-for-pension-administrators-frequently-asked-questions-faq) | first snapshot (1939 words, html) |
| MO | [Missouri DOR withholding FAQ: pension withholding is voluntary](https://dor.mo.gov/faq/taxation/business/withholding.html) | first snapshot (4059 words, html) |
| MS | [Mississippi DOR business tax FAQ](https://www.dor.ms.gov/business/business-tax-frequently-asked-questions) | first snapshot (16651 words, html) |
| ND | [North Dakota Income Tax Withholding & Information Returns Guideline](https://www.tax.nd.gov/sites/www/files/documents/guidelines/business/it-withhold/income-tax-withholding-information-returns-guideline.pdf) | first snapshot (14008 words, pdf) |
| NE | [Nebraska Reg-21-004.06](https://revenue.nebraska.gov/about/chapter-21-income-tax-withholding) | first snapshot (8863 words, html) |
| NJ | [New Jersey Form NJ-W-4P, Certificate of Voluntary Withholding](https://www.nj.gov/treasury/taxation/pdf/current/njw4p.pdf) | first snapshot (808 words, pdf) |
| NY | [New York Form IT-2104-P, Annuitant's Request for Income Tax Withholding](https://www.tax.ny.gov/pdf/current_forms/it/it2104p_fill_in.pdf) | first snapshot (515 words, pdf) |
| NY | [Tax.NY.gov: information for retired persons](https://www.tax.ny.gov/pit/file/information_for_seniors.htm) | first snapshot (2699 words, html) |
| VA | [Form VA-4P instructions](https://www.tax.virginia.gov/sites/default/files/taxforms/withholding/any/va-4p-any.pdf) | first snapshot (1044 words, pdf) |
| VT | [Vermont Department of Taxes, Withholding Tax Instructions](https://tax.vermont.gov/business-and-corp/withholding-tax/instructions) | first snapshot (1068 words, html) |
| WI | [Wisconsin Department of Revenue, Withholding Tax Guide (Publication W-166, January 2026)](https://www.revenue.wi.gov/dor%20publications/pb166.pdf) | first snapshot (34405 words, pdf) |
| WI | [Wisconsin Withholding Tax Update, October 2025](https://www.revenue.wi.gov/withholdingtaxupdate/25-1.pdf) | first snapshot (6065 words, pdf) |

## Redirected (60)

These still work but redirect elsewhere; consider updating the URL in data/ or curated.json.

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [Alabama DOR: local tax (rates and codes for cities and counties)](https://www.revenue.alabama.gov/local-tax/) | 3 lines added, 3 removed |
| AL | [City of Opelika -- announcement of the occupational tax cut](https://www.opelika-al.gov/CivicAlerts.aspx?AID=1092) | 4 lines added, 4 removed (link lists / headlines only) |
| AR | [Arkansas DFA: news](https://www.dfa.arkansas.gov/news/) | -> https://www.dfa.arkansas.gov/about/news/ |
| AZ | [City of Flagstaff -- City of Flagstaff announces minimum wage for 2026](https://www.flagstaff.az.gov/CivicAlerts.aspx?AID=2165) | 5 lines added, 5 removed (link lists / headlines only) |
| CA | [California Employer's Guide (DE 44), Rev. 52 (4-26) -- "How to Withhold PIT on Supplementa](https://www.edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) | -> https://edd.ca.gov:443/siteassets/files/pdf_pub_ctr/de44.pdf |
| CA | [FAQ (English) (linked from City of Santa Monica -- Minimum Wage)](https://santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_English2023.pdf) | content differs on every request (rotating content); snapshot kept - add an 'ignore' pattern or a 'contains' range for this source |
| CA | [FAQ (Spanish) (linked from City of Santa Monica -- Minimum Wage)](https://santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_Spanish2023.pdf) | -> https://www.santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_Spanish2023.pdf |
| CA | [form FL-435 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/fl435.pdf) | -> https://courts.ca.gov/sites/default/files/courts/default/2024-11/fl435.pdf |
| CA | [form WG-002 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg002.pdf) | -> https://courts.ca.gov/system/files?file=2025-07/wg002.pdf |
| CA | [form WG-004 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg004.pdf) | -> https://courts.ca.gov/system/files?file=2025-07/wg004.pdf |
| CA | [form WG-005 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg005.pdf) | -> https://courts.ca.gov/sites/default/files/courts/default/2024-11/wg005.pdf |
| CA | [form WG-022 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg022.pdf) | -> https://courts.ca.gov/system/files?file=2025-07/wg022.pdf |
| CA | [form WG-030 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg030.pdf) | -> https://courts.ca.gov/system/files?file=2025-07/wg030.pdf |
| CA | [here (linked from California Department of Industrial Relations -- H)](https://www.dhcs.ca.gov/provgovpart/Documents/Psychiatric-Health-Facility.pdf) | -> https://www.dhcs.ca.gov/wp-content/uploads/2025/10/Psychiatric-Health-Facility.pdf |
| CO | [Colorado Department of Labor & Employment — UI Premium Rates](https://cdle.colorado.gov/employers/unemployment-insurance-premiums/premium-rates) | -> https://cdle.colorado.gov/ui/employers/requirements/premiums/premium-rates |
| CO | [Colorado Wage Withholding Tax Guide, January 2026](https://tax.colorado.gov/sites/tax/files/documents/Wage_Withholding_Tax_Guide_Jan_2026.pdf) | -> https://tax.colorado.gov/sites/default/files/documents/Wage_Withholding_Tax_Guide_Jan_2026.pdf |
| CO | [DR 1098 (10/21/25), 2026 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/sites/tax/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf) | -> https://tax.colorado.gov/sites/default/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf |
| CO | [here, Ordinance 2022-77 (linked from City of Aurora: occupational privilege tax (repeal)](https://www.auroragov.org/UserFiles/Servers/Server_1881137/File/Business%20Services/Tax/Occupational/Ordinance%202022-77%20OPT%20Repeal.pdf) | -> https://cdnsm5-hosted.civiclive.com/UserFiles/Servers/Server_1881137/File/Business%20Services/Tax/Occupational/Ordinance%202022-77%20OPT%20Repeal.pdf |
| CT | [Connecticut DRS: newsroom](https://portal.ct.gov/drs/newsroom) | -> https://portal.ct.gov/en/404error/?item=%2fdrs%2fnewsroom&user=extranet%5cAnonymous&site=website |
| GA | [Employer's Withholding Tax Guide 2026 (Revised June 2026, reflecting HB 463 signed 2026-05](https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-june-2026/download) | -> https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-september-2026/download |
| GA | [Employer’s Tax Guide (linked from Georgia DOR withholding)](https://dor.georgia.gov/documents/2014-employer-tax-guide) | -> https://dor.georgia.gov/employers-tax-guide |
| IA | [Iowa Department of Revenue: press releases](https://revenue.iowa.gov/press-releases) | 3 lines added, 2 removed; 1 links added, 0 removed |
| ID | [EPB00744 — Table for Percentage Computation Method of Withholding](https://tax.idaho.gov/document-mngr/pubs_EPB00744) | -> https://tax.idaho.gov/wp-content/uploads/pubs/EPB00744/EPB00744_07-23-2026.pdf |
| ID | [Form ID W-4, Employee's Withholding Allowance Certificate (EFO00307, 04-28-2025 revision)](https://tax.idaho.gov/w4form) | -> https://tax.idaho.gov/wp-content/uploads/forms/EFO00307/EFO00307_04-28-2025.pdf |
| ID | [Idaho Child Tax Credit Allowance Table (ICTCAT) page](https://tax.idaho.gov/ictcat) | -> https://tax.idaho.gov/taxes/income-tax/withholding/computing/#ictcat |
| IN | [1 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/reference/dn01.pdf) | -> https://www.in.gov/dor/files/dn01.pdf |
| IN | [Indiana DOR: departmental notices](https://www.in.gov/dor/legal-resources/tax-library/departmental-notices/) | -> https://www.in.gov/dor/resources/tax-library/departmental-notices/ |
| KY | [City of Georgetown, KY — Taxes and license fees (occupational license tax: net profits vs ](https://www.georgetownky.gov/2167/Taxes-License-Fees) | read with a headless browser |
| KY | [City of Hopkinsville -- Occupational License application form](https://cms2files.revize.com/hopkinsvilleky/document_center/Finance/Tax_Forms/OCCUPATIONAL_LIC___APPLICATION_FORM.pdf) | -> https://cms2.revize.com/revize/hopkinsvilleky/document_center/Finance/Tax_Forms/OCCUPATIONAL_LIC___APPLICATION_FORM.pdf |
| KY | [City of Vanceburg -- Annual Reconciliation of License Fee](https://www.cityofvanceburg.com/_files/ugd/2ae91a_8e635f8b0a724e379859934219b43aac.pdf) | -> https://44f532c8-0c02-45ec-afd7-8fe00fe64156.filesusr.com/ugd/2ae91a_8e635f8b0a724e379859934219b43aac.pdf |
| KY | [City of Vanceburg -- Employee Quarterly Return](https://www.cityofvanceburg.com/_files/ugd/2ae91a_5d54392ffbe34c1ba805a5216c0afd9e.pdf) | -> https://44f532c8-0c02-45ec-afd7-8fe00fe64156.filesusr.com/ugd/2ae91a_5d54392ffbe34c1ba805a5216c0afd9e.pdf |
| MA | [Massachusetts DOR withholding tax forms (new Circular M editions are listed here)](https://www.mass.gov/lists/dor-withholding-tax-forms) | read with a headless browser |
| MD | [Maryland Comptroller (marylandtaxes.gov): home (announcements)](https://www.marylandtaxes.gov/) | -> https://www.marylandcomptroller.gov/ |
| MD | [Maryland Comptroller: business taxes](https://www.marylandtaxes.gov/business/index.php) | -> https://www.marylandcomptroller.gov/businesses/tax-services.html |
| MD | [Montgomery County, MD tipped-employee cash wage ($4.00/hr, Montgomery County Code Sec. 27-](https://www.montgomerycountymd.gov/humanrights/min-wage.html) | -> https://www.montgomerycountymd.gov/office-human-rights |
| ME | [City of Portland, Maine minimum wage -- November 2025 voter-approved schedule](https://www.portlandmaine.gov/1016/Minimum-Wage) | read with a headless browser |
| MI | [City of Saginaw — What is the tax rate for City of Saginaw Income Tax? (FAQ)](https://www.saginaw-mi.com/FAQ.aspx?QID=131) | -> https://www.saginaw-mi.com/m/faq?cat=24#question-131 |
| MI | [Revenue Administrative Bulletin 1988-27 — Section 125 cafeteria plan benefits excluded fro](https://michigan.gov/treasury/0,4679,7-121-44402_44415_44416-7351--,00.html) | -> https://www.michigan.gov/en/treasury/reference/rab/content/1988/revenue-administrative-bulletin-1988-27 |
| MN | [Minnesota Department of Labor and Industry -- Minimum wage in Minnesota](https://www.dli.mn.gov/business/employment-practices/minimum-wage-minnesota) | -> https://www.dli.mn.gov/minwage |
| MO | [Missouri Department of Revenue: news](https://dor.mo.gov/news/) | -> https://dor.mo.gov/news/archive |
| NC | [NCDOR -- Withholding Tax Frequently Asked Questions](https://www.ncdor.gov/withholding-tax-frequently-asked-questions) | 0 lines added, 41 removed |
| NM | [New Mexico Taxation and Revenue: news](https://www.tax.newmexico.gov/news/) | 1 lines added, 0 removed; 1 links added, 0 removed |
| NM | [Texas Workforce Commission cross-reference for New Mexico UI figures -- New Mexico DWS 'Ho](https://www.dws.state.nm.us/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated) | -> https://www.dws.nm.gov/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated |
| NY | [DOL -- Employer Contribution Rate Table](https://dol.ny.gov/employer-contribution-rate-table) | -> https://dol.ny.gov/bizserve/ui/prg/rate/ratetables |
| NY | [New York State Department of Labor -- Home Care Aide Minimum Wage Fact Sheet (P105)](https://dol.ny.gov/home-care-aide-minimum-wage-fact-sheet-p105) | a one-off difference the confirming fetch didn't reproduce |
| NY | [New York State Department of Labor -- Minimum Wage (rates effective 01/01/2026)](https://dol.ny.gov/minimum-wage-0) | -> https://dol.ny.gov/minimum-wage |
| OH | [Combined Form IT 4 — Employee's Withholding Exemption Certificate (post-2020-12-07 combine](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth-it4-combined-fi.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/employer_withholding/generic/wth-it4-combined-fi.pdf |
| OH | [Ohio Department of Taxation: all news](https://tax.ohio.gov/wps/portal/gov/tax/home/news-and-events/all-news/) | -> https://tax.ohio.gov/home/news-and-events/all-news/ |
| OH | [Ohio Department of Taxation: information releases](https://tax.ohio.gov/wps/portal/gov/tax/help-center/communications/information-releases) | -> https://tax.ohio.gov/help-center/communications/information-releases |
| OH | [Ohio Department of Taxation: municipal income tax (state page for municipalities and emplo](https://tax.ohio.gov/business/municipalities) | -> https://tax.ohio.gov/business/municipal-net-profit-tax |
| OH | [Ohio Dept of Taxation: school district income tax list](https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf |
| OH | [Ohio Form IT 4NR — Employee's Statement of Residency in a Reciprocity State (Rev. 5/07), O](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth_it4nr.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/employer_withholding/generic/wth_it4nr.pdf |
| OR | [Oregon Department of Revenue: news](https://www.oregon.gov/dor/news/Pages/default.aspx) | 43 lines added, 47 removed; 15 links added, 19 removed |
| PA | [PA Department of Revenue -- Employer Withholding (reciprocal agreements)](https://www.pa.gov/en/agencies/revenue/resources/tax-types-and-information/employer-withholding.html) | 1 lines added, 0 removed (link lists / headlines only) |
| WA | [City of Burien -- Minimum Wage (BMC Chapter 5.16, Administrative Rule 2026-01)](https://www.burienwa.gov/MinimumWage) | 4 lines added, 4 removed |
| WI | [2026 Tax Rate Schedule for Employers (DWD, full Schedule D reserve-percentage rate table)](https://dwd.wisconsin.gov/ui/employers/taxrates.htm) | read with a headless browser |
| WI | [Wis. Stat. § 71.03(13) — 'Wisconsin adjusted gross income' defined](https://docs.legis.wisconsin.gov/document/statutes/71.03) | -> https://docs.legis.wisconsin.gov/statutes/statutes/71/i/03 |
| WI | [Wis. Stat. § 812.34 — 80% of disposable earnings exempt from garnishment (i.e. 20% reachab](https://docs.legis.wisconsin.gov/document/statutes/812.34) | -> https://docs.legis.wisconsin.gov/statutes/statutes/812/ii/34 |
| WV | [Fairmont administrative regulations section 1.2](https://fairmontwv.gov/DocumentCenter/View/2198) | -> https://fairmontwv.gov/DocumentCenter/View/2198/SMC-Administrative-Regulations-070119?bidId= |
| WV | [West Virginia State Tax Department: home page (news and notices)](https://tax.wv.gov/) | -> https://tax.wv.gov/Pages/default.aspx |

## Sites that block automated checks (37)

These can't be watched by a script (bot protection or JavaScript-only pages). Check them by hand now and then, or find the same document at an address that allows it.

<details><summary>Show all</summary>

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Birmingham -- Employers Return of Occupational Tax Withheld](https://birminghamal.hdlgov.com/base64files/TAXES_FORM_4.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AL | [City of Fairfield -- Ordinance 1019, Occupational Tax](https://cityoffairfieldal.org/wp-content/uploads/2025/02/Ordinance-1019-Occupational-Tax_rotated.pdf) | HTTP 429: the site refuses automated requests; a real browser was refused too |
| AL | [City of Gadsden, Code of Ordinances, Sec. 74-112 (Levy of fee), Municode](https://library.municode.com/al/gadsden/codes/code_of_ordinances) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AL | [Rainbow City -- Form G-1 (Rev 12/20), occupational license fee return](https://www.rbcalabama.com/download/revenue-g-1/?wpdmdl=730&masterkey=60c8bce41072f) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AR | [Arkansas Department of Labor and Licensing -- Minimum Wage and Overtime](https://labor.arkansas.gov/labor/labor-standards/minimum-wage-and-overtime/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AZ | [UIT-0603A (FY26), Unemployment Insurance Tax Rate Chart](https://des.az.gov/sites/default/files/dl/UIT-0603A_FY26.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado DOR -- DR 1098 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/DR1098) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado Department of Revenue: news](https://tax.colorado.gov/news) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado wage withholding](https://tax.colorado.gov/withholding-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado withholding tax guide](https://tax.colorado.gov/withholding-tax-guide) | read with a browser last time; a real browser was refused too |
| DC | [DC Department of Employment Services -- Office of Wage-Hour Compliance](https://does.dc.gov/service/office-wage-hour-compliance-0) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DC | [DC OTR withholding](https://otr.cfo.dc.gov/page/withholding-tax-forms-and-publications) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DE | [City of Wilmington: City wage and net profits taxes](https://www.wilmingtonde.gov/residents/earned-income-tax-and-net-profits-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| HI | [Haw. Rev. Stat. § 652-1 — MARGINAL brackets on monthly disposable earnings: 5% of the firs](https://www.capitol.hawaii.gov/hrscurrent/Vol13_Ch0601-0676/HRS0652/HRS_0652-0001.htm) | read with a browser last time; a real browser was refused too |
| KY | [City of Augusta Code of Ordinances Sec. 110.02](https://codelibrary.amlegal.com/codes/augusta/latest/augusta_ky/0-0-0-8998) | read with a browser last time; a real browser was refused too |
| KY | [City of Elizabethtown, KY — Code of Ordinances Chapter 110, § 110.03 Occupational License ](https://codelibrary.amlegal.com/codes/elizabethtownky/latest/elizabethtown_ky/0-0-0-3203) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Hartford -- Notice of Occupational License Fees](https://hartfordky.org/notice-of-occupational-license-fees/) | read with a browser last time; a real browser was refused too |
| KY | [City of Hickman Code of Ordinances Secs. 14-13 and 14-15 (Ord. No. 08-07)](https://library.municode.com/ky/hickman/codes/code_of_ordinances?nodeId=COOR_CH14LIBURE_ARTIIOCLITA) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Marion Code of Ordinances Sec. 110.22](https://codelibrary.amlegal.com/codes/marionky/latest/marion_ky/0-0-0-22684) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Mayfield Code of Ordinances Sec. 9-42, Earnings and net profits tax payment requir](https://library.municode.com/ky/mayfield/codes/code_of_ordinances?nodeId=COOR_CH9OCLITARE_ARTIIOCLITA_S9-42EANEPRTAPARE) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of McKee Code of Ordinances § 110.02 LICENSE REQUIRED; FEES](https://codelibrary.amlegal.com/codes/mckeeky/latest/mckee_ky/0-0-0-2883) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Middlesboro Code of Ordinances, Ch. 110 (levy section)](https://codelibrary.amlegal.com/codes/middlesboroky/latest/middlesboro_ky/0-0-0-5065) | read with a browser last time; a real browser was refused too |
| KY | [City of Middletown Code of Ordinances Sec. 114.23 (Ord. 07-13-2023-B, 10-12-2023-B)](https://codelibrary.amlegal.com/codes/middletownky/latest/middletown_ky/0-0-0-10846) | read with a browser last time; a real browser was refused too |
| KY | [City of Nortonville Code of Ordinances § 110.03 OCCUPATIONAL LICENSE FEE PAYMENT REQUIRED](https://codelibrary.amlegal.com/codes/nortonvilleky/latest/nortonville_ky/0-0-0-3279) | read with a browser last time; a real browser was refused too |
| KY | [City of Pikeville -- Business Licenses](https://pikevilleky.gov/business/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Simpsonville Code of Ordinances Sec. 110.27](https://codelibrary.amlegal.com/codes/simpsonville/latest/simpsonville_ky/0-0-0-6803) | read with a browser last time; a real browser was refused too |
| MO | [Kansas City, MO: earnings tax](https://www.kcmo.gov/city-hall/departments/finance/earnings-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| MO | [Kansas City, MO: tax guide for non-resident businesses (employer withholding of the earnin](https://www.kcmo.gov/city-hall/departments/finance/tax-home/tax-guides/tax-guide-for-non-resident-businesses) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NJ | [City of Newark Q1 2026 Payroll Tax Booklet](https://www.newarknj.gov/DocumentCenter/View/2741/Payroll-Tax-Booklet-2026-PDF) | read with a browser last time; a real browser was refused too |
| NJ | [HHS/ASPE 2026 Poverty Guidelines for the 48 Contiguous States and DC — household of 1: $15](https://aspe.hhs.gov/topics/poverty-economic-mobility/poverty-guidelines) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NM | [City of Las Cruces -- Official Notice, Minimum Wage Ordinance (2026)](https://lascruces.gov/wp-content/uploads/2025/09/MinimumWageEng26.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NY Department of Financial Services -- COBRA and Premium Assistance](https://www.dfs.ny.gov/consumers/health_insurance/cobra_and_premium_assistance) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NY Election Law 3-400 via NY Senate Open Legislation API (free key: NYSENATE_API_KEY)](https://legislation.nysenate.gov/api/3/laws/ELN/3-400?key={env:NYSENATE_API_KEY}) | needs a free API key: add repository secret NYSENATE_API_KEY; a real browser was refused too |
| NY | [NY Labor Law 651 via NY Senate Open Legislation API (free key: NYSENATE_API_KEY)](https://legislation.nysenate.gov/api/3/laws/LAB/651?key={env:NYSENATE_API_KEY}) | needs a free API key: add repository secret NYSENATE_API_KEY; a real browser was refused too |
| NY | [NY.gov -- New York State Paid Sick Leave FAQ](https://www.ny.gov/sites/default/files/atoms/files/PSL_FAQ_PaidSickLeaveFAQ.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NYS Paid Family Leave -- 2025 contribution rate 0.388%, maximum annual contribution $354.5](https://paidfamilyleave.ny.gov/2025) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| OH | [Village of College Corner income tax ordinance (1%) and repeal resolution](https://villageofcollegecorner.org/wp-content/uploads/2025/04/Rita-Repeal.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |

</details>

## Unchanged (896)

<details><summary>Show all</summary>

- AL - [Alabama DOR withholding tax](https://www.revenue.alabama.gov/individual-corporate/withholding-tax-2/) (last changed: 2026-10-27)
- AL - [Alabama DOR: news](https://www.revenue.alabama.gov/news) (last changed: 2026-10-22)
- AL - [Alabama League of Municipalities: municipal tax rates (occupational tax survey list)](https://almonline.org/TaxRates.aspx) (last changed: 2026-10-20)
- AL - [Alabama State Comptroller -- Memorandum, 'Jefferson County Occupational Tax'](https://comptroller.alabama.gov/wp-content/uploads/2018/01/Jefferson-County-Occupational-Tax.pdf) (last changed: 2026-09-24)
- AL - [City of Auburn -- Occupational License Fee](https://www.auburnal.gov/revenue/tax-information/occupational-license-fee/) (last changed: 2026-09-30)
- AL - [City of Glencoe -- Form G-1, Employer's Monthly/Quarterly Return of Occupational Tax Withheld (Ordin](https://cityofglencoe.org/wp-content/uploads/2021/09/Glencoe-Occupational-Tax-Form.pdf) (last changed: 2026-10-20)
- AL - [City of Irondale -- Occupational License Fee](https://cityofirondaleal.gov/occupational-license-fee/) (last changed: 2026-09-30)
- AL - [City of Leeds -- Occupational Tax](https://www.leedsalabama.gov/471/Occupational-Tax) (last changed: 2026-09-30)
- AL - [City of Southside -- Occupational Tax Return (06/30/2022)](https://cityofsouthside.com/wp-content/uploads/2023/02/Occupational-Tax-Return.pdf) (last changed: 2026-10-20)
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
- AL - [Gadsden-Etowah Industrial Development Authority -- Taxes and Fees](https://gadsdenida.org/taxes-and-fees/) (last changed: 2026-10-20)
- AL - [Neumo (formerly Avenu Insights / Revenue Discovery Systems) -- Occupational License Tax Return, rev.](https://revds.com/taxpayerpdfs/Alabama/taxpayerforms/Occupational%20Withholding%20Tax/Neumo%20Occupational%20Form.pdf) (last changed: 2026-10-20)
- AL - [Neumo -- Universal Annual Reconciliation, Occupational, 2026 (same jurisdiction list)](https://revds.com/taxpayerpdfs/Alabama/taxpayerforms/Occupational%20Withholding%20Tax/Universal%20Annual%20Reconciliation-Occupational%202026.pdf) (last changed: 2026-10-20)
- AL - [Occupational License Fee FAQ (linked from City of Irondale -- Occupational License Fee)](https://cityofirondaleal.gov/wp-content/uploads/Occupational-License-Fee-FAQ.pdf) (last changed: 2026-10-20)
- AL - [Open RESEA Report (linked from Alabama Department of Labor -- 2026 UI wage base a)](https://www2.labor.alabama.gov/WorkforceDev/RESEA_2026.pdf) (last changed: 2026-10-20)
- AL - [Operating a Business in Alabama: Resources for Starting a New Business (linked from Alabama League o](https://www.revenue.alabama.gov/wp-content/uploads/2022/06/220616_BEST_ResourcesStartingNewBusiness.pdf) (last changed: 2026-10-20)
- AL - [Ordinance 2018-10c (linked from City of Irondale -- Occupational License Fee)](https://cityofirondaleal.gov/wp-content/uploads/Ordinance-2018-10c.pdf) (last changed: 2026-10-20)
- AL - [Ordinance 2022-14 – Amendment to the Occupational License Fee Ordinanc (linked from City of Irondale](https://cityofirondaleal.gov/wp-content/uploads/Ordinance-2022-14-Amendment-to-the-Occupational-License-Fee-Ordinance.pdf) (last changed: 2026-10-20)
- AL - [Town of Notasulga -- Occupational License (Ordinance No. 97-11-01)](https://notasulgaal.com/occupational-license) (last changed: 2026-10-22)
- AL - [USDA National Finance Center -- Alabama State Income Tax Withholding (NFC-22-1666037747, still the c](https://help.nfc.usda.gov/bulletins/2022/1666037747.htm?taxmap=true) (last changed: 2026-09-24)
- AL - [Withholding Tax Tables and Instructions for Employers and Withholding Agents (Rev. 01/26)](https://www.revenue.alabama.gov/wp-content/uploads/2026/01/whbooklet_0126.pdf) (last changed: 2026-09-24)
- AL - [here (linked from Alabama League of Municipalities: municipal tax ra)](https://almonline.org/Assets/Files/TrainingAndResources/TaxRates/Revformc-PDF.pdf) (last changed: 2026-10-20)
- AL - [tax collection and administrative services for local governments (linked from Alabama DOR: local tax](https://www.revenue.alabama.gov/wp-content/uploads/2026/05/ALDOR_Local_Tax_Services-PowerPoint-05.19.2026.pdf) (last changed: 2026-10-18)
- AR - [AR4EC -- Employee's Withholding Exemption Certificate (R 02/07/2025)](https://www.dfa.arkansas.gov/wp-content/uploads/AR4EC2025_FI.pdf) (last changed: 2026-09-24)
- AR - [Arkansas DFA withholding tax](https://www.dfa.arkansas.gov/office/taxes/income-tax-administration/withholding-tax-branch/) (last changed: 2026-10-02)
- AR - [Arkansas DFA: news](https://www.dfa.arkansas.gov/news/) (last changed: 2026-10-24)
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
- AZ - [150-206-692, Oregon's out-of-state/nonresident-employer guide (cross-referenced from OR-2026.json)](https://www.oregon.gov/dor/forms/FormsPubs/withholding-transit-tax-non-resident_206-692.pdf) (last changed: 2026-10-20)
- AZ - [2026 Form A-4, Employee's Arizona Withholding Election](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_A-4_f.pdf) (last changed: 2026-10-20)
- AZ - [2026 Form WEC Instructions, 'Nonresidents' section](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_WECi.pdf) (last changed: 2026-10-20)
- AZ - [A.R.S. § 33-1131(B) — maximum part of disposable earnings subject to garnishment: the lesser of 10% ](https://www.azleg.gov/ars/33/01131.htm) (last changed: 2026-10-20)
- AZ - [Arizona DOR -- Withholding Calculations](https://azdor.gov/individuals/withholding-calculations) (last changed: 2026-10-20)
- AZ - [Arizona DOR withholding](https://azdor.gov/business/withholding-tax) (last changed: 2026-10-20)
- AZ - [Arizona Form A-4 (2025)](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2025_A-4_f.pdf) (last changed: 2026-10-20)
- AZ - [Arizona Withholding Tax Ruling (WTR) 16-4 (linked from Arizona DOR withholding)](https://azdor.gov/sites/default/files/2023-03/RULINGS_WTHOLD_2016_wtr-16-4.pdf) (last changed: 2026-10-20)
- AZ - [NAICS Code and Descriptions (linked from Arizona DOR withholding)](https://www.aztaxes.gov/PDF/NAICS_11_24_2015.pdf) (last changed: 2026-10-20)
- CA - [Cal. Civ. Proc. Code § 706.050 — ordinary garnishment limited to the lesser of 20% of disposable ear](https://selfhelp.courts.ca.gov/guide-earnings-withholding-orders-employers) (last changed: 2026-10-20)
- CA - [California DE 44 employer's guide](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) (last changed: 2026-10-20)
- CA - [California Department of Industrial Relations -- Fast Food Minimum Wage Frequently Asked Questions](https://www.dir.ca.gov/dlse/Fast-Food-Minimum-Wage-FAQ.htm) (last changed: 2026-10-20)
- CA - [California Department of Industrial Relations -- Health Care Worker Minimum Wage Frequently Asked Qu](https://www.dir.ca.gov/dlse/Health-Care-Worker-Minimum-Wage-FAQ.htm) (last changed: 2026-10-20)
- CA - [California Department of Industrial Relations — state minimum wage $16.90/hr effective 2026-01-01](https://www.dir.ca.gov/dlse/minimum_wage.htm) (last changed: 2026-10-20)
- CA - [California EDD: news releases and announcements](https://edd.ca.gov/en/about_edd/news_releases_and_announcements/) (last changed: 2026-10-20)
- CA - [California Employer's Guide (DE 44), Rev. 52 (4-26) -- "How to Withhold PIT on Supplemental Wages"](https://www.edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) (last changed: 2026-10-20)
- CA - [California FTB: newsroom](https://www.ftb.ca.gov/about-ftb/newsroom/index.html) (last changed: 2026-10-20)
- CA - [California Withholding Schedules for 2026 (Method B - Exact Calculation Method)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26methb.pdf) (last changed: 2026-10-20)
- CA - [City of Long Beach -- Notice of Annual Adjustment, Hotel Worker Hourly Rate $26.50 (Measure RW, effe](https://www.longbeach.gov/globalassets/city-clerk/media-library/documents/public-notices/public-notices/measure-rw-bulletin-effective-july-1-2026) (last changed: 2026-10-20)
- CA - [City of Malibu -- 2026 minimum wage determination](https://www.malibucity.org/minimumwage) (last changed: 2026-10-20)
- CA - [City of Santa Monica -- Minimum Wage](https://www.santamonica.gov/minimum-wage) (last changed: 2026-10-20)
- CA - [EDD -- California Withholding Schedules for 2025, Method B (Exact Calculation Method)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/25methb.pdf) (last changed: 2026-10-20)
- CA - [Enforcement Guide (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/MinimumWage_Enforcement-Employees.pdf) (last changed: 2026-10-20)
- CA - [FAQ (Spanish) (linked from City of Santa Monica -- Minimum Wage)](https://santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_Spanish2023.pdf) (last changed: 2026-10-20)
- CA - [Form DE 4, Employee's Withholding Allowance Certificate, Rev. 56 (1-26)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de4.pdf) (last changed: 2026-10-20)
- CA - [Health Care Minimum Wage Supplement to the minimum wage order (linked from California Department of ](https://www.dir.ca.gov/iwc/MW-2025-SUPPLEMENT-health-care.pdf) (last changed: 2026-10-20)
- CA - [Information Sheet: California System of Experience Rating (DE 231Z) (P (linked from California EDD r](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de231z.pdf) (last changed: 2026-10-20)
- CA - [Information Sheet: Taxability of Employee Benefits (DE 231EB) Rev. 12 (6-17)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de231eb.pdf) (last changed: 2026-10-20)
- CA - [Information Sheet: Types of Payments (DE 231TP) Rev. 1 (6-16)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de231tp.pdf) (last changed: 2026-10-20)
- CA - [Method A – Wage Bracket Table Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/25metha.pdf) (last changed: 2026-10-20)
- CA - [Method A – Wage Bracket Table Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26metha.pdf) (last changed: 2026-10-20)
- CA - [Method A – Wage Bracket Table Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/24metha.pdf) (last changed: 2026-10-20)
- CA - [Method B – Exact Calculation Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/24methb.pdf) (last changed: 2026-10-20)
- CA - [Rules and Regulations (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/City%20of%20Santa%20Monica%20Minimum%20Wage%20Rules%20and%20Regulations-1.pdf) (last changed: 2026-10-20)
- CA - [Supplement for Fast Food Restaurant Employees (linked from California Department of Industrial Relat](https://www.dir.ca.gov/iwc/MW-2024-FF-SUPPLEMENT.pdf) (last changed: 2026-10-20)
- CA - [Tax Rates, Wage Limits, and Value of Meals and Lodging (DE 3395) (PDF) (linked from California EDD r](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de3395.pdf) (last changed: 2026-10-20)
- CA - [Unincorporated Los Angeles County minimum wage, July 1, 2025 step ($17.81)](https://dcba.lacounty.gov/newsroom/new-worker-protections-for-july-1-2025/) (last changed: 2026-10-20)
- CA - [Wage Order 5 (linked from California Department of Industrial Relations -- F)](https://www.dir.ca.gov/IWC/IWCArticle05.pdf) (last changed: 2026-10-20)
- CA - [Wage Order 7 (linked from California Department of Industrial Relations -- F)](https://www.dir.ca.gov/IWC/IWCArticle07.pdf) (last changed: 2026-10-20)
- CA - [certified the minimum wage increase (linked from California DIR -- minimum wage set to increase to )](https://dof.ca.gov/media/docs/whats-new/Minimum-Wage-Increase-Notification-Governor-and-Legislative-Letter.pdf) (last changed: 2026-10-27)
- CA - [form FL-435 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/fl435.pdf) (last changed: 2026-10-20)
- CA - [form WG-002 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg002.pdf) (last changed: 2026-10-20)
- CA - [form WG-003 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://courts.ca.gov/sites/default/files/courts/default/2024-11/wg003.pdf) (last changed: 2026-10-20)
- CA - [form WG-004 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg004.pdf) (last changed: 2026-10-20)
- CA - [form WG-005 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://courts.ca.gov/sites/default/files/courts/default/2024-11/wg005.pdf) (last changed: 2026-10-20)
- CA - [form WG-005 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg005.pdf) (last changed: 2026-10-20)
- CA - [form WG-006 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://courts.ca.gov/sites/default/files/courts/default/2024-11/wg006.pdf) (last changed: 2026-10-20)
- CA - [form WG-007 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://courts.ca.gov/sites/default/files/courts/default/2024-11/wg007.pdf) (last changed: 2026-10-20)
- CA - [form WG-022 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg022.pdf) (last changed: 2026-10-20)
- CA - [form WG-030 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg030.pdf) (last changed: 2026-10-20)
- CA - [here (linked from California Department of Industrial Relations -- F)](https://www.dir.ca.gov/iwc/MW-2024-FF-SUPPLEMENT.pdf) (last changed: 2026-10-20)
- CA - [here (linked from California Department of Industrial Relations -- H)](https://www.dhcs.ca.gov/provgovpart/Documents/Psychiatric-Health-Facility.pdf) (last changed: 2026-10-27)
- CA - [here (linked from California Department of Industrial Relations — st)](https://www.dir.ca.gov/dlse/Waiver-Application.pdf) (last changed: 2026-10-20)
- CA - [list (linked from California Department of Industrial Relations -- H)](https://hcai.ca.gov/wp-content/uploads/2024/10/SB-525-Fact-Sheet-HCAI-Hospital-Lists-10_10_24.pdf) (last changed: 2026-10-20)
- CA - [the application is available here (linked from California Department of Industrial Relations -- H)](https://www.dir.ca.gov/dlse/Waiver-Application.pdf) (last changed: 2026-10-20)
- CO - [Boulder District Attorney’s website (linked from Boulder County -- Local Minimum Wage)](https://assets.bouldercounty.gov/wp-content/uploads/2023/11/Wage-Theft-English-2022.pdf) (last changed: 2026-10-20)
- CO - [CDLE press release -- Colorado minimum wage will increase to $15.71/hour in 2027](https://cdle.colorado.gov/press-releases/press-release-colorado-minimum-wage-will-increase-to-1571/hour-in-2027) (last changed: 2026-10-27)
- CO - [City and County of Denver -- Denver Local Minimum Wage Adjusts to $19.29 per Hour for 2026](https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Department-of-Finance/News/2025/Denver-Local-Minimum-Wage-Adjusts-to-19.29-per-Hour-for-2026) (last changed: 2026-10-20)
- CO - [City and County of Denver Tax Guide Topic No. 61 -- Occupational Privilege Taxes (OPT or Head Tax)](https://www.denvergov.org/content/dam/denvergov/Portals/571/documents/TaxGuide/TaxGuideTopic61_OccupationalPrivilegeTaxes.pdf) (last changed: 2026-10-20)
- CO - [City of Aurora: occupational privilege tax (repealed 2025-01-01)](https://www.auroragov.org/business_services/taxes/occupational_privilege_tax) (last changed: 2026-10-20)
- CO - [City of Boulder -- Local Minimum Wage](https://bouldercolorado.gov/local-minimum-wage) (last changed: 2026-10-20)
- CO - [City of Glendale, CO — Occupational Privilege Tax (municipal code Chapter 3.21 and the city's own OP](https://www.glendale.co.us/355/Occupational-Privilege-Tax) (last changed: 2026-10-20)
- CO - [City of Greenwood Village occupational privilege tax](https://www.greenwoodvillage.com/1220/Occupational-Privilege-Tax-OPT) (last changed: 2026-10-27)
- CO - [City of Sheridan, CO — Occupational Privilege Tax](https://ci.sheridan.co.us/288/Occupational-Privilege-Tax) (last changed: 2026-10-20)
- CO - [Colorado Department of Labor & Employment — UI Premium Rates](https://cdle.colorado.gov/employers/unemployment-insurance-premiums/premium-rates) (last changed: 2026-10-20)
- CO - [Colorado Division of Labor Standards (local minimum wage notices, INFO #19)](https://cdle.colorado.gov/dlss) (last changed: 2026-10-20)
- CO - [Colorado FAMLI -- premium rate (0.9% for 2023-2025; 0.88% from 2026)](https://famli.colorado.gov/employers) (last changed: 2026-10-20)
- CO - [Colorado Wage Withholding Tax Guide, January 2026](https://tax.colorado.gov/sites/tax/files/documents/Wage_Withholding_Tax_Guide_Jan_2026.pdf) (last changed: 2026-10-20)
- CO - [DR 1098 (10/21/25), 2026 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/sites/tax/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf) (last changed: 2026-10-20)
- CO - [Download the Colorado Wage Withholding Tax Guide (opens in new window) (linked from Colorado withhol](https://tax.colorado.gov/sites/default/files/documents/Wage_Withholding_Tax_Guide_Jan_2026.pdf) (last changed: 2026-10-27)
- CO - [Local Minimum Wage Ordinance (linked from Boulder County -- Local Minimum Wage)](https://assets.bouldercounty.gov/wp-content/uploads/2025/11/Ordinance-2025-1-Amending-Local-Minimum-Wage.pdf) (last changed: 2026-10-20)
- CO - [Local Minimum Wage Report (linked from Colorado Division of Labor Standards (local minimu)](https://cdle.colorado.gov/sites/cdle/files/Local_Min_Wage_Report_2023_1.pdf) (last changed: 2026-10-20)
- CO - [Poster about minimum wage in the City of Boulder (linked from City of Boulder -- Local Minimum Wage)](https://bouldercolorado.gov/media/16918/download?inline=) (last changed: 2026-10-20)
- CO - [Poster in Spanish about minimum wage in the City of Boulder (linked from City of Boulder -- Local Mi](https://bouldercolorado.gov/media/16919/download?inline=) (last changed: 2026-10-20)
- CO - [USDA National Finance Center -- Colorado State Income Tax Withholding (NFC-26-1772551649, 2026-03-04](https://help.nfc.usda.gov/bulletins/2026/1772551649.htm) (last changed: 2026-10-20)
- CO - [here, Ordinance 2022-77 (linked from City of Aurora: occupational privilege tax (repeal)](https://www.auroragov.org/UserFiles/Servers/Server_1881137/File/Business%20Services/Tax/Occupational/Ordinance%202022-77%20OPT%20Repeal.pdf) (last changed: 2026-10-20)
- CT - [Connecticut 2026 Informational Publications (Circular CT is IP 2026(1))](https://portal.ct.gov/drs/publications/informational-publications/2026/2026-informational-publications) (last changed: 2026-10-20)
- CT - [Connecticut DRS -- IP 2025(1) Circular CT Employer's Tax Guide (issued 2024-12-17), including TPG-21](https://portal.ct.gov/-/media/drs/publications/pubsip/2025/ip-2025-1.pdf) (last changed: 2026-10-20)
- CT - [Connecticut DRS publications (new years' publication lists appear here)](https://portal.ct.gov/drs/publications/publications-page) (last changed: 2026-10-20)
- CT - [Connecticut DRS: newsroom](https://portal.ct.gov/drs/newsroom) (last changed: 2026-10-20)
- CT - [Form CT-W4, Employee's Withholding Certificate (Rev. 12/25, effective 2026-01-01)](https://portal.ct.gov/-/media/drs/forms/2026/wth/ct-w4_1225fillable.pdf?rev=9e9e0216cd394f579961e1d4cd5c7ab3&hash=4D496BCBD10659462D3799732B5A91F2) (last changed: 2026-10-20)
- CT - [Governor Lamont announces Connecticut's minimum wage will increase to $17.48 on January 1, 2027](https://portal.ct.gov/governor/news/press-releases/2026/08-2026/governor-lamont-announces-minimum-wage-will-increase) (last changed: 2026-10-26)
- CT - [IP 2026(1) - Circular CT - Employer's Tax Guide to Withholding (linked from Connecticut DRS publicat](https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-1.pdf?hash=57C34787EE2C1D4A7F989EE1F6B8F0F8) (last changed: 2026-10-20)
- CT - [IP 2026(1), Connecticut Employer's Tax Guide, Circular CT](https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-1.pdf?rev=4482a3dca0a44b28ae39381a91fb0916&hash=57C34787EE2C1D4A7F989EE1F6B8F0F8) (last changed: 2026-10-20)
- CT - [IP 2026(1), Connecticut Employer’s Tax Guide, Circular CT (linked from Connecticut 2026 Informationa](https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-1.pdf?hash=57C34787EE2C1D4A7F989EE1F6B8F0F8) (last changed: 2026-10-20)
- CT - [IP 2026(7) - Is My Connecticut Withholding Correct? (linked from Connecticut DRS publications (new y](https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-7.pdf?hash=3DBADA0CC8447FD1EF469E88518F8FC2) (last changed: 2026-10-20)
- CT - [IP 2026(7), Is My Connecticut Withholding Correct? (linked from Connecticut 2026 Informational Publi](https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-7.pdf?hash=3DBADA0CC8447FD1EF469E88518F8FC2) (last changed: 2026-10-20)
- CT - [IP 2026(8) - Connecticut Tax Guide For Payers of Nonpayroll Amounts (linked from Connecticut DRS pub](https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-8.pdf?hash=51C2632670071F5907A80795B0CF62F7) (last changed: 2026-10-20)
- CT - [IP 2026(8), Connecticut Tax Guide For Payers of Nonpayroll Amounts (linked from Connecticut 2026 Inf](https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-8.pdf?hash=51C2632670071F5907A80795B0CF62F7) (last changed: 2026-10-20)
- CT - [TPG-211, 2026 Withholding Calculation Rules (Rev. 12/25)](https://portal.ct.gov/-/media/drs/forms/2025/wth/tpg-211_1225.pdf?rev=e16ef13773ec42d4bf0afd2e192e0176&hash=CCF9990D8EE0AA580A11BC6E97235650) (last changed: 2026-10-20)
- DC - [Amharic \| lአማርኛ (linked from DC Department of Employment Services, Office of Pa)](https://dcpaidfamilyleave.dc.gov/wp-content/uploads/2024/10/Amharic-PFL-Employer-Information.pdf) (last changed: 2026-10-20)
- DC - [D.C. Code § 1-206.02(a)(5) (Home Rule Act § 602(a)(5)) nonresident-taxation prohibition](https://code.dccouncil.gov/us/dc/council/code/sections/1-206.02) (last changed: 2026-10-20)
- DC - [D.C. Code § 16-572 (as amended by the Wage Garnishment Fairness Amendment Act of 2018) — ordinary ga](https://code.dccouncil.gov/us/dc/council/laws/22-296) (last changed: 2026-10-20)
- DC - [D.C. Home Rule Act of 1973 nonresident-taxation prohibition](https://code.dccouncil.gov/us/dc/council/code/sections/47-1806.04) (last changed: 2026-10-20)
- DC - [DC Department of Employment Services — DC minimum wage $18.40/hr effective 2026-07-01 (up from a low](https://does.dc.gov/sites/default/files/dc/sites/does/publication/attachments/2026%20Minimum%20Wage%20Poster.pdf) (last changed: 2026-10-20)
- DC - [DC Department of Employment Services, Office of Paid Family Leave -- Employer Information](https://dcpaidfamilyleave.dc.gov/employer-information/) (last changed: 2026-10-20)
- DC - [DC Department of Employment Services, Office of Wage and Hour -- District of Columbia Minimum Wage I](https://does.dc.gov/sites/default/files/dc/sites/does/publication/attachments/2026%20Minimum%20Wage%20Increase%20Notice_0.pdf) (last changed: 2026-10-20)
- DC - [DC Office of Tax and Revenue: home (notices)](https://otr.cfo.dc.gov/) (last changed: 2026-10-20)
- DC - [French \| Français (linked from DC Department of Employment Services, Office of Pa)](https://dcpaidfamilyleave.dc.gov/wp-content/uploads/2024/10/FAQ-2024-sur-le-changement-du-taux-dimpositio_PFL-Tax-Rate-Change-FAQ-and-Preparation-Guidance-2024_French.pdf) (last changed: 2026-10-20)
- DC - [Spanish \| Español (linked from DC Department of Employment Services, Office of Pa)](https://dcpaidfamilyleave.dc.gov/wp-content/uploads/2024/10/Preguntas-frecuentes-sobre-el-cambio-en-la-tasa-fiscal-de-PFL-y-guia-de-preparacion-2024_PFL-Tax-Rate-Change-FAQ-and-Preparation-Guidance_Spanish.pdf) (last changed: 2026-10-20)
- DC - [USDA National Finance Center -- District of Columbia Income Tax Withholding (NFC-22-1668460546, stil](https://help.nfc.usda.gov/bulletins/2022/1668460546.htm) (last changed: 2026-10-20)
- DC - [Vietnamese \| Tiếng Việt (linked from DC Department of Employment Services, Office of Pa)](https://dcpaidfamilyleave.dc.gov/wp-content/uploads/2024/10/Cau-hoi-thuong-gap-ve-Thay-doi-Thue-suat_PFL-Tax-Rate-Change-FAQ-and-Preparation-Guidance-2024_Vietnamese.pdf) (last changed: 2026-10-20)
- DE - [ACH Authorization Form (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/edt_applic.pdf) (last changed: 2026-10-20)
- DE - [Bracket Table for Bi-weekly Payroll Periods (linked from Delaware Division of Revenue -- Employer's ](https://revenuefiles.delaware.gov/docs/bi-wk.pdf) (last changed: 2026-10-20)
- DE - [Bracket Table for Daily Payroll Periods (linked from Delaware Division of Revenue -- Employer's Guid](https://revenuefiles.delaware.gov/docs/daily.pdf) (last changed: 2026-10-20)
- DE - [Bracket Table for Monthly Payroll Periods (linked from Delaware Division of Revenue -- Employer's Gu](https://revenuefiles.delaware.gov/docs/month.pdf) (last changed: 2026-10-20)
- DE - [Bracket Table for Semi-monthly Payroll Periods (linked from Delaware Division of Revenue -- Employer](https://revenuefiles.delaware.gov/docs/semi-mth.pdf) (last changed: 2026-10-20)
- DE - [Bracket Table for Weekly Payroll Periods (linked from Delaware Division of Revenue -- Employer's Gui](https://revenuefiles.delaware.gov/docs/weekly.pdf) (last changed: 2026-10-20)
- DE - [City of Wilmington FY2025 Tax Rates](https://wilmdebudget.org/wp-content/uploads/2024/03/fy25-tax-rates.pdf) (last changed: 2026-10-20)
- DE - [Daily (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/daily10.pdf) (last changed: 2026-10-20)
- DE - [Daily (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/daily12.pdf) (last changed: 2026-10-20)
- DE - [Daily (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/daily16.pdf) (last changed: 2026-10-20)
- DE - [Daily (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/daily.pdf) (last changed: 2026-10-20)
- DE - [Daily (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/daily14.pdf) (last changed: 2026-10-20)
- DE - [Delaware Department of Labor -- Employer Services / Unemployment Insurance Tax (Merit Rate Table)](https://labor.delaware.gov/divisions/unemployment-insurance/employer-services/) (last changed: 2026-10-20)
- DE - [Delaware Division of Revenue -- Employer's Guide (Withholding Tables)](https://revenue.delaware.gov/employers-guide-withholding-tables/) (last changed: 2026-10-20)
- DE - [Delaware Division of Revenue: home (announcements)](https://revenue.delaware.gov/) (last changed: 2026-10-23)
- DE - [Delaware House Bill 13 (153rd General Assembly) + House Substitute No. 2 for HB13 -- bracket-restruc](https://legis.delaware.gov/BillDetail?LegislationId=141813) (last changed: 2026-10-20)
- DE - [Delaware withholding forms and guide](https://revenue.delaware.gov/employers-guide-withholding-regulations-employers-duties/) (last changed: 2026-10-20)
- DE - [Employer Handbook (linked from Delaware Department of Labor -- Employer Services )](https://laborfiles.delaware.gov/main/dui/handbook/UI%20Employer%20Handbook.pdf) (last changed: 2026-10-20)
- DE - [Employer's & TPAs' Guide to Delaware Paid Leave](https://laborfiles.delaware.gov/main/pfl/Employer_and_TPAs_Guide_to_DPL.pdf) (last changed: 2026-10-20)
- DE - [Form DE-W4, Employee's Withholding Allowance Certificate + DE-W4R Resident Allowance Worksheet (Revi](https://revenuefiles.delaware.gov/2021/DE-W4.pdf) (last changed: 2026-10-20)
- DE - [Form W-4NR, Non-Resident Withholding Computation Worksheet (Revision 20220304)](https://revenuefiles.delaware.gov/docs/w4nr.pdf) (last changed: 2026-10-20)
- DE - [Gross Receipts Changes (linked from Delaware Division of Revenue -- Employer's Guide ()](https://revenuefiles.delaware.gov/docs/gr_rates.pdf) (last changed: 2026-10-20)
- DE - [Gross Receipts Changes (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/gr_rates.pdf) (last changed: 2026-10-20)
- DE - [TIM 2025-02 (linked from Delaware Division of Revenue: home (announcements))](https://revenuefiles.delaware.gov/2025/TIMs/HB_255_TIM.pdf) (last changed: 2026-10-20)
- DE - [bi–weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/bi-wk14.pdf) (last changed: 2026-10-20)
- DE - [bi–weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/bi-wk16.pdf) (last changed: 2026-10-20)
- DE - [bi–weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/bi-wk.pdf) (last changed: 2026-10-20)
- DE - [bi–weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/bi-wk10.pdf) (last changed: 2026-10-20)
- DE - [bi–weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/bi-wk12.pdf) (last changed: 2026-10-20)
- DE - [monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/month10.pdf) (last changed: 2026-10-20)
- DE - [monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/month.pdf) (last changed: 2026-10-20)
- DE - [monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/month16.pdf) (last changed: 2026-10-20)
- DE - [monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/month14.pdf) (last changed: 2026-10-20)
- DE - [monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/month12.pdf) (last changed: 2026-10-20)
- DE - [semi-monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/semi-mth.pdf) (last changed: 2026-10-20)
- DE - [semi-monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/semi-mth12.pdf) (last changed: 2026-10-20)
- DE - [semi-monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/semi-mth14.pdf) (last changed: 2026-10-20)
- DE - [semi-monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/semi-mth10.pdf) (last changed: 2026-10-20)
- DE - [semi-monthly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/semi-mth16.pdf) (last changed: 2026-10-20)
- DE - [weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/weekly16.pdf) (last changed: 2026-10-20)
- DE - [weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/weekly12.pdf) (last changed: 2026-10-20)
- DE - [weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/weekly14.pdf) (last changed: 2026-10-20)
- DE - [weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/weekly10.pdf) (last changed: 2026-10-20)
- DE - [weekly (linked from Delaware withholding forms and guide)](https://revenuefiles.delaware.gov/docs/weekly.pdf) (last changed: 2026-10-20)
- GA - [2024 Employers Tax Guide (linked from Georgia Employer's Tax Guide (current))](https://dor.georgia.gov/document/document/2024-employers-tax-guide/download) (last changed: 2026-10-18)
- GA - [2026 Employers Tax Guide (updated September 2026) (linked from Georgia Employer's Tax Guide (current](https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-september-2026/download) (last changed: 2026-10-18)
- GA - [Employer's Withholding Tax Guide 2026 (Revised June 2026, reflecting HB 463 signed 2026-05-11)](https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-june-2026/download) (last changed: 2026-09-26)
- GA - [Employer’s Tax Guide (linked from Georgia DOR withholding)](https://dor.georgia.gov/documents/2014-employer-tax-guide) (last changed: 2026-10-20)
- GA - [Form G-4 (Rev. 06/03/26) -- State of Georgia Employee's Withholding Allowance Certificate](https://dor.georgia.gov/document/form/tsdemployeeswithholdingallowancecertificateg-4pdf/download) (last changed: 2026-09-24)
- GA - [Georgia DOR -- 2025 Employer's Tax Guide (updated June 2025)](https://dor.georgia.gov/document/document-document/2025-employers-tax-guide-updated-june-2025/download) (last changed: 2026-09-30)
- GA - [Georgia DOR withholding](https://dor.georgia.gov/taxes/withholding-tax-employers) (last changed: 2026-10-13)
- GA - [Georgia DOR: press releases](https://dor.georgia.gov/press-releases) (last changed: 2026-10-18)
- GA - [Georgia Employer's Tax Guide (current)](https://dor.georgia.gov/employers-tax-guide) (last changed: 2026-10-13)
- GA - [Governor Brian Kemp -- press release, HB 463 signed 2026-05-11](https://gov.georgia.gov/press-releases/2026-05-11/gov-kemp-signs-legislation-lowering-taxes-and-supporting-economic-growth) (last changed: 2026-09-24)
- GA - [Search for all Withholding Tax Forms (linked from Georgia DOR withholding)](https://dor.georgia.gov/documents/forms/type/withholding) (last changed: 2026-10-20)
- GA - [USDA National Finance Center -- Georgia State Income Tax Withholding bulletin (2026)](https://help.nfc.usda.gov/bulletins/2026/1784643404.htm) (last changed: 2026-09-24)
- HI - [Hawaii DLIR Disability Compensation Division -- 2025 Maximum Weekly Wage Base and Maximum Weekly Ben](https://labor.hawaii.gov/dcd/files/2023/05/2025-Max-Weekly-Wage-Base-Rev-2025.03.pdf) (last changed: 2026-10-20)
- HI - [Hawaii DOTAX withholding](https://tax.hawaii.gov/geninfo/a2_b2_4empl_whhold/) (last changed: 2026-10-20)
- HI - [Hawaii Department of Taxation -- Booklet A, Employer's Tax Guide (Rev. 2025)](https://files.hawaii.gov/tax/news/pubs/25BkltA.pdf) (last changed: 2026-10-20)
- HI - [Hawaii Department of Taxation: news](https://tax.hawaii.gov/news/) (last changed: 2026-10-20)
- HI - [Hawaii Dept of Labor and Industrial Relations -- Tax Rate Schedule and Weekly Benefit Amount (Unempl](https://labor.hawaii.gov/ui/tax-rate-schedule-and-weekly-benefit-amount/) (last changed: 2026-10-20)
- HI - [Hawaii Dept of Labor and Industrial Relations, Disability Compensation Division -- 2026 Maximum Week](https://labor.hawaii.gov/dcd/files/2025/12/2026-Maximum-Weekly-Wage-Base.pdf) (last changed: 2026-10-20)
- HI - [Hawaii Dept of Labor and Industrial Relations, Wage Standards Division -- Hawaii Family Leave (HFLL)](https://labor.hawaii.gov/wsd/hawaii-family-leave/) (last changed: 2026-10-20)
- HI - [Hawaii Revised Statutes Chapter 235, Sections -61 through -69 (linked from Hawaii DOTAX withholding)](https://files.hawaii.gov/tax/legal/hrs/hrs_235.pdf) (last changed: 2026-10-20)
- HI - [Hawaii employer payroll updates](https://tax.hawaii.gov/payrollupdate/) (last changed: 2026-10-20)
- HI - [Tax Announcement 2019-11: Mandatory electronic filing of withholding t (linked from Hawaii DOTAX wit](https://files.hawaii.gov/tax/news/announce/ann19-11_amended.pdf) (last changed: 2026-10-20)
- HI - [Tax Announcement 2021-08 (linked from Hawaii DOTAX withholding)](https://files.hawaii.gov/tax/news/announce/ann21-08.pdf) (last changed: 2026-10-20)
- HI - [Tax Announcement 2025-05: Mandatory Electronic Filing of Forms W-2 and (linked from Hawaii DOTAX wit](https://files.hawaii.gov/tax/news/announce/ann25-05.pdf) (last changed: 2026-10-20)
- HI - [Tax Information Release No. 95- 4 (linked from Hawaii DOTAX withholding)](https://files.hawaii.gov/tax/legal/tir/1990_09/tir95-4.pdf) (last changed: 2026-10-20)
- IA - [2026 IA W-4, Employee Withholding Allowance Certificate](https://revenue.iowa.gov/media/4324/download?inline=) (last changed: 2026-10-20)
- IA - [Age to Purchase App handout (258.82 KB) .pdf (linked from Iowa Department of Revenue: press releases](https://revenue.iowa.gov/media/2154/download?inline=) (last changed: 2026-10-20)
- IA - [Approved Substitute Forms Vendor List (linked from Iowa Department of Revenue: press releases)](https://revenue.iowa.gov/media/4193/download?inline=) (last changed: 2026-10-20)
- IA - [House File 2631 (91st General Assembly) — proposed Iowa Family and Medical Leave Act](https://www.legis.iowa.gov/docs/publications/LGI/91/HF2631.pdf) (last changed: 2026-10-20)
- IA - [Iowa - Illinois Reciprocal Agreement — Iowa Department of Revenue](https://revenue.iowa.gov/taxes/tax-guidance/individual-income-tax/iowa-illinois-reciprocal-agreement) (last changed: 2026-10-20)
- IA - [Iowa Code § 642.21 — disposable earnings exempt to the extent provided by the federal CCPA, PLUS an ](https://www.legis.iowa.gov/docs/code/642.21.pdf) (last changed: 2026-10-20)
- IA - [Iowa DOR -- Iowa Withholding Formula For Wages Paid Beginning January 1, 2025](https://revenue.iowa.gov/media/61/download?inline) (last changed: 2026-10-20)
- IA - [Iowa Individual Income Tax Withholding Formula, Effective January 1, 2026](https://revenue.iowa.gov/media/53/download?inline=) (last changed: 2026-10-20)
- IA - [Iowa Workforce Development / Iowa Division of Labor -- Your Rights Under the Iowa Minimum Wage Law a](https://workforce.iowa.gov/media/234/download) (last changed: 2026-10-20)
- IA - [Iowa withholding](https://revenue.iowa.gov/taxes/tax-guidance/withholding-tax) (last changed: 2026-10-24)
- ID - [EPB00744 — Table for Percentage Computation Method of Withholding](https://tax.idaho.gov/document-mngr/pubs_EPB00744) (last changed: 2026-09-24)
- ID - [Form ID W-4, Employee's Withholding Allowance Certificate (EFO00307, 04-28-2025 revision)](https://tax.idaho.gov/w4form) (last changed: 2026-09-24)
- ID - [Idaho Child Tax Credit Allowance Table (ICTCAT) page](https://tax.idaho.gov/ictcat) (last changed: 2026-09-24)
- ID - [Idaho Code § 11-207 — restriction on garnishment, maximum: lesser of 25% of disposable earnings, or ](https://legislature.idaho.gov/statutesrules/idstat/title11/t11ch2/sect11-207/) (last changed: 2026-10-18)
- ID - [Idaho Department of Labor — 2026 UI Rate Class Array](https://www.labor.idaho.gov/wp-content/uploads/2024/12/Tax-rate_Class-array_2026.pdf) (last changed: 2026-09-24)
- ID - [Idaho State Tax Commission -- Withholding tables updated for 2025 (press release, 2025-05-01)](https://tax.idaho.gov/pressrelease/withholding-tables-updated-for-2025/) (last changed: 2026-09-30)
- ID - [Idaho computing withholding](https://tax.idaho.gov/taxes/income-tax/withholding/computing/) (last changed: 2026-09-24)
- ID - [Senate Page Program (linked from Idaho Code § 11-207 — restriction on garnishment, )](https://legislature.idaho.gov/wp-content/uploads/senate/page_program.pdf) (last changed: 2026-10-20)
- ID - [Withholding tables updated for 2026 — Idaho State Tax Commission press release](https://tax.idaho.gov/pressrelease/withholding-tables-updated-for-2026/) (last changed: 2026-09-24)
- IL - [2026 IL-700-T Illinois Withholding Tax Tables](https://tax.illinois.gov/forms/withholding/currentyear/il-700-t-withholding-guide-tables.html) (last changed: 2026-10-20)
- IL - [2026 State Experience Factor and Employers' UI Contribution Rates (EA-50 Report, Illinois Department](https://ides.illinois.gov/content/dam/soi/en/web/ides/ides_forms_and_publications/EA-50_2026.pdf) (last changed: 2026-10-20)
- IL - [Application for License to Employ Learner at Sub Minimum Wage Rate (linked from Illinois Department ](https://labor.illinois.gov/content/dam/soi/en/web/idol/2025-updated-chicago-address-forms/sub-minimum-wage-learner-form_11-12-25.pdf) (last changed: 2026-10-20)
- IL - [Application for License to Employ Physically or Mentally Challenged at (linked from Illinois Departm](https://labor.illinois.gov/content/dam/soi/en/web/idol/2025-updated-chicago-address-forms/subminimum-wage-application-pdf-fillable-form_11-7-25.pdf) (last changed: 2026-10-20)
- IL - [City of Chicago / Cook County July 1, 2026 minimum wage announcements](https://www.cookcountyil.gov/news/cook-county-issues-notice-minimum-wage-ordinance-5) (last changed: 2026-10-20)
- IL - [Domestic Worker Minimum Wage/Overtime Presentation (linked from Illinois Department of Labor — Minim](https://labor.illinois.gov/content/dam/soi/en/web/idol/laws-rules/fls/documents/domestic-worker-powerpoint-presentation-final.pdf) (last changed: 2026-10-20)
- IL - [Entry of Appearance (linked from Illinois Department of Labor — Minimum Wage Law (c)](https://labor.illinois.gov/content/dam/soi/en/web/idol/laws-rules/legal/documents/appearance-form.pdf) (last changed: 2026-10-20)
- IL - [Form IL-W-4 (R-07/23) and its Illinois Withholding Allowance Worksheet](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-w-4.pdf) (last changed: 2026-10-20)
- IL - [IL-W-5-NR — Employee's Statement of Nonresidence in Illinois (R-12/10)](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/2025/il-w-5-nr.pdf) (last changed: 2026-10-20)
- IL - [Illinois DOR -- 2025 Booklet IL-700-T, Illinois Withholding Tax Tables](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/2025/il-700-t.pdf) (last changed: 2026-10-20)
- IL - [Illinois Department of Labor — Minimum Wage Law (current state minimum hourly wage)](https://labor.illinois.gov/laws-rules/fls/minimum-wage-law.html) (last changed: 2026-10-20)
- IL - [Illinois Department of Revenue: news](https://tax.illinois.gov/research/news.html) (last changed: 2026-10-20)
- IL - [Illinois Minimum Wage Rates History (linked from Illinois Department of Labor — Minimum Wage Law (c)](https://labor.illinois.gov/content/dam/soi/en/web/idol/laws-rules/fls/documents/minimumwagehistoricrates.pdf) (last changed: 2026-10-20)
- IL - [Illinois withholding income tax](https://tax.illinois.gov/research/taxinformation/withholdingincometax.html) (last changed: 2026-10-20)
- IL - [Polish (linked from Illinois Department of Labor — Minimum Wage Law (c)](https://labor.illinois.gov/content/dam/soi/en/web/idol/2025-updated-chicago-address-forms/Wage%20Complaint%20Form%20Polish_11-7-25.pdf) (last changed: 2026-10-20)
- IL - [Printable PDF (linked from 2026 IL-700-T Illinois Withholding Tax Tables)](https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/withholding/documents/currentyear/il-700-t.pdf) (last changed: 2026-10-20)
- IL - [Printable Wage Claim Form (linked from Illinois Department of Labor — Minimum Wage Law (c)](https://labor.illinois.gov/content/dam/soi/en/web/idol/2025-updated-chicago-address-forms/Wage%20Complaint%20Form%202025%20English_11-7-25.pdf) (last changed: 2026-10-20)
- IL - [Pub-130, Withholding Illinois Income Tax for My Employees](https://tax.illinois.gov/research/publications/pubs/who-is-required-to-withhold-illinois-income-tax/withholding-illinois-income-tax-for-my-employees.html) (last changed: 2026-10-20)
- IL - [Publication 110 (linked from Illinois withholding income tax)](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-110.pdf) (last changed: 2026-10-27)
- IL - [Publication 110, W-2, W-2c, W-2G, and 1099 Filing and Storage Requirem (linked from Pub-130, Withhol](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-110.pdf) (last changed: 2026-10-27)
- IL - [Publication 121 (linked from Illinois withholding income tax)](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-121.pdf) (last changed: 2026-10-20)
- IL - [Publication 130 (linked from Illinois withholding income tax)](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-130.pdf) (last changed: 2026-10-20)
- IL - [Spanish (linked from Illinois Department of Labor — Minimum Wage Law (c)](https://labor.illinois.gov/content/dam/soi/en/web/idol/2025-updated-chicago-address-forms/Wage%20Complaint%20Form%20Espanol_11-7-25.pdf) (last changed: 2026-10-20)
- IN - [1 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/reference/dn01.pdf) (last changed: 2026-10-20)
- IN - [1220 Federal Specifications (linked from Indiana DOR withholding)](https://www.irs.gov/pub/irs-pdf/p1220.pdf) (last changed: 2026-10-18)
- IN - [16 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/reference/dn16.pdf) (last changed: 2026-10-20)
- IN - [2 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/reference/dn02.pdf) (last changed: 2026-10-20)
- IN - [3 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/reference/dn03.pdf) (last changed: 2026-10-20)
- IN - [33 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn33.pdf) (last changed: 2026-10-20)
- IN - [36 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn36.pdf) (last changed: 2026-10-20)
- IN - [37 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn37.pdf) (last changed: 2026-10-20)
- IN - [40 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn40.pdf) (last changed: 2026-10-20)
- IN - [41 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn41.pdf) (last changed: 2026-10-20)
- IN - [42 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn42.pdf) (last changed: 2026-10-20)
- IN - [43 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/reference/dn43.pdf) (last changed: 2026-10-20)
- IN - [44 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn44.pdf) (last changed: 2026-10-20)
- IN - [45 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/reference/dn45.pdf) (last changed: 2026-10-20)
- IN - [5 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn05.pdf) (last changed: 2026-10-20)
- IN - [8 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/dn08.pdf) (last changed: 2026-10-20)
- IN - [ACH Debit Block Information (linked from Indiana DOR withholding)](https://intime.dor.in.gov/eServices/WebFiles/ACHDebitBlockGuide.pdf) (last changed: 2026-10-26)
- IN - [Changes for Tax Year 2024 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/84c9a6182f/tax-changes-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR 2024 Fiscal Annual Report (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/f18050d282/nn-ar-2024.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [DOR 2025 Fiscal Annual Report (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/2e20fab1df/NP-DOR_2025_Fiscal_Annual_Report.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR recognized as Top Workplace (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/552b6a0877/nn-twp-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR's Annual Public Hearing set for May 19 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/47da49aef6/2026-news-release-annual-public-hearing.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Departmental Notice #1 (linked from WH-4, State Form 48845)](https://www.in.gov/dA/92797e5a5f/dn01.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [Departmental Notice #26 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/4e9d38318e/dn26.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Electronic payments and payment plans (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/7a5ed24c42/nn-pay-online-plans.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Eligible Hoosiers can file for a tax credit online (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/14378de7b3/NP-Eligible_Hoosiers_can_file_for_the_SC-40_online.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Estimated payments (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/76c648ed2e/nn-estimated-payments.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Form WH-47 — Certificate of Residence](https://forms.in.gov/download.aspx?id=2419) (last changed: 2026-09-24)
- IN - [Get help preparing your taxes (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/2b697b6110/nn-help-prep-taxes.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [How to file your 2023 Indiana Individual income taxes (linked from Indiana DOR: news and publication](https://www.in.gov/dA/dd9b73c7c4/nn-how-to-file-inidividual.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [How to send us a message (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/1a94ade629/nn-how-to-send-message.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [INTIME customer portal keybot now available (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/3c2619280a/nn-keybot.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR Launches Amnesty Eligibility Tool (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/a2e30e47fc/News-Release-Amnesty-Eligibility-Tool-May-18-2026.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR shares changes for 2025 tax returns (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/a26f05261b/NP-Indiana_DOR_shares_changes_for_2025_tax_returns.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR: departmental notices](https://www.in.gov/dor/legal-resources/tax-library/departmental-notices/) (last changed: 2026-10-20)
- IN - [Indiana Department of Revenue Warns of Text Message Scam (linked from Indiana DOR: news and publicat](https://www.in.gov/dA/2a75116158/NP-Indiana_Department_of_Revenue_Warns_of_Text_Message_Scam.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana Departmental Notice #1 (county rates)](https://www.in.gov/dor/files/dn01.pdf) (last changed: 2026-10-20)
- IN - [Indiana IRIS XML Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dor/files/IRIS-Business-Rules.pdf) (last changed: 2026-10-18)
- IN - [Indiana Unemployment for Employers: New Employer Premium Rate (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/new-employer-premium-rate/) (last changed: 2026-09-24)
- IN - [Indiana Unemployment for Employers: Rate Computation (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/) (last changed: 2026-09-24)
- IN - [Indiana Unemployment for Employers: State Premium Rate Computation (DWD)](https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/state-premium-rate-computation/) (last changed: 2026-09-25)
- IN - [Indiana deductions and credits (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/ca4e8ec452/nn-IN-deductions-credits.pdf?language_id=1) (last changed: 2026-10-19)
- IN - [Indiana's Individual income tax filing opens Jan. 29 (linked from Indiana DOR: news and publications](https://www.in.gov/dA/44250c9fad/nn-tax-filing-opening.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana's Individual income tax season is here (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/db92ee9eeb/nn-income-tax-season.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [Individual Income tax filings opens Jan. 26 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/30dc04562e/NP-Individual_Income_tax_filings_opens_Jan._26.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Legislative Session 2026 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/ae3c2bf398/legislative-session-2026-news-release.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Need more time to file? (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/bb787aec91/nn-need-time-to-file.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [New tax information for Indiana's Military Service members (linked from Indiana DOR: news and public](https://www.in.gov/dA/a34e5f83c0/nn-military-tax-info.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Penalties for late payment (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/f06ca3da85/nn-penalities-late-payment.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [Penny-rounding for retailers (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/41e8fed88f/penny-rounding-for-retailers.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax Amnesty 2026 Window Opens (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/d1e7c10cad/2026-news-release-tax-amnesty-opens.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax Day is here! (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/7b4c8addc7/nn-tax-day-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax information for seniors and snowbirds (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/0fc4c3fa53/nn-tax-info-seniors.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Time's Running Out: Indiana’s Tax Amnesty 2026 Ends Sept. 9 (linked from Indiana DOR: news and publi](https://www.in.gov/dA/82b7e62e1f/2026-news-release-tax-amnesty-times-running-out.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [WH-4, State Form 48845](https://www.in.gov/dor/tax-forms/withholding-tax-forms/) (last changed: 2026-10-19)
- IN - [Where's my refund? (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/01d4f0b348/nn-wheres-my-refund.pdf?language_id=1) (last changed: 2026-10-18)
- KS - [Form 200, Local Intangibles Tax Return (Rev. 9-23-25)](https://www.ksrevenue.gov/pdf/20026.pdf) (last changed: 2026-10-20)
- KS - [K.S.A. § 60-2310 — wage garnishment: maximum part of earnings subject to garnishment is the lesser o](https://www.ksrevisor.gov/statutes/chapters/ch60/060_023_0010.html) (last changed: 2026-10-22)
- KS - [KW-100, Kansas Withholding Tax Guide (Rev. 10-24) -- SUPPLEMENTAL WAGES section, page 8](https://ksrevenue.gov/pdf/kw100.pdf) (last changed: 2026-10-20)
- KS - [Kansas Department of Revenue: press releases](https://www.ksrevenue.gov/pressreleases.html) (last changed: 2026-10-20)
- KS - [Kansas withholding tax guide KW-100](https://www.ksrevenue.gov/pdf/kw100.pdf) (last changed: 2026-10-20)
- KY - [103 KAR 17:140 -- Individual income tax - reciprocity - nonresidents](https://revenue.ky.gov/Dor%20Training%20Materials/103%20KAR%2017.140.%20Individual%20income%20tax%20-%20reciprocity%20-%20nonresidents.pdf) (last changed: 2026-09-24)
- KY - [103 KAR 18:150​ (linked from Kentucky withholding)](https://revenue.ky.gov/DOR%20Training%20Materials/103%20KAR%2018.150.%20Employer%27s%20withholding%20reporting%20requirements.pdf) (last changed: 2026-10-18)
- KY - [2020 Employer Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/Documents/2020%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2021 Employer Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2021%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2022 Employer ​Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2022%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2022-11 (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2022/05/2022-10.pdf) (last changed: 2026-10-27)
- KY - [2022-20 (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2022/09/Signed-202220.pdf) (last changed: 2026-10-27)
- KY - [2023-13 (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2023/09/Ordinance-2023-13-Amending-sections-150.80-150.82-150.85-and-150.89.pdf) (last changed: 2026-10-27)
- KY - [2023-15 (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2023/09/Ordinance-2023-15-Amending-Section-111.12-retail-sales-of-alcoholic-beverages.pdf) (last changed: 2026-10-27)
- KY - [2025 Employer Withholding Ca​lculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2025%20Withholding%20Tax%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2025 Specifications for Electronic Submission of 1099 and W​2G (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/2025%20Specifications%20for%20Electronic%20Submission%20of%201099B%2c%201099DIV%2c%201099G%2c%201099INT%2c%201099K%2c%201099MISC%2c%201099NEC%2c%201099OID%2c%201099R%20and%20W2G%20Tax%20Information%20on%20CD%20or%20MyTaxes.ky.gov.pdf) (last changed: 2026-10-27)
- KY - [2026 Employer Withholding Ca​lculator.xl​sx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/Documents/2026%20Withholding%20Tax%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2026 Property Tax Bills (PDF) (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2026/09/2026-Real-Tangible-Prop-Tax-Spreadsheet-w.-Pymt-Info-UPDATED-9.9.26.pdf) (last changed: 2026-10-20)
- KY - [2​023 Employer Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2023%20Employer%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [42A804 (K-4)(12-2025)](https://revenue.ky.gov/Forms/42A804%20(K-4)%20(2026).pdf) (last changed: 2026-09-24)
- KY - [ABC License Form (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2013/04/Application-Alcohol-License-v4-updated-11-26-18-1.docx) (last changed: 2026-10-27)
- KY - [Accessibility Statement (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2025/10/2025-City-of-Nicholasville-Accessibility-Statement.pdf) (last changed: 2026-10-20)
- KY - [Alcoholic Beverage Ordinances No. 860-2013 and 892-2013 in one file (linked from City of Nicholasvil](https://nicholasville.org/wp-content/uploads/2020/07/ABCbothOrdinances.pdf) (last changed: 2026-10-20)
- KY - [Annual Comprehensive Financial Report (ACFR) 2021 (linked from City of Covington, KY — Finance Depar](https://www.covingtonky.gov/Portals/covingtonky/220128%20ACFR_%20year%20ended%206_30_21.pdf) (last changed: 2026-10-20)
- KY - [Annual Comprehensive Financial Report (ACFR) 2022 (linked from City of Covington, KY — Finance Depar](https://www.covingtonky.gov/Portals/covingtonky/ACFR%20FY22%20Final.pdf) (last changed: 2026-10-20)
- KY - [Annual Comprehensive Financial Report (ACFR) 2023 (linked from City of Covington, KY — Finance Depar](https://www.covingtonky.gov/Portals/covingtonky/2023%20ACFR-%20Final%20-%20City%20of%20Covington%204122024.pdf) (last changed: 2026-10-20)
- KY - [Annual Comprehensive Financial Report (ACFR) 2024 (linked from City of Covington, KY — Finance Depar](https://www.covingtonky.gov/Portals/covingtonky/ACFR%202024.pdf) (last changed: 2026-10-20)
- KY - [Annual Comprehensive Financial Report (ACFR) 2025 (linked from City of Covington, KY — Finance Depar](https://www.covingtonky.gov/Portals/covingtonky/ACFR%202025%20-%20Final%20-%20City%20of%20Covington%202182026.pdf) (last changed: 2026-10-20)
- KY - [Annual Reconciliation Form (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/annual_reconciliation_form-1.pdf) (last changed: 2026-10-20)
- KY - [Annual Reconciliation of Employer's Quarterly Fee Withheld (linked from City of Paducah -- Business ](https://paducahky.gov/files/Annual-Reconciliation-Employers-Quarterly-Return-rev2022-fillable.pdf) (last changed: 2026-10-20)
- KY - [Application to Receive Payroll Tax Number for Business (linked from City of Paducah -- Business Lice](https://paducahky.gov/files/Payroll-Application-Form-rev2019-fillable.pdf) (last changed: 2026-10-20)
- KY - [Boards/Committees Application (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2026/02/Board_Committee_Application.pdf) (last changed: 2026-10-20)
- KY - [Boone County Occupational License (administers Walton's tax)](https://www.boonecountyky.org/services/occupational_licensing/index.php) (last changed: 2026-10-20)
- KY - [Business / Occupational License Extension Form (linked from City of Dayton -- License and Fee Inform](https://daytonky.com/wp-content/uploads/2023/07/Business-License-Extention-Application-New-1.pdf) (last changed: 2026-10-27)
- KY - [Business / Occupational License Renewal Form (linked from City of Dayton -- License and Fee Informat](https://daytonky.com/wp-content/uploads/2023/07/Business-Occupational-License-New-2023.pdf) (last changed: 2026-10-27)
- KY - [Business License (linked from City of St. Matthews -- Occupational Tax)](https://www.stmatthewsky.gov/wp-content/uploads/2025/01/St_Matthews_Business_License_Application.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2021 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2021-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2022 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2022-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2023 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2023-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2024 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2024-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2025 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/9/Business-License-Form-FY2025-FILLABLE.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2026 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2026-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Registration Application - for Businesses New to Padu (linked from City of Paducah ](https://paducahky.gov/files/Application-New-Business-License-rev2026-fillable.pdf) (last changed: 2026-10-20)
- KY - [City of Brandenburg -- Ordinance 648 (June 2025)](https://brandenburg.ky.gov/wp-content/uploads/2025/06/ORD-648-Occupational-Tax-.33-JUNE-2025.pdf) (last changed: 2026-09-30)
- KY - [City of Burkesville -- Application for Occupational License (posted 2024-08)](https://cityofburkesville.org/wp-content/uploads/sites/80/2024/08/Application-Occupational-License.pdf) (last changed: 2026-10-20)
- KY - [City of Burkesville -- Occupational ordinance (posted 2024-08)](https://cityofburkesville.org/wp-content/uploads/sites/80/2024/08/Occupational-Ordinance.pdf) (last changed: 2026-10-20)
- KY - [City of Corbin Occupational Tax Office](https://www.corbin-ky.gov/assets/files/uploads/_20240118110308388_3c4b72d27552424881504b851b27ab70.pdf) (last changed: 2026-10-18)
- KY - [City of Covington, KY — Finance Department, business licensing and occupational license fee](https://www.covingtonky.gov/government/departments/finance/business-licensing-occupational-license-fee) (last changed: 2026-09-24)
- KY - [City of Dayton -- License and Fee Information](https://daytonky.com/licenses/) (last changed: 2026-10-23)
- KY - [City of Eddyville -- Local Taxes](https://www.eddyvilleky.org/Blog/10/local-taxes) (last changed: 2026-10-20)
- KY - [City of Edmonton -- Forms](https://cityofedmontonky.com/forms/) (last changed: 2026-10-20)
- KY - [City of Franklin -- Business Licensing & Taxes](https://www.franklinky.gov/departments/finance_accounting/business_licensing_taxes.php) (last changed: 2026-09-30)
- KY - [City of Georgetown, KY — Taxes and license fees (occupational license tax: net profits vs gross rece](https://www.georgetownky.gov/2167/Taxes-License-Fees) (last changed: 2026-09-24)
- KY - [City of Grayson -- Occupational-Payroll](https://www.graysonky.org/occupational-payroll) (last changed: 2026-10-20)
- KY - [City of Henderson, KY — Occupational License Tax](https://www.hendersonky.gov/174/Occupational-License-Tax) (last changed: 2026-09-29)
- KY - [City of Hopkinsville -- Occupational License application form](https://cms2files.revize.com/hopkinsvilleky/document_center/Finance/Tax_Forms/OCCUPATIONAL_LIC___APPLICATION_FORM.pdf) (last changed: 2026-10-20)
- KY - [City of Jackson -- Quarterly Withholding form](https://cityofjacksonky.org/assets/forms/quarterly-withholding.pdf) (last changed: 2026-10-20)
- KY - [City of Jeffersontown -- Occupational Tax](https://www.jeffersontownky.com/383/Occupational-Tax) (last changed: 2026-10-20)
- KY - [City of Lexington -- Occupational license fee: rates and current forms](https://www.lexingtonky.gov/working/business-licensing-taxes/occupational-license-fee-rates-current-forms) (last changed: 2026-09-24)
- KY - [City of Lyndon occupational tax FAQ (GovOS / munirevs)](https://lyndonky.munirevs.com/faq/) (last changed: 2026-10-27)
- KY - [City of Millersburg Ordinances (posted 2019-01)](https://millersburgky.com/wp-content/uploads/2019/01/City-of-Millersburg-Ordinances.pdf) (last changed: 2026-10-20)
- KY - [City of Paducah -- Business License and Payroll Tax](https://paducahky.gov/departments/finance/business-license-and-payroll-tax) (last changed: 2026-09-30)
- KY - [City of Perryville -- Employer's Quarterly Return of License Fee Withheld (2023)](https://www.perryvilleky.gov/wp-content/uploads/2022/12/Employers-Qtrly-Return-of-License-Fee-WH-2023.pdf) (last changed: 2026-10-01)
- KY - [City of Prestonsburg -- Employer's Quarterly Return of License Fee Withheld](https://prestonsburgcity.org/wp-content/docs/OLFee_License-Fee-Quarterly-Return-Fillable.pdf) (last changed: 2026-10-20)
- KY - [City of Russell -- Occupational License Fee](https://www.russellky.gov/departments/finance___revenue_department/occupational_license_fee/index.php) (last changed: 2026-09-30)
- KY - [City of Russellville -- Return of Payroll Taxes Withheld](https://russellvilleky.gov/index.php/forms-applications/occupational-tax?download=19:return-of-payroll-taxes-withheld) (last changed: 2026-10-18)
- KY - [City of St. Matthews -- Occupational Tax](https://www.stmatthewsky.gov/occupational-tax/) (last changed: 2026-09-30)
- KY - [City of Union -- New 2023 Payroll and Business License](https://cityofunionky.org/new-2023-payroll-and-business-license/) (last changed: 2026-10-20)
- KY - [City of Vanceburg -- Annual Reconciliation of License Fee](https://www.cityofvanceburg.com/_files/ugd/2ae91a_8e635f8b0a724e379859934219b43aac.pdf) (last changed: 2026-10-20)
- KY - [City of Vanceburg -- Employee Quarterly Return](https://www.cityofvanceburg.com/_files/ugd/2ae91a_5d54392ffbe34c1ba805a5216c0afd9e.pdf) (last changed: 2026-10-20)
- KY - [City of West Liberty -- Occupational Tax Ordinance Amendment](https://westliberty.ky.gov/Ordinances/Occupational-Tax-Ordinance-Amendment.pdf) (last changed: 2026-10-01)
- KY - [City of Winchester -- Occupational License Fees (Payroll Tax)](https://www.winchesterky.com/DepartmentsSubPage/30/occupational-license-fees-payroll-tax) (last changed: 2026-10-20)
- KY - [Comprehensive Annual Financial Report (CAFR) 2020 (linked from City of Covington, KY — Finance Depar](https://www.covingtonky.gov/Portals/covingtonky/FY%202020%20CAFR_City%20of%20Covington.pdf) (last changed: 2026-10-20)
- KY - [Debt management policy. (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/O-07-19%20DEBT%20MANAGEMENT%20POLICY%20%2803-26-19%29.pdf) (last changed: 2026-10-20)
- KY - [Download (linked from City of Edmonton -- Forms)](https://cityofedmontonky.com/wp-content/uploads/sites/48/2026/01/2026-quarterly.pdf) (last changed: 2026-10-20)
- KY - [Download (linked from City of Edmonton -- Forms)](https://cityofedmontonky.com/wp-content/uploads/sites/48/2026/01/2026-reconciliation.pdf) (last changed: 2026-10-20)
- KY - [Download (linked from City of Edmonton -- Forms)](https://cityofedmontonky.com/wp-content/uploads/sites/48/2025/05/Open-Records-Policy-2025-1.pdf) (last changed: 2026-10-20)
- KY - [Download pdf (linked from City of Union -- New 2023 Payroll and Business Lic)](https://cityofunionky.org/wp-content/uploads/2022/11/Initial-Letter-to-Businesses-Payroll-Tax.pdf) (last changed: 2026-10-20)
- KY - [Employee Information Form (Continuation) (linked from City of Grayson -- Occupational-Payroll)](https://www.graysonky.org/_files/ugd/b20b56_c3115eb2a08446dbb4f4b4fdadea1f3a.pdf) (last changed: 2026-10-20)
- KY - [Employee Information Form (linked from City of Grayson -- Occupational-Payroll)](https://www.graysonky.org/_files/ugd/b20b56_8170a1f19fff4d14b543ed1cbef6c8c5.pdf) (last changed: 2026-10-20)
- KY - [Employee's Individual Return of License Fee Form (Payroll Tax) (linked from City of Paducah -- Busin](https://paducahky.gov/files/Employees-Individual-Return-License-Fee-rev2023-fillable.pdf) (last changed: 2026-10-20)
- KY - [Employer's Quarterly Return of License Fee Withheld (linked from City of Paducah -- Business License](https://paducahky.gov/files/Employers-Quarterly-Payroll-Return-rev2023-fillable.pdf) (last changed: 2026-10-20)
- KY - [Employers Quarterly Report (linked from City of St. Matthews -- Occupational Tax)](https://www.stmatthewsky.gov/wp-content/uploads/2022/09/Employers-Quarterly-Reporting-Form.pdf) (last changed: 2026-10-20)
- KY - [End of year Reconciliation form-page 1 (linked from City of Grayson -- Occupational-Payroll)](https://www.graysonky.org/_files/ugd/b20b56_bf1c878bbead438d9061e8f24a885088.pdf) (last changed: 2026-10-20)
- KY - [FORM (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/230523%20Employers%20License%20Fee%20Withheld%20%28payroll%20tax%29_1.pdf) (last changed: 2026-10-20)
- KY - [FORM (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/260121_finance_employersannualreconciliationoflicensefeeswithheld_application_2013.pdf) (last changed: 2026-10-20)
- KY - [FORM (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/Government/Departments/Finance/finance_insurancepremiumtax_form_2014.pdf) (last changed: 2026-10-20)
- KY - [FORM OL-1 (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/220216_%20OL-1.pdf) (last changed: 2026-10-20)
- KY - [FORM OL-3 (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/240304_Occupational%20license%20return%20form%20%28Form%20OL-3%29.pdf) (last changed: 2026-10-20)
- KY - [FORM. (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/Government/Departments/Finance/3_finance_requestfortaxinformation_application_2013.pdf) (last changed: 2026-10-20)
- KY - [First Time Business / Occupational Form (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2023/07/Business-License-First-Year.pdf) (last changed: 2026-10-27)
- KY - [FoodTruckFactSheet_NFPA (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/Government/Departments/Finance/FoodTruckFactSheet_NFPA.pdf) (last changed: 2026-10-20)
- KY - [Form 1099-LX – 1099 transmittal sheet (linked from City of Lexington -- Occupational license fee: ra](https://content.lexingtonky.gov/sites/default/files/migrated-files/sites/default/files/2022-01/Form%25201099-LX.pdf) (last changed: 2026-10-20)
- KY - [Form 211-22 – 2025 employee refund application (linked from City of Lexington -- Occupational licens](https://content.lexingtonky.gov/sites/default/files/2026-01/2025%20Form%20211-22_0.pdf) (last changed: 2026-10-20)
- KY - [Form 211-65 – 2025 employee refund application, over age 65 (linked from City of Lexington -- Occupa](https://content.lexingtonky.gov/sites/default/files/2026-01/2025%20211-65_0.pdf) (last changed: 2026-10-20)
- KY - [Form 222 – 2025 reconciliation of license fee withheld (linked from City of Lexington -- Occupationa](https://content.lexingtonky.gov/sites/default/files/2026-01/2025%20RECON.pdf) (last changed: 2026-10-20)
- KY - [Form 228 ENP – 2026 quarterly estimated net profit payment form (linked from City of Lexington -- Oc](https://content.lexingtonky.gov/sites/default/files/2026-01/2026%20ENP%20Master.pdf) (last changed: 2026-10-20)
- KY - [Form 228 EXT – Request for Extension of time to file (linked from City of Lexington -- Occupational ](https://content.lexingtonky.gov/sites/default/files/2026-01/2026%20228%20EXT%20MASTER.pdf) (last changed: 2026-10-20)
- KY - [Form 228 IP – application for a license fee account (linked from City of Lexington -- Occupational l](https://content.lexingtonky.gov/sites/default/files/migrated-files/sites/default/files/2024-02/228%2520IP%255B70%255D.pdf) (last changed: 2026-10-20)
- KY - [Form 228 – 2025 net profit license fee return (linked from City of Lexington -- Occupational license](https://content.lexingtonky.gov/sites/default/files/2026-01/2025%20NP%20MASTER.pdf) (last changed: 2026-10-20)
- KY - [Form 228 – 2025 net profit license fee return instructions (linked from City of Lexington -- Occupat](https://content.lexingtonky.gov/sites/default/files/2026-01/2025%20NPLF%20Instructions.pdf) (last changed: 2026-10-20)
- KY - [Form 228 – 2026 due dates (linked from City of Lexington -- Occupational license fee: rat)](https://content.lexingtonky.gov/sites/default/files/2026-01/2026%20Due%20Dates.pdf) (last changed: 2026-10-20)
- KY - [Form K-5 Instructions (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/42A805-K5(I)%20(03-2025)-%20Final.pdf) (last changed: 2026-10-18)
- KY - [General Information (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2026/08/Cemetery-General-Information.pdf) (last changed: 2026-10-20)
- KY - [General Instructions (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/NP_INSTRUCTIONS_2021.pdf) (last changed: 2026-10-20)
- KY - [HERE (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/230815_finance_occupationallicense_application.pdf) (last changed: 2026-10-20)
- KY - [HERE (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/230815_instructions%20for%20form%20OL-3.pdf) (last changed: 2026-10-20)
- KY - [HERE (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/Government/Departments/Finance/finance_pawnlicense_application_2014.pdf) (last changed: 2026-10-20)
- KY - [HERE (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/Government/Departments/Finance/finance_temporarythreedayoccupationallicense_application_2013.pdf) (last changed: 2026-10-20)
- KY - [HERE (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/230815_automatic%20extension.pdf) (last changed: 2026-10-20)
- KY - [Hardin County -- Occupational Tax](https://www.hardincountyky.gov/365/Occupational-Tax) (last changed: 2026-09-30)
- KY - [How to Guide for Transmitters (linked from Kentucky withholding)](https://revenue.ky.gov/Documents/MyTaxes%20-%20How%20To%20Guide%20for%20Transmitters.pdf) (last changed: 2026-10-18)
- KY - [IRS FORM W-9 (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/240301_%20W9.pdf) (last changed: 2026-10-20)
- KY - [IRS Form 4506-T (linked from Kentucky withholding)](https://www.irs.gov/pub/irs-pdf/f4506t.pdf) (last changed: 2026-10-18)
- KY - [Instructions for Online Filing of Quarterly Payroll and Insurance Prem (linked from City of Paducah ](https://paducahky.gov/files/Instructions-online-filing-quarterly-payroll-and-insurance-premium-tax-rev2024.pdf) (last changed: 2026-10-20)
- KY - [Investment policy (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/ORD-255-22%20Amend%20Investment%20Policy%20%2810-11-22%29_1.pdf) (last changed: 2026-10-20)
- KY - [KRS 425.506 — a judgment creditor may reach only the lesser of 25% of disposable earnings, or the am](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=18419) (last changed: 2026-10-18)
- KY - [KRS 67.750 -- Definitions for KRS 67.750 to 67.790](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=48677) (last changed: 2026-09-24)
- KY - [KRS 68.180 -- Occupational license tax in counties containing 300,000 population](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=50960) (last changed: 2026-09-24)
- KY - [KRS 68.197 -- License fees in counties of 30,000 or more](https://apps.legislature.ky.gov/law/Statutes/statute.aspx?id=54832) (last changed: 2026-09-24)
- KY - [KRS 92.281 -- Levy of all taxes authorized by Constitution Section 181 -- Exceptions -- License fees](https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=48683) (last changed: 2026-09-24)
- KY - [KY-TAM-18-03 -- Credit for Income Tax Paid to Another State](https://revenue.ky.gov/DOR%20Training%20Materials/KY-TAM-18-03%20Credit%20for%20Income%20Tax%20Paid%20to%20Another%20State%20FINAL%20(UPDATED%20HYPERLINKS).pdf) (last changed: 2026-09-24)
- KY - [Kentucky 2026 withholding formula](https://revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf) (last changed: 2026-09-24)
- KY - [Kentucky Association of Counties -- Data Brief: 2026 County Occupational Tax Rates (payroll column, ](https://kaco.org/media/7051/2026-databrief-occupationaltaxes.pdf) (last changed: 2026-10-20)
- KY - [Kentucky DOR -- 2025 Form K-4](https://revenue.ky.gov/Documents/42A804%20(K-4)%20(2025).pdf) (last changed: 2026-09-30)
- KY - [Kentucky DOR -- 2025 Kentucky Withholding Tax Formula](https://revenue.ky.gov/Forms/Withholding%20Computer%20Formula.pdf) (last changed: 2026-09-30)
- KY - [Kentucky DOR -- Kentucky DOR Announces 2025 Standard Deduction](https://revenue.ky.gov/News/pages/kentucky-dor-announces-2025-standard-deduction.aspx) (last changed: 2026-09-30)
- KY - [Kentucky DOR: news](https://revenue.ky.gov/News/Pages/default.aspx) (last changed: 2026-10-23)
- KY - [Kentucky OUI Employer Guide to Unemployment Insurance 2026 (rate schedules, taxable wage base): ui.k](https://ui.ky.gov/Documents/KY-OUI_Employer%20Guide_2026.pdf) (last changed: 2026-10-18)
- KY - [Kentucky Secretary of State: occupational tax districts (spreadsheet of every district)](https://web.sos.ky.gov/occupationaltax/) (last changed: 2026-09-24)
- KY - [Kentucky Unemployment Insurance self-service site (employer notices)](https://ui.ky.gov/Redesign/home.aspx) (last changed: 2026-10-18)
- KY - [Kentucky withholding](https://revenue.ky.gov/Business/Pages/Employer-Payroll-Withholding.aspx) (last changed: 2026-10-22)
- KY - [License Fee Regulations – 5th edition – Issued Dec. 1, 2000 (linked from City of Lexington -- Occupa](https://content.lexingtonky.gov/sites/default/files/migrated-files/sites/default/files/2016-08/License%2520Fee%2520Regulations.pdf) (last changed: 2026-10-20)
- KY - [Louisville Metro Revenue Commission -- W-1KJC Instructions and Louisville Metro Code Sec. 110.02](https://louisvilleky.gov/sites/default/files/2024-12/w-1kjc_instructions_2025.pdf) (last changed: 2026-09-24)
- KY - [Need to update or cancel a business account? (linked from Kentucky withholding)](http://revenue.ky.gov/Forms/10A104.pdf) (last changed: 2026-10-18)
- KY - [Net Profit License Fee Return (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/NPform-1.pdf) (last changed: 2026-10-20)
- KY - [Occupational License Fees (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/NetProfitsOrdinance.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax Application (linked from City of St. Matthews -- Occupational Tax)](https://www.stmatthewsky.gov/wp-content/uploads/2022/09/Occupational-Tax-Application.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax Refund (linked from City of St. Matthews -- Occupational Tax)](https://www.stmatthewsky.gov/wp-content/uploads/2022/09/Annual-Refund-Occupational-Tax.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax Request to Close Acct.pdf (linked from Simpson County -- Occupational Tax Administr](https://simpsoncountyky.gov/wp-content/uploads/2022/03/Occupational-Tax-Request-to-Close-Acct.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax – Coupon (linked from Simpson County -- Occupational Tax Administration)](https://simpsoncountyky.gov/wp-content/uploads/2026/01/2026occtaxcoupon.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax – Ordinance #220.262 (linked from Simpson County -- Occupational Tax Administration](https://simpsoncountyky.gov/wp-content/uploads/2026/01/Ordinance-220.262-1.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax – Reconciliation Form (linked from Simpson County -- Occupational Tax Administratio](https://simpsoncountyky.gov/wp-content/uploads/2026/01/Recon2.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax – Registration Form (linked from Simpson County -- Occupational Tax Administration)](https://simpsoncountyky.gov/wp-content/uploads/2022/03/Simpson-Live-Registration.pdf) (last changed: 2026-10-20)
- KY - [Ordinance 2023-3 (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2023/10/Ordinance-2023-3.pdf) (last changed: 2026-10-27)
- KY - [Payroll Reconciliation Form (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2022/10/Employer-Payroll-Reconciliation-Form-rev-2-26-18-1-1.docx) (last changed: 2026-10-27)
- KY - [Payroll Tax Form (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2022/07/Employers-Return-of-License-Fee-Withheld.pdf) (last changed: 2026-10-27)
- KY - [Popular Annual Financial Report (PAFR) 2022 (linked from City of Covington, KY — Finance Department,](https://www.covingtonky.gov/Portals/covingtonky/PAFR%20FY22%20Final.pdf) (last changed: 2026-10-20)
- KY - [Popular Annual Financial Report (PAFR) 2023 (linked from City of Covington, KY — Finance Department,](https://www.covingtonky.gov/Portals/covingtonky/PAFR%20FY23.pdf) (last changed: 2026-10-20)
- KY - [Powell County -- Ordinance 2025-07](http://www.powellcountyky.us/ordinances/Ordinance%202025-07.pdf) (last changed: 2026-10-18)
- KY - [Quarterly Filing Report (linked from City of Grayson -- Occupational-Payroll)](https://www.graysonky.org/_files/ugd/b20b56_caed40441c684eabb4f2e4705b3c7257.pdf) (last changed: 2026-10-20)
- KY - [Quarterly Payroll Tax Form (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2023/03/Quarterly-Payroll-Tax-Form-2023.pdf) (last changed: 2026-10-20)
- KY - [Rental Inspection Form (linked from City of Dayton -- License and Fee Information)](https://daytonky.com/wp-content/uploads/2023/01/Rental-Inspection-License-Application-Fillable-1.pdf) (last changed: 2026-10-27)
- KY - [Rental Occupational / Business License Form (linked from City of Dayton -- License and Fee Informati](https://daytonky.com/wp-content/uploads/2021/10/UPDATED-Rental-License-Application-Fillable-1.pdf) (last changed: 2026-10-27)
- KY - [Request for Refund Form (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2023/03/Request-for-Refund-Form-.pdf) (last changed: 2026-10-20)
- KY - [Rules and Regulations (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2026/08/Cemetery-Rules-and-Regulations.pdf) (last changed: 2026-10-20)
- KY - [School District of Cumberland County -- Occupational License Tax ordinance (effective 2008-01-01)](https://files.smartsites.parentsquare.com/12425/taxordinance-januarydoc.pdf) (last changed: 2026-10-20)
- KY - [Section Map (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2026/08/Cemetery-Section-Map.pdf) (last changed: 2026-10-20)
- KY - [Simpson County -- Occupational Tax Administration](https://simpsoncountyky.gov/occupational-tax-administration/) (last changed: 2026-09-30)
- KY - [Solicitud de licencia ocupacional (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/Spanish%20Occupational%20Business%20License%20Application%20Kenton%20County.pdf) (last changed: 2026-10-20)
- KY - [Solicitud de licencia ocupacional temporal (linked from City of Covington, KY — Finance Department, ](https://www.covingtonky.gov/Portals/covingtonky/Spanish%20Temporary%20Business%20License.pdf) (last changed: 2026-10-20)
- KY - [Transient Room Tax form (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/Blank_Transient_Room_Tax_From-1.pdf) (last changed: 2026-10-20)
- KY - [USDA National Finance Center -- Kentucky City (Local) Income Tax Withholding bulletin](https://help.nfc.usda.gov/bulletins/2024/1709749757.htm) (last changed: 2026-09-24)
- KY - [Worksheet (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/NPworksheet-1.pdf) (last changed: 2026-10-20)
- KY - [annual reconciliation (PDF) (linked from City of Winchester -- Occupational License Fees (P)](https://www.winchesterky.com/assets/files/uploads/_20251104095154885_1d83716b2a9840c5b51811a5a76ba09a.pdf) (last changed: 2026-10-20)
- KY - [here (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/ABCQtrlyRegulatoryReturnKVSForm2022.pdf) (last changed: 2026-10-20)
- KY - [here (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/ABCBasic.pdf) (last changed: 2026-10-20)
- KY - [her​e​ (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/2025%20Specifications%20for%20Electronic%20Submission%20of%201099B%2C%201099DIV%2C%201099G%2C%201099INT%2C%201099K%2C%201099MISC%2C%201099NEC%2C%201099OID%2C%201099R%20and%20W2G%20Tax%20Information%20on%20CD%20or%20MyTaxes.ky.gov.pdf) (last changed: 2026-10-18)
- KY - [h​​e​​re (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/2026%20Specifications%20for%20Electronic%20Submission%20of%20Annual%20wage%20and%20Tax%20Information%20Via%20Electronic%20Media%20or%20Web.pdf) (last changed: 2026-10-27)
- KY - [map of City Hall (PDF) (linked from City of Winchester -- Occupational License Fees (P)](https://www.winchesterky.com/assets/files/uploads/_20251104095243259_c9f84c3b91374660924622c7bc1e0c8c.pdf) (last changed: 2026-10-20)
- KY - [return of license fee (PDF) (linked from City of Winchester -- Occupational License Fees (P)](https://www.winchesterky.com/assets/files/uploads/_20251104095130151_c8e2177520dc476e8652a80737c43550.pdf) (last changed: 2026-10-20)
- KY - [​ (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2024%20Withholding%20Calculator%20%28Team%20KY%29-%20Final%20version%20to%20publish.xlsx) (last changed: 2026-10-27)
- LA - [Louisiana DOR -- R-1306 (1/25) Louisiana Withholding Tables and Formulas, effective on or after Janu](https://dam.ldr.la.gov/taxforms/1306-1-25.pdf) (last changed: 2026-10-20)
- LA - [Louisiana Department of Revenue: news and announcements](https://revenue.louisiana.gov/news-and-announcements) (last changed: 2026-10-20)
- LA - [Louisiana Revised Statutes 47:293 -- Tax table income (residents)](https://legis.la.gov/Legis/Law.aspx?d=101760) (last changed: 2026-10-20)
- LA - [Louisiana Withholding Tax Tables (linked from Louisiana withholding tax tables)](https://dam.ldr.la.gov/lawspolicies/1802EMR030.pdf) (last changed: 2026-10-20)
- LA - [Louisiana withholding](https://revenue.louisiana.gov/businesses/widely-used-tax-types/withholding/) (last changed: 2026-10-20)
- LA - [Louisiana withholding tax tables](https://revenue.louisiana.gov/tax-professionals/general-resources/louisiana-withholding-tax-tables/) (last changed: 2026-10-20)
- LA - [R-1300 (1/26) -- Employee's Withholding Certificate (Form L-4)](https://dam.ldr.la.gov/taxforms/1300-1-26-F.pdf) (last changed: 2026-10-20)
- LA - [R-1306 (1/26) -- Louisiana Withholding Tables and Formulas, effective on or after January 1, 2026](https://dam.ldr.la.gov/taxforms/1306-1-26.pdf) (last changed: 2026-10-20)
- LA - [USDA National Finance Center -- Louisiana State Income Tax Withholding bulletin (2025)](https://help.nfc.usda.gov/bulletins/2025/1740487316.htm) (last changed: 2026-10-20)
- MA - [Form AI-1: Business Taxpayer Change of Address and/or Information, Ope (linked from Massachusetts DO](https://www.mass.gov/doc/form-ai-1-business-taxpayer-change-of-address-andor-information/download) (last changed: 2026-10-27)
- MA - [Form M-3: Reconciliation of Massachusetts Income Taxes Withheld for Em (linked from Massachusetts DO](https://www.mass.gov/doc/form-m-3-reconciliation-of-massachusetts-income-taxes-withheld-for-employers/download) (last changed: 2026-10-27)
- MA - [Form M-4, Massachusetts Employee's Withholding Exemption Certificate (Rev. 11/19)](https://www.miltonma.gov/DocumentCenter/View/6586/Massachusetts-Withholding-Form--M-4) (last changed: 2026-10-20)
- MA - [Form M-4-MS: Annual Withholding Tax Exemption Certificate for Nonresid (linked from Massachusetts DO](https://www.mass.gov/doc/form-m-4-ms-annual-withholding-tax-exemption-certificate-for-nonresident-military-spouse/download) (last changed: 2026-10-27)
- MA - [Form M-4852: Substitute for Form W-2, Wage and Tax Statement, Open PDF (linked from Massachusetts DO](https://www.mass.gov/doc/form-m-4852-substitute-for-form-w-2-wage-and-tax-statement/download) (last changed: 2026-10-27)
- MA - [Form M-4: Massachusetts Employee's Withholding Exemption Certificate , (linked from Massachusetts DO](https://www.mass.gov/doc/form-m-4-massachusetts-employees-withholding-exemption-certificate/download) (last changed: 2026-10-27)
- MA - [Form M-941: Employer’s Return of Income Taxes Withheld , Open PDF file (linked from Massachusetts DO](https://www.mass.gov/doc/form-m-941-employers-return-of-income-taxes-withheld/download) (last changed: 2026-10-27)
- MA - [Form NHR: New Hire and Independent Contractor Reporting Form, Open PDF (linked from Massachusetts DO](https://www.mass.gov/doc/form-nhr-new-hire-and-independent-contractor-reporting-form/download) (last changed: 2026-10-27)
- MA - [Form PTE-EX: Withholding Exemption Certificate for Members of a Pass-T (linked from Massachusetts DO](https://www.mass.gov/doc/form-pte-ex-withholding-exemption-certificate-for-members-of-a-pass-through-entity/download) (last changed: 2026-10-27)
- MA - [Form PWH-WA: Performer or Performing Entity Withholding Allocation For (linked from Massachusetts DO](https://www.mass.gov/doc/form-pwh-wa-performer-or-performing-entity-withholding-allocation-form/download) (last changed: 2026-10-27)
- MA - [Form W-2 Electronic Filing Specifications Handbook, Open PDF file, 278 (linked from Massachusetts DO](https://www.mass.gov/doc/form-w-2-electronic-filing-specifications-handbook/download) (last changed: 2026-10-27)
- MA - [Mass. DOR -- Massachusetts 4% Surtax on Taxable Income](https://www.mass.gov/info-details/massachusetts-4-surtax-on-taxable-income) (last changed: 2026-10-22)
- MA - [Massachusetts Circular M (2026, effective January 1)](https://www.mass.gov/doc/massachusetts-circular-m-income-tax-withholding-tables-at-50-effective-january-1-2026/download) (last changed: 2026-10-22)
- MA - [Massachusetts Constitution, Article LXXXIX (Home Rule Amendment), Section 7 — Limitations on Local P](https://malegislature.gov/Laws/Constitution) (last changed: 2026-10-20)
- MA - [Massachusetts DOR withholding tax forms (new Circular M editions are listed here)](https://www.mass.gov/lists/dor-withholding-tax-forms) (last changed: 2026-10-22)
- MA - [Massachusetts General Laws Chapter 175M, Section 6 — PFML Contributions](https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXII/Chapter175M/Section6) (last changed: 2026-10-20)
- MA - [Massachusetts General Laws Chapter 62B, Section 2 — Duty of employer to withhold](https://malegislature.gov/Laws/GeneralLaws/PartI/TitleIX/Chapter62B/Section2) (last changed: 2026-10-20)
- MA - [Schedule 4% Surtax (linked from Mass. DOR -- Massachusetts 4% Surtax on Taxable In)](https://www.mass.gov/doc/2024-schedule-4-surtax/download) (last changed: 2026-10-27)
- MA - [USDA National Finance Center — Massachusetts State Income Tax Withholding (NFC-26-1769797447)](https://help.nfc.usda.gov/bulletins/2026/1769797447.htm) (last changed: 2026-10-20)
- MD - [2026 Maryland State and Local Income Tax Withholding Information (Central Payroll Bureau memo, Attac](https://www.marylandcomptroller.gov/content/dam/mdcomp/md/state-payroll/memos/2026/2026-maryland-state-and-local-withholding-information.pdf) (last changed: 2026-10-20)
- MD - [Comptroller of Maryland -- Withholding Tax Facts, January 2025 - December 2025 (Revised 07/25)](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/facts/Withholding-Tax-Facts-2025.pdf) (last changed: 2026-10-20)
- MD - [English (linked from Montgomery County, MD Office of Human Rights -- Mi)](https://www.dllr.state.md.us/labor/wages/minimumwagelawmont.pdf) (last changed: 2026-10-20)
- MD - [Español (linked from Montgomery County, MD Office of Human Rights -- Mi)](https://www.dllr.state.md.us/labor/wages/minimumwagelawmontes.pdf) (last changed: 2026-10-20)
- MD - [Good Standing Certificate (PDF) (linked from Maryland Comptroller (marylandtaxes.gov): home (an)](https://www.marylandcomptroller.gov/content/dam/mdcomp/md/state-accounting/forms/GSCRequest.pdf) (last changed: 2026-10-20)
- MD - [Howard County, MD -- Minimum Wage schedule (Finance Department)](https://www.howardcountymd.gov/finance/minimum-wage) (last changed: 2026-10-27)
- MD - [Maryland Comptroller (marylandtaxes.gov): home (announcements)](https://www.marylandtaxes.gov/) (last changed: 2026-10-20)
- MD - [Maryland Comptroller: business taxes](https://www.marylandtaxes.gov/business/index.php) (last changed: 2026-10-20)
- MD - [Maryland Division of Labor and Industry -- Maryland Minimum Wage and Overtime Law (Employment Standa](https://www.labor.maryland.gov/labor/wages/wagehrfacts.shtml) (last changed: 2026-10-20)
- MD - [Maryland employer withholding](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf) (last changed: 2026-10-20)
- MD - [Maryland withholding tax facts](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/facts/withholding-tax-facts-2026.pdf) (last changed: 2026-10-20)
- MD - [Minimum Wage and Other Requirements - Howard County (linked from Maryland Division of Labor and Indu](https://labor.maryland.gov/labor/wages/minimumwagelawhoco.pdf) (last changed: 2026-10-20)
- MD - [Minimum Wage and Other Requirements - Maryland (linked from Maryland Division of Labor and Industry ](https://labor.maryland.gov/labor/wages/minimumwagelaw.pdf) (last changed: 2026-10-20)
- MD - [Minimum Wage and Other Requirements - Montgomery County (linked from Maryland Division of Labor and ](https://labor.maryland.gov/labor/wages/minimumwagelawmont.pdf) (last changed: 2026-10-20)
- MD - [Minimum Wage and Other Requirements - Prince George's County (linked from Maryland Division of Labor](https://labor.maryland.gov/labor/wages/minimumwagelawpgco.pdf) (last changed: 2026-10-20)
- MD - [Montgomery County, MD Office of Human Rights -- Minimum Wage Increase (July 1, 2026)](https://www.montgomerycountymd.gov/office-human-rights/minimum-wage-increase) (last changed: 2026-10-20)
- MD - [Montgomery County, MD tipped-employee cash wage ($4.00/hr, Montgomery County Code Sec. 27-69)](https://www.montgomerycountymd.gov/humanrights/min-wage.html) (last changed: 2026-10-20)
- MD - [Notice of Proposed Regulation (PDF) (linked from Maryland Comptroller (marylandtaxes.gov): home (an)](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/notices-and-regulations/Notice-of-Proposed-Regulations-Motor-Fuel-Tax.pdf) (last changed: 2026-10-20)
- MD - [Read the Report (linked from Maryland Comptroller (marylandtaxes.gov): home (an)](https://www.marylandcomptroller.gov/content/dam/mdcomp/md/reports/research/women-economy.pdf) (last changed: 2026-10-20)
- MD - [Salario Mínimo y Otros Requisitos - Condado de Howard (linked from Maryland Division of Labor and In](https://labor.maryland.gov/labor/wages/minimumwagelawhocoes.pdf) (last changed: 2026-10-20)
- MD - [Salario Mínimo y Otros Requisitos - Condado de Montgomery (linked from Maryland Division of Labor an](https://labor.maryland.gov/labor/wages/minimumwagelawmontes.pdf) (last changed: 2026-10-20)
- MD - [Salario Mínimo y Otros Requisitos - Maryland (linked from Maryland Division of Labor and Industry --](https://labor.maryland.gov/labor/wages/minimumwagelawes.pdf) (last changed: 2026-10-20)
- MD - [USDA National Finance Center -- Maryland State and Counties Income Tax Withholding (NFC-25-174308063](https://help.nfc.usda.gov/bulletins/2025/1743080634.htm) (last changed: 2026-10-20)
- MD - [local minimum wage increases (linked from Howard County, MD -- Minimum Wage schedule (Financ)](https://www.howardcountymd.gov/sites/default/files/2022-04/HC%20Wage%20Sheet%202022%20REV%20April%205%20%28DMT%20Edits%29.pdf) (last changed: 2026-10-20)
- ME - [14 M.R.S. § 3126 — ordinary garnishment limited to the lesser of 25% of disposable earnings or the a](https://legislature.maine.gov/statutes/14/title14sec3126-A.html) (last changed: 2026-10-20)
- ME - [City of Portland, Maine minimum wage -- November 2025 voter-approved schedule](https://www.portlandmaine.gov/1016/Minimum-Wage) (last changed: 2026-10-20)
- ME - [City of Rockland, Maine -- 2026 Minimum Wage Notice](https://rocklandmaine.gov/DocumentCenter/View/2670/2026-Minimum-Wage-Notice---Rockland) (last changed: 2026-10-20)
- ME - [Current Population Survey for 2025 (linked from Maine DOL -- Maine's minimum wage to increase to $)](https://www.maine.gov/labor/cwri/sites/maine.gov.labor.cwri/files/files/documents/HourlyWageBrackets.xlsx) (last changed: 2026-10-27)
- ME - [Form W-4ME, Employee's Withholding Allowance Certificate (Revised: December 2025)](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_form_w-4me_fillable.pdf) (last changed: 2026-10-20)
- ME - [MRS Warns Employers of Tax Phishing Schemes (PDF) (linked from Maine Revenue Services: home (announc](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/Stop_Connect_Confirm_%20Poster.pdf) (last changed: 2026-10-20)
- ME - [Maine DOL -- Maine's minimum wage to increase to $15.70 per hour in 2027](https://www.maine.gov/labor/news_events/article.shtml?id=13362373) (last changed: 2026-10-26)
- ME - [Maine Department of Labor — 2026 minimum wage ($15.10/hr, effective 2026-01-01, cost-of-living index](https://www.maine.gov/labor/news_events/article.shtml?id=13338762) (last changed: 2026-10-20)
- ME - [Maine Department of Labor — June 2026 Paid Family and Medical Leave (PFML) Employer FAQ](https://www.maine.gov/paidleave/docs/2026/employers/faq/employerFAQenglish.pdf) (last changed: 2026-10-20)
- ME - [Maine Revenue Services -- 2025 Withholding Tables for Individual Income Tax (revised October 2024)](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/25_wh_tab_instr.pdf) (last changed: 2026-10-20)
- ME - [Maine Revenue Services — 2026 Withholding Tables, Revised August 2026 (26_wh_tab_instr_August2026.pd](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_wh_tab_instr_August2026.pdf) (last changed: 2026-10-20)
- ME - [Maine Revenue Services, 2026 Withholding Tables for Individual Income Tax and Instructions, table of](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_wh_tab_instr.pdf) (last changed: 2026-10-20)
- ME - [Maine withholding tables](https://www.maine.gov/revenue/taxes/income-estate-tax/employer-withholding) (last changed: 2026-10-20)
- ME - [Service Provider Tax Repeal Notice (PDF) (linked from Maine Revenue Services: home (announcements))](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/SPT%20Repeal_Notice_FINAL_11212025_0.pdf) (last changed: 2026-10-20)
- ME - [USDA National Finance Center — Maine State Income Tax Withholding (NFC-26-1771620053)](https://help.nfc.usda.gov/bulletins/2026/1771620053.htm) (last changed: 2026-10-20)
- ME - [§3126-A MS-Word (linked from 14 M.R.S. § 3126 — ordinary garnishment limited to)](https://legislature.maine.gov/statutes/14/title14sec3126-A.docx) (last changed: 2026-10-20)
- ME - [§3126-A PDF (linked from 14 M.R.S. § 3126 — ordinary garnishment limited to)](https://legislature.maine.gov/statutes/14/title14sec3126-A.pdf) (last changed: 2026-10-20)
- MI - [4.25% Income Tax Rate for Individuals and Fiduciaries in 2026 Tax Year (Treasury taxpayer notice, 20](https://www.michigan.gov/treasury/reference/taxpayer-notices/2026/04/15/425-income-tax-rate-for-individuals-and-fiduciaries-in-2026-tax-year) (last changed: 2026-09-24)
- MI - [5469 (Rev. 05-24) — 2025 City of Detroit Income Tax Withholding Guide (Treasury administers Detroit ](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/City-Withholding/TY2025/5469_ty2025.pdf) (last changed: 2026-09-24)
- MI - [Application for State Real Estate Transfer Tax (SRETT) Refund (linked from Michigan Treasury: taxes ](https://www.michigan.gov/taxes/-/media/Project/Websites/treasury/Forms/Misc/2796.pdf) (last changed: 2026-10-18)
- MI - [City of Saginaw — What is the tax rate for City of Saginaw Income Tax? (FAQ)](https://www.saginaw-mi.com/FAQ.aspx?QID=131) (last changed: 2026-10-20)
- MI - [MCL 141.631 — City Income Tax Act, Sec. 31 (personal/dependency exemptions)](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-141-631) (last changed: 2026-09-26)
- MI - [MCL 206.30 — retirement/pension income deductions (subsection (1)(f) etc.), the basis for MI taxable](https://www.legislature.mi.gov/Laws/MCL?objectName=MCL-206-30) (last changed: 2026-09-26)
- MI - [MCL 206.703(2) — Every employer required under the Internal Revenue Code to withhold on an individua](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-206-703) (last changed: 2026-09-26)
- MI - [MCL 600.4012 and Michigan's own garnishment procedure — tracks the federal CCPA floor (25%/30x-feder](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-600-4012) (last changed: 2026-10-18)
- MI - [MI-W4 (Rev. 12-20) — Employee's Michigan Withholding Exemption Certificate](https://www.michigan.gov/-/media/Project/Websites/taxes/Forms/All-Years/MIW4.pdf) (last changed: 2026-09-24)
- MI - [Michigan 2026 Income Tax Withholding Guide (446)](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2026/446_Withholding-Guide_2026.pdf) (last changed: 2026-09-24)
- MI - [Michigan LEO/UIA — Taxable Wage Base FAQ](https://www.michigan.gov/leo/bureaus-agencies/uia/employers/forms/accordion/taxable-wage-base) (last changed: 2026-09-24)
- MI - [Michigan LEO/UIA — Unemployment Tax Rate (statutory formula, Section 19 of the Michigan Employment S](https://www.michigan.gov/leo/bureaus-agencies/uia/assets/unemployment-tax-rate) (last changed: 2026-09-24)
- MI - [Michigan Treasury -- 446 Michigan Income Tax Withholding Guide (2025)](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2025/446_Withholding-Guide_2025.pdf) (last changed: 2026-09-30)
- MI - [Michigan Treasury -- Withholding Tax Information by Calendar Year](https://www.michigan.gov/taxes/business-taxes/withholding/calendar-year-tax-information) (last changed: 2026-09-30)
- MI - [Michigan Treasury — Withholding Reciprocity Examples (Analysis section: MCL 206.703(2), MCL 206.110,](https://www.michigan.gov/taxes/business-taxes/payroll-service-providers/withholding-reciprocity-examples) (last changed: 2026-09-24)
- MI - [Michigan Treasury: taxpayer notices](https://www.michigan.gov/treasury/reference/taxpayer-notices) (last changed: 2026-10-18)
- MI - [Michigan Treasury: which cities impose an income tax](https://www.michigan.gov/taxes/questions/iit/accordion/general/what-cities-impose-an-income-tax) (last changed: 2026-09-24)
- MI - [Michigan withholding tax](https://www.michigan.gov/taxes/business-taxes/withholding) (last changed: 2026-09-24)
- MI - [Other Michigan cities with income tax (City of Grand Rapids rate table)](https://www.grandrapidsmi.gov/departments/fiscal-services/income-tax/other-michigan-cities-with-income-tax/) (last changed: 2026-10-27)
- MI - [Questions and Answers About Paying Your Withholding Tax on an Accelera (linked from Michigan withhol](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/4285-Instructions.pdf?hash=EA587E841C309AB5B9A4CD6A9AEB8C77) (last changed: 2026-10-18)
- MI - [Revenue Administrative Bulletin 1988-27 — Section 125 cafeteria plan benefits excluded from AGI are ](https://michigan.gov/treasury/0,4679,7-121-44402_44415_44416-7351--,00.html) (last changed: 2026-09-24)
- MN - [2025 Property Tax Services Report (linked from Minnesota Department of Revenue: what's new)](https://www.revenue.state.mn.us/sites/default/files/2026-02/2025-state-property-tax-services-report-accessible.pdf) (last changed: 2026-10-20)
- MN - [2026 Form W-4MN, Section 2 -- Exemption From Minnesota Withholding](https://www.revenue.state.mn.us/sites/default/files/2026-04/w-4mn.pdf) (last changed: 2026-10-20)
- MN - [City of Minneapolis -- Minimum wage increases to $16.37 for all employers](https://www.minneapolismn.gov/news/2025/december/minimum-wage/) (last changed: 2026-10-20)
- MN - [Form MWR, Minnesota Reciprocity Exemption /Affidavit of Residency (linked from Minnesota Department ](https://www.revenue.state.mn.us/sites/default/files/2025-12/mwr.pdf) (last changed: 2026-10-20)
- MN - [Minn. R. 8002.0200 (administrative rule implementing 290.081's reciprocity exclusion)](https://www.revisor.mn.gov/rules/8002.0200/) (last changed: 2026-10-20)
- MN - [Minnesota 2026 Withholding Tax Instructions and Tables](https://www.revenue.state.mn.us/sites/default/files/2025-12/wh-inst-26.pdf) (last changed: 2026-10-20)
- MN - [Minnesota DEED -- Paid Leave: premiums begin January 1, 2026](https://mn.gov/deed/paidleave/employers/) (last changed: 2026-10-20)
- MN - [Minnesota DLI -- minimum-wage rate adjusted for inflation as of Jan. 1, 2027](https://dli.mn.gov/news/minimum-wage-rate-adjusted-inflation-jan-1-2027) (last changed: 2026-10-26)
- MN - [Minnesota Department of Labor and Industry -- Minimum wage in Minnesota](https://www.dli.mn.gov/business/employment-practices/minimum-wage-minnesota) (last changed: 2026-10-20)
- MN - [Minnesota Department of Labor and Industry — 2026 statewide minimum wage ($11.41/hr, single rate for](https://dli.mn.gov/news/minimum-wage-rate-adjusted-inflation-jan-1-2026) (last changed: 2026-10-20)
- MN - [Minnesota Department of Revenue: what's new](https://www.revenue.state.mn.us/whats-new) (last changed: 2026-10-20)
- MN - [Minnesota minimum-wage report (linked from Minnesota Department of Labor and Industry -- Mini)](https://www.dli.mn.gov/sites/default/files/pdf/minimum_wage_report_2025.pdf) (last changed: 2026-10-20)
- MN - [Minnesota withholding tax](https://www.revenue.state.mn.us/withholding-tax) (last changed: 2026-10-20)
- MN - [Minnesota's minimum wage laws (linked from Minnesota Department of Labor and Industry -- Mini)](https://www.dli.mn.gov/sites/default/files/pdf/minimum_wage.pdf) (last changed: 2026-10-20)
- MN - [USDA National Finance Center -- Minnesota State Income Tax Withholding (NFC-25-1743707530, 2025 form](https://help.nfc.usda.gov/bulletins/2025/1743707530.htm) (last changed: 2026-10-20)
- MN - [labor standards poster (linked from City of Minneapolis -- Minimum wage increases to $)](https://minimumwage.minneapolismn.gov/uploads/9/6/3/1/96313024/2026_english_mpls_labor_standards_poster.pdf.pdf) (last changed: 2026-10-20)
- MO - [2026 Missouri Withholding Tax Formula](https://dor.mo.gov/forms/Withholding%20Formula_2026.pdf) (last changed: 2026-10-20)
- MO - [Completing a New MO W-4 If You Have More Than One Employer (linked from Missouri withholding)](https://dor.mo.gov/taxation/business/tax-types/withholding/documents/Portalwithcalculationexample.pdf) (last changed: 2026-10-20)
- MO - [E-234 Form (Fillable) and Instructions (linked from St. Louis: earnings tax department)](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/documents/e-234-form.cfm) (last changed: 2026-10-20)
- MO - [Earnings Tax Forms (linked from St. Louis: earnings tax department)](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/documents/index.cfm) (last changed: 2026-10-20)
- MO - [Earnings Tax Forms and Documents (linked from St. Louis: employer withholding and payroll expens)](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/documents/index.cfm) (last changed: 2026-10-20)
- MO - [Form MO W-4, Employee's Withholding Certificate](https://dor.mo.gov/forms/MO%20W-4.pdf) (last changed: 2026-10-20)
- MO - [Forms W-10/P-10 (linked from St. Louis: employer withholding and payroll expens)](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/documents/p-10-w-10-form-fillable.cfm) (last changed: 2026-10-20)
- MO - [Missouri DOR -- 2025 Missouri Withholding Tax Formula](https://dor.mo.gov/forms/Withholding%20Formula_2025.pdf) (last changed: 2026-10-20)
- MO - [Missouri Department of Labor and Industrial Relations -- Minimum Wage](https://labor.mo.gov/dls/minimum-wage) (last changed: 2026-10-20)
- MO - [Missouri Department of Revenue: news](https://dor.mo.gov/news/) (last changed: 2026-10-24)
- MO - [Missouri withholding](https://dor.mo.gov/taxation/business/tax-types/withholding/) (last changed: 2026-10-20)
- MO - [St. Louis: employer withholding and payroll expense tax information](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/payroll-tax-info.cfm) (last changed: 2026-10-20)
- MO - [W-3 Reconciliation (linked from St. Louis: employer withholding and payroll expens)](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/documents/w-3-form.cfm) (last changed: 2026-10-20)
- MS - [1099 Guidance for Recipients (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/1099%20guidance%20for%20recipients.pdf) (last changed: 2026-10-20)
- MS - [2022 (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/with_TY2022ApprovedProviders.pdf) (last changed: 2026-10-20)
- MS - [2023 (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/2023ApprovedProvidersWTH_20240408.pdf) (last changed: 2026-10-20)
- MS - [2024 (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/2024ApprovedWTHProviders.pdf) (last changed: 2026-10-20)
- MS - [2025 (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/2025WithholdingApprovedProvidersRev2.4.26.pdf) (last changed: 2026-10-20)
- MS - [Ackerman Tourism and Parks and Recreation Tax (linked from Mississippi Department of Revenue: news)](https://www.dor.ms.gov/sites/default/files/news/72-26-14%20Ackerman%20Tourism%20and%20Parks%20and%20Recreation%20Tax.pdf) (last changed: 2026-10-20)
- MS - [Bi-Weekly (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/Bi-weekly2026.pdf) (last changed: 2026-10-20)
- MS - [Daily​​​ (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/Daily2026.pdf) (last changed: 2026-10-20)
- MS - [Flowchart​​​​​ (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/Computer%20Payroll%20Flowchart%20-%20updated%208-13-25.pdf) (last changed: 2026-10-20)
- MS - [HERE (linked from Mississippi Department of Revenue: news)](https://www.dor.ms.gov/sites/default/files/notices-technical-bulletins/MS%20WTH%20Gaming%20Winnings%20Notice%209-21-26.pdf) (last changed: 2026-10-20)
- MS - [HERE (linked from Mississippi Department of Revenue: news)](https://www.dor.ms.gov/sites/default/files/news/2026%20Second%20Amendment%20Sales%20Tax%20Holiday%20Updated%205-26-2026.pdf) (last changed: 2026-10-20)
- MS - [HERE (linked from Mississippi Department of Revenue: news)](https://www.dor.ms.gov/sites/default/files/notices-technical-bulletins/72-26-15%20City%20Modernization%20Expenditure.pdf) (last changed: 2026-10-20)
- MS - [Here (linked from Mississippi Department of Revenue: news)](https://www.dor.ms.gov/sites/default/files/news/2026%20Sales%20Tax%20Holiday.pdf) (last changed: 2026-10-20)
- MS - [MS Administrative Code, Title 35, Part III, Subpart 11 (linked from Mississippi withholding)](https://www.sos.ms.gov/adminsearch/ACCode/00000158c.pdf) (last changed: 2026-10-20)
- MS - [MVS Abandonment Changes July 1 2026 (linked from Mississippi Department of Revenue: news)](https://www.dor.ms.gov/sites/default/files/notices-technical-bulletins/Notice%20-%20MVS%20Abandonment%20Changes%20July%201%202026_0.pdf) (last changed: 2026-10-20)
- MS - [Mississippi Department of Employment Security -- Employer FAQs](https://mdes.ms.gov/employer-faqs/) (last changed: 2026-10-20)
- MS - [Mississippi Department of Revenue: news](https://www.dor.ms.gov/news) (last changed: 2026-10-20)
- MS - [Mississippi withholding](https://www.dor.ms.gov/business/withholding-tax) (last changed: 2026-10-20)
- MS - [Monthly​​​ (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/Monthly2026.pdf) (last changed: 2026-10-20)
- MS - [NSM Fee Rate Increase (linked from Mississippi Department of Revenue: news)](https://www.dor.ms.gov/sites/default/files/notices-technical-bulletins/72-26-10%202026%20NSM%20Fee%20Rate%20Increase.pdf) (last changed: 2026-10-20)
- MS - [Pub 89-700-25-1 (Rev. 07/25) -- Withholding Income Tax Tables and Employer Instructions, effective J](https://www.dor.ms.gov/sites/default/files/tax-forms/business/89700251revised1.13.2026.pdf) (last changed: 2026-10-20)
- MS - [Pub. 89-145 (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/89-145-25%201.pdf) (last changed: 2026-10-20)
- MS - [Semi-Monthly​​ (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/Semi-monthly2026.pdf) (last changed: 2026-10-20)
- MS - [To download Form UI-3B, click here. (linked from Mississippi Department of Employment Security -- E)](https://mdes.ms.gov/media/10385/UI_3B.pdf) (last changed: 2026-10-20)
- MS - [USDA National Finance Center -- Mississippi State Income Tax Withholding (NFC-25-1745343478, effecti](https://help.nfc.usda.gov/bulletins/2025/1745343478.htm) (last changed: 2026-10-20)
- MS - [USDA National Finance Center -- Mississippi State Income Tax Withholding bulletin (NFC-26-1768327516](https://help.nfc.usda.gov/bulletins/2026/1768327516.htm) (last changed: 2026-10-20)
- MS - [W2-1099 Mandate (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/W2-1099%20Mandate.pdf) (last changed: 2026-10-20)
- MS - [Weekly​​​ (linked from Mississippi withholding)](https://www.dor.ms.gov/sites/default/files/business/Weekly2026.pdf) (last changed: 2026-10-20)
- MT - [2026 Form MW-4, Montana Employee's Withholding and Exemption Certificate](https://revenuefiles.mt.gov/files/Forms/Montana_Employee_Withholding_Allowance_and_Exemption_Certificate_Form_MW-4.pdf) (last changed: 2026-10-20)
- MT - [2026 Montana Minimum Wage Determination Letter (linked from Montana DLI -- Montana's Minimum Wage)](https://erd.dli.mt.gov/_docs/labor-standards/MW-Determination-Letter.2026.pdf) (last changed: 2026-10-27)
- MT - [2026 Montana Publication 1, A Guide to Montana Tax Withholding and Estimated Payments](https://revenuefiles.mt.gov/files/Forms/Publication-1/Publication-1-2026.pdf) (last changed: 2026-10-20)
- MT - [Download the 2027 Montana Wage & Hour Poster in Spanish (linked from Montana DLI -- Montana's Minimu](https://erd.dli.mt.gov/labor-standards/wage-and-hour-payment-act/2027-MINIMUM-WAGE-POSTER-in-SPANISH.pdf) (last changed: 2026-10-27)
- MT - [Montana Annual W-2 1099 Withholding Tax Reconciliation - Form MW-3 (PD (linked from Montana withhold](https://revenuefiles.mt.gov/files/Forms/Montana_Annual_W-2_1099_Withholding_Tax_Reconciliation_Form_MW-3.pdf) (last changed: 2026-10-20)
- MT - [Montana DLI -- Montana's Minimum Wage](https://erd.dli.mt.gov/labor-standards/wage-and-hour-payment-act/state-minimum-wage) (last changed: 2026-10-26)
- MT - [Montana DLI -- UI Contribution Rate Schedules (all 12 schedules, I-XII)](https://uid.dli.mt.gov/employers/schedule-of-contribution-rates) (last changed: 2026-10-20)
- MT - [Montana Employer and Information Agent Guide (publication page)](https://revenue.mt.gov/publications/montana-employer-and-information-agent-guide) (last changed: 2026-10-20)
- MT - [Montana Employer and Information Agent Guide with Montana Withholding Tax Tables (V4, November 2025)](https://revenuefiles.mt.gov/files/Forms/Montana_Employer_and_Information_Agent_Guide_with_Tax_Tables.pdf) (last changed: 2026-10-20)
- MT - [Montana Withholding Tax Payment Voucher - Form MW-1 (PDF) (linked from Montana withholding)](https://revenuefiles.mt.gov/files/Forms/Montana_Withholding_Tax_Payment_Voucher_Form_MW-1.pdf) (last changed: 2026-10-20)
- MT - [Montana withholding](https://revenue.mt.gov/taxes/withholding-tax/wage-withholding-returns-and-payments) (last changed: 2026-10-20)
- MT - [Montana withholding news](https://revenue.mt.gov/news/recent-news/2026-withholding-updates) (last changed: 2026-10-20)
- NC - [N.C. Gen. Stat. § 1-362 — wages/personal earnings exempt from attachment/garnishment for ordinary ju](https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_1/GS_1-362.html) (last changed: 2026-10-20)
- NC - [North Carolina 2026 Income Tax Withholding Tables and Instructions for Employers, Section 6](https://www.ncdor.gov/income-tax-withholding-tables-and-instructions-employers/open) (last changed: 2026-10-20)
- NC - [North Carolina Department of Revenue: news](https://www.ncdor.gov/news) (last changed: 2026-10-20)
- NC - [North Carolina withholding](https://www.ncdor.gov/taxes-forms/withholding-tax) (last changed: 2026-10-20)
- NC - [USDA National Finance Center -- North Carolina Income Tax Withholding (2025)](https://help.nfc.usda.gov/bulletins/2025/1740006150.htm) (last changed: 2026-10-20)
- ND - [2026 Income Tax Withholding Rates and Instructions (North Dakota Office of State Tax Commissioner)](https://www.tax.nd.gov/sites/www/files/documents/forms/individual/2026-iit/2026-income-tax-withholding-rates-booklet.pdf) (last changed: 2026-10-20)
- ND - [Form NDW-R -- Reciprocity Exemption from Withholding for Qualifying Minnesota and Montana Residents](https://www.tax.nd.gov/sites/www/files/documents/forms/business/ndwrfillable.pdf) (last changed: 2026-10-20)
- ND - [North Dakota Office of State Tax Commissioner -- Income Tax Withholding Rates and Instructions, 2025](https://www.tax.nd.gov/sites/www/files/documents/misc-discuss-folder/Final_2025%20Income%20Tax%20Withholding%20Rates%20%20Instructions.pdf) (last changed: 2026-10-20)
- ND - [North Dakota Office of State Tax Commissioner: news](https://www.tax.nd.gov/news) (last changed: 2026-10-20)
- ND - [North Dakota withholding](https://www.tax.nd.gov/income-tax-withholding) (last changed: 2026-10-20)
- NE - [A Guide to Understanding Nebraska's Unemployment Insurance Combined Tax Rates (2026)](https://dol.nebraska.gov/webdocs/Resources/Items/2026%20UI%20guide%20to%20understanding.pdf) (last changed: 2026-10-20)
- NE - [Nebraska 2026 Circular EN, Pensions and Annuities](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026cir_en_whole.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Attorney General -- suit against the City of Omaha over its minimum wage ordinance](https://ago.nebraska.gov/news/attorney-general-hilgers-sues-city-omaha-over-unconstitutional-minimum-wage-ordinance) (last changed: 2026-10-20)
- NE - [Nebraska DOR -- Nebraska Income Tax Withholding Percentage Method Tables (For Wages Paid on or After](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2024/2025_percent.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Department of Labor -- Nebraska's Minimum Wage Increases to $15 Effective January 1, 2026](https://dol.nebraska.gov/PressRelease/Details/338) (last changed: 2026-10-20)
- NE - [Nebraska Department of Labor -- State of Nebraska Minimum Wage (updated 7/31/2026)](https://dol.nebraska.gov/webdocs/getfile/18bc2309-85ed-4957-b072-e899caeaca99) (last changed: 2026-10-26)
- NE - [Nebraska Department of Revenue: news](https://revenue.nebraska.gov/news) (last changed: 2026-10-20)
- NE - [Nebraska Income Tax Withholding Percentage Method — Withholding Allowance Table](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026_percent.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Legislative Bill 258 (2026), approved by the Governor February 9, 2026](https://nebraskalegislature.gov/FloorDocs/109/PDF/Slip/LB258.pdf) (last changed: 2026-10-20)
- NE - [Nebraska withholding](https://revenue.nebraska.gov/businesses/nebraska-income-tax-withholding) (last changed: 2026-10-20)
- NE - [USDA National Finance Center -- Nebraska State Income Tax Withholding (2025)](https://help.nfc.usda.gov/bulletins/2025/1740158785.htm) (last changed: 2026-10-20)
- NJ - [Form NJ-165 -- Employee's Certificate of Nonresidence in New Jersey](https://www.nj.gov/treasury/taxation/pdf/current/nj165.pdf) (last changed: 2026-10-20)
- NJ - [Form NJ-W4, Employee's Withholding Allowance Certificate (1-21, last modified 2022-12-06)](https://nj.gov/treasury/taxation/pdf/current/njw4.pdf) (last changed: 2026-10-20)
- NJ - [NJ Division of Temporary Disability and Family Leave Insurance — Worker FLI contribution rate](https://www.nj.gov/labor/myleavebenefits/worker/fli/) (last changed: 2026-10-20)
- NJ - [NJ Division of Temporary Disability and Family Leave Insurance — Worker TDI contribution rate](https://www.nj.gov/labor/myleavebenefits/worker/tdi/) (last changed: 2026-10-20)
- NJ - [NJDOL press release 2026-09-29 -- minimum wage to increase to $16.48 on Jan. 1](https://www.nj.gov/labor/lwdhome/press/2026/20260929_min_wage.shtml) (last changed: 2026-10-26)
- NJ - [NJDOL — New Benefit Rates for 2026 (taxable wage bases)](https://www.nj.gov/labor/lwdhome/press/2025/20251229_newbenefitrates2026.shtml) (last changed: 2026-10-20)
- NJ - [New Jersey Department of Labor and Workforce Development -- minimum wage increase announcement for J](https://www.nj.gov/labor/lwdhome/press/2025/20251001_Minimum_Wage.shtml) (last changed: 2026-10-20)
- NJ - [New Jersey NJ-WT withholding instructions](https://www.nj.gov/treasury/taxation/pdf/current/njwt.pdf) (last changed: 2026-10-20)
- NJ - [New Jersey Office of Administrative Law -- Notice of Administrative Changes, Minimum Wage (N.J.A.C. ](https://www.nj.gov/labor/assets/PDFs/Legal%20Notices/Other/Public%20Notice%20Minimum%20Wage%202026_FINAL.pdf) (last changed: 2026-10-20)
- NJ - [New Jersey Withholding Rate Tables (Percentage Method, effective Oct 1, 2020)](https://www.nj.gov/treasury/taxation/pdf/withholdingtables.pdf) (last changed: 2026-10-20)
- NM - [City of Albuquerque -- Albuquerque Minimum Wage Information](https://www.cabq.gov/legal/albuquerque-minimum-wage-information) (last changed: 2026-10-23)
- NM - [City of Santa Fe -- Living Wage Ordinance notice (Municipal Code Sec. 28-1 SFCC 1987)](https://santafenm.gov/media/news_pdf/2025_Living_Wage_Ordinance.pdf) (last changed: 2026-10-20)
- NM - [New Mexico TRD -- Important return changes for 2026 (WKC fee notice)](https://www.tax.newmexico.gov/individuals/wp-content/uploads/sites/5/2026/01/WKC-Fee-Payment-Other-Update-.pdf) (last changed: 2026-10-20)
- NM - [New Mexico Taxation and Revenue Department — FYI-104, New Mexico Withholding Tax](https://www.tax.newmexico.gov/forms-publications/) (last changed: 2026-10-20)
- NM - [New Mexico withholding (FYI-104)](https://realfile.tax.newmexico.gov/FYI-104.pdf) (last changed: 2026-10-20)
- NM - [New Mexico workers' compensation FAQ (fee amounts)](https://www.workerscomp.nm.gov/faqs/) (last changed: 2026-10-20)
- NM - [Santa Fe County -- Living Wage Ordinance and 2026 living wage adjustment announcement](https://www.santafecountynm.gov/livingwage) (last changed: 2026-10-23)
- NM - [Santa Fe city and county living wage figures in effect through February 2026](https://www.santafecountynm.gov/news/detail/santa-fe-county-announces-living-wage-increase-effective-march-1-2025) (last changed: 2026-10-20)
- NM - [Texas Workforce Commission cross-reference for New Mexico UI figures -- New Mexico DWS 'How UI Tax R](https://www.dws.state.nm.us/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated) (last changed: 2026-10-20)
- NM - [USDA National Finance Center -- New Mexico State Income Tax Withholding bulletin (2025)](https://help.nfc.usda.gov/bulletins/2025/1741189057.htm) (last changed: 2026-10-20)
- NY - [29 U.S.C. 2611(4)(A)(i)-(ii)](https://www.dol.gov/agencies/whd/fmla) (last changed: 2026-10-22)
- NY - [DOL -- Calculating an Employer's UI Contribution Rate](https://dol.ny.gov/calculating-employers-ui-contribution-rate) (last changed: 2026-10-20)
- NY - [DOL -- Employer Contribution Rate Table](https://dol.ny.gov/employer-contribution-rate-table) (last changed: 2026-10-20)
- NY - [DOL -- Subsidiary Contribution Rate Table](https://dol.ny.gov/subsidiary-rate-table) (last changed: 2026-10-20)
- NY - [DOL -- Unemployment Insurance Rate Information](https://dol.ny.gov/unemployment-insurance-rate-information) (last changed: 2026-10-20)
- NY - [EEOC -- Section 2, Threshold Issues](https://www.eeoc.gov/laws/guidance/section-2-threshold-issues) (last changed: 2026-10-20)
- NY - [IRS -- Determining if an employer is an applicable large employer](https://www.irs.gov/affordable-care-act/employers/determining-if-an-employer-is-an-applicable-large-employer) (last changed: 2026-10-20)
- NY - [IT-2104, Employee's Withholding Allowance Certificate (2026)](https://www.tax.ny.gov/pdf/current_forms/it/it2104_fill_in.pdf) (last changed: 2026-10-20)
- NY - [Instructions for Form NYS-45 (tax.ny.gov)](https://www.tax.ny.gov/pdf/current_forms/wt/nys45i.pdf) (last changed: 2026-10-20)
- NY - [NY Department of Labor -- Register for Unemployment Insurance](https://dol.ny.gov/register-unemployment-insurance-0) (last changed: 2026-10-20)
- NY - [NY Department of Labor -- Worker Adjustment and Retraining Notification (WARN)](https://dol.ny.gov/worker-adjustment-and-retraining-notification-warn) (last changed: 2026-10-20)
- NY - [NY Paid Family Leave payroll deduction notice 2026 (rate and cap)](https://www.wcb.ny.gov/content/main/forms/PFLDocs/pfl-pay-deduction-notice-2026.pdf) (last changed: 2026-10-20)
- NY - [NY State Comptroller payroll bulletins (PFL, withholding changes)](https://www.osc.ny.gov/state-agencies/payroll-bulletins) (last changed: 2026-10-20)
- NY - [NY Workers' Compensation Board: Paid Family Leave 2026 announcement](https://www.wcb.ny.gov/content/main/PressRe/paid-family-leave-2026.jsp) (last changed: 2026-10-20)
- NY - [New York City withholding tax tables and methods (NYS-50-T-NYC)](https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nyc.pdf) (last changed: 2026-10-20)
- NY - [New York Department of Taxation: press](https://www.tax.ny.gov/press/) (last changed: 2026-10-20)
- NY - [New York NYS-50-T-NYS](https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf) (last changed: 2026-10-20)
- NY - [New York State Department of Labor -- Home Care Aide Minimum Wage Fact Sheet (P105)](https://dol.ny.gov/home-care-aide-minimum-wage-fact-sheet-p105) (last changed: 2026-10-20)
- NY - [New York State Department of Labor -- Minimum Wage (rates effective 01/01/2026)](https://dol.ny.gov/minimum-wage-0) (last changed: 2026-10-20)
- NY - [New York State Department of Labor -- Your New York State Minimum Wage](https://dol.ny.gov/minimum-wage) (last changed: 2026-10-26)
- NY - [New York withholding tax](https://www.tax.ny.gov/bus/wt/wtidx.htm) (last changed: 2026-10-20)
- NY - [U.S. DOL -- COBRA Continuation Coverage](https://www.dol.gov/general/topic/health-plans/cobra) (last changed: 2026-10-22)
- NY - [U.S. DOL Wage and Hour Opinion Letter (1986-05-07) on county-appointed poll workers](https://www.dol.gov/agencies/whd/compliance-assistance/handy-reference-guide-flsa) (last changed: 2026-10-22)
- NY - [Yonkers withholding tax tables and methods (NYS-50-T-Y)](https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_y.pdf) (last changed: 2026-10-20)
- NY - [data/minimum-wage/federal-2026.json (this engine's own federal minimum wage file)](https://www.dol.gov/agencies/whd/flsa) (last changed: 2026-10-22)
- NY - [eCFR 29 CFR 553.106 amendment history - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?section=553.106) (last changed: 2026-10-20)
- OH - [https://www.ccaohio.gov/member-municipalities](https://www.ccaohio.gov/member-municipalities) (last changed: 2026-10-13)
- OH - [CCA (Central Collection Agency): municipal income tax calendar and notices](https://www.ccaohio.gov/due-dates/municipal-income-tax-calendar) (last changed: 2026-10-18)
- OH - [CCA Division of Taxation -- Tax Rates (2026 and 2025 tables)](https://www.ccaohio.gov/tax-rates) (last changed: 2026-09-30)
- OH - [City of Cheviot Tax Department -- JEDD INFORMATION (Contracts with Green Township)](https://cheviot.org/departments/tax/) (last changed: 2026-10-20)
- OH - [City of Dayton -- Joint Economic Development District](https://www.daytonohio.gov/261/Joint-Economic-Development-District) (last changed: 2026-09-30)
- OH - [City of Gallipolis Tax Department](https://cityofgallipolis.com/tax-department-2/) (last changed: 2026-10-20)
- OH - [City of Warren Income Tax Department -- Joint Economic Development Districts: 'The Warren-Champion J](https://www.warren.org/income_tax_department/joint_economic_development_districts_(jedd).php) (last changed: 2026-10-20)
- OH - [Combined Form IT 4 — Employee's Withholding Exemption Certificate (post-2020-12-07 combined version)](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth-it4-combined-fi.pdf) (last changed: 2026-09-24)
- OH - [Employer Withholding Taxes - Percentage Method (Effective August 1, 2026)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2026%20Withholding%20Tables/WHT_PercentageMethod_2026.pdf) (last changed: 2026-09-24)
- OH - [Jefferson Township -- Jefferson Township-Whitehall JEDD: 'On November 19th, 2024 ... mutually agreed](https://www.jeffersontownship.org/departments___services/economic_development___planning/jefferson_township-whitehall_jedd.php) (last changed: 2026-10-20)
- OH - [Ohio Department of Commerce -- Ohio Minimum Wage Set to Increase in 2026](https://com.ohio.gov/about-us/media-center/news/ohio%20minimum%20wage%20set%20to%20increase%20in%202026) (last changed: 2026-09-24)
- OH - [Ohio Department of Commerce -- Ohio minimum wage to increase by 3.5% in 2027](https://com.ohio.gov/about-us/media-center/news/Ohio-Minimum-Wage-to-Increase-in-2027) (last changed: 2026-10-26)
- OH - [Ohio Department of Taxation -- Employer Withholding Taxes, Percentage Method (Effective October 1, 2](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2025%20Withholding%20Tables/WHT_PercentageMethod_2025.pdf) (last changed: 2026-09-24)
- OH - [Ohio Department of Taxation -- School Districts With an Income Tax for 2025 (Updated School District](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2024-2025%20NYP%20Updates/School_Districts_2025.pdf) (last changed: 2026-09-30)
- OH - [Ohio Department of Taxation: all news](https://tax.ohio.gov/wps/portal/gov/tax/home/news-and-events/all-news/) (last changed: 2026-10-18)
- OH - [Ohio Department of Taxation: information releases](https://tax.ohio.gov/wps/portal/gov/tax/help-center/communications/information-releases) (last changed: 2026-10-18)
- OH - [Ohio Department of Taxation: municipal income tax (state page for municipalities and employers)](https://tax.ohio.gov/business/municipalities) (last changed: 2026-10-18)
- OH - [Ohio Dept of Taxation: school district income tax list](https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf) (last changed: 2026-09-24)
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
- OH - [R.C. 2716.02 — maximum garnishment is the lesser of 25% of disposable earnings, or the amount by whi](https://codes.ohio.gov/ohio-revised-code/section-2716.02) (last changed: 2026-10-18)
- OH - [The Finder: directory of every Ohio municipality (a new entry here is a new jurisdiction)](https://thefinder.tax.ohio.gov/api/file-downloads?type=municipality) (last changed: 2026-10-17)
- OH - [The Finder: directory of every Ohio school district](https://thefinder.tax.ohio.gov/api/file-downloads?type=schoolDistrict) (last changed: 2026-10-18)
- OH - [Village of Georgetown -- Income Tax](https://georgetownohio.gov/income-tax/) (last changed: 2026-10-04)
- OH - [Village of Indian Hill -- Tax](https://indianhill.gov/departments/tax/) (last changed: 2026-09-30)
- OH - [Village of Woodville -- Important Tax Notification (1% local municipal income tax from July 1, 2026,](https://www.villageofwoodville.com/_files/ugd/ef2ef5_5f60f5fa78e64495b52690728f655b41.pdf) (last changed: 2026-10-20)
- OH - [Village of Woodville -- Ordinance No. 1-2026, passed 02-09-2026: levies the village income tax, 'beg](https://www.villageofwoodville.com/_files/ugd/ef2ef5_fc1ed5429f25479b939fd57201b684f7.pdf) (last changed: 2026-10-20)
- OH - [Village of Woodville: income tax page (withholding notice, forms, ordinance)](https://www.villageofwoodville.com/tax-information) (last changed: 2026-10-18)
- OK - [Form OK-W-4 (Rev. 3-2021) -- Employee's State Withholding Allowance Certificate](https://oklahoma.gov/content/dam/ok/en/tax/documents/forms/businesses/general/OK-W-4.pdf) (last changed: 2026-10-20)
- OK - [Oklahoma Employment Security Commission -- Important Numbers for Employers 2026](https://oklahoma.gov/content/dam/ok/en/oesc/images/misc/Employer-Improtant-Numbers-2026.pdf) (last changed: 2026-10-20)
- OK - [Oklahoma Tax Commission -- 2025 Oklahoma Income Tax Withholding Tables (Packet OW-2, revised 11-2024](https://www.oklahoma.gov/content/dam/ok/en/tax/documents/resources/publications/businesses/withholding-tables/WHTables-2025.pdf) (last changed: 2026-10-20)
- OK - [Oklahoma Tax Commission: home (announcements)](https://oklahoma.gov/tax.html) (last changed: 2026-10-20)
- OK - [Oklahoma withholding OW-2](https://oklahoma.gov/tax/businesses/withholding.html) (last changed: 2026-10-20)
- OK - [Packet OW-2 (Revised 11-2025) -- 2026 Oklahoma Income Tax Withholding Tables](https://www.oklahoma.gov/content/dam/ok/en/tax/documents/resources/publications/businesses/withholding-tables/WHTables-2026.pdf) (last changed: 2026-10-20)
- OR - [150-206-436 (Rev. 12-31-25) Oregon Withholding Tax Formulas, effective 2026-01-01](https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf) (last changed: 2026-10-20)
- OR - [150-211-503 (Rev. 11-18-25) A Guide to TriMet and Lane Transit Payroll Taxes](https://www.oregon.gov/dor/forms/formspubs/transit-payroll-taxes_211-503.pdf) (last changed: 2026-10-20)
- OR - [2026 Oregon Combined Payroll Tax Report Instructions](https://www.oregon.gov/dor/forms/FormsPubs/combined-payroll_211-155-2_2026.pdf) (last changed: 2026-10-20)
- OR - [Canby Area Transit Taxes: A guide for businesses](https://www.canbyoregon.gov/sites/default/files/fileattachments/transit_tax/page/2041/transit_tax_guide_for_businesses.pdf) (last changed: 2026-10-20)
- OR - [Current Tax and Contribution Rates (Oregon Employment Department)](https://www.oregon.gov/employ/businesses/pages/current-tax-rate.aspx) (last changed: 2026-10-20)
- OR - [ORS 18.385(2) — 75% of disposable earnings exempt from execution, or a flat per-period dollar minimu](https://www.oregonlegislature.gov/bills_laws/ors/ors018.html) (last changed: 2026-10-20)
- OR - [Oregon DOR -- Withholding Tax Formulas, 150-206-436 (Rev. 12-10-24) for 2025](https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2025.pdf) (last changed: 2026-10-20)
- OR - [Oregon Department of Revenue: Statewide Transit Tax (webpage)](https://www.oregon.gov/dor/programs/businesses/pages/statewide-transit-tax.aspx) (last changed: 2026-10-20)
- OR - [Oregon Workers' Benefit Fund rule changes](https://wcd.oregon.gov/laws/Pages/new-rules.aspx) (last changed: 2026-10-20)
- OR - [Oregon local minimum-wage/regional rate history (July 2025 - June 2026 figures)](https://www.oregon.gov/boli/workers/pages/minimum-wage.aspx) (last changed: 2026-10-20)
- OR - [Oregon payroll tax](https://www.oregon.gov/dor/programs/businesses/pages/payroll-updates.aspx) (last changed: 2026-10-20)
- OR - [Oregon withholding and payroll tax](https://www.oregon.gov/dor/programs/businesses/pages/withholding-and-payroll-tax.aspx) (last changed: 2026-10-20)
- OR - [Paid Leave Oregon — Contributions Calculator / rate page](https://paidleave.oregon.gov/employers/contributions-calculator.html) (last changed: 2026-10-20)
- OR - [Personal Income Tax Withholding Information for Employers/Payroll Providers](https://www.portland.gov/revenue/withholding) (last changed: 2026-10-20)
- OR - [Sandy Area Metro (SAM) Payroll and Self-Employment Tax Instructions](https://www.ci.sandy.or.us/sites/default/files/fileattachments/economic_development/page/4671/transit_tax_instructions.pdf) (last changed: 2026-10-20)
- PA - [42 Pa. Cons. Stat. § 8127 — wages/salaries/commissions exempt from attachment, execution or other pr](https://www.legis.state.pa.us/WU01/LI/LI/CT/HTM/42/00.081.027.000..HTM) (last changed: 2026-10-18)
- PA - [City of Pittsburgh -- ET-1 2025 Payroll Expense Tax return and instructions (Rev 12/24)](https://www.pittsburghpa.gov/files/assets/city/v/1/finance/documents/tax-faqs/et-2025-fillable.pdf) (last changed: 2026-10-20)
- PA - [Maryland Form MW507 (COM/RAD-036, 07/25 revision) -- 2026 Employee's Maryland Withholding Exemption ](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/forms/2026/mw507.pdf) (last changed: 2026-09-24)
- PA - [PA DCED -- Local Services Tax (LST)](https://dced.pa.gov/local-government/local-income-tax-information/local-services-tax/) (last changed: 2026-09-24)
- PA - [PA DCED Municipal Statistics -- EIT/PIT/LST Tax Register with Collector (statewide, official) -- 202](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2025) (last changed: 2026-09-30)
- PA - [PA DCED Municipal Statistics: statewide EIT/PIT/LST register, 2026 (every municipality and school di](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2026) (last changed: 2026-09-24)
- PA - [PA DCED Municipal Statistics: statewide EIT/PIT/LST register, 2027 (every municipality and school di](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2027) (last changed: 2026-10-20)
- PA - [PA Department of Labor & Industry -- UC Computation of Rates](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/computation-of-rates) (last changed: 2026-10-02)
- PA - [PA Department of Labor & Industry -- UC employee withholding (0.07% since 2018)](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/employee-withholding) (last changed: 2026-09-24)
- PA - [PA Department of Labor & Industry -- Yearly Tax Highlights (UC)](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/yearly-tax-highlights) (last changed: 2026-10-07)
- PA - [REV-415 (SU) 01-23 -- Employer Withholding Information Guide](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/employerwithholding/documents/rev-415.pdf) (last changed: 2026-09-24)
- PA - [REV-419 (EX) 09-20, instructions REV-419 IN (EX) 03-24 -- Employee's Nonwithholding Application Cert](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/employerwithholding/documents/rev-419.pdf) (last changed: 2026-09-24)
- PA - [UC-748 (REV 09-25) -- Contribution Rates Effective January 1, 2026](https://www.pa.gov/content/dam/copapwp-pagov/en/dli/documents/uc/employer/uc-tax-rates/uc-748%20rev%2009-25.pdf) (last changed: 2026-09-24)
- RI - [2026 Rhode Island Employer's Income Tax Withholding Tables (RI Division of Taxation)](https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-12/2026%20Withholding%20Tax%20Booklet.pdf) (last changed: 2026-10-20)
- RI - [R.I. Gen. Laws 28-12-3 as amended in 2025 ($17.00 from 2027)](https://webserver.rilegislature.gov/Statutes/TITLE28/28-12/28-12-3.htm) (last changed: 2026-10-26)
- RI - [RI DLT -- 2025 Tax Rates for Unemployment Insurance and Temporary Disability Insurance (2024-12-20)](https://dlt.ri.gov/press-releases/2025-tax-rates-unemployment-insurance-and-temporary-disability-insurance) (last changed: 2026-10-20)
- RI - [RI Department of Labor & Training: 2026 TDI/TCI and UI Tax Rates](https://dlt.ri.gov/press-releases/2026-tax-rates-unemployment-insurance-and-temporary-disability-insurance) (last changed: 2026-10-20)
- RI - [Reciprocity check (Rhode Island has NONE with Massachusetts or Connecticut, its only bordering state](https://www.mass.gov/info-details/learn-about-the-income-tax-paid-to-another-jurisdiction-credit) (last changed: 2026-10-22)
- RI - [Rhode Island Division of Taxation -- 2025 Rhode Island Withholding Tax Booklet](https://tax.ri.gov/sites/g/files/xkgbur541/files/2024-12/2025%20Withholding%20Tax%20Booklet_0.pdf) (last changed: 2026-10-20)
- RI - [Rhode Island Division of Taxation: news](https://tax.ri.gov/news) (last changed: 2026-10-20)
- RI - [Rhode Island withholding](https://tax.ri.gov/tax-sections/withholding-tax) (last changed: 2026-10-20)
- SC - [S.C. Code Ann. § 15-39-410 — earnings of the debtor for personal services excluded from property rea](https://www.scstatehouse.gov/code/t15c039.php) (last changed: 2026-10-19)
- SC - [SC Department of Employment and Workforce -- 2026 Tax Rate Cuts Press Release](https://dew.sc.gov/news/2025-11/2026-tax-rate-cuts-press-release) (last changed: 2026-10-19)
- SC - [SC Information Letter #26-20 (Aug. 31, 2026) -- Individual Income Tax Reform (Act 110 of 2026)](https://dor.sc.gov/sites/dor/files/policies/IL26-20.pdf) (last changed: 2026-10-19)
- SC - [SC W-4 (Rev. 12/5/25) -- South Carolina Employee's Withholding Allowance Certificate, 2026](https://dor.sc.gov/sites/dor/files/forms/SCW4_2026.pdf) (last changed: 2026-10-19)
- SC - [South Carolina DOR -- WH-1603F Formula for Computing South Carolina 2025 Withholding Tax (Rev. 11/12](https://dor.sc.gov/sites/dor/files/forms/WH1603F_2025.pdf) (last changed: 2026-10-19)
- SC - [South Carolina Department of Revenue: news](https://dor.sc.gov/news) (last changed: 2026-10-20)
- SC - [South Carolina withholding](https://dor.sc.gov/withholding) (last changed: 2026-10-19)
- SC - [WH-105 (Rev. 2/13/23) -- South Carolina Withholding Tax Information Guide](https://dor.sc.gov/sites/dor/files/forms/WH105.pdf) (last changed: 2026-10-19)
- SC - [WH-1603F (Rev. 11/4/25) -- Formula for Computing South Carolina 2026 Withholding Tax](https://dor.sc.gov/sites/dor/files/forms/WH1603F_2026.pdf) (last changed: 2026-10-19)
- US - [https://apps.dced.pa.gov/munstats-public/FindLocalTax.aspx](https://apps.dced.pa.gov/munstats-public/FindLocalTax.aspx) (last changed: 2026-09-24)
- US - [https://thefinder.tax.ohio.gov/?tab=fileDownloads](https://thefinder.tax.ohio.gov/?tab=fileDownloads) (last changed: 2026-09-24)
- US - [DOL FUTA credit reduction states](https://oui.doleta.gov/unemploy/futa_credit.asp) (last changed: 2026-09-24)
- US - [DOL Fact Sheet #30: Wage Garnishment Protections of the Consumer Credit Protection Act (CCPA)](https://www.dol.gov/agencies/whd/fact-sheets/30-cppa) (last changed: 2026-09-24)
- US - [DOL consolidated state minimum wage table](https://www.dol.gov/agencies/whd/mw-consolidated) (last changed: 2026-09-24)
- US - [DOL elaws: FLSA/CCPA Wage Garnishment — Basic Provisions/Requirements](https://webapps.dol.gov/elaws/elg/garnish.htm) (last changed: 2026-09-24)
- US - [DOL state minimum wage laws](https://www.dol.gov/agencies/whd/minimum-wage/state) (last changed: 2026-09-24)
- US - [Executive Order 14236, Additional Rescissions of Harmful Executive Orders and Actions (2025-03-14), ](https://www.dol.gov/agencies/whd/government-contracts/eo14026) (last changed: 2026-09-24)
- US - [Federal Register: SSA yearly wage base notice (Cost-of-Living Increase and Other Determinations) - o](https://www.federalregister.gov/api/v1/documents.json?per_page=20&order=newest&fields%5B%5D=document_number&fields%5B%5D=title&fields%5B%5D=type&fields%5B%5D=publication_date&fields%5B%5D=effective_on&fields%5B%5D=html_url&conditions%5Bagencies%5D%5B%5D=social-security-administration&conditions%5Bterm%5D=%22cost-of-living+increase+and+other+determinations%22) (last changed: 2026-10-24)
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
- US - [P.L. 119-21 on govinfo.gov (official text)](https://www.govinfo.gov/app/details/PLAW-119publ21) (last changed: 2026-09-24)
- US - [RRB Program Letter 2025-01 (monthly base) and RRB FY2026 Justification of Budget Estimates (rates)](https://www.rrb.gov/sites/default/files/2025-07/JBE2026.pdf) (last changed: 2026-09-30)
- US - [U.S. DOL Wage and Hour Division -- Fact Sheet 17A: Exemption for Executive, Administrative, Professi](https://www.dol.gov/agencies/whd/fact-sheets/17a-overtime) (last changed: 2026-09-24)
- US - [U.S. DOL Wage and Hour Division -- Minimum Wages for Tipped Employees (table current as of July 1, 2](https://www.dol.gov/agencies/whd/state/minimum-wage/tipped) (last changed: 2026-09-24)
- US - [US Railroad Retirement Board, Program Letter 2025-01](https://www.rrb.gov/Employers/Publications/ProgramAndCircularLetters/PL25-01) (last changed: 2026-09-30)
- US - [eCFR 29 CFR 870 amendment history (garnishment limits) - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?part=870) (last changed: 2026-09-24)
- US - [eCFR 34 CFR 34 amendment history (administrative wage garnishment) - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-34.json?part=34) (last changed: 2026-09-24)
- UT - [Utah Pub 14 page](https://tax.utah.gov/forms-pubs/pub-14/) (last changed: 2026-10-23)
- UT - [Utah Publication 14 (withholding)](https://files.tax.utah.gov/tax/forms/pubs/pub-14.pdf) (last changed: 2026-09-24)
- UT - [Utah State Tax Commission -- Publication 14 Rev. 4/24, Withholding Tax Guide](https://files.tax.utah.gov/tax/forms/2024/pub-14.pdf) (last changed: 2026-09-30)
- UT - [Utah State Tax Commission -- Publication 14 Rev. 4/25, Withholding Tax Guide](https://files.tax.utah.gov/tax/forms/2025/pub-14.pdf) (last changed: 2026-09-30)
- UT - [Utah State Tax Commission UI wage base / tax rate page](https://jobs.utah.gov/ui/employer/Public/Questions/TaxRates.aspx) (last changed: 2026-09-24)
- UT - [Utah State Tax Commission: news releases](https://tax.utah.gov/news/) (last changed: 2026-10-23)
- UT - [Utah State Tax Commission: tax bulletins](https://tax.utah.gov/tax-bulletins/) (last changed: 2026-10-23)
- VA - [Code of Virginia 40.1-28.10 -- Minimum wages](https://law.lis.virginia.gov/vacode/title40.1/chapter3/section40.1-28.10/) (last changed: 2026-10-26)
- VA - [Form VA-4, Employee's Virginia Income Tax Withholding Exemption Certificate (Rev. 04/26) + Personal ](https://www.tax.virginia.gov/sites/default/files/taxforms/withholding/any/va-4-any.pdf) (last changed: 2026-10-20)
- VA - [Va. Code Ann. § 34-29 — ordinary garnishment limited to the lesser of 25% of disposable earnings, or](https://law.lis.virginia.gov/vacode/title34/chapter4/section34-29/) (last changed: 2026-10-20)
- VA - [Virginia Department of Labor and Industry — 2026 minimum wage $12.77/hr effective 2026-01-01](https://doli.virginia.gov/2025/07/29/virginia-minimum-wage-rate-increasing-effective-january-1-2026/) (last changed: 2026-10-20)
- VA - [Virginia Paid Family and Medical Leave Insurance Program -- Governor's own press release](https://www.governor.virginia.gov/newsroom/news-releases/2026/may-releases/name-1117602-en.html) (last changed: 2026-10-20)
- VA - [Virginia Tax, Income Tax Withholding Guide for Employers (Rev. 10/26)](https://www.tax.virginia.gov/sites/default/files/vatax-pdf/employer-withholding-instructions.pdf) (last changed: 2026-10-20)
- VA - [Virginia Tax: news](https://www.tax.virginia.gov/news) (last changed: 2026-10-20)
- VA - [Virginia unemployment insurance -- VEC's own wage-base FAQ](https://www.vec.virginia.gov/FAQs/employers/what-wage-base-each-employee-i-will-pay-taxes) (last changed: 2026-10-20)
- VT - [Form W-4VT, Employee's Withholding Allowance Certificate (Rev. 12/18)](https://tax.vermont.gov/sites/tax/files/documents/W-4VT.pdf) (last changed: 2026-10-20)
- VT - [GB-1210-2026, 2026 Income Tax Withholding Instructions, Tables, and Charts](https://tax.vermont.gov/sites/tax/files/documents/GB-1210-2026.pdf) (last changed: 2026-10-20)
- VT - [Governor Phil Scott Launches Voluntary Paid Family and Medical Leave Program — Office of Governor Ph](https://governor.vermont.gov/vtfmli) (last changed: 2026-10-20)
- VT - [Vermont Department of Taxes -- GB-1210, 2025 Income Tax Withholding Instructions, Tables, and Charts](https://tax.vermont.gov/sites/tax/files/documents/GB-1210-2025.pdf) (last changed: 2026-10-20)
- VT - [Vermont withholding](https://tax.vermont.gov/business/withholding) (last changed: 2026-10-20)
- WA - [City of Seattle Office of Labor Standards -- Minimum Wage Ordinance](https://www.seattle.gov/laborstandards/ordinances/minimum-wage) (last changed: 2026-10-20)
- WA - [City of Seattle, City Finance -- Payroll expense tax (2025 thresholds and rates)](https://www.seattle.gov/city-finance/business-taxes-and-licenses/seattle-taxes/payroll-expense-tax) (last changed: 2026-10-24)
- WA - [City of Seattle, City Finance -- Social Housing Tax](https://seattle.gov/city-finance/business-taxes-and-licenses/seattle-taxes/social-housing-tax) (last changed: 2026-10-24)
- WA - [ESD — Paid Family and Medical Leave premium rate increases to 1.13% in 2026](https://esd.wa.gov/about-us/news-release/2025/paid-family-medical-leave-premium-rate-increases-113-2026) (last changed: 2026-10-20)
- WA - [Employer Wage Reporting and Premiums Toolkit (v25.1, June 2026)](https://paidleave.wa.gov/app/uploads/2021/12/Employer-Wage-Reporting-and-Premiums-Toolkit-v25.1-2026.06.26.pdf) (last changed: 2026-10-20)
- WA - [L&I — Paid Family & Medical Leave (exempt employer/employee categories)](https://www.lni.wa.gov/workers-rights/leave/paid-family-and-medical-leave) (last changed: 2026-10-20)
- WA - [RCW 1.90.100 — Personal Income Tax Prohibition](https://app.leg.wa.gov/RCW/default.aspx?cite=1.90.100) (last changed: 2026-10-20)
- WA - [RCW 36.65.030 — Tax on net income prohibited](https://app.leg.wa.gov/RCW/default.aspx?cite=36.65.030) (last changed: 2026-10-20)
- WA - [WA Cares Fund premium, RCW 50B.04.080 -- 0.58% of wages since 2023-07-01, unchanged through 2026](https://app.leg.wa.gov/RCW/default.aspx?cite=50B.04.080) (last changed: 2026-10-20)
- WA - [WA Cares Fund — Exemptions](https://wacaresfund.wa.gov/exemptions) (last changed: 2026-10-20)
- WA - [Washington Cares Fund premiums](https://wacaresfund.wa.gov/employers/) (last changed: 2026-10-20)
- WA - [Washington ESD -- Paid Family & Medical Leave premiums to increase in 2025 (2024-10-23)](https://esd.wa.gov/about-us/news-release/2024/paid-family-medical-leave-premiums-increase-2025) (last changed: 2026-10-20)
- WA - [Washington L&I -- FY27-075 2027 Minimum Wage Announcement](https://www.lni.wa.gov/workers-rights/_docs/2027-minimum-wage-announcement-Accessible.pdf) (last changed: 2026-10-26)
- WA - [Washington Paid Leave premium rates](https://paidleave.wa.gov/employers/) (last changed: 2026-10-20)
- WA - [Washington State Department of Labor & Industries -- Local Minimum Wage Rates](https://lni.wa.gov/workers-rights/wages/minimum-wage/local-minimum-wage-rates) (last changed: 2026-10-22)
- WA - [Washington State Department of Labor & Industries -- Washington's minimum wage going up to $17.13 an](https://www.lni.wa.gov/news-events/article/25-27) (last changed: 2026-10-20)
- WA - [Washington State Department of Labor & Industries — 2026 minimum wage ($17.13/hr effective 2026-01-0](https://ofm.wa.gov/wp-content/uploads/sites/default/files/public/legacy/policy/25.60.pdf) (last changed: 2026-10-20)
- WA - [Washington State's Paid Family and Medical Leave — Estimate your Paid Leave payments](https://paidleave.wa.gov/estimate-your-paid-leave-payments/) (last changed: 2026-10-20)
- WI - [2026 Tax Rate Schedule for Employers (DWD, full Schedule D reserve-percentage rate table)](https://dwd.wisconsin.gov/ui/employers/taxrates.htm) (last changed: 2026-10-22)
- WI - [DOR General Withholding Tax Questions (reciprocity, thresholds, WT-4)](https://www.revenue.wi.gov/Pages/FAQS/pcs-with.aspx) (last changed: 2026-10-20)
- WI - [DOR Tax Rates FAQ (annual Form 1 individual income tax brackets)](https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx) (last changed: 2026-10-20)
- WI - [UCT-1-E, 2026 Wisconsin Employer's Quarterly Contribution Report (SUTA initial rates)](https://dwd.wisconsin.gov/dwd/forms/ui/pdf/uct-1-e-2026.pdf) (last changed: 2026-10-20)
- WI - [Wis. Stat. § 71.03(13) — 'Wisconsin adjusted gross income' defined](https://docs.legis.wisconsin.gov/document/statutes/71.03) (last changed: 2026-10-22)
- WI - [Wis. Stat. § 812.34 — 80% of disposable earnings exempt from garnishment (i.e. 20% reachable), furth](https://docs.legis.wisconsin.gov/document/statutes/812.34) (last changed: 2026-10-22)
- WI - [Wisconsin Department of Revenue: news](https://www.revenue.wi.gov/Pages/News/home.aspx) (last changed: 2026-10-20)
- WI - [Wisconsin Legislature -- Wis. Stat. 104.035 (minimum wage; opportunity employees)](https://docs.legis.wisconsin.gov/2017/statutes/statutes/104/035/9) (last changed: 2026-10-22)
- WI - [Wisconsin W-166 withholding guide](https://www.revenue.wi.gov/DOR%20Publications/pb166.pdf) (last changed: 2026-10-20)
- WI - [Wisconsin withholding](https://www.revenue.wi.gov/Pages/Withholding/home.aspx) (last changed: 2026-10-20)
- WV - [City of Charleston, WV: city service fee overview](https://www.charlestonwv.gov/sites/default/files/documents/2022-12/CITY%20SERVICE%20FEE%20OVERVIEW%2012.22%20%282%29.pdf) (last changed: 2026-10-20)
- WV - [City of Montgomery City Service Fee Remittance Form](https://montgomery.wv.gov/media/19506/download?inline=) (last changed: 2026-10-27)
- WV - [City of Wheeling Article 797 City Service Fee](https://www.wheelingwv.gov/media/Finance/City%20Service%20Fee/City%20Service%20Fee-%20Ordinance%20Final.pdf) (last changed: 2026-10-27)
- WV - [Fairmont administrative regulations section 1.2](https://fairmontwv.gov/DocumentCenter/View/2198) (last changed: 2026-10-27)
- WV - [W. Va. Code § 38-5A-3 — ordinary (consumer credit sale/consumer loan judgment) garnishment limited t](https://code.wvlegislature.gov/38-5A-3/) (last changed: 2026-10-18)
- WV - [WV IT-100.2A -- Tables for Percentage Method of Withholding (March 2026 revision)](https://tax.wv.gov/Documents/Withholding/it100.2a.pdf) (last changed: 2026-09-24)
- WV - [WV State Tax Division -- Withholding Help and General Information page, "Supplemental Wages" guidanc](https://tax.wv.gov/Business/Withholding/HelpAndGeneralInformation/Pages/WithholdingHelpAndGeneralInformation.aspx) (last changed: 2026-09-24)
- WV - [WV/IT-104 -- Employee's Withholding Exemption Certificate (Rev. 03/2023) + WV/IT-104NR Certificate o](https://tax.wv.gov/Documents/Withholding/it104.pdf) (last changed: 2026-09-24)
- WV - [WVU Shared Services: West Virginia city user fee ordinances (every city's fee)](https://sharedservices.wvu.edu/west-virginia-city-user-fee-ordinances) (last changed: 2026-10-20)
- WV - [West Virginia Division of Labor -- Minimum Wage](https://labor.wv.gov/wage-hour/jobs-act/minimum-wage) (last changed: 2026-09-24)
- WV - [West Virginia State Tax Department: home page (news and notices)](https://tax.wv.gov/) (last changed: 2026-10-22)
- WV - [West Virginia Tax Division -- 2026 Income Tax Rate Cut](https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx) (last changed: 2026-09-30)
- WV - [West Virginia withholding](https://tax.wv.gov/Business/Withholding/Publications/Pages/WithholdingPublications.aspx) (last changed: 2026-09-24)
- WV - [Wheeling employer worksheet CSF-3](https://www.wheelingwv.gov/media/Finance/City%20Service%20Fee/City%20Service%20Fee%20-%20Employer%20Worksheet%20Form%20CSF-3.pdf) (last changed: 2026-10-27)

</details>

