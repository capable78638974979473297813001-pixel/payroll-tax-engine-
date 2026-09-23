"""Network side of the harvester.

Probes one source URL and returns a change SIGNAL — HTTP status plus a sha256
of the page's *visible text* (tags/attributes stripped, so per-request tokens
never register). Every failure resolves to ``ok=False`` with an ``error``; this
never raises, so a source being down can never fail the harvester.
"""
from __future__ import annotations

import hashlib
import os
import re
import ssl
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass

# Present as a real Chrome browser. Many government / CDN-fronted sites return
# 403/404/400 to a plain scripting user-agent; the full header set makes them
# respond normally. A site that still blocks by IP is reported unreachable.
BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,"
              "image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}

MAX_HASH_BYTES = 25 * 1024 * 1024

_SCRIPT = re.compile(r"<script\b[^>]*>.*?</script>", re.I | re.S)
_STYLE = re.compile(r"<style\b[^>]*>.*?</style>", re.I | re.S)
_COMMENT = re.compile(r"<!--.*?-->", re.S)
_TAG = re.compile(r"<[^>]+>")
_ISO_TS = re.compile(r"\d{4}-\d{2}-\d{2}[T ][\d:.]+(?:Z|[+-]\d{2}:?\d{2})?")
_CLOCK = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b")
_WS = re.compile(r"\s+")

_CTX = ssl.create_default_context()
_ca = os.environ.get("SSL_CERT_FILE") or "/root/.ccr/ca-bundle.crt"
try:  # local runs go through an intercepting proxy; GitHub runners don't need this
    if os.path.exists(_ca):
        _CTX.load_verify_locations(_ca)
except Exception:
    pass


@dataclass
class Signal:
    url: str
    ok: bool
    status: int | None = None
    hash: str | None = None
    bytes: int | None = None
    error: str | None = None


def normalize_html(text: str) -> str:
    """Reduce an HTML page to its visible text so per-request tokens (ASP.NET
    __VIEWSTATE, CSRF, script nonces, Cloudflare ray ids / email-protection hex,
    cache-busting query strings) never change the hash. Only the human-readable
    content survives — the freshness signal we actually care about."""
    text = _SCRIPT.sub(" ", text)
    text = _STYLE.sub(" ", text)
    text = _COMMENT.sub(" ", text)
    text = _TAG.sub(" ", text)
    text = _ISO_TS.sub(" ", text)
    text = _CLOCK.sub(" ", text)
    return _WS.sub(" ", text).strip()


def _looks_html(ctype: str | None, head: bytes) -> bool:
    if ctype and re.search(r"text/html|application/xhtml", ctype, re.I):
        return True
    return not ctype and bool(re.match(rb"\s*<(?:!doctype|html)", head[:200], re.I))


def probe(url: str, timeout: float = 15.0, retries: int = 1,
          opener=None) -> Signal:
    """Fetch a URL and hash its normalized content. Always returns a Signal."""
    last = Signal(url=url, ok=False, error="not attempted")
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=BROWSER_HEADERS)
            if opener is not None:
                resp = opener(req, timeout)
            else:
                resp = urllib.request.urlopen(req, timeout=timeout, context=_CTX)
            with resp:
                status = getattr(resp, "status", 200) or 200
                ctype = resp.headers.get("content-type") if hasattr(resp, "headers") else None
                body = resp.read(MAX_HASH_BYTES + 1)
                if len(body) > MAX_HASH_BYTES:
                    return Signal(url=url, ok=True, status=status, hash=None, bytes=len(body))
                material = (normalize_html(body.decode("utf-8", "replace")).encode("utf-8")
                            if _looks_html(ctype, body) else body)
                digest = hashlib.sha256(material).hexdigest()
                return Signal(url=url, ok=True, status=status, hash=digest, bytes=len(body))
        except urllib.error.HTTPError as e:
            # A 4xx/5xx is a definite (non-retryable) answer: reachable but blocked/gone.
            return Signal(url=url, ok=False, status=e.code, error=f"HTTP {e.code}")
        except Exception as e:  # timeout, DNS, TLS, reset, ...
            last = Signal(url=url, ok=False, error=type(e).__name__ + ": " + str(e)[:80])
        if attempt < retries:
            import time
            time.sleep(0.5 * (2 ** attempt))
    return last


def probe_all(urls: list[str], concurrency: int = 10, timeout: float = 15.0,
              retries: int = 1, opener=None) -> list[Signal]:
    if not urls:
        return []
    with ThreadPoolExecutor(max_workers=max(1, concurrency)) as ex:
        return list(ex.map(lambda u: probe(u, timeout, retries, opener), urls))
