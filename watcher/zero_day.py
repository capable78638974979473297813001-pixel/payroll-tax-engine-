"""What counts as a zero-day problem, and what to do about each kind.

A zero-day problem is a change in an official source that alters a number the
engine uses to calculate a paycheck, before the data in this repository has
caught up. It is the only kind of change the source watch is allowed to touch
the repository for. A new heading on an agency's landing page, a news item, a
reworded paragraph or a new link is **not** one: those are reported for
information and never change a file.

Three tiers, from most to least certain:

  fixed       The watcher compared an official file or a year-anchored sentence
              with a specific number in data/, found the number wrong, and
              autoupdate.py passed it through every one of its rules and
              replaced it (one commit on main, listing the file, line, old and
              new value and the source). Nothing else was touched.

  verified    The same kind of finding, but a rule held it back (a mid-year
              date, a hand-checked note, a dated row to add, too many changes
              at once). The exact file, line and value are in the report, and a
              person makes the change.

  possible    A document the engine's data cites changed, and the dollar
              amounts or percentages in it changed with it. The watcher cannot
              say which number in data/ that affects, so a person looks. A page
              that no data file cites, or that changed without any figure
              changing, never lands here.

Run after autoupdate.py in the daily workflow:

    python watcher/zero_day.py        # writes reports/zero-day-latest.{json,md}
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# Findings that name a number in data/ the official source disagrees with.
VALUE_KINDS = {"rate_differs", "scheduled_change_missing", "stated_value_differs", "missing_from_engine", "record_changed"}
# data/ locations whose numbers feed a paycheck calculation.
PAYCHECK_DATA = ("data/states/", "data/federal/", "data/local/", "data/minimum-wage/", "data/garnishment/", "data/employer-thresholds/")
# A "figure" that is only a year or a page number is not a rate or an amount.
TRIVIAL_FIGURE = re.compile(r"^\$?(?:19|20)\d{2}$")


def feeds_a_paycheck(source: dict) -> bool:
    """True if a data file that feeds a paycheck cites this source."""
    return any(u.startswith(PAYCHECK_DATA) for u in source.get("used_by", []))


def possible(change: dict, source: dict) -> list[str]:
    """The figures that make a changed page a possible zero-day problem, or []
    when it is not one: no data file cites it, it is a landing/news index, or
    nothing with a dollar amount or percentage changed."""
    if source.get("kind") == "index" or not feeds_a_paycheck(source):
        return []
    figures = [f for f in change.get("figures_added", []) + change.get("figures_removed", []) if not TRIVIAL_FIGURE.match(f)]
    return sorted(set(figures))[:20]


def classify(watch_summary: dict, autoupdate: dict, sources: list[dict]) -> dict:
    by_id = {s["id"]: s for s in sources}
    fixed = [{"file": p["file"], "name": p.get("name", ""), "edits": [(e["key"], e["old_text"], e["new_text"]) for e in p["edits"]],
              "source": p.get("evidence", {}).get("url", "")} for p in autoupdate.get("applied", [])]
    verified = []
    for r in autoupdate.get("left_for_a_person", []):
        p = r["proposal"]
        verified.append({"file": p.get("file", "?"), "name": p.get("name", ""), "why_not_automatic": r["reason"],
                         "edits": [(e.get("key"), e.get("old_text"), e.get("new_text")) for e in (p.get("edits") or [])]})
    for d in autoupdate.get("disagreements_for_a_person", []):
        verified.append({"file": "", "name": d["name"], "why_not_automatic": d["detail"], "edits": []})
    maybe = []
    informational = 0
    for c in watch_summary.get("changed", []):
        s = by_id.get(c["id"], {})
        figures = possible(c, s) if c.get("significant") else []
        if figures:
            maybe.append({"jurisdiction": c.get("jurisdiction"), "title": c.get("title"), "url": c.get("url"), "figures": figures,
                          "feeds": [u for u in s.get("used_by", []) if u.startswith(PAYCHECK_DATA)][:6]})
        else:
            informational += 1
    return {"date": watch_summary.get("date") or autoupdate.get("date", ""), "fixed": fixed, "verified": verified,
            "possible": maybe, "informational_changes": informational}


def markdown(z: dict) -> str:
    out = [f"# Zero-day problems: {z['date']}", ""]
    if not (z["fixed"] or z["verified"] or z["possible"]):
        out += ["None. A paycheck-affecting change would have been listed here.", "",
                f"{z['informational_changes']} other source change(s) were informational only (headings, links, news, wording): nothing was changed for them.", ""]
        return "\n".join(out)
    if z["fixed"]:
        out += [f"## Fixed automatically ({len(z['fixed'])})", "",
                "Each was one commit to `main` touching only the file named; `git revert` the commit to undo it.", ""]
        out += [f"- `{f['file']}`: {', '.join(f'{k} {a} -> {b}' for k, a, b in f['edits'])} ({f['name']}; source {f['source']})" for f in z["fixed"]]
        out.append("")
    if z["verified"]:
        out += [f"## Verified, needs a person ({len(z['verified'])})", "",
                "The official source disagrees with a number in `data/`, but a rule stopped the automatic fix:", ""]
        for v in z["verified"]:
            edit = "; ".join(f"{k} {a} -> {b}" for k, a, b in v["edits"])
            out.append(f"- {v['file'] or v['name']}{' (' + v['name'] + ')' if v['file'] and v['name'] else ''}: {v['why_not_automatic']}" + (f" Proposed: {edit}." if edit else ""))
        out.append("")
    if z["possible"]:
        out += [f"## Possible, a person looks ({len(z['possible'])})", "",
                "A document the data cites changed and its dollar amounts or percentages changed with it:", ""]
        for m in z["possible"]:
            out.append(f"- {m['jurisdiction']} [{m['title']}]({m['url']}): figures {', '.join(m['figures'][:10])}; feeds {', '.join('`' + f + '`' for f in m['feeds'])}")
        out.append("")
    out.append(f"{z['informational_changes']} other source change(s) were informational only and changed nothing.")
    return "\n".join(out) + "\n"


def main() -> int:
    reports = HERE / "reports"
    try:
        summary = json.loads((reports / "latest.json").read_text())
    except FileNotFoundError:
        summary = {}
    try:
        auto = json.loads((reports / "autoupdate-latest.json").read_text())
    except FileNotFoundError:
        auto = {}
    sources = json.loads((HERE / "sources.json").read_text())["sources"]
    z = classify(summary, auto, sources)
    (reports / "zero-day-latest.json").write_text(json.dumps(z, indent=1) + "\n")
    (reports / "zero-day-latest.md").write_text(markdown(z))
    print(markdown(z))
    return 0


if __name__ == "__main__":
    sys.exit(main())
