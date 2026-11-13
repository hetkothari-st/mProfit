import {
  MF_FORM_BAND_LABEL,
  MF_FORM_BAND_MEANING,
  mfFormBand,
  type MfFormBand,
} from '@everypaisa/shared';
import { cn } from '@/lib/cn';

/**
 * The band's colour, on the dot only. The label stays in the foreground
 * colour so its contrast never depends on the band — the same reason
 * `PlainOverview` colours the score and not the words around it.
 *
 * Amber is the literal `PlainOverview` uses for three stars; Lagging and Weak
 * share the destructive hue and differ in weight (hollow vs filled), so the
 * scale reads as three temperatures with the bottom one emphasised.
 */
const BAND_DOT: Readonly<Record<MfFormBand, string>> = {
  LEADING: 'bg-accent',
  STEADY: 'bg-[hsl(38_92%_62%)]',
  LAGGING: 'border border-destructive bg-transparent',
  WEAK: 'bg-destructive',
};

/**
 * The 1–5 rating as one word: Leading, Steady, Lagging or Weak.
 *
 * Renders nothing for an unrated fund. The caller already explains why a fund
 * is unrated, and a fifth "Unrated" band would sit beside that explanation
 * saying less than it does.
 */
export function FormBadge({
  rating,
  size = 'sm',
  className,
}: {
  rating: number | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const band = mfFormBand(rating);
  if (band === null) return null;
  return (
    <span
      data-form-band={band}
      title={MF_FORM_BAND_MEANING[band]}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/60 font-medium text-foreground',
        size === 'sm' ? 'px-2 py-px text-[11px]' : 'px-3 py-1 text-[13px]',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('inline-block rounded-full', size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2', BAND_DOT[band])}
      />
      {MF_FORM_BAND_LABEL[band]}
    </span>
  );
}
