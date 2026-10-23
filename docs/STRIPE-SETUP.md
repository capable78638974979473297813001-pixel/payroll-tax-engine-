# Stripe setup (fresh start)

Everything the site needs from Stripe, in the order to do it, with the exact
values the code expects. Do it in **test mode** first. Test mode and live mode
are completely separate: every object below (meter, price, webhook, keys) has to
be created again in live mode, and the four values you copy have to be swapped
together.

When you are done, run the preflight. It only reads from Stripe and tells you
what is wrong:

```
STRIPE_SECRET_KEY=sk_test_...  STRIPE_PRICE_ID=price_...  \
STRIPE_METER_EVENT_NAME=omnia_api_call  STRIPE_WEBHOOK_SECRET=whsec_...  \
PUBLIC_BASE_URL=https://omniatax.io  npm run check:stripe
```

Do this in **test mode**. A live secret key (`sk_live_` or `rk_live_`) is refused
until `STRIPE_ALLOW_LIVE=1`. Leave that unset while you are on test keys.

## Render env vars Scott must set

Set these on the Render service (Environment). Paste them only there. This doc
does not contain the values.

- `STRIPE_SECRET_KEY` (`sk_test_` for now)
- `STRIPE_PRICE_ID`
- `STRIPE_METER_EVENT_NAME`
- `STRIPE_WEBHOOK_SECRET`

`PUBLIC_BASE_URL` is already set in `render.yaml`.

`STRIPE_ALLOW_LIVE` must stay unset until a full test payment works.

## 1. The billing meter

Stripe dashboard → **Billing → Meters → Create meter**.

| Setting | Value |
|---|---|
| Event name | the value you will put in `STRIPE_METER_EVENT_NAME` (for example `omnia_api_call`) |
| Aggregation | **Sum** |
| Value key | `value` (Stripe's default) |
| Customer mapping | **Customer ID**, payload key `stripe_customer_id` (Stripe's default) |

The site sends one event per successful paycheck calculation with exactly those
payload keys, so leave the defaults alone.

## 2. The price

**Product catalog → Add product** (for example "Omnia.tax API calls") → add a
price:

| Setting | Value |
|---|---|
| Pricing model | **Usage-based**, **Per unit** (not graduated, not volume) |
| Meter | the meter from step 1 |
| Price | set the rate in Stripe. The app does not hardcode or display it |
| Billing period | **Monthly** |

Copy the **Price ID** (`price_...`): this is `STRIPE_PRICE_ID`. Do not commit
the price id or the amount. Do not add a free trial to the price. The site
sets the 14-day trial itself when it creates the Checkout session.

## 3. Payment methods

Checkout does not send `payment_method_types`. Stripe API `2026-09-30.endive`
rejects that parameter. The session uses the dynamic payment methods turned on
in the Dashboard. A payment method is still required up front, including during
the trial.

Stripe dashboard → **Settings → Payment methods**: enable the methods you want
Checkout to offer (for example **Cards** and **ACH Direct Debit**).

## 4. API key

**Developers → API keys.** For test mode use the standard secret key
(`sk_test_...`). This is `STRIPE_SECRET_KEY`.

If you later switch to a restricted key (`rk_...`), it needs these permissions,
which are everything the code calls: Customers (write), Checkout Sessions
(write), Subscriptions (read), PaymentMethods (read), Billing meter events
(write), Billing meters (read), Prices (read), and, only so the preflight can
check your webhook, Webhook endpoints (read).

## 5. Webhook

**Developers → Webhooks → add an endpoint.**

| Setting | Value |
|---|---|
| Endpoint URL | `https://omniatax.io/api/billing/webhook` |
| Events | `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid`, `invoice.payment_failed` |
| Optional events | `invoice.payment_succeeded`, `customer.subscription.paused`, `customer.subscription.resumed` |

The site verifies `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET` over the **raw**
body. A bad signature is rejected and changes nothing. Deliveries are idempotent
on the Stripe event id, so a retry does not apply twice.

What each does:

- `checkout.session.completed` links the Stripe customer and subscription to the account (subscription-mode Checkout on `STRIPE_PRICE_ID`). Success and cancel URLs are built from `PUBLIC_BASE_URL`.
- `customer.subscription.updated` suspends on `past_due`, `unpaid`, or `paused`, cancels on `canceled`, and clears a payment suspension when the subscription is `active` or `trialing`.
- `customer.subscription.deleted` cancels the account for good.
- `invoice.payment_failed` suspends the key (`402 account_suspended`).
- `invoice.paid` clears that suspension. It does not revive a cancelled subscription.

Copy the **Signing secret** (`whsec_...`): this is `STRIPE_WEBHOOK_SECRET`. Do not
commit it.

The site has one webhook route. The separate self-hosted API (`npm run api`)
uses `/v1/billing/webhook` and its own meter. You are not running that on
Render, so ignore it.

## 6. Put the four values on the server

On Render (Environment tab), or in `.env` locally:

```
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_METER_EVENT_NAME=
STRIPE_WEBHOOK_SECRET=
PUBLIC_BASE_URL=https://omniatax.io
```

Paste the real values only in the host environment or a gitignored `.env`.
`render.yaml` lists the four Stripe keys with `sync: false` so Blueprint
sync never writes them into git. `STRIPE_METER_EVENT` is still read when
`STRIPE_METER_EVENT_NAME` is blank.

Leave `STRIPE_ALLOW_LIVE` unset for test mode. Set it to `1` only when you
intentionally switch `STRIPE_SECRET_KEY` to a live key.

Then run the check with the same values. On Render, open your service's **Shell** tab and run `node scripts/check-stripe.ts`: the shell already has your environment variables, so there is nothing to paste. Locally, `npm run check:stripe`. Fix anything it marks
`FAIL` before going further. Anything marked `warn` is optional.

## 7. Walk through it once in test mode

1. Sign up on the site, verify the email code, accept the terms.
2. On the payment step you land on Stripe Checkout for a subscription with a
   14-day trial. Pay with test card `4242 4242 4242 4242`, any future date, any
   CVC.
3. You return to the site, the key is issued, the account shows *trialing*.
4. Make a few `POST /v1/paycheck` calls. Every issued key is `sk_live_` and
   returns real calculations. A stored `sk_test_` key is rejected with
   `401 key_not_accepted` and is not metered. Each successful paycheck,
   including each paycheck inside `POST /v1/payCalc` and `POST /v1/payroll/run`,
   sends one Billing Meter event with `value` 1 and a unique identifier,
   including during the 14-day trial. Address lookups are not metered.
   If Stripe is down the API still returns the calculation and the event
   stays queued. `npm run meter:queue` shows anything not yet delivered.
5. In Stripe, send a test `invoice.payment_failed` event to the endpoint. The
   key should answer `402 account_suspended`. Send `invoice.paid`: it should work
   again.

## Going live

Repeat sections 1, 2, 4 and 5 in **live mode** (new meter, new price, new
webhook endpoint, live keys), swap all four values on the server together, run
`npm run check:stripe` with the live values, and walk through section 7 once
with a real card. Issued customer keys are already `sk_live_`. `OMNIA_ISSUE_LIVE_KEYS`
is not read.

## Trial usage on the metered price

Checkout creates the subscription with `subscription_data[trial_period_days]=14`
and `payment_method_collection=always`. The price is `STRIPE_PRICE_ID` (8¢ per
unit in test mode; the site copy says $0.08). The app keeps sending one meter
event per successful paycheck during the trial.

Stripe's free trial period does not bill usage recorded during the trial.
After the trial, billing resumes for usage recorded after the trial ends.
That is why trial usage is $0 on this integration. Do not switch this to a
Stripe Trial Offer: a trial offer can bill metered usage at an introductory
price, and Checkout support for trial offers is a private preview.

- https://docs.stripe.com/billing/subscriptions/trials/free-trials — "Trials with usage-based billing"
- https://docs.stripe.com/billing/subscriptions/trials/compare — free trial period row

## Starting over

- A new Stripe account means new customer IDs. Any account the site created
  against the old Stripe account points at a customer that no longer exists. On
  a fresh Render disk there is nothing to clean up. If you tested against the old
  account on a server that has data you want to throw away, stop the server and
  delete `db.json` in the data folder (`SITE_DB_DIR`, `/var/data/site` on
  Render). Do this only while there are no real customers.
- Usage that was queued for Stripe but not delivered stays in that same store.
  `npm run meter:queue` lists it; it is lost if you delete the store.
