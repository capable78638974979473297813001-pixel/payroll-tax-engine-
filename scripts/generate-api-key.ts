import { randomBytes, createHash } from 'node:crypto';

/**
 * Generates one new API key for the calculate-paycheck Edge Function.
 * Prints the plaintext key ONCE (save it — it is never recoverable after
 * this) and the SQL insert statement, which carries only the SHA-256
 * hash, matching what supabase/functions/calculate-paycheck/index.ts
 * hashes an incoming request's key against before comparing.
 *
 *   node scripts/generate-api-key.ts "some-customer-name"
 */
const name = process.argv[2];
if (!name) {
  console.error('Usage: node scripts/generate-api-key.ts "<name for this key>"');
  process.exit(1);
}

const key = 'sk_live_' + randomBytes(24).toString('base64url');
const hash = createHash('sha256').update(key).digest('hex');

console.log('PLAINTEXT KEY (save this now — it will not be shown again):');
console.log(key);
console.log();
console.log('Run this in the Supabase SQL editor:');
console.log(`insert into api_keys (name, key_hash) values ('${name.replace(/'/g, "''")}', '${hash}');`);
