# Omnia — Legal pages (owner notes)

**These documents are templates, not legal advice.** They were drafted to cover the
usual bases for a US B2B payroll-tax calculation API, but they are not a substitute
for a lawyer. Before you take real customers or money, have a licensed attorney in
your state review and adapt them to your actual business, entity, and jurisdiction.
Do not present them as attorney-reviewed until they are.

## What's here

Served on the site (linked from every footer):

| Page | URL | Purpose |
|---|---|---|
| Terms of Service | `/terms` | The master contract: license, payment, IP ownership, **warranty disclaimer**, **limitation of liability**, indemnity, governing law. This is your main liability shield. |
| Privacy Policy | `/privacy` | What you collect and why; Stripe/email processors; cookies; retention; user rights (CCPA etc.). |
| Acceptable Use | `/acceptable-use` | Rules of the road: no reselling, no scraping, no reverse engineering, keep keys secret. |
| Disclaimer | `/disclaimer` | The payroll-specific shield: **calculations, not advice; you file, you verify, you're responsible.** |

The signup flow already records **consent** (terms version, typed signature, time,
IP) — see `site/lib/terms.ts` and the acceptance records in the store. Keep those;
they are your evidence that a customer agreed.

## Fill these placeholders before launch

Search the `site/legal/` files (and `LICENSE`) for square-bracket tokens and replace
every one:

- `[LEGAL ENTITY NAME]` — your registered company, e.g. "Omnia Payroll Technologies, LLC". **Form an entity (LLC/corp) — do not run this personally.** It is the single biggest thing separating your personal assets from a lawsuit.
- `[EFFECTIVE DATE]` — the date you publish.
- `[STATE]` — the state whose law governs (usually where your entity is formed).
- `[COUNTY, STATE]` — the venue for disputes.
- `[COMPANY ADDRESS]` — your business address.
- `[SECURITY EMAIL]` / `legal@` / `privacy@` / `security@omnia.tax` — set up these inboxes or repoint them.
- `[ARBITRATION BODY]` — only if you keep the optional arbitration clause (Terms §13). **Discuss the arbitration / class-action waiver with counsel before enabling it** — it's powerful but regulated, and unenforceable if done wrong.

## Ownership ("this is mine only")

- `LICENSE` is now **proprietary — All rights reserved** (previously MIT). `package.json`
  is `"license": "UNLICENSED"`, `"private": true`. Nobody may copy, use, host, or resell
  the code without your written permission.
- The Terms assert Omnia's ownership of the software, data, rulesets, brand, and site.
- Every legal page and footer carries `© 2026 [LEGAL ENTITY NAME]. All rights reserved.`

> If any part of this repo was ever published under MIT, understand that copies made
> under that earlier license stay under it — the relicense is only prospective. If that
> matters to you, ask counsel. If you *want* the underlying tax engine to stay open
> source while keeping the Omnia product proprietary, tell me and I'll split the
> license by directory.

## Things worth asking a lawyer about specifically

- **Limitation of liability cap** (Terms §10) — the $100/12-months cap is standard for
  low-priced SaaS; confirm it holds in your state and for your price point.
- **Auto-renewing subscription law** — US ROSCA and state "automatic renewal law"
  (e.g. California) require clear disclosure and easy cancellation. The trial is kept
  cancellable for this reason (`site/lib/terms.ts` explains it); confirm your renewal
  notices meet your states' rules.
- **Data role** — you're a *processor* for the calculation inputs and a *controller*
  for account data; make sure your customer contract (the Terms) and privacy page say
  so consistently. If you ever touch EU/UK data, you need a transfer mechanism and
  probably a DPA.
- **Insurance** — tech E&O / professional liability insurance is the practical backstop
  behind these clauses. Get a quote.
- **"Not tax advice"** — keep this prominent (it's in the footer, the terms, and a whole
  disclaimer page). It's what keeps a calculator from being treated as a tax preparer.

None of the above is legal advice; it's a checklist to bring to someone who can give it.
