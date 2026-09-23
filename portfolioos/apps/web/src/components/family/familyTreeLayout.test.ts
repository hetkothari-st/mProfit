import { describe, it, expect } from 'vitest';
import { autoLayout, buildTree, CARD_W } from './FamilyTreeCanvas';
import type { FamilyMemberRow, FamilyRole } from '@/api/families.api';

/**
 * The shape a family expects to see. Mahendra and Sarita are husband and
 * wife; Akshay and Shalin are the sons of both of them; Shalin is married to
 * Ritika. What used to be drawn instead: both sons hanging off their father
 * alone, and Ritika one line below Mahendra — as if she were his daughter.
 */

let joined = 0;
function member(userId: string, invitedById: string | null, role: FamilyRole = 'CONTRIBUTOR'): FamilyMemberRow {
  joined += 1;
  return {
    id: `m-${userId}`,
    userId,
    name: userId,
    email: null,
    managed: true,
    managedBy: null,
    contactEmail: null,
    relation: null,
    relatedTo: null,
    role,
    status: 'ACTIVE',
    visibleAssetClasses: [],
    visibleCategories: [],
    joinedAt: `2026-01-${String(joined).padStart(2, '0')}T00:00:00.000Z`,
    invitedById,
  };
}

const members: FamilyMemberRow[] = [
  member('mahendra', null, 'OWNER'),
  member('sarita', 'mahendra'),
  member('akshay', 'mahendra'),
  member('shalin', 'mahendra'),
  member('ritika', 'mahendra'),
];
const parents = {
  mahendra: null,
  sarita: null,
  akshay: 'mahendra',
  shalin: 'mahendra',
  ritika: null,
} as Record<string, string | null>;
const partners: [string, string][] = [
  ['mahendra', 'sarita'],
  ['shalin', 'ritika'],
];

describe('family tree layout', () => {
  it('stands a couple side by side on the same line', () => {
    const at = autoLayout(members, parents, partners);
    const m = at.get('mahendra')!;
    const s = at.get('sarita')!;
    expect(s.y).toBe(m.y);
    expect(s.x - m.x).toBeGreaterThanOrEqual(CARD_W);
    expect(s.x - m.x).toBeLessThan(CARD_W * 1.5);

    const sh = at.get('shalin')!;
    const r = at.get('ritika')!;
    expect(r.y).toBe(sh.y);
    expect(r.x - sh.x).toBeGreaterThanOrEqual(CARD_W);
  });

  it('puts the children one generation below the couple, not below one parent', () => {
    const at = autoLayout(members, parents, partners);
    const generation = at.get('mahendra')!.y;
    expect(at.get('sarita')!.y).toBe(generation);
    for (const child of ['akshay', 'shalin']) {
      expect(at.get(child)!.y).toBeGreaterThan(generation);
    }
    // A wife married in sits with her husband, not in his parents' children.
    expect(at.get('ritika')!.y).toBe(at.get('shalin')!.y);
  });

  it('branches between places, so one line leaves the pair per child', () => {
    const [root, ...rest] = buildTree(members, parents, partners);
    expect(rest).toEqual([]);
    expect(root!.members.map((m) => m.userId)).toEqual(['mahendra', 'sarita']);
    expect(root!.children.map((c) => c.unit.ids)).toEqual([['akshay'], ['shalin', 'ritika']]);
  });

  it('centres the couple over the children they share', () => {
    const at = autoLayout(members, parents, partners);
    const left = Math.min(at.get('mahendra')!.x, at.get('sarita')!.x);
    const right = Math.max(at.get('mahendra')!.x, at.get('sarita')!.x) + CARD_W;
    const centre = (left + right) / 2;
    const childLeft = at.get('akshay')!.x;
    const childRight = at.get('ritika')!.x + CARD_W;
    expect(centre).toBeCloseTo((childLeft + childRight) / 2, 5);
  });

  it('repairs a family saved under the old rule, without re-entering anyone', () => {
    // What is on disk today: the old rule gave each wife her husband's
    // parent, which is why Ritika was drawn as Mahendra's daughter.
    const legacy = { ...parents, sarita: null, ritika: 'mahendra' };
    const [root] = buildTree(members, legacy, partners);
    expect(root!.members.map((m) => m.userId)).toEqual(['mahendra', 'sarita']);
    // Ritika arrives as half of Shalin's couple — not as a child of her own.
    expect(root!.children.map((c) => c.unit.ids)).toEqual([['akshay'], ['shalin', 'ritika']]);

    const at = autoLayout(members, legacy, partners);
    expect(at.get('ritika')!.y).toBe(at.get('shalin')!.y);
  });

  it('still lays out a family with nobody married', () => {
    const at = autoLayout(members, parents, []);
    expect(at.size).toBe(members.length);
    // Everyone under Mahendra sits below him; nobody shares his line but him.
    const top = at.get('mahendra')!.y;
    expect(at.get('akshay')!.y).toBeGreaterThan(top);
  });
});
