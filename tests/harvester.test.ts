import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

import { classify, diffRegister, looksLikeParserFailure } from '../harvester/diff.ts';
import type { RateRecord } from '../harvester/diff.ts';
import { hash, writeSnapshot, hasChanged } from '../harvester/snapshot.ts';
import { harvestSource, retroactiveChanges } from '../harvester/harvest.ts';

const HARVESTER = join(import.meta.dirname, '..', 'harvester');

before(() => {
  // Snapshots and review items are stateful on disk; start each run clean.
  rmSync(join(HARVESTER, 'snapshots'), { recursive: true, force: true });
  rmSync(join(HARVESTER, 'review'), { recursive: true, force: true });
});

/** A stand-in for the Ohio municipal rate register: code|name|rate|effective */
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
  title: 'Ohio Dept of Taxation — Municipal Rate Database',
  url: 'https://thefinder.tax.ohio.gov/?tab=fileDownloads',
  jurisdiction: 'OH',
  keyField: 'municipalityCode',
};

const REGISTER_V1 = `
0100|Akron|0.0250|2024-01-01
0200|Bowling Green|0.0200|2023-01-01
0300|Chagrin Falls|0.0175|2022-01-01
0400|Dublin|0.0200|2021-01-01
0500|Elyria|0.0175|2020-01-01
`;

describe('severity classification', () => {
  const asOf = '2026-08-11T00:00:00.000Z';

  test('a rate already in force is retroactive', () => {
    assert.equal(classify('2026-01-01', asOf), 'retroactive');
  });

  test('a rate inside 30 days is imminent', () => {
    assert.equal(classify('2026-08-20', asOf), 'imminent');
  });

  test('a rate months out is merely scheduled', () => {
    assert.equal(classify('2027-01-01', asOf), 'scheduled');
  });

  test('a missing effective date is treated as urgent, not ignored', () => {
    assert.equal(classify(undefined, asOf), 'imminent');
  });
});

describe('register diffing', () => {
  const before = parse(REGISTER_V1);
  const asOf = '2026-08-11T00:00:00.000Z';

  test('identical registers produce no changes', () => {
    const cs = diffRegister('oh', before, parse(REGISTER_V1), asOf);
    assert.equal(cs.hasChanges, false);
    assert.equal(cs.unchangedCount, 5);
  });

  test('detects a single rate change and flags it retroactive', () => {
    const v2 = REGISTER_V1.replace(
      '0300|Chagrin Falls|0.0175|2022-01-01',
      '0300|Chagrin Falls|0.0225|2026-01-01',
    );
    const cs = diffRegister('oh', before, parse(v2), asOf);

    assert.equal(cs.changed.length, 1);
    const [c] = cs.changed;
    assert.equal(c.name, 'Chagrin Falls');
    assert.equal(c.before, 0.0175);
    assert.equal(c.after, 0.0225);
    // Effective 1 Jan, detected in August: every cheque this year was wrong.
    assert.equal(c.severity, 'retroactive');
    assert.equal(retroactiveChanges(cs).length, 1);
  });

  test('detects additions and removals separately from rate moves', () => {
    const v2 = REGISTER_V1.replace('0500|Elyria|0.0175|2020-01-01\n', '') +
      '0600|Fairborn|0.0150|2027-01-01\n';
    const cs = diffRegister('oh', before, parse(v2), asOf);

    assert.equal(cs.removed.length, 1);
    assert.equal(cs.removed[0].name, 'Elyria');
    assert.equal(cs.added.length, 1);
    assert.equal(cs.added[0].name, 'Fairborn');
    assert.equal(cs.changed.length, 0);
  });
});

describe('parser failure guard', () => {
  const asOf = '2026-08-11T00:00:00.000Z';

  /** A register the size of Ohio's, so proportions mean something. */
  const bigRegister = (mutate: (i: number) => number = () => 0.02): RateRecord[] =>
    Array.from({ length: 600 }, (_, i) => ({
      key: String(i).padStart(4, '0'),
      name: `Muni ${i}`,
      rate: mutate(i),
    }));

  test('a mass change is treated as a broken parser, not a tax event', () => {
    const before = bigRegister();
    const garbled = bigRegister(() => 0.9999); // every rate "moved"
    const cs = diffRegister('oh', before, garbled, asOf);
    assert.equal(
      looksLikeParserFailure(cs, garbled.length, { baselineCount: before.length }),
      true,
    );
  });

  test('one change in a large register is not a parser failure', () => {
    const before = bigRegister();
    const after = bigRegister((i) => (i === 42 ? 0.0225 : 0.02));
    const cs = diffRegister('oh', before, after, asOf);
    assert.equal(cs.changed.length, 1);
    assert.equal(
      looksLikeParserFailure(cs, after.length, { baselineCount: before.length }),
      false,
    );
  });

  test('one change in a tiny register is not a parser failure either', () => {
    // A single row is 20% of a five-row register. A proportion-only guard
    // would block this legitimate change; the absolute floor prevents that.
    const before = parse(REGISTER_V1);
    const after = parse(REGISTER_V1.replace('0.0250', '0.0275'));
    const cs = diffRegister('oh', before, after, asOf);
    assert.equal(
      looksLikeParserFailure(cs, after.length, { baselineCount: before.length }),
      false,
    );
  });

  test('an empty parse never counts as "everything was deleted"', () => {
    const before = parse(REGISTER_V1);
    const cs = diffRegister('oh', before, [], asOf);
    assert.equal(looksLikeParserFailure(cs, 0, { baselineCount: before.length }), true);
  });

  test('bootstrapping from no baseline is expected, not suspicious', () => {
    const after = parse(REGISTER_V1);
    const cs = diffRegister('oh', [], after, asOf);
    assert.equal(cs.added.length, 5);
    assert.equal(looksLikeParserFailure(cs, after.length, { baselineCount: 0 }), false);
  });

  test('but an empty first parse is still a failure', () => {
    const cs = diffRegister('oh', [], [], asOf);
    assert.equal(looksLikeParserFailure(cs, 0, { baselineCount: 0 }), true);
  });
});

describe('snapshots', () => {
  test('identical content is not re-stored', () => {
    const a = writeSnapshot('test-src', 'hello', '2026-08-11T00:00:00.000Z');
    const b = writeSnapshot('test-src', 'hello', '2026-08-12T00:00:00.000Z');
    assert.equal(a.path, b.path);
    assert.equal(a.sha256, hash('hello'));
  });

  test('hasChanged reports true only on genuinely new content', () => {
    writeSnapshot('test-src2', 'v1', '2026-08-11T00:00:00.000Z');
    assert.equal(hasChanged('test-src2', 'v1'), false);
    assert.equal(hasChanged('test-src2', 'v2'), true);
  });

  test('an unseen source always counts as changed', () => {
    assert.equal(hasChanged('never-seen', 'anything'), true);
  });
});

describe('harvest decisions', () => {
  const asOf = '2026-08-11T00:00:00.000Z';

  test('first sight of a register queues it for review, never auto-publishes', () => {
    const r = harvestSource({ ...SOURCE, id: 'h1' }, REGISTER_V1, parse, [], asOf);
    assert.equal(r.decision, 'needs_review');
    assert.ok(r.reviewPath);
  });

  test('a re-fetch of identical bytes is a no-op', () => {
    harvestSource({ ...SOURCE, id: 'h2' }, REGISTER_V1, parse, [], asOf);
    const again = harvestSource({ ...SOURCE, id: 'h2' }, REGISTER_V1, parse, parse(REGISTER_V1), asOf);
    assert.equal(again.decision, 'unchanged');
    assert.equal(again.reviewPath, null);
  });

  test('cosmetic byte changes with no rate movement do not raise a review', () => {
    harvestSource({ ...SOURCE, id: 'h3' }, REGISTER_V1, parse, [], asOf);
    const withComment = `# regenerated 2026-08-12\n${REGISTER_V1}`;
    const r = harvestSource(
      { ...SOURCE, id: 'h3' },
      withComment,
      parse,
      parse(REGISTER_V1),
      asOf,
    );
    assert.equal(r.decision, 'unchanged');
    assert.match(r.message, /no rates moved/);
  });

  test('a real rate change queues a review and publishes nothing', () => {
    harvestSource({ ...SOURCE, id: 'h4' }, REGISTER_V1, parse, [], asOf);
    const v2 = REGISTER_V1.replace('0.0175|2022-01-01', '0.0225|2026-01-01');
    const r = harvestSource({ ...SOURCE, id: 'h4' }, v2, parse, parse(REGISTER_V1), asOf);

    assert.equal(r.decision, 'needs_review');
    assert.equal(r.changeSet?.changed.length, 1);
    assert.equal(retroactiveChanges(r.changeSet!).length, 1);
  });

  test('a garbled source is blocked rather than reviewed', () => {
    harvestSource({ ...SOURCE, id: 'h5' }, REGISTER_V1, parse, [], asOf);
    const garbage = REGISTER_V1.replace(/0\.0\d+/g, '0.9999');
    const r = harvestSource({ ...SOURCE, id: 'h5' }, garbage, parse, parse(REGISTER_V1), asOf);

    assert.equal(r.decision, 'blocked_suspect_parser');
    assert.match(r.message, /worse than being stale/);
  });
});
