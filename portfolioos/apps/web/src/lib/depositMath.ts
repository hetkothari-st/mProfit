/**
 * Pure deposit/accrual math shared by the FD and Post Office detail pages.
 *
 * Extracted verbatim from FdDetailPage so both pages compute compound accrual,
 * month arithmetic, and chart formatting identically. Money math uses
 * decimal.js throughout (project invariant §3.2) — never JS Number.
 */
import { Decimal, compoundDeposit, formatDateIST } from '@everypaisa/shared';

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
  return formatDateIST(iso);
}

export const INR_COMPACT = (v: number): string => {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(2)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(2)}L`;
  if (v >= 1e3) return `₹${(v / 1e3).toFixed(1)}K`;
  return `₹${v.toFixed(0)}`;
};

/**
 * Compound accrual at an arbitrary valuation date for a single deposit.
 * Delegates to the shared deposit formula, which the backend FD accrual in
 * holdingsProjection.ts also uses.
 */
export function accruedValue(opts: {
  principal: Decimal;
  rate: Decimal;
  startIso: string;
  valuationIso: string;
  periodsPerYear: number;
}): Decimal {
  return compoundDeposit({
    principal: opts.principal,
    annualRate: opts.rate,
    start: opts.startIso,
    valuation: opts.valuationIso,
    periodsPerYear: opts.periodsPerYear,
  });
}
