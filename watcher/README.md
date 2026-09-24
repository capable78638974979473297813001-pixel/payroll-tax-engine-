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

For each change the report shows the changed lines, the dollar amounts and
percentages that appeared or disappeared (e.g. `3.9%` → `3.7%`), and any
document links added or removed.

## Statuses

| Status | Meaning |
|---|---|
| Changed | Confirmed new content. The snapshot moves forward. |
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
python watcher/watch.py                 # everything (about 5 minutes)
python watcher/watch.py --only AR,US    # some jurisdictions
python watcher/watch.py --dry-run       # don't save anything
python -m unittest watcher/test_watch.py
```

The scheduled run lives in `.github/workflows/source-watch.yml`. GitHub only
runs schedules on the default branch, so it starts once this is merged.
To change the time zone, edit `WATCH_TZ` there.
