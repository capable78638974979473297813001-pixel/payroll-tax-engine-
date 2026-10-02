/**
 * Preflight for the Stripe side of the site. Reads the same environment the
 * server does and checks it against what the code actually does, so a fresh
 * Stripe account can be verified before anyone signs up:
 *
 *   STRIPE_SECRET_KEY=sk_test_... STRIPE_PRICE_ID=price_... \
 *   STRIPE_METER_EVENT=omnia_api_call STRIPE_WEBHOOK_SECRET=whsec_... \
 *   PUBLIC_BASE_URL=https://omniatax.io npm run check:stripe
 *
 * Read-only: it only issues GET requests. Exits 1 if anything that would
 * break signup or billing is wrong, 0 otherwise (warnings do not fail).
 * STRIPE_API_BASE points it at a stand-in server for tests.
 */
import { loadEnvFile } from 'node:process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch {
  /* no .env: use the real environment */
}

const API = process.env.STRIPE_API_BASE ?? 'https://api.stripe.com';
const KEY = process.env.STRIPE_SECRET_KEY ?? '';
const PRICE = process.env.STRIPE_PRICE_ID ?? '';
const METER_EVENT = process.env.STRIPE_METER_EVENT ?? '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? '';
const BASE_URL = (process.env.PUBLIC_BASE_URL ?? '').replace(/\/+$/, '');

/** What the site's price must be: cents per call, matching site/lib/pricing.ts. */
const EXPECTED_UNIT_CENTS = 9;
/** Events site/lib/billing.ts acts on. */
const REQUIRED_EVENTS = [
  'invoice.payment_failed',
  'invoice.paid',
  'customer.subscription.deleted',
];
const OPTIONAL_EVENTS = [
  'invoice.payment_succeeded',
  'customer.subscription.paused',
  'customer.subscription.resumed',
];

let failures = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const warn = (m: string) => console.log(`  warn  ${m}`);
const fail = (m: string) => {
  failures++;
  console.log(`  FAIL  ${m}`);
};

async function get(path: string): Promise<{ status: number; body: Record<string, any> }> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${KEY}` } });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, any> };
}

console.log('Stripe preflight');

// ---- key ------------------------------------------------------------------
console.log('\nSecret key');
let live = false;
if (!KEY) {
  fail('STRIPE_SECRET_KEY is not set.');
} else if (!/^(sk|rk)_(test|live)_/.test(KEY)) {
  fail('STRIPE_SECRET_KEY must start with sk_test_, sk_live_, rk_test_ or rk_live_.');
} else {
  live = KEY.includes('_live_');
  ok(`${live ? 'LIVE' : 'test'}-mode key`);
  const acct = await get('/v1/balance');
  if (acct.status === 200) ok('key is accepted by Stripe');
  else if (acct.status === 401) fail(`Stripe rejected the key: ${acct.body.error?.message ?? 'invalid key'}`);
  else warn(`key reached Stripe but cannot read the balance (${acct.status}); fine for a restricted key.`);
}

// ---- price & meter ----------------------------------------------------------
console.log('\nMetered price');
if (!PRICE) {
  fail('STRIPE_PRICE_ID is not set. Without it signup saves a card but nothing is ever billed.');
} else if (KEY) {
  const r = await get(`/v1/prices/${encodeURIComponent(PRICE)}`);
  if (r.status !== 200) {
    fail(`Price ${PRICE} not found (${r.status}). Is it from the same mode (test/live) as the key?`);
  } else {
    const p = r.body;
    p.active ? ok('price is active') : fail('price is archived');
    if (p.livemode === live) ok(`price is ${live ? 'live' : 'test'} mode, matching the key`);
    else fail(`price is ${p.livemode ? 'live' : 'test'} mode but the key is ${live ? 'live' : 'test'} mode`);
    p.currency === 'usd' ? ok('currency usd') : fail(`currency is ${p.currency}, expected usd`);
    p.recurring?.usage_type === 'metered'
      ? ok('usage type is metered')
      : fail('price is not usage-based (metered). Create it as "Usage-based".');
    p.recurring?.interval === 'month' && (p.recurring?.interval_count ?? 1) === 1
      ? ok('billed monthly')
      : fail(`billing period is ${p.recurring?.interval_count ?? 1} ${p.recurring?.interval}, expected monthly`);
    p.billing_scheme === 'per_unit' && !p.tiers_mode
      ? ok('flat per-unit pricing (no tiers)')
      : fail('price uses tiers. The site charges one flat rate: use "per unit".');
    const cents = p.unit_amount_decimal != null ? Number(p.unit_amount_decimal) : p.unit_amount;
    cents === EXPECTED_UNIT_CENTS
      ? ok(`${EXPECTED_UNIT_CENTS} cents per unit`)
      : fail(`unit price is ${cents} cents, expected ${EXPECTED_UNIT_CENTS} (site/lib/pricing.ts)`);

    const meterId = p.recurring?.meter;
    console.log('\nBilling meter');
    if (!meterId) {
      fail('the price is not tied to a billing meter.');
    } else {
      const m = await get(`/v1/billing/meters/${encodeURIComponent(meterId)}`);
      if (m.status !== 200) {
        fail(`could not read meter ${meterId} (${m.status}). A restricted key needs read access to Billing Meters.`);
      } else {
        const mt = m.body;
        mt.status === 'active' ? ok('meter is active') : fail(`meter status is ${mt.status}`);
        if (!METER_EVENT) fail('STRIPE_METER_EVENT is not set.');
        else if (mt.event_name === METER_EVENT) ok(`event name "${METER_EVENT}" matches the meter`);
        else fail(`meter listens for "${mt.event_name}" but STRIPE_METER_EVENT is "${METER_EVENT}"`);
        mt.default_aggregation?.formula === 'sum'
          ? ok('aggregation is Sum')
          : fail(`aggregation is ${mt.default_aggregation?.formula}, expected sum`);
        mt.customer_mapping?.event_payload_key === 'stripe_customer_id' && mt.customer_mapping?.type === 'by_id'
          ? ok('customer mapping is stripe_customer_id')
          : fail('customer mapping must be "by ID" using the payload key stripe_customer_id (Stripe default)');
        (mt.value_settings?.event_payload_key ?? 'value') === 'value'
          ? ok('value key is "value"')
          : fail(`value key is "${mt.value_settings?.event_payload_key}", expected value (Stripe default)`);
      }
    }
  }
}

// ---- webhook --------------------------------------------------------------
console.log('\nWebhook');
if (!WEBHOOK_SECRET) fail('STRIPE_WEBHOOK_SECRET is not set. Without it failed payments never suspend a key.');
else if (!WEBHOOK_SECRET.startsWith('whsec_')) fail('STRIPE_WEBHOOK_SECRET must start with whsec_.');
else ok('signing secret is set');
if (!BASE_URL) {
  fail('PUBLIC_BASE_URL is not set. Checkout return links and the Secure cookie need it.');
} else {
  BASE_URL.startsWith('https://') || !live
    ? ok(`PUBLIC_BASE_URL ${BASE_URL}`)
    : fail('PUBLIC_BASE_URL must be https:// with a live key');
  if (KEY) {
    const wanted = `${BASE_URL}/api/billing/webhook`;
    const w = await get('/v1/webhook_endpoints?limit=100');
    if (w.status !== 200) {
      warn(`could not list webhook endpoints (${w.status}); check ${wanted} in the dashboard by hand.`);
    } else {
      const ep = (w.body.data as any[]).find((e) => e.url === wanted);
      if (!ep) fail(`no webhook endpoint for ${wanted}`);
      else {
        ep.status === 'enabled' ? ok(`endpoint ${wanted} is enabled`) : fail(`endpoint is ${ep.status}`);
        const have: string[] = ep.enabled_events ?? [];
        const all = have.includes('*');
        for (const e of REQUIRED_EVENTS) all || have.includes(e) ? ok(`listens for ${e}`) : fail(`missing event ${e}`);
        for (const e of OPTIONAL_EVENTS) if (!all && !have.includes(e)) warn(`optional event ${e} not selected`);
      }
    }
  }
}

// ---- things this script cannot see --------------------------------------
console.log('\nBy hand');
console.log('  note  Checkout offers card and US bank account (ACH). Enable ACH Direct Debit in');
console.log('        Stripe -> Settings -> Payment methods, or set STRIPE_PAYMENT_METHOD_TYPES=card.');
console.log('  note  Test mode and live mode are separate: repeat setup and this check with live keys.');

console.log(failures ? `\n${failures} problem(s) to fix.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
