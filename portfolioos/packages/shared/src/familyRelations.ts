/**
 * How one family member is related to another, and where that puts them on
 * the family tree.
 *
 * A relation is always read against a named person: "Ramesh is Akshay's
 * Father". The tree is a parent/child chart, so each relation reduces to one
 * of four placements relative to that person:
 *
 *   ABOVE        a parent or parent-in-law: takes that person's place under
 *                their own parent, and that person moves under them
 *   TWO_ABOVE    a grandparent: the same, one generation higher
 *   BELOW        a child, grandchild or child-in-law: goes under them
 *   BESIDE       a sibling: same generation, under the same parent
 *   PARTNER      a husband or wife: joined to that person as a couple, with
 *                no parent of their own
 *
 * PARTNER is not BESIDE, and the difference is the whole point. A sister
 * shares your parents; a wife does not. Giving a wife her husband's parent
 * drew her as his father's daughter — and it left the couple's children
 * hanging off one of them, as if the other had nothing to do with it. A
 * couple is one place on the tree: both partners stand there, and their
 * children hang from the pair.
 *
 * Shared so the web form and the API place people identically.
 */

export type RelationPlacement = 'ABOVE' | 'TWO_ABOVE' | 'BELOW' | 'BESIDE' | 'PARTNER';

export interface FamilyRelation {
  label: string;
  placement: RelationPlacement;
}

export const FAMILY_RELATIONS: readonly FamilyRelation[] = [
  { label: 'Father', placement: 'ABOVE' },
  { label: 'Mother', placement: 'ABOVE' },
  { label: 'Father-in-law', placement: 'ABOVE' },
  { label: 'Mother-in-law', placement: 'ABOVE' },
  { label: 'Grandfather', placement: 'TWO_ABOVE' },
  { label: 'Grandmother', placement: 'TWO_ABOVE' },
  { label: 'Spouse', placement: 'PARTNER' },
  { label: 'Wife', placement: 'PARTNER' },
  { label: 'Husband', placement: 'PARTNER' },
  { label: 'Brother', placement: 'BESIDE' },
  { label: 'Sister', placement: 'BESIDE' },
  { label: 'Son', placement: 'BELOW' },
  { label: 'Daughter', placement: 'BELOW' },
  { label: 'Son-in-law', placement: 'BELOW' },
  { label: 'Daughter-in-law', placement: 'BELOW' },
  { label: 'Grandson', placement: 'BELOW' },
  { label: 'Granddaughter', placement: 'BELOW' },
] as const;

/**
 * Where a relation places someone. A relation the family typed themselves
 * ("Uncle", "Guardian") has no fixed place and goes under the person it was
 * given against; they can move it with "Place" afterwards.
 */
export function relationPlacement(label: string | null | undefined): RelationPlacement {
  const known = FAMILY_RELATIONS.find(
    (r) => r.label.toLowerCase() === (label ?? '').trim().toLowerCase(),
  );
  return known?.placement ?? 'BELOW';
}

/** child id -> parent id, or null for someone at the top of the tree. */
export type TreeParents = Record<string, string | null>;

/** Two people who stand together on the tree. Order carries no meaning. */
export type PartnerPair = [string, string];

/** The arrangement of a family tree: who is under whom, and who is with whom. */
export interface TreeShape {
  parents: TreeParents;
  partners: PartnerPair[];
}

/** Same pair in either order gives the same key. */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`;
}

/** Everyone `id` is partnered with. */
export function partnersOf(partners: readonly PartnerPair[], id: string): string[] {
  const out: string[] = [];
  for (const [a, b] of partners) {
    if (a === id && !out.includes(b)) out.push(b);
    else if (b === id && !out.includes(a)) out.push(a);
  }
  return out;
}

/**
 * Drop self-pairs, duplicates and (when `isKnown` is given) anyone no longer
 * in the family. Partners of someone who has left stop being drawn without
 * having to rewrite the rest of the tree.
 */
export function normalizePartners(
  raw: readonly PartnerPair[] | undefined,
  isKnown?: (id: string) => boolean,
): PartnerPair[] {
  const seen = new Set<string>();
  const out: PartnerPair[] = [];
  for (const pair of raw ?? []) {
    if (!Array.isArray(pair) || pair.length !== 2) continue;
    const [a, b] = pair;
    if (typeof a !== 'string' || typeof b !== 'string' || a === b || !a || !b) continue;
    if (isKnown && (!isKnown(a) || !isKnown(b))) continue;
    const key = pairKey(a, b);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push([a, b]);
  }
  return out;
}

/** True when this relation joins two people as a couple. */
export function isPartnerRelation(label: string | null | undefined): boolean {
  return relationPlacement(label) === 'PARTNER';
}

/** One place on the tree: a person, or a couple standing together. */
export interface TreeUnit {
  /** One or two ids, in drawing order. */
  ids: string[];
  /** The id the unit hangs from — the first of `ids`. */
  anchor: string;
}

/**
 * Group people into the places they occupy on the tree. Everyone appears in
 * exactly one unit: pairs are drawn together, and someone partnered with two
 * people (remarriage) stands with whoever comes first, keeping the drawing a
 * tree rather than a web.
 */
export function buildUnits(orderedIds: readonly string[], partners: readonly PartnerPair[]): TreeUnit[] {
  const known = new Set(orderedIds);
  const taken = new Set<string>();
  const units: TreeUnit[] = [];
  for (const id of orderedIds) {
    if (taken.has(id)) continue;
    taken.add(id);
    const mate = partnersOf(partners, id).find((p) => known.has(p) && !taken.has(p));
    if (mate) {
      taken.add(mate);
      units.push({ ids: [id, mate], anchor: id });
    } else {
      units.push({ ids: [id], anchor: id });
    }
  }
  return units;
}

/**
 * The tree after adding `newId` as `relation` of `relatedToId`.
 *
 * `parentOf` answers where anyone sits now — from the saved arrangement, or
 * failing that from who invited whom — so the result is correct whether or
 * not the family has arranged its tree before.
 */
export function placeRelative(
  shape: TreeShape,
  parentOf: (id: string) => string | null,
  newId: string,
  relatedToId: string,
  relation: string | null | undefined,
): TreeShape {
  const next: TreeParents = { ...shape.parents };
  const partners = normalizePartners(shape.partners);
  const current = (id: string): string | null => (id in next ? (next[id] ?? null) : parentOf(id));

  switch (relationPlacement(relation)) {
    case 'PARTNER': {
      // Joined to them, not born to their parents.
      next[newId] = null;
      const key = pairKey(newId, relatedToId);
      if (!partners.some(([a, b]) => pairKey(a, b) === key)) partners.push([newId, relatedToId]);
      break;
    }
    case 'BELOW':
      next[newId] = relatedToId;
      break;
    case 'BESIDE':
      // A brother or sister shares the parent this person was born to —
      // deliberately their own, not the couple's.
      next[newId] = current(relatedToId);
      break;
    case 'ABOVE': {
      // The new parent takes the related person's slot; they move under it.
      // Their own parent, not their partner's: a wife's father is not the
      // husband's father, and the couple still stands together either way.
      next[newId] = current(relatedToId);
      next[relatedToId] = newId;
      break;
    }
    case 'TWO_ABOVE': {
      // A grandparent goes above the related person's parent when there is
      // one, and simply above the related person when there is not.
      const parent = current(relatedToId);
      const anchor = parent ?? relatedToId;
      next[newId] = current(anchor);
      next[anchor] = newId;
      break;
    }
  }
  return { parents: next, partners };
}

/** True if following parents from any person ever comes back to them. */
export function hasCycle(parents: TreeParents, parentOf: (id: string) => string | null): boolean {
  const up = (id: string): string | null => (id in parents ? (parents[id] ?? null) : parentOf(id));
  for (const start of Object.keys(parents)) {
    const seen = new Set<string>([start]);
    let at = up(start);
    while (at) {
      if (seen.has(at)) return true;
      seen.add(at);
      at = up(at);
    }
  }
  return false;
}
