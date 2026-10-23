# Source watch - 2026-10-23

**12 sources changed**

**3 items need attention: see "Needs attention" below.** A run with no changes is not an all-clear while this list is not empty.

| Changed | Minor | Unchanged | New | Unstable | Unreachable | Gone (404) | Blocks bots | Total |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 12 | 2 | 1033 | 2 | 0 | 14 | 5 | 36 | 1104 |

_Run took 2486 s. A change is only reported after a second fetch confirms it._

**Coverage: 1049 of 1104 sources were read this run; 55 could not be checked**, and 38 of those have never been read successfully, so nothing about them is being watched.
474 of those are documents linked from pages. 6 other linked documents could not be read (a dead link, or a file the site won't serve) and are not counted above.
**554 linked documents were not read this run** (the time budget ran out) and will be read first thing in the next run; until then they are not being watched.

## Needs attention (3)

| What | Detail |
|---|---|
| IN Indiana Departmental Notice #1 (county rates) | could not read the official file to compare with the engine's data (URLError: <urlopen error timed out>) |
| KY Whitesville | the Secretary of State lists this district (entered 2026-10-06; rate '') but KY-occupational-2026.json does not |
| WV Chester | the list shows a $2 per week user fee in Chester, which the data does not have |

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

### AZ - City of Flagstaff -- City of Flagstaff announces minimum wage for 2026

<https://www.flagstaff.az.gov/CivicAlerts.aspx?AID=2165>  
2 lines added, 2 removed
  
Used by: `data/minimum-wage/local/AZ-local-2026.json`


<details><summary>What changed</summary>

```diff
+Pedestrian Improvements Complete along Soliere Avenue!
+Homepage News
-City Manager Joanne Keene Recognized as 2026 Women Achiever of Arizona
-Homepage News
```
</details>

### CA - 法律聲明 [Traditional Chinese] (linked from City of Santa Monica -- Minimum Wage)

<https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Traditional_Chinese.pdf>  
9 lines added, 65 removed
  
Used by: `data/minimum-wage/sectoral/CA-sectoral-2026.json`

- Figures now present: none
- Figures no longer present: $18.47, 4.62, 4.62, 4.62

<details><summary>What changed</summary>

```diff
-張貼于顯眼處以便從業人員閱覽；違者將受到處罰
-聖莫尼卡市最低工資
-$18.47 每小時
-依據《聖莫尼卡市市政法》第 4.62 章最低工資條例，雇主應向在聖莫尼卡市地理範圍內某一具體工
-作周中完成不低於兩個小時工作的從業人員（包括臨時和兼職從業人員）支付不低於本通知中顯示
-的金額。這項最低工資標準將於每年7月根據以下的時間表進行調整。可能存在一定的豁免和延期。
-依據該條例，雇主不得對維護自己獲得本市最低工資權利的從業人員進行打擊報復。從業人員可對
-違反本條例的雇主提起民事訴訟。本市有權調查違規嫌疑，並強制執行最低工資要求。違反最低工
-資法律的行為包括但不限於：
-如需更多資訊，請聯繫聖莫尼卡市：
-(310) 458-8281 • minimum.wage@santamonica.gov • santamonica.gov/minimum-wage
-誠信做事，報酬公平。
-聖莫尼卡市最低工資
-未及時支付聖莫尼卡市最低工資 未遵守通知、公告及檔記錄規定 報復從業人員
-聖莫尼卡市最低工資
-官方公告
-費率生效日期：2026年7月1日
-張貼于顯眼處以便從業人員閱覽；違者將受到處罰
-聖莫尼卡市帶薪病假
-生效日期：2017年1月1日
-自2017年1月1日起，依照《聖莫尼卡市市政法》第 4.62.025 節帶薪病假規定，雇主必須向在聖莫尼卡市
-區範圍內工作的從業人員提供帶薪病假待遇。
-從業人員人數 26
-人或以上的雇主
-從業人員人數 25
-人或以下的雇主
-72小時 40小時
-任何在聖莫尼卡地理範圍內某一具體工作周中完成至少兩個小時工作的從業人員有資格享受帶薪病假待
-遇，並有資格作為從業人員享受由雇主支付《加州勞動法》規定的、加州工業福利委員會頒佈的工資決
-議規定的最低工資。從業人員享有的病假權利遵守《2014 年加州衛生工作場所和家庭健康法案》。
-帶薪病假自從業人員入職開始累計。從業人員可在就業 90 天后或依據雇主政策（以時間短者為准）使
-用累計帶薪病假。
-從業人員每工作 30 小時累計一小時帶薪病假。雇主可以選擇提供更優厚的病假福利。未經使用的帶薪
-病假將逐年延續累計到下一年（日曆年、財政年度或者就業年），直至到達累計上限為止。雇主在每日
-歷年、財政年或就業年初所提供的必要全額休假不得累計或延轉。
-依據該條例，雇主不得對維護自己獲得帶薪病假權利的從業人員進行打擊報復。從業人員可對違反帶薪
-病假規定的雇主提起民事訴訟。本市有權調查違規嫌疑，並有權強制執行帶薪病假規定。補償措施包括
-但不限於從業人員複職、非法扣留帶薪病假薪金的支付，以及罰款。
-若需更多資訊，請聯繫聖莫尼卡市：
-(310) 458-8281 • minimum.wage@santamonica.gov • santamonica.gov/minimum-wage
... 34 more changed lines
```
</details>

### DE - Delaware Division of Revenue: home (announcements)

<https://revenue.delaware.gov/>  
0 lines added, 1 removed


<details><summary>What changed</summary>

```diff
-Effective August 15, 2026, HS 2 for HB 187 w/ HA2 permits wine producers with a valid license in Delaware or another state to ship wine directly to consumers through a common carrier with a carrier permit. It requires wine producers to ...
```
</details>

### KY - Kentucky DOR: news

<https://revenue.ky.gov/News/Pages/default.aspx>  
1 lines added, 0 removed; 1 links added, 0 removed

- New link: [FAQs for Agriculture Exemption Renewal Program](https://revenue.ky.gov/News/Pages/FAQs-for-Agriculture-Exemption-Renewal-Program.aspx)

<details><summary>What changed</summary>

```diff
+FAQs for Agriculture Exemption Renewal Program
```
</details>

### NM - City of Albuquerque -- Albuquerque Minimum Wage Information

<https://www.cabq.gov/legal/albuquerque-minimum-wage-information>  
1 lines added, 1 removed
  
Used by: `data/minimum-wage/local/NM-local-2026.json`


<details><summary>What changed</summary>

```diff
-Theory of Change
+Theory of Change [PDF]
```
</details>

### NM - New Mexico Taxation and Revenue: news

<https://www.tax.newmexico.gov/news/>  
1 lines added, 0 removed; 1 links added, 0 removed

- New link: [800 delinquent properties to be auctioned in Luna County this week](https://www.tax.newmexico.gov/wp-content/uploads/2026/10/20261020_800-delinquent-properties-to-be-auctioned-in-Luna-County-this-week.pdf)

<details><summary>What changed</summary>

```diff
+800 delinquent properties to be auctioned in Luna County this week
```
</details>

### NM - Santa Fe County -- Living Wage Ordinance and 2026 living wage adjustment announcement

<https://www.santafecountynm.gov/livingwage>  
2 lines added, 1 removed
  
Used by: `data/minimum-wage/local/NM-local-2026.json`


<details><summary>What changed</summary>

```diff
-ðŸ"ˆ Adjusted annually by CPI (Western Region, Urban Wage Earners & Clerical Workers) ðŸ" Unincorporated Santa Fe County only
+Adjusted annually by CPI (Western Region, Urban Wage Earners & Clerical Workers) Unincorporated Santa Fe County only
+Previous Living Wage Rates
```
</details>

### NY - fact sheet PDF (linked from IRS -- Determining if an employer is an applicable)

<http://www.treasury.gov/press-center/press-releases/Documents/Fact%20Sheet%20021014.pdf>  
5 lines added, 4 removed
  
Used by: `data/employer-thresholds/NY-2026.json`, `data/employer-thresholds/NY-2027.json`


<details><summary>What changed</summary>

```diff
+October 22, 2026
+Treasury Issues Proposed Rule to Implement Comprehensive Outbound Investment National Security Act
+October 22, 2026
+Readouts
+READOUT: Secretary of the Treasury Scott Bessent's Meeting with President Santiago Peña of Paraguay
-October 13, 2026
-U.S. Treasury Announces Record Enforcement Actions Against Bank of America
-October 13, 2026
-Treasury Targets Cartel del Noreste's Horse Racing Enterprise and Expansive Criminal Network
```
</details>

### OR - Oregon Department of Revenue: news

<https://www.oregon.gov/dor/news/Pages/default.aspx>  
44 lines added, 44 removed; 9 links added, 10 removed

- New link: [Dept. of Revenue](https://apps.oregon.gov/oregon-newsroom/OR/DOR/Posts)
- New link: [Taxpayer Advocate urges Oregonians to volunteer to help low-income families receive millions in unclaimed tax benefits](https://apps.oregon.gov/oregon-newsroom/OR/DOR/Posts/Post/Taxpayer-Advocate-urges-Oregonians-to-volunteer-to-help-low-income-families)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/blog-snap-ed-closes-due-to-federal-budget-cuts](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/blog-snap-ed-closes-due-to-federal-budget-cuts)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/oregon-program-offers-free-help-to-compare-plans-save-on-costs-during-medicare-open-enrollment](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/oregon-program-offers-free-help-to-compare-plans-save-on-costs-during-medicare-open-enrollment)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/un-programa-de-oregon-ofrece-ayuda-gratuita-para-comparar-planes-y-ahorrar-en-costos-durante-el-periodo-de-inscripcion-abierta-de-medicare](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/un-programa-de-oregon-ofrece-ayuda-gratuita-para-comparar-planes-y-ahorrar-en-costos-durante-el-periodo-de-inscripcion-abierta-de-medicare)
- New link: [SPIRE Program Delivers Utility Terrain Vehicles to Strengthen Emergency Response Across Oregon](https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/SPIRE-UTVs-2026)
- New link: [https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/oem-helps-launch-ecso-911-system](https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/oem-helps-launch-ecso-911-system)
- New link: [Spanish](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?cat=Spanish)
- New link: [October 22, 2026](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?from=10%2F22%2F2026&to=10%2F22%2F2026)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/DCBS/Posts/Post/2026-community-bank-week](https://apps.oregon.gov/oregon-newsroom/OR/DCBS/Posts/Post/2026-community-bank-week)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/DCBS/Posts/Post/2610-media-contest](https://apps.oregon.gov/oregon-newsroom/OR/DCBS/Posts/Post/2610-media-contest)
- Removed link: [Building better human services starts with people](https://apps.oregon.gov/oregon-newsroom/OR/ODHS/Posts/Post/blog-building-better-human-services-starts-with-people)
- Removed link: [It’s National School Bus Safety Week!](https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/Bus-Safety-week-2026)
- Removed link: [A Little Prep, a Lot of Treats: Halloween Safety Tips](https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/Halloween-2026)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/Ready-for-the-Wave](https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/Ready-for-the-Wave)
- Removed link: [October Is Cybersecurity Awareness Month](https://apps.oregon.gov/oregon-newsroom/OR/OEM/Posts/Post/Stay-cyber-safe-2026)
- Removed link: [https://apps.oregon.gov/oregon-newsroom/OR/OPRD/Posts/Post/ATV-advisory-committee-Nov-4](https://apps.oregon.gov/oregon-newsroom/OR/OPRD/Posts/Post/ATV-advisory-committee-Nov-4)
- Removed link: [Technology](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?cat=Technology)
- Removed link: [Oct 19](https://apps.oregon.gov/oregon-newsroom/OR/Posts/Search?from=10%2F19%2F2026&to=10%2F19%2F2026)

<details><summary>What changed</summary>

```diff
-Business
-October 21, 2026
-Oregon Investment Council Reviews Fund Benchmarks and Reports Strong Performance of State Accident Insurance Fund
-Oregon State Treasury
+Social Services
+October 22, 2026
+Oregon program offers free help to compare plans, save on costs during Medicare Open Enrollment
+Oregon Department of Human Services
-Veteran
-Oct 20
-Oregonians Invited to Honor Generations of Service at Statewide Veterans Day Ceremony Nov. 11
-Dept. of Veterans' Affairs
+911
+Oct 22
+Oregon Department of Emergency Management Highlights Role in ECSO 911 Radio System Go Live
+Oregon Dept. of Emergency Management
-Emergency
-Oct 19
-Ready for the Wave: Free Webinar Helps Oregonians Prepare for Earthquakes and Tsunamis
-Oregon Dept. of Emergency Management
-·
-Article
-·
-Building better human services starts with people
+Oct 22
+SNAP-Ed closes due to federal budget cuts
-It's National School Bus Safety Week!
+SPIRE Program Delivers Utility Terrain Vehicles to Strengthen Emergency Response Across Oregon
-Article
-Preparedness
+Pr. Release
+Taxes
-A Little Prep, a Lot of Treats: Halloween Safety Tips
-Oregon Dept. of Emergency Management
+Taxpayer Advocate urges Oregonians to volunteer to help low-income families receive millions in unclaimed tax benefits
+Dept. of Revenue
-Article
-Technology
+Pr. Release
+Business
... 48 more changed lines
```
</details>

### UT - Utah Pub 14 page

<https://tax.utah.gov/forms-pubs/pub-14/>  
0 lines added, 3 removed


<details><summary>What changed</summary>

```diff
-(opens in a new tab)
-(opens in a new tab)
-(opens in a new tab)
```
</details>

### UT - Utah State Tax Commission: news releases

<https://tax.utah.gov/news/>  
0 lines added, 1 removed


<details><summary>What changed</summary>

```diff
-(opens in a new tab)
```
</details>

### UT - Utah State Tax Commission: tax bulletins

<https://tax.utah.gov/tax-bulletins/>  
0 lines added, 2 removed


<details><summary>What changed</summary>

```diff
-(opens in a new tab)
-(opens in a new tab)
```
</details>

## Minor changes: link lists and headlines only (2)

Recorded, but only the text of links to other pages changed (news boxes, menus).

<details><summary>Show</summary>

### MI - Michigan LEO -- Michigan's Minimum Wage Set to Increase on Jan. 1, 2026

<https://www.michigan.gov/leo/news/2025/12/08/michigans-minimum-wage-set-to-increase-on-jan-1-2026>  
3 lines added, 3 removed (link lists / headlines only)
  
Used by: `data/minimum-wage/states/MI-2026.json`

- Figures now present: $1.7
- Figures no longer present: $1

<details><summary>What changed</summary>

```diff
+Michigan Rehabilitation Services honors Michiganders and businesses during 18th annual Champion Awards ceremony
+Gov. Whitmer awards $1.7M to launch 12 Advanced Air Mobility projects statewide
+Unemployment agency promotes online safety during Cybersecurity Awareness Month
-Unemployment agency promotes online safety during Cybersecurity Awareness Month
-New Youth Employment Permit Portal Helps Protect Michigan's Young Workers
-$1M investment helps 10 Michigan communities navigate industry transitions, prepare for future
```
</details>

### MI - Other Michigan cities with income tax (City of Grand Rapids rate table)

<https://www.grandrapidsmi.gov/departments/fiscal-services/income-tax/other-michigan-cities-with-income-tax/>  
0 lines added, 1 removed (link lists / headlines only)
  
Used by: `data/local/MI-cities-2025.json`, `data/local/MI-cities-2026.json`, `data/local/MI-cities-2027.json`


<details><summary>What changed</summary>

```diff
-ArtPrize
```
</details>

</details>

## Never read successfully - no baseline, so changes here go unnoticed (38)

Each of these has failed on every run so far. Replace the URL, or check the document by hand.

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Birmingham -- Employers Return of Occupational Tax Withheld](https://birminghamal.hdlgov.com/base64files/TAXES_FORM_4.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AL | [City of Tuskegee -- Occupational Tax Reporting form](https://www.tuskegeealabama.gov/finance-department/files/occupational-tax-form) | HTTP 404 |
| AL | [Rainbow City -- Form G-1 (Rev 12/20), occupational license fee return](https://www.rbcalabama.com/download/revenue-g-1/?wpdmdl=730&masterkey=60c8bce41072f) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AR | [Arkansas Department of Labor and Licensing -- Minimum Wage and Overtime](https://labor.arkansas.gov/labor/labor-standards/minimum-wage-and-overtime/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AZ | [UIT-0603A (FY26), Unemployment Insurance Tax Rate Chart](https://des.az.gov/sites/default/files/dl/UIT-0603A_FY26.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [City of Aurora — Occupational Privilege Tax repeal](https://www.auroragov.org/business_services/taxes__licensing/occupational_privilege_tax) | HTTP 404 |
| CO | [City of Greenwood Village occupational privilege tax](https://www.greenwoodvillage.com/206/Occupational-Privilege-Tax) | HTTP 404 |
| CO | [Colorado DOR -- DR 1098 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/DR1098) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado Department of Revenue: news](https://tax.colorado.gov/news) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado wage withholding](https://tax.colorado.gov/withholding-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado withholding tax guide](https://tax.colorado.gov/withholding-tax-guide) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DC | [DC Department of Employment Services -- Office of Wage-Hour Compliance](https://does.dc.gov/service/office-wage-hour-compliance-0) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DC | [DC OTR withholding](https://otr.cfo.dc.gov/page/withholding-tax-forms-and-publications) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DE | [City of Wilmington: City wage and net profits taxes](https://www.wilmingtonde.gov/residents/earned-income-tax-and-net-profits-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| IL | [735 ILCS 5/12-803 — maximum wage deduction: lesser of 15% of GROSS weekly wages, or the am](https://www.ilga.gov/legislation/ilcs/ilcs4.asp?DocName=073500050K12-803) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| IL | [Illinois State Income Tax Exemptions - 2026 (Illinois Office of Comptroller, Payroll Bulle](https://illinoiscomptroller.gov/state-agencies/bulletins-forms/payroll-bulletins/illinois-state-income-tax-exemptions-2026) | HTTP 500 |
| KY | [City of Augusta Code of Ordinances Sec. 110.02](https://codelibrary.amlegal.com/codes/augusta/latest/augusta_ky/0-0-0-8998) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Elizabethtown, KY — Code of Ordinances Chapter 110, § 110.03 Occupational License ](https://codelibrary.amlegal.com/codes/elizabethtownky/latest/elizabethtown_ky/0-0-0-3203) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Hartford -- Notice of Occupational License Fees](https://hartfordky.org/notice-of-occupational-license-fees/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Hickman Code of Ordinances Secs. 14-13 and 14-15 (Ord. No. 08-07)](https://library.municode.com/ky/hickman/codes/code_of_ordinances?nodeId=COOR_CH14LIBURE_ARTIIOCLITA) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Marion Code of Ordinances Sec. 110.22](https://codelibrary.amlegal.com/codes/marionky/latest/marion_ky/0-0-0-22684) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Mayfield Code of Ordinances Sec. 9-42, Earnings and net profits tax payment requir](https://library.municode.com/ky/mayfield/codes/code_of_ordinances?nodeId=COOR_CH9OCLITARE_ARTIIOCLITA_S9-42EANEPRTAPARE) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of McKee Code of Ordinances § 110.02 LICENSE REQUIRED; FEES](https://codelibrary.amlegal.com/codes/mckeeky/latest/mckee_ky/0-0-0-2883) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Middlesboro Code of Ordinances, Ch. 110 (levy section)](https://codelibrary.amlegal.com/codes/middlesboroky/latest/middlesboro_ky/0-0-0-5065) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Middletown Code of Ordinances Sec. 114.23 (Ord. 07-13-2023-B, 10-12-2023-B)](https://codelibrary.amlegal.com/codes/middletownky/latest/middletown_ky/0-0-0-10846) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Nortonville Code of Ordinances § 110.03 OCCUPATIONAL LICENSE FEE PAYMENT REQUIRED](https://codelibrary.amlegal.com/codes/nortonvilleky/latest/nortonville_ky/0-0-0-3279) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Pikeville -- Business Licenses](https://pikevilleky.gov/business/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Simpsonville Code of Ordinances Sec. 110.27](https://codelibrary.amlegal.com/codes/simpsonville/latest/simpsonville_ky/0-0-0-6803) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| MO | [Kansas City, MO: earnings tax](https://www.kcmo.gov/city-hall/departments/finance/earnings-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| MO | [Kansas City, MO: tax guide for non-resident businesses (employer withholding of the earnin](https://www.kcmo.gov/city-hall/departments/finance/tax-home/tax-guides/tax-guide-for-non-resident-businesses) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NM | [City of Las Cruces -- Official Notice, Minimum Wage Ordinance (2026)](https://lascruces.gov/wp-content/uploads/2025/09/MinimumWageEng26.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NY Department of Financial Services -- COBRA and Premium Assistance](https://www.dfs.ny.gov/consumers/health_insurance/cobra_and_premium_assistance) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NY Election Law 3-400 via NY Senate Open Legislation API (free key: NYSENATE_API_KEY)](https://legislation.nysenate.gov/api/3/laws/ELN/3-400?key={env:NYSENATE_API_KEY}) | needs a free API key: add repository secret NYSENATE_API_KEY; a real browser was refused too |
| NY | [NY Labor Law 651 via NY Senate Open Legislation API (free key: NYSENATE_API_KEY)](https://legislation.nysenate.gov/api/3/laws/LAB/651?key={env:NYSENATE_API_KEY}) | needs a free API key: add repository secret NYSENATE_API_KEY; a real browser was refused too |
| NY | [NY.gov -- New York State Paid Sick Leave FAQ](https://www.ny.gov/sites/default/files/atoms/files/PSL_FAQ_PaidSickLeaveFAQ.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| NY | [NYS Paid Family Leave -- 2025 contribution rate 0.388%, maximum annual contribution $354.5](https://paidfamilyleave.ny.gov/2025) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| OH | [Village of College Corner income tax ordinance (1%) and repeal resolution](https://villageofcollegecorner.org/wp-content/uploads/2025/04/Rita-Repeal.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| OR | [City of Wilsonville Transit Payroll Tax Information](https://www.wilsonvilleoregon.gov/finance/page/transit-payroll-tax-information) | HTTP 404 |

## Broken - failing for 3+ runs (7)

These URLs need replacing in `watcher/sources.json` (or the site blocks automated fetches).

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Tuskegee -- Occupational Tax Reporting form](https://www.tuskegeealabama.gov/finance-department/files/occupational-tax-form) | HTTP 404 |
| AL | [City of Tuskegee -- business information brochure](https://www.tuskegeealabama.gov/sites/g/files/vyhlif3946/f/uploads/infobrochure_word.pdf) | HTTP 404 |
| CO | [City of Aurora — Occupational Privilege Tax repeal](https://www.auroragov.org/business_services/taxes__licensing/occupational_privilege_tax) | HTTP 404 |
| CO | [City of Greenwood Village occupational privilege tax](https://www.greenwoodvillage.com/206/Occupational-Privilege-Tax) | HTTP 404 |
| IL | [735 ILCS 5/12-803 — maximum wage deduction: lesser of 15% of GROSS weekly wages, or the am](https://www.ilga.gov/legislation/ilcs/ilcs4.asp?DocName=073500050K12-803) | site's TLS certificate failed verification (unable to get local issuer certificate) |
| IL | [Illinois State Income Tax Exemptions - 2026 (Illinois Office of Comptroller, Payroll Bulle](https://illinoiscomptroller.gov/state-agencies/bulletins-forms/payroll-bulletins/illinois-state-income-tax-exemptions-2026) | HTTP 500 |
| OR | [City of Wilsonville Transit Payroll Tax Information](https://www.wilsonvilleoregon.gov/finance/page/transit-payroll-tax-information) | HTTP 404 |

## Unreachable this run (12)

| Jurisdiction | Source | Detail |
|---|---|---|
| MI | [MCL 141.631 — City Income Tax Act, Sec. 31 (personal/dependency exemptions)](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-141-631) | HTTP 502 |
| MI | [MCL 206.30 — retirement/pension income deductions (subsection (1)(f) etc.), the basis for ](https://www.legislature.mi.gov/Laws/MCL?objectName=MCL-206-30) | HTTP 502 |
| MI | [MCL 206.703(2) — Every employer required under the Internal Revenue Code to withhold on an](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-206-703) | HTTP 502 |
| MN | [Minnesota Paid Leave -- Premium rate and contributions](https://pl.mn.gov/resources/calculators/premium-rate-and-contributions) | HTTP 405 |
| WI | [DOR General Withholding Tax Questions (reciprocity, thresholds, WT-4)](https://www.revenue.wi.gov/Pages/FAQS/pcs-with.aspx) | URLError: <urlopen error timed out> |
| WI | [DOR Tax Rates FAQ (annual Form 1 individual income tax brackets)](https://www.revenue.wi.gov/Pages/FAQS/pcs-taxrates.aspx) | URLError: <urlopen error timed out> |
| WI | [Wis. Stat. § 71.03(13) — 'Wisconsin adjusted gross income' defined](https://docs.legis.wisconsin.gov/document/statutes/71.03) | URLError: <urlopen error timed out> |
| WI | [Wis. Stat. § 812.34 — 80% of disposable earnings exempt from garnishment (i.e. 20% reachab](https://docs.legis.wisconsin.gov/document/statutes/812.34) | URLError: <urlopen error timed out> |
| WI | [Wisconsin Department of Revenue: news](https://www.revenue.wi.gov/Pages/News/home.aspx) | URLError: <urlopen error timed out> |
| WI | [Wisconsin Legislature -- Wis. Stat. 104.035 (minimum wage; opportunity employees)](https://docs.legis.wisconsin.gov/2017/statutes/statutes/104/035/9) | URLError: <urlopen error timed out> |
| WI | [Wisconsin W-166 withholding guide](https://www.revenue.wi.gov/DOR%20Publications/pb166.pdf) | URLError: <urlopen error timed out> |
| WI | [Wisconsin withholding](https://www.revenue.wi.gov/Pages/Withholding/home.aspx) | URLError: <urlopen error timed out> |

## New (first snapshot taken) (2)

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Fairfield -- Ordinance 1019, Occupational Tax](https://cityoffairfieldal.org/wp-content/uploads/2025/02/Ordinance-1019-Occupational-Tax_rotated.pdf) | first snapshot (9 words, pdf) |
| KY | [City of Dayton -- License and Fee Information](https://daytonky.com/licenses/) | first snapshot (550 words, html) |

## Redirected (80)

These still work but redirect elsewhere; consider updating the URL in data/ or curated.json.

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [Alabama DOR: local tax (rates and codes for cities and counties)](https://www.revenue.alabama.gov/local-tax/) | -> https://www.revenue.alabama.gov/sales-use/local-tax-liaisons/ |
| AL | [City of Opelika -- announcement of the occupational tax cut](https://www.opelika-al.gov/CivicAlerts.aspx?AID=1092) | -> https://www.opelika-al.gov/m/newsflash/home/detail/1092 |
| AR | [Arkansas DFA: news](https://www.dfa.arkansas.gov/news/) | -> https://www.dfa.arkansas.gov/about/news/ |
| AZ | [City of Flagstaff -- City of Flagstaff announces minimum wage for 2026](https://www.flagstaff.az.gov/CivicAlerts.aspx?AID=2165) | 2 lines added, 2 removed |
| CA | [California Employer's Guide (DE 44), Rev. 52 (4-26) -- "How to Withhold PIT on Supplementa](https://www.edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) | -> https://edd.ca.gov:443/siteassets/files/pdf_pub_ctr/de44.pdf |
| CA | [FAQ (English) (linked from City of Santa Monica -- Minimum Wage)](https://santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_English2023.pdf) | a one-off difference the confirming fetch didn't reproduce |
| CA | [FAQ (Spanish) (linked from City of Santa Monica -- Minimum Wage)](https://santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_Spanish2023.pdf) | -> https://www.santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_Spanish2023.pdf |
| CA | [form FL-435 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/fl435.pdf) | -> https://courts.ca.gov/sites/default/files/courts/default/2024-11/fl435.pdf |
| CA | [form WG-002 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg002.pdf) | -> https://courts.ca.gov/system/files?file=2025-07/wg002.pdf |
| CA | [form WG-004 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg004.pdf) | -> https://courts.ca.gov/system/files?file=2025-07/wg004.pdf |
| CA | [form WG-005 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg005.pdf) | -> https://courts.ca.gov/sites/default/files/courts/default/2024-11/wg005.pdf |
| CA | [form WG-022 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg022.pdf) | -> https://courts.ca.gov/system/files?file=2025-07/wg022.pdf |
| CA | [form WG-030 (linked from Cal. Civ. Proc. Code § 706.050 — ordinary garnishm)](https://www.courts.ca.gov/documents/wg030.pdf) | -> https://courts.ca.gov/system/files?file=2025-07/wg030.pdf |
| CO | [Colorado Department of Labor & Employment — UI Premium Rates](https://cdle.colorado.gov/employers/unemployment-insurance-premiums/premium-rates) | -> https://cdle.colorado.gov/ui/employers/requirements/premiums/premium-rates |
| CO | [Colorado Wage Withholding Tax Guide, January 2026](https://tax.colorado.gov/sites/tax/files/documents/Wage_Withholding_Tax_Guide_Jan_2026.pdf) | -> https://tax.colorado.gov/sites/default/files/documents/Wage_Withholding_Tax_Guide_Jan_2026.pdf |
| CO | [DR 1098 (10/21/25), 2026 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/sites/tax/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf) | -> https://tax.colorado.gov/sites/default/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf |
| CO | [here, Ordinance 2022-77 (linked from City of Aurora: occupational privilege tax (repeal)](https://www.auroragov.org/UserFiles/Servers/Server_1881137/File/Business%20Services/Tax/Occupational/Ordinance%202022-77%20OPT%20Repeal.pdf) | -> https://cdnsm5-hosted.civiclive.com/UserFiles/Servers/Server_1881137/File/Business%20Services/Tax/Occupational/Ordinance%202022-77%20OPT%20Repeal.pdf |
| CT | [Connecticut DRS: newsroom](https://portal.ct.gov/drs/newsroom) | -> https://portal.ct.gov/en/404error/?item=%2fdrs%2fnewsroom&user=extranet%5cAnonymous&site=website |
| GA | [Employer's Withholding Tax Guide 2026 (Revised June 2026, reflecting HB 463 signed 2026-05](https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-june-2026/download) | -> https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-september-2026/download |
| GA | [Employer’s Tax Guide (linked from Georgia DOR withholding)](https://dor.georgia.gov/documents/2014-employer-tax-guide) | -> https://dor.georgia.gov/employers-tax-guide |
| IA | [Iowa Department of Revenue: press releases](https://revenue.iowa.gov/press-releases) | -> https://revenue.iowa.gov/iowa-age-purchase |
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
| NC | [Form NC-4 (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/employees-withholding-allowance-certificate-nc-4) | -> https://www.ncdor.gov/taxes-forms/withholding-tax/withholding-tax-forms-and-instructions/nc-4-employees-withholding-allowance-certificate |
| NC | [Form NC-4 EZ (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/employees-withholding-allowance-certificate-nc-4ez) | -> https://www.ncdor.gov/taxes-forms/withholding-tax/withholding-tax-forms-and-instructions/nc-4-ez-employees-withholding-allowance-certificate |
| NC | [Form NC-4 NRA (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/nonresident-alien-employees-withholding-allowance-certificate) | -> https://www.ncdor.gov/taxes-forms/withholding-tax/withholding-tax-forms-and-instructions/nc-4-nra-nonresident-alien-employees-withholding-allowance-certifica |
| NC | [Form NC-BN, Request to Close Tax Account (linked from NCDOR -- Withholding Tax Frequently ](https://www.ncdor.gov/documents/nc-bn-out-business-notification) | -> https://www.ncdor.gov/taxes-forms/sales-and-use-tax/sales-and-use-tax-forms-and-certificates/miscellaneous-forms/nc-bn-request-close-tax-account |
| NC | [Form NC-BR (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/form-nc-br-webfill-business-registration-application-income-tax-withholding-sales-and-use-tax-and) | -> https://www.ncdor.gov/taxes-forms/sales-and-use-tax/sales-and-use-tax-forms-and-certificates/sales-and-use-tax-registration-applications/nc-br-business-regis |
| NC | [NC-30, North Carolina Income Tax Withholding Tables and Instructions f (linked from NCDOR ](https://www.ncdor.gov/documents/2017-income-tax-withholding-tables-and-instructions-employers) | -> https://www.ncdor.gov/taxes-forms/withholding-tax/withholding-tax-forms-and-instructions/nc-30-income-tax-withholding-tables-and-instructions-employers |
| NC | [NCDOR -- Withholding Tax Frequently Asked Questions](https://www.ncdor.gov/withholding-tax-frequently-asked-questions) | -> https://www.ncdor.gov/taxes-forms/withholding-tax/withholding-tax-frequently-asked-questions |
| NC | [Publication NC-30 (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/income-tax-withholding-tables-and-instructions-employers) | -> https://www.ncdor.gov/taxes-forms/withholding-tax/withholding-tax-forms-and-instructions/nc-30-income-tax-withholding-tables-and-instructions-employers |
| NE | [Biweekly Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_biweekly.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_biweekly.pdf |
| NE | [Daily Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_daily.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_daily.pdf |
| NE | [Entire Book (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027cir_en_whole.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027cir_en_whole.pdf |
| NE | [Important Information for Employers (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/important_W-2_format_info.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/important_W-2_format_info.pdf |
| NE | [Income Tax Withholding for Nonresident Individuals Performing Personal (linked from Nebras](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/info/8-515.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/info/8-515.pdf |
| NE | [Instructions (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_instruct.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_instruct.pdf |
| NE | [Monthly Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_monthly.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_monthly.pdf |
| NE | [Nebraska Income Tax for U.S. Servicemembers, Their Spouses, and Civili (linked from Nebras](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/info/8-364.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/info/8-364.pdf |
| NE | [Nebraska Nonresident Employee Certificate for Allocation of Income Tax (linked from Nebras](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/tax-forms/f_9n.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/tax-forms/f_9n.pdf |
| NE | [Nebraska Voluntary Disclosure Program (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/info/7-250.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/info/7-250.pdf |
| NE | [Percentage Method (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_percent.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_percent.pdf |
| NE | [Procedures for Reviewing and Appealing a Notice of Deficiency Determin (linked from Nebras](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/info/7-149.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/info/7-149.pdf |
| NE | [Required Special Income Tax Withholding Procedures (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_letter_only.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_letter_only.pdf |
| NE | [Semimonthly Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_semimonthly.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_semimonthly.pdf |
| NE | [Weekly Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_weekly.pdf) | -> https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_weekly.pdf |
| NM | [New Mexico Taxation and Revenue: news](https://www.tax.newmexico.gov/news/) | 1 lines added, 0 removed; 1 links added, 0 removed |
| NM | [Texas Workforce Commission cross-reference for New Mexico UI figures -- New Mexico DWS 'Ho](https://www.dws.state.nm.us/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated) | -> https://www.dws.nm.gov/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated |
| NY | [DOL -- Employer Contribution Rate Table](https://dol.ny.gov/employer-contribution-rate-table) | -> https://dol.ny.gov/bizserve/ui/prg/rate/ratetables |
| NY | [New York State Department of Labor -- Home Care Aide Minimum Wage Fact Sheet (P105)](https://dol.ny.gov/home-care-aide-minimum-wage-fact-sheet-p105) | -> https://dol.ny.gov/system/files/documents/2024/12/p105-home-health-aide-10-23-24.pdf |
| NY | [New York State Department of Labor -- Minimum Wage (rates effective 01/01/2026)](https://dol.ny.gov/minimum-wage-0) | -> https://dol.ny.gov/minimum-wage |
| NY | [fact sheet PDF (linked from IRS -- Determining if an employer is an applicable)](http://www.treasury.gov/press-center/press-releases/Documents/Fact%20Sheet%20021014.pdf) | 5 lines added, 4 removed |
| OH | [Combined Form IT 4 — Employee's Withholding Exemption Certificate (post-2020-12-07 combine](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth-it4-combined-fi.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/employer_withholding/generic/wth-it4-combined-fi.pdf |
| OH | [Excel File Generator Tool (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/oh%20muni%20ascii%20dev%20v017%202_19_2020.xls) | -> https://dam.assets.ohio.gov/raw/upload/tax.ohio.gov/muni-net-profit/ascii%20and%20xml/oh%20muni%20ascii%20dev%20v017%202_19_2020.xls |
| OH | [MNP10 Tax Return (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/ascii%20-%20mnp10%20return%208-21-18.xlsx) | -> https://dam.assets.ohio.gov/raw/upload/tax.ohio.gov/muni-net-profit/ascii%20and%20xml/ascii%20-%20mnp10%20return%208-21-18.xlsx |
| OH | [Ohio Department of Taxation: all news](https://tax.ohio.gov/wps/portal/gov/tax/home/news-and-events/all-news/) | -> https://tax.ohio.gov/home/news-and-events/all-news/ |
| OH | [Ohio Department of Taxation: information releases](https://tax.ohio.gov/wps/portal/gov/tax/help-center/communications/information-releases) | -> https://tax.ohio.gov/help-center/communications/information-releases |
| OH | [Ohio Department of Taxation: municipal income tax (state page for municipalities and emplo](https://tax.ohio.gov/business/municipalities) | -> https://tax.ohio.gov/business/municipal-net-profit-tax |
| OH | [Ohio Dept of Taxation: school district income tax list](https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf |
| OH | [Ohio Form IT 4NR — Employee's Statement of Residency in a Reciprocity State (Rev. 5/07), O](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth_it4nr.pdf) | -> https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/forms/employer_withholding/generic/wth_it4nr.pdf |
| OR | [Oregon Department of Revenue: news](https://www.oregon.gov/dor/news/Pages/default.aspx) | 44 lines added, 44 removed; 9 links added, 10 removed |
| PA | [PA Department of Revenue -- Employer Withholding (reciprocal agreements)](https://www.pa.gov/en/agencies/revenue/resources/tax-types-and-information/employer-withholding.html) | -> https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/employer-withholding |
| WI | [2026 Tax Rate Schedule for Employers (DWD, full Schedule D reserve-percentage rate table)](https://dwd.wisconsin.gov/ui/employers/taxrates.htm) | read with a headless browser |
| WV | [West Virginia State Tax Department: home page (news and notices)](https://tax.wv.gov/) | -> https://tax.wv.gov/Pages/default.aspx |

## Sites that block automated checks (36)

These can't be watched by a script (bot protection or JavaScript-only pages). Check them by hand now and then, or find the same document at an address that allows it.

<details><summary>Show all</summary>

| Jurisdiction | Source | Detail |
|---|---|---|
| AL | [City of Birmingham -- Employers Return of Occupational Tax Withheld](https://birminghamal.hdlgov.com/base64files/TAXES_FORM_4.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AL | [Rainbow City -- Form G-1 (Rev 12/20), occupational license fee return](https://www.rbcalabama.com/download/revenue-g-1/?wpdmdl=730&masterkey=60c8bce41072f) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AR | [Arkansas Department of Labor and Licensing -- Minimum Wage and Overtime](https://labor.arkansas.gov/labor/labor-standards/minimum-wage-and-overtime/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| AZ | [UIT-0603A (FY26), Unemployment Insurance Tax Rate Chart](https://des.az.gov/sites/default/files/dl/UIT-0603A_FY26.pdf) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado DOR -- DR 1098 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/DR1098) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado Department of Revenue: news](https://tax.colorado.gov/news) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado wage withholding](https://tax.colorado.gov/withholding-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| CO | [Colorado withholding tax guide](https://tax.colorado.gov/withholding-tax-guide) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DC | [DC Department of Employment Services -- Office of Wage-Hour Compliance](https://does.dc.gov/service/office-wage-hour-compliance-0) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DC | [DC OTR withholding](https://otr.cfo.dc.gov/page/withholding-tax-forms-and-publications) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| DE | [City of Wilmington: City wage and net profits taxes](https://www.wilmingtonde.gov/residents/earned-income-tax-and-net-profits-tax) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Augusta Code of Ordinances Sec. 110.02](https://codelibrary.amlegal.com/codes/augusta/latest/augusta_ky/0-0-0-8998) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Elizabethtown, KY — Code of Ordinances Chapter 110, § 110.03 Occupational License ](https://codelibrary.amlegal.com/codes/elizabethtownky/latest/elizabethtown_ky/0-0-0-3203) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Hartford -- Notice of Occupational License Fees](https://hartfordky.org/notice-of-occupational-license-fees/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Hickman Code of Ordinances Secs. 14-13 and 14-15 (Ord. No. 08-07)](https://library.municode.com/ky/hickman/codes/code_of_ordinances?nodeId=COOR_CH14LIBURE_ARTIIOCLITA) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Marion Code of Ordinances Sec. 110.22](https://codelibrary.amlegal.com/codes/marionky/latest/marion_ky/0-0-0-22684) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Mayfield Code of Ordinances Sec. 9-42, Earnings and net profits tax payment requir](https://library.municode.com/ky/mayfield/codes/code_of_ordinances?nodeId=COOR_CH9OCLITARE_ARTIIOCLITA_S9-42EANEPRTAPARE) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of McKee Code of Ordinances § 110.02 LICENSE REQUIRED; FEES](https://codelibrary.amlegal.com/codes/mckeeky/latest/mckee_ky/0-0-0-2883) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Middlesboro Code of Ordinances, Ch. 110 (levy section)](https://codelibrary.amlegal.com/codes/middlesboroky/latest/middlesboro_ky/0-0-0-5065) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Middletown Code of Ordinances Sec. 114.23 (Ord. 07-13-2023-B, 10-12-2023-B)](https://codelibrary.amlegal.com/codes/middletownky/latest/middletown_ky/0-0-0-10846) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Nortonville Code of Ordinances § 110.03 OCCUPATIONAL LICENSE FEE PAYMENT REQUIRED](https://codelibrary.amlegal.com/codes/nortonvilleky/latest/nortonville_ky/0-0-0-3279) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Pikeville -- Business Licenses](https://pikevilleky.gov/business/) | HTTP 403: the site refuses automated requests; a real browser was refused too |
| KY | [City of Simpsonville Code of Ordinances Sec. 110.27](https://codelibrary.amlegal.com/codes/simpsonville/latest/simpsonville_ky/0-0-0-6803) | HTTP 403: the site refuses automated requests; a real browser was refused too |
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
| OH | [Village of Georgetown -- Income Tax](https://georgetownohio.gov/income-tax/) | read with a browser last time; a real browser was refused too |
| US | [IRS draft tax forms: payroll forms only (W-4, W-4P/R, Pub 15/15-T, 940/941/944, W-2/W-3)](https://www.irs.gov/draft-tax-forms) | read with a browser last time; a real browser was refused too |

</details>

## Unchanged (1033)

<details><summary>Show all</summary>

- AL - [Alabama DOR withholding tax](https://www.revenue.alabama.gov/individual-corporate/withholding-tax-2/) (last changed: 2026-10-15)
- AL - [Alabama DOR: local tax (rates and codes for cities and counties)](https://www.revenue.alabama.gov/local-tax/) (last changed: 2026-10-18)
- AL - [Alabama DOR: news](https://www.revenue.alabama.gov/news) (last changed: 2026-10-22)
- AL - [Alabama Department of Labor -- 2026 UI wage base and rate figures (cross-source)](https://www2.labor.alabama.gov/) (last changed: 2026-10-17)
- AL - [Alabama Department of Revenue -- NOTICE: Overtime Exemption Ends June 30, 2025](https://www.revenue.alabama.gov/notice-overtime-exemption-ends-june-30-2025/) (last changed: 2026-10-16)
- AL - [Alabama League of Municipalities: municipal tax rates (occupational tax survey list)](https://almonline.org/TaxRates.aspx) (last changed: 2026-10-20)
- AL - [Alabama State Comptroller -- Memorandum, 'Jefferson County Occupational Tax'](https://comptroller.alabama.gov/wp-content/uploads/2018/01/Jefferson-County-Occupational-Tax.pdf) (last changed: 2026-09-24)
- AL - [City of Auburn -- Occupational License Fee](https://www.auburnal.gov/revenue/tax-information/occupational-license-fee/) (last changed: 2026-09-30)
- AL - [City of Glencoe -- Form G-1, Employer's Monthly/Quarterly Return of Occupational Tax Withheld (Ordin](https://cityofglencoe.org/wp-content/uploads/2021/09/Glencoe-Occupational-Tax-Form.pdf) (last changed: 2026-10-20)
- AL - [City of Irondale -- Occupational License Fee](https://cityofirondaleal.gov/occupational-license-fee/) (last changed: 2026-09-30)
- AL - [City of Leeds -- Occupational Tax](https://www.leedsalabama.gov/471/Occupational-Tax) (last changed: 2026-09-30)
- AL - [City of Opelika -- announcement of the occupational tax cut](https://www.opelika-al.gov/CivicAlerts.aspx?AID=1092) (last changed: 2026-10-22)
- AL - [City of Southside -- Occupational Tax Return (06/30/2022)](https://cityofsouthside.com/wp-content/uploads/2023/02/Occupational-Tax-Return.pdf) (last changed: 2026-10-20)
- AL - [City of Tarrant -- occupational license fee ordinance (Municode)](https://mcclibraryfunctions.azurewebsites.us/api/ordinanceDownload/10178/1047327/pdf) (last changed: 2026-09-30)
- AL - [Download a pdf of this notice (linked from Alabama Department of Revenue -- NOTICE: Overtime )](https://www.revenue.alabama.gov/wp-content/uploads/2025/06/250529_NOTICE_IT_OvertimeExemptionSunset.pdf) (last changed: 2026-10-20)
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
- AZ - [150-206-692, Oregon's out-of-state/nonresident-employer guide (cross-referenced from OR-2026.json)](https://www.oregon.gov/dor/forms/FormsPubs/withholding-transit-tax-non-resident_206-692.pdf) (last changed: 2026-10-20)
- AZ - [2026 Form A-4, Employee's Arizona Withholding Election](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_A-4_f.pdf) (last changed: 2026-10-20)
- AZ - [2026 Form WEC Instructions, 'Nonresidents' section](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_WECi.pdf) (last changed: 2026-10-20)
- AZ - [A.R.S. § 33-1131(B) — maximum part of disposable earnings subject to garnishment: the lesser of 10% ](https://www.azleg.gov/ars/33/01131.htm) (last changed: 2026-10-20)
- AZ - [Arizona DOR -- Withholding Calculations](https://azdor.gov/individuals/withholding-calculations) (last changed: 2026-10-20)
- AZ - [Arizona DOR withholding](https://azdor.gov/business/withholding-tax) (last changed: 2026-10-20)
- AZ - [Arizona DOR: news](https://azdor.gov/news) (last changed: 2026-10-20)
- AZ - [Arizona Form A-4 (2025)](https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2025_A-4_f.pdf) (last changed: 2026-10-20)
- AZ - [Arizona Withholding Tax Ruling (WTR) 16-4 (linked from Arizona DOR withholding)](https://azdor.gov/sites/default/files/2023-03/RULINGS_WTHOLD_2016_wtr-16-4.pdf) (last changed: 2026-10-20)
- AZ - [City of Tucson -- Tucson Minimum Wage Act (Proposition 206, November 2021)](https://www.tucsonaz.gov/Departments/Business-Services-Department/Tucson-Minimum-Wage-Act) (last changed: 2026-10-22)
- AZ - [NAICS Code and Descriptions (linked from Arizona DOR withholding)](https://www.aztaxes.gov/PDF/NAICS_11_24_2015.pdf) (last changed: 2026-10-20)
- CA - [2026 Withholding Schedules - Method A – Wage Bracket Table Method (PDF (linked from California EDD r](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26metha.pdf) (last changed: 2026-10-20)
- CA - [Aviso Legal (Spanish) FY25-26 (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/25-26%20Notices/2025-26__Notification_Spanish%202025-09-08.pdf) (last changed: 2026-10-22)
- CA - [Aviso Legal (Spanish) FY26-27 (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Spanish%202026-06-09.pdf) (last changed: 2026-10-22)
- CA - [Cal. Civ. Proc. Code § 706.050 — ordinary garnishment limited to the lesser of 20% of disposable ear](https://selfhelp.courts.ca.gov/guide-earnings-withholding-orders-employers) (last changed: 2026-10-20)
- CA - [California DE 44 employer's guide](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) (last changed: 2026-10-20)
- CA - [California Department of Industrial Relations -- Fast Food Minimum Wage Frequently Asked Questions](https://www.dir.ca.gov/dlse/Fast-Food-Minimum-Wage-FAQ.htm) (last changed: 2026-10-20)
- CA - [California Department of Industrial Relations -- Health Care Worker Minimum Wage Frequently Asked Qu](https://www.dir.ca.gov/dlse/Health-Care-Worker-Minimum-Wage-FAQ.htm) (last changed: 2026-10-20)
- CA - [California Department of Industrial Relations — state minimum wage $16.90/hr effective 2026-01-01](https://www.dir.ca.gov/dlse/minimum_wage.htm) (last changed: 2026-10-20)
- CA - [California EDD rates and withholding](https://edd.ca.gov/en/payroll_taxes/rates_and_withholding/) (last changed: 2026-10-20)
- CA - [California EDD: news releases and announcements](https://edd.ca.gov/en/about_edd/news_releases_and_announcements/) (last changed: 2026-10-20)
- CA - [California Employer's Guide (DE 44), Rev. 52 (4-26) -- "How to Withhold PIT on Supplemental Wages"](https://www.edd.ca.gov/siteassets/files/pdf_pub_ctr/de44.pdf) (last changed: 2026-10-20)
- CA - [California FTB: newsroom](https://www.ftb.ca.gov/about-ftb/newsroom/index.html) (last changed: 2026-10-20)
- CA - [California Withholding Schedules for 2026 (Method B - Exact Calculation Method)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26methb.pdf) (last changed: 2026-10-20)
- CA - [City of Long Beach -- Notice of Annual Adjustment, Hotel Worker Hourly Rate $26.50 (Measure RW, effe](https://www.longbeach.gov/globalassets/city-clerk/media-library/documents/public-notices/public-notices/measure-rw-bulletin-effective-july-1-2026) (last changed: 2026-10-20)
- CA - [City of Malibu -- 2026 minimum wage determination](https://www.malibucity.org/minimumwage) (last changed: 2026-10-20)
- CA - [City of Santa Monica -- Minimum Wage](https://www.santamonica.gov/minimum-wage) (last changed: 2026-10-20)
- CA - [EDD -- California Withholding Schedules for 2025, Method B (Exact Calculation Method)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/25methb.pdf) (last changed: 2026-10-20)
- CA - [Enforcement Guide (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/MinimumWage_Enforcement-Employees.pdf) (last changed: 2026-10-20)
- CA - [Enforcement Guide (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/MinimumWage_Enforcement-Businesses.pdf) (last changed: 2026-10-22)
- CA - [FAQ (English) (linked from City of Santa Monica -- Minimum Wage)](https://santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_English2023.pdf) (last changed: 2026-10-22)
- CA - [FAQ (Spanish) (linked from City of Santa Monica -- Minimum Wage)](https://santamonica.gov/media/Minimum_Wage/MinimumWageFAQ_Spanish2023.pdf) (last changed: 2026-10-20)
- CA - [Form DE 4, Employee's Withholding Allowance Certificate, Rev. 56 (1-26)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de4.pdf) (last changed: 2026-10-20)
- CA - [Health Care Minimum Wage Supplement to the minimum wage order (linked from California Department of ](https://www.dir.ca.gov/iwc/MW-2025-SUPPLEMENT-health-care.pdf) (last changed: 2026-10-20)
- CA - [Hotel Wage Fact Sheet (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/SantaMonicaWageLaw-Hotels.pdf) (last changed: 2026-10-22)
- CA - [Impressum [German] (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_German.pdf) (last changed: 2026-10-22)
- CA - [Information Sheet: California System of Experience Rating (DE 231Z) (P (linked from California EDD r](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de231z.pdf) (last changed: 2026-10-20)
- CA - [Information Sheet: Taxability of Employee Benefits (DE 231EB) Rev. 12 (6-17)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de231eb.pdf) (last changed: 2026-10-20)
- CA - [Information Sheet: Types of Payments (DE 231TP) Rev. 1 (6-16)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de231tp.pdf) (last changed: 2026-10-20)
- CA - [Legal Notice FY25-26 (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/25-26%20Notices/2025-26__Notification_English%202025-09-08.pdf) (last changed: 2026-10-22)
- CA - [Legal Notice FY26-27 (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_English%202026-06-09.pdf) (last changed: 2026-10-22)
- CA - [Legal na Paunawa [Tagalog] (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Tagalog.pdf) (last changed: 2026-10-22)
- CA - [Method A – Wage Bracket Table Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/25metha.pdf) (last changed: 2026-10-20)
- CA - [Method A – Wage Bracket Table Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/23metha.pdf) (last changed: 2026-10-20)
- CA - [Method A – Wage Bracket Table Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/24metha.pdf) (last changed: 2026-10-20)
- CA - [Method B – Exact Calculation Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/24methb.pdf) (last changed: 2026-10-20)
- CA - [Method B – Exact Calculation Method (PDF) (linked from California EDD rates and withholding)](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/23methb.pdf) (last changed: 2026-10-20)
- CA - [Paid Sick Leave Checklist (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/PaidSickLeave-ChecklistforBusinesses.pdf) (last changed: 2026-10-22)
- CA - [Paid Sick Leave Tips (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/PaidSickLeaveTips-Employees.pdf) (last changed: 2026-10-22)
- CA - [Paid Sick Leave: Must do/ Should do (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/MinimumWagePostcard_MustShouldDo.pdf) (last changed: 2026-10-22)
- CA - [Rules and Regulations (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/Media/Minimum_Wage/City%20of%20Santa%20Monica%20Minimum%20Wage%20Rules%20and%20Regulations-1.pdf) (last changed: 2026-10-20)
- CA - [Supplement for Fast Food Restaurant Employees (linked from California Department of Industrial Relat](https://www.dir.ca.gov/iwc/MW-2024-FF-SUPPLEMENT.pdf) (last changed: 2026-10-20)
- CA - [Tax Rates, Wage Limits, and Value of Meals and Lodging (DE 3395) (PDF) (linked from California EDD r](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de3395.pdf) (last changed: 2026-10-20)
- CA - [Thông báo pháp lý [Vietnamese] (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Vietnamese.pdf) (last changed: 2026-10-22)
- CA - [Unincorporated Los Angeles County minimum wage, July 1, 2025 step ($17.81)](https://dcba.lacounty.gov/newsroom/new-worker-protections-for-july-1-2025/) (last changed: 2026-10-20)
- CA - [Wage Order 5 (linked from California Department of Industrial Relations -- F)](https://www.dir.ca.gov/IWC/IWCArticle05.pdf) (last changed: 2026-10-20)
- CA - [Wage Order 7 (linked from California Department of Industrial Relations -- F)](https://www.dir.ca.gov/IWC/IWCArticle07.pdf) (last changed: 2026-10-20)
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
- CA - [here (linked from California Department of Industrial Relations — st)](https://www.dir.ca.gov/dlse/Waiver-Application.pdf) (last changed: 2026-10-20)
- CA - [list (linked from California Department of Industrial Relations -- H)](https://hcai.ca.gov/wp-content/uploads/2024/10/SB-525-Fact-Sheet-HCAI-Hospital-Lists-10_10_24.pdf) (last changed: 2026-10-20)
- CA - [the application is available here (linked from California Department of Industrial Relations -- H)](https://www.dir.ca.gov/dlse/Waiver-Application.pdf) (last changed: 2026-10-20)
- CA - [Официальное уведомление [Russian] (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Russian.pdf) (last changed: 2026-10-22)
- CA - [Իրավական ծանուցում [Armenian] (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Armenian.pdf) (last changed: 2026-10-22)
- CA - [คำบอกกล่าวทางกฎหมาย [Thai] (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Thai.pdf) (last changed: 2026-10-22)
- CA - [法律声明 [Simplified Chinese] (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Simplified_Chinese.pdf) (last changed: 2026-10-22)
- CA - [법적 고지 [Korean] (linked from City of Santa Monica -- Minimum Wage)](https://www.santamonica.gov/media/Minimum_Wage/Notifications/26-27%20Notices/2026-27_Notification_Korean.pdf) (last changed: 2026-10-22)
- CO - [Boulder County -- Local Minimum Wage](https://bouldercounty.gov/departments/commissioners/local-minimum-wage/) (last changed: 2026-10-20)
- CO - [Boulder District Attorney’s website (linked from Boulder County -- Local Minimum Wage)](https://assets.bouldercounty.gov/wp-content/uploads/2023/11/Wage-Theft-English-2022.pdf) (last changed: 2026-10-20)
- CO - [City and County of Denver -- Denver Local Minimum Wage Adjusts to $19.29 per Hour for 2026](https://www.denvergov.org/Government/Agencies-Departments-Offices/Agencies-Departments-Offices-Directory/Department-of-Finance/News/2025/Denver-Local-Minimum-Wage-Adjusts-to-19.29-per-Hour-for-2026) (last changed: 2026-10-20)
- CO - [City and County of Denver Tax Guide Topic No. 61 -- Occupational Privilege Taxes (OPT or Head Tax)](https://www.denvergov.org/content/dam/denvergov/Portals/571/documents/TaxGuide/TaxGuideTopic61_OccupationalPrivilegeTaxes.pdf) (last changed: 2026-10-20)
- CO - [City of Aurora: occupational privilege tax (repealed 2025-01-01)](https://www.auroragov.org/business_services/taxes/occupational_privilege_tax) (last changed: 2026-10-20)
- CO - [City of Boulder -- Local Minimum Wage](https://bouldercolorado.gov/local-minimum-wage) (last changed: 2026-10-20)
- CO - [City of Glendale, CO — Occupational Privilege Tax (municipal code Chapter 3.21 and the city's own OP](https://www.glendale.co.us/355/Occupational-Privilege-Tax) (last changed: 2026-10-20)
- CO - [City of Sheridan, CO — Occupational Privilege Tax](https://ci.sheridan.co.us/288/Occupational-Privilege-Tax) (last changed: 2026-10-20)
- CO - [Colorado Department of Labor & Employment — UI Premium Rates](https://cdle.colorado.gov/employers/unemployment-insurance-premiums/premium-rates) (last changed: 2026-10-20)
- CO - [Colorado Division of Labor Standards (local minimum wage notices, INFO #19)](https://cdle.colorado.gov/dlss) (last changed: 2026-10-20)
- CO - [Colorado FAMLI -- premium rate (0.9% for 2023-2025; 0.88% from 2026)](https://famli.colorado.gov/employers) (last changed: 2026-10-20)
- CO - [Colorado Wage Withholding Tax Guide, January 2026](https://tax.colorado.gov/sites/tax/files/documents/Wage_Withholding_Tax_Guide_Jan_2026.pdf) (last changed: 2026-10-20)
- CO - [Commissioners’ Agenda (linked from Boulder County -- Local Minimum Wage)](https://assets.bouldercounty.gov/wp-content/uploads/2017/08/bocc-advance-agenda.pdf) (last changed: 2026-10-20)
- CO - [DR 1098 (10/21/25), 2026 Colorado Withholding Worksheet for Employers](https://tax.colorado.gov/sites/tax/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf) (last changed: 2026-10-20)
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
- GA - [2023 Employers Tax Guide (linked from Georgia Employer's Tax Guide (current))](https://dor.georgia.gov/document/document/2023-employers-tax-guidepdf/download) (last changed: 2026-10-18)
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
- HI - [Haw. Rev. Stat. § 652-1 — MARGINAL brackets on monthly disposable earnings: 5% of the first $100/mon](https://www.capitol.hawaii.gov/hrscurrent/Vol13_Ch0601-0676/HRS0652/HRS_0652-0001.htm) (last changed: 2026-10-22)
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
- IA - [Iowa Department of Revenue: press releases](https://revenue.iowa.gov/press-releases) (last changed: 2026-10-20)
- IA - [Iowa Individual Income Tax Withholding Formula, Effective January 1, 2026](https://revenue.iowa.gov/media/53/download?inline=) (last changed: 2026-10-20)
- IA - [Iowa Workforce Development / Iowa Division of Labor -- Your Rights Under the Iowa Minimum Wage Law a](https://workforce.iowa.gov/media/234/download) (last changed: 2026-10-20)
- IA - [Iowa withholding](https://revenue.iowa.gov/taxes/tax-guidance/withholding-tax) (last changed: 2026-10-20)
- ID - [EPB00744 — Table for Percentage Computation Method of Withholding](https://tax.idaho.gov/document-mngr/pubs_EPB00744) (last changed: 2026-09-24)
- ID - [Form ID W-4, Employee's Withholding Allowance Certificate (EFO00307, 04-28-2025 revision)](https://tax.idaho.gov/w4form) (last changed: 2026-09-24)
- ID - [Idaho Child Tax Credit Allowance Table (ICTCAT) page](https://tax.idaho.gov/ictcat) (last changed: 2026-09-24)
- ID - [Idaho Code § 11-207 — restriction on garnishment, maximum: lesser of 25% of disposable earnings, or ](https://legislature.idaho.gov/statutesrules/idstat/title11/t11ch2/sect11-207/) (last changed: 2026-10-18)
- ID - [Idaho Department of Labor — 2026 UI Rate Class Array](https://www.labor.idaho.gov/wp-content/uploads/2024/12/Tax-rate_Class-array_2026.pdf) (last changed: 2026-09-24)
- ID - [Idaho State Tax Commission -- Withholding tables updated for 2025 (press release, 2025-05-01)](https://tax.idaho.gov/pressrelease/withholding-tables-updated-for-2025/) (last changed: 2026-09-30)
- ID - [Idaho State Tax Commission: press releases](https://tax.idaho.gov/pressrelease) (last changed: 2026-10-18)
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
- IL - [Publication 110 (linked from Illinois withholding income tax)](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-110.pdf) (last changed: 2026-10-20)
- IL - [Publication 110, W-2, W-2c, W-2G, and 1099 Filing and Storage Requirem (linked from Pub-130, Withhol](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-110.pdf) (last changed: 2026-10-20)
- IL - [Publication 121 (linked from Illinois withholding income tax)](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-121.pdf) (last changed: 2026-10-20)
- IL - [Publication 130 (linked from Illinois withholding income tax)](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-130.pdf) (last changed: 2026-10-20)
- IL - [Publication 131 (linked from Illinois withholding income tax)](https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-131.pdf) (last changed: 2026-10-20)
- IL - [Spanish (linked from Illinois Department of Labor — Minimum Wage Law (c)](https://labor.illinois.gov/content/dam/soi/en/web/idol/2025-updated-chicago-address-forms/Wage%20Complaint%20Form%20Espanol_11-7-25.pdf) (last changed: 2026-10-20)
- IN - [1 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dor/files/reference/dn01.pdf) (last changed: 2026-10-20)
- IN - [1220 Flat File Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dA/be2052e7c3/business-rules-1220-flat-file.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [1220 Specifications (linked from Indiana DOR withholding)](https://www.irs.gov/pub/irs-pdf/p1220.pdf) (last changed: 2026-10-18)
- IN - [1220 Specifications/Deviations for Indiana (includes W-2Gs and 1099) (linked from Indiana DOR withho](https://www.in.gov/dA/06b8f7f762/guide-1220-w-2g-1099.pdf?language_id=1) (last changed: 2026-10-18)
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
- IN - [ACH Debit Block Information (linked from Indiana DOR withholding)](https://intime.dor.in.gov/eServices/WebFiles/ACHDebitBlockGuide.pdf) (last changed: 2026-10-18)
- IN - [Change Log (linked from Indiana DOR withholding)](https://www.in.gov/dA/bbb0b69ed4/2016WTH_change_log.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Changes for Tax Year 2024 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/84c9a6182f/tax-changes-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR 2024 Fiscal Annual Report (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/f18050d282/nn-ar-2024.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [DOR 2025 Fiscal Annual Report (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/2e20fab1df/NP-DOR_2025_Fiscal_Annual_Report.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR recognized as Top Workplace (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/552b6a0877/nn-twp-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [DOR's Annual Public Hearing set for May 19 (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/47da49aef6/2026-news-release-annual-public-hearing.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Departmental Notice #1 (linked from Indiana DOR withholding)](https://www.in.gov/dA/92797e5a5f/dn01.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [Departmental Notice #1 (linked from WH-4, State Form 48845)](https://www.in.gov/dA/92797e5a5f/dn01.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [Departmental Notice #26 (linked from Indiana DOR: departmental notices)](https://www.in.gov/dA/4e9d38318e/dn26.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [EFW2 Flat File Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dA/7ad2e03d76/business-rules-efw2-flat-file.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [EFW2 Specifications/Deviations for Indiana (includes W-2 and WH-3) (linked from Indiana DOR withhold](https://www.in.gov/dA/982ff2641c/guide-efw2-w2-wh3.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Electronic payments and payment plans (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/7a5ed24c42/nn-pay-online-plans.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Eligible Hoosiers can file for a tax credit online (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/14378de7b3/NP-Eligible_Hoosiers_can_file_for_the_SC-40_online.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Estimated payments (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/76c648ed2e/nn-estimated-payments.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Form WH-47 — Certificate of Residence](https://forms.in.gov/download.aspx?id=2419) (last changed: 2026-09-24)
- IN - [Get help preparing your taxes (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/2b697b6110/nn-help-prep-taxes.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Guide to Filing Withholding via SFTP Bulk Upload (linked from Indiana DOR withholding)](https://www.in.gov/dA/0a9a6c9175/guide-withholding-sftp.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [How to file your 2023 Indiana Individual income taxes (linked from Indiana DOR: news and publication](https://www.in.gov/dA/dd9b73c7c4/nn-how-to-file-inidividual.pdf?language_id=1) (last changed: 2026-10-20)
- IN - [How to send us a message (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/1a94ade629/nn-how-to-send-message.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [INTIME Guide to Withholding Taxes (linked from Indiana DOR withholding)](https://www.in.gov/dA/5bba4274a2/guide-withholding-intime.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [INTIME customer portal keybot now available (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/3c2619280a/nn-keybot.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [INTIME for Business Customers (linked from Indiana DOR withholding)](https://www.in.gov/dA/a3107df03b/intime-business-guide.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [IRIS Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dor/files/IRIS-Business-Rules.pdf) (last changed: 2026-10-18)
- IN - [Income Tax to Residents With Out-of-State Income (Reciprocal Agreement (linked from Indiana DOR with](https://www.in.gov/dA/ca58e65593/ib28.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR Launches Amnesty Eligibility Tool (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/a2e30e47fc/News-Release-Amnesty-Eligibility-Tool-May-18-2026.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR shares changes for 2025 tax returns (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/a26f05261b/NP-Indiana_DOR_shares_changes_for_2025_tax_returns.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana DOR withholding](https://www.in.gov/dor/i-am-a/business-corp/withholding/) (last changed: 2026-10-17)
- IN - [Indiana DOR: departmental notices](https://www.in.gov/dor/legal-resources/tax-library/departmental-notices/) (last changed: 2026-10-20)
- IN - [Indiana DOR: news and publications](https://www.in.gov/dor/about/news-publications/) (last changed: 2026-10-18)
- IN - [Indiana Department of Revenue Warns of Text Message Scam (linked from Indiana DOR: news and publicat](https://www.in.gov/dA/2a75116158/NP-Indiana_Department_of_Revenue_Warns_of_Text_Message_Scam.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Indiana Departmental Notice #1 (county rates)](https://www.in.gov/dor/files/dn01.pdf) (last changed: 2026-10-20)
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
- IN - [SFTP Bulk Upload Guide (linked from Indiana DOR withholding)](https://www.in.gov/dA/efe5e47b07/guide-bulk-file.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax Amnesty 2026 Window Opens (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/d1e7c10cad/2026-news-release-tax-amnesty-opens.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax Day is here! (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/7b4c8addc7/nn-tax-day-2024.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Tax information for seniors and snowbirds (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/0fc4c3fa53/nn-tax-info-seniors.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Time's Running Out: Indiana’s Tax Amnesty 2026 Ends Sept. 9 (linked from Indiana DOR: news and publi](https://www.in.gov/dA/82b7e62e1f/2026-news-release-tax-amnesty-times-running-out.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [WH-1 XML Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dA/d2a2c3ce66/business-rules-wh1-xml.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [WH-3 XML Business Rules (linked from Indiana DOR withholding)](https://www.in.gov/dA/734e099191/business-rules-wh3-xml.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [WH-4, State Form 48845](https://www.in.gov/dor/tax-forms/withholding-tax-forms/) (last changed: 2026-10-19)
- IN - [Where's my refund? (linked from Indiana DOR: news and publications)](https://www.in.gov/dA/01d4f0b348/nn-wheres-my-refund.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [Withholding Information for Part-Time Employees (linked from Indiana DOR withholding)](https://www.in.gov/dA/f205e0a637/ib52.pdf?language_id=1) (last changed: 2026-10-18)
- IN - [electronic methods and options for filing Withholding (linked from Indiana DOR withholding)](https://www.in.gov/dA/8abea3ed05/dor-efile-methods-bulk.pdf?language_id=1) (last changed: 2026-10-18)
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
- KY - [2025 Employer Withholding Ca​lculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2025%20Withholding%20Tax%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2026 Employer Withholding Ca​lculator.xl​sx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/Documents/2026%20Withholding%20Tax%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [2026 Property Tax Bills (PDF) (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2026/09/2026-Real-Tangible-Prop-Tax-Spreadsheet-w.-Pymt-Info-UPDATED-9.9.26.pdf) (last changed: 2026-10-20)
- KY - [2​023 Employer Withholding Calculator.xlsx (linked from Kentucky withholding)](https://revenue.ky.gov/Business/PublishingImages/Pages/Employer-Payroll-Withholding/2023%20Employer%20Withholding%20Calculator.xlsx) (last changed: 2026-10-18)
- KY - [42A804 (K-4)(12-2025)](https://revenue.ky.gov/Forms/42A804%20(K-4)%20(2026).pdf) (last changed: 2026-09-24)
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
- KY - [Business License (linked from City of St. Matthews -- Occupational Tax)](https://www.stmatthewsky.gov/wp-content/uploads/2025/01/St_Matthews_Business_License_Application.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2021 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2021-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2022 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2022-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2023 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2023-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2024 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2024-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2025 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/9/Business-License-Form-FY2025-FILLABLE.pdf) (last changed: 2026-10-20)
- KY - [Business License Form 2026 (linked from City of Paducah -- Business License and Payroll Ta)](https://paducahky.gov/files/Business-License-Form-FY2026-fillable.pdf) (last changed: 2026-10-20)
- KY - [Business License Ordinance (linked from Grant County Fiscal Court -- Occupational Licensin)](https://grantcounty.ky.gov/wp-content/uploads/2024/11/Business-License-Ordinance-2024.pdf) (last changed: 2026-10-20)
- KY - [Business License Registration Application - for Businesses New to Padu (linked from City of Paducah ](https://paducahky.gov/files/Application-New-Business-License-rev2026-fillable.pdf) (last changed: 2026-10-20)
- KY - [City of Brandenburg -- Ordinance 648 (June 2025)](https://brandenburg.ky.gov/wp-content/uploads/2025/06/ORD-648-Occupational-Tax-.33-JUNE-2025.pdf) (last changed: 2026-09-30)
- KY - [City of Burkesville -- Application for Occupational License (posted 2024-08)](https://cityofburkesville.org/wp-content/uploads/sites/80/2024/08/Application-Occupational-License.pdf) (last changed: 2026-10-20)
- KY - [City of Burkesville -- Occupational ordinance (posted 2024-08)](https://cityofburkesville.org/wp-content/uploads/sites/80/2024/08/Occupational-Ordinance.pdf) (last changed: 2026-10-20)
- KY - [City of Corbin Occupational Tax Office](https://www.corbin-ky.gov/assets/files/uploads/_20240118110308388_3c4b72d27552424881504b851b27ab70.pdf) (last changed: 2026-10-18)
- KY - [City of Covington, KY — Finance Department, business licensing and occupational license fee](https://www.covingtonky.gov/government/departments/finance/business-licensing-occupational-license-fee) (last changed: 2026-09-24)
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
- KY - [City of Lyndon occupational tax FAQ (GovOS / munirevs)](https://lyndonky.munirevs.com/faq/) (last changed: 2026-10-20)
- KY - [City of Millersburg Ordinances (posted 2019-01)](https://millersburgky.com/wp-content/uploads/2019/01/City-of-Millersburg-Ordinances.pdf) (last changed: 2026-10-20)
- KY - [City of Nicholasville, KY — Tax Office](https://nicholasville.org/tax-office/) (last changed: 2026-10-20)
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
- KY - [Grant County Fiscal Court -- Occupational Licensing](https://grantcounty.ky.gov/occupational-licensing/) (last changed: 2026-09-30)
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
- KY - [Kentucky OUI Employer Guide to Unemployment Insurance 2026 (rate schedules, taxable wage base): ui.k](https://ui.ky.gov/Documents/KY-OUI_Employer%20Guide_2026.pdf) (last changed: 2026-10-18)
- KY - [Kentucky Secretary of State: occupational tax districts (spreadsheet of every district)](https://web.sos.ky.gov/occupationaltax/) (last changed: 2026-09-24)
- KY - [Kentucky Unemployment Insurance self-service site (employer notices)](https://ui.ky.gov/Redesign/home.aspx) (last changed: 2026-10-18)
- KY - [Kentucky withholding](https://revenue.ky.gov/Business/Pages/Employer-Payroll-Withholding.aspx) (last changed: 2026-10-22)
- KY - [License Fee Regulations – 5th edition – Issued Dec. 1, 2000 (linked from City of Lexington -- Occupa](https://content.lexingtonky.gov/sites/default/files/migrated-files/sites/default/files/2016-08/License%2520Fee%2520Regulations.pdf) (last changed: 2026-10-20)
- KY - [Louisville Metro Revenue Commission -- W-1KJC Instructions and Louisville Metro Code Sec. 110.02](https://louisvilleky.gov/sites/default/files/2024-12/w-1kjc_instructions_2025.pdf) (last changed: 2026-09-24)
- KY - [Need to update or cancel a business account? (linked from Kentucky withholding)](http://revenue.ky.gov/Forms/10A104.pdf) (last changed: 2026-10-18)
- KY - [Net Profit License Fee Return (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/NPform-1.pdf) (last changed: 2026-10-20)
- KY - [Notice of Rate Change (linked from Grant County Fiscal Court -- Occupational Licensin)](https://grantcounty.ky.gov/wp-content/uploads/2026/05/NEW-RATE-LETTER-2026.pdf) (last changed: 2026-10-20)
- KY - [ORDINANCE 0006-2026-0298- Amending Occupational License Tax, in effect (linked from Grant County Fis](https://grantcounty.ky.gov/wp-content/uploads/2026/05/Ordinance-0006-2026-0298-Amending-Occupational-Tax-signed.pdf) (last changed: 2026-10-20)
- KY - [Occupational License Fees (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/NetProfitsOrdinance.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax Application (linked from City of St. Matthews -- Occupational Tax)](https://www.stmatthewsky.gov/wp-content/uploads/2022/09/Occupational-Tax-Application.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax Refund (linked from City of St. Matthews -- Occupational Tax)](https://www.stmatthewsky.gov/wp-content/uploads/2022/09/Annual-Refund-Occupational-Tax.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax Request to Close Acct.pdf (linked from Simpson County -- Occupational Tax Administr](https://simpsoncountyky.gov/wp-content/uploads/2022/03/Occupational-Tax-Request-to-Close-Acct.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax – Coupon (linked from Simpson County -- Occupational Tax Administration)](https://simpsoncountyky.gov/wp-content/uploads/2026/01/2026occtaxcoupon.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax – Ordinance #220.262 (linked from Simpson County -- Occupational Tax Administration](https://simpsoncountyky.gov/wp-content/uploads/2026/01/Ordinance-220.262-1.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax – Reconciliation Form (linked from Simpson County -- Occupational Tax Administratio](https://simpsoncountyky.gov/wp-content/uploads/2026/01/Recon2.pdf) (last changed: 2026-10-20)
- KY - [Occupational Tax – Registration Form (linked from Simpson County -- Occupational Tax Administration)](https://simpsoncountyky.gov/wp-content/uploads/2022/03/Simpson-Live-Registration.pdf) (last changed: 2026-10-20)
- KY - [Open Records (linked from Grant County Fiscal Court -- Occupational Licensin)](https://grantcounty.ky.gov/wp-content/uploads/2022/03/2021_Standardized_Open_Records_Request_Form_V3-1.pdf) (last changed: 2026-10-20)
- KY - [Popular Annual Financial Report (PAFR) 2022 (linked from City of Covington, KY — Finance Department,](https://www.covingtonky.gov/Portals/covingtonky/PAFR%20FY22%20Final.pdf) (last changed: 2026-10-20)
- KY - [Popular Annual Financial Report (PAFR) 2023 (linked from City of Covington, KY — Finance Department,](https://www.covingtonky.gov/Portals/covingtonky/PAFR%20FY23.pdf) (last changed: 2026-10-20)
- KY - [Powell County -- Ordinance 2025-07](http://www.powellcountyky.us/ordinances/Ordinance%202025-07.pdf) (last changed: 2026-10-18)
- KY - [Quarterly Filing Report (linked from City of Grayson -- Occupational-Payroll)](https://www.graysonky.org/_files/ugd/b20b56_caed40441c684eabb4f2e4705b3c7257.pdf) (last changed: 2026-10-20)
- KY - [Quarterly Payroll Tax Form (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2023/03/Quarterly-Payroll-Tax-Form-2023.pdf) (last changed: 2026-10-20)
- KY - [Request for Refund Form (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2023/03/Request-for-Refund-Form-.pdf) (last changed: 2026-10-20)
- KY - [Rules and Regulations (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2026/08/Cemetery-Rules-and-Regulations.pdf) (last changed: 2026-10-20)
- KY - [School District of Cumberland County -- Occupational License Tax ordinance (effective 2008-01-01)](https://files.smartsites.parentsquare.com/12425/taxordinance-januarydoc.pdf) (last changed: 2026-10-20)
- KY - [Section Map (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2026/08/Cemetery-Section-Map.pdf) (last changed: 2026-10-20)
- KY - [Short Term Rental Property Ordinance (linked from Grant County Fiscal Court -- Occupational Licensin](https://grantcounty.ky.gov/wp-content/uploads/2024/11/STRP-ORDINANCE.pdf) (last changed: 2026-10-20)
- KY - [Simpson County -- Occupational Tax Administration](https://simpsoncountyky.gov/occupational-tax-administration/) (last changed: 2026-09-30)
- KY - [Solicitud de licencia ocupacional (linked from City of Covington, KY — Finance Department, busine)](https://www.covingtonky.gov/Portals/covingtonky/Spanish%20Occupational%20Business%20License%20Application%20Kenton%20County.pdf) (last changed: 2026-10-20)
- KY - [Solicitud de licencia ocupacional temporal (linked from City of Covington, KY — Finance Department, ](https://www.covingtonky.gov/Portals/covingtonky/Spanish%20Temporary%20Business%20License.pdf) (last changed: 2026-10-20)
- KY - [Transient Room Tax Ordinance (linked from Grant County Fiscal Court -- Occupational Licensin)](https://grantcounty.ky.gov/wp-content/uploads/2023/04/1997.pdf) (last changed: 2026-10-20)
- KY - [Transient Room Tax form (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/Blank_Transient_Room_Tax_From-1.pdf) (last changed: 2026-10-20)
- KY - [USDA National Finance Center -- Kentucky City (Local) Income Tax Withholding bulletin](https://help.nfc.usda.gov/bulletins/2024/1709749757.htm) (last changed: 2026-09-24)
- KY - [Worksheet (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/NPworksheet-1.pdf) (last changed: 2026-10-20)
- KY - [annual reconciliation (PDF) (linked from City of Winchester -- Occupational License Fees (P)](https://www.winchesterky.com/assets/files/uploads/_20251104095154885_1d83716b2a9840c5b51811a5a76ba09a.pdf) (last changed: 2026-10-20)
- KY - [here (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/ABCQtrlyRegulatoryReturnKVSForm2022.pdf) (last changed: 2026-10-20)
- KY - [here (linked from City of Nicholasville, KY — Tax Office)](https://nicholasville.org/wp-content/uploads/2020/07/ABCBasic.pdf) (last changed: 2026-10-20)
- KY - [her​e​ (linked from Kentucky withholding)](https://revenue.ky.gov/Forms/2025%20Specifications%20for%20Electronic%20Submission%20of%201099B%2C%201099DIV%2C%201099G%2C%201099INT%2C%201099K%2C%201099MISC%2C%201099NEC%2C%201099OID%2C%201099R%20and%20W2G%20Tax%20Information%20on%20CD%20or%20MyTaxes.ky.gov.pdf) (last changed: 2026-10-18)
- KY - [map of City Hall (PDF) (linked from City of Winchester -- Occupational License Fees (P)](https://www.winchesterky.com/assets/files/uploads/_20251104095243259_c9f84c3b91374660924622c7bc1e0c8c.pdf) (last changed: 2026-10-20)
- KY - [return of license fee (PDF) (linked from City of Winchester -- Occupational License Fees (P)](https://www.winchesterky.com/assets/files/uploads/_20251104095130151_c8e2177520dc476e8652a80737c43550.pdf) (last changed: 2026-10-20)
- LA - [Louisiana DOR -- R-1306 (1/25) Louisiana Withholding Tables and Formulas, effective on or after Janu](https://dam.ldr.la.gov/taxforms/1306-1-25.pdf) (last changed: 2026-10-20)
- LA - [Louisiana Department of Revenue: news and announcements](https://revenue.louisiana.gov/news-and-announcements) (last changed: 2026-10-20)
- LA - [Louisiana Revised Statutes 47:293 -- Tax table income (residents)](https://legis.la.gov/Legis/Law.aspx?d=101760) (last changed: 2026-10-20)
- LA - [Louisiana Withholding Tax Tables (linked from Louisiana withholding tax tables)](https://dam.ldr.la.gov/lawspolicies/1802EMR030.pdf) (last changed: 2026-10-20)
- LA - [Louisiana withholding](https://revenue.louisiana.gov/businesses/widely-used-tax-types/withholding/) (last changed: 2026-10-20)
- LA - [Louisiana withholding tax tables](https://revenue.louisiana.gov/tax-professionals/general-resources/louisiana-withholding-tax-tables/) (last changed: 2026-10-20)
- LA - [R-1300 (1/26) -- Employee's Withholding Certificate (Form L-4)](https://dam.ldr.la.gov/taxforms/1300-1-26-F.pdf) (last changed: 2026-10-20)
- LA - [R-1306 (1/26) -- Louisiana Withholding Tables and Formulas, effective on or after January 1, 2026](https://dam.ldr.la.gov/taxforms/1306-1-26.pdf) (last changed: 2026-10-20)
- LA - [USDA National Finance Center -- Louisiana State Income Tax Withholding bulletin (2025)](https://help.nfc.usda.gov/bulletins/2025/1740487316.htm) (last changed: 2026-10-20)
- MA - [Form M-4, Massachusetts Employee's Withholding Exemption Certificate (Rev. 11/19)](https://www.miltonma.gov/DocumentCenter/View/6586/Massachusetts-Withholding-Form--M-4) (last changed: 2026-10-20)
- MA - [Mass. DOR -- Massachusetts 4% Surtax on Taxable Income](https://www.mass.gov/info-details/massachusetts-4-surtax-on-taxable-income) (last changed: 2026-10-22)
- MA - [Massachusetts Circular M (2026, effective January 1)](https://www.mass.gov/doc/massachusetts-circular-m-income-tax-withholding-tables-at-50-effective-january-1-2026/download) (last changed: 2026-10-22)
- MA - [Massachusetts Constitution, Article LXXXIX (Home Rule Amendment), Section 7 — Limitations on Local P](https://malegislature.gov/Laws/Constitution) (last changed: 2026-10-20)
- MA - [Massachusetts DOR withholding tax forms (new Circular M editions are listed here)](https://www.mass.gov/lists/dor-withholding-tax-forms) (last changed: 2026-10-22)
- MA - [Massachusetts Department of Revenue: home (news and notices)](https://www.mass.gov/orgs/massachusetts-department-of-revenue) (last changed: 2026-10-22)
- MA - [Massachusetts General Laws Chapter 175M, Section 6 — PFML Contributions](https://malegislature.gov/Laws/GeneralLaws/PartI/TitleXXII/Chapter175M/Section6) (last changed: 2026-10-20)
- MA - [Massachusetts General Laws Chapter 62B, Section 2 — Duty of employer to withhold](https://malegislature.gov/Laws/GeneralLaws/PartI/TitleIX/Chapter62B/Section2) (last changed: 2026-10-20)
- MA - [USDA National Finance Center — Massachusetts State Income Tax Withholding (NFC-26-1769797447)](https://help.nfc.usda.gov/bulletins/2026/1769797447.htm) (last changed: 2026-10-20)
- MD - [2026 Maryland State and Local Income Tax Withholding Information (Central Payroll Bureau memo, Attac](https://www.marylandcomptroller.gov/content/dam/mdcomp/md/state-payroll/memos/2026/2026-maryland-state-and-local-withholding-information.pdf) (last changed: 2026-10-20)
- MD - [Comptroller of Maryland -- Withholding Tax Facts, January 2025 - December 2025 (Revised 07/25)](https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/legal-publications/facts/Withholding-Tax-Facts-2025.pdf) (last changed: 2026-10-20)
- MD - [English (linked from Montgomery County, MD Office of Human Rights -- Mi)](https://www.dllr.state.md.us/labor/wages/minimumwagelawmont.pdf) (last changed: 2026-10-20)
- MD - [Español (linked from Montgomery County, MD Office of Human Rights -- Mi)](https://www.dllr.state.md.us/labor/wages/minimumwagelawmontes.pdf) (last changed: 2026-10-20)
- MD - [Good Standing Certificate (PDF) (linked from Maryland Comptroller (marylandtaxes.gov): home (an)](https://www.marylandcomptroller.gov/content/dam/mdcomp/md/state-accounting/forms/GSCRequest.pdf) (last changed: 2026-10-20)
- MD - [Howard County, MD -- Minimum Wage schedule (Finance Department)](https://www.howardcountymd.gov/finance/minimum-wage) (last changed: 2026-10-20)
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
- ME - [Form W-4ME, Employee's Withholding Allowance Certificate (Revised: December 2025)](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_form_w-4me_fillable.pdf) (last changed: 2026-10-20)
- ME - [MRS Warns Employers of Tax Phishing Schemes (PDF) (linked from Maine Revenue Services: home (announc](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/Stop_Connect_Confirm_%20Poster.pdf) (last changed: 2026-10-20)
- ME - [Maine Department of Labor — 2026 minimum wage ($15.10/hr, effective 2026-01-01, cost-of-living index](https://www.maine.gov/labor/news_events/article.shtml?id=13338762) (last changed: 2026-10-20)
- ME - [Maine Department of Labor — June 2026 Paid Family and Medical Leave (PFML) Employer FAQ](https://www.maine.gov/paidleave/docs/2026/employers/faq/employerFAQenglish.pdf) (last changed: 2026-10-20)
- ME - [Maine Revenue Services -- 2025 Withholding Tables for Individual Income Tax (revised October 2024)](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/25_wh_tab_instr.pdf) (last changed: 2026-10-20)
- ME - [Maine Revenue Services — 2026 Withholding Tables, Revised August 2026 (26_wh_tab_instr_August2026.pd](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_wh_tab_instr_August2026.pdf) (last changed: 2026-10-20)
- ME - [Maine Revenue Services — Withholding Tables for Individual Income Tax (2026)](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_wh_tab_instr.pdf) (last changed: 2026-10-20)
- ME - [Maine Revenue Services: home (announcements)](https://www.maine.gov/revenue/) (last changed: 2026-10-22)
- ME - [Maine withholding tables](https://www.maine.gov/revenue/taxes/income-estate-tax/employer-withholding) (last changed: 2026-10-20)
- ME - [Service Provider Tax Repeal Notice (PDF) (linked from Maine Revenue Services: home (announcements))](https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/SPT%20Repeal_Notice_FINAL_11212025_0.pdf) (last changed: 2026-10-20)
- ME - [USDA National Finance Center — Maine State Income Tax Withholding (NFC-26-1771620053)](https://help.nfc.usda.gov/bulletins/2026/1771620053.htm) (last changed: 2026-10-20)
- ME - [§3126-A MS-Word (linked from 14 M.R.S. § 3126 — ordinary garnishment limited to)](https://legislature.maine.gov/statutes/14/title14sec3126-A.docx) (last changed: 2026-10-20)
- ME - [§3126-A PDF (linked from 14 M.R.S. § 3126 — ordinary garnishment limited to)](https://legislature.maine.gov/statutes/14/title14sec3126-A.pdf) (last changed: 2026-10-20)
- MI - [2026 Michigan Income Tax Withholding Guide, Form 446 (Rev. 02-26)](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2026/446_Withholding-Guide_2026.pdf) (last changed: 2026-09-24)
- MI - [4.25% Income Tax Rate for Individuals and Fiduciaries in 2026 Tax Year (Treasury taxpayer notice, 20](https://www.michigan.gov/treasury/reference/taxpayer-notices/2026/04/15/425-income-tax-rate-for-individuals-and-fiduciaries-in-2026-tax-year) (last changed: 2026-09-24)
- MI - [5469 (Rev. 05-24) — 2025 City of Detroit Income Tax Withholding Guide (Treasury administers Detroit ](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/City-Withholding/TY2025/5469_ty2025.pdf) (last changed: 2026-09-24)
- MI - [Application for State Real Estate Transfer Tax (SRETT) Refund (linked from Michigan Treasury: taxes ](https://www.michigan.gov/taxes/-/media/Project/Websites/treasury/Forms/Misc/2796.pdf) (last changed: 2026-10-18)
- MI - [City of Saginaw — What is the tax rate for City of Saginaw Income Tax? (FAQ)](https://www.saginaw-mi.com/FAQ.aspx?QID=131) (last changed: 2026-10-20)
- MI - [MCL 600.4012 and Michigan's own garnishment procedure — tracks the federal CCPA floor (25%/30x-feder](https://www.legislature.mi.gov/Laws/MCL?objectName=mcl-600-4012) (last changed: 2026-10-18)
- MI - [MI-W4 (Rev. 12-20) — Employee's Michigan Withholding Exemption Certificate](https://www.michigan.gov/-/media/Project/Websites/taxes/Forms/All-Years/MIW4.pdf) (last changed: 2026-09-24)
- MI - [Michigan LEO/UIA — Taxable Wage Base FAQ](https://www.michigan.gov/leo/bureaus-agencies/uia/employers/forms/accordion/taxable-wage-base) (last changed: 2026-09-24)
- MI - [Michigan LEO/UIA — Unemployment Tax Rate (statutory formula, Section 19 of the Michigan Employment S](https://www.michigan.gov/leo/bureaus-agencies/uia/assets/unemployment-tax-rate) (last changed: 2026-09-24)
- MI - [Michigan Treasury -- 446 Michigan Income Tax Withholding Guide (2025)](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2025/446_Withholding-Guide_2025.pdf) (last changed: 2026-09-30)
- MI - [Michigan Treasury -- Withholding Tax Information by Calendar Year](https://www.michigan.gov/taxes/business-taxes/withholding/calendar-year-tax-information) (last changed: 2026-09-30)
- MI - [Michigan Treasury — Withholding Reciprocity Examples (Analysis section: MCL 206.703(2), MCL 206.110,](https://www.michigan.gov/taxes/business-taxes/payroll-service-providers/withholding-reciprocity-examples) (last changed: 2026-09-24)
- MI - [Michigan Treasury: taxes home (notices and withholding news)](https://www.michigan.gov/taxes) (last changed: 2026-10-18)
- MI - [Michigan Treasury: taxpayer notices](https://www.michigan.gov/treasury/reference/taxpayer-notices) (last changed: 2026-10-18)
- MI - [Michigan Treasury: which cities impose an income tax](https://www.michigan.gov/taxes/questions/iit/accordion/general/what-cities-impose-an-income-tax) (last changed: 2026-09-24)
- MI - [Michigan withholding tax](https://www.michigan.gov/taxes/business-taxes/withholding) (last changed: 2026-09-24)
- MI - [Questions and Answers About Paying Your Withholding Tax on an Accelera (linked from Michigan withhol](https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/4285-Instructions.pdf?hash=EA587E841C309AB5B9A4CD6A9AEB8C77) (last changed: 2026-10-18)
- MI - [Revenue Administrative Bulletin 1988-27 — Section 125 cafeteria plan benefits excluded from AGI are ](https://michigan.gov/treasury/0,4679,7-121-44402_44415_44416-7351--,00.html) (last changed: 2026-09-24)
- MN - [2025 Property Tax Services Report (linked from Minnesota Department of Revenue: what's new)](https://www.revenue.state.mn.us/sites/default/files/2026-02/2025-state-property-tax-services-report-accessible.pdf) (last changed: 2026-10-20)
- MN - [2026 Form W-4MN, Section 2 -- Exemption From Minnesota Withholding](https://www.revenue.state.mn.us/sites/default/files/2026-04/w-4mn.pdf) (last changed: 2026-10-20)
- MN - [2026 Minnesota Withholding Tax Instructions and Tables (wh-inst-26)](https://www.revenue.state.mn.us/sites/default/files/2025-12/wh-inst-26.pdf) (last changed: 2026-10-20)
- MN - [City of Minneapolis -- Minimum wage increases to $16.37 for all employers](https://www.minneapolismn.gov/news/2025/december/minimum-wage/) (last changed: 2026-10-20)
- MN - [City of Saint Paul -- Minimum Wage Increases for Small and Micro Businesses (effective July 1, 2026)](https://www.stpaul.gov/news/city-saint-paul-minimum-wage-increases-small-and-micro-businesses) (last changed: 2026-10-22)
- MN - [Form MWR, Minnesota Reciprocity Exemption /Affidavit of Residency (linked from Minnesota Department ](https://www.revenue.state.mn.us/sites/default/files/2025-12/mwr.pdf) (last changed: 2026-10-20)
- MN - [Minn. R. 8002.0200 (administrative rule implementing 290.081's reciprocity exclusion)](https://www.revisor.mn.gov/rules/8002.0200/) (last changed: 2026-10-20)
- MN - [Minn. Stat. § 268B.14 (Premium rates)](https://www.revisor.mn.gov/statutes/cite/268B.14) (last changed: 2026-10-20)
- MN - [Minn. Stat. § 290.081 (Income of nonresidents, reciprocity)](https://www.revisor.mn.gov/statutes/cite/290.081) (last changed: 2026-10-20)
- MN - [Minn. Stat. § 477A.016](https://www.revisor.mn.gov/statutes/cite/477A.016) (last changed: 2026-10-20)
- MN - [Minn. Stat. § 571.922 — non-support garnishment: fully exempt at or below 40x the applicable minimum](https://www.revisor.mn.gov/statutes/cite/571.922) (last changed: 2026-10-20)
- MN - [Minnesota DEED -- Paid Leave: premiums begin January 1, 2026](https://mn.gov/deed/paidleave/employers/) (last changed: 2026-10-20)
- MN - [Minnesota Department of Labor and Industry -- Minimum wage in Minnesota](https://www.dli.mn.gov/business/employment-practices/minimum-wage-minnesota) (last changed: 2026-10-20)
- MN - [Minnesota Department of Labor and Industry — 2026 statewide minimum wage ($11.41/hr, single rate for](https://dli.mn.gov/news/minimum-wage-rate-adjusted-inflation-jan-1-2026) (last changed: 2026-10-20)
- MN - [Minnesota Department of Revenue -- Reciprocity for Individuals, and wh-inst-26 p.4 ('Reciprocity for](https://www.revenue.state.mn.us/reciprocity) (last changed: 2026-10-20)
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
- MO - [Missouri Department of Revenue: news](https://dor.mo.gov/news/) (last changed: 2026-10-20)
- MO - [Missouri unemployment insurance 2026 rate/wage-base reporting (Bloomberg Tax, Vensure, MO DOLIR's ow](https://labor.mo.gov/des/employers/tax-rates) (last changed: 2026-10-20)
- MO - [Missouri withholding](https://dor.mo.gov/taxation/business/tax-types/withholding/) (last changed: 2026-10-20)
- MO - [St. Louis: earnings tax department](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/index.cfm) (last changed: 2026-10-22)
- MO - [St. Louis: employer withholding and payroll expense tax information](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/payroll-tax-info.cfm) (last changed: 2026-10-20)
- MO - [W-10/P-10 Forms (Fillable) (linked from St. Louis: earnings tax department)](https://www.stlouis-mo.gov/government/departments/collector/earnings-tax/documents/p-10-w-10-form-fillable.cfm) (last changed: 2026-10-20)
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
- MT - [2026 Montana Publication 1, A Guide to Montana Tax Withholding and Estimated Payments](https://revenuefiles.mt.gov/files/Forms/Publication-1/Publication-1-2026.pdf) (last changed: 2026-10-20)
- MT - [Montana Annual W-2 1099 Withholding Tax Reconciliation - Form MW-3 (PD (linked from Montana withhold](https://revenuefiles.mt.gov/files/Forms/Montana_Annual_W-2_1099_Withholding_Tax_Reconciliation_Form_MW-3.pdf) (last changed: 2026-10-20)
- MT - [Montana DLI -- UI Contribution Rate Schedules (all 12 schedules, I-XII)](https://uid.dli.mt.gov/employers/schedule-of-contribution-rates) (last changed: 2026-10-20)
- MT - [Montana Employer and Information Agent Guide (publication page)](https://revenue.mt.gov/publications/montana-employer-and-information-agent-guide) (last changed: 2026-10-20)
- MT - [Montana Employer and Information Agent Guide with Montana Withholding Tax Tables (V4, November 2025)](https://revenuefiles.mt.gov/files/Forms/Montana_Employer_and_Information_Agent_Guide_with_Tax_Tables.pdf) (last changed: 2026-10-20)
- MT - [Montana Withholding Tax Payment Voucher - Form MW-1 (PDF) (linked from Montana withholding)](https://revenuefiles.mt.gov/files/Forms/Montana_Withholding_Tax_Payment_Voucher_Form_MW-1.pdf) (last changed: 2026-10-20)
- MT - [Montana withholding](https://revenue.mt.gov/taxes/withholding-tax/wage-withholding-returns-and-payments) (last changed: 2026-10-20)
- MT - [Montana withholding news](https://revenue.mt.gov/news/recent-news/2026-withholding-updates) (last changed: 2026-10-20)
- NC - [Form NC-4 (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/employees-withholding-allowance-certificate-nc-4) (last changed: 2026-10-20)
- NC - [Form NC-4 EZ (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/employees-withholding-allowance-certificate-nc-4ez) (last changed: 2026-10-20)
- NC - [Form NC-4 NRA (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/nonresident-alien-employees-withholding-allowance-certificate) (last changed: 2026-10-20)
- NC - [Form NC-BN, Request to Close Tax Account (linked from NCDOR -- Withholding Tax Frequently Asked Ques](https://www.ncdor.gov/documents/nc-bn-out-business-notification) (last changed: 2026-10-20)
- NC - [Form NC-BR (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/form-nc-br-webfill-business-registration-application-income-tax-withholding-sales-and-use-tax-and) (last changed: 2026-10-20)
- NC - [N.C. Gen. Stat. § 1-362 — wages/personal earnings exempt from attachment/garnishment for ordinary ju](https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_1/GS_1-362.html) (last changed: 2026-10-20)
- NC - [NC Division of Employment Security -- Tax Rate Information](https://www.des.nc.gov/employers/tax-rate-information) (last changed: 2026-10-20)
- NC - [NC-30 (Web 11-25) -- 2026 Income Tax Withholding Tables and Instructions for Employers](https://www.ncdor.gov/income-tax-withholding-tables-and-instructions-employers/open) (last changed: 2026-10-20)
- NC - [NC-30, North Carolina Income Tax Withholding Tables and Instructions f (linked from NCDOR -- Withhol](https://www.ncdor.gov/documents/2017-income-tax-withholding-tables-and-instructions-employers) (last changed: 2026-10-20)
- NC - [NCDOR -- Withholding Tax Frequently Asked Questions](https://www.ncdor.gov/withholding-tax-frequently-asked-questions) (last changed: 2026-10-22)
- NC - [North Carolina Department of Revenue: news](https://www.ncdor.gov/news) (last changed: 2026-10-20)
- NC - [North Carolina withholding](https://www.ncdor.gov/taxes-forms/withholding-tax) (last changed: 2026-10-20)
- NC - [Publication NC-30 (linked from NCDOR -- Withholding Tax Frequently Asked Question)](https://www.ncdor.gov/documents/income-tax-withholding-tables-and-instructions-employers) (last changed: 2026-10-20)
- NC - [USDA National Finance Center -- North Carolina Income Tax Withholding (2025)](https://help.nfc.usda.gov/bulletins/2025/1740006150.htm) (last changed: 2026-10-20)
- ND - [2026 Income Tax Withholding Rates and Instructions (North Dakota Office of State Tax Commissioner)](https://www.tax.nd.gov/sites/www/files/documents/forms/individual/2026-iit/2026-income-tax-withholding-rates-booklet.pdf) (last changed: 2026-10-20)
- ND - [ACH Credit PDF (linked from North Dakota withholding)](https://www.tax.nd.gov/sites/www/files/documents/forms/misc-forms/ach-credit.pdf) (last changed: 2026-10-20)
- ND - [Form 306 (linked from North Dakota withholding)](https://www.tax.nd.gov/sites/www/files/documents/forms/business/it-withholding/form-306-web.pdf) (last changed: 2026-10-20)
- ND - [Form NDW-R -- Reciprocity Exemption from Withholding for Qualifying Minnesota and Montana Residents](https://www.tax.nd.gov/sites/www/files/documents/forms/business/ndwrfillable.pdf) (last changed: 2026-10-20)
- ND - [Guideline – Income Tax Withholding & Information Returns (linked from North Dakota withholding)](https://www.tax.nd.gov/sites/www/files/documents/guidelines/business/it-withhold/income-tax-withholding-information-returns-guideline.pdf) (last changed: 2026-10-20)
- ND - [Instructions to E-File 1099s (linked from North Dakota withholding)](https://www.tax.nd.gov/sites/www/files/documents/Income%20Tax/ND-TAP-instructions-1099.pdf) (last changed: 2026-10-20)
- ND - [Instructions to E-File W-2s (linked from North Dakota withholding)](https://www.tax.nd.gov/sites/www/files/documents/Income%20Tax/ND-Tap-Instructions-W2s.pdf) (last changed: 2026-10-20)
- ND - [N.D.C.C. 57-38-60 (linked from North Dakota withholding)](https://ndlegis.gov/cencode/t57c38.pdf) (last changed: 2026-10-20)
- ND - [North Dakota Office of State Tax Commissioner -- Income Tax Withholding Rates and Instructions, 2025](https://www.tax.nd.gov/sites/www/files/documents/misc-discuss-folder/Final_2025%20Income%20Tax%20Withholding%20Rates%20%20Instructions.pdf) (last changed: 2026-10-20)
- ND - [North Dakota Office of State Tax Commissioner: news](https://www.tax.nd.gov/news) (last changed: 2026-10-20)
- ND - [North Dakota withholding](https://www.tax.nd.gov/income-tax-withholding) (last changed: 2026-10-20)
- NE - [2026 Nebraska Circular EN (full withholding guide)](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026cir_en_whole.pdf) (last changed: 2026-10-20)
- NE - [A Guide to Understanding Nebraska's Unemployment Insurance Combined Tax Rates (2026)](https://dol.nebraska.gov/webdocs/Resources/Items/2026%20UI%20guide%20to%20understanding.pdf) (last changed: 2026-10-20)
- NE - [Biweekly Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_biweekly.pdf) (last changed: 2026-10-20)
- NE - [Circular EN (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027cir_en_whole.pdf) (last changed: 2026-10-20)
- NE - [Daily Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_daily.pdf) (last changed: 2026-10-20)
- NE - [Download Court Filing (linked from Nebraska Attorney General -- suit against the City)](https://ago.nebraska.gov/sites/default/files/doc/2026.08.18%20-%20Complaint.pdf) (last changed: 2026-10-20)
- NE - [Download Court Filing (linked from Nebraska Attorney General -- suit against the City)](https://ago.nebraska.gov/sites/default/files/doc/Court%20Filing_26.pdf) (last changed: 2026-10-20)
- NE - [Entire Book (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027cir_en_whole.pdf) (last changed: 2026-10-20)
- NE - [Federal Form SS-4, Application for Employer Identification Number (linked from Nebraska withholding)](https://www.irs.gov/pub/irs-pdf/fss4.pdf) (last changed: 2026-10-20)
- NE - [Important Information for Employers (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/important_W-2_format_info.pdf) (last changed: 2026-10-20)
- NE - [Income Tax Withholding for Nonresident Individuals Performing Personal (linked from Nebraska withhol](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/info/8-515.pdf) (last changed: 2026-10-20)
- NE - [Instructions (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_instruct.pdf) (last changed: 2026-10-20)
- NE - [Instructions (linked from Nebraska withholding)](https://www.irs.gov/pub/irs-pdf/iss4.pdf) (last changed: 2026-10-20)
- NE - [Monthly Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_monthly.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Attorney General -- suit against the City of Omaha over its minimum wage ordinance](https://ago.nebraska.gov/news/attorney-general-hilgers-sues-city-omaha-over-unconstitutional-minimum-wage-ordinance) (last changed: 2026-10-20)
- NE - [Nebraska Computer Reporting Procedure (21CM) (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/default/files/doc/info/8-482.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Computer Reporting Procedure (21EFW2) (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/default/files/doc/info/8-633.pdf) (last changed: 2026-10-20)
- NE - [Nebraska DOR -- Nebraska Income Tax Withholding Percentage Method Tables (For Wages Paid on or After](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2024/2025_percent.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Department of Labor -- Nebraska's Minimum Wage Increases to $15 Effective January 1, 2026](https://dol.nebraska.gov/PressRelease/Details/338) (last changed: 2026-10-20)
- NE - [Nebraska Department of Revenue: news](https://revenue.nebraska.gov/news) (last changed: 2026-10-20)
- NE - [Nebraska Income Tax Withholding Percentage Method — Withholding Allowance Table](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026_percent.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Income Tax for U.S. Servicemembers, Their Spouses, and Civili (linked from Nebraska withhol](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/info/8-364.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Legislative Bill 258 (2026), approved by the Governor February 9, 2026](https://nebraskalegislature.gov/FloorDocs/109/PDF/Slip/LB258.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Nonresident Employee Certificate for Allocation of Income Tax (linked from Nebraska withhol](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/tax-forms/f_9n.pdf) (last changed: 2026-10-20)
- NE - [Nebraska Voluntary Disclosure Program (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/info/7-250.pdf) (last changed: 2026-10-20)
- NE - [Nebraska withholding](https://revenue.nebraska.gov/businesses/nebraska-income-tax-withholding) (last changed: 2026-10-20)
- NE - [Percentage Method (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_percent.pdf) (last changed: 2026-10-20)
- NE - [Procedures for Reviewing and Appealing a Notice of Deficiency Determin (linked from Nebraska withhol](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/info/7-149.pdf) (last changed: 2026-10-20)
- NE - [Required Special Income Tax Withholding Procedures (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_letter_only.pdf) (last changed: 2026-10-20)
- NE - [Semimonthly Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_semimonthly.pdf) (last changed: 2026-10-20)
- NE - [USDA National Finance Center -- Nebraska State Income Tax Withholding (2025)](https://help.nfc.usda.gov/bulletins/2025/1740158785.htm) (last changed: 2026-10-20)
- NE - [Weekly Payroll Period (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/revenue.nebraska.gov/files/doc/business/Cir_En_2026/2027_weekly.pdf) (last changed: 2026-10-20)
- NE - [wage table brackets (linked from Nebraska withholding)](https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2026/2027_weekly.pdf) (last changed: 2026-10-20)
- NJ - [2026 State Equalization Table (linked from New Jersey Division of Taxation: what's new)](https://www.nj.gov/treasury/taxation/pdf/lpt/2026NoticeofHearing.pdf) (last changed: 2026-10-20)
- NJ - [Click here (linked from NJ Division of Employer Accounts -- Rate informati)](https://www.nj.gov/labor/forms_pdfs/ea/Explanation%20of%20Unemployment%20Rate.pdf) (last changed: 2026-10-20)
- NJ - [DOWNLOAD HERE > (linked from NJ Division of Temporary Disability and Family Lea)](https://www.nj.gov/labor/myleavebenefits/assets/pdfs/FL1_7-20.pdf) (last changed: 2026-10-20)
- NJ - [DOWNLOAD NOW (ENGLISH) > (linked from NJ Division of Temporary Disability and Family Lea)](https://www.nj.gov/labor/myleavebenefits/assets/pdfs/PR-148%20(7-26)%20Cash%20Benefits%20Family%20Leave.pdf) (last changed: 2026-10-20)
- NJ - [DOWNLOAD NOW (ENGLISH) > (linked from NJ Division of Temporary Disability and Family Lea)](https://www.nj.gov/labor/myleavebenefits/assets/pdfs/PR-117%20(3-26)%20Cash%20Benefits%20Health%20Conditions%20and%20Pregnancy.pdf) (last changed: 2026-10-20)
- NJ - [DOWNLOAD NOW (SPANISH) > (linked from NJ Division of Temporary Disability and Family Lea)](https://www.nj.gov/labor/myleavebenefits/assets/pdfs/PR-148S%20(7-26)%20Cash%20Benefits%20Family%20Leave.pdf) (last changed: 2026-10-20)
- NJ - [DOWNLOAD NOW (SPANISH) > (linked from NJ Division of Temporary Disability and Family Lea)](https://www.nj.gov/labor/myleavebenefits/assets/pdfs/PR-117S%20(3-26)%20Cash%20Benefits%20Health%20Conditions%20and%20Pregnancy%20(1).pdf) (last changed: 2026-10-20)
- NJ - [DOWNLOAD NOW > (linked from NJ Division of Temporary Disability and Family Lea)](https://www.nj.gov/labor/myleavebenefits/assets/pdfs/DS1_6-19.pdf) (last changed: 2026-10-20)
- NJ - [Form NJ-165 -- Employee's Certificate of Nonresidence in New Jersey](https://www.nj.gov/treasury/taxation/pdf/current/nj165.pdf) (last changed: 2026-10-20)
- NJ - [Form NJ-W4, Employee's Withholding Allowance Certificate (1-21, last modified 2022-12-06)](https://nj.gov/treasury/taxation/pdf/current/njw4.pdf) (last changed: 2026-10-20)
- NJ - [Gozam Bar LLC (linked from New Jersey Division of Taxation: what's new)](https://www.nj.gov/treasury/taxation/pdf/auction/26-auction-GozamBarLLC.pdf) (last changed: 2026-10-20)
- NJ - [NJ Division of Employer Accounts -- Rate information, contributions, and due dates](https://www.nj.gov/labor/ea/employer-services/rate-info/) (last changed: 2026-10-20)
- NJ - [NJ Division of Temporary Disability and Family Leave Insurance — Worker FLI contribution rate](https://www.nj.gov/labor/myleavebenefits/worker/fli/) (last changed: 2026-10-20)
- NJ - [NJ Division of Temporary Disability and Family Leave Insurance — Worker TDI contribution rate](https://www.nj.gov/labor/myleavebenefits/worker/tdi/) (last changed: 2026-10-20)
- NJ - [NJDOL — New Benefit Rates for 2026 (taxable wage bases)](https://www.nj.gov/labor/lwdhome/press/2025/20251229_newbenefitrates2026.shtml) (last changed: 2026-10-20)
- NJ - [New Jersey Department of Labor and Workforce Development -- minimum wage increase announcement for J](https://www.nj.gov/labor/lwdhome/press/2025/20251001_Minimum_Wage.shtml) (last changed: 2026-10-20)
- NJ - [New Jersey Division of Taxation: what's new](https://www.nj.gov/treasury/taxation/whatsnew.shtml) (last changed: 2026-10-20)
- NJ - [New Jersey NJ-WT withholding instructions](https://www.nj.gov/treasury/taxation/pdf/current/njwt.pdf) (last changed: 2026-10-20)
- NJ - [New Jersey Office of Administrative Law -- Notice of Administrative Changes, Minimum Wage (N.J.A.C. ](https://www.nj.gov/labor/assets/PDFs/Legal%20Notices/Other/Public%20Notice%20Minimum%20Wage%202026_FINAL.pdf) (last changed: 2026-10-20)
- NJ - [New Jersey Withholding Rate Tables (Percentage Method, effective Oct 1, 2020)](https://www.nj.gov/treasury/taxation/pdf/withholdingtables.pdf) (last changed: 2026-10-20)
- NJ - [New Jersey employer payroll tax](https://www.nj.gov/treasury/taxation/businesses/payroll/index.shtml) (last changed: 2026-10-20)
- NJ - [OVP ENTERPRISES LLC (linked from New Jersey Division of Taxation: what's new)](https://www.nj.gov/treasury/taxation/pdf/auction/26-auction-ovp-enterprises.pdf) (last changed: 2026-10-20)
- NJ - [Platinum Hair Design (linked from New Jersey Division of Taxation: what's new)](https://www.nj.gov/treasury/taxation/pdf/auction/PlatinumHairDesignAuctionNotice.pdf) (last changed: 2026-10-20)
- NJ - [Platinum Hair Design (linked from New Jersey Division of Taxation: what's new)](https://www.nj.gov/treasury/taxation/pdf/auction/26-auction-platinum-hair-design.pdf) (last changed: 2026-10-20)
- NJ - [Platinum Hair Design (linked from New Jersey Division of Taxation: what's new)](https://www.nj.gov/treasury/taxation/pdf/auction/26PlatinumHair.pdf) (last changed: 2026-10-20)
- NJ - [Spring 2026 CEEB Meeting Legal Notice (linked from New Jersey Division of Taxation: what's new)](https://www.nj.gov/treasury/taxation/pdf/lpt/ceeb-spring-26.pdf) (last changed: 2026-10-20)
- NJ - [TB-110 (R) Corporation Business Tax Net Controlled Foreign Corporation (linked from New Jersey Divis](https://www.nj.gov/treasury/taxation/pdf/pubs/tb/tb110.pdf) (last changed: 2026-10-20)
- NJ - [Tax Assessor Continuing Education Eligibility Board public meeting on  (linked from New Jersey Divis](https://www.nj.gov/treasury/taxation/pdf/lpt/CEEB-2026-FallMeeting.pdf) (last changed: 2026-10-20)
- NJ - [UC-45, Voluntary Contribution Report (linked from NJ Division of Employer Accounts -- Rate informati](https://www.nj.gov/labor/ea/assets/PDFs/UC-45.pdf) (last changed: 2026-10-20)
- NJ - [paper application (FL-1) (linked from NJ Division of Temporary Disability and Family Lea)](https://www.nj.gov/labor/myleavebenefits/assets/pdfs/FL1_6-19v2.pdf) (last changed: 2026-10-20)
- NM - [$9.9M in child tax credits available for New Mexico parents (linked from New Mexico Taxation and Rev](https://www.tax.newmexico.gov/wp-content/uploads/2026/07/20260723_9.9M-in-tax-credits-available-for-New-Mexico-parents-to-claim.pdf) (last changed: 2026-10-20)
- NM - [Agent Client Rate File Format (linked from Texas Workforce Commission cross-reference for New)](https://www.dws.nm.gov/Portals/0/DM/Business/Client_Rate_File_Format.pdf) (last changed: 2026-10-20)
- NM - [Albuquerque resident indicted on felony tax fraud charges (linked from New Mexico Taxation and Reven](https://www.tax.newmexico.gov/wp-content/uploads/2026/07/20260722_Albuquerque-resident-indicted-on-felony-tax-fraud-charges.pdf) (last changed: 2026-10-20)
- NM - [Amended Living Wage Ordinance (Spanish)* (linked from Santa Fe County -- Living Wage Ordinance and 2](https://www.santafecountynm.gov/userfiles/AmendedLivingWageOrdinanceSpanish6-2014.pdf) (last changed: 2026-10-20)
- NM - [Assign a Third Party Administrator Guide (linked from Texas Workforce Commission cross-reference for](https://www.dws.nm.gov/Portals/0/DM/UI/Assign_a_Third_Party_Administrator_Guide042018.pdf) (last changed: 2026-10-20)
- NM - [City of Santa Fe -- Living Wage Ordinance notice (Municipal Code Sec. 28-1 SFCC 1987)](https://santafenm.gov/media/news_pdf/2025_Living_Wage_Ordinance.pdf) (last changed: 2026-10-20)
- NM - [Delinquent property tax auctions scheduled in January (linked from New Mexico Taxation and Revenue: ](https://www.tax.newmexico.gov/wp-content/uploads/2026/01/20260112_Delinquent-property-tax-auctions-scheduled-in-January-1.pdf) (last changed: 2026-10-20)
- NM - [Delinquent property tax auctions scheduled in March (linked from New Mexico Taxation and Revenue: ne](https://www.tax.newmexico.gov/wp-content/uploads/2026/02/20260223_Delinquent-property-tax-auctions-scheduled-in-March-2.pdf) (last changed: 2026-10-20)
- NM - [Disable Pop-Ups Blocker on Android (linked from New Mexico Taxation and Revenue Department — FYI-1)](https://www.tax.newmexico.gov/wp-content/uploads/2021/04/disable-pop-up-blocker-on-android-1.pdf) (last changed: 2026-10-20)
- NM - [Disable Pop-Ups Blocker on iPhone (linked from New Mexico Taxation and Revenue Department — FYI-1)](https://www.tax.newmexico.gov/wp-content/uploads/2021/04/turn-off-pop-up-blocker-on-iphone-1.pdf) (last changed: 2026-10-20)
- NM - [Download Posting Notice (EN/ES) (linked from Santa Fe County -- Living Wage Ordinance and 2026 )](https://www.santafecountynm.gov/userfiles/LivingWageNoticeSection10.pdf) (last changed: 2026-10-20)
- NM - [Employer Activation Guide (linked from Texas Workforce Commission cross-reference for New)](https://www.dws.nm.gov/Portals/0/DM/Business/Employer_Activation_Guide.pdf) (last changed: 2026-10-20)
- NM - [Half of New Mexico’s population are organ donors. Are you? (linked from New Mexico Taxation and Reve](https://www.tax.newmexico.gov/wp-content/uploads/2026/04/20260426_Half-of-New-Mexicos-population-are-organ-donors.-Are-you.pdf) (last changed: 2026-10-20)
- NM - [House passes tax code cleanup bill (linked from New Mexico Taxation and Revenue: news)](https://www.tax.newmexico.gov/wp-content/uploads/2026/02/20260212_House-passes-tax-code-cleanup-bill.pdf) (last changed: 2026-10-20)
- NM - [New Mexico Motor Vehicle Division warns against text scams (linked from New Mexico Taxation and Reve](https://www.tax.newmexico.gov/wp-content/uploads/2026/02/20260202_New-Mexico-Motor-Vehicle-Division-warns-against-text-scams-1.pdf) (last changed: 2026-10-20)
- NM - [New Mexico TRD -- Important return changes for 2026 (WKC fee notice)](https://www.tax.newmexico.gov/individuals/wp-content/uploads/sites/5/2026/01/WKC-Fee-Payment-Other-Update-.pdf) (last changed: 2026-10-20)
- NM - [New Mexico Taxation and Revenue Department — FYI-104, New Mexico Withholding Tax](https://www.tax.newmexico.gov/forms-publications/) (last changed: 2026-10-20)
- NM - [New Mexico Veterans Benefit from Expanded Property Tax Exemptions (linked from New Mexico Taxation a](https://www.tax.newmexico.gov/wp-content/uploads/2026/08/20260813_New-Mexico-Veterans-Benefit-from-Expanded-Property-Tax-Exemptions.pdf) (last changed: 2026-10-20)
- NM - [New Mexico back-to-school tax holiday is next weekend (linked from New Mexico Taxation and Revenue: ](https://www.tax.newmexico.gov/wp-content/uploads/2026/07/20260724_Back-to-school-tax-free-weekend-happening-July-31-Aug.-2.pdf) (last changed: 2026-10-20)
- NM - [New Mexico restaurant owner charged with tax evasion, fraud (linked from New Mexico Taxation and Rev](https://www.tax.newmexico.gov/wp-content/uploads/2026/05/20260507_New-Mexico-restaurant-owner-charged-with-tax-evasion-and-fraud.pdf) (last changed: 2026-10-20)
- NM - [New Mexico to begin accepting electronic income tax returns Jan. 16 (linked from New Mexico Taxation](https://www.tax.newmexico.gov/wp-content/uploads/2026/01/20260112_New-Mexico-to-begin-accepting-electronic-income-tax-returns-Jan.-16_Final.pdf) (last changed: 2026-10-20)
- NM - [New Mexico withholding (FYI-104)](https://realfile.tax.newmexico.gov/FYI-104.pdf) (last changed: 2026-10-20)
- NM - [New Mexico workers' compensation FAQ (fee amounts)](https://www.workerscomp.nm.gov/faqs/) (last changed: 2026-10-20)
- NM - [Ordinance 2014-1 (Living Wage Ordinance) (linked from Santa Fe County -- Living Wage Ordinance and 2](https://www.santafecountynm.gov/documents/ordinances/Ordinance2014-1.pdf) (last changed: 2026-10-20)
- NM - [Ordinance 2014-5 (Amended Ordinance) (linked from Santa Fe County -- Living Wage Ordinance and 2026 ](https://www.santafecountynm.gov/documents/ordinances/Ordinance2014-5.pdf) (last changed: 2026-10-20)
- NM - [Payment Allocation File Format (linked from Texas Workforce Commission cross-reference for New)](https://www.dws.nm.gov/Portals/0/DM/Business/Payment_Allocation_File_Formatv10.pdf) (last changed: 2026-10-20)
- NM - [Payment Due File Format (linked from Texas Workforce Commission cross-reference for New)](https://www.dws.nm.gov/Portals/0/DM/Business/Passive_Role_Assignment_File_Formatv10.pdf) (last changed: 2026-10-20)
- NM - [Reminder: Income tax returns due April 15 (linked from New Mexico Taxation and Revenue: news)](https://www.tax.newmexico.gov/wp-content/uploads/2026/03/20260315_Reminder-Income-tax-returns-due-April-15.pdf) (last changed: 2026-10-20)
- NM - [Santa Fe city and county living wage figures in effect through February 2026](https://www.santafecountynm.gov/news/detail/santa-fe-county-announces-living-wage-increase-effective-march-1-2025) (last changed: 2026-10-20)
- NM - [State encourages mailing important documents early to avoid missing de (linked from New Mexico Taxat](https://www.tax.newmexico.gov/wp-content/uploads/2026/01/20260116_USPS-Postmark-Prodecure-Changes.pdf) (last changed: 2026-10-20)
- NM - [State schedules five property tax auctions in August (linked from New Mexico Taxation and Revenue: n](https://www.tax.newmexico.gov/wp-content/uploads/2026/08/20260806_State-schedules-five-property-tax-auctions-in-August.pdf) (last changed: 2026-10-20)
- NM - [State schedules four property tax auctions in July (linked from New Mexico Taxation and Revenue: new](https://www.tax.newmexico.gov/wp-content/uploads/2026/07/20270703_State-schedules-four-property-tax-auctions-in-July.pdf) (last changed: 2026-10-20)
- NM - [State schedules seven property tax auctions in September (linked from New Mexico Taxation and Revenu](https://www.tax.newmexico.gov/wp-content/uploads/2026/09/20260901_State-schedules-seven-property-tax-auctions-in-September.pdf) (last changed: 2026-10-20)
- NM - [State to auction properties in Colfax County (linked from New Mexico Taxation and Revenue: news)](https://www.tax.newmexico.gov/wp-content/uploads/2026/06/20260605_State-to-auction-properties-in-Colfax-County.pdf) (last changed: 2026-10-20)
- NM - [State to auction properties in Doña Ana, Luna Counties (linked from New Mexico Taxation and Revenue:](https://www.tax.newmexico.gov/wp-content/uploads/2026/03/20260325_Delinquent-property-tax-auctions-scheduled-in-late-March-April.pdf) (last changed: 2026-10-20)
- NM - [State to auction properties in Sandoval, Mora Counties (linked from New Mexico Taxation and Revenue:](https://www.tax.newmexico.gov/wp-content/uploads/2026/09/20260928_State-to-auction-properties-in-Sandoval-Mora-Counties.pdf) (last changed: 2026-10-20)
- NM - [State to auction properties in Taos, Torrance Counties (linked from New Mexico Taxation and Revenue:](https://www.tax.newmexico.gov/wp-content/uploads/2026/04/20260422_State-to-auction-properties-in-Taos-Torrance-Counties-1.pdf) (last changed: 2026-10-20)
- NM - [Tax Department grants extensions for flood-harmed taxpayers (linked from New Mexico Taxation and Rev](https://www.tax.newmexico.gov/wp-content/uploads/2026/10/20261008_Tax-Department-grants-extensions-for-flood-affected-taxpayers.pdf) (last changed: 2026-10-20)
- NM - [Texas Workforce Commission cross-reference for New Mexico UI figures -- New Mexico DWS 'How UI Tax R](https://www.dws.state.nm.us/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated) (last changed: 2026-10-20)
- NM - [Theory of Change [PDF] (linked from City of Albuquerque -- Albuquerque Minimum Wage In)](https://www.cabq.gov/mayor/documents/2026-8-15-theory-of-change-final-pdf.pdf) (last changed: 2026-10-20)
- NM - [USDA National Finance Center -- New Mexico State Income Tax Withholding bulletin (2025)](https://help.nfc.usda.gov/bulletins/2025/1741189057.htm) (last changed: 2026-10-20)
- NM - [Vehicle registration fees, weight-distance tax to increase July 1 (linked from New Mexico Taxation a](https://www.tax.newmexico.gov/wp-content/uploads/2026/06/20260629_Increased-vehicle-registration-fees-to-take-effect-July-1.pdf) (last changed: 2026-10-20)
- NM - [Wage Reports Confirmation File Format (linked from Texas Workforce Commission cross-reference for Ne](https://www.dws.nm.gov/Portals/0/DM/Business/Wage_Reports_Confirmation_File_Formatv20.pdf) (last changed: 2026-10-20)
- NM - [Wage Reports Delimited File Specification (linked from Texas Workforce Commission cross-reference fo](https://www.dws.nm.gov/Portals/0/DM/Business/Wage_Reports_Delimited_File_Formatv21.pdf) (last changed: 2026-10-20)
- NM - [Wage Reports EFW2 File Specification (linked from Texas Workforce Commission cross-reference for New](https://www.dws.nm.gov/Portals/0/DM/Business/Wage_Reports_EFW2_File_Formatv21.pdf) (last changed: 2026-10-20)
- NM - [Wage Reports ICESA Specification (linked from Texas Workforce Commission cross-reference for New)](https://www.dws.nm.gov/Portals/0/DM/Business/Wage_Reports_ICESA_File_Formatv21.pdf) (last changed: 2026-10-20)
- NM - [Wage Reports XML File Specification (linked from Texas Workforce Commission cross-reference for New)](https://www.dws.nm.gov/Portals/0/DM/Business/Wage_Reports%20_XML_File_Formatv21.pdf) (last changed: 2026-10-20)
- NM - [here (linked from Santa Fe city and county living wage figures in ef)](https://www.santafecountynm.gov/documents/ordinances/Ordinance2014-1.pdf) (last changed: 2026-10-20)
- NM - [investigation request form (linked from Santa Fe County -- Living Wage Ordinance and 2026 )](https://www.santafecountynm.gov/uploads/documents/LivingWageComplaintForm_2026.pdf) (last changed: 2026-10-20)
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
- NY - [New York withholding tax](https://www.tax.ny.gov/bus/wt/wtidx.htm) (last changed: 2026-10-20)
- NY - [Notice 2013-45 PDF (linked from IRS -- Determining if an employer is an applicable)](https://www.irs.gov/pub/irs-drop/n-13-45.PDF) (last changed: 2026-10-20)
- NY - [Publication 5208 PDF (linked from IRS -- Determining if an employer is an applicable)](https://www.irs.gov/pub/irs-pdf/p5208.pdf) (last changed: 2026-10-20)
- NY - [U.S. DOL -- COBRA Continuation Coverage](https://www.dol.gov/general/topic/health-plans/cobra) (last changed: 2026-10-22)
- NY - [U.S. DOL Wage and Hour Opinion Letter (1986-05-07) on county-appointed poll workers](https://www.dol.gov/agencies/whd/compliance-assistance/handy-reference-guide-flsa) (last changed: 2026-10-22)
- NY - [Yonkers withholding tax tables and methods (NYS-50-T-Y)](https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_y.pdf) (last changed: 2026-10-20)
- NY - [data/minimum-wage/federal-2026.json (this engine's own federal minimum wage file)](https://www.dol.gov/agencies/whd/flsa) (last changed: 2026-10-22)
- NY - [eCFR 29 CFR 553.106 amendment history - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?section=553.106) (last changed: 2026-10-20)
- OH - [https://www.ccaohio.gov/member-municipalities](https://www.ccaohio.gov/member-municipalities) (last changed: 2026-10-13)
- OH - [https://www.ritaohio.com/municipalities](https://www.ritaohio.com/municipalities) (last changed: 2026-10-20)
- OH - [CCA (Central Collection Agency): municipal income tax calendar and notices](https://www.ccaohio.gov/due-dates/municipal-income-tax-calendar) (last changed: 2026-10-18)
- OH - [CCA Division of Taxation -- Tax Rates (2026 and 2025 tables)](https://www.ccaohio.gov/tax-rates) (last changed: 2026-09-30)
- OH - [City of Cheviot Tax Department -- JEDD INFORMATION (Contracts with Green Township)](https://cheviot.org/departments/tax/) (last changed: 2026-10-20)
- OH - [City of Dayton -- Joint Economic Development District](https://www.daytonohio.gov/261/Joint-Economic-Development-District) (last changed: 2026-09-30)
- OH - [City of Gallipolis Tax Department](https://cityofgallipolis.com/tax-department-2/) (last changed: 2026-10-20)
- OH - [City of Warren Income Tax Department -- Joint Economic Development Districts: 'The Warren-Champion J](https://www.warren.org/income_tax_department/joint_economic_development_districts_(jedd).php) (last changed: 2026-10-20)
- OH - [Combined Form IT 4 — Employee's Withholding Exemption Certificate (post-2020-12-07 combined version)](https://tax.ohio.gov/static/forms/employer_withholding/generic/wth-it4-combined-fi.pdf) (last changed: 2026-09-24)
- OH - [Employer Withholding Taxes - Percentage Method (Effective August 1, 2026)](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/employer_withholding/2026%20Withholding%20Tables/WHT_PercentageMethod_2026.pdf) (last changed: 2026-09-24)
- OH - [Excel File Generator Tool (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/oh%20muni%20ascii%20dev%20v017%202_19_2020.xls) (last changed: 2026-10-18)
- OH - [Jefferson Township -- Jefferson Township-Whitehall JEDD: 'On November 19th, 2024 ... mutually agreed](https://www.jeffersontownship.org/departments___services/economic_development___planning/jefferson_township-whitehall_jedd.php) (last changed: 2026-10-20)
- OH - [MNP 2017-01: Information for JEDDs and JEDZs information release (linked from Ohio Department of Tax](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/information-releases/mnp2017-01_information_for_jedds_and_jedzs-1.5.24.pdf) (last changed: 2026-10-18)
- OH - [MNP10 Tax Return (linked from Ohio Department of Taxation: municipal income tax )](https://tax.ohio.gov/static/muni-net-profit/ascii%20and%20xml/ascii%20-%20mnp10%20return%208-21-18.xlsx) (last changed: 2026-10-18)
- OH - [Municipality Address List (linked from Ohio Department of Taxation: municipal income tax )](https://dam.assets.ohio.gov/image/upload/tax.ohio.gov/muni-net-profit/muni%20address%20list%203-5-18.pdf) (last changed: 2026-10-18)
- OH - [Ohio Auditor of State, Liberty Township (Henry County) regular audit 2021-2022: 'The JEDD was dissol](https://ohioauditor.gov/Auditsearch/Reports/2023/Liberty_Township_22_21_Henry_FINAL.pdf) (last changed: 2026-10-06)
- OH - [Ohio Department of Commerce -- Ohio Minimum Wage Set to Increase in 2026](https://com.ohio.gov/about-us/media-center/news/ohio%20minimum%20wage%20set%20to%20increase%20in%202026) (last changed: 2026-09-24)
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
- OH - [RITA (Regional Income Tax Agency): news and updates (municipal rate and law changes)](https://www.ritaohio.com/Resources/News) (last changed: 2026-10-22)
- OH - [RITA -- Tax Rates Table, 2025 new municipalities and tax rate changes](https://www.ritaohio.com/TaxRatesTable) (last changed: 2026-10-20)
- OH - [RITA member page (the JEDD's administering agency) -- Recent Tax and Credit History](https://www.ritaohio.com/Municipalities/Home/MemberPage?id=047) (last changed: 2026-10-20)
- OH - [RITA member page (the JEDD's administering agency) -- Recent Tax and Credit History](https://www.ritaohio.com/Municipalities/Home/MemberPage?id=247) (last changed: 2026-10-20)
- OH - [RITA member page -- Avon (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=020) (last changed: 2026-10-20)
- OH - [RITA member page -- Circleville (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=190) (last changed: 2026-10-20)
- OH - [RITA member page -- DeGraff (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=249) (last changed: 2026-10-20)
- OH - [RITA member page -- Germantown (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=353) (last changed: 2026-10-20)
- OH - [RITA member page -- Hanging Rock (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=616) (last changed: 2026-10-20)
- OH - [RITA member page -- Lockbourne (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=427) (last changed: 2026-10-20)
- OH - [RITA member page -- Milford JEDD VIII](https://www.ritaohio.com/municipalities/Home/MemberPage?id=869) (last changed: 2026-10-20)
- OH - [RITA member page -- Millville (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=691) (last changed: 2026-10-20)
- OH - [RITA member page -- North Canton (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=546) (last changed: 2026-10-20)
- OH - [RITA member page -- North Hampton (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=695) (last changed: 2026-10-20)
- OH - [RITA member page -- Oak Hill (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=624) (last changed: 2026-10-20)
- OH - [RITA member page -- Rio Grande (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=588) (last changed: 2026-10-20)
- OH - [RITA member page -- Stockport (rate history)](https://www.ritaohio.com/municipalities/Home/MemberPage?id=719) (last changed: 2026-10-20)
- OH - [RITA: tax professionals news](https://www.ritaohio.com/TaxProfessionals/News) (last changed: 2026-10-20)
- OH - [The Finder: directory of every Ohio municipality (a new entry here is a new jurisdiction)](https://thefinder.tax.ohio.gov/api/file-downloads?type=municipality) (last changed: 2026-10-17)
- OH - [The Finder: directory of every Ohio school district](https://thefinder.tax.ohio.gov/api/file-downloads?type=schoolDistrict) (last changed: 2026-10-18)
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
- PA - [NJ Division of Taxation -- Reciprocal Personal Income Tax Agreement (PA/NJ)](https://www.nj.gov/treasury/taxation/njit25.shtml) (last changed: 2026-09-24)
- PA - [PA DCED -- Local Services Tax (LST)](https://dced.pa.gov/local-government/local-income-tax-information/local-services-tax/) (last changed: 2026-09-24)
- PA - [PA DCED Municipal Statistics -- EIT/PIT/LST Tax Register with Collector (statewide, official) -- 202](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2025) (last changed: 2026-09-30)
- PA - [PA DCED Municipal Statistics: statewide EIT/PIT/LST register, 2026 (every municipality and school di](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2026) (last changed: 2026-09-24)
- PA - [PA DCED Municipal Statistics: statewide EIT/PIT/LST register, 2027 (every municipality and school di](https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2027) (last changed: 2026-10-20)
- PA - [PA Department of Labor & Industry -- UC Computation of Rates](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/computation-of-rates) (last changed: 2026-10-02)
- PA - [PA Department of Labor & Industry -- UC employee withholding (0.07% since 2018)](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/employee-withholding) (last changed: 2026-09-24)
- PA - [PA Department of Labor & Industry -- Yearly Tax Highlights (UC)](https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/yearly-tax-highlights) (last changed: 2026-10-07)
- PA - [PA Department of Revenue -- Employer Withholding (reciprocal agreements)](https://www.pa.gov/en/agencies/revenue/resources/tax-types-and-information/employer-withholding.html) (last changed: 2026-10-22)
- PA - [PA Department of Revenue -- Personal Income Tax (3.07%)](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/personal-income-tax) (last changed: 2026-10-22)
- PA - [Pennsylvania Department of Revenue: newsroom](https://www.pa.gov/agencies/revenue/newsroom) (last changed: 2026-10-22)
- PA - [Pennsylvania employer withholding](https://www.pa.gov/agencies/revenue/resources/tax-types-and-information/employer-withholding) (last changed: 2026-10-22)
- PA - [REV-415 (SU) 01-23 -- Employer Withholding Information Guide](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/employerwithholding/documents/rev-415.pdf) (last changed: 2026-09-24)
- PA - [REV-419 (EX) 09-20, instructions REV-419 IN (EX) 03-24 -- Employee's Nonwithholding Application Cert](https://www.pa.gov/content/dam/copapwp-pagov/en/revenue/documents/formsandpublications/formsforbusinesses/employerwithholding/documents/rev-419.pdf) (last changed: 2026-09-24)
- PA - [UC-748 (REV 09-25) -- Contribution Rates Effective January 1, 2026](https://www.pa.gov/content/dam/copapwp-pagov/en/dli/documents/uc/employer/uc-tax-rates/uc-748%20rev%2009-25.pdf) (last changed: 2026-09-24)
- RI - [2026 Rhode Island Employer's Income Tax Withholding Tables (RI Division of Taxation)](https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-12/2026%20Withholding%20Tax%20Booklet.pdf) (last changed: 2026-10-20)
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
- US - [P.L. 119-21 on govinfo.gov (official text)](https://www.govinfo.gov/app/details/PLAW-119publ21) (last changed: 2026-09-24)
- US - [RRB Program Letter 2025-01 (monthly base) and RRB FY2026 Justification of Budget Estimates (rates)](https://www.rrb.gov/sites/default/files/2025-07/JBE2026.pdf) (last changed: 2026-09-30)
- US - [U.S. DOL Wage and Hour Division -- Fact Sheet 17A: Exemption for Executive, Administrative, Professi](https://www.dol.gov/agencies/whd/fact-sheets/17a-overtime) (last changed: 2026-09-24)
- US - [U.S. DOL Wage and Hour Division -- Minimum Wages for Tipped Employees (table current as of July 1, 2](https://www.dol.gov/agencies/whd/state/minimum-wage/tipped) (last changed: 2026-09-24)
- US - [US Railroad Retirement Board, Program Letter 2025-01](https://www.rrb.gov/Employers/Publications/ProgramAndCircularLetters/PL25-01) (last changed: 2026-09-30)
- US - [eCFR 29 CFR 870 amendment history (garnishment limits) - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-29.json?part=870) (last changed: 2026-09-24)
- US - [eCFR 34 CFR 34 amendment history (administrative wage garnishment) - official API](https://www.ecfr.gov/api/versioner/v1/versions/title-34.json?part=34) (last changed: 2026-09-24)
- UT - [Utah Publication 14 (withholding)](https://files.tax.utah.gov/tax/forms/pubs/pub-14.pdf) (last changed: 2026-09-24)
- UT - [Utah State Tax Commission -- Publication 14 Rev. 4/24, Withholding Tax Guide](https://files.tax.utah.gov/tax/forms/2024/pub-14.pdf) (last changed: 2026-09-30)
- UT - [Utah State Tax Commission -- Publication 14 Rev. 4/25, Withholding Tax Guide](https://files.tax.utah.gov/tax/forms/2025/pub-14.pdf) (last changed: 2026-09-30)
- UT - [Utah State Tax Commission UI wage base / tax rate page](https://jobs.utah.gov/ui/employer/Public/Questions/TaxRates.aspx) (last changed: 2026-09-24)
- VA - [Form VA-4, Employee's Virginia Income Tax Withholding Exemption Certificate (Rev. 04/26) + Personal ](https://www.tax.virginia.gov/sites/default/files/taxforms/withholding/any/va-4-any.pdf) (last changed: 2026-10-20)
- VA - [Va. Code Ann. § 34-29 — ordinary garnishment limited to the lesser of 25% of disposable earnings, or](https://law.lis.virginia.gov/vacode/title34/chapter4/section34-29/) (last changed: 2026-10-20)
- VA - [Virginia Department of Labor and Industry — 2026 minimum wage $12.77/hr effective 2026-01-01](https://doli.virginia.gov/2025/07/29/virginia-minimum-wage-rate-increasing-effective-january-1-2026/) (last changed: 2026-10-20)
- VA - [Virginia Paid Family and Medical Leave Insurance Program -- Governor's own press release](https://www.governor.virginia.gov/newsroom/news-releases/2026/may-releases/name-1117602-en.html) (last changed: 2026-10-20)
- VA - [Virginia Tax -- Income Tax Withholding Guide for Employers (Rev. 05/25)](https://www.tax.virginia.gov/sites/default/files/vatax-pdf/employer-withholding-instructions.pdf) (last changed: 2026-10-20)
- VA - [Virginia Tax: news](https://www.tax.virginia.gov/news) (last changed: 2026-10-20)
- VA - [Virginia unemployment insurance -- VEC's own wage-base FAQ](https://www.vec.virginia.gov/FAQs/employers/what-wage-base-each-employee-i-will-pay-taxes) (last changed: 2026-10-20)
- VA - [Virginia withholding](https://www.tax.virginia.gov/withholding-tax) (last changed: 2026-10-20)
- VT - [Form W-4VT, Employee's Withholding Allowance Certificate (Rev. 12/18)](https://tax.vermont.gov/sites/tax/files/documents/W-4VT.pdf) (last changed: 2026-10-20)
- VT - [GB-1210-2026, 2026 Income Tax Withholding Instructions, Tables, and Charts](https://tax.vermont.gov/sites/tax/files/documents/GB-1210-2026.pdf) (last changed: 2026-10-20)
- VT - [Governor Phil Scott Launches Voluntary Paid Family and Medical Leave Program — Office of Governor Ph](https://governor.vermont.gov/vtfmli) (last changed: 2026-10-20)
- VT - [Vermont Department of Taxes -- GB-1210, 2025 Income Tax Withholding Instructions, Tables, and Charts](https://tax.vermont.gov/sites/tax/files/documents/GB-1210-2025.pdf) (last changed: 2026-10-20)
- VT - [Vermont Department of Taxes: news](https://tax.vermont.gov/news) (last changed: 2026-10-20)
- VT - [Vermont withholding](https://tax.vermont.gov/business/withholding) (last changed: 2026-10-20)
- WA - [City of Seattle Office of Labor Standards -- Minimum Wage Ordinance](https://www.seattle.gov/laborstandards/ordinances/minimum-wage) (last changed: 2026-10-20)
- WA - [City of Seattle, City Finance -- Payroll expense tax (2025 thresholds and rates)](https://www.seattle.gov/city-finance/business-taxes-and-licenses/seattle-taxes/payroll-expense-tax) (last changed: 2026-10-22)
- WA - [City of Seattle, City Finance -- Social Housing Tax](https://seattle.gov/city-finance/business-taxes-and-licenses/seattle-taxes/social-housing-tax) (last changed: 2026-10-22)
- WA - [ESD — Paid Family and Medical Leave premium rate increases to 1.13% in 2026](https://esd.wa.gov/about-us/news-release/2025/paid-family-medical-leave-premium-rate-increases-113-2026) (last changed: 2026-10-20)
- WA - [Employer Wage Reporting and Premiums Toolkit (v25.1, June 2026)](https://paidleave.wa.gov/app/uploads/2021/12/Employer-Wage-Reporting-and-Premiums-Toolkit-v25.1-2026.06.26.pdf) (last changed: 2026-10-20)
- WA - [L&I — Paid Family & Medical Leave (exempt employer/employee categories)](https://www.lni.wa.gov/workers-rights/leave/paid-family-and-medical-leave) (last changed: 2026-10-20)
- WA - [RCW 1.90.100 — Personal Income Tax Prohibition](https://app.leg.wa.gov/RCW/default.aspx?cite=1.90.100) (last changed: 2026-10-20)
- WA - [RCW 36.65.030 — Tax on net income prohibited](https://app.leg.wa.gov/RCW/default.aspx?cite=36.65.030) (last changed: 2026-10-20)
- WA - [WA Cares Fund premium, RCW 50B.04.080 -- 0.58% of wages since 2023-07-01, unchanged through 2026](https://app.leg.wa.gov/RCW/default.aspx?cite=50B.04.080) (last changed: 2026-10-20)
- WA - [WA Cares Fund — Exemptions](https://wacaresfund.wa.gov/exemptions) (last changed: 2026-10-20)
- WA - [Washington Cares Fund premiums](https://wacaresfund.wa.gov/employers/) (last changed: 2026-10-20)
- WA - [Washington Department of Revenue: news releases](https://dor.wa.gov/about/news-releases) (last changed: 2026-10-20)
- WA - [Washington ESD -- Paid Family & Medical Leave premiums to increase in 2025 (2024-10-23)](https://esd.wa.gov/about-us/news-release/2024/paid-family-medical-leave-premiums-increase-2025) (last changed: 2026-10-20)
- WA - [Washington Paid Leave premium rates](https://paidleave.wa.gov/employers/) (last changed: 2026-10-20)
- WA - [Washington State Department of Labor & Industries -- Local Minimum Wage Rates](https://lni.wa.gov/workers-rights/wages/minimum-wage/local-minimum-wage-rates) (last changed: 2026-10-22)
- WA - [Washington State Department of Labor & Industries -- Washington's minimum wage going up to $17.13 an](https://www.lni.wa.gov/news-events/article/25-27) (last changed: 2026-10-20)
- WA - [Washington State Department of Labor & Industries — 2026 minimum wage ($17.13/hr effective 2026-01-0](https://ofm.wa.gov/wp-content/uploads/sites/default/files/public/legacy/policy/25.60.pdf) (last changed: 2026-10-20)
- WA - [Washington State's Paid Family and Medical Leave — Estimate your Paid Leave payments](https://paidleave.wa.gov/estimate-your-paid-leave-payments/) (last changed: 2026-10-20)
- WI - [2026 Tax Rate Schedule for Employers (DWD, full Schedule D reserve-percentage rate table)](https://dwd.wisconsin.gov/ui/employers/taxrates.htm) (last changed: 2026-10-22)
- WI - [UCT-1-E, 2026 Wisconsin Employer's Quarterly Contribution Report (SUTA initial rates)](https://dwd.wisconsin.gov/dwd/forms/ui/pdf/uct-1-e-2026.pdf) (last changed: 2026-10-20)
- WV - [City of Charleston, WV: city service fee overview](https://www.charlestonwv.gov/sites/default/files/documents/2022-12/CITY%20SERVICE%20FEE%20OVERVIEW%2012.22%20%282%29.pdf) (last changed: 2026-10-20)
- WV - [W. Va. Code § 38-5A-3 — ordinary (consumer credit sale/consumer loan judgment) garnishment limited t](https://code.wvlegislature.gov/38-5A-3/) (last changed: 2026-10-18)
- WV - [WV IT-100.2A -- Tables for Percentage Method of Withholding (March 2026 revision)](https://tax.wv.gov/Documents/Withholding/it100.2a.pdf) (last changed: 2026-09-24)
- WV - [WV State Tax Division -- Withholding Help and General Information page, "Supplemental Wages" guidanc](https://tax.wv.gov/Business/Withholding/HelpAndGeneralInformation/Pages/WithholdingHelpAndGeneralInformation.aspx) (last changed: 2026-09-24)
- WV - [WV/IT-104 -- Employee's Withholding Exemption Certificate (Rev. 03/2023) + WV/IT-104NR Certificate o](https://tax.wv.gov/Documents/Withholding/it104.pdf) (last changed: 2026-09-24)
- WV - [WVU Shared Services: West Virginia city user fee ordinances (every city's fee)](https://sharedservices.wvu.edu/west-virginia-city-user-fee-ordinances) (last changed: 2026-10-20)
- WV - [West Virginia Division of Labor -- Minimum Wage](https://labor.wv.gov/wage-hour/jobs-act/minimum-wage) (last changed: 2026-09-24)
- WV - [West Virginia State Tax Department: home page (news and notices)](https://tax.wv.gov/) (last changed: 2026-10-22)
- WV - [West Virginia Tax Division -- 2026 Income Tax Rate Cut](https://tax.wv.gov/Individuals/Pages/PersonalIncomeTaxReductionBill.aspx) (last changed: 2026-09-30)
- WV - [West Virginia withholding](https://tax.wv.gov/Business/Withholding/Publications/Pages/WithholdingPublications.aspx) (last changed: 2026-09-24)
- WV - [West Virginia withholding forms](https://tax.wv.gov/business/withholding/pages/withholdingtaxforms.aspx) (last changed: 2026-09-30)

</details>

