/**
 * The receipt card shared by deposits and loans: a header printed in the
 * institution's brand colours — logo plate, rate, guilloché security linework
 * like the fine waves on a real FD receipt or loan sanction letter — over a
 * plain body that each page fills with its own figures.
 *
 * Colours come from `useReceiptLook`; the pages own the content.
 */
import type { MouseEvent, ReactNode } from 'react';
import { Loader2, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { BankLogo } from '@/components/bankAccounts/BankLogo';
import type { TileSurface } from '@/lib/bankBrand';

// Phase-shifted waves, computed once; drawn in white at low opacity.
const GUILLOCHE = Array.from({ length: 9 }, (_, i) => {
  let d = '';
  for (let x = 0; x <= 400; x += 5) {
    const t = (x / 400) * Math.PI;
    const y = 60 + Math.sin(t * 4 + i * 0.55) * (16 + i * 3) + Math.sin(t * 11 + i) * 3;
    d += `${x === 0 ? 'M' : 'L'}${x} ${y.toFixed(1)}`;
  }
  return d;
});

/** Security linework over a brand-coloured header; the parent must be `relative`. */
export function Guilloche() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 400 120"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.14]"
    >
      {GUILLOCHE.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="white" strokeWidth={0.8} vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

/** The whole card is a link; Enter opens it too. */
export function ReceiptShell({
  label,
  dimmed = false,
  onClick,
  children,
}: {
  label: string;
  dimmed?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={label}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) onClick();
      }}
      className={`group cursor-pointer rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background ${dimmed ? 'opacity-70' : ''}`}
    >
      <Card className="overflow-hidden p-0 transition-shadow duration-300 group-hover:shadow-elev-lg">
        {children}
      </Card>
    </div>
  );
}

const ICON_BUTTON =
  '-m-1 rounded p-1 text-white/60 transition-colors hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-60';

export function ReceiptHeader({
  institution,
  title,
  panel,
  reference,
  rate,
  holder,
  terms,
  stamp,
  editLabel,
  onEdit,
  deleteLabel,
  onDelete,
  deleting = false,
}: {
  /** Label naming the bank, for its logo ("Kotak", "HDFC Bank"). */
  institution: string;
  title: string;
  panel: TileSurface;
  /** Small print, e.g. "Fixed deposit no. 5030DI5W". */
  reference: string;
  /** Annual rate, shown large; omitted when unknown. */
  rate: string | null;
  holder: string | null;
  terms: string;
  /** Rubber stamp across the header, e.g. "Matured", "Closed". */
  stamp?: string | null;
  editLabel: string;
  onEdit: (e: MouseEvent) => void;
  deleteLabel?: string;
  onDelete?: (e: MouseEvent) => void;
  deleting?: boolean;
}) {
  // The card itself is a link; its buttons must not also open it.
  const act = (fn: (e: MouseEvent) => void) => (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    fn(e);
  };

  return (
    <div
      className="relative overflow-hidden px-5 pb-3 pt-4 text-white"
      style={{
        backgroundImage: `linear-gradient(135deg, ${panel.from} 0%, ${panel.via} 60%, ${panel.to} 100%)`,
      }}
    >
      <Guilloche />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <BankLogo bankName={institution} size={30} maxWidth={140} className="shadow-md" />
          <h3 className="mt-3 truncate font-display text-[26px] leading-none">{title}</h3>
          {holder && <p className="mt-2 truncate text-sm text-white/85">{holder}</p>}
          <p className="mt-0.5 text-[13px] text-white/65">{terms}</p>
        </div>
        {rate && (
          <div className="shrink-0 text-right">
            <p className="font-display text-[40px] leading-none tabular-nums">
              {rate}
              <span className="text-2xl">%</span>
            </p>
            <p className="mt-1 text-xs text-white/70">a year</p>
          </div>
        )}
      </div>
      <div className="relative mt-4 flex items-center justify-between gap-3 text-[11px] text-white/55">
        <span className="tabular-nums">{reference}</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={act(onEdit)} aria-label={editLabel} className={ICON_BUTTON}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {onDelete && deleteLabel && (
            <button
              type="button"
              onClick={act(onDelete)}
              disabled={deleting}
              aria-label={deleteLabel}
              className={ICON_BUTTON}
            >
              {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          )}
        </div>
      </div>
      {stamp && (
        // Sits left of the edit/delete buttons so it never covers them.
        <div className="pointer-events-none absolute bottom-6 right-20 -rotate-12 rounded-sm border-2 border-white/70 px-2 py-0.5 font-display text-sm text-white/85">
          {stamp}
        </div>
      )}
    </div>
  );
}

/** One labelled figure in a receipt's terms grid. */
export function Figure({
  label,
  hint,
  className,
  children,
}: {
  label: string;
  /** Tooltip for the value, e.g. why it's highlighted. */
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p title={hint} className={`mt-0.5 truncate text-[15px] tabular-nums ${className ?? 'text-foreground'}`}>
        {children}
      </p>
    </div>
  );
}

/** Thin progress track with a marker at the current point. */
export function ProgressBar({ accent, pct, className }: { accent: string; pct: number; className?: string }) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    <div className={`relative h-1.5 rounded-full bg-muted ${className ?? ''}`}>
      <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${p}%`, background: accent }} />
      {p > 0 && p < 100 && (
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-[3px] ring-card"
          style={{ left: `${p}%`, background: accent }}
        />
      )}
    </div>
  );
}
