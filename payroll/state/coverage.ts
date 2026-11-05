import { coverage, modelledStates } from './profile.ts';

/** The text of docs/STATE-COVERAGE.md, generated from the profiles so it cannot drift from what the code covers. */
export function renderCoverage(): string {
  const rows = coverage();
  const modelled = modelledStates();
  const count = (pick: (r: (typeof rows)[number]) => string, v: string) => rows.filter((r) => pick(r) === v).length;
  const lines = [
    '# State filing coverage',
    '',
    '_Generated from `data/filing/` by `scripts/state-coverage.ts`; `tests/state-coverage.test.ts` fails if this file is stale. Do not edit by hand._',
    '',
    `**${rows.length} jurisdictions** (the 53 unemployment-tax agencies the US Department of Labor lists: 50 states, DC, Puerto Rico, US Virgin Islands). **${modelled.length} have a state profile** (${modelled.join(', ')}). The rest are **NOT MODELLED**: their own documents have not been read, and nothing is assumed about what they require. A row saying NOT MODELLED does not mean nothing is owed.`,
    '',
    `Unemployment reporting modelled for ${count((r) => r.functions.ui, 'modelled')} of ${rows.length}. Withholding deposits modelled for ${count((r) => r.functions.withholding, 'modelled')}, partly for ${count((r) => r.functions.withholding, 'partial')}. New-hire reporting modelled for ${count((r) => r.functions.newHire, 'modelled')}.`,
    '',
    '**Nothing is transmitted to any state.** No state transport is connected; the sandbox rehearses and says so, and live transports refuse with the enrollment steps each profile records.',
    '',
    '| Code | Jurisdiction | UI tax agency (DOL directory) | Withholding | Unemployment | New hire |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r.code} | ${r.jurisdiction} | ${r.uiAgency.replace(/\|/g, '/')} | ${r.functions.withholding} | ${r.functions.ui} | ${r.functions.newHire} |`),
    '',
    'Withholding **partial** means the return and its due dates are modelled but the deposit schedule is not. **no wage income tax** means the registry records no wage income tax for that jurisdiction.',
    '',
  ];
  return lines.join('\n');
}
