import { cn } from '@/lib/cn';

/**
 * The SEBI risk-o-meter band, rendered verbatim.
 *
 * `06-QUALITY-COMPLIANCE.md §4`: SEBI expects the risk-o-meter displayed
 * wherever a scheme is presented, and a score is the most prominent
 * presentation this layer produces. That is why the field is denormalised onto
 * `MfSchemeScoreDto` as well as `MfSchemeMetaDto` — a client cannot obtain a
 * rating without also holding the risk disclosure that must sit beside it.
 *
 * The value is free text lifted from the AMC factsheet ("Very High", "Moderately
 * High", …), not an enum, so it is **printed as received**. The colour is chosen
 * by matching a normalised copy against the six SEBI bands and falls back to a
 * neutral tone on anything unrecognised: inventing a band for text we cannot
 * classify would be asserting a risk level the AMC never published, which is
 * the one thing worse than showing no colour at all.
 *
 * `null` renders as an explicit "not published" rather than being omitted. A
 * missing risk disclosure that silently disappears reads as a low-risk fund.
 */

type Tone = 'low' | 'moderate' | 'high' | 'unknown';

const TONE_CLASS: Record<Tone, string> = {
  low: 'bg-positive/12 text-positive border-positive/30',
  moderate: 'bg-amber-500/12 text-amber-600 border-amber-500/30',
  high: 'bg-negative/12 text-negative border-negative/30',
  unknown: 'bg-muted text-muted-foreground border-border',
};

function toneFor(band: string): Tone {
  const t = band.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  // Order matters: "moderately high" must not be caught by the "moderate" test.
  if (t === 'very high' || t === 'high') return 'high';
  if (t === 'moderately high') return 'high';
  if (t === 'moderate' || t === 'moderately low') return 'moderate';
  if (t === 'low' || t === 'low to moderate') return 'low';
  return 'unknown';
}

export function Riskometer({ band, className }: { band: string | null; className?: string }) {
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Risk-o-meter
      </span>
      {band === null ? (
        <span
          data-riskometer="unpublished"
          className="text-[12px] text-muted-foreground italic"
        >
          Not published for this scheme
        </span>
      ) : (
        <span
          data-riskometer={band}
          className={cn(
            'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
            TONE_CLASS[toneFor(band)],
          )}
        >
          {band}
        </span>
      )}
    </div>
  );
}
