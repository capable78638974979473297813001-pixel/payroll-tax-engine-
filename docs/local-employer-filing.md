# Employer local filing guides

Use `localWithholdingGuide(kind, code, 2026)` from `payroll/local/filingGuide.mjs` to look up the filing office after determining a worksite or residence jurisdiction. Keep codes as strings, including leading zeros.

| Kind | Code | Example |
| --- | --- | --- |
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

The first release covers Indiana county withholding, Ohio school districts, Ohio municipalities already identified as RITA or CCA, and the Pennsylvania EIT district directory. Philadelphia uses its own Wage Tax rules. Pennsylvania district entries identify the collector and its published website, with statutory employer instructions and explicit gaps for collector-specific methods. LST collectors need separate verification.

Open work includes Ohio independent municipal collectors, the remaining JEDD/JEDZ collectors, Pennsylvania LST, Kentucky occupational districts, Michigan city-specific filing, Alabama localities and other local withholding or employer payroll taxes in the engine. Verify the collector, registration route, channels, return and reconciliation forms, deadlines and payment instructions for each. Preserve rate data and keep unsupported workflows explicit.

Run `node --test tests/local-filing-guide.test.mjs` from the repository root.

The 2026 Ohio filing directory supplements three missing municipal codes using Census place identifiers for Germantown (29932), North Hampton (56588) and Stockport (74748). The calculation registry is separate. Confirm the assigned filing period with the collector. Seville uses CCA for 2026 and RITA lists a January 1, 2027 start. All 157 zone IDs are recognized. The 2026 RITA table and CCA withholding form identify collectors for 59 zones. The other 98 return `collector-unverified`. Where available, `collectorCode` is the separate three-digit identifier used on that agency’s forms.

Ohio municipal filing lookups use dated collector evidence. Delta uses the village for filings before its January 2027 handoff. Only the Delaware County Shawnee Hills is a verified RITA member. Midyear handoffs include the date administration started and a filing note for prior periods and amendments.
