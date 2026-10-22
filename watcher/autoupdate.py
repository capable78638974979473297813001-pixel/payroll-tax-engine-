"""Lets the source watch correct a number in data/ on its own, under rules
strict enough that the only thing it can ever do is replace numbers on named
lines: one value, plus the lines that must move with it (its copy, its
percent string, a total that is a sum of its parts), all in one file.

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
import bisect
import fnmatch
import functools
import json
import os
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
NOTE_KEYS = ("$correctionNote", "sourceNote", "$addedNote", "$note", "yearNotes")
LINE_RE = re.compile(r'^(?P<indent>[ \t]*)"(?P<key>[A-Za-z][A-Za-z0-9_]*)": (?P<num>-?\d+(?:\.\d+)?)(?P<comma>,?)$')
STRING_LINE_RE = re.compile(r'^(?P<indent>[ \t]*)"(?P<key>[A-Za-z][A-Za-z0-9_]*)": "(?P<num>\d+(?:\.\d+)?)"(?P<comma>,?)$')
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
# finding a value in a file
# --------------------------------------------------------------------------

def json_positions(text: str) -> dict[tuple, tuple[int, str, bool]]:
    """Cached by text: a Pennsylvania run asks about the same 1 MB file for
    every one of its proposals."""
    return _json_positions(text)


@functools.lru_cache(maxsize=6)
def _json_positions(text: str) -> dict[tuple, tuple[int, str, bool]]:
    """{path: (1-based line, token as written, key repeated?)} for every
    scalar in a JSON document. Used to turn "this value in this entry" into
    "this line", and back, without assuming how the file was pretty-printed."""
    newlines = [m.start() for m in re.finditer("\n", text)]
    pos: dict[tuple, tuple[int, str, bool]] = {}
    n = len(text)
    i = 0

    def line_of(idx: int) -> int:
        return bisect.bisect_left(newlines, idx) + 1

    def ws() -> None:
        nonlocal i
        while i < n and text[i] in " \t\r\n":
            i += 1

    def string() -> str:
        nonlocal i
        j = i + 1
        while text[j] != '"':
            j += 2 if text[j] == "\\" else 1
        tok = text[i:j + 1]
        i = j + 1
        return tok

    def value(path: tuple) -> None:
        nonlocal i
        ws()
        c = text[i]
        if c == "{":
            i += 1
            ws()
            if text[i] == "}":
                i += 1
                return
            seen: set[str] = set()
            while True:
                ws()
                key = json.loads(string())
                ws()
                i += 1  # ':'
                if key in seen:
                    pos[path + (key,)] = (0, "", True)  # repeated key: unlocatable on purpose
                seen.add(key)
                value(path + (key,))
                ws()
                if text[i] == ",":
                    i += 1
                    continue
                i += 1  # '}'
                return
        if c == "[":
            i += 1
            ws()
            if text[i] == "]":
                i += 1
                return
            k = 0
            while True:
                value(path + (k,))
                k += 1
                ws()
                if text[i] == ",":
                    i += 1
                    continue
                i += 1  # ']'
                return
        start = i
        if c == '"':
            tok = string()
        else:
            while i < n and text[i] not in ",}] \t\r\n":
                i += 1
            tok = text[start:i]
        if path in pos and pos[path][2]:
            return
        pos[path] = (line_of(start), tok, False)

    value(())
    return pos


def _positions(repo: Path, rel: str) -> dict:
    try:
        return json_positions((repo / rel).read_text())
    except (OSError, ValueError, IndexError) as e:
        raise Rejected(f"{rel} could not be read as JSON ({type(e).__name__})") from None


def locate_path(repo: Path, rel: str, id_key: str, ident: str, key: str) -> tuple:
    """The path of `key` inside the one object whose `id_key` is `ident`."""
    pos = _positions(repo, rel)
    token = json.dumps(ident)
    holders = [path[:-1] for path, (_, tok, dup) in pos.items() if path and path[-1] == id_key and tok == token and not dup]
    if len(holders) != 1:
        raise Rejected(f"{id_key} {ident!r} appears {len(holders)} times, not exactly once")
    target = holders[0] + (key,)
    if target not in pos or pos[target][2]:
        raise Rejected(f'"{key}" appears no or more than once in that entry, not exactly once')
    return target


def locate(repo: Path, rel: str, id_key: str, ident: str, key: str) -> int:
    """The 1-based line of `key` inside the one object whose `id_key` is `ident`."""
    return _positions(repo, rel)[locate_path(repo, rel, id_key, ident, key)][0]


def fmt_percent(x: float) -> str:
    """0.015 -> '1.5', 0.02 -> '2': the way the data files spell a rate stated in percent."""
    s = f"{round(float(x) * 100, 4):.4f}".rstrip("0")
    return s[:-1] if s.endswith(".") else s


def _edit_texts(raw: str, relation) -> str:
    return raw[1:-1] if raw.startswith('"') else raw


def normalize(p: dict) -> dict:
    """Every proposal is a list of edits; the older single-edit shape (line,
    key, old_text, new_text) is the same thing with one."""
    if "edits" in p:
        return p
    q = dict(p)
    q["edits"] = [{"line": p.get("line"), "key": p.get("key"), "old_text": p.get("old_text"),
                   "new_text": p.get("new_text"), "relation": None}]
    return q


def proposals_from(confirmed: list[dict], repo: Path, today: str) -> list[dict]:
    """Findings that carry a `change`, located to exact lines. A finding
    whose lines cannot be pinned down is dropped here (the run still
    reports it for a person)."""
    out = []
    for f in confirmed:
        ch = f.get("change")
        if not ch or f.get("severity") != "action":
            continue
        try:
            pos = _positions(repo, ch["file"])
            specs = ch.get("edits")
            if specs is None:  # one value found by entry id, plus fields that mirror it
                base = locate_path(repo, ch["file"], ch["id_key"], ch["id"], ch["key"])
                specs = [{"path": list(base), "new": ch["new"], "relation": None}] + [
                    {"path": list(base[:-1] + (d["key"],)), "relation": d["relation"]} for d in ch.get("derived", [])]
            edits = []
            for sp in specs:
                path = tuple(sp["path"])
                line, tok, dup = pos[path]
                if dup:
                    raise Rejected("repeated key")
                rel = sp.get("relation")
                if rel == "percent_string":
                    new_text = fmt_percent(ch["new"])
                elif isinstance(rel, dict) and "sum" in rel:
                    new_text = None  # filled in below, once the other values are known
                else:
                    new_text = fmt_number(sp.get("new", ch["new"]))
                    if "." not in _edit_texts(tok, rel) and float(sp.get("new", ch["new"])).is_integer():
                        new_text = str(int(sp.get("new", ch["new"])))  # an integer in the file stays an integer
                edits.append({"path": list(path), "line": line, "key": str(path[-1]), "old_text": _edit_texts(tok, rel),
                              "new_text": new_text, "relation": rel})
            for e in edits:
                if e["new_text"] is None:
                    parts = []
                    for k in e["relation"]["sum"]:
                        sib = next((x for x in edits if x["key"] == k), None)
                        if sib is not None:
                            parts.append(float(sib["new_text"]))
                        else:
                            parts.append(float(_edit_texts(pos[tuple(e["path"][:-1]) + (k,)][1], None)))
                    e["new_text"] = fmt_number(sum(parts))
        except (Rejected, OSError, KeyError):
            continue
        out.append({
            "id": f'{ch["file"]}#{ch.get("id_key", "path")}={ch.get("id", "")}.{ch.get("key", "")}'
                  if "id" in ch else f'{ch["file"]}#' + ",".join(".".join(map(str, sp["path"])) for sp in specs[:1]),
            "file": ch["file"], "edits": edits, "new": ch["new"], "companions": ch.get("companions", []),
            "effective_from": ch.get("effective_from", f'{ch["file"][-9:-5]}-01-01'),
            "name": f.get("name", ""), "kind": f["kind"], "as_of": today,
            "evidence": {"kind": ch.get("evidence_kind", "feed"), "source_id": f.get("source_id", ""),
                         "url": ch.get("source_url", ""), "official_value": ch["new"], "reads": f.get("reads", []),
                         **({"pattern": ch["pattern"], "matched_text": ch.get("matched_text", ""), "transform": ch.get("transform", "")}
                            if ch.get("evidence_kind") == "text" else {})},
        })
    return out


# --------------------------------------------------------------------------
# the rules
# --------------------------------------------------------------------------

def _holder_blockers(holder: dict, edited_keys: set[str], exempt: set[str] = frozenset()) -> str | None:
    if "rateHistory" in holder or "effectiveDated" in holder or "rateChanges" in holder:
        return "the entry has dated history; a change needs a dated row, which is a structural edit"
    if any(re.search(r"terminat|endsOn|expir|sunset", k, re.I) for k in holder):
        return "the entry has an end date; whether the rate still applies is a person's call"
    if any(k in holder for k in NOTE_KEYS):
        return "the entry carries a note recording a hand-checked departure from the official file"
    mirrors = [k for k, v in holder.items()
               if k not in edited_keys and k not in exempt and isinstance(v, (str, int, float)) and not isinstance(v, bool)
               and any(k.lower().startswith(e.lower()) or k.lower() == e.lower() + "raw" or k.lower().endswith("raw") for e in edited_keys)]
    if mirrors:
        return f"the entry has fields that mirror the value ({', '.join(mirrors)}); a one-line edit would leave them stale"
    return None


def check(p: dict, cfg: dict, repo: Path, sources: list[dict], today: str, now: dt.datetime | None = None) -> dict:
    """Raises Rejected unless `p` is a set of single-number replacements that
    obeys every rule. Returns what would be written: {path, text, lines}.
    Pure: reads the repo, changes nothing. apply() calls it again just before
    writing, so a proposal is never trusted from earlier."""
    now = now or dt.datetime.now(dt.timezone.utc)
    p = normalize(p)
    required = ("id", "file", "edits", "effective_from", "as_of", "evidence")
    missing = [k for k in required if k not in p]
    if missing:
        raise Rejected(f"proposal is missing {', '.join(missing)}")
    edits = [dict(e) for e in p["edits"]] if isinstance(p["edits"], list) else p["edits"]
    if not isinstance(edits, list) or not (1 <= len(edits) <= cfg.get("max_edits_per_proposal", 6)):
        raise Rejected("a proposal must hold between one and six edits")
    for e in edits:
        if not isinstance(e.get("line"), int) or isinstance(e.get("line"), bool) or e["line"] < 1:
            raise Rejected("line must be a positive integer")
        if not all(k in e for k in ("key", "old_text", "new_text")):
            raise Rejected("an edit is missing key, old_text or new_text")

    # 1 / 2: path, allow-list
    rel = p["file"]
    if not isinstance(rel, str) or rel.startswith(("/", "\\")) or ".." in Path(rel).parts or "\\" in rel:
        raise Rejected("path must be relative and stay inside the repository")
    if not rel.startswith("data/") or not rel.endswith(".json"):
        raise Rejected("only .json files under data/ can be changed")
    rules = []
    for e in edits:
        rule = _rule_for(cfg, rel, e["key"])
        if rule is None:
            raise Rejected(f'no rule allows changing "{e["key"]}" in {rel}')
        rules.append(rule)
    path = repo / rel
    if path.is_symlink() or not path.is_file():
        raise Rejected("file is missing or is a symlink")
    if repo.resolve() not in path.resolve().parents:
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
    if p["as_of"] != today:
        raise Rejected(f"proposal is dated {p['as_of']}, not today ({today})")

    # 3: each line, and only the number on it
    original = path.read_text()
    lines = original.split("\n")
    new_lines = list(lines)
    seen_lines: set[int] = set()
    for e, rule in zip(edits, rules):
        if e["line"] > len(lines):
            raise Rejected("line is past the end of the file")
        if e["line"] in seen_lines:
            raise Rejected("two edits on one line")
        seen_lines.add(e["line"])
        current = lines[e["line"] - 1]
        rel_kind = e.get("relation")
        m = (STRING_LINE_RE if rel_kind == "percent_string" else LINE_RE).match(current)
        if not m:
            raise Rejected(f"line {e['line']} is not a plain `\"key\": number` line")
        if m.group("key") != e["key"]:
            raise Rejected(f"line {e['line']} holds \"{m.group('key')}\", not \"{e['key']}\"")
        if m.group("num") != e["old_text"]:
            raise Rejected(f"line {e['line']} holds {m.group('num')}, not the {e['old_text']} the proposal expected")
        nt = e["new_text"]
        shape = r"\d+(?:\.\d{1,6})?" if (rel_kind == "percent_string" or rule.get("integers")) else r"\d+\.\d{1,6}"
        if not (isinstance(nt, str) and re.fullmatch(shape, nt)):
            raise Rejected("new value must be a plain decimal with at most six places")
        q = '"' if rel_kind == "percent_string" else ""
        replacement = f'{m.group("indent")}"{m.group("key")}": {q}{nt}{q}{m.group("comma")}'
        if replacement == current:
            raise Rejected("nothing to change")
        new_lines[e["line"] - 1] = replacement

    # 4: exactly these leaves differ, and nothing else
    new_text_all = "\n".join(new_lines)
    try:
        before, after = json.loads(original), json.loads(new_text_all)
    except ValueError as e:
        raise Rejected(f"file does not parse after the change ({e})") from None
    diffs = _deep_diff(before, after)
    if len(diffs) != len(edits):
        raise Rejected(f"the change alters {len(diffs)} values, not exactly {len(edits)} (not exactly one per edit)")
    pos = _positions(repo, rel)
    by_line = {}
    for path_t, (ln, _, dup) in pos.items():
        if not dup:
            by_line.setdefault(ln, []).append(path_t)
    leaves = set(diffs)
    holders: dict[tuple, set] = {}
    for e in edits:
        owners = by_line.get(e["line"], [])
        if len(owners) != 1:
            raise Rejected(f"line {e['line']} does not hold exactly one value")
        leaf = owners[0]
        if "path" in e and tuple(e["path"]) != leaf:
            raise Rejected(f"line {e['line']} is not at the path the proposal named")
        if leaf not in leaves:
            raise Rejected("the changed value is not on the named line")
        if leaf[-1] != e["key"]:
            raise Rejected("the changed value is not under the named key")
        e["_leaf"] = leaf
        holders.setdefault(leaf[:-1], set()).add(e["key"])
    for hp in holders:
        if not isinstance(_get(before, hp), dict):
            raise Rejected("the value is not a field of an entry")
    if "effectiveDated" in before:
        raise Rejected("the file carries effectiveDated overlays")

    # 5: bounds, per edit; relations between edits
    primary = [e for e in edits if not e.get("relation")]
    if not primary:
        raise Rejected("a proposal needs a primary edit backed by the evidence")
    top_new = None
    for e, rule in zip(edits, rules):
        leaf = e["_leaf"]
        old_v, new_v = _get(before, leaf), _get(after, leaf)
        rk = e.get("relation")
        if rk == "percent_string":
            if not isinstance(old_v, str) or not isinstance(new_v, str):
                raise Rejected("a mirrored percent must be a string")
            continue
        if isinstance(old_v, bool) or isinstance(new_v, bool) or not isinstance(old_v, (int, float)) or not isinstance(new_v, (int, float)):
            raise Rejected("only a number can be replaced by a number")
        if old_v == 0 or new_v == 0:
            raise Rejected("a value going to or from zero is a repeal or a new tax; a person decides")
        if not (rule["min"] <= new_v <= rule["max"]):
            raise Rejected(f"{new_v} is outside the allowed range {rule['min']}..{rule['max']}")
        if abs(new_v - old_v) > rule["max_abs_change"] + 1e-12:
            raise Rejected(f"a change of {abs(new_v - old_v):.6f} is larger than the {rule['max_abs_change']} cap")
        if rk is None:
            if top_new is None:
                top_new = new_v
            elif abs(new_v - top_new) > 5e-7 and not rule.get("independent_values"):
                raise Rejected("edits that are not mirrors of each other must be allowed to differ by their rule")
    for e in edits:
        rk = e.get("relation")
        leaf = e["_leaf"]
        new_v = _get(after, leaf)
        if rk == "percent_string":
            expected = fmt_percent(top_new if top_new is not None else float(p.get("new", 0)))
            if new_v != expected:
                raise Rejected(f"mirrored percent {new_v!r} is not the percent form of the rate ({expected!r})")
        elif isinstance(rk, dict) and "sum" in rk:
            total = round(sum(float(_get(after, e["_leaf"][:-1])[k]) for k in rk["sum"]), 6)
            if abs(total - new_v) > 5e-7:
                raise Rejected(f"{e['key']} is not the sum of {', '.join(rk['sum'])}")
        elif rk == "copy":
            if top_new is None or abs(new_v - top_new) > 5e-7:
                raise Rejected(f"{e['key']} is not a copy of the value being changed")
        elif rk is not None:
            raise Rejected(f"unknown relation {rk!r}")
    if abs((top_new if top_new is not None else 0) - float(p.get("new", top_new or 0))) > 5e-7:
        raise Rejected("new_text disagrees with the official value in the proposal")

    # 6: the holding object. Companions are fields that describe the value
    # (an effective date) and stay as they are: each must already hold exactly
    # what the official file says and be on or before January 1 of the year.
    exempt: dict[tuple, set] = {}
    for c in p.get("companions", []):
        cp = tuple(c.get("path", ()))
        if not cp or cp[:-1] not in holders:
            raise Rejected("a companion field must sit in an entry being edited")
        try:
            have = _get(before, cp)
        except (KeyError, IndexError, TypeError):
            raise Rejected("a companion field is missing") from None
        m = re.fullmatch(r"(\d{2})/(\d{2})/(\d{4})", str(c.get("value", "")))
        if not m or have != c["value"]:
            raise Rejected("a companion date does not match the official file")
        if f"{m.group(3)}-{m.group(1)}-{m.group(2)}" > f"{file_year}-01-01":
            raise Rejected(f"the official change starts {c['value']}, after January 1 {file_year}; a mid-year change needs a dated row")
        exempt.setdefault(cp[:-1], set()).add(cp[-1])
    for hp, keys in holders.items():
        reason = _holder_blockers(_get(before, hp), keys, exempt.get(hp, set()))
        if reason:
            raise Rejected(reason)

    # 7: the whole year must be covered by what the evidence says
    ev = p["evidence"]
    if ev.get("kind", "feed") == "text":
        year_ok = str(file_year)
        pattern = str(ev.get("pattern", ""))
        matched = str(ev.get("matched_text", ""))
        if "{year}" not in pattern and "{yy}" not in pattern:
            raise Rejected("a text pattern must name the year it is about")
        try:
            m = re.search(pattern.replace("{year}", year_ok).replace("{yy}", year_ok[2:]), matched)
        except re.error:
            raise Rejected("the text pattern is not a valid expression") from None
        if not m or (year_ok not in matched and f"/{year_ok[2:]} " not in matched):
            raise Rejected(f"the quoted text does not state the value for {file_year}")
        try:
            raw = float(m.group(1).replace(",", ""))
        except (IndexError, ValueError):
            raise Rejected("the text pattern does not capture a number") from None
        value = {"percent": raw / 100, "dollars": raw, "": raw}.get(ev.get("transform", ""))
        if value is None or abs(value - float(p["new"])) > 5e-7:
            raise Rejected("the number in the quoted text is not the proposed value")
        if p["effective_from"] != f"{file_year}-01-01":
            raise Rejected("a text source states a value for a whole year")
    else:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(p["effective_from"])):
            raise Rejected("effective_from is not a date")
        if p["effective_from"] > f"{file_year}-01-01":
            raise Rejected(f"the official change starts {p['effective_from']}, after January 1 {file_year}; a mid-year change needs a dated row")
        if p["effective_from"] > today and file_year == int(today[:4]):
            raise Rejected("the official change has not started yet")

    # 8: evidence
    url = urlparse(str(ev.get("url", "")))
    if url.scheme != "https" or not url.hostname:
        raise Rejected("evidence is not an https URL")
    for rule in rules:
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

    # Prose that quotes the old figure ("4.95% for 2026 ...") is not edited and
    # may now be stale. That is cosmetic, not an engine input, so it does not
    # block the change; the report and pull request list it for the reviewer.
    warnings = []
    for e in edits:
        leaf = e["_leaf"]
        old_v = _get(before, leaf)
        if isinstance(old_v, bool) or not isinstance(old_v, (int, float)):
            continue
        forms = {f"{round(old_v * 100, 4):.4f}".rstrip("0").rstrip(".") + "%", f"{old_v:,.0f}" if float(old_v).is_integer() else f"{old_v:,.2f}", str(old_v)}
        forms = {f for f in forms if len(f) >= 3}
        for level in (leaf[:-1], leaf[:-2]):
            try:
                node = _get(before, level) if level else before
            except (KeyError, IndexError, TypeError):
                continue
            if not isinstance(node, dict):
                continue
            for k, v in node.items():
                if isinstance(v, str) and any(f in v for f in forms):
                    warnings.append(f"{'.'.join(map(str, level + (k,))) or k} mentions the old value ({e['old_text']})")
    return {"path": path, "text": new_text_all, "lines": [e["line"] for e in edits], "warnings": sorted(set(warnings))}


def triage(proposals: list[dict], cfg: dict, repo: Path, sources: list[dict], today: str, total_findings: int,
           now: dt.datetime | None = None, counts: dict | None = None) -> tuple[list[dict], list[dict]]:
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
            accepted.append(normalize(p))
        except Rejected as e:
            rejected.append({"proposal": p, "reason": str(e)})
    # Circuit breakers. A rule may set its own limits (a school-district rate
    # in Pennsylvania legitimately fans out to dozens of entries); otherwise the
    # global ones apply. Findings are counted per source when the caller knows.
    def rule_of(p):
        return _rule_for(cfg, p["file"], p["edits"][0]["key"]) or {}

    for sid in {p["evidence"].get("source_id") for p in accepted}:
        group = [p for p in accepted if p["evidence"].get("source_id") == sid]
        limit = rule_of(group[0]).get("max_findings_per_run", cfg["max_findings_per_run"])
        seen_n = counts.get(sid, total_findings) if counts is not None else total_findings
        if seen_n > limit:
            rejected += [{"proposal": p, "reason": f"circuit breaker: {seen_n} disagreements in one run (limit {limit}); the official file may have changed shape"} for p in group]
            accepted = [p for p in accepted if p not in group]
    by_rule: dict[str, list] = {}
    for p in accepted:
        by_rule.setdefault(rule_of(p).get("glob", "") + "|" + ",".join(sorted(rule_of(p).get("keys", []))), []).append(p)
    for group in by_rule.values():
        limit = rule_of(group[0]).get("max_changes_per_run", cfg["max_changes_per_run"])
        if len(group) > limit:
            rejected += [{"proposal": p, "reason": f"circuit breaker: {len(group)} changes in one run (limit {limit})"} for p in group]
            accepted = [p for p in accepted if p not in group]
    if len(accepted) > cfg.get("max_total_changes_per_run", 150):
        rejected += [{"proposal": p, "reason": f"circuit breaker: {len(accepted)} changes in one run across all sources"} for p in accepted]
        accepted = []
    # Two accepted proposals may share a file but never a line.
    lines_seen: set[tuple[str, int]] = set()
    for p in list(accepted):
        ks = {(p["file"], e["line"]) for e in p["edits"]}
        if ks & lines_seen:
            accepted.remove(p)
            rejected.append({"proposal": p, "reason": "two proposals for the same line"})
        else:
            lines_seen |= ks
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
    accepted = [normalize(p) for p in accepted]
    touched: dict[Path, str] = {}
    try:
        # Re-check each one against the file as it is right now, one at a time.
        for p in accepted:
            plan = check(p, cfg, repo, sources, today, now)
            p["warnings"] = plan["warnings"]
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
            want = sum(len(p["edits"]) for p in accepted if p["file"] == rel)
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
# committing: only the files that were fixed
# --------------------------------------------------------------------------

# Files a run writes about itself, besides the data it fixed and the generated bundle.
RUN_FILES = ("watcher/reports/autoupdate-latest.json", "watcher/reports/autoupdate-latest.md", "watcher/autoupdate-log.jsonl")


def intended_files(applied: list[dict]) -> set[str]:
    return {p["file"] for p in applied}


def stray_files(paths: list[str], applied: list[dict]) -> list[str]:
    """Paths that are neither a file the run fixed, the generated bundle, nor the run's own report."""
    ok = intended_files(applied) | set(RUN_FILES)
    return [p for p in paths if p not in ok and not p.startswith(GENERATED_PREFIXES)]


def commit_applied(repo: Path, applied: list[dict], today: str) -> str:
    """One commit holding exactly the fixed lines, the regenerated bundle and
    the run's report. Anything else staged or changed makes it refuse, and the
    index is cleared, so a zero-day fix can never carry a stray edit onto
    main. Returns the commit id. The message says how to undo it."""
    paths = sorted(intended_files(applied)) + [str(x) for x in RUN_FILES if (repo / x).exists()]
    _git(repo, "add", "--", *paths)
    if (repo / "supabase" / "functions" / "_shared").exists():
        _git(repo, "add", "--", "supabase/functions/_shared")
    staged = [ln for ln in _git(repo, "diff", "--cached", "--name-only").splitlines() if ln]
    stray = stray_files(staged, applied)
    unstaged = [ln for ln in _git(repo, "diff", "--name-only").splitlines() if ln]
    if stray or unstaged:
        _git(repo, "reset", "-q")
        raise Rejected(f"refusing to commit: unexpected changes ({', '.join((stray + unstaged)[:5])})")
    lines = []
    for p in applied:
        for e in p["edits"]:
            lines.append(f"- {p['file']} line {e['line']}: {e['key']} {e['old_text']} -> {e['new_text']} ({p.get('name', '')}; effective {p.get('effective_from', '')}; {p.get('evidence', {}).get('url', '')})")
    n = sum(len(p["edits"]) for p in applied)
    names = ", ".join(sorted({p.get("name", "") for p in applied if p.get("name")})[:3])
    msg = (f"Zero-day fix {today}: {n} value{'s' if n != 1 else ''} corrected from official sources ({names})\n\n"
           "An official source changed a number the engine uses to calculate pay, and the data lagged. Each line below was re-read\n"
           "from the source twice, passed every rule in watcher/autoupdate.py, and the full test suite passed before this commit.\n\n"
           + "\n".join(lines) + "\n\nTo undo: git revert <this commit>.")
    _git(repo, "commit", "-q", "-m", msg)
    return _git(repo, "rev-parse", "HEAD").strip()


def guard_commit(repo: Path, rev: str = "HEAD") -> list[str]:
    """Stray files in a zero-day commit, judged by the report committed with
    it. Empty means the commit touched only what it says it fixed."""
    files = [ln for ln in _git(repo, "show", "--name-only", "--pretty=", rev).splitlines() if ln]
    try:
        applied = json.loads(_git(repo, "show", f"{rev}:watcher/reports/autoupdate-latest.json")).get("applied", [])
    except (RuntimeError, ValueError):
        applied = []
    return stray_files(files, applied)


# --------------------------------------------------------------------------
# reporting
# --------------------------------------------------------------------------

def log(entries: list[dict], path: Path = LOG) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a") as f:
        for e in entries:
            f.write(json.dumps(e, sort_keys=True) + "\n")


def report(applied: list[dict], rejected: list[dict], mode: str, today: str, note: str = "", others: list[dict] | None = None) -> str:
    out = [f"# Auto-update: {today}", "", f"Mode: **{mode}**.", ""]
    if note:
        out += [note, ""]
    if applied:
        out += ["## Would change" if mode != "applied" else "## Changed", ""]
        for p in applied:
            changes = "; ".join(f"line {e['line']} `{e['key']}`: `{e['old_text']}` -> `{e['new_text']}`" for e in p["edits"])
            out.append(f"- `{p['file']}` {changes} "
                       f"({p['name']}; official change effective {p['effective_from']}; source {p['evidence']['url']})")
            for w in p.get("warnings", []):
                out.append(f"  - check the prose: `{w}`")
        out.append("")
    if rejected:
        out += ["## Left for a person", ""]
        for r in rejected:
            p = normalize(r["proposal"])
            where = ", ".join(str(e.get("line", "?")) for e in p["edits"])
            out.append(f"- `{p.get('file', '?')}` line {where} ({p.get('name', '')}): {r['reason']}")
        out.append("")
    if others:
        out += ["## The data disagrees with an official statement (a person decides)", ""]
        out += [f"- {o['name']}: {o['detail']}" for o in others]
        out.append("")
    if not applied and not rejected and not others:
        out += ["Nothing to change.", ""]
    return "\n".join(out)


# --------------------------------------------------------------------------
# entry point
# --------------------------------------------------------------------------

def gather(sources: list[dict], fetcher, today: str, repo: Path, gap: float, sleep=time.sleep,
           run=None, others: list | None = None, counts: dict | None = None) -> tuple[list[dict], int]:
    """Reads the official files twice, `gap` seconds apart, and keeps only
    findings that came out identical both times. Returns (confirmed findings
    that carry a change, number of action-level disagreements seen on the
    first read). Confirmed disagreements with no change to propose are added
    to `others` so the report can list them for a person."""
    if run is None:
        import reconcile  # noqa: PLC0415
        run = reconcile.run
    first_at = dt.datetime.now(dt.timezone.utc)
    first = run(sources, fetcher, today, repo)
    sleep(gap)
    second_at = dt.datetime.now(dt.timezone.utc)
    second = run(sources, fetcher, today, repo)

    def key(f):
        return (f["kind"], f.get("code", ""), json.dumps(f.get("change"), sort_keys=True), f.get("detail", "") if not f.get("change") else "")

    later = {key(f): f for f in second}
    confirmed = []
    for f in first:
        if key(f) not in later:
            continue
        if f.get("change"):
            f = dict(f)
            f["reads"] = [{"at": first_at.isoformat(), "value": f["change"]["new"]},
                          {"at": second_at.isoformat(), "value": later[key(f)]["change"]["new"]}]
            confirmed.append(f)
        elif others is not None and f["severity"] == "action":
            others.append(f)
    if counts is not None:
        for f in first:
            if f["severity"] == "action":
                counts[f.get("source_id", "")] = counts.get(f.get("source_id", ""), 0) + 1
    return confirmed, sum(1 for f in first if f["severity"] == "action")


def run_all(sources: list[dict], fetcher, today: str, repo: Path, text_of) -> list[dict]:
    """Every check the watcher can make against the data: the structured
    official files (reconcile.py) and the values official documents state
    (extractors.py)."""
    import extractors  # noqa: PLC0415
    import reconcile  # noqa: PLC0415

    found = reconcile.run(sources, fetcher, today, repo)
    registry = extractors.load(repo / "watcher" / "extractors.json")
    tracked = {s["id"]: s for s in sources}
    wanted = {x["source_id"] for x in registry} | {a["source_id"] for x in registry for a in x.get("also", [])}
    texts = {}
    for sid in sorted(wanted & set(tracked)):
        f = fetcher(tracked[sid]["url"])
        if f.ok:
            try:
                texts[sid] = text_of(tracked[sid], f)
            except Exception:  # noqa: BLE001 - an unreadable document is "no statement", never a value
                continue
    return found + extractors.findings(registry, texts, tracked, today, repo)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--apply", action="store_true", help="write the accepted changes (needs enabled: true)")
    ap.add_argument("--commit", action="store_true", help="with --apply: commit exactly the fixed files (the caller pushes)")
    ap.add_argument("--guard", metavar="REV", help="exit 1 if commit REV touches anything but what it says it fixed")
    ap.add_argument("--repo", default=str(REPO))
    args = ap.parse_args(argv)
    repo = Path(args.repo)
    if args.guard:
        stray = guard_commit(repo, args.guard)
        print("stray files in the commit: " + ", ".join(stray) if stray else "the commit touches only what it fixed")
        return 1 if stray else 0
    sys.path.insert(0, str(HERE))
    import watch  # noqa: PLC0415

    cfg = load_config(repo / "watcher" / "autoupdate.json")
    if os.environ.get("AUTOUPDATE_PAUSED", "").lower() == "true":
        cfg["enabled"] = False  # the emergency stop: a repository variable, no code change needed
    sources = json.loads((repo / "watcher" / "sources.json").read_text())["sources"]
    today = dt.date.today().isoformat()
    gap = max(cfg["min_confirm_gap_seconds"] + 2, 2)
    others: list[dict] = []
    counts: dict = {}
    confirmed, total = gather(sources, watch.fetch, today, repo, gap, others=others, counts=counts,
                              run=lambda srcs, fetcher, day, r: run_all(srcs, fetcher, day, r, lambda s, f: watch.extract(s, f).text))
    accepted, rejected = triage(proposals_from(confirmed, repo, today), cfg, repo, sources, today, total, counts=counts)

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
    text = report(accepted, rejected, mode, today, note, others)
    (repo / "watcher" / "reports").mkdir(exist_ok=True)
    (repo / "watcher" / "reports" / "autoupdate-latest.md").write_text(text)
    (repo / "watcher" / "reports" / "autoupdate-latest.json").write_text(json.dumps(
        {"date": today, "mode": mode, "applied": accepted if mode == "applied" else [],
         "would_apply": accepted if mode != "applied" else [], "left_for_a_person": rejected,
         "disagreements_for_a_person": [{"name": o["name"], "detail": o["detail"], "jurisdiction": o.get("jurisdiction", "")} for o in others]}, indent=2) + "\n")
    log([{"date": today, "mode": mode, "id": p["id"], "result": "applied" if mode == "applied" else "eligible",
          "edits": [(e["key"], e["old_text"], e["new_text"]) for e in p["edits"]]} for p in accepted]
        + [{"date": today, "id": r["proposal"].get("id", "?"), "result": "left for a person", "reason": r["reason"]} for r in rejected],
        repo / "watcher" / "autoupdate-log.jsonl")
    if args.commit and mode == "applied":
        sha = commit_applied(repo, accepted, today)
        print(f"committed {sha}")
    print(text)
    return 0


if __name__ == "__main__":
    sys.exit(main())
