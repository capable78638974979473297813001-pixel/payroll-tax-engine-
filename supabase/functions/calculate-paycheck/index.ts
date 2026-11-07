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

  // Rate limit, per key. reserve_usage() counts the trailing 60s and claims
  // a usage_log row in one locked transaction (see the 20261107 migration),
  // so concurrent calls cannot all pass the count before any of them inserts.
  const { data: usageId, error: reserveError } = await supabase.rpc('reserve_usage', {
    p_key: keyRow.id,
    p_limit: keyRow.rate_limit_per_minute,
  });
  if (reserveError) {
    console.error('reserve_usage failed:', reserveError.message);
    return json(503, { error: 'Usage could not be recorded; try again shortly.' });
  }
  if (usageId === null || usageId === undefined) {
    return json(429, {
      error: `Rate limit exceeded: this key allows ${keyRow.rate_limit_per_minute} requests/minute.`,
    });
  }

  let rawBody: string;
  let input: PaycheckInput;
  try {
    rawBody = await req.text();
    input = JSON.parse(rawBody);
  } catch {
    await supabase.from('usage_log').update({ status_code: 400, error: 'invalid_json' }).eq('id', usageId);
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

  // Record the outcome on the row reserve_usage() claimed. Payroll bodies
  // (wages, addresses, withholding elections) are NOT stored: only SHA-256
  // digests of the exact request and response, which still settle a dispute
  // when the customer produces their copy, plus state, checkDate and status.
  const responseText = JSON.stringify(responseBody);
  await Promise.all([
    supabase.from('usage_log').update({
      state_code: typeof input?.workState?.code === 'string' ? input.workState.code.slice(0, 8) : null,
      status_code: status,
      error: errorText ? errorText.slice(0, 500) : null,
      check_date: typeof input?.checkDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.checkDate) ? input.checkDate : null,
      request_sha256: await sha256Hex(rawBody),
      result_sha256: await sha256Hex(responseText),
    }).eq('id', usageId),
    supabase.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyRow.id),
  ]);

  return new Response(responseText, { status, headers: { 'Content-Type': 'application/json' } });
});
