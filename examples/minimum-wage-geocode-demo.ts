import { resolveMinimumWage } from '../geocode/index.ts';

const CHECK_DATE = '2026-08-15';

const cases: { label: string; address: string; opts?: { employeeCount?: number; tipped?: boolean } }[] = [
  { label: 'NYC office, no employee count given', address: '350 5th Ave, New York, NY 10118' },
  { label: 'Seattle, small employer (under JumpStart-unrelated headcount context)', address: '400 Broad St, Seattle, WA 98109', opts: { employeeCount: 400 } },
  { label: 'Saint Paul MN, small employer (headcount tier)', address: '15 Kellogg Blvd W, Saint Paul, MN 55102', opts: { employeeCount: 50 } },
  { label: 'Portland OR (Portland-metro region rate)', address: '1221 SW 4th Ave, Portland, OR 97204' },
  { label: 'Bend OR (non-urban region rate)', address: '710 NW Wall St, Bend, OR 97703' },
  { label: 'Chicago, IL', address: '121 N LaSalle St, Chicago, IL 60602' },
  { label: 'Evanston, IL (Cook County minus Chicago)', address: '2100 Ridge Ave, Evanston, IL 60201' },
  { label: 'Columbus, OH (no local minimum wage ordinance)', address: '90 W Broad St, Columbus, OH 43215' },
];

for (const c of cases) {
  try {
    const result = await resolveMinimumWage(c.address, CHECK_DATE, c.opts ?? {});
    console.log(`\n${c.label}`);
    console.log(`  matched: ${result.matched}, precision: ${result.precision}`);
    console.log(`  localityMatch: ${JSON.stringify(result.localityMatch)}`);
    console.log(`  region: ${result.region}`);
    if (result.answer) {
      console.log(`  BINDING: $${result.answer.hourly}/hr (${result.answer.bindingLevel}: ${result.answer.bindingJurisdiction})`);
      console.log(`  considered: ${result.answer.considered.map((x) => `${x.level}=${x.cents ?? 'n/a'}`).join(', ')}`);
    }
    if (result.lowConfidenceReasons.length) {
      console.log(`  NOTES: ${result.lowConfidenceReasons.join(' | ')}`);
    }
  } catch (err) {
    console.log(`\n${c.label}\n  ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}
