import { calculateAlabamaPaycheck, formatAlabamaPaystub, ALABAMA_SCENARIOS } from '../src/alabama/index.ts';

/**
 * Runs every scenario in the Alabama catalogue (src/alabama/scenarios.ts)
 * and prints the resulting paystub plus what it proves.
 *
 * Usage:
 *   npm run demo:alabama                 -- every scenario
 *   npm run demo:alabama -- bonus-flat-five-percent   -- just one, by id
 */
const wanted = process.argv[2];
const scenarios = wanted ? ALABAMA_SCENARIOS.filter((s) => s.id === wanted) : ALABAMA_SCENARIOS;

if (wanted && scenarios.length === 0) {
  console.error(`No scenario "${wanted}". Known ids:\n  ${ALABAMA_SCENARIOS.map((s) => s.id).join('\n  ')}`);
  process.exit(1);
}

for (const scenario of scenarios) {
  console.log('\n' + '#'.repeat(94));
  console.log(`# ${scenario.id}`);
  console.log(`# ${scenario.title}`);
  console.log(`# Covers: ${scenario.covers}`);
  console.log('#'.repeat(94));

  const output = calculateAlabamaPaycheck(scenario.input);
  console.log(formatAlabamaPaystub(output));
}

console.log(`\n${scenarios.length} scenario(s) calculated.\n`);
