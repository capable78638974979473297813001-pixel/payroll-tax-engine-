"""Reads a stated value out of an official document so autoupdate.py can check
it against the engine's data.

Most agencies publish rates as sentences in a PDF or page ("For 2026, the
state adjusted gross income tax rate for individuals is 2.95%."), not as a
file a program can diff. An extractor is one such sentence, written as a
regular expression, tied to the data lines that carry the number.

An extractor is trusted only as far as it can prove itself:

  * It must name the year it is about (`{year}` in the pattern). A document
    that says "for 2026" is stating a value for the whole of 2026, which is
    what lets a one-line edit be right for every pay date in the file. A
    sentence with no year, or about a different year, never matches.
  * It must find exactly one distinct value in the document. Two different
    numbers matching, or none, produce no finding.
  * It carries a frozen excerpt of the real sentence it was written against
    (`calibration`). The tests check the pattern still reads that excerpt as
    the recorded value, so a loosened pattern is caught before it can fire.
    `python watcher/extractors.py --refresh` rebuilds the excerpts from the
    watcher's stored snapshots and confirms the data agrees.
  * Where a second official document states the same number (`also`), every
    document must agree or nothing is proposed.

Findings come out in the same shape as reconcile.py's, so autoupdate.py judges
them by the same rules; a finding its rules refuse is reported for a person
with the exact file, line and value to change.
"""

from __future__ import annotations

import datetime as dt
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
REGISTRY = HERE / "extractors.json"


def load(path: Path = REGISTRY) -> list[dict]:
    try:
        return json.loads(path.read_text())["extractors"]
    except FileNotFoundError:
        return []


def stated_value(text: str, pattern: str, year: int, transform: str) -> tuple[float, str] | None:
    """The one value the document states for `year`, and the sentence it came
    from. None unless the pattern matches and every match agrees."""
    found: dict[float, str] = {}
    text = re.sub(r"\s+", " ", text)
    for m in re.finditer(pattern.replace("{year}", str(year)).replace("{yy}", str(year)[2:]), text):
        raw = float(m.group(1).replace(",", ""))
        value = raw / 100 if transform == "percent" else raw
        found.setdefault(round(value, 6), m.group(0))
    if len(found) != 1:
        return None
    value, sentence = next(iter(found.items()))
    return value, sentence


def short(sentence: str, keep: int = 220) -> str:
    """A sentence a pattern matched across a whole document (an edition header
    far above the figure) is quoted as its two ends, which the same pattern
    still matches: the header, then the sentence."""
    if len(sentence) <= 2 * keep + 20:
        return sentence
    return sentence[:keep] + " ... " + sentence[-keep:]


def _get(node, path):
    for p in path:
        node = node[p]
    return node


def findings(extractors: list[dict], texts: dict[str, str], sources: dict[str, dict], today: str, repo: Path = REPO) -> list[dict]:
    """One finding per (extractor, year file) where the document states a
    value that differs from a line the extractor owns. `texts` maps a source
    id to its extracted text."""
    out = []
    for x in extractors:
        anchored = x.get("year_anchored", True)
        years = (int(today[:4]), int(today[:4]) + 1) if anchored else (int(today[:4]),)
        src = sources.get(x["source_id"])
        text = texts.get(x["source_id"])
        if not src or text is None:
            continue
        for year in years:
            rel = x["file"].replace("{year}", str(year))
            path = repo / rel
            if not path.is_file():
                continue
            got = stated_value(text, x["pattern"], year, x.get("transform", ""))
            if got is None:
                continue
            value, sentence = got
            agree = True
            for other in x.get("also", []):
                o_text = texts.get(other["source_id"])
                o_got = stated_value(o_text, other["pattern"], year, other.get("transform", "")) if o_text is not None else None
                if o_got is None or abs(o_got[0] - value) > 5e-7:
                    agree = False
            if not agree:
                continue
            try:
                data = json.loads(path.read_text())
                current = [_get(data, p) for p in x["paths"]]
            except (OSError, ValueError, KeyError, IndexError, TypeError):
                continue
            if all(isinstance(c, (int, float)) and abs(c - value) < 5e-7 for c in current):
                continue
            where = ", ".join(".".join(map(str, p)) for p in x["paths"])
            finding = {
                "kind": "stated_value_differs", "severity": "action", "source_id": x["source_id"],
                "jurisdiction": src.get("jurisdiction", ""), "code": x["id"], "name": x["name"],
                "detail": f"{src.get('title') or src['url']} states {value:g} for {year if anchored else 'the current rules'}; "
                          f"{rel} has {current[0]:g} at {where}",
            }
            if anchored:
                stale = [p for p, c in zip(x["paths"], current) if not (isinstance(c, (int, float)) and abs(c - value) < 5e-7)]
                edits = [{"path": list(p), "new": value, "relation": None if i == 0 else "copy"} for i, p in enumerate(stale)]
                finding["change"] = {"file": rel, "edits": edits, "new": value, "effective_from": f"{year}-01-01",
                                     "evidence_kind": "text", "pattern": x["pattern"], "matched_text": short(sentence),
                                     "transform": x.get("transform", ""), "source_url": src["url"]}
            else:
                finding["detail"] += " (the document does not name the year, so this is for a person to apply)"
            out.append(finding)
    return out


def main(argv: list[str] | None = None) -> int:
    """Check every extractor against the watcher's stored snapshots (or text
    files in --texts DIR) and the data. --refresh rewrites each extractor's
    frozen calibration excerpt from what it just read."""
    import gzip  # noqa: PLC0415

    args = argv if argv is not None else sys.argv[1:]
    refresh = "--refresh" in args
    texts_dir = Path(args[args.index("--texts") + 1]) if "--texts" in args else None
    year = dt.date.today().year
    registry = json.loads(REGISTRY.read_text())
    bad = 0
    for x in registry["extractors"]:
        text = None
        if texts_dir and (texts_dir / f"{x['source_id']}.txt").exists():
            text = (texts_dir / f"{x['source_id']}.txt").read_text()
        else:
            snap = HERE / "state" / "snapshots" / f"{x['source_id']}.txt.gz"
            if snap.exists():
                text = gzip.open(snap, "rt").read()
        if text is None:
            print(f"?   {x['id']}: no text for {x['source_id']} yet")
            bad += 1
            continue
        got = stated_value(text, x["pattern"], year, x.get("transform", ""))
        data = json.loads((REPO / x["file"].replace("{year}", str(year))).read_text())
        have = [_get(data, p) for p in x["paths"]]
        ok = got is not None and all(abs(got[0] - h) < 5e-7 for h in have)
        for other in x.get("also", []):
            o_text = None
            if texts_dir and (texts_dir / f"{other['source_id']}.txt").exists():
                o_text = (texts_dir / f"{other['source_id']}.txt").read_text()
            elif (HERE / "state" / "snapshots" / f"{other['source_id']}.txt.gz").exists():
                o_text = gzip.open(HERE / "state" / "snapshots" / f"{other['source_id']}.txt.gz", "rt").read()
            o_got = stated_value(o_text, other["pattern"], year, other.get("transform", "")) if o_text is not None else None
            if o_got is None or got is None or abs(o_got[0] - got[0]) > 5e-7:
                ok = False
                print(f"    the second document ({other['source_id']}) does not state the same value: {o_got[0] if o_got else None}")
            elif refresh:
                other["calibration"] = {"year": year, "excerpt": short(o_got[1]), "value": o_got[0]}
        print(f"{'ok ' if ok else 'BAD'} {x['id']}: document {got[0] if got else None} data {have}")
        if ok and refresh:
            x["calibration"] = {"year": year, "excerpt": short(got[1]), "value": got[0]}
        bad += 0 if ok else 1
    if refresh:
        REGISTRY.write_text(json.dumps(registry, indent=1, ensure_ascii=False) + "\n")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
