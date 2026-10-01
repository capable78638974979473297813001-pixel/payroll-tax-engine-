/**
 * Client for the Python email-verification service (verifier/email_verifier.py).
 *
 * When VERIFIER_URL and VERIFIER_SECRET are set, the site hands code
 * issuing, delivery and checking to that service: no code is ever written
 * to the site's store, and the service holds only HMAC hashes. With them
 * unset the site falls back to its built-in verification, so local
 * development still works with nothing else running.
 */

export function verifierConfigured(): boolean {
  return Boolean(process.env.VERIFIER_URL && process.env.VERIFIER_SECRET);
}

export interface IssueResult {
  ok: boolean;
  sent: boolean;
  cooldown?: boolean;
  /** Set when the service refused (e.g. 429) or could not be reached. */
  status?: number;
  retryAfterSec?: number;
}

async function call(path: string, body: unknown): Promise<{ status: number; json: Record<string, unknown>; retryAfter?: number }> {
  const res = await fetch(new URL(path, process.env.VERIFIER_URL!), {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.VERIFIER_SECRET}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const retryAfter = Number(res.headers.get('retry-after')) || undefined;
  return { status: res.status, json, retryAfter };
}

export async function issueCode(email: string, name: string): Promise<IssueResult> {
  try {
    const { status, json, retryAfter } = await call('/issue', { email, name });
    if (status === 200) return { ok: true, sent: json.sent === true, cooldown: json.cooldown === true };
    return { ok: false, sent: false, status, retryAfterSec: retryAfter };
  } catch (err) {
    console.error(`[verifier] issue failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return { ok: false, sent: false, status: 503 };
  }
}

/** True only when the service confirms the code. Any failure, including an unreachable service, is false. */
export async function checkCode(email: string, code: string): Promise<boolean> {
  try {
    const { status, json } = await call('/check', { email, code });
    return status === 200 && json.ok === true;
  } catch (err) {
    console.error(`[verifier] check failed: ${err instanceof Error ? err.message : 'unknown error'}`);
    return false;
  }
}
