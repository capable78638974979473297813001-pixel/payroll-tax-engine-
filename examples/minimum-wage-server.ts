import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { localMinimumWages } from '../src/minimum-wage.ts';
import { minimumWageForAddress } from '../src/minimum-wage-address.ts';
import { resolveAddress } from '../geocode/index.ts';
import { isInsidePortlandMetro } from '../geocode/districts.ts';

/**
 * A minimum wage lookup UI, backed directly by this repo's own
 * data/minimum-wage/ database and geocode/ address resolver — no wage
 * logic lives in this server. It is the same shape as
 * calculator-server.ts: a thin HTTP wrapper over the library, so anything
 * this UI can answer, a caller's own code can answer the same way.
 *
 * Three moving parts, kept visible in the response rather than collapsed
 * into a single number:
 *
 *   1. geocode the address       -> state, incorporated place(s), county
 *   2. match place/county        -> one of the 69 local ordinances, or none
 *   3. merge federal/state/local -> the highest applicable rate binds
 *
 * A caller who already knows the jurisdiction can POST `state` (plus an
 * optional `locality`) with no address at all. That path never touches the
 * network, which also makes it the one to use in bulk.
 *
 *   npm run ui:minimum-wage
 *   then open http://localhost:4324
 */

const PORT = Number(process.env.PORT ?? 4324);
const HERE = dirname(fileURLToPath(import.meta.url));
const HTML_PATH = join(HERE, 'minimum-wage-ui.html');
const WAGE_DIR = join(HERE, '..', 'data', 'minimum-wage');

/**
 * Which years this deployment can actually answer for, read from the
 * files on disk rather than hardcoded — rates are data in this project,
 * so the set of answerable years is data too. Asking for a year with no
 * ruleset is a normal mistake (a date picker defaulting to "today" in a
 * year nobody has built yet), and it deserves a sentence that says which
 * years DO exist rather than a raw file-not-found path.
 */
function availableYears(): number[] {
  try {
    return readdirSync(WAGE_DIR)
      .map((f) => /^federal-(\d{4})\.json$/.exec(f)?.[1])
      .filter((y): y is string => Boolean(y))
      .map(Number)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readJson<T>(req: IncomingMessage): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 200_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? (JSON.parse(data) as T) : ({} as T));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    req.on('error', reject);
  });
}

interface LookupRequest {
  address?: string;
  state?: string;
  locality?: string;
  employeeCount?: number;
  tipped?: boolean;
  occupation?: 'food_service' | 'service_employee';
  checkDate?: string;
  hoursPerWeek?: number;
  /**
   * A geography this caller ALREADY resolved, so a second question about
   * the same address (tipped instead of not, a different headcount, a
   * different date) doesn't pay for the geocode again. Ignored whenever
   * `address` is present — a fresh address always gets a fresh lookup.
   */
  places?: string[];
  counties?: string[];
  region?: string;
}

async function handleLookup(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: LookupRequest;
  try {
    body = await readJson<LookupRequest>(req);
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const checkDate = (body.checkDate ?? new Date().toISOString().slice(0, 10)).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(checkDate)) {
    sendJson(res, 400, { error: 'checkDate must be an ISO yyyy-mm-dd date.' });
    return;
  }

  // Checked BEFORE any network call, so a date nobody has data for fails
  // in milliseconds with a useful sentence rather than after a ten-second
  // geocode and a raw file path.
  const years = availableYears();
  const year = Number(checkDate.slice(0, 4));
  if (years.length > 0 && !years.includes(year)) {
    sendJson(res, 400, {
      error:
        `No minimum wage data for ${year}. This build covers ` +
        `${years.length === 1 ? years[0] : years.join(', ')}.`,
      hint:
        'Rates are data in this project, not code — a year is answerable once ' +
        'data/minimum-wage/federal-<year>.json and its state files exist, each with its own source URL and verifiedOn date.',
      availableYears: years,
    });
    return;
  }

  const address = (body.address ?? '').trim();
  const explicitState = (body.state ?? '').trim().toUpperCase();
  if (!address && !explicitState) {
    sendJson(res, 400, { error: 'Supply a work address, or a state code if you already know the jurisdiction.' });
    return;
  }

  // NaN must never reach the wage lookup: sizeMatches() in
  // minimum-wage.ts guards it too, but an undefined here is the honest
  // "not supplied" the whole stack is built around.
  const rawCount = Number(body.employeeCount);
  const employeeCount =
    body.employeeCount === undefined || body.employeeCount === null || !Number.isFinite(rawCount)
      ? undefined
      : Math.max(0, Math.round(rawCount));
  const hoursPerWeek = Number.isFinite(Number(body.hoursPerWeek)) ? Number(body.hoursPerWeek) : 40;

  let state = explicitState;
  // A geography the caller already has. Only trusted when there's no
  // address to resolve — an address on the request always wins.
  let places: string[] = Array.isArray(body.places) ? body.places : [];
  let counties: string[] = Array.isArray(body.counties) ? body.counties : [];
  let geocode: Record<string, unknown> | null = null;
  let region: string | undefined = body.region?.trim() || undefined;

  if (address) {
    places = [];
    counties = [];
    region = undefined;
    let resolution;
    try {
      resolution = await resolveAddress(address, 'work', checkDate);
    } catch (err) {
      sendJson(res, 502, {
        error: `Address lookup failed: ${(err as Error).message}`,
        hint: 'Census is a live external service. Retry, or post a state code instead.',
      });
      return;
    }

    if (!resolution.matched || !resolution.resolved) {
      sendJson(res, 422, {
        error: 'Census could not match that address, even after retrying without any apartment/suite designator.',
        hint: 'Check the street number and ZIP, or post a state code (and locality, if you know it) instead.',
        address,
      });
      return;
    }

    state = resolution.resolved.state;
    places = resolution.geographies?.incorporatedPlaces ?? [];
    counties = resolution.geographies?.counties ?? [];
    // rooftopSource/correctionMeters expose the SAME detail
    // resolution.rooftop already carries (geocode/rooftop.ts) that this
    // endpoint used to drop on the floor — a caller (or minimum-wage-ui.html
    // below) previously had no way to tell a genuine authoritative address
    // point (National Address Database, or the local OpenAddresses/NAD-bulk
    // index built by scripts/build-address-index.ts + build-nad-index.ts)
    // apart from a plain Census curb-level guess; both looked like bare
    // precision: 'rooftop' vs 'interpolated' strings with nothing behind them.
    const r = resolution.rooftop;
    geocode = {
      matched: true,
      precision: resolution.precision,
      rooftopSource: r?.match?.chosen.source ?? r?.osm?.road ?? r?.parcel?.source.jurisdictionLabel ?? null,
      correctionMeters: r?.metersFromInterpolated ?? null,
      coordinateSource: resolution.coordinateSource,
      coordinates: resolution.coordinates,
      places,
      counties,
      lowConfidenceReasons: resolution.lowConfidenceReasons,
    };

    // Oregon's third region is an urban growth boundary, not a county, so
    // it can only be answered from the coordinate — see
    // regionFromCounty()'s own comment in minimum-wage-address.ts. The
    // other regional split (New York's downstate) is a clean county test
    // and needs no extra call.
    if (state === 'OR' && resolution.coordinates) {
      try {
        const metro = await isInsidePortlandMetro(resolution.coordinates.lat, resolution.coordinates.lon);
        if (metro.attempted && metro.inside) region = 'portland_metro';
      } catch {
        /* leave unset — the state baseline is the honest fallback */
      }
    }
  }

  let answer;
  try {
    answer = minimumWageForAddress({
      checkDate,
      state,
      incorporatedPlaces: places,
      counties,
      employeeCount,
      tipped: Boolean(body.tipped),
      occupation: body.occupation,
      region,
      localityOverride: body.locality?.trim() || undefined,
    });
  } catch (err) {
    sendJson(res, 400, { error: (err as Error).message });
    return;
  }

  const hourly = answer.wage.hourly;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  if (!address && (places.length > 0 || counties.length > 0)) {
    geocode = { matched: true, reused: true, places, counties };
  }

  sendJson(res, 200, {
    checkDate,
    state,
    geocode,
    hourly,
    cents: answer.wage.cents,
    bindingLevel: answer.wage.bindingLevel,
    bindingJurisdiction: answer.wage.bindingJurisdiction,
    tipCreditAllowed: answer.wage.tipCreditAllowed,
    tipped: Boolean(body.tipped),
    considered: answer.wage.considered,
    locality: answer.locality,
    region: answer.query.region ?? null,
    query: answer.query,
    payroll:
      employeeCount === undefined
        ? null
        : {
            employeeCount,
            hoursPerWeek,
            perEmployeeAnnual: round2(hourly * hoursPerWeek * 52),
            totalAnnual: round2(hourly * hoursPerWeek * 52 * employeeCount),
            totalWeekly: round2(hourly * hoursPerWeek * employeeCount),
          },
  });
}

/** Every local ordinance for one state — powers the manual override list. */
function handleLocalities(res: ServerResponse, stateCode: string): void {
  const state = stateCode.trim().toUpperCase();
  if (!state) {
    sendJson(res, 400, { error: 'state query parameter is required.' });
    return;
  }
  const checkDate = new Date().toISOString().slice(0, 10);
  try {
    sendJson(res, 200, {
      state,
      localities: localMinimumWages(state, checkDate).map((j) => ({
        id: j.id,
        name: j.name,
        level: j.level,
        hourly: j.hourly ?? j.hourlyCents / 100,
      })),
    });
  } catch {
    // A state with no local file at all is a normal outcome, not an error.
    sendJson(res, 200, { state, localities: [] });
  }
}

const server = createServer((req, res) => {
  const url = (req.url ?? '/').split('?')[0];
  const query = new URL(req.url ?? '/', 'http://localhost').searchParams;

  if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
    const html = readFileSync(HTML_PATH);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Length': html.byteLength,
      'Cache-Control': 'no-store',
    });
    res.end(html);
    return;
  }

  if (req.method === 'POST' && url === '/api/minimum-wage') {
    handleLookup(req, res).catch((err) => sendJson(res, 500, { error: (err as Error).message }));
    return;
  }

  if (req.method === 'GET' && url === '/api/meta') {
    // Lets the UI bound its own date picker to the years that actually
    // have data, instead of letting someone pick one and get an error.
    sendJson(res, 200, { availableYears: availableYears() });
    return;
  }

  if (req.method === 'GET' && url === '/api/localities') {
    handleLocalities(res, query.get('state') ?? '');
    return;
  }

  sendJson(res, 404, { error: 'Not found.' });
});

server.listen(PORT, () => {
  console.log(`Minimum wage lookup running at http://localhost:${PORT}`);
});
