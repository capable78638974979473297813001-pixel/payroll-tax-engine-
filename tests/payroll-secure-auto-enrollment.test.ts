import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  SECURE_AUTO_ENROLLMENT_ACT_ENACTMENT_DATE,
  SECURE_AUTO_ENROLLMENT_FIRST_MANDATORY_PLAN_YEAR_START,
  SECURE_AUTO_ENROLLMENT_SMALL_EMPLOYER_THRESHOLD,
  SECURE_AUTO_ENROLLMENT_NEW_BUSINESS_MIN_YEARS,
  SECURE_AUTO_ENROLLMENT_MIN_INITIAL_RATE,
  SECURE_AUTO_ENROLLMENT_MAX_INITIAL_RATE,
  SECURE_AUTO_ENROLLMENT_MIN_ESCALATION_CEILING,
  SECURE_AUTO_ENROLLMENT_MAX_RATE,
  SECURE_AUTO_ENROLLMENT_WITHDRAWAL_WINDOW_DAYS,
  isSecureAutoEnrollmentExempt,
  isSecureAutoEnrollmentMandatory,
  isSecureAutoEnrollmentInitialRateValid,
  isSecureAutoEnrollmentCeilingValid,
  secureAutoEnrollmentRateForPlanYear,
  secureAutoEnrollmentWithdrawalDeadline,
  isWithinSecureAutoEnrollmentWithdrawalWindow,
  type SecureAutoEnrollmentExemptionInput,
} from '../payroll/secureAutoEnrollment.ts';

function baseInput(overrides: Partial<SecureAutoEnrollmentExemptionInput> = {}): SecureAutoEnrollmentExemptionInput {
  return {
    planEstablishedDate: '2023-01-01',
    employeeCount: 50,
    yearsInExistence: 10,
    isGovernmentalPlan: false,
    isChurchPlan: false,
    isSimple401kPlan: false,
    ...overrides,
  };
}

describe('SECURE 2.0 auto-enrollment mandate (payroll/secureAutoEnrollment.ts)', () => {
  describe('isSecureAutoEnrollmentExempt', () => {
    test('a plan established before the Act\'s enactment date is grandfathered', () => {
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ planEstablishedDate: '2022-12-28' })), true);
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ planEstablishedDate: SECURE_AUTO_ENROLLMENT_ACT_ENACTMENT_DATE })), false);
    });

    test('an employer with fewer than 10 employees is exempt', () => {
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ employeeCount: SECURE_AUTO_ENROLLMENT_SMALL_EMPLOYER_THRESHOLD - 1 })), true);
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ employeeCount: SECURE_AUTO_ENROLLMENT_SMALL_EMPLOYER_THRESHOLD })), false);
    });

    test('a business in existence fewer than 3 years is exempt', () => {
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ yearsInExistence: SECURE_AUTO_ENROLLMENT_NEW_BUSINESS_MIN_YEARS - 1 })), true);
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ yearsInExistence: SECURE_AUTO_ENROLLMENT_NEW_BUSINESS_MIN_YEARS })), false);
    });

    test('governmental, church, and SIMPLE 401(k) plans are each independently exempt', () => {
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ isGovernmentalPlan: true })), true);
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ isChurchPlan: true })), true);
      assert.equal(isSecureAutoEnrollmentExempt(baseInput({ isSimple401kPlan: true })), true);
    });

    test('a plan with none of the exemptions is not exempt', () => {
      assert.equal(isSecureAutoEnrollmentExempt(baseInput()), false);
    });
  });

  describe('isSecureAutoEnrollmentMandatory', () => {
    test('requires the plan year to begin on or after 2025-01-01, even for a non-exempt plan', () => {
      assert.equal(isSecureAutoEnrollmentMandatory(baseInput(), '2024-12-31'), false);
      assert.equal(isSecureAutoEnrollmentMandatory(baseInput(), SECURE_AUTO_ENROLLMENT_FIRST_MANDATORY_PLAN_YEAR_START), true);
    });

    test('a small startup remains exempt even for a plan year well after the mandate date', () => {
      assert.equal(
        isSecureAutoEnrollmentMandatory(baseInput({ employeeCount: 5, yearsInExistence: 1 }), '2026-01-01'),
        false,
      );
    });
  });

  describe('rate range validation', () => {
    test('initial rate must be within 3%-10%', () => {
      assert.equal(isSecureAutoEnrollmentInitialRateValid(SECURE_AUTO_ENROLLMENT_MIN_INITIAL_RATE - 0.001), false);
      assert.equal(isSecureAutoEnrollmentInitialRateValid(SECURE_AUTO_ENROLLMENT_MIN_INITIAL_RATE), true);
      assert.equal(isSecureAutoEnrollmentInitialRateValid(SECURE_AUTO_ENROLLMENT_MAX_INITIAL_RATE), true);
      assert.equal(isSecureAutoEnrollmentInitialRateValid(SECURE_AUTO_ENROLLMENT_MAX_INITIAL_RATE + 0.001), false);
    });

    test('escalation ceiling must be within 10%-15%', () => {
      assert.equal(isSecureAutoEnrollmentCeilingValid(SECURE_AUTO_ENROLLMENT_MIN_ESCALATION_CEILING - 0.001), false);
      assert.equal(isSecureAutoEnrollmentCeilingValid(SECURE_AUTO_ENROLLMENT_MIN_ESCALATION_CEILING), true);
      assert.equal(isSecureAutoEnrollmentCeilingValid(SECURE_AUTO_ENROLLMENT_MAX_RATE), true);
      assert.equal(isSecureAutoEnrollmentCeilingValid(SECURE_AUTO_ENROLLMENT_MAX_RATE + 0.001), false);
    });
  });

  describe('secureAutoEnrollmentRateForPlanYear', () => {
    test('escalates by 1 percentage point per full plan year, hand-verified year by year', () => {
      const initial = 0.03;
      const ceiling = 0.1;
      assert.equal(secureAutoEnrollmentRateForPlanYear(initial, ceiling, 0), 0.03);
      assert.equal(Math.round(secureAutoEnrollmentRateForPlanYear(initial, ceiling, 1) * 100) / 100, 0.04);
      assert.equal(Math.round(secureAutoEnrollmentRateForPlanYear(initial, ceiling, 3) * 100) / 100, 0.06);
    });

    test('caps at the sponsor\'s own chosen ceiling and never exceeds it', () => {
      assert.equal(secureAutoEnrollmentRateForPlanYear(0.03, 0.1, 7), 0.1);
      assert.equal(secureAutoEnrollmentRateForPlanYear(0.03, 0.1, 20), 0.1);
    });

    test('a negative years-elapsed value does not decrease the rate below the initial', () => {
      assert.equal(secureAutoEnrollmentRateForPlanYear(0.05, 0.15, -3), 0.05);
    });
  });

  describe('withdrawal window', () => {
    test('the deadline is exactly 90 days after the first default contribution', () => {
      assert.equal(secureAutoEnrollmentWithdrawalDeadline('2026-01-01'), '2026-04-01');
    });

    test('isWithinSecureAutoEnrollmentWithdrawalWindow is inclusive of the deadline itself', () => {
      assert.equal(isWithinSecureAutoEnrollmentWithdrawalWindow('2026-01-01', '2026-04-01'), true);
      assert.equal(isWithinSecureAutoEnrollmentWithdrawalWindow('2026-01-01', '2026-04-02'), false);
    });

    test(`the window is exactly ${SECURE_AUTO_ENROLLMENT_WITHDRAWAL_WINDOW_DAYS} days`, () => {
      assert.equal(SECURE_AUTO_ENROLLMENT_WITHDRAWAL_WINDOW_DAYS, 90);
    });
  });
});
