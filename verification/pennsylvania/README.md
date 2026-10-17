# Pennsylvania paycheck verification

An independent check of every tax line on a Pennsylvania paycheck. `oracle.py` imports nothing from the engine and reads none of its data files. Every rate and rule in it is hardcoded from, or parsed out of, an official document (cited in the file headers):

- IRS Pub 15 and 15-T, 2025 and 2026 (`fit_tables_*.json` are the Annual Percentage Method tables parsed from the PDFs; `oracle.py` checks bracket continuity on load)
- PA Revenue, PA Labor & Industry, DCED, phila.gov, pittsburghpa.gov

```
python3 verification/pennsylvania/gen.py 20000 7        # N random paychecks, seed; P25=0.5 puts half on 2025 dates
node verification/pennsylvania/run_engine.ts            # run the engine on them
python3 verification/pennsylvania/compare.py            # compare line by line
```

Outputs go to `verification/pennsylvania/out/` (ignored by git).

## Result labels

- `PASS`: the engine and the oracle agree to the cent.
- `WORKSHEET_LINE_ROUNDING`: federal withholding only. The engine rounds Worksheet 1A lines 2g, 2h and 3b to cents, as the form's dollars-and-cents lines say; the oracle rounds once at the end. The IRS prescribes neither. The difference is at most 1 cent and the oracle reproduces it exactly.
- `IRS_PRINTED_ROUNDING`: the IRS prints some single/MFS Step 2 checkbox thresholds rounded to whole dollars (they are exactly half the married-filing-jointly figures). The engine uses the exact halves. Same size, same rule.
- `UNVERIFIED_BASE`: the unemployment base for dependent care and commuter reductions. See "Not verified" below. The oracle accepts either base and never counts these as passes.
- `FAIL`: a real difference. There are none in the committed runs.

## Not verified

- PA unemployment base for dependent care and commuter salary reductions (43 P.S. 753(x) names neither; L&I says only "total gross wages").
- Local rates and rules for every PSD except Philadelphia (510101) and Pittsburgh (700102).
- Philadelphia Wage Tax base for pre-tax deductions other than 401(k).
- PA income tax rounding convention (PA publishes none; half-up assumed).
- Federal 2027 (the IRS has not published the tables).
