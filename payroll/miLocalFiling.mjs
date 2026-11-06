export const cities = {
  "Albion": {
    "instructions": "https://cms1files.revize.com/cityofalbion/document_center/Forms/Fillable%20forms/%281%29%20AL_W3_Withholding_Annual_Return.pdf"
  },
  "Battle Creek": {
    "instructions": "https://battlecreekmi.gov/DocumentCenter/View/6174/W-3-Reconciliation-of-Battle-Creek-Income-Tax-Withheld-Fillable-PDF",
    "code": "MIBCK     ",
    "spec": "https://www.battlecreekmi.gov/DocumentCenter/View/18350/BC-ELECTRONIC-MEDIA-W-2-REPORTING-SPECIFICATIONS"
  },
  "Benton Harbor": {
    "instructions": "https://www.bhcity.us/pview.aspx?catid=0&id=55136"
  },
  "Big Rapids": {
    "instructions": "https://www.cityofbr.org/department/income_tax/index.php"
  },
  "Detroit": {
    "instructions": "https://www.michigan.gov/taxes/citytax/detroit/forms/2026/2026-employer-withholding-tax"
  },
  "East Lansing": {
    "instructions": "https://www.cityofeastlansing.com/DocumentCenter/View/16965/2026-Employer-Withholding-Packet-PDF",
    "code": "MIELA",
    "spec": "https://www.cityofeastlansing.com/DocumentCenter/View/9260/Accepted-Electronic-W-2-Formats-PDF"
  },
  "Flint": {
    "instructions": "https://www.cityofflint.com/wp-content/uploads/2026/01/2025-City-of-Flint-Employers-Withholding-Forms-and-Instruction-Booklet.pdf",
    "code": "FL",
    "spec": "https://www.cityofflint.com/wp-content/uploads/2022/08/Acceptable-W3-W2-Formats.pdf"
  },
  "Grand Rapids": {
    "instructions": "https://www.grandrapidsmi.gov/departments/fiscal-services/income-tax/employers-and-withholders/income-tax-guide-for-withholders/",
    "code": "MIGRR     ",
    "spec": "https://www.grandrapidsmi.gov/media/fmojskly/grr-electronic-media-w-2-reporting-specifications-02032022.pdf"
  },
  "Grayling": {
    "instructions": "https://www.cityofgrayling.org/incometax",
    "code": "GRA",
    "spec": "https://www.cityofgrayling.org/downloads/acceptable_w3_w2_formats.pdf"
  },
  "Hamtramck": {
    "instructions": "https://hamtramckcity.gov/departments/income-tax/"
  },
  "Highland Park": {
    "instructions": "https://www.highlandparkmi.gov/Services/Income-Tax"
  },
  "Hudson": {
    "instructions": "https://www.ci.hudson.mi.us/copy-of-codes-forms-and-permits-1"
  },
  "Ionia": {
    "instructions": "https://cityofionia.org/DocumentCenter/View/2311/Employer-Withholding-Tax-Forms-and-Instructions-2026-PDF"
  },
  "Jackson": {
    "instructions": "https://www.cityofjackson.org/1542/Employers-Annual-Reconciliation-of-Incom"
  },
  "Lansing": {
    "instructions": "https://www.lansingmi.gov/income-tax-forms",
    "code": "LAN",
    "spec": "https://content.civicplus.com/api/assets/mi-lansing/db2ee642-e5dd-4e5d-b8d2-41c67283cd1a?cache=1800"
  },
  "Lapeer": {
    "instructions": "https://www.ci.lapeer.mi.us/forms/income_tax.php"
  },
  "Muskegon": {
    "instructions": "https://muskegon-mi.gov/city-services/finance-administrative/income-tax/income-tax-forms/employer-income-tax-information/"
  },
  "Muskegon Heights": {
    "instructions": "https://muskegonheights.us/income-tax/"
  },
  "Pontiac": {
    "instructions": "https://www.pontiacmi.gov/departments/finance/income_tax/index.php"
  },
  "Port Huron": {
    "instructions": "https://cms9files.revize.com/porthuronminw/Documents/Government/Departments/Finance/Income%20Tax/Employer%20Information%20and%20Income%20Tax%20Forms/Withholding%20Guide%202.pdf",
    "code": "PHN",
    "spec": "https://cms9files.revize.com/porthuronminw/Documents/Residents/Support%20For%20Residents/Online%20Services/Forms%20Online/W2Filing.pdf"
  },
  "Portland": {
    "instructions": "https://www.portland-michigan.org/DocumentCenter/View/5434"
  },
  "Saginaw": {
    "instructions": "https://www.saginaw-mi.com/418/Employer-Withholding",
    "code": "SAG",
    "spec": "https://www.saginaw-mi.com/DocumentCenter/View/710/City-of-Saginaw-W2-Formats-PDF?bidId="
  },
  "Springfield": {
    "instructions": "https://cms8.revize.com/revize/springfieldmi/Document_Center/Department/Document/Income%20Tax%20%28Employers%29/W3_Annual_Emp_Recon.pdf",
    "code": "SPR",
    "spec": "https://cms8.revize.com/revize/springfieldmi/Document_Center/Department/Document/Income%20Tax%20%28Employers%29/Transmittal_Instructions_for_Web_2.pdf"
  },
  "Walker": {
    "instructions": "https://www.walker.city/316/Employer-Withholding",
    "code": "WLKR",
    "spec": "https://walkermi.gov/320/W-2-Magnetic-Media-Specifications"
  }
};

function check(ok, message) {
  if (!ok) throw new Error(message);
}

function cents(value) {
  check(Number.isSafeInteger(value) && value >= 0, 'Expected nonnegative integer cents');
  return value;
}

function id(value) {
  check(typeof value === 'string' && value.trim().length > 0, 'Missing record identifier');
  return value;
}

function city(value) {
  check(Object.hasOwn(cities, value), 'Unknown Michigan tax city');
  return value;
}

function key(...parts) {
  return JSON.stringify(parts.map(id));
}

function unique(map, k, value) {
  check(!map.has(k), 'Duplicate record');
  map.set(k, value);
}

function field(value, pattern) {
  check(typeof value === 'string' && !/[\r\n]/.test(value) && pattern.test(value), 'Invalid city W-2 text field');
  return value.toUpperCase();
}

function address(record) {
  return [
    field(record.street, /^[a-z0-9][a-z0-9 ]*$/i),
    field(record.city, /^[a-z][a-z .'-]*$/i),
    field(record.state, /^[a-z]{2}$/i),
    field(record.zip, /^\d{5}$/),
    field(record.zip4 ?? '', /^(?:\d{4})?$/),
  ];
}

function dollars(n) {
  const value = BigInt(cents(n));
  return (value / 100n) + '.' + String(value % 100n).padStart(2, '0');
}

function attachment(profile, employer, rows, year) {
  const name = /^[a-z0-9][a-z0-9 &.'-]*$/i;
  const ein = field(employer.ein, /^\d{9}$/);
  check(typeof employer.corporation === 'boolean', 'Specify employer corporation status');
  const records = [['CTE', ein, year, field(employer.name, name),
    employer.corporation ? 'C' : '', ...address(employer)]];
  const long = ['FL', 'LAN', 'PHN', 'SAG', 'SPR', 'GRA'].includes(profile.code);
  const ssns = new Set();
  for (const row of rows) {
    const ssn = field(row.ssn, /^\d{9}$/);
    check(!ssns.has(ssn), 'Duplicate SSN within city');
    ssns.add(ssn);
    const middle = field(row.middle ?? '', /^[a-z '.-]*$/i);
    const fields = ['CTW', ssn, field(row.last, name), field(row.first, name),
      long || profile.code === 'MIELA' ? middle : middle.slice(0, 1), ...address(row),
      dollars(profile.code === 'MIELA' ? row.localWagesCents : row.box1Cents),
      profile.code, dollars(row.withheldCents)];
    if (long) fields.push(...[row.box3Cents, row.box5Cents, row.localWagesCents, row.deferredCents].map(dollars));
    records.push(fields);
  }
  if (profile.code.endsWith('     ')) records.push(['ZZZ']);
  const suffix = ['LAN', 'PHN'].includes(profile.code) ? ein : '';
  return { filename: 'W2REPORT' + suffix + '.csv', content: records.map(r => r.join(',')).join('\r\n') + '\r\n' };
}

export function prepare(input) {
  const { companyId, year, employer, runs, allocations, deposits, statements } = input;
  id(companyId);
  check(year === 2026, 'Only 2026 employer wage filings are supported');
  const selected = city(input.city);
  const monthTotals = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1, withheldCents: 0, paidCents: 0, localWagesCents: 0,
  }));
  const lines = new Map();
  const runIds = new Map();
  for (const run of runs) {
    check(run.companyId === companyId, 'Pay run belongs to another employer');
    unique(runIds, id(run.id), true);
    check(['approved', 'draft', 'voided'].includes(run.status), 'Unknown pay run status');
    if (run.status !== 'approved') continue;
    const date = new Date(run.checkDate + 'T00:00:00Z');
    check(Number.isFinite(+date) && date.toISOString().slice(0, 10) === run.checkDate, 'Invalid check date');
    if (date.getUTCFullYear() !== year) continue;
    for (const line of run.lines) {
      const local = line.taxLines.filter(t => t.id === 'MI_LOCAL');
      if (!local.length) continue;
      check(local.length === 1, 'Duplicate MI_LOCAL tax line');
      const expected = cents(local[0].amount);
      unique(lines, key(run.id, line.employeeId), { expected, assigned: 0, month: date.getUTCMonth() });
    }
  }
  const employees = new Map();
  const allocationIds = new Map();
  for (const a of allocations) {
    const line = lines.get(key(a.runId, a.employeeId));
    check(line, 'City allocation lacks an approved MI_LOCAL pay line in the filing year');
    city(a.city);
    unique(allocationIds, key(a.runId, a.employeeId, a.city), true);
    line.assigned = cents(line.assigned + cents(a.withheldCents));
    cents(a.localWagesCents);
    if (a.city !== selected) continue;
    const totals = employees.get(a.employeeId) ?? { withheldCents: 0, localWagesCents: 0 };
    for (const f of ['withheldCents', 'localWagesCents']) {
      totals[f] = cents(totals[f] + a[f]);
      monthTotals[line.month][f] = cents(monthTotals[line.month][f] + a[f]);
    }
    employees.set(a.employeeId, totals);
  }
  for (const line of lines.values()) check(line.assigned === line.expected, 'City allocations differ from approved withholding');
  const seen = new Map();
  for (const row of statements) {
    const employee = employees.get(id(row.employeeId));
    check(row.taxCity === selected && employee, 'W-2 lacks matching city payroll allocation');
    unique(seen, row.employeeId, true);
    check(employee.withheldCents === row.withheldCents && employee.localWagesCents === row.localWagesCents,
      'Employee W-2 boxes 18/19 differ from payroll');
  }
  check(seen.size === employees.size, 'Missing employee city W-2');
  const receipts = new Map();
  for (const d of deposits) {
    check(d.city === selected && Number.isInteger(d.month) && d.month >= 1 && d.month <= 12, 'Invalid deposit city or liability month');
    unique(receipts, id(d.id), true);
    const month = monthTotals[d.month - 1];
    month.paidCents = cents(month.paidCents + cents(d.amountCents));
  }
  function summarize(months) {
    return Object.fromEntries(['withheldCents', 'paidCents', 'localWagesCents'].map(f =>
      [f, months.reduce((a, m) => cents(a + m[f]), 0)]));
  }
  const annual = summarize(monthTotals);
  const profile = cities[selected];
  return {
    worksheet: { companyId, year, city: selected, instructions: profile.instructions,
      months: monthTotals, quarters: [0, 3, 6, 9].map(i => summarize(monthTotals.slice(i, i + 3))),
      annual, employeeCount: statements.length, withholdingLessPaymentsCents: annual.withheldCents - annual.paidCents },
    w2: profile.code && statements.length ? attachment(profile, employer, statements, year) : null,
  };
}
