/**
 * Which state a tax line's income tax withholding belongs to.
 *
 * A state's withholding is not only its `XX_SIT` line. The engine also emits
 * `XX_SIT_SUPP` (and California's `_SUPP_BONUS` / `_SUPP_OTHER`) for a bonus
 * taxed at the state's flat rate, and three lines for the employee's HOME
 * state when it is not the work state: `XX_SIT_RECIPROCITY_SWAP`,
 * `XX_SIT_RESIDENCE` and `XX_SIT_CREDIT`. All of it is that state's income
 * tax withheld, so a W-2, a deposit or a quarterly return that read `XX_SIT`
 * alone left the rest out.
 *
 * City lines (`NY_NYC_SIT`, `NY_YONKERS_SIT`) are local taxes and do not
 * match.
 */
const STATE_INCOME_TAX_LINE = /^([A-Z]{2})_SIT(?:_SUPP(?:_BONUS|_OTHER)?|_RECIPROCITY_SWAP|_RESIDENCE|_CREDIT)?$/;

/** The two-letter state a state income tax withholding line belongs to, or undefined for any other line. */
export function stateOfIncomeTaxLine(id: string): string | undefined {
  return STATE_INCOME_TAX_LINE.exec(id)?.[1];
}
