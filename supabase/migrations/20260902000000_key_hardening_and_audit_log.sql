-- Hardens calculate-paycheck's API keys and turns usage_log into a real
-- audit trail, not just a hit counter.
--
-- Two separate asks this addresses:
--   1. Key hardening: a key can now expire, and is rate-limited so one
--      leaked/misbehaving key can't hammer the function.
--   2. Dispute defense: usage_log now captures the caller's checkDate and
--      the full request/response for every call. If a customer later
--      claims "your API gave us the wrong number" (or claims a call was
--      never made, or was made with a different key), this table is the
--      record that settles it — keyed by exactly which key, when, and
--      what checkDate the caller sent.

alter table api_keys
  add column if not exists expires_at timestamptz,
  add column if not exists rate_limit_per_minute int not null default 60;

comment on column api_keys.expires_at is 'NULL = never expires. Checked on every request; an expired key is rejected like an invalid one.';
comment on column api_keys.rate_limit_per_minute is 'Max requests this key may make in any trailing 60s window, counted from usage_log.';

alter table usage_log
  add column if not exists check_date date,
  add column if not exists request jsonb,
  add column if not exists result jsonb;

comment on column usage_log.check_date is 'The checkDate the caller sent (input.checkDate), independent of created_at (when the call was actually made) — the two differ whenever a caller recalculates a past or future pay period.';
comment on column usage_log.request is 'The full request body, for reproducing or disputing a result.';
comment on column usage_log.result is 'The full response body (success or error), captured alongside the request.';
