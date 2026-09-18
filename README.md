# Crewtally

**Time & pay for the trades.** A self-serve payroll app for plumbing, electrical,
and HVAC shops that live on public-works jobs — with the hard parts handled:
prevailing wage, certified payroll, and the compliance that comes with them.

Runs entirely on your machine. Figures are integer cents end to end; nothing is
guessed — a rate the engine can't find raises an error rather than quietly
returning zero.

## Run it

Needs **Node 22.18+** (or 23+) — the server runs TypeScript directly.

```bash
npm run crewtally
```

Then open **http://localhost:4325** and click **"Load the sample plumbing shop."**
(Change the port with `PORT=4300 npm run crewtally`.)

```bash
npm test        # the trades test suite
```

## What it does

- **Prevailing wage** — pays each worker the higher of their shop rate and the
  job's Davis-Bacon determination, with cash-vs-plan fringe handled correctly and
  weekly (CWHSSA) plus California/Alaska/Colorado daily overtime.
- **Certified payroll** — the weekly federal **WH-347** and the California **DIR**
  report, ready to file.
- **Compliance** — fringe annualization, apprentice-to-journeyworker ratio, and
  minimum wage, rolled into one back-wage-exposure report per run.
- **Job costing** — fully-burdened labor per job (wages + employer taxes +
  workers'-comp + fringe).
- **Geofenced clock-ins** — a punch outside the job's radius is recorded but
  flagged, never blocked.
- **Split-rate / multi-role** — the same person can work several classifications
  in one week, each at its own rate, blended for overtime.
- **Seasonal crew**, **5 pm log-your-hours nudges**, and **$5/employee/month**
  billing.

## Layout

```
src/       the gross-to-net tax engine (federal, state, FICA/FUTA, garnishments)
payroll/   the payroll layer (pay runs, YTD, direct deposit, time & attendance)
trades/    everything trades-specific (prevailing wage, certified payroll,
           job costing, geofencing, nudges, billing, store, service)
examples/  trades-server.ts (the API + static UI) and trades-app.html (the UI)
data/      effective-dated tax rules the engine loads at runtime
tests/     the trades test suite
```

The tax engine and payroll layer are the same ones that power the broader
payroll-tax-engine project; Crewtally is the trades product built on top of them.

## Boundaries (honest, not hidden)

- **SMS** for the nudges needs a carrier (e.g. Twilio); the sender is wired and
  ready but reports "not delivered" until one is connected, rather than faking it.
- **Wage determinations** and **workers'-comp rates** are caller-supplied facts,
  never invented — the app validates and computes; it doesn't ship the national
  Davis-Bacon or NCCI datasets.

MIT licensed.
