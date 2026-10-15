# Source watch

Every day at 4 AM US Eastern, this checks every official source behind the
tax engine and writes a short report of what changed, what didn't, and what
couldn't be checked. It replaces nothing in `harvester/`; it's a separate
tool.

**Today's report:** [`reports/latest.md`](reports/latest.md) (one file per day
in `reports/`, plus `latest.json` for scripts). When anything changes, the
workflow also opens a GitHub issue with the report.

## What it watches

`sources.json`, about 420 sources in 53 jurisdictions, built from two places:

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

## Reading what pages link to

A landing page often stays the same while the document behind it changes: a
village posts a new withholding notice at the same address, a county swaps the
rate sheet. So an **index** page (`"kind": "index"`) also has the documents it
links to read, one level deep: PDFs, Word and Excel files, CSV and text, on the
page's own site or any other `.gov`/`.us`/`.mil` site. Each becomes its own
watched source (id `<page>~<hash>`, titled "... (linked from ...)"), compared
and confirmed like any other, so a change to the notice is reported even though
the page never moved.

- `"follow": true` does the same for a page that isn't an index; `"follow":
  false` opts an index out; `"follow_limit": N` changes the 25-per-page cap
  (a page with more says so in `state.json` as `follow_skipped`).
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
