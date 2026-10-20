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
import os
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


def finding(kind: str, severity: str, source: dict, name: str, detail: str, code: str = "", change: dict | None = None) -> dict:
    out = {"kind": kind, "severity": severity, "source_id": source.get("id", ""), "jurisdiction": source.get("jurisdiction", ""),
           "code": code, "name": name, "detail": detail}
    if change:
        # A machine-readable description of the value the official file
        # disagrees with. autoupdate.py is the only consumer, and it treats
        # this as a claim to be re-checked, never as an instruction.
        out["change"] = change
    return out


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
                               + (" (acknowledged in the data file's own note)" if acknowledged else ""), code,
                               change={"file": f"data/local/{path.name}", "id_key": "municode", "id": code, "key": "rate",
                                       "old": ours, "new": r["rate"], "effective_from": _iso(r["start"]),
                                       "source_url": source.get("url", "")}))

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
                               f"the engine would use {ours * 100:.3f}%", r["code"],
                               change={"file": f"data/local/{year_file.name}", "id_key": "municode", "id": r["code"],
                                       "key": "rate", "old": ours, "new": r["rate"], "effective_from": _iso(r["start"]),
                                       "source_url": source.get("url", "")}))

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
                               f"official {r['rate'] * 100:.3f}% vs engine {engine_rate(z, today) * 100:.3f}%", r["id"],
                               change={"file": f"data/local/{path.name}", "id_key": "jeddId", "id": r["id"], "key": "rate",
                                       "old": engine_rate(z, today), "new": round(r["rate"], 6), "effective_from": _iso(r["start"]),
                                       "derived": [{"key": "rateSourceRaw", "relation": "percent_string"}],
                                       "source_url": source.get("url", "")}))
    return out



# --------------------------------------------------------------------------
# Indiana county income tax (Departmental Notice #1, a PDF table)
# --------------------------------------------------------------------------

def reconcile_in_counties(text: str, source: dict, today: str, repo: Path = REPO, directory: dict | None = None) -> list[dict]:
    """Departmental Notice #1 lists all 92 counties' rates "Effective <date>".
    Counties change on January 1 and October 1, and the engine records those as
    dated rows (rateChanges), which is a structural edit; so this reports a
    disagreement for a person and proposes no one-line change."""
    rows = {}
    for m in re.finditer(r"^([A-Za-z.' ]+?) (\d{2}) (\d\.\d+|0)\*?[ \t]*$", text, re.M):
        rows[m.group(2)] = (m.group(1).strip(), float(m.group(3)))
    eff = re.search(r"Indiana County Tax Rates: Effective ([A-Z][a-z]+)\.? (\d{1,2}), (\d{4})", text)
    if len(rows) != 92 or not eff:
        return [finding("unreadable", "action", source, "Indiana county rate table",
                        f"parsed {len(rows)} county rows (expected 92) and {'a' if eff else 'no'} effective date; the notice's format may have changed.")]
    months = {m: i for i, m in enumerate(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], 1)}
    on = f"{eff.group(3)}-{months[eff.group(1)[:3]]:02d}-{int(eff.group(2)):02d}"
    path = repo / "data" / "local" / f"IN-counties-{on[:4]}.json"
    data = _load(path)
    if data is None:
        return [finding("no_engine_file", "action", source, path.name, f"{path.name} not found; nothing to compare with")]
    out = []
    for c in data["counties"]:
        row = rows.get(c["countyCode"])
        if row is None:
            continue
        dated = [r for r in c.get("rateChanges", []) if r["on"] <= on]
        ours = dated[-1]["rate"] if dated else c["rate"]
        if abs(ours - row[1]) > 1e-9:
            f = finding("rate_differs", "action", source, c["name"],
                        f"the notice (effective {on}) lists {row[1]} vs the engine's {ours} as of that date", c["countyCode"])
            if on == f"{on[:4]}-01-01" and not c.get("rateChanges"):
                # A January 1 table states the county's rate for the whole year: a one-line correction.
                f["change"] = {"file": f"data/local/{path.name}", "id_key": "countyCode", "id": c["countyCode"], "key": "rate",
                               "old": ours, "new": round(row[1], 6), "effective_from": on, "source_url": source.get("url", "")}
            else:
                f["detail"] += "; county rate changes in mid-year are dated rows in the data, so a person adds the row"
            out.append(f)
    return out


# --------------------------------------------------------------------------
# helpers for HTML pages and ASP.NET downloads
# --------------------------------------------------------------------------

def _html_text(html: str) -> str:
    import html as _html  # noqa: PLC0415
    html = re.sub(r"(?is)<(script|style)\b.*?</\1>", " ", html)
    return re.sub(r"\s+", " ", _html.unescape(re.sub(r"<[^>]+>", " ", html))).strip()


def post_form(url: str, fields: dict[str, str], timeout: float = 90) -> bytes:
    """POST a form and return the body. A module-level function so tests can replace it."""
    import urllib.parse  # noqa: PLC0415
    import urllib.request  # noqa: PLC0415
    import watch  # noqa: PLC0415 - for the same identifying user agent as every other fetch
    req = urllib.request.Request(url, data=urllib.parse.urlencode(fields).encode(), headers={
        "User-Agent": watch.USER_AGENT, "Content-Type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.read(50 * 1024 * 1024)


def _aspnet_button(page_html: str, url: str, button: str, value: str) -> bytes:
    """Presses a submit button on an ASP.NET page the way a browser does: read
    the hidden state fields, post them back with the button."""
    import html as _html  # noqa: PLC0415
    fields = {}
    for name in ("__EVENTTARGET", "__EVENTARGUMENT", "__LASTFOCUS", "__VIEWSTATE", "__VIEWSTATEGENERATOR", "__EVENTVALIDATION"):
        m = re.search(r'name="%s"[^>]*value="([^"]*)"' % re.escape(name), page_html)
        fields[name] = _html.unescape(m.group(1)) if m else ""
    fields[button] = value
    return post_form(url, fields)


# --------------------------------------------------------------------------
# Kentucky occupational license taxes (Secretary of State, KRS 67.766)
# --------------------------------------------------------------------------

def _us_date(s: str) -> str:
    m = re.fullmatch(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})\s*", str(s or ""))
    return f"{m.group(3)}-{int(m.group(1)):02d}-{int(m.group(2)):02d}" if m else ""


def _name_key(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(s).lower()).strip()


def reconcile_ky_districts(body: bytes, source: dict, today: str, repo: Path = REPO, directory: dict | None = None) -> list[dict]:
    """The Secretary of State's spreadsheet of every occupational-tax district
    (what its web form calls "Excel spreadsheet of all Occupational License Tax
    Districts"). Each row carries the date the district last changed its entry.
    The data was scraped from the same database on `scrapedOn`, so a row
    updated after that date, or a district the data lacks, is exactly what a
    person needs to look at. Rates here are free text ("2.375% eff. 1/1/2026",
    "$75 flat"), so this reports and never proposes a one-line change."""
    try:
        import xlrd  # noqa: PLC0415
        with open(os.devnull, "w") as quiet:
            sheet = xlrd.open_workbook(file_contents=body, logfile=quiet).sheet_by_index(0)
        header = [str(sheet.cell_value(0, c)).strip() for c in range(sheet.ncols)]
        rows = [{header[c]: sheet.cell_value(r, c) for c in range(sheet.ncols)} for r in range(1, sheet.nrows)]
        assert "Tax District Name" in header and "Last Updated" in header
    except Exception:  # noqa: BLE001
        rows = []
    if len(rows) < 150:
        return [finding("unreadable", "action", source, "Kentucky occupational tax district spreadsheet",
                        f"read {len(rows)} districts, expected about 230; the download may have changed.")]
    path = repo / "data" / "local" / f"KY-occupational-{today[:4]}.json"
    data = _load(path)
    if data is None:
        return [finding("no_engine_file", "action", source, path.name, f"{path.name} not found; nothing to compare with")]
    j = data["jurisdictions"]
    scraped_on = j.get("scrapedOn", "")
    known = {_name_key(x["name"]) for x in j.get("scraped", [])} | {"louisville metro jefferson county", "lexington fayette urban county government"}
    out = []
    for r in rows:
        name = str(r["Tax District Name"]).strip()
        last = max([d for d in (_us_date(r.get("Last Updated")), _us_date(r.get("Change Date")), _us_date(r.get("Date Entered"))) if d] or [""])
        detail = (f"rate '{r.get('Tax Rate', '')}'" + (f", {r['Net Profits']}" if r.get("Net Profits") else "")
                  + (f", minimum {r['Min Tax']}" if r.get("Min Tax") else "") + (f", cap {r['Cap']}" if r.get("Cap") else ""))
        if _name_key(name) not in known:
            out.append(finding("missing_from_engine", "action", source, name,
                               f"the Secretary of State lists this district (entered {_us_date(r.get('Date Entered')) or 'unknown'}; {detail}) but {path.name} does not", str(r.get("Tax District ID", ""))))
        elif scraped_on and last > scraped_on:
            out.append(finding("record_changed", "action", source, name,
                               f"the Secretary of State's record changed {last}, after the data was scraped on {scraped_on} ({detail}); re-read the ordinance",
                               str(r.get("Tax District ID", ""))))
    return out


# --------------------------------------------------------------------------
# Michigan city income taxes (two pages: the Treasury's list, Grand Rapids' rate table)
# --------------------------------------------------------------------------

def _number_word(word: str) -> int | None:
    units = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
             "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
    tens = {"twenty": 20, "thirty": 30, "forty": 40}
    w = word.lower().strip()
    if w in units:
        return units.index(w)
    head, _, tail = w.partition("-")
    if head in tens and (not tail or tail in units[1:10]):
        return tens[head] + (units.index(tail) if tail else 0)
    return None


def reconcile_mi_city_list(html: str, source: dict, today: str, repo: Path = REPO, directory: dict | None = None) -> list[dict]:
    """The Treasury's page naming every Michigan city with an income tax. The
    data must hold exactly those cities (plus Detroit, which Treasury
    administers); a name nobody recognises is a new city."""
    text = _html_text(html)
    m = re.search(r"These Michigan cities administer their own taxes.*?taxpayer support\.(.*?)Follow us", text)
    count = re.search(r"(\w+(?:-\w+)?) Michigan cities levy", text)
    data = _load(repo / "data" / "local" / f"MI-cities-{today[:4]}.json")
    if not m or data is None:
        return [finding("unreadable", "action", source, "Michigan city list", "could not find the list of cities on the Treasury page; its layout may have changed.")]
    listed = m.group(1)
    names = [c["name"] for c in data["cities"]]
    rest = listed
    out = []
    for n in sorted(names, key=len, reverse=True):
        if n in rest:
            rest = rest.replace(n, " ", 1)
        elif n in text:
            continue  # named elsewhere on the page (Detroit, which Treasury administers itself)
        else:
            out.append(finding("not_in_official_file", "action", source, n, "the data has this city but the Treasury's list of cities does not"))
    leftover = rest.strip()
    if leftover:
        out.append(finding("missing_from_engine", "action", source, leftover, f"the Treasury's list names {leftover!r}, which the data does not have"))
    stated = _number_word(count.group(1)) if count else None
    if stated is not None and stated != len(names):
        out.append(finding("count_differs", "action", source, "Michigan city count", f"the Treasury says {count.group(1)} cities; the data has {len(names)}"))
    return out


def reconcile_mi_city_rates(html: str, source: dict, today: str, repo: Path = REPO, directory: dict | None = None) -> list[dict]:
    """Grand Rapids' consolidated table of the other Michigan cities' resident
    and nonresident rates and exemptions. A secondary source (it was once wrong
    about Saginaw), so this reports a difference for a person to check against
    the city's own page; it never proposes an edit."""
    text = _html_text(html)
    data = _load(repo / "data" / "local" / f"MI-cities-{today[:4]}.json")
    if data is None:
        return [finding("no_engine_file", "action", source, "MI-cities", "data file not found; nothing to compare with")]
    out, seen = [], 0
    for c in data["cities"]:
        m = re.search(re.escape(c["name"]) + r" Effective Date of Ordinance.*?Exemption Amount ([\d,]+) .*?Resident Rate ([\d.]+)% Non-Resident Rate ([\d.]+)%", text)
        if not m:
            continue
        seen += 1
        ex, res, non = int(m.group(1).replace(",", "")), round(float(m.group(2)) / 100, 6), round(float(m.group(3)) / 100, 6)
        diffs = []
        if abs(c["residentRate"] - res) > 1e-9:
            diffs.append(f"resident rate table {res} vs data {c['residentRate']}")
        if abs(c["nonresidentRate"] - non) > 1e-9:
            diffs.append(f"nonresident rate table {non} vs data {c['nonresidentRate']}")
        if c["exemptionAmount"] != ex:
            diffs.append(f"exemption table {ex} vs data {c['exemptionAmount']}")
        if diffs:
            note = c.get("sourceNote", "")
            known = "Grand Rapids" in note and any(w in note for w in ("WRONG", "INCORRECT", "Corrected"))
            out.append(finding("rate_differs", "info" if known else "action", source, c["name"],
                               "; ".join(diffs) + (" (the data's own note records that this table is wrong for this city)" if known else "; check the city's own page"),
                               ))
    if seen < len(data["cities"]) * 0.75:
        return [finding("unreadable", "action", source, "Michigan city rate table", f"found {seen} of {len(data['cities'])} cities in the table; its layout may have changed.")]
    return out


# --------------------------------------------------------------------------
# Alabama municipal occupational taxes (League of Municipalities survey list)
# --------------------------------------------------------------------------

def reconcile_al_league(html: str, source: dict, today: str, repo: Path = REPO, directory: dict | None = None) -> list[dict]:
    """The League's list of municipal occupational tax rates ("given to the
    League by survey", no dates). Compared city by city with the data; a
    difference is reported for a person to check with the city, never applied,
    because the page gives no effective date."""
    m = re.search(r'<div id="OccupationalTax">(.*?)(?:<footer|Copyright)', html, re.S)
    body = _html_text(m.group(1)).split("appropriate entity for updates.")[-1] if m else ""
    items = re.findall(r"([A-Z][A-Za-z .'-]+?)\s+(\d+(?:\.\d+)?)%", body)
    data = _load(repo / "data" / "local" / f"AL-municipalities-{today[:4]}.json")
    if len(items) < 15 or data is None:
        return [finding("unreadable", "action", source, "Alabama League occupational tax list",
                        f"found {len(items)} cities, expected about 25; the page's layout may have changed.")]
    ours = {_name_key(x["name"]): x for x in data["municipalities"]}
    out = []
    for name, rate in items:
        x = ours.get(_name_key(name))
        r = round(float(rate) / 100, 6)
        if x is None:
            out.append(finding("missing_from_engine", "action", source, name.strip(), f"the League lists {name.strip()} at {rate}%, which the data does not have"))
            continue
        end = x["rate"]
        for h in x.get("rateHistory", []):
            end = h.get("rate", end)
        if abs(end - r) > 1e-9:
            tier = x.get("confirmation", {}).get("tier", "")
            # The League's list is the data's own source only for "league_survey_only" cities;
            # elsewhere the data was confirmed against the city's own document and the survey is the stale party.
            f = finding("rate_differs", "action" if tier == "league_survey_only" else "info", source, x["name"],
                        f"the League's survey list says {rate}%; the data has {end * 100:g}%"
                        + ("; ask the city" if tier == "league_survey_only" else f" (confirmed from the city's own document: tier {tier})"))
            out.append(f)
    return out


# --------------------------------------------------------------------------
# Pennsylvania local earned-income and local-services taxes (DCED register)
# --------------------------------------------------------------------------

PA_COLUMNS = {
    "year": "Reporting Year", "nonres": "Municipal Nonresident EIT (percent)", "nonres_on": "Municipal Nonresident EIT Effective Date",
    "res": "Municipal Resident EIT (percent)", "res_on": "Municipal Resident EIT Effective Date",
    "sd": "School District EIT (percent)", "sd_on": "School District EIT Effective Date",
    "total": "Total Resident Income Tax (percent)", "lst_m": "Municipal LST (dollars)", "lst_m_on": "Municipal LST Effective Date",
    "lst_sd": "School District LST (dollars)", "lst_sd_on": "School District LST Effective Date", "lst_total": "Total LST (dollars)",
    "psd": "PSD Code",
}


def _pa_rows(body: bytes) -> list[dict] | None:
    """The register's rows as dicts keyed by PA_COLUMNS, or None if the file
    is not the register (wrong format, missing columns)."""
    try:
        import xlrd  # noqa: PLC0415
        with open(os.devnull, "w") as quiet:
            book = xlrd.open_workbook(file_contents=body, logfile=quiet)
        sheet = book.sheet_by_index(0)
    except Exception:  # noqa: BLE001
        return None
    header = None
    for r in range(min(4, sheet.nrows)):
        cells = [str(sheet.cell_value(r, c)).strip() for c in range(sheet.ncols)]
        if PA_COLUMNS["psd"] in cells and PA_COLUMNS["res"] in cells:
            header, first = {name: cells.index(label) for name, label in PA_COLUMNS.items() if label in cells}, r + 1
            break
    if header is None or len(header) < len(PA_COLUMNS):
        return None
    rows = []
    for r in range(first, sheet.nrows):
        row = {k: sheet.cell_value(r, c) for k, c in header.items()}
        if str(row["psd"]).strip():
            rows.append(row)
    return rows


def _pct(x) -> float:
    return round(float(x or 0) / 100, 6)


def reconcile_pa_local(body: bytes, source: dict, today: str, repo: Path = REPO, directory: dict | None = None) -> list[dict]:
    """Compares DCED's statewide register with data/local/PA-EIT-LST-<year>.json,
    entry by entry (PSD code). The register lists each rate with the date it
    took effect, which is what lets a clean one-entry correction be applied
    automatically: the official date must equal the one the data already
    records and fall on or before January 1. Anything else (a new mid-year
    rate, no date, a note on the entry) is reported for a person."""
    m = re.search(r";(\d{4})$", source.get("url", ""))
    rows = _pa_rows(body) if isinstance(body, (bytes, bytearray)) else None
    if rows is None or len(rows) < 2000 or not m:
        return [finding("unreadable", "action", source, "Pennsylvania local tax register",
                        f"could not read the DCED register ({'not a spreadsheet with the expected columns' if rows is None else str(len(rows)) + ' rows, expected about 2,600'}); its format may have changed.")]
    year = m.group(1)
    populated = sum(1 for r in rows if r["res"] or r["nonres"] or r["sd"])
    if populated < len(rows) * 0.5:
        # DCED lists every municipality for a coming year before it has filled in a single rate.
        return [finding("not_yet_published", "info", source, f"Pennsylvania register {year}",
                        f"only {populated} of {len(rows)} rows carry a rate, so the {year} register is not published yet; nothing to compare")]
    if any(str(r["year"]).strip() != year for r in rows):
        return [finding("unreadable", "action", source, "Pennsylvania local tax register", f"rows are not all for reporting year {year}")]
    path = repo / "data" / "local" / f"PA-EIT-LST-{year}.json"
    data = _load(path)
    if data is None:
        return [finding("no_engine_file", "action", source, path.name, f"{path.name} not found; nothing to compare with")]
    entries = data["jurisdictions"]
    count_data: dict[str, int] = {}
    for e in entries:
        count_data[e["psdCode"]] = count_data.get(e["psdCode"], 0) + 1
    count_reg: dict[str, int] = {}
    for r in rows:
        count_reg[str(r["psd"]).strip()] = count_reg.get(str(r["psd"]).strip(), 0) + 1
    index = {e["psdCode"]: i for i, e in enumerate(entries)}
    jan1 = f"{year}-01-01"

    def iso(us: str) -> str:
        mm = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", us or "")
        return f"{mm.group(3)}-{mm.group(1)}-{mm.group(2)}" if mm else ""

    out = []
    for r in rows:
        psd = str(r["psd"]).strip()
        if psd not in index:
            out.append(finding("missing_from_engine", "action", source, f'{psd} (register only)', f"in the register but not in {path.name}", psd))
            continue
        e = entries[index[psd]]
        end = dict(e)
        for c in e.get("rateChanges", []):  # the register shows the latest rate, with its date
            end.update(c.get("set", {}))
        lst_end = end.get("lst") or {}
        want = {"residentEIT": _pct(r["res"]), "nonresidentEIT": _pct(r["nonres"]), "schoolDistrictEIT": _pct(r["sd"]),
                "totalResidentEIT": _pct(r["total"])}
        diffs = {k: (end.get(k), v) for k, v in want.items() if abs((end.get(k) or 0) - v) > 1e-9}
        lst_want = {"municipal": float(r["lst_m"] or 0), "schoolDistrict": float(r["lst_sd"] or 0), "total": float(r["lst_total"] or 0)}
        lst_diffs = {k: (lst_end.get(k), v) for k, v in lst_want.items() if abs((lst_end.get(k) or 0) - v) > 1e-9} if lst_end else (
            {k: (None, v) for k, v in lst_want.items() if v} if any(lst_want.values()) else {})
        if not diffs and not lst_diffs:
            continue
        what = "; ".join([f"{k} official {v[1]:g} vs engine {v[0]}" for k, v in {**diffs, **{'lst.' + k: v for k, v in lst_diffs.items()}}.items()])
        acknowledged = any(k in e for k in ACKNOWLEDGED_KEYS + ("$note", "yearNotes", "rateChanges"))
        f = finding("rate_differs", "info" if acknowledged else "action", source, f"{e['municipality'].title()} ({e['county'].title()})",
                    what + (" (the entry carries its own note or dated changes)" if acknowledged else ""), psd)
        if acknowledged or count_data[psd] != 1 or count_reg[psd] != 1:
            if count_data[psd] != 1 or count_reg[psd] != 1:
                f["detail"] += " (PSD code appears more than once, so no single line can be named)"
            out.append(f)
            continue
        # A clean correction: every changed field's official date is the date the
        # data already records, on or before January 1.
        base = ["jurisdictions", index[psd]]
        edits, companions, ok = [], [], True
        res_sd_changed = False
        for key, on_key, data_on in (("residentEIT", "res_on", "residentEITEffective"), ("nonresidentEIT", "nonres_on", "nonresidentEITEffective"),
                                      ("schoolDistrictEIT", "sd_on", "schoolDistrictEITEffective")):
            if key in diffs:
                date = str(r[on_key]).strip()
                if not date or iso(date) > jan1 or e.get(data_on) != date or e.get(key) is None:
                    ok = False
                    break
                edits.append({"path": base + [key], "new": want[key], "relation": None})
                companions.append({"path": base + [data_on], "value": date})
                res_sd_changed = res_sd_changed or key in ("residentEIT", "schoolDistrictEIT")
        if ok and ("totalResidentEIT" in diffs or res_sd_changed):
            if abs(want["totalResidentEIT"] - round(want["residentEIT"] + want["schoolDistrictEIT"], 6)) > 1e-9:
                ok = False  # the register's own total is not the sum of its parts
            elif not (set(diffs) - {"totalResidentEIT"}):
                ok = False  # only the total disagrees: nothing the parts explain
            else:
                edits.append({"path": base + ["totalResidentEIT"], "new": want["totalResidentEIT"],
                              "relation": {"sum": ["residentEIT", "schoolDistrictEIT"]}})
        if ok and lst_diffs:
            if not lst_end or not (set(lst_diffs) - {"total"}):
                ok = False
            else:
                for key, on_key, data_on in (("municipal", "lst_m_on", "municipalEffective"), ("schoolDistrict", "lst_sd_on", "schoolDistrictEffective")):
                    if key in lst_diffs:
                        date = str(r[on_key]).strip()
                        if not date or iso(date) > jan1 or lst_end.get(data_on) != date or e.get("rateChanges"):
                            ok = False
                            break
                        edits.append({"path": base + ["lst", key], "new": lst_want[key], "relation": None})
                        companions.append({"path": base + ["lst", data_on], "value": date})
                if ok:
                    if abs(lst_want["total"] - (lst_want["municipal"] + lst_want["schoolDistrict"])) > 1e-9:
                        ok = False
                    else:
                        edits.append({"path": base + ["lst", "total"], "new": lst_want["total"],
                                      "relation": {"sum": ["municipal", "schoolDistrict"]}})
        if ok and edits:
            first = next(x for x in edits if not x["relation"])
            f["change"] = {"file": f"data/local/{path.name}", "edits": edits, "companions": companions, "new": first["new"],
                           "effective_from": jan1, "source_url": source.get("url", "")}
        out.append(f)
    return out


RECONCILERS = {"oh_municipal": reconcile_oh_municipal, "oh_jedd": reconcile_oh_jedd, "in_counties": reconcile_in_counties, "pa_local": reconcile_pa_local,
               "ky_districts": reconcile_ky_districts, "mi_city_list": reconcile_mi_city_list, "mi_city_rates": reconcile_mi_city_rates,
               "al_league": reconcile_al_league}


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
        if s.get("button"):  # a form button that returns a file (the ASP.NET "download" pattern)
            try:
                f = type("Posted", (), {"ok": True, "body": _aspnet_button(f.body.decode("utf-8", errors="replace"), s["url"], s["button"], s.get("button_value", "")), "error": ""})()
            except Exception as e:  # noqa: BLE001
                findings.append(finding("unreadable", "action", s, s.get("title") or s["url"], f"could not download the file behind the form button ({type(e).__name__}: {str(e)[:80]})"))
                continue
        directory: dict[str, str] = {}
        if s.get("directory"):
            d = fetcher(s["directory"])
            if d.ok:
                directory = parse_finder_directory(d.body.decode("utf-8", errors="replace"))
        try:
            if name in ("pa_local", "ky_districts"):
                text = f.body  # a binary spreadsheet: the reader needs the bytes
            elif s["url"].lower().split("?")[0].endswith(".pdf"):
                import watch  # noqa: PLC0415 - circular at import time, fine at call time
                text = watch.extract(s, f).text
            else:
                text = f.body.decode("utf-8", errors="replace")
            findings.extend(fn(text, s, today, repo, directory))
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
