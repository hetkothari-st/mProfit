import type { MfRollingStats, Ratio } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { SectionUnavailable } from './MetricValue';
import { formatRatioAsPct, ratioToChartNumber } from '../mfFormat';

/**
 * Rolling-return distribution (`02 §2.2`).
 *
 * A point-to-point CAGR is one draw from a distribution and the industry quotes
 * it as if it were the distribution. This panel shows the shape instead: every
 * overlapping window of the given length, reduced to min / p10 / p25 / median /
 * p75 / p90 / max, plus how often the fund lost money, trailed its benchmark and
 * trailed its category.
 *
 * **Nulls here have no per-field status.** `MfRollingStats` is a nested object
 * with no `fieldStatus` of its own — unlike the scalars on `MfHorizonMetrics`,
 * which each get an entry (`02 §9`). So a null percentile is rendered with a
 * fixed, accurate reason ("not enough overlapping windows") rather than an
 * invented one, and never as `0` — a rolling p10 of 0% is a real and meaningful
 * result (a fund that has never lost money over any window of that length).
 *
 * The box plot is drawn only when the five figures it needs are all present.
 * A partial box would imply a shape we cannot actually see; the figures still
 * render as text underneath either way.
 */

export interface RollingWindow {
  windowLabel: string;
  stats: MfRollingStats | null;
}

export function RollingDistribution({ stats }: { stats: RollingWindow[] }) {
  const present = stats.filter((s) => s.stats !== null);

  return (
    <div data-testid="mf-rolling-distribution">
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Rolling-return distribution
      </h3>
      {present.length === 0 ? (
        <SectionUnavailable
          title="No rolling-return distribution"
          reason="This horizon has too little NAV history to produce even one full rolling window, so there is no distribution to describe."
        />
      ) : (
        <Card tone="flat">
          <CardContent className="space-y-6 p-5">
            {stats.map((row) =>
              row.stats === null ? (
                <div key={row.windowLabel} data-rolling-window={row.windowLabel}>
                  <p className="text-[12px] font-medium text-foreground">{row.windowLabel}</p>
                  <p
                    data-metric-value
                    data-status="INSUFFICIENT_DATA"
                    className="mt-1 text-[12px] text-muted-foreground"
                  >
                    Not available — the history does not contain a complete window of this length
                  </p>
                </div>
              ) : (
                <RollingRow key={row.windowLabel} label={row.windowLabel} stats={row.stats} />
              ),
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function RollingRow({ label, stats }: { label: string; stats: MfRollingStats }) {
  return (
    <div data-rolling-window={label}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[12px] font-medium text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground">
          <span className="numeric">{stats.observations}</span> observations
        </p>
      </div>

      <BoxPlot stats={stats} />

      <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2 sm:grid-cols-4 lg:grid-cols-8">
        <Percentile label="Min" value={stats.min} />
        <Percentile label="P10" value={stats.p10} />
        <Percentile label="P25" value={stats.p25} />
        <Percentile label="Median" value={stats.median} />
        <Percentile label="P75" value={stats.p75} />
        <Percentile label="P90" value={stats.p90} />
        <Percentile label="Max" value={stats.max} />
        {/* Mean beside the median deliberately: a large gap between the two is
            the signal that one exceptional window is carrying the average. */}
        <Percentile label="Mean" value={stats.mean} />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-3">
        <Percentile label="Windows with a loss" value={stats.pctNegative} />
        <Percentile label="Windows below benchmark" value={stats.pctBelowBenchmark} />
        <Percentile label="Windows below category median" value={stats.pctBelowCategoryMedian} />
      </div>
    </div>
  );
}

function Percentile({ label, value }: { label: string; value: Ratio | null }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      {value === null ? (
        <p
          data-metric-value
          data-status="INSUFFICIENT_DATA"
          className="mt-0.5 text-[11px] leading-snug text-muted-foreground"
        >
          Not available — too few windows
        </p>
      ) : (
        <p data-metric-value data-status="OK" className="mt-0.5 numeric tabular-nums text-[13px]">
          {formatRatioAsPct(value, 1, true)}
        </p>
      )}
    </div>
  );
}

/**
 * Min–max whisker with a p25–p75 box and a median tick.
 *
 * `ratioToChartNumber` appears here and nowhere else in this file: pixel
 * offsets are the one legitimate use of a JS number on this contract, and
 * every figure the reader can actually read is formatted from the Decimal
 * string instead.
 */
function BoxPlot({ stats }: { stats: MfRollingStats }) {
  const { min, max, p25, p75, median } = stats;
  if (min === null || max === null || p25 === null || p75 === null || median === null) {
    return (
      <p className="mt-2 text-[11px] italic text-muted-foreground">
        Distribution shape not drawn — one or more quartiles could not be computed.
      </p>
    );
  }

  const lo = ratioToChartNumber(min);
  const hi = ratioToChartNumber(max);
  const span = hi - lo;
  // A degenerate span (every window returned identically) has no shape to draw.
  if (!(span > 0)) {
    return (
      <p className="mt-2 text-[11px] italic text-muted-foreground">
        Every window returned the same figure, so there is no spread to plot.
      </p>
    );
  }
  const at = (v: Ratio) => ((ratioToChartNumber(v) - lo) / span) * 100;
  const boxLeft = at(p25);
  const boxRight = at(p75);

  return (
    <div className="mt-3" aria-hidden="true">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-border" />
        <div
          className="absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-accent/25 ring-1 ring-accent/40"
          style={{ left: `${boxLeft}%`, width: `${Math.max(boxRight - boxLeft, 0.5)}%` }}
        />
        <div
          className="absolute top-1/2 h-5 w-[2px] -translate-y-1/2 bg-accent"
          style={{ left: `${at(median)}%` }}
        />
      </div>
    </div>
  );
}
