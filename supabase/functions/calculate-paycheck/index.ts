// Supabase Edge Function: POST /functions/v1/calculate-paycheck
//
// A thin HTTP wrapper around this repo's own calculatePaycheck() — the
// exact function tests/engine.test.ts's 884 tests and the general
// calculator UI (examples/calculator-server.ts) both call. Every state's
// tax logic lives in src/taxes/, not here; this file only adds an API
// surface: key validation against Postgres, then one function call.
//
// Auth is NOT Supabase's own JWT scheme — this project's own api_keys
// table, checked by SHA-256 hash so a stolen table dump never yields a
// usable key. supabase/config.toml sets verify_jwt = false for this
// function so callers only ever need to send this key, not a separate
// Supabase anon/JWT token.

import { createClient } from 'jsr:@supabase/supabase-js@2';
// Imported from _shared/engine/, a scripted copy of src/ (see
// scripts/build-edge-function.ts's own doc comment for why this is a
// copy rather than a cross-directory import reaching outside supabase/).
import { calculatePaycheck } from '../_shared/engine/calculate.ts';
import { setDataReader } from '../_shared/engine/registry.ts';
import type { PaycheckInput } from '../_shared/engine/types.ts';
import { DATA_BUNDLE } from '../_shared/data-bundle.ts';

// Point the engine at the build-time data snapshot instead of node:fs —
// see registry.ts's own setDataReader() doc comment for why this exists.
// Re-stringifying an already-parsed value here is deliberate, not an
// oversight: it keeps this one call site the ONLY place that knows the
// bundle holds parsed objects, so DataReader's contract (raw text in,
// same as a real file read) stays identical for every caller.
setDataReader((relPath) => {
  const value = DATA_BUNDLE[relPath];
  return value === undefined ? undefined : JSON.stringify(value);
});

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { error: 'POST only.' });
  }

  const presentedKey = (req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? req.headers.get('x-api-key'))?.trim();
  if (!presentedKey) {
    return json(401, {
      error: 'Missing API key — send "Authorization: Bearer <key>" or "x-api-key: <key>".',
    });
  }

  const keyHash = await sha256Hex(presentedKey);
  const { data: keyRow } = await supabase
    .from('api_keys')
    .select('id, is_active, expires_at, rate_limit_per_minute')
    .eq('key_hash', keyHash)
    .maybeSingle();

  if (!keyRow || !keyRow.is_active) {
    return json(401, { error: 'Invalid or inactive API key.' });
  }

  if (keyRow.expires_at && new Date(keyRow.expires_at).getTime() <= Date.now()) {
    return json(401, { error: 'This API key expired on ' + keyRow.expires_at + '.' });
  }

  // Rate limit: count this key's own hits in the trailing 60s rather than a
  // shared counter, so one key's burst never throttles any other key.
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count: recentCount } = await supabase
    .from('usage_log')
    .select('id', { count: 'exact', head: true })
    .eq('api_key_id', keyRow.id)
    .gte('created_at', windowStart);

  if ((recentCount ?? 0) >= keyRow.rate_limit_per_minute) {
    return json(429, {
      error: `Rate limit exceeded: this key allows ${keyRow.rate_limit_per_minute} requests/minute.`,
    });
  }

  let input: PaycheckInput;
  try {
    input = await req.json();
  } catch {
    return json(400, { error: 'Request body must be valid JSON.' });
  }

  let status = 200;
  let responseBody: unknown;
  let errorText: string | null = null;
  try {
    const result = calculatePaycheck(input);
    responseBody = { result };
  } catch (err) {
    status = 422;
    errorText = err instanceof Error ? err.message : 'Unknown calculation error.';
    responseBody = { error: errorText };
  }

  // Fire-and-log, not fire-and-forget-the-response: the caller gets their
  // result either way, but usage/last-used tracking happens before
  // returning so a burst of concurrent requests can't race past it. The
  // full request + result are captured here (not just a status code) so a
  // later dispute over what this key did — or whether it was even this key
  // that did it — can be settled by pulling this row, not by trusting either
  // side's memory of the call.
  await Promise.all([
    supabase.from('usage_log').insert({
      api_key_id: keyRow.id,
      state_code: input?.workState?.code ?? null,
      status_code: status,
      error: errorText,
      check_date: input?.checkDate ?? null,
      request: input ?? null,
      result: responseBody,
    }),
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id),
  ]);

  return json(status, responseBody);
});
