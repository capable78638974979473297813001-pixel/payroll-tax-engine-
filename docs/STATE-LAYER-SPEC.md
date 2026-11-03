# State filing layer: build specification (for another AI session)

You are building the **state** counterpart of `payroll/federal/`. Read this whole file, then
`docs/FEDERAL-FILING.md`, then the files it names, before writing anything. The federal layer
is the template: same architecture, same honesty rules, same standard of verification. A state
layer that is less rigorous than the federal layer is not acceptable.

> **Status (2026-11-03):** the pilot in section 6 is built: three states (CA, NY, TX), the profile format, the
> state ledger, calendar, deposit analyzer, quarterly UI report, new-hire deadline, channel registry, property
> tests and the coverage report. Read `docs/STATE-FILING.md` first: it records what was verified, what was not,
> and exactly how to add a state. The remaining 50 jurisdictions are data files to write from each agency's own
> documents (`docs/STATE-COVERAGE.md` lists them). The data layout in section 4 was adapted: facts live in
> `data/filing/states/<ST>.json`, logic in `payroll/state/`.

## 0. The goal, in one paragraph

For every US state, DC and the territories where it applies, compute exactly what an employer
owes and files at the state level (income-tax withholding returns and deposits, unemployment
insurance wage reports and contributions, paid-leave / disability contributions, new-hire
reports), on the dates the state requires, from approved pay runs, with every figure traceable to
the state agency's own document. Track each filing through the same lifecycle as federal. Never
claim a filing was transmitted, accepted or paid unless a real transport says so.

## 1. Non-negotiable rules

1. **Primary sources only, read in full.** A state's own forms, instructions, statutes, rate
   notices and worked examples. Not a payroll vendor's blog, not a compliance-guide summary, not
   your memory. If you cannot read the primary document, the fact is `NOT MODELLED` with the URL
   and the reason (HTTP status, "registered users only", ...). Third-party sources may be used to
   *find* the primary document, never as the citation.
2. **Never get around a block.** If a site returns 403/429 or demands a login, record it and move
   on. No spoofing, no scraping through bot protection, no guessing a URL pattern.
3. **Fail closed.** A state, form, frequency or rule you have not verified returns an explicit
   `NOT MODELLED` finding (severity `error`), never `$0` and never a default. See how `src/` does it.
4. **Never claim a connection that does not exist.** The honesty boundary in
   `payroll/federal/agency.ts` applies verbatim: a sandbox transport transmits nothing and says
   so; a live transport that cannot work refuses and lists what is missing; `connected: true` only
   when delivery is real.
5. **Money is integer cents.** Round only at explicit boundaries, with integer arithmetic where a
   rate is multiplied (`timesRate` in `form941.ts` is the pattern). Never floats for tax math.
6. **Every number has a citation.** Data files carry `{ url, title, revision/date, verifiedOn,
   verifiedBy }` per fact, like `data/states/*.json` and `data/local/*.json` do.
7. **No secrets, no PII in the repo.** No SSNs, bank accounts, credentials or real employer data in
   code, fixtures or tests. Synthetic data only.
8. **Engine constraints.** TypeScript runs on Node 22 type-stripping, no install step, no runtime
   dependencies: no `enum`, no `namespace`, no constructor parameter properties, `import type` for
   types. Money from `src/money.ts`.
9. **Do not change tax rates or rules in `src/` or `data/states|local|federal` unless a verified
   primary source proves them wrong** and the change is its own, clearly described commit. After
   changing `src/`, run `npm run edge:build`.
10. **Never push to `main`; never open a PR you were not asked for; follow the repo's branch and
    commit rules.** Commit messages end with the attribution lines the session gives you.

## 2. What exists, so you reuse it and do not rebuild it

- `payroll/federal/ledger.ts`: pay runs to liability **by the date wages were paid**.
- `payroll/federal/calendar.ts`: DC holidays, business days. State deadlines use **the state's**
  holiday rules; do not assume DC's. Build a per-state holiday/business-day rule from the state's
  own statute, with the federal calendar as a reference.
- `payroll/federal/deposits.ts`, `form941.ts`, `form940.ts`, `w3.ts`, `agency.ts`: the patterns to
  mirror (inputs a pay run cannot know are explicit and optional; `findings` with
  `error|warning|info`; `fields` keyed by the form's own line labels; `readyToSign`; `statistics`;
  `render*()`; `FilingBook` lifecycle with checksum integrity and audit trail; `FilingTransport` with
  `connected`).
- `data/sources/us-registry.json`: all 51 jurisdictions with their withholding source and status.
- `data/states/*`, `data/local/*`: the rates and rules the paycheck engine uses.
- `watcher/`: every URL cited in `data/` is monitored. New data files with citations are picked up
  by `python watcher/build_sources.py`; run it, and run `python -m unittest watcher/test_*.py`.
- Tests: `node --test tests/<file>`, and `npm test` for everything (must stay green; add yours to the
  `test` script in `package.json`).

## 3. The scope, with the numbers established from primary sources

| Function | Count | Source of the count |
| --- | --- | --- |
| State UI tax agencies | **53** (50 states, DC, PR, VI) | DOL ETA directory, https://oui.doleta.gov/unemploy/agencies.asp (counted). Payroll Organization Rev. 2/9/26 lists 52 (no VI) |
| State income-tax withholding | **42** (41 states + DC); none in AK FL NH NV SD TN TX WA WY | `data/sources/us-registry.json` |
| Paid family/medical leave and state disability | roughly 14 programs (CA, CO, CT, DE, MD, MA, ME, MN, NJ, NY, OR, RI, WA, DC; plus HI/CA/NJ/NY/RI temporary disability) | **secondary sources only; establish the exact list yourself from each state's agency** |
| New-hire reporting | one State Directory of New Hires per state (federal law, 42 U.S.C. 653a) | count not established; HHS blocked automated access. Establish from each state |
| Local (cities, counties, school districts, special districts) | 5,055 taxing jurisdictions in 16 states (Tax Foundation 2023) | **taxing jurisdictions, not filing agencies; many are collected jointly. Phase 2, separate spec** |

Do not state a total you did not count. Where a count is uncertain, say so in the output.

## 4. Architecture to build

```
data/filing/states/<ST>.json        facts + citations for one jurisdiction (agencies, forms, frequencies,
                                    thresholds, due-date rules, e-file/e-pay mandates, portals, enrollment)
payroll/state/
  profile.ts        typed loader/validator for the data files; the registry of agencies x functions
  calendar.ts       per-state business days and due-date rules (read from the data file)
  withholding.ts    returns + deposits for income-tax withholding (frequency rules, due dates, forms)
  unemployment.ts   quarterly wage/contribution reports, taxable wage base, rate notices, due dates
  paidleave.ts      PFML / SDI contribution reporting
  newhire.ts        new-hire reporting deadlines and destinations
  agency.ts         channels per state (reuse federal FilingBook / FilingTransport; channel ids
                    like `state:CA:ui_wage_report`), enrollment prerequisites, spec availability
  index.ts          exported as `state` namespace from payroll/index.ts
tests/state-*.test.ts               per module + `state-properties.test.ts` (seeded, with coverage floor)
docs/STATE-FILING.md                what is built, how verified, what is not connected (mirror FEDERAL-FILING.md)
docs/STATE-COVERAGE.md              generated table: jurisdiction x function -> modelled | NOT MODELLED + reason
```

Facts live in **data**, logic in **code**: adding a state is a data file plus tests, not new code,
unless the state has a genuinely new rule shape (then add the shape generically and say so).

### Per-function content (each jurisdiction, each function that applies)

- **Withholding:** account/ID format; filing frequency and the rule that assigns it (liability
  thresholds, lookback, new-employer default); return form(s) and **every line** where the state
  publishes them; deposit due dates by frequency; accelerated/next-day rules; annual reconciliation
  and W-2 filing (state copy, e-file thresholds and mandates); e-file / e-pay mandate thresholds;
  penalties and interest if published; state-specific adjustments (e.g. credits, local add-ons).
- **UI:** the quarterly wage-and-contribution report (every field), taxable wage base for the year,
  new-employer rate, the experience-rate notice as an input, contribution due date, late rules,
  reporting formats and channels (file layouts are agency documents: read them in full or mark the
  layout `NOT MODELLED`; do not reconstruct from memory), multi-state / localization rules.
- **PFML / SDI:** rates, wage base, employee vs employer split, reporting cadence and channel.
- **New hire:** deadline from hire/first-pay, destination agency, permitted channels, multi-state
  employer registration.
- **Every function:** `enrollment` (what an operator must do before a live connection: registration,
  PINs, power of attorney / reporting-agent authorization, provider certification), `specs`
  (availability: `public | registered_developers_only | blocks_automated_access | not_published`,
  decided by actually trying to retrieve it), and the agency's own mandate text.

### Output contract (mirror federal)

Each builder returns a typed object with: the **line values keyed by the agency's own labels**
(`fields`), `findings` (`error | warning | info`, stable `code`s), `readyToSign`, `due` dates already
moved off non-business days, `statistics` needed for reconciliation, and a `render*()` text view.
State amounts must reconcile with federal outputs (W-2 box 16/17 totals vs state returns; state
wages vs federal where the rule says they agree) and the reconciliation is a function with tests.

## 5. Verification standard

For every rule you implement, in this order of preference:

1. **The agency's own worked example** reproduced as a test, with the example cited in the test.
2. A figure the agency publishes (a rate, threshold, due date) asserted exactly.
3. An **invariant** the form implies (totals tie, a line equals the sum of others, a due date is a
   business day) asserted for any input.

Then add `tests/state-properties.test.ts`, seeded and reproducible, over randomized payroll years
across schedule types and sizes, with a **coverage-floor test** that fails if the generator stops
reaching the interesting cases (federal's version is the model). Run it, and **fix what it finds**:
the federal fuzz found three real bugs that hand-written tests had not. When a test fails, decide
whether the code or the expectation is wrong by reading the source document; do not bend either to
make it pass.

Cross-check each state against a **full year of real engine pay runs** (see
`tests/federal-w3.test.ts`) in that state: engine pay runs through the state returns, and the
state totals tie to the W-2 state boxes.

## 6. Order of work

1. **Pilot three states of different shape** end to end and get the template right before scaling:
   one where a single department does everything and the mandate is strict (e.g. CA), one combined
   quarterly filer (e.g. NY), one UI-only state with no income tax (e.g. TX). Stop and review the
   template after the pilot: if the data shape needs to change, change it now.
2. Then the remaining states in batches of about 5 by similarity. After each batch: `npm test`,
   the watcher tests, regenerate `docs/STATE-COVERAGE.md`, commit.
3. A **coverage test** that fails if any of the 51 registry jurisdictions or the 53 UI agencies has
   no profile and no explicit `NOT MODELLED` reason, and that pins the counts in section 3.
4. Territories (PR, VI; Guam, American Samoa, CNMI have no DOL UI-tax entry) after the states.
5. Local taxes are **out of scope** for this pass. Write `docs/LOCAL-LAYER-NOTES.md` listing the
   collectors you encountered (e.g. PA Act 32 tax collection districts, Ohio RITA/CCA/municipal
   direct, Indiana and Maryland state-collected) so the local spec can be written next.

## 7. When you are blocked

Do not guess and do not stall. Add the item to `docs/STATE-BLOCKERS.md` with: jurisdiction,
function, URL, what happened (status code / "login required" / "registered users only"), and what a
person would need to do. Continue with everything else. Only ask the user for a decision that is
genuinely theirs (choosing a provider, supplying credentials, accepting a tradeoff).

## 8. Definition of done (per jurisdiction and function)

- [ ] Data file with every fact cited to a primary source read in full, `verifiedOn` set.
- [ ] Builder produces every line / field the agency requires, or an explicit `NOT MODELLED` with reason.
- [ ] Due dates correct under the state's own holiday rules, tested against dates the agency states.
- [ ] Agency channel entry: enrollment, spec availability (actually attempted), mandate text.
- [ ] Worked-example tests from the agency, invariants, and the property test covers it.
- [ ] Reconciles with the federal outputs where the rules say it should.
- [ ] Watcher knows the cited URLs; `npm test` and the watcher tests pass.
- [ ] `docs/STATE-FILING.md` and `docs/STATE-COVERAGE.md` state plainly what is and is not covered
      and that **nothing is transmitted**.

## 9. Your final report

Honest and short: what is built per function with counts you verified, what is `NOT MODELLED` and
why, what was blocked, the bugs your tests found, test totals, and exactly what a person must do
(enrollments, specs, provider decision) before any state filing can go live. Do not call anything
"complete" or "perfect"; say what was verified and how.

---

### Paste-in prompt

> Read `docs/STATE-LAYER-SPEC.md` in this repository in full, then `docs/FEDERAL-FILING.md`, then
> the files they reference. Build the state filing layer exactly as the spec describes, starting
> with the three-state pilot, stopping to review the template before scaling. Follow every rule in
> section 1. Work on a new branch, commit as you go, and report as section 9 requires. Do not open
> a pull request unless asked.
