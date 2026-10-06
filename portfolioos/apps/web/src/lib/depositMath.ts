/**
 * Pure deposit/accrual math shared by the FD and Post Office detail pages.
 *
 * Extracted verbatim from FdDetailPage so both pages compute compound accrual,
 * month arithmetic, and chart formatting identically. Money math uses
 * decimal.js throughout (project invariant §3.2) — never JS Number.
 */
import { Decimal } from '@everypaisa/shared';

export const TOOLTIP_STYLE: React.CSSProperties = {
  background: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 8,
  fontSize: 11,
};

export const TOOLTIP_LABEL_STYLE: React.CSSProperties = {
  color: 'hsl(var(--muted-foreground))',
  fontSize: 11,
};

export function daysUntil(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function monthsBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`);
  const b = new Date(`${to}T00:00:00Z`);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function addMonthsIso(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function shortMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export const INR_COMPACT = (v: number): string => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};

/**
 * Compound accrual at an arbitrary valuation date for a single deposit.
 * Matches the backend FD accrual formula in holdingsProjection.ts.
 */
export function accruedValue(opts: {
  principal: Decimal;
  rate: Decimal;
  startIso: string;
  valuationIso: string;
  periodsPerYear: number;
}): Decimal {
  const ms = new Date(`${opts.valuationIso}T00:00:00Z`).getTime() -
             new Date(`${opts.startIso}T00:00:00Z`).getTime();
  if (ms <= 0) return opts.principal;
  const years = new Decimal(ms / (365.25 * 24 * 60 * 60 * 1000));
  const periodRate = opts.rate.div(opts.periodsPerYear);
  const periods = years.times(opts.periodsPerYear);
  return opts.principal.times(new Decimal(1).plus(periodRate).pow(periods));
}
