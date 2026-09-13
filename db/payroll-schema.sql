-- ============================================================================
-- Payroll processing schema (Postgres) — companies, employees, pay runs
-- ============================================================================
--
-- STATUS: canonical schema / contract, same status as db/schema.sql's own
-- rate database — the normalized target payroll/store.ts's file-backed
-- implementation is deliberately kept isomorphic to (see that module's own
-- header comment), because this project's Supabase instance isn't linked to
-- a live URL from this environment. Loading this file is mechanical once one
-- is: one row per company/employee/pay-run-line, JSONB only where the shape
-- genuinely varies (a state's own certificate fields, a YTD tracker keyed by
-- state code), never as a substitute for a real column.
--
-- Deliberately separate from db/schema.sql rather than appended to it: that
-- file is the RATE database (what the law says); this one is the PAYROLL
-- database (whose money moved, and how much). A rate change and a payroll
-- run are different write paths with different audiences, and keeping them
-- in separate files means either can be loaded, reviewed or migrated
-- without touching the other.
--
-- Same three commitments as db/schema.sql, applied to this domain:
--
--   1. AN APPROVED PAY RUN IS IMMUTABLE. Correcting a mistake after
--      approval is a new pay run (an off-cycle adjustment or a void-and-
--      reissue), never an UPDATE to pay_run_line — see payroll/run.ts's own
--      voidPayRun() doc comment on why reversing committed YTD isn't offered
--      as a status flip.
--   2. YTD IS DERIVED, NEVER HAND-EDITED. employee_ytd exists to cache the
--      running totals payroll/ytd.ts computes, keyed by calendar year the
--      same way the engine's own wage bases reset annually — it should
--      always be reconstructible by replaying that employee's own approved
--      pay_run_line rows for the year, and a discrepancy between the two is
--      a bug to fix, not a hint to edit the cache.
--   3. MONEY IS EXACT INTEGER CENTS, same as db/schema.sql's own NUMERIC
--      rates are exact decimal — never floating point. See
--      docs/rounding-and-precision.md.
-- ============================================================================

-- DEPENDS ON db/schema.sql having already run in this database: reuses its
-- filing_status, pretax_category and tax_payer enums rather than redefining
-- them, since an employee's W-4 filing status and a deduction's pretax
-- category are literally the same domain of values the rate database
-- already declares types for.

BEGIN;

-- ----------------------------------------------------------------------------
-- Companies
-- ----------------------------------------------------------------------------

CREATE TYPE pay_schedule_frequency AS ENUM ('weekly', 'biweekly', 'semimonthly', 'monthly');

CREATE TABLE company (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name                TEXT NOT NULL,
  ein                       TEXT NOT NULL UNIQUE,          -- XX-XXXXXXX
  home_state                CHAR(2) NOT NULL,
  pay_schedule_frequency    pay_schedule_frequency NOT NULL,
  -- weekly/biweekly only:
  anchor_period_start       DATE,
  -- semimonthly only, e.g. {1,16}:
  semimonthly_split_days    SMALLINT[],
  check_date_lag_days       SMALLINT NOT NULL,
  -- EmployerContext fields the tax engine can't derive on its own (SUI rate
  -- per state, Seattle prior-year payroll, ...) — see src/types.ts's own
  -- EmployerContext doc comment for why this stays JSONB rather than a
  -- column per field: the set of facts a caller must supply grows with the
  -- jurisdiction surface, not with this schema.
  employer_context          JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Only consumed by new-hire reporting (see payroll/newHireReporting.ts) — nothing in payroll processing itself needs it.
  address                   TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (pay_schedule_frequency NOT IN ('weekly', 'biweekly') OR anchor_period_start IS NOT NULL)
);

-- ----------------------------------------------------------------------------
-- Employees
-- ----------------------------------------------------------------------------

CREATE TYPE employment_category AS ENUM (
  'standard', 'clergy', 'statutory_employee', 'household', 'agricultural', 'railroad', 'election_worker'
);

CREATE TYPE pay_type_kind AS ENUM ('hourly', 'salary');

CREATE TABLE employee (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             UUID NOT NULL REFERENCES company (id),
  first_name             TEXT NOT NULL,
  last_name              TEXT NOT NULL,
  hire_date              DATE NOT NULL,
  termination_date       DATE,
  employment_category    employment_category NOT NULL DEFAULT 'standard',
  pay_type               pay_type_kind NOT NULL,
  hourly_rate_cents      BIGINT,                   -- pay_type = 'hourly'
  annual_salary_cents    BIGINT,                   -- pay_type = 'salary'
  residence_state        CHAR(2) NOT NULL,
  residence_certificate  JSONB NOT NULL DEFAULT '{}'::JSONB,
  work_state             CHAR(2),                  -- NULL = company's own home_state
  work_certificate       JSONB NOT NULL DEFAULT '{}'::JSONB,
  residence_withholding_nexus      BOOLEAN,
  residence_withholding_voluntary  BOOLEAN,
  -- Form W-4 (2020+) — one row per employee, superseded (not versioned with
  -- history) on a new W-4, since only the CURRENT election governs
  -- withholding; a prior election has no ongoing effect to reproduce the
  -- way a past tax rate does.
  w4_filing_status       filing_status NOT NULL,
  w4_multiple_jobs       BOOLEAN NOT NULL DEFAULT FALSE,
  w4_dependent_credit_cents BIGINT NOT NULL DEFAULT 0,
  w4_other_income_cents  BIGINT NOT NULL DEFAULT 0,
  w4_deductions_cents    BIGINT NOT NULL DEFAULT 0,
  w4_extra_withholding_cents BIGINT NOT NULL DEFAULT 0,
  w4_exempt              BOOLEAN NOT NULL DEFAULT FALSE,
  -- Only consumed by new-hire reporting (payroll/newHireReporting.ts).
  -- PRODUCTION BOUNDARY: a real system NEVER stores a raw SSN in a plain
  -- column like this — see that module's own doc comment on Employee.ssn
  -- for the same custody discipline direct_deposit_account already draws
  -- for bank account numbers. This column is the shape, not the security
  -- model; a real deployment replaces it with a tokenized/encrypted store.
  ssn                    TEXT,
  mailing_address        TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (pay_type <> 'hourly' OR hourly_rate_cents IS NOT NULL),
  CHECK (pay_type <> 'salary' OR annual_salary_cents IS NOT NULL)
);

CREATE INDEX employee_company ON employee (company_id);

-- ----------------------------------------------------------------------------
-- Direct deposit accounts
-- ----------------------------------------------------------------------------
-- See payroll/directDeposit.ts's own header comment on the production
-- boundary this table deliberately does not model: a real system stores a
-- TOKEN from a bank-linking provider here, never routing/account numbers in
-- plain columns. This table is the shape, not the security model.

CREATE TYPE deposit_account_type AS ENUM ('checking', 'savings');
CREATE TYPE deposit_allocation_kind AS ENUM ('remainder', 'percent', 'flatAmount');

CREATE TABLE direct_deposit_account (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employee (id),
  routing_number    CHAR(9) NOT NULL,
  account_number    TEXT NOT NULL,
  account_type      deposit_account_type NOT NULL,
  allocation_kind   deposit_allocation_kind NOT NULL,
  percent_of_net    NUMERIC(5,2),        -- allocation_kind = 'percent'
  flat_amount_cents BIGINT,              -- allocation_kind = 'flatAmount'
  priority          INT,
  active            BOOLEAN NOT NULL DEFAULT TRUE,

  CHECK (allocation_kind <> 'percent' OR percent_of_net IS NOT NULL),
  CHECK (allocation_kind <> 'flatAmount' OR flat_amount_cents IS NOT NULL)
);

CREATE UNIQUE INDEX direct_deposit_one_remainder_per_employee
  ON direct_deposit_account (employee_id)
  WHERE allocation_kind = 'remainder' AND active;

-- ----------------------------------------------------------------------------
-- Recurring deduction plans (benefits, 401(k), ...)
-- ----------------------------------------------------------------------------

CREATE TYPE deduction_amount_kind AS ENUM ('flat', 'percentOfGross');

CREATE TABLE deduction_plan (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employee (id),
  code              TEXT NOT NULL,
  pretax_category   pretax_category,     -- NULL = post-tax, same convention as src/types.ts's Deduction.category
  amount_kind       deduction_amount_kind NOT NULL,
  flat_cents        BIGINT,              -- amount_kind = 'flat'
  percent_of_gross  NUMERIC(5,2),        -- amount_kind = 'percentOfGross'
  active            BOOLEAN NOT NULL DEFAULT TRUE,

  CHECK (amount_kind <> 'flat' OR flat_cents IS NOT NULL),
  CHECK (amount_kind <> 'percentOfGross' OR percent_of_gross IS NOT NULL)
);

-- ----------------------------------------------------------------------------
-- Garnishment orders — persisted, standing orders a pay run reads every
-- period until cancelled; the calculation itself stays in src/garnishment.ts
-- ----------------------------------------------------------------------------

CREATE TYPE garnishment_order_type AS ENUM ('consumer_creditor', 'child_support', 'federal_student_loan_default');

CREATE TABLE garnishment_order (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                 UUID NOT NULL REFERENCES employee (id),
  order_type                  garnishment_order_type NOT NULL,
  amount_ordered_cents        BIGINT NOT NULL,     -- see GarnishmentOrder.amountOrdered's own doc comment for the MAX_SAFE_INTEGER "withhold the statutory max" convention
  supporting_other_family     BOOLEAN,
  arrears_over_12_weeks       BOOLEAN,
  head_of_family              BOOLEAN,
  wage_exemption_waived       BOOLEAN,
  dependents                  INT,
  household_size              INT,
  sole_household_support      BOOLEAN,
  expected_annual_earnings_cents BIGINT,
  garnished_this_year_cents   BIGINT NOT NULL DEFAULT 0,
  priority                    INT,
  active                      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- Time entries — hours reported per employee per pay period
-- ----------------------------------------------------------------------------

CREATE TABLE time_entry (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employee (id),
  pay_run_id        UUID,                -- filled once the run it belongs to exists; see pay_run below
  regular_hours     NUMERIC(6,2) NOT NULL DEFAULT 0,
  overtime_hours    NUMERIC(6,2) NOT NULL DEFAULT 0,
  double_time_hours NUMERIC(6,2) NOT NULL DEFAULT 0,   -- see payroll/timeAndAttendance.ts's own daily/7th-consecutive-day rules
  pto_hours         NUMERIC(6,2) NOT NULL DEFAULT 0,
  extra_earnings    JSONB NOT NULL DEFAULT '[]'::JSONB,  -- [{category, code, amount}] — bonuses/reimbursements reported alongside hours
  UNIQUE (employee_id, pay_run_id)
);

-- Raw clock punches, the source data time_entry's regular/overtime/double-
-- time columns are DERIVED from (see payroll/timeAndAttendance.ts's own
-- pairPunchesIntoDailyHours() and classifyWeeklyHours()) — kept as its own
-- immutable event log rather than overwritten, the same "the raw fact
-- outlives the rollup built from it" principle source_snapshot applies to
-- a harvested rate in db/schema.sql.

CREATE TYPE punch_type AS ENUM ('clock_in', 'clock_out');

CREATE TABLE time_punch (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES employee (id),
  punch_time    TIMESTAMP NOT NULL,   -- workplace-local, no timezone conversion — see TimePunch's own doc comment
  punch_type    punch_type NOT NULL
);

CREATE INDEX time_punch_employee ON time_punch (employee_id, punch_time);

-- ----------------------------------------------------------------------------
-- PTO accrual
-- ----------------------------------------------------------------------------
-- See payroll/pto.ts's own header comment: this models an EMPLOYER POLICY
-- engine, not the ~20 states' own mandatory paid-sick-leave accrual laws
-- (a separate, unresearched legal-data project of the same shape as the
-- minimum-wage database).

CREATE TYPE pto_accrual_kind AS ENUM ('perHourWorked', 'perPayPeriod');

CREATE TABLE pto_policy (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                UUID NOT NULL REFERENCES company (id),
  name                      TEXT NOT NULL,
  accrual_kind              pto_accrual_kind NOT NULL,
  hours_accrued_per_hour_worked NUMERIC(6,4),   -- accrual_kind = 'perHourWorked'
  hours_per_pay_period      NUMERIC(6,2),        -- accrual_kind = 'perPayPeriod'
  max_balance_hours         NUMERIC(7,2),
  annual_carryover_cap_hours NUMERIC(7,2),

  CHECK (accrual_kind <> 'perHourWorked' OR hours_accrued_per_hour_worked IS NOT NULL),
  CHECK (accrual_kind <> 'perPayPeriod' OR hours_per_pay_period IS NOT NULL)
);

-- One row per (employee, policy) — a running balance, not an event log;
-- payroll/pto.ts's accruePto()/usePto() each return the NEXT balance to
-- overwrite this row with, the same "derived, kept current, never
-- hand-edited" discipline this file's own header comment states for
-- employee_ytd below.

CREATE TABLE pto_balance (
  employee_id       UUID NOT NULL REFERENCES employee (id),
  pto_policy_id     UUID NOT NULL REFERENCES pto_policy (id),
  balance_hours     NUMERIC(7,2) NOT NULL DEFAULT 0,
  ytd_accrued_hours NUMERIC(7,2) NOT NULL DEFAULT 0,
  ytd_used_hours    NUMERIC(7,2) NOT NULL DEFAULT 0,

  PRIMARY KEY (employee_id, pto_policy_id)
);

-- ----------------------------------------------------------------------------
-- Pay runs
-- ----------------------------------------------------------------------------

CREATE TYPE pay_run_status AS ENUM ('draft', 'approved', 'voided');

CREATE TABLE pay_run (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES company (id),
  period_start   DATE NOT NULL,
  period_end     DATE NOT NULL,
  check_date     DATE NOT NULL,
  status         pay_run_status NOT NULL DEFAULT 'draft',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_at    TIMESTAMPTZ,

  CHECK (status <> 'approved' OR approved_at IS NOT NULL)
);

ALTER TABLE time_entry ADD CONSTRAINT time_entry_pay_run_fk FOREIGN KEY (pay_run_id) REFERENCES pay_run (id);

CREATE INDEX pay_run_company ON pay_run (company_id, check_date);

-- One row per employee per run — the paycheck-level summary a paystub and a
-- payroll register are both built from.

CREATE TABLE pay_run_line (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pay_run_id                UUID NOT NULL REFERENCES pay_run (id),
  employee_id               UUID NOT NULL REFERENCES employee (id),
  gross_pay_cents           BIGINT NOT NULL,
  net_pay_cents             BIGINT NOT NULL,
  employee_tax_total_cents  BIGINT NOT NULL,
  employer_tax_total_cents  BIGINT NOT NULL,
  pretax_deductions_cents   BIGINT NOT NULL,
  posttax_deductions_cents  BIGINT NOT NULL,
  garnishment_total_cents   BIGINT NOT NULL,
  net_pay_after_garnishment_cents BIGINT NOT NULL,

  UNIQUE (pay_run_id, employee_id)
);

-- One row per tax line — the same "diffable at the line level, not an
-- opaque blob" discipline db/schema.sql's own tax_bracket table applies.
-- taxable_wages_cents is carried alongside amount for exactly one reason:
-- it is what payroll/ytd.ts's accumulateYtd() reads to roll an approved
-- run's numbers into employee_ytd, purely from this persisted row, with no
-- need to re-run the tax engine.

CREATE TABLE pay_run_line_tax (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pay_run_line_id         UUID NOT NULL REFERENCES pay_run_line (id) ON DELETE CASCADE,
  tax_id                  TEXT NOT NULL,      -- engine TaxLine id, e.g. 'US_FIT', 'CA_SUI_ER'
  name                    TEXT NOT NULL,
  payer                   tax_payer NOT NULL,
  taxable_wages_cents     BIGINT NOT NULL,
  amount_cents            BIGINT NOT NULL
);

CREATE INDEX pay_run_line_tax_line ON pay_run_line_tax (pay_run_line_id);

CREATE TABLE pay_run_line_garnishment (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pay_run_line_id     UUID NOT NULL REFERENCES pay_run_line (id) ON DELETE CASCADE,
  garnishment_order_id UUID NOT NULL REFERENCES garnishment_order (id),
  withheld_cents      BIGINT NOT NULL,
  detail              TEXT NOT NULL
);

CREATE TABLE pay_run_line_deposit_allocation (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pay_run_line_id           UUID NOT NULL REFERENCES pay_run_line (id) ON DELETE CASCADE,
  direct_deposit_account_id UUID NOT NULL REFERENCES direct_deposit_account (id),
  amount_cents              BIGINT NOT NULL
);

-- ----------------------------------------------------------------------------
-- Employee YTD cache
-- ----------------------------------------------------------------------------
-- One row per (employee, calendar year). See this file's own header
-- comment: this is a CACHE of what replaying approved pay_run_line rows for
-- the year would produce, kept current by payroll/ytd.ts's accumulateYtd()
-- on every approval, never hand-edited.
--
-- Simple annual trackers get their own column (matches src/types.ts's
-- YearToDate exactly); trackers keyed by state code or by a locality id
-- (stateUnemployment, statePaidLeave, stateDisabilityEmployee,
-- stateLongTermCare, localIncomeTax) stay JSONB for the same reason
-- EmployerContext does — the set of states/localities a given employee
-- touches isn't a fixed column list.

CREATE TABLE employee_ytd (
  employee_id                  UUID NOT NULL REFERENCES employee (id),
  year                         SMALLINT NOT NULL,
  social_security_cents        BIGINT NOT NULL DEFAULT 0,
  medicare_cents                BIGINT NOT NULL DEFAULT 0,
  futa_cents                    BIGINT NOT NULL DEFAULT 0,
  supplemental_cents            BIGINT NOT NULL DEFAULT 0,
  tier2_compensation_cents      BIGINT NOT NULL DEFAULT 0,
  category_cash_wages_cents     BIGINT NOT NULL DEFAULT 0,
  railroad_monthly_compensation_cents BIGINT NOT NULL DEFAULT 0,
  railroad_monthly_compensation_month CHAR(7),  -- 'YYYY-MM', see payroll/ytd.ts's own reset rule
  seattle_compensation_cents    BIGINT NOT NULL DEFAULT 0,  -- see payroll/ytd.ts's own header comment: NOT safely derivable from pay_run_line_tax alone; a Seattle-liable employer's own payroll system must write this column directly
  state_unemployment            JSONB NOT NULL DEFAULT '{}'::JSONB,   -- {"NJ": cents, ...}
  state_paid_leave              JSONB NOT NULL DEFAULT '{}'::JSONB,
  state_disability_employee     JSONB NOT NULL DEFAULT '{}'::JSONB,
  state_long_term_care          JSONB NOT NULL DEFAULT '{}'::JSONB,
  local_income_tax               JSONB NOT NULL DEFAULT '{}'::JSONB,   -- also where KY's per-jurisdiction keys live, see payroll/ytd.ts

  PRIMARY KEY (employee_id, year)
);

-- ----------------------------------------------------------------------------
-- New-hire reports
-- ----------------------------------------------------------------------------
-- One row per report actually built for a new hire — a log of what was
-- reported and by when it was due, not a queue payroll processing itself
-- reads. See payroll/newHireReporting.ts's own header comment on the
-- federal PRWORA requirement this exists to track.

CREATE TABLE new_hire_report (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id       UUID NOT NULL REFERENCES employee (id),
  report_to_state   CHAR(2) NOT NULL,
  due_by            DATE NOT NULL,
  built_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  filed_at          TIMESTAMPTZ   -- NULL until someone actually submits it to the state agency
);

COMMIT;
