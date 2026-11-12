import { readFileSync } from 'node:fs';

function readData(path) {
  return JSON.parse(readFileSync(new URL('../../data/' + path, import.meta.url), 'utf8'));
}

const pennsylvania = readData('filing/local/PA-districts-2026.json');
const profiles = readData('filing/local/2026.json');
const counties = readData('local/IN-counties-2026.json').counties;
const districts = readData('local/OH-school-districts-2026.json').districts;
const municipalities = readData('local/OH-municipalities-2026.json').municipalities;

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
  switch (kind) {
    case 'PA-EIT-district': {
      if (!Object.hasOwn(pennsylvania.districts, code)) return { status: 'unknown-code' };
      const district = pennsylvania.districts[code];
      const instructions = code === '51' ? pennsylvania.philadelphia : pennsylvania.act32;
      return {
        status: 'guide',
        jurisdiction: district.district,
        code,
        guide: {
          ...structuredClone(instructions),
          collector: district.collector,
          website: district.website,
          verifiedOn: pennsylvania.verifiedOn,
          sources: [pennsylvania.source, ...instructions.sources],
        },
      };
    }
    case 'IN-county':
      row = counties.find(county => county.countyCode === code);
      agency = 'IN-DOR';
      break;
    case 'OH-school-district':
      row = districts.find(district => district.sdNumber === code);
      agency = 'OH-SDIT';
      break;
    case 'OH-municipality':
      row = municipalities.find(city => city.municode === code);
      if (row?.administeredBy === 'RITA') agency = 'OH-RITA';
      if (row?.administeredBy === 'CCA') agency = 'OH-CCA';
      break;
    default:
      return { status: 'unsupported-jurisdiction-type' };
  }
  if (!row) return { status: 'unknown-code' };
  if (!agency) return { status: 'collector-unverified', jurisdiction: row.name, code };
  return {
    status: 'guide',
    jurisdiction: row.name,
    code,
    agency,
    guide: localAgencyGuide(agency, year),
    confirmMembershipForPeriod: kind === 'OH-municipality',
  };
}
