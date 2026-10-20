"""Every income-tax or local-tax jurisdiction in data/ is accounted for by the
source watch and by auto-update's coverage ledger, and every claim in that
ledger is backed by something real. These tests read the repository's actual
files, so adding a state, a registry or an extractor without updating the
ledger fails here.

    python -m unittest watcher/test_coverage.py
"""

from __future__ import annotations

import json
import re
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import autoupdate as au  # noqa: E402
import extractors  # noqa: E402
import reconcile  # noqa: E402

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SCOPE = json.loads((HERE / "scope.json").read_text())
LEDGER = json.loads((HERE / "autoupdate-coverage.json").read_text())["jurisdictions"]
REGISTRY = {x["id"]: x for x in json.loads((HERE / "extractors.json").read_text())["extractors"]}
SOURCES = {s["id"]: s for s in json.loads((HERE / "sources.json").read_text())["sources"]}
CFG = au.load_config(au.CONFIG)


def latest_state_files() -> dict[str, dict]:
    out = {}
    for f in sorted((REPO / "data" / "states").glob("*-*.json")):
        code, year = f.stem.split("-")
        if code not in out or year > out[code]["year"]:
            out[code] = {"year": year, "data": json.loads(f.read_text())}
    return out


def has_local_tax(data: dict) -> bool:
    for key in ("localIncomeTax", "localTax"):
        v = data.get(key)
        if isinstance(v, dict) and not str(v.get("rule", "")).startswith("NONE") and v:
            return True
    return "seattlePayrollExpenseTax" in json.dumps(data.get("localIncomeTax", {}))


class EveryTaxingJurisdictionIsWatched(unittest.TestCase):
    def test_a_state_with_a_wage_income_tax_is_in_scope(self):
        for code, f in latest_state_files().items():
            if f["data"].get("method") != "no_income_tax":
                self.assertIn(code, SCOPE["keep"], f"{code} levies a wage income tax but the watcher does not cover it")

    def test_a_state_with_a_local_tax_is_in_scope(self):
        for code, f in latest_state_files().items():
            if has_local_tax(f["data"]):
                self.assertIn(code, SCOPE["keep"], f"{code} has a local tax in its data but the watcher does not cover it")

    def test_only_states_with_neither_are_left_out(self):
        states = latest_state_files()
        for code in SCOPE["excluded"]:
            if code in states:
                self.assertEqual(states[code]["data"]["method"], "no_income_tax", code)
                self.assertFalse(has_local_tax(states[code]["data"]), code)

    def test_every_local_registry_belongs_to_a_covered_state(self):
        for f in (REPO / "data" / "local").glob("*-*.json"):
            code = f.stem.split("-")[0]
            self.assertIn(code, SCOPE["keep"], f.name)

    def test_every_covered_jurisdiction_has_sources(self):
        have = {s["jurisdiction"] for s in SOURCES.values()}
        for code in SCOPE["keep"]:
            self.assertIn(code, have, f"{code} is in scope but has no sources")

    def test_every_covered_state_has_an_agency_news_or_notice_page(self):
        curated = json.loads((HERE / "curated.json").read_text())["sources"]
        for code in SCOPE["keep"]:
            if code in ("US", "WA"):
                continue
            pages = [c for c in curated if c["jurisdiction"] == code]
            self.assertGreaterEqual(len(pages), 2, f"{code}: only {len(pages)} curated page(s); add its news or notices page")


class TheLedgerAccountsForThemAll(unittest.TestCase):
    def test_every_covered_jurisdiction_is_in_the_ledger_and_nothing_else_is(self):
        self.assertEqual(set(LEDGER), set(SCOPE["keep"]))

    def test_each_entry_says_what_is_left_to_a_person_and_why(self):
        for code, entry in LEDGER.items():
            self.assertTrue(entry["taxes"], code)
            self.assertTrue(entry["person"], f"{code}: nothing left to a person? say so explicitly or fix the ledger")
            for item in entry["person"]:
                self.assertGreater(len(item["what"]), 8, code)
                self.assertGreater(len(item["why"]), 30, code)

    def test_every_automatic_item_is_a_real_anchored_reader_with_a_rule_that_covers_its_lines(self):
        year = int(__import__("datetime").date.today().year)
        for code, entry in LEDGER.items():
            for ref in entry["automatic"]:
                kind, _, name = ref.partition(":")
                if kind == "extractor":
                    x = REGISTRY[name]
                    self.assertEqual(x["jurisdiction"], code, ref)
                    self.assertTrue(x.get("year_anchored", True), f"{ref} does not name the year, so it cannot be automatic")
                    self.assertIn("{year}", x["pattern"], ref)
                    for path in x["paths"]:
                        rel = x["file"].replace("{year}", str(year))
                        self.assertIsNotNone(au._rule_for(CFG, rel, str(path[-1])), f"{ref}: no rule allows {path[-1]} in {rel}")
                elif kind == "reconcile":
                    self.assertIn(name, reconcile.RECONCILERS, ref)
                    self.assertTrue(any(r["glob"].startswith(f"data/local/{code}-") for r in CFG["rules"]), f"{ref}: no rule for {code}'s local files")
                else:
                    self.fail(f"{code}: unknown reference {ref}")

    def test_every_report_only_item_is_real(self):
        for code, entry in LEDGER.items():
            for ref in entry["report_only"]:
                kind, _, name = ref.partition(":")
                if kind == "extractor":
                    self.assertEqual(REGISTRY[name]["jurisdiction"], code, ref)
                elif kind == "reconcile":
                    self.assertIn(name, reconcile.RECONCILERS, ref)
                else:
                    self.fail(f"{code}: unknown reference {ref}")

    def test_no_reader_is_orphaned(self):
        used = {r.split(":", 1)[1] for e in LEDGER.values() for r in e["automatic"] + e["report_only"] if r.startswith("extractor:")}
        self.assertEqual(used, set(REGISTRY))

    def test_a_reader_is_listed_under_exactly_one_tier(self):
        for name, x in REGISTRY.items():
            ref = f"extractor:{name}"
            tiers = [t for e in LEDGER.values() for t in ("automatic", "report_only") if ref in e[t]]
            self.assertEqual(len(tiers), 1, ref)
            expected = "automatic" if x.get("year_anchored", True) else "report_only"
            self.assertEqual(tiers[0], expected, f"{ref} is {'anchored' if expected == 'automatic' else 'unanchored'}")


class EveryReaderStillReadsItsDocument(unittest.TestCase):
    """Each reader carries a frozen excerpt of the real sentence it was written
    against. If someone loosens a pattern, or the pattern reads something
    else, this fails before it can fire on a live document."""

    def test_registry_integrity(self):
        for name, x in REGISTRY.items():
            self.assertIn(x["source_id"], SOURCES, name)
            self.assertEqual(SOURCES[x["source_id"]]["jurisdiction"], x["jurisdiction"], name)
            for a in x.get("also", []):
                self.assertIn(a["source_id"], SOURCES, name)
            self.assertIn("calibration", x, f"{name}: run python watcher/extractors.py --refresh")
            for p in x["paths"]:
                self.assertTrue(p and all(isinstance(k, (str, int)) for k in p), name)
            data = json.loads((REPO / x["file"].replace("{year}", str(x["calibration"]["year"]))).read_text())
            for p in x["paths"]:
                node = data
                for k in p:
                    node = node[k]
                self.assertIsInstance(node, (int, float), f"{name}: {p} is not a number in the data")

    def test_each_pattern_reads_its_excerpt_as_the_recorded_value(self):
        for name, x in REGISTRY.items():
            c = x["calibration"]
            got = extractors.stated_value(c["excerpt"], x["pattern"], c["year"], x.get("transform", ""))
            self.assertIsNotNone(got, name)
            self.assertAlmostEqual(got[0], c["value"], places=6, msg=name)

    def test_an_anchored_pattern_names_the_year_in_what_it_matches(self):
        for name, x in REGISTRY.items():
            if x.get("year_anchored", True):
                self.assertIn("{year}", x["pattern"], name)
                self.assertIn(str(x["calibration"]["year"]), x["calibration"]["excerpt"], f"{name}: the matched sentence must contain the year")
                self.assertIsNone(extractors.stated_value(x["calibration"]["excerpt"], x["pattern"], x["calibration"]["year"] - 1, x.get("transform", "")),
                                  f"{name}: matched a sentence about a different year")

    def test_a_pattern_that_finds_two_different_values_finds_nothing(self):
        x = REGISTRY["IL-rate"]
        text = "Effective January 1, 2026, Tax Rate 4.95% ... Effective January 1, 2026, Tax Rate 5.5%"
        self.assertIsNone(extractors.stated_value(text, x["pattern"], 2026, "percent"))
        self.assertEqual(extractors.stated_value(text.replace("5.5%", "4.95%"), x["pattern"], 2026, "percent")[0], 0.0495)

    def test_every_extractor_target_is_a_single_line_the_updater_can_reach(self):
        # Anchored readers can only ever be applied if each value sits on a
        # line of its own; a one-line object would make the whole proposal a
        # person's, silently. Catch it here instead.
        year = __import__("datetime").date.today().year
        for name, x in REGISTRY.items():
            if not x.get("year_anchored", True):
                continue
            rel = x["file"].replace("{year}", str(year))
            pos = au.json_positions((REPO / rel).read_text())
            for p in x["paths"]:
                self.assertIn(tuple(p), pos, name)
                line, tok, dup = pos[tuple(p)]
                self.assertFalse(dup, name)
                text = (REPO / rel).read_text().split("\n")[line - 1]
                self.assertTrue(au.LINE_RE.match(text), f"{name}: {rel} line {line} is not a bare number line: {text.strip()[:60]}")


if __name__ == "__main__":
    unittest.main()
