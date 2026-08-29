-- API keys + usage logging for the calculate-paycheck Edge Function.
--
-- No RLS policies are defined on purpose: RLS is enabled with zero
-- permissive policies, so anon/authenticated roles get NOTHING on these
-- tables by default. Only the service_role key (which the Edge Function
-- uses, and which bypasses RLS entirely) can read or write here — no
-- browser or client-side code should ever hold that key.

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  is_active boolean not null default true
);

comment on table api_keys is 'Presented keys are SHA-256 hashed before comparison; the plaintext key is never stored.';
comment on column api_keys.key_hash is 'hex-encoded SHA-256 of the plaintext key.';

create table if not exists usage_log (
  id bigint generated always as identity primary key,
  api_key_id uuid references api_keys(id) on delete cascade,
  created_at timestamptz not null default now(),
  state_code text,
  status_code int not null,
  error text
);

create index if not exists usage_log_api_key_id_idx on usage_log (api_key_id, created_at desc);

alter table api_keys enable row level security;
alter table usage_log enable row level security;
