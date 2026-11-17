/**
 * Small presentational pieces shared by the report and results pages:
 * score ring, verdict chip, severity styling, pillar bars, stat tiles.
 * Pure UI — no data fetching, no money maths.
 */

import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { PolicyScoreSnapshot } from '@everypaisa/shared';

export type Severity = 'CRITICAL' | 'WARNING' | 'NOTICE' | 'INFO';

export const SEVERITY_STYLE: Record<
  Severity,
  { label: string; chip: string; border: string; tint: string; text: string; Icon: typeof Info }
> = {
  CRITICAL: {
    label: 'Critical',
    chip: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
    border: 'border-l-red-500',
    tint: 'bg-red-50/60 dark:bg-red-950/20',
    text: 'text-red-600 dark:text-red-400',
    Icon: AlertCircle,
  },
  WARNING: {
    label: 'Attention',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    border: 'border-l-amber-500',
    tint: 'bg-amber-50/60 dark:bg-amber-950/20',
    text: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  NOTICE: {
    label: 'Note',
    chip: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300',
    border: 'border-l-blue-500',
    tint: 'bg-blue-50/60 dark:bg-blue-950/20',
    text: 'text-blue-600 dark:text-blue-400',
    Icon: Info,
  },
  INFO: {
    label: 'Good',
    chip: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
    border: 'border-l-green-500',
    tint: 'bg-green-50/60 dark:bg-green-950/20',
    text: 'text-green-600 dark:text-green-400',
    Icon: CheckCircle2,
  },
};

export function asSeverity(s: string): Severity {
  return s === 'CRITICAL' || s === 'WARNING' || s === 'NOTICE' ? s : 'INFO';
}

export function SeverityChip({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${s.chip}`}>
      <s.Icon className="h-3 w-3" /> {s.label}
    </span>
  );
}

const VERDICTS: Record<string, { label: string; chip: string; stroke: string; text: string }> = {
  GREEN: {
    label: 'Good coverage',
    chip: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-300 dark:border-green-900',
    stroke: '#16a34a',
    text: 'text-green-600 dark:text-green-400',
  },
  AMBER: {
    label: 'Some limitations',
    chip: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900',
    stroke: '#d97706',
    text: 'text-amber-600 dark:text-amber-400',
  },
  RED: {
    label: 'Significant gaps',
    chip: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900',
    stroke: '#dc2626',
    text: 'text-red-600 dark:text-red-400',
  },
  INCOMPLETE: {
    label: 'Incomplete analysis',
    chip: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-900 dark:text-gray-300 dark:border-gray-800',
    stroke: '#9ca3af',
    text: 'text-muted-foreground',
  },
};

export function verdictStyle(verdict: string) {
  return VERDICTS[verdict] ?? VERDICTS['INCOMPLETE']!;
}

export function VerdictChip({ verdict }: { verdict: string }) {
  const v = verdictStyle(verdict);
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-sm font-medium ${v.chip}`}>{v.label}</span>;
}

/** Circular score gauge. `score` 0-100, or null for "no score". */
export function ScoreRing({ score, verdict, size = 148 }: { score: number | null; verdict: string; size?: number }) {
  const v = verdictStyle(verdict);
  const r = 52;
  const c = 2 * Math.PI * r;
  const pct = score === null ? 0 : Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={score === null ? 'No score' : `Score ${Math.round(score)} out of 100`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-muted" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={v.stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          style={{ transition: 'stroke-dashoffset 600ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {score === null ? (
          <span className="text-sm text-muted-foreground">No score</span>
        ) : (
          <>
            <span className={`text-4xl font-bold tabular-nums leading-none ${v.text}`}>{Math.round(score)}</span>
            <span className="mt-1 text-xs text-muted-foreground">out of 100</span>
          </>
        )}
      </div>
    </div>
  );
}

function pillarName(key: string): string {
  const s = key.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PillarBars({ pillars }: { pillars: PolicyScoreSnapshot['pillars'] }) {
  return (
    <div className="space-y-3">
      {pillars.map((p) => {
        const n = p.score === null ? null : parseFloat(p.score);
        const color = n === null ? 'bg-muted' : n >= 70 ? 'bg-green-500' : n >= 50 ? 'bg-amber-500' : 'bg-red-500';
        return (
          <div key={p.pillar}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span>{pillarName(p.pillar)}</span>
              <span className="tabular-nums text-muted-foreground">
                {n === null ? 'Not enough data' : `${Math.round(n)}`}
                <span className="ml-2 text-xs">weight {Math.round(parseFloat(p.appliedWeight) * 100)}%</span>
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full rounded-full ${color}`} style={{ width: n === null ? '0%' : `${n}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: 'good' | 'warn' | 'bad' }) {
  const toneClass =
    tone === 'good' ? 'text-green-600 dark:text-green-400' : tone === 'warn' ? 'text-amber-600 dark:text-amber-400' : tone === 'bad' ? 'text-red-600 dark:text-red-400' : '';
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function SectionTitle({ icon, children, aside }: { icon?: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        {icon}
        {children}
      </h2>
      {aside}
    </div>
  );
}
