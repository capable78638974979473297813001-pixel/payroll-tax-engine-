# Omnia — Go-Live Runbook

Everything in code is done. What's left is configuration only you can do, because
it needs your real Stripe account and hosting. Work top to bottom; nothing here
touches the codebase.

> Reminder: set every secret on the **server's host environment** (or `.env` on the
> box that runs `npm run site`). A GitHub Actions secret only exists inside CI and
> never reaches the running app.

---

## 0. Prerequisites

- A host that runs Node ≥ 22.6 and stays up (a VM, container, or PaaS).
- A domain pointed at it over HTTPS (e.g. `https://omniatax.io`).
- A Stripe account.
- A transactional-email provider (Resend) if you want signup codes emailed
  instead of printed to the server log.

---

## 0b. Domain (omniatax.io on GoDaddy)

1. **Point the site at your host.** In GoDaddy → your domain → DNS, add the
   record your host asks for (usually an `A` record for `@` and a `CNAME` for
   `www`). Make sure the host issues an HTTPS certificate for `omniatax.io`.
2. **Set the public URL** on the server: `PUBLIC_BASE_URL=https://omniatax.io`
   and `TRUST_PROXY=1` if a proxy sits in front. Stripe return links and the
   session cookie's `Secure` flag come from this.
3. **Send mail from the domain.** In Resend, add `omniatax.io` and copy the DNS
   records it shows (SPF and DKIM `TXT`/`CNAME` records) into GoDaddy DNS, wait
   for Resend to mark the domain verified, then set
   `RESEND_FROM="Omnia.tax <verify@omniatax.io>"`. Until then Resend only
   delivers to its own account owner. If you run the Python verifier with SMTP
   instead, set `SMTP_FROM` the same way and add your mail provider's SPF record.
4. **Contact address:** the site and legal pages all use
   `scottholdan@gmail.com`, so no extra inboxes are needed. Keep
   `verify@omniatax.io` as the sending address only (step 3).
5. **Stripe webhook URL** is `https://omniatax.io/api/billing/webhook`.

---

## 0c. Deploy on Render

The repo ships a `Dockerfile`, `deploy/start.sh` and `render.yaml`. The container
runs the site and the Python email verifier next to it (restarted if it exits).
The verifier sends every sign-up and sign-in code. It starts by itself as soon as
`RESEND_API_KEY` (or `SMTP_HOST`) is set, and generates its own two secrets on first
boot, kept in `/var/data/verifier-secrets.env`. Without a mail provider the site
prints codes in the Render log instead, which is fine for a first test only.

1. Push to GitHub, then in Render choose **New → Blueprint** and pick this repo
   and branch. It creates one web service (**Starter** plan; a persistent disk
   needs a paid plan) with a 1 GB disk mounted at `/var/data`.
2. Fill in the secrets the Blueprint marks `sync: false`: `STRIPE_SECRET_KEY`,
   `STRIPE_PRICE_ID`, `STRIPE_WEBHOOK_SECRET` and `RESEND_API_KEY`. Leave
   `OMNIA_ISSUE_LIVE_KEYS` unset until test mode has passed.
3. Add the domain: the Blueprint lists `omniatax.io` and `www.omniatax.io`.
   Render shows the DNS records to create; add them in GoDaddy DNS (section 0b).
   Render issues the HTTPS certificate once the records resolve.
4. Keep **one instance** (`numInstances: 1`). The account store is a file on the
   disk. Turn on disk snapshots in the Render dashboard, and also keep your own
   off-box copy of `/var/data` on a schedule.
5. Check `https://omniatax.io/healthz`, then run section 4.

Data lives in `/var/data/site` (accounts, keys as hashes, usage) and
`/var/data/verifier.sqlite3`. A redeploy replaces the container but keeps the
disk. Deploys cause a brief restart; there is no zero-downtime swap with a disk.

---

## 1. Persistent storage

The account/key/usage store is a JSON file. Point it at a durable, backed-up
volume so it survives restarts:

```
SITE_DB_DIR=/var/lib/omnia
```

Back this directory up. It holds accounts, keys (hashed), consent records, and
usage. Losing it means losing customer keys and billing history.

---

## 2. Stripe: one-time dashboard setup

Follow **`docs/STRIPE-SETUP.md`**. It has the exact meter, price, payment-method
and webhook settings, and `npm run check:stripe` verifies them against your
Stripe account before you launch. Do it in test mode first, then repeat in live
mode.

---

## 3. Server environment

Set these where the site runs (see `.env.example` for the full list):

```
SITE_DB_DIR=/var/lib/omnia
PUBLIC_BASE_URL=https://omniatax.io
PORT=4323

STRIPE_SECRET_KEY=sk_test_…            # test first, then sk_live_…
STRIPE_PRICE_ID=price_…                # the flat $0.09 metered price
STRIPE_METER_EVENT=omnia_api_call       # required: must match the meter exactly
STRIPE_WEBHOOK_SECRET=whsec_…
RESEND_API_KEY=…                       # required in production (see below)

# optional
RATE_LIMIT_PER_MIN=120
SIGNUP_PER_HOUR=10                      # signup code requests per client address
SIGNIN_PER_HOUR=10                      # sign-in code requests per client address
TRUST_PROXY=1                           # behind a reverse proxy: client IP from X-Forwarded-For
OMNIA_ISSUE_LIVE_KEYS=1                 # mint sk_live_ keys instead of sk_test_
STRIPE_PAYMENT_METHOD_TYPES=card        # cards only, until ACH Direct Debit is enabled in Stripe
```

**Metering needs all three of** `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID` and
`STRIPE_METER_EVENT`. With only the secret key, onboarding saves a card and no
usage is billed; the server logs a warning at startup saying so.

**Set `RESEND_API_KEY` in production.** Without it the server is in local
development mode and prints each 6-digit verification code to its console —
a working sign-in credential for anyone who can read the logs. With it set,
codes are only emailed and never logged.

**The Python email verifier.** On Render it runs automatically (section 0c). To run it
yourself, `npm run verifier` starts
`verifier/email_verifier.py` (Python 3.10+, standard library only) on
`127.0.0.1:4390`. Set `VERIFIER_SECRET` and `VERIFIER_PEPPER` (each at least
32 random characters) for both processes, `VERIFIER_URL=http://127.0.0.1:4390`
on the site, and `RESEND_API_KEY` or the `SMTP_*` variables on the verifier.
With that on, codes are minted, mailed and checked by the verifier, stored only
as HMAC hashes, expire in 10 minutes, work once, and burn after 5 wrong tries.
The site's store never holds a code. Keep the verifier on loopback (or a private
network with TLS); it refuses every request without the shared secret.
`npm run verifier:test` runs its tests.

**`PUBLIC_BASE_URL` must be the real `https://` URL.** Checkout return links
are built from it (never from the request's `Host` header), and an `https`
value marks the console's session cookie `Secure`.

Start it: `npm run site` (keep it running under a process manager / systemd).

**Instances and the store.** The store in `SITE_DB_DIR` is a JSON file: every
write is atomic and taken under a lock file, so several processes sharing the
volume can't overwrite each other's changes. Every rate limit — per-key
`RATE_LIMIT_PER_MIN` on `/api/paycheck`, signup and sign-in per address, and
wrong-code counts — is kept in that store too, so limits survive restarts and
N instances share one budget rather than allowing N× the rate. The cost is
throughput: each write rewrites the whole file (a paycheck call makes two), so
this is pilot scale. Past that, move the store to a database; the
`withDb`/`readDb` seam in `site/lib/store.ts` is the only thing that changes.

If the store file is ever corrupted (a disk fault, a manual edit), the server
refuses to use it: account and API requests return 500, `GET /api/health`
returns `503` with `"store":"unreadable"`, and the file is left untouched —
restore it from backup. It never silently starts over empty.

Health check for your load balancer or uptime monitor: `GET /api/health`
(returns `200` with the API version and jurisdiction count).

---

## 4. Verify end-to-end (test mode)

First run `npm run check:stripe` with the same environment; it names anything
misconfigured in Stripe. Then:

1. `GET /api/health` → `200`, `"status":"ok"`.
2. Sign up at `/signup`, verify the email code, and accept terms on `/signup/business`.
3. On `/signup/payment`, start the trial. You should land on a Stripe **Checkout**
   for a **subscription** with a 14-day trial (or a setup-mode Checkout if no
   metered price is configured). Pay with a Stripe
   [test card](https://stripe.com/docs/testing) (`4242 4242 4242 4242`).
4. On return to `/signup/payment`, the page finalizes via `/api/billing/return`,
   issues the key, and opens `/signup/key`. The account shows *trialing*.
5. Make a few `POST /v1/paycheck` calls from `/sandbox` with the key. In Stripe → Billing →
   Meters, confirm meter events are arriving for the customer, and that
   `node scripts/meter-queue.ts` shows `0 pending`.
6. Simulate a failed payment (Stripe → send a test `invoice.payment_failed`
   webhook, or use a card that fails on renewal). Confirm the key then returns
   `402 account_suspended`, and that a test `invoice.paid` reactivates it.

Only once all six pass, swap the four `STRIPE_*` values for **live-mode** ones,
add a **live** webhook endpoint, and repeat step 1–5 with a real card.

---

## 5. Before you take real customers

- [ ] Fill in the legal placeholders — see `docs/LEGAL.md`.
- [ ] Confirm the Stripe price is exactly $0.09 per unit, matching `site/lib/pricing.ts`.
- [ ] Back up `SITE_DB_DIR` on a schedule.
- [ ] Put the app behind HTTPS and a process manager that restarts it.
- [ ] Decide `OMNIA_ISSUE_LIVE_KEYS` (on for production `sk_live_` keys).
- [ ] Alert on `[meter]` errors in the server log, and check
      `node scripts/meter-queue.ts` for `dead` items at least monthly.
- [ ] Test the suspend/reactivate webhook path in live mode once.

---

## Notes on the billing design

- **Metering is durable and off the response path.** Each billable call writes
  its Stripe meter event to a queue in the store, in the same write that
  records the call, and the server delivers the queue in the background. A slow
  or down Stripe never delays or fails a calculation, and a failed delivery
  stays queued and is retried (backoff from 1 minute up to hourly, and on every
  restart). The request id is Stripe's idempotency identifier, so a retry after
  an ambiguous failure can't double-bill, and the event keeps the call's
  original timestamp.
- **Reconciliation.** `node scripts/meter-queue.ts` lists what is still owed to
  Stripe for both the site and the self-hosted API; `--flush` delivers it now.
  Stripe only accepts events up to 35 days old: anything older is marked
  *dead* (never deleted) and listed by `--dead` for manual invoicing.
- **No per-call card charges.** Usage is aggregated by Stripe and invoiced
  monthly, so you don't hit Stripe's per-charge minimum and fees.
- **Suspension is webhook-driven only.** A failed invoice suspends the key
  (`402`); a paid invoice reactivates it. Nothing suspends an account except a
  verified Stripe event.
- **Cancellation is final.** `customer.subscription.deleted` cancels the
  account (`402 subscription_cancelled`). A later `invoice.paid` — Stripe sends
  one for the final invoice — does not revive it; only a new subscription
  through the console does.
- **One trial per subscription.** Once the trial has started, repeating
  `/api/start-trial` or re-signing the terms can't move its dates.

---

## Accounts and sign-in (how it works)

- **Sign up** collects name, work email, business, phone and a password (12+
  characters). The password is stored only as a salted scrypt hash. A 6-digit code
  is emailed through the Python verifier; entering it proves the address and signs
  the customer in.
- **Sign in** with email and password, or have a fresh code emailed. **Forgot
  password** is the code route: confirm the code, then choose a new password.
- **Limits:** ten wrong passwords for one address in an hour locks password sign-in
  for that address (the emailed code still works); 60 password attempts per network
  address per hour; codes expire in 10 minutes, work once and burn after 5 wrong tries.
- **A second signup for a verified address can never replace its password.**
- Accounts created before passwords existed have none; they sign in with a code and
  can set a password from the "forgot password" route.
- **Home-page calculator:** `POST /api/demo/paycheck` runs the real engine with no
  key, for a fixed small input shape, 120 calls per network address per hour. It is
  never billed and never touches an account.
