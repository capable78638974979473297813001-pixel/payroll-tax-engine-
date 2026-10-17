import json, os, random, sys
from decimal import Decimal as D
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("OUT", HERE + "/out")
os.makedirs(OUT, exist_ok=True)
sys.path.insert(0, HERE)
import oracle

N = int(sys.argv[1]) if len(sys.argv) > 1 else 3000
SEED = int(sys.argv[2]) if len(sys.argv) > 2 else 1
rnd = random.Random(SEED)

FREQS = ["weekly", "biweekly", "semimonthly", "monthly", "quarterly", "semiannual", "annual", "daily"]
SCALE = {"weekly": 1, "biweekly": 2, "semimonthly": 2.17, "monthly": 4.33, "quarterly": 13, "semiannual": 26, "annual": 52, "daily": 0.2}
PRETAX = ["section125", "hsa", "fsa", "dependent_care", "commuter", "deferral_401k", "deferral_403b", "deferral_457", "deferral_simple"]
RECIP = ["IN", "MD", "OH", "NJ", "VA", "WV"]
OTHER = ["NY", "DE", "CA", "FL", "TX", "MA"]


def money(lo, hi):
    """dollars with cents, log-uniform so small and large paychecks are both common"""
    import math
    x = math.exp(rnd.uniform(math.log(lo), math.log(hi)))
    return D(str(round(x, 2))) if rnd.random() < 0.8 else D(int(x))


def gen(i):
    freq = rnd.choice(FREQS)
    sc = D(str(SCALE[freq]))
    reg = (money(40, 4000) * sc).quantize(D("0.01"))
    earnings = [("regular", reg)]
    if rnd.random() < 0.25:
        earnings.append(("supplemental", money(100, 30000)))
    year2025 = rnd.random() < float(os.environ.get("P25", "0.08"))
    local = None
    residence = None
    cert = {}
    r = rnd.random()
    kind = "none" if r < 0.35 else ("phl" if r < 0.65 else "pit")
    allowed = PRETAX
    if kind == "phl":
        allowed = ["deferral_401k"]           # Philadelphia's base for other deductions is not independently verifiable
    ded = []
    for cat in rnd.sample(allowed, rnd.randint(0, min(3, len(allowed)))):
        cap = {"section125": 0.25, "hsa": 0.12, "fsa": 0.1, "dependent_care": 0.12, "commuter": 0.08}.get(cat, 0.2)
        amt = (reg * D(str(rnd.uniform(0.005, cap)))).quantize(D("0.01"))
        if cat.startswith("deferral"):
            amt = min(amt, D("3000.00"))        # stays far inside the IRS annual limits; the caps get their own tests
        ded.append((cat, amt))
    if rnd.random() < 0.3:
        ded.append((None, (reg * D(str(rnd.uniform(0.005, 0.1)))).quantize(D("0.01"))))
    date = rnd.choice(["2025-03-14", "2025-09-12", "2025-12-05"] if year2025 else
                      ["2026-01-09", "2026-03-13", "2026-06-12", "2026-06-30", "2026-07-01", "2026-07-10", "2026-10-02", "2026-12-18"])
    common = freq in ("weekly", "biweekly", "semimonthly", "monthly")
    pool = (["PA"] * 4 + RECIP + OTHER) if common else ["PA"]
    if kind == "none":
        residence = rnd.choice(pool)
    elif kind == "phl":
        rate_res, rate_non = (("0.0375", "0.0344") if date < "2025-07-01" else ("0.0374", "0.0343") if date < "2026-07-01" else ("0.03735", "0.03425"))
        if rnd.random() < 0.5:
            residence = "PA"; local = {"work": "510101", "res": "510101", "rate": rate_res, "lst_annual": None}
        else:
            residence = rnd.choice(RECIP + OTHER if common else ["NJ"]); local = {"work": "510101", "res": None, "rate": rate_non, "lst_annual": None}
    else:
        if rnd.random() < 0.55:
            residence = "PA"; local = {"work": "700102", "res": "700102", "rate": "0.03", "lst_annual": "52"}
        else:
            residence = rnd.choice(RECIP + OTHER if common else ["NJ"]); local = {"work": "700102", "res": None, "rate": "0.01", "lst_annual": "52"}
        local["lst_cert"] = rnd.random() < 0.4
    s = {
        "id": i, "freq": freq, "date": date, "year2025": year2025, "residence": residence, "local": local,
        "earnings": [(c, str(a)) for c, a in earnings], "deductions": [(c, str(a)) for c, a in ded],
        "w4": {"filingStatus": rnd.choice(["single", "married_joint", "married_separate", "head_of_household"]),
               "multipleJobs": rnd.random() < 0.3,
               "dependentCredit": rnd.choice([0, 0, 200000, 400000, 600000, 1700000]),   # cents/year
               "otherIncome": rnd.choice([0, 0, 0, 500000, 2000000]),
               "deductions": rnd.choice([0, 0, 0, 300000, 1200000]),
               "extraWithholding": rnd.choice([0, 0, 0, 500, 2500])},
        "ytd": {"socialSecurity": 0, "medicare": 0, "futa": 0, "supplemental": 0, "stateUnemploymentPA": 0},
    }
    # year-to-date positions (cents): put paychecks on both sides of every cap
    k = rnd.random()
    if k < 0.45:
        pass
    else:
        s["ytd"]["socialSecurity"] = int(D(str(rnd.choice([rnd.uniform(0, 184500), 184400, 180000, 190000]))) * 100)
        s["ytd"]["medicare"] = int(D(str(rnd.choice([rnd.uniform(0, 400000), 199500, 250000]))) * 100)
        s["ytd"]["futa"] = int(D(str(rnd.choice([rnd.uniform(0, 7000), 6900, 7000]))) * 100)
        s["ytd"]["stateUnemploymentPA"] = int(D(str(rnd.choice([rnd.uniform(0, 10000), 9950, 10000]))) * 100)
        if rnd.random() < 0.1:
            s["ytd"]["supplemental"] = int(D(str(rnd.choice([999000, 1000000, 1500000]))) * 100)
    if local and local["work"] == "700102":
        pass
    exp, tot = oracle.expected(s)
    s["expected"] = {k: str(v) for k, v in exp.items()}
    s["totals"] = {k: str(v) for k, v in tot.items()}
    # engine input
    c = lambda x: int((D(x) * 100).to_integral_value())
    cert = {}
    if local:
        cert["workPSD"] = local["work"]
        if local.get("res"): cert["residencePSD"] = local["res"]
        if local.get("lst_cert"): cert["lstExemptionCertificate"] = True
    ei = {
        "checkDate": s["date"], "payFrequency": freq,
        "earnings": [{"code": f"E{j}", "category": cat, "amount": c(a)} for j, (cat, a) in enumerate(s["earnings"])],
        "deductions": [{"code": f"D{j}", "category": cat, "amount": c(a)} for j, (cat, a) in enumerate(s["deductions"])],
        "federalW4": s["w4"],
        "ytd": {"socialSecurity": s["ytd"]["socialSecurity"], "medicare": s["ytd"]["medicare"], "futa": s["ytd"]["futa"],
                "supplemental": s["ytd"]["supplemental"], "stateUnemployment": {"PA": s["ytd"]["stateUnemploymentPA"]}},
        "workState": {"code": "PA", "certificate": cert},
    }
    if residence: ei["residenceState"] = {"code": residence}
    s["engine_input"] = ei
    return s


S = [gen(i + 1) for i in range(N)]
json.dump(S, open(OUT + "/rand_scenarios.json", "w"))
print(len(S), "random scenarios (seed", SEED, ")")
