import { buildUnits, normalizePartners, type PartnerPair, type TreeUnit } from '@everypaisa/shared';
import type { FamilyMemberRow, FamilyRole } from '@/api/families.api';

/**
 * Laying a family out on its own.
 *
 * The tree is never arranged by hand. Someone is added as a father, a wife, a
 * brother — and the whole drawing is worked out again from those relations:
 * generations by depth, couples as one place, parents centred over the
 * children they share, and the lot measured so it can be fitted to whatever
 * screen it is on. Nothing here knows about the DOM, so it can be tested on
 * its own and reused by the board and by anything that comes later.
 *
 * Shapes it has to get right, because families have all of them:
 *   - a couple standing together with their children hanging from the pair
 *   - someone added above the person at the top, who then becomes the top
 *   - a brother of the person at the top, who has no parent to hang from and
 *     so stands beside them as a second root (a family is a forest, not a
 *     tree — see `roots`)
 *   - a branch wider than the screen, folded into a "+n" node until asked for
 */

/** child userId -> parent userId, or null for someone at the top. */
export type Parents = Record<string, string | null>;

export const NODE_H = 44;
/** Distance between the top of one generation and the top of the next. */
export const ROW_PITCH = 96;
const SIBLING_GAP = 18;
/** Two families under one roof (nobody's parent is known) stand further apart. */
const ROOT_GAP = 40;
export const PAD = 20;
const MIN_W = 96;
const MAX_W = 260;
const MORE_W = 92;

export interface LayoutNode {
  /** Unit anchor id, or `more:<anchor>` for a folded branch. */
  key: string;
  /** The people standing here. Empty for a folded branch. */
  ids: string[];
  members: FamilyMemberRow[];
  /** How many people are hidden behind a folded branch. */
  more?: number;
  /** The unit whose children are folded, for a `more` node. */
  foldedFrom?: string;
  parentKey: string | null;
  depth: number;
  x: number;
  y: number;
  w: number;
}

export interface LayoutEdge {
  key: string;
  from: string;
  to: string;
  /** SVG path: down out of the parent, across, down into the child. */
  d: string;
}

export interface FamilyLayout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
  /** Anchor id of the unit each member stands in. */
  unitOf: Record<string, string>;
  /**
   * Places at the top of the tree that are not drawn, because the view is
   * following another line. Nobody's parents are known here — an uncle whose
   * own parents were never recorded stands at the top too — so there is no
   * branch to fold them into, and the board offers them separately.
   */
  hiddenRoots: { keys: string[]; people: number };
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
    a.role !== b.role ? ROLE_RANK[a.role] - ROLE_RANK[b.role] : a.joinedAt.localeCompare(b.joinedAt),
  );
}

/** "Mahendra & Sarita", or just "Akshay Jain". */
export function unitLabel(members: FamilyMemberRow[]): string {
  if (members.length === 1) return members[0]!.name;
  return members.map((m) => m.name.trim().split(/\s+/)[0] || m.name).join(' & ');
}

/** The second line on a pill: how this place relates to the rest. */
export function unitSubtitle(members: FamilyMemberRow[]): string {
  if (members.length > 1) return 'Married';
  const m = members[0];
  if (!m) return '';
  if (m.relation && m.relatedTo) {
    return `${m.relation} of ${m.relatedTo.name.trim().split(/\s+/)[0]}`;
  }
  return m.managed ? 'Managed' : 'Member';
}

/**
 * How wide a pill has to be to hold what is on it: the initials plate, the
 * name, and the line under it — measured for both, because "Son of Kavya" is
 * often longer than the name above it. A pill that has to cut a name short is
 * worse than one with room to spare.
 */
const PLATE = 28;
const PILL_PADDING = 24;
const GAP_AFTER_PLATE = 8;
/** The crown or the eye that marks an owner or a viewer. */
const BADGE = 18;
function measure(label: string, subtitle: string): number {
  const text = Math.max(label.length * 7.1, subtitle.length * 5.9);
  return Math.round(
    Math.max(MIN_W, Math.min(MAX_W, PLATE + GAP_AFTER_PLATE + PILL_PADDING + BADGE + text)),
  );
}

interface Unit extends TreeUnit {
  members: FamilyMemberRow[];
  parentKey: string | null;
  depth: number;
}

/** The places on the tree, and which place sits under which. */
function buildUnitGraph(members: FamilyMemberRow[], parents: Parents, partners: PartnerPair[]) {
  const ordered = inDrawOrder(members);
  const byId = new Map(ordered.map((m) => [m.userId, m]));
  const known = (id: string) => byId.has(id);
  const pairs = normalizePartners(partners, known);
  const rawUnits = buildUnits(
    ordered.map((m) => m.userId),
    pairs,
  );
  const unitOf: Record<string, string> = {};
  for (const u of rawUnits) for (const id of u.ids) unitOf[id] = u.anchor;

  const units = new Map<string, Unit>();
  for (const u of rawUnits) {
    units.set(u.anchor, {
      ...u,
      members: u.ids.map((id) => byId.get(id)!).filter(Boolean),
      parentKey: null,
      depth: 0,
    });
  }
  for (const unit of units.values()) {
    for (const m of unit.members) {
      const p = parentOf(m, parents);
      const anchor = p ? unitOf[p] : null;
      if (anchor && anchor !== unit.anchor && units.has(anchor)) {
        unit.parentKey = anchor;
        break;
      }
    }
  }
  // A saved arrangement can point in a circle (someone under their own
  // descendant). Rather than hang, the first one back to itself is cut loose
  // and stands as a root.
  for (const unit of units.values()) {
    const seen = new Set<string>([unit.anchor]);
    let at = unit.parentKey;
    while (at) {
      if (seen.has(at)) {
        unit.parentKey = null;
        break;
      }
      seen.add(at);
      at = units.get(at)?.parentKey ?? null;
    }
  }
  for (const unit of units.values()) {
    let d = 0;
    let at = unit.parentKey;
    while (at) {
      d += 1;
      at = units.get(at)?.parentKey ?? null;
    }
    unit.depth = d;
  }
  return { units, unitOf };
}

export interface LayoutOptions {
  /**
   * Show the line down to this unit, its generation and its children, and
   * fold everything else. Without it the whole family is drawn.
   */
  focusKey?: string | null;
  /** Folded branches the person has opened. */
  openKeys?: string[];
  /** Fold at all. The full tree is fine on a wide screen. */
  fold?: boolean;
  /**
   * The most places to draw side by side under one parent while folding.
   * A phone that shows nine of them shows nine unreadable ones; the rest
   * fold into a "+n" that opens on a tap.
   */
  maxPerParent?: number;
}

/**
 * The units on screen when only part of the family is shown: the line from
 * the top down to the focus, who else stands on those generations, and the
 * focus's own children — capped, so a wide generation folds instead of
 * shrinking everyone to nothing.
 */
function visibleKeys(
  units: Map<string, Unit>,
  focusKey: string,
  openKeys: string[],
  maxPerParent: number,
): Set<string> {
  const keep = new Set<string>();
  const childrenOf = (key: string | null) =>
    [...units.values()].filter((u) => u.parentKey === key).map((u) => u.anchor);

  let at: string | null = focusKey;
  const path: string[] = [];
  while (at) {
    path.unshift(at);
    at = units.get(at)?.parentKey ?? null;
  }
  const onPath = new Set(path);
  /** The one that must be there, then as many others as there is room for. */
  const takeRow = (row: string[]) => {
    const must = row.filter((s) => onPath.has(s) || openKeys.includes(s));
    const rest = row.filter((s) => !must.includes(s));
    for (const key of [...must, ...rest].slice(0, Math.max(must.length, maxPerParent))) {
      keep.add(key);
    }
  };

  // Above the focus, only the line itself: a phone has no room for every
  // uncle on the way up, and their branches fold into a "+n" on the way.
  for (const key of path) keep.add(key);
  // The focus's own generation: them, and who else stands there.
  takeRow(childrenOf(units.get(focusKey)?.parentKey ?? null));
  // Their children.
  takeRow(childrenOf(focusKey));
  for (const open of openKeys) {
    if (!units.has(open)) continue;
    keep.add(open);
    for (const child of childrenOf(open)) keep.add(child);
  }
  return keep;
}

/**
 * Where everything goes. Children are laid out first and their parent is
 * centred over them; a parent too wide for the span it covers pushes its whole
 * branch aside rather than landing on top of the branch beside it.
 */
export function layoutFamily(
  members: FamilyMemberRow[],
  parents: Parents,
  partners: PartnerPair[],
  options: LayoutOptions = {},
): FamilyLayout {
  const { units, unitOf } = buildUnitGraph(members, parents, partners);
  const nodes: LayoutNode[] = [];
  const noRoots = { keys: [] as string[], people: 0 };
  if (units.size === 0) {
    return { nodes, edges: [], width: 0, height: 0, unitOf, hiddenRoots: noRoots };
  }

  const focusKey = options.focusKey && units.has(options.focusKey) ? options.focusKey : null;
  const folding = Boolean(options.fold && focusKey);
  const keep = folding
    ? visibleKeys(units, focusKey!, options.openKeys ?? [], options.maxPerParent ?? 3)
    : null;
  const shown = [...units.values()].filter((u) => !keep || keep.has(u.anchor));
  const shownKeys = new Set(shown.map((u) => u.anchor));

  interface Placed extends LayoutNode {
    childKeys: string[];
  }
  const placed = new Map<string, Placed>();
  const childrenOf = (key: string) => shown.filter((u) => u.parentKey === key).map((u) => u.anchor);

  for (const u of shown) {
    const label = unitLabel(u.members);
    const subtitle = unitSubtitle(u.members);
    placed.set(u.anchor, {
      key: u.anchor,
      ids: u.ids,
      members: u.members,
      parentKey: u.parentKey && shownKeys.has(u.parentKey) ? u.parentKey : null,
      depth: u.depth,
      x: 0,
      y: PAD + u.depth * ROW_PITCH,
      w: measure(label, subtitle),
      childKeys: childrenOf(u.anchor),
    });
  }
  // A branch that is not on screen leaves a "+n" behind, so nobody disappears
  // without saying where they went.
  if (folding) {
    for (const u of shown) {
      const hidden = [...units.values()].filter(
        (c) => c.parentKey === u.anchor && !shownKeys.has(c.anchor),
      );
      if (hidden.length === 0) continue;
      const key = `more:${u.anchor}`;
      placed.set(key, {
        key,
        ids: [],
        members: [],
        more: hidden.reduce((n, c) => n + c.members.length, 0),
        foldedFrom: u.anchor,
        parentKey: u.anchor,
        depth: u.depth + 1,
        x: 0,
        y: PAD + (u.depth + 1) * ROW_PITCH,
        w: MORE_W,
        childKeys: [],
      });
      placed.get(u.anchor)!.childKeys.push(key);
    }
  }

  const roots = [...placed.values()].filter((n) => n.parentKey === null);
  // Deepest generation first keeps the widest families from drifting: the
  // rightmost edge used so far, per generation, is what a branch is pushed past.
  const rowRight = new Map<number, number>();
  let cursor = PAD;

  const subtree = (key: string): string[] => {
    const node = placed.get(key)!;
    return [key, ...node.childKeys.flatMap(subtree)];
  };
  const shift = (key: string, dx: number) => {
    for (const k of subtree(key)) placed.get(k)!.x += dx;
  };

  function place(key: string) {
    const node = placed.get(key)!;
    if (node.childKeys.length === 0) {
      node.x = Math.max(cursor, (rowRight.get(node.depth) ?? PAD));
      cursor = node.x + node.w + SIBLING_GAP;
      rowRight.set(node.depth, cursor);
      return;
    }
    for (const child of node.childKeys) place(child);
    const first = placed.get(node.childKeys[0]!)!;
    const last = placed.get(node.childKeys[node.childKeys.length - 1]!)!;
    const centre = (first.x + last.x + last.w) / 2;
    node.x = centre - node.w / 2;
    // Wider than the children it covers: move the whole branch along rather
    // than let the parent overlap whatever is already drawn on its row.
    const floor = rowRight.get(node.depth) ?? PAD;
    if (node.x < floor) {
      shift(key, floor - node.x);
      cursor = Math.max(cursor, placed.get(key)!.x + node.w + SIBLING_GAP);
    }
    rowRight.set(node.depth, node.x + node.w + SIBLING_GAP);
    for (const k of subtree(key)) {
      const n = placed.get(k)!;
      rowRight.set(n.depth, Math.max(rowRight.get(n.depth) ?? 0, n.x + n.w + SIBLING_GAP));
      cursor = Math.max(cursor, n.x + n.w + SIBLING_GAP);
    }
  }

  roots.forEach((root, i) => {
    if (i > 0) cursor += ROOT_GAP - SIBLING_GAP;
    place(root.key);
  });

  for (const node of placed.values()) {
    const { childKeys: _children, ...rest } = node;
    nodes.push(rest);
  }
  nodes.sort((a, b) => (a.depth === b.depth ? a.x - b.x : a.depth - b.depth));

  const edges: LayoutEdge[] = [];
  for (const node of nodes) {
    if (!node.parentKey) continue;
    const parent = placed.get(node.parentKey);
    if (!parent) continue;
    edges.push({
      key: `${parent.key}->${node.key}`,
      from: parent.key,
      to: node.key,
      d: elbow(parent.x + parent.w / 2, parent.y + NODE_H, node.x + node.w / 2, node.y),
    });
  }

  const hiddenRootUnits = [...units.values()].filter(
    (u) => !u.parentKey && !shownKeys.has(u.anchor),
  );
  const width = Math.max(...nodes.map((n) => n.x + n.w), 0) + PAD;
  const height = Math.max(...nodes.map((n) => n.y + NODE_H), 0) + PAD;
  return {
    nodes,
    edges,
    width,
    height,
    unitOf,
    hiddenRoots: {
      keys: hiddenRootUnits.map((u) => u.anchor),
      people: hiddenRootUnits.reduce((n, u) => n + u.members.length, 0),
    },
  };
}

/** Down out of the parent, across, and down into the child, with soft corners. */
export function elbow(x1: number, y1: number, x2: number, y2: number, radius = 10): string {
  if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} V ${y2}`;
  const mid = y1 + (y2 - y1) / 2;
  const dir = x2 > x1 ? 1 : -1;
  const r = Math.min(radius, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2);
  return (
    `M ${x1} ${y1} V ${mid - r} ` +
    `Q ${x1} ${mid} ${x1 + r * dir} ${mid} ` +
    `H ${x2 - r * dir} ` +
    `Q ${x2} ${mid} ${x2} ${mid + r} ` +
    `V ${y2}`
  );
}

/** The line from the top of the tree down to `key`, for a breadcrumb. */
export function lineTo(layout: FamilyLayout, key: string | null): LayoutNode[] {
  if (!key) return [];
  const byKey = new Map(layout.nodes.map((n) => [n.key, n]));
  const out: LayoutNode[] = [];
  let at: string | null = key;
  const seen = new Set<string>();
  while (at && byKey.has(at) && !seen.has(at)) {
    seen.add(at);
    const node: LayoutNode = byKey.get(at)!;
    out.unshift(node);
    at = node.parentKey;
  }
  return out;
}
