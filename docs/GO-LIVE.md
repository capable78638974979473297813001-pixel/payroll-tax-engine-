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
- A domain pointed at it over HTTPS (e.g. `https://omnia.tax`).
- A Stripe account.
- A transactional-email provider (Resend) if you want signup codes emailed
  instead of printed to the server log.

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

## 2. Stripe — one-time dashboard setup

Do this in **Test mode** first, verify, then repeat in **Live mode**.

1. **Create the billing meter.**
   Billing → Meters → *Create meter*.
   - Event name: `omnia_api_call`
   - Aggregation: **Sum** of `value`.
   - Copy the event name; it becomes `STRIPE_METER_EVENT`.

2. **Create the metered price with graduated tiers.**
   Products → *Create product* (e.g. "Omnia API — metered calls") → add a
   **usage-based price** tied to the meter above, **Graduated** tiers matching
   `site/lib/pricing.ts`:

   | Up to (calls / mo or billing period) | Per-call |
   |---|---|
   | first 25,000 | $0.12 |
   | 25,001 – 200,000 | $0.09 |
   | 200,001 – 1,000,000 | $0.06 |
   | 1,000,000+ | $0.04 |

   Billing period: monthly. Copy the **Price ID** (`price_…`) → `STRIPE_PRICE_ID`.

   > Note: the site's tiers are annual in the copy; if you bill monthly, either
   > set the tier bounds to monthly-equivalent volumes or keep them as-is and
   > treat them as per-invoice bands. Decide this with the same numbers the
   > pricing page shows so quotes and invoices agree.

3. **Get your secret key.**
   Developers → API keys → **Secret key**. Start with the **test** key
   (`sk_test_…`), or a restricted key scoped to Customers, Checkout,
   Subscriptions, and Billing Meters. → `STRIPE_SECRET_KEY`.

4. **Add the webhook endpoint.**
   Developers → Webhooks → *Add endpoint*:
   - URL: `https://<your-domain>/api/billing/webhook`
   - Events: `invoice.payment_failed`, `invoice.paid`,
     `customer.subscription.deleted` (optionally `invoice.payment_succeeded`,
     `customer.subscription.paused`, `customer.subscription.resumed`).
   - Copy the **Signing secret** (`whsec_…`) → `STRIPE_WEBHOOK_SECRET`.

---

## 3. Server environment

Set these where the site runs (see `.env.example` for the full list):

```
SITE_DB_DIR=/var/lib/omnia
PUBLIC_BASE_URL=https://omnia.tax
PORT=4323

STRIPE_SECRET_KEY=sk_test_…            # test first, then sk_live_…
STRIPE_PRICE_ID=price_…                # the graduated metered price
STRIPE_METER_EVENT=omnia_api_call
STRIPE_WEBHOOK_SECRET=whsec_…

# optional
RESEND_API_KEY=…                       # email verification codes
RATE_LIMIT_PER_MIN=120
OMNIA_ISSUE_LIVE_KEYS=1                 # mint sk_live_ keys instead of sk_test_
```

Start it: `npm run site` (keep it running under a process manager / systemd).

Health check for your load balancer or uptime monitor: `GET /api/health`
(returns `200` with the API version and jurisdiction count).

---

## 4. Verify end-to-end (test mode)

1. `GET /api/health` → `200`, `"status":"ok"`.
2. Sign up in the console (`/docs.html`), verify email, accept terms.
3. Click **Add card or bank account** → you should land on a Stripe **Checkout**
   for a **subscription** with a 14-day trial. Pay with a Stripe
   [test card](https://stripe.com/docs/testing) (`4242 4242 4242 4242`).
4. On return, the console finalizes via `/api/billing/return`; the account
   shows *trialing* and a live key.
5. Make a few `POST /api/paycheck` calls with the key. In Stripe → Billing →
   Meters, confirm meter events are arriving for the customer.
6. Simulate a failed payment (Stripe → send a test `invoice.payment_failed`
   webhook, or use a card that fails on renewal). Confirm the key then returns
   `402 account_suspended`, and that a test `invoice.paid` reactivates it.

Only once all six pass, swap the four `STRIPE_*` values for **live-mode** ones,
add a **live** webhook endpoint, and repeat step 1–5 with a real card.

---

## 5. Before you take real customers

- [ ] Fill in the legal placeholders — see `docs/LEGAL.md`.
- [ ] Confirm the pricing-page tiers match the Stripe price exactly.
- [ ] Back up `SITE_DB_DIR` on a schedule.
- [ ] Put the app behind HTTPS and a process manager that restarts it.
- [ ] Decide `OMNIA_ISSUE_LIVE_KEYS` (on for production `sk_live_` keys).
- [ ] Test the suspend/reactivate webhook path in live mode once.

---

## Notes on the billing design

- **Metering is best-effort and off the response path.** A slow or down Stripe
  never delays or fails a calculation; the local usage log is the durable record
  and can reconcile. The request id dedupes any retry.
- **No per-call card charges.** Usage is aggregated by Stripe and invoiced
  monthly, so you don't hit Stripe's per-charge minimum and fees.
- **Suspension is webhook-driven only.** A failed invoice suspends the key
  (`402`); a paid invoice reactivates it. Nothing suspends an account except a
  verified Stripe event.
