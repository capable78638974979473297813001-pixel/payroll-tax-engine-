# Employer local filing guides

Use `localWithholdingGuide(kind, code, 2026)` from `payroll/local/filingGuide.mjs` to look up the filing office after determining a worksite or residence jurisdiction. Keep codes as strings, including leading zeros.

| Kind | Code | Example |
| --- | --- | --- |
| OR-city | Oregon city with a verified Community Safety Payroll Tax guide | `Eugene` |
| OR-transit-district | Oregon employer transit district code on Form OQ | `TM` or `LTD` |
| AL-city | Alabama city name with a verified occupational tax guide | `Auburn`, `Bessemer`, `Birmingham`, `Gadsden`, `Leeds` or `Opelika` |
| CO-city | Colorado city name with a verified OPT guide | `Denver` |
| DE-city | Delaware wage tax city name | `Wilmington` |
| MO-city | Missouri earnings tax city name | `St. Louis` |
| MI-city | Michigan taxing city name | `East Lansing` |
| IN-county | Two-digit Indiana county code | `01` |
| OH-school-district | Four-digit school district number, distinct from the IRN | `0203` |
| OH-municipality | Ohio Finder municipal code or documented Census place-code fallback | `00142` |
| OH-jedd-jedz | Four-digit Ohio Finder zone ID | `9055` |
| PA-EIT-district | Two-digit collection district from the DCED directory | `70` |

```js
import { localWithholdingGuide } from './payroll/local/filingGuide.mjs';
const result = localWithholdingGuide('PA-EIT-district', '70', 2026);
if (result.status === 'guide') console.log(result.guide.collector, result.guide.returns);
```

A guide provides registration, returns, deadlines, payment instructions and dated evidence. For Ohio municipalities, confirm the collector for the filing period using the official membership roster. Missing codes, unsupported tax years and unresolved collectors have distinct statuses. A lookup does not establish a filing obligation, allocate liability, submit a return or move funds.

## Coverage under review

The first release covers Indiana county withholding, Ohio school districts, Ohio municipalities already identified as RITA or CCA, and the Pennsylvania EIT district directory. Philadelphia uses its own Wage Tax rules. Pennsylvania district entries identify the collector and its published website, with statutory employer instructions and explicit gaps for collector-specific methods. All 69 Act 32 district entries include collector-specific registration, filing and payment instructions. Philadelphia has its own Wage Tax guide. Check collector calendars for filing-period deadlines. Section 512 sets the quarterly EIT deadline at the end of the following month, while some agency FAQs give a 30-day schedule. After confirming the worksite LST collector in the DCED address search, use `localAgencyGuide("PA-BERKHEIMER-LST", 2026)` or `localAgencyGuide("PA-KEYSTONE-LST", 2026)`. The EIT district code alone cannot identify the LST collector.

Open work includes Ohio independent municipal collectors, the remaining JEDD/JEDZ collectors, Pennsylvania LST, Kentucky occupational districts, Alabama localities and other local withholding or employer payroll taxes in the engine. Verify the collector, registration route, channels, return and reconciliation forms, deadlines and payment instructions for each. Preserve rate data and keep unsupported workflows explicit.

Run `node --test tests/local-filing-guide.test.mjs` from the repository root.

The 2026 Ohio filing directory supplements three missing municipal codes using Census place identifiers for Germantown (29932), North Hampton (56588) and Stockport (74748). The calculation registry is separate. Confirm the assigned filing period with the collector. Seville uses CCA for 2026 and RITA lists a January 1, 2027 start. All 157 zone IDs are recognized. The 2026 RITA table and CCA withholding form identify collectors for 60 zones, including Springfield Beckley Airport (Finder ID 9041, RITA code 872). Springfield city has a separate RITA code, 773. Akron administers four additional districts (Bath-Akron-Fairlawn, Copley-Akron, Coventry-Akron and Springfield-Akron). Each uses a separate withholding account and Form JW-3. Dayton administers the Miami and Butler township districts. Washington Court House administers the Jefferson Township-Washington Court House JEDD (9129) and publishes district W1 coupons. RITA began administering Jersey-New Albany JEDDs I, II and III (9158, 9159 and 9160) on May 1, 2026. Identify the worksite district and report each district separately on Form 11. RITA took over the Brimfield-Kent (9009) and Kent-Franklin (9021) districts on July 1, 2026. Confirm earlier periods with Kent. Xenia JEDD 1 (9097) uses RITA code 859. Xenia city uses 905. The other 84 return `collector-unverified`. Where available, `collectorCode` is the separate three-digit identifier used on that agency’s forms.

Ohio municipal filing lookups use dated collector evidence. Delta uses the village for filings before its January 2027 handoff. Only the Delaware County Shawnee Hills is a verified RITA member. Midyear handoffs include the date administration started and a filing note for prior periods and amendments.

Michigan lookups accept the names in the 2026 city registry. All 24 registered cities return employer guides. Each guide lists its registration route, periodic and annual returns, filing channel, payment instructions and sources. Ionia’s 2026 annual form prints a deadline before the end of the reporting year, and Lapeer’s published Q2 example differs from its month-end rule. Those entries flag the dates for confirmation. Resolve the worksite or residence jurisdiction before looking up a city by name.

Use `localWithholdingGuide('DE-city', 'Wilmington', 2026)` for Wilmington employer wage withholding, intermediate payments and annual W-2 reporting.

Colorado OPT guides cover Denver, Glendale, Greenwood Village and Sheridan. Aurora repealed both portions effective January 1, 2025. Its [repeal notice](https://www.auroragov.org/business_services/taxes/occupational_privilege_tax) explains how employers can address earlier periods.

For Kentucky, look up the applicable collector with `localAgencyGuide(agencyId, 2026)`. Use `KY-LMRC` for Louisville Metro occupational withholding and `KY-LFUCG` for Lexington-Fayette urban county withholding. Fayette County Public Schools has a separate account and filing obligation for county residents working in the county. Look up `KY-FCPS` when that school tax applies.

For Covington worksites, look up both `KY-KENTON` and `KY-COVINGTON`. Kenton County accepts county withholding and the city lines listed on QCC1. Covington collects its own city withholding. Its quarterly return and ordinance publish different deadlines for three quarters. The city guide identifies both before employers choose a filing date.

In Bowling Green, use `KY-BOWLING-GREEN` for city withholding and `KY-WARREN` for county withholding. Use `KY-WARREN-SCHOOLS` for wages earned in Warren County by a resident of the Warren County School District. Verify the employee’s home school district before selecting the school guide.

Use `KY-OWENSBORO-DAVIESS` for the common administrator. The standard E-1 has separate columns for work inside and outside Owensboro. Employers with wages in both jurisdictions file a separate annual REC for each.
