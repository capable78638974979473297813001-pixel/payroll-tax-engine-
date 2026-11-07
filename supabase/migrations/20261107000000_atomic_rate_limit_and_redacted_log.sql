-- calculate-paycheck: an atomic per-key rate limit, and a usage log that no
-- longer keeps payroll bodies.
--
-- 1. Rate limit. The function used to count this key's usage_log rows, run
--    the calculation, then insert, so any number of concurrent calls could all
--    pass the count. reserve_usage() takes a per-key transaction lock, counts
--    the trailing 60 s, and inserts the row that claims the slot in the same
--    transaction, so the limit holds under concurrency. The function then
--    fills in the outcome with finish_usage().
--
-- 2. Redaction. Raw request and response bodies (wages, addresses, withholding
--    elections) are no longer stored. usage_log keeps the SHA-256 of the
--    request and of the response, which still settles "was this the exact
--    request / exact answer" in a dispute when the customer produces their
--    copy, plus the non-identifying fields already kept (state, checkDate,
--    status). Existing raw bodies are cleared.

alter table usage_log
  add column if not exists request_sha256 text,
  add column if not exists result_sha256 text;

comment on column usage_log.request_sha256 is 'hex SHA-256 of the raw request body. The body itself is not stored.';
comment on column usage_log.result_sha256 is 'hex SHA-256 of the JSON response body. The body itself is not stored.';
comment on column usage_log.request is 'Deprecated: no longer written (payroll data). Kept only so old clients of the table do not break.';
comment on column usage_log.result is 'Deprecated: no longer written (payroll data). Kept only so old clients of the table do not break.';

update usage_log set request = null, result = null where request is not null or result is not null;

create or replace function reserve_usage(p_key uuid, p_limit int)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  recent int;
  new_id bigint;
begin
  -- Serialises reservations for one key; other keys are unaffected.
  perform pg_advisory_xact_lock(hashtextextended(p_key::text, 0));
  select count(*) into recent
    from usage_log
   where api_key_id = p_key
     and created_at >= now() - interval '60 seconds';
  if recent >= p_limit then
    return null;
  end if;
  -- status_code 0 marks a reserved call whose outcome is not recorded yet.
  insert into usage_log (api_key_id, status_code) values (p_key, 0) returning id into new_id;
  return new_id;
end;
$$;

comment on function reserve_usage(uuid, int) is 'Atomically checks the trailing-60s limit for one key and claims a slot. Returns the usage_log id, or NULL when the key is over its limit.';

-- Only the service role (the Edge Function) may call it.
revoke all on function reserve_usage(uuid, int) from public, anon, authenticated;
grant execute on function reserve_usage(uuid, int) to service_role;
