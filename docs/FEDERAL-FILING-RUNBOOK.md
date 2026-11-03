# Filing federal employment taxes: what to do, in order

This is the procedure for filing **today**, using what `payroll/federal/` produces. It needs no
IRS or SSA software enrollment. Nothing in the code signs, mails, pays or transmits anything:
each step below that moves money or files a document is done by a person.

If you would rather have software transmit the returns, see "E-file" at the end.

## Every pay date: deposits

Federal taxes are deposited by electronic funds transfer; paper checks are not an option for deposits.

1. Get the deposit schedule and amounts: `federal.computeForm941(...).deposits.analysis.obligations`
   (each has `amountDue`, `dueDate`, and `rule`).
2. Pay each by **EFTPS** (enrol at EFTPS.gov, 800-555-4477), **IRS Direct Pay**, or your **IRS
   business tax account**, or have a payroll provider or bank do it. `federal.paymentInstruction(...)`
   gives the amount, the due date and the cutoff (same-day by 3:00 p.m. Eastern for $1 million or
   less; by 8:00 p.m. Eastern the day before above that).
3. Keep the **EFT Trace Number** of every payment. Record each as a `TaxDeposit`; they feed line 13
   and the reconciliation, which shows what is paid, late or short and estimates any penalty.

## Every quarter: Form 941

1. Compute: `federal.computeForm941({ employer, year, quarter, runs, deposits, lookbackTotalLine12, ... }, companyId)`.
   Inputs a pay run cannot know (tips, sick-pay adjustments, the Form 8974 credit) are explicit.
2. Read `findings`. **Errors block signing.** Warnings (a late deposit, a W-3 mismatch) need a decision.
3. Build the packet:

   ```
   pip install -r payroll/federal/paper/requirements.txt
   node examples/federal-paper-packet.ts ./out        # adapt to your runs, or call federal.paperPacket941 / fillPacket
   ```

   This fills the IRS's own Form 941 (Rev. 3-2026), Schedule B when you were a semiweekly depositor
   for any part of the quarter, and Form 941-V only if you chose to pay by check. It **refuses** if the
   blank is not the revision it was built for, if a field is missing, or if a value does not fit. Part 4
   (designee) and Part 5 (signature) are left blank.
4. A responsible person **reads, signs in ink and dates page 2, Part 5**. Only an authorized person may sign.
5. Pay any balance due **electronically** (the IRS asks for this in 2026). If you pay by check, enclose
   Form 941-V and use the "with a payment" address.
6. Mail to the address the packet's checklist prints (Kansas City for the eastern group of states,
   Ogden for the western group, Louisville with a check). Postmarked by the due date is timely.
7. Keep the signed copy, Schedule B and the EFT trace numbers.

**Due dates:** the last day of the month after the quarter (Q3 2026: Monday Nov 2, 2026, because Oct 31 is
a Saturday); **Nov 10, 2026** if every deposit for the quarter was made in full and on time. `federal.form941Due`.

## Every year: Forms W-2 and W-3 (SSA)

1. Register for **Business Services Online** (SSA.gov/bso) in the employer's name. Allow at least 2 weeks.
2. `federal.w2EntrySheet({ year, employer, w2s, recipients })` produces what to type into BSO's online
   W-2 forms (up to 50 W-2s), checks each W-2 against the instructions, and totals the W-3. SSNs are
   masked unless you ask otherwise and are never stored.
3. Submit in BSO. It generates the W-3 from your W-2s: compare it with the sheet's totals.
4. Run `federal.reconcileW3With941(...)` against your four 941s; explain any difference and keep the explanation.
5. Furnish Copies B, C and 2 to each employee by the same date. **Due Feb 1, 2027** for tax year 2026.
6. If you must file more than 50 W-2s, BSO expects a wage file in the SSA's EFW2 layout, which is not
   built yet. You must e-file if you file at least 10 information returns in total.

## Every January: Form 940 (FUTA)

`federal.computeForm940(...)` computes every line, Schedule A and the quarterly liability, and
`federal.renderForm940` lays it out. **There is no PDF mapping for Form 940 yet**: the 2026 form is not
published, and the mapping is written against one verified revision. Until it is added, transcribe the
rendered lines onto the IRS's blank Form 940. FUTA deposits (when accumulated tax exceeds $500) are
by EFT like the others. The 2026 credit-reduction list is final only after November 10.

## E-file (not done by this code)

Form 941 is "encouraged" to be e-filed, not required (only certain professional employer organizations
must). To e-file you need a connection that is not in this repository:

- **A provider that already has one** (a payroll provider or an IRS-approved transmitter). Fastest.
- **Becoming an approved IRS MeF software developer** yourself: an IRS e-Services account, an e-file
  application as a software developer, ATS testing, and the year's 94x schema package from the e-Services
  mailbox. Then the XML mapping goes behind `FilingTransport` (`payroll/federal/agency.ts`).

See `docs/FEDERAL-FILING.md` for the channels, what each needs, and where the specifications stand.

## What this does not do

It does not sign, mail, pay, transmit, or file Form 944, 941-X, W-2c, Form 8974, or CT-1. It is
federal only: state and local filings are separate (`docs/STATE-LAYER-SPEC.md`). Penalty figures are estimates.
