import { useMemo } from 'react';
import { CalendarClock, Loader2, Target, TrendingUp } from 'lucide-react';
import { formatINR } from '@portfolioos/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import {
  FAMILY_GOAL_CATEGORY_LABEL,
  memberLabel,
  type FamilyGoal,
  type FamilyGoals,
} from '@/api/familyDashboard.api';
import { PartialDataNotice } from './RestrictedNotice';
import { isPositiveMoney } from './money';

/**
 * Shared goals across the household, soonest deadline first.
 *
 * Sorting by target date rather than by size is deliberate: a ₹5 L wedding
 * eleven months out is a more actionable row than a ₹3 Cr retirement in 2049,
 * and this card exists to tell the family what to fund next.
 */

const DAY_MS = 86_400_000;

function daysUntil(iso: string): number | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.round((t - Date.now()) / DAY_MS);
}

function formatDate(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  return new Date(t).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "in 8 months" / "overdue by 12 days" — the phrasing the sort is built on. */
function horizonLabel(days: number | null): string {
  if (days === null) return 'No target date';
  if (days < 0) {
    const overdue = Math.abs(days);
    return overdue < 60
      ? `${overdue} day${overdue === 1 ? '' : 's'} overdue`
      : `${Math.round(overdue / 30)} months overdue`;
  }
  if (days === 0) return 'Due today';
  if (days < 45) return `${days} day${days === 1 ? '' : 's'} left`;
  if (days < 730) return `${Math.round(days / 30)} months left`;
  return `${(days / 365).toFixed(1)} years left`;
}

export interface FamilyGoalsCardProps {
  data: FamilyGoals | undefined;
  isLoading: boolean;
  isError: boolean;
}

export function FamilyGoalsCard({ data, isLoading, isError }: FamilyGoalsCardProps) {
  // The goals endpoint reports hidden MEMBERS, not hidden goals: a member
  // whose GOAL category is not shared contributes an unknown number of goals,
  // so the count we can honestly show is of people, not rows.
  const hiddenMembers = data?.hiddenMemberCount ?? 0;

  const goals = useMemo(() => {
    const rows = (data?.goals ?? []).map((g) => ({
      ...g,
      days: daysUntil(g.targetDate),
    }));
    // Nearest deadline leads; dateless goals sink to the bottom rather than
    // sorting as "the year 1970".
    return rows.sort((a, b) => {
      if (a.days === null && b.days === null) return 0;
      if (a.days === null) return 1;
      if (b.days === null) return -1;
      return a.days - b.days;
    });
  }, [data]);

  const offTrack = goals.filter((g) => g.isOnTrack === false).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              Shared goals
            </p>
            <CardTitle className="mt-1">What the household is saving for</CardTitle>
          </div>
          {goals.length > 0 && (
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
                Off track
              </p>
              <p
                className={cn(
                  'numeric-display text-[15px] font-medium',
                  offTrack > 0 ? 'text-negative' : 'text-positive',
                )}
              >
                {offTrack} / {goals.length}
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
            Couldn&apos;t load the family&apos;s goals. Try again shortly.
          </p>
        )}

        {!isLoading && !isError && (
          <PartialDataNotice
            hiddenCount={hiddenMembers}
            what="This list"
          />
        )}

        {!isLoading && !isError && goals.length === 0 && (
          <div className="grid h-40 place-items-center rounded-md border border-dashed text-center text-sm text-muted-foreground">
            <span className="max-w-sm px-4">
              <Target className="mx-auto mb-2 h-5 w-5" strokeWidth={1.6} />
              {hiddenMembers > 0
                ? 'No goals are shared with you. The household may well have goals, but their owners have not granted you the Goals category.'
                : 'No goals yet. Once a member creates one, it shows here with its owner, shortfall, and the monthly SIP it needs.'}
            </span>
          </div>
        )}

        {!isLoading && !isError && goals.length > 0 && (
          <ul className="divide-y divide-border/50">
            {goals.map((g) => (
              <GoalRow key={g.id} goal={g} days={g.days} />
            ))}
          </ul>
        )}

        {!isLoading && !isError && goals.length > 0 && (
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            &ldquo;Needs monthly&rdquo; is the SIP that closes the shortfall by the target
            date at the goal&apos;s assumed return. A goal is off track when the current
            contribution rate won&apos;t get there.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function GoalRow({ goal, days }: { goal: FamilyGoal; days: number | null }) {
  const pct = Math.max(0, Math.min(100, goal.progressPct ?? 0));
  const urgent = days !== null && days < 180;
  const overdue = days !== null && days < 0;

  return (
    <li className="py-3.5 first:pt-1">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[14px] font-medium text-foreground">{goal.name}</span>
            <Badge variant="outline" className="text-[9.5px] uppercase tracking-kerned">
              {FAMILY_GOAL_CATEGORY_LABEL[goal.category]}
            </Badge>
            {goal.isOnTrack === false && (
              <Badge
                variant="outline"
                className="border-negative/45 text-[9.5px] uppercase tracking-kerned text-negative"
              >
                Off track
              </Badge>
            )}
          </div>
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            {/* Ownership is never implicit on a shared surface — a goal always
                belongs to exactly one member, and the family needs to know who. */}
            Owned by <span className="text-foreground/90">{memberLabel(goal.owner)}</span>
            {' · '}
            <span
              className={cn(
                'inline-flex items-center gap-1',
                overdue ? 'text-negative' : urgent ? 'text-amber-600 dark:text-amber-400' : '',
              )}
            >
              <CalendarClock className="h-3 w-3" strokeWidth={1.8} />
              {horizonLabel(days)}
            </span>
            {' · '}
            <span className="numeric">{formatDate(goal.targetDate)}</span>
          </p>
        </div>

        <div className="text-right">
          <Money className="numeric-display text-[15px] font-medium text-foreground">
            {formatINR(goal.currentValue)}
          </Money>
          <p className="text-[11px] text-muted-foreground">
            of <Money>{formatINR(goal.targetAmount)}</Money>
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              'h-full transition-all',
              goal.isOnTrack === false ? 'bg-negative/80' : 'bg-accent',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="numeric w-12 shrink-0 text-right text-[12px] font-medium tabular-nums">
          {pct.toFixed(0)}%
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted-foreground">
        <span>
          Shortfall{' '}
          <Money
            className={cn(
              'font-medium',
              isPositiveMoney(goal.shortfall) ? 'text-foreground' : 'text-positive',
            )}
          >
            {formatINR(goal.shortfall)}
          </Money>
        </span>
        {/* Null when the goal needs no further funding, or has no horizon to
            fund it over — distinct from a zero SIP, so it is checked before the
            amount is read. */}
        {goal.requiredMonthlySip !== null && isPositiveMoney(goal.requiredMonthlySip) && (
          <span className="inline-flex items-center gap-1">
            <TrendingUp className="h-3 w-3" strokeWidth={1.8} />
            Needs monthly{' '}
            <Money className="font-medium text-foreground">
              {formatINR(goal.requiredMonthlySip)}
            </Money>
          </span>
        )}
      </div>
    </li>
  );
}
