import { MF_ANALYTICS_DISCLAIMER } from '@portfolioos/shared';

/**
 * The mandatory disclaimer (`06-QUALITY-COMPLIANCE.md §4`).
 *
 * The text is `MF_ANALYTICS_DISCLAIMER` and is **never retyped**. SEBI's
 * expectation is that the disclosure is uniform wherever a scheme is presented;
 * a per-page copy drifts — one page gets reworded, another keeps the old
 * wording, and the product is now making two different claims about the same
 * rating. Importing the constant makes drift impossible rather than merely
 * discouraged.
 *
 * It is rendered at full length, not truncated behind a "read more". A
 * disclosure the reader has to expand is a disclosure most readers never see.
 */
export function AnalyticsDisclaimer() {
  return (
    <section
      data-testid="mf-disclaimer"
      aria-label="Disclaimer"
      className="rounded-md border border-border/60 bg-muted/30 px-4 py-3.5"
    >
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        Disclaimer
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        {MF_ANALYTICS_DISCLAIMER}
      </p>
    </section>
  );
}
