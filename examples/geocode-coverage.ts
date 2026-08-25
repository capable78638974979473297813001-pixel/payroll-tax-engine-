import { geocodeAddress } from '../geocode/census.ts';
import { resolveRooftop } from '../geocode/rooftop.ts';

/**
 * How good is this project's address resolution, in every state?
 *
 * Not a claim — a measurement, re-runnable by anyone: `npm run
 * coverage:geocode`. One real, Census-verified address per state and DC,
 * resolved through the same tiered pipeline resolveAddress() uses, and
 * reported by which tier answered. The numbers in docs/geocoding-
 * coverage.md come from this script and nowhere else.
 *
 * The sample is deliberately disclosed rather than dressed up: these are
 * capitol-area civic addresses, one per state. They are real and they are
 * spread across every state, which is what makes the per-state coverage
 * question answerable at all — but they are downtown, and downtown is
 * where address data is best. Rural coverage is thinner. Treat the result
 * as "does this state's data reach this pipeline", not as a national
 * accuracy rate.
 *
 * Requires network access, takes a few minutes (the OSM fallback tier is
 * rate-limited to one request per second by Nominatim's usage policy),
 * and is deliberately NOT part of `npm test`.
 */

const ADDRESSES: Record<string, string> = {
  AL: '600 Dexter Ave, Montgomery, AL 36130',
  AK: '120 4th St, Juneau, AK 99801',
  AZ: '1700 W Washington St, Phoenix, AZ 85007',
  AR: '500 Woodlane St, Little Rock, AR 72201',
  CA: '1315 10th St, Sacramento, CA 95814',
  CO: '200 E Colfax Ave, Denver, CO 80203',
  CT: '210 Capitol Ave, Hartford, CT 06106',
  DE: '411 Legislative Ave, Dover, DE 19901',
  DC: '1350 Pennsylvania Ave NW, Washington, DC 20004',
  FL: '400 S Monroe St, Tallahassee, FL 32399',
  GA: '206 Washington St SW, Atlanta, GA 30334',
  HI: '415 S Beretania St, Honolulu, HI 96813',
  ID: '700 W Jefferson St, Boise, ID 83702',
  IL: '401 S 2nd St, Springfield, IL 62701',
  IN: '200 W Washington St, Indianapolis, IN 46204',
  IA: '1007 E Grand Ave, Des Moines, IA 50319',
  KS: '300 SW 10th Ave, Topeka, KS 66612',
  KY: '700 Capitol Ave, Frankfort, KY 40601',
  LA: '900 N 3rd St, Baton Rouge, LA 70802',
  ME: '210 State St, Augusta, ME 04330',
  MD: '100 State Cir, Annapolis, MD 21401',
  MA: '24 Beacon St, Boston, MA 02133',
  MI: '100 N Capitol Ave, Lansing, MI 48933',
  MN: '445 Minnesota St, St Paul, MN 55101',
  MS: '400 High St, Jackson, MS 39201',
  MO: '201 W Capitol Ave, Jefferson City, MO 65101',
  MT: '1301 E 6th Ave, Helena, MT 59601',
  NE: '1445 K St, Lincoln, NE 68508',
  NV: '101 N Carson St, Carson City, NV 89701',
  NH: '25 Capitol St, Concord, NH 03301',
  NJ: '125 W State St, Trenton, NJ 08608',
  NM: '490 Old Santa Fe Trail, Santa Fe, NM 87501',
  NY: '138 State St, Albany, NY 12207',
  NC: '1 E Edenton St, Raleigh, NC 27601',
  ND: '600 E Boulevard Ave, Bismarck, ND 58505',
  OH: '90 W Broad St, Columbus, OH 43215',
  OK: '2300 N Lincoln Blvd, Oklahoma City, OK 73105',
  OR: '900 Court St NE, Salem, OR 97301',
  PA: '501 N 3rd St, Harrisburg, PA 17120',
  RI: '82 Smith St, Providence, RI 02903',
  SC: '1100 Gervais St, Columbia, SC 29201',
  SD: '500 E Capitol Ave, Pierre, SD 57501',
  TN: '312 Rosa L Parks Ave, Nashville, TN 37243',
  TX: '1100 Congress Ave, Austin, TX 78701',
  UT: '350 State St, Salt Lake City, UT 84103',
  VT: '115 State St, Montpelier, VT 05633',
  VA: '1000 Bank St, Richmond, VA 23219',
  WA: '302 Sid Snyder Ave SW, Olympia, WA 98504',
  WV: '1900 Kanawha Blvd E, Charleston, WV 25305',
  WI: '2 E Main St, Madison, WI 53703',
  WY: '200 W 24th St, Cheyenne, WY 82001',
};

const TIER_LABEL: Record<string, string> = {
  authoritative: 'rooftop (authoritative)',
  'osm-corroborated': 'house-level (OSM, corroborated)',
  'authoritative-neighbors': 'block (between published points)',
  none: 'interpolated (Census only)',
};

interface Row {
  state: string;
  address: string;
  tier: string;
  meters: number | null;
  source: string | null;
}

const rows: Row[] = [];
const entries = Object.entries(ADDRESSES);
let next = 0;

async function worker(): Promise<void> {
  while (next < entries.length) {
    const [state, address] = entries[next++];
    let row: Row = { state, address, tier: 'none', meters: null, source: null };
    try {
      const geocoded = await geocodeAddress(address);
      if (!geocoded.matched || !geocoded.coordinates) {
        row = { state, address, tier: 'census-no-match', meters: null, source: null };
      } else {
        const interpolated = { lat: geocoded.coordinates.y, lon: geocoded.coordinates.x };
        const roof = await resolveRooftop(address, interpolated);
        row = {
          state,
          address,
          tier: roof.tier ?? 'none',
          meters: roof.metersFromInterpolated === null ? null : Math.round(roof.metersFromInterpolated),
          source: roof.match?.chosen.source ?? null,
        };
      }
    } catch (err) {
      row = { state, address, tier: `error: ${String(err).slice(0, 40)}`, meters: null, source: null };
    }
    rows.push(row);
    console.log(
      `  ${row.state.padEnd(3)} ${(TIER_LABEL[row.tier] ?? row.tier).padEnd(34)} ${
        row.meters === null ? '    ' : `${String(row.meters).padStart(4)}m`
      }  ${row.source ?? ''}`,
    );
  }
}

console.log(`\n  Resolving one real address in each of ${entries.length} jurisdictions.\n`);
await Promise.all([worker(), worker()]);

const counts = new Map<string, number>();
for (const row of rows) counts.set(row.tier, (counts.get(row.tier) ?? 0) + 1);

console.log(`\n  ${'-'.repeat(66)}`);
for (const [tier, label] of Object.entries(TIER_LABEL)) {
  const n = counts.get(tier) ?? 0;
  console.log(`  ${String(n).padStart(3)} / ${entries.length}  ${label}`);
}
const failed = counts.get('census-no-match') ?? 0;
if (failed) console.log(`  ${String(failed).padStart(3)} / ${entries.length}  Census could not match the sample address`);

const better = rows.filter((r) => r.tier !== 'none' && r.tier !== 'census-no-match');
const moved = better.filter((r) => r.meters !== null).map((r) => r.meters!);
console.log(
  `\n  ${better.length} of ${entries.length} resolved to something better than Census's own interpolation,` +
    (moved.length
      ? ` correcting it by ${Math.min(...moved)}m to ${Math.max(...moved)}m (median ${
          moved.sort((a, b) => a - b)[Math.floor(moved.length / 2)]
        }m).`
      : '.'),
);
console.log(
  `\n  \x1b[2mDowntown civic addresses, one per state — see this file's own doc\n` +
    `  comment for why that sample answers "does this state's data reach the\n` +
    `  pipeline" and not "how accurate is this nationally".\x1b[0m\n`,
);
