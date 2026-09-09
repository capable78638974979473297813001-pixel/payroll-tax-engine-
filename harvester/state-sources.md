# State-by-state official tax sources

Every source here is the state's (or federal government's) OWN page or state-designated register — never a payroll vendor, aggregator, or news site. Checked 2026-09-03 against the live URLs; each one resolves to a .gov domain or a state-run register explicitly authorized to publish local rates on the state's behalf (tagged below where that applies).

**Cadence:** the 10 jurisdictions below (federal + the 9 named states) get checked every day. Everything else gets checked once a week. This split exists because these 9 states are the ones this project has the deepest, most change-sensitive local-tax modeling for (Ohio's ~600 municipalities + JEDD zones, Pennsylvania's ~2,500 Act 32 jurisdictions, Michigan's 24 cities, Indiana's 92 counties, Alabama's occupational taxes, New Jersey's employer payroll taxes, New York's NYC/Yonkers/MCTMT taxes, Oregon's transit-district taxes, and Colorado's Occupational Privilege Tax cities) — a missed rate change there breaks the most calculations. Federal sources are daily because they feed every single state's own math (FUTA credit, SS/Medicare wage bases, federal brackets).

---

## Check every day

### Federal (US)

- **US DOL — FUTA Credit Reduction States**
  https://oui.doleta.gov/unemploy/futa_credit.asp
  Covers: data/federal/{year}.json#futa.creditReductionStates. Expected to change: annual, finalised each November.

- **US DOL — Significant Measures of State UI Tax Systems (every state's taxable wage base)**
  https://oui.doleta.gov/unemploy/pdf/sigmeasures/sigmeasuitaxsys24.pdf
  Covers: data/states/{STATE}-{year}.json#suiEmployer. Expected to change: annual, published with a lag.

- **IRS Publication 15-T — Federal Income Tax Withholding Methods**
  https://www.irs.gov/pub/irs-pdf/p15t.pdf
  Covers: data/federal/{year}.json#incomeTax. Expected to change: annual, published Nov-Dec; mid-year revisions do happen after major legislation.

- **SSA — OASDI Contribution and Benefit Base**
  https://www.ssa.gov/oact/cola/cbb.html
  Covers: data/federal/{year}.json#socialSecurity.wageBase. Expected to change: annual, announced mid-October with the COLA.
  ⚠ Not machine-fetchable: Confirmed HTTP 403 on every attempt from two real GitHub Actions runs (2026-08-31) and independently from this project's own sandbox, using Node's actual fetch with the full browser header set fetch.ts sends — not the curl-vs-Node client difference this project has seen elsewhere (e.g. Massachusetts, New Hampshire), where Node succeeded and curl alone was refused. This is Akamai/Cloudflare-style refusal of a cloud/datacenter IP range, which no header change fixes. One of the highest-value sources in the registry (the OASDI wage base), so excluded from the staleness test rather than pinning overall health red forever, but check it by hand each October when the COLA lands.

### Ohio (OH)

- **Ohio The Finder — JEDD/JEDZ tax rates (CSV)**
  https://thefinder.tax.ohio.gov/api/file-downloads/content?target=https%3A%2F%2Fapi.thefinder.tax.ohio.gov%2Ffinder%2Fapi%2Fv1%2Ftax-rates%2Fdownloads%2FJEDTaxRates.csv
  Covers: data/local/OH-jedd-jedz-{year}.json. Expected to change: rolling; JEDDs are created by contract between a township and a municipality.

- **Ohio Dept of Taxation — Municipal Income Tax Rate Database (The Finder)**
  https://thefinder.tax.ohio.gov/api/file-downloads/content?target=https%3A%2F%2Fapi.thefinder.tax.ohio.gov%2Ffinder%2Fapi%2Fv1%2Ftax-rates%2Fdownloads%2FMuni%2FOHMuniRateTable.csv
  Covers: data/locals/OH-{year}.json. Expected to change: rolling; municipal rate changes take effect 1 Jan and 1 Jul.

- **Ohio Dept of Taxation — school district income tax rate list (SDIT)**
  https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf
  Covers: data/local/OH-school-districts-{year}.json. Expected to change: annual; districts add, renew and let levies expire each January.

- **Ohio — unemployment insurance employer rates & taxable wage base**
  https://jfs.ohio.gov/unemployment-services/for-employers/file-unemployment-taxes/tax-resources/contribution-rates
  Covers: data/states/OH-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

### Pennsylvania (PA)

- **PA DCED Municipal Statistics — Act 32 EIT rates and PSD codes**
  https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;2026
  Covers: data/locals/PA-{year}.json. Expected to change: rolling; most changes effective 1 Jan.

- **PA DOR — Employer Withholding**
  https://www.revenue.pa.gov/TaxTypes/EmployerWithholding/
  Covers: data/states/PA-{year}.json. Expected to change: rare; the 3.07% rate has been stable for years.

- **Pennsylvania — unemployment insurance employer rates & taxable wage base**
  https://www.pa.gov/agencies/dli/resources/for-employers-and-educators/how-to-file/uc-tax/yearly-tax-highlights
  Covers: data/states/PA-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

### Michigan (MI)

- **Michigan Treasury — cities that impose an income tax**
  https://www.michigan.gov/taxes/questions/iit/accordion/general/what-cities-impose-an-income-tax
  Covers: data/local/MI-cities-{year}.json. Expected to change: rare; Michigan city income taxes require voter approval.

- **Michigan — unemployment insurance taxable wage base**
  https://www.michigan.gov/leo/bureaus-agencies/uia/assets/unemployment-tax-rate
  Covers: data/states/MI-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Michigan — employer withholding tables & instructions**
  https://www.michigan.gov/taxes/-/media/Project/Websites/taxes/Forms/SUW/TY2026/446_Withholding-Guide_2026.pdf
  Covers: data/states/MI-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Indiana (IN)

- **Indiana DOR Departmental Notice #1 — county income tax rates**
  https://www.in.gov/dor/files/dn01.pdf
  Covers: data/local/IN-counties-{year}.json. Expected to change: annual, and Indiana genuinely does issue mid-year county rate changes.

- **Indiana — unemployment insurance employer rates & taxable wage base**
  https://www.in.gov/dwd/indiana-unemployment/employers/employer-guide/rate-computation/
  Covers: data/states/IN-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Indiana — employer withholding tables & instructions**
  https://www.in.gov/dor/files/dn01.pdf
  Covers: data/states/IN-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Alabama (AL)

- **Alabama League of Municipalities — municipal occupational tax rates**
  https://almonline.org/TaxRates.aspx
  Covers: data/local/AL-municipalities-{year}.json. Expected to change: rolling; ALM updates as member cities report.

- **Alabama — unemployment insurance employer rates**
  https://www2.labor.alabama.gov/
  Covers: data/states/AL-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Alabama — employer withholding tables & instructions**
  https://www.revenue.alabama.gov/wp-content/uploads/2026/01/whbooklet_0126.pdf
  Covers: data/states/AL-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### New Jersey (NJ)

- **New Jersey — unemployment insurance taxable wage base**
  https://nj.gov/labor/ea/employer-services/rate-info/
  Covers: data/states/NJ-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **New Jersey — employer withholding tables & instructions**
  https://www.nj.gov/treasury/taxation/pdf/current/njwt.pdf
  Covers: data/states/NJ-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### New York (NY)

- **New York — unemployment insurance employer rates**
  https://dol.ny.gov/unemployment-insurance-rate-information
  Covers: data/states/NY-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **New York — employer withholding tables & instructions**
  https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf
  Covers: data/states/NY-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Oregon (OR)

- **Oregon — unemployment insurance employer rates & taxable wage base**
  https://www.oregon.gov/employ/businesses/pages/current-tax-rate.aspx
  Covers: data/states/OR-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Oregon — employer withholding tables & instructions**
  https://www.oregon.gov/dor/forms/FormsPubs/withholding-tax-formulas_206-436_2026.pdf
  Covers: data/states/OR-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Colorado (CO)

- **Colorado — unemployment insurance employer rates & taxable wage base**
  https://cdle.colorado.gov/employers/unemployment-insurance-premiums/premium-rates
  Covers: data/states/CO-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Colorado — employer withholding tables & instructions**
  https://tax.colorado.gov/sites/tax/files/documents/DR_1098_Colorado_Withholding_Worksheet_for_Employees.pdf
  Covers: data/states/CO-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

---

## Check every week

### Alaska (AK)

- **Alaska — unemployment wage base / employer rates**
  https://labor.alaska.gov/estax/2026-experience-rates.html
  Covers: data/states/AK-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.

### Arkansas (AR)

- **Arkansas — employer withholding tables & instructions**
  https://www.dfa.arkansas.gov/wp-content/uploads/whformula_2026.pdf
  Covers: data/states/AR-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Arizona (AZ)

- **Arizona — employer withholding tables & instructions**
  https://azdor.gov/sites/default/files/document/FORMS_WITHHOLDING_2026_A-4_f.pdf
  Covers: data/states/AZ-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### California (CA)

- **California — unemployment insurance taxable wage base**
  https://edd.ca.gov/en/payroll_taxes/rates_and_withholding/
  Covers: data/states/CA-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **California — employer withholding tables & instructions**
  https://edd.ca.gov/siteassets/files/pdf_pub_ctr/26methb.pdf
  Covers: data/states/CA-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Connecticut (CT)

- **Connecticut — unemployment insurance employer rates & taxable wage base**
  https://portal.ct.gov/dol/knowledge-base/articles/unemployment-taxes/tax-rates-and-taxable-wage-base
  Covers: data/states/CT-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Connecticut — employer withholding tables & instructions**
  https://portal.ct.gov/-/media/drs/publications/pubsip/2026/ip-2026-1.pdf?rev=4482a3dca0a44b28ae39381a91fb0916&hash=57C34787EE2C1D4A7F989EE1F6B8F0F8
  Covers: data/states/CT-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### District of Columbia (DC)

- **District of Columbia — unemployment insurance employer rates**
  https://unemployment.dc.gov/page/tax-information
  Covers: data/states/DC-{year}.json#suiEmployer. Expected to change: annual; rate schedules are set each autumn for the following year.

- **District of Columbia — employer withholding tables & instructions**
  https://otr.cfo.dc.gov/
  Covers: data/states/DC-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Delaware (DE)

- **Delaware — unemployment insurance employer rates & taxable wage base**
  https://labor.delaware.gov/divisions/unemployment-insurance/employer-services/
  Covers: data/states/DE-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Delaware — employer withholding tables & instructions**
  https://revenue.delaware.gov/employers-guide-withholding-regulations-employers-duties/
  Covers: data/states/DE-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Florida (FL)

- **Florida — unemployment wage base / employer rates**
  https://floridarevenue.com/taxes/taxesfees/Pages/rt_rate.aspx
  Covers: data/states/FL-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.

### Georgia (GA)

- **Georgia — unemployment insurance employer rates**
  https://dol.georgia.gov/employers
  Covers: data/states/GA-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Georgia — employer withholding tables & instructions**
  https://dor.georgia.gov/document/document/2026-employers-tax-guide-updated-june-2026/download
  Covers: data/states/GA-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Hawaii (HI)

- **Hawaii — unemployment insurance employer rates & taxable wage base**
  https://labor.hawaii.gov/dcd/files/2025/12/2026-Maximum-Weekly-Wage-Base.pdf
  Covers: data/states/HI-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Hawaii — employer withholding tables & instructions**
  https://files.hawaii.gov/tax/news/pubs/25BkltA.pdf
  Covers: data/states/HI-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Iowa (IA)

- **Iowa — unemployment insurance employer rates**
  https://www.iowaworkforcedevelopment.gov/unemployment-insurance-taxes
  Covers: data/states/IA-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Iowa — employer withholding tables & instructions**
  https://revenue.iowa.gov/media/53/download?inline=
  Covers: data/states/IA-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Idaho (ID)

- **Idaho — unemployment insurance employer rates & taxable wage base**
  https://www.labor.idaho.gov/wp-content/uploads/2024/12/Tax-rate_Class-array_2026.pdf
  Covers: data/states/ID-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Idaho — employer withholding tables & instructions**
  https://tax.idaho.gov/document-mngr/pubs_EPB00744
  Covers: data/states/ID-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Illinois (IL)

- **Illinois — unemployment insurance employer rates**
  https://ides.illinois.gov/content/dam/soi/en/web/ides/ides_forms_and_publications/EA-50_2026.pdf
  Covers: data/states/IL-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Illinois — employer withholding tables & instructions**
  https://tax.illinois.gov/forms/withholding/currentyear/il-700-t-withholding-guide-tables.html
  Covers: data/states/IL-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Kansas (KS)

- **Kansas — unemployment insurance employer rates**
  https://www.dol.ks.gov/employers/unemployment-tax
  Covers: data/states/KS-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.
  ⚠ Not machine-fetchable: Confirmed HTTP 403 on every attempt from two real GitHub Actions runs (2026-08-31) and independently from this project's own sandbox, using Node's actual fetch with the full browser header set fetch.ts sends. Same cloud/datacenter-IP-refusal shape as ssa-wage-base above — see that entry's note for how this was distinguished from the curl-vs-Node client difference seen elsewhere. Excluded from the staleness test so it does not pin overall health red forever; check by hand each autumn when Kansas resets its rate schedule.

- **Kansas — employer withholding tables & instructions**
  https://www.ksrevenue.gov/pdf/kw100.pdf
  Covers: data/states/KS-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Kentucky (KY)

- **Kentucky — local occupational license tax (statutory basis)**
  https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=48677
  Covers: data/local/KY-occupational-{year}.json. Expected to change: rare for the statute itself; individual city/county rates change independently.

- **Kentucky Secretary of State — Occupational License Tax Database (KRS 67.766), all districts**
  https://web.sos.ky.gov/occupationaltax/
  Covers: data/local/KY-occupational-{year}.json. Expected to change: rolling; most effective dates are 1 January, but a district can change its ordinance any time.

- **Kentucky — unemployment insurance employer rates & taxable wage base**
  https://kewes.ky.gov/
  Covers: data/states/KY-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Kentucky — employer withholding tables & instructions**
  https://revenue.ky.gov/Forms/2026%20Withholding%20Formula.pdf
  Covers: data/states/KY-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Louisiana (LA)

- **Louisiana — unemployment insurance employer rates**
  https://www.laworks.net/Downloads/UI/WTS/2026RateTable.pdf
  Covers: data/states/LA-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Louisiana — employer withholding tables & instructions**
  https://dam.ldr.la.gov/taxforms/1306-1-26.pdf
  Covers: data/states/LA-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Massachusetts (MA)

- **Massachusetts — unemployment insurance employer rates**
  https://www.mass.gov/info-details/learn-about-employer-contributions-to-dua
  Covers: data/states/MA-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.
  ⚠ Not machine-fetchable: Confirmed HTTP 403 on every attempt from two real GitHub Actions runs (2026-08-31) and independently from this project's own sandbox, using Node's actual fetch with the full browser header set fetch.ts sends — a regression from when this URL was originally verified to succeed under Node (see ma-withholding below, blocked the same way as of this same audit). Excluded from the staleness test so it does not pin overall health red forever; check by hand each autumn when Massachusetts resets its rate schedule, and re-test from a residential network before re-enabling.

- **Massachusetts — employer withholding tables & instructions**
  https://www.mass.gov/doc/massachusetts-circular-m-income-tax-withholding-tables-at-50-effective-january-1-2026/download
  Covers: data/states/MA-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).
  ⚠ Not machine-fetchable: HTTP 403 on every attempt as of 2026-09-01 — see the note above; this used to work under Node fetch and no longer does. Excluded from the staleness test so it does not pin overall health red forever; check by hand each Nov-Jan when Massachusetts republishes Circular M, and re-test from a residential network before re-enabling.

### Maryland (MD)

- **Maryland — unemployment insurance employer rates & taxable wage base**
  https://labor.maryland.gov/unemployment-insurance/employer-agent/tax-rate.shtml
  Covers: data/states/MD-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Maryland — employer withholding tables & instructions**
  https://www.marylandcomptroller.gov/content/dam/mdcomp/tax/instructions/withholding/2026/withholding-guide.pdf
  Covers: data/states/MD-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Maine (ME)

- **Maine — unemployment insurance employer rates & taxable wage base**
  https://www.maine.gov/unemployment/docs/2026/employers/2026_ME_UC1_instructions.pdf
  Covers: data/states/ME-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Maine — employer withholding tables & instructions**
  https://www.maine.gov/revenue/sites/maine.gov.revenue/files/inline-files/26_wh_tab_instr.pdf
  Covers: data/states/ME-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Minnesota (MN)

- **Minnesota — unemployment insurance employer rates & taxable wage base**
  https://www.uimn.org/employers/wages-taxes/tax-rates/index.jsp
  Covers: data/states/MN-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Minnesota — employer withholding tables & instructions**
  https://www.revenue.state.mn.us/sites/default/files/2025-12/wh-inst-26.pdf
  Covers: data/states/MN-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Missouri (MO)

- **Missouri — unemployment insurance employer rates & taxable wage base**
  https://labor.mo.gov/des/employers/tax-rates
  Covers: data/states/MO-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Missouri — employer withholding tables & instructions**
  https://dor.mo.gov/forms/Withholding%20Formula_2026.pdf
  Covers: data/states/MO-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Mississippi (MS)

- **Mississippi — unemployment insurance employer rates & taxable wage base**
  https://mdes.ms.gov/employer-faqs/
  Covers: data/states/MS-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Mississippi — employer withholding tables & instructions**
  https://www.dor.ms.gov/sites/default/files/tax-forms/business/89700251revised1.13.2026.pdf
  Covers: data/states/MS-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Montana (MT)

- **Montana — unemployment insurance employer rates**
  https://uid.dli.mt.gov/
  Covers: data/states/MT-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Montana — employer withholding tables & instructions**
  https://revenuefiles.mt.gov/files/Forms/Montana_Employer_and_Information_Agent_Guide_with_Tax_Tables.pdf
  Covers: data/states/MT-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### North Carolina (NC)

- **North Carolina — unemployment insurance employer rates & taxable wage base**
  https://www.des.nc.gov/employers/tax-rate-information
  Covers: data/states/NC-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **North Carolina — employer withholding tables & instructions**
  https://www.ncdor.gov/income-tax-withholding-tables-and-instructions-employers/open
  Covers: data/states/NC-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### North Dakota (ND)

- **North Dakota — unemployment insurance employer rates & taxable wage base**
  https://www.jobsnd.com/unemployment-business-tax/learn-about-taxes
  Covers: data/states/ND-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **North Dakota — employer withholding tables & instructions**
  https://www.tax.nd.gov/sites/www/files/documents/forms/individual/2026-iit/2026-income-tax-withholding-rates-booklet.pdf
  Covers: data/states/ND-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Nebraska (NE)

- **Nebraska — unemployment insurance combined tax rates & taxable wage base**
  https://dol.nebraska.gov/UITax/UnemploymentInsuranceTax/CombinedTaxRates
  Covers: data/states/NE-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Nebraska — employer withholding tables & instructions**
  https://revenue.nebraska.gov/sites/default/files/doc/business/Cir_En_2025/2026cir_en_whole.pdf
  Covers: data/states/NE-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### New Hampshire (NH)

- **New Hampshire — unemployment wage base / employer rates**
  https://www.nhes.nh.gov/
  Covers: data/states/NH-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.
  ⚠ Not machine-fetchable: HTTP 403 on every attempt as of 2026-09-01 — see the note above; this used to work under Node fetch and no longer does. Excluded from the staleness test so it does not pin overall health red forever; check by hand each autumn when NH resets its wage base, and re-test from a residential network before re-enabling.

### New Mexico (NM)

- **New Mexico — unemployment insurance taxable wage base**
  https://www.dws.state.nm.us/UI-Tax-Information
  Covers: data/states/NM-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **New Mexico — employer withholding tables & instructions**
  https://realfile.tax.newmexico.gov/FYI-104.pdf
  Covers: data/states/NM-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

- **New Mexico — how UI tax rates are calculated (rate schedule)**
  https://www.dws.state.nm.us/Unemployment/Unemployment-for-a-Business/Unemployment-Insurance-Tax-Information/How-UI-Tax-Rates-Are-Calculated
  Covers: data/states/NM-{year}.json#suiEmployer. Expected to change: annual; rate schedules are set each autumn.

### Nevada (NV)

- **Nevada — unemployment insurance employer rates & taxable wage base**
  https://detr.nv.gov/Page/UI_Information_for_Employers
  Covers: data/states/NV-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.
  ⚠ Not machine-fetchable: Confirmed HTTP 403 on every attempt from two real GitHub Actions runs (2026-08-31) and independently from this project's own sandbox, using Node's actual fetch with the full browser header set fetch.ts sends. Excluded from the staleness test so it does not pin overall health red forever; check by hand each autumn when Nevada resets its rate schedule, and re-test from a residential network before re-enabling.

- **Nevada — unemployment wage base / employer rates**
  https://tax.nv.gov/faqs/modified-business-tax-faqs/
  Covers: data/states/NV-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.

### Oklahoma (OK)

- **Oklahoma — unemployment insurance contribution rates & taxable wage base**
  https://oklahoma.gov/oesc/employers/tax/contribution-rates.html
  Covers: data/states/OK-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Oklahoma — employer withholding tables & instructions**
  https://www.oklahoma.gov/content/dam/ok/en/tax/documents/resources/publications/businesses/withholding-tables/WHTables-2026.pdf
  Covers: data/states/OK-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Rhode Island (RI)

- **Rhode Island — unemployment insurance employer rates & taxable wage base**
  https://dlt.ri.gov/employers/employer-tax-unit
  Covers: data/states/RI-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Rhode Island — employer withholding tables & instructions**
  https://tax.ri.gov/sites/g/files/xkgbur541/files/2025-12/2026%20Withholding%20Tax%20Booklet.pdf
  Covers: data/states/RI-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### South Carolina (SC)

- **South Carolina — unemployment insurance employer rates**
  https://dew.sc.gov/news/2025-11/2026-tax-rate-cuts-press-release
  Covers: data/states/SC-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **South Carolina — employer withholding tables & instructions**
  https://dor.sc.gov/sites/dor/files/forms/WH1603F_2026.pdf
  Covers: data/states/SC-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### South Dakota (SD)

- **South Dakota — unemployment wage base / employer rates**
  https://dlr.sd.gov/ra/businesses/faq.aspx
  Covers: data/states/SD-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.

### Tennessee (TN)

- **Tennessee — unemployment wage base / employer rates**
  https://www.tn.gov/workforce/employers/tax-and-insurance-redirect/unemployment-insurance-tax/ui-tax-rates.html
  Covers: data/states/TN-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.

### Texas (TX)

- **Texas — UI taxable wage base (via US DOL Significant Measures of State UI Tax Systems)**
  https://oui.doleta.gov/unemploy/pdf/sigmeasures/sigmeasuitaxsys24.pdf
  Covers: data/states/TX-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.

### Utah (UT)

- **Utah — unemployment insurance employer rates & taxable wage base**
  https://jobs.utah.gov/ui/employer/public/Questions/TaxRates.aspx
  Covers: data/states/UT-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Utah — employer withholding tables & instructions**
  https://files.tax.utah.gov/tax/forms/pubs/pub-14.pdf
  Covers: data/states/UT-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Virginia (VA)

- **Virginia — unemployment insurance taxable wage base**
  https://www.vec.virginia.gov/frequently-asked-questions
  Covers: data/states/VA-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Virginia — employer withholding tables & instructions**
  https://www.tax.virginia.gov/sites/default/files/vatax-pdf/employer-withholding-instructions.pdf
  Covers: data/states/VA-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Vermont (VT)

- **Vermont — unemployment insurance employer rates**
  https://labor.vermont.gov/unemployment-insurance/ui-employers/unemployment-tax-rates
  Covers: data/states/VT-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Vermont — employer withholding tables & instructions**
  https://tax.vermont.gov/sites/tax/files/documents/GB-1210-2026.pdf
  Covers: data/states/VT-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Washington (WA)

- **Washington — unemployment wage base / employer rates**
  https://esd.wa.gov/employer-taxes/rates
  Covers: data/states/WA-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.

### Wisconsin (WI)

- **Wisconsin — unemployment insurance employer rates & taxable wage base**
  https://dwd.wisconsin.gov/ui/employers/taxrates.htm
  Covers: data/states/WI-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **Wisconsin — employer withholding tables & instructions**
  https://www.revenue.wi.gov/DOR%20Publications/pb166.pdf
  Covers: data/states/WI-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### West Virginia (WV)

- **West Virginia — unemployment insurance employer rates & taxable wage base (Employer Handbook)**
  https://workforcewv.org/businesses/unemployment-tax-information/employer-resources/
  Covers: data/states/WV-{year}.json#suiEmployer. Expected to change: annual; rate schedules and wage bases are set each autumn for the following year.

- **West Virginia — employer withholding tables & instructions**
  https://tax.wv.gov/Documents/Withholding/it100.2a.pdf
  Covers: data/states/WV-{year}.json. Expected to change: annual, published Nov–Jan; mid-year changes happen after legislation (see this state's own data file for any scheduled effective date).

### Wyoming (WY)

- **Wyoming — unemployment wage base / employer rates**
  https://dws.wyo.gov/dws-division/unemployment-insurance/wyui/unemployment-taxable-wage-base/
  Covers: data/states/WY-{year}.json. Expected to change: annual; unemployment wage base and employer rate schedule are set each autumn.

