import { createServer } from 'node:http';
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { catalog, importLabor } from './pos.ts';
import { workspace, reviewPayroll, commitReview, isoDate } from './workflow.ts';
import type { Review } from './workflow.ts';
import { getCompany, employeesForCompany, withPayrollDb } from '../payroll/store.ts';
import { freshYearToDate } from '../payroll/ytd.ts';
import { register, login, createSession, session, logout } from './auth.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
const port = Number(process.env.PORT ?? 4324);
const origin = process.env.RESTAURANT_ORIGIN ?? `http://127.0.0.1:${port}`;
const allowed = new Set([origin, ...(!process.env.RESTAURANT_ORIGIN ? [`http://localhost:${port}`] : [])]);
const reviews = new Map<string, { review: Review; expires: number; accountId: string }>();
const attempts = new Map<string, { count: number; reset: number }>();
const json = (res: ServerResponse, status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
async function body(req: IncomingMessage) { let text = ''; for await (const chunk of req) { text += chunk; if (Buffer.byteLength(text) > 1000000) throw new Error('Request exceeds 1 MB.'); } return JSON.parse(text || '{}'); }
function cookie(token: string, clear = false) { return `restaurant_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${clear ? 0 : 28800}${origin.startsWith('https:') ? '; Secure' : ''}`; }
function draftPath(id: string) { const dir = process.env.RESTAURANT_AUTH_DIR ?? join(import.meta.dirname, '.data'); mkdirSync(dir, { recursive: true }); return join(dir, `${id}.draft.json`); }
const states = new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' '));
createServer(async (req, res) => {
  try {
    const requestOrigin = `http${origin.startsWith('https:') ? 's' : ''}://${req.headers.host}`;
    if (!allowed.has(requestOrigin)) return json(res, 403, { error: 'Unrecognized application host.' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'same-origin');
    if (req.method === 'GET' && ['/', '/login', '/signup', '/app'].includes(req.url ?? '')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
      return res.end(readFileSync(new URL('./app.html', import.meta.url), 'utf8'));
    }
    if (req.method === 'POST' && (!req.headers.origin || !allowed.has(req.headers.origin))) return json(res, 403, { error: 'Request origin is not allowed.' });
    const token = (req.headers.cookie ?? '').split(';').map(s => s.trim()).find(s => s.startsWith('restaurant_session='))?.slice(19) ?? '';
    if (req.method === 'POST' && ['/api/auth/signup', '/api/auth/login'].includes(req.url ?? '')) {
      const key = req.socket.remoteAddress ?? 'local', now = Date.now();
      for (const [id, a] of attempts) if (a.reset <= now) attempts.delete(id);
      const attempt = attempts.get(key) ?? { count: 0, reset: now + 15 * 60000 }; attempts.set(key, attempt);
      if (++attempt.count > 20) return json(res, 429, { error: 'Too many sign-in attempts. Try again in 15 minutes.' });
      const input = await body(req), account = req.url?.endsWith('signup') ? register(input.email, input.password, input.name) : login(input.email, input.password);
      const created = createSession(account); res.setHeader('Set-Cookie', cookie(created.token));
      return json(res, 200, { name: account.name, csrf: created.csrf });
    }
    const auth = session(token);
    if (!auth) return json(res, 401, { error: 'Sign in to your restaurant workspace.' });
    if (req.method === 'POST' && req.headers['x-restaurant-csrf'] !== auth.csrf) return json(res, 403, { error: 'Your session changed. Reload and try again.' });
    const companyId = auth.account.companyId;
    if (req.method === 'POST' && req.url === '/api/auth/logout') { logout(token); res.setHeader('Set-Cookie', cookie('', true)); return json(res, 200, { ok: true }); }
    if (req.method === 'GET' && req.url === '/api/workspace') return json(res, 200, { ...workspace(companyId), csrf: auth.csrf, user: { name: auth.account.name, email: auth.account.email }, integrations: catalog.map(c => ({ ...c, configured: process.env.RESTAURANT_POS_COMPANY_ID === companyId && c.required.length > 0 && c.required.every(key => Boolean(process.env[key])) })) });
    if (req.url === '/api/draft') {
      if (req.method === 'GET') { let draft = null; try { draft = JSON.parse(readFileSync(draftPath(auth.account.id), 'utf8')); } catch (e: any) { if (e.code !== 'ENOENT') throw e; } return json(res, 200, { draft }); }
      if (req.method === 'POST') { const data = await body(req); const path = draftPath(auth.account.id), temp = `${path}.tmp`; writeFileSync(temp, JSON.stringify(data), { mode: 0o600 }); renameSync(temp, path); return json(res, 200, { ok: true }); }
    }
    if (req.method === 'POST' && req.url === '/api/setup') {
      const data = await body(req);
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.length > 120 || !states.has(data.state) || !['weekly', 'biweekly'].includes(data.frequency) || !isoDate(data.anchor)) throw new Error('Enter a restaurant name, state, pay schedule and valid first period start.');
      withPayrollDb(db => { if (db.companies[companyId]) throw new Error('Restaurant is already set up.'); db.companies[companyId] = { id: companyId, legalName: data.name.trim(), ein: '', homeState: data.state, paySchedule: { frequency: data.frequency, anchorPeriodStart: data.anchor, checkDateLagDays: 5 } }; });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/api/employees') {
      const d = await body(req), company = getCompany(companyId);
      if (!company) throw new Error('Set up your restaurant first.');
      if (![d.firstName, d.lastName, d.jobTitle].every(v => typeof v === 'string' && v.trim() && v.length <= 80) || !Number.isSafeInteger(d.rate) || d.rate < 1 || d.rate > 100000 || !isoDate(d.hireDate) || !states.has(d.residenceState) || !['single', 'married_joint', 'married_separate', 'head_of_household'].includes(d.filingStatus)) throw new Error('Check the employee name, role, hourly rate, hire date, residence state and W-4 filing status.');
      const id = randomUUID();
      withPayrollDb(db => { db.employees[id] = { id, companyId, firstName: d.firstName.trim(), lastName: d.lastName.trim(), jobTitle: d.jobTitle.trim(), department: d.department === 'Front of house' ? 'Front of house' : 'Back of house', hireDate: d.hireDate, employmentCategory: 'standard', payType: { kind: 'hourly', hourlyRate: d.rate }, residenceState: { code: d.residenceState }, federalW4: { filingStatus: d.filingStatus, multipleJobs: false, dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 }, deductionPlans: [], directDepositAccounts: [], garnishmentOrders: [], ytd: freshYearToDate(), ytdYear: Number(d.hireDate.slice(0,4)) }; });
      return json(res, 201, { id });
    }
    if (req.method === 'POST' && req.url === '/api/pos/import') {
      if (process.env.RESTAURANT_POS_COMPANY_ID !== companyId) throw new Error('A location connection must be assigned to this restaurant by your administrator.');
      const data = await body(req); return json(res, 200, await importLabor(data.provider, data.start, data.end));
    }
    if (req.method === 'POST' && req.url === '/api/review') {
      const input = await body(req), company = getCompany(companyId);
      if (!company || input.companyId !== companyId) throw new Error('Select your restaurant.');
      if (!company.ein) throw new Error('Add your employer EIN in Settings before calculating payroll.');
      const review = reviewPayroll(input, company, employeesForCompany(company.id));
      for (const [id, value] of reviews) if (value.expires < Date.now()) reviews.delete(id);
      if (reviews.size >= 100) throw new Error('Too many open reviews. Try again later.');
      reviews.set(review.run.id, { review, expires: Date.now() + 15 * 60000, accountId: auth.account.id }); return json(res, 200, review);
    }
    if (req.method === 'POST' && req.url === '/api/settings') {
      const d = await body(req); if (!/^\d{2}-\d{7}$/.test(d.ein)) throw new Error('Enter an EIN as 12-3456789.');
      withPayrollDb(db => { if (!db.companies[companyId]) throw new Error('Set up your restaurant first.'); db.companies[companyId].ein = d.ein; }); return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && req.url === '/api/approve') {
      const { reviewId, acknowledged } = await body(req);
      if (acknowledged !== true) throw new Error('Confirm that recording payroll does not transfer money or file taxes.');
      const saved = reviews.get(reviewId);
      if (!saved || saved.accountId !== auth.account.id || saved.review.input.companyId !== companyId || saved.expires < Date.now()) throw new Error('Review expired. Calculate again.');
      const run = commitReview(saved.review, auth.account.id); reviews.delete(reviewId); return json(res, 200, { run, paymentStatus: 'not_submitted', filingStatus: 'not_filed' });
    }
    json(res, 404, { error: 'Not found.' });
  } catch (error) { json(res, 400, { error: error instanceof Error ? error.message : 'Unable to complete request.' }); }
}).listen(port, process.env.RESTAURANT_HOST ?? '127.0.0.1', () => console.log(`Restaurant payroll: ${origin}`));
