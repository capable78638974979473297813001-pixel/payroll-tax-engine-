/**
 * Inspect and flush the Stripe meter-event queues — the reconciliation
 * path for per-call billing.
 *
 * Every billable call on a metered subscription queues its Stripe meter
 * event in the same store write that records the call; the servers
 * deliver the queue in the background and retry failures every minute.
 * This script is for the operator: see what is still owed to Stripe, push
 * it now (ignoring backoff), and find anything that aged past Stripe's
 * 35-day backdating window ("dead") and has to be invoiced by hand.
 *
 *   node scripts/meter-queue.ts                 # both stores: counts + oldest items
 *   node scripts/meter-queue.ts --flush         # deliver everything pending now
 *   node scripts/meter-queue.ts --dead          # list dead items for manual invoicing
 *   node scripts/meter-queue.ts --site | --api  # only one store
 *
 * Reads the same .env and SITE_DB_DIR / API_DB_DIR as the servers, so run
 * it where they run (it takes the store lock, so running alongside them is
 * safe).
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

try {
  process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch {
  /* no .env */
}

const argv = process.argv.slice(2);
const only = argv.includes('--site') ? 'site' : argv.includes('--api') ? 'api' : null;

interface Item { identifier: string; customerId: string; value: number; at: string; attempts: number; lastError: string | null; deadAt?: string | null }

function report(label: string, items: Item[]): void {
  const dead = items.filter((i) => i.deadAt);
  const pending = items.filter((i) => !i.deadAt);
  const units = (xs: Item[]) => xs.reduce((n, i) => n + i.value, 0);
  console.log(`${label}: ${pending.length} pending (${units(pending)} units), ${dead.length} dead (${units(dead)} units)`);
  const show = argv.includes('--dead') ? dead : pending.slice(0, 10);
  for (const i of show) {
    console.log(
      `  ${i.at}  ${i.customerId}  x${i.value}  id=${i.identifier}  attempts=${i.attempts}` +
        (i.deadAt ? `  DEAD since ${i.deadAt}` : '') +
        (i.lastError ? `  last error: ${i.lastError}` : ''),
    );
  }
}

if (only !== 'api') {
  const site = await import('../site/lib/billing.ts');
  if (argv.includes('--flush')) {
    if (!site.meteringConfigured()) console.log('site: metering is not configured (STRIPE_SECRET_KEY + STRIPE_PRICE_ID + STRIPE_METER_EVENT); nothing sent.');
    else console.log('site flush:', await site.flushMeterQueue({ force: true }));
  }
  report('site', site.pendingMeterEvents());
}

if (only !== 'site') {
  const billing = await import('../api/billing.ts');
  const keys = await import('../api/keys.ts');
  if (argv.includes('--flush')) {
    if (!billing.meteringConfigured()) console.log('api: metering is not configured (STRIPE_SECRET_KEY + STRIPE_PRICE_ID + STRIPE_METER_EVENT); nothing sent.');
    else console.log('api flush:', await billing.flushMeterQueue({ force: true }));
  }
  report('api', keys.pendingMeterEvents());
}
