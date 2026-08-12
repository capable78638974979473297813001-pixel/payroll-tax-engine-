/**
 * All money in this engine is integer cents. Never floats.
 *
 * Payroll is one of the few domains where a half-cent error is a compliance
 * problem, not a rounding nit: withheld amounts must tie out to the penny
 * against quarterly 941 filings. Floating point `0.1 + 0.2` bugs surface as
 * unbalanced tax deposits months later, so we keep an integer representation
 * everywhere and round only at explicit, named boundaries.
 */

export type Cents = number;

/** Parse a dollar figure from a data file into cents. */
export function dollars(amount: number): Cents {
  return Math.round(amount * 100);
}

/** Format cents for display / logging. */
export function fmt(cents: Cents): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
  return neg ? `-$${s}` : `$${s}`;
}

/**
 * Round a raw cents figure half away from zero.
 *
 * Half-up is what the IRS and every state agency assume in their worked
 * examples; banker's rounding would drift against published answers. This is
 * THE rounding boundary — see docs/rounding-and-precision.md rule 3.
 */
export function roundHalfUp(raw: number): Cents {
  return raw >= 0 ? Math.round(raw) : -Math.round(-raw);
}

/** Apply a single rate to a base, rounding once at emission. */
export function applyRate(base: Cents, rate: number): Cents {
  return roundHalfUp(base * rate);
}

/** Clamp to non-negative. Withholding is never negative. */
export function atLeastZero(cents: Cents): Cents {
  return cents > 0 ? cents : 0;
}

/**
 * Remaining room under a wage base cap, given year-to-date wages already
 * counted toward it. Returns the portion of `current` that is still taxable.
 */
export function underCap(current: Cents, ytd: Cents, cap: Cents | null): Cents {
  if (cap === null) return current;
  const room = atLeastZero(cap - ytd);
  return Math.min(current, room);
}

/**
 * Portion of `current` that falls ABOVE a threshold, given YTD wages.
 * Mirror image of `underCap` — used for Additional Medicare.
 */
export function overThreshold(current: Cents, ytd: Cents, threshold: Cents): Cents {
  const totalAfter = ytd + current;
  if (totalAfter <= threshold) return 0;
  const excess = totalAfter - threshold;
  return Math.min(current, excess);
}

/** Round to whole dollars (IRS permits this for withholding). */
export function toWholeDollars(cents: Cents): Cents {
  return Math.round(cents / 100) * 100;
}
