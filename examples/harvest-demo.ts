import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { harvestSource, retroactiveChanges } from '../harvester/harvest.ts';
import type { RateRecord } from '../harvester/diff.ts';

/**
 * The scenario: a village in Ohio quietly raised its income tax rate
 * effective 1 January. Nobody told you. It is now 11 August.
 */

rmSync(join(import.meta.dirname, '..', 'harvester', 'snapshots'), {
  recursive: true,
  force: true,
});

const parse = (raw: string): RateRecord[] =>
  raw
    .trim()
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .map((line) => {
      const [key, name, rate, effectiveFrom] = line.split('|');
      return { key, name, rate: Number(rate), effectiveFrom: effectiveFrom || undefined };
    });

const SOURCE = {
  id: 'oh-municipal-rates',
  title: 'Ohio Dept of Taxation — Municipal Income Tax Rate Database',
  url: 'https://thefinder.tax.ohio.gov/?tab=fileDownloads',
  jurisdiction: 'OH',
};

const JANUARY = `
0100|Akron|0.0250|2024-01-01
0200|Bowling Green|0.0200|2023-01-01
0300|Chagrin Falls|0.0175|2022-01-01
0400|Dublin|0.0200|2021-01-01
0500|Elyria|0.0175|2020-01-01
`;

// The state register now reflects the village's ordinance. Note the effective
// date: 1 January. It has been wrong for seven months.
const AUGUST = `
0100|Akron|0.0250|2024-01-01
0200|Bowling Green|0.0200|2023-01-01
0300|Chagrin Falls|0.0225|2026-01-01
0400|Dublin|0.0200|2021-01-01
0500|Elyria|0.0175|2020-01-01
`;

const asOf = '2026-08-11T09:00:00.000Z';
const rule = (s: string) => console.log(`\n\x1b[2m${'─'.repeat(66)}\x1b[0m\n  ${s}\n`);

rule('RUN 1 — bootstrap, nothing published yet');
const r1 = harvestSource(SOURCE, JANUARY, parse, [], asOf);
console.log(`  decision: ${r1.decision}`);
console.log(`  ${r1.message.split('\n')[0]}`);

rule('RUN 2 — next morning, register untouched');
const r2 = harvestSource(SOURCE, JANUARY, parse, parse(JANUARY), asOf);
console.log(`  decision: ${r2.decision}`);
console.log(`  ${r2.message}`);
console.log(`  \x1b[2m(hash matched — no parse, no diff, no alert)\x1b[0m`);

rule('RUN 3 — the village ordinance lands in the state register');
const r3 = harvestSource(SOURCE, AUGUST, parse, parse(JANUARY), asOf);
console.log(`  decision: ${r3.decision}`);
console.log(r3.message.split('\n').map((l) => `  ${l}`).join('\n'));

const retro = retroactiveChanges(r3.changeSet!);
if (retro.length) {
  console.log(`\n  \x1b[31m▲ ${retro.length} rate change already in force.\x1b[0m`);
  for (const c of retro) {
    const days = Math.floor(
      (Date.parse(asOf) - Date.parse(c.effectiveFrom!)) / 86_400_000,
    );
    console.log(
      `    ${c.name}: effective ${c.effectiveFrom}, ${days} days ago.\n` +
        `    Every cheque withheld at ${(c.before * 100).toFixed(2)}% instead of ` +
        `${(c.after * 100).toFixed(2)}% needs a correction run.`,
    );
  }
}
console.log(`\n  Queued for review: \x1b[36m${r3.reviewPath?.split(/[\\/]/).pop()}\x1b[0m`);
console.log(`  \x1b[2mNothing has been published to data/. A human approves first.\x1b[0m`);

rule('RUN 4 — the state reformats its file and the parser breaks');
const GARBLED = AUGUST.replace(/0\.0\d+/g, '0.9999');
const r4 = harvestSource(SOURCE, GARBLED, parse, parse(AUGUST), asOf);
console.log(`  decision: \x1b[31m${r4.decision}\x1b[0m`);
console.log(`  ${r4.message}`);

console.log(
  `\n  \x1b[2mThe engine never saw the network in any of this. It reads` +
    `\n  approved, versioned files, so last March's cheque still recomputes\n  to last March's answer.\x1b[0m\n`,
);
