"""What is, and is not, a zero-day problem.

    python -m unittest watcher/test_zero_day.py
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import zero_day as zd  # noqa: E402

LANDING = {"id": "co-news", "jurisdiction": "CO", "title": "Colorado Department of Revenue: news", "url": "https://tax.colorado.gov/news", "kind": "index"}
HOME = {"id": "wa-home", "jurisdiction": "WA", "title": "Washington Department of Revenue home", "url": "https://dor.wa.gov/"}  # cited by no data file
GUIDE = {"id": "in-dn1", "jurisdiction": "IN", "title": "Indiana Departmental Notice #1", "url": "https://www.in.gov/dor/files/dn01.pdf",
         "used_by": ["data/states/IN-2026.json", "data/local/IN-counties-2026.json"]}
STATUTE = {"id": "ky-krs", "jurisdiction": "KY", "title": "KRS 67.750", "url": "https://apps.legislature.ky.gov/law/statutes/statute.aspx?id=48677",
           "used_by": ["data/local/KY-occupational-2026.json"]}
SITE_ONLY = {"id": "x", "jurisdiction": "US", "title": "Something only the site cites", "url": "https://www.irs.gov/x", "used_by": ["site/docs.html"]}
SOURCES = [LANDING, HOME, GUIDE, STATUTE, SITE_ONLY]


def change(src, added=(), removed=(), significant=True):
    return {"id": src["id"], "jurisdiction": src["jurisdiction"], "title": src["title"], "url": src["url"],
            "figures_added": list(added), "figures_removed": list(removed), "significant": significant}


def classify(changes, applied=(), left=(), disagreements=()):
    return zd.classify({"date": "2026-10-22", "changed": list(changes)},
                       {"applied": list(applied), "left_for_a_person": list(left), "disagreements_for_a_person": list(disagreements)}, SOURCES)


class WhatIsNotAZeroDay(unittest.TestCase):
    def test_a_new_heading_on_a_landing_page_is_not(self):
        z = classify([change(LANDING)])
        self.assertEqual((z["fixed"], z["verified"], z["possible"], z["informational_changes"]), ([], [], [], 1))

    def test_a_news_page_that_mentions_a_dollar_amount_is_not(self):
        self.assertEqual(classify([change(LANDING, added=["$5,000,000"])])["possible"], [])

    def test_a_page_no_data_file_cites_is_not_even_with_figures(self):
        self.assertEqual(classify([change(HOME, added=["2.5%"], removed=["2.4%"])])["possible"], [])

    def test_a_page_only_the_site_cites_is_not(self):
        self.assertEqual(classify([change(SITE_ONLY, added=["$100"])])["possible"], [])

    def test_a_cited_document_reworded_without_any_figure_changing_is_not(self):
        self.assertEqual(classify([change(GUIDE)])["possible"], [])

    def test_a_minor_change_is_not(self):
        self.assertEqual(classify([change(GUIDE, added=["3%"], significant=False)])["possible"], [])

    def test_a_year_that_changed_is_not_a_figure(self):
        self.assertEqual(classify([change(GUIDE, added=["2027"], removed=["2026"])])["possible"], [])

    def test_unreachable_or_nothing_at_all_is_not(self):
        z = classify([])
        self.assertEqual((z["fixed"], z["verified"], z["possible"], z["informational_changes"]), ([], [], [], 0))
        self.assertIn("None.", zd.markdown(z))


class WhatIs(unittest.TestCase):
    def test_a_cited_document_whose_rate_changed_is_a_possible_zero_day(self):
        z = classify([change(GUIDE, added=["2.65%"], removed=["2.95%"])])
        self.assertEqual(len(z["possible"]), 1)
        self.assertEqual(z["possible"][0]["figures"], ["2.65%", "2.95%"])
        self.assertEqual(z["possible"][0]["feeds"], ["data/states/IN-2026.json", "data/local/IN-counties-2026.json"])

    def test_a_statute_the_data_cites_changing_an_amount_is_possible_too(self):
        self.assertEqual(len(classify([change(STATUTE, added=["$12,500"])])["possible"]), 1)

    def test_a_value_the_updater_fixed_is_a_fixed_zero_day(self):
        applied = [{"file": "data/local/OH-municipalities-2026.json", "name": "Aberdeen", "evidence": {"url": "https://thefinder.tax.ohio.gov/x"},
                    "edits": [{"key": "rate", "old_text": "0.01", "new_text": "0.0125"}]}]
        z = classify([], applied=applied)
        self.assertEqual(z["fixed"], [{"file": "data/local/OH-municipalities-2026.json", "name": "Aberdeen", "source": "https://thefinder.tax.ohio.gov/x",
                                       "edits": [("rate", "0.01", "0.0125")]}])
        self.assertIn("Fixed automatically (1)", zd.markdown(z))
        self.assertIn("git revert", zd.markdown(z))

    def test_a_verified_disagreement_a_rule_held_back_is_reported_with_its_reason(self):
        left = [{"proposal": {"file": "data/local/PA-EIT-LST-2026.json", "name": "Abbott Twp",
                              "edits": [{"key": "residentEIT", "old_text": "0.005", "new_text": "0.0075"}]},
                 "reason": "the official change starts 07/01/2026, after January 1 2026; a mid-year change needs a dated row"}]
        z = classify([], left=left, disagreements=[{"name": "Whitesville", "detail": "the Secretary of State lists this district", "jurisdiction": "KY"}])
        self.assertEqual(len(z["verified"]), 2)
        text = zd.markdown(z)
        self.assertIn("Verified, needs a person (2)", text)
        self.assertIn("residentEIT 0.005 -> 0.0075", text)
        self.assertIn("a mid-year change needs a dated row", text)

    def test_informational_changes_are_counted_and_never_touch_anything(self):
        z = classify([change(LANDING), change(HOME), change(GUIDE, added=["2.65%"], removed=["2.95%"])])
        self.assertEqual((len(z["possible"]), z["informational_changes"], z["fixed"]), (1, 2, []))


class TheRulesThemselves(unittest.TestCase):
    def test_only_data_that_feeds_a_paycheck_counts(self):
        self.assertTrue(zd.feeds_a_paycheck({"used_by": ["data/states/IN-2026.json"]}))
        self.assertTrue(zd.feeds_a_paycheck({"used_by": ["docs/x.md", "data/garnishment/US.json"]}))
        self.assertFalse(zd.feeds_a_paycheck({"used_by": ["site/docs.html", "docs/LEGAL.md"]}))
        self.assertFalse(zd.feeds_a_paycheck({}))


if __name__ == "__main__":
    unittest.main()


class BlindSpots(unittest.TestCase):
    def spots(self, state):
        return zd.classify({"date": "2026-10-22", "changed": []}, {}, SOURCES, state)["blind_spots"]

    def test_a_paycheck_source_that_cannot_be_read_is_named(self):
        got = self.spots({"in-dn1": {"failures": 2, "last_ok": "2026-10-01", "last_error": "HTTP 403"}, "ky-krs": {"last_ok": "2026-10-22", "failures": 0}})
        self.assertEqual([(b["url"], b["never_read"], b["why"]) for b in got], [(GUIDE["url"], False, "HTTP 403")])

    def test_a_source_never_read_comes_first(self):
        got = self.spots({"in-dn1": {"failures": 1, "last_ok": "2026-10-01"}})
        self.assertEqual([b["never_read"] for b in got], [True, False])

    def test_pages_no_paycheck_number_depends_on_are_not_blind_spots(self):
        self.assertEqual({b["url"] for b in self.spots({})}, {GUIDE["url"], STATUTE["url"]})

    def test_a_clean_report_says_what_it_could_not_see(self):
        text = zd.markdown(zd.classify({"date": "2026-10-22", "changed": []}, {}, SOURCES, {"in-dn1": {"failures": 3}}))
        self.assertIn("None in the sources that could be read.", text)
        self.assertIn("## Not being read", text)
        self.assertIn("None. A paycheck-affecting change", zd.markdown(zd.classify({"date": "x", "changed": []}, {}, SOURCES, {s["id"]: {"last_ok": "d"} for s in SOURCES})))
