import { def, inp, line, p, ul, kv, code, run, taxTable, pick, type Helpers, type TopicDef } from './seo-more-kit.ts';

/** Developer-facing intents: the searches an engineer makes when they need payroll tax in their own software. */
export function devTopics(h: Helpers): TopicDef[] {
  const { money, dollars } = h;
  const f = h.federalFacts();
  const tx = run(inp(h, 'TX'));
  const oh = run(inp(h, 'OH', { residenceCity: 'Columbus', workCity: 'Columbus' }));
  const ca = run(inp(h, 'CA'));
  const body = (state: string, cert = '') => `{
  "checkDate": "2026-09-15",
  "payFrequency": "biweekly",
  "earnings": [{ "code": "REG", "category": "regular", "amount": 300000 }],
  "deductions": [],
  "federalW4": { "filingStatus": "single", "multipleJobs": false,
    "dependentCredit": 0, "otherIncome": 0, "deductions": 0, "extraWithholding": 0 },
  "ytd": { "socialSecurity": 0, "medicare": 0, "futa": 0 },
  "workState": { "code": "${state}"${cert} }
}`;
  const response = `{
  "result": {
    "checkDate": "2026-09-15",
    "grossPay": ${tx.grossPay},
    "taxes": [
      { "id": "US_FIT", "name": "Federal Income Tax", "payer": "employee",
        "taxableWages": ${line(tx, 'US_FIT')!.taxableWages}, "amount": ${line(tx, 'US_FIT')!.amount}, "detail": "…" },
      { "id": "US_SS_EE", "name": "${line(tx, 'US_SS_EE')!.name}", "payer": "employee",
        "taxableWages": ${line(tx, 'US_SS_EE')!.taxableWages}, "amount": ${line(tx, 'US_SS_EE')!.amount}, "detail": "…" }
    ],
    "employeeTaxTotal": ${tx.employeeTaxTotal},
    "employerTaxTotal": ${tx.employerTaxTotal},
    "netPay": ${tx.netPay}
  }
}`;
  const L: TopicDef[] = [];
  const add = (t: TopicDef) => L.push(t);

  add(def({
    path: '/payroll-tax-calculation-api', label: 'Payroll tax calculation API', group: 'Developers',
    title: 'Payroll tax calculation API: one call, every tax line',
    description: 'A payroll tax calculation API: POST one paycheck, get federal, state, local and employer tax lines and net pay back as JSON in cents. $0.08 per calculation.',
    h1: 'Payroll tax calculation API',
    sub: 'POST a paycheck. Get every tax line, who pays it, and net pay.',
    lead: p(`A payroll tax calculation API takes the facts of one paycheck and returns the taxes on it. With Omnia.tax that is a single <code>POST /v1/paycheck</code>: earnings, deductions, the employee's Form W-4, year-to-date wages and a work location go in; a list of tax lines and net pay come out, as JSON, with every amount in integer cents. It calculates. It does not file returns, deposit tax or pay anyone.`),
    sections: [
      ['What one call does', p(`The request below is a single employee in Texas paid ${money(tx.grossPay)} biweekly. Texas has no state income tax, so the response carries federal income tax, Social Security and Medicare for the employee, and Social Security, Medicare, federal unemployment tax and Texas unemployment tax for the employer.`) + code(h, body('TX')) + p(`The response is shaped like this (abridged; the real one lists every line):`) + code(h, response)],
      ['The lines it returned for that paycheck', taxTable(h, tx) + p(`Employee taxes total ${money(tx.employeeTaxTotal)}, so net pay is ${money(tx.netPay)}. The employer's ${money(tx.employerTaxTotal)} is a cost on top of gross pay and is not taken from the employee.`)],
      ['Why the rules live behind an API', ul([
        'The rules change: wage bases move every January, and states revise rates and formulas during the year. You call the same endpoint; the check date picks the right year.',
        `Local tax is the long tail. The engine carries ${h.cov.localJurisdictions.toLocaleString('en-US')} local jurisdictions in ${h.cov.statesWithLocalTax} states and finds them from an address with <code>POST /v1/address</code>.`,
        'Each line says how it was reached, so a payroll specialist can audit a figure without reading code.',
        'Money is integer cents on the way in and out. There is no floating-point dollar anywhere to round the wrong way.',
      ])],
      ['Price and trial', p(`A live key costs $0.08 per paycheck calculation after a 14-day free trial. A <a href="/payroll-tax-api-test-keys">test key</a> runs the same engine and data with no card and is never billed. The full price table is on <a href="/payroll-tax-api-pricing">the pricing guide</a>.`)],
    ],
    faq: [
      { q: 'What does a payroll tax calculation API do?', a: 'It takes the earnings, deductions, withholding certificates, year-to-date wages and work location of one paycheck and returns each payroll tax with the wages it applied to, who pays it, and net pay.' },
      { q: 'Does the API file or pay the tax?', a: 'No. Omnia.tax calculates withholding and employer taxes. You, or your payroll provider, still file returns and deposit the tax.' },
      { q: 'What format are the requests and responses?', a: 'JSON over HTTPS, with every money amount in integer cents. A request that sends a decimal dollar amount is rejected with a field-level error.' },
    ],
    related: ['/payroll-tax-api', '/payroll-tax-api-for-developers', '/payroll-tax-api-response-fields', '/payroll-tax-api-integration-guide'],
  }));

  add(def({
    path: '/payroll-tax-api-for-developers', label: 'Payroll tax API for developers', group: 'Developers',
    title: 'Payroll tax API for developers: docs, schema, test keys',
    description: 'What a developer needs from a payroll tax API: a published OpenAPI document, a JSON Schema, integer cents, stable error codes, test keys and an MCP server.',
    h1: 'Payroll tax API for developers',
    sub: 'The parts of the API an engineer checks before committing to it.',
    lead: p(`Engineers evaluating a payroll tax API ask a different set of questions than a payroll manager does. Can I generate a client from a spec? Are amounts safe to add up? What does a failure look like, and can my code branch on it? Can I try it without a sales call? This page answers those for Omnia.tax with links to the documents that prove each answer.`),
    sections: [
      ['A published contract', ul([
        'An <a href="/v1/openapi.json">OpenAPI 3.1 document</a> describes every endpoint, request and response, with examples.',
        'A <a href="/v1/schemas/paycheck-request.json">JSON Schema</a> for the paycheck request, so you can validate before you send.',
        'An <code>X-Omnia-Version</code> header on every response, and a <a href="/changelog">changelog</a>.',
      ])],
      ['Predictable behaviour', ul([
        '<strong>Integer cents.</strong> Every amount, in and out. Dollars with a decimal are refused with the field named.',
        '<strong>Stable error codes.</strong> Each error body has a <code>code</code> to branch on and a message for a person. See <a href="/payroll-tax-api-error-codes">the error codes</a>.',
        '<strong>Field-level validation.</strong> A bad request returns a <code>details</code> array naming each field and why.',
        '<strong>A request id</strong> on every response in the <code>X-Request-Id</code> header, to quote to support.',
      ])],
      ['Endpoints', kv(h, ['Endpoint', 'What it does'], [
        ['<code>POST /v1/paycheck</code>', 'One paycheck: every tax line and net pay. Also answers garnishment and minimum-wage checks in the same call.'],
        ['<code>POST /v1/paycheck/compare</code>', 'Two paychecks and an explanation of the difference, step by step.'],
        ['<code>POST /v1/paycheck/gross-up</code>', 'The gross pay that leaves a target take-home amount.'],
        ['<code>POST /v1/employer-taxes</code>', 'Quarterly employer taxes on total payroll: New York MCTMT and the Nevada MBT.'],
        ['<code>POST /v1/address</code>', 'A work and home address turned into a state, local jurisdictions and certificate. Recorded, not billed.'],
        ['<code>GET /v1/states</code>', 'The states with rules for a tax year. No key needed.'],
        ['<code>POST /mcp</code>', 'A Model Context Protocol server for AI agents.'],
      ])],
      ['Try it first', p(`A <a href="/payroll-tax-api-test-keys">test key</a> uses the same engine and data as a live key. It needs no card, is never billed, and is capped at 30 requests a minute and 500 a day. The <a href="/sandbox">calculator</a> shows the exact JSON and cURL for whatever you enter.`)],
    ],
    faq: [
      { q: 'Does the payroll tax API have an OpenAPI spec?', a: 'Yes. It publishes an OpenAPI 3.1 document at /v1/openapi.json and a JSON Schema for the paycheck request at /v1/schemas/paycheck-request.json.' },
      { q: 'Can I try the API without paying?', a: 'Yes. Test keys use the same engine and data as live keys, need no card, and are never billed. They are capped at 30 requests a minute and 500 a day.' },
      { q: 'Are the amounts safe to add up in code?', a: 'Yes. Every amount is an integer number of cents, so sums are exact and nothing depends on floating-point rounding.' },
    ],
    related: ['/payroll-tax-api-openapi', '/payroll-tax-api-json-schema', '/payroll-tax-api-test-environment', '/payroll-tax-calculation-api'],
  }));

  add(def({
    path: '/rest-api-payroll-taxes', label: 'REST API for payroll taxes', group: 'Developers',
    title: 'REST API for payroll taxes: endpoints and conventions',
    description: 'A REST API for payroll taxes over HTTPS and JSON: resource-style endpoints, bearer-key auth, integer cents, standard status codes and rate-limit headers.',
    h1: 'REST API for payroll taxes',
    sub: 'Plain HTTP and JSON. No SDK required.',
    lead: p(`If you want to calculate payroll taxes from any language, a REST API is the lowest-friction shape: an HTTPS request, a JSON body, a JSON answer. Omnia.tax follows ordinary conventions so a client written in an afternoon behaves the same as one written in a week.`),
    sections: [
      ['Conventions', kv(h, ['Convention', 'What Omnia.tax does'], [
        ['Transport', 'HTTPS only, <code>https://api.omnia.tax</code>.'],
        ['Authentication', 'A bearer key: <code>Authorization: Bearer $KEY</code>.'],
        ['Bodies', 'JSON in, JSON out, <code>Content-Type: application/json</code>.'],
        ['Money', 'Integer cents, never decimals.'],
        ['Dates', 'ISO <code>yyyy-mm-dd</code>. The check date selects the tax year.'],
        ['Success', '<code>200</code> with the result in a <code>result</code> object.'],
        ['Client mistakes', '<code>400</code> for bad JSON, <code>401</code> for key problems, <code>402</code> for billing, <code>422</code> for input the engine rejects, <code>429</code> for rate limits.'],
        ['Rate limits', '<code>RateLimit-Limit</code> and <code>RateLimit-Remaining</code> headers, and <code>Retry-After</code> on a <code>429</code>.'],
      ])],
      ['The core request', p(`Every calculation starts from the same body. This one asks for a ${money(oh.grossPay)} biweekly check for an employee who lives and works in Columbus, Ohio:`) + code(h, h.CURL('OH', ', "certificate": { "residenceCity": "Columbus", "workCity": "Columbus" }'))],
      ['What comes back', p(`State and city tax appear as their own lines. For Columbus the response includes ${oh.taxes.filter((t) => /OH_/.test(t.id) && t.payer === 'employee' && t.amount > 0).map((t) => `${h.esc(t.name)} (${money(t.amount)})`).join(' and ')}, next to federal income tax of ${money(line(oh, 'US_FIT')!.amount)}.`)],
      ['Stateless by design', p(`Nothing is stored between calls. Year-to-date wages come in on each request in the <code>ytd</code> object, so you can retry a call or replay it for an audit and get the same answer. See <a href="/payroll-tax-api-ytd-wages">how year-to-date wages work</a>.`)],
    ],
    faq: [
      { q: 'Is there a REST API for payroll taxes?', a: 'Yes. Omnia.tax exposes the payroll tax engine as a JSON REST API over HTTPS with bearer-key authentication.' },
      { q: 'Do I need an SDK?', a: 'No. Any language that can send an HTTPS request with a JSON body works. The OpenAPI document can generate a typed client if you want one.' },
      { q: 'Which status code does a validation failure return?', a: '422 with the code invalid_input and a details array naming each invalid field. Malformed JSON returns 400.' },
    ],
    related: ['/payroll-tax-api-authentication', '/payroll-tax-api-error-codes', '/payroll-tax-api-openapi', '/payroll-tax-api-for-developers'],
  }));

  add(def({
    path: '/json-payroll-tax-api', label: 'JSON payroll tax API', group: 'Developers',
    title: 'JSON payroll tax API: request and response shapes',
    description: 'A JSON payroll tax API with plain request and response shapes: earnings, deductions, W-4, year-to-date and location in; tax lines in cents and net pay out.',
    h1: 'JSON payroll tax API',
    sub: 'The shape of the request and the shape of the answer.',
    lead: p(`A JSON payroll tax API should be readable without a manual. The request is one object describing a paycheck. The response is one object describing what the paycheck owes. Here are both, with the fields that matter most.`),
    sections: [
      ['The request', code(h, body('TX')) + kv(h, ['Field', 'Meaning'], [
        ['<code>checkDate</code>', 'The date on the check. Decides which year\'s rules apply.'],
        ['<code>payFrequency</code>', '<code>weekly</code>, <code>biweekly</code>, <code>semimonthly</code>, <code>monthly</code> and the other periods the rules define.'],
        ['<code>earnings[]</code>', 'Each has a <code>code</code>, a <code>category</code> (<code>regular</code>, <code>supplemental</code>, <code>imputed</code>, <code>reimbursement</code>) and an <code>amount</code> in cents.'],
        ['<code>deductions[]</code>', 'Each has a category such as <code>deferral_401k</code>, <code>section125</code> or <code>hsa</code>, or <code>null</code> for post-tax.'],
        ['<code>federalW4</code>', 'Filing status, multiple-jobs box, dependent credit, other income, deductions, extra withholding.'],
        ['<code>ytd</code>', 'Social Security, Medicare and FUTA wages so far this year, so caps stop at the right check.'],
        ['<code>workState</code>', 'The work state code and that state\'s certificate answers.'],
      ])],
      ['The response', p(`Under <code>result</code> are the gross pay, the pre- and post-tax deduction totals, the <code>taxes</code> array, the employee and employer totals and <code>netPay</code>. Each tax line carries:`) + ul([
        '<code>id</code>: a stable identifier such as <code>US_FIT</code> or <code>US_SS_EE</code>.',
        '<code>name</code>: the name for a pay stub.',
        '<code>payer</code>: <code>employee</code> or <code>employer</code>.',
        '<code>jurisdiction</code>: federal, state or local.',
        '<code>taxableWages</code> and <code>amount</code>, both integer cents.',
        '<code>detail</code>: a sentence on how the figure was reached.',
      ]) + p(`For the Texas example, the federal income tax line has taxable wages of ${money(line(tx, 'US_FIT')!.taxableWages)} and an amount of ${money(line(tx, 'US_FIT')!.amount)}, and its <code>detail</code> reads: <em>${h.esc(line(tx, 'US_FIT')!.detail ?? '')}</em>`)],
      ['Optional blocks', p(`A response may also carry <code>notices</code> (lines resting on a weaker source than the levying body's own form), <code>warnings</code> (inputs that need a second look) and <code>electiveDeferrals</code> (what stayed pre-tax after annual limits). Code that ignores them still works; code that reads them can show a reviewer why a line needs checking.`)],
    ],
    faq: [
      { q: 'What does the JSON response contain?', a: 'A result object with gross pay, deduction totals, an array of tax lines (id, name, payer, jurisdiction, taxable wages, amount, detail), employee and employer totals, and net pay, plus optional notices and warnings.' },
      { q: 'Are tax line ids stable?', a: 'Yes. Ids such as US_FIT and US_SS_EE are identifiers to branch on; names are for display and may be reworded.' },
    ],
    related: ['/payroll-tax-api-response-fields', '/payroll-tax-api-json-schema', '/rest-api-payroll-taxes', '/payroll-tax-calculation-api'],
  }));

  add(def({
    path: '/payroll-tax-api-openapi', label: 'Payroll tax API OpenAPI spec', group: 'Developers',
    title: 'Payroll tax API OpenAPI spec: generate a client',
    description: 'The Omnia.tax payroll tax API is described by an OpenAPI 3.1 document. Generate a typed client, import it into Postman, or validate requests before you send.',
    h1: 'Payroll tax API OpenAPI spec',
    sub: 'One document describes every endpoint, field and error.',
    lead: p(`The Omnia.tax API is described by an <a href="/v1/openapi.json">OpenAPI 3.1 document</a>, served as JSON at <code>https://api.omnia.tax/v1/openapi.json</code>. It is generated from the same definitions the server validates against, so it describes what the API does rather than what someone remembered to write down.`),
    sections: [
      ['What you can do with it', ul([
        'Generate a typed client in the language your payroll or HR product is written in, using any OpenAPI 3.1 generator.',
        'Import the document into an API client such as Postman or Insomnia to try each endpoint with a key.',
        'Validate a request in your own tests before it leaves your code, using the request schema inside it.',
        'Feed it to an AI coding assistant so the integration it writes uses the real field names.',
      ])],
      ['What it covers', kv(h, ['Operation', 'operationId'], [
        ['Calculate a paycheck', '<code>calculatePaycheck</code>'],
        ['Compare two paychecks', '<code>comparePaychecks</code>'],
        ['Net to gross', '<code>grossUp</code>'],
        ['Quarterly employer taxes', '<code>employerTaxes</code>'],
        ['Resolve an address', '<code>resolveAddress</code>'],
        ['List states', '<code>listStates</code>'],
        ['The key making the request', '<code>whoAmI</code>'],
        ['Model Context Protocol', '<code>mcp</code>'],
      ])],
      ['Examples are real', p(`The examples inside the document are not hand-typed. They are requests the engine runs. The paycheck example for Texas returns net pay of ${money(tx.netPay)} on ${money(tx.grossPay)} gross, and if the rules change that figure changes with them.`)],
      ['Staying in step', p(`Every response carries an <code>X-Omnia-Version</code> header, and the <a href="/changelog">changelog</a> lists what changed in each release. Pin your generated client to a version you have tested and regenerate it when you choose to.`)],
    ],
    faq: [
      { q: 'Where is the OpenAPI document?', a: 'At https://api.omnia.tax/v1/openapi.json, and also at /openapi.json. It is OpenAPI 3.1.' },
      { q: 'Can I generate a client from it?', a: 'Yes. Any OpenAPI 3.1 generator can produce a typed client. The request schema is also published separately as JSON Schema.' },
    ],
    related: ['/payroll-tax-api-json-schema', '/payroll-tax-api-for-developers', '/payroll-tax-api-integration-guide', '/docs/paycheck'],
  }));

  add(def({
    path: '/payroll-tax-api-json-schema', label: 'Payroll tax request JSON Schema', group: 'Developers',
    title: 'Payroll tax API JSON Schema: validate before you send',
    description: 'A published JSON Schema for the payroll tax paycheck request. Validate payloads in your own code and tests so a bad request never costs a call.',
    h1: 'Payroll tax API JSON Schema',
    sub: 'Validate a paycheck request on your side, before it is sent.',
    lead: p(`The paycheck request is published as a <a href="/v1/schemas/paycheck-request.json">JSON Schema</a> at <code>https://api.omnia.tax/v1/schemas/paycheck-request.json</code>. Using it in your own code catches a wrong type or a missing field at the point you build the request, instead of as a <code>422</code> from the network.`),
    sections: [
      ['Where it helps', ul([
        '<strong>Form and import validation.</strong> An imported spreadsheet of pay data can be checked against the schema row by row before anything is sent.',
        '<strong>Unit tests.</strong> Assert that every request your payroll code can build validates against the schema.',
        '<strong>Editor support.</strong> Point your editor at the schema for autocompletion while you write fixtures.',
      ])],
      ['What the schema enforces', p(`Amounts are integers (cents), dates are ISO dates, and categories come from a fixed list. The server runs the same checks, so a request that passes the schema will not be refused for its shape. The schema is permissive about extra top-level properties, so a misspelt optional field is not an error by itself; assert on the fields you mean to send in your own tests.`)],
      ['What it cannot check', p(`A schema checks shape, not meaning. Whether a state needs a particular certificate answer for a given employee depends on the state's rules, so the server can still return <code>cannot_compute</code> naming the missing field. See <a href="/payroll-tax-api-error-codes">the error codes</a>.`)],
      ['An invalid request, as the server reports it', code(h, `{
  "error": "The request did not pass validation.",
  "code": "invalid_input",
  "details": [{ "path": "earnings[0].amount",
    "message": "must be integer cents, not 3000.5 — send whole cents (e.g. 300050 for $3,000.50), never dollars." }],
  "requestId": "req_01J9Z6Q8X3"
}`)],
    ],
    faq: [
      { q: 'Is there a JSON Schema for the payroll tax request?', a: 'Yes, at https://api.omnia.tax/v1/schemas/paycheck-request.json. The OpenAPI document embeds the same definitions.' },
      { q: 'Does passing the schema guarantee a calculation?', a: 'It guarantees the shape is valid. A state can still need a certificate answer the schema cannot know about, in which case the API returns cannot_compute and names the missing field.' },
    ],
    related: ['/payroll-tax-api-openapi', '/payroll-tax-api-error-codes', '/json-payroll-tax-api', '/payroll-tax-api-for-developers'],
  }));

  add(def({
    path: '/payroll-tax-api-python-example', label: 'Payroll tax API Python example', group: 'Developers',
    title: 'Payroll tax API Python example with requests',
    description: 'A working Python example that calls a payroll tax API with requests: build the paycheck, send it with a bearer key, read the tax lines and handle errors.',
    h1: 'Payroll tax API: a Python example',
    sub: 'Calculate a paycheck from Python in about twenty lines.',
    lead: p(`This example uses the <code>requests</code> library. It builds a paycheck, sends it with a bearer key, prints each tax line, and handles the two failures you will meet first: a validation error and a rate limit. Keep the key in an environment variable, not in source.`),
    sections: [
      ['The call', code(h, `import os
import requests

URL = "https://api.omnia.tax/v1/paycheck"
HEADERS = {"Authorization": f"Bearer {os.environ['OMNIA_KEY']}"}

paycheck = {
    "checkDate": "2026-09-15",
    "payFrequency": "biweekly",
    "earnings": [{"code": "REG", "category": "regular", "amount": 300000}],
    "deductions": [],
    "federalW4": {"filingStatus": "single", "multipleJobs": False,
                  "dependentCredit": 0, "otherIncome": 0,
                  "deductions": 0, "extraWithholding": 0},
    "ytd": {"socialSecurity": 0, "medicare": 0, "futa": 0},
    "workState": {"code": "TX", "certificate": {}},
}

resp = requests.post(URL, json=paycheck, headers=HEADERS, timeout=30)
if resp.status_code == 422:
    for problem in resp.json().get("details", []):
        print(problem["path"], "-", problem["message"])
    raise SystemExit(1)
if resp.status_code == 429:
    raise SystemExit(f"slow down; retry in {resp.headers['Retry-After']}s")
resp.raise_for_status()

result = resp.json()["result"]
for tax in result["taxes"]:
    print(f"{tax['id']:<14}{tax['payer']:<10}{tax['amount'] / 100:>10.2f}")
print("net pay", result["netPay"] / 100)`)],
      ['What it prints', p(`Run against the Texas paycheck above, the loop prints one row per line, and the last line reads <code>net pay ${(tx.netPay / 100).toFixed(2)}</code>. Federal income tax is ${money(line(tx, 'US_FIT')!.amount)}, Social Security ${money(line(tx, 'US_SS_EE')!.amount)} and Medicare ${money(line(tx, 'US_MED_EE')!.amount)}.`)],
      ['Notes for production', ul([
        'Keep amounts as integers all the way through. Divide by 100 only when you print.',
        'Set a timeout, and retry a <code>429</code> after the number of seconds in <code>Retry-After</code>.',
        'Log the <code>X-Request-Id</code> response header with every call so a problem can be traced.',
        'The call is stateless, so a retry after a network failure is safe: it returns the same answer.',
      ])],
      ['Next', p(`Add the employee's real W-4 answers, their year-to-date wages and the right <code>workState</code>. The <a href="/payroll-tax-api-javascript-example">JavaScript example</a> does the same in Node, and the <a href="/payroll-tax-api-integration-guide">integration guide</a> covers the order of work.`)],
    ],
    faq: [
      { q: 'How do I call a payroll tax API from Python?', a: 'Send a POST with the requests library to https://api.omnia.tax/v1/paycheck with a JSON body and an Authorization: Bearer header, then read result.taxes and result.netPay from the JSON response.' },
      { q: 'Should I convert cents to dollars in Python?', a: 'Keep integers for all arithmetic and divide by 100 only for display. That avoids floating-point rounding errors in totals.' },
    ],
    related: ['/payroll-tax-api-javascript-example', '/payroll-tax-api-curl-example', '/payroll-tax-api-error-codes', '/payroll-tax-api-integration-guide'],
  }));

  add(def({
    path: '/payroll-tax-api-javascript-example', label: 'Payroll tax API JavaScript example', group: 'Developers',
    title: "Payroll tax API JavaScript example for Node",
    description: 'A working JavaScript example that calls a payroll tax API with fetch: send the paycheck, read the tax lines, handle 422 and 429, and keep the key server-side.',
    h1: 'Payroll tax API: a JavaScript example',
    sub: 'Calculate a paycheck from Node with fetch.',
    lead: p(`This example uses the built-in <code>fetch</code> in Node 18 and later. Call the API from your server, never from a browser page, because a bearer key in front-end code is a key anyone can copy.`),
    sections: [
      ['The call', code(h, `const res = await fetch("https://api.omnia.tax/v1/paycheck", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.OMNIA_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    checkDate: "2026-09-15",
    payFrequency: "biweekly",
    earnings: [{ code: "REG", category: "regular", amount: 300000 }],
    deductions: [],
    federalW4: { filingStatus: "single", multipleJobs: false,
      dependentCredit: 0, otherIncome: 0, deductions: 0, extraWithholding: 0 },
    ytd: { socialSecurity: 0, medicare: 0, futa: 0 },
    workState: { code: "TX", certificate: {} },
  }),
});

if (res.status === 422) {
  const { details = [] } = await res.json();
  for (const d of details) console.error(d.path, "-", d.message);
  process.exit(1);
}
if (res.status === 429) throw new Error(\`retry in \${res.headers.get("Retry-After")}s\`);
if (!res.ok) throw new Error(\`HTTP \${res.status}\`);

const { result } = await res.json();
for (const t of result.taxes) console.log(t.id, t.payer, t.amount);
console.log("net pay (cents):", result.netPay);`)],
      ['What you get', p(`For this paycheck <code>result.netPay</code> is <code>${tx.netPay}</code> cents (${money(tx.netPay)}). The first lines of <code>result.taxes</code> are ${tx.taxes.slice(0, 3).map((t) => `<code>${t.id}</code> (${t.amount})`).join(', ')}.`)],
      ['Practical points', ul([
        'Do the arithmetic in integer cents. <code>0.1 + 0.2</code> is the reason.',
        'Read <code>result.notices</code> and <code>result.warnings</code> if present and surface them to a reviewer.',
        'Type the response with a client generated from the <a href="/payroll-tax-api-openapi">OpenAPI document</a> if you use TypeScript.',
        'Use a <a href="/payroll-tax-api-test-keys">test key</a> in development and CI; it is never billed.',
      ])],
    ],
    faq: [
      { q: 'How do I call a payroll tax API from Node.js?', a: 'Use fetch to POST a JSON paycheck to https://api.omnia.tax/v1/paycheck with an Authorization: Bearer header, then read result.taxes and result.netPay from the response.' },
      { q: 'Can I call the API from browser JavaScript?', a: 'Avoid it. A bearer key in front-end code can be copied by any visitor. Call the API from your server and expose only what your page needs.' },
    ],
    related: ['/payroll-tax-api-python-example', '/payroll-tax-api-curl-example', '/payroll-tax-api-authentication', '/payroll-tax-api-integration-guide'],
  }));

  add(def({
    path: '/payroll-tax-api-curl-example', label: 'Payroll tax API cURL example', group: 'Developers',
    title: 'Payroll tax API cURL example: copy, paste, run',
    description: 'A copy-and-paste cURL example for a payroll tax API: a Texas paycheck, a California paycheck and a Columbus, Ohio paycheck, with the net pay each returns.',
    h1: 'Payroll tax API: a cURL example',
    sub: 'The quickest way to see what the API returns.',
    lead: p(`cURL needs no setup beyond a key. Set <code>KEY</code> to a test key, paste a request, and read the answer. Three requests follow, with the net pay each returns, so you can confirm your own run matches.`),
    sections: [
      ['Texas: no state income tax', code(h, h.CURL('TX', '')) + p(`Net pay on ${money(tx.grossPay)} is <strong>${money(tx.netPay)}</strong>.`)],
      ['California: state tax and disability insurance', code(h, h.CURL('CA', '')) + p(`The same pay in California returns net pay of <strong>${money(ca.netPay)}</strong>. The difference from Texas is ${money(tx.netPay - ca.netPay)}, made up of ${ca.taxes.filter((t) => t.id.startsWith('CA_') && t.payer === 'employee' && t.amount > 0).map((t) => `${h.esc(t.name)} ${money(t.amount)}`).join(' and ')}.`)],
      ['Columbus, Ohio: state and city', code(h, h.CURL('OH', ', "certificate": { "residenceCity": "Columbus", "workCity": "Columbus" }')) + p(`Net pay is <strong>${money(oh.netPay)}</strong>, after Ohio income tax and Columbus city income tax.`)],
      ['Reading the output', p(`Pipe the response through <code>jq</code> to see the lines on their own:`) + code(h, `curl -s https://api.omnia.tax/v1/paycheck \\
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \\
  -d @paycheck.json | jq '.result.taxes[] | {id, payer, amount}'`) + p(`Add <code>-i</code> to see the <code>RateLimit-Remaining</code> and <code>X-Request-Id</code> headers.`)],
    ],
    faq: [
      { q: 'How do I test a payroll tax API with cURL?', a: 'Set an environment variable KEY to a test key, then POST a JSON paycheck to https://api.omnia.tax/v1/paycheck with an Authorization: Bearer header and a Content-Type of application/json.' },
      { q: 'Where do I get a key to try?', a: 'Create a free test key from your account. Test keys use the same engine and data as live keys, need no card and are never billed.' },
    ],
    related: ['/payroll-tax-api-test-keys', '/payroll-tax-api-python-example', '/payroll-tax-api-javascript-example', '/sandbox'],
  }));

  add(def({
    path: '/payroll-tax-api-error-codes', label: 'Payroll tax API error codes', group: 'Developers',
    title: 'Payroll tax API error codes and how to handle them',
    description: "Every error code the payroll tax API returns, its status, what it means and what your code should do: invalid_input, cannot_compute, rate_limited and more.",
    h1: 'Payroll tax API error codes',
    sub: 'Branch on the code, show the message.',
    lead: p(`Every error body has the same shape: a <code>error</code> message written for a person, a <code>code</code> that is stable enough to branch on, a <code>requestId</code> to quote to support, and for validation failures a <code>details</code> array. Your code should switch on <code>code</code>, never on the message text.`),
    sections: [
      ['Codes your integration will meet', kv(h, ['Code', 'Status and what to do'], [
        ['<code>invalid_json</code>', '400. The body is not valid JSON. Fix the serialiser.'],
        ['<code>invalid_input</code>', '422. A field failed validation. Read <code>details</code>, which names each path and reason.'],
        ['<code>unsupported_tax_year</code>', '422. The check date is in a year with no rules. Use a date in a supported year; <a href="/payroll-tax-api-effective-dating">see effective dating</a>.'],
        ['<code>cannot_compute</code>', '422. The input is valid but the engine needs more, and the message names the missing certificate field. Collect that answer and retry.'],
        ['<code>missing_key</code>', '401. No <code>Authorization</code> header was sent.'],
        ['<code>invalid_key</code>', '401. The key is not recognised or has been revoked.'],
        ['<code>expired_key</code>', '401. The key has expired. Issue a new one.'],
        ['<code>payment_method_required</code>', '402. A live key needs a payment method on file, or the subscription is cancelled or suspended.'],
        ['<code>rate_limited</code>', '429. Wait <code>Retry-After</code> seconds and retry.'],
        ['<code>test_daily_limit</code>', '429. A test key reached its daily cap of 500. It resets at midnight UTC; a live key has no daily cap.'],
        ['<code>cannot_gross_up</code>', '422, on the net-to-gross endpoint. No amount of that earning can reach the target.'],
      ])],
      ['A retry rule that works', ul([
        'Retry <code>429</code> after <code>Retry-After</code>, and any network failure, because calls are stateless.',
        'Never retry <code>400</code>, <code>401</code> or <code>422</code> unchanged. The same request will fail the same way.',
        'Treat <code>402</code> as a billing problem for a person to fix, not something to retry in a loop.',
      ])],
      ['Example', p(`Sending <code>3000.5</code> instead of cents returns:`) + code(h, `HTTP/1.1 422
{
  "error": "The request did not pass validation.",
  "code": "invalid_input",
  "details": [{ "path": "earnings[0].amount",
    "message": "must be integer cents, not 3000.5 — send whole cents (e.g. 300050 for $3,000.50), never dollars." }],
  "requestId": "req_01J9Z6Q8X3"
}`)],
    ],
    faq: [
      { q: 'What does cannot_compute mean?', a: 'The request is valid, but the engine needs an answer it was not given, usually a field on a state withholding certificate. The error message names the missing field.' },
      { q: 'Should I retry a 422?', a: 'Not unchanged. A 422 means the input needs to change, so fix the fields named in details or supply the missing certificate answer first.' },
      { q: 'How do I report a problem?', a: 'Quote the requestId from the error body, or the X-Request-Id response header, when you contact support.' },
    ],
    related: ['/payroll-tax-api-rate-limits', '/payroll-tax-api-authentication', '/payroll-tax-api-json-schema', '/payroll-tax-api-integration-guide'],
  }));

  add(def({
    path: '/payroll-tax-api-rate-limits', label: 'Payroll tax API rate limits', group: 'Developers',
    title: 'Payroll tax API rate limits: headers, 429s, retries',
    description: 'How rate limiting works on the payroll tax API: per-minute limits, RateLimit headers, Retry-After on a 429, test-key caps of 30 a minute and 500 a day.',
    h1: 'Payroll tax API rate limits',
    sub: 'What the limits are, how to see them, and how to back off.',
    lead: p(`Rate limits protect the service and tell you how fast you can safely call it. Omnia.tax limits calls per minute for every key, and caps test keys per day as well. The limits are visible on every response, so a client never has to guess.`),
    sections: [
      ['Test keys', kv(h, ['Limit', 'Value'], [
        ['Per minute', '30 requests'],
        ['Per day (UTC)', '500 requests'],
        ['Billed', 'Never'],
      ])],
      ['Live keys', p(`A live key has a higher per-minute limit and no daily cap. Billing is $0.08 per paycheck calculation after the 14-day trial, so volume is limited by speed, not by a quota you must buy in advance.`)],
      ['What a response tells you', ul([
        '<code>RateLimit-Limit</code>: calls allowed in the window.',
        '<code>RateLimit-Remaining</code>: calls left in this window.',
        '<code>Retry-After</code>: on a <code>429</code>, the seconds to wait.',
      ])],
      ['Backing off', code(h, `async function calc(body, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(URL, { method: "POST", headers, body: JSON.stringify(body) });
    if (res.status !== 429) return res;
    const wait = Number(res.headers.get("Retry-After") ?? 1);
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
  throw new Error("still rate limited");
}`) + p(`For a payroll run, send calls through a small queue sized to your limit, not all at once. A run of ${(500).toLocaleString('en-US')} paychecks at 30 a minute on a test key takes about 17 minutes; ask for a live key when you need to run at production speed.`)],
    ],
    faq: [
      { q: 'What are the rate limits on test keys?', a: '30 requests a minute and 500 a day. The daily cap resets at midnight UTC. Test calls are never billed.' },
      { q: 'What do I do on a 429?', a: 'Wait the number of seconds in the Retry-After header, then retry. Calls are stateless, so a retry returns the same answer.' },
      { q: 'Is there a daily limit on live keys?', a: 'No. Live keys have no daily cap, only a per-minute limit.' },
    ],
    related: ['/payroll-tax-api-error-codes', '/payroll-tax-api-test-keys', '/payroll-tax-api-pricing', '/payroll-tax-api-integration-guide'],
  }));

  add(def({
    path: '/payroll-tax-api-authentication', label: 'Payroll tax API authentication', group: 'Developers',
    title: 'Payroll tax API authentication: bearer keys, test vs live',
    description: 'How authentication works on the payroll tax API: a bearer key in the Authorization header, sk_test and sk_live keys, how to store them and what 401 means.',
    h1: 'Payroll tax API authentication',
    sub: 'One header, two kinds of key.',
    lead: p(`The API authenticates with a bearer key sent in the <code>Authorization</code> header. There is no OAuth dance and no signature to compute. What matters is which kind of key you hold and where you keep it.`),
    sections: [
      ['The header', code(h, 'Authorization: Bearer sk_test_…')],
      ['Two kinds of key', kv(h, ['Key', 'Use'], [
        ['<code>sk_test_…</code>', 'Development and CI. Same engine and data as live. Never billed. 30 requests a minute, 500 a day.'],
        ['<code>sk_live_…</code>', 'Production. Billed at $0.08 per paycheck calculation after the 14-day trial. Needs a payment method on file.'],
      ])],
      ['Keeping a key safe', ul([
        'Read it from an environment variable or a secrets manager. Never commit it.',
        'Call the API from your server. A key in browser code can be copied by anyone who opens the page.',
        'Use separate keys for separate environments so one can be revoked without breaking the others.',
        'The full key is shown once when it is issued, and only a hash is stored. Only a short prefix is shown afterwards.',
        'A test key expires after 90 days. A new key replaces the previous key of the same kind and never the other kind.',
        'Every response from an accepted key carries an <code>Omnia-Mode</code> header, <code>live</code> or <code>test</code>, so you can see which kind you used.',
      ])],
      ['What the 401s mean', kv(h, ['Code', 'Meaning'], [
        ['<code>missing_key</code>', 'No <code>Authorization: Bearer</code> header was sent.'],
        ['<code>invalid_key</code>', 'The key is not recognised or was revoked.'],
        ['<code>expired_key</code>', 'The key has passed its expiry. Issue a new one.'],
      ]) + p(`A <code>402</code> with <code>payment_method_required</code> is different: the key is valid, but a live key needs a payment method or an active subscription. Check which key you are using with <code>GET /v1/me</code>, which returns the key's details and recent usage.`)],
    ],
    faq: [
      { q: 'How do I authenticate to the payroll tax API?', a: 'Send your key as a bearer token in the Authorization header: the word Bearer, a space, then the key. Test keys start sk_test_ and live keys start sk_live_.' },
      { q: 'Can I put the key in front-end code?', a: 'No. Anyone who opens the page could copy it. Call the API from your server.' },
    ],
    related: ['/payroll-tax-api-test-keys', '/payroll-tax-api-error-codes', '/rest-api-payroll-taxes', '/payroll-tax-api-rate-limits'],
  }));

  add(def({
    path: '/payroll-tax-api-test-environment', label: 'Payroll tax API test environment', group: 'Developers',
    title: 'Payroll tax API test environment: try it free',
    description: 'A payroll tax API test environment that runs the real engine: a browser calculator that shows the JSON and cURL it sent, plus free test keys for your own code.',
    h1: 'Payroll tax API test environment',
    sub: 'Two ways to try the real engine before you spend anything.',
    lead: p(`Many test environments return canned data. This one does not. The browser calculator and the test keys run the same engine and the same rule files as production, so a number you see while testing is a number you will see live.`),
    sections: [
      ['The browser calculator', p(`The <a href="/sandbox">calculator</a> takes an address or a state, pay, a Form W-4 and deductions, and shows every tax line with a one-line explanation. It also shows the exact request it sent, as JSON and as cURL, so you can paste it into your own code and get the same answer.`)],
      ['Test keys', p(`A <a href="/payroll-tax-api-test-keys">test key</a> lets your own code call the API. It needs no card and is never billed. It is capped at 30 requests a minute and 500 a day, which is plenty for development and for a CI run.`)],
      ['What a test environment should let you check', ul([
        `A no-income-tax state. Texas on ${money(tx.grossPay)} biweekly returns net pay of ${money(tx.netPay)}.`,
        `A state with disability insurance. California on the same pay returns ${money(ca.netPay)}.`,
        `A city tax. Columbus, Ohio returns ${money(oh.netPay)}.`,
        'A validation failure, by sending a decimal amount, to see your error handling work.',
        'A year-to-date cap, by sending a Social Security year-to-date figure near the wage base.',
      ])],
      ['Moving to production', p(`Switching from a test key to a live key changes only the key. The endpoint, the request and the rules are identical. See <a href="/payroll-tax-api-integration-guide">the integration guide</a> for the order to build in.`)],
    ],
    faq: [
      { q: 'Is the test data real?', a: 'Yes. The browser calculator and test keys use the same engine and rule files as live keys, so the figures match what production returns.' },
      { q: 'Does the test environment cost anything?', a: 'No. The browser calculator needs no key once you are signed in, and test keys are never billed.' },
    ],
    related: ['/payroll-tax-api-test-keys', '/sandbox', '/payroll-tax-api-curl-example', '/payroll-tax-api-integration-guide'],
  }));

  add(def({
    path: '/payroll-tax-api-integration-guide', label: 'Payroll tax API integration guide', group: 'Developers',
    title: 'Payroll tax API integration guide: build order and checks',
    description: "How to integrate a payroll tax API into payroll or HR software: order of work, what to store, how to test against known paychecks and what to check at go-live.",
    h1: 'Payroll tax API integration guide',
    sub: 'The order that avoids rework.',
    lead: p(`Integrating a payroll tax API is mostly about the data you hand it, not the call itself. The call is one POST. The work is making sure your system can supply the right facts for each paycheck. This is the order that avoids going back.`),
    sections: [
      ['1. Resolve where each employee works and lives', p(`Local tax depends on addresses, so start there. <code>POST /v1/address</code> turns a one-line work address (and a home address if different) into the state, the local jurisdictions and the certificate fields a paycheck needs. Store the result on the employee record and refresh it when an address changes.`)],
      ['2. Collect the certificates', p(`Federal income tax needs the Form W-4. Many states need their own certificate. If a state needs an answer you did not collect, the API returns <code>cannot_compute</code> and names the field, so you can add it to your onboarding form.`)],
      ['3. Categorise earnings and deductions', p(`Each earning has a category and each deduction has a tax treatment. The category decides which taxes it touches: a 401(k) deferral lowers income tax wages but not Social Security wages, a Section 125 premium lowers both. See <a href="/pre-tax-deduction-tax-treatment">how deductions are treated tax by tax</a>.`)],
      ['4. Track year-to-date wages', p(`Send the year-to-date figures with each call. They are how the Social Security wage base (${dollars(f.ssBase26)} in 2026) and the Additional Medicare threshold stop and start at the right check. See <a href="/payroll-tax-api-ytd-wages">year-to-date wages</a>.`)],
      ['5. Test against known paychecks', p(`Take ten real paychecks from your current system and run them. Differences are worth reading: the <code>detail</code> field on each line explains how a figure was reached. Keep the requests as fixtures and rerun them whenever you upgrade.`)],
      ['6. Handle errors and limits', p(`Branch on <code>code</code>, retry <code>429</code> after <code>Retry-After</code>, and log <code>X-Request-Id</code>. See <a href="/payroll-tax-api-error-codes">the error codes</a>.`)],
      ['7. Decide who files', p(`The API calculates. Filing returns and depositing tax stay with you or your payroll provider. Settle that before launch so nobody assumes otherwise.`)],
    ],
    faq: [
      { q: 'What do I need to integrate a payroll tax API?', a: 'Employee work and home addresses, the Form W-4 and any state certificate answers, categorised earnings and deductions, and year-to-date wages. The API call itself is a single POST.' },
      { q: 'How do I test the integration?', a: 'Run known paychecks from your current system through a test key, read the detail text on any line that differs, and keep the requests as fixtures to rerun after upgrades.' },
    ],
    related: ['/payroll-tax-api-for-developers', '/payroll-tax-api-ytd-wages', '/embedded-payroll-tax-engine', '/payroll-tax-api-test-environment'],
  }));

  add(def({
    path: '/payroll-tax-api-response-fields', label: 'Payroll tax API response fields', group: 'Developers',
    title: 'Payroll tax API response fields explained',
    description: 'Every field in a payroll tax API paycheck response explained: taxes, payer, jurisdiction, taxableWages, amount, detail, totals, netPay, notices and warnings.',
    h1: 'Payroll tax API response fields',
    sub: 'What each field in the paycheck response means.',
    lead: p(`A paycheck response is small, and every field earns its place. Here is what each one means, with values from a real run: an employee in Columbus, Ohio paid ${money(oh.grossPay)} biweekly.`),
    sections: [
      ['Totals', kv(h, ['Field', 'Value in the example'], [
        ['<code>grossPay</code>', `${oh.grossPay} (${money(oh.grossPay)})`],
        ['<code>pretaxDeductions</code>', `${oh.pretaxDeductions}`],
        ['<code>posttaxDeductions</code>', `${oh.posttaxDeductions}`],
        ['<code>employeeTaxTotal</code>', `${oh.employeeTaxTotal} (${money(oh.employeeTaxTotal)})`],
        ['<code>employerTaxTotal</code>', `${oh.employerTaxTotal} (${money(oh.employerTaxTotal)}), not taken from the employee`],
        ['<code>netPay</code>', `${oh.netPay} (${money(oh.netPay)})`],
      ]) + p(`The identity to test: <code>netPay = grossPay − pretaxDeductions − employeeTaxTotal − posttaxDeductions</code>. Here ${money(oh.grossPay)} − ${money(oh.pretaxDeductions)} − ${money(oh.employeeTaxTotal)} − ${money(oh.posttaxDeductions)} = ${money(oh.netPay)}.`)],
      ['A tax line', kv(h, ['Field', 'Meaning'], [
        ['<code>id</code>', 'A stable identifier, such as <code>US_FIT</code> or <code>OH_LOCAL</code>.'],
        ['<code>name</code>', 'A name suitable for a pay stub.'],
        ['<code>payer</code>', '<code>employee</code> (withheld from pay) or <code>employer</code> (a cost on top).'],
        ['<code>jurisdiction</code>', 'Federal, state or local.'],
        ['<code>taxableWages</code>', 'The wages this tax was applied to, which can differ from gross.'],
        ['<code>amount</code>', 'The tax, in cents.'],
        ['<code>detail</code>', 'One sentence on how the amount was reached.'],
      ])],
      ['The lines in the example', taxTable(h, oh)],
      ['Optional fields', ul([
        '<code>notices</code>: lines resting on a weaker source than the levying body\'s own form, each with the tax id, a tier and a note.',
        '<code>warnings</code>: inputs that need a second look, and provisional-year notices.',
        '<code>electiveDeferrals</code>: what stayed pre-tax after the annual retirement limits.',
      ])],
    ],
    faq: [
      { q: 'What is the difference between taxableWages and grossPay?', a: 'grossPay is total earnings. taxableWages is the amount a particular tax was applied to, after deductions that are pre-tax for that tax and after any cap, so it can differ from line to line.' },
      { q: 'Why is employerTaxTotal not part of net pay?', a: 'Employer taxes are a cost the employer pays on top of gross pay. They are never deducted from the employee, so net pay ignores them.' },
    ],
    related: ['/json-payroll-tax-api', '/payroll-tax-api-explainable-tax-lines', '/payroll-tax-api-data-quality-notices', '/payroll-tax-calculation-api'],
  }));

  add(def({
    path: '/payroll-tax-api-effective-dating', label: 'Payroll tax API effective dating', group: 'Developers',
    title: "Payroll tax effective dating: the check date sets the year",
    description: "How effective-dated payroll tax rules work: the check date selects the tax year, corrections use the original year, and a year with no rules returns an error.",
    h1: 'Payroll tax API effective dating',
    sub: 'Rules belong to a date. The check date chooses which.',
    lead: p(`Tax rules are not timeless. Wage bases, brackets and rates change each January, and some change mid-year. A payroll tax API that holds only today's rules gives wrong answers for yesterday's paycheck. Omnia.tax holds rules by effective date and lets the <code>checkDate</code> on the request choose.`),
    sections: [
      ['Why the check date, not the pay period', p(`Payroll tax follows when wages are paid, not when they were earned. A paycheck dated 2026-01-02 for work done in December 2025 is taxed under 2026 rules. So the request carries <code>checkDate</code> and nothing else decides the year.`)],
      ['What changes with the year', kv(h, ['Figure', '2026', '2027'], [
        ['Social Security wage base', dollars(f.ssBase26), dollars(f.ssBase27)],
        ['Social Security employee rate', h.pct(f.ssRate), h.pct(f.ssRate)],
        ['Medicare employee rate', h.pct(f.medicare), h.pct(f.medicare)],
        ['Additional Medicare tax above', dollars(f.addlThreshold), dollars(f.addlThreshold)],
      ]).replace(/<th>2026<\/th>/, '<th>2026</th>'), ],
      ['Corrections and back pay', p(`A correction to an earlier year's paycheck must use that year's tables. Send the original check date and the engine applies that year's rules. A run in the next year for last year's pay does not silently use new numbers.`)],
      ['A year without rules', p(`If the check date falls in a year the engine has no rules for, the API returns <code>422</code> with the code <code>unsupported_tax_year</code> instead of guessing. <code>GET /v1/states?year=2027</code> lists which states have rules for a given year. Years that are provisional carry a note in <code>warnings</code>.`)],
      ['Mid-year changes', p(`When a state revises a formula during the year, the rule file carries an effective date, so checks dated before it keep the old method and checks after it use the new one. The <a href="/changelog">changelog</a> records the changes.`)],
    ],
    faq: [
      { q: 'Which year does the API use for a paycheck?', a: 'The year of the checkDate on the request. The pay period dates do not decide it.' },
      { q: 'Can I run a correction for last year?', a: 'Yes. Send the original check date and the engine applies that year\'s rules, so the correction ties to what should have been withheld then.' },
      { q: 'What happens if there are no rules for the year?', a: 'The API returns 422 with unsupported_tax_year rather than using another year\'s numbers.' },
    ],
    related: ['/payroll-tax-api-error-codes', '/social-security-wage-base', '/payroll-tax-rates-2026', '/payroll-tax-api-for-developers'],
  }));

  add(def({
    path: '/payroll-tax-api-ytd-wages', label: 'Payroll tax API year-to-date wages', group: 'Developers',
    title: 'Payroll tax API year-to-date wages: caps and thresholds',
    description: 'How year-to-date wages drive payroll tax caps: the Social Security wage base, the Additional Medicare threshold and FUTA, with a worked paycheck at the cap.',
    h1: 'Payroll tax API year-to-date wages',
    sub: 'Why each call carries the year so far, and what happens at the caps.',
    lead: p(`Some payroll taxes stop partway through the year, and one starts partway through. To know where a paycheck sits against those lines, the engine needs to know what the employee has been paid so far. Omnia.tax is stateless, so you send that on every call in the <code>ytd</code> object.`),
    sections: [
      ['The fields', kv(h, ['Field', 'Used for'], [
        ['<code>ytd.socialSecurity</code>', `Wages already subject to Social Security this year, against the ${dollars(f.ssBase26)} wage base in 2026.`],
        ['<code>ytd.medicare</code>', `Medicare wages so far, which decide when Additional Medicare tax starts at ${dollars(f.addlThreshold)}.`],
        ['<code>ytd.futa</code>', 'Wages already counted for federal unemployment tax.'],
      ])],
      ['A paycheck at the cap', (() => {
        const ssCap = Math.round(f.ssBase26 * 100);
        const c = run(inp(h, 'TX', {}, 1_000_000, { ytd: { socialSecurity: ssCap - 400_000, medicare: 0, futa: 0 } }));
        const free = run(inp(h, 'TX', {}, 1_000_000));
        return p(`An employee paid ${money(1_000_000)} in a check, with ${money(ssCap - 400_000)} already counted this year, has only ${money(400_000)} left under the ${money(ssCap)} base. The engine taxes just that part:`) + pick(h, c, ['US_SS_EE', 'US_SS_ER', 'US_MED_EE']) + p(`With no year-to-date wages the same check would owe Social Security of ${money(line(free, 'US_SS_EE')!.amount)}; at the cap it owes ${money(line(c, 'US_SS_EE')!.amount)}. Medicare has no cap, so it is unchanged at ${money(line(c, 'US_MED_EE')!.amount)}.`);
      })()],
      ['Why it is on every request', p(`Stateless calls mean a retry or a replay for an audit returns the identical answer, and nothing in the service can drift from your books. The cost is that your payroll system is the record of year-to-date wages, which it already is.`)],
      ['Getting it right', ul([
        'Start the year at zero on the first check dated in that year.',
        'Add the wages from each check you have run, per the tax: Social Security wages exclude section 125 premiums, for example.',
        'When an employee joins mid-year from another employer, only wages from your payroll count toward your caps unless the law says otherwise.',
      ])],
    ],
    faq: [
      { q: 'Why does the API need year-to-date wages?', a: 'Social Security stops at a wage base and Additional Medicare starts above a threshold. Knowing the year so far lets the engine tax only the part of a check that is still under or over the line.' },
      { q: 'Does the API store year-to-date totals?', a: 'No. Calls are stateless. You send the year-to-date figures with each request, so a replay returns the same answer.' },
    ],
    related: ['/social-security-wage-cap-paycheck', '/additional-medicare-tax-withholding', '/social-security-wage-base', '/payroll-tax-api-integration-guide'],
  }));

  add(def({
    path: '/payroll-tax-api-explainable-tax-lines', label: 'Explainable payroll tax lines', group: 'Developers',
    title: 'Explainable payroll tax lines: audit every figure',
    description: 'Why every payroll tax line should say how it was reached, and how the detail field lets a payroll specialist audit a withholding figure without reading code.',
    h1: 'Explainable payroll tax lines',
    sub: 'A figure you cannot explain is a figure you cannot defend.',
    lead: p(`A payroll tax number with no reasoning attached is hard to trust and impossible to dispute. When an employee asks why their withholding changed, or an auditor asks how a figure was reached, "the system said so" is not an answer. Each Omnia.tax tax line carries a <code>detail</code> sentence that states the method and the intermediate numbers.`),
    sections: [
      ['What the detail says', p(`For the Columbus, Ohio paycheck of ${money(oh.grossPay)}, the federal income tax line reads:`) + `<blockquote>${h.esc(line(oh, 'US_FIT')!.detail ?? '')}</blockquote>` + p(`That is the whole calculation: the annualised wages, the adjusted wages after the filing-status adjustment, the bracket, the tentative annual tax and the number of pay periods it was divided by. Check it against IRS Publication 15-T and it ties.`)],
      ['Other lines explain themselves too', ul(oh.taxes.filter((t) => t.amount > 0 && t.payer === 'employee' && t.detail && t.id !== 'US_FIT').slice(0, 4).map((t) => `<strong>${h.esc(t.name)}</strong> (${money(t.amount)}): <em>${h.esc(t.detail ?? '')}</em>`))],
      ['Who uses it', ul([
        '<strong>Payroll specialists</strong> reconciling the engine against a legacy system line by line.',
        '<strong>Support teams</strong> answering "why is my check lower this week".',
        '<strong>Auditors</strong> who want the method, not just the result.',
        '<strong>Developers</strong> who need to show a user the reason, not only the number.',
      ])],
      ['When the source is weaker', p(`Not every rate has the same quality of source. Where a rate rests on something weaker than the levying body's own form, the response adds a <code>notices</code> entry naming the tax and the tier. See <a href="/payroll-tax-api-data-quality-notices">data quality notices</a>.`)],
    ],
    faq: [
      { q: 'What is an explainable payroll tax line?', a: 'A tax line that states how its amount was reached: the method, the wages it applied to and the intermediate figures, so a person can audit it.' },
      { q: 'Can I show the detail text to employees?', a: 'Yes. It is plain language written for payroll specialists, and you can show it on a pay stub explanation or in a support tool.' },
    ],
    related: ['/payroll-tax-api-response-fields', '/payroll-tax-api-data-quality-notices', '/payroll-tax-calculation-engine', '/payroll-tax-audit-withholding-check'],
  }));

  add(def({
    path: '/payroll-tax-api-data-quality-notices', label: 'Payroll tax data quality notices', group: 'Developers',
    title: "Payroll tax data quality notices and source tiers",
    description: "How the payroll tax API flags a rate resting on a weaker source than the levying body's own form, the tiers it uses and what your product should do with them.",
    h1: 'Payroll tax data quality notices',
    sub: 'Honest about which numbers are firm and which need a second look.',
    lead: p(`Most tax rates can be read straight from the government body that levies them. A few cannot: a city that publishes a rate only in a council minute, a county table that conflicts with another source. A tax engine can hide that or say it. Omnia.tax says it, in a <code>notices</code> array on the response, so your product can decide what to do.`),
    sections: [
      ['What a notice contains', ul([
        '<code>taxId</code>: which line the notice is about.',
        '<code>tier</code>: how the rate is sourced, for example <code>secondary_source</code>, <code>inferred</code>, <code>not_modelled</code> or <code>conflicting_sources</code>.',
        '<code>note</code>: a sentence in plain language.',
      ])],
      ['What to do with it', ul([
        'Show a small flag next to the line in a payroll preview, so the person approving the run can see it.',
        'Route paychecks with a notice to a review queue if your process needs a second pair of eyes.',
        'Log the notice with the calculation so an audit can see what was known at the time.',
        'Do not drop the paycheck. A notice is information, not an error.',
      ])],
      ['Why this beats silence', p(`An engine that returns a confident number for every town looks complete and is quietly wrong in the places where nobody has checked. An engine that says "this rate is from a municipal league survey, not the town's ordinance" lets you verify it once and move on. That is the behaviour a payroll team can build a process around.`)],
      ['Related signals', p(`<code>warnings</code> are separate: they flag inputs that need a second look and provisional-year notices. Coverage is published openly on the <a href="/coverage">coverage page</a>, including which states have local tax listed in full and which are partial.`)],
    ],
    faq: [
      { q: 'What is a data quality notice?', a: 'A notice on a paycheck response saying a tax line rests on a weaker source than the levying body\'s own form, with the tax id, how it is sourced and a plain-language note.' },
      { q: 'Does a notice mean the number is wrong?', a: 'No. It means the source is weaker than ideal and worth verifying once. The number is still the engine\'s best result.' },
    ],
    related: ['/payroll-tax-api-explainable-tax-lines', '/payroll-tax-data-sources', '/local-payroll-tax-api', '/coverage'],
  }));

  add(def({
    path: '/payroll-tax-mcp-tools', label: 'Payroll tax MCP tools', group: 'Developers',
    title: 'Payroll tax MCP tools for AI agents and assistants',
    description: "The six tools the Omnia.tax MCP server gives an AI agent: calculate_paycheck, compare_paychecks, gross_up, employer_taxes, lookup_address, coverage.",
    h1: 'Payroll tax MCP tools',
    sub: 'What an AI agent can do once it is connected.',
    lead: p(`Model Context Protocol lets an AI assistant call a tool instead of guessing. Language models are poor at payroll arithmetic and worse at knowing which rate applies in which town. Connecting one to the Omnia.tax MCP server gives it the engine itself, so the answer it gives is the one the API returns.`),
    sections: [
      ['The tools', kv(h, ['Tool', 'What it does', 'Billing'], [
        ['<code>calculate_paycheck</code>', 'One paycheck: every tax line and net pay.', 'One paycheck'],
        ['<code>compare_paychecks</code>', 'Two paychecks and why they differ.', 'Two paychecks'],
        ['<code>gross_up</code>', 'The gross pay that leaves a target take-home amount.', 'One paycheck'],
        ['<code>employer_taxes</code>', 'Quarterly New York MCTMT and Nevada MBT.', 'None'],
        ['<code>lookup_address</code>', 'State, local jurisdictions and certificate for an address.', 'None'],
        ['<code>coverage</code>', 'What the engine covers.', 'None'],
      ]).replace(/text-align:right/g, 'text-align:left')],
      ['How it connects', p(`The server is the <code>POST /mcp</code> endpoint, speaking JSON-RPC 2.0 over streamable HTTP. It supports <code>initialize</code>, <code>ping</code>, <code>tools/list</code> and <code>tools/call</code>, and authenticates with the same bearer key as the REST API. See <a href="/mcp-payroll-tax-server">the MCP server page</a> for setup.`)],
      ['Why an agent should call it', p(`Ask a model what a ${money(oh.grossPay)} biweekly check in Columbus, Ohio nets and it will estimate. Call the tool and the answer is ${money(oh.netPay)}, with federal income tax of ${money(line(oh, 'US_FIT')!.amount)} and a line for the city tax. The estimate and the engine can differ by tens of dollars on a single check.`)],
      ['Use a test key first', p(`An agent can loop faster than a person. Give it a <a href="/payroll-tax-api-test-keys">test key</a> while you build, because it is never billed and capped at 30 requests a minute.`)],
    ],
    faq: [
      { q: 'What tools does the MCP server expose?', a: 'calculate_paycheck, compare_paychecks, gross_up, employer_taxes, lookup_address and coverage.' },
      { q: 'How are MCP tool calls billed?', a: 'Like the matching REST endpoint: one paycheck for calculate_paycheck and gross_up, two for compare_paychecks, and nothing for employer_taxes, lookup_address or coverage.' },
    ],
    related: ['/mcp-payroll-tax-server', '/ai-payroll-tax-calculator', '/payroll-tax-api-authentication', '/payroll-tax-api-test-keys'],
  }));

  add(def({
    path: '/ai-payroll-tax-calculator', label: 'AI payroll tax calculator', group: 'Developers',
    title: "AI payroll tax calculator that calls a real engine",
    description: "An AI payroll tax calculator that does not guess: connect an assistant to a real tax engine over MCP so answers match the API and each line is explained.",
    h1: 'AI payroll tax calculator',
    sub: 'Assistants are good at asking questions and bad at tax arithmetic. Pair them with an engine.',
    lead: p(`People ask AI assistants payroll questions all the time: what will this employee net, what does moving to another state cost, how much is the employer tax on this hire. A model answering from memory will sound confident and be off. An assistant that calls a tax engine gives the engine's number and can show its working.`),
    sections: [
      ['The failure mode', p(`A language model has no table of 2026 brackets in its head and cannot know that a particular Ohio municipality changed its rate. It produces a plausible figure. In payroll, plausible is the dangerous kind of wrong, because nobody checks a number that looks right.`)],
      ['The fix', p(`Give the assistant a tool. Through the <a href="/payroll-tax-mcp-tools">MCP server</a> it can run <code>calculate_paycheck</code> for the real inputs and report the result. In the example below, the same Texas paycheck is asked two ways, and the engine's answer is the only one worth quoting.`) + kv(h, ['Question', 'Engine answer'], [
        [`Net pay on ${money(tx.grossPay)} biweekly in Texas, single filer`, money(tx.netPay)],
        [`The same pay in California`, money(ca.netPay)],
        [`Employer taxes on the Texas check`, money(tx.employerTaxTotal)],
      ])],
      ['What stays human', ul([
        'Deciding the employee\'s W-4 answers. The assistant should ask, not assume.',
        'Approving a payroll run. A calculation is not a decision to pay.',
        'Filing and depositing. The engine does not, and neither does the assistant.',
      ])],
      ['Good prompts for the connected assistant', ul([
        '"Compare this employee\'s paycheck in Austin and in Denver and explain the difference."',
        '"What gross pay leaves $2,500 take-home in Columbus, Ohio?"',
        '"Is there a notice on any line of this paycheck?"',
      ])],
    ],
    faq: [
      { q: 'Can an AI assistant calculate payroll taxes accurately?', a: 'Not from memory. It can if it calls a tax engine, because then the answer is the engine\'s result rather than an estimate.' },
      { q: 'How do I connect an assistant to Omnia.tax?', a: 'Point it at the POST /mcp endpoint with a bearer key. It speaks JSON-RPC 2.0 over streamable HTTP and exposes six tools.' },
    ],
    related: ['/payroll-tax-mcp-tools', '/mcp-payroll-tax-server', '/net-to-gross-calculator-api', '/compare-two-paychecks-api'],
  }));

  add(def({
    path: '/payroll-tax-api-testing-fixtures', label: 'Payroll tax API testing fixtures', group: 'Developers',
    title: 'Payroll tax API testing: build fixtures that catch drift',
    description: "How to test a payroll tax integration: golden paychecks as fixtures, cases that find bugs, a CI job on a test key, and how to read a difference from your old.",
    h1: 'Testing a payroll tax API integration',
    sub: 'Golden paychecks, edge cases, and what to do when numbers differ.',
    lead: p(`The surest way to trust an integration is to run paychecks whose answers you already know. Build a set of those as fixtures, run them in CI against a test key, and treat any change as a question to answer rather than a number to update.`),
    sections: [
      ['Cases worth having', kv(h, ['Case', 'What it proves'], [
        ['A no-income-tax state (Texas)', `Baseline: net ${money(tx.netPay)} on ${money(tx.grossPay)}.`],
        ['A state with its own disability tax (California)', `State lines appear: net ${money(ca.netPay)}.`],
        ['A city tax (Columbus, Ohio)', `Local lines appear: net ${money(oh.netPay)}.`],
        ['A bonus', 'Supplemental wages follow the flat-rate or aggregate method.'],
        ['A 401(k) deferral', 'Income tax wages drop but Social Security wages do not.'],
        ['A check at the Social Security cap', 'The tax stops partway through a check.'],
        ['A weekly and a monthly check', 'Pay frequency changes the withholding table.'],
        ['A bad request', 'Your error handling shows the field-level message.'],
      ]).replace(/text-align:right/g, 'text-align:left')],
      ['Run them in CI', p(`Use a <a href="/payroll-tax-api-test-keys">test key</a>, which is never billed. Store each request and the expected <code>netPay</code> and the expected amount for each important <code>id</code>. Assert on ids and cents, never on formatted strings.`) + code(h, `test("Texas biweekly 3000", async () => {
  const { result } = await calc(texasBiweekly3000);
  expect(result.netPay).toBe(${tx.netPay});
  expect(result.taxes.find(t => t.id === "US_FIT").amount).toBe(${line(tx, 'US_FIT')!.amount});
});`)],
      ['When a number differs from your old system', ul([
        'Read the <code>detail</code> text on the differing line first. It states the method and the intermediate values.',
        'Check the inputs match: check date, pay frequency, filing status, year-to-date wages.',
        'Check which wages the tax was applied to. Different <code>taxableWages</code> is the usual cause.',
        'If the old system and the engine disagree after that, look up the agency\'s published method for the line.',
      ])],
      ['Re-run on upgrades', p(`Rules change. Rerun the fixtures when you pin a new API version or when a new tax year starts, and review every difference. A fixture that never changes is a fixture that is not testing the new year.`)],
    ],
    faq: [
      { q: 'How should I test a payroll tax integration?', a: 'Run paychecks whose answers you know against a test key, assert on tax ids and integer cents, include edge cases such as a bonus, a deferral and a Social Security cap, and review any difference when rules change.' },
      { q: 'Do test calls cost money?', a: 'No. Test keys use the same engine and data as live keys and are never billed. They are capped at 30 requests a minute and 500 a day.' },
    ],
    related: ['/payroll-tax-api-test-environment', '/payroll-tax-api-integration-guide', '/payroll-tax-audit-withholding-check', '/payroll-tax-api-test-keys'],
  }));

  add(def({
    path: '/payroll-tax-api-money-in-cents', label: 'Payroll tax API money in cents', group: 'Developers',
    title: 'Payroll tax API money in cents: why integers, not decimals',
    description: 'Why a payroll tax API uses integer cents: no floating-point drift, exact totals that tie to deposits, and where rounding happens once per tax.',
    h1: 'Payroll tax API: money in integer cents',
    sub: 'Why every amount is a whole number, and where rounding happens.',
    lead: p(`Payroll amounts must tie to the penny. Withheld tax is deposited and reported, and a one-cent difference per paycheck becomes a reconciliation problem across thousands of them. The Omnia.tax API therefore uses integer cents for every amount, in requests and responses.`),
    sections: [
      ['The floating-point problem', p(`In most programming languages <code>0.1 + 0.2</code> is not <code>0.3</code>. Add enough dollar amounts stored as floating point and totals drift by fractions of a cent, which then round the wrong way on one line. Integers do not drift. ${money(tx.grossPay)} is <code>${tx.grossPay}</code>, and ${tx.grossPay} plus ${tx.grossPay} is exactly ${tx.grossPay * 2}.`)],
      ['What the API does', ul([
        'Requests must send whole cents. <code>3000.5</code> is refused with a message showing what to send instead.',
        'Responses return whole cents in every amount field.',
        'Rounding happens once per tax, at the point that tax\'s amount is produced from its base and rate. Nothing accumulates a fraction.',
        'Totals are sums of integers, so <code>employeeTaxTotal</code> equals the sum of the employee lines exactly.',
      ])],
      ['Check it yourself', (() => {
        const eeSum = sum2(oh);
        return p(`In the Columbus example the employee lines add up to ${money(eeSum)} and <code>employeeTaxTotal</code> is ${money(oh.employeeTaxTotal)}. They match because there is nothing to disagree about.`);
      })()],
      ['On your side', ul([
        'Store amounts as integer cents in your database.',
        'Convert to dollars only for display, and format with a currency formatter.',
        'If you receive dollars from a form, convert with rounding at the edge: <code>Math.round(dollars * 100)</code>, then never touch floats again.',
      ])],
    ],
    faq: [
      { q: 'Why does the API use cents instead of dollars?', a: 'Integers add exactly. Dollar amounts stored as floating point drift by fractions of a cent, which can round the wrong way and break reconciliation to deposits.' },
      { q: 'What happens if I send a decimal amount?', a: 'The request is refused with a 422 invalid_input error that names the field and shows the whole-cent value to send.' },
    ],
    related: ['/json-payroll-tax-api', '/payroll-tax-api-error-codes', '/paycheck-calculation-formula', '/payroll-tax-api-python-example'],
  }));
  function sum2(r: ReturnType<typeof run>) { return r.taxes.filter((t) => t.payer === 'employee').reduce((a, t) => a + t.amount, 0); }

  add(def({
    path: '/payroll-tax-api-for-saas-platforms', label: 'Payroll tax API for SaaS platforms', group: 'Developers',
    title: 'Payroll tax API for SaaS platforms and vertical software',
    description: "A payroll tax API for SaaS platforms that need gross-to-net inside the product: per-calculation pricing, no seat fee, stateless calls and published coverage.",
    h1: 'Payroll tax API for SaaS platforms',
    sub: 'Add gross-to-net to your product without becoming a tax-rules company.',
    lead: p(`A vertical SaaS product (field service, restaurants, gig work, property management, staffing) often ends up needing payroll-shaped features: a net pay preview, a labour cost estimate, a pay stub. Building the tax rules to support them pulls a team away from the product. A tax calculation API covers the rules, and you keep the experience.`),
    sections: [
      ['What platforms use it for', ul([
        '<strong>Net pay preview</strong> before a worker accepts a shift or a rate.',
        '<strong>Pay stubs and statements</strong> that show each tax line with its name.',
        '<strong>Labour cost</strong> that includes employer taxes, not just wages.',
        '<strong>What-if comparisons</strong> for a raise or a move, with the reason for the difference.',
      ])],
      ['Why it fits embedded use', ul([
        '<strong>Stateless.</strong> You send year-to-date wages; nothing is stored on our side that you would have to reconcile.',
        '<strong>Per-calculation pricing.</strong> $0.08 per paycheck calculation, so cost follows usage and there is no seat or platform fee to pass through.',
        '<strong>Published coverage.</strong> Your support team can look up what is covered on the <a href="/coverage">coverage page</a> instead of asking us.',
        '<strong>Explainable lines.</strong> Show the reason beside the number so users do not file a ticket to ask.',
      ])],
      ['An example you can show a product manager', p(`A worker earns ${money(tx.grossPay)} biweekly in Texas. The platform shows net pay of ${money(tx.netPay)} and the employer cost of ${money(tx.grossPay + tx.employerTaxTotal)} (gross plus ${money(tx.employerTaxTotal)} of employer taxes). Change the state to California and the preview reads ${money(ca.netPay)}.`)],
      ['What stays with you', p(`The API calculates tax. Paying workers, filing returns and depositing tax are not part of it, so a platform that does those needs a payments or payroll provider as well. See <a href="/embedded-payroll-tax-engine">embedding a payroll tax engine</a>.`)],
    ],
    faq: [
      { q: 'Can I embed a payroll tax API in my SaaS product?', a: 'Yes. Omnia.tax is built for it: stateless calls, JSON in cents, per-calculation pricing and published coverage. It calculates tax only; it does not pay workers or file returns.' },
      { q: 'How is it priced for a platform?', a: '$0.08 per paycheck calculation after a 14-day free trial, with no seat or platform fee.' },
    ],
    related: ['/embedded-payroll-tax-engine', '/payroll-tax-api-for-hr-software', '/payroll-tax-api-pricing', '/build-vs-buy-payroll-tax-engine'],
  }));

  add(def({
    path: '/payroll-tax-api-for-hr-software', label: 'Payroll tax API for HR software', group: 'Developers',
    title: 'Payroll tax API for HR software: offers, comp and cost',
    description: 'Use a payroll tax API inside HR software for offer letters, compensation planning, employee cost and take-home pay by location, without owning the tax rules.',
    h1: 'Payroll tax API for HR software',
    sub: 'Take-home and cost numbers in the places HR software shows pay.',
    lead: p(`HR software shows pay in many places that are not payroll runs: offer letters, compensation bands, relocation estimates, total-rewards statements. In each, the useful number is what the person takes home and what the role costs the employer. Those need tax rules by location and year, which a tax calculation API provides.`),
    sections: [
      ['Where it fits', kv(h, ['Screen', 'What the API supplies'], [
        ['Offer letter', 'Net pay by pay period for the work location.'],
        ['Compensation planning', 'Employer cost per role including employer taxes.'],
        ['Relocation and remote work', 'A before-and-after paycheck with the reason for the change.'],
        ['Total rewards statement', 'What benefits deductions do to take-home pay.'],
        ['Employee self-service', 'A W-4 what-if: how extra withholding changes net.'],
      ]).replace(/text-align:right/g, 'text-align:left')],
      ['A relocation example', (() => {
        const t = run(inp(h, 'TX'));
        const c2 = run(inp(h, 'CA'));
        return p(`An employee on ${money(t.grossPay)} biweekly considers moving from Texas to California. The engine returns net pay of ${money(t.netPay)} in Texas and ${money(c2.netPay)} in California, a difference of ${money(t.netPay - c2.netPay)} per paycheck. The <a href="/compare-two-paychecks-api">compare endpoint</a> returns that difference already broken down line by line.`);
      })()],
      ['Employee-facing tools', p(`Let employees see how a change to their W-4 or a pre-tax benefit election changes take-home before they commit. Each change is a re-run of the same request with one field altered, and the <a href="/compare-two-paychecks-api">comparison</a> explains it in order.`)],
      ['What it does not do', p(`It does not hold employee records, run payroll or file anything. It is the calculation layer you call from the screens above. For employee cost modelling with the employer's side included, see <a href="/true-cost-of-an-employee">the true cost of an employee</a>.`)],
    ],
    faq: [
      { q: 'How can HR software use a payroll tax API?', a: 'To show take-home pay on offers, employer cost on compensation plans, before-and-after paychecks for relocations and W-4 what-ifs for employees, all by calling the engine with the person\'s location and pay.' },
      { q: 'Does it store employee data?', a: 'The calculation API is stateless: you send the facts of a paycheck and get a result. It is not an employee records system.' },
    ],
    related: ['/payroll-tax-api-for-saas-platforms', '/compare-two-paychecks-api', '/true-cost-of-an-employee', '/relocation-paycheck-comparison'],
  }));

  add(def({
    path: '/payroll-tax-api-for-staffing-agencies', label: 'Payroll tax API for staffing agencies', group: 'Developers',
    title: 'Payroll tax API for staffing agencies: pay and bill rates',
    description: 'A payroll tax API for staffing software: quote a candidate their take-home, model employer cost for a bill rate, and handle workers across many states.',
    h1: 'Payroll tax API for staffing agencies',
    sub: 'Quote pay and cost accurately for workers placed in many states.',
    lead: p(`Staffing firms place people across states and cities, often in the same week. Two numbers drive each placement: what the worker takes home, and what the worker costs the agency once employer taxes are added. Both change with the assignment location, so a single rule of thumb is wrong more often than it is right.`),
    sections: [
      ['Quote by assignment location', p(`Run the same pay through different work locations. At ${money(tx.grossPay)} biweekly the engine returns employer taxes of ${money(tx.employerTaxTotal)} in Texas, ${money(ca.employerTaxTotal)} in California and ${money(oh.employerTaxTotal)} in Columbus, Ohio. The spread comes from state unemployment tax and, in some states, employer-paid leave contributions.`)],
      ['What a placement needs', ul([
        'The work address, found with <code>POST /v1/address</code>, so local tax is applied where the work happens.',
        'The home address when it differs, for reciprocity and residence-based tax. See <a href="/multi-state-payroll-tax-calculation">multi-state calculation</a>.',
        'The worker\'s W-4 and state certificate.',
        'Year-to-date wages from your payroll, so caps stop at the right check.',
      ])],
      ['Costing a bill rate', (() => {
        const hours = 80;
        const rate = 3750;
        const g = hours * rate;
        const r = run(inp(h, 'OH', { residenceCity: 'Columbus', workCity: 'Columbus' }, g));
        return p(`A worker at ${money(rate)} an hour for ${hours} hours earns ${money(g)} gross. In Columbus the employer taxes on that check are ${money(r.employerTaxTotal)}, so the employer cost before insurance and overhead is ${money(g + r.employerTaxTotal)}, and net pay to the worker is ${money(r.netPay)}. A bill rate has to cover the higher figure.`);
      })()],
      ['Limits', p(`The API calculates. Workers' compensation, benefits cost, filing and deposits are outside it, and a staffing agency still needs a process or a provider for those.`)],
    ],
    faq: [
      { q: 'How do staffing agencies use a payroll tax API?', a: 'To quote a worker\'s take-home and the agency\'s employer-tax cost for an assignment location, to apply local tax where the work is done, and to compare placements in different states.' },
      { q: 'Does it handle workers who live in a different state?', a: 'Yes. Send the work state and the residence state; the engine applies reciprocity and residence-based rules where they exist.' },
    ],
    related: ['/payroll-tax-api-for-saas-platforms', '/multi-state-payroll-tax-calculation', '/true-cost-of-an-employee', '/employer-payroll-tax-calculator'],
  }));

  add(def({
    path: '/payroll-tax-api-for-fintech', label: 'Payroll tax API for fintech', group: 'Developers',
    title: "Payroll tax API for fintech: take-home for lending",
    description: 'A payroll tax API for fintech teams: estimate take-home for earned wage access, affordability checks and benefits products, from pay, location and withholding.',
    h1: 'Payroll tax API for fintech',
    sub: 'Turn a gross pay figure into a take-home estimate you can lend against.',
    lead: p(`Fintech products meet payroll data in many forms: a gross salary on an application, a pay frequency, a state. The decision they need is about net pay, because that is what a person can actually spend. A rule of thumb like "gross times 0.75" ignores the state, the filing status and the pay frequency, and it is wrong by amounts that matter in an affordability check.`),
    sections: [
      ['Uses', ul([
        '<strong>Earned wage access</strong>: how much of an accrued wage is safely available after taxes.',
        '<strong>Affordability checks</strong>: net monthly pay for a loan or buy-now-pay-later decision.',
        '<strong>Benefits and savings products</strong>: how a pre-tax contribution changes take-home.',
        '<strong>Gross-up</strong>: the gross pay that leaves a target net, using the <a href="/net-to-gross-calculator-api">net-to-gross endpoint</a>.',
      ])],
      ['Why a flat percentage fails', p(`Run the same ${money(tx.grossPay)} biweekly pay through two states. Texas returns ${money(tx.netPay)} and California returns ${money(ca.netPay)}. As a share of gross that is ${((tx.netPay / tx.grossPay) * 100).toFixed(1)}% and ${((ca.netPay / ca.grossPay) * 100).toFixed(1)}%. A single multiplier cannot be right for both.`)],
      ['Inputs you usually have', ul([
        'Gross pay and pay frequency from the pay stub or the employer.',
        'State, and ideally a work address for local tax.',
        'Filing status. If you do not have a W-4, state your assumption (for example, single with no adjustments) and say so to the user.',
      ])],
      ['Be clear it is an estimate', p(`Withholding follows the employee's W-4 and the employer's choices, so a calculated net pay is an estimate of an actual paycheck. Show the assumptions you made, and for a credit decision prefer verified pay data where you can get it. The API calculates tax and does not verify income.`)],
    ],
    faq: [
      { q: 'Can a payroll tax API support affordability checks?', a: 'It can turn a gross pay, pay frequency and location into a net pay estimate that follows federal, state and local rules, which is more accurate than a flat percentage. It estimates withholding; it does not verify income.' },
      { q: 'What do I do without the employee\'s W-4?', a: 'Assume a stated default such as single filing status with no adjustments, and tell the user that is the assumption.' },
    ],
    related: ['/gross-to-net-api', '/net-to-gross-calculator-api', '/paycheck-calculator-api', '/payroll-tax-api-for-saas-platforms'],
  }));

  add(def({
    path: '/payroll-tax-api-for-payroll-startups', label: 'Payroll tax API for payroll startups', group: 'Developers',
    title: "Payroll tax API for payroll startups: buy the rules",
    description: 'If you are building a payroll product, buy the tax rules and build the experience. What to take from an API, what you still own, and how to stage the build.',
    h1: 'Payroll tax API for payroll startups',
    sub: 'The rules are not your differentiator. Spend the time elsewhere.',
    lead: p(`A new payroll product has a long list of things to build: onboarding, pay runs, payments, filings, support. Tax rules are the longest line and the least visible to a customer when they are right. A calculation API lets a startup ship a correct gross-to-net early and spend its first year on the parts customers choose it for.`),
    sections: [
      ['What to buy', ul([
        'Federal, state and local withholding by check date.',
        'Employer taxes: FUTA, state unemployment and state paid-leave contributions.',
        'Address-to-jurisdiction resolution for local tax.',
        'Garnishment limits and minimum-wage checks on the same call.',
      ])],
      ['What you still own', ul([
        'Employee records, pay schedules and approvals.',
        'Moving money: employee payments and tax deposits.',
        'Filing returns and year-end forms.',
        'Registration with state agencies and notices.',
      ])],
      ['A staged build', kv(h, ['Stage', 'Work'], [
        ['1', 'Call the API for a gross-to-net preview on a manual pay run.'],
        ['2', 'Store the results as a pay stub and keep year-to-date totals.'],
        ['3', 'Add address resolution at onboarding.'],
        ['4', 'Add payments and deposits through partners.'],
        ['5', 'Add filings.'],
      ]).replace(/text-align:right/g, 'text-align:left') + p(`Stage 1 alone makes a credible demo: a ${money(oh.grossPay)} biweekly check in Columbus, Ohio nets ${money(oh.netPay)} with every line named.`)],
      ['The honest comparison', p(`Building the rules yourself is a real option and sometimes the right one. The cost is not the first version; it is the permanent upkeep. See <a href="/build-vs-buy-payroll-tax-engine">build or buy</a>.`)],
    ],
    faq: [
      { q: 'Should a payroll startup build its own tax engine?', a: 'Usually not first. The first version is straightforward; the permanent cost is keeping every state and local rule current and effective-dated. Many startups buy the rules and build the experience.' },
      { q: 'Does the API handle filing?', a: 'No. Omnia.tax calculates withholding and employer taxes only. Filing and deposits are separate work you build or buy elsewhere.' },
    ],
    related: ['/build-vs-buy-payroll-tax-engine', '/embedded-payroll-tax-engine', '/payroll-tax-api-integration-guide', '/payroll-tax-api-for-saas-platforms'],
  }));

  add(def({
    path: '/payroll-tax-library-vs-api', label: 'Payroll tax library vs API', group: 'Developers',
    title: 'Payroll tax library vs API: which to choose',
    description: 'Payroll tax library or API? Compare update speed, local coverage, offline use, latency, audit trail and cost, and the cases where each one is the better choice.',
    h1: 'Payroll tax library vs API',
    sub: 'Both are valid. They fail in different ways.',
    lead: p(`A library runs inside your process; an API runs on someone else's server. For payroll tax, that difference matters less for speed than for what it does to updates, audit and failure.`),
    sections: [
      ['Side by side', kv(h, ['Question', 'Library', 'API'], [
        ['Rate and rule updates', 'You upgrade and redeploy.', 'The provider updates; you call the same endpoint.'],
        ['Mid-year changes', 'Wait for a release, then ship it.', 'Take effect when the provider publishes them.'],
        ['Local tax data', 'Bundled or fetched separately; large.', 'Held server side; address lookup included.'],
        ['Works offline', 'Yes.', 'No.'],
        ['Latency', 'Microseconds.', 'A network round trip.'],
        ['Reproducing an old result', 'Pin the version.', 'Send the old check date; the rules are effective-dated.'],
        ['Cost shape', 'Licence or maintenance.', 'Per calculation.'],
      ]).replace(/text-align:right/g, 'text-align:left')],
      ['Choose a library when', ul([
        'You must calculate with no network, for example on a device.',
        'Volume is so high that per-call cost or latency dominates.',
        'You have a team to track every rule change and release promptly.',
      ])],
      ['Choose an API when', ul([
        'You would rather not carry state and local rules, which change continually.',
        'You need local jurisdiction lookup by address.',
        `You value a published coverage list: ${h.cov.localJurisdictions.toLocaleString('en-US')} local jurisdictions in ${h.cov.statesWithLocalTax} states, named on the <a href="/coverage">coverage page</a>.`,
        'You want each line explained for support and audit.',
      ])],
      ['A hybrid is possible', p(`Many teams call the API for the authoritative result and cache a small number of common cases locally for previews. Keep the API call for anything that is paid or reported.`)],
    ],
    faq: [
      { q: 'Is it better to use a payroll tax library or an API?', a: 'A library suits offline use and extreme volume if you can maintain it; an API suits teams that do not want to track state and local rule changes. Many use the API for anything paid or reported.' },
      { q: 'How does an API handle old paychecks?', a: 'Rules are effective-dated, so sending the original check date reproduces the original year\'s result.' },
    ],
    related: ['/build-vs-buy-payroll-tax-engine', '/payroll-tax-api-effective-dating', '/payroll-tax-engine-evaluation-checklist', '/payroll-tax-api-for-developers'],
  }));

  return L;
}
