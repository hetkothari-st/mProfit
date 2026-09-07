import type { Money as MoneyString, Pct, Ratio } from '@portfolioos/shared';
import { formatINR } from '@portfolioos/shared';
import { Money } from '@/components/ui/money';
import { MetricValue } from './MetricValue';
import {
  formatPct,
  formatPercentileOrdinal,
  formatRatio,
  formatRatioAsPct,
  formatUnits,
  resolveNullable,
  type ResolvedMetric,
} from '../mfFormat';

/**
 * Typed cells over the ONE render path in `MetricValue`.
 *
 * These exist because `MfPortfolioAnalysisDto` puts `Money`, `Ratio` and `Pct`
 * side by side on the same screen, and the ×100 confusion between the last two
 * is the single most common bug in this kind of layer — the reason the brands
 * were split in the first place (`packages/shared/src/ratio.ts`). A cell per
 * unit means the formatter is chosen once, by the type of the field, instead of
 * at forty call sites by whoever was writing that row.
 *
 * The two that read identically on screen and must never be swapped:
 *
 *  - `<PctCell>` takes a `Pct`, a value that ALREADY carries percent units.
 *    `MfOverlapPair.overlapPct` of `55.000000` is 55%.
 *  - `<RatioPctCell>` takes a `Ratio`, a dimensionless fraction, and multiplies
 *    by 100 exactly once on the way out. `MfPortfolioTotals.redundancyScore` of
 *    `0.550000` is also 55%.
 *
 * Both render "55.0%". Handing a `Ratio` to `<PctCell>` renders "0.6%" and
 * handing a `Pct` to `<RatioPctCell>` renders "5500.0%" — which is why they are
 * different components with different parameter types rather than one component
 * with a `mode` prop, and why the brands make the mistake a compile error
 * rather than a screenshot someone has to notice.
 *
 * Every cell takes an already-`ResolvedMetric`, so none of them can be handed a
 * bare nullable and quietly `?? 0` it.
 */

/**
 * Rupees. Rendered through `<Money>` for the accent ₹ glyph and tabular digits,
 * via `MetricValue`'s `renderValue` hook rather than a component of its own —
 * an unavailable money value must take exactly the same "Not available —
 * {reason}" path as an unavailable ratio, or the invariant walker stops being
 * exhaustive.
 *
 * `formatINR` is used directly and never `Number(value)`: it parses through
 * `Decimal` internally, which is why a 4dp wire string like "33.3300" formats
 * to the same paise every time instead of drifting on a sum.
 */
export function MoneyCell({
  resolved,
  compact = false,
  className,
}: {
  resolved: ResolvedMetric;
  /** Indian compact notation (₹1.2 Cr) — for headline figures, not tables. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <MetricValue
      {...resolved}
      className={className}
      format={(v) => formatINR(v, { compact, fractionDigits: compact ? 2 : 2 })}
      renderValue={(formatted) => <Money>{formatted}</Money>}
    />
  );
}

/** Convenience for the very common `Money | null` field with a stated reason. */
export function NullableMoneyCell({
  value,
  reason,
  compact,
  className,
}: {
  value: MoneyString | null;
  reason: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <MoneyCell resolved={resolveNullable(value, reason)} compact={compact} className={className} />
  );
}

/** A value that already carries percent units (`Pct`): `0.45` → "0.45%". */
export function PctCell({
  resolved,
  fractionDigits = 2,
  showSign = false,
  className,
}: {
  resolved: ResolvedMetric;
  fractionDigits?: number;
  showSign?: boolean;
  className?: string;
}) {
  return (
    <MetricValue
      {...resolved}
      className={className}
      format={(v) => formatPct(v, fractionDigits, showSign)}
    />
  );
}

export function NullablePctCell({
  value,
  reason,
  fractionDigits,
  showSign,
  className,
}: {
  value: Pct | null;
  reason: string;
  fractionDigits?: number;
  showSign?: boolean;
  className?: string;
}) {
  return (
    <PctCell
      resolved={resolveNullable(value, reason)}
      fractionDigits={fractionDigits}
      showSign={showSign}
      className={className}
    />
  );
}

/** A dimensionless fraction (`Ratio`) shown as a percentage: `0.0725` → "7.25%". */
export function RatioPctCell({
  resolved,
  fractionDigits = 2,
  showSign = false,
  className,
}: {
  resolved: ResolvedMetric;
  fractionDigits?: number;
  showSign?: boolean;
  className?: string;
}) {
  return (
    <MetricValue
      {...resolved}
      className={className}
      format={(v) => formatRatioAsPct(v, fractionDigits, showSign)}
    />
  );
}

export function NullableRatioPctCell({
  value,
  reason,
  fractionDigits,
  showSign,
  className,
}: {
  value: Ratio | null;
  reason: string;
  fractionDigits?: number;
  showSign?: boolean;
  className?: string;
}) {
  return (
    <RatioPctCell
      resolved={resolveNullable(value, reason)}
      fractionDigits={fractionDigits}
      showSign={showSign}
      className={className}
    />
  );
}

/**
 * A bare `Ratio` that is NOT a fraction of anything — a Sharpe, a horizon in
 * years, or `effectiveFundCount` (`1 / Σw²`, a count of funds). Percent-
 * formatting one of these is the mirror-image of the ×100 bug: an effective
 * fund count of `4.31` rendered as "431%" is nonsense the reader cannot
 * interpret, so the plain formatter gets its own cell.
 */
export function RatioCell({
  resolved,
  fractionDigits = 2,
  className,
}: {
  resolved: ResolvedMetric;
  fractionDigits?: number;
  className?: string;
}) {
  return (
    <MetricValue {...resolved} className={className} format={(v) => formatRatio(v, fractionDigits)} />
  );
}

export function NullableRatioCell({
  value,
  reason,
  fractionDigits,
  className,
}: {
  value: Ratio | null;
  reason: string;
  fractionDigits?: number;
  className?: string;
}) {
  return (
    <RatioCell
      resolved={resolveNullable(value, reason)}
      fractionDigits={fractionDigits}
      className={className}
    />
  );
}

/** A percentile `Ratio` as the ordinal a reader expects: `0.78` → "78th". */
export function PercentileCell({
  value,
  reason,
  className,
}: {
  value: Ratio | null;
  reason: string;
  className?: string;
}) {
  return (
    <MetricValue
      {...resolveNullable(value, reason)}
      className={className}
      format={(v) => formatPercentileOrdinal(v)}
    />
  );
}

/** Fund units — a plain Decimal string, neither money nor a ratio. */
export function UnitsCell({ value, className }: { value: string; className?: string }) {
  return (
    <MetricValue
      value={value}
      status="OK"
      className={className}
      format={(v) => formatUnits(v)}
    />
  );
}
