import { useState } from 'react';
import { FAMILY_RELATIONS, relationPlacement } from '@everypaisa/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import type { FamilyMemberRow } from '@/api/families.api';

export interface RelationValue {
  relatedToId: string;
  relation: string;
}

/**
 * "Related to [person] as their [relation]".
 *
 * A relation means nothing without the person it is measured against —
 * "Father" of whom? — so the two are chosen together, and the sentence under
 * them says what will happen on the tree before anyone saves.
 */
const GROUPS: Array<{ title: string; labels: string[] }> = [
  {
    title: 'Parents and grandparents',
    labels: ['Father', 'Mother', 'Father-in-law', 'Mother-in-law', 'Grandfather', 'Grandmother'],
  },
  { title: 'Spouse and siblings', labels: ['Spouse', 'Wife', 'Husband', 'Brother', 'Sister'] },
  {
    title: 'Children and grandchildren',
    labels: ['Son', 'Daughter', 'Son-in-law', 'Daughter-in-law', 'Grandson', 'Granddaughter'],
  },
];

const KNOWN = new Set(FAMILY_RELATIONS.map((r) => r.label));

const PLACEMENT_WORDS = {
  ABOVE: 'above',
  TWO_ABOVE: 'two generations above',
  BESIDE: 'beside',
  BELOW: 'below',
  // Read separately: a couple is one place on the tree, not a person beside
  // another. See the sentence below.
  PARTNER: 'with',
} as const;

export function RelationPicker({
  members,
  currentUserId,
  personName,
  value,
  onChange,
  excludeId,
  disabled,
}: {
  members: FamilyMemberRow[];
  currentUserId: string | undefined;
  /** The person being described, for the sentence. */
  personName: string;
  value: RelationValue;
  onChange: (v: RelationValue) => void;
  /** Someone cannot be related to themselves. */
  excludeId?: string;
  disabled?: boolean;
}) {
  const [other, setOther] = useState(Boolean(value.relation) && !KNOWN.has(value.relation));
  const anchors = members.filter((m) => m.status === 'ACTIVE' && m.userId !== excludeId);
  const anchor = anchors.find((m) => m.userId === value.relatedToId);
  const anchorName = anchor
    ? anchor.userId === currentUserId
      ? 'your'
      : `${anchor.name}’s`
    : '';
  const placement = relationPlacement(value.relation);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="related-to">Related to</Label>
        <select
          id="related-to"
          className="w-full h-9 rounded-md border border-border bg-background text-sm px-2"
          value={value.relatedToId}
          onChange={(e) => onChange({ ...value, relatedToId: e.target.value })}
          disabled={disabled}
        >
          {anchors.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.userId === currentUserId ? `${m.name} (you)` : m.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label>As their</Label>
        <div className="space-y-2">
          {GROUPS.map((g) => (
            <div key={g.title} className="flex flex-wrap gap-1.5" role="group" aria-label={g.title}>
              {g.labels.map((label) => (
                <Chip
                  key={label}
                  selected={!other && value.relation === label}
                  disabled={disabled}
                  onClick={() => {
                    setOther(false);
                    onChange({ ...value, relation: label });
                  }}
                >
                  {label}
                </Chip>
              ))}
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5">
            <Chip
              selected={other}
              disabled={disabled}
              onClick={() => {
                setOther(true);
                onChange({ ...value, relation: KNOWN.has(value.relation) ? '' : value.relation });
              }}
            >
              Other…
            </Chip>
            {other && (
              <Input
                autoFocus
                placeholder="e.g. Uncle, Guardian"
                value={value.relation}
                maxLength={40}
                onChange={(e) => onChange({ ...value, relation: e.target.value })}
                disabled={disabled}
                className="h-8 w-48 text-[13px]"
              />
            )}
          </div>
        </div>
      </div>

      {anchor && value.relation.trim() && (
        <p className="rounded-md bg-muted/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground">
          <span className="font-medium text-foreground">{personName.trim() || 'They'}</span> will be{' '}
          {anchorName} {value.relation.trim().toLowerCase()}, and{' '}
          {placement === 'PARTNER' ? (
            <>
              stand with {anchor.userId === currentUserId ? 'you' : anchor.name} as a couple —
              children added to either of you link to both.
            </>
          ) : (
            <>
              sit {PLACEMENT_WORDS[placement]}{' '}
              {anchor.userId === currentUserId ? 'you' : anchor.name} on the tree.
            </>
          )}
        </p>
      )}
    </div>
  );
}

function Chip({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'rounded-full border px-2.5 py-1 text-[12px] transition-colors focus-ring disabled:opacity-50',
        selected
          ? 'border-accent bg-accent/15 text-foreground'
          : 'border-border text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
