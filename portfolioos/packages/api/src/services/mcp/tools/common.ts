import { formatDateOnly } from '@everypaisa/shared';
import { prisma } from '../../../lib/prisma.js';
import { listPortfolios } from '../../portfolio.service.js';
import { ToolUserError } from './types.js';

export function dmy(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  return formatDateOnly(typeof d === 'string' ? d : d.toISOString());
}

/** Accepts dd/mm/yyyy or yyyy-mm-dd; returns yyyy-mm-dd. Throws a plain ToolUserError on nonsense. */
export function parseDateArg(v: string | undefined, label: string): string | undefined {
  if (v === undefined || v === '') return undefined;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : v;
  const t = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00Z`) : null;
  if (!t || Number.isNaN(t.getTime()) || t.toISOString().slice(0, 10) !== iso) {
    throw new ToolUserError(`The ${label} date "${v}" is not a real date. Use dd/mm/yyyy.`);
  }
  return iso;
}

/** XIRR fraction (0.1234) -> "12.34"; null stays null. Rates are dimensionless, not money. */
export function pct(x: number | null | undefined): string | null {
  if (x === null || x === undefined || !Number.isFinite(x)) return null;
  const s = (x * 100).toFixed(2);
  // A tiny negative rate rounds to "-0.00", which reads as a loss.
  return s === '-0.00' ? '0.00' : s;
}

/** The user's own portfolios, never CA client-workspace books. */
export async function ownPortfolios(userId: string) {
  const all = await listPortfolios(userId);
  return all.filter((p) => p.userId === userId && p.clientId === null);
}

/**
 * True when the user also keeps CA client-workspace books. The app's
 * user-level aggregates (dashboard, analytics, capital gains) include those
 * books, so tools must then add up the user's own portfolios one by one.
 */
export async function hasClientBooks(userId: string): Promise<boolean> {
  return (await prisma.portfolio.count({ where: { userId, clientId: { not: null } } })) > 0;
}
