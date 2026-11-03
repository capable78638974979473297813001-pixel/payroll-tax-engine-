# State filing: supported exports and remaining work

This PR generates agency-layout upload files as well as reconciliation worksheets.
It is **not a complete nationwide filing service**. Agency acceptance testing,
automatic transmission and tax payments have not been completed.

| State/form | Implemented | Not implemented |
| --- | --- | --- |
| Michigan UI wage report | 2026 MiUI v3 RE/RW CSV; originals and adjustment reasons 1–9; units; monthly employment flags | No-employment format, out-of-state credits, obligation-tax records, withholding returns, payments |
| California DE 9C | Original employee-detail CSV for e-Services direct-entry import | Complete bulk return, monthly counts, DE 9, amendments, no-payroll returns, payments |
| Other 48 states and DC | Reconciliation worksheets | Agency formats and transmission |

Only 2026 formats are enabled. Unknown fields and unsupported states/forms are
rejected, with no generic CSV fallback. No reconciliation worksheet is a return.

## Prepare a filing packet

Use Node 22.18+ or Node 24. Supply JSON matching CaDe9cInput or MiWageInput in
payroll/stateFilingExports.ts, then run:

```sh
npm run state:filing -- prepare input.json new-packet-directory
```

The parent directory must exist; the output directory must not exist. The command
writes a CSV, manifest.json with totals/checksum, and instructions.txt with the
portal workflow. It does not upload anything or require agency credentials.

Inputs use integer cents, nine-digit SSNs without punctuation, string account
numbers preserving leading zeros, and wageBasis: "agency_reportable". Michigan
requires a seven-digit UI account and three-digit units; California requires an
eight-digit payroll account. Never substitute capped UI taxable wages for
subject/gross wages. Supply reviewed quarter-level records from the payroll ledger:
the existing PayRun tax bases cannot reconstruct the missing wage details.

Names are not truncated or silently normalized. Michigan accepts a conservative
delimiter-safe subset of address/name characters; use the portal for unsupported
punctuation rather than removing it from legal names. Michigan adjustment rows
contain corrected reported amounts, not negative deltas. California wage plan
eligibility must be reviewed against the employer account under Appendix G.

Input/output contains full SSNs and wages. This is a local operator tool, not a
hosted multi-tenant backend. Files request owner-only POSIX permissions; Windows
deployments must apply appropriate directory ACLs. Files are not encrypted. Do not
commit real payroll payloads or generated packets.

## Upload and record the result

Follow instructions.txt in the agency portal with employer or authorized TPA access.
California CSV imports employee detail only: select the account/quarter and complete
the remaining DE 9C fields. Do not use the CSV as a bulk-return upload.

After submitting, save agency confirmation evidence and create receipt JSON:

```json
{
  "status": "submitted",
  "confirmationId": "agency-confirmation-id",
  "recordedBy": "operator-id",
  "occurredAt": "2026-10-25T15:00:00.000Z"
}
```

Use the actual timestamp and confirmation identifier:

```sh
npm run state:filing -- receipt new-packet-directory receipt.json agency-confirmation.pdf
```

Record accepted, rejected or partially_accepted only with the actual agency result.
Each event stores evidence separately. Partial acceptance remains unresolved.
The original manifest stays prepared; later history records the processing state.
Submission must precede a result. Accepted/rejected packets are terminal; corrections
require a new packet. Acceptance does not imply payment.

Receipts identify themselves as operator-recorded evidence, not authenticated
agency callbacks. A per-packet exclusive lock protects writes; hashes check the CSV
and previous evidence. These are accidental-change checks, not signed proof against
someone with write access. A crash can leave .receipt-lock: confirm no writer is
active before removing it. This is not a cross-machine queue and does not prevent
duplicate returns prepared in different directories. Check agency history before
uploading again. No automatic retries transmit files.

## Official specifications

Reviewed November 2, 2026:

- [MiUI delimited v3, April 8, 2026](https://www.michigan.gov/leo/-/media/Project/Websites/leo/Documents/UIA/Publications/MiUI-University/Delimited_File_Format_Employer_Reference_Document.pdf): RE/RW layout, implied cents, account length, adjustment reasons, and eleven spaces for absent out-of-state wages in its revision log.
- [Michigan validator guidance](https://www.michigan.gov/leo/bureaus-agencies/uia/miui-university/miui-resources-for-employers-and-tpas/quarterly-wage-report-testing): synthetic data only in the public validator; old MiWAM format not accepted.
- [California DE 8300 revision 12](https://edd.ca.gov/siteassets/files/pdf_pub_ctr/de8300.pdf): Appendix A CSV and Appendix G wage plan codes.

No successful agency validator result or production acceptance is claimed. No agency
accounts or taxpayer authorizations were supplied. No real return/payment was sent.

## Validation and remaining integration

```sh
node --test tests/payroll-state-filings.test.ts tests/payroll-state-filing-exports.test.ts
```

20 tests passed on Node 24: exact file rows, cents, duplicates, unsupported fields
and states, packet files, receipt transitions, corruption checks and CLI behavior.
TEMP/TMP pointed to the writable workspace because this Windows sandbox's default
virtual temporary directory denied file renames. Both test files are in npm test.
The full repository suite was not run: cloning was blocked by DNS; required branch
files were fetched through GitHub.

Remaining: other state/form formats; complete return packages; historical reportable
wage and identity snapshots; zero/amended/final workflows; assigned deposit schedules
and remittances; authenticated transmission/acknowledgement adapters; encrypted
tenant storage, access controls and durable submission idempotency; agency validation
and enrollment. buildStateFilingWorksheets remains reconciliation-only and cannot
be submitted through the export command.
