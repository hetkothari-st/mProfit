import { describe, it, expect } from 'vitest';
import { INDENT, layoutFamily, lineTo, PAD, ROW_PITCH, type Parents } from './familyTree';
import type { FamilyMemberRow, FamilyRole } from '@/api/families.api';

/**
 * The tree reads down the page: the head at the top, a husband or wife
 * beside them, each child stepped in under them with the relation written on
 * the line. These are the shapes that has to produce, from the relations
 * alone, with nobody arranging anything by hand.
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

const kin = (name: string, relation: string, of: string) =>
  member(name, { name, relation, relatedTo: { id: of, name: of } });

const MEMBERS = [
  member('harish', { name: 'harish', role: 'OWNER' }),
  kin('kusum', 'Wife', 'harish'),
  kin('rajesh', 'Son', 'harish'),
  kin('anita', 'Wife', 'rajesh'),
  kin('kavya', 'Daughter', 'rajesh'),
  kin('suresh', 'Son', 'harish'),
];
const PARENTS: Parents = {
  harish: null,
  kusum: null,
  rajesh: 'harish',
  anita: null,
  kavya: 'rajesh',
  suresh: 'harish',
};
const PARTNERS: [string, string][] = [
  ['harish', 'kusum'],
  ['rajesh', 'anita'],
];

const rowFor = (l: ReturnType<typeof layoutFamily>, id: string) =>
  l.rows.find((r) => r.key === id)!;

describe('laying a family out as an indented tree', () => {
  it('reads down the page, one row per household', () => {
    const l = layoutFamily(MEMBERS, PARENTS, PARTNERS);
    // A couple is one row, not two.
    expect(l.rows.map((r) => r.key)).toEqual(['harish', 'rajesh', 'kavya', 'suresh']);
    expect(rowFor(l, 'harish').spouse?.userId).toBe('kusum');
    expect(l.rowOf.kusum).toBe('harish');
    // Depth-first: a son, then his children, then the next son.
    expect(rowFor(l, 'kavya').y).toBeLessThan(rowFor(l, 'suresh').y);
    expect(rowFor(l, 'rajesh').y - rowFor(l, 'harish').y).toBe(ROW_PITCH);
  });

  it('steps each generation in, and puts the spouse beside', () => {
    const l = layoutFamily(MEMBERS, PARENTS, PARTNERS);
    expect(rowFor(l, 'harish').x).toBe(PAD);
    expect(rowFor(l, 'rajesh').x).toBe(PAD + INDENT);
    expect(rowFor(l, 'kavya').x).toBe(PAD + INDENT * 2);
    const head = rowFor(l, 'harish');
    expect(head.spouseX).toBeGreaterThan(head.x + head.w);
    expect(head.spouseLabel).toBe('wife');
  });

  it('writes the relation on the line to each child', () => {
    const l = layoutFamily(MEMBERS, PARENTS, PARTNERS);
    const labels = Object.fromEntries(l.stubs.map((s) => [s.key.split('->')[1], s.label]));
    expect(labels).toEqual({ rajesh: 'son', suresh: 'son', kavya: 'daughter' });
    // Each child's line lands on the indent its pill starts at.
    const stub = l.stubs.find((s) => s.key.endsWith('kavya'))!;
    expect(stub.x2).toBe(rowFor(l, 'kavya').x);
  });

  it('drops one rail past all of a parent’s children', () => {
    const l = layoutFamily(MEMBERS, PARENTS, PARTNERS);
    const rail = l.rails.find((r) => r.key === 'rail:harish')!;
    // It starts under Harish and reaches his last child, Suresh.
    expect(rail.y1).toBeGreaterThan(rowFor(l, 'harish').y);
    expect(rail.y2).toBeGreaterThanOrEqual(rowFor(l, 'suresh').y);
    expect(rail.x).toBeGreaterThan(rowFor(l, 'harish').x);
    expect(rail.x).toBeLessThan(rowFor(l, 'rajesh').x);
  });

  it('gives each line of the family its own branch', () => {
    const l = layoutFamily(MEMBERS, PARENTS, PARTNERS);
    expect(rowFor(l, 'rajesh').branch).not.toBe(rowFor(l, 'suresh').branch);
    // A branch runs all the way down: Kavya is on her father's.
    expect(rowFor(l, 'kavya').branch).toBe(rowFor(l, 'rajesh').branch);
  });

  it('hangs children of a wife from the row she is drawn on', () => {
    // Kavya entered against her mother, who is drawn beside her father.
    const members = MEMBERS.map((m) =>
      m.userId === 'kavya' ? { ...m, relatedTo: { id: 'anita', name: 'anita' } } : m,
    );
    const l = layoutFamily(members, { ...PARENTS, kavya: 'anita' }, PARTNERS);
    expect(rowFor(l, 'kavya').parentKey).toBe('rajesh');
    expect(rowFor(l, 'kavya').x).toBe(PAD + INDENT * 2);
  });

  it('starts a second line for a brother of the person at the top', () => {
    const members = [...MEMBERS, kin('mohan', 'Brother', 'harish')];
    const l = layoutFamily(members, { ...PARENTS, mohan: null }, PARTNERS);
    const mohan = rowFor(l, 'mohan');
    expect(mohan.parentKey).toBeNull();
    expect(mohan.depth).toBe(0);
    expect(mohan.x).toBe(PAD);
    // And he is below the family already drawn, not on top of it.
    expect(mohan.y).toBeGreaterThan(rowFor(l, 'suresh').y);
  });

  it('re-hangs everyone when a father is added above the top', () => {
    const members = [...MEMBERS, member('dada', { name: 'dada' })];
    const l = layoutFamily(members, { ...PARENTS, dada: null, harish: 'dada' }, PARTNERS);
    expect(rowFor(l, 'dada').depth).toBe(0);
    expect(rowFor(l, 'harish').depth).toBe(1);
    expect(rowFor(l, 'kavya').depth).toBe(3);
  });

  it('draws everyone exactly once, even when the arrangement loops', () => {
    const l = layoutFamily(
      [member('a', { name: 'a' }), member('b', { name: 'b' })],
      { a: 'b', b: 'a' },
      [],
    );
    expect(l.rows).toHaveLength(2);
    expect(new Set(l.rows.map((r) => r.key)).size).toBe(2);
  });

  it('measures what it drew, so the page can size itself', () => {
    const l = layoutFamily(MEMBERS, PARENTS, PARTNERS);
    const right = Math.max(...l.rows.map((r) => (r.spouseX ?? r.x) + (r.spouseW ?? r.w)));
    expect(l.width).toBeGreaterThanOrEqual(right);
    expect(l.height).toBeGreaterThan(rowFor(l, 'suresh').y);
  });

  it('is empty for an empty family rather than throwing', () => {
    const l = layoutFamily([], {}, []);
    expect(l.rows).toEqual([]);
    expect(l.width).toBe(PAD);
  });
});

describe('the line down to someone', () => {
  it('reads from the top of the tree to them, spouses included', () => {
    const l = layoutFamily(MEMBERS, PARENTS, PARTNERS);
    expect(lineTo(l, 'kavya').map((r) => r.key)).toEqual(['harish', 'rajesh', 'kavya']);
    // Asking about a wife answers with the row she stands on.
    expect(lineTo(l, 'anita').map((r) => r.key)).toEqual(['harish', 'rajesh']);
    expect(lineTo(l, null)).toEqual([]);
  });
});
