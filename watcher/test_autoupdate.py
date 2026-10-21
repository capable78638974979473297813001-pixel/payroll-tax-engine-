"""Tests for watcher/autoupdate.py. Every case runs in a throwaway git
repository, never in this one.

    python -m unittest watcher/test_autoupdate.py
"""

from __future__ import annotations

import copy
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import autoupdate as au  # noqa: E402
import reconcile  # noqa: E402

TODAY = dt.date.today().isoformat()
YEAR = int(TODAY[:4])
NOW = dt.datetime.now(dt.timezone.utc)
FINDER = "https://thefinder.tax.ohio.gov/api/file-downloads/content?target=x"
FILE = f"data/local/OH-municipalities-{YEAR}.json"

CONFIG = {
    "enabled": True, "max_changes_per_run": 5, "max_findings_per_run": 10,
    "min_confirm_gap_seconds": 20, "max_proposal_age_hours": 36,
    "rules": [{"glob": "data/local/OH-municipalities-*.json", "keys": ["rate"], "min": 0.0025, "max": 0.04,
               "max_abs_change": 0.01, "hosts": ["thefinder.tax.ohio.gov"]}],
}
SOURCES = [{"id": "oh-muni", "url": FINDER, "reconcile": "oh_municipal"}]


def muni_file(extra: dict | None = None) -> dict:
    ms = [
        {"name": "Aberdeen", "municode": "00142", "rate": 0.01, "effectiveFrom": "2004-01-01", "administeredBy": "RITA"},
        {"name": "Akron", "municode": "00200", "rate": 0.025, "effectiveFrom": "1990-01-01", "administeredBy": "CCA"},
        {"name": "Bexley", "municode": "00300", "rate": 0.025, "effectiveFrom": "1990-01-01",
         "rateHistory": [{"from": f"{YEAR}-01-01", "rate": 0.02}, {"from": f"{YEAR}-07-01", "rate": 0.025}]},
        {"name": "Canton", "municode": "00400", "rate": 0.02, "effectiveFrom": "1990-01-01", "sourceNote": "hand-checked"},
        {"name": "Dover", "municode": "00500", "rate": 0.015, "rateSourceRaw": "1.5", "effectiveFrom": "1990-01-01"},
        {"name": "Elyria", "municode": "00600", "rate": 0.0, "effectiveFrom": "1990-01-01"},
        {"name": "Fairlawn", "municode": "00700", "rate": 0.02, "effectiveFrom": "1990-01-01"},
        {"name": "Galion", "municode": "00800", "rate": 0.02, "effectiveFrom": "1990-01-01", "note": "kept; the rate is 0.02 here"},
    ]
    d = {"year": YEAR, "asOf": f"{YEAR}-01-02", "municipalities": ms}
    d.update(extra or {})
    return d


def write_json(root: Path, rel: str, data) -> None:
    (root / rel).parent.mkdir(parents=True, exist_ok=True)
    (root / rel).write_text(json.dumps(data, indent=2) + "\n")


def git(root: Path, *a: str) -> str:
    r = subprocess.run(["git", "-C", str(root), *a], capture_output=True, text=True, check=True)
    return r.stdout


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.root = Path(self._tmp.name)
        git(self.root, "init", "-q")
        git(self.root, "config", "user.email", "t@t")
        git(self.root, "config", "user.name", "t")
        write_json(self.root, FILE, muni_file())
        write_json(self.root, f"data/local/OH-municipalities-{YEAR - 1}.json", muni_file())
        write_json(self.root, f"data/local/OH-jedd-jedz-{YEAR}.json",
                   {"zones": [{"name": "Z", "jeddId": "9156", "rate": 0.015, "rateSourceRaw": "1.5"}]})
        (self.root / "src").mkdir()
        (self.root / "src" / "calc.ts").write_text("export const rate = 0.01;\n")
        (self.root / "notes.json").write_text('{"rate": 0.01}\n')
        git(self.root, "add", "-A")
        git(self.root, "commit", "-q", "-m", "init")
        self.cfg = copy.deepcopy(CONFIG)

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def line_of(self, code: str, key: str = "rate", file: str = FILE) -> int:
        return au.locate(self.root, file, "municode", code, key)

    def proposal(self, code="00142", new=0.0125, **over) -> dict:
        file = over.pop("file", FILE)
        line = over.pop("line", None) or self.line_of(code, "rate", file)
        if "old_text" in over:
            old_text = over.pop("old_text")
        else:
            old = au.LINE_RE.match((self.root / file).read_text().split("\n")[line - 1])
            old_text = old.group("num") if old else "0"
        p = {
            "id": f"{file}#municode={code}.rate", "file": file, "line": line, "key": "rate",
            "old_text": old_text, "new_text": au.fmt_number(new), "new": new,
            "effective_from": f"{YEAR}-01-01", "name": "Aberdeen", "kind": "rate_differs", "as_of": TODAY,
            "evidence": {"source_id": "oh-muni", "url": FINDER, "official_value": new, "reads": self.reads(new)},
        }
        p.update(over)
        return p

    def reads(self, value, gap=30, age_minutes=1):
        last = NOW - dt.timedelta(minutes=age_minutes)
        return [{"at": (last - dt.timedelta(seconds=gap)).isoformat(), "value": value}, {"at": last.isoformat(), "value": value}]

    def check(self, p):
        return au.check(p, self.cfg, self.root, SOURCES, TODAY, NOW)

    def rejects(self, p, fragment: str):
        with self.assertRaises(au.Rejected) as cm:
            self.check(p)
        self.assertIn(fragment, str(cm.exception))


class TheOneThingItMayDo(Base):
    def test_a_clean_proposal_replaces_one_number_on_one_line(self):
        p = self.proposal()
        plan = self.check(p)
        before = (self.root / FILE).read_text().split("\n")
        after = plan["text"].split("\n")
        self.assertEqual(len(before), len(after))
        changed = [i for i, (a, b) in enumerate(zip(before, after)) if a != b]
        self.assertEqual(changed, [p["line"] - 1])
        self.assertEqual(before[p["line"] - 1].strip(), '"rate": 0.01,')
        self.assertEqual(after[p["line"] - 1].strip(), '"rate": 0.0125,')
        # Indentation and the trailing comma are untouched.
        self.assertEqual(before[p["line"] - 1].replace("0.01", "0.0125"), after[p["line"] - 1])

    def test_check_never_writes(self):
        before = (self.root / FILE).read_text()
        self.check(self.proposal())
        self.assertEqual((self.root / FILE).read_text(), before)

    def test_number_formatting(self):
        self.assertEqual(au.fmt_number(0.0225), "0.0225")
        self.assertEqual(au.fmt_number(0.02), "0.02")
        self.assertEqual(au.fmt_number(0.015000000000000001), "0.015")
        self.assertEqual(au.fmt_number(1), "1.0")
        self.assertNotIn("e", au.fmt_number(0.0001))


class WhereItMayWrite(Base):
    def test_only_data_json(self):
        for rel in ("src/calc.ts", "notes.json", "watcher/sources.json", "tests/x.json", "site/x.json", "package.json"):
            self.rejects(self.proposal(file=rel, line=1, old_text="0"), "only .json files under data/")

    def test_path_tricks(self):
        for rel in ("../outside/data/x-2026.json", "/etc/passwd", "data/../src/calc.ts", "data\\local\\x.json"):
            with self.assertRaises(au.Rejected):
                self.check(self.proposal(file=rel, line=1, old_text="0"))

    def test_files_no_rule_covers(self):
        self.rejects(self.proposal(file=f"data/local/OH-jedd-jedz-{YEAR}.json", line=6, old_text="0.015", new_text="0.02", new=0.02),
                     "no rule allows")

    def test_keys_no_rule_covers(self):
        p = self.proposal(key="effectiveFrom")
        self.rejects(p, "no rule allows")

    def test_untracked_file(self):
        write_json(self.root, f"data/local/OH-municipalities-{YEAR + 1}.json", muni_file())
        self.rejects(self.proposal(file=f"data/local/OH-municipalities-{YEAR + 1}.json", line=6), "not tracked")

    def test_symlink(self):
        target = self.root / FILE
        link = self.root / f"data/local/OH-municipalities-{YEAR + 2}.json"
        link.symlink_to(target)
        git(self.root, "add", "-A")
        self.rejects(self.proposal(file=f"data/local/OH-municipalities-{YEAR + 2}.json", line=6), "symlink")

    def test_a_past_years_file_is_final(self):
        self.rejects(self.proposal(file=f"data/local/OH-municipalities-{YEAR - 1}.json"), "past year")


class WhichLineItMayReplace(Base):
    def test_wrong_line(self):
        p = self.proposal()
        for line in (p["line"] - 1, p["line"] + 1, 1, 9999):
            with self.assertRaises(au.Rejected):
                self.check({**p, "line": line})

    def test_value_changed_since_the_proposal_was_made(self):
        self.rejects(self.proposal(old_text="0.02"), "holds 0.01")

    def test_the_line_must_hold_the_named_key(self):
        p = self.proposal()
        self.rejects({**p, "line": p["line"] - 1}, "is not a plain")  # municode line is a string, not a number

    def test_not_a_bare_number_line(self):
        lines = (self.root / FILE).read_text().split("\n")
        ln = next(i for i, l in enumerate(lines) if '"name": "Aberdeen"' in l) + 1
        self.rejects(self.proposal(line=ln, old_text="0"), "is not a plain")

    def test_new_value_must_be_a_plain_decimal(self):
        for bad in ("0.0125,\n      \"x\": 1", "1e-2", "0.01.5", "-0.01", "0x1", " 0.012", "0.0125 ", "'0.0125'", "0.1234567", "5"):
            self.rejects(self.proposal(new_text=bad), "plain decimal")

    def test_new_text_must_match_the_official_value(self):
        self.rejects(self.proposal(new_text="0.0150", new=0.0125), "disagrees with the official value")

    def test_no_op(self):
        self.rejects(self.proposal(new=0.01), "nothing to change")

    def test_must_touch_exactly_one_value(self):
        # Two numbers that would change if the line were applied twice.
        p = self.proposal()
        plan = self.check(p)
        self.assertEqual(sum(a != b for a, b in zip((self.root / FILE).read_text().split("\n"), plan["text"].split("\n"))), 1)


class WhatValuesItMayTouch(Base):
    def test_a_line_that_changes_nothing_the_engine_reads_is_refused(self):
        # A duplicate key: JSON keeps the last one, so editing the first
        # would "succeed" while changing no parsed value.
        path = self.root / FILE
        text = path.read_text().replace('      "rate": 0.01,\n', '      "rate": 0.01,\n      "rate": 0.011,\n', 1)
        path.write_text(text)
        git(self.root, "commit", "-qam", "dup")
        first = next(i for i, l in enumerate(text.split("\n")) if l.strip() == '"rate": 0.01,') + 1
        self.rejects(self.proposal(line=first, old_text="0.01", new=0.0125), "not exactly one")

    def test_zero_either_way(self):
        self.rejects(self.proposal(code="00600", new=0.01), "going to or from zero")
        self.rejects(self.proposal(new=0.0), "going to or from zero")

    def test_bounds(self):
        self.rejects(self.proposal(new=0.05, new_text="0.05"), "outside the allowed range")
        self.rejects(self.proposal(new=0.002), "outside the allowed range")

    def test_size_cap(self):
        self.rejects(self.proposal(code="00200", new=0.0149), "larger than the")

    def test_entry_with_history(self):
        self.rejects(self.proposal(code="00300", new=0.03), "dated history")

    def test_entry_with_a_hand_checked_note(self):
        self.rejects(self.proposal(code="00400", new=0.03), "hand-checked departure")

    def test_entry_with_a_mirror_field(self):
        self.rejects(self.proposal(code="00500", new=0.02), "mirror the value")

    def test_a_note_that_merely_contains_the_number_is_not_edited(self):
        plan = self.check(self.proposal(code="00800", new=0.025))
        self.assertIn("the rate is 0.02 here", plan["text"])

    def test_file_with_overlays(self):
        write_json(self.root, FILE, muni_file({"effectiveDated": [{"from": f"{YEAR}-07-01", "path": "x", "value": 1}]}))
        git(self.root, "commit", "-qam", "overlay")
        self.rejects(self.proposal(), "effectiveDated overlays")


class WhenItMayTakeEffect(Base):
    def test_mid_year_change_is_a_person_s(self):
        self.rejects(self.proposal(effective_from=f"{YEAR}-03-01"), "after January 1")

    def test_start_on_or_before_jan_1_is_fine(self):
        self.check(self.proposal(effective_from=f"{YEAR - 3}-05-01"))
        self.check(self.proposal(effective_from=f"{YEAR}-01-01"))

    def test_bad_date(self):
        self.rejects(self.proposal(effective_from="soon"), "not a date")

    def test_stale_proposal(self):
        yesterday = (dt.date.today() - dt.timedelta(days=1)).isoformat()
        self.rejects(self.proposal(as_of=yesterday), "not today")


class WhatEvidenceItNeeds(Base):
    def ev(self, **over):
        p = self.proposal()
        p["evidence"] = {**p["evidence"], **over}
        return p

    def test_host(self):
        self.rejects(self.ev(url="https://evil.example/OHMuniRateTable.csv"), "not an allowed official host")

    def test_https_only(self):
        self.rejects(self.ev(url=FINDER.replace("https", "http")), "not an https URL")

    def test_source_must_be_one_the_watcher_tracks(self):
        self.rejects(self.ev(source_id="made-up"), "not a source the watcher tracks")
        self.rejects(self.ev(url="https://thefinder.tax.ohio.gov/other"), "not a source the watcher tracks")

    def test_needs_two_reads(self):
        self.rejects(self.ev(reads=self.reads(0.0125)[:1]), "fewer than two")

    def test_reads_must_agree(self):
        r = self.reads(0.0125)
        r[0]["value"] = 0.015
        self.rejects(self.ev(reads=r), "do not all agree")

    def test_reads_must_be_apart(self):
        self.rejects(self.ev(reads=self.reads(0.0125, gap=2)), "apart")

    def test_evidence_goes_stale(self):
        self.rejects(self.ev(reads=self.reads(0.0125, age_minutes=60 * 40)), "stale")

    def test_malformed_read(self):
        self.rejects(self.ev(reads=[{"value": 0.0125}, {"value": 0.0125}]), "no valid timestamp")

    def test_missing_fields(self):
        p = self.proposal()
        del p["evidence"]
        self.rejects(p, "missing evidence")


class WhenNothingMayHappen(Base):
    def test_off_means_off(self):
        self.cfg["enabled"] = False
        p = self.proposal()
        acc, rej = au.triage([p], self.cfg, self.root, SOURCES, TODAY, 1, NOW)
        self.assertEqual(len(acc), 1)  # still checked and reported
        before = (self.root / FILE).read_text()
        with self.assertRaises(au.Rejected):
            au.apply(acc, self.cfg, self.root, SOURCES, TODAY, verify=[], now=NOW)
        self.assertEqual((self.root / FILE).read_text(), before)

    def test_the_shipped_config_is_off_and_every_rule_is_bounded(self):
        cfg = au.load_config(au.CONFIG)
        self.assertIs(cfg["enabled"], False)
        for r in cfg["rules"]:
            self.assertTrue(r["glob"].startswith("data/") and r["glob"].endswith(".json"), r)
            self.assertTrue(0 < r["min"] < r["max"] and r["max_abs_change"] > 0 and r["hosts"], r)
            self.assertTrue(all(h.count(".") >= 1 and "/" not in h for h in r["hosts"]), r)
        self.assertEqual(au.load_config(self.root / "missing.json")["rules"], [])

    def test_circuit_breaker_on_too_many_changes(self):
        names = [("00142", 0.0125), ("00700", 0.0225), ("00800", 0.0225)]
        self.cfg["max_changes_per_run"] = 2
        ps = [self.proposal(code=c, new=n) for c, n in names]
        acc, rej = au.triage(ps, self.cfg, self.root, SOURCES, TODAY, 3, NOW)
        self.assertEqual(acc, [])
        self.assertTrue(all("circuit breaker" in r["reason"] for r in rej))

    def test_circuit_breaker_on_a_flood_of_disagreements(self):
        acc, rej = au.triage([self.proposal()], self.cfg, self.root, SOURCES, TODAY, 400, NOW)
        self.assertEqual(acc, [])
        self.assertIn("changed shape", rej[0]["reason"])

    def test_duplicates(self):
        p = self.proposal()
        acc, rej = au.triage([p, copy.deepcopy(p)], self.cfg, self.root, SOURCES, TODAY, 2, NOW)
        self.assertEqual(len(acc), 1)
        self.assertIn("second proposal", rej[0]["reason"])

    def test_rejections_are_collected_not_raised(self):
        good, bad = self.proposal(), self.proposal(code="00600", new=0.01)
        acc, rej = au.triage([good, bad], self.cfg, self.root, SOURCES, TODAY, 2, NOW)
        self.assertEqual([a["id"] for a in acc], [good["id"]])
        self.assertEqual(len(rej), 1)


class Applying(Base):
    def apply(self, ps, verify=()):
        return au.apply(ps, self.cfg, self.root, SOURCES, TODAY, verify=list(verify), now=NOW)

    def test_writes_exactly_the_intended_line(self):
        p = self.proposal()
        self.apply([p])
        diff = git(self.root, "diff", "-U0")
        added = [l for l in diff.splitlines() if l.startswith("+") and not l.startswith("+++")]
        removed = [l for l in diff.splitlines() if l.startswith("-") and not l.startswith("---")]
        self.assertEqual((len(added), len(removed)), (1, 1))
        self.assertIn('"rate": 0.0125,', added[0])
        self.assertEqual(git(self.root, "status", "--porcelain").split(), ["M", FILE])

    def test_two_changes_in_one_file(self):
        self.apply([self.proposal(), self.proposal(code="00700", new=0.0225)])
        self.assertEqual(len([l for l in git(self.root, "diff", "-U0").splitlines() if l.startswith("+") and not l.startswith("+++")]), 2)

    def test_failed_verification_puts_everything_back(self):
        before = (self.root / FILE).read_text()
        with self.assertRaises(au.Rejected) as cm:
            self.apply([self.proposal()], verify=["exit 1"])
        self.assertIn("failed", str(cm.exception))
        self.assertEqual((self.root / FILE).read_text(), before)
        self.assertEqual(git(self.root, "status", "--porcelain"), "")

    def test_a_verify_step_that_edits_other_files_is_caught_and_undone(self):
        with self.assertRaises(au.Rejected) as cm:
            self.apply([self.proposal()], verify=["echo '// tampered' >> src/calc.ts"])
        self.assertIn("unexpected files changed", str(cm.exception))
        self.assertEqual((self.root / "src" / "calc.ts").read_text(), "export const rate = 0.01;\n")
        self.assertEqual(git(self.root, "status", "--porcelain"), "")

    def test_generated_bundle_may_change_with_the_data(self):
        gen = self.root / "supabase" / "functions" / "_shared"
        gen.mkdir(parents=True)
        (gen / "data-bundle.ts").write_text("old\n")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "bundle")
        self.apply([self.proposal()], verify=["echo new > supabase/functions/_shared/data-bundle.ts"])
        self.assertEqual(sorted(git(self.root, "status", "--porcelain").split()), sorted(["M", "M", FILE, "supabase/functions/_shared/data-bundle.ts"]))

    def test_dirty_tree_is_refused(self):
        (self.root / "src" / "calc.ts").write_text("export const rate = 0.02;\n")
        with self.assertRaises(au.Rejected) as cm:
            self.apply([self.proposal()])
        self.assertIn("not clean", str(cm.exception))

    def test_rechecked_at_write_time(self):
        p = self.proposal()
        # The file moves between triage and apply.
        text = (self.root / FILE).read_text().replace('"rate": 0.01,', '"rate": 0.011,', 1)
        (self.root / FILE).write_text(text)
        git(self.root, "commit", "-qam", "someone edited it")
        with self.assertRaises(au.Rejected):
            self.apply([p])
        self.assertEqual(git(self.root, "status", "--porcelain"), "")

    def test_a_late_rejection_leaves_earlier_edits_undone(self):
        good, bad = self.proposal(), self.proposal(code="00600", new=0.01)
        with self.assertRaises(au.Rejected):
            self.apply([good, bad])
        self.assertEqual(git(self.root, "status", "--porcelain"), "")


JEDD_FILE = f"data/local/OH-jedd-jedz-{YEAR}.json"
JEDD_RULES = [
    {"glob": "data/local/OH-jedd-jedz-*.json", "keys": ["rate", "rateSourceRaw"], "min": 0.0025, "max": 0.04,
     "max_abs_change": 0.01, "hosts": ["thefinder.tax.ohio.gov"]},
    {"glob": "data/states/IL-*.json", "keys": ["rate", "supplementalRate"], "min": 0.01, "max": 0.09,
     "max_abs_change": 0.01, "hosts": ["tax.illinois.gov"]},
    {"glob": "data/local/PA-*.json", "keys": ["residentEIT", "schoolDistrictEIT", "totalResidentEIT"], "min": 0.0025, "max": 0.05,
     "max_abs_change": 0.01, "hosts": ["apps.dced.pa.gov"], "independent_values": True},
]
IL_URL = "https://tax.illinois.gov/forms/withholding/currentyear/il-700-t-withholding-guide-tables.html"
IL_FILE = f"data/states/IL-{YEAR}.json"
PA_FILE = f"data/local/PA-EIT-LST-{YEAR}.json"


class LinkedLines(Base):
    """A change that must move several lines together, each still an exact
    file-and-line replacement."""

    def setUp(self) -> None:
        super().setUp()
        self.cfg["rules"] += JEDD_RULES
        write_json(self.root, JEDD_FILE, {"year": YEAR, "zones": [
            {"name": "Zone A", "jeddId": "9156", "rate": 0.015, "rateSourceRaw": "1.5", "effectiveFrom": "2005-02-22"},
            {"name": "Zone B", "jeddId": "9157", "rate": 0.02, "rateSourceRaw": "2", "effectiveFrom": "2005-02-22", "terminatedOn": "2030-01-01"},
            {"name": "Zone C", "jeddId": "9158", "rate": 0.02, "rateSourceRaw": "2", "effectiveFrom": "2005-02-22", "$correctionNote": "x"},
        ]})
        write_json(self.root, IL_FILE, {"year": YEAR, "flatRate": {"rate": 0.0495, "comment": "c"}, "supplementalRate": 0.0495,
                                        "supplementalComment": "s"})
        write_json(self.root, PA_FILE, {"year": YEAR, "jurisdictions": [
            {"psdCode": "1", "residentEIT": 0.005, "schoolDistrictEIT": 0.018, "totalResidentEIT": 0.023}]})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "linked")
        self.sources = SOURCES + [{"id": "il", "url": IL_URL}, {"id": "pa", "url": "https://apps.dced.pa.gov/x"}]

    def jedd(self, ident="9156", new=0.0175, **over):
        pos = au._positions(self.root, JEDD_FILE)
        base = au.locate_path(self.root, JEDD_FILE, "jeddId", ident, "rate")
        raw = base[:-1] + ("rateSourceRaw",)
        p = {"id": f"jedd{ident}", "file": JEDD_FILE, "new": new, "effective_from": f"{YEAR}-01-01", "as_of": TODAY,
             "name": "Zone", "kind": "rate_differs",
             "edits": [{"path": list(base), "line": pos[base][0], "key": "rate", "old_text": pos[base][1], "new_text": au.fmt_number(new), "relation": None},
                       {"path": list(raw), "line": pos[raw][0], "key": "rateSourceRaw", "old_text": pos[raw][1].strip('"'),
                        "new_text": au.fmt_percent(new), "relation": "percent_string"}],
             "evidence": {"source_id": "oh-muni", "url": FINDER, "official_value": new, "reads": self.reads(new)}}
        p.update(over)
        return p

    def ok(self, p):
        return au.check(p, self.cfg, self.root, self.sources, TODAY, NOW)

    def bad(self, p, fragment):
        with self.assertRaises(au.Rejected) as cm:
            self.ok(p)
        self.assertIn(fragment, str(cm.exception))

    def test_a_rate_and_its_mirrored_percent_move_together(self):
        plan = self.ok(self.jedd())
        before, after = (self.root / JEDD_FILE).read_text().split("\n"), plan["text"].split("\n")
        self.assertEqual(sum(a != b for a, b in zip(before, after)), 2)
        self.assertIn('"rate": 0.0175,', "\n".join(after))
        self.assertIn('"rateSourceRaw": "1.75",', "\n".join(after))

    def test_the_mirror_must_be_the_percent_of_the_rate(self):
        p = self.jedd()
        p["edits"][1]["new_text"] = "1.8"
        self.bad(p, "percent form of the rate")

    def test_a_rate_alone_would_leave_its_mirror_stale(self):
        p = self.jedd()
        p["edits"] = p["edits"][:1]
        self.bad(p, "mirror the value")

    def test_a_zone_with_an_end_date_is_a_persons(self):
        self.bad(self.jedd("9157"), "end date")

    def test_a_zone_with_a_note_is_a_persons(self):
        self.bad(self.jedd("9158"), "hand-checked departure")

    def test_edits_must_each_be_exact(self):
        p = self.jedd()
        p["edits"][1]["line"] += 1
        self.bad(p, "line")

    def test_extra_edits_are_not_smuggled_in(self):
        p = self.jedd()
        p["edits"].append({"line": 1, "key": "rate", "old_text": "0", "new_text": "0.01", "relation": None})
        with self.assertRaises(au.Rejected):
            self.ok(p)

    def test_no_more_than_six_edits(self):
        p = self.jedd()
        p["edits"] = p["edits"] * 4
        self.bad(p, "between one and six")

    def il(self, new=0.05, text=None, **over):
        pos = au._positions(self.root, IL_FILE)
        a, b = ("flatRate", "rate"), ("supplementalRate",)
        sentence = text or f"Effective January 1, {YEAR}, Tax Rate {new * 100:g}%"
        p = {"id": "il", "file": IL_FILE, "new": new, "effective_from": f"{YEAR}-01-01", "as_of": TODAY, "name": "IL", "kind": "stated_value_differs",
             "edits": [{"path": list(a), "line": pos[a][0], "key": "rate", "old_text": "0.0495", "new_text": au.fmt_number(new), "relation": None},
                       {"path": list(b), "line": pos[b][0], "key": "supplementalRate", "old_text": "0.0495", "new_text": au.fmt_number(new), "relation": "copy"}],
             "evidence": {"kind": "text", "source_id": "il", "url": IL_URL, "official_value": new, "reads": self.reads(new),
                          "pattern": r"Effective January 1, {year}, Tax Rate (\d+(?:\.\d+)?)%", "matched_text": sentence, "transform": "percent"}}
        p.update(over)
        return p

    def test_a_year_anchored_sentence_in_an_official_document_is_enough(self):
        plan = self.ok(self.il())
        self.assertEqual(sum(a != b for a, b in zip((self.root / IL_FILE).read_text().split("\n"), plan["text"].split("\n"))), 2)

    def test_copies_must_equal_the_primary(self):
        p = self.il()
        p["edits"][1]["new_text"] = "0.051"
        self.bad(p, "not a copy")

    def test_the_sentence_must_say_the_files_year(self):
        self.bad(self.il(text=f"Effective January 1, {YEAR - 1}, Tax Rate 5%"), "does not state the value")

    def test_the_pattern_must_name_a_year(self):
        p = self.il()
        p["evidence"]["pattern"] = r"Tax Rate (\d+(?:\.\d+)?)%"
        self.bad(p, "name the year")

    def test_the_number_in_the_sentence_must_be_the_proposed_value(self):
        self.bad(self.il(new=0.05, text=f"Effective January 1, {YEAR}, Tax Rate 4.9%"), "not the proposed value")

    def test_a_text_source_cannot_claim_a_mid_year_start(self):
        self.bad(self.il(effective_from=f"{YEAR}-07-01"), "whole year")

    def test_text_evidence_still_needs_two_agreeing_reads_on_a_tracked_host(self):
        p = self.il()
        p["evidence"]["reads"] = self.reads(0.05)[:1]
        self.bad(p, "fewer than two")
        p = self.il()
        p["evidence"]["url"] = "https://example.com/il"
        self.bad(p, "allowed official host")

    def test_derived_totals_must_add_up(self):
        pos = au._positions(self.root, PA_FILE)
        res, tot = ("jurisdictions", 0, "residentEIT"), ("jurisdictions", 0, "totalResidentEIT")
        def prop(total):
            return {"id": "pa", "file": PA_FILE, "new": 0.007, "effective_from": f"{YEAR}-01-01", "as_of": TODAY, "name": "PA", "kind": "rate_differs",
                    "edits": [{"path": list(res), "line": pos[res][0], "key": "residentEIT", "old_text": "0.005", "new_text": "0.007", "relation": None},
                              {"path": list(tot), "line": pos[tot][0], "key": "totalResidentEIT", "old_text": "0.023", "new_text": total,
                               "relation": {"sum": ["residentEIT", "schoolDistrictEIT"]}}],
                    "evidence": {"source_id": "pa", "url": "https://apps.dced.pa.gov/x", "official_value": 0.007, "reads": self.reads(0.007)}}
        self.ok(prop("0.025"))
        self.bad(prop("0.024"), "not the sum")

    def test_json_positions_see_every_value_and_flag_repeated_keys(self):
        pos = au.json_positions('{\n "a": 1,\n "b": {"c": [1, 2.5, "x"]},\n "a": 2\n}\n')
        self.assertEqual(pos[("b", "c", 1)][:2], (3, "2.5"))
        self.assertTrue(pos[("a",)][2])


class FromAnOfficialSentenceToTheLine(Base):
    """The same chain for values official documents state in words."""

    URL = "https://www.in.gov/dor/files/dn01.pdf"
    NEXT = YEAR + 1

    def setUp(self) -> None:
        super().setUp()
        import extractors  # noqa: PLC0415
        self.ex = extractors
        for y in (YEAR, self.NEXT):
            write_json(self.root, f"data/states/IN-{y}.json", {"year": y, "flatRate": {"rate": 0.0295, "comment": "c"}, "supplementalRate": 0.0295,
                                                              "supplementalComment": "s"})
        write_json(self.root, f"data/states/PA-{YEAR}.json", {"year": YEAR, "flatRate": {"rate": 0.0307, "comment": "c"}})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "states")
        self.cfg["rules"].append({"glob": "data/states/IN-*.json", "keys": ["rate", "supplementalRate"], "min": 0.01, "max": 0.06,
                                  "max_abs_change": 0.01, "hosts": ["www.in.gov"]})
        self.sources = [{"id": "in", "url": self.URL, "jurisdiction": "IN", "title": "DN1"},
                        {"id": "pa", "url": "https://www.pa.gov/employer-withholding.html", "jurisdiction": "PA"},
                        {"id": "in2", "url": "https://www.in.gov/dor/other.pdf", "jurisdiction": "IN"}]
        self.reg = [
            {"id": "IN-rate", "name": "Indiana rate", "jurisdiction": "IN", "source_id": "in", "file": "data/states/IN-{year}.json",
             "paths": [["flatRate", "rate"], ["supplementalRate"]],
             "pattern": r"For {year}, the state adjusted gross income tax rate for individuals is (\d+(?:\.\d+)?)%", "transform": "percent"},
            {"id": "PA-rate", "name": "PA rate", "jurisdiction": "PA", "source_id": "pa", "file": "data/states/PA-{year}.json",
             "paths": [["flatRate", "rate"]], "pattern": r"flat rate of (\d+(?:\.\d+)?) percent", "transform": "percent", "year_anchored": False},
        ]

    def found(self, in_text, pa_text="a flat rate of 3.07 percent of compensation", reg=None):
        tracked = {s["id"]: s for s in self.sources}
        return self.ex.findings(reg or self.reg, {"in": in_text, "pa": pa_text}, tracked, TODAY, self.root)

    def proposals(self, fs):
        for f in fs:
            f["reads"] = [{"at": (NOW - dt.timedelta(seconds=60)).isoformat(), "value": f.get("change", {}).get("new", 0)},
                          {"at": NOW.isoformat(), "value": f.get("change", {}).get("new", 0)}]
        self.cfg["min_confirm_gap_seconds"] = 20
        return au.proposals_from(fs, self.root, TODAY)

    def test_a_year_stated_in_the_document_is_applied_to_that_years_file(self):
        fs = self.found(f"x For {YEAR}, the state adjusted gross income tax rate for individuals is 3.05%. y")
        self.assertEqual(len(fs), 1)
        ps = self.proposals(fs)
        acc, rej = au.triage(ps, self.cfg, self.root, self.sources, TODAY, 1, NOW)
        self.assertEqual((len(acc), rej), (1, []))
        au.apply(acc, self.cfg, self.root, self.sources, TODAY, verify=[], now=NOW)
        d = json.loads((self.root / f"data/states/IN-{YEAR}.json").read_text())
        self.assertEqual((d["flatRate"]["rate"], d["supplementalRate"]), (0.0305, 0.0305))
        self.assertEqual(json.loads((self.root / f"data/states/IN-{self.NEXT}.json").read_text())["flatRate"]["rate"], 0.0295)
        self.assertEqual(len([l for l in git(self.root, "diff", "-U0").splitlines() if l.startswith("+") and not l.startswith("+++")]), 2)

    def test_a_sentence_about_next_year_changes_only_next_years_file(self):
        fs = self.found(f"For {self.NEXT}, the state adjusted gross income tax rate for individuals is 2.9%.")
        self.assertEqual([f["change"]["file"] for f in fs], [f"data/states/IN-{self.NEXT}.json"])

    def test_a_sentence_about_an_old_year_changes_nothing(self):
        self.assertEqual(self.found(f"For {YEAR - 1}, the state adjusted gross income tax rate for individuals is 3.23%."), [])

    def test_a_document_that_agrees_with_the_data_is_silent(self):
        self.assertEqual(self.found(f"For {YEAR}, the state adjusted gross income tax rate for individuals is 2.95%."), [])

    def test_two_different_rates_in_one_document_are_not_guessed_between(self):
        t = f"For {YEAR}, the state adjusted gross income tax rate for individuals is 3.05%. For {YEAR}, the state adjusted gross income tax rate for individuals is 2.95%."
        self.assertEqual(self.found(t), [])

    def test_a_second_document_must_agree(self):
        self.sources.append({"id": "in3", "url": "https://www.in.gov/third.pdf", "jurisdiction": "IN"})
        reg = [dict(self.reg[0], also=[{"source_id": "in3", "pattern": r"{year} rate is (\d+(?:\.\d+)?)%", "transform": "percent"}])]
        tracked = {s["id"]: s for s in self.sources}
        main_text = f"For {YEAR}, the state adjusted gross income tax rate for individuals is 3.05%."
        agree = self.ex.findings(reg, {"in": main_text, "in3": f"{YEAR} rate is 3.05%"}, tracked, TODAY, self.root)
        differ = self.ex.findings(reg, {"in": main_text, "in3": f"{YEAR} rate is 3.1%"}, tracked, TODAY, self.root)
        silent = self.ex.findings(reg, {"in": main_text}, tracked, TODAY, self.root)
        self.assertEqual((len(agree), differ, silent), (1, [], []))

    def test_a_document_that_does_not_name_the_year_is_reported_never_applied(self):
        fs = self.found("x", pa_text="a flat rate of 3.2 percent of compensation")
        self.assertEqual(len(fs), 1)
        self.assertNotIn("change", fs[0])
        self.assertIn("for a person", fs[0]["detail"])
        self.assertEqual(au.proposals_from(fs, self.root, TODAY), [])

    def test_a_claimed_sentence_that_is_not_in_the_proposal_is_refused(self):
        fs = self.found(f"For {YEAR}, the state adjusted gross income tax rate for individuals is 3.05%.")
        ps = self.proposals(fs)
        ps[0]["evidence"]["matched_text"] = f"For {YEAR}, the state adjusted gross income tax rate for individuals is 2.95%."
        acc, rej = au.triage(ps, self.cfg, self.root, self.sources, TODAY, 1, NOW)
        self.assertEqual(acc, [])
        self.assertIn("not the proposed value", rej[0]["reason"])

    def test_an_unreadable_document_proposes_nothing(self):
        tracked = {s["id"]: s for s in self.sources}
        self.assertEqual(self.ex.findings(self.reg, {}, tracked, TODAY, self.root), [])

    def test_gather_confirms_text_findings_with_two_reads_and_lists_the_rest(self):
        body = f"For {YEAR}, the state adjusted gross income tax rate for individuals is 3.05%."
        pa = "a flat rate of 3.2 percent of compensation"
        pages = {self.URL: body, self.sources[1]["url"]: pa}

        def fetcher(url):
            return SimpleNamespace(ok=url in pages, body=pages.get(url, "").encode(), error="", status=200)

        others: list = []
        run = lambda srcs, f, day, repo: au.run_all(srcs, f, day, repo, lambda s, fetched: fetched.body.decode())
        (self.root / "watcher").mkdir(exist_ok=True)
        (self.root / "watcher" / "extractors.json").write_text(json.dumps({"extractors": self.reg}))
        confirmed, total = au.gather(self.sources, fetcher, TODAY, self.root, gap=0, sleep=lambda s: None, run=run, others=others)
        self.assertEqual((len(confirmed), total, len(others)), (1, 2, 1))
        self.assertEqual(len(confirmed[0]["reads"]), 2)
        self.assertEqual(others[0]["code"], "PA-rate")


PA_REG_FILE = f"data/local/PA-EIT-LST-{YEAR}.json"
PA_URL = f"https://apps.dced.pa.gov/munstats-public/ReportToPdf.aspx?report=EitWithCollector_Dyn_Excel&paramList=O;{YEAR}"
PA_RULES = [
    {"glob": "data/local/PA-EIT-LST-*.json", "keys": ["residentEIT", "nonresidentEIT", "schoolDistrictEIT", "totalResidentEIT"],
     "min": 0.0025, "max": 0.05, "max_abs_change": 0.01, "hosts": ["apps.dced.pa.gov"], "independent_values": True,
     "max_changes_per_run": 80, "max_findings_per_run": 120},
    {"glob": "data/local/PA-EIT-LST-*.json", "keys": ["municipal", "schoolDistrict", "total"], "min": 1, "max": 100,
     "max_abs_change": 25, "hosts": ["apps.dced.pa.gov"], "independent_values": True, "max_changes_per_run": 80, "max_findings_per_run": 120},
]


class FromThePennsylvaniaRegister(Base):
    """DCED's statewide register, row by row, against the PA local file."""

    N = 2100

    def setUp(self) -> None:
        super().setUp()
        self.cfg["rules"] += PA_RULES
        self.entries = []
        for i in range(self.N):
            self.entries.append({
                "psdCode": f"{i + 100000}", "county": "ADAMS", "municipality": f"TOWN {i}", "schoolDistrictId": f"sd{i % 40}",
                "schoolDistrict": f"SD {i % 40}", "residentEIT": 0.005, "nonresidentEIT": 0.005, "schoolDistrictEIT": 0.01,
                "totalResidentEIT": 0.015, "residentEITEffective": "01/01/2000", "nonresidentEITEffective": "01/01/2000",
                "schoolDistrictEITEffective": "07/01/2016",
                "lst": {"municipal": 47.0, "schoolDistrict": 5.0, "total": 52.0, "municipalEffective": "01/01/2008", "schoolDistrictEffective": "01/01/2008"},
                "eitCollector": "x"})
        self.write()
        self.source = {"id": "pa-reg", "url": PA_URL, "jurisdiction": "PA", "reconcile": "pa_local"}
        self.sources = [self.source]
        self.cfg["max_changes_per_run"] = 5

    def write(self):
        write_json(self.root, PA_REG_FILE, {"year": YEAR, "jurisdictions": self.entries})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "pa", "--allow-empty")

    def rows(self, **change):
        rows = []
        for e in self.entries:
            rows.append({"year": str(YEAR), "psd": e["psdCode"], "res": 0.5, "res_on": "01/01/2000", "nonres": 0.5, "nonres_on": "01/01/2000",
                         "sd": 1.0, "sd_on": "07/01/2016", "total": 1.5, "lst_m": 47.0, "lst_m_on": "01/01/2008", "lst_sd": 5.0,
                         "lst_sd_on": "01/01/2008", "lst_total": 52.0})
        for psd, upd in change.items():
            for r in rows:
                if r["psd"] == psd:
                    r.update(upd)
        return rows

    def reconcile(self, rows):
        with mock.patch.object(reconcile, "_pa_rows", return_value=rows):
            return reconcile.reconcile_pa_local(b"x", self.source, TODAY, self.root)

    def run_chain(self, rows):
        fs = self.reconcile(rows)
        for f in fs:
            if f.get("change"):
                f["reads"] = [{"at": (NOW - dt.timedelta(seconds=60)).isoformat(), "value": f["change"]["new"]},
                              {"at": NOW.isoformat(), "value": f["change"]["new"]}]
        ps = au.proposals_from([f for f in fs if f.get("change")], self.root, TODAY)
        counts = {"pa-reg": sum(1 for f in fs if f["severity"] == "action")}
        acc, rej = au.triage(ps, self.cfg, self.root, self.sources, TODAY, counts["pa-reg"], NOW, counts=counts)
        return fs, ps, acc, rej

    def test_the_whole_register_agreeing_with_the_data_is_silent(self):
        self.assertEqual(self.reconcile(self.rows()), [])

    def test_a_clean_resident_rate_correction_moves_the_rate_and_its_total_only(self):
        fs, ps, acc, rej = self.run_chain(self.rows(**{"100007": {"res": 0.75, "total": 1.75}}))
        self.assertEqual((len(fs), len(acc), rej), (1, 1, []))
        self.assertEqual([(e["key"], e["old_text"], e["new_text"]) for e in acc[0]["edits"]],
                         [("residentEIT", "0.005", "0.0075"), ("totalResidentEIT", "0.015", "0.0175")])
        au.apply(acc, self.cfg, self.root, self.sources, TODAY, verify=[], now=NOW)
        e = json.loads((self.root / PA_REG_FILE).read_text())["jurisdictions"][7]
        self.assertEqual((e["residentEIT"], e["totalResidentEIT"], e["residentEITEffective"]), (0.0075, 0.0175, "01/01/2000"))
        self.assertEqual(len([l for l in git(self.root, "diff", "-U0").splitlines() if l.startswith("+") and not l.startswith("+++")]), 2)

    def test_a_school_district_change_fans_out_to_every_municipality_in_it(self):
        changes = {e["psdCode"]: {"sd": 1.25, "total": 1.75} for e in self.entries if e["schoolDistrictId"] == "sd3"}
        fs, ps, acc, rej = self.run_chain(self.rows(**changes))
        self.assertEqual((len(changes), len(acc), rej), (len(fs), len(changes), []))
        self.assertTrue(len(changes) > 5)  # more than the global cap, within the rule's own
        au.apply(acc, self.cfg, self.root, self.sources, TODAY, verify=[], now=NOW)
        sd = {e["schoolDistrictEIT"] for e in json.loads((self.root / PA_REG_FILE).read_text())["jurisdictions"] if e["schoolDistrictId"] == "sd3"}
        self.assertEqual(sd, {0.0125})

    def test_a_flood_of_differences_means_the_register_changed_shape(self):
        changes = {e["psdCode"]: {"res": 0.9, "total": 1.9} for e in self.entries[:300]}
        fs, ps, acc, rej = self.run_chain(self.rows(**changes))
        self.assertEqual(acc, [])
        self.assertTrue(all("circuit breaker" in r["reason"] for r in rej))

    def test_a_changed_date_means_a_new_rate_not_a_correction(self):
        fs, ps, acc, rej = self.run_chain(self.rows(**{"100007": {"res": 0.75, "total": 1.75, "res_on": "07/01/2026"}}))
        self.assertEqual((len(fs), ps, acc), (1, [], []))

    def test_a_mid_year_effective_date_is_never_applied(self):
        e = self.entries[7]
        e["residentEITEffective"] = f"07/01/{YEAR}"
        self.write()
        fs, ps, acc, rej = self.run_chain(self.rows(**{"100007": {"res": 0.75, "total": 1.75, "res_on": f"07/01/{YEAR}"}}))
        self.assertEqual((len(fs), ps, acc), (1, [], []))

    def test_no_official_date_means_no_automatic_change(self):
        fs, ps, acc, rej = self.run_chain(self.rows(**{"100007": {"res": 0.75, "total": 1.75, "res_on": ""}}))
        self.assertEqual((len(fs), ps), (1, []))

    def test_an_entry_with_its_own_dated_changes_or_notes_is_reported_only(self):
        self.entries[7]["rateChanges"] = [{"on": f"{YEAR}-07-01", "set": {"residentEIT": 0.01}}]
        self.entries[8]["$note"] = "set annually"
        self.write()
        fs, ps, acc, rej = self.run_chain(self.rows(**{"100007": {"res": 0.75, "total": 1.75}, "100008": {"res": 0.75, "total": 1.75}}))
        self.assertEqual((len(fs), {f["severity"] for f in fs}, ps), (2, {"info"}, []))

    def test_a_register_whose_total_is_not_the_sum_of_its_parts_is_not_trusted(self):
        fs, ps, acc, rej = self.run_chain(self.rows(**{"100007": {"res": 0.75, "total": 1.5}}))
        self.assertEqual(ps, [])

    def test_a_duplicate_psd_code_cannot_name_a_line(self):
        self.entries[8]["psdCode"] = self.entries[7]["psdCode"]
        self.write()
        rows = self.rows()
        rows[8]["psd"] = rows[7]["psd"]
        rows[7]["res"] = 0.75
        rows[7]["total"] = 1.75
        fs = self.reconcile(rows)
        self.assertTrue(fs)
        self.assertTrue(all("change" not in f for f in fs))

    def test_a_local_services_tax_correction_updates_its_parts_and_total(self):
        fs, ps, acc, rej = self.run_chain(self.rows(**{"100009": {"lst_m": 42.0, "lst_total": 47.0}}))
        self.assertEqual((len(acc), rej), (1, []))
        self.assertEqual([(e["key"], e["new_text"]) for e in acc[0]["edits"]], [("municipal", "42.0"), ("total", "47.0")])

    def test_tampering_with_a_companion_date_is_caught(self):
        fs, ps, acc, rej = self.run_chain(self.rows(**{"100007": {"res": 0.75, "total": 1.75}}))
        p = json.loads(json.dumps(acc[0]))
        p["companions"][0]["value"] = "01/01/1999"
        with self.assertRaises(au.Rejected) as cm:
            au.check(p, self.cfg, self.root, self.sources, TODAY, NOW)
        self.assertIn("companion", str(cm.exception))
        p = json.loads(json.dumps(acc[0]))
        p["companions"] = []
        with self.assertRaises(au.Rejected) as cm:
            au.check(p, self.cfg, self.root, self.sources, TODAY, NOW)
        self.assertIn("mirror", str(cm.exception))

    def test_a_register_with_the_wrong_year_or_too_few_rows_is_unreadable(self):
        rows = self.rows()
        self.assertEqual(self.reconcile(rows[:100])[0]["kind"], "unreadable")
        rows[0]["year"] = str(YEAR - 1)
        self.assertEqual(self.reconcile(rows)[0]["kind"], "unreadable")

    def test_a_register_that_has_not_been_filled_in_yet_is_not_compared(self):
        rows = [dict(r, res=0.0, nonres=0.0, sd=0.0, total=0.0) for r in self.rows()]
        fs = self.reconcile(rows)
        self.assertEqual([(f["kind"], f["severity"]) for f in fs], [("not_yet_published", "info")])

    def test_a_register_missing_from_the_data_is_reported(self):
        rows = self.rows()
        rows.append(dict(rows[0], psd="999999"))
        fs = self.reconcile(rows)
        self.assertEqual([f["kind"] for f in fs], ["missing_from_engine"])

    def test_the_real_spreadsheet_format_is_read(self):
        rows = reconcile._pa_rows((Path(__file__).parent / "fixtures" / "pa_register_sample.xls").read_bytes())
        self.assertEqual([r["psd"] for r in rows], ["010201", "530301"])
        self.assertEqual((rows[0]["sd"], rows[0]["sd_on"], rows[0]["lst_total"]), (1.0, "07/01/2016", 52.0))
        self.assertIsNone(reconcile._pa_rows(b"not a spreadsheet"))


class IndianaCountiesAndNewYorkEditions(Base):
    """Indiana's January 1 county table and New York's edition-anchored rates."""

    def setUp(self) -> None:
        super().setUp()
        import extractors  # noqa: PLC0415
        self.ex = extractors
        self.cfg["rules"] += [
            {"glob": "data/local/IN-counties-*.json", "keys": ["rate"], "min": 0.001, "max": 0.06, "max_abs_change": 0.01,
             "hosts": ["www.in.gov"], "max_changes_per_run": 30, "max_findings_per_run": 40},
            {"glob": "data/states/NY-*.json", "keys": ["flatRate", "supplementalRate", "rate", "nonresidentRate"], "min": 0.001, "max": 0.3,
             "max_abs_change": 0.03, "hosts": ["www.tax.ny.gov"]},
        ]

    # --- Indiana --------------------------------------------------------
    def in_setup(self, counties=None):
        cs = counties or [{"name": f"C{i}", "countyCode": f"{i:02d}", "rate": 0.02} for i in range(1, 93)]
        write_json(self.root, f"data/local/IN-counties-{YEAR}.json", {"year": YEAR, "counties": cs})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "in")
        self.src = {"id": "in", "url": "https://www.in.gov/dor/files/dn01.pdf", "jurisdiction": "IN", "reconcile": "in_counties"}

    def in_table(self, when, **rates):
        r = {i: "0.02" for i in range(1, 93)}
        r.update({int(k[1:]): v for k, v in rates.items()})
        rows = "\n".join(f"Co{chr(65 + i % 26)}{chr(65 + i // 26)} {i:02d} {r[i]}" for i in r)
        return f"Indiana County Tax Rates: Effective {when}\nCounty Name County Code County Tax Rate\n{rows}\n"

    def test_a_january_first_table_corrects_the_counties_rate_in_that_years_file(self):
        self.in_setup()
        fs = reconcile.reconcile_in_counties(self.in_table(f"Jan. 1, {YEAR}", c5="0.0215"), self.src, TODAY, self.root)
        self.assertEqual([(f["code"], "change" in f) for f in fs], [("05", True)])
        for f in fs:
            f["reads"] = [{"at": (NOW - dt.timedelta(seconds=60)).isoformat(), "value": 0.0215}, {"at": NOW.isoformat(), "value": 0.0215}]
        acc, rej = au.triage(au.proposals_from(fs, self.root, TODAY), self.cfg, self.root, [self.src], TODAY, 1, NOW)
        self.assertEqual((len(acc), rej), (1, []))
        au.apply(acc, self.cfg, self.root, [self.src], TODAY, verify=[], now=NOW)
        cs = json.loads((self.root / f"data/local/IN-counties-{YEAR}.json").read_text())["counties"]
        self.assertEqual([c["rate"] for c in cs if c["rate"] != 0.02], [0.0215])

    def test_an_october_first_table_is_a_dated_row_for_a_person(self):
        self.in_setup()
        fs = reconcile.reconcile_in_counties(self.in_table(f"Oct. 1, {YEAR}", c5="0.0215"), self.src, TODAY, self.root)
        self.assertEqual([("change" in f) for f in fs], [False])

    def test_a_county_with_its_own_dated_rows_is_a_persons_even_on_january_first(self):
        cs = [{"name": f"C{i}", "countyCode": f"{i:02d}", "rate": 0.02} for i in range(1, 93)]
        cs[4]["rateChanges"] = [{"on": f"{YEAR}-10-01", "rate": 0.0225}]
        self.in_setup(cs)
        fs = reconcile.reconcile_in_counties(self.in_table(f"Jan. 1, {YEAR}", c5="0.0215"), self.src, TODAY, self.root)
        self.assertEqual([("change" in f) for f in fs], [False])

    # --- New York -------------------------------------------------------
    NY = f"data/states/NY-{YEAR}.json"

    def ny_setup(self):
        write_json(self.root, self.NY, {
            "supplementalWages": {"flatRate": 0.117, "quote": "verbatim: 'Withhold at the New York State supplemental rate of 11.70% (0.1170).'"},
            "nycLocalTax": {"supplementalRate": 0.0425},
            "yonkersLocalTax": {"residentSurcharge": {"rate": 0.1675, "quote": "Multiply the result by 16.75% (0.1675)."}, "nonresidentRate": 0.005}})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "ny")
        self.sources = [{"id": "nys", "url": "https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf", "jurisdiction": "NY"}]
        self.reg = [{"id": "NY-supplemental-rate", "name": "NY supplemental", "jurisdiction": "NY", "source_id": "nys", "file": "data/states/NY-{year}.json",
                     "paths": [["supplementalWages", "flatRate"]],
                     "pattern": r"(?s)New York State Withholding Tax Tables and Methods Effective January 1, {year} - December 31, {year}.{0,400000}?New York State supplemental rate of (\d+(?:\.\d+)?)%",
                     "transform": "percent"}]

    def ny_doc(self, year, rate):
        return (f"NYS-50-T-NYS (1/{str(year)[2:]}) New York State Withholding Tax Tables and Methods Effective January 1, {year} - December 31, {year} "
                + "filler " * 5000 + f"Withhold at the New York State supplemental rate of {rate}% (0.1)")

    def test_an_edition_for_this_year_states_the_rate_for_this_year(self):
        self.ny_setup()
        fs = self.ex.findings(self.reg, {"nys": self.ny_doc(YEAR, "12.10")}, {s["id"]: s for s in self.sources}, TODAY, self.root)
        self.assertEqual(len(fs), 1)
        self.assertLess(len(fs[0]["change"]["matched_text"]), 600)  # the header and the sentence, not 30 KB between them
        for f in fs:
            f["reads"] = [{"at": (NOW - dt.timedelta(seconds=60)).isoformat(), "value": 0.121}, {"at": NOW.isoformat(), "value": 0.121}]
        acc, rej = au.triage(au.proposals_from(fs, self.root, TODAY), self.cfg, self.root, self.sources, TODAY, 1, NOW)
        self.assertEqual((len(acc), rej), (1, []))
        au.apply(acc, self.cfg, self.root, self.sources, TODAY, verify=[], now=NOW)
        self.assertEqual(json.loads((self.root / self.NY).read_text())["supplementalWages"]["flatRate"], 0.121)
        # The quote that still says 11.70% is not edited; the reviewer is told.
        self.assertIn("supplementalWages.quote mentions the old value (0.117)", acc[0]["warnings"])
        self.assertIn("check the prose", au.report(acc, [], "applied", TODAY))

    def test_last_years_edition_says_nothing_about_this_year(self):
        self.ny_setup()
        self.assertEqual(self.ex.findings(self.reg, {"nys": self.ny_doc(YEAR - 1, "12.10")}, {s["id"]: s for s in self.sources}, TODAY, self.root), [])

    def test_an_edition_for_next_year_changes_only_next_years_file(self):
        self.ny_setup()
        write_json(self.root, f"data/states/NY-{YEAR + 1}.json", json.loads((self.root / self.NY).read_text()))
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "ny next")
        fs = self.ex.findings(self.reg, {"nys": self.ny_doc(YEAR + 1, "12.10")}, {s["id"]: s for s in self.sources}, TODAY, self.root)
        self.assertEqual([f["change"]["file"] for f in fs], [f"data/states/NY-{YEAR + 1}.json"])


class LocalTaxReaders(Base):
    """Ohio school districts, Maryland counties, Oregon transit and Seattle."""

    def sd_text(self, rates, year=YEAR, total=None):
        rows = " ".join(f"County{chr(65 + i)} {2000 + i:04d} {45000 + i:05d} District {i} LSD {r} % (b) 2001" for i, r in enumerate(rates))
        return (f"School Districts With an Income Tax as of January {year}* Tax Year {year} Rate Additional Information New (1) x "
                f"Primary School Tax Year Primary District {year} First Year County Number IRN School District Rate Effective {rows} "
                f"(a) Total number of districts are {total if total is not None else len(rates)}.")

    def sd_setup(self, rates=("1.00", "0.75", "1.25")):
        ds = [{"county": "X", "sdNumber": f"{2000 + i:04d}", "irn": f"{45000 + i:05d}", "name": f"District {i} LSD", f"rate{YEAR}": float(r) / 100,
               "earnedIncomeOnlyBase": True, "firstYearEffective": 2001} for i, r in enumerate(rates)]
        write_json(self.root, f"data/local/OH-school-districts-{YEAR}.json", {"year": YEAR, "districts": ds})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "sd")
        self.cfg["rules"].append({"glob": "data/local/OH-school-districts-*.json", "keys": [f"rate{YEAR}"], "min": 0.001, "max": 0.03,
                                  "max_abs_change": 0.01, "hosts": ["tax.ohio.gov"], "max_changes_per_run": 60, "max_findings_per_run": 80})
        self.src = {"id": "sd", "url": "https://tax.ohio.gov/static/tax_analysis/tax_data_series/school_district_data/SDIT_LIST.pdf", "jurisdiction": "OH", "reconcile": "oh_school"}

    def test_school_district_list_agreeing_with_the_data_is_silent(self):
        self.sd_setup()
        self.assertEqual(reconcile.reconcile_oh_school_districts(self.sd_text(["1.00", "0.75", "1.25"]), self.src, TODAY, self.root), [])

    def test_a_school_district_rate_correction_is_a_one_line_edit(self):
        self.sd_setup()
        fs = reconcile.reconcile_oh_school_districts(self.sd_text(["1.00", "1.00", "1.25"]), self.src, TODAY, self.root)
        self.assertEqual([(f["code"], "change" in f) for f in fs], [("2001", True)])
        for f in fs:
            f["reads"] = [{"at": (NOW - dt.timedelta(seconds=60)).isoformat(), "value": 0.01}, {"at": NOW.isoformat(), "value": 0.01}]
        acc, rej = au.triage(au.proposals_from(fs, self.root, TODAY), self.cfg, self.root, [self.src], TODAY, 1, NOW)
        self.assertEqual((len(acc), rej), (1, []))
        au.apply(acc, self.cfg, self.root, [self.src], TODAY, verify=[], now=NOW)
        ds = json.loads((self.root / f"data/local/OH-school-districts-{YEAR}.json").read_text())["districts"]
        self.assertEqual([d[f"rate{YEAR}"] for d in ds], [0.01, 0.01, 0.0125])

    def test_a_list_that_does_not_parse_to_its_own_count_is_not_trusted(self):
        self.sd_setup()
        fs = reconcile.reconcile_oh_school_districts(self.sd_text(["1.00", "0.75", "1.25"], total=214), self.src, TODAY, self.root)
        self.assertEqual([f["kind"] for f in fs], ["unreadable"])

    def test_a_district_that_left_the_list_or_joined_it_is_reported_not_edited(self):
        self.sd_setup()
        fs = reconcile.reconcile_oh_school_districts(self.sd_text(["1.00", "0.75"]), self.src, TODAY, self.root)
        self.assertEqual([(f["kind"], "change" in f) for f in fs], [("not_in_official_file", False)])
        self.sd_setup(["1.00", "0.75"])
        fs = reconcile.reconcile_oh_school_districts(self.sd_text(["1.00", "0.75", "1.25"]), self.src, TODAY, self.root)
        self.assertEqual([(f["kind"], "change" in f) for f in fs], [("missing_from_engine", False)])

    def test_a_percentage_inside_a_districts_notes_is_not_mistaken_for_its_rate(self):
        rows = f"CountyA 2000 45000 District 0 LSD (0.75% expires 2026, 0.50% expires 2031) 1.25 % (b) 2007"
        text = (f"Tax Year {YEAR} Rate Additional Information {rows} (a) Total number of districts are 1.")
        y, parsed, total = reconcile.parse_oh_school_list(text)
        self.assertEqual((y, [r["rate"] for r in parsed], total), (YEAR, [0.0125], 1))

    # --- {yy}: Oregon's transit guide names the year as "1/1/26 and beyond" ---
    OR = f"data/states/OR-{YEAR}.json"

    def or_setup(self):
        write_json(self.root, self.OR, {"tripDistrictPayrollTaxes": {"triMet": {"rate": 0.008237, "note": "x"}}})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "or")
        self.cfg["rules"].append({"glob": "data/states/OR-*.json", "keys": ["rate"], "min": 0.0005, "max": 0.03, "max_abs_change": 0.002, "hosts": ["www.oregon.gov"]})
        self.sources = [{"id": "cp", "url": "https://www.oregon.gov/dor/forms/FormsPubs/combined-payroll_211-155-2_2026.pdf", "jurisdiction": "OR"},
                        {"id": "tg", "url": "https://www.oregon.gov/dor/forms/formspubs/transit-payroll-taxes_211-503.pdf", "jurisdiction": "OR"}]
        import extractors  # noqa: PLC0415
        self.ex = extractors
        self.reg = [{"id": "OR-TriMet-rate", "name": "TriMet", "jurisdiction": "OR", "source_id": "cp", "file": "data/states/OR-{year}.json",
                     "paths": [["tripDistrictPayrollTaxes", "triMet", "rate"]],
                     "pattern": r"(?s){year} Oregon Combined Payroll Tax Report Instructions.{0,100000}?TriMet Transit District \(TM\) tax rate is (\d?\.\d+)", "transform": "",
                     "also": [{"source_id": "tg", "pattern": r"(?s)TriMet Transit District rate.{0,400}?1/1/{yy} and beyond (\d?\.\d+)", "transform": ""}]}]

    def or_texts(self, combined, guide):
        yy = str(YEAR)[2:]
        return {"cp": f"{YEAR} Oregon Combined Payroll Tax Report Instructions filler TriMet Transit District (TM) tax rate is {combined}.",
                "tg": f"TriMet Transit District rate 1/1/{int(yy) - 1} to 12/31/{int(yy) - 1} 0.008237 1/1/{yy} and beyond {guide} Deleted from TriMet"}

    def test_two_oregon_documents_that_agree_change_the_rate(self):
        self.or_setup()
        tracked = {s["id"]: s for s in self.sources}
        fs = self.ex.findings(self.reg, self.or_texts("0.008437", "0.008437"), tracked, TODAY, self.root)
        self.assertEqual(len(fs), 1)
        for f in fs:
            f["reads"] = [{"at": (NOW - dt.timedelta(seconds=60)).isoformat(), "value": 0.008437}, {"at": NOW.isoformat(), "value": 0.008437}]
        acc, rej = au.triage(au.proposals_from(fs, self.root, TODAY), self.cfg, self.root, self.sources, TODAY, 1, NOW)
        self.assertEqual((len(acc), rej), (1, []))

    def test_oregon_documents_that_disagree_change_nothing(self):
        self.or_setup()
        tracked = {s["id"]: s for s in self.sources}
        self.assertEqual(self.ex.findings(self.reg, self.or_texts("0.008437", "0.008237"), tracked, TODAY, self.root), [])

    def test_a_mid_year_row_in_the_guide_stops_the_pattern_matching(self):
        self.or_setup()
        tracked = {s["id"]: s for s in self.sources}
        yy = str(YEAR)[2:]
        t = self.or_texts("0.008437", "0.008437")
        t["tg"] = f"TriMet Transit District rate 1/1/{yy} to 6/30/{yy} 0.008237 7/1/{yy} and beyond 0.008437 Deleted"
        self.assertEqual(self.ex.findings(self.reg, t, tracked, TODAY, self.root), [])

    # --- integers stay integers (Seattle's thresholds) ---------------------
    WA = f"data/states/WA-{YEAR}.json"

    def test_an_integer_in_the_file_is_written_back_as_an_integer(self):
        write_json(self.root, self.WA, {"localIncomeTax": {"seattlePayrollExpenseTax": {"compensationThreshold": 194452, "upperCompensationBand": 518538}}})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "wa")
        self.cfg["rules"].append({"glob": "data/states/WA-*.json", "keys": ["compensationThreshold", "upperCompensationBand"], "min": 100000, "max": 20000000,
                                  "max_abs_change": 2000000, "integers": True, "hosts": ["www.seattle.gov"]})
        src = [{"id": "se", "url": "https://www.seattle.gov/city-finance/payroll-expense-tax", "jurisdiction": "WA"}]
        import extractors  # noqa: PLC0415
        reg = [{"id": "Seattle-compensation-threshold", "name": "Seattle", "jurisdiction": "WA", "source_id": "se", "file": "data/states/WA-{year}.json",
                "paths": [["localIncomeTax", "seattlePayrollExpenseTax", "compensationThreshold"]],
                "pattern": r"Annual Compensation of {year} \$[\d,]+ or more in \d{4} \$([\d,]+) or more in {year}", "transform": "dollars"}]
        text = f"Annual Compensation of {YEAR} $9,074,409 or more in {YEAR - 1} $199,000 or more in {YEAR}"
        fs = extractors.findings(reg, {"se": text}, {s["id"]: s for s in src}, TODAY, self.root)
        for f in fs:
            f["reads"] = [{"at": (NOW - dt.timedelta(seconds=60)).isoformat(), "value": 199000.0}, {"at": NOW.isoformat(), "value": 199000.0}]
        acc, rej = au.triage(au.proposals_from(fs, self.root, TODAY), self.cfg, self.root, src, TODAY, 1, NOW)
        self.assertEqual((len(acc), rej), (1, []))
        self.assertEqual((acc[0]["edits"][0]["old_text"], acc[0]["edits"][0]["new_text"]), ("194452", "199000"))

    # --- Maryland: each county is its own anchored reader ------------------
    def test_a_maryland_county_rate_is_read_from_the_years_list_and_a_tiered_county_is_left_alone(self):
        write_json(self.root, f"data/states/MD-{YEAR}.json", {"countyRates": {"Allegany": {"flat": 0.032}, "Kent": {"flat": 0.033}, "AnneArundel": {"tiered": {"single": []}}}})
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "md")
        import extractors  # noqa: PLC0415
        src = [{"id": "md", "url": "https://www.marylandcomptroller.gov/x.pdf", "jurisdiction": "MD"}]
        pat = r"(?s)Listed below are the actual {year} local income tax rates\..{0,3000}?(?<![A-Za-z]) %s (\d+(?:\.\d+)?)%%"
        reg = [{"id": f"MD-county-{k}", "name": k, "jurisdiction": "MD", "source_id": "md", "file": "data/states/MD-{year}.json",
                "paths": [["countyRates", k, "flat"]], "pattern": pat % lbl, "transform": "percent"} for k, lbl in (("Allegany", "Allegany"), ("Kent", "Kent"))]
        text = f"Listed below are the actual {YEAR} local income tax rates. We provide tables. Allegany 3.30% Anne Arundel see below* Kent 3.30%"
        fs = []
        for x in reg:
            fs += extractors.findings([x], {"md": text}, {s["id"]: s for s in src}, TODAY, self.root)
        self.assertEqual([f["code"] for f in fs], ["MD-county-Allegany"])  # Kent already 3.3%
        self.assertEqual(fs[0]["change"]["edits"][0]["path"], ["countyRates", "Allegany", "flat"])
        self.assertEqual(extractors.findings(reg, {"md": text.replace(str(YEAR), str(YEAR - 1))}, {s["id"]: s for s in src}, TODAY, self.root), [])


class FromTheOfficialFileToTheLine(Base):
    """The whole chain with the real reconciler: a stand-in for the Finder's
    CSV, the engine's data file, two reads, triage, apply."""

    def setUp(self) -> None:
        super().setUp()
        entries = [{"name": f"Town{i:04d}", "municode": f"{10000 + i}", "rate": 0.01, "effectiveFrom": "2000-01-01"}
                   for i in range(600)]
        self.entries = entries
        write_json(self.root, FILE, {"year": YEAR, "asOf": f"{YEAR}-01-02", "municipalities": entries})
        git(self.root, "commit", "-qam", "big file")
        self.rows = [f"{YEAR}0101,99991231,{e['municode']},{e['name'].upper()},{e['rate']}" for e in entries]

    def fetcher(self, rows):
        body = ("\n".join(rows) + "\n").encode()
        return lambda url: SimpleNamespace(ok=True, body=body, error="", status=200)

    def gather(self, rows):
        return au.gather(SOURCES, self.fetcher(rows), TODAY, self.root, gap=0, sleep=lambda s: None)

    def test_one_city_raises_its_rate(self):
        rows = list(self.rows)
        rows[17] = f"{YEAR}0101,99991231,10017,TOWN0017,0.0125"
        confirmed, total = self.gather(rows)
        self.assertEqual(total, 1)
        self.cfg["min_confirm_gap_seconds"] = 0
        ps = au.proposals_from(confirmed, self.root, TODAY)
        self.assertEqual(len(ps), 1)
        self.assertEqual((ps[0]["edits"][0]["old_text"], ps[0]["edits"][0]["new_text"]), ("0.01", "0.0125"))
        acc, rej = au.triage(ps, self.cfg, self.root, SOURCES, TODAY, total)
        self.assertEqual((len(acc), len(rej)), (1, 0), rej)
        au.apply(acc, self.cfg, self.root, SOURCES, TODAY, verify=[])
        data = json.loads((self.root / FILE).read_text())
        rates = [m["rate"] for m in data["municipalities"]]
        self.assertEqual(rates[17], 0.0125)
        self.assertEqual(sum(1 for r in rates if r != 0.01), 1)
        removed = [l for l in git(self.root, "diff", "-U0").splitlines() if l.startswith(("+", "-")) and not l.startswith(("+++", "---"))]
        self.assertEqual(len(removed), 2)

    def test_a_row_the_engine_lacks_is_never_added(self):
        rows = self.rows + [f"{YEAR}0101,99991231,99999,NEWTOWN,0.02"]
        confirmed, total = self.gather(rows)
        self.assertEqual(total, 1)  # reported as missing_from_engine ...
        self.assertEqual(au.proposals_from(confirmed, self.root, TODAY), [])  # ... but there is nothing to replace

    def test_a_change_the_second_read_does_not_repeat_is_dropped(self):
        a = self.fetcher(self.rows[:17] + [f"{YEAR}0101,99991231,10017,TOWN0017,0.0125"] + self.rows[18:])
        b = self.fetcher(self.rows)
        calls = {"n": 0}

        def flip(url):
            calls["n"] += 1
            return (a if calls["n"] <= 1 else b)(url)

        confirmed, _ = au.gather(SOURCES, flip, TODAY, self.root, gap=0, sleep=lambda s: None)
        self.assertEqual(confirmed, [])

    def test_a_mid_year_rate_goes_to_a_person(self):
        rows = list(self.rows)
        rows[17] = f"{YEAR}0601,99991231,10017,TOWN0017,0.0125"
        rows.append(f"{YEAR - 1}0101,{YEAR}0531,10017,TOWN0017,0.01")
        # The engine's 0.01 is right until June; the official 0.0125 starts June 1.
        confirmed, total = self.gather(rows)
        ps = au.proposals_from(confirmed, self.root, TODAY)
        if dt.date.today() >= dt.date(YEAR, 6, 1) and ps:
            self.cfg["min_confirm_gap_seconds"] = 0
            acc, rej = au.triage(ps, self.cfg, self.root, SOURCES, TODAY, total)
            self.assertEqual(acc, [])
            self.assertIn("after January 1", rej[0]["reason"])

    def test_a_truncated_download_proposes_nothing(self):
        confirmed, total = self.gather(self.rows[:40])
        self.assertEqual(au.proposals_from(confirmed, self.root, TODAY), [])

    def test_duplicate_municode_is_not_guessed_at(self):
        data = json.loads((self.root / FILE).read_text())
        data["municipalities"][18]["municode"] = data["municipalities"][17]["municode"]
        write_json(self.root, FILE, data)
        with self.assertRaises(au.Rejected):
            au.locate(self.root, FILE, "municode", data["municipalities"][17]["municode"], "rate")


class TheCommandLine(Base):
    def run_main(self, *args, enabled=False):
        cfg = {**CONFIG, "enabled": enabled}
        (self.root / "watcher").mkdir(exist_ok=True)
        (self.root / "watcher" / "autoupdate.json").write_text(json.dumps(cfg))
        (self.root / "watcher" / "sources.json").write_text(json.dumps({"sources": SOURCES}))
        git(self.root, "add", "-A")
        git(self.root, "commit", "-qm", "watcher config")
        p = self.proposal()
        finding = {"kind": "rate_differs", "severity": "action", "code": "00142", "name": "Aberdeen",
                   "source_id": "oh-muni", "reads": self.reads(0.0125),
                   "change": {"file": FILE, "id_key": "municode", "id": "00142", "key": "rate", "old": 0.01, "new": 0.0125,
                              "effective_from": f"{YEAR}-01-01", "source_url": FINDER}}
        fake_watch = SimpleNamespace(fetch=lambda url: None)
        with mock.patch.dict(sys.modules, {"watch": fake_watch}), \
             mock.patch.object(au, "gather", return_value=([finding], 1)), \
             mock.patch("builtins.print"):
            return au.main(["--repo", str(self.root), *args]), p

    def test_default_run_is_check_only(self):
        rc, _ = self.run_main(enabled=True)
        self.assertEqual(rc, 0)
        self.assertEqual(json.loads((self.root / FILE).read_text())["municipalities"][0]["rate"], 0.01)
        rep = json.loads((self.root / "watcher/reports/autoupdate-latest.json").read_text())
        self.assertEqual(rep["mode"], "check only")
        self.assertEqual(len(rep["would_apply"]), 1)

    def test_apply_while_switched_off_writes_nothing_and_says_so(self):
        self.run_main("--apply", enabled=False)
        self.assertEqual(json.loads((self.root / FILE).read_text())["municipalities"][0]["rate"], 0.01)
        rep = json.loads((self.root / "watcher/reports/autoupdate-latest.json").read_text())
        self.assertEqual(rep["applied"], [])
        self.assertIn("switched off", rep["left_for_a_person"][0]["reason"])

    def test_failed_verification_through_the_command_line_leaves_the_data_alone(self):
        # enabled, but the real verify step (npm) does not exist in the sandbox repo.
        self.run_main("--apply", enabled=True)
        self.assertEqual(json.loads((self.root / FILE).read_text())["municipalities"][0]["rate"], 0.01)
        rep = json.loads((self.root / "watcher/reports/autoupdate-latest.json").read_text())
        self.assertEqual(rep["applied"], [])
        self.assertIn("verification failed", rep["left_for_a_person"][0]["reason"])


@unittest.skipUnless(os.environ.get("AUTOUPDATE_E2E"), "set AUTOUPDATE_E2E=1 to run against a clone of this repository (about a minute)")
class AgainstTheRealEngine(unittest.TestCase):
    """Clone this repository, correct Aberdeen's rate by one line, and run the
    real bundle build and the real test suite on the result. Takes about a
    minute, so it is opt-in; it ran clean before auto-update was merged."""

    def test_one_line_in_the_real_data_survives_the_real_suite(self):
        with tempfile.TemporaryDirectory() as tmp:
            clone = Path(tmp) / "repo"
            subprocess.run(["git", "clone", "-q", str(au.REPO), str(clone)], check=True)
            cfg = au.load_config(clone / "watcher" / "autoupdate.json")
            cfg["enabled"] = True
            cfg["min_confirm_gap_seconds"] = 0
            sources = json.loads((clone / "watcher" / "sources.json").read_text())["sources"]
            src = next(s for s in sources if s.get("reconcile") == "oh_municipal")
            rel = f"data/local/OH-municipalities-{YEAR}.json"
            line = au.locate(clone, rel, "municode", "00142", "rate")
            cur = au.LINE_RE.match((clone / rel).read_text().split("\n")[line - 1]).group("num")
            new = 0.0125 if cur != "0.0125" else 0.015
            p = {"id": "e2e", "file": rel, "line": line, "key": "rate", "old_text": cur, "new_text": au.fmt_number(new), "new": new,
                 "effective_from": f"{YEAR}-01-01", "name": "Aberdeen", "kind": "rate_differs", "as_of": TODAY,
                 "evidence": {"source_id": src["id"], "url": src["url"], "official_value": new,
                              "reads": [{"at": (NOW - dt.timedelta(seconds=60)).isoformat(), "value": new},
                                        {"at": NOW.isoformat(), "value": new}]}}
            acc, rej = au.triage([p], cfg, clone, sources, TODAY, 1, NOW)
            self.assertEqual(rej, [], rej)
            au.apply(acc, cfg, clone, sources, TODAY, now=NOW)  # edge:build + npm test
            changed = sorted(l[3:] for l in git(clone, "status", "--porcelain").splitlines())
            self.assertEqual(changed, sorted([rel, "supabase/functions/_shared/data-bundle.ts"]))
            body = [l for l in git(clone, "diff", "-U0", "--", rel).splitlines() if l[:1] in "+-" and l[:3] not in ("+++", "---")]
            self.assertEqual(len(body), 2)


if __name__ == "__main__":
    unittest.main()
