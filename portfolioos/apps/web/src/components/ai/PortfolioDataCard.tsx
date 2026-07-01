import { Briefcase, Target, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import type { AiCard } from '@/api/aiAssistant.api';

/**
 * Inline visual card rendered under an assistant message. Claude
 * emits at most one card per response; the frontend decides how to
 * present it based on `cardType`.
 */
export function PortfolioDataCard({ card }: { card: AiCard }) {
  const { cardType, data } = card;
  if (cardType === 'holding') return <HoldingCard data={data} />;
  if (cardType === 'goal') return <GoalCard data={data} />;
  if (cardType === 'stat') return <StatCard data={data} />;
  if (cardType === 'action') return <ActionCard data={data} />;
  return null;
}

function formatMoney(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function formatPct(v: unknown): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(1)}%`;
}

function HoldingCard({ data }: { data: Record<string, unknown> }) {
  const gainAbs = typeof data.gainAbs === 'number' ? data.gainAbs : null;
  const positive = gainAbs !== null ? gainAbs >= 0 : true;
  return (
    <div className="mt-3 rounded-lg border border-border bg-card/60 p-3 max-w-md">
      <div className="flex items-center gap-2 mb-2">
        <Briefcase className="h-3.5 w-3.5 text-accent" strokeWidth={1.9} />
        <div className="text-sm font-medium truncate">
          {(data.name as string) ?? 'Holding'}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Current value</div>
          <div className="font-medium tabular-nums">{formatMoney(data.currentValue)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">XIRR</div>
          <div className="font-medium tabular-nums">
            {data.xirr !== undefined && data.xirr !== null
              ? `${formatPct(data.xirr).replace('+', '')} p.a.`
              : '—'}
          </div>
        </div>
        <div className="col-span-2 flex items-center gap-1.5">
          {positive ? (
            <TrendingUp className="h-3.5 w-3.5 text-positive" strokeWidth={2} />
          ) : (
            <TrendingDown className="h-3.5 w-3.5 text-negative" strokeWidth={2} />
          )}
          <span className={`text-[12px] tabular-nums ${positive ? 'text-positive' : 'text-negative'}`}>
            {formatMoney(gainAbs)} ({formatPct(data.gainPct)})
          </span>
        </div>
      </div>
    </div>
  );
}

function GoalCard({ data }: { data: Record<string, unknown> }) {
  const onTrack = Boolean(data.onTrack);
  return (
    <div className="mt-3 rounded-lg border border-border bg-card/60 p-3 max-w-md">
      <div className="flex items-center gap-2 mb-2">
        <Target className="h-3.5 w-3.5 text-accent" strokeWidth={1.9} />
        <div className="text-sm font-medium truncate">
          {(data.name as string) ?? 'Goal'}
        </div>
        <span
          className={`ml-auto text-[10px] uppercase tracking-kerned px-1.5 py-0.5 rounded ${
            onTrack
              ? 'bg-positive/15 text-positive'
              : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
          }`}
        >
          {onTrack ? 'on track' : 'behind'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <div className="text-muted-foreground">Target</div>
          <div className="font-medium tabular-nums">{formatMoney(data.target)}</div>
        </div>
        <div>
          <div className="text-muted-foreground">Projected</div>
          <div className="font-medium tabular-nums">{formatMoney(data.projected)}</div>
        </div>
        {data.gap !== undefined && (
          <div className="col-span-2">
            <div className="text-muted-foreground">Gap</div>
            <div className="font-medium tabular-nums">{formatMoney(data.gap)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ data }: { data: Record<string, unknown> }) {
  const trend = data.trend as 'up' | 'down' | 'flat' | undefined;
  return (
    <div className="mt-3 rounded-lg border border-border bg-card/60 p-3 max-w-md">
      <div className="text-[10px] uppercase tracking-kerned text-muted-foreground mb-1">
        {(data.label as string) ?? 'Stat'}
      </div>
      <div className="flex items-center gap-2">
        <div className="text-lg font-semibold tabular-nums">
          {typeof data.value === 'number' ? formatMoney(data.value) : String(data.value ?? '—')}
        </div>
        {trend === 'up' && <TrendingUp className="h-4 w-4 text-positive" strokeWidth={2} />}
        {trend === 'down' && <TrendingDown className="h-4 w-4 text-negative" strokeWidth={2} />}
      </div>
      {data.context !== undefined && (
        <div className="text-[11px] text-muted-foreground mt-1">
          {String(data.context)}
        </div>
      )}
    </div>
  );
}

function ActionCard({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-3 rounded-lg border border-accent/30 bg-accent/5 p-3 max-w-md">
      <div className="text-sm font-medium">{(data.title as string) ?? 'Suggested action'}</div>
      {data.description !== undefined && (
        <div className="text-[12px] text-muted-foreground mt-1">
          {String(data.description)}
        </div>
      )}
      {data.ctaLabel !== undefined && data.ctaLabel !== null && (
        <button
          type="button"
          className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          {String(data.ctaLabel)} <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
