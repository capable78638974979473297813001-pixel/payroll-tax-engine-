import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { normalizeSquare, normalizeToast } from '../restaurant/pos.ts';

test('restaurant workspace: authentication, isolation, drafts and approved payroll lifecycle', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'restaurant-test-'));
  const port = 19000 + Math.floor(Math.random() * 10000), origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['restaurant/server.ts'], { env: { ...process.env, PORT: String(port), RESTAURANT_ORIGIN: origin, RESTAURANT_AUTH_DIR: join(dir,'auth'), PAYROLL_DB_DIR: join(dir,'payroll') }, stdio: ['ignore','pipe','pipe'] });
  t.after(async () => { server.kill(); await once(server,'exit'); rmSync(dir,{recursive:true,force:true}); });
  await Promise.race([once(server.stdout,'data'), once(server,'exit').then(()=>{throw new Error('Server exited early');}), new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server readiness timed out')),10000).unref())]);
  async function request(path: string, data?: unknown, cookie='', csrf='', from=origin) { const r=await fetch(origin+path,{method:data===undefined?'GET':'POST',headers:{Origin:from,Cookie:cookie,'X-Restaurant-Csrf':csrf,'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,data:r.headers.get('Content-Type')?.includes('application/json')?await r.json():await r.text(),cookie:r.headers.get('Set-Cookie')?.split(';')[0]??''}; }
  assert.equal((await request('/')).status,200);
  assert.equal((await request('/api/workspace')).status,401);
  assert.equal((await request('/api/auth/signup',{email:'test@example.com',name:'Test',password:'short'})).status,400);
  const a=await request('/api/auth/signup',{email:'a@example.com',name:'Owner A',password:'a-long-test-password'});assert.equal(a.status,200);assert.match(a.cookie,/restaurant_session=/);
  const secret=readFileSync(join(dir,'auth','auth.json'),'utf8');assert.ok(!secret.includes('a-long-test-password'));assert.ok(!secret.includes(a.cookie.split('=')[1]));
  const ac=a.cookie,cs=a.data.csrf;
  assert.equal((await request('/api/setup',{name:'A',state:'MI',frequency:'weekly',anchor:'2026-10-19'},ac,'')).status,403);
  assert.equal((await request('/api/setup',{name:'A',state:'MI',frequency:'weekly',anchor:'2026-10-19'},ac,cs,'https://evil.example')).status,403);
  assert.equal((await request('/api/setup',{name:'Juniper A',state:'MI',frequency:'weekly',anchor:'2026-10-19'},ac,cs)).status,200);
  const b=await request('/api/auth/signup',{email:'b@example.com',name:'Owner B',password:'b-long-test-password'});
  assert.deepEqual((await request('/api/workspace',undefined,b.cookie)).data.companies,[]);
  await request('/api/setup',{name:'Juniper B',state:'MI',frequency:'weekly',anchor:'2026-10-19'},b.cookie,b.data.csrf);
  const employee=await request('/api/employees',{firstName:'Maya',lastName:'Chen',jobTitle:'Cook',rate:2400,hireDate:'2026-01-01',residenceState:'MI',filingStatus:'single'},ac,cs);assert.equal(employee.status,201);
  const aw=(await request('/api/workspace',undefined,ac)).data;assert.equal(aw.companies.length,1);assert.equal(aw.employees.length,1);assert.deepEqual((await request('/api/workspace',undefined,b.cookie)).data.employees,[]);
  assert.equal((await request('/api/pos/import',{provider:'square',start:'2026-10-19T00:00:00Z',end:'2026-10-26T00:00:00Z'},b.cookie,b.data.csrf)).status,400);
  const input={companyId:aw.companies[0].id,periodStart:'2026-10-19',periodEnd:'2026-10-25',checkDate:'2026-10-30',entries:[{employeeId:employee.data.id,regularHours:40,overtimeHours:2,cashTipsCents:0,paycheckTipsCents:0,serviceChargesCents:0,hoursReviewed:true,tipsReviewed:true}]};
  await request('/api/draft',input,ac,cs);assert.equal((await request('/api/draft',undefined,ac)).data.draft.companyId,input.companyId);assert.equal((await request('/api/draft',undefined,b.cookie)).data.draft,null);
  assert.equal((await request('/api/review',input,ac,cs)).status,400); // missing EIN
  await request('/api/settings',{ein:'12-3456789'},ac,cs);
  assert.equal((await request('/api/review',input,b.cookie,b.data.csrf)).status,400);
  const review=await request('/api/review',input,ac,cs);assert.equal(review.status,200);assert.deepEqual(review.data.blockers,[]);assert.equal(review.data.totals.gross,103200);assert.ok(review.data.totals.net>0);
  assert.equal((await request('/api/approve',{reviewId:review.data.run.id,acknowledged:true},b.cookie,b.data.csrf)).status,400);
  assert.equal((await request('/api/approve',{reviewId:review.data.run.id,acknowledged:false},ac,cs)).status,400);
  const recorded=await request('/api/approve',{reviewId:review.data.run.id,acknowledged:true},ac,cs);assert.equal(recorded.status,200);assert.equal(recorded.data.run.status,'approved');assert.equal(recorded.data.paymentStatus,'not_submitted');
  assert.equal((await request('/api/approve',{reviewId:review.data.run.id,acknowledged:true},ac,cs)).status,400);
  const duplicate=await request('/api/review',input,ac,cs);assert.equal((await request('/api/approve',{reviewId:duplicate.data.run.id,acknowledged:true},ac,cs)).status,400);
  const tipped=await request('/api/review',{...input,entries:[{...input.entries[0],cashTipsCents:5000}]},ac,cs);assert.ok(tipped.data.blockers.some((s:string)=>s.includes('tip-tax')));
  assert.equal((await request('/api/approve',{reviewId:tipped.data.run.id,acknowledged:true},ac,cs)).status,400);
  await request('/api/auth/logout',{},ac,cs);assert.equal((await request('/api/workspace',undefined,ac)).status,401);
  assert.equal((await request('/api/auth/login',{email:'a@example.com',password:'wrong'})).status,400);
  const again=await request('/api/auth/login',{email:'a@example.com',password:'a-long-test-password'});assert.equal(again.status,200);assert.equal((await request('/api/workspace',undefined,again.cookie)).data.runs.length,1);
});
test('POS normalizers retain review boundaries and reject invalid shifts',()=>{
  const square=normalizeSquare([{id:'1',team_member_id:'a',location_id:'loc',start_at:'2026-10-19T10:00:00Z',end_at:'2026-10-19T18:00:00Z',breaks:[{is_paid:false,start_at:'2026-10-19T12:00:00Z',end_at:'2026-10-19T12:30:00Z'}],wage:{hourly_rate:{amount:2400}}}]);assert.equal(square.rows[0].paidHours,7.5);assert.equal(square.rows[0].regularHours,null);
  assert.throws(()=>normalizeSquare([{id:'1',team_member_id:'a',start_at:'invalid',end_at:'invalid'}]));
  const toast=normalizeToast([{guid:'a',employeeReference:{guid:'person'},regularHours:8,overtimeHours:1,hourlyWage:24,declaredCashTips:10,nonCashTips:20}],'loc');assert.equal(toast.rows[0].reportedTipsCents,3000);assert.equal(toast.rows[0].paidHours,9);
});

test('client views render actual workspace values and CSV parser handles quoted fields', async()=>{
  const { runInNewContext } = await import('node:vm');
  const html=readFileSync(new URL('../restaurant/app.html',import.meta.url),'utf8');
  const root={innerHTML:''};
  const context:any={document:{querySelector:()=>root,addEventListener:()=>{}},location:{pathname:'/'},history:{replaceState:()=>{}},setTimeout,clearTimeout,Intl,Date,console};
  const script=html.match(/<script>([\s\S]*)<\/script>/)![1];
  runInNewContext(script,context);
  assert.match(root.innerHTML,/A simpler payday/);
  const parsed=runInNewContext('parseCsv(\'employeeId,regularHours\\r\\n"abc,def",8\\r\\n\')',context);assert.equal(parsed[1][0],'abc,def');assert.equal(parsed[1][1],'8');
  assert.throws(()=>runInNewContext('parseCsv(\'"unclosed\')',context));
  assert.equal(runInNewContext('csvCell("=SUM(A1)")',context),'"\'=SUM(A1)"');
  runInNewContext(`state={user:{name:'Pat Owner',email:'pat@example.com'},companies:[{id:'c',legalName:'Test Kitchen',homeState:'MI',paySchedule:{frequency:'weekly',anchorPeriodStart:'2026-10-19'}}],employees:[{id:'e',firstName:'Maya',lastName:'Chen',jobTitle:'Cook',department:'Back of house',payType:{kind:'hourly',hourlyRate:2400}}],runs:[],integrations:[]};draft={entries:[]};ensureDraft();`,context);
  const dashboard=runInNewContext('dashboard()',context);assert.match(dashboard,/Pat/);assert.match(dashboard,/No recorded payroll yet/);assert.ok(!dashboard.includes('$8,426'));
  const payroll=runInNewContext('hoursPage()',context);assert.match(payroll,/Maya Chen/);assert.match(payroll,/24\.00/);
});
