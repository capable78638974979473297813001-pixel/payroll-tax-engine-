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

// Pennsylvania (REV-415, the Department's Employer Withholding page)
ROWS.push(
  { name: 'expected quarterly withholding: under $300 quarterly; $300 monthly; $1,000 semi-monthly; $5,000 semi-weekly', state: 'PA', opts: { lookbackLiability: 299.99 }, pays: [['2026-08-07', 100]], expect: [['quarterly', 100, '2026-11-02']] },
  { name: 'monthly: January to November wages due the 15th, December wages due January 31', state: 'PA', opts: { assignedFrequency: 'monthly' }, pays: [['2026-09-11', 100], ['2026-12-11', 80]], expect: [['monthly', 100, '2026-10-15'], ['monthly', 80, '2027-02-01']] },
  { name: 'semi-monthly: periods end the 15th and last day, due within three banking days', state: 'PA', opts: { assignedFrequency: 'semimonthly' }, pays: [['2026-08-12', 100], ['2026-08-28', 50]], expect: [['sub_monthly', 100, '2026-08-19'], ['sub_monthly', 50, '2026-09-03']] },
  { name: 'semi-weekly: Wednesday to Friday paydays due the Wednesday after, Saturday to Tuesday the Friday after', state: 'PA', opts: { assignedFrequency: 'semiweekly' }, pays: [['2026-08-05', 100], ['2026-08-08', 50]], expect: [['semiweekly', 100, '2026-08-12'], ['semiweekly', 50, '2026-08-14']] },
);

// Michigan (Treasury withholding page)
ROWS.push(
  { name: 'monthly: the 20th of the following month', state: 'MI', opts: { assignedFrequency: 'monthly' }, pays: [['2026-08-07', 100]], expect: [['monthly', 100, '2026-09-21']] }, // Sep 20, 2026 is a Sunday
  { name: 'quarterly: April 20, July 20, October 20, January 20', state: 'MI', opts: { assignedFrequency: 'quarterly' }, pays: [['2026-02-13', 10], ['2026-05-15', 10], ['2026-08-14', 10], ['2026-11-13', 10]], expect: [['quarterly', 10, '2026-04-20'], ['quarterly', 10, '2026-07-20'], ['quarterly', 10, '2026-10-20'], ['quarterly', 10, '2027-01-20']] },
  { name: 'annual: February 28 of the following year (a Sunday in 2027 -> Monday March 1)', state: 'MI', opts: { assignedFrequency: 'annual' }, pays: [['2026-03-13', 10]], expect: [['annual', 10, '2027-03-01']] },
);

// Alabama (withholding booklet, January 2026): the guide's own example
ROWS.push(
  { name: "the guide's example: $1,050 in January is due February 15 (Sunday, so Monday Feb 16); $800 in February waits for the quarterly return April 30", state: 'AL', opts: { assignedFrequency: 'standard' }, pays: [['2026-01-14', 1050], ['2026-02-13', 800]], expect: [['monthly', 1050, '2026-02-16'], ['quarterly', 800, '2026-04-30']] },
  { name: 'exactly $1,000 in a month is not enough; the third month is always with the quarterly return', state: 'AL', opts: { assignedFrequency: 'standard' }, pays: [['2026-04-10', 1000], ['2026-06-12', 9000]], expect: [['quarterly', 10000, '2026-07-31']] },
  { name: 'voluntary monthly: the 15th of the following month', state: 'AL', opts: { assignedFrequency: 'monthly' }, pays: [['2026-08-07', 100]], expect: [['monthly', 100, '2026-09-15']] },
);

// Maine (2026 booklet, August 2026 revision)
ROWS.push(
  { name: 'look-back $18,000 or more is semiweekly; less pays with the quarterly return', state: 'ME', opts: { lookbackLiability: 17999.99 }, pays: [['2026-08-07', 100]], expect: [['quarterly', 100, '2026-11-02']] },
  { name: 'look-back of exactly $18,000 is semiweekly: a Wednesday payday is due the following Wednesday', state: 'ME', opts: { lookbackLiability: 18000 }, pays: [['2026-08-05', 100]], expect: [['semiweekly', 100, '2026-08-12']] },
  { name: 'semiweekly: Saturday to Tuesday paydays are due the following Friday', state: 'ME', opts: { assignedFrequency: 'semiweekly' }, pays: [['2026-08-08', 100], ['2026-08-11', 25]], expect: [['semiweekly', 125, '2026-08-14']] },
  { name: 'quarterly 941ME: April 30, July 31, October 31, January 31', state: 'ME', opts: { assignedFrequency: 'quarterly' }, pays: [['2026-02-13', 10], ['2026-05-15', 10], ['2026-08-14', 10], ['2026-11-13', 10]], expect: [['quarterly', 10, '2026-04-30'], ['quarterly', 10, '2026-07-31'], ['quarterly', 10, '2026-11-02'], ['quarterly', 10, '2027-02-01']] },
);

// Montana (Wage Withholding Returns and Payments page)
ROWS.push(
  { name: 'look-back: $1,199 annual; $1,200 monthly; $11,999 monthly; $12,000 accelerated', state: 'MT', opts: { lookbackLiability: 1199.99 }, pays: [['2026-08-07', 100]], expect: [['annual', 100, '2027-02-01']] },
  { name: 'monthly: January withholding is due February 15 (a Sunday in 2026, so Monday)', state: 'MT', opts: { assignedFrequency: 'monthly' }, pays: [['2026-01-09', 100]], expect: [['monthly', 100, '2026-02-16']] },
  { name: 'accelerated: Saturday to Tuesday paydays due the following Friday; Wednesday to Friday the following Wednesday', state: 'MT', opts: { assignedFrequency: 'accelerated' }, pays: [['2026-08-05', 100], ['2026-08-08', 40]], expect: [['semiweekly', 100, '2026-08-12'], ['semiweekly', 40, '2026-08-14']] },
  { name: 'look-back of exactly $12,000 is accelerated', state: 'MT', opts: { lookbackLiability: 12000 }, pays: [['2026-08-05', 100]], expect: [['semiweekly', 100, '2026-08-12']] },
);

// North Carolina (withholding FAQ)
ROWS.push(
  { name: 'average monthly: $249.99 quarterly, $250 monthly', state: 'NC', opts: { lookbackLiability: 249.99 }, pays: [['2026-08-07', 100]], expect: [['quarterly', 100, '2026-11-02']] },
  { name: 'monthly: the 15th, December wages by January 31', state: 'NC', opts: { assignedFrequency: 'monthly' }, pays: [['2026-09-11', 100], ['2026-12-11', 80]], expect: [['monthly', 100, '2026-10-15'], ['monthly', 80, '2027-02-01']] },
  { name: '$2,000 or more a month is semiweekly: Saturday-Tuesday due the following Friday, Wednesday-Friday the following Wednesday', state: 'NC', opts: { lookbackLiability: 2000 }, pays: [['2026-08-05', 100], ['2026-08-10', 40]], expect: [['semiweekly', 100, '2026-08-12'], ['semiweekly', 40, '2026-08-14']] },
);

// Vermont (withholding page): only the semiweekly schedule is modelled
ROWS.push(
  { name: 'semiweekly: Wednesday to Friday paydays due the following Wednesday, all other pay dates the following Friday', state: 'VT', opts: { assignedFrequency: 'semiweekly' }, pays: [['2026-08-06', 100], ['2026-08-10', 40]], expect: [['semiweekly', 100, '2026-08-12'], ['semiweekly', 40, '2026-08-14']] },
);

// West Virginia (Tax Division withholding page)
ROWS.push(
  { name: 'monthly: the 15th of the succeeding month', state: 'WV', opts: { assignedFrequency: 'monthly' }, pays: [['2026-08-07', 100], ['2026-08-28', 50]], expect: [['monthly', 150, '2026-09-15']] },
  { name: 'annual filers (under $600 a year) pay January 31', state: 'WV', opts: { assignedFrequency: 'annual' }, pays: [['2026-03-13', 20]], expect: [['annual', 20, '2027-02-01']] },
  { name: 'look-back under $600 is annual', state: 'WV', opts: { lookbackLiability: 599.99 }, pays: [['2026-03-13', 20]], expect: [['annual', 20, '2027-02-01']] },
);

// Oregon (2026 Withholding and Transit Tax Calendar, 150-206-400): the printed dates
ROWS.push(
  { name: 'monthly depositor: every month of the printed calendar', state: 'OR', opts: { assignedFrequency: 'monthly' }, pays: [['2025-12-12', 10], ['2026-01-09', 10], ['2026-02-13', 10], ['2026-03-13', 10], ['2026-04-10', 10], ['2026-05-08', 10], ['2026-06-12', 10], ['2026-07-10', 10], ['2026-08-14', 10], ['2026-09-11', 10], ['2026-10-09', 10], ['2026-11-13', 10]], expect: [['monthly', 10, '2026-01-15'], ['monthly', 10, '2026-02-16'], ['monthly', 10, '2026-03-16'], ['monthly', 10, '2026-04-15'], ['monthly', 10, '2026-05-15'], ['monthly', 10, '2026-06-15'], ['monthly', 10, '2026-07-15'], ['monthly', 10, '2026-08-17'], ['monthly', 10, '2026-09-15'], ['monthly', 10, '2026-10-15'], ['monthly', 10, '2026-11-16'], ['monthly', 10, '2026-12-15']] },
  { name: 'quarterly depositor: Q4 2025 Feb 2, Q1 Apr 30, Q2 Jul 31, Q3 Nov 1', state: 'OR', opts: { assignedFrequency: 'quarterly' }, pays: [['2025-11-14', 10], ['2026-02-13', 10], ['2026-05-15', 10], ['2026-08-14', 10]], expect: [['quarterly', 10, '2026-02-02'], ['quarterly', 10, '2026-04-30'], ['quarterly', 10, '2026-07-31'], ['quarterly', 10, '2026-11-01']] },
  { name: 'semi-weekly: Wednesday to Friday payroll due the following Wednesday, Saturday to Tuesday the following Friday', state: 'OR', opts: { assignedFrequency: 'semiweekly' }, pays: [['2026-08-05', 100], ['2026-08-08', 40]], expect: [['semiweekly', 100, '2026-08-12'], ['semiweekly', 40, '2026-08-14']] },
);

// Ohio (Employer Withholding page and the 2025-2026 Due Dates document, Rev. 3/26)
ROWS.push(
  { name: 'look-back: $2,000 quarterly; over $2,000 monthly; $84,000 partial-weekly', state: 'OH', opts: { lookbackLiability: 2000 }, pays: [['2026-02-13', 10]], expect: [['quarterly', 10, '2026-04-30']] },
  { name: 'monthly: the 2026 printed dates, with the holiday roll-forwards (Feb 17, Mar 16, Aug 17, Nov 16)', state: 'OH', opts: { assignedFrequency: 'monthly' }, pays: [['2025-12-12', 10], ['2026-01-09', 10], ['2026-02-13', 10], ['2026-07-10', 10], ['2026-10-09', 10], ['2026-12-11', 10]], expect: [['monthly', 10, '2026-01-15'], ['monthly', 10, '2026-02-17'], ['monthly', 10, '2026-03-16'], ['monthly', 10, '2026-08-17'], ['monthly', 10, '2026-11-16'], ['monthly', 10, '2027-01-15']] },
  { name: 'quarterly: Q3 2026 is due November 2 and Q4 2026 February 1, 2027', state: 'OH', opts: { assignedFrequency: 'quarterly' }, pays: [['2026-08-14', 10], ['2026-11-13', 10]], expect: [['quarterly', 10, '2026-11-02'], ['quarterly', 10, '2027-02-01']] },
  { name: 'partial-weekly: the printed periods (Wed Jan 7 - Fri Jan 9 due Jan 14; Sat Jan 10 - Tue Jan 13 due Jan 16)', state: 'OH', opts: { assignedFrequency: 'partial_weekly' }, pays: [['2026-01-07', 100], ['2026-01-09', 50], ['2026-01-12', 25]], expect: [['weekly', 150, '2026-01-14'], ['weekly', 25, '2026-01-16']] },
  { name: 'partial-weekly: the printed holiday shift (Sat Jun 13 - Tue Jun 16 is due Mon Jun 22, not Fri Jun 19, because Jun 19 is a holiday)', state: 'OH', opts: { assignedFrequency: 'partial_weekly' }, pays: [['2026-06-15', 100]], expect: [['weekly', 100, '2026-06-22']] },
  { name: 'partial-weekly: the year-end period Dec 30-31 is due January 6, 2027', state: 'OH', opts: { assignedFrequency: 'partial_weekly' }, pays: [['2026-12-31', 100]], expect: [['weekly', 100, '2027-01-06']] },
);

// Hawaii (Booklet A, Rev. 2025)
ROWS.push(
  { name: 'annual liability: $5,000 or less quarterly (15th after the quarter); above it monthly (15th)', state: 'HI', opts: { lookbackLiability: 5000 }, pays: [['2025-02-13', 10]], expect: [['quarterly', 10, '2025-04-15']] },
  { name: 'monthly: the 15th of the following month', state: 'HI', opts: { lookbackLiability: 5000.01 }, pays: [['2025-08-08', 10]], expect: [['monthly', 10, '2025-09-15']] },
  { name: 'semiweekly: Wednesday to Friday paydays due the following Wednesday, Saturday to Tuesday the Friday after', state: 'HI', opts: { assignedFrequency: 'semiweekly' }, pays: [['2025-08-06', 100], ['2025-08-09', 40]], expect: [['semiweekly', 100, '2025-08-13'], ['semiweekly', 40, '2025-08-15']] },
);

// Arkansas (DFA Withholding Tax Employer's Instructions, 07/01/2024)
ROWS.push(
  { name: 'monthly: received on or before the 15th of the following month', state: 'AR', opts: { assignedFrequency: 'monthly' }, pays: [['2024-08-09', 100], ['2024-08-30', 60]], expect: [['monthly', 160, '2024-09-16']] }, // Sep 15, 2024 is a Sunday
  { name: 'annual: received by January 31 of the following year', state: 'AR', opts: { assignedFrequency: 'annual' }, pays: [['2024-03-15', 40]], expect: [['annual', 40, '2025-01-31']] },
);

// Kentucky (42A003, Revised October 2025): the printed tables
ROWS.push(
  { name: 'annual under $400; quarterly $400-$1,999; monthly $2,000-$49,999; twice-monthly $50,000 or more', state: 'KY', opts: { lookbackLiability: 399.99 }, pays: [['2026-03-13', 40]], expect: [['annual', 40, '2027-02-01']] },
  { name: 'quarterly: April 30, July 31, October 31 (K-1) and January 31 (K-3)', state: 'KY', opts: { assignedFrequency: 'quarterly' }, pays: [['2026-02-13', 10], ['2026-05-15', 10], ['2026-08-14', 10], ['2026-11-13', 10]], expect: [['quarterly', 10, '2026-04-30'], ['quarterly', 10, '2026-07-31'], ['quarterly', 10, '2026-11-02'], ['quarterly', 10, '2027-02-01']] },
  { name: 'monthly: the 15th for the first eleven months, December by January 31', state: 'KY', opts: { assignedFrequency: 'monthly' }, pays: [['2026-09-11', 10], ['2026-12-11', 10]], expect: [['monthly', 10, '2026-10-15'], ['monthly', 10, '2027-02-01']] },
  { name: 'twice-monthly: all of January is one period due February 10; 1st-15th due the 25th; 16th-end due the 10th', state: 'KY', opts: { assignedFrequency: 'twice_monthly' }, pays: [['2026-01-09', 10], ['2026-01-23', 20], ['2026-03-06', 5], ['2026-03-20', 7]], expect: [['sub_monthly', 30, '2026-02-10'], ['sub_monthly', 5, '2026-03-25'], ['sub_monthly', 7, '2026-04-10']] },
  { name: 'twice-monthly: December 1-15 is due December 26, December 16-31 is due January 31; a printed Saturday date rolls to Monday', state: 'KY', opts: { assignedFrequency: 'twice_monthly' }, pays: [['2026-04-08', 10], ['2026-12-10', 10], ['2026-12-22', 10]], expect: [['sub_monthly', 10, '2026-04-27'], ['sub_monthly', 10, '2026-12-28'], ['sub_monthly', 10, '2027-02-01']] },
);

// District of Columbia (2025 FR-900Q instructions)
ROWS.push(
  { name: 'monthly deposits: the 20th of the following month', state: 'DC', opts: { assignedFrequency: 'monthly' }, pays: [['2025-08-08', 100], ['2025-08-29', 50]], expect: [['monthly', 150, '2025-09-22']] }, // Sep 20, 2025 is a Saturday
  { name: 'quarterly deposits: the 20th of the month after the quarter', state: 'DC', opts: { assignedFrequency: 'quarterly' }, pays: [['2025-02-14', 10], ['2025-05-16', 10], ['2025-08-15', 10], ['2025-11-14', 10]], expect: [['quarterly', 10, '2025-04-21'], ['quarterly', 10, '2025-07-21'], ['quarterly', 10, '2025-10-20'], ['quarterly', 10, '2026-01-20']] },
);

// Indiana (DOR Business FAQ): 30 / 20 calendar days after the end of the month, as read literally
ROWS.push(
  { name: 'monthly: 30 days after month end (Jan wages -> Mar 2, 2026)', state: 'IN', opts: { assignedFrequency: 'monthly' }, pays: [['2026-01-14', 100], ['2026-01-28', 50]], expect: [['monthly', 150, '2026-03-02']] },
  { name: 'early filer: 20 days after month end (Jan wages -> Feb 20, 2026)', state: 'IN', opts: { assignedFrequency: 'early_filer' }, pays: [['2026-01-14', 100]], expect: [['monthly', 100, '2026-02-20']] },
  { name: 'look-back: more than $1,000 a month is an early filer', state: 'IN', opts: { lookbackLiability: 1000.01 }, pays: [['2026-04-10', 100]], expect: [['monthly', 100, '2026-05-20']] },
);
