export type Row = {
  name: string;
  state: string;
  opts?: { assignedFrequency?: string; lookbackLiability?: number; annualFiler?: boolean };
  pays: [string, number][];
  expect: [string, number, string][];
};

export const ROWS: Row[] = [];

// Mississippi (Pub 89-700-25-1): monthly and quarterly, the 15th; the guide's calendar lists every date.
ROWS.push(
  { name: 'monthly: December wages are due January 15', state: 'MS', opts: { assignedFrequency: 'monthly' }, pays: [['2025-12-12', 100]], expect: [['monthly', 100, '2026-01-15']] },
  { name: 'monthly: a weekend due date moves to the next working day (Feb 15, 2026 is a Sunday; Monday is Presidents Day only if the holiday list says so)', state: 'MS', opts: { assignedFrequency: 'monthly' }, pays: [['2026-01-16', 100]], expect: [['monthly', 100, '2026-02-16']] },
  { name: 'quarterly: Q1 by April 15, Q2 by July 15, Q3 by October 15, Q4 by January 15', state: 'MS', opts: { assignedFrequency: 'quarterly' }, pays: [['2025-02-14', 10], ['2025-05-16', 10], ['2025-08-15', 10], ['2025-11-14', 10]], expect: [['quarterly', 10, '2025-04-15'], ['quarterly', 10, '2025-07-15'], ['quarterly', 10, '2025-10-15'], ['quarterly', 10, '2026-01-15']] },
);

// Illinois (Pub 131, R-01/26)
ROWS.push(
  { name: "the guide's example: Wed Sep 30 and Thu Oct 1, 2026 are both due Wed Oct 7 but paid separately", state: 'IL', opts: { assignedFrequency: 'semiweekly' }, pays: [['2026-09-30', 400], ['2026-10-01', 250]], expect: [['semiweekly', 400, '2026-10-07'], ['semiweekly', 250, '2026-10-07']] },
  { name: 'semi-weekly: Saturday to Tuesday paydays are due Friday', state: 'IL', opts: { assignedFrequency: 'semiweekly' }, pays: [['2026-08-08', 100], ['2026-08-11', 50]], expect: [['semiweekly', 150, '2026-08-14']] },
  { name: 'monthly: the 15th of the following month', state: 'IL', opts: { assignedFrequency: 'monthly' }, pays: [['2026-08-07', 100], ['2026-08-28', 40]], expect: [['monthly', 140, '2026-09-15']] },
  { name: 'look-back: $12,000 or less is monthly, more is semi-weekly', state: 'IL', opts: { lookbackLiability: 12000 }, pays: [['2026-08-07', 100]], expect: [['monthly', 100, '2026-09-15']] },
  { name: 'look-back above $12,000 is semi-weekly', state: 'IL', opts: { lookbackLiability: 12000.01 }, pays: [['2026-08-07', 100]], expect: [['semiweekly', 100, '2026-08-12']] },
);

// Wisconsin (Publication W-166, 1/26)
ROWS.push(
  { name: "the guide's example: paid December 16, reported for the period ending December 31, due January 15", state: 'WI', opts: { assignedFrequency: 'semi_monthly' }, pays: [['2026-12-16', 100]], expect: [['sub_monthly', 100, '2027-01-15']] },
  { name: "semi-monthly: paid on or between the 1st and 15th is due the last day of the month (Jan 11 -> Jan 30 2026 is a Friday; Jan 31 is Saturday -> Feb 2)", state: 'WI', opts: { assignedFrequency: 'semi_monthly' }, pays: [['2026-01-11', 100]], expect: [['sub_monthly', 100, '2026-02-02']] },
  { name: 'monthly: the last day of the following month', state: 'WI', opts: { assignedFrequency: 'monthly' }, pays: [['2026-12-26', 100]], expect: [['monthly', 100, '2027-02-01']] }, // Jan 31, 2027 is a Sunday
  { name: 'quarterly: the last day of the month after the quarter', state: 'WI', opts: { assignedFrequency: 'quarterly' }, pays: [['2026-02-13', 20], ['2026-05-15', 20]], expect: [['quarterly', 20, '2026-04-30'], ['quarterly', 20, '2026-07-31']] },
  { name: 'annual: no deposit report; one payment with the WT-7 on January 31', state: 'WI', opts: { assignedFrequency: 'annual' }, pays: [['2026-03-13', 20], ['2026-09-11', 20]], expect: [['annual', 40, '2027-02-01']] },
);
