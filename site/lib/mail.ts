/**
 * Verification email, sent through Resend's HTTP API -- no SDK, just
 * fetch, matching this project's zero-dependency habit.
 *
 * Reads RESEND_API_KEY (and optionally RESEND_FROM) from the environment;
 * server.ts loads them from a git-ignored .env at the repo root via
 * process.loadEnvFile() before this module is called. See .env.example.
 *
 * Fails soft on purpose: with no key configured, or if Resend rejects the
 * call, this returns { sent: false, reason } instead of throwing, and
 * server.ts prints the code to its own console instead. Signup keeps
 * working locally without an email provider -- you read the code off the
 * terminal rather than an inbox -- and nothing anywhere claims a message
 * was delivered when it wasn't.
 */

/** Read at call time so a .env loaded after this module is imported still applies. */
function resendEndpoint(): string {
  const base = (process.env.RESEND_API_BASE ?? 'https://api.resend.com').trim().replace(/\/+$/, '');
  return `${base}/emails`;
}

export function resendApiKey(): string {
  return (process.env.RESEND_API_KEY ?? '').trim();
}

/**
 * Resend's shared sandbox sender. Works with zero setup, but Resend only
 * delivers mail from it to the address the Resend account itself signed
 * up with -- fine for testing on yourself, not for real signups. Verify a
 * domain and set RESEND_FROM to lift that.
 */
function defaultFrom(): string {
  // Resend delivers its test address only to the account owner. With a real
  // public address configured, send from verify@ that domain instead.
  try {
    const host = new URL(process.env.PUBLIC_BASE_URL ?? '').hostname.replace(/^www\./, '');
    if (host.includes('.') && host !== 'localhost' && host !== '127.0.0.1') return `Omnia.tax <verify@${host}>`;
  } catch {
    /* no PUBLIC_BASE_URL */
  }
  return 'Omnia.tax <onboarding@resend.dev>';
}

/**
 * RESEND_FROM is read at send time. A bare address (RESEND_FROM=verify@omniatax.io)
 * is sent as "Omnia.tax <verify@omniatax.io>". A value that already has a name
 * is used as written. Quotes and surrounding space are ignored.
 */
export function resendFromAddress(): string {
  const raw = (process.env.RESEND_FROM ?? '').trim().replace(/^['"]|['"]$/g, '').trim();
  if (!raw) return defaultFrom();
  if (/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(raw)) return `Omnia.tax <${raw}>`;
  return raw;
}

/**
 * A line safe to write to the server log. Strips API keys, bearer tokens,
 * and 6-digit codes. The caller never logs the address or the code itself.
 */
export function scrubMailLog(text: string): string {
  return text
    .replace(/re_[A-Za-z0-9_-]+/g, '[redacted]')
    .replace(/\b(?:sk|rk)_(?:test|live)_[A-Za-z0-9]+/g, '[redacted]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/\b\d{6}\b/g, '[code]')
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 300);
}

/** Same function under the name the verifier client and the PR #144 tests use. */
export const redactMailError = scrubMailLog;

function mailHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // A default fetch user agent is rejected by Resend's edge with 403.
    'User-Agent': 'omniatax-site/1.0',
  };
}

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(resendApiKey());
}

export async function sendVerificationEmail(args: {
  name: string;
  email: string;
  code: string;
  expiresAt: string;
}): Promise<SendResult> {
  const apiKey = resendApiKey();
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY is not set.' };

  const from = resendFromAddress();
  const firstName = args.name.split(' ')[0] || args.name;
  const minutes = Math.max(1, Math.round((new Date(args.expiresAt).getTime() - Date.now()) / 60_000));

  const html = `
    <div style="font-family:'Inter Tight',Helvetica,Arial,sans-serif;max-width:440px;margin:0 auto;padding:32px 8px;color:#0A0A0A">
      <p style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#1F3BFF;margin:0 0 18px">Omnia.tax</p>
      <h1 style="font-size:24px;font-weight:700;margin:0 0 12px;letter-spacing:-.02em">Confirm your email, ${escapeHtml(firstName)}</h1>
      <p style="font-size:15px;line-height:1.6;color:#6E7079;margin:0 0 22px">
        Enter this code in the Omnia.tax console to verify your address and continue setting up your account.
        It expires in ${minutes} minute${minutes === 1 ? '' : 's'}.
      </p>
      <div style="font-family:'JetBrains Mono',Menlo,Consolas,monospace;font-size:30px;font-weight:700;letter-spacing:.34em;background:#0A0A0A;color:#FFFFFF;text-align:center;padding:18px 8px;margin-bottom:22px">
        ${escapeHtml(args.code)}
      </div>
      <p style="font-size:12.5px;color:#6E7079;margin:0;border-top:1px solid #E1E3E8;padding-top:12px">
        Didn't start a signup? Ignore this &mdash; nothing happens without this code, and no payment method is
        collected until you review the terms.
      </p>
    </div>
  `.trim();

  try {
    const res = await fetch(resendEndpoint(), {
      method: 'POST',
      headers: mailHeaders(apiKey),
      body: JSON.stringify({
        from,
        to: [args.email],
        subject: `${args.code} is your Omnia verification code`,
        html,
        text: `Hi ${firstName}, your Omnia verification code is ${args.code}. It expires in ${minutes} minute(s).`,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, reason: scrubMailLog(`Resend responded ${res.status}: ${body}`) };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: scrubMailLog(err instanceof Error ? err.message : 'Unknown error calling Resend.') };
  }
}

/** Where contact-form messages go. Defaults to the address published on the contact page. */
export function contactRecipient(): string {
  return process.env.CONTACT_TO || 'scottholdan@gmail.com';
}

/** A message from the contact form, delivered to the owner with Reply-To set to the sender. */
export async function sendContactEmail(args: { name: string; email: string; company: string; message: string }): Promise<SendResult> {
  const apiKey = resendApiKey();
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY is not set.' };
  const text = `From: ${args.name} <${args.email}>\nCompany: ${args.company || '(none)'}\n\n${args.message}`;
  try {
    const res = await fetch(resendEndpoint(), {
      method: 'POST',
      headers: mailHeaders(apiKey),
      body: JSON.stringify({
        from: resendFromAddress(),
        to: [contactRecipient()],
        reply_to: args.email,
        subject: `Omnia.tax contact: ${args.name}`.slice(0, 120),
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { sent: false, reason: scrubMailLog(`Resend responded ${res.status}: ${body}`) };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: scrubMailLog(err instanceof Error ? err.message : 'Unknown error calling Resend.') };
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
