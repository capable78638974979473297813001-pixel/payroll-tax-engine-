import { readFileSync } from 'node:fs';

function readData(path) {
  return JSON.parse(readFileSync(new URL('../../data/' + path, import.meta.url), 'utf8'));
}

const pennsylvania = readData('filing/local/PA-districts-2026.json');
const profiles = readData('filing/local/2026.json');
const michiganCities = readData('local/MI-cities-2026.json').cities;
const counties = readData('local/IN-counties-2026.json').counties;
const districts = readData('local/OH-school-districts-2026.json').districts;
const municipalities = readData('local/OH-municipalities-2026.json').municipalities;

const ohioRouting = readData('filing/local/OH-routing-2026.json');
const zones = readData('local/OH-jedd-jedz-2026.json').zones;

function ohioMembership(group, code) {
  const exceptions = ohioRouting[group];
  const specific = Object.hasOwn(exceptions, code) ? exceptions[code] : undefined;
  for (const [agency, roster] of Object.entries(ohioRouting.rosters)) {
    if (Object.hasOwn(roster[group], code)) {
      return {
        ...specific,
        agency,
        collectorCode: roster[group][code],
        sources: [...new Set([roster.source, ...(specific?.sources ?? [])])],
      };
    }
  }
  return specific;
}

/** Instructions for a known collector; callers retain responsibility for confirming the filing period. */
export function localAgencyGuide(agencyId, year) {
  if (year !== 2026 || !Object.hasOwn(profiles, agencyId)) return null;
  return structuredClone(profiles[agencyId]);
}

/** Use jurisdiction codes as printed, including leading zeroes. Never infer a collector from a name. */
export function localWithholdingGuide(kind, code, year) {
  if (year !== 2026) return { status: 'unsupported-year' };
  if (typeof code !== 'string' || code.trim() === '') return { status: 'unknown-code' };
  let agency;
  let row;
  let membership;
  switch (kind) {
    case 'PA-EIT-district': {
      if (!Object.hasOwn(pennsylvania.districts, code)) return { status: 'unknown-code' };
      const district = pennsylvania.districts[code];
      const instructions = code === '51' ? pennsylvania.philadelphia : pennsylvania.act32;
      const collectorInstructions = pennsylvania.collectorInstructions[district.collector];
      return {
        status: 'guide',
        jurisdiction: district.district,
        code,
        guide: {
          ...structuredClone(instructions),
          ...structuredClone(collectorInstructions),
          collector: district.collector,
          website: district.website,
          verifiedOn: collectorInstructions?.verifiedOn ?? pennsylvania.verifiedOn,
          sources: [pennsylvania.source, ...instructions.sources, ...(collectorInstructions?.sources ?? [])],
        },
      };
    }
    case 'AL-city':
    case 'CO-city': {
      const cities = kind === 'AL-city' ? ['Birmingham', 'Gadsden'] : ['Denver', 'Glendale', 'Greenwood Village', 'Sheridan'];
      const locality = code.trim().toLowerCase();
      const city = cities.find(name => name.toLowerCase() === locality);
      if (city) {
        row = { name: city };
        agency = kind.slice(0, 2) + '-' + city.toUpperCase().replaceAll(' ', '-');
      }
      break;
    }
    case 'DE-city':
      if (code.trim().toLowerCase() === 'wilmington') {
        row = { name: 'Wilmington' };
        agency = 'DE-WILMINGTON';
      }
      break;
    case 'MO-city': {
      const locality = code.trim().toLowerCase();
      if (locality === 'kansas city') {
        row = { name: 'Kansas City' };
        agency = 'MO-KANSAS-CITY';
      } else if (['st. louis', 'st louis', 'saint louis'].includes(locality)) {
        row = { name: 'St. Louis' };
        agency = 'MO-ST-LOUIS';
      }
      break;
    }
    case 'MI-city': {
      row = michiganCities.find(city => city.name.toLowerCase() === code.trim().toLowerCase());
      if (!row) return { status: 'unknown-code' };
      const cityAgency = 'MI-' + row.name.toUpperCase().replaceAll(' ', '-');
      if (Object.hasOwn(profiles, cityAgency)) agency = cityAgency;
      break;
    }
    case 'IN-county':
      row = counties.find(county => county.countyCode === code);
      agency = 'IN-DOR';
      break;
    case 'OH-school-district':
      row = districts.find(district => district.sdNumber === code);
      agency = 'OH-SDIT';
      break;
    case 'OH-jedd-jedz':
      row = zones.find(zone => zone.jeddId === code);
      membership = ohioMembership('zones', code);
      break;
    case 'OH-municipality':
      membership = ohioMembership('municipalities', code);
      row = municipalities.find(city => city.municode === code) ?? (membership?.name ? membership : undefined);
      break;
    default:
      return { status: 'unsupported-jurisdiction-type' };
  }
  if (!row) return { status: 'unknown-code' };
  if (membership) agency = membership.agency;
  if (!agency) return { status: 'collector-unverified', jurisdiction: row.name, code };
  return {
    status: 'guide',
    jurisdiction: row.name,
    code,
    agency,
    guide: localAgencyGuide(agency, year),
    confirmMembershipForPeriod: kind === 'OH-municipality' || kind === 'OH-jedd-jedz',
    ...(membership?.collectorCode && { collectorCode: membership.collectorCode }),
    ...(membership?.administrationStartedOn && {
      administrationStartedOn: membership.administrationStartedOn,
      filingNote: 'Collector changed during 2026. Confirm transition instructions for earlier periods and amendments.',
    }),
    ...(membership && { membershipSources: [...membership.sources], membershipVerifiedOn: ohioRouting.verifiedOn }),
  };
}
