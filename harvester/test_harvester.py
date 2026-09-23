"""Unit tests for the harvester (stdlib unittest, no network, no fake server).

    python -m unittest harvester/test_harvester.py -v
"""
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from collect import scan_repo, list_json_files          # noqa: E402
from probe import normalize_html, probe, Signal          # noqa: E402
from baseline import classify, fold                       # noqa: E402


class FakeResp:
    """Minimal urlopen-style response for probe() dependency injection."""
    def __init__(self, body: bytes, status: int = 200, ctype: str = "text/html"):
        self._body = body
        self.status = status
        self.headers = {"content-type": ctype}
    def read(self, n=-1):
        return self._body
    def __enter__(self):
        return self
    def __exit__(self, *a):
        return False


class CollectTests(unittest.TestCase):
    def _tree(self):
        d = tempfile.mkdtemp(prefix="harvest-")
        os.makedirs(os.path.join(d, "states"), exist_ok=True)
        with open(os.path.join(d, "federal.json"), "w") as fh:
            json.dump({"year": 2026, "asOf": "2026-08-11", "sources": [
                {"title": "IRS Pub 15-T", "url": "https://www.irs.gov/pub/irs-pdf/p15t.pdf"},
                {"title": "SSA COLA", "url": "https://www.ssa.gov/oact/cola/cbb.html"}]}, fh)
        with open(os.path.join(d, "states", "OH.json"), "w") as fh:
            json.dump({"code": "OH", "year": 2026,
                       "sources": [{"title": "OH WHT", "url": "https://tax.ohio.gov/wht.pdf"}],
                       "also": {"url": "https://www.irs.gov/pub/irs-pdf/p15t.pdf"}}, fh)
        with open(os.path.join(d, "broken.json"), "w") as fh:
            fh.write("{ not valid json ")
        return d

    def test_collects_and_dedupes(self):
        scan = scan_repo(self._tree())
        urls = [s.url for s in scan.sources]
        self.assertIn("https://www.irs.gov/pub/irs-pdf/p15t.pdf", urls)
        self.assertIn("https://tax.ohio.gov/wht.pdf", urls)
        p15t = next(s for s in scan.sources if s.url.endswith("p15t.pdf"))
        self.assertEqual(len(p15t.cited_by), 2)  # cited by two files, deduped to one

    def test_malformed_file_reported_not_raised(self):
        scan = scan_repo(self._tree())
        broken = next(f for f in scan.files if f.path.endswith("broken.json"))
        self.assertFalse(broken.ok)
        self.assertTrue(any(f.ok and f.year == 2026 for f in scan.files))

    def test_missing_dir_is_empty(self):
        self.assertEqual(list_json_files("/no/such/dir"), [])


class NormalizeTests(unittest.TestCase):
    def test_volatile_tokens_dropped_content_kept(self):
        def page(ray, vs, ts):
            return (f"<html><head><meta name='csrf' content='{ray}'>"
                    f"<script>window.__CF$cv$params={{r:'{ray}'}};</script>"
                    f"<style>.a{{color:#{ray[:6]}}}</style></head><body>"
                    f"<input type=hidden name=__VIEWSTATE value='{vs}'>"
                    f"<h1>Wisconsin UI Tax Rates 2026</h1><p>Wage base $14,000. Rendered {ts}.</p>"
                    f"<!-- build {ray} --></body></html>")
        a = normalize_html(page("a3f3f9b3", "AAAA1111", "2026-09-22T20:14:00Z"))
        b = normalize_html(page("z9y8x7w6", "ZZZZ9999", "2026-09-23T09:02:41Z"))
        self.assertEqual(a, b)
        self.assertIn("Wisconsin UI Tax Rates 2026", a)
        self.assertIn("$14,000", a)

    def test_real_text_change_survives(self):
        self.assertNotEqual(
            normalize_html("<p>The rate is 4.25%.</p>"),
            normalize_html("<p>The rate is 3.99%.</p>"))


class DebounceTests(unittest.TestCase):
    def test_new_then_unchanged(self):
        self.assertEqual(classify(None, Signal("u", True, 200, "h1")), "new")
        self.assertEqual(classify({"hash": "h1"}, Signal("u", True, 200, "h1")), "unchanged")

    def test_first_diff_is_pending_not_changed(self):
        # Content differs from baseline for the first time → pending, NOT changed.
        self.assertEqual(classify({"hash": "old"}, Signal("u", True, 200, "new1")), "pending")

    def test_confirmed_after_two_consecutive_sightings(self):
        # Same new content seen again (matches stored pending) → confirmed changed.
        self.assertEqual(classify({"hash": "old", "pending": "new1"}, Signal("u", True, 200, "new1")), "changed")

    def test_churn_never_confirms(self):
        # Each run the content differs from both baseline AND the last candidate → stays pending.
        self.assertEqual(classify({"hash": "old", "pending": "churnA"}, Signal("u", True, 200, "churnB")), "pending")

    def test_unreachable(self):
        self.assertEqual(classify({"hash": "h"}, Signal("u", False, error="timeout")), "unreachable")

    def test_fold_pending_then_confirm_promotes_baseline(self):
        e1 = fold({"hash": "old", "firstSeen": "d0", "lastChanged": "d0"}, Signal("u", True, 200, "new1"), "d1", "pending")
        self.assertEqual(e1["pending"], "new1")
        self.assertEqual(e1["hash"], "old")           # baseline not moved yet
        e2 = fold(e1, Signal("u", True, 200, "new1"), "d2", "changed")
        self.assertEqual(e2["hash"], "new1")           # promoted on confirmation
        self.assertEqual(e2["lastChanged"], "d2")
        self.assertNotIn("pending", e2)

    def test_fold_unreachable_keeps_last_good(self):
        e = fold({"hash": "good", "firstSeen": "d0", "lastChanged": "d0"}, Signal("u", False, error="x"), "d9", "unreachable")
        self.assertEqual(e["hash"], "good")


class ProbeTests(unittest.TestCase):
    def test_hashes_html_visible_text(self):
        body = b"<html><body><script>var x=Math.random()</script><h1>Rate 4.25%</h1></body></html>"
        s = probe("https://x.gov/", opener=lambda req, t: FakeResp(body))
        self.assertTrue(s.ok)
        self.assertEqual(len(s.hash), 64)
        # A different random script must NOT change the hash (only visible text counts).
        body2 = b"<html><body><script>var x=Math.random()*999</script><h1>Rate 4.25%</h1></body></html>"
        s2 = probe("https://x.gov/", opener=lambda req, t: FakeResp(body2))
        self.assertEqual(s.hash, s2.hash)

    def test_failure_is_not_raised(self):
        def boom(req, t):
            raise OSError("network down")
        s = probe("https://x.gov/", retries=0, opener=boom)
        self.assertFalse(s.ok)
        self.assertIn("network down", s.error)


if __name__ == "__main__":
    unittest.main()
