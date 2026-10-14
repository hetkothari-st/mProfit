/**
 * Pure person-name matching for the Documents sorter. Conservative on
 * purpose: a wrong merge silently mixes two people's papers, while a missed
 * merge only creates an "auto-created · merge?" folder the user can fix.
 */

const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'shri', 'smt', 'kumari', 'dr', 'sri']);

/** Lowercase, letters only, honorifics dropped, tokens sorted ("Kothari, Het" == "Het Kothari"). */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !HONORIFICS.has(t))
    .sort()
    .join(' ');
}

export interface PersonCandidate {
  id: string;
  nameKey: string;
  panLast4: string | null;
}

function editDistanceAtMost1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokenEq(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length === 1 || b.length === 1) return a[0] === b[0];
  return a.length >= 5 && b.length >= 5 && editDistanceAtMost1(a, b);
}

function similar(aKey: string, bKey: string): boolean {
  const a = aKey.split(' ').filter(Boolean);
  const b = bKey.split(' ').filter(Boolean);
  if (a.length < 2 || b.length < 2) return aKey === bKey;
  const used = new Set<number>();
  let matched = 0;
  for (const ta of a) {
    const idx = b.findIndex((tb, i) => !used.has(i) && tokenEq(ta, tb));
    if (idx >= 0) {
      used.add(idx);
      matched++;
    }
  }
  return matched >= 2 && matched / Math.max(a.length, b.length) >= 0.66;
}

/** The id of the matching person, or null (caller then creates a new one). */
export function matchPerson(cands: PersonCandidate[], key: string, panLast4: string | null): string | null {
  const exact = cands.find((c) => c.nameKey === key);
  if (exact) return exact.id;
  const tokens = key.split(' ').filter(Boolean);
  if (panLast4) {
    const byPan = cands.find(
      (c) =>
        c.panLast4 === panLast4 &&
        c.nameKey.split(' ').some((t) => tokens.some((x) => tokenEq(t, x))),
    );
    if (byPan) return byPan.id;
  }
  const fuzzy = cands.filter((c) => similar(c.nameKey, key));
  // Ambiguous → null: two plausible people must not be guessed between.
  return fuzzy.length === 1 ? (fuzzy[0]?.id ?? null) : null;
}
