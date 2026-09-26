# Omnia payroll tax engine

Gross-to-net US payroll tax calculation. Rates, brackets, and wage bases live in `data/` as effective-dated JSON. `src/calculate.ts` turns one paycheck into tax lines. It does not guess a missing fact: a state with no ruleset, a missing PSD code, or a child-support order that does not say whether the employee supports another family comes back as an explicit error or a `NOT MODELLED` line.

## Calculate a paycheck

```ts
import { calculatePaycheck } from './src/calculate.ts';
import { dollars } from './src/money.ts';

const result = calculatePaycheck({
  checkDate: '2026-09-26',
  payFrequency: 'biweekly',
  earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
  deductions: [],
  federalW4: {
    filingStatus: 'single',
    multipleJobs: false,
    dependentCredit: 0,
    otherIncome: 0,
    deductions: 0,
    extraWithholding: 0,
  },
  ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
  workState: { code: 'OH', certificate: { workCity: 'Columbus', residenceCity: 'Columbus' } },
});
```

Money is integer cents. `dollars(3.07)` is 307.

`npm run demo` prints a sample check. `npm test` runs the engine, geocoder, garnishment, minimum-wage, API, site, payroll, and trades suites.

## What else is in the tree

| Path | Role |
| --- | --- |
| `src/` | Paycheck math: federal, state, local, garnishment, minimum wage |
| `data/` | The rates the math reads. A code change that is really a rate change belongs here |
| `geocode/` | Census geography to the certificate fields the local taxes read |
| `api/` | API keys, Stripe metering, and the Symmetry-shaped `payCalc` adapter |
| `examples/api-server.ts` | Self-hosted calculate API (`npm run api`) |
| `site/` | The public console and metered site API (`npm run site`) |
| `payroll/`, `trades/` | Payroll operations and certified-payroll workflows on top of the engine |
| `supabase/functions/` | Edge-function copy of `src/`. Regenerate it with `npm run edge:build` after changing `src/` |
| `docs/` | Rounding, geocoding coverage, payments, and the go-live runbook |

Two billing paths exist on purpose. The public site charges the graduated bands in `site/lib/pricing.ts` through a Stripe meter. The self-hosted API in `examples/api-server.ts` charges the key's own `pricePerCallCents` on a local ledger, and switches to the Stripe meter (one unit per successful calculation) when that key has a Stripe customer and metering is configured. It does not do both.

## Requirements

Node.js 22.6 or newer. No install step: the engine and its tests run on `node --test` with no third-party packages.
