-- ============================================================================
-- Payroll Tax Engine — rate database schema (Postgres)
-- ============================================================================
--
-- STATUS: canonical schema / contract. As of Phase 1 the calculation engine
-- reads rates from data/*.json, not from this database — for federal + a
-- handful of states that is the correct store (fully reproducible, no server to
-- run, a few dozen rows). This DDL is the normalized target that the harvester
-- (Phase 9) writes to and the API (Phase 7) reads from, and it is the shape the
-- JSON is deliberately kept isomorphic to, so the JSON -> DB load is mechanical.
--
-- Three design commitments carried over from the engine and made explicit here:
--
--   1. RATES ARE VERSIONED, NEVER OVERWRITTEN. A rate change closes the old
--      version with an end date and inserts a new one. A December 2026 check
--      recomputed in February 2027 must resolve December 2026's rate. Effective
--      dating is enforced structurally (see rate_version + the exclusion
--      constraint), not by convention.
--
--   2. EVERY TAX HAS ITS OWN TAXABLE BASE. A 401(k) deferral reduces federal
--      income-tax wages but not FICA wages and not PA wages. There is no single
--      "taxable wages" column anywhere; each rate_version declares which pretax
--      categories it exempts (rate_version_exempt_pretax).
--
--   3. NOTHING IS LIVE UNTIL A HUMAN APPROVES IT. Detected changes land in
--      pending_change and only enter rate_version on approval, with the
--      approver and effective date recorded.
--
-- Money is stored as exact NUMERIC, never floating point. The engine works in
-- integer cents; NUMERIC(14,4) here holds published rates/thresholds without
-- loss and is converted to cents on load. See docs/rounding-and-precision.md.
-- ============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;  -- for the no-overlap exclusion constraint


-- ----------------------------------------------------------------------------
-- Jurisdictions
-- ----------------------------------------------------------------------------
-- Self-referencing: a school district's parent is a county, a county's parent
-- is a state, a state's parent is federal. Lets local resolution walk upward.

CREATE TYPE jurisdiction_type AS ENUM (
  'federal', 'state', 'county', 'city', 'school_district', 'special_district'
);

CREATE TABLE jurisdiction (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  type             jurisdiction_type NOT NULL,
  name             TEXT NOT NULL,
  -- Two-letter USPS code; NULL only for the single federal row.
  state_code       CHAR(2),
  -- e.g. PA Act 32 PSD code, OH municipality code — the authoritative external id.
  external_code    TEXT,
  parent_id        BIGINT REFERENCES jurisdiction (id),
  UNIQUE (type, name, state_code)
);


-- ----------------------------------------------------------------------------
-- Taxes
-- ----------------------------------------------------------------------------
-- A distinct tax imposed by a jurisdiction. Stable across rate changes: the
-- rate for "PA state income tax" changes over time, but the tax itself is one
-- row. code matches the engine's TaxLine ids (US_FIT, US_SS_EE, PA_SIT, ...).

CREATE TYPE tax_payer AS ENUM ('employee', 'employer');

CREATE TYPE tax_method AS ENUM (
  'bracket',       -- annualize -> bracket table -> de-annualize (federal, most states)
  'flat',          -- flat % of base (most locals, PA)
  'capped_flat',   -- flat % up to a wage base (Social Security, FUTA, SUTA)
  'flat_plus_surtax' -- flat % + extra % above a threshold (Medicare)
);

-- Whose address determines liability, and at which rate. Drives local
-- resolution and reciprocity; 'na' for federal/most state income taxes.
CREATE TYPE residency_basis AS ENUM ('resident', 'nonresident', 'both', 'na');

CREATE TABLE tax (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  jurisdiction_id  BIGINT NOT NULL REFERENCES jurisdiction (id),
  code             TEXT NOT NULL UNIQUE,      -- engine TaxLine id
  name             TEXT NOT NULL,
  payer            tax_payer NOT NULL,
  method           tax_method NOT NULL,
  residency_basis  residency_basis NOT NULL DEFAULT 'na'
);


-- ----------------------------------------------------------------------------
-- Rate versions — the effective-dated spine
-- ----------------------------------------------------------------------------
-- One row per (tax, effective period). Superseding a rate = close the old row's
-- effective_to and insert a new row. effective_to NULL means "currently open".
--
-- The exclusion constraint makes overlapping effective periods for the same tax
-- physically impossible to insert — the database, not the application, is the
-- guarantor that exactly one version is in force on any given check date.

CREATE TABLE rate_version (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tax_id           BIGINT NOT NULL REFERENCES tax (id),
  effective_from   DATE NOT NULL,
  effective_to     DATE,                       -- NULL = open-ended / current
  -- Provenance: every rate must cite where it came from and who checked it.
  source_url       TEXT NOT NULL,
  source_title     TEXT NOT NULL,
  published_on     DATE,                       -- when the agency published it
  verified_on      DATE NOT NULL,              -- when a human last checked the source
  verified_by      TEXT NOT NULL,              -- who verified (no unverified rates go live)
  supersedes_id    BIGINT REFERENCES rate_version (id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (effective_to IS NULL OR effective_to >= effective_from),

  -- No two versions of the same tax may cover overlapping dates.
  EXCLUDE USING gist (
    tax_id WITH =,
    daterange(effective_from, effective_to, '[]') WITH &&
  )
);

CREATE INDEX rate_version_lookup
  ON rate_version (tax_id, effective_from DESC);


-- ----------------------------------------------------------------------------
-- Bracket tables — ONE ROW PER BRACKET (not a JSON blob)
-- ----------------------------------------------------------------------------
-- Federal has seven brackets per schedule; a version references many rows.
-- One-row-per-bracket makes a scraper diff expressible at the bracket level
-- ("the 22% ceiling moved") instead of an opaque blob comparison, and lets a
-- rate change be reviewed line by line.
--
-- filing_status + schedule together pick the table: Pub 15-T publishes both a
-- "standard" and a "multiple jobs" (Step 2 checkbox) schedule per status.

CREATE TYPE filing_status AS ENUM (
  'single', 'married_joint', 'married_separate', 'head_of_household'
);

CREATE TYPE bracket_schedule AS ENUM ('standard', 'multiple_jobs');

CREATE TABLE tax_bracket (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rate_version_id   BIGINT NOT NULL REFERENCES rate_version (id) ON DELETE CASCADE,
  filing_status     filing_status NOT NULL,
  schedule          bracket_schedule NOT NULL DEFAULT 'standard',
  bracket_order     INT NOT NULL,              -- 0-based, ascending by floor
  floor_amount      NUMERIC(14,4) NOT NULL,    -- annual, inclusive lower bound
  ceiling_amount    NUMERIC(14,4),             -- annual, exclusive; NULL = top bracket
  rate              NUMERIC(9,7) NOT NULL,     -- marginal rate, e.g. 0.2200000
  base_tax          NUMERIC(14,4) NOT NULL,    -- cumulative tax at the floor

  CHECK (ceiling_amount IS NULL OR ceiling_amount > floor_amount),
  UNIQUE (rate_version_id, filing_status, schedule, bracket_order)
);


-- ----------------------------------------------------------------------------
-- Flat rates and capped/threshold parameters
-- ----------------------------------------------------------------------------
-- For method = 'flat' / 'capped_flat' / 'flat_plus_surtax'. resident_rate and
-- nonresident_rate carry the split for locals that tax the two differently;
-- for a single-rate tax, put it in `rate` and leave the split NULL.

CREATE TABLE flat_rate (
  rate_version_id   BIGINT PRIMARY KEY REFERENCES rate_version (id) ON DELETE CASCADE,
  rate              NUMERIC(9,7),              -- single rate, or employee rate
  employer_rate     NUMERIC(9,7),              -- when employer half differs (FICA)
  resident_rate     NUMERIC(9,7),              -- locals: resident rate
  nonresident_rate  NUMERIC(9,7),              -- locals: non-resident rate
  wage_base         NUMERIC(14,4),             -- annual cap for capped_flat; NULL = uncapped
  surtax_rate       NUMERIC(9,7),              -- flat_plus_surtax: extra rate above threshold
  surtax_threshold  NUMERIC(14,4)              -- flat_plus_surtax: annual YTD trigger
);


-- ----------------------------------------------------------------------------
-- Scalar parameters that don't fit a bracket or a single rate
-- ----------------------------------------------------------------------------
-- e.g. federal step-1 standard adjustment per status, supplemental flat rate,
-- supplemental mandatory rate + $1M threshold, backup withholding rate.
-- Key/value keeps the schema honest to the JSON without a column per constant.

CREATE TABLE rate_parameter (
  rate_version_id   BIGINT NOT NULL REFERENCES rate_version (id) ON DELETE CASCADE,
  key               TEXT NOT NULL,             -- e.g. 'supplemental_rate', 'step1_adj.married_joint'
  numeric_value     NUMERIC(14,6) NOT NULL,
  PRIMARY KEY (rate_version_id, key)
);


-- ----------------------------------------------------------------------------
-- Per-tax pretax exemption profile
-- ----------------------------------------------------------------------------
-- THE core architectural fact: the same deferral is exempt from one tax and
-- taxable under another. Each rate_version lists exactly the pretax categories
-- it exempts. Tied to the version (not the tax) because the law can change
-- which deferrals are exempt.

CREATE TYPE pretax_category AS ENUM (
  'section125', 'hsa', 'fsa', 'dependent_care',
  'deferral_401k', 'deferral_403b', 'deferral_457', 'deferral_simple',
  'commuter'
);

CREATE TABLE rate_version_exempt_pretax (
  rate_version_id   BIGINT NOT NULL REFERENCES rate_version (id) ON DELETE CASCADE,
  category          pretax_category NOT NULL,
  PRIMARY KEY (rate_version_id, category)
);


-- ----------------------------------------------------------------------------
-- Approval queue — the human checkpoint (Phase 9, defined now)
-- ----------------------------------------------------------------------------
-- The harvester never writes rate_version directly. It records a detected
-- change here; a reviewer approves or rejects against the source document.
-- Only on approval does a new rate_version get created, with the effective date
-- the reviewer entered (publication date != effective date, almost always).

CREATE TYPE change_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE pending_change (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tax_id           BIGINT NOT NULL REFERENCES tax (id),
  detected_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  source_url       TEXT NOT NULL,
  old_value        JSONB,                      -- structured snapshot the parser emitted
  new_value        JSONB NOT NULL,
  status           change_status NOT NULL DEFAULT 'pending',
  -- Filled on decision:
  decided_at       TIMESTAMPTZ,
  decided_by       TEXT,
  effective_from   DATE,                       -- entered by the reviewer on approval
  -- Set when approval produced a live version, closing the loop for audit.
  resulting_rate_version_id BIGINT REFERENCES rate_version (id),
  note             TEXT,

  CHECK (
    status = 'pending'
    OR (decided_at IS NOT NULL AND decided_by IS NOT NULL)
  ),
  CHECK (status <> 'approved' OR effective_from IS NOT NULL)
);

CREATE INDEX pending_change_open ON pending_change (status) WHERE status = 'pending';


-- ----------------------------------------------------------------------------
-- Immutable source snapshots — what the harvester fetched, for diffing + audit
-- ----------------------------------------------------------------------------

CREATE TABLE source_snapshot (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_url       TEXT NOT NULL,
  fetched_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  content_hash     TEXT NOT NULL,              -- hash of the extracted structured object
  extracted        JSONB NOT NULL,             -- {jurisdiction, rate, effective_date, ...}
  raw_bytes        BYTEA                        -- optional: the fetched page/PDF
);

CREATE INDEX source_snapshot_by_url ON source_snapshot (source_url, fetched_at DESC);

COMMIT;
