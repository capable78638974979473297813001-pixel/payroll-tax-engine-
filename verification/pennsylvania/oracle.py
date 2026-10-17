"""Independent oracle for every tax line on a Pennsylvania paycheck, tax year 2026.

Nothing here imports the engine or reads its data files. Every constant is hardcoded from, or parsed
out of, an official document read during this session:

FIT   IRS Pub 15-T (2026), Worksheet 1A and the 2026 annual percentage-method tables (parsed from the PDF text
      into fit_tables_2026.json; checked below for bracket continuity)
FICA  IRS Pub 15 (2026): SS 6.2% to a $184,500 wage base, Medicare 1.45%, Additional Medicare 0.9% over $200,000
      (employee only), supplemental flat rate 22% (37% over $1,000,000 of supplemental wages in the year)
FUTA  IRS Pub 15 (2026): $7,000 wage base; 0.6% net rate (PA is not a credit reduction state)
PA    see make_scenarios.py header, plus
      Act 34 of 2023 (PA Revenue, Dependent Care Assistance): IRC 129 dependent care assistance, including pre-tax
      dependent care FSA contributions, is NOT PA compensation;
      PA UC Law 43 P.S. 753(x)(1): employer wage base $10,000; PA L&I: newly liable employer rate .038220
      (non-construction), employee contribution 0.07% of gross wages, no cap
Local Philadelphia (phila.gov rate table) and Pittsburgh (pittsburghpa.gov Taxes page) only.

Open items the oracle deliberately does NOT decide (so they are reported as UNVERIFIED, never as PASS/FAIL):
 * PA UC employee/employer base for section125, hsa, fsa, dependent_care and commuter salary reductions
   (43 P.S. 753(x) does not name them; L&I says only "total gross wages").
 * Philadelphia Wage Tax base for any pre-tax deduction other than a 401(k) deferral.
"""
import json
from decimal import Decimal as D, ROUND_HALF_UP, ROUND_DOWN

import os
_B = os.path.dirname(os.path.abspath(__file__)) + "/"
TABLES_BY_YEAR = {2025: json.load(open(_B + "fit_tables_2025.json")), 2026: json.load(open(_B + "fit_tables_2026.json"))}
TABLES = TABLES_BY_YEAR[2026]
SS_BASE = {2025: D(176100), 2026: D(184500)}        # Pub 15 (2025) and Pub 15 (2026)
PERIODS = {"weekly": 52, "biweekly": 26, "semimonthly": 24, "monthly": 12, "quarterly": 4, "semiannual": 2, "annual": 1, "daily": 260}
RECIP = {"IN", "MD", "OH", "NJ", "VA", "WV"}

# category groups (federal rules; the same strings the engine uses for deduction categories)
FED_INCOME_EXCLUDED = {"section125", "hsa", "fsa", "dependent_care", "commuter", "deferral_401k", "deferral_403b",
                       "deferral_457", "deferral_simple"}
FICA_EXCLUDED = {"section125", "hsa", "fsa", "dependent_care", "commuter"}          # elective deferrals ARE FICA/FUTA wages
PA_INCOME_EXCLUDED = {"section125", "hsa", "fsa", "dependent_care"}                  # NOT commuter, NOT deferrals
UC_BASE_ENGINE_STYLE = {"section125", "hsa", "fsa", "dependent_care", "commuter"}    # FUTA-style: the unresolved question


def q(x):
    return D(x).quantize(D("0.01"), rounding=ROUND_HALF_UP)


def check_tables():
    """Each bracket's base C must equal the previous base plus the previous bracket's tax (IRS rounds a few
    figures to the dollar, so allow $1.00): guards the PDF parse."""
    for tables in TABLES_BY_YEAR.values():
        for kind in tables:
            for status, rows in tables[kind].items():
                assert len(rows) == 8, (kind, status)
                for a, b in zip(rows, rows[1:]):
                    expect = a["C"] + (a["B"] - a["A"]) * a["D"]
                    assert abs(expect - b["C"]) <= 1.0, (kind, status, a, b, expect)
                    assert b["A"] == a["B"], (kind, status)


check_tables()


def _halve(v, mfj_vals):
    """The IRS prints the single/MFS "Step 2 checkbox" figures rounded to whole dollars; they are exactly half of the
    married-filing-jointly figures where those are the same bracket. Return the exact half when the printed figure is
    within a dollar of one, so a result matching either reading is accepted and reported as such."""
    for m in mfj_vals:
        if m is not None and abs(v - m / 2) <= 0.5 and v != m / 2:
            return m / 2
    return v


def fit_annual_tentative(adj, status, checkbox, exact=False, year=2026):
    tables = TABLES_BY_YEAR[year]
    kind = "checkbox" if checkbox else "standard"
    rows = tables[kind]["mfj" if status == "married_joint" else "hoh" if status == "head_of_household" else "single"]
    sel = (checkbox and status not in ("married_joint", "head_of_household"))
    mfj = tables["checkbox"]["mfj"]
    mA = [r["A"] for r in mfj]; mB = [r["B"] for r in mfj]; mC = [r["C"] for r in mfj]
    fix = (lambda v: D(str(_halve(v, mA + mB)))) if (exact and sel) else (lambda v: D(str(v)))
    fixc = (lambda v: D(str(_halve(v, mC)))) if (exact and sel) else (lambda v: D(str(v)))
    for r in rows:
        if adj >= fix(r["A"]) and (r["B"] is None or adj < fix(r["B"])):
            return fixc(r["C"]) + (adj - fix(r["A"])) * D(str(r["D"]))
    raise AssertionError(adj)


def fit_period(taxable, s, exact=False, line_round=False):
    """Pub 15-T (2026) Worksheet 1A, W-4 2020 or later. Returns an unrounded Decimal."""
    n = D(PERIODS[s["freq"]])
    w4 = s["w4"]
    one_c = taxable * n
    one_e = one_c + D(w4["otherIncome"]) / 100          # W-4 Step 4(a): annual dollars, stored in cents
    one_g = D(0) if w4["multipleJobs"] else (D(12900) if w4["filingStatus"] == "married_joint" else D(8600))
    one_i = max(D(0), one_e - (D(w4["deductions"]) / 100 + one_g))   # W-4 Step 4(b)
    annual_tent = fit_annual_tentative(one_i, w4["filingStatus"], w4["multipleJobs"], exact, int(s["date"][:4]))
    if line_round:
        annual_tent = q(annual_tent)                # line 2g is a dollars-and-cents line
    tentative = annual_tent / n
    credit = D(w4["dependentCredit"]) / 100 / n
    if line_round:                                  # Worksheet 1A lines 2g, 2h and 3b are dollars-and-cents lines
        tentative, credit = q(tentative), q(credit)
    after_credit = max(D(0), tentative - credit)      # Step 3: annual dollars
    return after_credit + D(w4["extraWithholding"]) / 100                         # Step 4(c): per period, cents


def cap_dependent_care(s):
    """IRC 129: dependent care above $7,500 ($5,000 in 2025) is taxable wages; modeled as the excess becoming a post-tax deduction.
    The generator never sets a dependent-care year-to-date, so the room is the full limit."""
    room = D(5000) if s["date"] < "2026-01-01" else D(7500)
    out = []
    for c, a in s["deductions"]:
        if c == "dependent_care":
            keep = min(D(a), room)
            room -= keep
            if keep > 0:
                out.append((c, str(keep)))
            if D(a) - keep > 0:
                out.append((None, str(D(a) - keep)))
        else:
            out.append((c, a))
    return out


def expected(s):
    s = dict(s, deductions=cap_dependent_care(s))
    d = lambda cats: sum(D(a) for c, a in s["deductions"] if c in cats)
    reg = sum(D(a) for c, a in s["earnings"] if c == "regular")
    supp = sum(D(a) for c, a in s["earnings"] if c == "supplemental")
    gross = reg + supp
    pretax_all = sum(D(a) for c, a in s["deductions"] if c is not None)
    posttax = sum(D(a) for c, a in s["deductions"] if c is None)
    out = {}
    ytd = {k: D(v) / 100 for k, v in s["ytd"].items()}                            # stored in cents

    # ---- federal income tax -------------------------------------------------------------------------------
    base_total = max(D(0), gross - d(FED_INCOME_EXCLUDED))
    supp_taxable = min(base_total, supp)
    reg_taxable = base_total - supp_taxable
    out["US_FIT"] = fit_period(reg_taxable, s)
    out["US_FIT_alt"] = fit_period(reg_taxable, s, exact=True)          # exact half-dollar thresholds
    out["US_FIT_lr"] = fit_period(reg_taxable, s, line_round=True)       # cents-rounded worksheet lines 2h, 3b
    out["US_FIT_lr_alt"] = fit_period(reg_taxable, s, exact=True, line_round=True)
    if supp > 0:
        under = max(D(0), D(1_000_000) - D(ytd["supplemental"]))
        s_under = min(supp_taxable, under)
        s_over = supp_taxable - s_under
        out["US_FIT_SUPP"] = s_under * D("0.22") + s_over * D("0.37")
    # ---- FICA / FUTA ---------------------------------------------------------------------------------------
    fica = max(D(0), gross - d(FICA_EXCLUDED))
    ss = min(fica, max(D(0), SS_BASE[int(s["date"][:4])] - D(ytd["socialSecurity"])))
    out["US_SS_EE"] = ss * D("0.062")
    out["US_SS_ER"] = ss * D("0.062")
    out["US_MED_EE"] = fica * D("0.0145")
    out["US_MED_ER"] = fica * D("0.0145")
    m0 = D(ytd["medicare"])
    over = max(D(0), m0 + fica - D(200000)) - max(D(0), m0 - D(200000))
    out["US_MED_ADDL"] = over * D("0.009")
    out["US_FUTA"] = min(fica, max(D(0), D(7000) - D(ytd["futa"]))) * D("0.006")
    # ---- Pennsylvania ----------------------------------------------------------------------------------------
    pa_base = max(D(0), gross - d(PA_INCOME_EXCLUDED))
    out["PA_SIT"] = D(0) if s["residence"] in RECIP else pa_base * D("0.0307")
    uc_strict = gross                                  # L&I: "total gross wages"
    uc_engine = max(D(0), gross - d(UC_BASE_ENGINE_STYLE))
    out["PA_UC_EE"] = uc_strict * D("0.0007")
    out["PA_UC_EE_alt"] = uc_engine * D("0.0007")
    sui_room = max(D(0), D(10000) - D(ytd["stateUnemploymentPA"]))
    out["PA_SUI_ER"] = min(uc_strict, sui_room) * D("0.03822")
    out["PA_SUI_ER_alt"] = min(uc_engine, sui_room) * D("0.03822")
    loc = s.get("local")
    if loc:
        out["PA_EIT"] = pa_base * D(loc["rate"])
        if loc.get("lst_annual") is not None:
            n = PERIODS[s["freq"]]
            annual_est = pa_base * n
            if loc.get("lst_cert") and annual_est < D(12000):
                out["PA_LST"] = D(0)
            else:
                out["PA_LST"] = (D(loc["lst_annual"]) / D(n)).quantize(D("0.01"), rounding=ROUND_DOWN)
    # ---- net pay ---------------------------------------------------------------------------------------------
    emp_taxes = sum(q(out[k]) for k in ("US_FIT", "US_SS_EE", "US_MED_EE", "US_MED_ADDL", "PA_SIT", "PA_UC_EE", "PA_EIT", "PA_LST") if k in out)
    if "US_FIT_SUPP" in out:
        emp_taxes += q(out["US_FIT_SUPP"])
    out["NET_basis"] = gross - pretax_all - posttax - emp_taxes
    return out, {"gross": gross, "pretax": pretax_all, "posttax": posttax}
