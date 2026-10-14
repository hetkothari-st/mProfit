/**
 * Pure person-name matching for the Documents sorter. Deliberately strict: a
 * wrong merge silently mixes two people's papers (a father's and an uncle's
 * ITR), while a missed merge only creates an "auto-created · merge?" folder
 * the user can fix in one click.
 *
 * Two names are the same person only when
 *   - their normalised keys are equal (or one is a recorded alias), or
 *   - they share at least one full name token, every other full token on one
 *     side is covered by a matching initial on the other, and no stray
 *     initial is left over ("Rahul K Sharma" = "Rahul Kumar Sharma", but
 *     "Rahul Sharma" ≠ "Rahul K Sharma", and one-letter spelling differences
 *     such as Rakesh/Ramesh or Ankit/Ankita never merge).
 * PAN last-4 is a tiebreaker between similar people and a veto when it
 * disagrees. It is about 26k values, so it is never identity on its own.
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
  /** Keys of names merged into, or renamed away from, this person: they route here too. */
  aliasKeys?: string[];
}

const tokensOf = (key: string): string[] => key.split(' ').filter(Boolean);

/** Every unmatched full token must be explained by exactly one initial on the other side. Returns the initials left over, or null. */
function explained(only: string[], initials: string[]): string[] | null {
  const pool = [...initials];
  for (const token of only) {
    const i = pool.indexOf(token[0] ?? '');
    if (i < 0) return null;
    pool.splice(i, 1);
  }
  return pool;
}

function similar(aKey: string, bKey: string): boolean {
  const a = tokensOf(aKey);
  const b = tokensOf(bKey);
  const aFull = a.filter((t) => t.length > 1);
  const bFull = b.filter((t) => t.length > 1);
  const aInit = a.filter((t) => t.length === 1);
  const bInit = b.filter((t) => t.length === 1);
  if (!aFull.some((t) => bFull.includes(t))) return false;
  const leftB = explained(aFull.filter((t) => !bFull.includes(t)), bInit);
  const leftA = explained(bFull.filter((t) => !aFull.includes(t)), aInit);
  return leftB !== null && leftA !== null && leftA.length === 0 && leftB.length === 0;
}

/** The id of the matching person, or null (the caller then creates a new one). */
export function matchPerson(cands: PersonCandidate[], key: string, panLast4: string | null): string | null {
  const exact = cands.find((c) => c.nameKey === key || c.aliasKeys?.includes(key));
  if (exact) return exact.id;

  let fuzzy = cands.filter(
    (c) => similar(c.nameKey, key) && !(panLast4 && c.panLast4 && c.panLast4 !== panLast4),
  );
  if (fuzzy.length > 1 && panLast4) {
    const byPan = fuzzy.filter((c) => c.panLast4 === panLast4);
    if (byPan.length > 0) fuzzy = byPan;
  }
  // Ambiguous → null: two plausible people must not be guessed between.
  return fuzzy.length === 1 ? (fuzzy[0]?.id ?? null) : null;
}
