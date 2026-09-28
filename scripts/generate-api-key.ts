import { randomBytes, createHash } from 'node:crypto';

/**
 * Generates one new API key for the calculate-paycheck Edge Function.
 * Prints the plaintext key ONCE (save it — it is never recoverable after
 * this) and the SQL insert statement, which carries only the SHA-256
 * hash, matching what supabase/functions/calculate-paycheck/index.ts
 * hashes an incoming request's key against before comparing.
 *
 *   node scripts/generate-api-key.ts "some-customer-name"          # sk_test_ key
 *   node scripts/generate-api-key.ts "some-customer-name" --live   # sk_live_ key
 *
 * Test by default (or live with EDGE_ISSUE_LIVE_KEYS=1), so a key minted
 * while developing can't be mistaken for a production credential.
 */
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
if (!name) {
  console.error('Usage: node scripts/generate-api-key.ts "<name for this key>" [--live]');
  process.exit(1);
}
const live = args.includes('--live') || process.env.EDGE_ISSUE_LIVE_KEYS === '1';

const key = (live ? 'sk_live_' : 'sk_test_') + randomBytes(24).toString('base64url');
const hash = createHash('sha256').update(key).digest('hex');

console.log(`PLAINTEXT ${live ? 'LIVE' : 'TEST'} KEY (save this now — it will not be shown again):`);
console.log(key);
console.log();
console.log('Run this in the Supabase SQL editor:');
console.log(`insert into api_keys (name, key_hash) values ('${name.replace(/'/g, "''")}', '${hash}');`);
