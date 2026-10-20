# Source watch

Every day at 4 AM US Eastern, this checks every official source behind the
tax engine and writes a short report of what changed, what didn't, and what
couldn't be checked. It replaces nothing in `harvester/`; it's a separate
tool.

**Today's report:** [`reports/latest.md`](reports/latest.md) (one file per day
in `reports/`, plus `latest.json` for scripts). When anything changes, the
workflow also opens a GitHub issue with the report.

## What it watches

`sources.json`, about 550 sources in 44 jurisdictions (see "Scope" below), built from two places:

- **`curated.json`**: each state agency's withholding / employer page, plus
  the federal publications (Pub 15, 15-T, W-4, IRS draft forms, contribution
  limits, FUTA credit reductions). These are where *new* documents appear,
  often at a new address. Arkansas's 2026 rate cut is the example: the new
  formula went up at a new URL while the old PDF stayed up unchanged.
- **Every official URL cited in `data/`**: the documents the engine's numbers
  came from, each tagged with the data files that use it.

Add sources to `curated.json` (or cite them in `data/`), then run
`python watcher/build_sources.py`. The workflow re-runs that before each
watch, so new citations in `data/` are picked up automatically.

Beyond the agencies' rule pages, the curated list includes **where changes are
announced first**, as index pages so a new item shows up as a new link: each
covered state's tax-agency news, bulletin or notice page, Ohio's regional tax
agencies (RITA, CCA), and the Finder's directories of jurisdictions.

## Scope

The watcher covers **every jurisdiction that levies an income tax on wages or
any local tax the engine applies to a paycheck**, plus federal. Any of them can
legislate or reissue its tables on any date, and local governments change rates
on any date, so none is left to "we'll catch it at the January refresh".

- **Covered (44):** federal and 43 states/DC: all 41 states with a wage income
  tax plus DC, and Washington (Seattle's payroll expense tax).
- **Left out (9):** AK, FL, NH, NV, SD, TN, TX, WY, which have no wage income
  tax and no local wage or payroll tax in the data, and AS (territory minimum
  wage). `watcher/test_coverage.py` fails if a state with a wage income tax or
  a local tax in `data/` is not covered, or if a left-out state gains one.
- Each covered state has its agency's withholding page plus a news or notices
  page (`"kind": "index"`, so a new link is reported), and every official URL the
  data cites. A newly covered jurisdiction is recorded as "New" on its first
  run, not reported as a change.
- To change the list, edit `scope.json` and re-run `build_sources.py`; the data
  files and `curated.json` are never touched.
- A state-code key in a data file (`"TX": {...}`) attributes the cites beneath
  it to that state, so e.g. a state's garnishment statute follows its scope.

## Reading what pages link to

A landing page often stays the same while the document behind it changes: a
village posts a new withholding notice at the same address, a county swaps the
rate sheet. So **every page** the watcher visits also has the documents it
links to read, one level deep: PDFs, Word and Excel files, CSV and text, on the
page's own site or any other `.gov`/`.us`/`.mil` site, including files whose
address has no extension (`/download`, `/documents/`, `/dam/`, `/dA/`). Each
becomes its own watched source (id `<page>~<hash>`, titled "... (linked from
...)"), compared and confirmed like any other, so a change to the notice is
reported even though the page never moved.

- `"follow": false` opts a page out; `"follow_limit": N` changes the 150-per-page
  cap (a page with more says so in `state.json` as `follow_skipped`). Across the
  whole list the cap is 3,000 documents.
- **Time budget.** Pages are read first, then documents in batches until 40
  minutes have passed since the run began (`--max-minutes`, at least 10 minutes
  are always left for documents). Documents already being watched go first, so a
  backlog of first snapshots can never starve change detection; whatever is left
  is read at the start of the next run, and the report says how many were
  deferred and that they are not being watched until then. A first run over a
  few hundred new documents therefore takes a few days to finish, not one job.
- A linked document that can't be read (a dead link on someone else's page) is
  counted in the report's coverage line, not escalated as broken.
- A document that stops being linked is dropped from the state.
- **Scanned PDFs** have no text to compare, so the file itself is fingerprinted.
  Until 2026-10 that fingerprint was erased by the noise filter, which meant a
  scanned document could be replaced with a different one and never show a
  change (three Kentucky city and county sources were affected). Fixed; sources
  stored the old way are re-baselined quietly the first time.

## Checking the data against official files

Watching a page cannot notice a row added to a spreadsheet. Ohio's Finder
publishes the municipal and JEDD/JEDZ rate files the engine's data came from;
`reconcile.py` reads each file row by row and compares it with `data/local/`.
A source opts in with `"reconcile": "oh_municipal"` or `"oh_jedd"`, and
`"directory"` can name the official list of jurisdictions.

| Finding | Meaning | Counts as |
|---|---|---|
| `missing_from_engine` | The official file has a taxing municipality the data lacks | needs attention |
| `rate_differs` | Official rate differs from the engine's (as of today, with `rateHistory`) | needs attention, unless the entry carries a `$correctionNote`/`sourceNote` |
| `scheduled_change_missing` | The official file schedules a rate change the engine doesn't have yet | needs attention |
| `not_in_official_file` | The engine has a row the official file lacks | information if added by hand, needs attention otherwise |
| `backfill_municode` | The official directory can fill in a blank municode | information |
| `unreadable` | The file couldn't be read or parsed (a truncated download is not trusted) | needs attention |

The Finder's CSV is read through the Finder's own public download link
(`/api/file-downloads/content?target=...`), the one its "File downloads" tab
uses; the direct `api.thefinder...` address answers 401 to everyone. The
Finder lags: a municipality can be in its directory for months before its
rate rows appear (Woodville, July 2026), so this catches what the Finder knows
and the engine doesn't, not what neither knows. For that, the local
government's own pages are watched (and, with `follow`, their documents).

## Fixing a number on its own (built, switched off)

`autoupdate.py` can correct a number in `data/` without a person typing it, but
only the smallest thing that is safe to automate: **replace one number on one
line**. Everything in `data/` feeds a paycheck, so it has no other powers. It
cannot add or delete a line, entry or file, touch code, tests, the site or
notes, or change anything that is not a plain `"rate": 0.0125` line.

It ships **off**. `watcher/autoupdate.json` has `"enabled": false` and the
workflow's `AUTOUPDATE_ENABLED` repository variable is unset. Switched off, it
still runs every day in check-only mode and writes
[`reports/autoupdate-latest.md`](reports/autoupdate-latest.md): what it would
have changed and, for everything else, the rule that kept it from changing it.
Read that for a few weeks before turning it on.

### What it covers, state by state

`autoupdate-coverage.json` is the ledger: for **every** covered jurisdiction it
says what auto-update can correct by itself (**automatic**), what it only
compares with the official source and reports (**report only**), and what is left
to a person and why. `test_coverage.py` enforces that every jurisdiction in
scope is in it, that every item points at a real reader and (for automatic
ones) a rule that covers its exact lines, and that no reader is unlisted.

| Source of the number | Where | Tier |
|---|---|---|
| Ohio Finder rate files, row by row, with effective dates | OH municipal rates, OH JEDD/JEDZ rates (rate and its `rateSourceRaw` percent move together) | automatic |
| A sentence in an official document that names the year ("For 2026, the state ... rate ... is 2.95%") | IL, MI (rate, exemption; a second Treasury notice must agree), KY (rate, standard deduction), IN, LA, MS | automatic |
| A sentence that does not name the year | PA, IA, CT, NC, AZ, CO, MA, DE, MD, MN, AR, WI, SC, HI, DC, VA | report only |
| A table in an official file | Indiana county rates (compared daily, 92 rows) | report only |
| Per-period tables, bracket schedules, mid-year dated rows, city/county registries with no bulk file | the rest (see the ledger for each state and the reason) | a person |

Why the year matters: a document that says "for 2026" is stating a value for
the whole of 2026, which is what makes a one-line edit right for every pay date
in that year's file. A sentence with no year might describe a mid-year change,
and applying it to the whole year would be wrong for earlier paychecks, so it
is only ever reported. Readers live in `extractors.json`; each is a pattern, the
data lines it owns, and a frozen excerpt of the real sentence it was written
against, which the tests re-read. `python watcher/extractors.py --refresh`
rebuilds the excerpts from the stored snapshots and confirms the data agrees.

The January swap (every state publishing its new-year document) is expected to
trip the circuit breaker below; that is by design, and a person takes that batch.

### The rules

A proposal comes from `reconcile.py` (structured official files) or
`extractors.py` (stated values). It is applied only if **every** rule holds,
re-checked immediately before writing:

| Rule | What it stops |
|---|---|
| Names the exact file and line(s) and the exact text expected on each; at most six edits, all in one file | Editing a line that moved or changed since the proposal |
| File is a tracked `.json` under `data/`, matches an allow-list rule in `autoupdate.json`, not a symlink, this year or later | Code, tests, site, other repos' files, past years (those paychecks are final) |
| Each line is `"<key>": <number>` (or a mirrored `"<key>": "<percent>"`) and the key is on the rule's list; only the number is swapped (indent, key and comma byte-identical). Linked lines (a rate and its copy, its percent string, or a total that is the sum of its parts) must satisfy their stated relation | Rewording, reformatting, a rate changed without its mirror |
| File still parses and a deep comparison finds **exactly one** differing value, a number | Duplicate keys, an edit that lands somewhere unintended |
| New value inside the rule's min/max and no further than `max_abs_change` from the old; neither old nor new is zero | Wild values; repealing a tax or starting one (a person's call) |
| Entry has no `rateHistory`, no `sourceNote`/`$correctionNote`/`$addedNote`, no end date, and no field that mirrors the value unless that field is part of the change | Overwriting a hand-checked value; leaving a mirror stale |
| A feed's change took effect on or before January 1 of the file's year, or a document's sentence names the file's year and the pattern is year-anchored | A mid-year change, which needs a dated row (a structural edit, so a person's) |
| Evidence is a source in `sources.json`, at that address, over https, on an allow-listed host, read **twice**, apart by `min_confirm_gap_seconds`, same answer both times, fresh | A glitchy download, a spoofed or stale source |
| Circuit breaker: more than `max_changes_per_run` eligible changes, or more than `max_findings_per_run` disagreements of any kind, applies **nothing** | The official file changing shape, which looks like hundreds of "corrections" |
| After the write: the generated edge bundle is rebuilt, `git status` may show only the intended file plus that bundle, the diff must be exactly one removed and one added line per change, and the full test suite must pass | Side effects; a change the engine cannot absorb. Any failure restores every touched file |

Applied changes are never committed to the default branch. The workflow puts
them on `autoupdate/<date>` and opens a pull request whose body lists each file,
line, old and new value and source. A person reviews and merges it.

Everything it declines goes to the same report and the standing needs-attention
issue as before. `watcher/autoupdate-log.jsonl` records every decision.

To turn it on: set `"enabled": true` in `autoupdate.json` **and** the repository
variable `AUTOUPDATE_ENABLED` to `true`, and allow Actions to create pull
requests (Settings -> Actions -> General). A pull request opened with the
default token does not trigger other workflows, so run the tests from the
branch before merging. To widen it, add a rule (a new glob/key with bounds and
hosts) in `autoupdate.json`; there is no way to widen it from a data file or a
proposal.

```sh
python watcher/autoupdate.py             # check and report, write nothing
python watcher/autoupdate.py --apply     # write too (needs "enabled": true)
python -m unittest watcher/test_autoupdate.py
AUTOUPDATE_E2E=1 python -m unittest watcher.test_autoupdate.AgainstTheRealEngine   # real build + real suite, in a clone
```

## Needs attention

A run with no changes is not an all-clear if an official bulk file the data is
built from can't be read. Sources marked `"critical": true` are raised at the
top of the report ("Needs attention") the first time they have never been read,
or after 3 failed runs in a row, along with any `action` finding above. The
workflow keeps one standing issue current with that list. Previously such a file
(the Finder rate CSV) sat unreadable for every run since the watcher began, as
one line among dozens of blocked sites.

## Sites that turn away scripts

Some official sites refuse plain HTTP requests (403) or only render with
JavaScript. Two things handle those:

- **Official APIs first.** Where an agency publishes a machine-readable
  API it replaces the blocked page (`"replaces"` in `curated.json`):
  eCFR's amendment history for the cited regulations, and Federal Register
  feeds for new Wage and Hour Division documents, IRS withholding rules and
  SSA's yearly wage-base notice (the ssa.gov wage-base page blocks scripts).
- **A real browser second.** Anything still blocked is retried once in
  headless Chromium (Playwright). It identifies itself with the same user
  agent that names this tool, visits each site once a day, and doesn't
  solve CAPTCHAs or hide that it's automated. A site that refuses a real
  browser too stays listed under "Blocks bots" for a manual check.

**What this does not do.** It doesn't spoof a browser fingerprint, rotate
addresses, solve CAPTCHAs or otherwise defeat a site's bot protection, and it
never turns TLS verification off. When a source is blocked the fix is a
different official address for the same document: the agency's API or feed, the
statute itself, the site's own download link (that is how the Finder's rate
file is read), or a sister agency that publishes it. A site that publishes only
behind bot protection stays on the "Blocks bots" list until someone finds one.

**Incomplete certificate chains.** Some official sites forget to send their
intermediate certificate; Python then can't verify them though every browser
can (browsers fetch the missing piece themselves). Those get the same browser
retry as blocked sites. An expired or otherwise invalid certificate is not that
case and stays a failure.

Where a blocked page has an official equivalent that allows automated
checks, the equivalent replaces it: the statute instead of the agency's
summary page (NH RSA 279:21), the agency's own PDF instead of its web page
(Arkansas UI handbook), the Workers' Compensation Board and State
Comptroller instead of paidfamilyleave.ny.gov, govinfo.gov instead of
congress.gov, and so on (`"replaces"` in `curated.json`).

### API keys

Some official APIs need a free key. A source URL can carry
`{env:NAME}`; the key is read from that environment variable at fetch time
and is never written to reports, state or snapshots. Without it, the source
is listed as needing a key. Current keys (add each as a repository secret):

| Secret | Used for | Get one |
|---|---|---|
| `NYSENATE_API_KEY` | NY Labor Law and Election Law text | https://legislation.nysenate.gov (free sign-up) |

## How it decides something changed

1. **Reduce to what a person reads.** For PDFs that's the text (so a
   re-export with a new creation date isn't a change). For web pages it's
   the main content, with scripts, menus, headers, footers, "last updated"
   stamps, copyright years, session tokens, clock times and cache-busting
   `?ver=` links stripped out.
2. **Compare with yesterday's snapshot** (text and the list of document
   links). Snapshots are in `state/snapshots/`, gzipped.
3. **Confirm.** A difference is only reported after a second fetch 20
   seconds later returns the same new content. A difference that doesn't
   come back is ignored. A page that comes back different every time is
   reported as *unstable* and its snapshot isn't touched.

**Real vs. minor changes.** If the only lines that changed are the text of
links to other pages (a "latest news" box, a menu), the change is recorded
as *minor*: collapsed in the report, no issue opened. Anything else counts:
the page's own text, a figure, a document link added or removed, or a new
redirect target. Busy index pages can also be narrowed with `"keep"`
(regexes; only matching lines and links are compared). The IRS draft-forms
list uses it to watch payroll forms only.

For each change the report shows the changed lines, the dollar amounts and
percentages that appeared or disappeared (e.g. `3.9%` → `3.7%`), and any
document links added or removed.

## Statuses

| Status | Meaning |
|---|---|
| Changed | Confirmed new content. The snapshot moves forward. |
| Minor | Only link lists or headlines changed. Recorded; no issue. |
| Unchanged | Same as last time. |
| New | First time seen; snapshot taken. |
| Unstable | Differs on every request. Fix with an `ignore` pattern or a `contains` range in `curated.json`. |
| Unreachable | Network error or server error this run. The snapshot is kept. |
| Gone (404) | The address no longer exists, which often means a new version is published elsewhere. |
| Blocks bots | The site refuses automated requests (403) or only renders with JavaScript. Check it by hand. |
| Broken | Failing 3+ runs in a row. Replace the URL. |

## Running it yourself

```sh
pip install -r watcher/requirements.txt
python -m playwright install chromium   # for the browser fallback
python watcher/watch.py                 # everything (about 4 minutes)
python watcher/watch.py --only AR,US    # some jurisdictions
python watcher/watch.py --dry-run       # don't save anything
python -m unittest watcher/test_watch.py
```

The scheduled run lives in `.github/workflows/source-watch.yml`. GitHub only
runs schedules on the default branch, so it starts once this is merged.
To change the time zone, edit `WATCH_TZ` there.
