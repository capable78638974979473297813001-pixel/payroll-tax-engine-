"""Checks the engine's local-tax data against the official bulk files it was
built from.

The page watcher answers "did this document change?". It cannot answer "is
the engine missing a jurisdiction the official file lists?", which is how a
new city tax can go unnoticed for months: nothing on any watched page changes
when a row is added to a spreadsheet nobody was diffing. This module reads the
official file in full, row by row, and compares it with data/local/.

A source opts in with `"reconcile": "<name>"` in watcher/curated.json. Each
reconciler gets the file's text and returns findings:

    action - the engine is wrong or missing something the official file has
    info   - worth knowing, no change needed (an acknowledged variance, a row
             added by hand that the official file hasn't caught up to, a blank
             Ohio municode the official directory can now fill in)

Only `action` findings count as "needs attention" in the daily report.

    python watcher/reconcile.py            # fetch the official files and print findings
"""

from __future__ import annotations

import csv
import datetime as dt
import io
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent

# Ohio's own sentinel for "no end date" in the Finder's CSVs.
OPEN_END = {"99991231", "29991231"}
# Entry keys the data files use to mark a hand-checked departure from the
# Finder (the city's own notice, an ordinance, a correction).
ACKNOWLEDGED_KEYS = ("$correctionNote", "sourceNote")
ADDED_KEY = "$addedNote"


def _norm_name(name: str) -> str:
    name = re.sub(r"\(.*?\)", "", name)  # "Oakwood (Cuyahoga)" -> "Oakwood"
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _iso(yyyymmdd: str) -> str:
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:8]}"


def finding(kind: str, severity: str, source: dict, name: str, detail: str, code: str = "") -> dict:
    return {"kind": kind, "severity": severity, "source_id": source.get("id", ""), "jurisdiction": source.get("jurisdiction", ""),
            "code": code, "name": name, "detail": detail}


def _load(path: Path):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return None


def engine_rate(entry: dict, on: str) -> float:
    """The rate the engine uses for a check dated `on` (ISO date): the
    latest rateHistory row starting on or before it, else the entry's rate."""
    dated = [h for h in entry.get("rateHistory", []) if h["from"] <= on]
    return dated[-1]["rate"] if dated else entry["rate"]


# --------------------------------------------------------------------------
# Ohio municipal income tax (The Finder, OHMuniRateTable.csv)
# --------------------------------------------------------------------------

def parse_finder_municipal(text: str) -> list[dict]:
    """Rows of OHMuniRateTable.csv: start,end,code,NAME,rate (a fraction).
    The file has no header row."""
    rows = []
    for r in csv.reader(io.StringIO(text)):
        if len(r) < 5 or not r[0].strip().isdigit():
            continue
        try:
            rows.append({"start": r[0].strip(), "end": r[1].strip(), "code": r[2].strip(), "name": r[3].strip(),
                         "rate": float(r[4])})
        except ValueError:
            continue
    return rows


def reconcile_oh_municipal(text: str, source: dict, today: str, repo: Path = REPO,
                           directory: dict | None = None) -> list[dict]:
    rows = parse_finder_municipal(text)
    if len(rows) < 500:
        # A truncated or error-page download would make every municipality
        # look "missing". Say so instead of raising false alarms.
        return [finding("unreadable", "action", source, "Ohio municipal rate file",
                        f"parsed only {len(rows)} rows; expected about 1,000. The file's format may have changed.")]
    compact = today.replace("-", "")
    path = repo / "data" / "local" / f"OH-municipalities-{today[:4]}.json"
    data = _load(path)
    if data is None:
        return [finding("no_engine_file", "action", source, path.name, f"{path.name} not found; nothing to compare with")]
    entries = data["municipalities"]
    by_code = {e["municode"]: e for e in entries if e.get("municode")}
    by_name: dict[str, list[dict]] = {}
    for e in entries:
        by_name.setdefault(_norm_name(e["name"]), []).append(e)

    # What the official file says is in force today, and what it schedules.
    current: dict[str, dict] = {}
    upcoming: list[dict] = []
    for r in rows:
        if r["start"] <= compact <= r["end"]:
            current[r["code"]] = r
        elif r["start"] > compact:
            upcoming.append(r)
    official_names = {_norm_name(r["name"]): r for r in rows}
    directory = directory or {}
    out: list[dict] = []

    for code, r in sorted(current.items()):
        entry = by_code.get(code)
        if entry is None:
            hits = [e for e in by_name.get(_norm_name(r["name"]), []) if not e.get("municode")]
            if len(hits) == 1:
                out.append(finding("backfill_municode", "info", source, hits[0]["name"],
                                   f"the official file lists it as code {code}; the engine entry has no municode", code))
                entry = hits[0]
            else:
                out.append(finding("missing_from_engine", "action", source, r["name"].title(),
                                   f"in force in the official file at {r['rate'] * 100:.3f}% from {_iso(r['start'])}, "
                                   f"but not in {path.name}", code))
                continue
        ours = engine_rate(entry, today)
        if abs(ours - r["rate"]) > 1e-9:
            acknowledged = any(k in entry for k in ACKNOWLEDGED_KEYS)
            out.append(finding("rate_differs", "info" if acknowledged else "action", source, entry["name"],
                               f"official {r['rate'] * 100:.3f}% vs engine {ours * 100:.3f}%"
                               + (" (acknowledged in the data file's own note)" if acknowledged else ""), code))

    # Rate changes the official file already schedules for later: the engine
    # should carry them too, so a January 1 increase isn't missed on the day.
    for r in sorted(upcoming, key=lambda r: (r["start"], r["code"])):
        entry = by_code.get(r["code"])
        year_file = repo / "data" / "local" / f"OH-municipalities-{r['start'][:4]}.json"
        later = _load(year_file)
        if later is not None:
            entry = next((e for e in later["municipalities"] if e.get("municode") == r["code"]), None)
        if entry is None:
            continue
        ours = engine_rate(entry, _iso(r["start"]))
        if abs(ours - r["rate"]) > 1e-9:
            out.append(finding("scheduled_change_missing", "action", source, entry["name"],
                               f"the official file schedules {r['rate'] * 100:.3f}% from {_iso(r['start'])}; "
                               f"the engine would use {ours * 100:.3f}%", r["code"]))

    # Rows the engine carries that the official file doesn't (yet). A row the
    # file schedules for later counts as present, and an engine rate of 0 as of
    # today (a tax that hasn't started) isn't a claim the file could contradict.
    scheduled = {r["code"] for r in upcoming}
    for e in entries:
        code = e.get("municode") or directory.get(_norm_name(e["name"]), "")
        in_file = (code in current) or (code in scheduled) or (_norm_name(e["name"]) in official_names and not code)
        if in_file or engine_rate(e, today) == 0:
            continue
        hand_added = ADDED_KEY in e or any(k in e for k in ACKNOWLEDGED_KEYS)
        listed = directory.get(_norm_name(e["name"]))
        detail = ("added by hand; the official rate file has no row for it yet"
                  + (f" (the Finder's directory lists it as code {listed})" if listed else ""))
        if not hand_added:
            detail = "not in force in the official rate file; the engine may be stale"
        out.append(finding("not_in_official_file", "info" if hand_added else "action", source, e["name"], detail,
                           e.get("municode", "") or listed or ""))
        if hand_added and not e.get("municode") and listed:
            out.append(finding("backfill_municode", "info", source, e["name"],
                               f"the Finder's directory lists it as code {listed}; the engine entry has no municode", listed))
    return out


def parse_finder_directory(text: str) -> dict[str, str]:
    """{normalised name: code} from api/file-downloads?type=municipality.
    Names that appear twice (Bainbridge, Shawnee Hills) are dropped: a name
    alone can't say which one is meant."""
    try:
        entities = json.loads(text)["entities"]
    except (ValueError, KeyError, TypeError):
        return {}
    seen: dict[str, set[str]] = {}
    for e in entities:
        seen.setdefault(_norm_name(e.get("name", "")), set()).add(str(e.get("code", "")))
    return {name: next(iter(codes)) for name, codes in seen.items() if len(codes) == 1 and name}


# --------------------------------------------------------------------------
# Ohio JEDD / JEDZ income tax (The Finder, JEDTaxRates.csv)
# --------------------------------------------------------------------------

def reconcile_oh_jedd(text: str, source: dict, today: str, repo: Path = REPO, directory: dict | None = None) -> list[dict]:
    rows = []
    for r in csv.reader(io.StringIO(text)):
        if len(r) >= 5 and r[0].strip().isdigit():
            try:
                rows.append({"start": r[0].strip(), "end": r[1].strip(), "id": r[2].strip(), "name": r[3].strip(),
                             "rate": float(r[4]) / 100})  # this file states percent, not a fraction
            except ValueError:
                continue
    if len(rows) < 50:
        return [finding("unreadable", "action", source, "Ohio JEDD rate file",
                        f"parsed only {len(rows)} rows; expected about 150. The file's format may have changed.")]
    path = repo / "data" / "local" / f"OH-jedd-jedz-{today[:4]}.json"
    data = _load(path)
    if data is None:
        return [finding("no_engine_file", "action", source, path.name, f"{path.name} not found; nothing to compare with")]
    compact = today.replace("-", "")
    zones = {z["jeddId"]: z for z in data["zones"]}
    out = []
    for r in rows:
        if not (r["start"] <= compact <= r["end"]):
            continue
        z = zones.get(r["id"])
        if z is None:
            out.append(finding("missing_from_engine", "action", source, r["name"].title(),
                               f"in force in the official file at {r['rate'] * 100:.3f}% but not in {path.name}", r["id"]))
        elif abs(engine_rate(z, today) - r["rate"]) > 1e-9:
            ack = any(k in z for k in ACKNOWLEDGED_KEYS)
            out.append(finding("rate_differs", "info" if ack else "action", source, z["name"],
                               f"official {r['rate'] * 100:.3f}% vs engine {engine_rate(z, today) * 100:.3f}%", r["id"]))
    return out


RECONCILERS = {"oh_municipal": reconcile_oh_municipal, "oh_jedd": reconcile_oh_jedd}


def run(sources: list[dict], fetcher, today: str, repo: Path = REPO) -> list[dict]:
    """Reconciles every source that asks for it. `fetcher(url)` returns an
    object with .ok, .body and .error (watch.fetch). A file that can't be read
    is reported as a finding rather than skipped quietly: an unreconciled
    file is exactly the gap this exists to close."""
    findings: list[dict] = []
    for s in sources:
        name = s.get("reconcile")
        if not name:
            continue
        fn = RECONCILERS.get(name)
        if fn is None:
            findings.append(finding("unknown_reconciler", "action", s, name, f"no reconciler called {name!r}"))
            continue
        f = fetcher(s["url"])
        if not f.ok:
            findings.append(finding("unreadable", "action", s, s.get("title") or s["url"],
                                    f"could not read the official file to compare with the engine's data ({f.error})"))
            continue
        directory: dict[str, str] = {}
        if s.get("directory"):
            d = fetcher(s["directory"])
            if d.ok:
                directory = parse_finder_directory(d.body.decode("utf-8", errors="replace"))
        try:
            findings.extend(fn(f.body.decode("utf-8", errors="replace"), s, today, repo, directory))
        except Exception as e:  # noqa: BLE001 - one reconciler must not sink the run
            findings.append(finding("reconcile_error", "action", s, name, f"{type(e).__name__}: {e}"[:200]))
    return findings


def main() -> int:
    import watch  # noqa: PLC0415

    sources = json.loads((HERE / "sources.json").read_text())["sources"]
    today = dt.date.today().isoformat()
    findings = run(sources, watch.fetch, today)
    for f in findings:
        print(f"[{f['severity']}] {f['kind']}: {f['name']} {f['code']} - {f['detail']}")
    print(f"{sum(1 for f in findings if f['severity'] == 'action')} need action, "
          f"{sum(1 for f in findings if f['severity'] == 'info')} informational", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
