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
 *   BESIDE       a spouse or sibling: same generation, under the same parent
 *
 * Shared so the web form and the API place people identically.
 */

export type RelationPlacement = 'ABOVE' | 'TWO_ABOVE' | 'BELOW' | 'BESIDE';

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
  { label: 'Spouse', placement: 'BESIDE' },
  { label: 'Wife', placement: 'BESIDE' },
  { label: 'Husband', placement: 'BESIDE' },
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

/**
 * The tree after adding `newId` as `relation` of `relatedToId`.
 *
 * `parentOf` answers where anyone sits now — from the saved arrangement, or
 * failing that from who invited whom — so the result is correct whether or
 * not the family has arranged its tree before.
 */
export function placeRelative(
  parents: TreeParents,
  parentOf: (id: string) => string | null,
  newId: string,
  relatedToId: string,
  relation: string | null | undefined,
): TreeParents {
  const next: TreeParents = { ...parents };
  const current = (id: string): string | null => (id in next ? (next[id] ?? null) : parentOf(id));

  switch (relationPlacement(relation)) {
    case 'BELOW':
      next[newId] = relatedToId;
      break;
    case 'BESIDE':
      next[newId] = current(relatedToId);
      break;
    case 'ABOVE': {
      // The new parent takes the related person's slot; they move under it.
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
  return next;
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
