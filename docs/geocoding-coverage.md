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
| `rooftop-osm` | OpenStreetMap holds a house-level point for this address **and** it agrees with Census's own position. Crowd-sourced, corroborated. | Nominatim structured lookup |
| `neighbor` | This exact number isn't published, so the point is interpolated between the two nearest published points on the same street. Block-level. | National Address Database |
| `interpolated` | Census's own position along a TIGER/Line address range, at the curb. What this project had before any of the above. | Census geocoder |

The tiers are tried in that order, and each one refuses rather than
guesses — see `geocode/rooftop.ts` for the guards on each.

## Measured result

**51 of 51 jurisdictions resolve to something better than Census's own
interpolation**, correcting it by 8m to 269m (median 90m).

| Tier | Count |
| --- | --- |
| `rooftop` (authoritative) | 34 / 51 |
| `rooftop-osm` (house-level, corroborated) | 16 / 51 |
| `neighbor` (block-level) | 1 / 51 |
| `interpolated` (no improvement available) | 0 / 51 |

### Per jurisdiction

| | Tier | Correction | Published by |
| --- | --- | --- | --- |
| AK | `rooftop-osm` | 33m | — |
| AL | `rooftop` | 124m | Alabama 911 Board |
| AR | `rooftop` | 105m | Arkansas Geographic Information Office |
| AZ | `rooftop` | 146m | State of Arizona |
| CA | `rooftop` | 112m | Sacramento County CA |
| CO | `rooftop` | 90m | Colorado OIT GIS |
| CT | `rooftop-osm` | 125m | — |
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
| ND | `rooftop-osm` | 8m | — |
| NE | `rooftop` | 50m | State of Nebraska |
| NH | `rooftop-osm` | 28m | — |
| NJ | `rooftop` | 88m | State of New Jersey |
| NM | `rooftop` | 145m | University of New Mexico EDAC |
| NV | `rooftop-osm` | 8m | — |
| NY | `rooftop` | 57m | New York State Geospatial Services |
| OH | `rooftop` | 82m | State of Ohio |
| OK | `rooftop-osm` | 167m | — |
| OR | `rooftop` | 67m | Oregon Department of Administrative Services |
| PA | `rooftop-osm` | 131m | — |
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
