#!/usr/bin/env python3
"""The harvester entrypoint.

    python harvester/audit.py                # scan repo + probe every cited source
    python harvester/audit.py --no-network   # repo scan only (deterministic, offline)
    python harvester/audit.py --strict       # exit 1 if any source is CONFIRMED changed

Scans the committed data tree, probes every official source URL it cites, and
uses a two-run debounce to report only CONFIRMED changes (content that appeared
on two consecutive runs). Writes harvester/report.md and, in GitHub Actions, the
job summary. Exits 0 even when sources are unreachable or changed — those are
findings, not failures. Only --strict turns a confirmed change into exit 1.
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from collect import scan_repo          # noqa: E402
from probe import probe_all            # noqa: E402
from baseline import classify, fold, load_baseline, save_baseline, now_iso  # noqa: E402

ROOT = os.getcwd()
ARGS = set(sys.argv[1:])
NO_NETWORK = "--no-network" in ARGS
STRICT = "--strict" in ARGS
DATA_DIR = os.environ.get("HARVEST_DATA_DIR", os.path.join(ROOT, "data"))
BASELINE_PATH = os.environ.get("HARVEST_BASELINE", os.path.join(ROOT, "harvester", "baseline.json"))
REPORT_PATH = os.environ.get("HARVEST_REPORT", os.path.join(ROOT, "harvester", "report.md"))
STALE_DAYS = int(os.environ.get("HARVEST_STALE_DAYS", "400"))


def _days_since(iso: str | None) -> int | None:
    if not iso:
        return None
    from datetime import datetime, timezone
    try:
        d = datetime.fromisoformat(iso[:10]).replace(tzinfo=timezone.utc)
        return (datetime.now(timezone.utc) - d).days
    except ValueError:
        return None


def _clip(s: str | None, n: int = 90) -> str:
    if not s:
        return ""
    return s if len(s) <= n else s[: n - 1] + "…"


def build_report(rows, files_scanned, parse_errors, stale) -> str:
    def count(v):
        return sum(1 for r in rows if r["verdict"] == v)

    changed = [r for r in rows if r["verdict"] == "changed"]
    pending = [r for r in rows if r["verdict"] == "pending"]
    unreachable = [r for r in rows if r["verdict"] == "unreachable"]
    when = now_iso()[:16].replace("T", " ")
    L = [
        "# \U0001F33E Omnia data harvester",
        "",
        f"_Run {when} UTC · {files_scanned} data files · {len(rows)} cited sources_",
        "",
        "| | count |", "|---|--:|",
        f"| ⚠️ changed (confirmed) | {count('changed')} |",
        f"| \U0001F195 new | {count('new')} |",
        f"| ✅ unchanged | {count('unchanged')} |",
        f"| \U0001F440 pending (candidate, watching for a 2nd sighting) | {count('pending')} |",
        f"| \U0001F50C unreachable | {count('unreachable')} |",
        f"| \U0001F4C4 JSON parse errors | {len(parse_errors)} |",
        f"| \U0001F570️ stale (>{STALE_DAYS}d) | {len(stale)} |",
        "",
    ]
    if changed:
        L += ["## ⚠️ Sources CONFIRMED changed since last run", "",
              "Content differs from the baseline and held steady across two consecutive runs — review whether our data needs updating.", ""]
        for r in changed:
            L += [f"- **{_clip(r['title']) or r['url']}**", f"  - {r['url']}", f"  - cited by: {', '.join(r['citedBy'])}"]
        L.append("")
    if parse_errors:
        L += ["## \U0001F4C4 JSON parse errors (fix these — the data file is broken)", ""] + [f"- {p}" for p in parse_errors] + [""]
    if pending:
        L += ["<details><summary>\U0001F440 Pending — new content seen once; reported as changed only if it repeats next run (this is how per-request churn is filtered out)</summary>", ""]
        L += [f"- {_clip(r['title']) or r['url']} ({r['url']})" for r in pending]
        L += ["", "</details>", ""]
    if unreachable:
        L += ["<details><summary>\U0001F50C Unreachable this run (not a failure — retried next run)</summary>", ""]
        L += [f"- {_clip(r['title']) or r['url']} — {r['signal'].error or 'unreachable'}" for r in unreachable]
        L += ["", "</details>", ""]
    if stale:
        L += [f"<details><summary>\U0001F570️ Data files whose freshness marker is older than {STALE_DAYS} days</summary>", ""] + [f"- {s}" for s in stale] + ["", "</details>", ""]
    L += ["---", "_A CHANGED source is confirmed across two consecutive runs, so per-request churn (counters, timestamps) never counts; a real edit is caught on the next run. The harvester never fails on unreachable sources or changes._"]
    return "\n".join(L)


def main() -> None:
    scan = scan_repo(DATA_DIR)
    parse_errors = [f"{f.path}: {f.parse_error}" for f in scan.files if not f.ok]
    stale = [f"{f.path} (asOf {f.as_of}, {_days_since(f.as_of)}d ago)"
             for f in scan.files if f.ok and f.as_of and (_days_since(f.as_of) or 0) > STALE_DAYS]

    urls = [s.url for s in scan.sources]
    if NO_NETWORK:
        from probe import Signal
        signals = [Signal(url=u, ok=False, error="network skipped (--no-network)") for u in urls]
    else:
        signals = probe_all(urls, concurrency=10, timeout=15.0, retries=1)

    baseline = load_baseline(BASELINE_PATH)
    now = now_iso()
    rows = []
    for src, sig in zip(scan.sources, signals):
        verdict = "unreachable" if NO_NETWORK else classify(baseline.get(src.url), sig)
        rows.append({"verdict": verdict, "url": src.url, "signal": sig,
                     "citedBy": src.cited_by, "title": src.title})
        if not NO_NETWORK:
            baseline[src.url] = fold(baseline.get(src.url), sig, now, verdict)

    report = build_report(rows, len(scan.files), parse_errors, stale)
    with open(REPORT_PATH, "w", encoding="utf-8") as fh:
        fh.write(report + "\n")
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        try:
            with open(summary, "a", encoding="utf-8") as fh:
                fh.write(report + "\n")
        except OSError:
            pass
    if not NO_NETWORK:
        save_baseline(BASELINE_PATH, baseline)

    def c(v):
        return sum(1 for r in rows if r["verdict"] == v)
    print(f"\n\U0001F33E Harvester: {len(scan.files)} files, {len(rows)} sources — "
          f"⚠️ {c('changed')} changed · \U0001F195 {c('new')} new · "
          f"✅ {c('unchanged')} unchanged · \U0001F440 {c('pending')} pending · "
          f"\U0001F50C {c('unreachable')} unreachable · \U0001F4C4 {len(parse_errors)} parse errors · "
          f"\U0001F570️ {len(stale)} stale")
    print(f"   report → {REPORT_PATH}")

    if STRICT and c("changed") > 0:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # never kill the workflow on an unexpected error unless --strict
        print(f"harvester: unexpected error: {e}", file=sys.stderr)
        if STRICT:
            sys.exit(1)
