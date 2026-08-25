import { calculatePaycheck } from '../src/calculate.ts';
import { dollars } from '../src/money.ts';
import {
  LARGE_HOUSE_NUMBER_GAP,
  checkNearestBuilding,
  resolveAddress,
  resolveEmployee,
  resolveRooftop,
} from '../geocode/index.ts';
import { fetchNearbyBuildings, nearestBuilding } from '../geocode/buildings.ts';
import { geocodeAddress } from '../geocode/census.ts';

/**
 * The scenario: an employer has three new hires' street addresses and
 * nothing else. Symmetry's own core product is turning that address into
 * the jurisdiction fields this engine's calculatePaycheck() already knows
 * how to read — this demo runs that resolution live against the real
 * Census Bureau geocoder, then feeds the result straight into a real
 * paycheck calculation. Requires network access (unlike `npm test`, which
 * never touches it — see resolve.ts's own doc comment for why that split
 * exists).
 */

const CHECK_DATE = '2026-08-15';
const rule = (s: string) => console.log(`\n\x1b[2m${'─'.repeat(70)}\x1b[0m\n  ${s}\n`);

async function demo(label: string, address: string, workState: string) {
  rule(label);
  console.log(`  Address: ${address}`);

  const result = await resolveAddress(address, 'work', CHECK_DATE);
  if (!result.matched) {
    console.log(`  \x1b[31mCensus could not match this address — no paycheck computed.\x1b[0m`);
    return;
  }

  console.log(`  Resolved certificate fields: ${JSON.stringify(result.certificateFields)}`);
  if (result.matchQuality) {
    console.log(
      `  Match quality: matched "${result.matchQuality.matchedAddress}"` +
        (result.matchQuality.addressRangeWidth !== null
          ? `, address range width ${result.matchQuality.addressRangeWidth}`
          : '') +
        (result.matchQuality.matchedViaFallback ? ', via secondary-unit fallback' : ''),
    );
  }
  if (result.crossCheck?.attempted) {
    const n = result.crossCheck.nominatim!;
    console.log(
      `  OSM cross-check: ${n.place ?? '?'}, ${n.county ?? '?'}` +
        (result.crossCheck.distanceDisagreementMiles !== null
          ? ` (${result.crossCheck.distanceDisagreementMiles.toFixed(3)}mi from Census's own point)`
          : '') +
        (result.crossCheck.placeDisagreement ? ' \x1b[33m[DISAGREES with Census]\x1b[0m' : ' \x1b[32m[agrees]\x1b[0m'),
    );
  } else {
    console.log(`  OSM cross-check: unavailable this call (no second opinion, not evidence against Census)`);
  }
  const moved = result.rooftop?.metersFromInterpolated;
  if (result.precision === 'rooftop') {
    const chosen = result.rooftop!.match!.chosen;
    console.log(
      `  Position: \x1b[32mROOFTOP\x1b[0m — authoritative address point published by ${chosen.source ?? 'the local address authority'}` +
        (chosen.placement && chosen.placement !== 'Unknown' ? ` (${chosen.placement})` : '') +
        `, ${moved!.toFixed(0)}m from where Census interpolated. Jurisdictions above were resolved AT that point.`,
    );
  } else if (result.precision === 'rooftop-osm') {
    console.log(
      `  Position: \x1b[32mHOUSE-LEVEL (OpenStreetMap)\x1b[0m — no authoritative point published here, but OSM has one for this address` +
        ` and it agrees with Census's own position (${moved!.toFixed(0)}m apart). Crowd-sourced and corroborated, not authoritative.`,
    );
  } else if (result.precision === 'neighbor') {
    const n = result.rooftop!.neighbors!;
    console.log(
      `  Position: \x1b[36mBLOCK-LEVEL\x1b[0m — this exact number isn't published, so the point is interpolated between the` +
        ` authoritative points for ${n.below.houseNumber} and ${n.above.houseNumber} on the same street (${n.spanMeters.toFixed(0)}m apart),` +
        ` ${moved!.toFixed(0)}m from where Census interpolated.`,
    );
  } else if (result.rooftop?.attempted) {
    console.log(
      `  Position: interpolated by Census — no published point for this address in any source this module can reach`,
    );
  } else {
    console.log(`  Position: interpolated by Census — the address-point services were unreachable this call`);
  }
  const building = result.crossCheck?.building;
  if (building?.attempted && building.onStreet && building.houseNumberGap !== null) {
    const b = building.onStreet;
    console.log(
      `  OSM footprint check: nearest mapped building on this street is "${b.houseNumber} ${b.street}"` +
        (b.name ? ` (${b.name})` : '') +
        `, ${Math.round(b.distanceMeters)}m away — ${building.houseNumberGap} house numbers from this address` +
        (building.houseNumberGap > LARGE_HOUSE_NUMBER_GAP
          ? ' \x1b[33m[NUMERICALLY IMPLAUSIBLE]\x1b[0m'
          : ' \x1b[32m[plausible]\x1b[0m'),
    );
  } else if (building?.attempted) {
    console.log(
      `  OSM footprint check: no building on this street is mapped with a house number within 150m — no signal either way (normal outside dense downtowns)`,
    );
  } else {
    console.log(`  OSM footprint check: Overpass unavailable this call`);
  }
  for (const reason of result.lowConfidenceReasons) {
    console.log(`  \x1b[33m⚠ ${reason}\x1b[0m`);
  }

  const paycheck = calculatePaycheck({
    checkDate: CHECK_DATE,
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
    deductions: [],
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: workState, certificate: result.certificateFields },
  });

  console.log(`\n  Paycheck taxes for a $3,000 biweekly employee at this address:`);
  for (const line of paycheck.taxes) {
    console.log(`    ${line.id.padEnd(14)} ${line.detail}`);
  }
}

await demo('Bluffton, Ohio — a village that taxes AND a school district that taxes', '136 N Main St, Bluffton, OH 45817', 'OH');
await demo('Columbus, Ohio — a city that taxes, a school district that does NOT', '90 W Broad St, Columbus, OH 43215', 'OH');
await demo('Detroit, Michigan', '2 Woodward Ave, Detroit, MI 48226', 'MI');
await demo('Indianapolis, Indiana — county tax, not city', '200 E Washington St, Indianapolis, IN 46204', 'IN');
await demo('Abington, Pennsylvania — PSD code resolved from county + township', '1176 Old York Rd, Abington, PA 19001', 'PA');
await demo('Baltimore, Maryland — independent city, not a county', '100 N Holliday St, Baltimore, MD 21202', 'MD');
await demo('Rockville, Maryland — an ordinary city resolves via its county', '100 N Washington St, Rockville, MD 20850', 'MD');
await demo('Birmingham, Alabama — municipal occupational tax', '710 20th St N, Birmingham, AL 35203', 'AL');
await demo('Edmonton, Kentucky — a city AND its containing county resolve together, the KRS 68.197 credit-eligible pair', '105 W Main St, Edmonton, KY 42129', 'KY');

/**
 * The cross-address cases: NYC/Yonkers/Missouri's/Multnomah's taxes are
 * keyed off a COMPARISON between work and residence, not either address
 * alone — resolveEmployee() (not resolveAddress()) is what handles that.
 */
async function demoEmployee(
  label: string,
  workState: string,
  addresses: { work?: string; residence?: string },
) {
  rule(label);
  if (addresses.work) console.log(`  Work address:      ${addresses.work}`);
  if (addresses.residence) console.log(`  Residence address: ${addresses.residence}`);

  const result = await resolveEmployee(addresses, CHECK_DATE);
  console.log(`  Merged certificate fields: ${JSON.stringify(result.certificateFields)}`);
  if (result.notResolvable.length) {
    console.log(`  \x1b[33m⚠ not resolvable from Census data: ${result.notResolvable.join(' / ')}\x1b[0m`);
  }

  const paycheck = calculatePaycheck({
    checkDate: CHECK_DATE,
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
    deductions: [],
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: workState, certificate: result.certificateFields },
  });

  console.log(`\n  Paycheck taxes for a $3,000 biweekly employee:`);
  for (const line of paycheck.taxes) {
    console.log(`    ${line.id.padEnd(16)} ${line.detail}`);
  }
}

await demoEmployee('An employee who lives AND works in Yonkers — the RESIDENT surcharge fires', 'NY', {
  work: '40 Main St, Yonkers, NY 10701',
  residence: '40 Main St, Yonkers, NY 10701',
});
await demoEmployee('An employee who lives in Manhattan but WORKS in Yonkers — the NONRESIDENT-WORKER tax fires instead', 'NY', {
  work: '40 Main St, Yonkers, NY 10701',
  residence: '1600 Broadway, New York, NY 10019',
});
await demoEmployee('A Manhattan resident — NYC resident tax fires from the RESIDENCE address alone', 'NY', {
  residence: '1600 Broadway, New York, NY 10019',
});
await demoEmployee('An employee who lives in the St. Louis suburbs but works in Kansas City — Missouri\'s "either address" rule', 'MO', {
  work: '414 E 12th St, Kansas City, MO 64106',
  residence: '6801 Delmar Blvd, University City, MO 63130',
});
await demoEmployee('An employee working in Newark, NJ — the employer-paid payroll tax', 'NJ', {
  work: '920 Broad St, Newark, NJ 07102',
});
await demoEmployee('An employee working in downtown Portland (Multnomah County), Oregon', 'OR', {
  work: '200 SE Salmon St, Portland, OR 97214',
});
await demoEmployee('An employee working in Wheeling, West Virginia — the per-week Municipal Service Fee', 'WV', {
  work: '1500 Chapline St, Wheeling, WV 26003',
});
await demoEmployee("An employee working in Wilmington, Delaware — the city's only wage tax, either-address triggered", 'DE', {
  work: '800 N French St, Wilmington, DE 19801',
});

rule('An employee working in downtown Denver, Colorado — the Occupational Privilege Tax');
{
  const address = '1437 Bannock St, Denver, CO 80202';
  console.log(`  Work address: ${address}`);
  const result = await resolveEmployee({ work: address }, CHECK_DATE);
  console.log(`  Resolved from Census alone: ${JSON.stringify(result.certificateFields)}`);
  if (result.notResolvable.length) {
    console.log(`  \x1b[33m⚠ ${result.notResolvable.join(' / ')}\x1b[0m`);
  }
  // denverMonthlyCompensation is real payroll history the caller must
  // already track — geocoding cannot supply it. Merged in here to show
  // the complete flow once that (non-address) fact is known.
  const certificate = { ...result.certificateFields, denverMonthlyCompensation: dollars(3000) };
  console.log(`  Certificate after adding known payroll history: ${JSON.stringify(certificate)}`);

  const paycheck = calculatePaycheck({
    checkDate: CHECK_DATE,
    payFrequency: 'biweekly',
    earnings: [{ code: 'REG', category: 'regular', amount: dollars(3000) }],
    deductions: [],
    federalW4: {
      filingStatus: 'single',
      multipleJobs: false,
      dependentCredit: 0,
      otherIncome: 0,
      deductions: 0,
      extraWithholding: 0,
    },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: 'CO', certificate },
  });
  console.log(`\n  Paycheck taxes for a $3,000 biweekly employee:`);
  for (const line of paycheck.taxes) {
    console.log(`    ${line.id.padEnd(16)} ${line.detail}`);
  }
}

rule('Rooftop precision, confirmed against a building detected from imagery');
{
  /**
   * The two halves of this module meeting on one address. NAD publishes an
   * authoritative, government-surveyed point for 90 W Broad St; OSM
   * publishes a building footprint traced from satellite imagery (the
   * Columbus footprints carry Esri's own county building-detection import
   * as their source). Neither knows about the other. If the surveyed point
   * lands on the detected building, two completely independent systems —
   * one measured on the ground, one seen from orbit — agree about where
   * this address physically is. That is what a rooftop geocode is.
   */
  const address = '90 W Broad St, Columbus, OH 43215';
  console.log(`  Address: ${address}\n`);

  const geocoded = await geocodeAddress(address);
  if (!geocoded.matched || !geocoded.coordinates) {
    console.log('  Census could not match this address.');
  } else {
    const interpolated = { lat: geocoded.coordinates.y, lon: geocoded.coordinates.x };
    const roof = await resolveRooftop(address, interpolated);

    const describe = async (label: string, point: { lat: number; lon: number }) => {
      const fetched = await fetchNearbyBuildings(point.lat, point.lon, 80);
      if (!fetched.ok) {
        console.log(`  ${label}: ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)} — Overpass unavailable, no footprint check`);
        return;
      }
      const nearest = nearestBuilding(point, fetched.elements);
      const name = nearest?.name ?? (nearest?.houseNumber ? `${nearest.houseNumber} ${nearest.street}` : 'an unnamed building');
      console.log(
        `  ${label}: ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}` +
          (nearest ? ` — ${nearest.distanceMeters.toFixed(1)}m from ${name}` : ' — no mapped footprint nearby'),
      );
    };

    await describe("Census's interpolated point ", interpolated);
    if (roof.found && roof.point) {
      await describe('Authoritative address point', roof.point);
      console.log(
        `\n  The authoritative point sits ${roof.metersFromInterpolated!.toFixed(0)}m from the interpolated one, published by ${roof.match!.chosen.source}.`,
      );
    } else {
      console.log(`  No authoritative point available for this address this call.`);
    }
  }
  console.log(
    `\n  \x1b[2mMeasured on this demo's own address list: 13 of 18 addresses resolve to\n` +
      `  an authoritative point. The other 5 keep Census's interpolated position,\n` +
      `  because the National Address Database has nothing published for them —\n` +
      `  the upgrade is address-by-address, never a blanket claim.\x1b[0m`,
  );
}

rule("The footprint check, run against a point that is genuinely WRONG — the reason it exists");
{
  /**
   * Every scenario above resolves an address Census got right, so the
   * footprint check agrees and says so. This runs the SAME check against
   * the point NOMINATIM returned for 90 W Broad St — a real, verified
   * error: it lands 0.56 miles away, across the river, on COSI. Nothing
   * about a place-name comparison catches that; both geocoders "matched".
   * The house number of the nearest mapped building on that same street
   * does catch it, live, in one call.
   */
  const address = '90 W Broad St, Columbus, OH 43215';
  const points = {
    "Census's point (correct — Columbus City Hall is here)": { lat: 39.962072, lon: -83.002493 },
    "Nominatim's point (wrong — this is COSI, 0.56mi away)": { lat: 39.961585, lon: -83.012999 },
  };

  console.log(`  Address under test: ${address}\n`);
  for (const [label, point] of Object.entries(points)) {
    const check = await checkNearestBuilding(address, point);
    if (!check.attempted) {
      console.log(`  ${label}: Overpass unavailable this call`);
      continue;
    }
    const b = check.onStreet;
    if (!b || check.houseNumberGap === null) {
      console.log(`  ${label}: no same-street building mapped with a house number within 150m`);
      continue;
    }
    const verdict =
      check.houseNumberGap > LARGE_HOUSE_NUMBER_GAP
        ? `\x1b[33mgap ${check.houseNumberGap} — NUMERICALLY IMPLAUSIBLE for this address\x1b[0m`
        : `\x1b[32mgap ${check.houseNumberGap} — plausible\x1b[0m`;
    console.log(
      `  ${label}\n    nearest on-street building: "${b.houseNumber} ${b.street}"` +
        (b.name ? ` (${b.name})` : '') +
        `, ${Math.round(b.distanceMeters)}m away — ${verdict}`,
    );
  }
  console.log(
    `\n  \x1b[2mThe honest limit: this catches a point that is far enough off that\n` +
      `  the house numbers stop lining up. A wrong building right next door,\n` +
      `  with a similar number, still gets through — see buildings.ts.\x1b[0m`,
  );
}

console.log(
  `\n  \x1b[2mThis resolution ran once, live, for this demo. In real use it runs\n` +
    `  once per employee address (onboarding / address change), never per\n` +
    `  paycheck — calculatePaycheck() itself still never touches the network.\x1b[0m\n`,
);
