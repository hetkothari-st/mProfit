import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowDownRight,
  ArrowUpRight,
  BadgeCheck,
  Check,
  ChevronDown,
  Clock,
  Cpu,
  Loader2,
  Repeat2,
  Sparkles,
  X,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Money } from '@/components/ui/money';
import { cn } from '@/lib/cn';
import { formatINR } from '@portfolioos/shared';
import { apiErrorMessage } from '@/api/client';
import {
  advisorApi,
  advisorKeys,
  bucketLabel,
  type AdvisorProvenance,
  type Recommendation,
  type RecommendationStatus,
  type TradeAction,
  type TradeDirection,
} from '@/api/advisor.api';

const DIRECTION_META: Record<
  TradeDirection,
  { label: string; icon: typeof ArrowUpRight; tone: string; chip: string }
> = {
  BUY: {
    label: 'Buy',
    icon: ArrowUpRight,
    tone: 'text-positive',
    chip: 'border-positive/35 bg-positive/[0.08] text-positive',
  },
  SELL: {
    label: 'Sell',
    icon: ArrowDownRight,
    tone: 'text-negative',
    chip: 'border-negative/35 bg-negative/[0.08] text-negative',
  },
  SWITCH: {
    label: 'Switch',
    icon: Repeat2,
    tone: 'text-accent-ink',
    chip: 'border-accent/35 bg-accent/[0.08] text-accent-ink',
  },
};

const STATUS_LABEL: Record<RecommendationStatus, string> = {
  OPEN: 'Open',
  ACCEPTED: 'Accepted',
  DISMISSED: 'Dismissed',
  SNOOZED: 'Snoozed',
  DONE: 'Done',
};

/** Priority 1 is the most urgent. Anything past 3 is "when you get to it". */
function priorityTone(priority: number): { label: string; className: string } {
  if (priority <= 1) return { label: 'Do first', className: 'border-negative/40 text-negative' };
  if (priority <= 3) return { label: 'Soon', className: 'border-orange-500/40 text-orange-600' };
  return { label: 'When convenient', className: 'border-border text-muted-foreground' };
}

/**
 * Adviser-approved picks come off a human-curated product list; everything else
 * was ranked by the scoring model. The distinction matters enough to show it on
 * every card rather than bury it in "Why this".
 */
function isAdviserApproved(provenance: AdvisorProvenance): boolean {
  return provenance === 'APPROVED_LIST';
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function formatSnapshotValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function TradeLeg({ leg }: { leg: TradeAction }) {
  const meta = DIRECTION_META[leg.direction];
  const Icon = meta.icon;
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border/40 py-2.5 last:border-0">
      <span
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-kerned',
          meta.chip,
        )}
      >
        <Icon className="h-3 w-3" strokeWidth={2.2} />
        {meta.label}
      </span>
      <span className="min-w-0 flex-1 text-[13.5px] font-medium text-foreground">
        {leg.instrumentName}
      </span>
      <span className="text-[11px] uppercase tracking-kerned text-muted-foreground">
        {bucketLabel(leg.bucket)}
      </span>
      {leg.units && (
        <span className="numeric text-[12.5px] text-muted-foreground">{leg.units} units</span>
      )}
      <Money className={cn('text-[14px] font-medium', meta.tone)}>{formatINR(leg.amountInr)}</Money>
    </li>
  );
}

export interface RecommendationCardProps {
  rec: Recommendation;
  /** Only true when GET /llm-status reports the prose model is available. */
  llmEnabled: boolean;
}

export function RecommendationCard({ rec, llmEnabled }: RecommendationCardProps) {
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const [prose, setProse] = useState<string | null>(rec.llmProse);
  const [proseError, setProseError] = useState<string | null>(null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['advisor', 'recommendations'] });
    qc.invalidateQueries({ queryKey: advisorKeys.allocation });
  };

  const statusMut = useMutation({
    mutationFn: (status: RecommendationStatus) =>
      status === 'SNOOZED'
        ? advisorApi.setStatus(rec.id, { status, snoozedUntil: snoozeUntilIso(7) })
        : advisorApi.setStatus(rec.id, { status }),
    onSuccess: (_data, status) => {
      toast.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
      invalidate();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Could not update this recommendation')),
  });

  // A prose failure must never take the rationale down with it — we keep the
  // deterministic explanation on screen and surface the failure as a small note.
  const proseMut = useMutation({
    mutationFn: () => advisorApi.prose(rec.id),
    onSuccess: (result) => {
      if (result.status === 'ok') {
        setProse(result.prose);
        setProseError(null);
        return;
      }
      setProseError(
        result.status === 'capped'
          ? "You've used up plain-English explanations for now. The reasoning above still stands."
          : result.status === 'disabled'
            ? 'Plain-English explanations are turned off right now.'
            : result.reason || 'Could not write a plain-English version.',
      );
    },
    onError: (e) =>
      setProseError(apiErrorMessage(e, 'Could not write a plain-English version right now.')),
  });

  const prio = priorityTone(rec.priority);
  const approved = isAdviserApproved(rec.provenance);
  const snapshotEntries = Object.entries(rec.inputsSnapshot ?? {});
  const busy = statusMut.isPending;

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/50 px-5 py-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-accent/40 text-[10px] uppercase tracking-kerned text-accent-ink">
              {titleCase(rec.category)}
            </Badge>
            <Badge variant="outline" className={cn('text-[10px] uppercase tracking-kerned', prio.className)}>
              {prio.label}
            </Badge>
            {rec.status !== 'OPEN' && (
              <Badge variant="secondary" className="text-[10px] uppercase tracking-kerned">
                {STATUS_LABEL[rec.status]}
              </Badge>
            )}
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Suggested{' '}
            {new Date(rec.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>

        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium',
            approved
              ? 'border-accent/40 bg-accent/[0.08] text-accent-ink'
              : 'border-border/70 bg-muted/40 text-muted-foreground',
          )}
          title={`Provenance: ${rec.provenance}`}
        >
          {approved ? <BadgeCheck className="h-3.5 w-3.5" /> : <Cpu className="h-3.5 w-3.5" />}
          {approved ? 'Adviser-approved product' : 'Algorithmically ranked'}
        </span>
      </div>

      {/* The trade legs — the actual instruction, given top billing. */}
      <div className="px-5 pt-3">
        <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
          What to do
        </p>
        {rec.action.length === 0 ? (
          <p className="py-2.5 text-[13.5px] text-muted-foreground">
            No trade attached — this is guidance only.
          </p>
        ) : (
          <ul className="mt-1">
            {rec.action.map((leg, i) => (
              <TradeLeg key={`${leg.direction}-${leg.instrumentName}-${i}`} leg={leg} />
            ))}
          </ul>
        )}
      </div>

      {/* The deterministic rationale is the primary explanation and is always rendered. */}
      <div className="px-5 pt-4">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
            Why we're suggesting it
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground">{rec.rationale}</p>
        </div>

        {prose && (
          <div className="mt-2.5 rounded-lg border border-accent/25 bg-accent/[0.05] p-3">
            <p className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-kerned text-accent-ink/85">
              <Sparkles className="h-3 w-3" /> In plain English
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-foreground">{prose}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Generated summary of the reasoning above. If the two ever disagree, the reasoning above
              is what the system actually used.
            </p>
          </div>
        )}

        {proseError && (
          <p className="mt-2 text-[12px] text-muted-foreground">{proseError}</p>
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent-ink hover:underline"
        >
          Why this
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')} />
        </button>

        {expanded && (
          <div className="mt-2 rounded-lg border border-border/60 bg-card p-3">
            <p className="text-[10px] font-medium uppercase tracking-kerned text-muted-foreground">
              Inputs this was computed from
            </p>
            {snapshotEntries.length === 0 ? (
              <p className="mt-1.5 text-[12.5px] text-muted-foreground">
                No input snapshot was recorded for this recommendation.
              </p>
            ) : (
              <dl className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                {snapshotEntries.map(([key, value]) => (
                  <div key={key} className="flex items-baseline justify-between gap-3 border-b border-border/30 pb-1">
                    <dt className="text-[12px] text-muted-foreground">{titleCase(key)}</dt>
                    <dd className="numeric max-w-[55%] truncate text-right text-[12.5px] text-foreground" title={formatSnapshotValue(value)}>
                      {formatSnapshotValue(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <p className="mt-2.5 text-[11px] text-muted-foreground">
              Source: <span className="numeric">{rec.provenance}</span>
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/50 px-5 py-3.5">
        <Button
          size="sm"
          variant="outline"
          disabled={busy || rec.status === 'ACCEPTED'}
          onClick={() => statusMut.mutate('ACCEPTED')}
        >
          <Check className="h-3.5 w-3.5" /> Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy || rec.status === 'DONE'}
          onClick={() => statusMut.mutate('DONE')}
        >
          <BadgeCheck className="h-3.5 w-3.5" /> Done
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || rec.status === 'SNOOZED'}
          onClick={() => statusMut.mutate('SNOOZED')}
        >
          <Clock className="h-3.5 w-3.5" /> Snooze 7 days
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy || rec.status === 'DISMISSED'}
          onClick={() => statusMut.mutate('DISMISSED')}
        >
          <X className="h-3.5 w-3.5" /> Dismiss
        </Button>

        {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

        {llmEnabled && !prose && (
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            disabled={proseMut.isPending}
            onClick={() => {
              setProseError(null);
              proseMut.mutate();
            }}
          >
            {proseMut.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Explain in plain English
          </Button>
        )}
      </div>
    </Card>
  );
}

function snoozeUntilIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}
