/**
 * Generic factsheet-TEXT scanner, shared by every AMC parser.
 *
 * PURE. No Prisma, no network, no filesystem.
 *
 * Same division of labour as `holdingsTable.ts`: SEBI mandates that a factsheet
 * disclose the TER, the AUM, the fund managers, the exit load and the
 * riskometer, but not how to phrase any of it. So the set of facts is common
 * and the wording is not. This file owns the extraction machinery — scan a set
 * of candidate patterns, take the first that matches, record a note when none
 * does — and each `<amc>.parse.ts` supplies only its own wording.
 *
 * The central rule, repeated here because it is the one that gets violated
 * under deadline pressure: a fact that cannot be read is `null` PLUS a note.
 * Never `0`, and never a plausible default. A defaulted TER ranks a fund on
 * cost against a number nobody published.
 */

import { serializeMoney } from '@portfolioos/shared';
import type { Money, Pct } from '@portfolioos/shared';
import {
  croreToInr,
  lakhToInr,
  moneyOrNull,
  parseExitLoad,
  parseFactsheetDate,
  parseIndianDecimal,
  pctOrNull,
  validateTerPct,
} from './normalise.js';
import { computeFactsheetSourceHash, factsheetFail, factsheetOk } from './types.js';
import type {
  MfFactsheetResult,
  MfFactsheetWarning,
  ParsedExitLoadRule,
  ParsedManager,
  SchemeFactsParseInput,
  SchemeFactsRaw,
} from './types.js';

/**
 * An AUM pattern carries its own units and basis, because the same AMC writes
 * "Monthly AAUM ... Rs. 12,345.67 crores" and "AUM as on 31-Mar-26 ... Rs.
 * 12,301.45 Cr" on the same page and they are different numbers measured
 * differently. Attaching the semantics to the pattern is what keeps them from
 * being conflated at the point where they are hardest to tell apart.
 */
export interface AumPattern {
  re: RegExp;
  unit: 'CRORE' | 'LAKH' | 'RUPEE';
  basis: 'MONTH_END' | 'MONTHLY_AVERAGE';
}

export interface AmcFactsSpec {
  amcCode: string;
  /** Group 1 = the date text. */
  asOfPatterns: readonly RegExp[];
  /** Group 1 = the percentage. Used when the plan is known. */
  terDirectPatterns: readonly RegExp[];
  terRegularPatterns: readonly RegExp[];
  /**
   * Fallback for pages that disclose a single, unqualified TER (a scheme with
   * only one plan, e.g. a closed-ended or an institutional-only fund).
   */
  terSinglePatterns: readonly RegExp[];
  /** Ordered most-specific first; the first match wins. Group 1 = the number. */
  aumPatterns: readonly AumPattern[];
  /**
   * Group 1 = the whole manager clause, which `parseManagerClause` then splits.
   * A separate pattern per AMC because the separator between a manager's name
   * and their start date is anything from "(since" to "– Managing this fund
   * since" to a footnote dagger.
   */
  managerPatterns: readonly RegExp[];
  /** Group 1 = the exit-load sentence, handed to `parseExitLoad`. */
  exitLoadPatterns: readonly RegExp[];
  /** Group 1 = the riskometer band text. */
  riskometerPatterns: readonly RegExp[];
  /** Group 1 = the minimum SIP amount. */
  minSipPatterns: readonly RegExp[];
}

function firstMatch(text: string, patterns: readonly RegExp[]): string | null {
  for (const re of patterns) {
    // Patterns are declared without /g so `match` is stateless and these
    // specs are safe to share across calls. A /g regex would carry lastIndex
    // between invocations and start skipping matches on the second scheme.
    const m = text.match(re);
    if (m !== null && m[1] !== undefined) return m[1];
  }
  return null;
}

export interface ExtractedFacts {
  asOf: Date | null;
  terPct: Pct | null;
  aum: Money | null;
  aumBasis: 'MONTH_END' | 'MONTHLY_AVERAGE' | null;
  managers: ParsedManager[];
  exitLoadText: string | null;
  exitLoadRules: ParsedExitLoadRule[] | null;
  riskometer: string | null;
  minSip: Money | null;
  notes: MfFactsheetWarning[];
}

/**
 * Split one manager clause into a name and a "managing since" date.
 *
 * "Mr. R. Srinivasan (since May 2009)" → `{ name: 'R. Srinivasan', fromDate:
 * 2009-05-01 }`. A month with no day is read as the FIRST of the month, which
 * is the conservative direction: `managerTenureYears` (`02 §8`) then reports at
 * most the true tenure plus 30 days, and a tenure that is slightly too long
 * cannot manufacture the "new manager, treat the record with caution" finding
 * that `05-FINDINGS-ENGINE.md` raises — whereas rounding the other way could
 * suppress one.
 */
export function parseManagerClause(clause: string): ParsedManager | null {
  const raw = clause.trim();
  if (raw.length === 0) return null;

  // Alternation ordered LONGEST-FIRST, with the optional "(" ahead of it, so
  // "(Managing this fund since Sep 2018)" is consumed whole. With "since" first
  // the match would start mid-parenthesis and the name would come out as
  // "Anish Tawakley (Managing this fund" — a string that matches nothing on
  // next month's factsheet, so every refresh would look like a manager change
  // and `managerChangesLast3y` (`02 §8`) would count twelve a year.
  const sinceMatch = raw.match(
    /\s*\(?\s*(?:managing this (?:fund|scheme) since|managing since|since|w\.e\.f\.?|from)\s+([A-Za-z0-9 ,./-]+?)\s*\)?\s*$/i,
  );
  let fromDate: Date | null = null;
  let namePart = raw;
  if (sinceMatch !== null) {
    namePart = raw.slice(0, sinceMatch.index).trim();
    const dateText = (sinceMatch[1] ?? '').trim();
    fromDate = parseFactsheetDate(dateText);
    if (fromDate === null) {
      // "May 2009" — month and year only.
      const my = dateText.match(/^([A-Za-z]{3,9})\.?[ ,-]+(\d{4})$/);
      if (my !== null) fromDate = parseFactsheetDate(`1 ${my[1]} ${my[2]}`);
    }
  }

  const name = namePart
    .replace(/^(mr\.?|mrs\.?|ms\.?|dr\.?|shri|smt\.?)\s+/i, '')
    .replace(/[¤†‡*^#$@]+/g, '')
    .replace(/[,;–-]+\s*$/, '')
    .trim();

  if (name.length === 0) return null;

  // A "Lead"/"Co-manager" label is only recorded when the AMC states it. An
  // inferred lead (say, "the first name listed") would feed
  // `managerTenureYears`, which is defined on the LEAD manager — so guessing
  // would attach a co-manager's tenure to the fund's headline number.
  const role = /\b(co[- ]?manager|assistant fund manager)\b/i.test(clause)
    ? 'Co-manager'
    : /\b(lead|chief investment officer|cio)\b/i.test(clause)
      ? 'Lead'
      : null;

  return { managerName: name, role, fromDate };
}

/** Split a manager clause list ("A (since X), B (since Y) and C") into clauses. */
function splitManagerClauses(raw: string): string[] {
  return raw
    // Split on separators that are NOT inside a parenthesised "(since …)".
    .split(/(?:,|;|\band\b|&)(?![^(]*\))/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Run one AMC's spec over the extracted factsheet text.
 *
 * Never throws. Every field that could not be read is `null` and appears in
 * `notes` with the reason.
 */
export function extractFacts(input: SchemeFactsParseInput, spec: AmcFactsSpec): ExtractedFacts {
  const notes: MfFactsheetWarning[] = [];
  const text = input.text;

  // ── as-of ───────────────────────────────────────────────────────────────
  let asOf = parseFactsheetDate(firstMatch(text, spec.asOfPatterns));
  if (asOf === null && input.expectedAsOf !== undefined) {
    asOf = input.expectedAsOf;
    notes.push({
      code: 'FIELD_MISSING',
      field: 'asOf',
      detail: 'Factsheet carried no readable as-of date; used the requested as-of.',
    });
  }

  // ── TER ─────────────────────────────────────────────────────────────────
  let terPct: Pct | null = null;
  const directRaw = firstMatch(text, spec.terDirectPatterns);
  const regularRaw = firstMatch(text, spec.terRegularPatterns);
  const singleRaw = firstMatch(text, spec.terSinglePatterns);

  if (input.planType === 'DIRECT' && directRaw !== null) {
    terPct = pctOrNull(parseIndianDecimal(directRaw));
  } else if (input.planType === 'REGULAR' && regularRaw !== null) {
    terPct = pctOrNull(parseIndianDecimal(regularRaw));
  } else if (directRaw === null && regularRaw === null && singleRaw !== null) {
    terPct = pctOrNull(parseIndianDecimal(singleRaw));
  } else if (input.planType === undefined && (directRaw !== null || regularRaw !== null)) {
    notes.push({
      code: 'FIELD_MISSING',
      field: 'terPct',
      detail:
        'Factsheet discloses a per-plan TER but the caller did not say which plan ' +
        'this scheme code is; refusing to guess.',
    });
  } else {
    notes.push({
      code: 'FIELD_MISSING',
      field: 'terPct',
      detail: `No TER matched any known ${spec.amcCode} wording.`,
    });
  }

  // ── AUM ─────────────────────────────────────────────────────────────────
  let aum: Money | null = null;
  let aumBasis: 'MONTH_END' | 'MONTHLY_AVERAGE' | null = null;
  for (const pattern of spec.aumPatterns) {
    const m = text.match(pattern.re);
    if (m === null || m[1] === undefined) continue;
    const value = parseIndianDecimal(m[1]);
    if (value === null) continue;
    const inr =
      pattern.unit === 'CRORE'
        ? croreToInr(value)
        : pattern.unit === 'LAKH'
          ? lakhToInr(value)
          : value;
    aum = serializeMoney(inr);
    aumBasis = pattern.basis;
    if (pattern.unit !== 'RUPEE') {
      notes.push({
        code: 'AUM_UNITS_ASSUMED',
        field: 'aum',
        detail: `Converted from ${pattern.unit} as stated by the ${pattern.basis} label.`,
      });
    }
    break;
  }
  if (aum === null) {
    notes.push({
      code: 'FIELD_MISSING',
      field: 'aum',
      detail: `No AUM matched any known ${spec.amcCode} wording.`,
    });
  }

  // ── Managers ────────────────────────────────────────────────────────────
  const managers: ParsedManager[] = [];
  const managerRaw = firstMatch(text, spec.managerPatterns);
  if (managerRaw !== null) {
    for (const clause of splitManagerClauses(managerRaw)) {
      const parsed = parseManagerClause(clause);
      if (parsed !== null) managers.push(parsed);
    }
  }
  if (managers.length === 0) {
    notes.push({
      code: 'FIELD_MISSING',
      field: 'managers',
      detail: `No fund manager matched any known ${spec.amcCode} wording.`,
    });
  }
  for (const m of managers) {
    if (m.fromDate === null) {
      notes.push({
        code: 'FIELD_MISSING',
        field: `managers.${m.managerName}.fromDate`,
        detail: 'Manager named without a "managing since" date; tenure is unknown, not zero.',
      });
    }
  }

  // ── Exit load ───────────────────────────────────────────────────────────
  const exitLoadText = firstMatch(text, spec.exitLoadPatterns);
  const exitLoadRules = parseExitLoad(exitLoadText);
  if (exitLoadText !== null && exitLoadRules === null) {
    notes.push({
      code: 'FIELD_MISSING',
      field: 'exitLoadRules',
      detail:
        `Exit-load text present but unparseable: ${JSON.stringify(exitLoadText)}. ` +
        'Left null rather than [] so no consumer reads it as "no exit load".',
    });
  }

  // ── Riskometer / min SIP ────────────────────────────────────────────────
  const riskometer = firstMatch(text, spec.riskometerPatterns);
  const minSipRaw = firstMatch(text, spec.minSipPatterns);
  const minSip = moneyOrNull(minSipRaw === null ? null : parseIndianDecimal(minSipRaw));

  return {
    asOf,
    terPct,
    aum,
    aumBasis,
    managers,
    exitLoadText,
    exitLoadRules,
    riskometer: riskometer === null ? null : riskometer.trim(),
    minSip,
    notes,
  };
}

/** Canonical, order-stable serialisation of the facts, for the source hash. */
export function canonicalFactsPayload(facts: ExtractedFacts): string {
  return [
    `ter=${facts.terPct ?? ''}`,
    `aum=${facts.aum ?? ''}`,
    `aumBasis=${facts.aumBasis ?? ''}`,
    `managers=${facts.managers
      .map((m) => `${m.managerName}@${m.fromDate?.toISOString().slice(0, 10) ?? ''}`)
      .sort()
      .join(',')}`,
    `exitLoad=${facts.exitLoadRules?.map((r) => `${r.daysUpTo}:${r.pct}`).join(',') ?? ''}`,
    `riskometer=${facts.riskometer ?? ''}`,
    `minSip=${facts.minSip ?? ''}`,
  ].join('|');
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/**
 * Turn extracted facts into a validated `SchemeFactsRaw`, or into the typed
 * failure `01 §6` prescribes.
 *
 * Every AMC facts parser ends here, so the TER-range gate is applied once and
 * identically. Note what it does NOT do: a factsheet that fails the TER check
 * fails ENTIRELY, rather than being stored with `terPct: null`. A TER outside
 * 0.01–3.0% is not a missing number, it is evidence the column was misread —
 * and if the TER was misread there is no reason to trust the AUM or the manager
 * dates parsed off the same page.
 */
export function assembleFacts(
  input: SchemeFactsParseInput,
  spec: AmcFactsSpec,
  ids: { adapterId: string; adapterVersion: string },
): MfFactsheetResult<SchemeFactsRaw> {
  // A page with none of the load-bearing labels is not this AMC's factsheet at
  // all. Distinguished from "a factsheet with gaps" because the remedy differs:
  // one is a bad file, the other is a `.v1.ts` pointing at the wrong page.
  if (input.text.trim().length === 0) {
    return factsheetFail('MALFORMED_INPUT', 'Empty factsheet text.');
  }

  const facts = extractFacts(input, spec);

  const terCheck = validateTerPct(facts.terPct);
  if (!terCheck.ok) {
    return factsheetFail(
      'TER_RANGE',
      terCheck.failures[0]?.detail ?? 'TER out of range.',
      { schemeCode: input.schemeCode, terPct: facts.terPct },
    );
  }

  if (facts.asOf === null) {
    return factsheetFail(
      'MALFORMED_INPUT',
      'Could not determine the factsheet as-of date and the caller supplied none. ' +
        '`MfSchemeTer.effectiveFrom` is the unique key, so a guessed date would ' +
        'either overwrite a real TER row or create a phantom one.',
    );
  }

  // Nothing at all was readable: treat as a format change rather than as a
  // sparse factsheet, because that is what it almost always is.
  if (facts.terPct === null && facts.aum === null && facts.managers.length === 0) {
    return factsheetFail(
      'PORTAL_CHANGED',
      `None of TER, AUM or fund manager matched any known ${spec.amcCode} wording. ` +
        'The page shape has almost certainly changed — correct the patterns in ' +
        `${spec.amcCode.toLowerCase()}.parse.ts and bump the adapter version.`,
      { textLength: input.text.length },
    );
  }

  const sourceHash = computeFactsheetSourceHash({
    adapterId: ids.adapterId,
    adapterVersion: ids.adapterVersion,
    schemeCode: input.schemeCode,
    asOf: facts.asOf.toISOString().slice(0, 10),
    payload: canonicalFactsPayload(facts),
  });

  return factsheetOk(
    {
      schemeCode: input.schemeCode,
      amcCode: spec.amcCode,
      asOf: facts.asOf,
      terPct: facts.terPct,
      // The TER a factsheet quotes is the one in force on its own as-of date.
      terEffectiveFrom: facts.terPct === null ? null : facts.asOf,
      aum: facts.aum,
      aumAsOf: facts.aum === null ? null : facts.asOf,
      aumBasis: facts.aumBasis,
      managers: facts.managers,
      exitLoadText: facts.exitLoadText,
      exitLoadRules: facts.exitLoadRules,
      riskometer: facts.riskometer,
      minSip: facts.minSip,
      notes: facts.notes,
      sourceAdapter: ids.adapterId,
      sourceAdapterVer: ids.adapterVersion,
      sourceHash,
    },
    facts.notes,
  );
}
