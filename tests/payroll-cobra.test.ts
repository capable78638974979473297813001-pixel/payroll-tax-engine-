import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dollars } from '../src/money.ts';
import {
  COBRA_SMALL_EMPLOYER_THRESHOLD,
  continuationCoverageEndDate,
  electionDeadline,
  electionNoticeDeadline,
  initialPremiumDeadline,
  isCobraApplicable,
  isQualifyingTermination,
  maximumMonthlyPremium,
  qualifyingEventDurationMonths,
} from '../payroll/cobra.ts';

describe('COBRA employer applicability (payroll/cobra.ts)', () => {
  test('an employer at or above the 20-employee threshold is subject to COBRA', () => {
    assert.equal(isCobraApplicable(COBRA_SMALL_EMPLOYER_THRESHOLD), true);
    assert.equal(isCobraApplicable(50), true);
  });

  test('an employer below the threshold is exempt entirely', () => {
    assert.equal(isCobraApplicable(COBRA_SMALL_EMPLOYER_THRESHOLD - 1), false);
    assert.equal(isCobraApplicable(1), false);
  });
});

describe('qualifying event duration (payroll/cobra.ts)', () => {
  test('termination and reduced hours are 18-month qualifying events', () => {
    assert.equal(qualifyingEventDurationMonths('termination'), 18);
    assert.equal(qualifyingEventDurationMonths('reduced_hours'), 18);
  });

  test('divorce, Medicare entitlement, a dependent aging out, and death are all 36-month qualifying events', () => {
    assert.equal(qualifyingEventDurationMonths('divorce_or_legal_separation'), 36);
    assert.equal(qualifyingEventDurationMonths('employee_medicare_entitlement'), 36);
    assert.equal(qualifyingEventDurationMonths('dependent_aging_out'), 36);
    assert.equal(qualifyingEventDurationMonths('employee_death'), 36);
  });
});

describe('gross misconduct is not a qualifying event at all (payroll/cobra.ts)', () => {
  test('every ordinary termination reason qualifies except gross misconduct', () => {
    assert.equal(isQualifyingTermination('involuntary'), true);
    assert.equal(isQualifyingTermination('layoff'), true);
    assert.equal(isQualifyingTermination('voluntary_with_notice'), true);
    assert.equal(isQualifyingTermination('voluntary_without_notice'), true);
    assert.equal(isQualifyingTermination('gross_misconduct'), false);
  });
});

describe('COBRA deadlines (payroll/cobra.ts)', () => {
  test('the election notice is due 44 days after the qualifying event', () => {
    assert.equal(electionNoticeDeadline('2026-06-10'), '2026-07-24');
  });

  test('the election period is 60 days from the LATER of coverage loss or notice provided', () => {
    // Notice provided same day as coverage loss -> 60 days from that day.
    assert.equal(electionDeadline('2026-06-10', '2026-06-10'), '2026-08-09');
    // Notice provided LATER than coverage loss -> 60 days from the notice date, not the loss date.
    assert.equal(electionDeadline('2026-06-10', '2026-07-01'), '2026-08-30');
  });

  test('the first premium payment is due 45 days after the election date', () => {
    assert.equal(initialPremiumDeadline('2026-08-09'), '2026-09-23');
  });

  test('continuation coverage ends duration-months after the qualifying event', () => {
    assert.equal(continuationCoverageEndDate('2026-06-10', 'termination'), '2027-12-10'); // 18 months
    assert.equal(continuationCoverageEndDate('2026-06-10', 'employee_death'), '2029-06-10'); // 36 months
  });
});

describe('COBRA premium cap (payroll/cobra.ts)', () => {
  test('the maximum premium is 102% of the plan\'s own full cost of coverage', () => {
    assert.equal(maximumMonthlyPremium(dollars(500)), dollars(510));
  });
});
