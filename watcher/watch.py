#!/usr/bin/env python3
"""Official-source watcher.

Every run visits each source in watcher/sources.json, reduces it to the text a
person would read (PDF text or the page's main content, with scripts, menus and
"last updated" stamps stripped out), and compares that with the snapshot saved
last time. It then writes a short report of what changed, what didn't and what
couldn't be reached.

A difference only counts as a change once a second fetch returns the same new
content. A page that comes back different on every request is reported as
unstable and its snapshot isn't touched, so rotating banners and session tokens
can't bury the real changes.

    python watcher/watch.py                  # every source
    python watcher/watch.py --only AR,US     # some jurisdictions
    python watcher/watch.py --limit 20       # quick smoke run

Always exits 0 unless the tool itself crashes: changes and dead links are
findings in the report, not failures.
"""

from __future__ import annotations

import argparse
import concurrent.futures as cf
import datetime as dt
import difflib
import gzip
import hashlib
import html
import html.parser
import io
import json
import os
import re
import ssl
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCES_FILE = HERE / "sources.json"
STATE_FILE = HERE / "state" / "state.json"
SNAPSHOT_DIR = HERE / "state" / "snapshots"
REPORT_DIR = HERE / "reports"

USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0 Safari/537.36 payroll-tax-source-watcher/1.0"
)
TIMEOUT_SECONDS = 45
MAX_BYTES = 40 * 1024 * 1024
RETRIES = 3
CONFIRM_DELAY_SECONDS = 20
WORKERS = 12
# A source that has failed this many runs in a row is reported as broken
# rather than as a one-off outage.
BROKEN_AFTER_FAILURES = 3

DOC_EXTENSIONS = (".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".txt", ".zip")

# Lines that change without the substance changing. Matched against each
# normalised line; a matching line is dropped before hashing.
VOLATILE_LINE_PATTERNS = [
    r"^(page )?last (updated|modified|reviewed|revised)\b.*",
    r"^(updated|modified|reviewed|revised|posted)( on)?:? .{0,40}\d{4}.*$",
    r"^(page )?(generated|printed|retrieved|accessed)( on)?\b.*",
    r"^(©|\(c\)|copyright)\s.*",
    r"^all rights reserved.*",
    r"^skip to (main )?content.*",
    r"^(you are here|breadcrumb).*",
    r"^(share|print|email|tweet|facebook|linkedin)( this page)?$",
    r"^(back to top|top of page)$",
    r"^\d+ (views?|visits?)$",
    r"^(loading|please wait)\.*$",
    r"^(this site uses cookies|we use cookies)\b.*",
    r"^page \d+( of \d+)?$",
    r"^-?\d+\.\d{6,}$",  # bare high-precision numbers: server render timings
    r"^(page )?(generated|rendered|loaded) in [\d.]+ ?(ms|s|seconds?)\.?$",
]
VOLATILE_LINE_RE = re.compile("|".join(VOLATILE_LINE_PATTERNS), re.IGNORECASE)
# Inline noise inside otherwise meaningful lines.
INLINE_NOISE_RE = re.compile(
    r"\b[0-9a-f]{24,}\b"  # hex tokens, nonces
    r"|\b[A-Za-z0-9+/_-]{40,}={0,2}"  # base64-ish blobs
    r"|\b\d{1,2}:\d{2}(:\d{2})?\s?(am|pm|a\.m\.|p\.m\.)?\s?([ECMP][SD]T|UTC|GMT)?\b",  # clock times
    re.IGNORECASE,
)
QUERY_PARAMS_TO_DROP = {"ver", "v", "version", "timestamp", "ts", "t", "cb", "cache", "_", "rev", "utm_source",
                        "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"}
MONEY_OR_RATE_RE = re.compile(
    r"\$\s?\d[\d,]*(?:\.\d+)?"  # $2,470 / $0.018
    r"|\b\d+(?:\.\d+)?\s?%"  # 3.7% / 0.9 %
    r"|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b"  # 184,500
    r"|\b\d+\.\d{2,}\b"  # 0.0046 / 89.30
)


# --------------------------------------------------------------------------
# Extraction
# --------------------------------------------------------------------------

class _TextExtractor(html.parser.HTMLParser):
    """Collects visible text and links, skipping page chrome.

    If the page has a <main> element (or role="main" / id="main-content"),
    only text inside it is kept; otherwise the whole body minus header, nav,
    footer and aside.
    """

    SKIP = {"script", "style", "noscript", "svg", "template", "iframe", "button", "select", "textarea", "canvas"}
    CHROME = {"nav", "header", "footer", "aside"}
    BLOCK = {"p", "div", "section", "article", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6",
             "br", "table", "ul", "ol", "dd", "dt", "blockquote", "pre", "main", "caption", "hr"}
    VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}

    def __init__(self, base_url: str):
        super().__init__(convert_charrefs=True)
        self.base_url = base_url
        self.stack: list[tuple[str, bool, bool, bool]] = []  # (tag, skip, chrome, main)
        self.skip_depth = 0
        self.chrome_depth = 0
        self.main_depth = 0
        self.all_parts: list[str] = []
        self.main_parts: list[str] = []
        self.all_links: list[tuple[str, str]] = []
        self.main_links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._href_text: list[str] = []
        self.saw_main = False

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID:
            if tag == "br" and not self.skip_depth:
                self._emit("\n")
            return
        a = dict(attrs)
        is_skip = tag in self.SKIP
        is_chrome = tag in self.CHROME
        role = (a.get("role") or "").lower()
        ident = (a.get("id") or "").lower()
        is_main = tag == "main" or role == "main" or ident in ("main-content", "maincontent", "main_content", "content-main")
        if role in ("navigation", "banner", "contentinfo", "search"):
            is_chrome = True
        self.stack.append((tag, is_skip, is_chrome, is_main))
        if is_skip:
            self.skip_depth += 1
        if is_chrome:
            self.chrome_depth += 1
        if is_main:
            self.main_depth += 1
            self.saw_main = True
        if tag in self.BLOCK:
            self._emit("\n")
        if tag == "a" and a.get("href"):
            self._href = a["href"]
            self._href_text = []

    def handle_endtag(self, tag):
        if tag in self.VOID:
            return
        # Pop back to the matching open tag (tolerates sloppy HTML).
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                for _, is_skip, is_chrome, is_main in self.stack[i:]:
                    if is_skip:
                        self.skip_depth -= 1
                    if is_chrome:
                        self.chrome_depth -= 1
                    if is_main:
                        self.main_depth -= 1
                del self.stack[i:]
                break
        if tag in self.BLOCK:
            self._emit("\n")
        if tag == "a" and self._href is not None:
            text = " ".join("".join(self._href_text).split())
            link = (_canonical_url(urllib.parse.urljoin(self.base_url, self._href)), text)
            if not self.skip_depth:
                if not self.chrome_depth:
                    self.all_links.append(link)
                if self.main_depth:
                    self.main_links.append(link)
            self._href = None

    def handle_data(self, data):
        if self.skip_depth:
            return
        if self._href is not None:
            self._href_text.append(data)
        self._emit(data)

    def _emit(self, s: str):
        if self.skip_depth:
            return
        if not self.chrome_depth:
            self.all_parts.append(s)
        if self.main_depth:
            self.main_parts.append(s)

    def result(self) -> tuple[str, list[tuple[str, str]]]:
        main_text = "".join(self.main_parts)
        # A <main> that holds almost nothing (a JS shell) is worse than the body.
        if self.saw_main and len(main_text.split()) >= 40:
            return main_text, self.main_links
        return "".join(self.all_parts), self.all_links


def _canonical_url(url: str) -> str:
    parts = urllib.parse.urlsplit(url)
    if parts.scheme not in ("http", "https"):
        return url
    query = [(k, v) for k, v in urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
             if k.lower() not in QUERY_PARAMS_TO_DROP]
    return urllib.parse.urlunsplit((parts.scheme, parts.netloc.lower(), parts.path, urllib.parse.urlencode(query), ""))


def normalise_text(text: str, ignore: list[str] | None = None) -> str:
    """Reduce extracted text to stable, comparable lines."""
    extra = [re.compile(p, re.IGNORECASE) for p in (ignore or [])]
    out = []
    for raw in text.replace("\r", "\n").split("\n"):
        line = html.unescape(raw).replace("\u00a0", " ").replace("\u200b", "")
        line = re.sub(r"[\u2018\u2019]", "'", line)
        line = re.sub(r"[\u201c\u201d]", '"', line)
        line = re.sub(r"[\u2013\u2014]", "-", line)
        line = " ".join(line.split())
        if not line:
            continue
        if VOLATILE_LINE_RE.match(line) or any(p.search(line) for p in extra):
            continue
        line = INLINE_NOISE_RE.sub("", line).strip()
        if line:
            out.append(line)
    return "\n".join(out)


def extract_html(body: bytes, url: str, charset: str | None) -> tuple[str, list[tuple[str, str]]]:
    text = body.decode(charset or "utf-8", errors="replace")
    m = re.search(r"<meta[^>]+charset=[\"']?([\w-]+)", text[:4096], re.IGNORECASE)
    if not charset and m and m.group(1).lower() not in ("utf-8", "utf8"):
        try:
            text = body.decode(m.group(1), errors="replace")
        except LookupError:
            pass
    parser = _TextExtractor(url)
    parser.feed(text)
    parser.close()
    return parser.result()


def extract_pdf(body: bytes) -> str:
    """PDF text via pypdf. Falls back to the raw bytes minus PDF metadata
    (creation/modification dates, document IDs) when text can't be read."""
    try:
        import logging  # noqa: PLC0415

        import pypdf  # noqa: PLC0415

        logging.getLogger("pypdf").setLevel(logging.ERROR)

        reader = pypdf.PdfReader(io.BytesIO(body))
        if reader.is_encrypted:
            reader.decrypt("")
        pages = [(p.extract_text() or "") for p in reader.pages]
        text = "\n".join(pages)
        if len(text.split()) >= 20:
            return text
    except Exception:  # noqa: BLE001 - any parse failure falls through
        pass
    stripped = re.sub(rb"/(CreationDate|ModDate)\s*\([^)]*\)", b"", body)
    stripped = re.sub(rb"/ID\s*\[[^\]]*\]", b"", stripped)
    stripped = re.sub(rb"<xmp:(Create|Modify|Metadata)Date>[^<]*<", b"<", stripped)
    stripped = re.sub(rb"<xmpMM:(Document|Instance)ID>[^<]*<", b"<", stripped)
    return "[binary PDF, no extractable text] sha256=" + hashlib.sha256(stripped).hexdigest()


def key_figures(text: str) -> Counter:
    return Counter(m.group(0).replace(" ", "") for m in MONEY_OR_RATE_RE.finditer(text))


# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------

@dataclass
class Fetched:
    ok: bool
    status: int | None = None
    final_url: str | None = None
    content_type: str = ""
    body: bytes = b""
    error: str | None = None


def fetch(url: str) -> Fetched:
    last = Fetched(ok=False, error="not attempted")
    for attempt in range(RETRIES):
        req = urllib.request.Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        })
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as resp:
                body = resp.read(MAX_BYTES + 1)
                if len(body) > MAX_BYTES:
                    return Fetched(ok=False, status=resp.status, error=f"larger than {MAX_BYTES // 1024 // 1024} MB")
                return Fetched(ok=True, status=resp.status, final_url=resp.geturl(),
                               content_type=resp.headers.get("Content-Type", ""), body=body)
        except urllib.error.HTTPError as e:
            last = Fetched(ok=False, status=e.code, error=f"HTTP {e.code}")
            if e.code in (404, 410):
                return last  # gone is gone; retrying won't help
        except Exception as e:  # noqa: BLE001 - network errors of every kind
            reason = getattr(e, "reason", e)
            if isinstance(reason, ssl.SSLCertVerificationError):
                # The site's own certificate setup is broken (usually a missing
                # intermediate). Retrying won't help, and the watcher never
                # turns verification off.
                return Fetched(ok=False, error="site's TLS certificate failed verification "
                                               f"({getattr(reason, 'verify_message', None) or reason})")
            last = Fetched(ok=False, error=f"{type(e).__name__}: {e}"[:200])
        time.sleep(2 * (attempt + 1))
    return last


@dataclass
class Extracted:
    text: str
    links: list[tuple[str, str]] = field(default_factory=list)
    kind: str = "html"

    @property
    def hash(self) -> str:
        return hashlib.sha256(self.text.encode()).hexdigest()


def extract(source: dict, f: Fetched) -> Extracted:
    ctype = f.content_type.lower()
    url = f.final_url or source["url"]
    is_pdf = "pdf" in ctype or f.body[:5] == b"%PDF-"
    if is_pdf:
        return Extracted(normalise_text(extract_pdf(f.body), source.get("ignore")), [], "pdf")
    if "html" in ctype or "xml" in ctype or f.body.lstrip()[:1] == b"<":
        charset = None
        m = re.search(r"charset=([\w-]+)", ctype)
        if m:
            charset = m.group(1)
        text, links = extract_html(f.body, url, charset)
        if source.get("contains"):
            # Optional narrowing: keep only the region between two phrases.
            start, _, end = source["contains"].partition("...")
            i = text.find(start)
            if i >= 0:
                j = text.find(end, i + len(start)) if end else -1
                text = text[i:j + len(end)] if j >= 0 else text[i:]
        return Extracted(normalise_text(text, source.get("ignore")), links, "html")
    if "json" in ctype:
        try:
            data = json.loads(f.body)
            for key in source.get("drop_json_keys", []):
                _drop_key(data, key)
            text = json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False)
        except ValueError:
            text = f.body.decode("utf-8", errors="replace")
        return Extracted(normalise_text(text, source.get("ignore")), [], "json")
    if ctype.startswith("text/") or "csv" in ctype:
        return Extracted(normalise_text(f.body.decode("utf-8", errors="replace"), source.get("ignore")), [], "text")
    return Extracted(normalise_text(binary_strings(f.body), source.get("ignore")), [], "binary")


def _drop_key(node, key: str) -> None:
    """Removes a volatile field (e.g. a per-request timestamp) wherever it
    appears in a JSON document."""
    if isinstance(node, dict):
        node.pop(key, None)
        for v in node.values():
            _drop_key(v, key)
    elif isinstance(node, list):
        for v in node:
            _drop_key(v, key)


def binary_strings(body: bytes) -> str:
    """Readable text inside a binary file (old .xls/.doc and similar): runs
    of printable ASCII and UTF-16LE. Comparing these instead of raw bytes
    ignores the timestamps and IDs such files re-stamp on every download."""
    ascii_runs = re.findall(rb"[\x20-\x7e]{6,}", body)
    utf16_runs = re.findall(rb"(?:[\x20-\x7e]\x00){6,}", body)
    parts = [r.decode("ascii") for r in ascii_runs] + [r.decode("utf-16-le") for r in utf16_runs]
    return "\n".join(parts) if parts else "[binary] sha256=" + hashlib.sha256(body).hexdigest()


def document_links(links: list[tuple[str, str]], page_url: str) -> dict[str, str]:
    """Links worth announcing when they appear or vanish: documents anywhere,
    plus same-site pages (for index sources)."""
    out: dict[str, str] = {}
    for url, text in links:
        path = urllib.parse.urlsplit(url).path.lower()
        if path.endswith(DOC_EXTENSIONS) or path.endswith("/download") or "/documents/" in path:
            out.setdefault(url, text)
    return out


def page_links(links: list[tuple[str, str]], page_url: str) -> dict[str, str]:
    host = urllib.parse.urlsplit(page_url).netloc.lower()
    out: dict[str, str] = {}
    for url, text in links:
        parts = urllib.parse.urlsplit(url)
        if parts.scheme in ("http", "https") and parts.netloc.lower() == host and url.rstrip("/") != page_url.rstrip("/"):
            out.setdefault(url, text)
    return out


# --------------------------------------------------------------------------
# State
# --------------------------------------------------------------------------

def snapshot_path(source_id: str) -> Path:
    return SNAPSHOT_DIR / f"{source_id}.txt.gz"


def read_snapshot(source_id: str) -> str | None:
    p = snapshot_path(source_id)
    if not p.exists():
        return None
    return gzip.decompress(p.read_bytes()).decode()


def write_snapshot(source_id: str, text: str) -> None:
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    # mtime=0 keeps the file byte-identical when the text is, so git only
    # sees a change when the content really changed.
    snapshot_path(source_id).write_bytes(gzip.compress(text.encode(), mtime=0))


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text())
    return default


# --------------------------------------------------------------------------
# One source
# --------------------------------------------------------------------------

@dataclass
class Result:
    source: dict
    status: str  # changed | unchanged | new | unstable | unreachable | gone | blocked
    detail: str = ""
    diff: list[str] = field(default_factory=list)
    figures_added: list[str] = field(default_factory=list)
    figures_removed: list[str] = field(default_factory=list)
    docs_added: list[tuple[str, str]] = field(default_factory=list)
    docs_removed: list[tuple[str, str]] = field(default_factory=list)
    text: str | None = None
    hash: str | None = None
    links: dict[str, str] | None = None
    final_url: str | None = None
    redirected: bool = False
    via_browser: bool = False


def _signature(text_hash: str, links: dict[str, str]) -> str:
    return hashlib.sha256((text_hash + "\n" + "\n".join(sorted(links))).encode()).hexdigest()


def _read(source: dict, f: Fetched) -> tuple[Extracted, dict[str, str]]:
    page = f.final_url or source["url"]
    ex = extract(source, f)
    links = document_links(ex.links, page)
    if source.get("kind") == "index":
        links.update(page_links(ex.links, page))
    return ex, links


class BrowserFetcher:
    """Loads pages in headless Chromium, for sites that turn away plain HTTP
    requests or only build their content with JavaScript.

    It behaves like one ordinary visit: it identifies itself with the same
    user agent as the plain fetcher (which names this tool), visits each
    site once per run, and doesn't try to defeat CAPTCHAs or hide that it's
    automated. A site that still refuses is reported as blocking bots.
    """

    def __init__(self):
        from playwright.sync_api import sync_playwright  # noqa: PLC0415

        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch()
        self._context = self._browser.new_context(user_agent=USER_AGENT, locale="en-US",
                                                  accept_downloads=False)
        self._context.set_default_timeout(TIMEOUT_SECONDS * 1000)

    def close(self) -> None:
        try:
            self._context.close()
            self._browser.close()
        finally:
            self._pw.stop()

    def __call__(self, url: str) -> Fetched:
        page = self._context.new_page()
        try:
            try:
                resp = page.goto(url, wait_until="domcontentloaded")
            except Exception as e:  # noqa: BLE001
                if "Download is starting" not in str(e):
                    return Fetched(ok=False, error=f"browser: {type(e).__name__}: {str(e)[:150]}")
                return self._fetch_file(page, url)
            if resp is None:
                return Fetched(ok=False, error="browser: no response")
            try:
                page.wait_for_load_state("networkidle", timeout=15_000)
            except Exception:  # noqa: BLE001 - pages with long-polling never go idle
                pass
            ctype = resp.headers.get("content-type", "")
            if resp.status >= 400:
                return Fetched(ok=False, status=resp.status, error=f"HTTP {resp.status} (browser)")
            if "html" not in ctype:
                return Fetched(ok=True, status=resp.status, final_url=page.url, content_type=ctype, body=resp.body())
            return Fetched(ok=True, status=resp.status, final_url=page.url, content_type="text/html; charset=utf-8",
                          body=page.content().encode())
        finally:
            page.close()

    def _fetch_file(self, page, url: str) -> Fetched:
        """A PDF or other file: request it from the site's own origin, the way
        a link click on that site would."""
        origin = "{0.scheme}://{0.netloc}/".format(urllib.parse.urlsplit(url))
        try:
            page.goto(origin, wait_until="domcontentloaded")
            result = page.evaluate(
                """async (u) => {
                    const r = await fetch(u, {credentials: 'include'});
                    const b = new Uint8Array(await r.arrayBuffer());
                    let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
                    return {status: r.status, type: r.headers.get('content-type') || '', url: r.url, data: btoa(s)};
                }""", url)
        except Exception as e:  # noqa: BLE001
            return Fetched(ok=False, error=f"browser: {type(e).__name__}: {str(e)[:150]}")
        import base64  # noqa: PLC0415

        if result["status"] >= 400:
            return Fetched(ok=False, status=result["status"], error=f"HTTP {result['status']} (browser)")
        return Fetched(ok=True, status=result["status"], final_url=result["url"], content_type=result["type"],
                       body=base64.b64decode(result["data"]))


def browser_available() -> bool:
    try:
        import playwright.sync_api  # noqa: F401, PLC0415
        return True
    except ImportError:
        return False


BLOCK_PAGE_RE = re.compile(r"unblock|captcha|challenge|access[-_]?denied|/blocked|bot[-_]?check", re.IGNORECASE)


def _redirect_key(url: str) -> str:
    """URL with the differences that don't matter removed: scheme, default
    port, letter case of the host, trailing slash."""
    parts = urllib.parse.urlsplit(_canonical_url(url))
    host = (parts.hostname or "").lower()
    path = parts.path.rstrip("/")
    return f"{host}{path}{'?' + parts.query if parts.query else ''}"


def check_source(source: dict, prev: dict | None, confirm_delay: float, fetcher=None) -> Result:
    fetcher = fetcher or fetch
    f = fetcher(source["url"])
    if not f.ok:
        if f.status in (404, 410):
            return Result(source, "gone", f.error or "not found")
        if f.status in (401, 403, 429):
            return Result(source, "blocked", f"{f.error}: the site refuses automated requests")
        return Result(source, "unreachable", f.error or "fetch failed")
    final = f.final_url or source["url"]
    redirected = _redirect_key(final) != _redirect_key(source["url"])
    if redirected and BLOCK_PAGE_RE.search(final):
        return Result(source, "blocked", f"redirected to a bot check ({final})")
    if redirected and urllib.parse.urlsplit(final).path.strip("/") == "" and \
            urllib.parse.urlsplit(source["url"]).path.strip("/") != "":
        return Result(source, "gone", f"now redirects to the site's home page ({final})")
    first, links_now = _read(source, f)
    if first.kind == "html" and len(first.text.split()) < 15:
        return Result(source, "blocked", "page returned almost no text (a bot check, or built by JavaScript)")
    target = _redirect_key(final) if redirected else ""

    base = Result(source, "unchanged", text=first.text, hash=first.hash, links=links_now,
                  final_url=f.final_url, redirected=redirected)
    if prev is None or not prev.get("hash"):
        base.status = "new"
        base.detail = f"first snapshot ({len(first.text.split())} words, {first.kind})"
        return base

    old_links: dict[str, str] = prev.get("links", {})
    old_target = _redirect_key(prev["redirects_to"]) if prev.get("redirects_to") else ""
    old_sig = _signature(prev["hash"] + old_target, old_links)
    new_sig = _signature(first.hash + target, links_now)
    if new_sig == old_sig:
        return base

    # Something differs. Fetch again before believing it.
    time.sleep(confirm_delay)
    f2 = fetcher(source["url"])
    if not f2.ok:
        base.status = "unstable"
        base.detail = f"content differed, but the confirming fetch failed ({f2.error}); snapshot kept"
        return base
    second, links2 = _read(source, f2)
    final2 = f2.final_url or source["url"]
    target2 = _redirect_key(final2) if _redirect_key(final2) != _redirect_key(source["url"]) else ""
    sig2 = _signature(second.hash + target2, links2)
    if sig2 == old_sig:
        return Result(source, "unchanged", "a one-off difference the confirming fetch didn't reproduce",
                      final_url=f.final_url, redirected=redirected)
    if sig2 != new_sig:
        base.status = "unstable"
        base.detail = ("content differs on every request (rotating content); snapshot kept - "
                       "add an 'ignore' pattern or a 'contains' range for this source")
        return base

    base.status = "changed"
    if first.hash != prev["hash"]:
        old_text = read_snapshot(source["id"]) or ""
        base.diff = [l for l in difflib.unified_diff(old_text.split("\n"), first.text.split("\n"), lineterm="", n=0)
                     if not l.startswith(("---", "+++", "@@"))]
        before, after = key_figures(old_text), key_figures(first.text)
        base.figures_added = sorted((after - before).elements())
        base.figures_removed = sorted((before - after).elements())
    added = set(links_now) - set(old_links)
    removed = set(old_links) - set(links_now)
    base.docs_added = sorted((u, links_now[u]) for u in added)
    base.docs_removed = sorted((u, old_links[u]) for u in removed)
    parts = []
    if target != old_target:
        parts.append(f"now redirects to {final}" if target else "no longer redirects")
    if base.diff:
        parts.append(f"{sum(1 for l in base.diff if l.startswith('+'))} lines added, "
                     f"{sum(1 for l in base.diff if l.startswith('-'))} removed")
    if added or removed:
        parts.append(f"{len(added)} links added, {len(removed)} removed")
    base.detail = "; ".join(parts) or "content changed"
    return base


# --------------------------------------------------------------------------
# Run
# --------------------------------------------------------------------------

def run(sources: list[dict], state: dict, confirm_delay: float, workers: int) -> list[Result]:
    # Sources on the same host run one after another (polite, and avoids
    # tripping rate limits); different hosts run in parallel.
    by_host: dict[str, list[dict]] = defaultdict(list)
    for s in sources:
        by_host[urllib.parse.urlsplit(s["url"]).netloc.lower()].append(s)

    results: list[Result] = []

    def work(group: list[dict]) -> list[Result]:
        out = []
        for i, s in enumerate(group):
            if i:
                time.sleep(1.0)
            try:
                out.append(check_source(s, state.get(s["id"]), confirm_delay))
            except Exception as e:  # noqa: BLE001 - one bad source must not sink the run
                out.append(Result(s, "unreachable", f"watcher error: {type(e).__name__}: {e}"[:200]))
        return out

    with cf.ThreadPoolExecutor(max_workers=workers) as pool:
        for group_results in pool.map(work, by_host.values()):
            results.extend(group_results)
    return results


def retry_in_browser(results: list[Result], state: dict, confirm_delay: float) -> list[Result]:
    """Second chance for sources a plain request couldn't read: load them in
    a real browser, one at a time."""
    blocked = [r for r in results if r.status == "blocked"]
    if not blocked:
        return results
    if not browser_available():
        print("playwright not installed; blocked sites stay blocked", file=sys.stderr)
        return results
    print(f"Retrying {len(blocked)} blocked sources in headless Chromium...", file=sys.stderr)
    retried: dict[str, Result] = {}
    browser = BrowserFetcher()
    try:
        for r in blocked:
            try:
                again = check_source(r.source, state.get(r.source["id"]), confirm_delay, fetcher=browser)
            except Exception as e:  # noqa: BLE001
                again = Result(r.source, "blocked", f"{r.detail}; browser error: {type(e).__name__}")
            if again.status == "blocked":
                again.detail = f"{r.detail}; a real browser was refused too"
            else:
                again.detail = ("read with a headless browser" + (f"; {again.detail}" if again.detail else ""))
                again.via_browser = True
            retried[r.source["id"]] = again
    finally:
        browser.close()
    return [retried.get(r.source["id"], r) for r in results]


def apply_results(results: list[Result], state: dict, today: str) -> None:
    for r in results:
        sid = r.source["id"]
        entry = state.setdefault(sid, {})
        entry["url"] = r.source["url"]
        entry["last_checked"] = today
        if r.status in ("unreachable", "gone", "blocked"):
            entry["failures"] = entry.get("failures", 0) + 1
            entry["last_error"] = r.detail
            continue
        entry["failures"] = 0
        entry.pop("last_error", None)
        entry["last_ok"] = today
        if r.status in ("new", "changed"):
            entry["hash"] = r.hash
            entry["links"] = r.links or {}
            write_snapshot(sid, r.text or "")
        if r.status in ("new", "changed"):
            entry["last_changed"] = today
        if r.status in ("new", "changed"):
            if r.redirected:
                entry["redirects_to"] = r.final_url
            else:
                entry.pop("redirects_to", None)


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

def _md_escape(s: str) -> str:
    return s.replace("|", "\\|").replace("\n", " ")


def build_report(results: list[Result], state: dict, today: str, started: float) -> tuple[str, dict]:
    by_status: dict[str, list[Result]] = defaultdict(list)
    for r in results:
        by_status[r.status].append(r)
    broken = [r for r in results if r.status in ("unreachable", "gone")
              and state.get(r.source["id"], {}).get("failures", 0) >= BROKEN_AFTER_FAILURES]
    order = lambda r: (r.source.get("jurisdiction", ""), r.source.get("title", ""))  # noqa: E731

    n_changed = len(by_status["changed"])
    lines = [f"# Source watch - {today}", ""]
    headline = (f"**{n_changed} source{'s' if n_changed != 1 else ''} changed**" if n_changed
                else "**No changes** in any official source.")
    lines += [headline, ""]
    lines += ["| Changed | Unchanged | New | Unstable | Unreachable | Gone (404) | Blocks bots | Total |",
              "|---:|---:|---:|---:|---:|---:|---:|---:|",
              f"| {n_changed} | {len(by_status['unchanged'])} | {len(by_status['new'])} | "
              f"{len(by_status['unstable'])} | {len(by_status['unreachable'])} | {len(by_status['gone'])} | "
              f"{len(by_status['blocked'])} | {len(results)} |", ""]
    lines.append(f"_Run took {int(time.time() - started)} s. A change is only reported after a second fetch "
                 f"confirms it._")
    lines.append("")

    if n_changed:
        lines += ["## Changed", ""]
        for r in sorted(by_status["changed"], key=order):
            s = r.source
            lines.append(f"### {s.get('jurisdiction', '?')} - {s.get('title') or s['url']}")
            lines.append("")
            lines.append(f"<{s['url']}>  ")
            lines.append(f"{r.detail}")
            if s.get("used_by"):
                lines.append(f"  \nUsed by: {', '.join('`' + u + '`' for u in s['used_by'][:6])}")
            lines.append("")
            if r.figures_added or r.figures_removed:
                lines.append(f"- Figures now present: {', '.join(r.figures_added[:20]) or 'none'}")
                lines.append(f"- Figures no longer present: {', '.join(r.figures_removed[:20]) or 'none'}")
            for u, t in r.docs_added[:15]:
                lines.append(f"- New link: [{_md_escape(t) or u}]({u})")
            for u, t in r.docs_removed[:15]:
                lines.append(f"- Removed link: [{_md_escape(t) or u}]({u})")
            if r.diff:
                shown = [l if len(l) <= 240 else l[:237] + "..." for l in r.diff[:40]]
                lines += ["", "<details><summary>What changed</summary>", "", "```diff", *shown]
                if len(r.diff) > 40:
                    lines.append(f"... {len(r.diff) - 40} more changed lines")
                lines += ["```", "</details>"]
            lines.append("")

    def table(title: str, rows: list[Result], note: str = ""):
        if not rows:
            return
        lines.extend([f"## {title} ({len(rows)})", ""])
        if note:
            lines.extend([note, ""])
        lines.extend(["| Jurisdiction | Source | Detail |", "|---|---|---|"])
        for r in sorted(rows, key=order):
            s = r.source
            lines.append(f"| {s.get('jurisdiction', '')} | [{_md_escape(s.get('title') or s['url'])[:90]}]({s['url']}) "
                         f"| {_md_escape(r.detail)[:160]} |")
        lines.append("")

    table("Broken - failing for 3+ runs", broken,
          "These URLs need replacing in `watcher/sources.json` (or the site blocks automated fetches).")
    table("Gone (404)", [r for r in by_status["gone"] if r not in broken],
          "A 404 on an official document often means a new version was published at a new address.")
    table("Unreachable this run", [r for r in by_status["unreachable"] if r not in broken])
    table("Unstable", by_status["unstable"])
    table("New (first snapshot taken)", by_status["new"])
    moved = [r for r in results if r.redirected and r.status not in ("unreachable", "gone", "blocked")]
    for r in moved:
        r.detail = r.detail or f"-> {r.final_url}"
    table("Redirected", moved, "These still work but redirect elsewhere; consider updating the URL in data/ or curated.json.")

    blocked = sorted(by_status["blocked"], key=order)
    if blocked:
        lines += [f"## Sites that block automated checks ({len(blocked)})", "",
                  "These can't be watched by a script (bot protection or JavaScript-only pages). Check them by hand "
                  "now and then, or find the same document at an address that allows it.", "",
                  "<details><summary>Show all</summary>", "", "| Jurisdiction | Source | Detail |", "|---|---|---|"]
        for r in blocked:
            s = r.source
            lines.append(f"| {s.get('jurisdiction', '')} | [{_md_escape(s.get('title') or s['url'])[:90]}]({s['url']}) "
                         f"| {_md_escape(r.detail)[:120]} |")
        lines += ["", "</details>", ""]

    unchanged = sorted(by_status["unchanged"], key=order)
    if unchanged:
        lines += [f"## Unchanged ({len(unchanged)})", "", "<details><summary>Show all</summary>", ""]
        for r in unchanged:
            s = r.source
            last = state.get(s["id"], {}).get("last_changed", "never seen changing")
            lines.append(f"- {s.get('jurisdiction', '')} - [{_md_escape(s.get('title') or s['url'])[:100]}]({s['url']})"
                         f" (last changed: {last})")
        lines += ["", "</details>", ""]

    summary = {
        "date": today,
        "counts": {k: len(v) for k, v in by_status.items() if v},
        "total": len(results),
        "changed": [{"id": r.source["id"], "jurisdiction": r.source.get("jurisdiction"), "title": r.source.get("title"),
                     "url": r.source["url"], "detail": r.detail, "figures_added": r.figures_added[:50],
                     "figures_removed": r.figures_removed[:50], "links_added": [u for u, _ in r.docs_added],
                     "links_removed": [u for u, _ in r.docs_removed]} for r in sorted(by_status["changed"], key=order)],
        "broken": [r.source["url"] for r in broken],
    }
    return "\n".join(lines) + "\n", summary


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated jurisdictions (e.g. AR,US) or source ids")
    ap.add_argument("--limit", type=int, help="check at most N sources")
    ap.add_argument("--confirm-delay", type=float, default=CONFIRM_DELAY_SECONDS)
    ap.add_argument("--workers", type=int, default=WORKERS)
    ap.add_argument("--no-browser", action="store_true", help="don't retry blocked sites in headless Chromium")
    ap.add_argument("--date", help="report date (default: today, US Eastern)")
    ap.add_argument("--dry-run", action="store_true", help="don't write state, snapshots or reports")
    args = ap.parse_args(argv)

    started = time.time()
    sources = json.loads(SOURCES_FILE.read_text())["sources"]
    if args.only:
        wanted = {w.strip().upper() for w in args.only.split(",")}
        sources = [s for s in sources if s.get("jurisdiction", "").upper() in wanted or s["id"].upper() in wanted]
    if args.limit:
        sources = sources[: args.limit]
    try:
        from zoneinfo import ZoneInfo  # noqa: PLC0415

        today = args.date or dt.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    except Exception:  # noqa: BLE001
        today = args.date or dt.date.today().isoformat()

    state = load_json(STATE_FILE, {})
    print(f"Checking {len(sources)} sources...", file=sys.stderr)
    results = run(sources, state, args.confirm_delay, args.workers)
    if not args.no_browser:
        results = retry_in_browser(results, state, args.confirm_delay)
    if not args.dry_run:
        apply_results(results, state, today)
    report, summary = build_report(results, state, today, started)

    if not args.dry_run:
        STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
        known = {s["id"] for s in json.loads(SOURCES_FILE.read_text())["sources"]}
        for sid in [k for k in state if k not in known]:
            del state[sid]
            snapshot_path(sid).unlink(missing_ok=True)
        STATE_FILE.write_text(json.dumps(state, indent=1, sort_keys=True) + "\n")
        REPORT_DIR.mkdir(parents=True, exist_ok=True)
        (REPORT_DIR / f"{today}.md").write_text(report)
        (REPORT_DIR / "latest.md").write_text(report)
        (REPORT_DIR / "latest.json").write_text(json.dumps(summary, indent=1) + "\n")

    step_summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if step_summary:
        with open(step_summary, "a") as fh:
            fh.write(report)
    print(report if len(report) < 20000 else report[:20000] + "\n... (truncated; see watcher/reports/latest.md)")
    c = summary["counts"]
    print(f"changed={c.get('changed', 0)} unchanged={c.get('unchanged', 0)} new={c.get('new', 0)} "
          f"unstable={c.get('unstable', 0)} unreachable={c.get('unreachable', 0)} gone={c.get('gone', 0)} "
          f"blocked={c.get('blocked', 0)}",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
