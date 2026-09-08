/**
 * `amcCode` → factsheet adapter (`docs/mf-analytics/01-DATA-FOUNDATION.md §4`,
 * `07-IMPLEMENTATION-PLAN.md` Task 1.5).
 *
 * ---------------------------------------------------------------------------
 * The unsupported-AMC contract
 * ---------------------------------------------------------------------------
 *
 * `01 §4` starts the registry with the ten largest AMCs by AUM (~85% of retail
 * holdings) and states what happens for the rest:
 *
 *   > Every AMC not in the registry falls back to `AMC_NOT_SUPPORTED` —
 *   > metadata partially populated from AMFI, holdings absent, and every
 *   > metric that needs holdings gets `INSUFFICIENT_DATA`.
 *
 * That is a NORMAL, EXPECTED OUTCOME, not an error, and this module models it
 * as such: `resolveFactsheetAdapter` returns a discriminated union and
 * `amcNotSupported()` builds the documented failure value. Nothing here ever
 * throws for an unknown AMC.
 *
 * Why it matters that this is not an exception. A user holding a fund from a
 * small AMC is entitled to a partial fund page — NAV, returns, TER from AMFI —
 * with the holdings-derived sections honestly marked "not available". If an
 * unknown AMC threw, the natural implementation of the calling job would be a
 * try/catch that logs and moves on, and the user would get a page that looked
 * identical to a supported fund's except that the concentration numbers were
 * quietly missing. `CONTEXT.md §16.8` states the rule directly: a partial view
 * must SAY it is partial. Making "unsupported" a value rather than a throw is
 * what lets the UI say it.
 *
 * Registering a new AMC is exactly two edits — import the adapter, add it to
 * `ADAPTERS` — and one obligation: ≥5 fixtures, asserted by the registry
 * coverage test in `test/adapters/mfFactsheet/registry.test.ts`.
 */

import { abslFactsheetAdapter } from './absl.v1.js';
import { axisFactsheetAdapter } from './axis.v1.js';
import { dspFactsheetAdapter } from './dsp.v1.js';
import { hdfcFactsheetAdapter } from './hdfc.v1.js';
import { iciciFactsheetAdapter } from './icici.v1.js';
import { kotakFactsheetAdapter } from './kotak.v1.js';
import { miraeFactsheetAdapter } from './mirae.v1.js';
import { nipponFactsheetAdapter } from './nippon.v1.js';
import { sbiFactsheetAdapter } from './sbi.v1.js';
import { utiFactsheetAdapter } from './uti.v1.js';
import { factsheetFail } from './types.js';
import type { MfFactsheetAdapter, MfFactsheetFailure } from './types.js';

/**
 * Canonical AMC codes.
 *
 * Defined here rather than derived from AMFI's AMC names because those names
 * are free text that changes ("ICICI Prudential Mutual Fund" vs "ICICI
 * Prudential Asset Management Company Limited") while the registry key must
 * not — `MfSchemeMeta.amcCode` is written once per scheme and read forever.
 * `normaliseAmcName` below maps the free text onto these.
 */
export const AMC_CODES = {
  SBI: 'SBI',
  ICICI_PRU: 'ICICI_PRU',
  HDFC: 'HDFC',
  NIPPON: 'NIPPON',
  KOTAK: 'KOTAK',
  AXIS: 'AXIS',
  UTI: 'UTI',
  ABSL: 'ABSL',
  MIRAE: 'MIRAE',
  DSP: 'DSP',
} as const;

/**
 * The registry — `01 §4`'s ten largest AMCs by AUM, ~85% of retail holdings.
 * Task 1.5 shipped SBI/ICICI Pru/HDFC; Task 1.6 completed the set.
 *
 * Order here is presentation-only (`REGISTERED_AMC_CODES` sorts), but it is
 * kept as AUM rank so a reader can see at a glance which AMCs are covered and
 * which tail is deliberately left to `AMC_NOT_SUPPORTED`.
 */
const ADAPTERS: readonly MfFactsheetAdapter[] = [
  sbiFactsheetAdapter,
  iciciFactsheetAdapter,
  hdfcFactsheetAdapter,
  nipponFactsheetAdapter,
  kotakFactsheetAdapter,
  axisFactsheetAdapter,
  utiFactsheetAdapter,
  abslFactsheetAdapter,
  miraeFactsheetAdapter,
  dspFactsheetAdapter,
];

const BY_CODE: ReadonlyMap<string, MfFactsheetAdapter> = new Map(
  ADAPTERS.map((a) => [a.amcCode, a]),
);

/** Every registered code, sorted, for coverage tests and ops reporting. */
export const REGISTERED_AMC_CODES: readonly string[] = [...BY_CODE.keys()].sort();

/** All registered adapters, for coverage tests and ops reporting. */
export const REGISTERED_ADAPTERS: readonly MfFactsheetAdapter[] = ADAPTERS;

/**
 * The documented `AMC_NOT_SUPPORTED` outcome.
 *
 * Exported as a builder rather than a constant so the AMC code appears in the
 * detail: the reason an operator reads this failure is to decide whether that
 * AMC is worth an adapter, and a message that does not name the AMC answers
 * nothing.
 */
export function amcNotSupported(amcCode: string): MfFactsheetFailure {
  return factsheetFail(
    'AMC_NOT_SUPPORTED',
    `No factsheet adapter is registered for AMC ${JSON.stringify(amcCode)}. ` +
      'Scheme metadata is still populated from the AMFI scheme master; holdings ' +
      'are absent, so every holdings-derived metric for this scheme resolves to ' +
      'INSUFFICIENT_DATA (01 §4). This is an expected outcome, not a defect.',
    { amcCode, registered: REGISTERED_AMC_CODES },
  );
}

export type AdapterResolution =
  | { supported: true; adapter: MfFactsheetAdapter }
  | { supported: false; failure: MfFactsheetFailure };

/**
 * Resolve an AMC code to its adapter. NEVER throws — an unknown AMC comes back
 * as `{ supported: false }` carrying the documented failure value.
 */
export function resolveFactsheetAdapter(amcCode: string): AdapterResolution {
  const adapter = BY_CODE.get(normaliseAmcCode(amcCode));
  if (adapter === undefined) {
    return { supported: false, failure: amcNotSupported(amcCode) };
  }
  return { supported: true, adapter };
}

/** Convenience predicate for callers that only need to branch. */
export function isAmcSupported(amcCode: string): boolean {
  return BY_CODE.has(normaliseAmcCode(amcCode));
}

/** Tolerate case and separator drift in a stored code without changing the key. */
export function normaliseAmcCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_');
}

/**
 * Map AMFI's free-text AMC name onto a canonical code.
 *
 * Used by the metadata job when it first creates an `MfSchemeMeta` row, so
 * that `amcCode` is stable even though the name it was derived from is not.
 * Returns `null` — never a guessed code — when nothing matches, because a
 * wrong code silently routes one AMC's schemes at another AMC's adapter, which
 * then parses a page for the wrong fund and succeeds.
 */
const NAME_PATTERNS: readonly [RegExp, string][] = [
  // Multi-word / most-specific FIRST. "ICICI Prudential" must not be caught by
  // a looser rule later, and "Aditya Birla Sun Life" is listed ahead of the
  // single-token patterns for the same reason.
  [/\bicici\s*pru/i, AMC_CODES.ICICI_PRU],
  [/\baditya\s*birla|\babsl\b/i, AMC_CODES.ABSL],
  [/\bmirae\b/i, AMC_CODES.MIRAE],
  // "Nippon India" was "Reliance Nippon Life"; AMFI still carries both forms
  // in historical rows, and both contain "nippon".
  [/\bnippon\b/i, AMC_CODES.NIPPON],
  [/\bsbi\b/i, AMC_CODES.SBI],
  [/\bhdfc\b/i, AMC_CODES.HDFC],
  [/\bkotak\b/i, AMC_CODES.KOTAK],
  [/\baxis\b/i, AMC_CODES.AXIS],
  // `\buti\b` and not `/uti/`: without the word boundaries this matches
  // inside "Mutual", i.e. inside virtually EVERY AMC name AMFI publishes, and
  // would route every otherwise-unmatched AMC's schemes at the UTI adapter —
  // which would then parse a page for the wrong fund and succeed.
  [/\buti\b/i, AMC_CODES.UTI],
  [/\bdsp\b/i, AMC_CODES.DSP],
];

export function normaliseAmcName(amcName: string): string | null {
  for (const [re, code] of NAME_PATTERNS) {
    if (re.test(amcName)) return code;
  }
  return null;
}
