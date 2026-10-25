#!/usr/bin/env python3
"""Check that the sources the data files cite still say what the data files quote them as saying.

The daily watcher notices when a source CHANGES. It does not ask whether the
words a data file attributes to a source are on that source at all. This does,
offline, against the page text the watcher already stores
(watcher/state/snapshots), so it costs no requests:

    python watcher/verify_citations.py                 # every data file
    python watcher/verify_citations.py --only MN,US    # some jurisdictions
    python watcher/verify_citations.py --json out.json # machine-readable result

For every citation (an object with a "url") it takes the verbatim text the data
records for it, in a "quote" or "says" field or inside quote marks in
"verifiedBy", splits it where it was elided ("..."), and looks for each piece in
the stored page text after normalising case, punctuation and dashes. A citation
is:

  supported    every piece found in the stored text
  partly       some pieces found (a paraphrase, or a page that has since changed)
  unsupported  none found
  unread       no stored snapshot for the URL (not watched, blocked, or never read)

"supported" says the source contains the quoted words. It does NOT say the
engine's number equals the quoted number; that still needs reading the entry.
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DATA = REPO / "data"
STATE = HERE / "state" / "state.json"
SNAP = HERE / "state" / "snapshots"

# Fields that claim to hold the source's own words. "says" is usually a summary
# ("Attalla 2% rate column on the 01 2026 return"), so it is checked as "loose"
# and reported separately rather than counted against a source.
QUOTE_FIELDS = ("quote", "verbatim")
LOOSE_FIELDS = ("says",)
NOTE_FIELDS = ("verifiedBy", "verification", "note")
MIN_PIECE = 24  # characters, after normalising; shorter pieces match by accident


def norm(text: str) -> str:
    t = text.lower()
    t = (t.replace("’", "'").replace("‘", "'").replace("“", '"').replace("”", '"')
         .replace("–", "-").replace("—", "-").replace(" ", " ").replace("−", "-"))
    t = re.sub(r"[^a-z0-9$%.,\- ]+", " ", t)
    t = re.sub(r"\s*([.,])\s*", r"\1 ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def pieces(raw: str) -> list[str]:
    """Verbatim fragments inside a quote, split where the author elided text."""
    raw = raw.strip().strip("'\"“”‘’")
    parts = re.split(r"\.\.\.|…|\[\s*\.\.\.\s*\]|\[[^\]]{0,40}\]", raw)
    out = []
    for p in parts:
        n = norm(p)
        if len(n) >= MIN_PIECE:
            out.append(n)
    return out


INTRO = re.compile(r"(verbatim|quoted|quote|reads?|states?|stated|says?|text|wording|footnote|bulletin)\W{0,12}$", re.I)
# Text a note quotes that is NOT the source's: instructions, prompts, the engine's own behaviour.
NOT_SOURCE = re.compile(r"find and fix|anything missing|caller supplies|pre-?computed|this engine|the engine", re.I)


def quoted_in_note(note: str) -> list[str]:
    """Quoted passages in a verifiedBy-style note that the note introduces as the source's own words."""
    found = []
    for m in re.finditer(r"\u201c([^\u201d]{30,})\u201d|\"([^\"]{30,})\"|(?<![A-Za-z0-9])'([^']{30,})'(?![A-Za-z0-9])", note):
        text = next(g for g in m.groups() if g)
        before = note[max(0, m.start() - 40):m.start()]
        if INTRO.search(before) and not NOT_SOURCE.search(text):
            found.append(text)
    return found


def snapshots() -> dict[str, str]:
    state = json.loads(STATE.read_text())
    by_url: dict[str, str] = {}
    for sid, rec in state.items():
        url = rec.get("url")
        f = SNAP / f"{sid}.txt.gz"
        if url and f.exists():
            by_url.setdefault(url, str(f))
    return by_url


_cache: dict[str, str] = {}


def text_for(path: str) -> str:
    if path not in _cache:
        _cache[path] = norm(gzip.open(path, "rt", encoding="utf8", errors="replace").read())
    return _cache[path]


def citations(node, file: str, trail: str = ""):
    if isinstance(node, dict):
        url = node.get("url")
        if isinstance(url, str) and url.startswith("http"):
            frags: list[str] = []
            loose: list[str] = []
            for k in QUOTE_FIELDS:
                if isinstance(node.get(k), str):
                    frags += pieces(node[k])
            for k in LOOSE_FIELDS:
                if isinstance(node.get(k), str):
                    loose += pieces(node[k])
            for k in NOTE_FIELDS:
                if isinstance(node.get(k), str):
                    for q in quoted_in_note(node[k]):
                        frags += pieces(q)
            yield {"file": file, "path": trail, "url": url, "title": node.get("title", ""), "pieces": frags, "loose": loose}
        for k, v in node.items():
            yield from citations(v, file, f"{trail}/{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from citations(v, file, f"{trail}[{i}]")


def live_recheck(results: list[dict]) -> None:
    """Fetch each unsupported/unread URL once, with the watcher's own fetcher and extractor, and re-test its pieces."""
    import concurrent.futures as cf
    sys.path.insert(0, str(HERE))
    import watch  # noqa: WPS433  (the watcher's fetch + PDF/HTML text extraction)

    todo = sorted({r["url"] for r in results if r["status"] in ("unsupported", "partly", "unread")})

    def read(url: str):
        f = watch.fetch(url, timeout=40)
        if not f.ok:
            return url, None, f.error or f"HTTP {f.status}"
        try:
            return url, norm(watch.extract({"url": url}, f).text), None
        except Exception as e:  # noqa: BLE001
            return url, None, f"extract failed: {e}"[:120]

    with cf.ThreadPoolExecutor(max_workers=10) as pool:
        live = {u: (t, e) for u, t, e in pool.map(read, todo)}
    for r in results:
        if r["status"] not in ("unsupported", "partly", "unread"):
            continue
        text, err = live[r["url"]]
        r["liveError"] = err
        if text is None:
            r["liveStatus"] = "unreachable"
            continue
        hits = [p for p in r["pieces"] if p in text]
        r["liveFound"] = len(hits)
        r["liveStatus"] = "supported" if len(hits) == len(r["pieces"]) else ("partly" if hits else "unsupported")
        r["liveMissing"] = [p for p in r["pieces"] if p not in text]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="comma-separated jurisdiction prefixes, e.g. MN,US")
    ap.add_argument("--json", help="write the full result here")
    ap.add_argument("--live", action="store_true",
                    help="re-read from the source itself any citation the stored snapshot does not support, or that has no snapshot")
    args = ap.parse_args()
    only = {s.strip().upper() for s in args.only.split(",")} if args.only else None

    by_url = snapshots()
    results = []
    for f in sorted(DATA.rglob("*.json")):
        rel = f.relative_to(DATA).as_posix()
        code = f.name[:2].upper() if re.match(r"[A-Z]{2}-", f.name) else "US"
        if only and code not in only:
            continue
        try:
            doc = json.loads(f.read_text(encoding="utf8"))
        except ValueError:
            continue
        for c in citations(doc, rel):
            if not c["pieces"] and not c["loose"]:
                continue
            c["strict"] = bool(c["pieces"])
            if not c["strict"]:
                c["pieces"] = c.pop("loose")
            else:
                c.pop("loose", None)
            snap = by_url.get(c["url"])
            if not snap:
                c["status"] = "unread"
                c["found"] = 0
            else:
                text = text_for(snap)
                hits = [p for p in c["pieces"] if p in text]
                c["found"] = len(hits)
                c["status"] = "supported" if len(hits) == len(c["pieces"]) else ("partly" if hits else "unsupported")
                c["missing"] = [p for p in c["pieces"] if p not in text]
            results.append(c)

    if args.live:
        live_recheck(results)

    for label, group in (("verbatim", [r for r in results if r["strict"]]), ("summary (loose)", [r for r in results if not r["strict"]])):
        counts = Counter(r["status"] for r in group)
        print(f"{label}: {len(group)} citations: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
        if args.live:
            lc = Counter(r.get("liveStatus") for r in group if r.get("liveStatus"))
            print("   re-read live: " + ", ".join(f"{k} {v}" for k, v in sorted(lc.items())))
    if args.json:
        Path(args.json).write_text(json.dumps(results, indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
