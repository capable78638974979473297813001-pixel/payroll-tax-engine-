import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { localAgencyGuide, localWithholdingGuide } from '../payroll/local/filingGuide.mjs';

function rows(file, key) {
  return JSON.parse(readFileSync(new URL('../data/local/' + file + '-2026.json', import.meta.url), 'utf8'))[key];
}

test('every registered Indiana county and taxing Ohio school district routes to its state collector', () => {
  for (const row of rows('IN-counties', 'counties')) {
    const result = localWithholdingGuide('IN-county', row.countyCode, 2026);
    assert.equal(result.agency, 'IN-DOR');
    assert.equal(result.jurisdiction, row.name);
  }
  for (const row of rows('OH-school-districts', 'districts')) {
    const result = localWithholdingGuide('OH-school-district', row.sdNumber, 2026);
    assert.equal(result.agency, 'OH-SDIT');
    assert.equal(result.jurisdiction, row.name);
  }
});

test('regional Ohio collectors use the registry; residual and ambiguous cities remain unresolved', () => {
  for (const row of rows('OH-municipalities', 'municipalities')) {
    const result = localWithholdingGuide('OH-municipality', row.municode, 2026);
    if (!row.municode) {
      assert.equal(result.status, 'unknown-code');
      continue;
    }
    assert.equal(result.jurisdiction, row.name);
    if (row.municode === '12000') {
      assert.equal(result.agency, 'OH-CANTON');
    } else if (row.municode === '15000') {
      assert.equal(result.agency, 'OH-CINCINNATI');
    } else if (row.municode === '18000') {
      assert.equal(result.agency, 'OH-COLUMBUS');
    } else if (row.municode === '21000') {
      assert.equal(result.agency, 'OH-DAYTON');
    } else if (row.municode === '21616') {
      assert.equal(result.agency, 'OH-DELTA');
    } else if (row.municode === '01000') {
      assert.equal(result.agency, 'OH-AKRON');
    } else if (row.municode === '77000') {
      assert.equal(result.agency, 'OH-TOLEDO');
    } else if (row.municode === '71983') {
      assert.equal(result.status, 'collector-unverified');
    } else if (['RITA', 'CCA'].includes(row.administeredBy)) {
      assert.ok(result.membershipSources.length);
      assert.equal(result.agency, 'OH-' + row.administeredBy);
      assert.equal(result.confirmMembershipForPeriod, true);
    } else if (!['57750', '57764', '57792', '21378'].includes(row.municode)) {
      assert.equal(result.status, 'collector-unverified');
    }
  }
});

test('unknown codes and unsupported years never return filing instructions', () => {
  assert.equal(localWithholdingGuide('IN-county', 1, 2026).status, 'unknown-code');
  assert.equal(localWithholdingGuide('OH-school-district', '0203', 2025).status, 'unsupported-year');
  assert.equal(localWithholdingGuide('unknown', '01', 2026).status, 'unsupported-jurisdiction-type');
  assert.equal(localAgencyGuide('toString', 2026), null);
  assert.equal(localAgencyGuide('OH-RITA', 2027), null);
});

test('Pennsylvania tax collection districts preserve the Allegheny split and Philadelphia exception', () => {
  const guide = code => localWithholdingGuide('PA-EIT-district', code, 2026);
  assert.equal(guide('01').guide.collector, 'York Adams Tax Bureau');
  assert.match(guide('70').guide.collector, /Jordan/);
  assert.match(guide('71').guide.collector, /Keystone/);
  assert.match(guide('51').guide.returns[0][0], /Wage Tax/);
  assert.equal(guide('02').status, 'unknown-code');
  assert.equal(guide('constructor').status, 'unknown-code');
});

test('2026 municipal filing routes use county-specific and dated sources', () => {
  for (const [code, agency] of Object.entries({
    '57750': 'OH-RITA', '57764': 'OH-OAKWOOD-MONTGOMERY', '57792': 'OH-CCA',
    '21378': 'OH-RITA', '71486': 'OH-CCA',
  })) {
    const result = localWithholdingGuide('OH-municipality', code, 2026);
    assert.equal(result.agency, agency);
    assert.ok(result.membershipSources.length);
    assert.equal(localWithholdingGuide('OH-municipality', code, 2027).status, 'unsupported-year');
  }
  for (const [code, name] of Object.entries({
    '29932': 'Germantown', '56588': 'North Hampton', '74748': 'Stockport',
  })) {
    const result = localWithholdingGuide('OH-municipality', code, 2026);
    assert.equal(result.jurisdiction, name);
    assert.equal(result.agency, 'OH-RITA');
  }
  assert.equal(localWithholdingGuide('OH-municipality', '', 2026).status, 'unknown-code');
});

test('Ohio zones resolve by Finder zone ID, with explicit gaps', () => {
  for (const zone of rows('OH-jedd-jedz', 'zones')) {
    const result = localWithholdingGuide('OH-jedd-jedz', zone.jeddId, 2026);
    assert.equal(result.jurisdiction, zone.name);
    if (result.status === 'guide') {
      if (result.collectorCodeStatus === 'unverified') {
        assert.equal(result.collectorCode, undefined);
      } else if (['OH-RITA', 'OH-CCA'].includes(result.agency)) {
        assert.match(result.collectorCode, /^\d{3}$/);
      }
      assert.ok(result.membershipSources.length);
    } else {
      assert.equal(result.status, 'collector-unverified');
    }
  }
  assert.equal(localWithholdingGuide('OH-jedd-jedz', '981', 2026).status, 'unknown-code');
});

test('collector filing codes preserve leading zeroes and district subdivisions', () => {
  for (const [code, agency, collectorCode] of [
    ['9143', 'OH-RITA', '047'], ['9142', 'OH-RITA', '247'],
    ['9003', 'OH-RITA', '037'], ['9055', 'OH-CCA', '981'],
    ['9115', 'OH-RITA', '145'], ['9118', 'OH-RITA', '144'],
    ['9132', 'OH-CCA', '982'], ['9072', 'OH-CCA', '990'],
  ]) {
    const result = localWithholdingGuide('OH-jedd-jedz', code, 2026);
    assert.equal(result.agency, agency);
    assert.equal(result.collectorCode, collectorCode);
  }
  assert.equal(localWithholdingGuide('OH-jedd-jedz', '9156', 2026).status, 'collector-unverified');
});

test('municipal filing routes preserve transitions and distinguish the two Shawnee Hills', () => {
  const lookup = code => localWithholdingGuide('OH-municipality', code, 2026);
  assert.equal(lookup('21616').agency, 'OH-DELTA');
  assert.equal(lookup('71976').agency, 'OH-RITA');
  assert.equal(lookup('71983').status, 'collector-unverified');
  for (const code of ['54866', '52682', '61504', '45094']) {
    assert.equal(lookup(code).administrationStartedOn, code === '45094' ? '2026-10-01' : '2026-07-01');
    assert.match(lookup(code).filingNote, /earlier periods/);
  }
});

test('PA EIT instructions follow the appointed collector across the district directory', () => {
  const directory = JSON.parse(readFileSync(new URL('../data/filing/local/PA-districts-2026.json', import.meta.url)));
  for (const [code, district] of Object.entries(directory.districts)) {
    const { guide } = localWithholdingGuide('PA-EIT-district', code, 2026);
    if (district.collector === 'Keystone Collections Group') {
      assert.match(guide.payment, /electronically/);
      assert.ok(guide.sources.includes('https://keystonecollects.com/mandatory-electronic-filing-for-employers/'));
    } else if (district.collector === 'Berkheimer Tax Administrator') {
      assert.equal(guide.returns[0][0], 'E1');
      assert.match(guide.payment, /ACH debit/);
      assert.match(guide.filing, /combined monthly filers must use electronic file upload/i);
    } else {
      assert.doesNotMatch(guide.payment, /Keystone|Berkheimer/);
    }
    assert.ok(guide.sources.includes(directory.source));
  }
});

test('PA LST uses a separately identified collector and its own form and remittance instructions', () => {
  const hab = localAgencyGuide('PA-BERKHEIMER-LST', 2026);
  assert.equal(hab.returns[0][0], 'LST-1');
  assert.match(hab.filing, /25156/);
  const keystone = localAgencyGuide('PA-KEYSTONE-LST', 2026);
  assert.match(keystone.returns[0][1], /zero-filing/);
  assert.match(keystone.payment, /electronically/);
  assert.equal(localWithholdingGuide('PA-LST-district', '71', 2026).status, 'unsupported-jurisdiction-type');
  assert.equal(localAgencyGuide('PA-KEYSTONE-LST', 2025), null);
});

test('all Act 32 districts return collector filing channels and preserve local requirements', () => {
  const directory = JSON.parse(readFileSync(new URL('../data/filing/local/PA-districts-2026.json', import.meta.url)));
  const lookup = code => localWithholdingGuide('PA-EIT-district', code, 2026).guide;
  for (const [code, district] of Object.entries(directory.districts)) {
    if (code === '51') continue;
    const guide = lookup(code);
    assert.ok(directory.collectorInstructions[district.collector]);
    assert.notEqual(guide.filing, directory.act32.filing);
    assert.notEqual(guide.payment, directory.act32.payment);
    assert.match(guide.returns[0][1], /last day of the month|February 1, 2027/);
  }
  assert.match(lookup('31').filing, /26 or more employees must/);
  assert.match(lookup('21').filing, /20 or more employees must/);
  assert.match(lookup('26').filing, /requests electronic detail/);
  assert.match(lookup('73').filing, /require electronic returns/);
  assert.match(lookup('36').returns[1][1], /Confirm with the bureau/);
  assert.equal(lookup('28').returns[1][0], '541');
  assert.match(lookup('51').returns[0][0], /Wage Tax/);
});

test('Michigan city guides distinguish state and municipal filing offices', () => {
  const lookup = city => localWithholdingGuide('MI-city', city, 2026);
  assert.equal(lookup('Detroit').agency, 'MI-DETROIT');
  assert.deepEqual(lookup('Detroit').guide.returns.map(([form]) => form), ['5323', '5321']);
  assert.match(lookup('Grand Rapids').guide.registration, /SS-4/);
  assert.equal(lookup('Lansing').guide.returns[0][0], 'L-941');
  assert.equal(lookup('  east lansing ').guide.returns[0][0], 'EL-501');
  assert.equal(lookup('Lansing Township').status, 'unknown-code');
  assert.equal(localWithholdingGuide('MI-city', 'Detroit', 2027).status, 'unsupported-year');
  for (const row of rows('MI-cities', 'cities')) {
    const result = lookup(row.name);
    assert.equal(result.jurisdiction, row.name);
    assert.equal(result.status, 'guide');
    assert.ok(result.guide.sources.length);
    for (const field of ['registration', 'returns', 'filing', 'payment']) {
      assert.ok(result.guide[field].length, row.name + ' lacks ' + field);
    }
  }
});

test('Michigan employer guides preserve city-specific filing and remittance instructions', () => {
  const guide = city => localWithholdingGuide('MI-city', city, 2026).guide;
  assert.match(guide('Grayling').filing, /PO Box 549, Grayling/);
  assert.match(guide('Hamtramck').filing, /PO Box 209/);
  assert.match(guide('Highland Park').filing, /PO Box 239/);
  assert.match(guide('Port Huron').filing, /100 or more employees/);
  assert.match(guide('Springfield').returns[0][1], /\$100 or more/);
  assert.match(guide('Walker').filing, /Upload W-2s before/);
  assert.notEqual(guide('Muskegon').collector, guide('Muskegon Heights').collector);
  assert.match(guide('Ionia').returns[1][1], /Confirm/);
});

test('Missouri city routes distinguish quarterly, annual and employer-only filings', () => {
  const lookup = city => localWithholdingGuide('MO-city', city, 2026);
  const kc = lookup(' Kansas City ');
  assert.equal(kc.agency, 'MO-KANSAS-CITY');
  assert.deepEqual(kc.guide.returns.map(([form]) => form), ['RD-110', 'RD-130M / RD-130QM', 'RD-113']);
  for (const city of ['St. Louis', 'St Louis', 'Saint Louis']) {
    const result = lookup(city);
    assert.equal(result.jurisdiction, 'St. Louis');
    assert.deepEqual(result.guide.returns.map(([form]) => form), ['W-10', 'P-10', 'W-3']);
  }
  assert.equal(lookup('St. Louis County').status, 'unknown-code');
  assert.equal(lookup('North Kansas City').status, 'unknown-code');
  assert.equal(localWithholdingGuide('MO-city', 'Kansas City', 2027).status, 'unsupported-year');
});

test('Wilmington routes city withholding and preserves the intermediate and W-2 thresholds', () => {
  const result = localWithholdingGuide('DE-city', ' wilMington ', 2026);
  assert.equal(result.agency, 'DE-WILMINGTON');
  assert.match(result.guide.returns[1][1], /exceeds \$50 in the first or second month/);
  assert.match(result.guide.filing, /50 or more city-taxable employees/);
  assert.match(result.guide.filing, /RS record in the EFW2 file/);
  assert.equal(localWithholdingGuide('DE-city', 'Wilmington Manor', 2026).status, 'unknown-code');
});

test('Denver routes occupational privilege tax to Treasury and preserves the monthly filing threshold', () => {
  const result = localWithholdingGuide('CO-city', ' DENVER ', 2026);
  assert.equal(result.agency, 'CO-DENVER');
  assert.match(result.guide.returns[0][1], /taxable employees, owners and partners/);
  assert.match(result.guide.returns[0][1], /reaches 10 in a month/);
  assert.match(result.guide.returns[1][1], /no employees liable during the year/);
  assert.match(result.guide.payment, /Denver eBiz/);
  assert.equal(localWithholdingGuide('CO-city', 'Denver metro', 2026).status, 'unknown-code');
});

test('Colorado cities use their own OPT deadlines and payment portals', () => {
  const lookup = city => localWithholdingGuide('CO-city', city, 2026);
  const glendale = lookup('Glendale').guide;
  assert.match(glendale.returns[0][1], /20th of the month/);
  assert.match(glendale.payment, /Glendale MUNIRevs/);
  const village = lookup(' GREENWOOD VILLAGE ').guide;
  assert.match(village.payment, /Xpress Bill Pay/);
  assert.match(village.registration, /PEO/);
  assert.match(lookup('Sheridan').guide.returns[0][1], /fewer than 10 employees/);
  assert.equal(lookup('Aurora').status, 'unknown-code');
  assert.equal(lookup('Sheridan Lake').status, 'unknown-code');
});

test('Kentucky metro and school collectors have distinct filing requirements', () => {
  const louisville = localAgencyGuide('KY-LMRC', 2026);
  const lexington = localAgencyGuide('KY-LFUCG', 2026);
  const schools = localAgencyGuide('KY-FCPS', 2026);
  assert.deepEqual(louisville.returns.map(([form]) => form), ['W-1', 'W-1D', 'W-3']);
  assert.match(louisville.returns[1][1], /exceeds \$3,000/);
  assert.match(lexington.returns[0][1], /exceeds \$300/);
  assert.deepEqual(schools.returns.map(([form]) => form), ['220-221-S', '222-S']);
  assert.match(schools.payment, /Send the return separately/);
  assert.equal(localAgencyGuide('KY-FCPS', 2025), null);
});

test('Kenton and Covington have separate collectors and remittance instructions', () => {
  const county = localAgencyGuide('KY-KENTON', 2026);
  const city = localAgencyGuide('KY-COVINGTON', 2026);
  assert.deepEqual(county.returns.map(([form]) => form), ['QCC1', 'KC-AR']);
  assert.match(county.filing, /without payment.*PO Box 792/);
  assert.match(county.payment, /with payment.*PO Box 706237/);
  assert.match(city.returns[0][1], /exceeded \$450 in any of the preceding four quarters/);
  assert.match(city.returns[0][1], /Confirm with Finance before relying on a 31st deadline/);
  assert.match(city.filing, /also file with Kenton County/);
});

test('Bowling Green, Warren County and the school district have separate filing instructions', () => {
  const city = localAgencyGuide('KY-BOWLING-GREEN', 2026);
  const county = localAgencyGuide('KY-WARREN', 2026);
  const school = localAgencyGuide('KY-WARREN-SCHOOLS', 2026);
  assert.match(city.returns[0][1], /conversion date in the city notice/);
  assert.match(city.payment, /PO Box 643791/);
  assert.match(county.returns[1][1], /March 1, 2027/);
  assert.match(school.returns[0][1], /residents of the Warren County School District/);
  assert.match(school.filing, /PO Box 51530/);
  assert.equal(localAgencyGuide('KY-WARREN-SCHOOLS', 2027), null);
});

test('Owensboro and Daviess use one periodic return and jurisdiction-specific reconciliations', () => {
  const guide = localAgencyGuide('KY-OWENSBORO-DAVIESS', 2026);
  const [periodic, annual] = guide.returns;
  assert.equal(periodic[0], 'E-1');
  assert.match(periodic[1], /inside Owensboro in column A and wages earned elsewhere in Daviess County in column B/);
  assert.match(periodic[1], /December, which is due January 31/);
  assert.equal(annual[0], 'REC');
  assert.match(annual[1], /separate reconciliations/);
  assert.match(guide.payment, /PO Box 10008/);
});

test('Kentucky annual employer reconciliations apply the statutory Sunday rule to 2026 wages', () => {
  const agencies = ['KY-LFUCG', 'KY-KENTON', 'KY-COVINGTON', 'KY-BOWLING-GREEN', 'KY-OWENSBORO-DAVIESS'];
  for (const agency of agencies) {
    const guide = localAgencyGuide(agency, 2026);
    const annual = guide.returns.at(-1)[1];
    assert.match(annual, /March 1, 2027/, agency);
    assert.ok(guide.sources.some(url => url.endsWith('id=19391')), agency);
  }
  assert.match(localAgencyGuide('KY-BOWLING-GREEN', 2026).filing, /special taxing districts/);
});

test('Alabama employer filings use the correct city portal and reporting frequency', () => {
  const lookup = city => localWithholdingGuide('AL-city', city, 2026);
  const birmingham = lookup(' birmingham ').guide;
  assert.match(birmingham.returns[0][1], /averaged less than \$50/);
  assert.match(birmingham.payment, /HdL/);
  const gadsden = lookup('Gadsden').guide;
  assert.equal(gadsden.returns[1][0], 'G-3');
  assert.match(gadsden.filing, /TekConnectGov/);
  assert.equal(lookup('Denver').status, 'unknown-code');
  assert.equal(localWithholdingGuide('CO-city', 'Birmingham', 2026).status, 'unknown-code');
});

test('Auburn and Opelika distinguish due dates, delinquency and receipt', () => {
  const lookup = city => localWithholdingGuide('AL-city', city, 2026);
  const auburn = lookup(' Auburn ').guide;
  assert.match(auburn.returns[0][1], /first day of the month after quarter-end/);
  assert.match(auburn.returns[1][1], /Attach Form W-3/);
  const opelika = lookup('opelika').guide;
  assert.deepEqual(opelika.returns.map(([form]) => form), ['0-1', '0-3']);
  assert.match(opelika.returns[0][1], /postmark does not establish timely receipt/);
  assert.match(opelika.returns[1][1], /1% effective April 1, 2025/);
  assert.equal(lookup('Auburn Hills').status, 'unknown-code');
});

test('Bessemer collects quarterly and Leeds uses its monthly Avenu jurisdiction code', () => {
  const lookup = city => localWithholdingGuide('AL-city', city, 2026).guide;
  const bessemer = lookup('Bessemer');
  assert.match(bessemer.returns[0][1], /20th of the month after quarter-end/);
  assert.match(bessemer.filing, /1700 3rd Avenue North/);
  const leeds = lookup(' leeds ');
  assert.match(leeds.returns[0][1], /monthly withholding/);
  assert.match(leeds.returns[0][1], /code 9401/);
  assert.match(leeds.payment, /Tax Trust Account/);
});

test('Oregon employer transit district codes share Form OQ and exclude statewide withholding', () => {
  const lookup = code => localWithholdingGuide('OR-transit-district', code, 2026);
  for (const [code, name] of [['TM', 'TriMet Transit District'], ['LTD', 'Lane Transit District']]) {
    const result = lookup(code);
    assert.equal(result.jurisdiction, name);
    assert.equal(result.agency, 'OR-DOR-TRANSIT');
    assert.equal(result.guide.returns[0][0], 'Form OQ');
    assert.match(result.guide.returns[1][1], /February 1, 2027/);
    assert.match(result.guide.filing, /Frances Online/);
  }
  assert.equal(lookup('STT').status, 'unknown-code');
  assert.equal(lookup('Lane County').status, 'unknown-code');
});

test('Eugene city payroll returns are separate from Lane transit reporting', () => {
  const city = localWithholdingGuide('OR-city', ' eugene ', 2026);
  assert.equal(city.agency, 'OR-EUGENE');
  assert.deepEqual(city.guide.returns.map(([form]) => form), ['EUG-PY-1', 'EUG-PY-2']);
  assert.match(city.guide.returns[1][1], /EUG-ED/);
  assert.match(city.guide.payment, /separate check/);
  assert.equal(localWithholdingGuide('OR-city', 'LTD', 2026).status, 'unknown-code');
  assert.equal(localWithholdingGuide('OR-transit-district', 'Eugene', 2026).status, 'unknown-code');
});

test('Columbus city code routes to its own quarterly and annual forms', () => {
  const result = localWithholdingGuide('OH-municipality', '18000', 2026);
  assert.equal(result.membershipVerifiedOn, '2026-11-12');
  assert.deepEqual(result.guide.returns.map(([form]) => form), ['IT-11', 'IT-13']);
  assert.match(result.guide.returns[0][1], /February 1, 2027/);
  assert.match(result.guide.returns[1][1], /March 1, 2027/);
  assert.notEqual(localWithholdingGuide('OH-municipality', '18014', 2026).agency, result.agency);
});

test('Cincinnati routes its own employer coupons and W-3 reconciliation', () => {
  const result = localWithholdingGuide('OH-municipality', '15000', 2026);
  assert.equal(result.jurisdiction, 'Cincinnati');
  assert.equal(result.membershipVerifiedOn, '2026-11-12');
  assert.equal(result.guide.returns[1][0], 'W-3');
  assert.match(result.guide.returns[1][1], /March 1, 2027/);
  assert.match(result.guide.payment, /when the federal deposit is due/);
});

test('Toledo city coupons and W-3 use the 2026 packet deadlines', () => {
  const result = localWithholdingGuide('OH-municipality', '77000', 2026);
  assert.equal(result.jurisdiction, 'Toledo');
  assert.equal(result.membershipVerifiedOn, '2026-11-12');
  assert.match(result.guide.returns[0][1], /February 1, 2027/);
  assert.equal(result.guide.returns[1][0], 'W-3');
  assert.match(result.guide.returns[1][1], /March 1, 2027/);
  assert.notEqual(localWithholdingGuide('OH-jedd-jedz', '9065', 2026).agency, result.agency);
});

test('Dayton city withholding and the two township JEDDs use distinct routes', () => {
  const result = localWithholdingGuide('OH-municipality', '21000', 2026);
  assert.equal(result.jurisdiction, 'Dayton');
  assert.equal(result.guide.returns[0][0], 'DW-1');
  assert.match(result.guide.returns[1][1], /March 1, 2027/);
  for (const district of ['9080', '9081']) {
    assert.notEqual(localWithholdingGuide('OH-jedd-jedz', district, 2026).agency, result.agency);
  }
});

test('Canton city withholding is distinct from North Canton and the Jackson Township JEDD', () => {
  const city = localWithholdingGuide('OH-municipality', '12000', 2026);
  assert.equal(city.agency, 'OH-CANTON');
  assert.equal(city.jurisdiction, 'Canton');
  assert.match(city.guide.returns[0][1], /preceding quarter/);
  assert.match(city.guide.returns[1][1], /March 1, 2027/);
  assert.notEqual(localWithholdingGuide('OH-municipality', '56294', 2026).agency, city.agency);
  assert.notEqual(localWithholdingGuide('OH-jedd-jedz', '9105', 2026).agency, city.agency);
});

test('Akron city withholding has its own deadlines and excludes its four JEDDs', () => {
  const city = localWithholdingGuide('OH-municipality', '01000', 2026);
  assert.equal(city.agency, 'OH-AKRON');
  assert.match(city.guide.returns[0][1], /February 1, 2027/);
  assert.equal(city.guide.returns[1][0], 'AW-3');
  assert.match(city.guide.returns[1][1], /March 1, 2027/);
  for (const district of ['9004', '9014', '9015', '9042']) {
    assert.notEqual(localWithholdingGuide('OH-jedd-jedz', district, 2026).agency, city.agency);
  }
});

test('Springfield city and its airport district use separate RITA filing codes', () => {
  const airport = localWithholdingGuide('OH-jedd-jedz', '9041', 2026);
  const city = localWithholdingGuide('OH-municipality', '74118', 2026);
  assert.equal(airport.agency, 'OH-RITA');
  assert.equal(airport.collectorCode, '872');
  assert.equal(airport.membershipVerifiedOn, '2026-11-12');
  assert.deepEqual(airport.guide.returns.slice(0, 2).map(([form]) => form), ['11', '17']);
  assert.equal(city.collectorCode, '773');
  assert.equal(localWithholdingGuide('OH-jedd-jedz', '872', 2026).status, 'unknown-code');
});

test('Akron district accounts use JW-3 while the city uses AW-3', () => {
  for (const id of ['9004', '9014', '9015', '9042']) {
    const result = localWithholdingGuide('OH-jedd-jedz', id, 2026);
    assert.equal(result.agency, 'OH-AKRON-JEDD');
    assert.equal(result.guide.returns[1][0], 'JW-3');
    assert.match(result.guide.returns[1][1], /March 1, 2027/);
    assert.equal(result.collectorCode, undefined);
  }
  assert.equal(localWithholdingGuide('OH-municipality', '01000', 2026).guide.returns[1][0], 'AW-3');
});

test('Dayton township districts select the matching DW-1 and flag the city-only DW-3 lines', () => {
  for (const [id, name, coupon] of [['9080', 'Miami', 'MT-DAY'], ['9081', 'Butler', 'BT-DAY']]) {
    const result = localWithholdingGuide('OH-jedd-jedz', id, 2026);
    assert.equal(result.agency, 'OH-DAYTON-' + name.toUpperCase() + '-JEDD');
    assert.equal(result.guide.returns[0][0], 'DW-1 ' + coupon + ' JEDD');
    assert.match(result.guide.returns[1][1], /Ask Dayton how to report district wages/);
    assert.match(result.guide.payment, /643700/);
  }
  assert.match(localAgencyGuide('OH-DAYTON', 2026).filing, /100 or more employee records/);
});

test('Jefferson Township-Washington Court House uses district W1 coupons and a district payee', () => {
  const result = localWithholdingGuide('OH-jedd-jedz', '9129', 2026);
  assert.equal(result.agency, 'OH-JEFFERSON-WASHINGTON-CH-JEDD');
  assert.match(result.guide.registration, /JEDD Business Questionnaire/);
  assert.equal(result.guide.returns[0][0], 'W1 1108');
  assert.match(result.guide.returns[1][1], /March 1, 2027/);
  assert.match(result.guide.payment, /payable to Jefferson Township-Washington Court House JEDD/);
  assert.notEqual(localWithholdingGuide('OH-jedd-jedz', '9123', 2026).agency, result.agency);
});

test('Jersey-New Albany districts have separate RITA memberships beginning in May 2026', () => {
  for (const [finder, memberPage] of [['9158', '910'], ['9159', '911'], ['9160', '913']]) {
    const district = localWithholdingGuide('OH-jedd-jedz', finder, 2026);
    assert.equal(district.agency, 'OH-RITA');
    assert.equal(district.administrationStartedOn, '2026-05-01');
    assert.ok(district.membershipSources.some(url => url.endsWith('id=' + memberPage)));
    assert.match(district.filingNote, /separately on Form 11/);
    assert.equal(district.collectorCodeStatus, 'unverified');
    assert.equal(district.collectorCode, undefined);
  }
  assert.equal(localWithholdingGuide('OH-municipality', '53970', 2026).collectorCode, '535');
});

test('Kent district lookups retain the July 2026 collection handoff', () => {
  for (const id of ['9009', '9021']) {
    const district = localWithholdingGuide('OH-jedd-jedz', id, 2026);
    assert.equal(district.agency, 'OH-RITA');
    assert.equal(district.administrationStartedOn, '2026-07-01');
    assert.match(district.filingNote, /earlier periods and amendments with Kent/);
    assert.equal(district.collectorCodeStatus, 'unverified');
    assert.equal(district.collectorCode, undefined);
  }
  assert.equal(localWithholdingGuide('OH-municipality', '39872', 2026).collectorCode, '392');
});

test('Xenia district withholding uses its own RITA code', () => {
  const district = localWithholdingGuide('OH-jedd-jedz', '9097', 2026);
  assert.equal(district.agency, 'OH-RITA');
  assert.equal(district.collectorCode, '859');
  assert.equal(localWithholdingGuide('OH-municipality', '86772', 2026).collectorCode, '905');
});

test('Beachwood East, West and city preserve three distinct RITA filing codes', () => {
  for (const [finder, code] of [['9005', '051'], ['9006', '052']]) {
    const zone = localWithholdingGuide('OH-jedd-jedz', finder, 2026);
    assert.equal(zone.agency, 'OH-RITA');
    assert.equal(zone.collectorCode, code);
    assert.equal(zone.membershipVerifiedOn, '2026-11-13');
    assert.deepEqual(zone.guide.returns.slice(0, 2).map(([form]) => form), ['11', '17']);
  }
  assert.equal(localWithholdingGuide('OH-municipality', '04500', 2026).collectorCode, '050');
});

test('Eaton and Elyria township districts route separately from Elyria city', () => {
  for (const [finder, code] of [['9016', '292'], ['9017', '282']]) {
    const district = localWithholdingGuide('OH-jedd-jedz', finder, 2026);
    assert.equal(district.agency, 'OH-RITA');
    assert.equal(district.collectorCode, code);
    assert.deepEqual(district.guide.returns.slice(0, 2).map(([form]) => form), ['11', '17']);
  }
  assert.equal(localWithholdingGuide('OH-municipality', '25256', 2026).collectorCode, '277');
});

test('Kenwood JEDZ worksites select the appropriate employer registration and forms', () => {
  for (const [id, agency, form] of [
    ['9057', 'OH-KENWOOD-MADEIRA', 'JEDZ employer withholding'],
    ['9058', 'OH-KENWOOD-MADEIRA', 'JEDZ employer withholding'],
    ['9059', 'OH-KENWOOD-NORTHWEST', 'JEDZ Withholding Payments Form'],
    ['9060', 'OH-KENWOOD-SOUTHWEST', 'JEDZ withholding remittance'],
  ]) {
    const result = localWithholdingGuide('OH-jedd-jedz', id, 2026);
    assert.equal(result.agency, agency);
    assert.equal(result.guide.returns[0][0], form);
    assert.match(result.guide.returns[1][1], /March 1, 2027/);
  }
  assert.notEqual(localWithholdingGuide('OH-jedd-jedz', '9138', 2026).agency, 'OH-KENWOOD-NORTHWEST');
});

test('Deer Park provides separate employer forms for Kenwood JEDD and Northwest JEDZ', () => {
  for (const [id, prefix] of [['9138', 'JEDD'], ['9059', 'JEDZ']]) {
    const result = localWithholdingGuide('OH-jedd-jedz', id, 2026);
    assert.equal(result.guide.returns[0][0], prefix + ' Withholding Payments Form');
    assert.equal(result.guide.returns[1][0], prefix + ' Year-End Reconciliation Form');
    assert.match(result.guide.returns[0][1], /quarterly accounts, Deer Park publishes the 15th/);
    assert.match(result.guide.returns[0][1], /last day of that month/);
  }
});

test('Newark-administered districts select their own withholding packets and mailing boxes', () => {
  for (const [id, name, box] of [
    ['9049', 'Etna JEDZ North', '327'],
    ['9050', 'Etna JEDZ South', '582'],
    ['9034', 'Pataskala JEDD', '327'],
  ]) {
    const { guide } = localWithholdingGuide('OH-jedd-jedz', id, 2026);
    assert.equal(guide.returns[0][0], name + ' Payroll Withholding');
    assert.ok(guide.filing.includes('PO Box ' + box + ','));
    assert.match(guide.returns[1][1], /March 1, 2027/);
    assert.match(guide.payment, /enroll separately/);
  }
});

test('Monclova-Maumee-Toledo selects its zone return and payroll-agent EFT rule', () => {
  const district = localWithholdingGuide('OH-jedd-jedz', '9053', 2026);
  assert.equal(district.agency, 'OH-MMT-JEDZ');
  assert.equal(district.guide.returns[0][0], 'MMT-W-1');
  assert.match(district.guide.payment, /EFT unless the tax administrator grants an exemption/);
  assert.match(district.guide.returns[1][1], /March 1, 2027/);
  assert.notEqual(localWithholdingGuide('OH-jedd-jedz', '9065', 2026).agency, district.agency);
});

test('Toledo Express Airport and Troy Township use distinct JEDD accounts and W-3s', () => {
  for (const [zone, prefix] of [['9065', 'TEA'], ['9067', 'TROY']]) {
    const result = localWithholdingGuide('OH-jedd-jedz', zone, 2026);
    assert.equal(result.agency, 'OH-TOLEDO-' + prefix + '-JEDD');
    assert.equal(result.guide.returns[1][0], prefix + ' JEDD W-3');
    assert.match(result.guide.returns[1][1], /March 1, 2027/);
    assert.match(result.guide.returns[0][1], /30-day postmark rule/);
  }
  assert.equal(localWithholdingGuide('OH-municipality', '77000', 2026).agency, 'OH-TOLEDO');
});
