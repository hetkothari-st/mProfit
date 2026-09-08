import type { ReactNode } from 'react';
import type { MfMetricStatus } from '@portfolioos/shared';
import { cn } from '@/lib/cn';
import type { ResolvedMetric } from '../mfFormat';

/**
 * The single place a metric turns into pixels — and therefore the single place
 * the "a zero must never stand in for an unknown" rule is enforced.
 *
 * Every metric on the fund page routes through here. That is the point: the
 * rule in `06-QUALITY-COMPLIANCE.md §6` is only as strong as its weakest call
 * site, and forty call sites each deciding what to do with a null is forty
 * chances to write `{value ?? 0}` or `{value ?? '—'}`. This component accepts a
 * `ResolvedMetric` — a value that has already been paired with the status
 * explaining it — so a caller physically cannot hand it a bare nullable number.
 *
 * Three render paths, and the middle one is the subtle one:
 *
 *  - `OK` with a value → the formatted number.
 *  - `NOT_APPLICABLE` → "Not applicable". **Deliberately different wording from
 *    the third path.** Treynor at a beta of 0.05, Calmar over a fund that has
 *    never fallen 1%, a CAGR at the 1-year horizon where SEBI mandates an
 *    absolute figure: every input was present and the ratio simply has no
 *    meaning. Rendering that as "Not available" sends the reader hunting for
 *    data that need not exist and makes a correctly-un-ranked liquid fund look
 *    under-covered. It is not a gap to be filled.
 *  - anything else → "Not available — {reason}". Never `0`, never a bare dash.
 *
 * `data-status` is on the element so a test can assert the invariant across a
 * whole rendered page — see `FundDetailPage.test.tsx`, which walks every
 * `[data-metric-value]` and fails if a non-OK one contains a digit.
 */

export interface MetricValueProps extends ResolvedMetric {
  /** Applied only to an `OK` value. Receives the branded Decimal string. */
  format: (value: string) => string;
  /**
   * Optional wrapper for the formatted `OK` string — the escape hatch that let
   * the portfolio page render money through `<Money>` (accent ₹ glyph, tabular
   * digits) WITHOUT a second metric component.
   *
   * The alternative was a `MoneyValue` that duplicated the three render paths
   * below, and duplicating them is precisely how the "a zero never stands in
   * for an unknown" rule gets weaker: the copy starts identical, then one of
   * the two gains a `?? 0` and the invariant test only walks the elements the
   * component it knows about emitted. Everything unavailable still routes
   * through the single path here, so `data-metric-value` / `data-status` stay
   * exhaustive across both pages.
   *
   * It receives the ALREADY-FORMATTED string, so it cannot reintroduce
   * arithmetic on a wire value.
   */
  renderValue?: (formatted: string) => ReactNode;
  /**
   * Why this metric is undefined by construction for this fund, e.g. "beta is
   * too close to zero for the ratio to mean anything". Shown beside "Not
   * applicable" so the reader learns the reason rather than filing a bug.
   */
  notApplicableHint?: string;
  className?: string;
}

export function MetricValue({
  value,
  status,
  reason,
  format,
  renderValue,
  notApplicableHint,
  className,
}: MetricValueProps) {
  if (status === 'OK' && value !== null) {
    const formatted = format(value);
    return (
      <span
        data-metric-value
        data-status="OK"
        className={cn('numeric tabular-nums text-foreground', className)}
      >
        {renderValue ? renderValue(formatted) : formatted}
      </span>
    );
  }

  if (status === 'NOT_APPLICABLE') {
    return (
      <span className={cn('inline-flex flex-col', className)}>
        <span
          data-metric-value
          data-status="NOT_APPLICABLE"
          className="text-muted-foreground/80 italic"
        >
          Not applicable
        </span>
        {notApplicableHint && (
          <span data-metric-hint className="text-[11px] leading-snug text-muted-foreground/70">
            {notApplicableHint}
          </span>
        )}
      </span>
    );
  }

  // Everything else: INSUFFICIENT_DATA, BENCHMARK_UNAVAILABLE, STALE,
  // QUARANTINED — and an `OK` that arrived without a value, which is a server
  // contract violation we refuse to paper over with a number.
  return (
    <span
      data-metric-value
      data-status={status}
      className={cn('text-[12px] leading-snug text-muted-foreground', className)}
    >
      Not available{reason ? ` — ${reason}` : ''}
    </span>
  );
}

/**
 * Label-over-value stat cell. The label is always rendered, including when the
 * value is unavailable: hiding the row would silently shorten the page and
 * leave the reader unable to tell "we did not measure this" from "this fund
 * does not have this characteristic".
 */
export function MetricStat({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="mt-1 text-[15px] font-medium">{children}</div>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

/**
 * Section-level unavailability, for when a whole block has nothing to show —
 * no portfolio snapshot at all, no metrics for a horizon. Same contract as
 * `MetricValue`: it states a reason.
 */
export function SectionUnavailable({
  title,
  reason,
  status,
}: {
  title: string;
  reason: string;
  status?: MfMetricStatus;
}) {
  return (
    <div
      data-section-unavailable
      data-status={status ?? 'INSUFFICIENT_DATA'}
      className="rounded-md border border-dashed border-border/70 bg-muted/30 px-4 py-6 text-center"
    >
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 text-[12px] text-muted-foreground">{reason}</p>
    </div>
  );
}
