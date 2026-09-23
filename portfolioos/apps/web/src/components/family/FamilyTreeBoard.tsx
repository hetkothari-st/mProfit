import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Crown, Eye, Loader2, Pencil, Trash2, UserCog, UserPlus, X } from 'lucide-react';
import {
  isPartnerRelation,
  normalizePartners,
  pairKey,
  type PartnerPair,
} from '@everypaisa/shared';
import { familiesApi, type FamilyMemberRow } from '@/api/families.api';
import { apiErrorMessage } from '@/api/client';
import {
  chipWidth,
  layoutFamily,
  parentOf,
  peopleOf,
  ROW_H,
  type Parents,
  type TreeRow,
} from '@/lib/familyTree';

/**
 * The family tree.
 *
 * An indented list, read down the page: the head of the family at the top,
 * their husband or wife beside them, each child stepped in under them with
 * the relation written on the line — "son", "daughter", "wife". Adding
 * anybody anywhere re-draws the whole thing from the relations; there is
 * nothing to arrange by hand and nothing to save.
 *
 * It is a list rather than a wall-chart because a wall-chart has to be shrunk
 * to fit a phone, and a shrunk chart is one nobody can read. Here every name
 * is full size at every family size; deep families scroll sideways a little,
 * long families scroll down, and neither needs a zoom control.
 *
 * Layout lives in `@/lib/familyTree` — measured, tested, and unaware of this
 * component.
 */

/**
 * A colour per branch of the family: every line and label under a given child
 * of the head shares one hue, so which line someone belongs to is clear
 * without tracing it. Kept away from the lime the app uses for "this is you".
 */
const BRANCH_COLOURS = [
  '190 72% 58%', // cyan
  '32 92% 62%', // amber
  '268 72% 70%', // violet
  '155 60% 55%', // emerald
  '345 78% 66%', // rose
  '215 85% 68%', // blue
];
function branchHsl(branch: number): string {
  if (branch < 0) return 'var(--muted-foreground)';
  return BRANCH_COLOURS[branch % BRANCH_COLOURS.length]!;
}

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
  const [picked, setPicked] = useState<string | null>(null);

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

  const layout = useMemo(
    () => layoutFamily(members, parents, partners, { selfId: currentUserId }),
    [members, parents, partners, currentUserId],
  );

  const pickedMember = useMemo(
    () => (picked ? members.find((m) => m.userId === picked) : undefined),
    [picked, members],
  );

  const arrangeMutation = useMutation({
    mutationFn: (next: Parents) =>
      familiesApi.saveTreeLayout(familyId, { nodes: [], links: [], parents: next, partners }),
    onSuccess: () => {
      toast.success('Tree rearranged');
      queryClient.invalidateQueries({ queryKey: ['family-tree-layout', familyId] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not rearrange the tree')),
  });

  /** `id` goes to the top; every line with nobody above it moves under them. */
  const makeHead = useCallback(
    (id: string) => {
      const next: Parents = { ...parents, [id]: null };
      const homeRow = layout.rowOf[id];
      for (const row of layout.rows) {
        if (row.key === homeRow) continue;
        const attached = peopleOf(row).some((m) => {
          const p = parentOf(m, next);
          return p !== null && memberIds.has(p);
        });
        if (!attached) next[row.key] = id;
      }
      setPicked(null);
      arrangeMutation.mutate(next);
    },
    [parents, layout, memberIds, arrangeMutation],
  );

  /** Move somebody under someone else; a couple goes together. */
  const placeUnder = useCallback(
    (id: string, parentId: string) => {
      const row = layout.rows.find((r) => peopleOf(r).some((m) => m.userId === id));
      const next: Parents = { ...parents, [id]: parentId };
      if (row)
        for (const other of peopleOf(row)) if (other.userId !== id) next[other.userId] = null;
      setPicked(null);
      arrangeMutation.mutate(next);
    },
    [parents, layout.rows, arrangeMutation],
  );

  if (layoutQuery.isLoading) {
    return (
      <div className="flex h-56 items-center justify-center text-muted-foreground">
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <path d="M 1 4 H 21" stroke="hsl(var(--muted-foreground))" strokeWidth="1.5" />
          </svg>
          Parent to child
        </span>
        <span className="inline-flex items-center gap-1.5">
          <svg width="22" height="8" aria-hidden>
            <path
              d="M 1 4 H 21"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
          </svg>
          Married
        </span>
        <span className="ml-auto">
          {members.length} {members.length === 1 ? 'person' : 'people'}
        </span>
      </div>

      <div className="overflow-auto rounded-xl border border-border/70 bg-muted/15">
        <div
          className="relative"
          style={{ width: Math.max(layout.width, 280), height: layout.height }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setPicked(null);
          }}
        >
          <svg
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={layout.width}
            height={layout.height}
          >
            {layout.rails.map((rail) => (
              <path
                key={rail.key}
                data-tree-rail={rail.key}
                d={`M ${rail.x} ${rail.y1} V ${rail.y2}`}
                stroke={`hsl(${branchHsl(rail.branch)} / 0.45)`}
                strokeWidth={1.5}
                fill="none"
              />
            ))}
            {layout.stubs.map((stub) => (
              <path
                key={stub.key}
                data-tree-edge={stub.key}
                d={`M ${stub.x1} ${stub.y} H ${stub.x2}`}
                stroke={`hsl(${branchHsl(stub.branch)} / 0.45)`}
                strokeWidth={1.5}
                fill="none"
              />
            ))}
            {layout.rows
              .filter((row) => row.spouse)
              .map((row) => (
                <path
                  key={`spouse:${row.key}`}
                  data-tree-spouse={row.key}
                  d={`M ${row.x + row.w} ${row.y + ROW_H / 2} H ${row.spouseX}`}
                  stroke="hsl(340 60% 70% / 0.6)"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  fill="none"
                />
              ))}
          </svg>

          {/* The word on each line: "son", "daughter" — right up against the
              pill it points at, the way the relation is spoken. */}
          {layout.stubs.map((stub) => {
            const w = chipWidth(stub.label);
            return (
              <span
                key={`chip:${stub.key}`}
                style={{
                  left: stub.x2 - w - 4,
                  top: stub.y - 10,
                  width: w,
                  color: `hsl(${branchHsl(stub.branch)})`,
                  backgroundColor: `hsl(${branchHsl(stub.branch)} / 0.14)`,
                }}
                className="absolute grid h-5 place-items-center rounded-full text-[10.5px] font-medium lowercase"
              >
                {stub.label}
              </span>
            );
          })}

          {layout.rows.map((row) => (
            <Row
              key={row.key}
              row={row}
              currentUserId={currentUserId}
              picked={picked}
              onPick={(id) => setPicked((prev) => (prev === id ? null : id))}
            />
          ))}
        </div>
      </div>

      {pickedMember && (
        <PersonCard
          key={pickedMember.userId}
          member={pickedMember}
          isOwner={isOwner}
          currentUserId={currentUserId}
          busy={arrangeMutation.isPending}
          isHead={
            (layout.rows.find((r) => r.key === layout.rowOf[pickedMember.userId])?.parentKey ??
              null) === null
          }
          candidates={members.filter((m) => m.userId !== pickedMember.userId)}
          onClose={() => setPicked(null)}
          onEdit={onEdit}
          onRevoke={onRevoke}
          onManage={onManage}
          onAddRelative={onAddRelative}
          onMakeHead={makeHead}
          onPlaceUnder={placeUnder}
        />
      )}
    </div>
  );
}

/** One line of the family: a person, and the one they are married to. */
function Row({
  row,
  currentUserId,
  picked,
  onPick,
}: {
  row: TreeRow;
  currentUserId: string | undefined;
  picked: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <>
      <Pill
        member={row.member}
        x={row.x}
        y={row.y}
        w={row.w}
        isSelf={row.member.userId === currentUserId}
        selected={picked === row.member.userId}
        onClick={() => onPick(row.member.userId)}
      />
      {row.spouse && row.spouseX !== undefined && row.spouseW !== undefined && (
        <>
          <span
            style={{
              left:
                row.spouseX - (row.spouseX - (row.x + row.w)) / 2 - chipWidth(row.spouseLabel!) / 2,
              top: row.y + ROW_H / 2 - 10,
              width: chipWidth(row.spouseLabel!),
            }}
            className="absolute grid h-5 place-items-center rounded-full bg-[hsl(340_60%_70%_/_0.16)] text-[10.5px] font-medium lowercase text-[hsl(340_70%_76%)]"
          >
            {row.spouseLabel}
          </span>
          <Pill
            member={row.spouse}
            x={row.spouseX}
            y={row.y}
            w={row.spouseW}
            isSelf={row.spouse.userId === currentUserId}
            selected={picked === row.spouse.userId}
            onClick={() => onPick(row.spouse!.userId)}
          />
        </>
      )}
    </>
  );
}

function Pill({
  member,
  x,
  y,
  w,
  isSelf,
  selected,
  onClick,
}: {
  member: FamilyMemberRow;
  x: number;
  y: number;
  w: number;
  isSelf: boolean;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{ left: x, top: y, width: w, height: ROW_H }}
      className={`absolute flex items-center gap-1.5 rounded-xl border px-3 text-left transition-colors focus-ring ${
        selected
          ? 'border-accent bg-accent text-accent-foreground'
          : isSelf
            ? 'border-accent/60 bg-accent/10 text-foreground'
            : 'border-border bg-card text-foreground hover:border-border/90 hover:bg-muted/50'
      }`}
    >
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold leading-none">
        {member.name}
      </span>
      {member.role === 'OWNER' ? (
        <Crown className={`h-3 w-3 flex-none ${selected ? '' : 'text-accent'}`} />
      ) : member.role === 'VIEWER' ? (
        <Eye className="h-3 w-3 flex-none opacity-60" />
      ) : null}
    </button>
  );
}

/** What you can do with whoever you tapped. */
function PersonCard({
  member,
  isOwner,
  currentUserId,
  busy,
  isHead,
  candidates,
  onClose,
  onEdit,
  onRevoke,
  onManage,
  onAddRelative,
  onMakeHead,
  onPlaceUnder,
}: {
  member: FamilyMemberRow;
  isOwner: boolean;
  currentUserId: string | undefined;
  busy: boolean;
  isHead: boolean;
  candidates: FamilyMemberRow[];
  onClose: () => void;
  onEdit: (m: FamilyMemberRow) => void;
  onRevoke: (m: FamilyMemberRow) => void;
  onManage?: (m: FamilyMemberRow) => void;
  onAddRelative?: (m: FamilyMemberRow) => void;
  onMakeHead: (id: string) => void;
  onPlaceUnder: (id: string, parentId: string) => void;
}) {
  const canManage = Boolean(onManage) && member.managed && member.managedBy?.id === currentUserId;
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14.5px] font-semibold leading-tight text-foreground">
            {member.name}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {member.relation && member.relatedTo
              ? `${member.relation} of ${member.relatedTo.name}`
              : member.managed
                ? `Kept by ${member.managedBy?.name ?? 'the family'}`
                : (member.email ?? 'Family member')}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => onManage!(member)}
            className="rounded-lg border border-border px-2.5 py-1.5 text-[12px] text-foreground transition-colors hover:bg-muted focus-ring"
          >
            <UserCog className="mr-1 inline h-3.5 w-3.5" />
            Their books
          </button>
        )}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground focus-ring"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isOwner && (
        <div className="mt-2.5 space-y-2 border-t border-border/70 pt-2.5">
          <div className="flex flex-wrap gap-1.5">
            {onAddRelative && (
              <CardAction
                onClick={() => onAddRelative(member)}
                icon={<UserPlus className="h-3.5 w-3.5" />}
              >
                Add a relative
              </CardAction>
            )}
            <CardAction onClick={() => onEdit(member)} icon={<Pencil className="h-3.5 w-3.5" />}>
              Edit
            </CardAction>
            <CardAction
              onClick={() => onRevoke(member)}
              icon={<Trash2 className="h-3.5 w-3.5" />}
              danger
            >
              Remove
            </CardAction>
          </div>
          <div className="flex items-center gap-1.5">
            <select
              aria-label={`Move ${member.name} under someone`}
              className="h-8 min-w-0 flex-1 rounded-lg border border-border bg-background px-2 text-[11.5px] text-foreground"
              value=""
              disabled={busy}
              onChange={(e) => {
                if (e.target.value) onPlaceUnder(member.userId, e.target.value);
              }}
            >
              <option value="">Move under…</option>
              {candidates.map((c) => (
                <option key={c.userId} value={c.userId}>
                  {c.name}
                </option>
              ))}
            </select>
            {!isHead && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onMakeHead(member.userId)}
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
