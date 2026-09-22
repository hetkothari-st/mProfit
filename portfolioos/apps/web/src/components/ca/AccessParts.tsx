import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { CaClient } from '@/api/ca.api';
import { fmtDate, editModeOfClient, EDIT_MODE_LABEL } from './accessModel';

/**
 * Pieces shared by the two sides of a professional-access relationship.
 *
 * The account holder's Account Access page and the professional's client
 * books describe the same grant from opposite ends. Drawing them with the
 * same parts is what lets each person recognise the arrangement the other
 * one is looking at.
 */

export type InitialsTone = 'active' | 'invited' | 'muted';

/** Two letters in a disc, tinted by what the row means. */
export function Initials({
  name,
  tone,
  size = 'md',
}: {
  name: string;
  tone: InitialsTone;
  size?: 'md' | 'lg';
}) {
  const letters =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join('') || '?';
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-medium',
        size === 'lg' ? 'h-12 w-12 text-[15px]' : 'h-10 w-10 text-[13px]',
        tone === 'active' && 'bg-positive/15 text-positive',
        tone === 'invited' && 'bg-warning/15 text-warning',
        tone === 'muted' && 'bg-muted text-muted-foreground',
      )}
    >
      {letters}
    </span>
  );
}

/** A row of term/answer cells along the bottom of a card. */
export function AccessStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-1 border-t border-border/60 sm:grid-cols-3', className)}>
      {children}
    </dl>
  );
}

export function AccessCell({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="border-b border-border/60 px-5 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <dt className="text-[11.5px] text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 text-[13.5px] text-foreground">{children}</dd>
    </div>
  );
}

/**
 * The professional's own three questions about a client: what they were
 * shown, what they may do, and until when.
 */
export function ClientAccessStrip({ client: c, className }: { client: CaClient; className?: string }) {
  const seesAll = c.scopeAllPortfolios && c.scopeAllCategories && c.scopeAllAssetClasses;
  return (
    <AccessStrip className={className}>
      <AccessCell term="Shared with you">{seesAll ? 'All of their books' : 'Part of their books'}</AccessCell>
      <AccessCell term="You can">{EDIT_MODE_LABEL[editModeOfClient(c)]}</AccessCell>
      <AccessCell term="Until">{c.accessUntil ? fmtDate(c.accessUntil) : 'No end date'}</AccessCell>
    </AccessStrip>
  );
}
