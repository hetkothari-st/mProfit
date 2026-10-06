import type { ReactNode } from 'react';
import { ArrowDown, HandCoins, Landmark, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export type LoanSectionKey = 'taken' | 'given';

const SECTION_META: Record<LoanSectionKey, { icon: LucideIcon; tone: string }> = {
  taken: { icon: Landmark, tone: 'bg-negative/12 text-negative' },
  given: { icon: HandCoins, tone: 'bg-positive/12 text-positive' },
};

/** Heading for one half of the Loans page. */
export function LoanSectionHeader({
  section,
  title,
  subtitle,
  count,
  actions,
}: {
  section: LoanSectionKey;
  title: string;
  subtitle: string;
  count?: number;
  actions?: ReactNode;
}) {
  const { icon: Icon, tone } = SECTION_META[section];
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full', tone)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display text-2xl leading-tight">
            {title}
            {count !== undefined && (
              <span className="rounded-full bg-muted px-2 py-0.5 font-sans text-xs font-medium text-muted-foreground tabular-nums">
                {count}
              </span>
            )}
          </h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export interface OverviewSide {
  headline: string;
  lines: Array<{ label: string; value: string; warn?: boolean }>;
}

/** Two panels — what you owe and what you're owed — each jumping to its section. */
export function LoansOverview({
  taken,
  given,
  onJump,
}: {
  taken: OverviewSide;
  given: OverviewSide;
  onJump: (section: LoanSectionKey) => void;
}) {
  const panel = (section: LoanSectionKey, title: string, side: OverviewSide) => {
    const { icon: Icon, tone } = SECTION_META[section];
    return (
      <button
        type="button"
        onClick={() => onJump(section)}
        className="group rounded-lg border border-border/70 bg-card p-5 text-left shadow-elev transition-colors hover:border-foreground/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className={cn('flex h-7 w-7 items-center justify-center rounded-full', tone)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            {title}
          </div>
          <span className="flex items-center gap-1 text-xs text-muted-foreground transition-colors group-hover:text-foreground">
            View <ArrowDown className="h-3.5 w-3.5 transition-transform group-hover:translate-y-0.5" />
          </span>
        </div>
        <div className="mt-3 truncate font-display text-[30px] leading-none tabular-nums">
          {side.headline}
        </div>
        <dl className="mt-4 grid grid-cols-2 min-[400px]:grid-cols-3 gap-3 border-t border-border/60 pt-3">
          {side.lines.map((l) => (
            <div key={l.label} className="min-w-0">
              <dt className="truncate text-[11px] text-muted-foreground">{l.label}</dt>
              <dd
                className={cn(
                  'truncate text-sm font-medium tabular-nums',
                  l.warn && 'text-negative',
                )}
              >
                {l.value}
              </dd>
            </div>
          ))}
        </dl>
      </button>
    );
  };

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {panel('taken', 'You owe · loans taken', taken)}
      {panel('given', 'Owed to you · loans given', given)}
    </div>
  );
}

/** Sticky switcher that scrolls between the two sections and shows where you are. */
export function LoanSectionNav({
  active,
  counts,
  onJump,
}: {
  active: LoanSectionKey;
  counts: Record<LoanSectionKey, number | undefined>;
  onJump: (section: LoanSectionKey) => void;
}) {
  const items: Array<[LoanSectionKey, string]> = [
    ['taken', 'Taken'],
    ['given', 'Given'],
  ];
  return (
    <div className="sticky top-0 z-20 -mx-2 mb-6 bg-background/95 px-2 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/90">
      <nav aria-label="Loan sections" className="inline-flex rounded-full border border-border bg-card p-1 shadow-sm">
        {items.map(([key, label]) => {
          const { icon: Icon } = SECTION_META[key];
          const current = active === key;
          return (
            <button
              key={key}
              type="button"
              aria-current={current ? 'true' : undefined}
              onClick={() => onJump(key)}
              className={cn(
                'flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                current
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
              {counts[key] !== undefined && (
                <span
                  className={cn(
                    'rounded-full px-1.5 text-xs tabular-nums',
                    current ? 'bg-primary-foreground/20' : 'bg-muted',
                  )}
                >
                  {counts[key]}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
