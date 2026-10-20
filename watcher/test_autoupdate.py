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

    def test_the_shipped_config_is_off_and_allows_only_oh_municipal_rates(self):
        cfg = au.load_config(au.CONFIG)
        self.assertIs(cfg["enabled"], False)
        self.assertEqual([(r["glob"], r["keys"]) for r in cfg["rules"]], [("data/local/OH-municipalities-*.json", ["rate"])])
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
        self.assertEqual((ps[0]["old_text"], ps[0]["new_text"]), ("0.01", "0.0125"))
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
