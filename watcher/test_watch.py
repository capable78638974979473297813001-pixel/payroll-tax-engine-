"""Offline tests for watcher/watch.py. A local HTTP server plays the part of
the official sites, so the full fetch -> extract -> confirm -> report path
runs without the network.

    python -m unittest watcher/test_watch.py
"""

from __future__ import annotations

import contextlib
import http.server
import io
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import watch  # noqa: E402


def make_pdf(text: str, creation_date: str = "20260101000000") -> bytes:
    """A minimal one-page PDF whose page shows `text`."""
    stream = f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode()
    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources << /Font << /F1 5 0 R >> >> >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        f"<< /CreationDate (D:{creation_date}) /ModDate (D:{creation_date}) >>".encode(),
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = []
    for i, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    for off in offsets:
        out += f"{off:010d} 00000 n \n".encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)


PAGE = """<html><head><title>Withholding</title><script>var t = "{token}";</script></head>
<body><header><nav><a href="/home">Home</a> Menu</nav></header>
<main>
<h1>Employer withholding</h1>
<p>Last updated: {updated}</p>
<p>The withholding rate is {rate} for tax year 2026. The standard deduction is {deduction}.</p>
<p>Employers must use the formula below for wages paid on or after January 1, 2026, and keep records
of every payment made to each employee for at least four years after the tax is due or paid.</p>
<ul><li><a href="/files/formula-2026.pdf?ver={token}">Withholding formula 2026</a></li>{extra_link}</ul>
</main>
<footer>Copyright 2026 State of Somewhere</footer></body></html>"""


class Site:
    """Mutable content the fake server serves; tests change it between runs."""

    def __init__(self):
        self.pages: dict[str, tuple[int, str, bytes]] = {}
        self.counter = 0
        self.rotating: set[str] = set()
        self.flap_once: dict[str, bytes] = {}

    def set_page(self, path: str, body: bytes | str, status: int = 200, ctype: str = "text/html; charset=utf-8"):
        self.pages[path] = (status, ctype, body.encode() if isinstance(body, str) else body)


def make_handler(site: Site):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):  # silence
            pass

        def do_GET(self):  # noqa: N802
            site.counter += 1
            status, ctype, body = site.pages.get(self.path, (404, "text/plain", b"not found"))
            if self.path in site.flap_once:
                body = site.flap_once.pop(self.path)
            if self.path in site.rotating:
                body = body.replace(b"ROTATE", f"banner number {site.counter}".encode())
            self.send_response(status)
            if status in (301, 302):
                self.send_header("Location", body.decode())
                body = b""
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    return Handler


def page(rate="3.7%", deduction="$2,470", token="abc", updated="September 1, 2026", extra_link=""):
    return PAGE.format(rate=rate, deduction=deduction, token=token * 20, updated=updated, extra_link=extra_link)


class WatcherTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.site = Site()
        cls.server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), make_handler(cls.site))
        cls.base = f"http://127.0.0.1:{cls.server.server_address[1]}"
        threading.Thread(target=cls.server.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        tmp = Path(self.tmp.name)
        self._saved = (watch.SOURCES_FILE, watch.STATE_FILE, watch.SNAPSHOT_DIR, watch.REPORT_DIR, watch.RETRIES)
        watch.SOURCES_FILE = tmp / "sources.json"
        watch.STATE_FILE = tmp / "state" / "state.json"
        watch.SNAPSHOT_DIR = tmp / "state" / "snapshots"
        watch.REPORT_DIR = tmp / "reports"
        watch.RETRIES = 1
        self.site.pages.clear()
        self.site.rotating.clear()
        self.site.flap_once.clear()

    def tearDown(self):
        (watch.SOURCES_FILE, watch.STATE_FILE, watch.SNAPSHOT_DIR, watch.REPORT_DIR, watch.RETRIES) = self._saved
        self.tmp.cleanup()

    def sources(self, *paths: str, kind: str | None = None):
        srcs = [{"id": f"t-{i}", "jurisdiction": "XX", "title": p, "url": self.base + p, **({"kind": kind} if kind else {})}
                for i, p in enumerate(paths)]
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))

    def run_watch(self, date: str) -> dict:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            watch.main(["--confirm-delay", "0", "--date", date, "--workers", "4"])
        return json.loads((watch.REPORT_DIR / "latest.json").read_text())

    def test_first_run_takes_snapshots_then_nothing_changes(self):
        self.site.set_page("/wh", page())
        self.sources("/wh")
        self.assertEqual(self.run_watch("2026-09-01")["counts"], {"new": 1})
        self.assertEqual(self.run_watch("2026-09-02")["counts"], {"unchanged": 1})

    def test_noise_is_ignored(self):
        """Script tokens, cache-busting ?ver= params, 'Last updated' stamps,
        nav and footer all change without the rules changing."""
        self.site.set_page("/wh", page())
        self.sources("/wh")
        self.run_watch("2026-09-01")
        self.site.set_page("/wh", page(token="xyz", updated="September 20, 2026").replace(
            "Menu", "Menu Holiday hours").replace("Copyright 2026", "Copyright 2027"))
        self.assertEqual(self.run_watch("2026-09-02")["counts"], {"unchanged": 1})

    def test_real_change_is_reported_with_figures_and_diff(self):
        self.site.set_page("/wh", page())
        self.sources("/wh")
        self.run_watch("2026-09-01")
        self.site.set_page("/wh", page(rate="3.9%"))
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["counts"], {"changed": 1})
        change = summary["changed"][0]
        self.assertIn("3.9%", change["figures_added"])
        self.assertIn("3.7%", change["figures_removed"])
        report = (watch.REPORT_DIR / "2026-09-02.md").read_text()
        self.assertIn("1 source changed", report)
        self.assertIn("+The withholding rate is 3.9%", report)
        # The new content becomes the baseline: the next run is quiet.
        self.assertEqual(self.run_watch("2026-09-03")["counts"], {"unchanged": 1})

    def test_new_document_link_is_reported(self):
        """How the Arkansas rate cut surfaced: a new PDF on the agency page."""
        self.site.set_page("/wh", page())
        self.sources("/wh")
        self.run_watch("2026-09-01")
        self.site.set_page("/wh", page(extra_link='<li><a href="/files/formula-revised.pdf">Revised formula</a></li>'))
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["counts"], {"changed": 1})
        self.assertEqual(summary["changed"][0]["links_added"], [self.base + "/files/formula-revised.pdf"])

    def test_one_off_difference_is_not_a_change(self):
        self.site.set_page("/wh", page())
        self.sources("/wh")
        self.run_watch("2026-09-01")
        self.site.flap_once["/wh"] = page(rate="9.9%").encode()
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["counts"], {"unchanged": 1})

    def test_rotating_page_is_unstable_and_keeps_its_snapshot(self):
        self.site.set_page("/wh", page().replace("Employer withholding", "Employer withholding ROTATE"))
        self.sources("/wh")
        self.site.rotating.add("/wh")
        self.run_watch("2026-09-01")
        before = watch.read_snapshot("t-0")
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["counts"], {"unstable": 1})
        self.assertEqual(watch.read_snapshot("t-0"), before)

    def test_pdf_text_compared_not_bytes(self):
        self.site.set_page("/f.pdf", make_pdf("Rate 3.7 percent on taxable wages over 26400 dollars for 2026 filers "
                                             "under the revised formula method effective January first"),
                           ctype="application/pdf")
        self.sources("/f.pdf")
        self.run_watch("2026-09-01")
        # Re-issued with new metadata only: not a change.
        self.site.set_page("/f.pdf", make_pdf("Rate 3.7 percent on taxable wages over 26400 dollars for 2026 filers "
                                             "under the revised formula method effective January first",
                                             creation_date="20260915000000"), ctype="application/pdf")
        self.assertEqual(self.run_watch("2026-09-02")["counts"], {"unchanged": 1})
        self.site.set_page("/f.pdf", make_pdf("Rate 3.5 percent on taxable wages over 26400 dollars for 2026 filers "
                                             "under the revised formula method effective January first"),
                           ctype="application/pdf")
        self.assertEqual(self.run_watch("2026-09-03")["counts"], {"changed": 1})

    def test_errors_keep_the_baseline_and_are_classified(self):
        self.site.set_page("/wh", page())
        self.site.set_page("/blocked", "Access denied", status=403, ctype="text/html")
        self.sources("/wh", "/missing", "/blocked")
        summary = self.run_watch("2026-09-01")
        self.assertEqual(summary["counts"], {"new": 1, "gone": 1, "blocked": 1})
        # The page goes down for a day: reported, but the snapshot survives
        # and nothing is "changed" when it comes back.
        self.site.set_page("/wh", "oops", status=500, ctype="text/plain")
        self.assertEqual(self.run_watch("2026-09-02")["counts"], {"unreachable": 1, "gone": 1, "blocked": 1})
        self.site.set_page("/wh", page())
        self.assertEqual(self.run_watch("2026-09-03")["counts"], {"unchanged": 1, "gone": 1, "blocked": 1})

    def test_broken_after_three_failures(self):
        self.sources("/missing")
        for day in ("2026-09-01", "2026-09-02", "2026-09-03"):
            summary = self.run_watch(day)
        self.assertEqual(summary["broken"], [self.base + "/missing"])

    def test_redirect_to_bot_check_or_home_page(self):
        self.site.set_page("/", page())
        self.site.set_page("/unblock?from=law", page())
        self.site.set_page("/old-rules", "/", status=302)
        self.site.set_page("/law", "/unblock?from=law", status=302)
        self.sources("/old-rules", "/law")
        self.assertEqual(self.run_watch("2026-09-01")["counts"], {"gone": 1, "blocked": 1})

    def test_new_redirect_target_is_a_change(self):
        """Idaho-style: a stable address redirecting to a dated file."""
        self.site.set_page("/files/formula-0701.pdf", page())
        self.site.set_page("/files/formula-0915.pdf", page())
        self.site.set_page("/formula", "/files/formula-0701.pdf", status=302)
        self.sources("/formula")
        self.run_watch("2026-09-01")
        self.site.set_page("/formula", "/files/formula-0915.pdf", status=302)
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["counts"], {"changed": 1})
        self.assertIn("now redirects to", summary["changed"][0]["detail"])
        self.assertEqual(self.run_watch("2026-09-03")["counts"], {"unchanged": 1})

    def test_index_source_reports_new_pages(self):
        body = page(extra_link='<li><a href="/news/2026-rates">2026 rates</a></li>')
        self.site.set_page("/wh", body)
        self.sources("/wh", kind="index")
        self.run_watch("2026-09-01")
        self.site.set_page("/wh", body.replace("</ul>", '<li><a href="/news/2027-rates">2027 rates</a></li></ul>'))
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["changed"][0]["links_added"], [self.base + "/news/2027-rates"])


class ExtractionTest(unittest.TestCase):
    def test_main_region_preferred_and_chrome_dropped(self):
        text, _ = watch.extract_html(page().encode(), "https://x.gov/wh", None)
        norm = watch.normalise_text(text)
        self.assertIn("The withholding rate is 3.7%", norm)
        self.assertNotIn("Menu", norm)
        self.assertNotIn("Last updated", norm)
        self.assertNotIn("Copyright", norm)

    def test_sharepoint_form_wrapper_keeps_content(self):
        html = ("<html><body><form id='aspnetForm'><div>" + "Withholding rates for employers. " * 10 +
                "</div></form></body></html>")
        text, _ = watch.extract_html(html.encode(), "https://x.gov", None)
        self.assertIn("Withholding rates for employers.", text)

    def test_cache_busting_params_dropped_from_links(self):
        self.assertEqual(watch._canonical_url("https://X.gov/a.pdf?ver=123&id=7#top"), "https://x.gov/a.pdf?id=7")

    def test_render_timings_ignored(self):
        self.assertEqual(watch.normalise_text("Rate 5%\n0.0037310123443604\nPage generated in 0.12 seconds"), "Rate 5%")

    def test_key_figures(self):
        figs = watch.key_figures("Rate 3.7% over $26,400; base 184,500 and 0.0046")
        self.assertEqual(set(figs), {"3.7%", "$26,400", "184,500", "0.0046"})


if __name__ == "__main__":
    unittest.main()
