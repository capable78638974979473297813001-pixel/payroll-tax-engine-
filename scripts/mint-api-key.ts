import { listApiKeys, mintApiKey, revokeApiKey, settleBalance, usageForKey } from '../api/keys.ts';

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
      console.log(
        `${k.active ? '●' : '○'} ${k.prefix}…  ${k.name}  [${k.plan} · ${money(k.pricePerCallCents)}/call]  ` +
          `calls=${k.calls}  due=${money(k.balanceDueCents)}  billed=${money(k.lifetimeBilledCents)}`,
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
  const before = usageForKey(target) ?? null; // may be null if target is a prefix; that's fine, settle resolves it
  const out = settleBalance(target);
  if (!out.ok) {
    console.log(`No key matching ${target}.`);
    process.exit(1);
  }
  console.log(`Charged ${out.name}: ${money(out.chargedCents)} (balance settled to $0.00).`);
  console.log('NOTE: this cleared the balance in the ledger. Wire a payment processor in api/keys.ts settleBalance() to actually collect it.');
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
