# Omnia — payroll tax engine

Zero-dependency Node.js 22 TypeScript project. Runs `.ts` directly via Node's
native TypeScript support (no compiler, no `node_modules`, no build step).

## Running it

```bash
docker compose -f docker-compose.base44.yml up -d
```

- Web entry: `node site/server.ts` — serves the landing page (`/`),
  the docs/console (`/docs.html`), and the JSON API (`/api/*`).
- Listens on `PORT` (set to 3000 in compose). Default outside compose is 4323.
- Storage is a local JSON file at `site/.data/db.json` — no database service.
- Live reload: `node --watch` restarts the server on source edits.

## Environment / secrets

Both are **optional** — the app boots and signup works without them:

- `RESEND_API_KEY` — emails verification codes. Without it, codes print to the
  server console (read them from `docker compose logs web`).
- `STRIPE_SECRET_KEY` — creates real Stripe Checkout sessions for card/ACH.
  Without it, the payment step returns 501 and reports "no processor connected".

Provide real values via the Base44 secrets dashboard to enable those integrations.

## Verifying it works

- `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → 200
- `curl -s http://localhost:3000/api/states` → JSON list of supported states
- `POST /api/estimate` with `{email, employees, payFrequency}` → pricing breakdown

## Tests

```bash
node --test tests/*.test.ts
```

Large suite (~70 files) covering the engine, garnishment, minimum wage,
geocoding, and many state/federal compliance scenarios.
