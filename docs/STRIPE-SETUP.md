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
STRIPE_METER_EVENT=omnia_api_call  STRIPE_WEBHOOK_SECRET=whsec_...  \
PUBLIC_BASE_URL=https://omniatax.io  npm run check:stripe
```

## 1. The billing meter

Stripe dashboard → **Billing → Meters → Create meter**.

| Setting | Value |
|---|---|
| Event name | `omnia_api_call` (must equal `STRIPE_METER_EVENT`) |
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
| Price | **$0.09** per unit, USD |
| Billing period | **Monthly** |

Copy the **Price ID** (`price_...`): this is `STRIPE_PRICE_ID`. Do not add a
free trial to the price. The site sets the 14-day trial itself when it creates
the Checkout session.

## 3. Payment methods

The site's Checkout asks for a card **or** a US bank account (ACH), because a
payment method is required up front even during the trial.

Stripe dashboard → **Settings → Payment methods**: make sure **Cards** and
**ACH Direct Debit** are enabled. If ACH is not enabled on the account, Stripe
refuses to create the Checkout session and signup's payment step fails. To launch
with cards only, set `STRIPE_PAYMENT_METHOD_TYPES=card` on the server and turn
ACH on later.

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
| Events | `invoice.payment_failed`, `invoice.paid`, `customer.subscription.deleted` |
| Optional events | `invoice.payment_succeeded`, `customer.subscription.paused`, `customer.subscription.resumed` |

What each does: a failed invoice or a paused subscription suspends the key
(`402 account_suspended`); a paid invoice or a resumed subscription reactivates
it; a deleted subscription cancels the account for good. Copy the **Signing
secret** (`whsec_...`): this is `STRIPE_WEBHOOK_SECRET`.

The site has one webhook route. The separate self-hosted API (`npm run api`)
uses `/v1/billing/webhook` and its own meter. You are not running that on
Render, so ignore it.

## 6. Put the four values on the server

On Render (Environment tab), or in `.env` locally:

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_METER_EVENT=omnia_api_call
STRIPE_WEBHOOK_SECRET=whsec_...
PUBLIC_BASE_URL=https://omniatax.io
```

Then run `npm run check:stripe` with the same values. Fix anything it marks
`FAIL` before going further. Anything marked `warn` is optional.

## 7. Walk through it once in test mode

1. Sign up on the site, verify the email code, accept the terms.
2. On the payment step you land on Stripe Checkout for a subscription with a
   14-day trial. Pay with test card `4242 4242 4242 4242`, any future date, any
   CVC.
3. You return to the site, the key is issued, the account shows *trialing*.
4. Make a few `POST /v1/paycheck` calls from the sandbox. In Stripe → Billing →
   Meters, usage should appear for that customer. `npm run meter:queue` should
   show nothing pending.
5. In Stripe, send a test `invoice.payment_failed` event to the endpoint. The
   key should answer `402 account_suspended`. Send `invoice.paid`: it should work
   again.

## Going live

Repeat sections 1, 2, 4 and 5 in **live mode** (new meter, new price, new
webhook endpoint, live keys), swap all four values on the server together, run
`npm run check:stripe` with the live values, set `OMNIA_ISSUE_LIVE_KEYS=1` to
issue `sk_live_` keys, and walk through section 7 once with a real card.

## Starting over

- A new Stripe account means new customer IDs. Any account the site created
  against the old Stripe account points at a customer that no longer exists. On
  a fresh Render disk there is nothing to clean up. If you tested against the old
  account on a server that has data you want to throw away, stop the server and
  delete `db.json` in the data folder (`SITE_DB_DIR`, `/var/data/site` on
  Render). Do this only while there are no real customers.
- Usage that was queued for Stripe but not delivered stays in that same store.
  `npm run meter:queue` lists it; it is lost if you delete the store.
