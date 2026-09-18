# Base44 Dev Environment

## What this is
A zero-dependency US payroll tax engine (`payroll-tax-engine`). Pure Node.js
ESM + TypeScript (`.ts` files run natively via Node 22's built-in type
stripping — no `tsc`, no `npm install`, no `node_modules`).

## Running it
`docker compose -f docker-compose.base44.yml up -d` starts the web service
on host port 3000.

- Base image: `node:22` (runtime only — the repo is bind-mounted at `/app`).
- Command: `node --watch site/server.ts` — Node's built-in file watcher
  restarts the server on source edits (live reload, no image rebuild).
- `PORT=3000` is set in compose; the server defaults to 4323 otherwise.
- The server binds all interfaces (`listen(PORT)` with no host arg).

## Entry points
- `site/server.ts` — the main user-facing app: the Omnia landing page +
  signup console (port 3000 in this setup). File-backed JSON store in
  `site/.data/` — no database required.
- `examples/*-server.ts` — alternate calculator/payroll UIs (run on
  other ports; not exposed by the base44 compose).

## Optional secrets (app boots fine without them)
- `RESEND_API_KEY` — sends verification emails. Without it, the signup
  code is printed to the server console instead.
- `STRIPE_SECRET_KEY` — powers the payment-setup step. Without it, that
  step reports that no processor is connected.

Both are delivered via `/run/base44/app.env` if provided; the app loads
them from a git-ignored `.env` at the repo root via `process.loadEnvFile()`.

## Tests
`npm test` runs the full `node --test` suite (no dependencies needed).
