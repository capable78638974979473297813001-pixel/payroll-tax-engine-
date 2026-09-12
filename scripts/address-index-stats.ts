import { localAddressIndexStats } from '../geocode/local-address-index.ts';

/**
 * Reports what scripts/build-address-index.ts actually built — total
 * points and the per-state breakdown — without opening the 50-state
 * FeatureServer or spinning up the paycheck pipeline. Exists because the
 * build script's own summary scrolls off after a long run; this reads the
 * finished index back.
 *
 *   node scripts/address-index-stats.ts
 */
const stats = localAddressIndexStats();
if (!stats.available) {
  console.log('No local address index at data/address-points/address-points.db — run scripts/build-address-index.ts first.');
  process.exit(1);
}

console.log(`total points: ${stats.totalPoints.toLocaleString()}`);
console.log(`states covered: ${stats.states.length} / 51`);
console.log();
for (const { state, points } of stats.states) {
  console.log(`  ${state}  ${points.toLocaleString()}`);
}

const ALL_JURISDICTIONS = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
];
const covered = new Set(stats.states.map((s) => s.state));
const missing = ALL_JURISDICTIONS.filter((j) => !covered.has(j));
if (missing.length > 0) {
  console.log(`\nno local index coverage yet: ${missing.join(', ')}`);
}
