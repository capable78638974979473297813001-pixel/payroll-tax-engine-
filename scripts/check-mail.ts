/**
 * Send one real test email through the same path the site uses for sign-in
 * and signup codes, and say why if it does not go out.
 *
 *   node scripts/check-mail.ts you@example.com
 *
 * Run it where the site runs (the Render shell), so it sees the same
 * RESEND_API_KEY / RESEND_FROM / PUBLIC_BASE_URL. It prints the sender it will
 * use, the provider's answer with keys and codes removed, and the usual fix.
 */
import '../site/lib/env.ts';
import { domainNotVerified, isEmailConfigured, resendFromAddress, sendVerificationEmail } from '../site/lib/mail.ts';

const to = (process.argv[2] ?? '').trim();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: node scripts/check-mail.ts you@example.com');
  process.exit(2);
}
if (!isEmailConfigured()) {
  console.error('RESEND_API_KEY is not set here, so no code can be emailed. Set it in the Render dashboard (Environment) and redeploy.');
  process.exit(1);
}

const from = resendFromAddress();
console.log(`Sending from: ${from}`);
const result = await sendVerificationEmail({ name: 'Test', email: to, code: '000000', expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(), purpose: 'signin' });
if (result.sent) {
  console.log(`Accepted by Resend. Check the inbox for ${to} (and spam). The message is a sign-in code email with the code 000000.`);
  if (!/@resend\.dev>/.test(from)) console.log('If it came from onboarding@resend.dev instead, the sending domain is not verified yet (see the log line above).');
  process.exit(0);
}
const reason = result.reason ?? 'unknown error';
console.error(`Not sent: ${reason}`);
const status = Number(/responded (\d{3})/.exec(reason)?.[1] ?? 0);
if (status === 401) console.error('Fix: the API key is wrong or revoked. Create a new key in Resend and update RESEND_API_KEY.');
else if (domainNotVerified(status, reason)) console.error('Fix: verify the sending domain in Resend (Domains > Add > add the DNS records), or set RESEND_FROM to an address on a domain you have verified.');
else if (status === 403 || status === 422) console.error('Fix: Resend only delivers from its test address to the Resend account owner. Verify a domain, or send to the address you signed up to Resend with.');
else if (status === 429) console.error('Fix: Resend is rate limiting this key. Wait and try again.');
process.exit(1);
