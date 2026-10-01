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

// Overridable only to point tests at a local stand-in.
const RESEND_ENDPOINT = `${process.env.RESEND_API_BASE ?? 'https://api.resend.com'}/emails`;

/**
 * Resend's shared sandbox sender. Works with zero setup, but Resend only
 * delivers mail from it to the address the Resend account itself signed
 * up with -- fine for testing on yourself, not for real signups. Verify a
 * domain and set RESEND_FROM to lift that.
 */
const DEFAULT_FROM = 'Omnia.tax <onboarding@resend.dev>';

export interface SendResult {
  sent: boolean;
  reason?: string;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendVerificationEmail(args: {
  name: string;
  email: string;
  code: string;
  expiresAt: string;
}): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'RESEND_API_KEY is not set.' };

  const from = process.env.RESEND_FROM || DEFAULT_FROM;
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
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
      return { sent: false, reason: `Resend responded ${res.status}: ${body.slice(0, 240)}` };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.message : 'Unknown error calling Resend.' };
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
