import { normalizePartners, partnersOf, type PartnerPair } from '@everypaisa/shared';
import type { FamilyMemberRow, FamilyRole } from '@/api/families.api';

/**
 * Laying a family out as an indented tree.
 *
 * Read down the page, the way a family is actually recited: the head at the
 * top, their husband or wife beside them, and each child indented under them
 * with the relation written on the line that connects them — "son",
 * "daughter", "wife". Nothing is left to be inferred from a shape.
 *
 * Why this rather than the wall-chart it replaced: a chart that fans out
 * sideways has to be shrunk to fit a phone, and a shrunk chart is one nobody
 * can read. Indenting costs one column per generation, scrolls the way every
 * other screen does, and leaves every name at full size however large the
 * family gets.
 *
 * Shapes it has to get right:
 *   - a couple: two pills side by side, joined by a dashed line and labelled
 *   - children hanging from a rail under the parent they were entered against
 *   - someone added above the top, who becomes the new top
 *   - a brother of the person at the top, who has no parent and so starts his
 *     own line at the same indent (a family is a forest, not a tree)
 *   - an arrangement that points in a circle, which must not hang
 */

/** child userId -> parent userId, or null for someone at the top. */
export type Parents = Record<string, string | null>;

export const ROW_H = 40;
export const ROW_GAP = 16;
/** Top of one row to the top of the next. */
export const ROW_PITCH = ROW_H + ROW_GAP;
/** How far each generation steps to the right. */
export const INDENT = 64;
/** Where a parent's rail drops, measured from the left of their pill. */
export const RAIL_DX = 18;
export const PAD = 16;
/** The gap a spouse link needs between two pills. */
const SPOUSE_GAP = 62;
const MIN_PILL = 74;
const MAX_PILL = 190;

export interface TreeRow {
  /** The person this row is about. */
  key: string;
  member: FamilyMemberRow;
  /** Their husband or wife, drawn beside them. */
  spouse?: FamilyMemberRow;
  /** "wife", "husband" — what sits on the dashed line between them. */
  spouseLabel?: string;
  /** "son", "daughter" — what sits on the line from their parent. */
  relation?: string;
  parentKey: string | null;
  depth: number;
  /** Which branch of the family this belongs to; -1 at the top. */
  branch: number;
  x: number;
  y: number;
  w: number;
  /** Where the spouse's pill starts, when there is one. */
  spouseX?: number;
  spouseW?: number;
}

/** The line dropping from a parent past all of their children. */
export interface TreeRail {
  key: string;
  x: number;
  y1: number;
  y2: number;
  branch: number;
}

/** The line from a rail across to one child, and the word on it. */
export interface TreeStub {
  key: string;
  x1: number;
  x2: number;
  y: number;
  label: string;
  branch: number;
}

export interface FamilyLayout {
  rows: TreeRow[];
  rails: TreeRail[];
  stubs: TreeStub[];
  width: number;
  height: number;
  /** Which row each member is drawn on, spouses included. */
  rowOf: Record<string, string>;
}

/**
 * Who sits above `m`. The family's own arrangement wins; without one, the
 * person who invited them — so a family that has never touched the tree still
 * gets a sensible shape.
 */
export function parentOf(m: FamilyMemberRow, parents: Parents): string | null {
  return m.userId in parents ? (parents[m.userId] ?? null) : m.invitedById;
}

const ROLE_RANK: Record<FamilyRole, number> = { OWNER: 0, CONTRIBUTOR: 1, VIEWER: 2 };

/** Owners first, then by when they joined: a stable order to draw in. */
export function inDrawOrder(members: FamilyMemberRow[]): FamilyMemberRow[] {
  return [...members].sort((a, b) =>
    a.role !== b.role
      ? ROLE_RANK[a.role] - ROLE_RANK[b.role]
      : a.joinedAt.localeCompare(b.joinedAt),
  );
}

/**
 * How wide a pill has to be to hold a name without cutting it short —
 * including room for the crown or the eye on the end, which was what clipped
 * the head of the family's own name.
 */
export function pillWidth(member: FamilyMemberRow): number {
  const badge = member.role === 'OWNER' || member.role === 'VIEWER' ? 20 : 0;
  return Math.round(Math.max(MIN_PILL, Math.min(MAX_PILL, member.name.length * 8.4 + 26 + badge)));
}

/** How wide the word on a connector is. */
export function chipWidth(label: string): number {
  return Math.round(label.length * 6.2 + 16);
}

/** "son", "wife" — lower case, because it is read as part of a sentence. */
function relationWord(relation: string | null | undefined, fallback: string): string {
  const word = (relation ?? '').trim();
  return word ? word.toLowerCase() : fallback;
}

export interface LayoutOptions {
  /** Reserved: who is signed in, for callers that want to mark their row. */
  selfId?: string;
}

/**
 * Turn the family into rows, rails and stubs, measured in pixels.
 *
 * Depth-first, so the page reads as one continuous line of descent rather
 * than as generations in bands: a son, then his children, then the next son.
 */
export function layoutFamily(
  members: FamilyMemberRow[],
  parents: Parents,
  partners: PartnerPair[],
  _options: LayoutOptions = {},
): FamilyLayout {
  const ordered = inDrawOrder(members);
  const byId = new Map(ordered.map((m) => [m.userId, m]));
  const pairs = normalizePartners(partners, (id) => byId.has(id));

  /**
   * Who is drawn beside whom. The first of a pair to appear keeps their own
   * row and the other joins it, so a couple is one row and never two.
   */
  const spouseOf = new Map<string, FamilyMemberRow>();
  const drawnBeside = new Set<string>();
  for (const m of ordered) {
    if (drawnBeside.has(m.userId) || spouseOf.has(m.userId)) continue;
    const mate = partnersOf(pairs, m.userId).find(
      (id) => byId.has(id) && !drawnBeside.has(id) && !spouseOf.has(id),
    );
    if (!mate) continue;
    spouseOf.set(m.userId, byId.get(mate)!);
    drawnBeside.add(mate);
  }

  /** Children go under the row their parent is drawn on. */
  const rowFor = (id: string): string => {
    if (!drawnBeside.has(id)) return id;
    for (const [holder, mate] of spouseOf) if (mate.userId === id) return holder;
    return id;
  };
  const childrenOf = new Map<string | null, FamilyMemberRow[]>();
  for (const m of ordered) {
    if (drawnBeside.has(m.userId)) continue;
    const p = parentOf(m, parents);
    const key = p && byId.has(p) ? rowFor(p) : null;
    childrenOf.set(key === m.userId ? null : key, [
      ...(childrenOf.get(key === m.userId ? null : key) ?? []),
      m,
    ]);
  }

  const rows: TreeRow[] = [];
  const rails: TreeRail[] = [];
  const stubs: TreeStub[] = [];
  const rowOf: Record<string, string> = {};
  const placed = new Set<string>();
  let cursorY = PAD;
  let branchSeed = 0;

  const walk = (m: FamilyMemberRow, depth: number, parentKey: string | null, branch: number) => {
    // A saved arrangement can point in a circle; nobody is drawn twice.
    if (placed.has(m.userId)) return;
    placed.add(m.userId);

    const spouse = spouseOf.get(m.userId);
    const x = PAD + depth * INDENT;
    const w = pillWidth(m);
    const row: TreeRow = {
      key: m.userId,
      member: m,
      spouse,
      spouseLabel: spouse ? relationWord(spouse.relation, 'spouse') : undefined,
      relation: parentKey ? relationWord(m.relation, 'child') : undefined,
      parentKey,
      depth,
      branch,
      x,
      y: cursorY,
      w,
      spouseX: spouse ? x + w + SPOUSE_GAP : undefined,
      spouseW: spouse ? pillWidth(spouse) : undefined,
    };
    rows.push(row);
    rowOf[m.userId] = m.userId;
    if (spouse) rowOf[spouse.userId] = m.userId;
    cursorY += ROW_PITCH;

    const kids = (childrenOf.get(m.userId) ?? []).filter((k) => !placed.has(k.userId));
    if (kids.length === 0) return;
    const railX = x + RAIL_DX;
    let lastChildY = row.y + ROW_H;
    for (const kid of kids) {
      const kidBranch = depth === 0 ? branchSeed++ : branch;
      const childY = cursorY + ROW_H / 2;
      stubs.push({
        key: `${m.userId}->${kid.userId}`,
        x1: railX,
        x2: PAD + (depth + 1) * INDENT,
        y: childY,
        label: relationWord(kid.relation, 'child'),
        branch: kidBranch,
      });
      lastChildY = childY;
      walk(kid, depth + 1, m.userId, kidBranch);
    }
    rails.push({
      key: `rail:${m.userId}`,
      x: railX,
      y1: row.y + ROW_H,
      y2: lastChildY,
      branch: depth === 0 ? -1 : branch,
    });
  };

  for (const root of childrenOf.get(null) ?? []) walk(root, 0, null, -1);
  // Anyone the arrangement lost — a loop, or a parent who is not on the tree —
  // still has to appear, so they start their own line at the top level.
  for (const m of ordered) {
    if (drawnBeside.has(m.userId) || placed.has(m.userId)) continue;
    walk(m, 0, null, -1);
  }

  const rights = rows.map((r) => (r.spouseX ?? r.x) + (r.spouseW ?? r.w));
  const width = (rights.length ? Math.max(...rights) : 0) + PAD;
  const height = (rows[rows.length - 1]?.y ?? PAD - ROW_PITCH) + ROW_H + PAD;
  return { rows, rails, stubs, width, height, rowOf };
}

/** The line from the top of the tree down to `key`, for a breadcrumb. */
export function lineTo(layout: FamilyLayout, key: string | null): TreeRow[] {
  if (!key) return [];
  const byKey = new Map(layout.rows.map((r) => [r.key, r]));
  const out: TreeRow[] = [];
  const seen = new Set<string>();
  let at: string | null = layout.rowOf[key] ?? key;
  while (at && byKey.has(at) && !seen.has(at)) {
    seen.add(at);
    const row: TreeRow = byKey.get(at)!;
    out.unshift(row);
    at = row.parentKey;
  }
  return out;
}

/** Everyone standing on a row: the person, and their partner if drawn beside. */
export function peopleOf(row: TreeRow): FamilyMemberRow[] {
  return row.spouse ? [row.member, row.spouse] : [row.member];
}
