#!/usr/bin/env python3
"""Builds watcher/sources.json, the list of pages the watcher checks.

Two inputs, merged and de-duplicated by URL:

1. watcher/curated.json: agency landing pages and federal publications,
   picked by hand because they're where new versions get announced.
2. Every official URL cited as a source anywhere under data/ (the documents
   the engine's numbers were actually taken from), tagged with the data
   files that use it. "Official" means a .gov / .us / .mil host or one of
   the few official hosts on other domains listed in OFFICIAL_HOSTS.

3. watcher/scope.json then drops every source for a jurisdiction listed under
   "excluded": the watcher is for unscheduled changes, and states whose rates
   only move on January 1 or a July 1 step don't need a daily watch. The data
   files and curated.json are untouched; delete a line from "excluded" and
   re-run to bring a jurisdiction back.

Re-run after adding sources to data/ or curated.json or editing scope.json:

    python watcher/build_sources.py
"""

from __future__ import annotations

import hashlib
import json
import re
import sys
import urllib.parse
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DATA = REPO / "data"
OFFICIAL_HOSTS = {"denvergov.org", "www.denvergov.org"}
# Hosts that reject automated requests outright. Checking them every day
# only produces noise; the curated list covers them another way or the gap
# is accepted.
SKIP_HOSTS: set[str] = set()
SCOPE_FILE = HERE / "scope.json"
STATE_CODES = set("AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV "
                  "NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY".split())


def is_official(url: str) -> bool:
    host = urllib.parse.urlsplit(url).netloc.lower().split(":")[0]
    if host in SKIP_HOSTS:
        return False
    return bool(re.search(r"\.(gov|us|mil)$", host)) or host in OFFICIAL_HOSTS


def jurisdiction_for(path: Path) -> str:
    rel = path.relative_to(DATA)
    if rel.parts[0] == "federal":
        return "US"
    m = re.match(r"([A-Z]{2})-", path.name)
    if m:
        return m.group(1)
    if path.name.startswith("federal"):
        return "US"
    return "US"


def source_id(jurisdiction: str, url: str) -> str:
    return f"{jurisdiction.lower()}-{hashlib.sha1(url.encode()).hexdigest()[:10]}"


def load_scope() -> dict:
    """watcher/scope.json: {"excluded": {"XX": reason, ...}}. A missing file means everything is in scope."""
    try:
        scope = json.loads(SCOPE_FILE.read_text())
    except (OSError, ValueError):
        return {"keep": {}, "excluded": {}}
    both = set(scope.get("keep", {})) & set(scope.get("excluded", {}))
    if both:
        raise SystemExit(f"scope.json lists {sorted(both)} under both keep and excluded")
    return scope


def cited_sources() -> dict[str, dict]:
    found: dict[str, dict] = {}

    def walk(node, file: Path, title_hint: str | None, juris: str | None = None):
        if isinstance(node, dict):
            title = node.get("title") if isinstance(node.get("title"), str) else title_hint
            for key, value in node.items():
                if key == "url" and isinstance(value, str) and value.startswith("http"):
                    url = value.strip()
                    if not is_official(url):
                        continue
                    entry = found.setdefault(url, {"jurisdiction": juris or jurisdiction_for(file), "title": title,
                                                   "url": url, "used_by": []})
                    rel = str(file.relative_to(REPO))
                    if rel not in entry["used_by"]:
                        entry["used_by"].append(rel)
                    if not entry.get("title") and title:
                        entry["title"] = title
                else:
                    # A state code as a key ("TX": {...}) says whose statute the
                    # cites beneath it are, e.g. garnishment overrides in a
                    # file that isn't itself named for one state.
                    walk(value, file, title, key if key in STATE_CODES else juris)
        elif isinstance(node, list):
            for item in node:
                walk(item, file, title_hint, juris)

    for file in sorted(DATA.rglob("*.json")):
        try:
            walk(json.loads(file.read_text()), file, None)
        except json.JSONDecodeError as e:
            print(f"skipping {file}: {e}", file=sys.stderr)
    return found


def main() -> int:
    curated = json.loads((HERE / "curated.json").read_text())["sources"]
    cited = cited_sources()
    merged: dict[str, dict] = {}
    replaced: dict[str, str] = {}  # blocked page -> the official API that stands in for it
    for s in curated:
        merged[s["url"]] = {**s, "origin": "curated"}
        for old in s.get("replaces", []):
            replaced[old] = s["url"]
    for url, s in cited.items():
        if url in replaced:
            stand_in = merged[replaced[url]]
            stand_in["used_by"] = sorted(set(stand_in.get("used_by", [])) | set(s["used_by"]))
            continue
        if url in merged:
            merged[url]["used_by"] = s["used_by"]
        else:
            merged[url] = {**s, "origin": "data"}
    out = []
    for url in replaced:
        merged.pop(url, None)
    for s in merged.values():
        s["id"] = source_id(s["jurisdiction"], s["url"])
        s.setdefault("title", None)
        out.append({k: s[k] for k in ("id", "jurisdiction", "title", "url", "kind", "origin", "used_by", "ignore",
                                      "contains", "drop_json_keys", "replaces", "keep", "follow", "follow_limit", "critical",
                                      "reconcile", "directory") if s.get(k) or k == "follow" and s.get(k) is False})
    excluded = set(load_scope().get("excluded", {}))
    dropped = [s for s in out if s["jurisdiction"] in excluded]
    out = [s for s in out if s["jurisdiction"] not in excluded]
    out.sort(key=lambda s: (s["jurisdiction"] != "US", s["jurisdiction"], s.get("title") or "", s["url"]))
    (HERE / "sources.json").write_text(json.dumps({
        "$comment": "Generated by watcher/build_sources.py from watcher/curated.json and the source URLs cited in data/. "
                    "Edit those, not this file. Optional per-source keys: 'kind': 'index' (also report added/removed "
                    "same-site links), 'ignore': [regex, ...] (drop matching lines), 'contains': 'start...end' "
                    "(only compare that stretch of the page), 'drop_json_keys': [key, ...] (volatile JSON fields), 'keep': [regex, ...] (compare only matching lines and links), 'replaces': [url, ...] (a blocked page this official API stands in for), 'follow': true/false (also read the documents this page links to; on by default for 'index' sources), 'follow_limit': N (documents read per page, default 25), 'critical': true (an official bulk file the engine's data is built from: unreadable for 3+ runs is raised as needing attention), 'reconcile': 'oh_municipal'|'oh_jedd' (compare the file row by row with data/local/, see reconcile.py), 'directory': url (the official jurisdiction directory used with reconcile).",
        "sources": out,
    }, indent=1) + "\n")
    print(f"{len(out)} sources ({sum(1 for s in out if s['origin'] == 'curated')} curated, "
          f"{sum(1 for s in out if s['origin'] == 'data')} cited in data/), "
          f"{len({s['jurisdiction'] for s in out})} jurisdictions"
          + (f"; {len(dropped)} left out by scope.json ({len(excluded)} jurisdictions excluded)" if excluded else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
