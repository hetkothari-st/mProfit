import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Crown,
  User,
  Eye,
  Settings2,
  UserX,
  Move,
  Link2,
  RotateCcw,
  Save,
  Loader2,
  X,
} from 'lucide-react';
import {
  familiesApi,
  type FamilyMemberRow,
  type FamilyRole,
  type FamilyTreeLayout,
  type FamilyTreeLink,
} from '@/api/families.api';
import { apiErrorMessage } from '@/api/client';

/**
 * Interactive family tree editor.
 *
 * Two modes:
 *   - Move (default): drag any member card. Position auto-saves to the
 *     family's `treeLayout.nodes` JSON.
 *   - Link:  click one card → then another to draw a custom connection.
 *     Clicking an existing edge highlights it; Delete key or the ✕
 *     button removes it. Custom links are saved as `treeLayout.links`.
 *
 * Layout precedence:
 *   1. Explicit `treeLayout.nodes` position when present.
 *   2. Fallback auto layout derived from `FamilyMember.invitedById`.
 *
 * Edges:
 *   - When `treeLayout.links` is non-empty, ONLY those edges render
 *     (owner has taken over the graph shape).
 *   - Otherwise, edges derive from the `invitedById` chain.
 *
 * Aesthetic: absolute-positioned pill cards over an SVG connector layer.
 * The SVG uses cubic Bezier curves between node anchors so lines feel
 * organic rather than the earlier boxy `└` characters.
 */

const CARD_W = 220;
const CARD_H = 110;
const H_GAP = 60; // between siblings
const V_GAP = 90; // between generations
const CANVAS_PAD = 40;

interface TreeNode {
  member: FamilyMemberRow;
  children: TreeNode[];
}

function buildTree(members: FamilyMemberRow[]): TreeNode[] {
  const byUserId = new Map<string, TreeNode>();
  for (const m of members) byUserId.set(m.userId, { member: m, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byUserId.values()) {
    const parentId = node.member.invitedById;
    if (parentId && byUserId.has(parentId)) {
      byUserId.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.member.role !== b.member.role) {
        const rank: Record<FamilyRole, number> = { OWNER: 0, CONTRIBUTOR: 1, VIEWER: 2 };
        return rank[a.member.role] - rank[b.member.role];
      }
      return a.member.joinedAt.localeCompare(b.member.joinedAt);
    });
    for (const n of nodes) sortNodes(n.children);
  };
  sortNodes(roots);
  return roots;
}

/** Compute default (auto) positions for members using a tidy tree layout. */
function autoLayout(members: FamilyMemberRow[]): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const tree = buildTree(members);
  // Post-order to size each subtree, then assign x centered on children.
  const widths = new Map<string, number>();
  function measure(node: TreeNode): number {
    if (node.children.length === 0) {
      widths.set(node.member.userId, CARD_W);
      return CARD_W;
    }
    let w = 0;
    for (let i = 0; i < node.children.length; i++) {
      if (i > 0) w += H_GAP;
      w += measure(node.children[i]!);
    }
    w = Math.max(w, CARD_W);
    widths.set(node.member.userId, w);
    return w;
  }
  let cursorX = CANVAS_PAD;
  function place(node: TreeNode, depth: number) {
    const w = widths.get(node.member.userId) ?? CARD_W;
    if (node.children.length === 0) {
      positions.set(node.member.userId, { x: cursorX, y: CANVAS_PAD + depth * (CARD_H + V_GAP) });
      cursorX += CARD_W + H_GAP;
      return;
    }
    const startX = cursorX;
    for (const c of node.children) place(c, depth + 1);
    // Center parent above children span.
    const firstChild = positions.get(node.children[0]!.member.userId)!;
    const lastChild = positions.get(node.children[node.children.length - 1]!.member.userId)!;
    const center = (firstChild.x + lastChild.x + CARD_W) / 2 - CARD_W / 2;
    positions.set(node.member.userId, {
      x: center,
      y: CANVAS_PAD + depth * (CARD_H + V_GAP),
    });
    // widths and cursorX already advanced by children
    void w;
    void startX;
  }
  for (const root of tree) place(root, 0);
  return positions;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

function roleGlyph(role: FamilyRole): typeof Crown {
  if (role === 'OWNER') return Crown;
  if (role === 'CONTRIBUTOR') return User;
  return Eye;
}

type Mode = 'move' | 'link';

interface Props {
  familyId: string;
  members: FamilyMemberRow[];
  currentUserId: string | undefined;
  isOwner: boolean;
  onEdit: (m: FamilyMemberRow) => void;
  onRevoke: (m: FamilyMemberRow) => void;
}

export function FamilyTreeCanvas({
  familyId,
  members,
  currentUserId,
  isOwner,
  onEdit,
  onRevoke,
}: Props) {
  const queryClient = useQueryClient();

  const layoutQuery = useQuery({
    queryKey: ['family-tree-layout', familyId],
    queryFn: () => familiesApi.getTreeLayout(familyId),
    staleTime: 30_000,
  });

  const saved = layoutQuery.data;

  // Local editable positions. Seeded from saved layout, falling back
  // to auto layout for any unpositioned member.
  const auto = useMemo(() => autoLayout(members), [members]);
  const [positions, setPositions] = useState<Map<string, { x: number; y: number }>>(new Map());
  const [customLinks, setCustomLinks] = useState<FamilyTreeLink[]>([]);
  const [dirty, setDirty] = useState(false);
  const [mode, setMode] = useState<Mode>('move');
  const [linkFrom, setLinkFrom] = useState<string | null>(null);
  const [selectedLinkIdx, setSelectedLinkIdx] = useState<number | null>(null);

  // Reset positions whenever saved layout or member set changes.
  useEffect(() => {
    const next = new Map<string, { x: number; y: number }>();
    for (const m of members) {
      const savedPos = saved?.nodes?.find((n) => n.userId === m.userId);
      next.set(m.userId, savedPos ?? auto.get(m.userId) ?? { x: CANVAS_PAD, y: CANVAS_PAD });
    }
    setPositions(next);
    setCustomLinks(saved?.links ?? []);
    setDirty(false);
    setSelectedLinkIdx(null);
    setLinkFrom(null);
  }, [saved, members, auto]);

  const saveMutation = useMutation({
    mutationFn: (layout: FamilyTreeLayout) => familiesApi.saveTreeLayout(familyId, layout),
    onSuccess: () => {
      toast.success('Layout saved');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['family-tree-layout', familyId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  const save = useCallback(() => {
    const nodes = Array.from(positions.entries()).map(([userId, p]) => ({
      userId,
      x: p.x,
      y: p.y,
    }));
    saveMutation.mutate({ nodes, links: customLinks });
  }, [positions, customLinks, saveMutation]);

  const resetLayout = () => {
    const next = new Map<string, { x: number; y: number }>();
    for (const m of members) {
      next.set(m.userId, auto.get(m.userId) ?? { x: CANVAS_PAD, y: CANVAS_PAD });
    }
    setPositions(next);
    setCustomLinks([]);
    setDirty(true);
    setSelectedLinkIdx(null);
    setLinkFrom(null);
  };

  const handleDragEnd = (userId: string, x: number, y: number) => {
    setPositions((prev) => {
      const next = new Map(prev);
      next.set(userId, { x, y });
      return next;
    });
    setDirty(true);
  };

  const handleNodeClick = (userId: string) => {
    if (mode !== 'link' || !isOwner) return;
    if (!linkFrom) {
      setLinkFrom(userId);
      return;
    }
    if (linkFrom === userId) {
      setLinkFrom(null);
      return;
    }
    // Prevent duplicates in either direction.
    const exists = customLinks.some(
      (l) =>
        (l.fromUserId === linkFrom && l.toUserId === userId) ||
        (l.fromUserId === userId && l.toUserId === linkFrom),
    );
    if (!exists) {
      setCustomLinks((prev) => [...prev, { fromUserId: linkFrom, toUserId: userId }]);
      setDirty(true);
    }
    setLinkFrom(null);
  };

  const deleteSelectedLink = useCallback(() => {
    if (selectedLinkIdx === null) return;
    setCustomLinks((prev) => prev.filter((_, i) => i !== selectedLinkIdx));
    setSelectedLinkIdx(null);
    setDirty(true);
  }, [selectedLinkIdx]);

  // Delete key removes selected link.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedLinkIdx !== null) {
        deleteSelectedLink();
      }
      if (e.key === 'Escape') {
        setLinkFrom(null);
        setSelectedLinkIdx(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedLinkIdx, deleteSelectedLink]);

  // ── Edges to render ───────────────────────────────────────────────
  const memberById = useMemo(() => {
    const m = new Map<string, FamilyMemberRow>();
    for (const mem of members) m.set(mem.userId, mem);
    return m;
  }, [members]);

  const edges = useMemo(() => {
    // Custom links override auto. If none, derive from invitedById chain.
    if (customLinks.length > 0) {
      return customLinks
        .filter((l) => memberById.has(l.fromUserId) && memberById.has(l.toUserId))
        .map((l) => ({ from: l.fromUserId, to: l.toUserId, custom: true, label: l.label }));
    }
    const auto: Array<{ from: string; to: string; custom: false; label: null }> = [];
    for (const m of members) {
      if (m.invitedById && memberById.has(m.invitedById)) {
        auto.push({ from: m.invitedById, to: m.userId, custom: false, label: null });
      }
    }
    return auto;
  }, [customLinks, members, memberById]);

  // ── Canvas size (grows with content) ──────────────────────────────
  const canvasSize = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const [, p] of positions) {
      if (p.x + CARD_W > maxX) maxX = p.x + CARD_W;
      if (p.y + CARD_H > maxY) maxY = p.y + CARD_H;
    }
    return { w: maxX + CANVAS_PAD, h: maxY + CANVAS_PAD };
  }, [positions]);

  if (members.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
        No members yet — invite someone to grow the tree.
      </div>
    );
  }
  if (layoutQuery.isLoading) {
    return (
      <div className="py-10 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="inline-flex rounded-md border border-border overflow-hidden text-sm">
          <ToolButton
            active={mode === 'move'}
            onClick={() => {
              setMode('move');
              setLinkFrom(null);
            }}
          >
            <Move className="h-3.5 w-3.5" strokeWidth={1.9} />
            Move
          </ToolButton>
          {isOwner && (
            <ToolButton
              active={mode === 'link'}
              onClick={() => {
                setMode('link');
                setSelectedLinkIdx(null);
              }}
            >
              <Link2 className="h-3.5 w-3.5" strokeWidth={1.9} />
              Link
            </ToolButton>
          )}
        </div>
        {isOwner && (
          <>
            <button
              type="button"
              onClick={resetLayout}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded border border-border hover:bg-muted/50"
              title="Reset positions and remove custom links"
            >
              <RotateCcw className="h-3 w-3" strokeWidth={1.9} />
              Reset
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!dirty || saveMutation.isPending}
              className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded border transition-colors ${
                dirty
                  ? 'border-accent text-accent-foreground bg-accent'
                  : 'border-border text-muted-foreground'
              }`}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Save className="h-3 w-3" strokeWidth={1.9} />
              )}
              {dirty ? 'Save layout' : 'Saved'}
            </button>
          </>
        )}
        {mode === 'link' && isOwner && (
          <span className="text-[11px] text-muted-foreground">
            {linkFrom
              ? 'Click another member to complete the link · Esc to cancel'
              : 'Click a member to start a link'}
          </span>
        )}
        {selectedLinkIdx !== null && isOwner && (
          <button
            type="button"
            onClick={deleteSelectedLink}
            className="inline-flex items-center gap-1 text-xs text-negative hover:underline"
          >
            <X className="h-3 w-3" strokeWidth={2} /> Delete link
          </button>
        )}
      </div>

      {/* Canvas */}
      <div
        className="relative overflow-auto rounded-lg border border-border bg-gradient-to-br from-muted/20 to-transparent"
        style={{ maxHeight: 640 }}
      >
        <div
          className="relative"
          style={{
            width: Math.max(canvasSize.w, 800),
            height: Math.max(canvasSize.h, 400),
          }}
        >
          {/* Edges layer */}
          <svg
            className="absolute inset-0 pointer-events-none"
            width={Math.max(canvasSize.w, 800)}
            height={Math.max(canvasSize.h, 400)}
          >
            {edges.map((e, idx) => {
              const a = positions.get(e.from);
              const b = positions.get(e.to);
              if (!a || !b) return null;
              const ax = a.x + CARD_W / 2;
              const ay = a.y + CARD_H;
              const bx = b.x + CARD_W / 2;
              const by = b.y;
              const mid = (ay + by) / 2;
              const d = `M ${ax} ${ay} C ${ax} ${mid}, ${bx} ${mid}, ${bx} ${by}`;
              const isSelected = e.custom && selectedLinkIdx === idx;
              return (
                <g key={idx}>
                  {/* wide invisible hit target for click selection */}
                  {e.custom && (
                    <path
                      d={d}
                      stroke="transparent"
                      strokeWidth={14}
                      fill="none"
                      className="pointer-events-auto cursor-pointer"
                      onClick={() => setSelectedLinkIdx(idx)}
                    />
                  )}
                  <path
                    d={d}
                    stroke={
                      isSelected
                        ? 'hsl(0 80% 55%)'
                        : e.custom
                        ? 'hsl(213 53% 40%)'
                        : 'hsl(var(--border))'
                    }
                    strokeWidth={isSelected ? 2.5 : e.custom ? 2 : 1.5}
                    strokeDasharray={e.custom ? '0' : '4 4'}
                    fill="none"
                  />
                  {e.label && (
                    <text
                      x={(ax + bx) / 2}
                      y={mid - 4}
                      textAnchor="middle"
                      className="fill-muted-foreground text-[10px]"
                    >
                      {e.label}
                    </text>
                  )}
                </g>
              );
            })}
            {/* Ghost edge while linking */}
            {mode === 'link' && linkFrom && positions.get(linkFrom) && (
              <circle
                cx={(positions.get(linkFrom)!.x ?? 0) + CARD_W / 2}
                cy={(positions.get(linkFrom)!.y ?? 0) + CARD_H / 2}
                r={CARD_W * 0.6}
                stroke="hsl(213 53% 40% / 0.3)"
                strokeWidth={2}
                fill="none"
                strokeDasharray="3 4"
              />
            )}
          </svg>

          {/* Nodes layer */}
          {members.map((m) => {
            const pos = positions.get(m.userId);
            if (!pos) return null;
            return (
              <DraggableNode
                key={m.userId}
                member={m}
                x={pos.x}
                y={pos.y}
                isSelf={m.userId === currentUserId}
                isOwnerViewer={isOwner}
                mode={mode}
                linkFromActive={linkFrom === m.userId}
                onDragEnd={(x, y) => handleDragEnd(m.userId, x, y)}
                onClick={() => handleNodeClick(m.userId)}
                onEdit={() => onEdit(m)}
                onRevoke={() => onRevoke(m)}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs transition-colors ${
        active
          ? 'bg-accent text-accent-foreground'
          : 'bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      }`}
    >
      {children}
    </button>
  );
}

// ─── Draggable node ─────────────────────────────────────────────────

function DraggableNode({
  member,
  x,
  y,
  isSelf,
  isOwnerViewer,
  mode,
  linkFromActive,
  onDragEnd,
  onClick,
  onEdit,
  onRevoke,
}: {
  member: FamilyMemberRow;
  x: number;
  y: number;
  isSelf: boolean;
  isOwnerViewer: boolean;
  mode: Mode;
  linkFromActive: boolean;
  onDragEnd: (x: number, y: number) => void;
  onClick: () => void;
  onEdit: () => void;
  onRevoke: () => void;
}) {
  const [pos, setPos] = useState({ x, y });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const movedRef = useRef(false);

  useEffect(() => {
    setPos({ x, y });
  }, [x, y]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (mode !== 'move' || !isOwnerViewer) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startRef.current = { x: e.clientX, y: e.clientY, ox: pos.x, oy: pos.y };
    movedRef.current = false;
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    const dx = e.clientX - startRef.current.x;
    const dy = e.clientY - startRef.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) movedRef.current = true;
    setPos({
      x: Math.max(0, startRef.current.ox + dx),
      y: Math.max(0, startRef.current.oy + dy),
    });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    startRef.current = null;
    setDragging(false);
    if (movedRef.current) {
      onDragEnd(pos.x, pos.y);
    }
    movedRef.current = false;
  };

  const RoleIcon = roleGlyph(member.role);
  const revoked = member.status === 'REVOKED';
  const pending = member.status === 'PENDING';

  return (
    <div
      className={`absolute select-none ${
        dragging ? 'cursor-grabbing z-10' : mode === 'move' && isOwnerViewer ? 'cursor-grab' : 'cursor-pointer'
      }`}
      style={{ left: pos.x, top: pos.y, width: CARD_W, height: CARD_H }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClick={(e) => {
        if (dragging || movedRef.current) return;
        // In link mode: click selects endpoint. Otherwise: no-op (edit
        // via the Edit button below).
        if (mode === 'link') {
          e.stopPropagation();
          onClick();
        }
      }}
    >
      <div
        className={`
          w-full h-full rounded-xl border shadow-sm bg-card
          ${linkFromActive ? 'ring-2 ring-accent' : ''}
          ${revoked ? 'opacity-50' : ''}
          ${dragging ? 'shadow-lg' : ''}
          transition-shadow
        `}
      >
        {/* Role glyph pin */}
        <div className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
          <RoleIcon
            className={`h-3 w-3 ${
              member.role === 'OWNER'
                ? 'text-amber-500'
                : member.role === 'CONTRIBUTOR'
                ? 'text-sky-500'
                : 'text-muted-foreground'
            }`}
            strokeWidth={2.2}
          />
        </div>

        <div className="flex items-center gap-3 p-3">
          <div
            className={`h-11 w-11 rounded-full ring-2 ring-background flex items-center justify-center font-medium text-sm shrink-0 ${
              member.role === 'OWNER'
                ? 'bg-amber-500/20 text-amber-700 dark:text-amber-300'
                : member.role === 'CONTRIBUTOR'
                ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {initials(member.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{member.name}</p>
              {isSelf && (
                <span className="text-[9px] uppercase tracking-kerned bg-foreground/10 rounded-sm px-1 py-0.5">
                  you
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground truncate">{member.email}</p>
            <div className="mt-0.5 flex items-center gap-1.5">
              <span className="text-[9px] uppercase tracking-kerned text-muted-foreground">
                {member.role.toLowerCase()}
              </span>
              {pending && (
                <span className="text-[9px] uppercase tracking-kerned text-amber-600 dark:text-amber-400">
                  pending
                </span>
              )}
              {revoked && (
                <span className="text-[9px] uppercase tracking-kerned text-muted-foreground">
                  revoked
                </span>
              )}
            </div>
          </div>
        </div>

        {isOwnerViewer && !revoked && !isSelf && (
          <div className="flex items-center gap-1 border-t border-border/50 px-2 py-1">
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onEdit();
              }}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
              title="Edit permissions"
            >
              <Settings2 className="h-3 w-3" strokeWidth={1.9} />
              Edit
            </button>
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                onRevoke();
              }}
              className="flex-1 flex items-center justify-center gap-1 text-[11px] py-0.5 rounded hover:bg-muted text-muted-foreground hover:text-negative"
              title="Revoke access"
            >
              <UserX className="h-3 w-3" strokeWidth={1.9} />
              Revoke
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
