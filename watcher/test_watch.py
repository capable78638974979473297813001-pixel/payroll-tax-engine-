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
import os
import sys
import tempfile
import threading
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_sources  # noqa: E402
import reconcile  # noqa: E402
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
        self.browser_only: set[str] = set()

    def set_page(self, path: str, body: bytes | str, status: int = 200, ctype: str = "text/html; charset=utf-8"):
        self.pages[path] = (status, ctype, body.encode() if isinstance(body, str) else body)


def make_handler(site: Site):
    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):  # silence
            pass

        def do_GET(self):  # noqa: N802
            site.counter += 1
            status, ctype, body = site.pages.get(self.path, (404, "text/plain", b"not found"))
            if self.path in site.browser_only and not self.headers.get("Sec-Fetch-Mode"):
                status, ctype, body = 403, "text/html", b"Access denied"
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


class ServerTestCase(unittest.TestCase):
    """Starts the fake site and points the watcher at a temp directory."""

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
        self.site.browser_only.clear()

    def tearDown(self):
        (watch.SOURCES_FILE, watch.STATE_FILE, watch.SNAPSHOT_DIR, watch.REPORT_DIR, watch.RETRIES) = self._saved
        self.tmp.cleanup()

    def sources(self, *paths: str, kind: str | None = None):
        srcs = [{"id": f"t-{i}", "jurisdiction": "XX", "title": p, "url": self.base + p, **({"kind": kind} if kind else {})}
                for i, p in enumerate(paths)]
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))

    def run_watch(self, date: str, *extra: str) -> dict:
        with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
            watch.main(["--confirm-delay", "0", "--date", date, "--workers", "4", *extra])
        return json.loads((watch.REPORT_DIR / "latest.json").read_text())

class WatcherTest(ServerTestCase):
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

    def test_report_states_coverage_and_never_read_sources(self):
        self.site.set_page("/wh", page())
        self.sources("/wh", "/missing")
        summary = self.run_watch("2026-09-01")
        # The run "succeeds", but the summary says one source was never read.
        self.assertEqual(summary["verified"], 1)
        self.assertEqual(summary["unverified"], 1)
        self.assertEqual(summary["never_baselined"], [self.base + "/missing"])
        report = (watch.REPORT_DIR / "latest.md").read_text()
        self.assertIn("Coverage: 1 of 2 sources were read this run", report)
        self.assertIn("Never read successfully", report)
        # A source with a baseline that fails later is unverified, not never-read.
        self.site.set_page("/wh", "oops", status=500, ctype="text/plain")
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["unverified"], 2)
        self.assertEqual(summary["never_baselined"], [self.base + "/missing"])
        self.assertEqual(summary["max_consecutive_failures"], 2)

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

    def test_json_api_compared_as_data(self):
        """Official APIs (eCFR, Federal Register): key order and volatile
        fields don't matter; a new amendment does."""
        self.site.set_page("/api", json.dumps({"b": [{"date": "2016-12-01"}], "a": 1, "generated_at": "x"}),
                           ctype="application/json")
        self.sources("/api")
        src = json.loads(watch.SOURCES_FILE.read_text())
        src["sources"][0]["drop_json_keys"] = ["generated_at"]
        watch.SOURCES_FILE.write_text(json.dumps(src))
        self.run_watch("2026-09-01")
        self.site.set_page("/api", json.dumps({"a": 1, "generated_at": "y", "b": [{"date": "2016-12-01"}]}),
                           ctype="application/json")
        self.assertEqual(self.run_watch("2026-09-02")["counts"], {"unchanged": 1})
        self.site.set_page("/api", json.dumps({"a": 1, "b": [{"date": "2016-12-01"}, {"date": "2026-10-01"}]}),
                           ctype="application/json")
        self.assertEqual(self.run_watch("2026-09-03")["counts"], {"changed": 1})

    def test_api_key_placeholder_is_used_but_never_saved(self):
        self.site.set_page("/api?key=S3CRET-KEY", json.dumps({"law": "text of section 651"}), ctype="application/json")
        srcs = [{"id": "t-0", "jurisdiction": "XX", "title": "api", "url": self.base + "/api?key={env:TEST_WATCH_KEY}"}]
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))
        os.environ.pop("TEST_WATCH_KEY", None)
        summary = self.run_watch("2026-09-01")
        self.assertEqual(summary["counts"], {"blocked": 1})
        self.assertIn("TEST_WATCH_KEY", (watch.REPORT_DIR / "latest.md").read_text())
        os.environ["TEST_WATCH_KEY"] = "S3CRET-KEY"
        try:
            self.assertEqual(self.run_watch("2026-09-02")["counts"], {"new": 1})
            self.assertEqual(self.run_watch("2026-09-03")["counts"], {"unchanged": 1})
        finally:
            del os.environ["TEST_WATCH_KEY"]
        for path in [watch.STATE_FILE, *watch.REPORT_DIR.iterdir()]:
            self.assertNotIn("S3CRET", path.read_text(), path)
        self.assertNotIn("S3CRET", watch.read_snapshot("t-0"))

    def test_headline_box_changes_are_minor(self):
        """A 'latest news' box rotating is recorded but isn't a real change;
        the page's own text changing is."""
        news = '<aside-free><ul class="news"><li><a href="/news/{a}">{a} picnic announced</a></li></ul>'
        def body(headline, rate="3.7%"):
            return page(rate=rate).replace("</main>", news.format(a=headline) + "</main>")
        self.site.set_page("/wh", body("Spring"))
        self.sources("/wh")
        self.run_watch("2026-09-01")
        self.site.set_page("/wh", body("Summer"))
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["counts"], {"changed": 1})
        self.assertEqual(summary["significant_changes"], 0)
        self.assertIn("No changes", (watch.REPORT_DIR / "latest.md").read_text())
        self.site.set_page("/wh", body("Summer", rate="3.5%"))
        summary = self.run_watch("2026-09-03")
        self.assertEqual(summary["significant_changes"], 1)

    def test_keep_limits_a_busy_index_to_relevant_lines(self):
        rows = '<tr><td><a href="/dft/{f}.pdf">{name}</a></td><td>{title}</td></tr>'
        def body(*forms):
            return ("<html><body><main><h1>Draft forms</h1><p>" + "Draft forms posted for review. " * 12 +
                    "</p><table>" + "".join(rows.format(f=f, name=n, title=t) for f, n, t in forms) +
                    "</table></main></body></html>")
        w4 = ("fw4", "Form W-4", "Employee's Withholding Certificate")
        self.site.set_page("/dft", body(w4, ("f1099da", "Form 1099-DA", "Digital Asset Proceeds")))
        srcs = [{"id": "t-0", "jurisdiction": "XX", "title": "dft", "url": self.base + "/dft", "kind": "index",
                 "keep": [r"\bW-4", r"\bfw4", r"Draft forms posted"]}]
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))
        self.run_watch("2026-09-01")
        self.site.set_page("/dft", body(w4, ("f1120s", "Form 1120-S", "S Corporation Return")))
        self.assertEqual(self.run_watch("2026-09-02")["counts"], {"unchanged": 1})
        self.site.set_page("/dft", body(w4, ("fw4p", "Form W-4P", "Withholding Certificate for Pensions")))
        summary = self.run_watch("2026-09-03")
        self.assertEqual(summary["significant_changes"], 1)
        self.assertEqual(summary["changed"][0]["links_added"], [self.base + "/dft/fw4p.pdf"])

    def test_index_source_reports_new_pages(self):
        body = page(extra_link='<li><a href="/news/2026-rates">2026 rates</a></li>')
        self.site.set_page("/wh", body)
        self.sources("/wh", kind="index")
        self.run_watch("2026-09-01")
        self.site.set_page("/wh", body.replace("</ul>", '<li><a href="/news/2027-rates">2027 rates</a></li></ul>'))
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["changed"][0]["links_added"], [self.base + "/news/2027-rates"])


@unittest.skipUnless(watch.browser_available(), "playwright not installed")
class BrowserFallbackTest(ServerTestCase):
    """Sites a plain request can't read, retried in headless Chromium."""

    def test_javascript_only_page_is_read_by_the_browser(self):
        self.site.set_page("/app", "<html><body><div id=r></div><script>document.getElementById('r').innerHTML = "
                                   "'<main><p>' + 'The 2026 rate is 4.40 percent for all filers. '.repeat(5) + "
                                   "'</p></main>';</script></body></html>")
        self.sources("/app")
        self.assertEqual(self.run_watch("2026-09-01", "--no-browser")["counts"], {"blocked": 1})
        summary = self.run_watch("2026-09-02")
        self.assertEqual(summary["counts"], {"new": 1})
        self.assertIn("4.40 percent", watch.read_snapshot("t-0"))

    def test_site_refusing_plain_requests(self):
        self.site.set_page("/wh", page())
        self.site.set_page("/f.pdf", make_pdf("Circular M rate 5 percent on wages after the exemption amount for "
                                             "every employee claiming the personal exemption this year"),
                           ctype="application/pdf")
        self.site.browser_only.update({"/wh", "/f.pdf"})
        self.sources("/wh", "/f.pdf")
        self.assertEqual(self.run_watch("2026-09-01")["counts"], {"new": 2})
        state = json.loads(watch.STATE_FILE.read_text())
        self.assertTrue(state["t-0"]["needs_browser"] and state["t-1"]["needs_browser"])
        self.assertEqual(self.run_watch("2026-09-02")["counts"], {"unchanged": 2})
        self.site.set_page("/wh", page(rate="3.5%"))
        self.assertEqual(self.run_watch("2026-09-03")["counts"], {"changed": 1, "unchanged": 1})

    def test_still_refused_stays_blocked(self):
        self.site.set_page("/deny", "Access denied", status=403, ctype="text/html")
        self.sources("/deny")
        summary = self.run_watch("2026-09-01")
        self.assertEqual(summary["counts"], {"blocked": 1})


class BuildSourcesTest(unittest.TestCase):
    def test_every_optional_setting_survives_the_build(self):
        """sources.json is generated; a curated setting the builder forgets to
        copy silently stops working (this happened to 'keep')."""
        options = {"kind": "index", "ignore": ["x"], "contains": "a...b", "drop_json_keys": ["t"],
                   "replaces": ["https://old.example.gov/"], "keep": ["W-4"], "follow": True, "follow_limit": 3,
                   "critical": True, "reconcile": "oh_municipal", "directory": "https://x.gov/directory"}
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "data").mkdir()
            (tmp / "curated.json").write_text(json.dumps({"sources": [
                {"jurisdiction": "US", "title": "t", "url": "https://x.gov/", **options}]}))
            saved = (build_sources.HERE, build_sources.DATA, build_sources.REPO)
            build_sources.HERE, build_sources.DATA, build_sources.REPO = tmp, tmp / "data", tmp
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    build_sources.main()
            finally:
                build_sources.HERE, build_sources.DATA, build_sources.REPO = saved
            built = json.loads((tmp / "sources.json").read_text())["sources"][0]
        for key, value in options.items():
            self.assertEqual(built.get(key), value, key)


class ScopeTest(unittest.TestCase):
    """watcher/scope.json: the watcher is for unscheduled changes, so jurisdictions that only move on fixed
    dates are left out of sources.json (reversibly: data/ and curated.json are untouched)."""

    def build(self, *, curated, data, scope):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            (tmp / "data" / "states").mkdir(parents=True)
            (tmp / "data" / "garnishment").mkdir(parents=True)
            (tmp / "curated.json").write_text(json.dumps({"sources": curated}))
            for rel, body in data.items():
                (tmp / "data" / rel).write_text(json.dumps(body))
            if scope is not None:
                (tmp / "scope.json").write_text(json.dumps(scope))
            saved = (build_sources.HERE, build_sources.DATA, build_sources.REPO, build_sources.SCOPE_FILE)
            build_sources.HERE, build_sources.DATA, build_sources.REPO = tmp, tmp / "data", tmp
            build_sources.SCOPE_FILE = tmp / "scope.json"
            try:
                with contextlib.redirect_stdout(io.StringIO()):
                    build_sources.main()
            finally:
                build_sources.HERE, build_sources.DATA, build_sources.REPO, build_sources.SCOPE_FILE = saved
            return json.loads((tmp / "sources.json").read_text())["sources"]

    DATA = {
        "states/OH-2026.json": {"sources": [{"title": "Ohio withholding", "url": "https://tax.ohio.gov/w.pdf"}]},
        "states/MD-2026.json": {"sources": [{"title": "Maryland withholding", "url": "https://www.marylandtaxes.gov/w.pdf"}]},
    }
    CURATED = [{"jurisdiction": "MD", "title": "MD curated", "url": "https://www.marylandtaxes.gov/index"},
               {"jurisdiction": "OH", "title": "OH curated", "url": "https://tax.ohio.gov/index"},
               {"jurisdiction": "US", "title": "IRS", "url": "https://www.irs.gov/p15t"}]

    def test_excluded_jurisdictions_lose_curated_and_cited_sources(self):
        built = self.build(curated=self.CURATED, data=self.DATA,
                           scope={"excluded": {"MD": "only a July 1 step"}})
        self.assertEqual(sorted(s["url"] for s in built),
                         ["https://tax.ohio.gov/index", "https://tax.ohio.gov/w.pdf", "https://www.irs.gov/p15t"])

    def test_no_scope_file_means_everything_is_in_scope(self):
        built = self.build(curated=self.CURATED, data=self.DATA, scope=None)
        self.assertEqual(len(built), 5)

    def test_a_jurisdiction_cannot_be_both_kept_and_excluded(self):
        with self.assertRaises(SystemExit):
            self.build(curated=self.CURATED, data=self.DATA, scope={"keep": {"MD": "x"}, "excluded": {"MD": "y"}})

    def test_cites_nested_under_a_state_code_belong_to_that_state(self):
        """Garnishment overrides sit in one file for every state; each state's statutes must follow the state."""
        data = {"garnishment/state-overrides-2026.json": {"states": {
            "TX": {"sources": [{"title": "Tex. Prop. Code", "url": "https://statutes.capitol.texas.gov/x"}]},
            "OH": {"sources": [{"title": "R.C. 2716.02", "url": "https://codes.ohio.gov/x"}]}}}}
        built = {s["url"]: s["jurisdiction"] for s in self.build(curated=[], data=data, scope=None)}
        self.assertEqual(built, {"https://statutes.capitol.texas.gov/x": "TX", "https://codes.ohio.gov/x": "OH"})
        kept = self.build(curated=[], data=data, scope={"excluded": {"TX": "no income tax"}})
        self.assertEqual([s["jurisdiction"] for s in kept], ["OH"])

    def test_the_real_scope_file_is_consistent(self):
        scope = json.loads((Path(__file__).resolve().parent / "scope.json").read_text())
        self.assertFalse(set(scope["keep"]) & set(scope["excluded"]))
        self.assertIn("US", scope["keep"])
        for st in ("OH", "GA", "UT", "WV", "ID", "AR"):  # documented unscheduled mid-year changes
            self.assertIn(st, scope["keep"], st)
        for st in ("AL", "IN", "KY", "MI", "PA"):  # local-tax registries
            self.assertIn(st, scope["keep"], st)
        for reason in {**scope["keep"], **scope["excluded"]}.values():
            self.assertGreater(len(reason), 20)


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


WORDS = ("The employer must withhold the tax shown in this schedule from every payment of wages made to an employee "
         "who works within the municipality and remit it to the tax administrator on or before the due date")


def pdf(rate: str) -> bytes:
    return make_pdf(f"{WORDS} at the rate of {rate}%")


def index_page(*links: str) -> str:
    items = "".join(f'<li><a href="{u}">{label}</a></li>' for u, label in links)
    return (f"<html><body><main><h1>Village income tax</h1><p>{WORDS}. Forms and notices are listed below for "
            f"employers and residents.</p><ul>{items}</ul></main></body></html>")


class FollowTest(ServerTestCase):
    """The watcher reads the documents an index page links to, not only the
    page: a rate sheet can change behind a landing page that never does."""

    def kids(self, summary):
        return [c for c in summary["changed"] if "~" in c["id"]]

    def test_linked_document_is_read_and_a_change_to_it_is_reported(self):
        self.site.set_page("/tax", index_page(("/files/notice.pdf", "Withholding notice")))
        self.site.set_page("/files/notice.pdf", pdf("1.0"), ctype="application/pdf")
        self.sources("/tax", kind="index")
        first = self.run_watch("2026-10-01")
        self.assertEqual(first["counts"], {"new": 2})  # the page and its one document
        self.assertEqual(first["followed_documents"], 1)
        self.assertEqual(self.run_watch("2026-10-02")["counts"], {"unchanged": 2})

        # The landing page does not change at all; only the PDF behind it.
        self.site.set_page("/files/notice.pdf", pdf("2.0"), ctype="application/pdf")
        summary = self.run_watch("2026-10-03")
        self.assertEqual(summary["counts"], {"changed": 1, "unchanged": 1})
        kid = self.kids(summary)[0]
        self.assertIn("Withholding notice", kid["title"])
        self.assertEqual((kid["figures_removed"], kid["figures_added"]), (["1.0%"], ["2.0%"]))
        self.assertEqual(summary["significant_changes"], 1)

    def test_a_scanned_pdf_with_no_text_is_still_watched(self):
        """Many village notices are scans. With no text layer the file itself is compared."""
        scan = make_pdf("")
        self.site.set_page("/tax", index_page(("/files/scan.pdf", "Scanned notice")))
        self.site.set_page("/files/scan.pdf", scan, ctype="application/pdf")
        self.sources("/tax", kind="index")
        self.run_watch("2026-10-01")
        self.site.set_page("/files/scan.pdf", make_pdf("") + b"\n% a different scan\n", ctype="application/pdf")
        self.assertEqual(self.run_watch("2026-10-02")["counts"], {"changed": 1, "unchanged": 1})

    def test_a_scan_stored_under_the_old_blind_marker_is_rebaselined_not_reported_as_changed(self):
        """Before the fix, every scanned PDF was stored as one constant string, so none could ever
        show a change. On the first run after the fix they are re-baselined quietly."""
        import hashlib  # noqa: PLC0415

        self.site.set_page("/scan.pdf", make_pdf(""), ctype="application/pdf")
        self.sources("/scan.pdf")
        self.run_watch("2026-10-01")
        legacy = watch.LEGACY_MARKERS[0]
        state = json.loads(watch.STATE_FILE.read_text())
        state["t-0"]["hash"] = hashlib.sha256(legacy.encode()).hexdigest()
        watch.STATE_FILE.write_text(json.dumps(state))
        watch.write_snapshot("t-0", legacy)
        summary = self.run_watch("2026-10-02")
        self.assertEqual(summary["counts"], {"new": 1})
        self.assertEqual(summary["significant_changes"], 0)
        self.assertEqual(self.run_watch("2026-10-03")["counts"], {"unchanged": 1})
        self.site.set_page("/scan.pdf", make_pdf("") + b"\n% re-scanned\n", ctype="application/pdf")
        self.assertEqual(self.run_watch("2026-10-04")["counts"], {"changed": 1})

    def test_removed_link_drops_the_document_from_state(self):
        self.site.set_page("/tax", index_page(("/files/a.pdf", "A"), ("/files/b.pdf", "B")))
        for n in "ab":
            self.site.set_page(f"/files/{n}.pdf", pdf(n), ctype="application/pdf")
        self.sources("/tax", kind="index")
        self.run_watch("2026-10-01")
        before = json.loads(watch.STATE_FILE.read_text())
        self.assertEqual(sum("~" in k for k in before), 2)
        self.site.set_page("/tax", index_page(("/files/a.pdf", "A")))
        self.run_watch("2026-10-02")
        after = json.loads(watch.STATE_FILE.read_text())
        self.assertEqual(sum("~" in k for k in after), 1)
        self.assertEqual(len(list(watch.SNAPSHOT_DIR.glob("*~*"))), 1)

    def test_only_documents_on_the_pages_own_site_or_other_government_sites(self):
        self.site.set_page("/tax", index_page(("/files/a.pdf", "Ours"),
                                              ("https://example.com/vendor.pdf", "A vendor's brochure"),
                                              ("https://tax.ohio.gov/forms/it4.pdf", "State form")))
        self.site.set_page("/files/a.pdf", pdf("1"), ctype="application/pdf")
        self.sources("/tax", kind="index")
        children = watch.follow_children(
            [watch.Result(json.loads(watch.SOURCES_FILE.read_text())["sources"][0], "new",
                          links=watch.document_links(
                              watch.extract_html(index_page(("/files/a.pdf", "Ours"),
                                                            ("https://example.com/vendor.pdf", "V"),
                                                            ("https://tax.ohio.gov/forms/it4.pdf", "S")).encode(),
                                                 self.base + "/tax", None)[1], self.base + "/tax"),
                          final_url=self.base + "/tax")], {})
        urls = sorted(c["url"] for c in children)
        self.assertIn("https://tax.ohio.gov/forms/it4.pdf", urls)
        self.assertNotIn("https://example.com/vendor.pdf", urls)

    def test_a_page_is_read_at_most_follow_limit_documents_and_says_so(self):
        links = [(f"/files/d{i}.pdf", f"Doc {i}") for i in range(5)]
        self.site.set_page("/tax", index_page(*links))
        for u, _ in links:
            self.site.set_page(u, pdf(u[-5]), ctype="application/pdf")
        srcs = [{"id": "t-0", "jurisdiction": "XX", "title": "tax", "url": self.base + "/tax", "kind": "index",
                 "follow_limit": 2}]
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))
        summary = self.run_watch("2026-10-01")
        self.assertEqual(summary["followed_documents"], 2)
        self.assertEqual(json.loads(watch.STATE_FILE.read_text())["t-0"]["follow_skipped"], 3)

    def test_follow_false_opts_an_index_out(self):
        self.site.set_page("/tax", index_page(("/files/a.pdf", "A")))
        self.site.set_page("/files/a.pdf", pdf("1"), ctype="application/pdf")
        srcs = [{"id": "t-0", "jurisdiction": "XX", "title": "tax", "url": self.base + "/tax", "kind": "index",
                 "follow": False}]
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))
        self.assertEqual(self.run_watch("2026-10-01")["counts"], {"new": 1})

    def test_plain_pages_are_not_followed_unless_asked(self):
        self.site.set_page("/tax", index_page(("/files/a.pdf", "A")))
        self.site.set_page("/files/a.pdf", pdf("1"), ctype="application/pdf")
        self.sources("/tax")  # not an index
        self.assertEqual(self.run_watch("2026-10-01")["counts"], {"new": 1})
        srcs = json.loads(watch.SOURCES_FILE.read_text())["sources"]
        srcs[0]["follow"] = True
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))
        self.assertEqual(self.run_watch("2026-10-02")["counts"], {"new": 1, "unchanged": 1})

    def test_a_dead_link_is_counted_not_escalated(self):
        self.site.set_page("/tax", index_page(("/files/a.pdf", "A"), ("/files/missing.pdf", "Missing")))
        self.site.set_page("/files/a.pdf", pdf("1"), ctype="application/pdf")
        self.sources("/tax", kind="index")
        summary = self.run_watch("2026-10-01")
        self.assertEqual(summary["counts"], {"new": 2})
        self.assertEqual(summary["followed_documents_unread"], 1)
        self.assertEqual(summary["broken"], [])
        self.assertEqual(summary["attention"], [])
        self.assertIn("could not be read", (watch.REPORT_DIR / "latest.md").read_text())

    def test_running_one_jurisdiction_does_not_forget_another_ones_documents(self):
        self.site.set_page("/a", index_page(("/files/a.pdf", "A")))
        self.site.set_page("/b", index_page(("/files/b.pdf", "B")))
        for n in "ab":
            self.site.set_page(f"/files/{n}.pdf", pdf(n), ctype="application/pdf")
        srcs = [{"id": "a-0", "jurisdiction": "AA", "title": "a", "url": self.base + "/a", "kind": "index"},
                {"id": "b-0", "jurisdiction": "BB", "title": "b", "url": self.base + "/b", "kind": "index"}]
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))
        self.run_watch("2026-10-01")
        self.assertEqual(sum("~" in k for k in json.loads(watch.STATE_FILE.read_text())), 2)
        self.run_watch("2026-10-02", "--only", "AA")
        state = json.loads(watch.STATE_FILE.read_text())
        self.assertEqual(sorted(k.split("~")[0] for k in state if "~" in k), ["a-0", "b-0"])


class AttentionTest(ServerTestCase):
    """A green run must not read as 'everything is watched' while an official
    bulk file the data is built from has never been readable."""

    def critical(self, path: str, **extra):
        srcs = [{"id": "c-0", "jurisdiction": "OH", "title": "Official rate file", "url": self.base + path,
                 "critical": True, **extra}]
        watch.SOURCES_FILE.write_text(json.dumps({"sources": srcs}))

    def test_a_critical_source_that_was_never_readable_is_raised_on_the_first_run(self):
        self.site.set_page("/rates", "denied", status=401)
        self.critical("/rates")
        summary = self.run_watch("2026-10-01", "--no-browser")
        self.assertEqual([a["kind"] for a in summary["attention"]], ["critical_unreadable"])
        report = (watch.REPORT_DIR / "latest.md").read_text()
        self.assertIn("## Needs attention (1)", report)
        self.assertIn("not an all-clear", report)

    def test_a_critical_source_that_fails_after_working_is_raised_after_three_runs(self):
        self.site.set_page("/rates", page())
        self.critical("/rates")
        self.run_watch("2026-10-01", "--no-browser")
        self.site.set_page("/rates", "denied", status=401)
        counts = [len(self.run_watch(f"2026-10-0{d}", "--no-browser")["attention"]) for d in (2, 3, 4)]
        self.assertEqual(counts, [0, 0, 1])

    def test_an_ordinary_source_failing_is_not_attention(self):
        self.site.set_page("/p", "denied", status=401)
        self.sources("/p")
        self.assertEqual(self.run_watch("2026-10-01", "--no-browser")["attention"], [])

    def test_reconcile_findings_flow_into_the_report_and_summary(self):
        findings = [
            {"kind": "missing_from_engine", "severity": "action", "source_id": "x", "jurisdiction": "OH",
             "code": "86492", "name": "Woodville", "detail": "in force in the official file but not in the data"},
            {"kind": "rate_differs", "severity": "info", "source_id": "x", "jurisdiction": "OH", "code": "81214",
             "name": "Washington", "detail": "acknowledged"},
        ]
        self.site.set_page("/p", page())
        self.sources("/p")
        saved = watch.reconcile.run
        watch.reconcile.run = lambda *a, **k: findings
        try:
            summary = self.run_watch("2026-10-01")
        finally:
            watch.reconcile.run = saved
        self.assertEqual([a["name"] if "name" in a else a["title"] for a in summary["attention"]], ["OH Woodville"])
        self.assertEqual(len(summary["reconcile"]), 2)
        report = (watch.REPORT_DIR / "latest.md").read_text()
        self.assertIn("## Needs attention (1)", report)
        self.assertIn("for information (1)", report)


class IncompleteChainTest(unittest.TestCase):
    def test_only_a_missing_intermediate_certificate_gets_the_browser_retry(self):
        src = {"id": "t", "url": "https://x.gov/"}
        missing = watch.Result(src, "unreachable", "site's TLS certificate failed verification (unable to get local issuer certificate)")
        expired = watch.Result(src, "unreachable", "site's TLS certificate failed verification (certificate has expired)")
        self.assertTrue(watch.incomplete_chain(missing))
        self.assertFalse(watch.incomplete_chain(expired))  # verification is never turned off
        self.assertFalse(watch.incomplete_chain(watch.Result(src, "blocked", "HTTP 403")))


def finder_csv(extra_rows: list[str], filler: int = 520) -> str:
    """OHMuniRateTable.csv: no header; start,end,code,NAME,rate (a fraction)."""
    rows = [f"20040101,99991231,{10000 + i:05d},TOWN{i},.01000" for i in range(filler)]
    return "\n".join(rows + extra_rows) + "\n"


class ReconcileTest(unittest.TestCase):
    SRC = {"id": "oh-muni", "jurisdiction": "OH", "title": "Muni rates"}
    TODAY = "2026-10-15"

    def repo(self, extra_entries: list[dict], year: int = 2026, filler: int = 520) -> Path:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        d = Path(tmp.name) / "data" / "local"
        d.mkdir(parents=True)
        base = [{"name": f"Town{i}", "municode": f"{10000 + i:05d}", "rate": 0.01, "effectiveFrom": "2004-01-01"}
                for i in range(filler)]
        (d / f"OH-municipalities-{year}.json").write_text(json.dumps({"year": year, "municipalities": base + extra_entries}))
        return Path(tmp.name)

    def run_it(self, csv_text, repo, directory=None, today=None):
        return reconcile.reconcile_oh_municipal(csv_text, self.SRC, today or self.TODAY, repo, directory)

    def kinds(self, findings, severity=None):
        return sorted((f["kind"], f["name"]) for f in findings if severity in (None, f["severity"]))

    def test_matching_data_has_no_findings(self):
        self.assertEqual(self.run_it(finder_csv([]), self.repo([])), [])

    def test_a_taxing_municipality_missing_from_the_engine_needs_action(self):
        csv_text = finder_csv(["20260701,99991231,99001,NEWVILLE,.01000"])
        out = self.run_it(csv_text, self.repo([]))
        self.assertEqual(self.kinds(out, "action"), [("missing_from_engine", "Newville")])
        self.assertIn("1.000%", out[0]["detail"])

    def test_a_rate_the_engine_gets_wrong_needs_action(self):
        csv_text = finder_csv(["20260101,99991231,99002,TAXTOWN,.02000"])
        repo = self.repo([{"name": "Taxtown", "municode": "99002", "rate": 0.015, "effectiveFrom": "2026-01-01"}])
        out = self.run_it(csv_text, repo)
        self.assertEqual(self.kinds(out, "action"), [("rate_differs", "Taxtown")])

    def test_a_variance_the_data_file_already_explains_is_only_information(self):
        csv_text = finder_csv(["20260101,99991231,99002,TAXTOWN,.02000"])
        repo = self.repo([{"name": "Taxtown", "municode": "99002", "rate": 0.015, "effectiveFrom": "2026-01-01",
                           "$correctionNote": "the city's own notice says 1.5%"}])
        out = self.run_it(csv_text, repo)
        self.assertEqual(self.kinds(out, "action"), [])
        self.assertEqual(self.kinds(out, "info"), [("rate_differs", "Taxtown")])

    def test_rate_history_is_applied_as_of_the_check_date(self):
        csv_text = finder_csv(["20260701,99991231,99003,LATETOWN,.01000"])
        entry = {"name": "Latetown", "municode": "99003", "rate": 0.01, "effectiveFrom": "2026-07-01",
                 "rateHistory": [{"from": "2026-01-01", "rate": 0.0}, {"from": "2026-07-01", "rate": 0.01}]}
        self.assertEqual(self.run_it(csv_text, self.repo([entry])), [])
        # Before July the official file has no row in force, and the engine's 0% is consistent.
        self.assertEqual(self.kinds(self.run_it(csv_text, self.repo([entry]), today="2026-03-01"), "action"), [])

    def test_a_row_added_by_hand_that_the_official_file_lacks_is_information(self):
        entry = {"name": "Handville", "municode": "", "rate": 0.01, "effectiveFrom": "2026-07-01",
                 "$addedNote": "ADDED: the village's own notice"}
        out = self.run_it(finder_csv([]), self.repo([entry]), directory={"handville": "86492"})
        self.assertEqual(self.kinds(out, "action"), [])
        self.assertEqual(self.kinds(out, "info"), [("backfill_municode", "Handville"), ("not_in_official_file", "Handville")])
        self.assertEqual({f["code"] for f in out}, {"86492"})

    def test_an_engine_row_with_no_note_that_the_official_file_dropped_needs_action(self):
        entry = {"name": "Stale", "municode": "99004", "rate": 0.01, "effectiveFrom": "2004-01-01"}
        out = self.run_it(finder_csv([]), self.repo([entry]))
        self.assertEqual(self.kinds(out, "action"), [("not_in_official_file", "Stale")])

    def test_a_blank_municode_is_matched_by_name_and_offered_for_backfill(self):
        csv_text = finder_csv(["20260101,99991231,99005,ANNEXED,.01000"])
        entry = {"name": "Annexed", "municode": "", "rate": 0.01, "effectiveFrom": "2026-01-01"}
        out = self.run_it(csv_text, self.repo([entry]))
        self.assertEqual(self.kinds(out), [("backfill_municode", "Annexed")])

    def test_a_scheduled_rate_change_the_engine_lacks_needs_action_before_it_takes_effect(self):
        csv_text = finder_csv(["20260101,20261231,99006,GROWTH,.01500", "20270101,99991231,99006,GROWTH,.02000"])
        e26 = {"name": "Growth", "municode": "99006", "rate": 0.015, "effectiveFrom": "2026-01-01"}
        e27 = {"name": "Growth", "municode": "99006", "rate": 0.015, "effectiveFrom": "2026-01-01"}
        repo = self.repo([e26])
        d = repo / "data" / "local"
        (d / "OH-municipalities-2027.json").write_text(json.dumps({"year": 2027, "municipalities": [e27]}))
        out = self.run_it(csv_text, repo)
        self.assertEqual(self.kinds(out, "action"), [("scheduled_change_missing", "Growth")])
        self.assertIn("2027-01-01", out[0]["detail"])

    def test_a_truncated_download_is_reported_not_trusted(self):
        out = self.run_it("20040101,99991231,00142,ABERDEEN,.01000\n", self.repo([]))
        self.assertEqual([f["kind"] for f in out], ["unreadable"])  # not 520 false 'missing' rows

    def test_directory_names_that_repeat_are_dropped(self):
        text = json.dumps({"entities": [{"code": "03585", "name": "BAINBRIDGE"}, {"code": "03604", "name": "BAINBRIDGE"},
                                        {"code": "86492", "name": "WOODVILLE"}]})
        self.assertEqual(reconcile.parse_finder_directory(text), {"woodville": "86492"})

    def test_jedd_rates_are_percent_in_the_official_file(self):
        rows = ["EffStartDate,EffEndDate,JEDD_ID,Name,Rate"] + [f"20030101,29991231,{9000 + i},ZONE {i},1.5" for i in range(60)]
        rows.append("20030101,29991231,9500,ZONE X,2")
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        d = Path(tmp.name) / "data" / "local"
        d.mkdir(parents=True)
        zones = [{"name": f"Zone {i}", "jeddId": str(9000 + i), "rate": 0.015} for i in range(60)]
        zones.append({"name": "Zone X", "jeddId": "9500", "rate": 0.02})
        (d / "OH-jedd-jedz-2026.json").write_text(json.dumps({"zones": zones}))
        self.assertEqual(reconcile.reconcile_oh_jedd("\n".join(rows), self.SRC, self.TODAY, Path(tmp.name)), [])
        zones[-1]["rate"] = 0.025
        (d / "OH-jedd-jedz-2026.json").write_text(json.dumps({"zones": zones}))
        out = reconcile.reconcile_oh_jedd("\n".join(rows), self.SRC, self.TODAY, Path(tmp.name))
        self.assertEqual(self.kinds(out, "action"), [("rate_differs", "Zone X")])

    def test_a_file_that_cannot_be_read_is_a_finding_not_a_silent_skip(self):
        class Bad:
            ok = False
            body = b""
            error = "HTTP 401"
        out = reconcile.run([{**self.SRC, "reconcile": "oh_municipal", "url": "https://x/"}], lambda u: Bad(), self.TODAY)
        self.assertEqual([(f["kind"], f["severity"]) for f in out], [("unreadable", "action")])
        out = reconcile.run([{**self.SRC, "reconcile": "nope", "url": "https://x/"}], lambda u: Bad(), self.TODAY)
        self.assertEqual([f["kind"] for f in out], ["unknown_reconciler"])


if __name__ == "__main__":
    unittest.main()
