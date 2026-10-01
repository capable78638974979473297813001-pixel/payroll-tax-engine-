# Omnia.tax, design B: developer handoff

> **Pricing note (2026-10-01):** the product price is a flat **$0.09 per call**. The PNG/SVG frames in `screens/` were exported at $0.125 and still show that figure; the copy in `SPEC.md` has been updated, the images have not.


This is design B (Swiss, cobalt + ink), which the client picked, refined as v2. The job is to implement it as working code in the existing repo, **with no new features**.

## What's here
| Path | What |
|---|---|
| `SPEC.md` | One section per screen (B00–B08): purpose, route, layout px, components + tokens, verbatim copy, behaviour and wiring, states and data notes. It also has the Components table, the Logo section and the Stripe Appearance object. **Start here.** |
| `tokens.css` | CSS custom properties: colours, fonts (with the Google Fonts `@import`), type scale, 8px spacing scale, borders/radii, grid, controls, focus. |
| `tokens.json` | The same values as JSON (generated from `tokens.css`, so they can't drift). |
| `screens/` | Final PNG + SVG for B00–B08 and `b-flow-overview.png` (the click path). The SVGs keep layer names (`Button / …`, `Field / …`, `Stepper`, …). |
| `logo/` | `logo.svg`, `logo-reversed.svg`, `logo-on-blue.svg`, `logo-mark.svg`, `favicon.svg` (direction 2, "Pay stub", chosen by Scott, outlined paths, no font needed) and `logo-directions.png` (the three directions compared). |

Generator source (for reference, not needed to build): `/workspace/figma/b_gen_flow.py`, `/workspace/figma/logo/omnia_logo.py`.

## Build order
1. **Tokens and fonts**: import `tokens.css`. Load Inter Tight and JetBrains Mono at 400/700 only.
2. **Primitives**: Logo, Rule, Tag, Button (all variants/sizes/states), Input, Alert. Check each against **B08**.
3. **Onboarding components**: ProgressSteps, CodeBoxes, Stepper, PasswordRule, and the onboarding shell (cobalt step panel + form column).
4. **Flow B01 → B05** (`/signup`, `/signup/verify`, `/signup/business`, `/signup/payment`, `/signup/key`), wired to the existing auth / verification / billing endpoints. Payment = Stripe Payment Element with the Appearance object in SPEC §B04.
5. **Docs B06** (`/docs`): the nav, the three-column layout, Table, CodePanel. Errors and Response headers are new **content**, not new behaviour.
6. **Sandbox B07** (`/sandbox`): request form ↔ JSON ↔ code panel, Send to the existing `POST /v1/paycheck`, response tabs Paystub / Body / Headers, the KeyMenu, and the error state from B08 §06.
7. **Landing B00** (`/`): static content, so build it last or in parallel.

## Out of scope
- **No new backend features.** Wire the UI only to endpoints that already exist: signup, email verification, account/business, Stripe setup, key issuance, and `POST /v1/paycheck`. If something in the frames has no endpoint (e.g. the sandbox rail's "GET List states" / "GET Your key", RECENT history, the key menu's "Forget key", the docs search), render it disabled or leave it out, and flag it. Don't build a backend for it.
- Don't change prices, trial length, error codes or headers. They're product facts (SPEC marks them [REAL]).
- Everything marked [EXAMPLE] is placeholder data. It must come from real state (email, business, key, dates, counts) or stay visibly labelled (EXAMPLE DATA / ILLUSTRATIVE).
- Responsive/mobile layouts aren't designed. The frames are 1440 desktop.

## Data rules (quick reference)
- Estimate = employees × 26 × $0.09 ÷ 12, rounded to cents (`Math.round(n * 234 / 12)` cents). It updates live and is labelled "ASSUMES BIWEEKLY". Stepper min is 1.
- "Due today $0.00". Trial end = signup date + 14 days. "Trial · Day N of 14".
- The API key is **shown once** (B05). Everywhere else shows the masked `sk_test_…xxxx`.
- Money in the API is integer cents. The sandbox form takes dollars and converts them.

## What changed in v2 (vs the v1 frames)
- The brand is now **Omnia.tax** in every nav, header, footer and frame title. The logo is the outlined direction-1 lockup.
- Everything snapped to an 8px spacing scale. Controls are 48/40/32. Type is consolidated to the scale in `tokens.css`.
- Multi-line copy is driven by max-widths, not manual breaks.
- Docs: full Errors table (9 codes), `details` field, new Response headers section, and "Response headers" added to the docs nav.
- New **B08 States** board.
- B04: removed the separate "OR / Continue with PayPal" button, because the Payment Element's PayPal tab covers it. Input focus changed from a 3px cobalt bottom rule to a 2px cobalt border, per the brief.

## Open questions (please confirm before or while building)
1. **"Get a demo" vs "no sales call".** The primary CTA is labelled "Get a demo", but it goes straight to self-serve signup, and the page repeatedly says "No sales call" / "Do I need to talk to sales? No." Suggest renaming to something like "Start free trial" / "Create account". The label is unchanged in v2 until the client decides.
2. **The real API domain.** Every sample uses `api.<your-domain>`. What's the production base URL (and is there a separate test host)?
3. **"Start building" target.** It isn't wired in the prototype. Should it go to /signup or /docs?
4. Other link targets not designed: Sign in, Product / Coverage / Pricing (anchors?), Contact, Terms, Privacy Policy, "Change it" (B02), sandbox "API reference" / "Pricing", "Your account".
5. **New error copy** (v2) for invalid_json, invalid_key, account_suspended, invalid_input and calculation_error. Also, how does calculation_error relate to the "not modelled" line?
6. **422 `details` item shape.** B08 shows `{ field, message }` as ILLUSTRATIVE. What's the real contract?
7. **Units** for `RateLimit-Reset` and `Retry-After` (seconds? epoch?). What are the actual per-minute limit values?
8. **Stepper maximum**, and whether the value cell accepts typed input.
9. **Verification**: attempt count ("2 tries left" comes from the API?), the resend countdown length (the frame shows 0:42) and code expiry (the email says 10 minutes).
10. **B05 modal dismissal**: allow Escape/backdrop close, or require "Go to the docs"? Since the key is shown once, what should KeyMenu → "Copy key" do later?
11. The sandbox "5 more fields below" only names 2 of the 5 (Residence state, YTD Social Security wages). What are the other three? JavaScript/Python snippets aren't designed.
12. **Button focus ring** isn't drawn. Suggested: 2px cobalt outline with a 2px offset. Hover/pressed colours were derived from the existing palette (cobalt → ink), and no new colours were added.
13. Placeholder copy on B08 (input error "Enter a valid work email.", toasts "Key copied to clipboard." / "We couldn’t send the code. Try again in a minute."). Replace it with the real messages from the existing backend where they exist.
14. Line-heights for the single-line-only display styles are suggestions (noted in `tokens.css`).
15. **Logo**: Scott picked direction 2, "Pay stub". It is in place. Directions 1 and 3 remain on `logo/logo-directions.png` if the client prefers another.
