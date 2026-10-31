/** Server-only, read-only POS adapters. Credentials never enter browser state. */
export type Provider = 'square' | 'toast' | 'csv';
export interface LaborRow {
  sourceId: string;
  workerId: string;
  locationId: string;
  start: string;
  end: string | null;
  regularHours: number | null;
  overtimeHours: number | null;
  paidHours: number;
  hourlyRateCents: number | null;
  reportedTipsCents: number | null;
}
export interface LaborImport { provider: Provider; rows: LaborRow[]; warnings: string[] }
export const catalog = [
  { id: 'square', name: 'Square', capability: 'Read-only timecard import', required: ['SQUARE_ACCESS_TOKEN', 'SQUARE_LOCATION_ID'], note: 'Merchant token for this location. SaaS OAuth onboarding is not implemented.' },
  { id: 'toast', name: 'Toast', capability: 'Read-only labor import', required: ['TOAST_CLIENT_ID', 'TOAST_CLIENT_SECRET', 'TOAST_RESTAURANT_GUID'], note: 'Requires Toast API access and labor scopes. Order-based tip reconciliation is still required.' },
  ...['Clover', 'Lightspeed', 'SpotOn', 'TouchBistro', 'Revel', '7shifts', 'Homebase'].map(name => ({ id: name.toLowerCase(), name, capability: 'CSV import', required: [], note: 'No direct API connector yet. Use the common CSV template.' })),
];
const number = (value: unknown, field: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new Error(`Invalid ${field} in POS response.`);
  return value;
};
function duration(start: string, end: string): number {
  const hours = (Date.parse(end) - Date.parse(start)) / 3600000;
  return number(hours, 'shift duration');
}
export function normalizeSquare(cards: any[]): LaborImport {
  const seen = new Set<string>();
  const rows = cards.map(card => {
    if (!card.id || !card.team_member_id || seen.has(card.id)) throw new Error('Missing or duplicate Square timecard identity.');
    seen.add(card.id);
    const end = card.end_at ?? null;
    const unpaid = (card.breaks ?? []).filter((b: any) => !b.is_paid).reduce((sum: number, b: any) => {
      if (!b.end_at) throw new Error('Square has an open unpaid break. Close it before importing.');
      return sum + duration(b.start_at, b.end_at);
    }, 0);
    return {
      sourceId: card.id, workerId: card.team_member_id, locationId: card.location_id,
      start: card.start_at, end, regularHours: null, overtimeHours: null,
      paidHours: end ? number(duration(card.start_at, end) - unpaid, 'paid hours') : 0,
      hourlyRateCents: card.wage?.hourly_rate?.amount == null ? null : number(card.wage.hourly_rate.amount, 'rate'),
      reportedTipsCents: card.declared_cash_tip_money?.amount == null ? null : number(card.declared_cash_tip_money.amount, 'tips'),
    };
  });
  return { provider: 'square', rows, warnings: ['Square timecards do not settle payroll overtime or card-tip allocation. Review weekly overtime, breaks, job rates and all tips before payroll.'] };
}
export function normalizeToast(entries: any[], locationId: string): LaborImport {
  const seen = new Set<string>();
  const rows = entries.filter(e => !e.deleted).map(e => {
    if (!e.guid || !e.employeeReference?.guid || seen.has(e.guid)) throw new Error('Missing or duplicate Toast time-entry identity.');
    seen.add(e.guid);
    const regular = number(e.regularHours, 'regular hours');
    const overtime = number(e.overtimeHours, 'overtime hours');
    return {
      sourceId: e.guid, workerId: e.employeeReference.guid, locationId, start: e.inDate, end: e.outDate ?? null,
      regularHours: regular, overtimeHours: overtime, paidHours: regular + overtime,
      hourlyRateCents: e.hourlyWage == null ? null : Math.round(number(e.hourlyWage, 'rate') * 100),
      reportedTipsCents: Math.round((number(e.declaredCashTips ?? 0, 'cash tips') + number(e.nonCashTips ?? 0, 'card tips')) * 100),
    };
  });
  return { provider: 'toast', rows, warnings: ['Toast recommends reconciling tips from Orders and tipWithholding configuration. Labor tips are informational and are never automatically posted to payroll.'] };
}
async function request(url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`POS request failed (${response.status}). Check server credentials, permissions and location access.`);
  return response.json();
}
function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Configure ${key} on the server first.`);
  return value;
}
export async function importLabor(provider: string, start: string, end: string): Promise<LaborImport> {
  const from = Date.parse(start), to = Date.parse(end);
  if (!/^\d{4}-\d{2}-\d{2}T/.test(start) || !/^\d{4}-\d{2}-\d{2}T/.test(end) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 28 * 86400000) throw new Error('Use explicit ISO timestamps with timezone, covering at most 28 days. End is exclusive.');
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(start) || !/(Z|[+-]\d{2}:\d{2})$/.test(end)) throw new Error('Include a timezone offset.');
  if (provider === 'square') {
    const locationId = required('SQUARE_LOCATION_ID');
    const host = process.env.SQUARE_ENVIRONMENT === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com';
    let cursor: string | undefined;
    const cursors = new Set<string>();
    const cards: any[] = [];
    do {
      const data = await request(`${host}/v2/labor/timecards/search`, { method: 'POST', headers: { Authorization: `Bearer ${required('SQUARE_ACCESS_TOKEN')}`, 'Content-Type': 'application/json', 'Square-Version': '2025-05-21' }, body: JSON.stringify({ limit: 200, cursor, query: { filter: { location_ids: [locationId], start: { start_at: start, end_at: end } } } }) });
      if (data.errors?.length) throw new Error('Square returned API errors; import was not applied.');
      if (data.timecards != null && !Array.isArray(data.timecards)) throw new Error('Invalid Square timecards response.');
      cards.push(...(data.timecards ?? []));
      cursor = data.cursor;
      if (cursor && cursors.has(cursor)) throw new Error('Square pagination repeated a cursor.');
      if (cursor) cursors.add(cursor);
      if (cursors.size > 100) throw new Error('Import too large; use a shorter date range.');
    } while (cursor);
    if (cards.some(card => card.location_id !== locationId)) throw new Error('Square returned another location.');
    return normalizeSquare(cards);
  }
  if (provider === 'toast') {
    const host = process.env.TOAST_API_HOST ?? 'https://ws-api.toasttab.com';
    if (!/^https:\/\/[a-z0-9-]+\.toasttab\.com$/.test(host)) throw new Error('TOAST_API_HOST must be an HTTPS Toast API hostname.');
    const auth = await request(`${host}/authentication/v1/authentication/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: required('TOAST_CLIENT_ID'), clientSecret: required('TOAST_CLIENT_SECRET'), userAccessType: 'TOAST_MACHINE_CLIENT' }) });
    if (!auth.token?.accessToken) throw new Error('Toast did not issue an access token.');
    const location = required('TOAST_RESTAURANT_GUID');
    const query = new URLSearchParams({ startDate: start, endDate: end, includeArchived: 'false' });
    const entries = await request(`${host}/labor/v1/timeEntries?${query}`, { headers: { Authorization: `Bearer ${auth.token.accessToken}`, 'Toast-Restaurant-External-ID': location } });
    if (!Array.isArray(entries)) throw new Error('Toast returned an invalid labor response.');
    return normalizeToast(entries, location);
  }
  throw new Error('This provider uses CSV import; a direct connector is not implemented.');
}
