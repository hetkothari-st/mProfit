import { CalendarClock, CheckCircle2, Loader2, Siren } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import {
  ATTENTION_TYPE_LABEL,
  memberLabel,
  type AttentionItem,
  type AttentionUrgency,
  type FamilyAttention,
} from '@/api/familyDashboard.api';
import { PartialDataNotice } from './RestrictedNotice';

/**
 * The "what needs doing" feed. Ranked HIGH → MEDIUM → LOW, then by how soon
 * it falls due — so the top of the list is always the next thing someone in
 * the household has to act on.
 *
 * Every item is badged with the member it belongs to. On a shared surface an
 * unattributed alert is useless: "premium overdue" needs a name attached
 * before anyone can do anything about it.
 */

const URGENCY_TONE: Record<AttentionUrgency, string> = {
  HIGH: 'border-negative/45 bg-negative/10 text-negative',
  MEDIUM: 'border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300',
  LOW: 'border-border bg-muted/60 text-muted-foreground',
};

const RAIL_TONE: Record<AttentionUrgency, string> = {
  HIGH: 'bg-negative',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-border',
};

const DAY_MS = 86_400_000;

function dueLabel(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const days = Math.round((t - Date.now()) / DAY_MS);
  const date = new Date(t).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  if (days < 0) return `${date} · ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue`;
  if (days === 0) return `${date} · today`;
  if (days === 1) return `${date} · tomorrow`;
  return `${date} · in ${days} days`;
}

export interface FamilyAttentionCardProps {
  data: FamilyAttention | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function FamilyAttentionCard({ data, isLoading, isError }: FamilyAttentionCardProps) {
  /**
   * The feed arrives ORDERED and it is left that way. The server ranks each
   * member's items by urgency then soonest, caps them, and interleaves the
   * members round-robin so one member with a messy month cannot occupy the
   * whole list (see the FAIRNESS POLICY in familyAggregate.service). A global
   * re-sort here would undo exactly that.
   */
  const items = data?.items ?? [];

  /**
   * Members every one of whose items the caller's grant hides. An empty feed
   * with a hidden member means "nothing you may see", not "nothing to do" —
   * the two empty states below must not look alike.
   */
  const hiddenMemberCount = data?.hiddenMemberCount ?? 0;

  const highCount = items.filter((i) => i.urgency === 'HIGH').length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              Attention
            </p>
            <CardTitle className="mt-1">What the household needs to deal with</CardTitle>
          </div>
          {items.length > 0 && (
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                Open items
              </p>
              <p className="numeric-display text-[15px] font-medium">
                <span className={cn(highCount > 0 && 'text-negative')}>{highCount}</span>
                <span className="text-muted-foreground"> high · {items.length} total</span>
              </p>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {isLoading && (
          <div className="flex h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {isError && !isLoading && (
          <p className="py-6 text-sm text-negative">
            Couldn&apos;t load the household&apos;s alerts. Try again shortly.
          </p>
        )}

        {!isLoading && !isError && (
          <PartialDataNotice hiddenCount={hiddenMemberCount} what="This feed" />
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="grid h-36 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
            <span className="max-w-sm px-4">
              {hiddenMemberCount > 0 ? (
                <>
                  <Siren className="mx-auto mb-2 h-5 w-5" strokeWidth={1.6} />
                  Nothing needs attention among the members you can see. Items belonging to
                  the {hiddenMemberCount === 1 ? 'hidden member' : 'hidden members'} would not
                  appear here.
                </>
              ) : (
                <>
                  <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-positive" strokeWidth={1.6} />
                  Nothing needs attention right now.
                </>
              )}
            </span>
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item) => (
              <AttentionRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const urgency: AttentionUrgency = item.urgency;
  const due = dueLabel(item.dueDate);
  // Negative `daysUntil` is overdue; null means the item has no date at all.
  const overdue = (item.daysUntil ?? 1) < 0;

  return (
    <li className="flex gap-3 rounded-lg border border-border/60 bg-muted/15 p-3">
      <span className={cn('w-[3px] shrink-0 self-stretch rounded-full', RAIL_TONE[urgency])} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-1.5 py-px text-[9.5px] font-medium uppercase tracking-kerned',
              URGENCY_TONE[urgency],
            )}
          >
            {urgency}
          </span>
          {/* Member attribution is not optional on a household feed. */}
          <span className="inline-flex items-center rounded-full border border-border bg-background/60 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-kerned text-muted-foreground">
            {memberLabel(item.member)}
          </span>
          <span className="text-[9.5px] uppercase tracking-kerned text-muted-foreground/70">
            {ATTENTION_TYPE_LABEL[item.type]}
          </span>
        </div>

        <p className="mt-1.5 text-[14px] font-medium leading-snug text-foreground">
          {item.title}
        </p>
        {item.description && (
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            {item.description}
          </p>
        )}

        {(due || item.amountInr) && (
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11.5px]">
            {due && (
              <span
                className={cn(
                  'inline-flex items-center gap-1',
                  overdue ? 'text-negative' : 'text-muted-foreground',
                )}
              >
                <CalendarClock className="h-3 w-3" strokeWidth={1.8} />
                <span className="numeric">{due}</span>
              </span>
            )}
            {item.amountInr && (
              <Money className="font-medium text-foreground">{formatINR(item.amountInr)}</Money>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
