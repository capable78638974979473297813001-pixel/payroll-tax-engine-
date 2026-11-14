# Employer local filing guides

Use `localWithholdingGuide(kind, code, 2026)` from `payroll/local/filingGuide.mjs` to look up the filing office after determining a worksite or residence jurisdiction. Keep codes as strings, including leading zeros.

| Kind | Code | Example |
| --- | --- | --- |
| OR-city | Oregon city with a verified Community Safety Payroll Tax guide | `Eugene` |
| OR-transit-district | Oregon employer transit district code on Form OQ | `TM` or `LTD` |
| AL-city | Alabama town name from the municipal registry (`Hackleburg` is accepted for the registry's `Hacklebug`) | `Auburn`, `Birmingham`, `Leeds`, `Attalla` or `Irondale` |
| CO-city | Colorado city name with a verified OPT guide | `Denver` |
| DE-city | Delaware wage tax city name | `Wilmington` |
| MO-city | Missouri earnings tax city name | `St. Louis` |
| MI-city | Michigan taxing city name | `East Lansing` |
| IN-county | Two-digit Indiana county code | `01` |
| OH-school-district | Four-digit school district number, distinct from the IRN | `0203` |
| OH-municipality | Ohio Finder municipal code or documented Census place-code fallback | `00142` |
| OH-jedd-jedz | Four-digit Ohio Finder zone ID | `9055` |
| PA-EIT-district | Two-digit collection district from the DCED directory | `70` |
| PA-LST-district | Same two-digit district; returns the LST filing guide for that district's collector | `70` |
| KY-occupational | Kentucky taxing district name from the Secretary of State roster in `data/local/KY-occupational-2026.json` | `Bowling Green`, `Covington` or `Daviess County` |

```js
import { localWithholdingGuide } from './payroll/local/filingGuide.mjs';
const result = localWithholdingGuide('PA-EIT-district', '70', 2026);
if (result.status === 'guide') console.log(result.guide.collector, result.guide.returns);
```

A guide provides registration, returns, deadlines, payment instructions and dated evidence. For Ohio municipalities, confirm the collector for the filing period using the official membership roster. Missing codes, unsupported tax years and unresolved collectors have distinct statuses. A lookup does not establish a filing obligation, allocate liability, submit a return or move funds.

## Coverage under review

The first release covers Indiana county withholding, Ohio school districts, Ohio municipalities already identified as RITA or CCA, and the Pennsylvania EIT district directory. Philadelphia uses its own Wage Tax rules. Pennsylvania district entries identify the collector and its published website, with statutory employer instructions and explicit gaps for collector-specific methods. All 69 Act 32 district entries include collector-specific registration, filing and payment instructions. Philadelphia has its own Wage Tax guide. Check collector calendars for filing-period deadlines. Section 512 sets the quarterly EIT deadline at the end of the following month, while some agency FAQs give a 30-day schedule. After confirming the worksite LST collector in the DCED address search, use `localAgencyGuide("PA-BERKHEIMER-LST", 2026)` or `localAgencyGuide("PA-KEYSTONE-LST", 2026)`. The EIT district code alone cannot identify the LST collector.

Open work includes Ohio independent municipal collectors, the remaining JEDD/JEDZ collectors, Pennsylvania LST, Kentucky occupational districts, the six Alabama towns above and other local withholding or employer payroll taxes in the engine. Verify the collector, registration route, channels, return and reconciliation forms, deadlines and payment instructions for each. Preserve rate data and keep unsupported workflows explicit.

Run `node --test tests/local-filing-guide.test.mjs` from the repository root.

The 2026 Ohio filing directory supplements three missing municipal codes using Census place identifiers for Germantown (29932), North Hampton (56588) and Stockport (74748). The calculation registry is separate. Confirm the assigned filing period with the collector. Seville uses CCA for 2026 and RITA lists a January 1, 2027 start. All 157 zone IDs are recognized. The 2026 RITA table and CCA withholding form identify collectors for 60 zones, including Springfield Beckley Airport (Finder ID 9041, RITA code 872). Springfield city has a separate RITA code, 773. Akron administers four additional districts (Bath-Akron-Fairlawn, Copley-Akron, Coventry-Akron and Springfield-Akron). Each uses a separate withholding account and Form JW-3. Dayton administers the Miami and Butler township districts. Washington Court House administers the Jefferson Township-Washington Court House JEDD (9129) and publishes district W1 coupons. RITA began administering Jersey-New Albany JEDDs I, II and III (9158, 9159 and 9160) on May 1, 2026. Identify the worksite district and report each district separately on Form 11. RITA took over the Brimfield-Kent (9009) and Kent-Franklin (9021) districts on July 1, 2026. Confirm earlier periods with Kent. Xenia JEDD 1 (9097) uses RITA code 859. Xenia city uses 905. Ohio lists Beachwood East (9005) and West (9006) as JEDZs. On RITA forms, select Beachwood East JEDD (051) or Beachwood West JEDD (052). Beachwood city uses 050. For Eaton Northwestern Professional Business JEDD (9016), select Eaton JEDD (292). For Elyria Township-City of Elyria JEDD (9017), select Elyria JEDD (282). Elyria city uses 277. Sycamore Township’s Kenwood zones have three collectors: Madeira for Central (9057) and East (9058), Deer Park for Northwest (9059), and Amberley Village for Southwest (9060). Confirm the worksite against the township district map. Deer Park also administers the separate Kenwood JEDD (9138), which has its own registration, withholding and reconciliation forms. Newark administers Etna North (9049), Etna South (9050) and Pataskala Corporate Park (9034). Register and enroll for ACH credit separately for each district. Maumee administers Monclova-Maumee-Toledo JEDZ (9053). Payroll agents use the district’s EFT process unless exempted. Toledo Express Airport (9065) and Troy Township (9067) each use their own Toledo-administered JEDD account, deposit coupons and W-3. Columbus uses IT-11J district lines 20 for North Pickaway County (9031), 22 for Prairie Township (9036), and 24 for Madison Township (9077). Delaware administers Berkshire Township JEDD I (9007) and II (9139) using the Berkshire employer withholding packet. Canton administers six Jackson Township districts and Perry Township Faircrest. Each district has its own employer account number. Cheviot collects for eight Green Township districts and Colerain Township’s Liberty Nursing Care district. Register with the JEDD application and confirm the worksite-specific remittance instructions with the tax office. Harpersfield–Geneva JEDDs I, II and III use Geneva’s district withholding voucher and Form 38. The guide flags the quarterly deadline discrepancy between Geneva’s notice and Ohio law. Fairfield issues separate registration forms and withholding coupons for Fairfield Township JEDD (9137, Seward Road) and West Chester JEDD 1 (9044, Aviation Way). Monroe collects for Turtlecreek–Monroe Raceway (9096) and the separate Turtlecreek–Monroe 2022 JEDD (9136). Confirm district coupons and payment instructions with Monroe. The other 41 return `collector-unverified`. Where available, `collectorCode` is the separate identifier printed on the collector’s forms.

Ohio municipal filing lookups use dated collector evidence. Delta uses the village for filings before its January 2027 handoff. Only the Delaware County Shawnee Hills is a verified RITA member. Midyear handoffs include the date administration started and a filing note for prior periods and amendments.

Michigan lookups accept the names in the 2026 city registry. All 24 registered cities return employer guides. Each guide lists its registration route, periodic and annual returns, filing channel, payment instructions and sources. Ionia’s 2026 annual form prints a deadline before the end of the reporting year, and Lapeer’s published Q2 example differs from its month-end rule. Those entries flag the dates for confirmation. Resolve the worksite or residence jurisdiction before looking up a city by name.

Use `localWithholdingGuide('DE-city', 'Wilmington', 2026)` for Wilmington employer wage withholding, intermediate payments and annual W-2 reporting.

Colorado OPT guides cover Denver, Glendale, Greenwood Village and Sheridan. Aurora repealed both portions effective January 1, 2025. Its [repeal notice](https://www.auroragov.org/business_services/taxes/occupational_privilege_tax) explains how employers can address earlier periods.

For Kentucky, look up the applicable collector with `localAgencyGuide(agencyId, 2026)`. Use `KY-LMRC` for Louisville Metro occupational withholding and `KY-LFUCG` for Lexington-Fayette urban county withholding. Fayette County Public Schools has a separate account and filing obligation for county residents working in the county. Look up `KY-FCPS` when that school tax applies.

For Covington worksites, look up both `KY-KENTON` and `KY-COVINGTON`. Kenton County accepts county withholding and the city lines listed on QCC1. Covington collects its own city withholding. Its quarterly return and ordinance publish different deadlines for three quarters. The city guide identifies both before employers choose a filing date.

In Bowling Green, use `KY-BOWLING-GREEN` for city withholding and `KY-WARREN` for county withholding. Use `KY-WARREN-SCHOOLS` for wages earned in Warren County by a resident of the Warren County School District. Verify the employee’s home school district before selecting the school guide.

Use `KY-OWENSBORO-DAVIESS` for the common administrator. The standard E-1 has separate columns for work inside and outside Owensboro. Employers with wages in both jurisdictions file a separate annual REC for each.

## Alabama coverage (2026-11-13)

23 of the 29 registered Alabama towns return a guide; the other six return `collector-unverified` rather than a guess: Bear Creek, Brilliant, Goodwater, Haleyville, Lynn and Tuskegee. No official page that says how employers file for those six was found (the Department of Revenue pages for Tuskegee and Haleyville did not render readable content, and they are sales and use tax notices).

- **Neumo return (eleven towns plus Leeds):** Attalla 9406, Beaverton 9756, Guin 9024, Hackleburg 9349, Hamilton 9359, Midfield 9375, Mosses 9677, Shorter 9702, Southside 9046, Sulligent 9392 and Tarrant 9625 file the shared monthly Occupational Tax Return (updated 10/2026, postmarked by the 20th) and the Universal Annual Reconciliation (due January 31) to Neumo Tax Remittance Department, PO Box 830725, Birmingham, AL 35283-0725. How to obtain a Neumo account number is not on either form, so the guides say registration is unverified.
- **Own collectors:** Irondale (monthly, 0.50%; the PDF form on its site still prints 1%), Fairfield (Ordinance 1019, quarterly by the 20th, read from the 2008 scan), Glencoe (Form G-1, 2%, monthly by the 20th), Notasulga (quarterly or annual by account, Ordinance 97-11-01) and Red Bay (Ordinance 90-2-7, monthly by the 20th, annual by January 31).
- **Rainbow City is partial:** the collector and contacts are confirmed; its G-1 and G-3 forms were blocked to automated reads, so deadlines and penalties are not stated.

## Pennsylvania Local Services Tax (2026-11-14)

`localWithholdingGuide('PA-LST-district', code, 2026)` returns an LST guide for 69 of the 70 districts. Philadelphia returns `collector-unverified`. The guide is for the district's EIT collector: Keystone and Berkheimer districts use their existing LST profiles, and the other eleven bureaus carry an `lst` block in `data/filing/local/PA-districts-2026.json`. The result always sets `confirmLstCollectorForWorksite` because the LST collector for a worksite municipality or school district can differ from the EIT collector (the register names a separate LST collector for about 360 of its 1,943 LST rows, many of them individuals).

Only Lancaster's LST due dates were read (the last day of the month after quarter-end, rolled to the next business day). Capital, Cumberland, Centre, Southwest Regional, Franklin, Blair and Berks pages were read for forms, registration and channels, with due dates marked "not read" where the pages did not state them. York Adams, Danville and Jordan could not be read and say so.

## Kentucky coverage (2026-11-14)

`localWithholdingGuide('KY-occupational', name, 2026)` resolves any of the 256 roster entries. 228 return a guide and 28 return `collector-unverified`.

- **11 verified profiles** from earlier work: Louisville Metro and Jefferson County, Lexington-Fayette and Fayette County, Fayette County Public Schools, Kenton County, Covington (county and city guides in `additionalGuides`), Bowling Green, Warren County, Warren County Public Schools, Owensboro, Daviess County and its fiscal court.
- **217 researched guides** in `data/filing/local/KY-2026.json`, built by eight parallel research passes from each jurisdiction's own city, county or school-board pages, ordinances and forms: 128 `verified` (the return, its due date and how to file or pay were read) and 89 `partial` (some of that was not stated or could not be read; the guide says "Not stated" or lists `notRead`). Kenton and Campbell counties collect for several of their cities; those cities carry the county's instructions. A scanned form was read as an image where the text layer was missing.
- **28 unverified:** 25 where no official employer instructions could be found (many small towns have no web presence; Bardwell's site is a parked domain), two where the official site refused automated access (Logan County, Cynthiana; not worked around), and Bath County, whose only source was a vendor domain.

Rates are not taken from the guides. Each research pass was also asked to flag rate conflicts; I read the cited document for every one. Six rates changed, each against the city's own form or ordinance: Clinton 1% with a $400 yearly maximum (a $40,000 wage cap), Earlington 1.5%, Owenton 1.5%, Warsaw 1.75%, Hodgenville 1% and Raceland 1%. Several flagged conflicts were wrong and left alone: Middlesboro (the 2% was the net-profits fee; wages are 2.45%), Washington County (form 501Q says 3/4 of 1%), and Salem, Elsmere, Falmouth and Grant County, whose rate changes were already effective-dated in the engine.

Open conflicts the documents did not settle, left at their current values: Guthrie (the city's form says 2%, the state roster 1%), Paintsville (the code library says 1.25%; news reported a 2023 increase to 1.5%), Lyndon (the city's page was not readable; the engine holds 0.75%), Somerset (a 2016 form prints 0.6%; the engine holds 1.2%), McCreary County (its two forms print 1% and 1.5%), Pulaski County (a 0.8% rate for wages inside Somerset), Campbell County (the engine carries only the 0.9% general component of a 1.05% total) and Russell County (a $4,000 yearly maximum printed on its form).
