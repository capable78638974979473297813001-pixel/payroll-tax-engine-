import { listApiKeys, mintApiKey, revokeApiKey } from '../api/keys.ts';

/**
 * Mint / list / revoke API keys for examples/api-server.ts — the self-hosted,
 * no-database key store (api/keys.ts). This is the local equivalent of
 * scripts/generate-api-key.ts, except it writes straight to the file store
 * instead of printing a Supabase INSERT.
 *
 *   npm run api:key "Acme Payroll"      # mint (plaintext printed ONCE)
 *   npm run api:key -- --list           # list keys (no secrets)
 *   npm run api:key -- --revoke sk_live_ab12cd   # revoke by prefix or id
 */

const [, , arg, arg2] = process.argv;

if (arg === '--list') {
  const keys = listApiKeys();
  if (!keys.length) {
    console.log('No keys yet. Mint one:  npm run api:key "Customer Name"');
  } else {
    for (const k of keys) {
      console.log(`${k.active ? '●' : '○'} ${k.prefix}…  ${k.name}  [${k.plan}]  calls=${k.calls}  last=${k.lastUsedAt ?? 'never'}`);
    }
  }
  process.exit(0);
}

if (arg === '--revoke') {
  if (!arg2) {
    console.error('Usage: npm run api:key -- --revoke <prefix-or-id>');
    process.exit(1);
  }
  console.log(revokeApiKey(arg2) ? `Revoked ${arg2}.` : `No key matching ${arg2}.`);
  process.exit(0);
}

if (!arg) {
  console.error('Usage: npm run api:key "<name for this key>"   (or --list / --revoke <prefix>)');
  process.exit(1);
}

const { key, record } = mintApiKey(arg);
console.log('PLAINTEXT KEY (save this now — it is never shown again):\n');
console.log('  ' + key + '\n');
console.log(`name: ${record.name}   prefix: ${record.prefix}   id: ${record.id}   plan: ${record.plan}`);
console.log('\nUse it:  curl -H "Authorization: Bearer ' + key + '" ...');
