# Omnia.tax, design B (v2): implementation spec

Source of truth: `/workspace/figma/b_gen_flow.py` (generator) and the client brief. The frames are in `screens/`. Tokens are in `tokens.css` and `tokens.json`.
Every px value below comes from the generator. Where the design doesn't decide something, it says **OPEN** and the question is listed in `README.md`.

**Conventions**
- Frame width is 1440. Grid: 12 columns, 64 margins, 24 gutters, 1312 content width, 87.33 column (fluid in code). "col n" means grid column n (1-based). "cols a–b" means the span from the left edge of col a to the right edge of col b.
- Tokens are written `--text-heading-lg` (a type style, i.e. its size/lh/weight/ls set), `--color-cobalt`, `--space-3`, and so on.
- Copy is verbatim in "quotes". `’` and `—` are real typographic characters, so keep them.
- Data labels: **[EXAMPLE]** = placeholder/sample data that must come from real state or be marked as illustrative. **[REAL]** = a real product value.
  - [REAL]: $0.125 per paycheck; 14-day free trial; "Due today $0.00"; POST /v1/paycheck; the `{ result: {...} }` success shape and the `{ error, code, requestId }` error shape; the error codes and response headers in B06; the "biweekly = 26 paychecks a year" assumption.
  - [EXAMPLE]: every amount in the sandbox paystub (the design labels them EXAMPLE DATA); `you@company.com`; "Acme Manufacturing Co." / "Acme Manufacturing"; `481 902`; `sk_test_…4f2a` and every other key string; `api.<your-domain>` / `https://api.<your-domain>`; "Oct 12, 2026" (= Sep 28, 2026 + 14); "20 employees" / "$5.42"; "0:42"; the request bodies (2026-08-15, OH / Columbus, 100000, and so on); every B08 error message except "Your card number is incomplete." and "That code didn’t match. 2 tries left.".
- No text relies on manual line breaks. Multi-line text is a block with a **max-width**, which is given per element. Where a break has to land in a particular place, the max-width was chosen to produce it, or a non-breaking space is used (noted).
- Text blocks use the tokens' line-heights. The SVG positions are baselines, so rebuild the vertical rhythm from the gaps listed here, not from the SVG `y` values.

---

## 0. Global

### Spacing scale (8px)
`4 · 8 · 16 · 24 · 32 · 40 · 48 · 56 · 64 · 72 · 80 · 96 · 120` (`--space-0-5` … `--space-15`). 4 is the only half step. It's used for icon/label nudges, the gap between alert rows, and the console's label-to-field gap.

### Type scale
Sizes: `10 11 12 13 14 16 18 20 24 28 32 40 48 64 96 112 136`, plus three display figures: `250` (step numeral), `300` ("50"), and `380` ("$0.125"). Every v1 size was snapped to this list (for example 15→16, 17/19→18, 22→24, 26→28, 44/52→48, 60/72→64, 104→96, 116→112, 132→136). The full style table is in `tokens.css`. Mono labels are UPPERCASE with tracking.

### Colour use
- Cobalt `#1F3BFF`: primary actions, the single accent, full-bleed bands (hero Fig. 1, CTA, and the onboarding step panel).
- Black `#0A0A0A`: text, rules, secondary fills (the "03" band, banners, tabs).
- Green/red: **signal only** (success/error), never decoration.
- On cobalt: text `#FFFFFF` / muted `#C7CEFF`, rules `#576CFF`. On black: muted `#9A9CA5`, rules `#2A2B30`, accents `#8C9BFF`.

### Corners, rules and focus
- Radius 0 everywhere.
- Rules: 1px hairline, 2px ink (input bottom, top bars), 3px ink (table heads, panel rules), 6px ink (section heads; progress bars are 6px tall).
- Focus: inputs replace their bottom rule with a 2px cobalt border on all sides plus a cobalt caret. The design doesn't specify a focus ring for buttons and links (**OPEN**). Suggested: `outline: 2px solid var(--color-cobalt); outline-offset: 2px`.

### Page titles (`<title>`)
The design only fixes the brand. Suggested pattern: `"<Screen> — Omnia.tax"`, e.g. "Omnia.tax — Payroll tax calculation API" (/), "Create account — Omnia.tax", "Check your email — Omnia.tax", "About your business — Omnia.tax", "Add a payment method — Omnia.tax", "Docs — Omnia.tax", "API Console — Omnia.tax". The SVG frames carry `<title>Omnia.tax — Bnn …</title>`.

### Logo
See §Logo below. The nav uses direction 2 "Pay stub" everywhere (chosen by Scott). It's rendered from paths (`logo/logo.svg`), not typed text.

---

## Logo (Omnia.tax)

Files: `logo/logo.svg` (lockup, black + cobalt, transparent), `logo/logo-reversed.svg` (on black), `logo/logo-on-blue.svg` (all white, for the cobalt onboarding panel), `logo/logo-mark.svg` (mark only), `logo/favicon.svg` (32×32, mark on a white tile, 4px padding). `logo/logo-directions.png` compares the three directions. The generator source is `/workspace/figma/logo/omnia_logo.py` (+ `gen_logo.py`).

- **Direction 1, "Grid O" (previous default).** On a 16-unit grid (u = mark size / 16): a true circle ring (outer radius 7u, stroke 3u, centred at 7u, 8u) with a 4u cobalt square "full stop" at (12u, 11u). It reads as "O." of Omnia.tax. The wordmark is Inter Tight 700 converted to outlines. "Omnia" and "tax" are in ink, and the period is redrawn as a cobalt square (0.155 em) to echo the mark.
- **Lockup geometry** (from v1): mark `s×s`; the wordmark starts at `1.45 s`, font size `1.18 s`, baseline at `0.86 s`, tracking −0.025 em. Nav sizes: s = 22 (landing, onboarding, B08) and s = 20 (docs, console, footer). Minimum: mark at 16px (bars and strokes stay ≥ 3px).
- **Schemes:** default (ink + cobalt on white/panel); reversed (white + `#8C9BFF` accent on black, because cobalt on black is only about 2.5:1); on-blue (all white on cobalt).
- **Swapping:** set `LOGO_DIRECTION` in `b_gen_flow.py` (1/2/3) and re-run, or replace the three SVGs. In code, keep the logo as a single `<Logo scheme="default|reversed|on-blue" size={22} />` component that inlines the SVG. Give it `aria-label="Omnia.tax"`, and wrap it in a link to `/`.
- **In use: 2 "Pay stub"** (three ruled lines plus a right-aligned cobalt net-pay bar), chosen by Scott. Other alternative: **3 "Wordmark"** (outlined "Omnia" in ink with ".tax" in cobalt; the favicon is the outlined O plus the cobalt stop).

---

## Components

All components are sharp-cornered and use tokens only. "Line box 16" means a 13px label sits in a 16px-high line box.

| Component | Props | States / notes |
|---|---|---|
| **Button** | `variant: primary \| secondary \| ink \| white \| outline-white \| text`, `size: lg \| md \| sm`, `icon: arrow \| none`, `fullWidth`, `loading`, `disabled`, `onClick/href` | Sizes: lg 48h / 24px padding-x / 16/700 label; md 40 / 16 / 16; sm 32 / 16 / 14. Label ls −0.2px. Arrow icon 16w, 8 gap (2px stroke, square caps). Full-width buttons centre label and icon. **primary**: cobalt fill, white. **secondary**: 2px ink border (inset), ink text. **ink**: black fill, white. **white**: white fill, ink (on cobalt). **outline-white**: 2px white border (on cobalt). **text**: ink 700 label with a 2px cobalt underline 5px below the baseline. **hover**: primary → ink fill; secondary → panel fill; text → underline 4px. **pressed**: primary → ink fill with a 2px cobalt inset border; secondary → ink fill, white text; text → panel fill. **loading**: the label stays, a 12px spinner (270° arc, 2px, current colour) replaces the arrow in the same 24px slot, `aria-busy`, not clickable. **disabled**: fill `--color-hairline`, text `--color-placeholder` (secondary: hairline border; text: placeholder label and underline). See B08 §02. |
| **Input** (TextField) | `label`, `value`, `placeholder`, `type`, `rightSlot: "Show" \| chevron`, `hint`, `error`, `disabled` | Label 13/700 ink (line box 16), 8 gap, box 48h, panel fill, 16px padding-x, value 16/400. **default**: 2px ink bottom rule; placeholder in `--color-placeholder`. **focus**: 2px cobalt border (all sides) and a 2px cobalt caret. **filled**: ink value. **error**: 2px `--color-error` border, message 13/400 red, 8 below the box (`aria-describedby`). **disabled**: label and value in placeholder grey, bottom rule hairline. Right slot "Show" = text 13/700, 16 from the right edge. |
| **PasswordRule** | `label`, `met` | Line box 16. **unmet**: a 10.5px open square (1.5px grey) + label 13/400 grey. **met**: a 12px green check + label 13/700 green. Placed 8 below the password box. |
| **CodeBoxes** | `length=6`, `value`, `error` | Six boxes 72×80, 8 gap. After box 3 there's a 32 gap holding a 16×3 ink dash. Digits are mono 40/700, centred. **empty**: panel fill, 2px hairline bottom rule. **filled**: 2px ink bottom rule. **active** (typing): white fill, 2px cobalt border, 2×32 cobalt caret. **error**: every box has a 2px red border, and the message "That code didn’t match. 2 tries left." is 13/400 red, 8 below, followed 16 later by the text link "Resend code". Paste fills all boxes, and Backspace moves back (behaviour **OPEN** but standard). |
| **Stepper** | `value`, `min=1`, `max` (**OPEN**), `onChange` | − and + are 48×48 ink squares with white 16×3 / 3×16 glyphs, around a 120×48 value cell (panel fill, 2px ink bottom rule, mono 24/700 centred). **At min (1)** the − button is disabled (hairline fill, placeholder glyph). A hint 14/400 grey sits 16 to the right. |
| **ProgressSteps** | `steps=["Account","Verify","Business","Payment","API key"]`, `current` | Five equal segments with 8 gaps over cols 7–12 (644 wide). Bar 6h: done = ink, current = cobalt, upcoming = hairline. Label row is 16 below the bar: done = 12px ink check; current = mono 11/700 cobalt "0n" + label 13/700 ink; upcoming = mono 11 placeholder "0n" + label 13/400 grey. The label starts 24 after the index. |
| **SectionIndex** (SectionHead) | `index`, `label`, `rightLabel`, `dark` | 6px ink rule across the content width. Index "01"… in cobalt at 136/700 (ls −8px), in cols 1–3, baseline 128 below the rule, offset −6px (optical). Mono label (`--text-eyebrow`, ink) at col 4, baseline 38 below the rule. Right label is mono 12/400 grey, right-aligned. On black: rule and label white, right label `#9A9CA5`. |
| **Rule** | `weight: 1 \| 2 \| 3 \| 6`, `color` | Horizontal rule. 1 = hairline, 2/3/6 = ink. Used as table heads (3), section heads (6) and panel dividers. |
| **CodePanel** | `tabs=["cURL","JavaScript","Python"]`, `active`, `code`, `lineNumbers`, `copy`, `includeKey?`, `dark header?` | Panel fill, code in mono (landing 14/26, docs 13/22, console 12/20). Line numbers are right-aligned in `--color-placeholder`, 14 left of the code. Syntax: commands and keys ink (commands/numbers/URLs 700), punctuation grey, strings and numbers cobalt. **Tabs**: active 700 ink with a 3px cobalt underline, 11 below the baseline; inactive 400 grey; 26 between tabs. The docs variant has a light header with "Copy" (icon + 13/700). The console variant has a 46h ink header, white/`#9A9CA5` tabs, the "Include my key" switch (32×16 cobalt, 4px knob inset) and "Copy code". |
| **KeyMenu** | `keyMasked`, `issuedDate`, `trialEnd`, `mode` | Dropdown under the key chip: white, 2px ink border, 6px cobalt top bar. "API KEY" (mono micro grey), "TEST" (mono 700 cobalt, right). Key in a 38h panel box (mono 14/700). "Issued Sep 28, 2026 · trial ends Oct 12" is 12 grey [EXAMPLE dates]. Buttons sm: "Copy key" (ink) + "Forget key" (secondary), 8 gap. Footer "Manage keys and billing in your account." 12 grey. Padding 20. Trigger chip: 34h, 2px ink border, 8px green square, mono 13/700 key, up-chevron when open. |
| **Table** | `columns[{label, width}]`, `rows`, `groupHeaders?` | Head: mono micro/label grey labels, then a 3px ink rule. Rows: 1px hairline dividers, 29 from the top of the row to the first baseline, 19 below the last line. The final rule is 3px ink. Cells: field names mono 13/700 ink, types mono 13/400 grey, descriptions 14/400 grey (line-height 21). The docs field table has group bands (34h panel, mono label; "CORE FIELDS" in cobalt, "OPTIONAL" in grey). In the Errors table, a 1px ink divider separates status groups, and status is shown as an outlined tag (1.5px red, mono 11/700, 24h). |
| **Alert / Toast** | `kind: success \| error`, `message` | 48h, white fill, 1px hairline border, an 8px signal bar on the left (green/red), a 16px icon at x 24 (green check / red square with a white "!"), message 16/700 ink at x 56. Inline: full width of its container, 24 above the element it refers to. Toast: the same component, fixed 24px from the bottom-right, auto-dismiss (duration **OPEN**). Use `role="status"` for success and `role="alert"` for errors. The onboarding **TrialBanner** and the B05 **Warning** are ink variants (ink fill, 8px cobalt bar / white triangle icon, white 700 text). |
| **StatBar** (paystub split bar) | `parts[{label, percent, color}]` | A 20h bar split into proportional segments with 3 gaps (Net cobalt / Taxes ink / Deductions grey). Legend 34 below: 10px swatch + "Net 70.6%" 13/700, 28 between items [EXAMPLE percentages]. |
| **Tag** | `text`, `color`, `solid` | Mono 700 uppercase, 10–11px, tracking 0.5–1.4px. Outline 1.5px or solid, 22–26h, 6–10 padding-x. Used for "ASSUMES BIWEEKLY", "TRIAL · DAY 1 OF 14", "ILLUSTRATIVE", "EXAMPLE · AMOUNTS OMITTED", "POST" and HTTP codes. |
| **Logo** | `scheme`, `size` | See §Logo. |

---
## B00 Landing (`/`)
**Purpose:** explains the product and price and gets developers to sign up. Frame 1440×7054 (scrolls).

**Nav** (88h, 1px ink bottom rule, white)
- Logo s = 22 at x 64, vertically centred.
- Links "Product" "Coverage" "Pricing" "Docs" start at col 5, 16/400 ink, 32 apart. Suggested targets: #product, #coverage, #pricing, /docs (**OPEN**).
- Right side, right-aligned: text link "Sign in" 16/400, then 24 gap, Button md secondary "Start building", 8 gap, Button md primary "Get a demo" with an arrow.

**Hero** (to y 704)
- Grid guides: 1px hairline column edges over the full hero height (decorative, `aria-hidden`).
- Eyebrow row 44 below the nav: a 12×12 cobalt square, 24 gap, mono eyebrow "PAYROLL TAX CALCULATION API". Right: mono 12/400 grey "POST /v1/paycheck".
- H1 `--text-display-lg` (112/0.94/700/−5px): "Accurate payroll tax, priced for growing payroll teams." Max-width 10 cols (1089px), which gives 3 lines. x = col 1 − 6px (optical).
- Subcopy `--text-lead` grey, max-width 5 cols (533): "One API call returns every tax line on a paycheck — federal, state, and local. Pay per paycheck, with no contract, no minimums, and no sales call."
- Actions at col 7, aligned with the subcopy's first line: Button lg primary "Get a demo" + arrow → **/signup**; 8 gap; Button lg secondary "Start building" (target **OPEN**); 24 gap; text link "See pricing" (→ #pricing, suggested).
- Below the actions, 36 down: a 2px ink rule over cols 7–12. 28 below that, mono 13: "$0.125" (700 cobalt) + " per paycheck · billed only for calls you make".

**Fig. 1: paycheck split** (full-bleed cobalt band, 492h)
- Header row at 52: mono eyebrow white "FIG. 1" (col 1) and "ONE PAYCHECK, ONE CALL, EVERY TAX LINE" (col 2). Right: solid white tag, cobalt text, "EXAMPLE · AMOUNTS OMITTED".
- Brackets (2px white, 15px end ticks, mono 11 labels, value "—" mono 16/700): "GROSS PAY" over cols 1–12; "EMPLOYEE TAXES" over cols 1–6; "NET PAY" over cols 7–12.
- Six tax tiles, one per column in cols 1–6, 104h, white: index mono 12 cobalt "01"–"06"; value "—" mono 20/700 bottom-right. Under each tile a 1.5px white tick 26 long, then the name 14/700 white (lh 1.25, max-width = column − 12) and a level in mono 10 `#C7CEFF`: "Federal income tax" FEDERAL · "Social Security" FEDERAL · "Medicare" FEDERAL · "State income tax (OH)" STATE · "City tax (Columbus)" CITY · "School district tax" SCHOOL DIST.
- Net tile over cols 7–12, ink, 104h: "07", "Net pay" 40/700 white ls −1.5, "—" 40 mono right. Below it: "What lands in the employee’s account." 14/700 white, then mono 10 "RESULT.NETPAY".
- Footnote: a 1px `#576CFF` rule, then 13/400 `#C7CEFF`: "Schematic, not to scale. Each tax line carries id, name, payer, jurisdiction, taxableWages, amount, and detail. Employer-paid taxes come back in the same response."
- Amounts are deliberately "—". Don't put numbers here.

**Section rhythm:** 120 between sections. Every section starts with a SectionIndex. Statements are `--text-heading-lg` (48/700, ls −2) at col 4.

**01 Price** (SectionIndex "01" · "PRICE" · right "ONE LINE ITEM")
- Statement: "No quote request. No pricing call." then, on the next line in grey, "Here it is." (one `<h2>` with a muted `<span>` set to `display:block`).
- Figure "$0.125" at 380/700 cobalt, ls −18, x = margin − 18 (optical).
- Below: "per paycheck" (24/700 ink) + "  —  one calculation, one charge." (grey), ls −0.5.
- Terms: 3×2 grid, each item span 4, 3px ink top rule. Index mono 11 cobalt "01"… + label 14 grey (36 after the index); value `--text-heading-md` (40/700, ls −1.5). Rows are 132 apart. Items: Contract / None · Minimums / None · Setup fee / None · Per-state or per-jurisdiction tiers / None · Sales call / Not needed · Billed for / Only calls you make.

**02 Coverage** ("02" · "COVERAGE" · "FEDERAL · STATE · LOCAL")
- Statement, max-width 9 cols, lh 1.08: "Federal, state, and local — down to the city, county, school district, and transit district."
- Left: figure "50" (300/700 ink, ls −16) + "+DC" (64/700 cobalt) top-right of the figure. Caption 18/700 ink, lh 1.35, max-width 2 cols (199): "All 50 states and the District of Columbia, plus federal."
- Right, cols 6–12: mono label "LOCAL TAXES" / right "NAMED, NOT COUNTED" (grey), then a 3px ink rule, then a 3×3 grid (row pitch 108, hairline under each row). Each cell: state code mono 12 cobalt, name `--text-title-lg` (28/700, ls −0.8) wrapping to the cell width. Cells: OH Ohio · PA Pennsylvania · MI Michigan · IN Indiana · KY Kentucky · AL Alabama · NY New York City · NY Yonkers · OR "Oregon transit & Metro" (non-breaking space between "&" and "Metro").
- Footnote 16: "Not on this list? " (700) + "You get an explicit error or a “not modelled” line. See 03." (grey).

**03 No guessing** (full-bleed ink band, 760h; SectionIndex dark, 72 from the band top: "03" · "NO GUESSING" · "EXPLICIT, ALWAYS")
- Headline 136/700 white, ls −6, on two lines: "Never a" / "silent $0.". "$0" is cobalt with a 9px cobalt strike bar through it. (This is a deliberate two-line display lockup. Use two block spans.)
- Body 18/400 `#9A9CA5`, lh 1.55, max-width 6 cols: "If a rule or code is missing, the API returns an explicit error or a “not modelled” line. It never fills the gap with a quiet zero, so a missing tax can’t hide inside a clean-looking paycheck."
- Right, cols 8–12, excerpt A: mono label "A · A NOT-MODELLED LINE" + outline tag "ILLUSTRATIVE", 2px white rule, code in mono 16, lh 27: `{ "name": "Local tax", "status": "not_modelled", "detail": "No rule for this jurisdiction" }` (5 lines; strings in `#8C9BFF`).
- Excerpt B: "B · OR AN EXPLICIT ERROR", then `{ error, code, requestId }`, then 13 `#9A9CA5` "Every error has the same shape. See the Errors table in the docs." (link to /docs#errors, suggested).
- "NEVER THIS" (mono `#8C9BFF`) + `"amount": 0` mono 24 `#9A9CA5` with a 5px cobalt strike.

**04 Developers** ("04" · "DEVELOPERS" · "POST /V1/PAYCHECK")
- Statement "Your first paycheck in one request." + lead grey "Send the paycheck as JSON. Get back every tax line in the same response."
- Facts, cols 1–3, rows 80 apart. The first row has a 2px ink top rule, the rest hairline. Key mono 11 grey, value mono 16/700: ENDPOINT "POST /v1/paycheck" · AUTH "Bearer secret key" · BODY "application/json" · AMOUNTS "Integer cents".
- Request panel, cols 4–9: panel fill, 40h ink header "REQUEST" / "cURL" (`#9A9CA5`), CodePanel 14/26, line numbers. Code (sample key `sk_live_...`, [EXAMPLE] body): see the frame. The amount `100000` has a 2px cobalt underline.
- Response panel, cols 10–12: white with a 1px hairline border, 40h cobalt header "RESPONSE" / "200", "FIELD NAMES", then a tree (mono 14, lh 24.5): result › checkDate, grossPay, pretaxDeductions, posttaxDeductions, employeeTaxTotal, employerTaxTotal, netPay, taxes[] › id · name · payer, jurisdiction, taxableWages, amount · detail.
- Cents callout: a 2px cobalt leader from the underlined amount down to a 10px cobalt square, then "Amounts in integer cents." 18/700 cobalt and "100000 = $1,000.00" mono 14.

**05 The fine print** ("05" · "THE FINE PRINT" · "INCLUDED IN THE PRICE")
- Statement "The fine print is short," + grey line "and it’s all in your favor."
- Rows over cols 4–12, 3px ink top rule, hairlines between rows, 3px at the end. Minimum row height 96. Number 40/700 cobalt (col 4), title 28/700 (col 5, max-width 4 cols), body 16 grey lh 1.5 (col 9, max-width 4 cols).
  1. "One call, every tax line": "Federal, state, and local lines come back together in a single response. No stitching calls together."
  2. "Integer cents": "Every amount is a whole number of cents. No floating-point rounding, ever."
  3. "Effective-dated rates": "A check dated before a rate change uses the rate that was in effect on that date."
  4. "Garnishments & minimum wage": "Wage garnishments and minimum-wage checks are included in the same calculation."
  5. "No third-party dependencies": "The calculation runs with no third-party dependencies."

**06 Questions** ("06" · "QUESTIONS")
- Statement "Plain answers."
- Left, cols 1–3: "Everything else is in the docs." 16 grey + text link "Read the docs" → /docs.
- FAQ over cols 4–12: 3px ink top rule; "Q1"… mono 13 cobalt; question 28/700 ls −0.6 at col 5; answer 18 grey lh 1.5, max-width 7 cols; 40 below each answer, then a hairline. (A static list; the design doesn't show an accordion.)
  - "How much does it cost?": "$0.125 per paycheck calculated. No contract, no minimums, no setup fee, and no per-state or per-jurisdiction tiers."
  - "What does it cover?": "Federal, all 50 states and DC, and local taxes down to the city, county, school district, and transit district, including Ohio, Pennsylvania, Michigan, Indiana, Kentucky, Alabama, New York City, Yonkers, and Oregon transit and Metro."
  - "What if a jurisdiction isn’t covered?": "You get an explicit error or a “not modelled” line in the response. Never a silent $0."
  - "Do I need to talk to sales?": "No. Read the docs and start building."

**CTA** (full-bleed cobalt, 440h; 40-tall `#576CFF` column ticks along the top)
- Headline `--text-display-lg` white, lh 0.92, max-width 8 cols: "Run your first paycheck today."
- Right, col 9: a 3px white rule, mono label "PER PAYCHECK", "$0.125" 96/700 white ls −4, "No contract. No minimums. No sales call." 16 `#C7CEFF`, then Button lg white "Get a demo" + arrow (→ /signup) + Button lg outline-white "Start building".

**Footer** (120h, white): Logo s = 20; mono 12 grey "Payroll tax calculation API" at col 4; right-aligned links "Contact" "Coverage" "Pricing" "Docs", 16, 32 apart.

---

## Onboarding shell (B01–B04)
- **Step panel** (left, cobalt, full height, width 597 = cols 1–5 plus the left margin, bleeding to the left edge). Content box x 64–533 (469).
  - Logo on-blue s = 22 at y 36. "ONBOARDING" mono 11/400 `#C7CEFF`, right-aligned.
  - Step numeral "01"–"04" at 250/700 white ls −14 (baseline 300), with "STEP" (mono eyebrow white) and "OF 05" (`#C7CEFF`) 16 to its right, top-aligned.
  - A 3px white rule at y 336. Panel content below it starts at y 384 with a panel head: mono 11 white label, right label, and a 1px `#576CFF` rule 16 below.
  - Panel rows: 16/400 white key, value right-aligned mono 16/700 white, 1px `#576CFF` rule under each, 40 pitch.
- **Form column:** x = col 7 (732), max-width 560.
  - Header row: mono 11/700 "STEP 0n OF 05" at y 53. From step 3 on, the email "you@company.com" [EXAMPLE] is right-aligned 14 grey.
  - ProgressSteps at y 88.
  - Heading `--text-heading-lg` (48/700, ls −2.2) with baseline at y 248. Subhead `--text-lead` grey (lh 28), 40 below the heading baseline, max-width 560.
  - The form starts 48 below the subhead. Field pitch 96 (label 16 + 8 + 48 + 24).
  - The primary button is full width (560), 32 below the last field or hint.
- Frames are 900 tall. In code the panel is `min-height: 100vh`, and the form column scrolls if needed.

## B01 Create account (`/signup`)
**Purpose:** create the account (email + password).
- Heading "Create your account." · Subhead "Five short steps to your API key. The first 14 days are free."
- Input "Work email", placeholder/sample "you@company.com" [EXAMPLE], `type=email`.
- Input "Password" (`type=password`) with right slot "Show" (toggles visibility). The frame shows the focus state with 14 dots.
- PasswordRule "12+ characters", 8 below. Met in the frame; unmet (grey) until the password has 12+ characters.
- Button lg primary full-width "Create account" + arrow → **/signup/verify** (sends the verification code). Disabled until the email and password are valid (state per B08). Loading while the request runs.
- "Already have an account?" 16 grey + 8 + text link "Sign in" (→ sign-in route, **OPEN**). 32 above it.
- A hairline 24 below that, then 24 later the fine print 13 grey: "By continuing you agree to the Terms and Privacy Policy." "Terms" and "Privacy Policy" are links with a 1px grey underline.
- Step panel "WHAT YOU GET" / "PRICE SHEET": "$0.125" 112/700 white ls −5; "per paycheck" 20/700; rows Contract None · Minimums None · Setup fee None · Free trial "First 14 days"; a 3px white rule; "DUE TODAY" mono label; "Nothing is charged during the trial." 14 `#C7CEFF`; "$0.00" 64/700 white, right-aligned [REAL].
- Errors: invalid email → Input error state. Use the existing endpoint's error messages (the B08 message "Enter a valid work email." is a placeholder).

## B02 Verify email (`/signup/verify`)
**Purpose:** confirm the email with a 6-digit code.
- Heading "Check your email."
- Two lead paragraphs (grey, no gap between them): "We sent a 6-digit code to " + **"you@company.com"** (ink 700, the real address); "Enter it below to confirm this address."
- The label "Verification code" (13/700) is 48 below the paragraphs, then CodeBoxes. The frame shows the typing state: "4" "8" "1" entered, box 4 active.
- Button lg primary full-width "Verify" + arrow, 32 below the boxes → **/signup/business** on success. On failure: CodeBoxes error state with "That code didn’t match. 2 tries left." (the count comes from the API) + "Resend code".
- 32 below: "Resend code" 16/700 in placeholder grey (disabled while the countdown runs) + "in" + an ink chip 48×24 with mono 13/700 white countdown "0:42" [EXAMPLE]. When the countdown ends, "Resend code" becomes an ink text link.
- 40 below: "Wrong email?" + text link "Change it" (→ back to /signup with the email prefilled).
- Step panel: a white "email preview" sheet (x 64–533, 464h, 32 padding) labelled "SAMPLE MESSAGE" [EXAMPLE]. It illustrates the email the user receives. Rows: FROM "Omnia.tax", TO "you@company.com", SUBJECT "Your verification code" (700). Body: "Use this code to verify your email:"; a code block (panel, 8px cobalt left bar, mono 48/700, ls 10) "481 902" [EXAMPLE]; footnote 13 grey "The code expires in 10 minutes. If you didn’t ask for it, you can ignore this email." The 10-minute expiry is copy from the design. Confirm that the backend matches (**OPEN**).

## B03 Your business (`/signup/business`)
**Purpose:** capture the business name and head-count, and show the live cost estimate.
- Heading "About your business." · Subhead "Two questions, so we can estimate your monthly cost. You’re only billed for calls you make."
- Input "Business name" (sample "Acme Manufacturing Co." [EXAMPLE]).
- "Employees you pay" (13/700) + Stepper (sample 20 [EXAMPLE], min 1) + hint "Everyone who gets a paycheck from you." (14 grey, 16 right of the stepper).
- Button lg primary full-width "Continue to payment" + arrow, 48 below the stepper → **/signup/payment**.
- **Live estimate panel** (step panel), updates on every stepper change:
  - Panel head "LIVE ESTIMATE" + solid white tag with cobalt text "ASSUMES BIWEEKLY".
  - "Estimated monthly cost" 18/700 white.
  - "≈" 64/400 + value 96/700 white ls −5 + "/month" 24/700 `#C7CEFF`.
  - 1px `#576CFF` rule, then the derivation mono 18/700 white "{n} × 26 × $0.125 ÷ 12" + mono 10 `#C7CEFF` "EMPLOYEES × PAYCHECKS A YEAR × PRICE ÷ MONTHS".
  - **Formula:** `estimate = employees × 26 × $0.125 ÷ 12`, rounded to cents. Integer-safe: `cents = Math.round(employees * 325 / 12)`. Example: 20 → $5.42.
  - Assumption note: white box, 8px ink left bar, 24×24 cobalt "i" square, text 18/700 ink, lh 24, max-width 320 (gives one clause per line): "We don’t know how often you pay. This estimate assumes biweekly pay (26 paychecks a year)."
  - Secondary note 14 `#C7CEFF`, lh 1.5, max-width 469: "It counts one calculation per paycheck. Bonus runs and recalculations add calls. Failed calls aren’t billed."

## B04 Payment (`/signup/payment`)
**Purpose:** collect a payment method (required even during the trial) and start the trial.
- Heading "Add a payment method."
- TrialBanner (ink, 48h, 8px cobalt left bar, 24 padding): "You won’t be charged for the first 14 days." 18/700 white.
- **Stripe Payment Element** (card + PayPal), 24 below the banner, full form width (560). Stripe renders it. We only provide the container and the Appearance variables (below). The frame shows what it should look like: tabs Card (selected: ink fill, white, card icon) | PayPal (white, hairline border, grey), 48h each, then card number / expiry + CVC / country + ZIP. Labels are 13 grey; fields are 48h white with a 1px hairline and radius 0; field pitch 80 with 16 between the two columns. Placeholders "1234 1234 1234 1234", "MM / YY", "CVC", "United States", "12345" are Stripe's own. v2 removed the separate "OR / Continue with PayPal" button because the Element's PayPal tab already covers it.
- Secure note, 32 below the Element: lock icon + "Payments are processed securely by Stripe. We never see your full card number." 13 grey.
- Summary panel: head "SUMMARY" / "TRIAL · 14 DAYS"; rows Plan "Pay per paycheck" · Rate "$0.125"; "Estimated" "≈ $5.42/mo" (from B03's formula and count) with "for 20 employees (biweekly)" 13 `#C7CEFF` under it [EXAMPLE count]; a 3px white rule; "Due today" 24/700 white + "$0.00" 64/700 right [REAL]; "First charge after your 14-day trial" 13 `#C7CEFF`; date mono 11/700 white "OCT 12, 2026" = **signup date + 14 days** [EXAMPLE date], formatted `MMM D, YYYY` uppercase.
- Button lg **white** full panel width (469) "Start 14-day trial" + arrow, at y 704 in the panel. It confirms the Payment Element (`stripe.confirmSetup` or whatever the existing backend flow uses) and on success → **/signup/key**. Loading state while confirming. Card errors appear inside the Element (e.g. "Your card number is incomplete.", Stripe's copy), as in B08.

### Suggested Stripe Appearance (mapped to tokens)
```js
const appearance = {
  theme: 'flat',
  variables: {
    colorPrimary: '#1F3BFF',        // --color-cobalt
    colorBackground: '#FFFFFF',     // --color-white
    colorText: '#0A0A0A',           // --color-ink
    colorTextSecondary: '#6E7079',  // --color-gray
    colorTextPlaceholder: '#A3A5AD',// --color-placeholder
    colorDanger: '#F04438',         // --color-error
    colorSuccess: '#12B76A',        // --color-success
    fontFamily: '"Inter Tight", system-ui, sans-serif',
    fontSizeBase: '16px',           // --text-body
    fontWeightNormal: '400',
    fontWeightBold: '700',
    borderRadius: '0px',            // --radius
    spacingUnit: '4px',             // --space-0-5
    gridRowSpacing: '8px',          // 72 field + 8 = 80 pitch
    gridColumnSpacing: '16px',
    tabSpacing: '0px',
    focusBoxShadow: 'none',
    focusOutline: '2px solid #1F3BFF',
  },
  rules: {
    '.Label':        { fontSize: '13px', fontWeight: '400', color: '#6E7079', marginBottom: '8px' },
    '.Input':        { border: '1px solid #E1E3E8', padding: '11px 16px', lineHeight: '24px', boxShadow: 'none' }, // 48px tall
    '.Input:focus':  { border: '1px solid #1F3BFF', boxShadow: '0 0 0 1px #1F3BFF' },                         // 2px cobalt
    '.Input--invalid': { border: '1px solid #F04438', boxShadow: '0 0 0 1px #F04438', color: '#0A0A0A' },      // 2px red
    '.Error':        { fontSize: '13px', color: '#F04438', marginTop: '8px' },
    '.Tab':          { border: '1px solid #E1E3E8', backgroundColor: '#FFFFFF', color: '#6E7079', boxShadow: 'none' },
    '.Tab--selected':{ backgroundColor: '#0A0A0A', borderColor: '#0A0A0A', color: '#FFFFFF' },
    '.TabIcon--selected': { fill: '#FFFFFF' },
  },
};
const fonts = [{ cssSrc: 'https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;700&display=swap' }];
```
The padding and gridRowSpacing values are derived from the 48px field and 80px pitch in the design. Stripe's own chrome may add a few pixels, so check them against the frame.

---
## B05 API key issued (`/signup/key`)
**Purpose:** show the new test key **once** and hand off to the docs.
- Layout: the docs page (B06) rendered behind, dimmed (the design mixes every colour 62% toward ink; in code use an ink overlay of about 60–62% opacity). The modal sits centred on top: 680×608, white, 48 padding.
- Header band: 88h cobalt. A 24×24 white square with a cobalt check, then mono eyebrow white "KEY CREATED". Right: mono 11/400 `#C7CEFF` "STEP 05 OF 05".
- Title `--text-heading-lg` (48, ls −1.8): "Your API key is ready." Body 16 grey: "Use it to call the API from your server. It’s a test key, so build freely."
- Label mono 11/400 grey "SECRET KEY · TEST MODE". Key field: 56h panel with a 2px ink bottom rule; key mono 18/700 "sk_test_••••••••••••••••4f2a" [EXAMPLE], masked by default; text button "Reveal" 13/700, right. Joined to it on the right is a Copy button: 120×56 ink, copy icon + "Copy" 16/700 white. Copy puts the **full** key on the clipboard and shows the success Alert/Toast ("Key copied to clipboard." is placeholder copy).
- Warning (ink, 24 below the key, 32 padding, white triangle "!" icon): "This is the only time we’ll show the full key. Store it somewhere safe." 16/700 white, lh 24, max-width 360 (breaks after the first sentence).
- 24 below: trial badge (2px ink outline, 30h, 8px cobalt square) mono 13/700 "Trial · Day 1 of 14 · no charges until Oct 12". The day count and date are computed from the signup date ([EXAMPLE] date).
- Then a hairline (24 below the badge), and 24 below that the footer row: "Manage keys any time in your account." 14 grey (left); Button lg primary "Go to the docs" + arrow (right) → **/docs**.
- **The key is shown once.** It's only available in this response/state. After the user leaves the modal, the UI shows the masked form only (`sk_test_…4f2a`, as in the B06 nav card and the B07 key chip), and a new key has to be created to see a full one. Don't persist the full key in client storage.
- Focus trap in the modal. Escape/backdrop: **OPEN** (suggest no dismiss without "Go to the docs", because the key is only shown once).

## B06 API docs (`/docs`)
**Purpose:** getting started, auth, the POST /v1/paycheck reference, errors and response headers. Frame 1440×4452.
- **Top bar** (64h + 2px ink bottom rule):
  - Logo s = 20 at x 32, then mono 11 grey "DOCS" 16 after it.
  - Search at x 304: 400×36 panel with a 2px ink bottom, search icon, placeholder "Search the docs" 14 placeholder grey, and a "/" key hint (18×20 grey outline, mono 12/700).
  - Right: "Test mode" 14/700 + switch (on, cobalt, 32×16); outline tag "TRIAL · DAY 1 OF 14" [computed]; account avatar (30×30 ink, "A" 14/700 white) + "Acme Manufacturing" [EXAMPLE] 14 + chevron.
- **Left nav** (264 wide, 1px hairline right border). Group labels mono 11/400 grey, 34 below; items 16 ink, pitch 38; active item = 36h cobalt bar (inset 16), white 700; 22 extra between groups.
  - Groups: GUIDES: "Getting started", "Authentication". API REFERENCE: "POST /v1/paycheck" (solid cobalt "POST" tag + mono 14/700 path), "Tax lines", "Errors", "Response headers". ACCOUNT: "Billing", "Sandbox".
  - Nav key card at y 720: 3px ink rule, "YOUR TEST KEY" mono 11 grey, "sk_test_…4f2a" mono 14/700, "No charges until Oct 12" 13 grey [computed date].
- **Main column**: x 304, max-width 600. Sections are separated by 72 (96 before Errors and Response headers). Section head = 6px ink rule + mono 11 grey label + h2 `--text-heading-lg` (ls −1.8).
  - **Getting started**: breadcrumb mono "GUIDES / GETTING STARTED"; h1 64/700 ls −3 "Getting started"; lead 18 grey lh 1.5: "Calculate every tax line on a paycheck with one request. You’re in test mode, and the first 14 days are free." Then a 3px rule and 3 steps (number 48/700 cobalt at x+0; title 24/700 at x+80; body 16 grey lh 24, max-width 520; hairline after each):
    1. "Get your key": "Your test key starts with sk_test_ and was shown once at sign-up. You can create a new one from your account at any time."
    2. "Make your first call": "POST a paycheck to /v1/paycheck. The example on the right works as-is with your test key."
    3. "Read the tax lines": "Each entry in result.taxes[] names the tax, who pays it, its jurisdiction, the taxable wages and the amount, with a detail explaining the math."
  - **Authentication**: "Send your secret key as a Bearer token in the Authorization header of every request. Keep keys on your server, never in a browser or mobile app." Code line (48h panel, 6px cobalt bar) "Authorization: Bearer sk_test_...". Rows (48 each, hairline): `sk_test_` "Test key. Same API, same results. For building and your trial." · `sk_live_` "Live key. Metered and billed at $0.125 per paycheck."
  - **POST /v1/paycheck**: label "API REFERENCE"; solid cobalt "POST" tag 64×32 + mono 28/700 "/v1/paycheck"; "Calculate one paycheck and get back every tax line that applies." Ink banner 52h: "All money in integer cents." (white 700) + "   100000 = $1,000.00" (mono `#9A9CA5`). Field table: FIELD (x+0) / TYPE (x+182) / DESCRIPTION (x+262). Group bands CORE FIELDS / OPTIONAL. Rows, verbatim from the generator:
    - CORE: checkDate · string · "Pay date, YYYY-MM-DD. Selects the rules in effect on that date." | payFrequency · enum · `weekly, biweekly, semimonthly, monthly, quarterly, semiannual, annual, daily` · "How often this employee is paid." | earnings[] · array · `{ code, category, amount }` · "One entry per earning on the check." | deductions[] · array · `{ code, category, amount }` · "Pre-tax and post-tax deductions." | federalW4 · object · `{ filingStatus, multipleJobs, dependentCredit, otherIncome, deductions, extraWithholding }` · "The employee’s federal Form W-4." | ytd · object · `{ socialSecurity, medicare, futa }` · "Year-to-date wages before this check." | workState · object · `{ code, certificate }` · "Where the work happens, plus that state’s certificate (e.g. workCity). Omit for federal only."
    - OPTIONAL: residenceState · object · `{ code, certificate }` · "Where the employee lives, when it differs from workState." | employer · object · "Employer facts some rules need, such as a state unemployment rate." | employmentCategory · enum · "Which employment-tax rules apply. Defaults to standard." | hoursWorked · number · "Hours in this pay period, for minimum-wage checks." | roundToWholeDollars · boolean · "Round federal withholding to whole dollars. Defaults to false."
    - Success shape (right column): `{ result: { checkDate, grossPay, pretaxDeductions, posttaxDeductions, employeeTaxTotal, employerTaxTotal, netPay, taxes: [ { id, name, payer, jurisdiction, taxableWages, amount, detail } ] } }`.
  - **Errors** (id `#errors`): intro "Every error returns the same three fields with a matching HTTP status. A missing rule is never returned as a silent zero." Field rows (40h panel, 4 gap; name mono 14/700 at x+16, description 14 at x+136): `error` "A human-readable message." · `code` "A stable, machine-readable code from the table below." · `requestId` "Identifies the request. Include it when you contact us." · `details` "invalid_input only: an array of field-level errors."
    Table HTTP (x+0, red outline tag) / CODE (x+64, mono 13/700) / WHEN (x+296, 14 grey, max-width 288). A 1px ink divider separates status groups:
    | HTTP | code | WHEN (copy) |
    |---|---|---|
    | 400 | invalid_json | "The request body isn’t valid JSON." |
    | 401 | missing_key | "No API key was sent in the Authorization header." |
    | 401 | invalid_key | "The key in the Authorization header isn’t recognized." |
    | 401 | expired_key | "The key has expired. Create a new one from your account." |
    | 402 | payment_method_required | "A card must be on file, even during the 14-day trial." |
    | 402 | account_suspended | "The account is suspended, so calls are refused." |
    | 422 | invalid_input | "One or more fields are missing or invalid. details lists each field-level error." |
    | 422 | calculation_error | "The input was valid, but the paycheck couldn’t be calculated." |
    | 429 | rate_limited | "Too many requests from this key in the current minute. Limits are per key, per minute. Retry after the time in the Retry-After header." |
    The codes, statuses, the `details` array on invalid_input, the Retry-After header on 429 and "card required even during the trial" are [REAL] (from the brief). The WHEN wording for invalid_json, invalid_key, account_suspended, invalid_input and calculation_error is new v2 copy, so confirm it (README).
  - **Response headers** (id `#response-headers`): intro "Every response carries a request ID. Rate limits are per key, per minute." Table HEADER (x+0, mono 13/700) / SENT ON (x+200, 13 ink, max-width 152) / MEANING (x+368, 14 grey):
    | Header | Sent on | Meaning (copy) |
    |---|---|---|
    | X-Request-Id | "Every response" | "Identifies the request. Include it when you contact us." |
    | Omnia-Mode | "Once the key is checked (not on 401s)" | "test or live: the mode of the key that made the call." |
    | RateLimit-Limit | "Successful calls" | "Requests this key may make per minute." |
    | RateLimit-Remaining | "Successful calls" | "Requests left in the current minute." |
    | RateLimit-Reset | "Successful calls" | "When the current minute’s limit resets." |
    | Retry-After | "429 rate_limited" | "When you can retry." |
    Units for RateLimit-Reset / Retry-After aren't specified (**OPEN**).
  - "NEXT" mono label + text link 18 "Tax lines".
- **Right code column** (x 944 to the edge, panel fill, 3px ink left rule, 32 padding; should be sticky in code):
  - "EXAMPLE REQUEST" / "POST /v1/paycheck"; tabs cURL | JavaScript | Python + "Copy"; hairline; code 13/22 with line numbers. The request uses `https://api.<your-domain>/v1/paycheck` [EXAMPLE domain], `sk_test_...`, and body 2026-08-15 / biweekly / REG regular 100000 / single / OH + Columbus [EXAMPLE].
  - Button lg primary "Try it in the sandbox" + arrow → **/sandbox**, with this request prefilled. Below it, 16 later: "Opens the console with this request filled in." 13 grey.
  - "RESPONSE SHAPE" + outline tag "FIELD NAMES ONLY" + the shape (15 lines).
  - "ERROR SHAPE" + "FIELD NAMES ONLY": `{ error, code, requestId }` / `// 422 invalid_input also sends:` / `details: [ … ]`.
- JavaScript/Python tab contents aren't designed. Generate the equivalents of the cURL request (**OPEN**).

## B07 Sandbox console (`/sandbox`)
**Purpose:** build and send a test request and read the result as a paystub.
- **Top bar** (64h + 2px ink rule): Logo s = 20 at x 24; mono 11 grey "API CONSOLE" (16 after the logo); solid cobalt tag "TEST MODE". Right: links "API reference" (→ /docs#post) and "Pricing" 14, 28 apart; key chip "sk_test_…4f2a" (opens the KeyMenu, shown open in the frame); Button sm ink "Your account".
- **Rail** (248 wide, panel fill):
  - ENDPOINTS: "POST Calculate paycheck" (active, cobalt bar), "GET List states", "GET Your key". Only POST /v1/paycheck is confirmed to exist. The GET rows are **OPEN** and should be wired only if those endpoints already exist.
  - EXAMPLES: "Ohio + Columbus" (selected: white with a 1.5px ink border), "Pennsylvania PSD", "Missing PSD code" with a cobalt "→ not modelled" note, "Bonus on its own check". Each example preloads the form.
  - RECENT: green square "200" "Ohio + Columbus" / "POST · just now" (session history).
- **Request pane** x 280–784 (504), with a 1px hairline divider at x 816:
  - Request line 48h: cobalt "POST" 56 wide, URL mono 13 "api.<your-domain>" (grey) + "/v1/paycheck" (ink 700), and Button lg primary "Send" + arrow (104 wide). Send → performs the request and fills the response pane.
  - Editor tabs "Form" | "JSON" + text action "Reset" 13/700.
  - **Form fields, in order** (console density: label 13/700, 4 gap, 40h white fields with a 1px hairline, 16 padding, values 14 mono for numbers and dates, "$" prefix in grey mono for money, row pitch 72, 2 columns with 16 between):
    - Legend "PAY PERIOD": 1 Work state (select) "Ohio (OH)" · 2 Check date "2026-09-15" · 3 Pay frequency (select) "Biweekly" · 4 Gross pay $ "3,000.00" · 5 Pay type (select) "Regular wages" · 6 Hours worked "(optional)" "80"
    - Legend "FEDERAL W-4": 7 Filing status (select) "Single" · 8 checkbox "Multiple jobs (Step 2)" · 9 Dependents (Step 3) $ "0.00" · 10 Extra withholding (4c) $ "0.00"
    - Legend "PRE-TAX DEDUCTIONS" (3 columns): 11 401(k) $ "240.00" · 12 Health (Sec. 125) $ "0.00" · 13 HSA $ "0.00"
    - Collapsed row (40h panel, chevron): "5 more fields below: Residence state, YTD Social Security wages, …". Only 2 of the 5 are named (**OPEN**).
    - All values are [EXAMPLE] (the "Ohio + Columbus" preset). Money is entered in dollars and sent as integer cents.
  - The form scrolls inside a region that has a 4px scrollbar (hairline track, ink thumb).
  - Code panel (console CodePanel), 32 below: tabs cURL / JavaScript / Python, switch "Include my key" (on = the real key goes into the snippet, masked on screen as `sk_test_••••4f2a`), "Copy code". It mirrors the form live.
- **Response pane** x 848–1408:
  - Status chip (green 84×28, "200 OK" mono white) + "POST /v1/paycheck".
  - **Response tabs: "Paystub" | "Body" | "Headers"** + "Copy response". Body = the raw JSON `{ result: {...} }`. Headers = the response headers (X-Request-Id, Omnia-Mode, RateLimit-*).
  - Paystub sheet (1px hairline, 28 padding): a 64h cobalt band "EXAMPLE DATA" (mono 24/700 white, ls 3) + "Illustrative values, not a real calculation." 13/700 cobalt. This band shows while the pane holds the example; after a real Send it's removed and real values are shown. Meta: CHECK DATE / PAY FREQUENCY / WORK LOCATION. GROSS PAY "$3,000.00"; NET PAY "$2,117.57" 48/700 cobalt; StatBar (Net 70.6% / Taxes 21.4% / Deductions 8.0%). TAXES table (name 16, level tag mono 10 grey, "why" toggle, amount mono 14/700): Federal income tax FEDERAL 267.58 · Social Security FEDERAL 186.00 · Medicare FEDERAL 43.50 · Ohio state tax STATE 70.35 · Columbus city tax CITY 75.00 (expanded). The "why" expansion (panel, 4px cobalt bar) shows the line's `detail`: "Columbus taxes wages earned in the city at a flat rate." / "taxableWages 300000 × 2.5% = 7500 ¢" / "Explanation text comes from the line’s detail field." Then "Employee taxes" 642.43; DEDUCTIONS 401(k) PRE-TAX 240.00; a 6px rule; "Net pay" 32/700 + "$2,117.57" mono 24 cobalt; footnote "EXAMPLE DATA · shown in dollars; the API returns integer cents." **All amounts are [EXAMPLE].**
  - Error state: see B08 §06 (red status chip, Body tab, details list).
- KeyMenu (open in the frame): see Components. "Copy key" copies the masked-in-UI key only if the full key is still available. Otherwise it's **OPEN** (since the key is shown once, suggest removing "Copy key" or making it copy the prefix only). "Forget key" removes the key from this console session.

## B08 States (reference board, no route)
**Purpose:** the canonical states for every interactive component. Build these as Storybook stories or an internal `/_states` page. Frame 1440×2067, same header as the landing (logo s = 22, mono "B08 · COMPONENT STATES").
1. **Text input**: default (placeholder), focus (2px cobalt border + caret), filled, error (2px red border + "Enter a valid work email." [placeholder copy]), disabled.
2. **Buttons**: primary / secondary / text × default, hover, pressed, loading (arc spinner), disabled. Note under the grid: "Hover: primary turns black; secondary fills panel; text underline thickens to 4px. Pressed: primary black with a 2px cobalt inset; secondary inverts to black. Loading: label stays, a spinner replaces the arrow, the button is not clickable."
3. **Verify code**: empty, typing (481 + active box 4), error (481903, all red) + "That code didn’t match. 2 tries left." + "Resend code".
4. **Password rule** unmet/met · **Stepper at minimum 1** (− disabled; hint "− is disabled at 1.") · **Card field error** (Stripe Payment Element, value "4242 4242 4242" [EXAMPLE], "Your card number is incomplete.").
5. **Alert / toast**: success "Key copied to clipboard.", error "We couldn’t send the code. Try again in a minute." (both placeholder copy). Placement note: "Inline: full width of its container, 24px above the element it refers to. Toast: same component, fixed 24px from the bottom-right, auto-dismiss."
6. **Sandbox response, error state**, marked **ILLUSTRATIVE**: red chip "422", "POST /v1/paycheck", red solid tag "ILLUSTRATIVE"; tabs with **Body** active; JSON with a 4px red left bar showing `error`, `code: "invalid_input"`, `requestId`, and `details` with two items; "DETAILS · 2 FIELDS" list (8px red square, mono field, message); note "Headers on this response: X-Request-Id, Omnia-Mode: test. No RateLimit-* headers (not a successful call)." The detail item keys (`field`, `message`) and all messages are placeholders until the API contract confirms them.

---

## Wiring summary
| From | Control | To |
|---|---|---|
| B00 / (hero, nav, CTA) | "Get a demo" | /signup (B01) |
| B01 /signup | "Create account" | /signup/verify (B02) |
| B02 /signup/verify | "Verify" | /signup/business (B03) |
| B03 /signup/business | "Continue to payment" | /signup/payment (B04) |
| B04 /signup/payment | "Start 14-day trial" | /signup/key (B05) |
| B05 /signup/key | "Go to the docs" | /docs (B06) |
| B06 /docs | "Try it in the sandbox" | /sandbox (B07), request prefilled |
Every other link target in the frames is **OPEN** (see README) unless it's marked "suggested".
