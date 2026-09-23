"""Repo side of the harvester.

Walks the committed data tree and pulls out every official source URL the data
cites (the ``url`` fields inside each file's ``sources[]``, ``source``,
``localAggregators[]``, etc.), plus a light freshness read of each file.
Nothing here touches the network, so it is fully deterministic.
"""
from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field

_HTTP = re.compile(r"^https?://\S+$", re.I)
_DATE_KEYS = ("asOf", "generatedOn", "verifiedOn", "effectiveFrom")
_ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}")


@dataclass
class CitedSource:
    url: str
    cited_by: list[str] = field(default_factory=list)
    title: str | None = None


@dataclass
class FileScan:
    path: str
    ok: bool
    parse_error: str | None = None
    as_of: str | None = None
    year: int | None = None
    url_count: int = 0


@dataclass
class RepoScan:
    files: list[FileScan]
    sources: list[CitedSource]


def list_json_files(data_dir: str) -> list[str]:
    out: list[str] = []
    for root, _dirs, files in os.walk(data_dir):
        for f in files:
            if f.endswith(".json"):
                out.append(os.path.join(root, f))
    return sorted(out)


def _walk(node, on_url, freshness: dict) -> None:
    """Recursively collect http(s) URLs (paired with a sibling title/name) and
    the newest freshness date / a year seen anywhere in the object."""
    if isinstance(node, list):
        for v in node:
            _walk(v, on_url, freshness)
        return
    if isinstance(node, dict):
        title = node.get("title") if isinstance(node.get("title"), str) else (
            node.get("name") if isinstance(node.get("name"), str) else None
        )
        for k, v in node.items():
            if isinstance(v, str) and _HTTP.match(v):
                on_url(v, title)
            elif k in _DATE_KEYS and isinstance(v, str) and _ISO_DATE.match(v):
                d = v[:10]
                if not freshness.get("date") or d > freshness["date"]:
                    freshness["date"] = d
            elif k == "year" and isinstance(v, int):
                freshness["year"] = v
            else:
                _walk(v, on_url, freshness)


def scan_repo(data_dir: str) -> RepoScan:
    files: list[FileScan] = []
    by_url: dict[str, CitedSource] = {}
    cwd = os.getcwd()

    for abs_path in list_json_files(data_dir):
        rel = os.path.relpath(abs_path, cwd)
        try:
            with open(abs_path, "r", encoding="utf-8") as fh:
                parsed = json.load(fh)
        except (json.JSONDecodeError, OSError) as e:
            files.append(FileScan(path=rel, ok=False, parse_error=str(e)[:120]))
            continue

        freshness: dict = {}
        count = {"n": 0}

        def on_url(url: str, title: str | None, _rel=rel, _count=count) -> None:
            _count["n"] += 1
            existing = by_url.get(url)
            if existing:
                if _rel not in existing.cited_by:
                    existing.cited_by.append(_rel)
                if not existing.title and title:
                    existing.title = title
            else:
                by_url[url] = CitedSource(url=url, cited_by=[_rel], title=title)

        _walk(parsed, on_url, freshness)
        files.append(FileScan(path=rel, ok=True, as_of=freshness.get("date"),
                              year=freshness.get("year"), url_count=count["n"]))

    sources = sorted(by_url.values(), key=lambda s: s.url)
    return RepoScan(files=files, sources=sources)
