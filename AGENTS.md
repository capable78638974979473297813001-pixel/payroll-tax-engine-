# Base44 Dev Environment

## What this is
A pure Node.js payroll tax engine ("Omnia"). No npm dependencies — uses only Node built-in modules and runs `.ts` files directly via Node 22's native TypeScript support.

## Running it
- `docker compose -f docker-compose.base44.yml up -d` starts the web server on port 3000.
- The web entry point is `site/server.ts` — a plain Node HTTP server (no framework) serving `site/index.html` (landing page) and `site/docs.html` (docs/console) plus the `/api/*` endpoints.
- Uses `node --watch` for live reload on file changes.
- File-based JSON store in `site/.data/db.json` — no database service needed.

## No external secrets required
- The app boots and works without any credentials. Stripe (`STRIPE_SECRET_KEY`) and Resend (`RESEND_API_KEY`) are optional — the app degrades gracefully (console-only verification codes, "no processor connected" for payments).
- If real Stripe/Resend integration is needed later, add them via the platform secrets dashboard.

## Other entry points (not exposed in preview)
- `npm run api` — standalone API server on port 4380
- `npm run ui:payroll` — payroll UI server
- `npm test` — runs the full test suite via `node --test`
