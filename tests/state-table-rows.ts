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
