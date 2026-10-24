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
| Disclaimer | `/disclaimer` | The payroll-specific shield: **calculations, not advice; you file, you verify, you're responsible.** Terms §1 makes it, and the Acceptable Use Policy, part of the Terms. |

The signup flow already records **consent** (terms version, typed signature, time,
IP) — see `site/lib/terms.ts` and the acceptance records in the store. Keep those;
they are your evidence that a customer agreed.

## Fill these placeholders before launch

Search the `site/legal/` files (and `LICENSE`) for square-bracket tokens and replace
every one:

- `[LEGAL ENTITY NAME]` — **done**: the entity is **OMNIA TAX LLC** (filled in `LICENSE`, `site/legal/*`, the landing footer and `package.json`). Keep the name identical to the formation documents.
- `[EFFECTIVE DATE]` — **done**: Terms and Privacy are effective October 19, 2026 (Terms version `2026-10-19.2`, in `site/lib/terms.ts` and `site/legal/terms.html`; bump both together, and the test in `tests/site-signup.test.ts`). Acceptable Use and Disclaimer are dated October 6, 2026.
- `[STATE]` — **done**: Michigan.
- `[COUNTY, STATE]` — **done**: Oakland County, Michigan.
- `[COMPANY ADDRESS]` — **done**: 595 N Old Woodward Ave, Birmingham, Michigan (add suite/ZIP if the formation documents list them).
- `[SECURITY EMAIL]` / `[LEGAL EMAIL]` — **done**: scottholdan@gmail.com.
- `[ARBITRATION BODY]` — the Terms (§9) now require individual binding arbitration in Michigan under the Federal Arbitration Act with a class-action and jury waiver, a 30-day opt-out by email, and Oakland County, Michigan courts for small claims, injunctions and anything that cannot be arbitrated. No named provider is set ("a recognized arbitration provider"). Counsel should confirm the clause and choose a provider.

## Ownership ("this is mine only")

- `LICENSE` is now **proprietary — All rights reserved** (previously MIT). `package.json`
  is `"license": "UNLICENSED"`, `"private": true`. Nobody may copy, use, host, or resell
  the code without your written permission.
- The Terms assert Omnia's ownership of the software, data, rulesets, brand, and site.
- Every legal page and footer carries `© 2026 OMNIA TAX LLC. All rights reserved.`

> If any part of this repo was ever published under MIT, understand that copies made
> under that earlier license stay under it — the relicense is only prospective. If that
> matters to you, ask counsel. If you *want* the underlying tax engine to stay open
> source while keeping the Omnia product proprietary, tell me and I'll split the
> license by directory.

## Things worth asking a lawyer about specifically

- **Limitation of liability cap** (Terms §7) — total liability is capped at the fees paid in the
  twelve months before the claim, and consequential damages and any tax, penalty or interest
  are excluded; confirm both hold in Michigan and for your price once it is set.
- **New terms version 2026-10-23.1 needs Scott/legal review** — `site/lib/terms.ts` and
  `site/legal/terms.html` now say a 14-day free trial, then $0.08 per successful paycheck
  calculation, pay as you go, card required at signup, usage during the trial not charged.
  The previous text is frozen as `2026-10-19.2` and is not what new signups accept.
  Counsel should confirm the $0.08 rate, the trial-metering statement, and that dropping
  the unpublished-rate language is what you want to offer.
- **Address lookups and employee data** — the Privacy Policy (§5) discloses that addresses sent
  to `POST /v1/address` may be looked up with public geocoding services (U.S. Census Bureau,
  OpenStreetMap Nominatim, state and county GIS). Confirm that disclosure and your customers'
  notice obligations for employee home addresses.
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
