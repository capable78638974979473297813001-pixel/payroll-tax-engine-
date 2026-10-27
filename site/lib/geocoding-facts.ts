/**
 * What the address geocoding achieves, as measured by `npm run coverage:geocode`, which resolves one
 * real address in each of the 51 jurisdictions through the same pipeline POST /v1/address uses.
 * The figures are copied from docs/geocoding-coverage.md; tests/seo-comparison.test.ts fails if they
 * drift from that file, so a marketing page cannot quote a number the measurement does not support.
 */
export const GEOCODE = {
  measuredOn: '2026-10-07',
  jurisdictionsTested: 51,
  /** Resolved to something better than the Census geocoder's own position along the street. */
  betterThanInterpolation: 50,
  /** A point published for the exact address by the government that assigns addresses. */
  rooftop: 36,
  /** A house-level OpenStreetMap point that agrees with the Census position. */
  rooftopOsm: 11,
} as const;

/** The states with the most local jurisdictions, largest first, from the coverage data. */
export function topLocalStates(byState: Record<string, number>, names: Record<string, string>, n = 4): { name: string; count: number }[] {
  return Object.entries(byState)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([code, count]) => ({ name: names[code] ?? code, count }));
}
