# State filing implementation status

This change is a reconciliation foundation, not a completed state filing product.
No state can be submitted through this module. Do not use its output as an agency upload.
Coverage of state codes does not mean coverage of state forms.

## Available

Import buildStateFilingWorksheets from payroll/stateFilings.ts (also exported by payroll/index.ts).
Pass a company, year, quarter, approved run history, and optional state codes to review.
The function groups stored state tax lines for all 50 states and DC, by employee,
tax identifier and payer. It filters by employer and check date, rejects duplicate
run snapshots and invalid money, and retains contributing run IDs. Draft and voided
runs are excluded. Registered and explicitly requested states remain visible even
without tax activity.

Amounts are integer cents. Each tax retains its own taxable wage base. Do not add
those bases together to obtain reportable wages. This is a current-history
reconciliation, not an amendment to a previously accepted filing.
Negative adjustments are rejected; an amendment ledger is not implemented.

## Required before real use

- Capture historical state UI subject wages before annual caps, exempt wages,
  state allocations, required hours/weeks and monthly employment counts. A saved
  capped taxable base cannot recover these fields.
- Preserve employer/employee identity snapshots and required agency fields.
  Current employee profiles cannot reconstruct historical filing facts.
- Implement each agency/form/version format using current official specifications,
  including original, amended, annual, zero-wage and final returns where required.
- Track each employer's actual filing obligations and assigned deposit schedules;
  tax-line presence or absence is not an obligation determination.
- Add authorized production transmission or portal-upload workflows, encrypted
  artifacts and credential storage, durable idempotency, access controls,
  acknowledgement handling and accepted-return history.
- Reconcile state deposits/payments separately from return acceptance.
- Validate synthetic files against agency validators and complete required
  transmitter enrollment/testing before enabling a production adapter.

No API/UI submission route, state-specific serializer, payment instruction or
production adapter is supplied in this PR. All worksheets have canSubmit=false.
Registration records do not remove the format/acceptance/data blockers.

## Official references reviewed November 2, 2026

Michigan's current guidance requires MiUI formats and says the old MiWAM format
is no longer accepted. The public validator must only receive synthetic data:
https://www.michigan.gov/leo/bureaus-agencies/uia/miui-university/miui-resources-for-employers-and-tpas/quarterly-wage-report-testing

California documents FSET transmission, required wage plan codes, acknowledgements,
and a separate amendment process:
https://edd.ca.gov/en/payroll_taxes/FSET/

These references illustrate separate agency requirements. They do not constitute
verification of the other states' specifications.

## Validation

Run node --test tests/payroll-state-filings.test.ts, then npm test.
The test is included in npm test. Local execution was unavailable during authoring;
no successful test run or agency acceptance is claimed.
