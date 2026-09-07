import { TRIAL_DAYS } from './pricing.ts';

/**
 * The commercial terms, in one versioned place.
 *
 * The UI renders these clauses and the server stores this exact version
 * string against the acceptance, so "what did they agree to?" is always
 * answerable. Bump TERMS_VERSION whenever a clause changes -- existing
 * acceptances keep pointing at the version they actually saw.
 *
 * On the trial: the customer commits up front, and the trial converts
 * into a 12-month term automatically. What it does NOT do is trap
 * someone with no way out during the trial itself. US federal law
 * (ROSCA, 15 U.S.C. 8403, and the FTC's negative-option rule) requires a
 * simple mechanism to stop a recurring charge you signed up for online;
 * a trial with no cancellation path is the thing those rules exist to
 * prohibit, and it would be an odd liability to hand a customer base
 * that sells compliance for a living. So the commitment lives where it
 * is enforceable -- the 12-month term that begins on conversion -- and
 * the trial window stays exitable. Same commercial outcome, minus the
 * exposure.
 */

export const TERMS_VERSION = '2026-09-03.1';
export const TERM_MONTHS = 12;

export interface TermsClause {
  heading: string;
  body: string;
}

export function termsClauses(args: {
  trialEndsAt: string;
  estimatedAnnual: number;
  expectedEmployees: number;
}): TermsClause[] {
  const endsOn = new Date(args.trialEndsAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const annual = '$' + Math.round(args.estimatedAnnual).toLocaleString('en-US');

  return [
    {
      heading: 'What you are agreeing to pay',
      body:
        `Omnia is billed on usage: every calculation your key makes is metered against the published ` +
        `rate card, plus $0.30 for each rooftop address resolution. Nothing is a flat fee and nothing ` +
        `is per-seat. On the volume you entered (${args.expectedEmployees.toLocaleString()} employees) ` +
        `that comes to about ${annual} a year — an estimate from your own numbers, not a cap or a quote.`,
    },
    {
      heading: `Free for ${TRIAL_DAYS} days, then it converts`,
      body:
        `Your first ${TRIAL_DAYS} days are free and unmetered. On ${endsOn} the account converts ` +
        `automatically to a paid ${TERM_MONTHS}-month term and your payment method is charged for usage ` +
        `from that date forward. No one will ask you again — that is what this authorization is for.`,
    },
    {
      heading: `The ${TERM_MONTHS}-month term is a commitment`,
      body:
        `Once the trial converts, the ${TERM_MONTHS}-month term runs to its end. You can stop renewing ` +
        `before the next term begins, but the current one is not cancellable for convenience and fees ` +
        `already incurred are not refundable. You may cancel at any point during the ${TRIAL_DAYS}-day ` +
        `trial and never be charged.`,
    },
    {
      heading: 'Payment method',
      body:
        `You authorize Omnia to charge the card or bank account you attach for amounts metered under ` +
        `this agreement, on a recurring monthly basis, until the term ends. Card and bank details are ` +
        `handled by our payment processor and are never stored on Omnia's servers.`,
    },
    {
      heading: 'What we owe you',
      body:
        `Every rate carries the source it came from and the date a human verified it, and that record ` +
        `is exportable for as long as you are a customer. Omnia computes withholding; filing, deposit ` +
        `and the accuracy of what you send us remain yours. This is not tax advice.`,
    },
  ];
}
