import { CheckCircle2, Loader2, Siren } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import {
  memberLabel,
  type AttentionItem,
  type AttentionUrgency,
  type FamilyAttention,
} from '@/api/familyDashboard.api';
import { PartialDataNotice } from './RestrictedNotice';

/**
 * The "what needs doing" feed, set as a ledger rather than a stack of cards.
 *
 * Three things decide whether a household acts on one of these: how late it
 * is, what it is, and how much it costs. So they are three columns you can run
 * an eye down — when / what / how much — instead of prose with chips on top.
 *
 * Deliberately absent: an urgency badge (the red day-count already says it), a
 * type label (the title already says "premium due"), and a per-row border (the
 * card is the container; a box inside a box is chrome, not structure).
 *
 * Every item still carries the member it belongs to. On a shared surface an
 * unattributed alert is useless — "premium overdue" needs a name attached
 * before anyone can do anything about it.
 */

const DAY_MS = 86_400_000;

interface Timing {
  /** Short form for the left column: "94d late", "in 12d", "today". */
  short: string;
  /** The exact day, shown quietly beneath — stated once, not twice. */
  exact: string;
  overdue: boolean;
}

function timing(iso: string | null, daysUntil: number | null): Timing | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;

  const days = daysUntil ?? Math.round((t - Date.now()) / DAY_MS);
  const exact = new Date(t).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });

  if (days < 0) return { short: `${Math.abs(days)}d late`, exact, overdue: true };
  if (days === 0) return { short: 'today', exact, overdue: false };
  if (days === 1) return { short: 'tomorrow', exact, overdue: false };
  return { short: `in ${days}d`, exact, overdue: false };
}

export interface FamilyAttentionCardProps {
  data: FamilyAttention | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function FamilyAttentionCard({ data, isLoading, isError }: FamilyAttentionCardProps) {
  /**
   * The feed arrives ORDERED and is left that way. The server ranks each
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
  const lateCount = items.filter((i) => (i.daysUntil ?? 1) < 0).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <CardTitle>Needs attention</CardTitle>
          {items.length > 0 && (
            <p className="text-[12.5px] text-muted-foreground">
              {lateCount > 0 && (
                <span className="font-medium text-negative">{lateCount} overdue</span>
              )}
              {lateCount > 0 && ' of '}
              <span className="numeric">{items.length}</span> open
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent>
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
          // Hairline separators, no per-row boxes: these are a list, and a list
          // reads faster than five nested containers.
          <ul className="-mx-1 divide-y divide-border/50">
            {items.map((item) => (
              <AttentionRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Urgency colours the day-count and nothing else. */
const WHEN_TONE: Record<AttentionUrgency, string> = {
  HIGH: 'text-negative',
  MEDIUM: 'text-amber-600 dark:text-amber-400',
  LOW: 'text-muted-foreground',
};

function AttentionRow({ item }: { item: AttentionItem }) {
  const when = timing(item.dueDate, item.daysUntil);
  const overdue = (item.daysUntil ?? 1) < 0;
  const showDescription =
    item.description && !isEchoOfTitle(item.description, item.title) ? item.description : null;

  return (
    <li className="flex items-baseline gap-4 px-1 py-3">
      {/* WHEN — lateness IS the urgency, so it needs no separate badge. */}
      <div className="w-[4.75rem] shrink-0 text-right">
        {when ? (
          <>
            <span
              className={cn(
                'numeric block text-[13px] font-medium leading-tight',
                overdue ? 'text-negative' : WHEN_TONE[item.urgency],
              )}
            >
              {when.short}
            </span>
            <span className="numeric block text-[10.5px] leading-tight text-muted-foreground/70">
              {when.exact}
            </span>
          </>
        ) : (
          // No date on this kind of item — a nudge, not a deadline.
          <span className="text-[13px] leading-tight text-muted-foreground/50">—</span>
        )}
      </div>

      {/* WHAT — the member sits inline; it is context, not a category chip. */}
      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-medium leading-snug text-foreground">{item.title}</p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
          {memberLabel(item.member)}
          {showDescription && <span> · {showDescription}</span>}
        </p>
      </div>

      {/* HOW MUCH — right-aligned so the figures form a column you can scan. */}
      <div className="shrink-0 text-right">
        {item.amountInr ? (
          <Money className="numeric text-[14px] font-medium text-foreground">
            {formatINR(item.amountInr)}
          </Money>
        ) : (
          <span className="text-[13px] text-muted-foreground/40">—</span>
        )}
      </div>
    </li>
  );
}

/**
 * True when the description merely restates the title. The server writes both,
 * and for deadline items they say the same thing — "EMI is 64 days overdue"
 * under "HDFC Bank EMI overdue" — which the day-count column already carries.
 * Descriptions that add something ("No bank account and no holdings") survive.
 */
function isEchoOfTitle(description: string, title: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  const d = norm(description);
  const t = norm(title);
  if (d === t) return true;

  const titleWords = new Set(t.split(' ').filter((w) => w.length > 3));
  const descWords = d.split(' ').filter((w) => w.length > 3);
  if (descWords.length === 0) return false;
  const overlap = descWords.filter((w) => titleWords.has(w)).length;
  return overlap / descWords.length >= 0.5;
}
