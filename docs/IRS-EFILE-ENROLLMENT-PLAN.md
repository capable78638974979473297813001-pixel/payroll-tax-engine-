# IRS e-file enrollment plan for a full payroll product

You are building payroll software that files federal employment tax returns **for other employers**.
That is a different, bigger enrollment than filing your own return. Everything below is from the
IRS's own publications, read in full on 2026-11-03:

- [Publication 3112](https://www.irs.gov/pub/irs-pdf/p3112.pdf), IRS e-file Application & Participation (Rev. 11-2025)
- [Publication 4164](https://www.irs.gov/pub/irs-pdf/p4164.pdf), MeF Guide for Software Developers and Transmitters (Rev. 12-2025)
- [Publication 4163](https://www.irs.gov/pub/irs-pdf/p4163.pdf), MeF Information for Authorized IRS e-file Providers for Business Returns (Rev. 12-2025)
- [Publication 1474](https://www.irs.gov/pub/irs-pdf/p1474.pdf), Reporting Agent Authorization and Federal Tax Depositors (Rev. 4-2026)
- [IRS: Become an authorized e-file provider](https://www.irs.gov/e-file-providers/become-an-authorized-e-file-provider) (reviewed 2026-03-05)

Where something is not in those documents it is marked **unverified**. Nothing here is legal advice.

## 1. Which provider options you need

| Option | Why a payroll product needs it |
| --- | --- |
| **Software Developer** | Formats returns to IRS e-file specifications. Gets the 94x schemas and business rules in its e-Services mailbox. Must pass acceptance or assurance testing for each return type before acceptance. |
| **Transmitter** | Sends returns directly to the IRS and retrieves the acknowledgements. Must have the "Transmitter" option, an EFIN and an ETIN, and complete communications testing before transmitting. (You could contract a third-party transmitter instead; you would still be a Software Developer.) |
| **Reporting Agent** | "Companies (not individuals) that perform payroll services for other businesses." Authorized by each client to prepare, sign and file employment tax returns electronically. Requires **Form 8655 on file** for the EIN on the application; the system validates it. |

An Electronic Return Originator is for preparers filing for clients and is not the payroll-service role.
You may choose several options on one application ("only choose the options your business intends to use").
The IRS assigns an **EFIN to every provider and an ETIN to Transmitters and Software Developers**. They
cannot be shared, rented, sold or transferred; a reseller of your software must obtain their own EFIN.

## 2. The enrollment, in order

1. **People first.** Decide who the **Principal(s)** and **Responsible Official(s)** are. They are personally
   vetted. Each creates an IRS e-Services account (Secure Access registration).
2. **Submit the e-file application** in e-Services > e-file provider services: firm identification; for each
   Principal and Responsible Official, name, SSN, date of birth, email and citizenship status; choose the
   provider options above; each person acknowledges the Terms of Agreement with a PIN under penalty of
   perjury. Keep the tracking number.
3. **Fingerprints.** Any Principal or Responsible Official who is not an attorney, CPA, enrolled agent,
   officer of a publicly traded corporation or bonded bank official is fingerprinted through the IRS's Livescan
   vendor (scheduling link on the application summary page, appointment within 120 miles).
4. **Form 8655 for the Reporting Agent option**, and thereafter one per client (section 5).
5. **Suitability check.** The IRS may run a credit check, a tax compliance check, a criminal background check
   and a check for prior e-file non-compliance. The IRS says approval **can take up to 45 days from
   submission**. It gives no other timeline; Software Developers and Transmitters "must complete testing before
   acceptance", so plan beyond 45 days and do not assume a date.
6. **Testing** (section 4), then **acceptance letter with your EFIN**, and your ETIN.
7. **After acceptance:** the year's 94x schema and business-rules package arrives through your e-Services
   mailbox (Secure Object Repository), as the IRS 94x release memo states. Only then can the XML mapping be
   written and checked.

Contact for application problems: IRS e-help Desk 866-255-0654.

## 3. Two ways to transmit; choose deliberately

| | **A2A** (application-to-application web services) | **IFA** (Internet Filing Application) |
| --- | --- | --- |
| What it is | Your system calls IRS MeF web services directly, with certificates. The route for a product. | A browser upload of a transmission file by individuals you delegate, using IRS e-Services. |
| Enrollment | Delegate one or more people as **MeF System Enroller** on the e-file application; each creates an **ID.me** account; they use the **Automated Enrollment (AE)** application to enroll each application system and get an **Application System ID (ASID)** and to replace certificates. | Delegate the individuals who may transmit through the Internet; tick the 94x box (Form type) on the application. |
| Credentials | **X.509 certificates for Strong Authentication**, purchased from sources listed on the MeF User Guides page; the signing key in a standard **encrypted key store**, never unencrypted. The IRS provides signing libraries in the *IRS A2A Strong Authentication User Guide*, which registered developers request from the MeF mailbox. | Individual e-Services logins. |
| Fits | Production at volume, automatic acknowledgements. | Early production, testing, low volume, a fallback. A human is in the loop on every transmission. |

**Recommendation:** enroll for both. Build the product on A2A; keep IFA as an operational fallback.

## 4. Testing

Software Developers must pass **acceptance or assurance testing** for each return type (the IRS publishes a
tax-year 94x ATS page); Transmitters and Reporting Agents must complete **communications testing** before
transmitting live. You can watch each package's test status, and your Software ID, on the application summary
page. A test harness is something we can build now (section 7); the test *scenarios* come from the IRS.

## 5. Reporting Agent obligations (payroll services)

From Publication 1474:

- Each client gives a **Form 8655** authorizing you to file and sign its employment tax returns and to pay its
  taxes.
- You submit a **Reporting Agent's List** of clients electronically. The only approved transfer method is
  **Secure Large File Transfer Business 2 Business (SLFT B2B)** (Secure Data Transfer was removed). The record
  layouts (Reporting Agent record, Taxpayer record, End-of-file trailer) are public in the publication.
- Section 02 covers authorizations for **Federal Tax Deposits and Federal Tax Payments**, i.e. depositing for clients.
- Corrected employment returns (941-X, 943-X, 945-X) can be filed electronically.

## 6. What transmitting for others obliges you to build (Publication 4164, section 4.1.1)

These are requirements of the A2A channel, not suggestions. The principal is "held responsible for any
violation of security conditions ... regardless of what individual might have been directly responsible":

- **Uniquely identify, authenticate, authorize and track every individual user** of the applications and machines
  that use MeF web services, with automated mechanisms.
- Store credentials and the signing key **encrypted at rest**.
- Comply with U.S. cryptographic standards for transport.
- Sanitize systems and storage that held taxpayer data (the publication gives specific procedures).
- Accept **random, unannounced, onsite IRS inspections** of any facility using A2A.
- Report any unauthorized use or breach immediately to the IRS.

Treat this as a design input now: per-user identity and audit on every filing action (the `FilingBook`
audit trail is the start), a key-management boundary, and no taxpayer data in logs.

## 7. Signing a 94x electronically

Publication 4164 section 8.6: the options for Form 94x and amended 94x are the **Practitioner PIN option**,
the **Self-Select PIN option**, and a **Form 8453 signature document**. The Practitioner PIN uses **Form
8879-EMP** (the taxpayer keeps it; it is not sent to the IRS) and "may only be used by a taxpayer using an
ERO". A Reporting Agent signs under its Form 8655 authority (Publication 3112). **Unverified:** exactly which
signature option a Reporting Agent uses for 94x returns it files for clients, and the required return-header
fields. Resolve this against Publication 4163 and Form 8879-EMP before designing the product's sign-off screen;
the existing `FilingBook.approve()` (a named, titled person) is the internal control, not the IRS signature.

## 8. What we can build before enrollment completes

None of this needs the gated schemas:

1. **Reporting Agent's List generator** (Publication 1474 record layouts are public) and a Form 8655 tracker
   per client (received, on file, submitted, validated).
2. **A2A client skeleton** behind `FilingTransport`: certificate/key-store abstraction, per-user authentication
   and audit, SubmissionID and manifest handling, acknowledgement polling, retry and perfection-period handling,
   all exercised against a fake IRS server.
3. **Test harness** for ATS scenarios once the IRS supplies them.
4. **Name control and identifier validation** (Publication 4164 exhibits 4 and 6 are public), so rejects for bad
   names and EINs are caught before transmission.
5. **A signature workflow** once item 7 above is resolved.

## 9. Also required, outside the IRS

- **SSA.** W-2/W-3 filing is separate. The W-2/W-3 instructions give the SSA Employer Reporting Service Center
  at **800-772-6270**; ask how a payroll vendor submits wage files for many employers. **Unverified.**
- **States.** Each state agency has its own enrollment (`docs/STATE-LAYER-SPEC.md`).
- **Money.** Depositing taxes for clients moves client funds. `docs/PAYMENTS.md` explains that this involves bank
  and licensing relationships; take legal advice before building it. **Unverified here.**
