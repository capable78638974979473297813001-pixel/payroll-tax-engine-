# AGENTS.md

## Project overview
Gross-to-net US payroll tax engine. Pure Node.js (>=22.6) TypeScript — runs `.ts` files directly via Node's native TS support, **no build step, no npm dependencies, no node_modules**.

## Web entry point
`site/server.ts` serves the "Omnia" landing page, docs, and API. Default port 4323, overridden to 3000 via `PORT` env in the Base44 compose. Binds all interfaces (no host allowlist needed — plain `http.Server`).

Run locally: `node site/server.ts` (or `npm run site`).

## Data storage
File-backed store at `site/.data/` (see `site/lib/store.ts`). No external database required. The `supabase/` migrations exist but are not wired to a live instance.

## External credentials (all optional — app boots without them)
- `RESEND_API_KEY` — email verification. Without it, the 6-digit code is logged to the server console instead of emailed.
- `STRIPE_SECRET_KEY` — payment collection. Without it, the payment step honestly reports no processor is connected.
Loaded from `<repo>/.env` via `process.loadEnvFile` at startup; absent file is fine.

## Other example servers (not the main entry)
`examples/calculator-server.ts` (4322), `examples/alabama-server.ts` (4321), `examples/minimum-wage-server.ts` (4324), `examples/payroll-server.ts` (4323). These are standalone calculators, not the primary web app.

## Dev workflow
`node --watch site/server.ts` restarts on file changes (used by the Base44 compose). No live-reload/HMR for the static HTML — call `reload_preview` after HTML edits if needed.

## Tests
`npm test` runs the full `node --test` suite (many `tests/*.test.ts` files). No test dependencies.
