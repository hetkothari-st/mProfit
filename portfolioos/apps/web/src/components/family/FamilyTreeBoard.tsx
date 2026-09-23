import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ChevronUp,
  Crown,
  Eye,
  Loader2,
  Maximize2,
  Pencil,
  Trash2,
  UserCog,
  UserPlus,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { isPartnerRelation, normalizePartners, pairKey, type PartnerPair } from '@everypaisa/shared';
import { familiesApi, type FamilyMemberRow } from '@/api/families.api';
import { apiErrorMessage } from '@/api/client';
import {
  layoutFamily,
  lineTo,
  NODE_H,

  parentOf,
  unitLabel,
  unitSubtitle,
  type LayoutNode,
  type Parents,
} from '@/lib/familyTree';

/**
 * The family tree.
 *
 * It arranges itself. Add a father, a wife, a brother — even a brother of the
 * person at the top, who has no parent to hang from — and the whole drawing is
 * worked out again from the relations and fitted to the screen. There is
 * nothing to drag and nothing to save: a tree that has to be tidied by hand is
 * a tree that is wrong the moment the family grows.
 *
 * On a narrow screen the branches away from whoever is in focus fold into a
 * "+n", because a phone-wide family shrunk to fit is a family nobody can read.
 * Tapping one opens it and the view re-fits around it.
 *
 * Layout lives in `@/lib/familyTree` — measured, tested, and unaware of this
 * component.
 */

const MAX_SCALE = 1.3;
const MIN_SCALE = 0.45;
/** Below this the tree folds to the line in focus. */
const FOLD_BELOW = 720;

interface Props {
  familyId: string;
  members: FamilyMemberRow[];
  currentUserId: string | undefined;
  isOwner: boolean;
  onEdit: (m: FamilyMemberRow) => void;
  onRevoke: (m: FamilyMemberRow) => void;
  /** Open a managed member's account; offered only to whoever keeps their books. */
  onManage?: (m: FamilyMemberRow) => void;
  /** Add someone related to this member (owners). */
  onAddRelative?: (m: FamilyMemberRow) => void;
}

export function FamilyTreeBoard({
  familyId,
  members,
  currentUserId,
  isOwner,
  onEdit,
  onRevoke,
  onManage,
  onAddRelative,
}: Props) {
  const queryClient = useQueryClient();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  /** null = fitted to the screen, which is the point of the thing. */
  const [zoom, setZoom] = useState<number | null>(null);

  const layoutQuery = useQuery({
    queryKey: ['family-tree-layout', familyId],
    queryFn: () => familiesApi.getTreeLayout(familyId),
    staleTime: 30_000,
  });
  const saved = layoutQuery.data;
  const parents = useMemo<Parents>(() => saved?.parents ?? {}, [saved]);
  const memberIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);

  /**
   * Couples: the saved pairs, plus any the relations already imply. A family
   * recorded before couples existed corrects itself without being re-entered.
   */
  const partners = useMemo<PartnerPair[]>(() => {
    const pairs = normalizePartners(saved?.partners, (id) => memberIds.has(id));
    const seen = new Set(pairs.map(([a, b]) => pairKey(a, b)));
    for (const m of members) {
      const other = m.relatedTo?.id;
      if (!other || !memberIds.has(other) || !isPartnerRelation(m.relation)) continue;
      const key = pairKey(m.userId, other);
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([m.userId, other]);
    }
    return pairs;
  }, [saved, members, memberIds]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const rect = node.getBoundingClientRect();
      setBox({ w: Math.round(rect.width), h: Math.round(rect.height) });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const fold = box.w > 0 && box.w < FOLD_BELOW;
  /** Whoever is in focus, falling back to you, falling back to the top. */
  const effectiveFocus = useMemo(() => {
    if (focusKey) return focusKey;
    const probe = layoutFamily(members, parents, partners, {});
    if (currentUserId && probe.unitOf[currentUserId]) return probe.unitOf[currentUserId];
    return probe.nodes.find((n) => !n.parentKey)?.key ?? null;
  }, [focusKey, members, parents, partners, currentUserId]);

  const layout = useMemo(
    () =>
      layoutFamily(members, parents, partners, {
        focusKey: effectiveFocus,
        fold,
        openKeys,
        // Three abreast is what stays readable on a phone; a fourth shrinks
        // every name until none of them can be read.
        maxPerParent: box.w < 420 ? 2 : 3,
      }),
    [members, parents, partners, effectiveFocus, fold, openKeys, box.w],
  );

  const fitScale = useMemo(() => {
    if (!box.w || !box.h || !layout.width || !layout.height) return 1;
    return Math.max(
      MIN_SCALE,
      Math.min(MAX_SCALE, (box.w - 8) / layout.width, (box.h - 8) / layout.height),
    );
  }, [box, layout.width, layout.height]);
  const scale = zoom ?? fitScale;
  const offset = useMemo(
    () => ({
      x: Math.max(0, (box.w - layout.width * scale) / 2),
      y: Math.max(0, (box.h - layout.height * scale) / 2),
    }),
    [box, layout.width, layout.height, scale],
  );

  // A member added or removed re-fits: the new shape is the one to look at.
  useEffect(() => {
    setZoom(null);
    setPicked(null);
  }, [members.length]);

  const byKey = useMemo(() => new Map(layout.nodes.map((n) => [n.key, n])), [layout.nodes]);
  const pickedNode = picked ? byKey.get(picked) : undefined;
  const crumbs = useMemo(() => lineTo(layout, effectiveFocus), [layout, effectiveFocus]);

  const arrangeMutation = useMutation({
    mutationFn: (next: Parents) =>
      familiesApi.saveTreeLayout(familyId, { nodes: [], links: [], parents: next, partners }),
    onSuccess: () => {
      toast.success('Tree rearranged');
      queryClient.invalidateQueries({ queryKey: ['family-tree-layout', familyId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not rearrange the tree')),
  });

  /** `id` goes to the top; every place with nobody above it moves under them. */
  const makeHead = useCallback(
    (id: string) => {
      const next: Parents = { ...parents, [id]: null };
      const headKey = layout.unitOf[id];
      for (const node of layout.nodes) {
        if (node.more || node.key === headKey) continue;
        const attached = node.members.some((m) => {
          const p = parentOf(m, next);
          return p !== null && memberIds.has(p);
        });
        if (!attached) next[node.key] = id;
      }
      setPicked(null);
      arrangeMutation.mutate(next);
    },
    [parents, layout, memberIds, arrangeMutation],
  );

  /** Move a whole place under someone: a couple goes together. */
  const placeUnder = useCallback(
    (id: string, parentId: string) => {
      const unit = layout.nodes.find((n) => n.ids.includes(id));
      const next: Parents = { ...parents, [id]: parentId };
      if (unit) for (const other of unit.ids) if (other !== id) next[other] = null;
      setPicked(null);
      arrangeMutation.mutate(next);
    },
    [parents, layout.nodes, arrangeMutation],
  );

  const focusOn = (key: string) => {
    setFocusKey(key);
    setOpenKeys([]);
    setPicked(null);
    setZoom(null);
  };

  if (layoutQuery.isLoading) {
    return (
      <div className="flex h-72 items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (members.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Nobody on the tree yet. Add a family member to start it.
      </p>
    );
  }

  const cardAt = pickedNode
    ? {
        left: Math.min(
          Math.max(8, pickedNode.x * scale + offset.x + (pickedNode.w * scale) / 2 - 140),
          Math.max(8, box.w - 288),
        ),
        top: Math.min(
          (pickedNode.y + NODE_H) * scale + offset.y + 10,
          Math.max(8, box.h - 150),
        ),
      }
    : null;

  return (
    <div className="space-y-3">
      {crumbs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 text-[12px]">
          {crumbs.map((node, i) => (
            <span key={node.key} className="flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground/60">/</span>}
              <button
                type="button"
                onClick={() => focusOn(node.key)}
                className={`rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted focus-ring ${
                  i === crumbs.length - 1
                    ? 'font-medium text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {unitLabel(node.members)}
              </button>
            </span>
          ))}
        </div>
      )}

      <div
        ref={viewportRef}
        className="relative h-[clamp(320px,58vh,680px)] w-full overflow-hidden rounded-xl border border-border/70 bg-muted/20"
        style={{
          backgroundImage:
            'radial-gradient(hsl(var(--muted-foreground) / 0.16) 1px, transparent 1px)',
          backgroundSize: '16px 16px',
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) setPicked(null);
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left transition-transform duration-300 ease-out"
          style={{
            width: layout.width,
            height: layout.height,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
          >
            {layout.edges.map((edge) => (
              <path
                key={edge.key}
                data-tree-edge={edge.key}
                d={edge.d}
                fill="none"
                strokeWidth={1.75}
                strokeLinecap="round"
                stroke="hsl(var(--muted-foreground) / 0.55)"
              />
            ))}
          </svg>

          {layout.nodes.map((node) =>
            node.more ? (
              <button
                key={node.key}
                type="button"
                onClick={() => {
                  setOpenKeys((prev) => [...prev, node.foldedFrom!]);
                  setZoom(null);
                }}
                style={{ left: node.x, top: node.y, width: node.w, height: NODE_H }}
                className="absolute rounded-xl border border-dashed border-border bg-background/40 text-[12px] text-muted-foreground transition-colors hover:border-accent/60 hover:text-foreground focus-ring"
              >
                +{node.more} more
              </button>
            ) : (
              <TreeCard
                key={node.key}
                node={node}
                currentUserId={currentUserId}
                selected={picked === node.key}
                inFocus={effectiveFocus === node.key}
                onClick={() => setPicked((prev) => (prev === node.key ? null : node.key))}
              />
            ),
          )}
        </div>

        {pickedNode && cardAt && (
          <PersonCard
            // Tapping a different person must open a card about them, not the
            // last one with a new name on it: the chosen half of a couple is
            // state, and state has to be dropped with the person.
            key={pickedNode.key}
            node={pickedNode}
            style={cardAt}
            isOwner={isOwner}
            currentUserId={currentUserId}
            busy={arrangeMutation.isPending}
            candidates={layout.nodes.filter((n) => !n.more && n.key !== pickedNode.key)}
            onClose={() => setPicked(null)}
            onFocus={() => focusOn(pickedNode.key)}
            onEdit={onEdit}
            onRevoke={onRevoke}
            onManage={onManage}
            onAddRelative={onAddRelative}
            onMakeHead={makeHead}
            onPlaceUnder={placeUnder}
          />
        )}

        <div className="absolute bottom-3 right-3 flex flex-col overflow-hidden rounded-xl border border-border bg-card/90 backdrop-blur">
          <IconButton label="Zoom in" onClick={() => setZoom(Math.min(MAX_SCALE, scale + 0.12))}>
            <ZoomIn className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Zoom out" onClick={() => setZoom(Math.max(MIN_SCALE, scale - 0.12))}>
            <ZoomOut className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Fit to screen" onClick={() => setZoom(null)}>
            <Maximize2 className="h-3.5 w-3.5" />
          </IconButton>
        </div>

        {layout.hiddenRoots.people > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpenKeys((prev) => [...prev, ...layout.hiddenRoots.keys]);
              setZoom(null);
            }}
            className="absolute left-3 top-3 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[11.5px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-ring"
          >
            +{layout.hiddenRoots.people} elsewhere at the top
          </button>
        )}

        {openKeys.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setOpenKeys([]);
              setZoom(null);
            }}
            className="absolute bottom-3 left-3 rounded-full border border-border bg-card/90 px-3 py-1.5 text-[11.5px] text-muted-foreground backdrop-blur transition-colors hover:text-foreground focus-ring"
          >
            <ChevronUp className="mr-1 inline h-3 w-3" />
            Fold the rest away
          </button>
        )}
      </div>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-ring"
    >
      {children}
    </button>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** One place on the tree: a person, or a couple standing together. */
function TreeCard({
  node,
  currentUserId,
  selected,
  inFocus,
  onClick,
}: {
  node: LayoutNode;
  currentUserId: string | undefined;
  selected: boolean;
  inFocus: boolean;
  onClick: () => void;
}) {
  const isSelf = node.members.some((m) => m.userId === currentUserId);
  const owner = node.members.some((m) => m.role === 'OWNER');
  const viewerOnly = node.members.every((m) => m.role === 'VIEWER');
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ left: node.x, top: node.y, width: node.w, height: NODE_H }}
      className={`absolute flex items-center gap-2 rounded-xl border px-2.5 text-left transition-all focus-ring ${
        selected
          ? 'border-accent bg-accent/12 shadow-[0_0_0_3px_hsl(var(--accent)/0.12)]'
          : inFocus
          ? 'border-accent/45 bg-card'
          : 'border-border bg-card hover:border-border/90 hover:bg-muted/40'
      }`}
    >
      <span
        className={`grid h-7 w-7 flex-none place-items-center rounded-lg text-[10px] font-semibold ${
          isSelf ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
        }`}
      >
        {initials(node.members[0]!.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] font-medium leading-tight text-foreground">
          {unitLabel(node.members)}
        </span>
        <span className="block truncate text-[10.5px] leading-tight text-muted-foreground">
          {unitSubtitle(node.members)}
        </span>
      </span>
      {owner ? (
        <Crown className="h-3 w-3 flex-none text-accent" />
      ) : viewerOnly ? (
        <Eye className="h-3 w-3 flex-none text-muted-foreground" />
      ) : null}
    </button>
  );
}

/** What you can do with whoever you tapped. */
function PersonCard({
  node,
  style,
  isOwner,
  currentUserId,
  busy,
  candidates,
  onClose,
  onFocus,
  onEdit,
  onRevoke,
  onManage,
  onAddRelative,
  onMakeHead,
  onPlaceUnder,
}: {
  node: LayoutNode;
  style: { left: number; top: number };
  isOwner: boolean;
  currentUserId: string | undefined;
  busy: boolean;
  candidates: LayoutNode[];
  onClose: () => void;
  onFocus: () => void;
  onEdit: (m: FamilyMemberRow) => void;
  onRevoke: (m: FamilyMemberRow) => void;
  onManage?: (m: FamilyMemberRow) => void;
  onAddRelative?: (m: FamilyMemberRow) => void;
  onMakeHead: (id: string) => void;
  onPlaceUnder: (id: string, parentId: string) => void;
}) {
  const [subject, setSubject] = useState(node.members[0]!);
  const isHead = node.parentKey === null;
  const canManage = Boolean(onManage) && subject.managed && subject.managedBy?.id === currentUserId;

  return (
    <div
      style={style}
      className="absolute z-20 w-72 rounded-2xl border border-border bg-card p-3 shadow-2xl"
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold leading-tight text-foreground">
            {subject.name}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {subject.relation && subject.relatedTo
              ? `${subject.relation} of ${subject.relatedTo.name}`
              : subject.managed
              ? `Kept by ${subject.managedBy?.name ?? 'the family'}`
              : subject.email ?? 'Family member'}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {node.members.length > 1 && (
        <div className="mt-2 flex gap-1 rounded-lg bg-muted/50 p-0.5">
          {node.members.map((m) => (
            <button
              key={m.userId}
              type="button"
              onClick={() => setSubject(m)}
              className={`flex-1 truncate rounded-md px-2 py-1 text-[11.5px] transition-colors focus-ring ${
                subject.userId === m.userId
                  ? 'bg-card font-medium text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m.name.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 flex gap-1.5">
        <button
          type="button"
          onClick={onFocus}
          className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-[12px] font-medium text-accent-foreground transition-opacity hover:opacity-90 focus-ring"
        >
          Focus here
        </button>
        {canManage && (
          <button
            type="button"
            onClick={() => onManage!(subject)}
            className="flex-1 rounded-lg border border-border px-2 py-1.5 text-[12px] text-foreground transition-colors hover:bg-muted focus-ring"
          >
            <UserCog className="mr-1 inline h-3.5 w-3.5" />
            Their books
          </button>
        )}
      </div>

      {isOwner && (
        <div className="mt-2.5 space-y-2 border-t border-border/70 pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {onAddRelative && (
              <CardAction onClick={() => onAddRelative(subject)} icon={<UserPlus className="h-3.5 w-3.5" />}>
                Add a relative
              </CardAction>
            )}
            <CardAction onClick={() => onEdit(subject)} icon={<Pencil className="h-3.5 w-3.5" />}>
              Edit
            </CardAction>
            <CardAction
              onClick={() => onRevoke(subject)}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              danger
            >
              Remove
            </CardAction>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              aria-label={`Move ${subject.name} under someone`}
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[11.5px] text-foreground"
              value=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) onPlaceUnder(subject.userId, e.target.value);
              }}
            >
              <option value="">Move under…</option>
              {candidates.map((c) => (
                <option key={c.key} value={c.members[0]!.userId}>
                  {unitLabel(c.members)}
                </option>
              ))}
            </select>
            {!isHead && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMakeHead(subject.userId)}
                className="h-8 rounded-lg border border-border px-2.5 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50 focus-ring"
              >
                To the top
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CardAction({
  onClick,
  icon,
  danger,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-[11.5px] transition-colors focus-ring ${
        danger
          ? 'text-destructive hover:bg-destructive/10'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
