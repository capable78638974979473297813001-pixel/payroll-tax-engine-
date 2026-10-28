# West Virginia municipal payroll fees — review dated October 26, 2026

These fees are needed: covered employers withhold municipal employee service/user fees from workers whose duty station is within city limits. They are distinct from business and occupation gross-receipts taxes, property charges, fire/refuse fees and municipal sales taxes. WV Code 8-13-13 permits service fees; that authority alone does not prove a particular city adopted an employee fee.

## Changes in this PR

| Item | Correction and evidence |
| --- | --- |
| Rivesville | Add $2/week, nonresident workers only, across 2025–2027. Vertex August 2024 and Sage 2020 corroborate the rate; MPAY September 2024 identifies it as “Non Res”. This is secondary-source coverage: a current town ordinance/return has not been obtained. 2027 is a carry-forward. |
| Weirton | The city's administrative regulations specify $2/week through May 16, 2026 and $5 starting May 17, not the inferred May 14 date previously used. They also require 30 days worked during the calendar year. The published $10 biweekly, $10.83 semimonthly and $21.66 monthly figures match the existing conversion. |
| Montgomery | The city's current remittance form explicitly exempts resident employees; set the nonresident-only flag. It publishes $2 weekly and $4 biweekly. |
| Wheeling | Article 797.03 uses 30 days during the calendar year, not consecutive days. Correct the misleading notes; retain the cumulative input. |
| Geocoding | Replace the obsolete six-city hardcoded list with each year's configured cities. Copy the resolved residence city into the certificate so resident exemptions can actually apply; guard against same-named cities in other states. Preserve Chester, already added on main. |
| Coverage | Keep WV partial and explicitly identify the unresolved cities/source limitations. |

Primary sources read for these corrections:

- [Weirton administrative regulations](https://www.cityofweirton.com/DocumentCenter/View/68/Municipal-Service-Fee-Administrative-Regulations-PDF)
- [Montgomery remittance form](https://montgomery.wv.gov/media/19506/download?inline=), linked from [city forms](https://montgomery.wv.gov/forms-and-permits)
- [Wheeling Article 797](https://www.wheelingwv.gov/media/Finance/City%20Service%20Fee/City%20Service%20Fee-%20Ordinance%20Final.pdf)

Rivesville sources:

- [Vertex August 2024 payroll guide](https://help.insperity.com/hcm/wp-content/uploads/sites/2/2024/09/Vertex-August-2024.pdf)
- [MPAY 202409-1 release notes](https://webhelp.mpay.com/content/Release%20Notes/Release%20Notes%202024/TaxReleaseNotes/TaxReleasePages/Tax%20Release%20Notes%20202409-1.htm)
- [Sage 100 2020 payroll guide](https://www.acutedata.com/pdf/sage-100/Sage-100-2020-Payroll-Tax-Update-Guide.pdf)

## Unresolved findings — do not call WV complete

**Smithers is a real missing employee-fee jurisdiction, but its rate is not settled by this research.** Fayette County's 2022 commission minutes discuss the fee on nonresident workers. Isolved March 2023 and Vertex August 2024 publish $0.50/week; Sage HRMS Q2 2023 publishes $52/year, which is inconsistent with that figure. Smithers spans Fayette and Kanawha counties: payroll listings for both counties do not mean two fees. No current city ordinance or remittance form was obtained. Do not create a rate from the 2019 comprehensive plan's proposed ceiling. Smithers stays unconfigured; the engine's absence of a fee line there is not evidence that nothing is owed. Obtain a current city return/ordinance and confirm frequency, exemptions and start date before enabling it.

- [Fayette County 2022 minutes](https://fayettecounty.wv.gov/commission/SiteAssets/Pages/Minutes%20and%20Previous%20Agendas/All%20Minutes%202022.pdf)
- [Isolved March 2023 release](https://help.insperity.com/hcm/wp-content/uploads/sites/2/2023/03/isolved-Product-Release-v9.05-1.pdf)
- [Conflicting Sage HRMS Q2 2023 release](https://docs.sage.com/docs/en/customer/hrms/current/open/SageHRMS_US_PU_Q22023_RN.pdf)

**Madison's configured $3/week is not verified and appears wrong.** The old 2017 ordinance scheduled an increase to $3 in 2020, but Bloomberg Tax reported January 9, 2020 that council cancelled it on January 6. Later payroll guides publish $1.25/week; PayrollOrg's October 2023 guide also publishes $5/month and $60/year, which do not match a 52-week conversion. The city document index lists a newer service-fee worksheet, but access attempts failed. This PR flags the conflict instead of silently replacing one unsupported schedule with another. The existing Madison calculation is retained and must be treated as unresolved before production use.

- [Old Madison ordinance](https://madisonwv.org/wp-content/uploads/2017/07/City-Service-Ordinance.pdf)
- [Cancellation report](https://news.bloombergtax.com/payroll/west-virginia-city-cancels-increase-for-service-fee)
- [PayrollOrg October 2023 guide](https://files.onlinexperiences.com/FileLibrary/2207/31/100523_LITC_Seg_4.pdf)
- [Current city document index](https://madisonwv.org/documents/)

## Coverage and operating limits

The configured cities are Charleston, Chester, Fairmont, Glen Dale, Huntington, Madison, Montgomery, Morgantown, Parkersburg, Rivesville, Romney, Weirton and Wheeling. With Smithers, evidence identifies at least 14 employee-fee cities, not a certified exhaustive statewide count. This review does not independently certify every retained city's rate or every municipality's absence of a fee. Older narrative canvass logs in the data are historical and do not establish completeness.

Nonweekly conversion remains `weeklyRate * 52 / periods`, rounded down, and needs city-specific verification beyond the schedules identified above. Missing `daysWorkedInLocality` assumes eligibility; the caller must provide calendar-year days and cross-employer withholding information. An address cannot establish these facts. Incorporated-place matching still depends on correct upstream geography; this PR does not certify boundary accuracy or address coverage.

County service-fee enabling legislation (WV Code 7-20-12) requires local adoption/voter approval; no adopted county employee fee was confirmed. Pension occupational-tax authority (8-13C) likewise does not justify inventing an active tax. Property charges, separate Glen Dale Article 751 charges, and a shelved Nutter Fort proposal are not added as employee deductions. No official statewide payroll-fee register was obtained, and no claim that one cannot exist is made.

## Additional verified payroll-cycle amounts

Fairmont administrative regulations section 1.2 and Wheeling employer worksheet CSF-3 each specify $8.67 for a monthly payroll. The annualized calculation rounded down to $8.66, so the city-published amount now takes precedence. Both specify $4.33 semimonthly and $4.00 biweekly. See the [Fairmont regulations](https://fairmontwv.gov/DocumentCenter/View/2198) and [Wheeling worksheet](https://www.wheelingwv.gov/media/Finance/City%20Service%20Fee/City%20Service%20Fee%20-%20Employer%20Worksheet%20Form%20CSF-3.pdf). City-published 2027 amounts remain unverified carry-forwards.

The 2023 PayrollOrg guide lists Montgomery as $4.34 semimonthly / $8.67 monthly, and these conflict with the current rounded-down calculation and require a current city document before changing those outputs. It also identifies other exemptions and schedule details that are not yet fully modeled.

The [WV Secretary of State city charter index](https://sos.wv.gov/city-charters-index) began receiving city charters, amendments and ordinances under HB 5622 effective June 10, 2026; it explicitly disclaims completeness and timeliness and directs users to the cities for current information. It is a useful records lead, not a complete payroll-fee registry.

The [published Romney ordinance](https://wvlegals.com/ordinance-of-the-city-of-romney/) allows workers under 20 hours per week to seek an exemption by written application; this is not an automatic exemption and the current certificate does not model approval. Weirton and Wheeling documents say the employee must work at least 30 days per calendar year; whether withholding begins only after the 30th day or starts earlier when that duration is expected requires city clarification. The current implementation uses days worked so far.

The city worksheets for [Parkersburg](https://cms2.revize.com/revize/parkersburg/Document%20Center/Department/Finance/Frequently%20Requested%20Forms/CSUF-EMPLOYER-WORKSHEET.pdf) and [Romney](https://www.townofromney.com/sites/default/files/2022-10/annual-service-fee-remittance-form-2.pdf) specify $5.42 and $2.17 for semimonthly pay, respectively. Both replace a rounded-down amount one cent lower. Romney specifies $4.33 for monthly pay and Parkersburg $10.83; the existing monthly amounts already match. The Romney form states a 20-hour weekly condition while its ordinance describes an application for exemption below 20 hours: the distinction and approval process need clarification.

## Follow-up, October 28, 2026

Smithers, Madison and Rivesville were searched again. None is settled.

- **Madison.** The city's code on Municode, codified through the ordinance of September 13, 2021, still reads $3.00 per calendar week from January 1, 2020 (Sec. 8-4, source ordinance of 7-18-2016(3)). That is the published law and agrees with the configured $3. It conflicts with Bloomberg Tax (January 9, 2020, behind a login) reporting that council cancelled the increase, and with payroll guides that still print $1.25. A cancelling ordinance has not been found, and Municode warns its text may lag current legislation. The configured $3 now has a primary source behind it, but the contradiction is open, so Madison stays flagged.
- **Smithers.** The city's official page (local.wv.gov/smithers) carries no fee, ordinance or form, and the city's own domain returns a placeholder. No current ordinance or return was found. Smithers stays unconfigured.
- **Rivesville.** No town ordinance or remittance form is reachable online. The $2 per week, nonresident-only fee stays on payroll-vendor sources.

WV remains partial.
