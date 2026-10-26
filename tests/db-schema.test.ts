import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The SQL schemas are contracts, not the running site's store (see their
 * headers), so these tests read them as text. Set PG_TEST_ADMIN (a psql
 * connection string to a scratch server, for example
 * "host=/tmp/pg port=5499 user=postgres") to also load them into a real
 * Postgres and exercise the constraints.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const rates = readFileSync(join(REPO, 'db/schema.sql'), 'utf8');
const payroll = readFileSync(join(REPO, 'db/payroll-schema.sql'), 'utf8');

describe('db/schema.sql jurisdiction identity', () => {
  test('a name alone is not unique: parent and external code are part of the identity', () => {
    assert.doesNotMatch(rates, /UNIQUE \(type, name, state_code\)/);
    assert.match(rates, /CREATE UNIQUE INDEX jurisdiction_identity ON jurisdiction \(\s*type,\s*name,[\s\S]*parent_id[\s\S]*external_code/);
  });
});

describe('db/payroll-schema.sql immutability is enforced, not just described', () => {
  for (const [table, trigger] of [
    ['audit_log', 'audit_log_append_only'],
    ['time_punch', 'time_punch_append_only'],
    ['pay_run', 'pay_run_immutable'],
    ['pay_run_line', 'pay_run_line_immutable'],
    ['pay_run_line_tax', 'pay_run_line_tax_immutable'],
    ['pay_run_line_garnishment', 'pay_run_line_garnishment_immutable'],
    ['pay_run_line_deposit_allocation', 'pay_run_line_deposit_allocation_immutable'],
  ] as const) {
    test(`${table} has ${trigger}`, () => {
      assert.match(payroll, new RegExp(`CREATE TRIGGER ${trigger}\\s+BEFORE [A-Z ]+ ON ${table}\\b`));
    });
  }
});

const admin = process.env.PG_TEST_ADMIN;
describe('against a real Postgres', { skip: admin ? false : 'set PG_TEST_ADMIN to run' }, () => {
  const psql = (db: string, sql: string, file?: string) =>
    execFileSync('psql', ['-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-d', `${admin} dbname=${db}`, '-f', file ?? '-'], {
      encoding: 'utf8', input: file ? undefined : sql, env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' }, stdio: ['pipe', 'pipe', 'pipe'],
    });
  const fails = (db: string, sql: string, pattern: RegExp) => {
    assert.throws(() => psql(db, sql), (e: unknown) => pattern.test(String((e as { stderr?: unknown }).stderr ?? e)), sql);
  };
  const DB = `schema_test_${process.pid}`;

  test('loads both schemas, takes every Pennsylvania municipality, and refuses what it promised to', () => {
    execFileSync('psql', ['-X', '-q', '-d', `${admin} dbname=postgres`, '-c', `CREATE DATABASE ${DB}`]);
    try {
      psql(DB, '', join(REPO, 'db/schema.sql'));
      psql(DB, '', join(REPO, 'db/payroll-schema.sql'));

      // Franklin Township exists in many counties; so does every other repeated name.
      const pa = JSON.parse(readFileSync(join(REPO, 'data/local/PA-EIT-LST-2026.json'), 'utf8')).jurisdictions as Array<{ county: string; municipality: string; psdCode: string }>;
      const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
      const lines = ["INSERT INTO jurisdiction (type,name,state_code) VALUES ('state','Pennsylvania','PA');"];
      for (const c of [...new Set(pa.map((x) => x.county))]) {
        lines.push(`INSERT INTO jurisdiction (type,name,state_code,parent_id) SELECT 'county',${q(c + ' COUNTY')},'PA',id FROM jurisdiction WHERE type='state' AND state_code='PA';`);
      }
      for (const x of pa) {
        lines.push(`INSERT INTO jurisdiction (type,name,state_code,external_code,parent_id) SELECT 'city',${q(x.municipality)},'PA',${q(x.psdCode)},id FROM jurisdiction WHERE type='county' AND name=${q(x.county + ' COUNTY')} AND state_code='PA';`);
      }
      psql(DB, lines.join('\n'));
      assert.equal(Number(psql(DB, "SELECT count(*) FROM jurisdiction WHERE type='city'").trim()), pa.length);
      assert.equal(Number(psql(DB, "SELECT count(*) FROM jurisdiction WHERE name='FRANKLIN TWP'").trim()), 15);
      // A true duplicate is still refused.
      fails(DB, "INSERT INTO jurisdiction (type,name,state_code,external_code,parent_id) SELECT type,name,state_code,external_code,parent_id FROM jurisdiction WHERE type='city' LIMIT 1", /jurisdiction_identity/);

      psql(DB, `
        INSERT INTO company (id, legal_name, ein, home_state, pay_schedule_frequency, anchor_period_start, check_date_lag_days) VALUES ('00000000-0000-0000-0000-000000000001','Acme','12-3456789','OH','biweekly','2026-01-02',5);
        INSERT INTO employee (id, company_id, first_name, last_name, hire_date, pay_type, annual_salary_cents, residence_state, w4_filing_status) VALUES ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-000000000001','A','B','2026-01-01','salary',7800000,'OH','single');
        INSERT INTO pay_run (id, company_id, period_start, period_end, check_date) VALUES ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-000000000001','2026-01-02','2026-01-15','2026-01-20');
        INSERT INTO pay_run_line (id, pay_run_id, employee_id, gross_pay_cents, net_pay_cents, employee_tax_total_cents, employer_tax_total_cents, pretax_deductions_cents, posttax_deductions_cents, garnishment_total_cents, net_pay_after_garnishment_cents) VALUES ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000e1',300000,240000,40000,20000,0,0,0,240000);
        INSERT INTO pay_run_line_tax (pay_run_line_id, tax_id, name, payer, taxable_wages_cents, amount_cents) VALUES ('00000000-0000-0000-0000-0000000000b1','US_FIT','Federal Income Tax','employee',300000,30000);
        UPDATE pay_run_line SET net_pay_cents = 239000 WHERE id = '00000000-0000-0000-0000-0000000000b1';
        UPDATE pay_run SET status = 'approved', approved_at = now() WHERE id = '00000000-0000-0000-0000-0000000000a1';
        INSERT INTO audit_log (actor, action, entity_type, entity_id) VALUES ('admin','approve','pay_run','a1');`);

      const refused = /append-only|immutable|cannot be/;
      fails(DB, 'UPDATE pay_run_line SET net_pay_cents = 1', refused);
      fails(DB, 'UPDATE pay_run_line_tax SET amount_cents = 0', refused);
      fails(DB, 'DELETE FROM pay_run_line_tax', refused);
      fails(DB, "INSERT INTO pay_run_line_tax (pay_run_line_id, tax_id, name, payer, taxable_wages_cents, amount_cents) VALUES ('00000000-0000-0000-0000-0000000000b1','X','X','employee',1,1)", refused);
      fails(DB, "UPDATE pay_run SET check_date = '2030-01-01'", refused);
      fails(DB, 'DELETE FROM pay_run', refused);
      fails(DB, "UPDATE audit_log SET action = 'x'", refused);
      fails(DB, 'DELETE FROM audit_log', refused);
      fails(DB, 'TRUNCATE audit_log', refused);
      // Voiding is the one change an approved run allows, and a voided run is final.
      psql(DB, "UPDATE pay_run SET status = 'voided'");
      fails(DB, "UPDATE pay_run SET status = 'approved'", refused);

      // A draft is still editable and deletable, lines and all.
      psql(DB, `
        INSERT INTO pay_run (id, company_id, period_start, period_end, check_date) VALUES ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-000000000001','2026-01-16','2026-01-29','2026-02-03');
        INSERT INTO pay_run_line (id, pay_run_id, employee_id, gross_pay_cents, net_pay_cents, employee_tax_total_cents, employer_tax_total_cents, pretax_deductions_cents, posttax_deductions_cents, garnishment_total_cents, net_pay_after_garnishment_cents) VALUES ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000e1',1,1,0,0,0,0,0,1);
        DELETE FROM pay_run_line WHERE id = '00000000-0000-0000-0000-0000000000b2';
        DELETE FROM pay_run WHERE id = '00000000-0000-0000-0000-0000000000a2';`);
    } finally {
      execFileSync('psql', ['-X', '-q', '-d', `${admin} dbname=postgres`, '-c', `DROP DATABASE IF EXISTS ${DB}`]);
    }
  });
});
