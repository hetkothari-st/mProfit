/**
 * Shared bits for the Finvu sandbox views — KPI tiles, helpers, types.
 * Kept in one file so the per-endpoint views can stay narrowly focused
 * on rendering their slice of the Finfactor response.
 */

import type { ReactNode } from 'react';
import { Decimal, formatINR, toDecimal } from '@portfolioos/shared';

export function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asString(v: unknown): string | null {
  if (typeof v === 'string' && v.length > 0) return v;
  if (typeof v === 'number') return String(v);
  return null;
}

export function asArray<T = unknown>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export function pick(o: unknown, key: string): unknown {
  return isObj(o) ? o[key] : undefined;
}

export function fmtMoney(v: unknown): string {
  const n = asNumber(v);
  if (n == null) return '—';
  return formatINR(toDecimal(n).toFixed(2));
}

export function fmtPct(v: unknown, digits = 2): string {
  const n = asNumber(v);
  if (n == null) return '—';
  return `${n.toFixed(digits)}%`;
}

export function fmtInt(v: unknown): string {
  const n = asNumber(v);
  if (n == null) return '—';
  return Math.trunc(n).toLocaleString('en-IN');
}

export function fmtDate(v: unknown): string {
  const s = asString(v);
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function fmtDateTime(v: unknown): string {
  const s = asString(v);
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortInr(v: number): string {
  if (Math.abs(v) >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`;
  if (Math.abs(v) >= 100_000) return `₹${(v / 100_000).toFixed(2)}L`;
  if (Math.abs(v) >= 1_000) return `₹${(v / 1_000).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
}

export type Tone = 'positive' | 'negative' | 'neutral' | 'accent';

export function toneFor(value: unknown): Tone {
  const n = asNumber(value);
  if (n == null) return 'neutral';
  if (n > 0) return 'positive';
  if (n < 0) return 'negative';
  return 'neutral';
}

const TONE_CLASS: Record<Tone, string> = {
  positive: 'text-positive',
  negative: 'text-negative',
  neutral: 'text-foreground',
  accent: 'text-accent-ink',
};

export function KpiTile({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/40 p-4">
      <div className="text-[10.5px] uppercase tracking-kerned text-muted-foreground font-medium">
        {label}
      </div>
      <div className={`mt-1 text-[22px] font-semibold tabular-nums leading-tight ${TONE_CLASS[tone]}`}>
        {value}
      </div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </div>
  );
}

export function MoneyTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: unknown;
  hint?: string;
  tone?: Tone;
}) {
  return <KpiTile label={label} value={fmtMoney(value)} hint={hint} tone={tone ?? 'neutral'} />;
}

export function PctTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: unknown;
  hint?: string;
  tone?: Tone;
}) {
  return (
    <KpiTile
      label={label}
      value={fmtPct(value)}
      hint={hint}
      tone={tone ?? toneFor(value)}
    />
  );
}

export function IntTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: unknown;
  hint?: string;
}) {
  return <KpiTile label={label} value={fmtInt(value)} hint={hint} />;
}

export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h4 className="text-[11px] uppercase tracking-kerned text-accent-ink/80 font-medium">
        {title}
      </h4>
      {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
    </div>
  );
}

export function Pill({
  children,
  tone = 'neutral',
  size = 'sm',
}: {
  children: ReactNode;
  tone?: 'positive' | 'negative' | 'neutral' | 'accent' | 'warn';
  size?: 'xs' | 'sm';
}) {
  const cls = (() => {
    switch (tone) {
      case 'positive':
        return 'bg-positive/10 text-positive ring-1 ring-positive/20';
      case 'negative':
        return 'bg-negative/10 text-negative ring-1 ring-negative/20';
      case 'accent':
        return 'bg-accent/15 text-accent-ink ring-1 ring-accent/30';
      case 'warn':
        return 'bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20';
      default:
        return 'bg-muted text-muted-foreground ring-1 ring-border';
    }
  })();
  const sizeCls = size === 'xs' ? 'text-[10px] px-1.5 py-0.5' : 'text-[11px] px-2 py-0.5';
  return (
    <span
      className={`inline-flex items-center rounded-full font-medium uppercase tracking-wide ${sizeCls} ${cls}`}
    >
      {children}
    </span>
  );
}

export function maskPan(pan: string | null | undefined): string {
  if (!pan) return '—';
  if (pan.length < 5) return pan;
  return `XXXXX${pan.slice(-4)}`;
}

export function pctOfTotal(value: unknown, total: Decimal): number | null {
  const n = asNumber(value);
  if (n == null || total.isZero()) return null;
  return new Decimal(n).dividedBy(total).times(100).toNumber();
}
