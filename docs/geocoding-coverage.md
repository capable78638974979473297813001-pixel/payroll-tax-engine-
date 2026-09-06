# Address resolution: what it actually achieves, state by state

Local payroll taxes are decided by *where an address is*, not by what it
says. A point on the wrong side of a municipal line withholds the wrong
tax. So the question this document answers is not "does the geocoder
work" but "how precisely does it place an address, in each state, and how
do we know".

Everything below is measured, by a script in this repo:

```
npm run coverage:geocode
```

It resolves one real, Census-verified address in each of the 51 US
jurisdictions through the same pipeline `resolveAddress()` uses, and
reports which tier answered. The numbers here come from that script and
nowhere else. Re-run it and the table should reproduce, give or take
whatever the underlying public services have published since.

## The tiers

`resolveAddress()` returns a `precision` field naming which of these
produced the coordinate its jurisdictions were resolved at.

| `precision` | What it means | Source |
| --- | --- | --- |
| `rooftop` | A point published for this exact address by the government that assigns addresses — usually for E911 dispatch. | [National Address Database](https://www.transportation.gov/gis/national-address-database) (US DOT), ~98M points |
| `neighbor` | This exact number isn't published, so the point is interpolated between the two nearest published points on the same street. Block-level, but still built from two real surveyed government points. | National Address Database |
| `rooftop-osm` | OpenStreetMap holds a house-level point for this address **and** it agrees with Census's own position. Crowd-sourced, corroborated. | Nominatim structured lookup |
| `parcel-centroid` | A COUNTY government's own tax-parcel polygon matched this address and its area passed a "single building, not a whole campus" gate. Only ever used in place of `rooftop-osm`, and only when it lands measurably closer to Census's own point — see "A fifth tier" below. | An individually-verified county GIS service — no national registry exists |
| `interpolated` | Census's own position along a TIGER/Line address range, at the curb. What this project had before any of the above. | Census geocoder |

The tiers are tried in that order, and each one refuses rather than
guesses — see `geocode/rooftop.ts` for the guards on each. `neighbor` is
checked before `rooftop-osm` (moved 2026-09-02: it used to be tried
after) because a gap- and span-guarded NAD bracket is built from two real
surveyed government points, a better kind of evidence than a
crowd-sourced point that merely doesn't disagree with Census's own rough
interpolation — verified live: Hartford, CT's sample address used to fall
to `rooftop-osm` purely because that tier was checked first, when a
tight, guarded NAD bracket (168 and 223 Capitol Ave, 200m apart) was
available the whole time and is now what it resolves to.

## Measured result

**50 of 51 jurisdictions resolve to something better than Census's own
interpolation**, correcting it by 5m to 269m (median 90m).

| Tier | Count |
| --- | --- |
| `rooftop` (authoritative) | 35 / 51 |
| `rooftop-osm` (house-level, corroborated) | 12 / 51 |
| `neighbor` (block-level, authoritative) | 2 / 51 |
| `parcel-centroid` (county GIS, gated) | 1 / 51 |
| `interpolated` (no improvement available) | 1 / 51 |

### A fifth tier: county tax-parcel centroids, and why it took two tries to get right

Chasing why 9 states have ZERO National Address Database points within
300m of their sample address (verified live by querying NAD directly, not
assumed): many COUNTY governments separately publish their own tax-parcel
GIS layer, carrying a site address and a polygon. That polygon's centroid
can stand in for a rooftop point — but proven BOTH WAYS in the same
session: Pennsylvania's Capitol address has no NAD point, but Dauphin
County's own parcel GIS carries a 287 sqm parcel (a single state office
building, unattributed in the county's own address fields — the pattern a
government building with no ordinary postal address shows) whose centroid
lands 68m from the true address, IMPROVING on the 131m `rooftop-osm`
fallback already in place. Mississippi's Capitol address also has no NAD
point, and Hinds County's own parcel GIS carries a parcel for the same
kind of complex — but it is 31,551 sqm, the entire capitol grounds, and
its centroid lands 146m away, WORSE than the 8m `rooftop-osm` fallback
already in place there. Same technique, opposite verdict, because a tax
parcel is a legal property boundary, not a surveyed structure point — its
centroid only approximates "where is the building" when the parcel holds
one building, not a whole campus.

The FIRST implementation of the size gate above still produced a wrong
answer for a normal (non-government) address: given several small parcels
near an interpolated point, picking "whichever is closest" chose a real,
correctly-surveyed, but WRONG parcel — one attributed to house number 400,
a different building, when the target was 501. Distance to a point says
nothing about whether a parcel IS that address; only the parcel's own
address fields do. Fixed by classifying every candidate against the
target address FIRST (`geocode/parcel.ts`'s `classifyParcelAddress`) —
an EXACT match on house number and street (with the same directional-
and, newly, street-type-suffix fallback `rooftop.ts` already uses for
NAD) is preferred outright; an UNATTRIBUTED parcel (no house number at
all, the government-building pattern above) is used only when no exact
match exists; a parcel with a real, DIFFERENT address is never used, at
any distance, at any size. `resolveRooftop()` then only lets a
`parcel-centroid` result replace an existing `rooftop-osm` one when it is
the numerically closer of the two to Census's own point — never merely
by existing, so a state with no registered parcel source (every state but
Pennsylvania, as of this pass — there is no national registry of these,
only individually-verified counties) behaves exactly as before.

### A second real bug: "Capital" vs "Capitol"

Found chasing why Kentucky's sample address (700 Capitol Ave, Frankfort)
never even reached the `neighbor` tier despite the National Address
Database publishing 526 points nearby: Census/USPS spell that street
"Capitol Ave" (the building sense, correctly), but Kentucky's own NAD
submission spells every one of its 29 points on the same street "Capital
Avenue" (the common, wrong homophone) — a real, verified spelling split
in the government's own data, not a typo in this project's query. Fixed
the same way the Alaska ordinal-street fix was: a narrow, explicitly
guarded fallback (`streetKeyCapitolNormalized()` in `geocode/buildings.ts`)
tried only after the exact match fails, kept deliberately separate from
`streetKey()` itself because "Capital" and "Capitol" are genuinely
different words elsewhere and conflating them by default would be a
guess, not a correction. For Kentucky's own sample address this doesn't
change the outcome — the nearest NAD point below house number 700 is 616,
an 84-number gap wider than `MAX_NEIGHBOR_NUMBER_GAP` allows, so it
correctly still falls to `rooftop-osm` (9m, tight) rather than force a
bracket that wide — but the fix is real for any Kentucky address on that
street (or elsewhere the same misspelling recurs) that does have a close
enough match.

### A real bug, found by chasing why Alaska sat on `interpolated`

Re-measured 2026-09-01 at a caller's explicit request for rooftop
precision, Alaska was `interpolated` — not a service hiccup, a genuine
match failure. The National Address Database had 475 points within 300m
of "120 4th St, Juneau", including both "FOURTH Street" and "West FOURTH
Street" — but `streetKey()` (`geocode/buildings.ts`) had no concept of a
numbered street written two ways: digits ("4th") against NAD's own word
form ("FOURTH"). Tier 1 (exact match) and tier 3 (neighbor bracket, which
also matches on street name) both silently found nothing, on a street
that had 41 published points on it.

This is not an Alaska quirk — numbered streets are common nationally, and
which convention a given state's address authority uses is arbitrary and
inconsistent even within one state (Juneau's own data has both). Fixed by
teaching `streetKey()` the same digit-and word forms English uses for
ordinals up through the low thousands ("twenty-first" / "Twenty First" /
"21st" all compare equal now, including compounds like "One Hundred
Twenty-Fifth" for cities with numbering that high), the same
expand-to-one-canonical-form approach already used for directionals
("W"/"West") and street types ("St"/"Street") — see `geocode/buildings.ts`
and its new tests in `tests/geocode.test.ts`. Alaska now resolves
`rooftop` at 14m, its correct tier all along.

### These numbers still move, and that is not a bug

An earlier run of this same script recorded 51/51, with 16 on
`rooftop-osm` and none left on `interpolated`. North Dakota has sat on
`interpolated` on multiple runs since, for a different and genuine
reason, checked directly: NAD publishes East Boulevard Avenue in Bismarck
densely (602, 604, 606, 612, 624...) but nothing at or below the sample
address's own number (600) to bracket from — tier 3 correctly refuses
rather than inventing a "below" point that doesn't exist. That is a real
data gap in what North Dakota has published, not a bug this project's own
code can fix.

Two of the four tiers depend on services outside this repo — the National
Address Database publishes on its own schedule, and `rooftop-osm` depends
on both what OSM currently holds and whether Nominatim answers. A
jurisdiction sitting on `rooftop-osm` can therefore drop to
`interpolated` on any given day without a line of code changing, and come
back later.

The table above is a measurement with a date on it, not a guarantee. What
IS guaranteed is the refusal: every tier declines rather than guesses, so
a bad day costs precision and never correctness — `interpolated` is
Census's own answer, which is where this project started.

### Per jurisdiction

| | Tier | Correction | Published by |
| --- | --- | --- | --- |
| AK | `rooftop` | 14m | State of Alaska |
| AL | `rooftop` | 124m | Alabama 911 Board |
| AR | `rooftop` | 105m | Arkansas Geographic Information Office |
| AZ | `rooftop` | 146m | State of Arizona |
| CA | `rooftop` | 112m | Sacramento County CA |
| CO | `rooftop` | 90m | Colorado OIT GIS |
| CT | `neighbor` | 148m | Connecticut (neighbouring points) |
| DC | `rooftop` | 111m | OCTO Data Team, District of Columbia |
| DE | `rooftop` | 66m | Kent County Delaware |
| FL | `rooftop-osm` | 63m | — |
| GA | `rooftop` | 86m | City of Atlanta |
| HI | `rooftop-osm` | 52m | — |
| IA | `rooftop` | 111m | State of Iowa |
| ID | `rooftop-osm` | 53m | — |
| IL | `rooftop` | 125m | State of Illinois |
| IN | `rooftop` | 174m | Indiana Geographic Information Council |
| KS | `rooftop` | 147m | State of Kansas |
| KY | `rooftop-osm` | 9m | — |
| LA | `rooftop` | 121m | City of Baton Rouge / East Baton Rouge Parish |
| MA | `neighbor` | 27m | Massachusetts (neighbouring points) |
| MD | `rooftop` | 43m | Maryland Department of Information Technology |
| ME | `rooftop` | 84m | Maine NG911 |
| MI | `rooftop-osm` | 122m | — |
| MN | `rooftop` | 55m | Minnesota Geospatial Information Office |
| MO | `rooftop` | 111m | Missouri GIS Advisory Council |
| MS | `rooftop-osm` | 8m | — |
| MT | `rooftop` | 112m | Montana State Library |
| NC | `rooftop` | 82m | State of North Carolina |
| ND | `interpolated` | — | — (genuine data gap: NAD has no point at or below house number 600 on East Boulevard Ave to bracket from — see above) |
| NE | `rooftop` | 50m | State of Nebraska |
| NH | `rooftop-osm` | 28m | — |
| NJ | `rooftop` | 88m | State of New Jersey |
| NM | `rooftop` | 145m | University of New Mexico EDAC |
| NV | `rooftop-osm` | 8m | — |
| NY | `rooftop` | 57m | New York State Geospatial Services |
| OH | `rooftop` | 82m | State of Ohio |
| OK | `rooftop-osm` | 167m | — |
| OR | `rooftop` | 67m | Oregon Department of Administrative Services |
| PA | `parcel-centroid` | 68m | Dauphin County, PA |
| RI | `rooftop` | 269m | State of Rhode Island |
| SC | `rooftop-osm` | 107m | — |
| SD | `rooftop-osm` | 104m | — |
| TN | `rooftop` | 90m | Tennessee STS GIS Services |
| TX | `rooftop-osm` | 8m | — |
| UT | `rooftop` | 187m | Utah Geospatial Resource Center |
| VA | `rooftop` | 170m | Virginia Geographic Information Network |
| VT | `rooftop` | 138m | Vermont Enhanced 911 Board |
| WA | `rooftop` | 39m | State of Washington |
| WI | `rooftop` | 32m | State of Wisconsin |
| WV | `rooftop` | 152m | West Virginia GIS |
| WY | `rooftop` | 51m | Laramie County Wyoming |

"Correction" is the distance between Census's interpolated point and the
one actually used — i.e. how far off the old answer was for that address.

## What this table does not say

**The sample is downtown.** These are capitol-area civic addresses, one
per state, chosen because they are real, verifiable, and spread across
every state. Downtown is where address data is best. A rural address in
the same state may well fall through to `interpolated`, and this table
would not show it. It answers *"does this state's published address data
reach the pipeline"*, not *"what fraction of US addresses get a rooftop
point"*.

**Authoritative coverage is county-by-county, not state-by-state.** A
state appearing as `rooftop` here means the county containing its capital
contributes to NAD. Another county in the same state may not. Michigan,
for instance, has no statewide address-point publication at all — its row
is `rooftop-osm` for exactly that reason.

**`rooftop-osm` is not authoritative.** OpenStreetMap's house-level
answers are crowd-sourced and can be confidently wrong: for 90 W Broad
St, Columbus, OSM returns a house-level point 897m away, across the
river. That is why this tier only accepts a point that corroborates
Census's own position, and why it is labelled distinctly rather than
folded into `rooftop`. A test in `tests/geocode.test.ts` pins that exact
rejection.

**Precision is not validation.** None of this makes a mistyped or
nonexistent address valid. It places addresses that resolve; it does not
verify that they exist.

## Where the remaining gap is

Real parity with a commercial service would mean authoritative points
everywhere, not authoritative-where-published. The honest path to that is
not a cleverer matcher — it is bulk data: OpenAddresses and NAD both
publish full extracts that could be ingested and queried locally, which
is essentially what a paid provider does on your behalf. That is a
storage-and-refresh commitment this project hasn't made, and until it
does, the tiers above are the ceiling.

---

# Jurisdiction determination

A coordinate is only half the job. The other half is deciding which taxing
bodies contain it, and that is where a geocoder stops being a geocoder.

## Boundaries are read at the point that was actually used

Census's geocoder returns geographies for *the point it chose*. Once an
authoritative address point replaces that position, the jurisdictions get
re-asked at the new coordinate — a TIGERweb `identify` against States,
Counties, County Subdivisions, Incorporated Places and Unified School
Districts. Its results carry Census's own `NAME` spellings ("Columbus
city", "Franklin County") and a real USPS state code, so the matching code
sees exactly the strings it would have seen from the geocoder.

## Boundaries are effective-dated

Cities annex land; districts merge. A paycheck dated in a past year should
be resolved against the boundaries that existed then, so the vintage is
chosen from the check date: `tigerWMS_ACS2015` for 2015, `Census2020` for
2020 (no ACS vintage is published for a decennial year), `Current` for a
date newer than the latest published set.

Layer numbers are **not** stable between vintages — Incorporated Places is
28 in ACS2023 and 26 in Census2020, where States and Counties also shift —
so layers are resolved by name from each service's own metadata rather
than hardcoded. Hardcoding them would silently query the wrong boundary
type on an older date.

## Districts that Census does not publish

Some taxes are levied by bodies that draw their own boundaries and file
them nowhere Census publishes. A perfect coordinate finds nothing, because
the boundary isn't in the data being searched. These are resolved against
the publishing government's own service:

| District | Tax it decides | Source |
| --- | --- | --- |
| Portland Metro | Metro Supportive Housing Services (`certificate.metroDistrict`) | Metro's own RLIS boundary service (live query) |
| Ohio JEDDs / JEDZs | JEDD income tax (`certificate.workJEDDId`) | Ohio's statewide JEDD/JEDZ layer on maps.ohio.gov, 142 zones (live query) |
| TriMet, LTD, SCTD | Oregon transit payroll excises (`certificate.locality`) | ODOT's own statewide transportation-jurisdictions layer, every OR transit district as one live-queryable source — see below |
| Canby | Canby's transit payroll excise (`certificate.locality = 'CanbyTransit'`) | Oregon's own statewide Urban Growth Boundary layer, published by DLCD (live query) — see below |

The Ohio case is the sharpest illustration of why this matters. A JEDD
lets a municipality tax income earned on adjoining **unincorporated**
township land without annexing it. There is no municipality at such an
address, so every place-name match correctly returns nothing — and the
wages are taxed anyway at a municipal rate. Verified end to end: *301
Springside Dr, Akron, OH 44333* resolves to a rooftop point, falls inside
the Bath-Akron-Fairlawn JEDD, and withholds 2.50%. Before this it produced
no local tax line at all.

The boundary layer and the rate file join on Ohio's own `jedd_id`, not on
a name, so no string matching sits between "which zone contains this
point" and "what does that zone charge".

## Oregon's local transit payroll taxes — resolved fully 2026-09-03

Started as "close the TriMet/LTD gap" and grew once the obvious follow-up
question was asked: is this Oregon-only, or does the whole USA need the
same treatment? Researched nationally first — this "a district funds
itself via employer payroll tax instead of property/sales tax" mechanism
turns out to be genuinely Oregon-specific, no other state does it — but
Oregon itself had more of it than this project had modelled: not just
TriMet and LTD, but **Canby, Sandy, Wilsonville (SMART), and South
Clackamas (SCTD)** all levy the same kind of employer excise, previously
completely unmodelled (not even a disclosed knownGap).

Checked Oregon's OTHER transportation districts too, so as not to guess
which ones belonged on this list: Basin Transit (Klamath Falls), Grant
County, Hood River County, Lincoln County, Rogue Valley (Medford), Salem
Area Mass Transit (SAMTD), Sunset Empire (Clatsop County), and Tillamook
County. Confirmed directly that three of these fund themselves via
PROPERTY tax, not payroll — Tillamook ("a property tax levy of twenty
cents per thousand assessed valuation"), Hood River County ("local
property tax, fare revenue... Federal and State funds", no payroll
mention anywhere), and Basin Transit (30% from "a local property tax rate
of $0.48 per $1,000"; its own "payroll tax" references turned out to be
Oregon's existing STATEWIDE transit tax, already modelled separately, not
a district-specific one). The remaining three share the identical
rural-single-county profile and were not individually re-verified — that
part is pattern-matched, not exhaustively primary-sourced.

**The boundary architecture changed too, for the better.** The original
TriMet/LTD work (see git history) resolved LTD against RLID's own
regional service and TriMet against a vendored copy of its KML boundary
file with a hand-written point-in-polygon check — both worked. Then,
while sourcing SCTD's boundary, a single better source turned up: ODOT's
own statewide "jurisdictions" layer (`gis.odot.state.or.us`) carries
EVERY Oregon transportation district — payroll-funded and property-funded
alike — as named polygons. `oregonTransitDistrictAtPoint()` in
`geocode/districts.ts` now queries this one layer for TriMet, LTD, and
SCTD together, mapping only the payroll-funded subset to a locality value
and deliberately leaving the property-funded ones unmatched (setting a
locality for one of those would fabricate a tax that doesn't exist). This
replaced both the RLID query and the vendored TriMet file — the vendored
file is gone entirely, along with the refresh commitment it implied; a
live query never goes stale.

Canby is the one exception: its own transit-tax guide states the
boundary is "the Canby Urban Growth Boundary — an area including and
extending somewhat beyond the city limits of Canby," which is NOT the
same polygon as the "Canby" entry in ODOT's jurisdictions layer (that one
is plain city limits) and genuinely isn't in that layer under any name.
`isInsideCanbyTransitDistrict()` queries a second live source instead:
Oregon's own statewide UGB layer, published by DLCD. Sandy and
Wilsonville, by contrast, really are just their own city limits (each
city's own guide says so directly) — no special boundary lookup needed at
all, just ordinary Census incorporated-place matching, the same mechanism
Denver's and Seattle's local taxes already use.

Verified end to end through `calculatePaycheck()` itself for all six
districts, not just the boundary checks in isolation: real work addresses
in Portland, Eugene, Molalla, Canby, Sandy, and Wilsonville each resolve
the correct `certificate.locality` and produce the correct tax line
(`TRIMET_ER` 0.8237%, `LTD_ER` 0.8000%, `SCTD_ER` 0.5000%,
`CANBY_TRANSIT_ER` 0.6000%, `SANDY_TRANSIT_ER` 0.6000%, `SMART_ER`
0.5000%); a Salem work address, inside none of the six, produces none of
the six lines and nothing in `notResolvable`.

## Still not resolved, and why

- **Four JEDD rate rows have no published boundary.** Ohio's boundary
  layer carries 142 zones against 146 rate rows. An address inside one of
  those four cannot be detected by coordinate, and nothing guesses.
- **No CASS address validation.** A malformed or nonexistent address is
  not corrected, only resolved as best it can be or reported unmatched.
- **Historical dates are gated by rate data, not boundaries.** The vintage
  machinery works for any past year, but this repo currently ships 2026
  rulesets only, so a 2015 check date fails on the missing rate file
  before boundaries ever matter.
