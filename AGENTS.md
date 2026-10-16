# Omnia Payroll Tax Engine — Base44 Dev Notes

## Stack
- Node.js 22.6+ TypeScript, run directly (no build step, no third-party npm packages).
- `npm test` runs `node --test` across ~100 test files; all 2338 tests pass.
- The public site (`npm run site` → `site/server.ts`) is the web entry point.

## Running in Base44
- `docker compose -f docker-compose.base44.yml up -d` starts the site on port 3000.
- The image is `node:22-slim` with the repo bind-mounted at `/app`; `node site/server.ts` is the dev command. There are no dependencies to install.
- PORT env sets the listen port (default 4323; compose sets 3000).
- Health check: `GET /healthz` returns JSON with status, state count, and tax years.
- `TRUST_PROXY=1` is set so the server trusts `X-Forwarded-For` behind the preview proxy.
- All env vars are optional with safe defaults; no secrets are required to boot. Stripe, Resend, and address-index features are off until their keys are provided.

## Key endpoints
- `/` — landing page
- `/sandbox` — API console (interactive paycheck calculator)
- `/docs` — documentation
- `/healthz` — health probe
- `POST /v1/paycheck` — calculate a paycheck (also `/api/paycheck`)

## Security notes
- `X-Frame-Options: SAMEORIGIN` is set on all responses; the preview proxy handles iframe embedding.
- POST requests to `/api/` endpoints (except `/api/paycheck`, `/api/address`, `/api/billing/webhook`) are checked for same-origin via the `Origin` header. This does not affect the sandbox console's GET-based endpoints (`/v1/states`, `/v1/me`).
