import { describe, it, expect } from 'vitest';
import { layoutFamily, lineTo, NODE_H, ROW_PITCH, unitLabel, type Parents } from './familyTree';
import type { FamilyMemberRow, FamilyRole } from '@/api/families.api';

/**
 * The tree lays itself out. Someone is added as a father, a wife, a brother —
 * and these are the shapes that has to produce, without anyone dragging a card.
 */

let joined = 0;
function member(userId: string, opts: Partial<FamilyMemberRow> = {}): FamilyMemberRow {
  joined += 1;
  return {
    id: `m-${userId}`,
    userId,
    name: opts.name ?? userId,
    email: null,
    managed: true,
    managedBy: null,
    contactEmail: null,
    relation: null,
    relatedTo: null,
    role: (opts.role ?? 'CONTRIBUTOR') as FamilyRole,
    status: 'ACTIVE',
    visibleAssetClasses: [],
    visibleCategories: [],
    joinedAt: `2026-01-01T00:00:${String(joined).padStart(2, '0')}.000Z`,
    invitedById: opts.invitedById ?? null,
    ...opts,
  } as FamilyMemberRow;
}

const family = (ids: string[]) => ids.map((id) => member(id, { name: id }));
const at = (layout: ReturnType<typeof layoutFamily>, key: string) =>
  layout.nodes.find((n) => n.key === key)!;
const keyOf = (layout: ReturnType<typeof layoutFamily>, id: string) => layout.unitOf[id]!;

describe('laying a family out', () => {
  const members = family(['harish', 'kusum', 'rajesh', 'anita', 'suresh', 'kavya', 'rohit']);
  const parents: Parents = {
    harish: null,
    kusum: null,
    rajesh: 'harish',
    anita: null,
    suresh: 'harish',
    kavya: 'rajesh',
    rohit: null,
  };
  const partners: [string, string][] = [
    ['harish', 'kusum'],
    ['rajesh', 'anita'],
    ['kavya', 'rohit'],
  ];

  it('puts a couple in one place and each generation on its own line', () => {
    const l = layoutFamily(members, parents, partners);
    const top = at(l, keyOf(l, 'harish'));
    expect(top.ids).toEqual(['harish', 'kusum']);
    expect(unitLabel(top.members)).toBe('harish & kusum');
    expect(at(l, keyOf(l, 'rajesh')).y - top.y).toBe(ROW_PITCH);
    expect(at(l, keyOf(l, 'kavya')).y - top.y).toBe(ROW_PITCH * 2);
    // A wife stands with her husband, not as a child of his father.
    expect(keyOf(l, 'anita')).toBe(keyOf(l, 'rajesh'));
    expect(at(l, keyOf(l, 'rajesh')).parentKey).toBe(keyOf(l, 'harish'));
  });

  it('centres a parent over the children it shares', () => {
    const l = layoutFamily(members, parents, partners);
    const top = at(l, keyOf(l, 'harish'));
    const a = at(l, keyOf(l, 'rajesh'));
    const b = at(l, keyOf(l, 'suresh'));
    const centre = (Math.min(a.x, b.x) + Math.max(a.x + a.w, b.x + b.w)) / 2;
    expect(top.x + top.w / 2).toBeCloseTo(centre, 5);
  });

  it('draws one line per branch, from the pair down to each child', () => {
    const l = layoutFamily(members, parents, partners);
    const fromTop = l.edges.filter((e) => e.from === keyOf(l, 'harish'));
    expect(fromTop).toHaveLength(2);
    expect(fromTop[0]!.d.startsWith('M ')).toBe(true);
  });

  it('never overlaps two places on the same line', () => {
    const l = layoutFamily(members, parents, partners);
    const byRow = new Map<number, typeof l.nodes>();
    for (const n of l.nodes) byRow.set(n.y, [...(byRow.get(n.y) ?? []), n]);
    for (const row of byRow.values()) {
      const sorted = [...row].sort((p, q) => p.x - q.x);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i]!.x).toBeGreaterThanOrEqual(sorted[i - 1]!.x + sorted[i - 1]!.w);
      }
    }
  });

  it('stands a brother of the person at the top beside them, not under', () => {
    // Nobody knows Harish's parents, so his brother has none to hang from:
    // the family becomes two roots, and both must still be laid out.
    const withBrother = [...members, member('mohan', { name: 'mohan' })];
    const l = layoutFamily(withBrother, { ...parents, mohan: null }, partners);
    const mohan = at(l, keyOf(l, 'mohan'));
    const harish = at(l, keyOf(l, 'harish'));
    expect(mohan.parentKey).toBeNull();
    expect(mohan.y).toBe(harish.y);
    expect(mohan.x).toBeGreaterThanOrEqual(harish.x + harish.w);
    // And the rest of the family keeps its shape underneath.
    expect(at(l, keyOf(l, 'kavya')).y - harish.y).toBe(ROW_PITCH * 2);
  });

  it('re-hangs everyone when a father is added above the top', () => {
    const withFather = [...members, member('dada', { name: 'dada' })];
    const l = layoutFamily(withFather, { ...parents, dada: null, harish: 'dada' }, partners);
    expect(at(l, keyOf(l, 'dada')).parentKey).toBeNull();
    expect(at(l, keyOf(l, 'harish')).parentKey).toBe(keyOf(l, 'dada'));
    // Everyone below moves down a generation with no other change.
    expect(at(l, keyOf(l, 'kavya')).y - at(l, keyOf(l, 'dada')).y).toBe(ROW_PITCH * 3);
  });

  it('survives an arrangement that points in a circle', () => {
    const l = layoutFamily(family(['a', 'b']), { a: 'b', b: 'a' }, []);
    expect(l.nodes).toHaveLength(2);
    expect(l.nodes.some((n) => n.parentKey === null)).toBe(true);
  });

  it('measures what it drew, so the board can fit it', () => {
    const l = layoutFamily(members, parents, partners);
    const right = Math.max(...l.nodes.map((n) => n.x + n.w));
    const bottom = Math.max(...l.nodes.map((n) => n.y + NODE_H));
    expect(l.width).toBeGreaterThanOrEqual(right);
    expect(l.height).toBeGreaterThanOrEqual(bottom);
  });

  it('is empty for an empty family rather than throwing', () => {
    const l = layoutFamily([], {}, []);
    expect(l.nodes).toEqual([]);
    expect(l.width).toBe(0);
  });
});

describe('folding a family that is too wide', () => {
  const members = family(['top', 'a', 'b', 'c', 'a1', 'b1']);
  const parents: Parents = { top: null, a: 'top', b: 'top', c: 'top', a1: 'a', b1: 'b' };

  it('keeps the line to the focus and folds the branches away from it', () => {
    const l = layoutFamily(members, parents, [], { focusKey: 'a', fold: true });
    const keys = l.nodes.map((n) => n.key);
    expect(keys).toContain('top');
    expect(keys).toContain('a');
    // Siblings of the focus stay: that is where "who else is here" is read.
    expect(keys).toContain('b');
    expect(keys).toContain('a1');
    // Their children do not.
    expect(keys).not.toContain('b1');
    const folded = l.nodes.find((n) => n.more);
    expect(folded?.foldedFrom).toBe('b');
    expect(folded?.more).toBe(1);
  });

  it('opens a folded branch when asked, and still fits it into the drawing', () => {
    const l = layoutFamily(members, parents, [], { focusKey: 'a', fold: true, openKeys: ['b'] });
    expect(l.nodes.map((n) => n.key)).toContain('b1');
    expect(l.nodes.find((n) => n.key === 'b1')!.parentKey).toBe('b');
  });

  it('draws the whole family when folding is off', () => {
    const l = layoutFamily(members, parents, [], { focusKey: 'a' });
    expect(l.nodes).toHaveLength(6);
    expect(l.nodes.some((n) => n.more)).toBe(false);
  });
});

describe('the line down to someone', () => {
  it('reads from the top of the tree to them', () => {
    const members = family(['top', 'a', 'a1']);
    const l = layoutFamily(members, { top: null, a: 'top', a1: 'a' }, []);
    expect(lineTo(l, 'a1').map((n) => n.key)).toEqual(['top', 'a', 'a1']);
    expect(lineTo(l, null)).toEqual([]);
  });
});
