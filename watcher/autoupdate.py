"""Lets the source watch correct a number in data/ on its own, under rules
strict enough that the only thing it can ever do is replace one number on one
line.

Why it is this narrow. Everything under data/ feeds a paycheck. A wrong
automatic edit is a wrong net pay for every employee the engine calculates, so
the watcher gets no latitude: it cannot add or remove a line, an entry or a
file, cannot touch code, tests or the site, cannot reword a note, and cannot
change a value that has a history, a note, or a mirror elsewhere. Anything that
is not a clean single-number replacement is left for a person, who gets the
finding in the daily report and the standing "needs attention" issue as before.

How a change gets in (all must hold, checked again immediately before writing):

  1. The master switch is on (watcher/autoupdate.json "enabled": true). It
     ships OFF. Off means every proposal is checked and reported, nothing is
     written.
  2. The proposal names the exact file and 1-based line and the exact text it
     expects to find there. The file must match an allow-list rule (path glob,
     key, bounds), be tracked by git, sit inside data/, not be a symlink, and be
     the current or a later year's file (past years' paychecks are final).
  3. The line must be `"<key>": <number>` and nothing else. The replacement is
     that line with only the number swapped; indentation, key and trailing
     comma are byte-identical.
  4. After the swap the file parses, and a deep comparison with the original
     finds exactly one difference: that number, still a number.
  5. The new value is inside the rule's bounds, is not zero (a repeal or a new
     tax is a person's call), the old value was not zero, and the change is no
     larger than the rule's cap.
  6. The object holding the line has no rateHistory, no note acknowledging a
     departure from the official file, and no sibling that mirrors the value
     (JEDD zones carry rateSourceRaw, so they are not allow-listed).
  7. The official row that justifies it took effect on or before January 1 of
     the file's year, so the whole file's year is covered by one number. A
     mid-year change needs a rateHistory row, which is a structural edit and so
     a person's.
  8. The evidence is the official source the watcher already tracks (https, an
     allow-listed host, a URL in sources.json), read at least twice, further
     apart than `min_confirm_gap_seconds`, with the same answer both times.
  9. Circuit breaker: more than `max_changes_per_run` eligible changes, or more
     than `max_findings_per_run` disagreements of any kind in one run, means the
     official file probably changed shape rather than 6 cities changing rates
     at once. Nothing is applied.
 10. After writing, `git status` may show only the intended file plus the
     generated edge bundle; the generated bundle is rebuilt and the whole test
     suite must pass. Any failure restores every touched file.

Applied changes are left in the working tree for the workflow to put on a
branch and open as a pull request. Nothing here commits to the default branch,
pushes, or merges.

    python watcher/autoupdate.py              # check and report, write nothing
    python watcher/autoupdate.py --apply      # also write (needs "enabled": true)
"""

from __future__ import annotations

import argparse
import datetime as dt
import fnmatch
import json
import re
import subprocess
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
CONFIG = HERE / "autoupdate.json"
LOG = HERE / "autoupdate-log.jsonl"
REPORT_JSON = HERE / "reports" / "autoupdate-latest.json"
REPORT_MD = HERE / "reports" / "autoupdate-latest.md"

# Fields the watcher may never be told to edit, whatever a rule says.
NOTE_KEYS = ("$correctionNote", "sourceNote", "$addedNote")
LINE_RE = re.compile(r'^(?P<indent>[ \t]*)"(?P<key>[A-Za-z][A-Za-z0-9_]*)": (?P<num>-?\d+(?:\.\d+)?)(?P<comma>,?)$')
# Paths the generated bundle step may touch besides the one data file.
GENERATED_PREFIXES = ("supabase/functions/_shared/",)

DEFAULT_CONFIG = {
    "enabled": False,
    "max_changes_per_run": 5,
    "max_findings_per_run": 10,
    "min_confirm_gap_seconds": 20,
    "max_proposal_age_hours": 36,
    "rules": [],
}


class Rejected(Exception):
    """A proposal that broke a rule. The message is the rule, for the log."""


# --------------------------------------------------------------------------
# configuration
# --------------------------------------------------------------------------

def load_config(path: Path = CONFIG) -> dict:
    cfg = dict(DEFAULT_CONFIG)
    try:
        cfg.update(json.loads(path.read_text()))
    except FileNotFoundError:
        pass  # no file means the defaults: disabled, no rules, nothing allowed
    return cfg


# --------------------------------------------------------------------------
# small helpers
# --------------------------------------------------------------------------

def fmt_number(x: float) -> str:
    """The shortest plain decimal for x, six places at most, never exponent
    notation (0.0225, not 2.25e-2). The data files are written this way."""
    s = f"{round(float(x), 6):.6f}".rstrip("0")
    if s.endswith("."):
        s += "0"
    return s


def _deep_diff(a, b, path=()):
    """Every path at which two parsed JSON values differ."""
    if type(a) is not type(b):
        return [path]
    if isinstance(a, dict):
        out = []
        for k in sorted(set(a) | set(b)):
            if k not in a or k not in b:
                out.append(path + (k,))
            else:
                out.extend(_deep_diff(a[k], b[k], path + (k,)))
        return out
    if isinstance(a, list):
        if len(a) != len(b):
            return [path]
        out = []
        for i, (x, y) in enumerate(zip(a, b)):
            out.extend(_deep_diff(x, y, path + (i,)))
        return out
    return [] if a == b else [path]


def _walk(node, path=()):
    yield path, node
    if isinstance(node, dict):
        for k, v in node.items():
            yield from _walk(v, path + (k,))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from _walk(v, path + (i,))


def _get(node, path):
    for p in path:
        node = node[p]
    return node


def _git(repo: Path, *args: str) -> str:
    r = subprocess.run(["git", "-C", str(repo), *args], capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {r.stderr.strip()[:200]}")
    return r.stdout


def _rule_for(cfg: dict, rel: str, key: str) -> dict | None:
    for rule in cfg["rules"]:
        if fnmatch.fnmatchcase(rel, rule["glob"]) and key in rule["keys"]:
            return rule
    return None


# --------------------------------------------------------------------------
# turning findings into proposals
# --------------------------------------------------------------------------

def locate(repo: Path, rel: str, id_key: str, ident: str, key: str) -> int:
    """The 1-based line of `"<key>": <number>` inside the one object whose
    `<id_key>` is `ident`. Raises Rejected unless there is exactly one."""
    lines = (repo / rel).read_text().split("\n")
    id_lines = [i for i, ln in enumerate(lines) if re.fullmatch(rf'\s*"{re.escape(id_key)}": "{re.escape(ident)}",?', ln)]
    if len(id_lines) != 1:
        raise Rejected(f"{id_key} {ident!r} appears on {len(id_lines)} lines, not exactly one")
    at = id_lines[0]
    indent = re.match(r"[ \t]*", lines[at]).group()
    # The object's braces sit one level out from its keys.
    outer = indent[: max(0, len(indent) - 2)]
    start = at
    while start > 0 and lines[start] not in (outer + "{", outer + "{,"):
        start -= 1
    end = at
    while end < len(lines) - 1 and lines[end] not in (outer + "}", outer + "},"):
        end += 1
    hits = [i for i in range(start, end + 1) if re.match(rf'^{re.escape(indent)}"{re.escape(key)}": ', lines[i])]
    if len(hits) != 1:
        raise Rejected(f'"{key}" appears {len(hits)} times in that entry, not exactly once')
    return hits[0] + 1


def proposals_from(confirmed: list[dict], repo: Path, today: str) -> list[dict]:
    """Findings that carry a `change`, located to an exact line. A finding
    whose line cannot be pinned down is dropped here (the rest of the run
    still reports it for a person)."""
    out = []
    for f in confirmed:
        ch = f.get("change")
        if not ch or f.get("severity") != "action":
            continue
        try:
            line = locate(repo, ch["file"], ch["id_key"], ch["id"], ch["key"])
        except (Rejected, OSError):
            continue
        text = (repo / ch["file"]).read_text().split("\n")[line - 1]
        m = LINE_RE.match(text)
        if not m:
            continue
        out.append({
            "id": f'{ch["file"]}#{ch["id_key"]}={ch["id"]}.{ch["key"]}',
            "file": ch["file"], "line": line, "key": ch["key"],
            "old_text": m.group("num"), "new_text": fmt_number(ch["new"]),
            "new": ch["new"], "effective_from": ch["effective_from"],
            "name": f.get("name", ""), "kind": f["kind"], "as_of": today,
            "evidence": {"source_id": f.get("source_id", ""), "url": ch.get("source_url", ""),
                         "official_value": ch["new"], "reads": f.get("reads", [])},
        })
    return out


# --------------------------------------------------------------------------
# the rules
# --------------------------------------------------------------------------

def check(p: dict, cfg: dict, repo: Path, sources: list[dict], today: str, now: dt.datetime | None = None) -> dict:
    """Raises Rejected unless `p` is a single-number replacement that obeys
    every rule. Returns what would be written: {path, text, replacement}.
    Pure: reads the repo, changes nothing. apply() calls it again just before
    writing, so a proposal is never trusted from earlier."""
    now = now or dt.datetime.now(dt.timezone.utc)
    required = ("id", "file", "line", "key", "old_text", "new_text", "effective_from", "as_of", "evidence")
    missing = [k for k in required if k not in p]
    if missing:
        raise Rejected(f"proposal is missing {', '.join(missing)}")
    if not isinstance(p["line"], int) or isinstance(p["line"], bool) or p["line"] < 1:
        raise Rejected("line must be a positive integer")

    # 1 / 2: switch, path, allow-list
    rel = p["file"]
    if not isinstance(rel, str) or rel.startswith(("/", "\\")) or ".." in Path(rel).parts or "\\" in rel:
        raise Rejected("path must be relative and stay inside the repository")
    if not rel.startswith("data/") or not rel.endswith(".json"):
        raise Rejected("only .json files under data/ can be changed")
    rule = _rule_for(cfg, rel, p["key"])
    if rule is None:
        raise Rejected(f'no rule allows changing "{p["key"]}" in {rel}')
    path = repo / rel
    if path.is_symlink() or not path.is_file():
        raise Rejected("file is missing or is a symlink")
    if path.resolve().parent != (repo / rel).parent.resolve() or repo.resolve() not in path.resolve().parents:
        raise Rejected("file resolves outside the repository")
    try:
        _git(repo, "ls-files", "--error-unmatch", rel)
    except RuntimeError:
        raise Rejected("file is not tracked by git") from None
    ym = re.search(r"(\d{4})\.json$", rel)
    if not ym:
        raise Rejected("file name carries no year")
    file_year = int(ym.group(1))
    if file_year < int(today[:4]):
        raise Rejected(f"{file_year} is a past year; its paychecks are final")

    # proposal freshness
    if p["as_of"] != today:
        raise Rejected(f"proposal is dated {p['as_of']}, not today ({today})")

    # 3: the line, and only the number on it
    original = path.read_text()
    lines = original.split("\n")
    if p["line"] > len(lines):
        raise Rejected("line is past the end of the file")
    current = lines[p["line"] - 1]
    m = LINE_RE.match(current)
    if not m:
        raise Rejected(f"line {p['line']} is not a plain `\"key\": number` line")
    if m.group("key") != p["key"]:
        raise Rejected(f"line {p['line']} holds \"{m.group('key')}\", not \"{p['key']}\"")
    if m.group("num") != p["old_text"]:
        raise Rejected(f"line {p['line']} holds {m.group('num')}, not the {p['old_text']} the proposal expected")
    new_text = p["new_text"]
    if not re.fullmatch(r"\d+\.\d{1,6}", new_text):
        raise Rejected("new value must be a plain decimal with at most six places")
    replacement = f'{m.group("indent")}"{m.group("key")}": {new_text}{m.group("comma")}'
    if replacement == current:
        raise Rejected("nothing to change")

    # 4: exactly one leaf differs
    new_lines = list(lines)
    new_lines[p["line"] - 1] = replacement
    new_original = "\n".join(new_lines)
    try:
        before, after = json.loads(original), json.loads(new_original)
    except ValueError as e:
        raise Rejected(f"file does not parse after the change ({e})") from None
    diffs = _deep_diff(before, after)
    if len(diffs) != 1:
        raise Rejected(f"the change alters {len(diffs)} values, not exactly one")
    leaf = diffs[0]
    old_v, new_v = _get(before, leaf), _get(after, leaf)
    if isinstance(old_v, bool) or isinstance(new_v, bool) or not isinstance(old_v, (int, float)) or not isinstance(new_v, (int, float)):
        raise Rejected("only a number can be replaced by a number")
    if leaf[-1] != p["key"]:
        raise Rejected("the changed value is not under the named key")

    # 5: bounds
    if old_v == 0 or new_v == 0:
        raise Rejected("a value going to or from zero is a repeal or a new tax; a person decides")
    if not (rule["min"] <= new_v <= rule["max"]):
        raise Rejected(f"{new_v} is outside the allowed range {rule['min']}..{rule['max']}")
    if abs(new_v - old_v) > rule["max_abs_change"] + 1e-12:
        raise Rejected(f"a change of {abs(new_v - old_v):.6f} is larger than the {rule['max_abs_change']} cap")
    if abs(new_v - float(p.get("new", new_v))) > 5e-7:
        raise Rejected("new_text disagrees with the official value in the proposal")

    # 6: the holding object
    holder = _get(before, leaf[:-1])
    if not isinstance(holder, dict):
        raise Rejected("the value is not a field of an entry")
    if "rateHistory" in holder or "effectiveDated" in holder:
        raise Rejected("the entry has dated history; a change needs a dated row, which is a structural edit")
    if "effectiveDated" in before:
        raise Rejected("the file carries effectiveDated overlays")
    if any(k in holder for k in NOTE_KEYS):
        raise Rejected("the entry carries a note recording a hand-checked departure from the official file")
    mirrors = [k for k, v in holder.items() if k != p["key"] and (k.lower().startswith(p["key"].lower()) or k.lower().endswith("raw")) and isinstance(v, (str, int, float))]
    if mirrors:
        raise Rejected(f"the entry has fields that mirror the value ({', '.join(mirrors)}); a one-line edit would leave them stale")

    # 7: one number must cover the whole year
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(p["effective_from"])):
        raise Rejected("effective_from is not a date")
    if p["effective_from"] > f"{file_year}-01-01":
        raise Rejected(f"the official change starts {p['effective_from']}, after January 1 {file_year}; a mid-year change needs a dated row")
    if p["effective_from"] > today and file_year == int(today[:4]):
        raise Rejected("the official change has not started yet")

    # 8: evidence
    ev = p["evidence"]
    url = urlparse(str(ev.get("url", "")))
    if url.scheme != "https" or not url.hostname:
        raise Rejected("evidence is not an https URL")
    if url.hostname not in rule["hosts"]:
        raise Rejected(f"{url.hostname} is not an allowed official host for this file")
    tracked = [s for s in sources if s.get("id") == ev.get("source_id")]
    if not tracked or tracked[0].get("url") != str(ev.get("url")):
        raise Rejected("evidence is not a source the watcher tracks, at the address it tracks")
    reads = ev.get("reads") or []
    if len(reads) < 2:
        raise Rejected("the official value was read fewer than two times")
    try:
        times = sorted(dt.datetime.fromisoformat(r["at"]) for r in reads)
    except (KeyError, ValueError, TypeError):
        raise Rejected("a read has no valid timestamp") from None
    if any(abs(float(r["value"]) - float(p["new"])) > 5e-7 for r in reads):
        raise Rejected("the reads of the official file do not all agree")
    if (times[-1] - times[0]).total_seconds() < cfg["min_confirm_gap_seconds"]:
        raise Rejected(f"the reads are less than {cfg['min_confirm_gap_seconds']}s apart")
    age = (now - times[-1]).total_seconds() / 3600
    if age > cfg["max_proposal_age_hours"] or age < -1:
        raise Rejected("the evidence is stale or from the future")

    return {"path": path, "text": new_original, "replacement": replacement, "original_line": current}


def triage(proposals: list[dict], cfg: dict, repo: Path, sources: list[dict], today: str, total_findings: int,
           now: dt.datetime | None = None) -> tuple[list[dict], list[dict]]:
    """(accepted, rejected). Rejections carry the rule. The circuit breaker
    and the one-change-per-entry rule are applied across the whole batch."""
    accepted, rejected = [], []
    seen: set[str] = set()
    for p in proposals:
        try:
            if p.get("id") in seen:
                raise Rejected("a second proposal for the same value")
            seen.add(p.get("id"))
            check(p, cfg, repo, sources, today, now)
            accepted.append(p)
        except Rejected as e:
            rejected.append({"proposal": p, "reason": str(e)})
    if total_findings > cfg["max_findings_per_run"]:
        rejected += [{"proposal": p, "reason": f"circuit breaker: {total_findings} disagreements in one run (limit {cfg['max_findings_per_run']}); the official file may have changed shape"} for p in accepted]
        accepted = []
    elif len(accepted) > cfg["max_changes_per_run"]:
        rejected += [{"proposal": p, "reason": f"circuit breaker: {len(accepted)} changes in one run (limit {cfg['max_changes_per_run']})"} for p in accepted]
        accepted = []
    # Two accepted proposals on one file are fine only if on different lines.
    lines_seen: set[tuple[str, int]] = set()
    for p in list(accepted):
        k = (p["file"], p["line"])
        if k in lines_seen:
            accepted.remove(p)
            rejected.append({"proposal": p, "reason": "two proposals for the same line"})
        lines_seen.add(k)
    return accepted, rejected


# --------------------------------------------------------------------------
# applying
# --------------------------------------------------------------------------

DEFAULT_VERIFY = ["npm run edge:build", "npm test"]


def apply(accepted: list[dict], cfg: dict, repo: Path, sources: list[dict], today: str,
          verify: list[str] | None = None, now: dt.datetime | None = None) -> list[dict]:
    """Writes the accepted changes, then proves them. Returns the proposals
    that stayed in; on any failure restores everything and returns []."""
    if not cfg["enabled"]:
        raise Rejected("auto-update is switched off (watcher/autoupdate.json)")
    if _git(repo, "status", "--porcelain", "--untracked-files=no").strip():
        raise Rejected("the working tree is not clean; refusing to mix automatic changes with other edits")
    verify = DEFAULT_VERIFY if verify is None else verify
    touched: dict[Path, str] = {}
    try:
        # Re-check each one against the file as it is right now, one at a time.
        for p in accepted:
            plan = check(p, cfg, repo, sources, today, now)
            touched.setdefault(plan["path"], plan["path"].read_text())
            plan["path"].write_text(plan["text"])
        for cmd in verify:
            r = subprocess.run(cmd, shell=True, cwd=repo, capture_output=True, text=True)
            if r.returncode != 0:
                raise Rejected(f"`{cmd}` failed: {(r.stdout + r.stderr).strip()[-300:]}")
        # What changed must be exactly the intended lines, plus generated files.
        changed = [ln[3:] for ln in _git(repo, "status", "--porcelain", "--untracked-files=no").splitlines()]
        intended = {p["file"] for p in accepted}
        stray = [c for c in changed if c not in intended and not c.startswith(GENERATED_PREFIXES)]
        if stray:
            raise Rejected(f"unexpected files changed: {', '.join(stray[:5])}")
        for rel in intended:
            diff = _git(repo, "diff", "-U0", "--", rel)
            body = [ln for ln in diff.splitlines() if ln[:1] in "+-" and not ln.startswith(("+++", "---"))]
            want = sum(1 for p in accepted if p["file"] == rel)
            if len(body) != 2 * want:
                raise Rejected(f"{rel}: the diff has {len(body)} changed lines, expected {2 * want}")
        return accepted
    except BaseException:
        for path, text in touched.items():
            path.write_text(text)
        # Drop anything the verify commands generated, too.
        subprocess.run(["git", "-C", str(repo), "checkout", "--", "."], capture_output=True)
        raise


# --------------------------------------------------------------------------
# reporting
# --------------------------------------------------------------------------

def log(entries: list[dict], path: Path = LOG) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        for e in entries:
            f.write(json.dumps(e, sort_keys=True) + "\n")


def report(applied: list[dict], rejected: list[dict], mode: str, today: str, note: str = "") -> str:
    out = [f"# Auto-update: {today}", "", f"Mode: **{mode}**.", ""]
    if note:
        out += [note, ""]
    if applied:
        out += ["## Would change" if mode != "applied" else "## Changed", ""]
        for p in applied:
            out.append(f"- `{p['file']}` line {p['line']}: `{p['old_text']}` -> `{p['new_text']}` "
                       f"({p['name']}; official change effective {p['effective_from']}; source {p['evidence']['url']})")
        out.append("")
    if rejected:
        out += ["## Left for a person", ""]
        for r in rejected:
            p = r["proposal"]
            out.append(f"- `{p.get('file', '?')}` line {p.get('line', '?')} ({p.get('name', '')}): {r['reason']}")
        out.append("")
    if not applied and not rejected:
        out += ["Nothing to change.", ""]
    return "\n".join(out)


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------

def gather(sources: list[dict], fetcher, today: str, repo: Path, gap: float, sleep=time.sleep,
           run=None) -> tuple[list[dict], int]:
    """Reads the official files twice, `gap` seconds apart, and keeps only
    findings that came out identical both times. Returns (confirmed, number
    of action-level disagreements seen on the first read)."""
    if run is None:
        import reconcile  # noqa: PLC0415
        run = reconcile.run
    first_at = dt.datetime.now(dt.timezone.utc)
    first = run(sources, fetcher, today, repo)
    sleep(gap)
    second_at = dt.datetime.now(dt.timezone.utc)
    second = run(sources, fetcher, today, repo)

    def key(f):
        c = f.get("change") or {}
        return (f["kind"], f["code"], c.get("file"), c.get("new"), c.get("old"), c.get("effective_from"))

    later = {key(f): f for f in second if f.get("change")}
    confirmed = []
    for f in first:
        if f.get("change") and key(f) in later:
            f = dict(f)
            f["reads"] = [{"at": first_at.isoformat(), "value": f["change"]["new"]},
                          {"at": second_at.isoformat(), "value": later[key(f)]["change"]["new"]}]
            confirmed.append(f)
    return confirmed, sum(1 for f in first if f["severity"] == "action")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true", help="write the accepted changes (needs enabled: true)")
    ap.add_argument("--repo", default=str(REPO))
    args = ap.parse_args(argv)
    repo = Path(args.repo)
    sys.path.insert(0, str(HERE))
    import watch  # noqa: PLC0415

    cfg = load_config(repo / "watcher" / "autoupdate.json")
    sources = json.loads((repo / "watcher" / "sources.json").read_text())["sources"]
    today = dt.date.today().isoformat()
    gap = max(cfg["min_confirm_gap_seconds"] + 2, 2)
    confirmed, total = gather(sources, watch.fetch, today, repo, gap)
    accepted, rejected = triage(proposals_from(confirmed, repo, today), cfg, repo, sources, today, total)

    mode, note = "check only", ""
    if args.apply and not cfg["enabled"]:
        note = "`--apply` was given but auto-update is switched off in watcher/autoupdate.json; nothing was written."
        rejected += [{"proposal": p, "reason": "auto-update is switched off"} for p in accepted]
        accepted = []
    elif args.apply and accepted:
        try:
            accepted = apply(accepted, cfg, repo, sources, today)
            mode = "applied"
        except Exception as e:  # noqa: BLE001 - nothing may stay half-applied
            note = f"Nothing was applied: {e}"
            rejected += [{"proposal": p, "reason": f"verification failed: {e}"} for p in accepted]
            accepted = []
    text = report(accepted, rejected, mode, today, note)
    (repo / "watcher" / "reports").mkdir(exist_ok=True)
    (repo / "watcher" / "reports" / "autoupdate-latest.md").write_text(text)
    (repo / "watcher" / "reports" / "autoupdate-latest.json").write_text(json.dumps(
        {"date": today, "mode": mode, "applied": accepted if mode == "applied" else [],
         "would_apply": accepted if mode != "applied" else [], "left_for_a_person": rejected}, indent=2) + "\n")
    log([{"date": today, "mode": mode, "id": p["id"], "result": "applied" if mode == "applied" else "eligible",
          "old": p["old_text"], "new": p["new_text"]} for p in accepted]
        + [{"date": today, "id": r["proposal"].get("id", "?"), "result": "left for a person", "reason": r["reason"]} for r in rejected],
        repo / "watcher" / "autoupdate-log.jsonl")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
