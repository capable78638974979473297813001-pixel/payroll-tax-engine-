# Omnia Restaurant

A dedicated restaurant application built on the existing payroll engine. `npm run ui:payroll` (or `npm run restaurant`) opens the app at http://127.0.0.1:4324. The previous module demo remains available with `npm run ui:payroll:legacy`.

## Flow

Public landing page → create account / sign in → restaurant setup → add people → hours and tips → calculated review → record payroll → downloadable payroll register. The dashboard shows actual workspace data; the public landing illustration is labeled as an illustration. Drafts save to the server. Nothing seeds or modifies an existing employer automatically.

Each account owns a separate restaurant. Passwords are salted with scrypt; random session tokens are stored as SHA-256 digests and sent in HttpOnly, SameSite=Strict cookies. Sessions expire in eight hours. Mutations require a matching origin and session-bound CSRF token. Authentication is rate limited. Account IDs are written to the payroll audit trail. Email verification, invitation/role management, MFA and recovery email are not implemented.

## Data and running the server

Requires Node 24 (or Node 22 with TypeScript stripping and import.meta.dirname support). No dependencies or build step.

- `PAYROLL_DB_DIR`: payroll store directory. Default: payroll/.data.
- `RESTAURANT_AUTH_DIR`: private account/session/draft directory. Default: restaurant/.data.
- `PORT`: default 4324.
- `RESTAURANT_ORIGIN`: exact external origin, e.g. https://payroll.example.com. This enforces the host/origin allowlist and enables Secure cookies.
- `RESTAURANT_HOST`: default 127.0.0.1. Use 0.0.0.0 behind your HTTPS proxy.

A separate Dockerfile is provided: `docker build -f restaurant/Dockerfile -t omnia-restaurant .`. Mount a persistent volume at /var/data, set RESTAURANT_ORIGIN to the HTTPS application origin and terminate TLS at the proxy. Run exactly one server process: the reference file-backed store is not a multi-instance transactional database. Use restricted file permissions and encrypted persistent storage. This does not replace the existing tax-API/site deployment.

## POS imports

Square and Toast adapters are read-only and use server environment credentials. Assign these credentials to exactly one restaurant by setting `RESTAURANT_POS_COMPANY_ID` to its company ID. This prevents other accounts from querying a shared merchant token.

Square: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`; `SQUARE_ENVIRONMENT=production` for live access (default sandbox). Toast: `TOAST_CLIENT_ID`, `TOAST_CLIENT_SECRET`, `TOAST_RESTAURANT_GUID`; optional `TOAST_API_HOST`. Access depends on each provider's permissions and approval. No SaaS OAuth marketplace installation is implemented.

The import flow requires employee matching. Open shifts and mismatched rates are rejected. POS tips never silently become payroll earnings. Square hours require weekly overtime reconciliation. The displayed UTC import boundaries require manager confirmation against the local pay period. Other POS/time systems use the six-column CSV template. CSV imports validate all rows before applying any updates. Register exports escape spreadsheet formulas.

## Current calculation boundary

The current release records payroll; it does not move money or file taxes. Approval explicitly acknowledges this and saved history displays unpaid/unfiled status. Recorded periods cannot overlap; stale reviews and repeated approval are rejected. New employee setup supports hourly employees with a basic W-4, no deductions or garnishments, and no opening YTD; the form requires explicit confirmation of these conditions. Employer EIN is required before calculation.

Tips and service charges are captured in drafts and review, but approval is blocked when any are present. The general tax engine does not yet model monthly tip thresholds, already-paid tip offsets, insufficient-cash withholding, tip-specific wage reporting, or service-charge regular-rate adjustments. This is not a full tipped-payroll or full-service payroll launch. Complete these features and durable transactional storage before serving real restaurant payroll.

## Validation

`npm run test:restaurant` exercises real HTTP signup/login/logout, origin and CSRF enforcement, workspace/draft isolation, missing-EIN gating, POS credential isolation, gross-to-net review, recorded payroll, duplicate/overlapping approval and tip blocking. POS fixtures verify break deductions and tip normalization. No live Square/Toast credentials are required for fixture tests.
