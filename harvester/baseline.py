"""The rolling baseline + the change classifier.

The classifier's core idea is a TWO-RUN DEBOUNCE: a source is only reported
``changed`` once the new content has shown up on two consecutive runs. Real
edits stay put, so they confirm on the next run; per-request / per-timestamp
churn never repeats the same bytes twice, so it sits in ``pending`` forever and
is never reported. This is what makes the count stop drifting (20 → 24 → ...)
while still guaranteeing a genuine change is caught (one run later at worst).
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from probe import Signal

# new       – first time we ever captured this source
# unchanged – identical to the confirmed baseline
# changed   – differs from baseline AND matches last run's candidate (confirmed)
# pending   – differs from baseline, first sighting of this new content (watching)
# unreachable – could not be fetched this run
Verdict = str


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def load_baseline(path: str) -> dict:
    try:
        with open(path, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data.get("sources", {}) if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def save_baseline(path: str, sources: dict) -> None:
    ordered = {k: sources[k] for k in sorted(sources)}
    payload = {
        "$comment": "Rolling source-freshness baseline written by the harvester. "
                    "Do not hand-edit. 'hash' is the confirmed content; 'pending' "
                    "is a candidate change awaiting a second consecutive sighting.",
        "updatedAt": now_iso(),
        "sources": ordered,
    }
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(payload, indent=2) + "\n")


def classify(prev: dict | None, cur: Signal) -> Verdict:
    if not cur.ok:
        return "unreachable"
    if not prev or not prev.get("hash"):
        return "new"
    if cur.hash is None:
        # Body too large to hash this run; treat as unchanged rather than guess.
        return "unchanged"
    if cur.hash == prev.get("hash"):
        return "unchanged"
    # Content differs from the confirmed baseline.
    if cur.hash == prev.get("pending"):
        return "changed"          # same new content two runs running → real
    return "pending"              # first sighting of new content → watch, don't flag


def fold(prev: dict | None, cur: Signal, now: str, verdict: Verdict) -> dict:
    if verdict == "unreachable":
        # Leave the last known-good entry intact so we compare against real content next run.
        return prev or {"status": cur.status, "firstSeen": now, "lastSeen": now, "lastChanged": now}

    entry = dict(prev) if prev else {"firstSeen": now, "lastChanged": now}
    entry["status"] = cur.status if cur.status is not None else entry.get("status")
    entry["lastSeen"] = now
    entry.setdefault("firstSeen", now)
    entry.setdefault("lastChanged", now)

    if verdict in ("new", "changed"):
        entry["hash"] = cur.hash if cur.hash is not None else entry.get("hash")
        entry["lastChanged"] = now
        entry.pop("pending", None)
    elif verdict == "unchanged":
        entry.pop("pending", None)  # candidate withdrawn / confirmed baseline holds
    elif verdict == "pending":
        entry["pending"] = cur.hash  # remember the candidate for next run's confirmation
    return entry
