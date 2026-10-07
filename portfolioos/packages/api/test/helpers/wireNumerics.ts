/**
 * "Every numeric on the MF analytics wire is a Decimal string."
 *
 * Lifted verbatim out of `test/routes/mfAnalytics.routes.test.ts` when a second
 * route suite (`mfFindings.routes.test.ts`, Task 5.6) needed the same check.
 * It lives here rather than being copied because the value of the walker is
 * entirely in its allow-list: a duplicated list gets a key appended to one copy
 * and not the other, and the suite that did not get the key starts failing on a
 * legitimate count while the suite that did stops catching a lost brand. One
 * list, two callers, no drift.
 *
 * `mfAnalytics.types.ts` states the rule: every numeric is a branded
 * `Money` / `Ratio` / `Pct` string except "genuine counts and day-differences,
 * which are integers by nature and carry no precision risk". `COUNT_KEYS` IS
 * that exception set, enumerated. A number under any other key is a monetary or
 * ratio value that lost its brand somewhere between Postgres and the socket —
 * the bug this walker exists to catch, and one `tsc` cannot see because a JSON
 * response is `unknown`.
 *
 * **Extend the list; never widen the walker.** Adding a key here is a claim
 * that the field is a count. Making `offendingNumbers` more forgiving would
 * silently retire the whole check.
 */

/** Keys whose value is legitimately a JSON number. */
export const COUNT_KEYS = new Set([
  'horizonYears',
  'observationsMonthly',
  'observations',
  'windowYears',
  'year',
  'rank',
  'universeSize',
  'quartile',
  'maxDrawdownDurationDays',
  'recoveryDays',
  'numHoldings',
  'managerChangesLast3y',
  'exitLoadMaxDays',
  'rating',
  'daysUpTo',
  'memberCount',
  'totalHoldings',
  'holdingDays',
  'daysToLtcg',
  'holdingPeriodDays',
  'fundCount',
  'equityFundCount',
  // Whole months of NAV history behind an unrated score (06 §6's
  // "Unrated - N months of history" copy). A count, like the rest of this
  // list -- no fractional months, no precision risk.
  'historyMonths',
  // `MfRuleRunRecord.emitted` — how many findings a rule produced on this run.
  // A tally of rows, not a measurement; it is what makes "this rule ran and
  // said nothing" distinguishable from "this rule was never asked" (05 §7).
  'emitted',
]);

/** Every `path -> number` in the payload that is NOT an allowed count. */
export function offendingNumbers(node: unknown, path = '$'): string[] {
  if (typeof node === 'number') {
    const key = path.slice(path.lastIndexOf('.') + 1).replace(/\[\d+\]$/, '');
    return COUNT_KEYS.has(key) ? [] : [`${path} = ${node}`];
  }
  if (Array.isArray(node)) {
    return node.flatMap((v, i) => offendingNumbers(v, `${path}[${i}]`));
  }
  if (typeof node === 'object' && node !== null) {
    return Object.entries(node).flatMap(([k, v]) => offendingNumbers(v, `${path}.${k}`));
  }
  return [];
}
