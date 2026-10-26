import { TRIAL_DAYS } from './pricing.ts';

/**
 * Commercial terms, versioned.
 *
 * The UI renders the current clauses and the server stores TERMS_VERSION
 * on the acceptance. Bump TERMS_VERSION when a clause changes. Existing
 * acceptances keep the version they saw. The 2026-10-19.2 text is frozen
 * in termsClauses202610192 and must not be edited.
 *
 * Current offer: a 14-day Stripe free trial (card required at signup),
 * then $0.08 per successful paycheck calculation, pay as you go. Usage
 * recorded during trial_period_days is not billed by Stripe. There is
 * no minimum term. The trial stays cancellable (ROSCA, 15 U.S.C. 8403).
 */

export const TERMS_VERSION = '2026-10-25.1';
/** Frozen prior version. Acceptances already stored under this string. */
export const TERMS_VERSION_2026_10_19_2 = '2026-10-19.2';
export const TERM_MONTHS = 12;

export interface TermsClause {
  heading: string;
  body: string;
}

export interface TermsArgs {
  trialEndsAt: string;
  estimatedAnnual: number;
  expectedEmployees: number;
}

function endsOn(trialEndsAt: string): string {
  return new Date(trialEndsAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Archived clauses for 2026-10-19.2. Do not edit this text. */
export function termsClauses202610192(args: TermsArgs): TermsClause[] {
  const trialEnd = endsOn(args.trialEndsAt);
  // expectedEmployees and estimatedAnnual stay on the quote record for the
  // billing tests. They are not written into the clause text: the public
  // price is "to be announced", and pricing is per calculation.
  void args.estimatedAnnual;
  void args.expectedEmployees;

  return [
    {
      heading: 'What you are agreeing to pay',
      body:
        `Live calculations are billed per successful calculation (POST /v1/paycheck), monthly, at the rate published for the account. ` +
        `That rate is to be announced. There is no per-employee fee, no seat license, and no setup fee. ` +
        `Sandbox calls are not billed. An address lookup that matches counts as one calculation on a live key; one that does not match is not billed. ` +
        `A minimum-wage check or a wage garnishment sent on the same paycheck call is part of that one calculation.`,
    },
    {
      heading: `Free for ${TRIAL_DAYS} days, then usage is billed`,
      body:
        `The first ${TRIAL_DAYS} days are not billed. On ${trialEnd} the trial ends. ` +
        `After that, the payment method on file may be charged for live calculations. ` +
        `You can stop during the trial and not be charged.`,
    },
    {
      heading: 'No long contract',
      body:
        `There is no minimum term. Stop calling the API and billing for new calculations stops. ` +
        `Fees already incurred are not refundable except where the law requires a refund.`,
    },
    {
      heading: 'Payment method',
      body:
        `You authorize Omnia to charge the card or bank account you attach for live calculations, monthly. ` +
        `Card and bank details are handled by the payment processor and are not stored on Omnia's servers.`,
    },
    {
      heading: 'Calculations only',
      body:
        `Results are calculations. You remain responsible for your own payroll, deposits, and tax filings. ` +
        `Omnia does not file returns, remit tax, or move wages. This is not tax, legal, or accounting advice.`,
    },
    {
      heading: 'As is, no warranty',
      body:
        `The service is provided as is and as available, without warranties of any kind, express, implied, or statutory, ` +
        `including merchantability, fitness for a particular purpose, and any warranty that a calculation is accurate, complete, or current.`,
    },
    {
      heading: 'Limitation of liability',
      body:
        `Omnia is not liable for consequential, incidental, special, indirect, or punitive damages, or for lost profits, data, or tax penalties. ` +
        `Omnia's total liability for claims relating to the service is capped at the fees you paid Omnia in the 12 months before the claim.`,
    },
    {
      heading: 'Indemnification',
      body:
        `You will indemnify Omnia and its officers and employees against claims arising from your inputs, your use of the results, ` +
        `your payroll or tax filings, or your breach of these terms.`,
    },
    {
      heading: 'Arbitration, class actions, and the jury',
      body:
        `Disputes are resolved by binding individual arbitration under the Federal Arbitration Act, in Michigan. ` +
        `You and Omnia waive class actions, class arbitrations, and jury trials. ` +
        `You may opt out of arbitration by emailing scottholdan@gmail.com within 30 days of first accepting these terms. ` +
        `A claim must be brought within one year after it accrues, or it is barred, to the extent the law allows.`,
    },
    {
      heading: 'Michigan law, and changes to the service',
      body:
        `Michigan law governs these terms, excluding conflict-of-laws rules. ` +
        `Omnia may change, suspend, or stop the service, and may update these terms. ` +
        `Material changes are posted with a new version. The version stored with your account is the one you accepted.`,
    },
  ];
}

/** Clauses for the current TERMS_VERSION. */
export function termsClauses(args: TermsArgs): TermsClause[] {
  const trialEnd = endsOn(args.trialEndsAt);
  void args.estimatedAnnual;
  void args.expectedEmployees;

  return [
    {
      heading: 'What you are agreeing to pay',
      body:
        `Successful paycheck calculations are billed at $0.08 each, monthly, pay as you go. ` +
        `Each successful paycheck calculation is one charge. A calculation that does not succeed is not charged. ` +
        `There is no per-employee fee, no seat license, no setup fee, and no minimum term. ` +
        `An address lookup is not a paycheck calculation and is not charged. ` +
        `A minimum-wage check or a wage garnishment sent on the same paycheck is part of that one calculation.`,
    },
    {
      heading: `Free for ${TRIAL_DAYS} days, then $0.08 per paycheck calculation`,
      body:
        `The first ${TRIAL_DAYS} days are a free trial. A card is required when you sign up. ` +
        `Paycheck calculations during the trial are recorded and are not charged. On ${trialEnd} the trial ends. ` +
        `After that, the card on file is charged $0.08 for each successful paycheck calculation, pay as you go. ` +
        `You can stop during the trial and not be charged.`,
    },
    {
      heading: 'No long contract',
      body:
        `There is no minimum term. Stop calling the API and billing for new paycheck calculations stops. ` +
        `Fees already incurred are not refundable except where the law requires a refund.`,
    },
    {
      heading: 'Payment method',
      body:
        `You authorize Omnia to charge the card you attach for paycheck calculations after the trial, monthly. ` +
        `A card is required at signup, including during the trial. ` +
        `Card details are handled by the payment processor and are not stored on Omnia's servers.`,
    },
    {
      heading: 'Calculations only',
      body:
        `Results are calculations. You remain responsible for your own payroll, deposits, and tax filings. ` +
        `Omnia does not file returns, remit tax, or move wages. This is not tax, legal, or accounting advice.`,
    },
    {
      heading: 'As is, no warranty',
      body:
        `The service is provided as is and as available, without warranties of any kind, express, implied, or statutory, ` +
        `including merchantability, fitness for a particular purpose, and any warranty that a calculation is accurate, complete, or current.`,
    },
    {
      heading: 'Limitation of liability',
      body:
        `Omnia is not liable for consequential, incidental, special, indirect, or punitive damages, or for lost profits, data, or tax penalties. ` +
        `Omnia's total liability for claims relating to the service is capped at the fees you paid Omnia in the 12 months before the claim.`,
    },
    {
      heading: 'Indemnification',
      body:
        `You will indemnify Omnia and its officers and employees against claims arising from your inputs, your use of the results, ` +
        `your payroll or tax filings, or your breach of these terms.`,
    },
    {
      heading: 'Arbitration, class actions, and the jury',
      body:
        `Disputes are resolved by binding individual arbitration under the Federal Arbitration Act, in Michigan. ` +
        `You and Omnia waive class actions, class arbitrations, and jury trials. ` +
        `You may opt out of arbitration by emailing scottholdan@gmail.com within 30 days of first accepting these terms. ` +
        `A claim must be brought within one year after it accrues, or it is barred, to the extent the law allows.`,
    },
    {
      heading: 'Michigan law, and changes to the service',
      body:
        `Michigan law governs these terms, excluding conflict-of-laws rules. ` +
        `Omnia may change, suspend, or stop the service, and may update these terms. ` +
        `Material changes are posted with a new version. The version stored with your account is the one you accepted.`,
    },
  ];
}
