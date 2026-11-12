# Employer local filing guides

Use `localWithholdingGuide(kind, code, 2026)` from `payroll/local/filingGuide.mjs` to look up the filing office after determining a worksite or residence jurisdiction. Keep codes as strings, including leading zeros.

| Kind | Code | Example |
| --- | --- | --- |
| IN-county | Two-digit Indiana county code | `01` |
| OH-school-district | Four-digit school district number, distinct from the IRN | `0203` |
| OH-municipality | Ohio Finder municipal code | `00142` |
| PA-EIT-district | Two-digit collection district from the DCED directory | `70` |

```js
import { localWithholdingGuide } from './payroll/local/filingGuide.mjs';
const result = localWithholdingGuide('PA-EIT-district', '70', 2026);
if (result.status === 'guide') console.log(result.guide.collector, result.guide.returns);
```

A guide provides registration, returns, deadlines, payment instructions and dated evidence. For Ohio municipalities, confirm the collector for the filing period using the official membership roster. Missing codes, unsupported tax years and unresolved collectors have distinct statuses. A lookup does not establish a filing obligation, allocate liability, submit a return or move funds.

## Coverage under review

The first release covers Indiana county withholding, Ohio school districts, Ohio municipalities already identified as RITA or CCA, and the Pennsylvania EIT district directory. Philadelphia uses its own Wage Tax rules. Pennsylvania district entries identify the collector and its published website, with statutory employer instructions and explicit gaps for collector-specific methods. LST collectors need separate verification.

Open work includes Ohio independent municipal collectors, JEDDs/JEDZs, Pennsylvania LST, Kentucky occupational districts, Michigan city-specific filing, Alabama localities and other local withholding or employer payroll taxes in the engine. Verify the collector, registration route, channels, return and reconciliation forms, deadlines and payment instructions for each. Preserve rate data and keep unsupported workflows explicit.

Run `node --test tests/local-filing-guide.test.mjs` from the repository root.
