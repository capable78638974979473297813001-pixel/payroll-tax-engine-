import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { minimumWage, localMinimumWages } from '../src/minimum-wage.ts';
import {
  federalMinimumWageRuleset,
  stateMinimumWageRuleset,
  localMinimumWageRuleset,
  sectoralMinimumWageRuleset,
} from '../src/registry.ts';

/**
 * Every expected figure below was read off a published source BEFORE the
 * code ran — DOL's own state and tipped tables, or the jurisdiction's own
 * page — and each is cited in the data file it tests. The point of these
 * tests is not that the arithmetic works (there is barely any); it is that
 * the DATA has not rotted and that the highest-applicable rule is applied
 * across all three levels rather than any one of them being read alone.
 */

const DATA_ROOT = join(import.meta.dirname, '..', 'data', 'minimum-wage');
// A date safely AFTER every mid-2026 July 1 step this database models
// (Alaska, DC, Oregon, Chicago, Cook County, several Maryland and
// California local ordinances) — a date-agnostic "any 2026 date" no
// longer exists once a database tracks historicalPredecessorOf figures;
// tests that specifically probe the BEFORE side of a mid-year step use
// their own explicit earlier date instead (e.g. Renton, Saint Paul, and
// the historicalPredecessorOf tests below).
const D = '2026-08-15';

function everyFile(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name.endsWith('.json')) out.push(full);
    }
  };
  walk(DATA_ROOT);
  return out;
}

function everyAmount(node: unknown, out: { hourly: number; hourlyCents: number }[] = []) {
  if (Array.isArray(node)) {
    for (const x of node) everyAmount(x, out);
  } else if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    if (typeof o.hourly === 'number' && typeof o.hourlyCents === 'number') {
      out.push({ hourly: o.hourly, hourlyCents: o.hourlyCents });
    }
    for (const v of Object.values(o)) everyAmount(v, out);
  }
  return out;
}

describe('minimum wage data integrity', () => {
  test('every file parses and carries a source trail', () => {
    const files = everyFile();
    assert.ok(files.length >= 60, `expected the full database, found ${files.length} files`);
    for (const f of files) {
      const parsed = JSON.parse(readFileSync(f, 'utf8')) as Record<string, unknown>;
      assert.equal(parsed.year, 2026, `${f} is not a 2026 ruleset`);
      const hasOwnSources = Array.isArray(parsed.sources) && parsed.sources.length > 0;
      const hasPerEntrySources =
        Array.isArray(parsed.jurisdictions) &&
        (parsed.jurisdictions as Record<string, unknown>[]).every(
          (j) => Array.isArray(j.sources) && (j.sources as unknown[]).length > 0,
        );
      assert.ok(hasOwnSources || hasPerEntrySources, `${f} carries no sources`);
    }
  });

  test('dollars and cents never disagree, anywhere in the database', () => {
    // The engine computes in cents; the decimal figure exists so a human
    // reading the file sees what the jurisdiction publishes. A drift
    // between the two is exactly the kind of silent error this catches.
    for (const f of everyFile()) {
      for (const a of everyAmount(JSON.parse(readFileSync(f, 'utf8')))) {
        assert.ok(
          Math.abs(a.hourly * 100 - a.hourlyCents) < 1e-6,
          `${f}: $${a.hourly} vs ${a.hourlyCents} cents`,
        );
      }
    }
  });

  test('no variants array anywhere contains two entries with the same id', () => {
    // Found live: the AK and DC predecessor entries this file's own
    // pred() generator wrote were both auto-named from effectiveTo alone
    // (identical for the standard and tipped entries), producing two
    // variants sharing one id in the same array. Not a resolution bug —
    // historicalPredecessor() keys off historicalPredecessorOf, never id —
    // but a duplicate id is exactly the kind of thing that silently breaks
    // some FUTURE id-based lookup nobody has written yet, so it's asserted
    // against now rather than left to be rediscovered by hand again.
    const walk = (node: unknown, path: string) => {
      if (Array.isArray(node)) {
        node.forEach((n, i) => walk(n, `${path}[${i}]`));
      } else if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>;
        if (Array.isArray(o.variants)) {
          const ids = (o.variants as Record<string, unknown>[])
            .map((v) => v.id)
            .filter((id): id is string => typeof id === 'string');
          const seen = new Set<string>();
          for (const id of ids) {
            assert.ok(!seen.has(id), `${path}.variants has a duplicate id: '${id}'`);
            seen.add(id);
          }
        }
        for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
      }
    };
    for (const f of everyFile()) walk(JSON.parse(readFileSync(f, 'utf8')), f);
  });

  test('every local file has unique jurisdiction ids and names, so findLocality() never guesses', () => {
    for (const f of readdirSync(join(DATA_ROOT, 'local')).filter((n) => n.endsWith('.json'))) {
      const full = join(DATA_ROOT, 'local', f);
      const d = JSON.parse(readFileSync(full, 'utf8')) as {
        jurisdictions: { id: string; name: string }[];
      };
      const ids = d.jurisdictions.map((j) => j.id);
      const names = d.jurisdictions.map((j) => j.name.toLowerCase());
      assert.equal(new Set(ids).size, ids.length, `${f} has a duplicate jurisdiction id`);
      assert.equal(new Set(names).size, names.length, `${f} has a duplicate jurisdiction name`);
    }
  });

  test('a "not covered" variant never carries a numeric rate that could be mistaken for a real one', () => {
    for (const f of readdirSync(join(DATA_ROOT, 'local')).filter((n) => n.endsWith('.json'))) {
      const d = JSON.parse(readFileSync(join(DATA_ROOT, 'local', f), 'utf8')) as {
        jurisdictions: { id: string; variants?: Record<string, unknown>[] }[];
      };
      for (const j of d.jurisdictions) {
        for (const v of j.variants ?? []) {
          if (v.notCovered) {
            assert.equal(v.hourly, null, `${f}/${j.id}: a notCovered variant must not carry a real rate`);
            assert.equal(v.hourlyCents, null, `${f}/${j.id}: a notCovered variant must not carry a real rate`);
          }
        }
      }
    }
  });

  test('every source cited anywhere carries a title, url and verifiedOn', () => {
    for (const f of everyFile()) {
      const d = JSON.parse(readFileSync(f, 'utf8')) as {
        sources?: Record<string, unknown>[];
        jurisdictions?: { id: string; sources?: Record<string, unknown>[] }[];
      };
      const checkAll = (sources: Record<string, unknown>[] | undefined, where: string) => {
        for (const s of sources ?? []) {
          for (const key of ['title', 'url', 'verifiedOn']) {
            assert.ok(s[key], `${where} carries a source missing '${key}': ${JSON.stringify(s).slice(0, 80)}`);
          }
        }
      };
      checkAll(d.sources, f);
      for (const j of d.jurisdictions ?? []) checkAll(j.sources, `${f}/${j.id}`);
    }
  });

  test('all 50 states, DC and 5 territories are present', () => {
    const states = readdirSync(join(DATA_ROOT, 'states')).filter((f) => f.endsWith('.json'));
    assert.equal(states.length, 51, 'expected 50 states + DC');
    const territories = readdirSync(join(DATA_ROOT, 'territories')).filter((f) =>
      f.endsWith('.json'),
    );
    assert.equal(territories.length, 5, 'expected PR, VI, GU, AS and CNMI');
    for (const code of ['AL', 'CA', 'NY', 'TX', 'WY', 'DC']) {
      assert.equal(stateMinimumWageRuleset(code, D).jurisdiction.code, code);
    }
  });

  test('no state ruleset falls below the federal floor without saying why', () => {
    const federal = federalMinimumWageRuleset(D).standard.hourlyCents;
    const states = readdirSync(join(DATA_ROOT, 'states'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, 2));
    for (const code of states) {
      const s = stateMinimumWageRuleset(code, D);
      assert.ok(s.standard, `${code} has no standard rate`);
      assert.ok(
        s.standard!.hourlyCents >= federal,
        `${code}'s standard rate is below the federal floor`,
      );
      // Georgia and Wyoming DO enact a lower figure ($5.15). It is carried
      // in its own field precisely so it can never be mistaken for the
      // rate a covered employer owes.
      if (['GA', 'WY'].includes(code)) {
        const statutory = s.stateStatutoryRate as { hourlyCents: number } | undefined;
        assert.equal(statutory?.hourlyCents, 515, `${code} should carry its own $5.15 statute`);
      }
    }
  });
});

describe('federal minimum wage', () => {
  test('the FLSA floor, its tipped cash wage and its youth wage', () => {
    const fed = federalMinimumWageRuleset(D);
    assert.equal(fed.standard.hourlyCents, 725);
    assert.equal(fed.tipped.cashWageCents, 213);
    assert.equal(fed.tipped.maxTipCreditCents, 512);
    assert.equal(fed.youthAndTraining[0]!.hourlyCents, 425);
  });

  test('Executive Order 14026 is carried as REVOKED, not as a live rate', () => {
    // The trap this is here to catch: a 2025 table still applying $17.75 to
    // federal contractors. EO 14026 was revoked on 2025-03-14 and covered
    // older contracts fell back to EO 13658's much lower figure.
    const other = federalMinimumWageRuleset(D).otherFederalMinimums as Record<
      string,
      Record<string, unknown>
    >;
    assert.equal(other.executiveOrder14026!.status, 'REVOKED');
    assert.equal(other.executiveOrder13658!.hourlyCents, 1365);
    assert.equal(other.executiveOrder13658!.effectiveFrom, '2026-05-11');
  });
});

describe('state minimum wages', () => {
  test('the five states with no minimum wage law of their own', () => {
    for (const code of ['AL', 'LA', 'MS', 'SC', 'TN']) {
      const s = stateMinimumWageRuleset(code, D);
      assert.equal(s.hasStateMinimumWage, false);
      assert.equal(s.standard!.hourlyCents, 725);
    }
  });

  test('published 2026 standard rates match DOL’s own table', () => {
    const expected: Record<string, number> = {
      AK: 1400, AZ: 1515, AR: 1100, CA: 1690, CO: 1516, CT: 1694, DE: 1500,
      DC: 1840, FL: 1400, HI: 1600, IL: 1500, ME: 1510, MD: 1500, MA: 1500,
      MI: 1373, MN: 1141, MO: 1500, MT: 1085, NE: 1500, NV: 1200, NJ: 1592,
      NM: 1200, NY: 1600, OH: 1100, OR: 1555, RI: 1600, SD: 1185, VT: 1442,
      VA: 1277, WA: 1713, WV: 875,
    };
    for (const [code, cents] of Object.entries(expected)) {
      assert.equal(
        stateMinimumWageRuleset(code, D).standard!.hourlyCents,
        cents,
        `${code} standard rate`,
      );
    }
  });

  test('tipped cash wages, including the jurisdictions that allow no tip credit', () => {
    const noTipCredit = ['AK', 'CA', 'MN', 'MT', 'NV', 'OR', 'WA'];
    for (const code of noTipCredit) {
      const s = stateMinimumWageRuleset(code, D);
      assert.equal(s.tipped.tipCreditAllowed, false, `${code} should allow no tip credit`);
      assert.equal(
        s.tipped.cashWageCents,
        s.standard!.hourlyCents,
        `${code}'s cash wage must equal its full rate`,
      );
    }
    assert.equal(stateMinimumWageRuleset('NE', D).tipped.cashWageCents, 213);
    assert.equal(stateMinimumWageRuleset('NE', D).tipped.maxTipCreditCents, 1287);
    assert.equal(stateMinimumWageRuleset('DC', D).tipped.cashWageCents, 1030);
  });

  test('South Dakota’s tipped wage is carried to the half cent its own DLR publishes', () => {
    // DOL's federal table rounds this to $5.93; South Dakota publishes
    // $5.925, exactly half of $11.85. Rounding down would underpay.
    const sd = stateMinimumWageRuleset('SD', D);
    assert.equal(sd.tipped.cashWageCents, 592.5);
    assert.equal(sd.tipped.cashWageCents * 2, sd.standard!.hourlyCents);
  });

  test('New York carries both regional rates and all four tipped figures', () => {
    const ny = stateMinimumWageRuleset('NY', D);
    assert.equal(ny.standard!.hourlyCents, 1600);
    const byId = Object.fromEntries((ny.variants ?? []).map((v) => [v.id, v.hourlyCents]));
    assert.equal(byId.downstate, 1700);
    assert.equal(byId.downstate_food_service, 1135);
    assert.equal(byId.downstate_service_employee, 1415);
    assert.equal(byId.upstate_service_employee, 1330);
    assert.equal(ny.tipped.cashWageCents, 1070);
  });

  test('Oregon’s three geographic rates are state law, not local ordinances', () => {
    const or = stateMinimumWageRuleset('OR', D);
    assert.equal(or.standard!.hourlyCents, 1555);
    const byId = Object.fromEntries((or.variants ?? []).map((v) => [v.id, v.hourlyCents]));
    assert.equal(byId.portland_metro, 1680);
    assert.equal(byId.nonurban, 1455);
    assert.equal(localMinimumWages('OR', D).length, 0);
  });

  test('minimumWage() actually resolves New York’s and Oregon’s named regions, not just the baseline', () => {
    // Both states store their regional split as a plain `variants` array
    // with no employer-size test — selectTier()'s employeeCount-based tier
    // logic never picks these, so without an explicit region query
    // minimumWage() silently returns the same figure for a Manhattan
    // employee as a Buffalo one. This is what actually asking for the
    // region looks like, and it must return the higher, correct figure.
    assert.equal(
      minimumWage({ checkDate: D, state: 'NY', region: 'downstate' }).cents,
      1700,
    );
    assert.equal(minimumWage({ checkDate: D, state: 'NY' }).cents, 1600, 'no region = baseline');
    assert.equal(
      minimumWage({ checkDate: D, state: 'OR', region: 'portland_metro' }).cents,
      1680,
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'OR', region: 'nonurban' }).cents,
      1455,
    );
    // Case-insensitive, matching every other name lookup in this module.
    assert.equal(
      minimumWage({ checkDate: D, state: 'NY', region: 'DOWNSTATE' }).cents,
      1700,
    );
  });

  test('New York’s tipped occupation split resolves correctly in every direction', () => {
    // Downstate has two DIFFERENTLY-credited occupation categories; upstate
    // has only one variant (service_employee) because upstate FOOD SERVICE
    // is the state's own baseline tipped rate, not a separate variant. A
    // naive "one variant per region" resolver would get the upstate
    // food-service case wrong by returning the service_employee figure.
    assert.equal(
      minimumWage({ checkDate: D, state: 'NY', region: 'downstate', tipped: true }).cents,
      1135,
      'no occupation given -> defaults to food_service, the larger category',
    );
    assert.equal(
      minimumWage({
        checkDate: D, state: 'NY', region: 'downstate', tipped: true, occupation: 'service_employee',
      }).cents,
      1415,
    );
    assert.equal(
      minimumWage({
        checkDate: D, state: 'NY', region: 'upstate', tipped: true, occupation: 'service_employee',
      }).cents,
      1330,
    );
    assert.equal(
      minimumWage({
        checkDate: D, state: 'NY', region: 'upstate', tipped: true, occupation: 'food_service',
      }).cents,
      1070,
      'upstate has no food_service VARIANT because the baseline tipped rate already IS that figure',
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'NY', region: 'upstate', tipped: true }).cents,
      1070,
      'same result with no occupation specified at all',
    );

    // The ambiguous-default case surfaces a caveat rather than hiding the assumption.
    const defaulted = minimumWage({ checkDate: D, state: 'NY', region: 'downstate', tipped: true });
    assert.match(defaulted.considered.find((c) => c.level === 'state')!.caveat ?? '', /defaulted to/);
  });

  test('Oregon’s regional tipped floor is the REGION’s own rate, not the statewide one', () => {
    // Found by the coverage script (examples/minimum-wage-coverage.ts),
    // not by inspection: Oregon tags portland_metro/nonurban as STANDARD
    // overrides only (it has no distinct tipped figure for either, since
    // it bans tip credit everywhere) — before this fix, a tipped query
    // for a region fell through all the way to the generic statewide
    // tipped rate ($15.55) instead of that region's OWN standard rate,
    // silently returning the SAME number for Portland metro and
    // non-urban Oregon despite them being $2.25 apart. Exactly the same
    // failure shape as Washington's local-ordinance tipped bug, just one
    // level up (state regions rather than local ordinances).
    assert.equal(
      minimumWage({ checkDate: D, state: 'OR', region: 'portland_metro', tipped: true }).cents,
      1680,
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'OR', region: 'nonurban', tipped: true }).cents,
      1455,
    );
    // Occupation is meaningless here (Oregon has no occupation split) —
    // passing one must not change the answer or throw.
    assert.equal(
      minimumWage({
        checkDate: D, state: 'OR', region: 'portland_metro', tipped: true, occupation: 'service_employee',
      }).cents,
      1680,
    );
    // And the fix must compose with the historical-predecessor axis too:
    // Portland metro's own PRIOR tipped floor, not the state's.
    assert.equal(
      minimumWage({
        checkDate: '2026-03-01', state: 'OR', region: 'portland_metro', tipped: true,
      }).cents,
      1630,
    );
  });

  test('a region string is ignored, with a caveat, for a state that has none', () => {
    const answer = minimumWage({ checkDate: D, state: 'CA', region: 'los_angeles' });
    assert.equal(answer.cents, 1690); // California's ordinary state rate, unaffected
    assert.match(
      answer.considered.find((c) => c.level === 'state')!.caveat ?? '',
      /no named regions/,
    );
  });

  test('the two live sub-federal state rates are carried as variants, not as the rate', () => {
    // Montana's $4.00 and Oklahoma's $2.00 bind only where the FLSA does
    // not reach the employer at all. Storing either as the STANDARD rate
    // would underpay every ordinary employee in those states.
    const mt = stateMinimumWageRuleset('MT', D);
    assert.equal(mt.standard!.hourlyCents, 1085);
    assert.equal(mt.variants!.find((v) => v.id === 'small_business_not_flsa_covered')!.hourlyCents, 400);
    const ok = stateMinimumWageRuleset('OK', D);
    assert.equal(ok.standard!.hourlyCents, 725);
    assert.equal(ok.variants!.find((v) => v.id === 'very_small_employer')!.hourlyCents, 200);
  });
});

describe('territories', () => {
  test('American Samoa has 18 industry rates and no single minimum wage', () => {
    const as = stateMinimumWageRuleset('AS', D);
    assert.equal(as.standard, null);
    assert.equal(as.industryRates!.length, 18);
    const byId = Object.fromEntries(as.industryRates!.map((r) => [r.id, r.hourlyCents]));
    assert.equal(byId.garment, 578); // lowest
    assert.equal(byId.shipping_a, 719); // highest
    for (const r of as.industryRates!) {
      assert.ok(r.hourlyCents < 725, `${r.id} should be below the federal floor`);
    }
  });

  test('a query against American Samoa refuses to invent a single rate', () => {
    const answer = minimumWage({ checkDate: D, state: 'AS' });
    const state = answer.considered.find((c) => c.level === 'state')!;
    assert.equal(state.cents, undefined);
    assert.match(state.caveat!, /18 industry-specific/);
    // The federal $7.25 is the only figure left standing, and the caveat
    // is what stops a caller from believing it.
    assert.equal(answer.bindingLevel, 'federal');
  });

  test('the other four territories', () => {
    assert.equal(stateMinimumWageRuleset('PR', D).standard!.hourlyCents, 1050);
    assert.equal(stateMinimumWageRuleset('VI', D).standard!.hourlyCents, 1050);
    assert.equal(stateMinimumWageRuleset('GU', D).standard!.hourlyCents, 925);
    assert.equal(stateMinimumWageRuleset('MP', D).standard!.hourlyCents, 725);
    assert.equal(stateMinimumWageRuleset('GU', D).tipped.tipCreditAllowed, false);
  });
});

describe('local minimum wages', () => {
  test('every researched ordinance is present and above its own state rate where it should be', () => {
    const counts: Record<string, number> = {
      AZ: 2, CA: 40, CO: 4, IL: 2, MD: 2, ME: 2, MN: 2, NE: 2, NM: 5, WA: 8,
    };
    let total = 0;
    for (const [state, n] of Object.entries(counts)) {
      const locals = localMinimumWages(state, D);
      assert.equal(locals.length, n, `${state} ordinance count`);
      total += n;
    }
    assert.equal(total, 69);
  });

  test('Washington’s local rates, tiers and mid-year steps', () => {
    const wa = Object.fromEntries(localMinimumWages('WA', D).map((j) => [j.id, j]));
    assert.equal(wa.seattle!.hourlyCents, 2130);
    assert.equal(wa.tukwila!.hourlyCents, 2165);
    assert.equal(wa.burien!.hourlyCents, 2163);
    assert.equal(wa.bellingham!.hourlyCents, 1913);
    assert.equal(wa.seatac!.hourlyCents, 2074);
    // Renton's mid-size tier steps UP on July 1 — the single most common
    // way a Washington payroll run goes wrong mid-year.
    const h1 = wa.renton!.variants!.find((v) => v.id === 'midsize_h1')!;
    const h2 = wa.renton!.variants!.find((v) => v.id === 'midsize_h2')!;
    assert.equal(h1.hourlyCents, 2057);
    assert.equal(h2.hourlyCents, 2157);
    assert.equal(h1.effectiveTo, '2026-06-30');
  });

  test('a mid-size Renton employer gets the July rate in July and the January rate in January', () => {
    const june = minimumWage({
      checkDate: '2026-06-15', state: 'WA', locality: 'renton', employeeCount: 200,
    });
    assert.equal(june.cents, 2057);
    const august = minimumWage({
      checkDate: '2026-08-15', state: 'WA', locality: 'renton', employeeCount: 200,
    });
    assert.equal(august.cents, 2157);
  });

  test('states and localities whose CURRENT rate took effect mid-2026 correctly answer for earlier 2026 dates too', () => {
    // A systemic version of the Saint Paul gap above, caught by auditing
    // every jurisdiction whose headline figure took effect after January 1
    // of its own year: Alaska, DC, Oregon (state + both its regions),
    // Chicago, Cook County and nine of California's ten July-cycle cities
    // all stepped on 2026-07-01, and this file's FIRST draft only recorded
    // the post-step figure — silently wrong for any January-June 2026
    // checkDate. historicalPredecessorOf entries fix this without changing
    // any of the "current" answers already covered elsewhere in this file.
    const jan = '2026-03-01';
    assert.equal(minimumWage({ checkDate: jan, state: 'AK' }).cents, 1300);
    assert.equal(minimumWage({ checkDate: jan, state: 'AK', tipped: true }).cents, 1300);
    assert.equal(minimumWage({ checkDate: jan, state: 'DC' }).cents, 1795);
    assert.equal(minimumWage({ checkDate: jan, state: 'DC', tipped: true }).cents, 1000);
    assert.equal(minimumWage({ checkDate: jan, state: 'OR' }).cents, 1505);
    assert.equal(minimumWage({ checkDate: jan, state: 'OR', region: 'portland_metro' }).cents, 1630);
    assert.equal(minimumWage({ checkDate: jan, state: 'OR', region: 'nonurban' }).cents, 1405);
    assert.equal(minimumWage({ checkDate: jan, state: 'OR', tipped: true }).cents, 1505);
    assert.equal(minimumWage({ checkDate: jan, state: 'IL', locality: 'chicago' }).cents, 1660);
    assert.equal(minimumWage({ checkDate: jan, state: 'IL', locality: 'chicago', tipped: true }).cents, 1262);
    assert.equal(minimumWage({ checkDate: jan, state: 'IL', locality: 'cook_county' }).cents, 1500);
    assert.equal(minimumWage({ checkDate: jan, state: 'CA', locality: 'los_angeles' }).cents, 1787);
    assert.equal(minimumWage({ checkDate: jan, state: 'CA', locality: 'san_francisco' }).cents, 1918);
    // California never allows a tip credit, so the July-cycle cities'
    // predecessor figure must also win a TIPPED query for that period.
    assert.equal(
      minimumWage({ checkDate: jan, state: 'CA', locality: 'los_angeles', tipped: true }).cents,
      1787,
    );
    // And the "current" (post-step) answers, at this file's own D, are
    // untouched by any of the above.
    assert.equal(minimumWage({ checkDate: D, state: 'AK' }).cents, 1400);
    assert.equal(minimumWage({ checkDate: D, state: 'IL', locality: 'chicago' }).cents, 1705);
  });

  test('Malibu’s one-year-suspended rate was flat for TWO full years, not one', () => {
    // Malibu's city council suspended its scheduled increase, holding the
    // rate at $17.27 through both the July 2024 AND July 2025 steps —
    // caught only because the predecessor figure was researched
    // specifically, rather than assumed to follow the same one-year
    // cadence as every other California July-cycle city.
    assert.equal(minimumWage({ checkDate: '2026-03-01', state: 'CA', locality: 'malibu' }).cents, 1727);
    assert.equal(minimumWage({ checkDate: '2026-06-15', state: 'CA', locality: 'malibu' }).cents, 1727);
    assert.equal(minimumWage({ checkDate: D, state: 'CA', locality: 'malibu' }).cents, 1791);
  });

  test('unincorporated LA County and Santa Fe also needed their own prior-period figures', () => {
    // A systematic re-audit after the fixes above found two more the same
    // sweep had missed: LA County's own July-cycle step (distinct from the
    // ten CITY entries already fixed) and Santa Fe's March 1 cycle, which
    // no other jurisdiction in this database shares.
    assert.equal(
      minimumWage({ checkDate: '2026-03-01', state: 'CA', locality: 'los_angeles_county_unincorporated' }).cents,
      1781,
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'CA', locality: 'los_angeles_county_unincorporated' }).cents,
      1847,
    );
    assert.equal(
      minimumWage({ checkDate: '2026-02-01', state: 'NM', locality: 'santa_fe_city' }).cents,
      1500,
    );
    assert.equal(minimumWage({ checkDate: D, state: 'NM', locality: 'santa_fe_city' }).cents, 1540);
    assert.equal(
      minimumWage({ checkDate: '2026-02-01', state: 'NM', locality: 'santa_fe_county', tipped: true }).cents,
      450,
      'the county has its own tipped figure, distinct from the city\'s tip-counting-only rule',
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'NM', locality: 'santa_fe_county', tipped: true }).cents,
      462,
    );
  });

  test('Montgomery and Howard Counties MD stepped mid-2026 across EVERY employer-size tier at once', () => {
    const jan = '2026-03-01';
    assert.equal(
      minimumWage({ checkDate: jan, state: 'MD', locality: 'montgomery_county', employeeCount: 100 }).cents,
      1765,
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'MD', locality: 'montgomery_county', employeeCount: 100 }).cents,
      1800,
    );
    assert.equal(
      minimumWage({ checkDate: jan, state: 'MD', locality: 'montgomery_county', employeeCount: 20 }).cents,
      1600,
    );
    assert.equal(
      minimumWage({ checkDate: jan, state: 'MD', locality: 'montgomery_county', employeeCount: 5 }).cents,
      1550,
    );
    // Howard County had TWO tiers through June 2026 and unified to one in July.
    assert.equal(
      minimumWage({ checkDate: jan, state: 'MD', locality: 'howard_county', employeeCount: 5 }).cents,
      1550,
    );
    assert.equal(
      minimumWage({ checkDate: jan, state: 'MD', locality: 'howard_county', employeeCount: 50 }).cents,
      1600,
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'MD', locality: 'howard_county', employeeCount: 5 }).cents,
      1600,
      'unified to one rate for everyone from 2026-07-01',
    );
  });

  test('Saint Paul’s small and micro tiers also step mid-year, in both directions', () => {
    // A gap this closes: the first draft of this file recorded only the
    // POST-July-2026 small/micro figures (matching what's live on this
    // file's own asOf date), even though the pre-July figures were already
    // sitting in this same file's own prose the whole time. A checkDate
    // query before July 1 would have wrongly fallen through to the
    // macro/large rate for a small or micro employer instead of the true,
    // lower figure they actually owed.
    const smallJune = minimumWage({
      checkDate: '2026-06-15', state: 'MN', locality: 'saint_paul', employeeCount: 50,
    });
    assert.equal(smallJune.cents, 1500);
    const smallAugust = minimumWage({
      checkDate: '2026-08-15', state: 'MN', locality: 'saint_paul', employeeCount: 50,
    });
    assert.equal(smallAugust.cents, 1637);
    const microJune = minimumWage({
      checkDate: '2026-06-15', state: 'MN', locality: 'saint_paul', employeeCount: 3,
    });
    assert.equal(microJune.cents, 1325);
    const microAugust = minimumWage({
      checkDate: '2026-08-15', state: 'MN', locality: 'saint_paul', employeeCount: 3,
    });
    assert.equal(microAugust.cents, 1425);
  });

  test('an employer below a local size threshold falls back to the state rate', () => {
    // Burien does not reach employers with 20 or fewer employees at all —
    // they owe Washington's $17.13, not Burien's $21.63.
    const answer = minimumWage({
      checkDate: D, state: 'WA', locality: 'burien', employeeCount: 5,
    });
    assert.equal(answer.cents, 1713);
    assert.equal(answer.bindingLevel, 'state');
    assert.match(answer.considered.find((c) => c.level === 'local')!.basis, /not covered/);
  });

  test('Washington’s local ordinances have no tipped block, but a tipped query still returns the FULL local rate', () => {
    // A real bug this locks in: none of Washington's 8 local ordinance
    // files publish a separate `tipped` figure, because Washington bans
    // tip credits statewide and every local rate is already a full-cash
    // floor. The naive reading of "no tipped block" is "fall back to the
    // state's $17.13" — which was this resolver's actual behavior until
    // fixed, silently underpaying every tipped worker in every WA city by
    // the gap between the state and local rate (up to $4.52/hr in Tukwila).
    assert.equal(
      minimumWage({ checkDate: D, state: 'WA', locality: 'seattle', tipped: true }).cents,
      2130,
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'WA', locality: 'tukwila', tipped: true }).cents,
      2165,
    );
    // And the size-tiered ordinances get the size-appropriate figure, not
    // just their large-employer headline rate.
    const burienLarge = minimumWage({
      checkDate: D, state: 'WA', locality: 'burien', tipped: true, employeeCount: 600,
    });
    assert.equal(burienLarge.cents, 2163);
    const burienUncovered = minimumWage({
      checkDate: D, state: 'WA', locality: 'burien', tipped: true, employeeCount: 5,
    });
    assert.equal(burienUncovered.cents, 1713, 'not covered by Burien -> state rate, still full cash (WA has no credit)');
    assert.equal(burienUncovered.tipCreditAllowed, false);
  });

  test('Maryland’s two counties have genuinely DIFFERENT tipped cash wages — one is not derivable from the other', () => {
    // Montgomery County sets its own $4.00 cash wage; Howard County simply
    // permits the state's $3.63. A formula (localStandard − stateCredit)
    // would have gotten Montgomery wrong — this was checked against
    // primary/cross-sourced research rather than assumed, after the first
    // draft of this database left both unspecified.
    assert.equal(
      minimumWage({ checkDate: D, state: 'MD', locality: 'montgomery_county', tipped: true }).cents,
      400,
    );
    assert.equal(
      minimumWage({ checkDate: D, state: 'MD', locality: 'howard_county', tipped: true }).cents,
      363,
    );
  });

  test('New Mexico’s two under-researched counties turned out to need OPPOSITE fixes', () => {
    // Santa Fe County sets its own $4.62 tipped wage — well above the
    // state's $3.00, so leaving it unspecified would have UNDERPAID.
    // Bernalillo County genuinely just uses the state's $3.00 unchanged —
    // confirmed and made explicit, rather than left as a silent gap that
    // happens to produce the right number for the wrong reason.
    assert.equal(
      minimumWage({ checkDate: D, state: 'NM', locality: 'santa_fe_county', tipped: true }).cents,
      462,
    );
    assert.equal(
      minimumWage({
        checkDate: D, state: 'NM', locality: 'bernalillo_county_unincorporated', tipped: true,
      }).cents,
      300,
    );
  });

  test('California’s 40 ordinances, on two different adjustment cycles', () => {
    const ca = Object.fromEntries(localMinimumWages('CA', D).map((j) => [j.id, j]));
    assert.equal(ca.west_hollywood!.hourlyCents, 2025); // highest in the database
    assert.equal(ca.emeryville!.hourlyCents, 2034);
    assert.equal(ca.san_francisco!.hourlyCents, 1961);
    assert.equal(ca.berkeley!.hourlyCents, 1961);
    assert.equal(ca.oakland!.hourlyCents, 1734);
    assert.equal(ca.los_angeles!.effectiveFrom, '2026-07-01');
    assert.equal(ca.belmont!.effectiveFrom, '2026-01-01');
    // No California jurisdiction may take a tip credit — Labor Code 351.
    for (const j of localMinimumWages('CA', D)) {
      assert.equal(j.tipped!.tipCreditAllowed, false, `${j.id} must not allow a tip credit`);
    }
  });

  test('Albuquerque still binds for TIPPED employees even though the state rate overtook it', () => {
    // The city's standard rate ($11.85) lost to New Mexico's $12.00, but its
    // tipped minimum of $7.20 is more than double the state's $3.00. An
    // inventory that dropped Albuquerque as "surpassed" would underpay every
    // tipped worker in the state's largest city by $4.20 an hour.
    const standard = minimumWage({ checkDate: D, state: 'NM', locality: 'albuquerque' });
    assert.equal(standard.cents, 1200);
    const tipped = minimumWage({
      checkDate: D, state: 'NM', locality: 'albuquerque', tipped: true,
    });
    assert.equal(tipped.cents, 720);
    assert.equal(tipped.bindingLevel, 'local');
    assert.equal(stateMinimumWageRuleset('NM', D).tipped.cashWageCents, 300);
  });

  test('Flagstaff abolished its tip credit; Tucson kept Arizona’s $3.00', () => {
    const flagstaff = minimumWage({
      checkDate: D, state: 'AZ', locality: 'flagstaff', tipped: true,
    });
    assert.equal(flagstaff.cents, 1835);
    assert.equal(flagstaff.tipCreditAllowed, false);
    const tucson = minimumWage({ checkDate: D, state: 'AZ', locality: 'tucson', tipped: true });
    assert.equal(tucson.cents, 1245);
    assert.equal(tucson.tipCreditAllowed, true);
  });

  test('Colorado locals, including Edgewater’s wider local tip offset', () => {
    const co = Object.fromEntries(localMinimumWages('CO', D).map((j) => [j.id, j]));
    assert.equal(co.denver!.hourlyCents, 1929);
    assert.equal(co.denver!.tipped!.cashWageCents, 1627);
    assert.equal(co.boulder!.hourlyCents, 1682);
    assert.equal(co.boulder_county_unincorporated!.tipped!.cashWageCents, 1380);
    // Edgewater is the one Colorado jurisdiction whose tip offset exceeds
    // the state's constitutional $3.02.
    assert.equal(co.edgewater!.hourlyCents, 1817);
    assert.equal(co.edgewater!.tipped!.maxTipCreditCents, 467);
    assert.equal(co.edgewater!.tipped!.cashWageCents, 1350);
  });

  test('Nebraska’s two ordinances are carried as NOT in effect', () => {
    for (const j of localMinimumWages('NE', D)) {
      assert.ok(j.status, `${j.id} must carry a status`);
    }
    const answer = minimumWage({ checkDate: D, state: 'NE', locality: 'lincoln' });
    assert.equal(answer.cents, 1500); // Nebraska's state rate, not the blocked ordinance
    assert.equal(answer.bindingLevel, 'state');
    assert.match(answer.considered.find((c) => c.level === 'local')!.basis, /not applied/);
  });

  test('a misspelled locality is reported, never silently treated as "no ordinance"', () => {
    const answer = minimumWage({ checkDate: D, state: 'WA', locality: 'Seatle' });
    assert.equal(answer.bindingLevel, 'state');
    const local = answer.considered.find((c) => c.level === 'local')!;
    assert.equal(local.cents, undefined);
    assert.match(local.caveat!, /check the spelling/);
  });

  test('a NaN employeeCount is treated as "not supplied," never as "matches every tier"', () => {
    // `NaN < x` and `NaN > x` are BOTH false in JS, so a naive size-tier
    // check would have NaN satisfy every appliesWhen bound and silently
    // resolve to whichever tier happens to be first in the array — found
    // by fuzzing employeeCount with non-finite values, not by inspection.
    // A real caller can produce NaN innocently: Number(formField) on an
    // empty or invalid input.
    const withNaN = minimumWage({
      checkDate: D, state: 'WA', locality: 'burien', employeeCount: NaN,
    });
    const withUndefined = minimumWage({ checkDate: D, state: 'WA', locality: 'burien' });
    assert.equal(withNaN.cents, withUndefined.cents);
    assert.equal(withNaN.bindingLevel, withUndefined.bindingLevel);
  });
});

describe('the highest-applicable rule', () => {
  test('federal wins where a state has no law of its own', () => {
    const answer = minimumWage({ checkDate: D, state: 'AL' });
    assert.equal(answer.cents, 725);
    assert.equal(answer.bindingLevel, 'federal');
  });

  test('state wins over federal', () => {
    const answer = minimumWage({ checkDate: D, state: 'CA' });
    assert.equal(answer.cents, 1690);
    assert.equal(answer.bindingLevel, 'state');
    assert.equal(answer.considered.length, 2);
  });

  test('local wins over state and federal, and the losers stay in the trail', () => {
    const answer = minimumWage({ checkDate: D, state: 'WA', locality: 'seattle' });
    assert.equal(answer.cents, 2130);
    assert.equal(answer.bindingLevel, 'local');
    assert.equal(answer.bindingJurisdiction, 'Seattle');
    assert.deepEqual(
      answer.considered.map((c) => c.cents),
      [725, 1713, 2130],
    );
  });

  test('a locality that has fallen BEHIND its state rate does not lower the floor', () => {
    // Hayward's small-employer tier is pinned to California's own rate, so
    // the two are equal; the answer must never come out below the state's.
    const answer = minimumWage({
      checkDate: D, state: 'CA', locality: 'hayward', employeeCount: 10,
    });
    assert.equal(answer.cents, 1690);
    assert.ok(answer.cents >= stateMinimumWageRuleset('CA', D).standard!.hourlyCents);
  });

  test('tipped floors are compared level by level, never derived from the standard answer', () => {
    // Chicago: a $12.96 local tipped cash wage beats Illinois's $9.00 and
    // the federal $2.13 — and the answer is a CASH floor, with tips still
    // required to reach the full $17.05.
    const answer = minimumWage({ checkDate: D, state: 'IL', locality: 'chicago', tipped: true });
    assert.equal(answer.cents, 1296);
    assert.equal(answer.bindingLevel, 'local');
    assert.equal(answer.tipCreditAllowed, true);
    assert.deepEqual(answer.considered.map((c) => c.cents), [213, 900, 1296]);
  });

  test('an unknown state code throws rather than quietly returning the federal floor', () => {
    assert.throws(
      () => minimumWage({ checkDate: D, state: 'ZZ' }),
      /No minimum wage ruleset/,
    );
  });
});

describe('sectoral minimum wages', () => {
  test('California’s fast food and health care rates are separate from its state rate', () => {
    const sectors = Object.fromEntries(
      sectoralMinimumWageRuleset('CA', D).map((s) => [s.id, s.hourlyCents]),
    );
    assert.equal(sectors.fast_food, 2000);
    assert.equal(sectors.health_care_large_systems, 2500);
    assert.equal(sectors.los_angeles_hotel, 2500);
    // Each is above the state rate, which is the whole point of carrying them.
    const state = stateMinimumWageRuleset('CA', D).standard!.hourlyCents;
    for (const cents of Object.values(sectors)) assert.ok(cents > state);
    // They are deliberately NOT merged into minimumWage(): coverage is a
    // legal determination this engine has no input for.
    assert.equal(minimumWage({ checkDate: D, state: 'CA' }).cents, 1690);
  });

  test('SB 525 has SEVEN health care schedules, not two — the slowest is nowhere near $25', () => {
    // Caught on a re-check against DIR's own FAQ (not found on the first
    // research pass): the first draft of this file collapsed seven
    // separately-scheduled employer categories into a false binary of
    // "large systems" vs. "other facilities". Safety net hospitals and
    // small counties are on the SLOWEST schedule and don't reach $25.00
    // until 2033-2034 — treating them as "other facilities" at $23.00
    // would still overstate what they owe in 2026.
    const sectors = Object.fromEntries(
      sectoralMinimumWageRuleset('CA', D).map((s) => [s.id, s.hourlyCents]),
    );
    const healthCare = Object.keys(sectors).filter((id) => id.startsWith('health_care_'));
    assert.equal(healthCare.length, 7);
    assert.equal(sectors.health_care_safety_net_hospitals, 1928);
    assert.equal(sectors.health_care_small_counties, 1928);
    assert.equal(sectors.health_care_community_clinics, 2200);
    assert.equal(sectors.health_care_medium_counties, 2300);
    assert.equal(sectors.health_care_large_counties, 2500);
    // Every category is still a real, above-state-minimum wage.
    const state = stateMinimumWageRuleset('CA', D).standard!.hourlyCents;
    for (const id of healthCare) assert.ok(sectors[id]! > state, id);
  });

  test('the five city hotel/airport ordinances are each carried, and each beats its own city\'s general local rate where one exists', () => {
    const sectors = Object.fromEntries(
      sectoralMinimumWageRuleset('CA', D).map((s) => [s.id, s.hourlyCents]),
    );
    assert.equal(sectors.los_angeles_airport_worker, 2500);
    assert.equal(sectors.santa_monica_hotel, 2500);
    assert.equal(sectors.long_beach_hotel, 2650);
    assert.equal(sectors.glendale_hotel, 2500);
    assert.equal(sectors.west_hollywood_hotel, 2087);

    // West Hollywood's hotel rate is genuinely NOT tied to Los Angeles's —
    // it is well above the city's own general local minimum wage, but
    // below the LA/Santa Monica/Glendale hotel figure, which is the whole
    // reason it is stored as its own figure rather than derived from either.
    const wehoGeneral = localMinimumWages('CA', D).find((j) => j.id === 'west_hollywood')!.hourlyCents!;
    assert.ok(sectors.west_hollywood_hotel! > wehoGeneral);
    assert.ok(sectors.west_hollywood_hotel! < sectors.los_angeles_hotel!);
  });

  test('New York’s home care aide wage is a separate, higher figure than Labor Law 652 in both regions', () => {
    const sectors = Object.fromEntries(
      sectoralMinimumWageRuleset('NY', D).map((s) => [s.id, s.hourlyCents]),
    );
    assert.equal(sectors.home_care_aide_downstate, 1965);
    assert.equal(sectors.home_care_aide_upstate, 1865);

    const downstate = minimumWage({ checkDate: D, state: 'NY', region: 'downstate' }).cents;
    const upstate = minimumWage({ checkDate: D, state: 'NY' }).cents;
    assert.ok(sectors.home_care_aide_downstate! > downstate);
    assert.ok(sectors.home_care_aide_upstate! > upstate);
  });
});

describe('coverage exemptions and exempt-salary thresholds (prose/reference fields, not read by minimumWage())', () => {
  const readNY = () =>
    JSON.parse(readFileSync(join(DATA_ROOT, 'states', 'NY-2026.json'), 'utf8')) as {
      exemptions: {
        categories: { id: string; label: string; statute: string }[];
        electionWorkers: { conclusion: string; sources: unknown[] };
      };
      exemptSalaryThresholds: {
        executiveAdministrative: {
          downstate: { weekly: number; annualized: number };
          upstate: { weekly: number; annualized: number };
        };
      };
    };
  const readFederal = () =>
    JSON.parse(readFileSync(join(DATA_ROOT, 'federal-2026.json'), 'utf8')) as {
      whiteCollarExemptions: {
        standardSalaryLevel: { weekly: number; annualized: number };
        highlyCompensatedEmployee: { annualized: number };
        computerEmployee: { weekly: number; hourly: number; hourlyCents: number };
      };
      otherFederalMinimums: { electionWorkers: { status: string; note: string } };
    };

  test('NY Labor Law 651’s exemption list is complete and includes the government-employee category the election-worker analysis rests on', () => {
    const ny = readNY();
    const ids = ny.exemptions.categories.map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length, 'no duplicate exemption ids');
    for (const required of [
      'executive_administrative_professional',
      'outside_salesperson',
      'government_employee',
      'farm_labor',
      'computer_professional',
    ]) {
      assert.ok(ids.includes(required), `missing exemption category: ${required}`);
    }
  });

  test('NY’s exempt-salary thresholds: downstate exceeds upstate, both exceed the federal floor, and weekly x 52 matches the annualized figure', () => {
    const ny = readNY();
    const federal = readFederal();
    const { downstate, upstate } = ny.exemptSalaryThresholds.executiveAdministrative;
    assert.ok(downstate.weekly > upstate.weekly);
    for (const region of [downstate, upstate]) {
      assert.ok(region.weekly > federal.whiteCollarExemptions.standardSalaryLevel.weekly);
      assert.ok(
        Math.abs(region.weekly * 52 - region.annualized) < 0.01,
        `weekly x 52 should equal the annualized figure: ${region.weekly} x 52 != ${region.annualized}`,
      );
    }
  });

  test('federal white-collar exemption figures reflect the 2024 rule’s vacatur — the 2019 levels, not the vacated higher ones', () => {
    const federal = readFederal();
    assert.equal(federal.whiteCollarExemptions.standardSalaryLevel.weekly, 684);
    assert.equal(federal.whiteCollarExemptions.standardSalaryLevel.annualized, 35568);
    assert.equal(federal.whiteCollarExemptions.highlyCompensatedEmployee.annualized, 107432);
    assert.equal(federal.whiteCollarExemptions.computerEmployee.hourly, 27.63);
    assert.equal(federal.whiteCollarExemptions.computerEmployee.hourlyCents, 2763);
  });

  test('the election-worker minimum-wage question is documented consistently at both federal and NY level, as unsettled rather than a clean exemption', () => {
    const ny = readNY();
    const federal = readFederal();
    assert.ok(ny.exemptions.electionWorkers.sources.length >= 3, 'expect multiple sources for a genuinely contested legal question');
    assert.match(ny.exemptions.electionWorkers.conclusion, /judgment call|not a bright-line/);
    assert.match(federal.otherFederalMinimums.electionWorkers.status, /not a bright-line/);
    // Both entries must point at each other rather than silently duplicating
    // or contradicting one another's analysis.
    assert.match(federal.otherFederalMinimums.electionWorkers.note, /NY-2026\.json/);
  });
});

describe('consistency with the rest of the engine', () => {
  test('the garnishment data’s own minimum wage figures agree with this database', () => {
    // data/garnishment/state-overrides-2026.json carries stateMinimumHourlyWage
    // for the states whose garnishment floor uses one. Those figures and
    // these must not drift apart.
    const overrides = JSON.parse(
      readFileSync(
        join(import.meta.dirname, '..', 'data', 'garnishment', 'state-overrides-2026.json'),
        'utf8',
      ),
    ) as { states: Record<string, unknown> };

    const found: [string, number][] = [];
    const walk = (code: string, node: unknown) => {
      if (Array.isArray(node)) return node.forEach((n) => walk(code, n));
      if (node && typeof node === 'object') {
        const o = node as Record<string, unknown>;
        if (typeof o.stateMinimumHourlyWage === 'number') {
          found.push([code, Math.round(o.stateMinimumHourlyWage * 100)]);
        }
        for (const v of Object.values(o)) walk(code, v);
      }
    };
    for (const [code, node] of Object.entries(overrides.states)) walk(code, node);
    assert.ok(found.length > 5, 'expected several garnishment minimum wage figures');

    // Three states deliberately differ, and each disagreement is documented
    // in both files: West Virginia and Maryland's statutes name the FEDERAL
    // minimum wage, and New York's garnishment entry uses the lower of its
    // two regional rates as a disclosed simplification.
    const expectedFederal = new Set(['WV']);
    for (const [code, cents] of found) {
      if (expectedFederal.has(code)) {
        assert.equal(cents, 725, `${code} garnishment floor should name the federal rate`);
        continue;
      }
      const state = stateMinimumWageRuleset(code, D);
      const matches =
        cents === state.standard!.hourlyCents ||
        (state.variants ?? []).some((v) => v.hourlyCents === cents) ||
        cents === 725;
      assert.ok(
        matches,
        `${code}: garnishment carries $${cents / 100}, minimum-wage database carries ` +
          `$${state.standard!.hourlyCents / 100}`,
      );
    }
  });

  test('the local ordinance files never contradict their own state file’s rate', () => {
    for (const state of ['AZ', 'CA', 'CO', 'IL', 'MD', 'ME', 'MN', 'NM', 'WA']) {
      const stateCents = stateMinimumWageRuleset(state, D).standard!.hourlyCents;
      for (const j of localMinimumWageRuleset(state, D)) {
        if (j.status) continue; // not in effect
        assert.ok(
          j.hourlyCents >= stateCents,
          `${state}/${j.id}: local $${j.hourlyCents / 100} is below the state rate`,
        );
      }
    }
  });
});

describe('the Supabase Edge Function data bundle stays in sync', () => {
  // scripts/build-data-bundle.ts snapshots every file under data/ into
  // supabase/functions/_shared/data-bundle.ts for the Edge Function
  // deployment, which has no filesystem of its own — see registry.ts's
  // own doc comment on setDataReader(). Nothing regenerates that snapshot
  // automatically; a data/ change with no re-run of that script ships an
  // Edge Function that answers with LAST WEEK's rates forever, silently,
  // because the deployed function has no way to know its bundle is stale.
  // This is exactly the state this repo was in when the minimum-wage
  // database was first added — the bundle predated the new data/
  // minimum-wage/ folder entirely — so this guards a real regression,
  // not a hypothetical one.
  test('every minimum-wage file is present in the bundle and byte-identical to disk', async () => {
    const { DATA_BUNDLE } = (await import(
      '../supabase/functions/_shared/data-bundle.ts'
    )) as { DATA_BUNDLE: Record<string, unknown> };

    const files = everyFile();
    assert.ok(files.length > 0);
    for (const f of files) {
      const relPath = join('minimum-wage', relative(DATA_ROOT, f)).replace(/\\/g, '/');
      assert.ok(
        Object.prototype.hasOwnProperty.call(DATA_BUNDLE, relPath),
        `${relPath} is on disk but missing from the Edge Function bundle — ` +
          `run \`node scripts/build-data-bundle.ts\` to regenerate it`,
      );
      assert.deepEqual(
        DATA_BUNDLE[relPath],
        JSON.parse(readFileSync(f, 'utf8')),
        `${relPath} in the bundle no longer matches the file on disk — the bundle is stale`,
      );
    }
  });
});
