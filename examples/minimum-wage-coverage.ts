import { minimumWage, localMinimumWages } from '../src/minimum-wage.ts';
import { stateMinimumWageRuleset, sectoralMinimumWageRuleset } from '../src/registry.ts';
import { readdirSync } from 'node:fs';

/**
 * What can this engine actually resolve, for minimum wage, in every
 * jurisdiction? Not a claim — a measurement, re-runnable with
 * `npm run coverage:minimum-wage`, the same convention tax-coverage.ts and
 * local-tax-smoke-test.ts already use for the withholding side of this
 * project.
 *
 * Three passes: every state/DC/territory (standard + tipped), every named
 * region this project models (New York, Oregon), and every local
 * ordinance (standard + tipped, at a representative headcount for anyone
 * with an employer-size tier). A jurisdiction that throws or returns
 * something suspicious prints in red; this measures what the engine
 * produces, not whether every figure is *right* — the test suite in
 * tests/minimum-wage.test.ts does that, against sources cited in the data
 * files themselves.
 *
 * Needs no network: every figure comes from data/minimum-wage/.
 */

const CHECK_DATE = '2026-08-15'; // safely after every mid-2026 step this database models
const RED = (s: string) => `\x1b[31m${s}\x1b[0m`;
const DIM = (s: string) => `\x1b[2m${s}\x1b[0m`;
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;

let suspicious = 0;

console.log('\n=== Federal + every state, DC and territory ===\n');

const stateFiles = readdirSync('data/minimum-wage/states').map((f) => f.slice(0, 2));
const territoryFiles = readdirSync('data/minimum-wage/territories').map((f) => f.slice(0, 2));

for (const code of [...stateFiles, ...territoryFiles].sort()) {
  if (code === 'AS') {
    // American Samoa has no single rate by design — verified separately below.
    continue;
  }
  try {
    const std = minimumWage({ checkDate: CHECK_DATE, state: code });
    const tip = minimumWage({ checkDate: CHECK_DATE, state: code, tipped: true });
    const flags: string[] = [];
    if (std.cents < 725) flags.push('below federal floor');
    if (tip.cents < 213) flags.push('tipped below federal tipped floor');
    if (tip.cents > std.cents) flags.push('tipped cash wage exceeds standard rate');
    const line = `  ${code.padEnd(4)}${fmt(std.cents).padEnd(9)}tipped ${fmt(tip.cents).padEnd(9)}(${std.bindingLevel})`;
    if (flags.length) {
      console.log(RED(`${line}  ⚠ ${flags.join('; ')}`));
      suspicious++;
    } else {
      console.log(line);
    }
  } catch (err) {
    console.log(RED(`  ${code.padEnd(4)}${err instanceof Error ? err.message.slice(0, 70) : err}`));
    suspicious++;
  }
}

console.log('\n=== American Samoa: 18 industry rates (no single figure) ===\n');
const asRuleset = stateMinimumWageRuleset('AS', CHECK_DATE);
for (const rate of asRuleset.industryRates ?? []) {
  console.log(`  ${(rate.label ?? rate.id ?? '?').toString().padEnd(55)}${fmt(rate.hourlyCents)}`);
}

console.log('\n=== Named regions (New York, Oregon) ===\n');
for (const [state, regions] of [
  ['NY', ['downstate', 'upstate']],
  ['OR', ['portland_metro', 'nonurban']],
] as const) {
  for (const region of regions) {
    const std = minimumWage({ checkDate: CHECK_DATE, state, region });
    const tipFood = minimumWage({ checkDate: CHECK_DATE, state, region, tipped: true, occupation: 'food_service' });
    const tipService = minimumWage({
      checkDate: CHECK_DATE, state, region, tipped: true, occupation: 'service_employee',
    });
    console.log(
      `  ${state} ${region.padEnd(16)}${fmt(std.cents).padEnd(9)}` +
        `food_service ${fmt(tipFood.cents).padEnd(9)}service_employee ${fmt(tipService.cents)}`,
    );
  }
}

console.log('\n=== Every sectoral (industry/occupation) minimum wage ===\n');

const sectoralFiles = readdirSync('data/minimum-wage/sectoral');
let sectoralCount = 0;

for (const f of sectoralFiles) {
  const stateCode = f.slice(0, 2);
  const state = minimumWage({ checkDate: CHECK_DATE, state: stateCode });
  for (const sector of sectoralMinimumWageRuleset(stateCode, CHECK_DATE)) {
    sectoralCount++;
    const flags: string[] = [];
    if (sector.hourlyCents <= state.cents) flags.push('does not exceed the state standard rate');
    const line = `  ${stateCode} ${sector.id.padEnd(32)}${fmt(sector.hourlyCents)}`;
    if (flags.length) {
      console.log(RED(`${line}  ⚠ ${flags.join('; ')}`));
      suspicious++;
    } else {
      console.log(line);
    }
  }
}

console.log('\n=== Every local ordinance ===\n');

const localFiles = readdirSync('data/minimum-wage/local');
let localCount = 0;

for (const f of localFiles) {
  const stateCode = f.slice(0, 2);
  const locs = localMinimumWages(stateCode, CHECK_DATE);
  for (const loc of locs) {
    localCount++;
    // A representative headcount for anyone with a size tier: large enough
    // to hit the top tier of every jurisdiction this project models.
    const ec = 600;
    try {
      const std = minimumWage({ checkDate: CHECK_DATE, state: stateCode, locality: loc.id, employeeCount: ec });
      const tip = minimumWage({
        checkDate: CHECK_DATE, state: stateCode, locality: loc.id, tipped: true, employeeCount: ec,
      });
      const localBinding = std.considered.find((c) => c.level === 'local');
      const flags: string[] = [];
      if (!loc.status) {
        if (localBinding?.cents === undefined) flags.push('no local candidate reached the comparison');
        if (tip.cents > std.cents) flags.push('tipped exceeds standard');
      }
      const status = loc.status ? DIM(` [${loc.status}]`) : '';
      const line =
        `  ${stateCode} ${loc.id.padEnd(38)}${fmt(std.cents).padEnd(9)}tipped ${fmt(tip.cents).padEnd(9)}` +
        `(${std.bindingLevel})${status}`;
      if (flags.length) {
        console.log(RED(`${line}  ⚠ ${flags.join('; ')}`));
        suspicious++;
      } else {
        console.log(line);
      }
    } catch (err) {
      console.log(RED(`  ${stateCode} ${loc.id.padEnd(38)}${err instanceof Error ? err.message.slice(0, 60) : err}`));
      suspicious++;
    }
  }
}

console.log(
  `\n${DIM(
    `Checked ${stateFiles.length + territoryFiles.length} states/territories, 4 named regions, ` +
      `${sectoralCount} sectoral rates, and ${localCount} local ordinances at ${CHECK_DATE}. ` +
      `${suspicious} flagged for a closer look.`,
  )}`,
);
console.log(
  DIM(
    '  This measures what the engine produces, not whether every figure is right — the test suite\n' +
      '  (tests/minimum-wage.test.ts) does that, against the sources cited in each data file.\n',
  ),
);

if (suspicious > 0) process.exitCode = 1;
