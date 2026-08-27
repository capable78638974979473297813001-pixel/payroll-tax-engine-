import { sweep, describeSweep } from '../harvester/run.ts';

/**
 * Run one harvest sweep against the real sources.
 *
 *   npm run harvest              -- check whatever is due today
 *   npm run harvest -- --force   -- check everything regardless of cadence
 *   npm run harvest -- --date 2027-01-02   -- pretend it is that day
 *
 * The date argument is not a convenience: it is how you see what the
 * calendar will do on 2 January before 2 January arrives, and how a run is
 * made reproducible. Same discipline as the engine's own checkDate.
 */

const args = process.argv.slice(2);
const force = args.includes('--force');
const dateArg = args.includes('--date') ? args[args.indexOf('--date') + 1] : undefined;

if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) {
  console.error(`--date must be ISO yyyy-mm-dd, got "${dateArg}"`);
  process.exit(1);
}

const asOf = dateArg ?? new Date().toISOString().slice(0, 10);

const report = await sweep(asOf, { force });
console.log(describeSweep(report));

// A changed source is not a failure — it is the entire point. But an
// unreadable one means the harvester is blind to that jurisdiction, which
// is worth a nonzero exit so a scheduled run can surface it.
process.exit(report.counts.fetch_failed > 0 ? 1 : 0);
