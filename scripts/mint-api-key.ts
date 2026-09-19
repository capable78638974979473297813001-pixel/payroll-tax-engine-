import { getApiKey, listApiKeys, mintApiKey, revokeApiKey } from '../api/keys.ts';
import { billingConfigured, chargeOutstanding } from '../api/billing.ts';

/**
 * Manage API keys + billing for examples/api-server.ts — the self-hosted,
 * no-database key store (api/keys.ts).
 *
 *   npm run api:key "Acme Payroll"                 # mint at the default price
 *   npm run api:key "Acme Payroll" --price 0.02    # mint at $0.02 / call
 *   npm run api:key "Acme Payroll" --plan pro      # mint at a plan's price
 *   npm run api:key -- --list                      # keys, price, balance due
 *   npm run api:key -- --bill sk_live_ab12cd       # charge the balance (settle to $0)
 *   npm run api:key -- --revoke sk_live_ab12cd     # revoke by prefix or id
 */

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i !== -1 ? argv[i + 1] : undefined;
};
const money = (cents: number) => '$' + (cents / 100).toFixed(cents % 100 === 0 && Math.abs(cents) >= 100 ? 2 : 2);

if (argv[0] === '--list') {
  const keys = listApiKeys();
  if (!keys.length) {
    console.log('No keys yet. Mint one:  npm run api:key "Customer Name"');
  } else {
    for (const k of keys) {
      const card = k.cardOnFile ? `${k.cardBrand ?? 'card'}••${k.cardLast4 ?? '????'}` : 'no card';
      console.log(
        `${k.active ? '●' : '○'} ${k.prefix}…  ${k.name}  [${k.plan} · ${money(k.pricePerCallCents)}/call]  ` +
          `calls=${k.calls}  due=${money(k.balanceDueCents)}  billed=${money(k.lifetimeBilledCents)}  ${card}`,
      );
    }
  }
  process.exit(0);
}

if (argv[0] === '--bill' || argv[0] === '--settle') {
  const target = argv[1];
  if (!target) {
    console.error('Usage: npm run api:key -- --bill <prefix-or-id>');
    process.exit(1);
  }
  // Resolve prefix -> id (chargeOutstanding takes an id).
  const k = getApiKey(target) ?? listApiKeys().find((x) => x.prefix === target || x.id === target);
  if (!k) {
    console.log(`No key matching ${target}.`);
    process.exit(1);
  }
  const out = await chargeOutstanding(k.id);
  if (out.ok && out.chargedCents > 0) {
    console.log(`Charged ${k.name} ${money(out.chargedCents)} via Stripe (payment ${out.paymentIntentId}). Balance settled to $0.00.`);
  } else if (out.ok) {
    console.log(`Nothing due for ${k.name}.`);
  } else if (out.reason === 'stripe_not_configured') {
    console.log('STRIPE_SECRET_KEY is not set, so no card was charged. Set it in this server/shell env and try again.');
  } else if (out.reason === 'no_card_on_file') {
    console.log(`${k.name} has no card on file yet. Send them a Checkout link: POST /v1/billing/setup with their key.`);
  } else {
    console.log(`Charge failed for ${k.name} (${out.reason}${out.error ? ': ' + out.error : ''}). Balance left unchanged.`);
  }
  if (!billingConfigured()) console.log('(Billing runs in ledger-only mode until STRIPE_SECRET_KEY is set where this runs.)');
  process.exit(0);
}

if (argv[0] === '--revoke') {
  const target = argv[1];
  if (!target) {
    console.error('Usage: npm run api:key -- --revoke <prefix-or-id>');
    process.exit(1);
  }
  console.log(revokeApiKey(target) ? `Revoked ${target}.` : `No key matching ${target}.`);
  process.exit(0);
}

const name = argv[0];
if (!name || name.startsWith('--')) {
  console.error('Usage: npm run api:key "<name>" [--price <dollars>] [--plan <name>]   (or --list / --bill / --revoke)');
  process.exit(1);
}

const priceDollars = flag('--price');
const plan = flag('--plan');
const { key, record } = mintApiKey(name, {
  plan,
  pricePerCallCents: priceDollars !== undefined ? Math.round(parseFloat(priceDollars) * 100) : undefined,
});

console.log('PLAINTEXT KEY (save this now — it is never shown again):\n');
console.log('  ' + key + '\n');
console.log(`name: ${record.name}   prefix: ${record.prefix}   plan: ${record.plan}   price: ${money(record.pricePerCallCents)}/call`);
console.log('\nUse it:  curl -H "Authorization: Bearer ' + key + '" ...');
