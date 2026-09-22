# Getting from "calculator" to "actually pays people"

This is the plan for the last mile: moving real money (paying employees) and
filing taxes. The engine already does the hard part — gross-to-net for federal
+ every state + local, prevailing wage, certified payroll. What's left is
**rails**, and rails are a licensed, bank-backed activity you don't build
yourself. You rent them.

Two honest ways to do it. The whole decision is which one.

---

## Model A — Embedded payroll provider (Check / Zeal)  ← recommended

The provider IS the licensed, bank-backed payroll company. You send them the
payroll; they move the money AND file the taxes (941/940/W-2, state returns).

```
 Crewtally  ──hours, earnings, certified-payroll adjustments──▶  Check / Zeal
   (your engine: gross-to-net, prevailing wage, WH-347)            (money + tax filing)
```

- **What they do:** direct deposit, tax deposits + filings, W-2s, new-hire
  reporting, and they hold the money-transmitter / reporting-agent licenses,
  the bank relationship, and the compliance/insurance. This is the entire
  regulated wall — gone.
- **What YOUR engine still adds (the reason to exist):** certified payroll /
  prevailing wage / local-tax coverage that Check and Zeal do **not** do well.
  You compute the correct gross-to-net (including the prevailing-wage make-up),
  hand them the final numbers, and keep the WH-347 / job-costing outputs as
  your product surface.
- **Effort:** weeks. Adopt the provider's company/employee/payroll object
  model, map our pay run onto it, call one "run payroll" endpoint.
- **Cost:** roughly $20–40 / employee / month wholesale (you mark up).
- **Seam in this repo:** `payroll/embeddedProvider.ts` → the
  `EmbeddedPayrollProvider` port. `sandboxProvider` simulates it today (no
  money, no filing, clearly labeled); a real `checkProvider` / `zealProvider`
  is the drop-in.

**Check** (checkhq.com) and **Zeal** (joinzeal.com) are the two embedded-payroll
infra players. Both do money + filing. Rough differences to confirm with their
sales/docs:
- **Check** — the most established embedded-payroll API; strong docs; you can
  supply your own earnings/amounts. Best fit if you want your engine to stay
  the source of truth for the numbers.
- **Zeal** — also full embedded payroll (they have their own tax engine);
  make sure they'll accept *our* computed amounts rather than forcing theirs,
  or your engine's edge gets bypassed.

---

## Model B — Raw ACH rail (Increase / Column / Modern Treasury)

The provider is a **dumb money pipe**. Your engine computes everything; you hand
them the ACH batch; they originate it.

- **What they do:** ACH origination only. **They do NOT file taxes.**
- **What you still own:** every tax deposit (EFTPS) and every filing
  (941/940/W-2, 50 states), plus becoming a reporting agent, plus the
  compliance burden. This is a *large* ongoing regulated job — effectively a
  team.
- **Effort:** the ACH part is small (weeks). The tax-filing part you'd be
  taking on is the reason most people don't choose this.
- **Seam in this repo:** `payroll/paymentRun.ts` → the `PaymentSubmitter` port
  (`buildPaymentBatch` already assembles the NACHA file; `unbankedSubmitter`
  is the honest no-op default). A real Increase/Column/Modern-Treasury adapter
  implements `PaymentSubmitter`.

**Verdict:** Model B only makes sense if you *want* to own tax filing (you
usually don't, at this stage). For "actually pays people, soon, correctly,"
Model A is the answer.

---

## What each model does vs. what we keep

| Job | Model A (Check/Zeal) | Model B (raw ACH) | Our engine |
|---|---|---|---|
| Gross-to-net, all states + local | provider *or* us | **us** | ✅ built |
| Prevailing wage / certified payroll | **us** (they can't) | **us** | ✅ built |
| Move money (direct deposit) | **provider** | provider (pipe) | seam only |
| Deposit + file taxes | **provider** | **you** (hard) | ✗ |
| Licenses / bank / bonding | **provider** | you find a bank | ✗ |

---

## The remaining steps (and where I stop)

Everything above the line I can build without you. Below the line needs you.

**I can do now (no input needed):**
- ✅ The `EmbeddedPayrollProvider` port + a `sandboxProvider` that runs the full
  "pay + file" flow as an honest simulation (no money, clearly labeled), with
  tests. Crewtally can demo the complete loop against it.
- ✅ Keep the raw-ACH `PaymentSubmitter` seam ready for Model B.

**I need YOU for (the real fork + credentials):**
1. **Pick the model and provider** — almost certainly **Model A**, then Check
   vs Zeal. (Decision, ~1 call with each's sales to confirm they'll take our
   computed amounts and what onboarding/pricing looks like.)
2. **Sign up + get sandbox API credentials.** This requires a business entity
   and their onboarding (KYC/KYB) — a real-world step, not a code step.
3. Then I implement the chosen provider's adapter against the port and test it
   in their sandbox with test accounts, and wire "run payroll" into Crewtally's
   approve flow.

That's the honest distance: the calculation is done, the seam is done, and the
gap to "actually pays people" is **one provider decision + one sandbox
account** — not a rewrite.
