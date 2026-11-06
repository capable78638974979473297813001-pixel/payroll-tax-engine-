# Michigan city employer withholding, 2026

Prepare one employer and one city at a time. List the filing authorities or try the synthetic example:

```sh
npm run filing:mi-local -- cities
npm run filing:mi-local -- prepare examples/michigan-local-filing.json ./demo-city-packet
node --test tests/michigan-local-filing.test.mjs
```

## Prepare the input

Use the example JSON as the input contract. Supply complete records for the reporting period. An empty input can produce a zero worksheet, so verify payroll coverage, especially before making a zero return. All amounts are integer cents.

- **runs** contains the employer's PayRun records. Check dates assign approved Michigan withholding to the calendar month. Draft, voided and other-year checks are excluded.
- **allocations** contains one record per approved run, employee and tax city. Reconstruct these from verified residence, work and payroll records. Supply the actual local reportable wages as well as the tax withheld. Include every city on a split check and include reportable employees with zero withholding. There is no reliable split in the stored combined MI_LOCAL amount alone.
- **statements** contains one annual W-2 record per reportable employee for the selected city. The employee's mailing city is `city` and the tax jurisdiction is `taxCity`. Boxes 18 and 19 must match the city payroll allocations for that employee. The command also expects a complete annual statement set when using its monthly or quarterly breakdowns. For a manual city, only employeeId, taxCity, localWagesCents and withheldCents are needed.
- **deposits** contains posted withholding principal for the selected employer, city and year. Enter the liability month, unique receipt ID and amount. Use separate entries with unique references when one payment covers several months. Exclude penalties, interest and unposted payments.
- **employer** and the statement identity/address fields are required for electronic attachments. Use US addresses and the restricted ASCII text accepted by the exporter. Review and prepare foreign addresses, corrections, negative adjustments, nonemployee compensation and amended returns separately.

## File with the authority

Each worksheet has monthly, quarterly and annual control totals, a W-2 count and the official filing instructions. Select the required return and filing frequency from the city's instructions. Complete its form, review adjustments, sign, submit through the specified channel, arrange payment and retain the agency confirmation. The difference between payroll withholding and posted deposits is a control figure. Credits, refunds, interest and penalties require separate review.

Battle Creek, East Lansing, Flint, Grand Rapids, Grayling, Lansing, Port Huron, Saginaw, Springfield and Walker have city-specific W-2 CSV output. Check the current filing channel, filename and companion reconciliation form before uploading or mailing. Walker requires the W-2 upload before the annual reconciliation. For the other 14 cities, prepare the W-2 copies or electronic wage file separately according to the linked instructions. Detroit uses Treasury's Detroit employer returns.

Use a protected input location and a new private output directory. The CSV contains full SSNs. Keep real files out of source control. The command writes local materials only. It does not transmit returns, move money or retrieve acceptance receipts.
