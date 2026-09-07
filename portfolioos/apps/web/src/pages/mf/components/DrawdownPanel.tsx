import type { MfHorizonMetrics } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { MetricStat, MetricValue } from './MetricValue';
import { formatRatioAsPct, ratioToChartNumber, resolveMetric } from '../mfFormat';

/**
 * Drawdown: how far the fund fell, how long it stayed down, whether it is back.
 *
 * **What this is not.** There is no drawdown *time series* on the contract —
 * `MfHorizonMetrics.risk` carries the depth, the duration and the recovery as
 * three scalars and nothing else. So this is a magnitude bar and a fact strip,
 * not an underwater curve. Drawing a curve would mean inventing the path
 * between the peak and the trough, and an invented shape on a risk chart is
 * worse than no chart: it looks like measurement.
 *
 * **`recoveryDays: null` is not a missing number.** The contract states it means
 * "has not recovered yet", explicitly distinguished from "recovered in 0 days".
 * That is a *finding about the fund*, and rendering it as "Not available" would
 * hide the single most important thing on this panel — that the investor is
 * still underwater. It is only treated as unavailable when `fieldStatus` says
 * the measurement itself failed.
 */

export function DrawdownPanel({ metrics }: { metrics: MfHorizonMetrics }) {
  const maxDd = resolveMetric(metrics.risk.maxDrawdown, 'risk.maxDrawdown', metrics);

  // Magnitude bar. `maxDrawdown` is negative (-0.30 is a 30% fall), so the
  // width is its absolute value, capped so a -120% data error cannot draw
  // outside the track. Geometry only — the number beside it is formatted from
  // the Decimal string.
  const depth = maxDd.value === null ? null : Math.min(Math.abs(ratioToChartNumber(maxDd.value)), 1);

  const durationStatus = metrics.fieldStatus['risk.maxDrawdownDurationDays'];
  const recoveryStatus = metrics.fieldStatus['risk.recoveryDays'];

  return (
    <div data-testid="mf-drawdown">
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Drawdown
      </h3>
      <Card tone="flat">
        <CardContent className="p-5">
          <div className="grid gap-6 sm:grid-cols-3">
            <MetricStat label="Maximum drawdown" hint="Peak-to-trough, from the daily NAV series">
              <MetricValue
                value={maxDd.value}
                status={maxDd.status}
                reason={maxDd.reason}
                format={(v) => formatRatioAsPct(v, 2)}
              />
            </MetricStat>

            <MetricStat label="Time under water">
              {durationStatus !== undefined && durationStatus !== 'OK' ? (
                <MetricValue
                  value={null}
                  status={durationStatus}
                  reason="the drawdown window could not be measured"
                  format={(v) => v}
                />
              ) : metrics.risk.maxDrawdownDurationDays === null ? (
                <span
                  data-metric-value
                  data-status="INSUFFICIENT_DATA"
                  className="text-[12px] text-muted-foreground"
                >
                  Not available — no drawdown window was measured
                </span>
              ) : (
                <span data-metric-value data-status="OK" className="numeric tabular-nums">
                  {metrics.risk.maxDrawdownDurationDays} days
                </span>
              )}
            </MetricStat>

            <MetricStat label="Recovery">
              {recoveryStatus !== undefined && recoveryStatus !== 'OK' ? (
                <MetricValue
                  value={null}
                  status={recoveryStatus}
                  reason="the recovery could not be measured"
                  format={(v) => v}
                />
              ) : metrics.risk.recoveryDays === null ? (
                // Not a gap. The fund is still below its previous peak.
                <span data-metric-value data-status="OK" className="text-[13px] text-negative">
                  Has not recovered yet
                </span>
              ) : (
                <span data-metric-value data-status="OK" className="numeric tabular-nums">
                  {metrics.risk.recoveryDays} days to recover
                </span>
              )}
            </MetricStat>
          </div>

          <div className="mt-5">
            {depth === null ? (
              <p className="text-[11px] italic text-muted-foreground">
                Depth not plotted — the drawdown itself is unavailable.
              </p>
            ) : (
              <div aria-hidden="true">
                <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-negative/70"
                    style={{ width: `${depth * 100}%` }}
                  />
                </div>
                <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                  <span>0%</span>
                  <span>-100%</span>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
