# Federal employment-tax filing

`payroll/federal/` turns approved pay runs into the federal returns, deposits and
reconciliations an employer owes, and tracks each filing from draft to the
agency's acknowledgement. Import it as `import { federal } from './payroll/index.ts'`.

**What it does not do: it does not connect to the IRS or SSA.** No return has been
or can be transmitted from this code until the enrollments below exist. Every
"submit" here either rehearses (sandbox, labelled as not a filing) or refuses with
the list of what is missing. See [Agency connections](#agency-connections).

**What it does do: it lets you file today without that connection.** Form 941 is not
required to be e-filed (the IRS "encourage[s]" it), so `paper/` fills the IRS's own
Form 941, Schedule B and Form 941-V with the computed figures, ready to sign and mail,
and produces a W-2 entry sheet for the SSA's online forms. See
[`FEDERAL-FILING-RUNBOOK.md`](FEDERAL-FILING-RUNBOOK.md) for the procedure.

## What is built

| Module | Covers | Built from |
| --- | --- | --- |
| `calendar.ts` | DC legal holidays, business days, monthly / semiweekly / next-day deposit due dates, 941, 940 and W-2/W-3 due dates, FUTA deposit dates | Pub. 15 (2026) section 11 and Calendar; Instructions for Forms 941, 940, W-2/W-3 |
| `ledger.ts` | Pay runs → federal liability and wages **by the date wages were paid** | the tax-line ids in `src/taxes/federal.ts` |
| `deposits.ts` | Depositor schedule, the $100,000 next-day rule, deposits per pay period, reconciliation against recorded EFTPS deposits, failure-to-deposit penalty estimate, accuracy-of-deposits rule | Pub. 15 section 11 |
| `form941.ts` | **Form 941 (Rev. 3-2026), every line**, Part 2, Schedule B, the line 11 research credit | Form 941 and its Instructions (Rev. 3-2026); Schedule B instructions |
| `form940.ts` | **Form 940, every line**, Schedule A credit reduction, Part 5 quarterly liability, FUTA deposits | Form 940 and Schedule A, Instructions for Form 940 (2025) |
| `w3.ts` | W-2 checks, W-3 totals, **941 ↔ W-3 reconciliation** | General Instructions for Forms W-2 and W-3 (2026) |
| `paper/forms.ts` | **Fills the IRS's own fillable Form 941 (Rev. 3-2026), Schedule B and 941-V** from a computed return; mailing address by state; signer's checklist. Refuses a revised form. Part 5 is never filled | the forms and the 941 instructions' address table |
| `paper/w2Sheet.ts` | W-2 entry sheet for SSA Business Services Online (up to 50 W-2s), each W-2 checked, W-3 totals | W-2/W-3 instructions |
| `agency.ts` | Federal channels, filing lifecycle and audit trail, transports, EFTPS payment instruction, compliance calendar | the agencies' own enrollment text (below) |

### Rules that are easy to get wrong, and where they are encoded

- **Form 941 column 2 is column 1 × the rate**, not the sum of what was withheld
  (0.124 / 0.124 / 0.029 / 0.009). The difference — fractions of cents on the
  employee and employer shares — is **line 7**, so line 10 lands on the real
  liability. A large line 7 is reported as an error: it means a wage, a rate or the
  wage base is wrong in a pay run. Products use integer arithmetic (`timesRate`),
  because a float `0.124` misrounds exact half-cents.
- Tips come out of 5a into 5b; line 12 is never below zero; lines 14 and 15a are never both filled.
- **Adjustments reach the deposits, not just the return.** A Section 3121(q) notice
  "is treated as accumulated ... on the Date of Notice and Demand", and sick-pay or tip
  adjustments belong to the day they relate to, so all of them are folded into the daily
  ledger before deposits are worked out. A negative adjustment larger than the deposit,
  month or Schedule B day it falls in reduces the next one (never below zero); if nothing
  later in the quarter can absorb it, the form says so (`negative_adjustment_carried_out`):
  the deposits already made show as an overpayment on line 15a.
- Once the $100,000 rule makes a monthly depositor semiweekly it lasts "the rest of the
  calendar year and ... the following calendar year": `semiweeklyCarriesIntoNextYear`
  tells the caller to pass `semiweeklyFromPriorYear: true` next year.
- **Part 2 / Schedule B must total line 12**, entered by the date wages were paid,
  never below zero; a negative adjustment larger than the month is `-0-` and carries
  forward. A monthly depositor who trips the $100,000 rule mid-quarter becomes
  semiweekly the next day and attaches Schedule B for the **whole** quarter.
- **The line 11 credit** reduces the employer social security share first (up to
  $250,000 a quarter), then the employer Medicare share, from the first payroll
  of the quarter. It lowers what is deposited but not the $100,000 test.
- **Semiweekly deposits** are due the third *business* day after the period closes,
  so a holiday adds a day; periods spanning two quarters need two deposits.
- **Deposit application.** Pub. 15 says deposits go to "the most recent tax
  liability within the quarter". Read literally against liabilities that have merely
  accrued, a deposit for last Wednesday's payroll would land on this Wednesday's and
  show a penalty on a timely deposit. `reconcileDeposits` applies to liabilities
  already *due*, most recently due first (which is what the IRS's Cedar example
  shows), then carries any remainder to the earliest upcoming one.
- **Form 940** line 5 is per employee (payments − that employee's exempt payments −
  $7,000, not below zero); line 9 and lines 10/11 are mutually exclusive; **16d is
  line 12 less 16a–16c**, which is where credit reduction lands.
- **W-3 reconciliation.** Additional Medicare Tax is employee-only, so the 941's
  Medicare tax is `2 × box 6 − line 5d`. Tax rows are compared with a tolerance of
  one cent per *paycheck*, because per-check rounding accumulates in one direction
  when checks are alike.

### How it was verified

Every expectation that could be taken from the IRS is. The tests reproduce the
agencies' own worked examples: Pub. 15's 2026 holiday list (exactly), the Green,
Elm and Fir semiweekly examples, the $95,000/$10,000 and Sep 30/Oct 2 cases, the
Cedar deposit-ordering example, both accuracy-of-deposits makeup dates; Schedule B's
Cedar, Fir and Elm examples (line placement); Form 940's Joan/Sara/John ($42,500)
and the $200/$400 FUTA deposit example; the W-2/W-3 instructions' Feb 1, 2027 due date.
**Property tests** (`tests/federal-properties.test.ts`, seeded and reproducible) run 600
randomized payroll years - weekly, biweekly, semimonthly, monthly and irregular paydays,
weekend and holiday pay dates, payrolls large enough to trip the $100,000 rule, random
adjustments and credits - through all four quarters and assert what the IRS forms
require of *any* payroll: the line identities; that Part 2 / Schedule B and the deposits
both total line 12; that every pay date is in exactly one deposit; that every due date is
a business day and follows its rule; that depositing exactly what is due always reconciles
clean; and, for the calendar, every day of 2026-2032. The same suite fuzzes Form 940's
arithmetic and FUTA deposit plan, and runs random sequences of operations against the
filing lifecycle to show a rehearsal or a refusal can never be recorded as a filing. A
coverage test fails if the generator stops reaching the interesting cases (mid-quarter
switch to semiweekly, next-day deposits, credits, unabsorbed adjustments). This is how the
Schedule B negative-day bug and the missing adjustment-to-deposit link were found.

On top of those, a full year of real engine pay runs (including an employee who
crosses the $184,500 wage base and the $200,000 Additional Medicare threshold) is
run through four 941s, the W-2s and the W-3, and they tie out.

## Using it

```ts
import { federal } from './payroll/index.ts';

const employer = { ein: '123456789', legalName: 'Rooter Bros LLC', address: { street: '1 Main St', city: 'Columbus', state: 'OH', zip: '43215' } };

const form = federal.computeForm941(
  {
    employer, year: 2026, quarter: 3, runs,
    deposits,                      // what EFTPS confirmed, with trace numbers
    lookbackTotalLine12,           // the four lookback quarters' line 12
    priorQuarterLine12,
    researchCredit,                // Form 8974, if any
    adjustments: [{ date: '2026-08-14', amount: -1059, line: '9' }],
  },
  companyId,
);
console.log(federal.renderForm941(form));      // laid out like the form, with findings

const book = new federal.FilingBook();
const rec = book.add(federal.makePackage({ kind: 'form941', ein: employer.ein, period: '2026-Q3', payload: form, fields: form.fields, findings: form.findings }));
book.approve(rec.id, { name: 'Pat Rooter', title: 'Owner' });          // refused while any error stands
await book.submit(rec.id, federal.sandboxTransport('irs_mef_94x'));   // rehearsal: status 'rehearsed', nothing sent
```

`form.findings` is the review list: errors block approval; warnings (a late deposit and
its estimated penalty, a credit-reduction list that is not final yet, an unreconciled
W-3 row) must be read.

## Agency connections

| Channel | Agency | What a real connection needs | Specification |
| --- | --- | --- | --- |
| `irs_mef_94x` | IRS | e-Services account; an e-file application with the *software developer* provider option (principal, responsible official or delegated user with MeF authorities); ATS testing; the year's 94x schema and business rules from the e-Services mailbox | **Registered developers only** — distributed through the Registered User Portal / SOR mailbox, not downloadable |
| `irs_eft_deposit` | IRS / Treasury | EFTPS enrollment, IRS Direct Pay, the IRS business tax account, or a third party that deposits for you and returns the EFT Trace Number | Public (cutoffs in Pub. 15, encoded in `paymentInstruction`) |
| `ssa_bso_w2` | SSA | Business Services Online registration (allow 2+ weeks; credentials renewed since 2023-03-25; new Electronic Wage Reporting authorization and re-registration required since 2026-11-07, registration codes come by mail); BSO online forms for ≤ 50 W-2s, or file upload of an EFW2 wage file above that | EFW2/EFW2C — published by SSA, but its site **returned HTTP 403 to automated retrieval** |

For a payroll product filing for other employers, the enrollment sequence (provider options, Form 8655,
fingerprints, testing, A2A vs IFA, the security obligations) is in
[`IRS-EFILE-ENROLLMENT-PLAN.md`](IRS-EFILE-ENROLLMENT-PLAN.md).

So the two things a live connection needs that code alone cannot supply are the
**IRS 94x schema package** (obtained by the operator's e-Services account) and the
**SSA EFW2 specification** (a person can download it in a browser). Once those are in
hand, the form-to-wire mapping goes behind `FilingTransport` — `Form941.fields` /
`Form940.fields` already hold the exact line values it fills in — and a transport is
only "live" when it sets `connected: true`.

The W-2 e-file mandate (at least 10 information returns in total) and the SSA route
(online forms ≤ 50, file upload above) are `mustEfileW2` and `ssaBsoRoute`.

## Known limits

- **Not derivable from pay runs, so inputs:** tips reported (941 5b), Section 3121(q)
  notices (5f), sick-pay and tip/group-term-life adjustments (8, 9), the Form 8974
  credit (11), Form 940's partly-excluded-wages worksheet (line 10), and each
  employee's exempt FUTA payments. Absent, they are zero or derived with a stated
  assumption in `findings`; nothing is guessed silently.
- **Not built:** Form 944 (annual filers), Form 941-X / W-2c amendments, Form 8974
  itself, CT-1 (railroad), aggregate-return filers (CPEO / section 3504 agent), the
  Form 940 PDF mapping (the 2026 form is not published; the paper filler is mapped to
  one verified revision of each form and refuses any other), the EFW2 wage file for
  more than 50 W-2s.
- **Form 940 (2026)** is not published yet; this follows the 2025 form. The FUTA
  credit-reduction list for a year is final only after November 10; until the engine
  data carries it the return says so (`credit_reduction_not_determined`). The 2026 data now carries
  DOL's final list (California 1.5%, loaded 2026-11-13), so a 2026 return no longer
  carries that finding by default.
- **Federal only.** State and local agencies (withholding, SUI wage reports,
  new-hire reporting) are not part of this module.
- Penalty figures are estimates: the 15% tier needs the date of an IRS notice, and
  interest, first-time abatement and reasonable cause are the IRS's call.
