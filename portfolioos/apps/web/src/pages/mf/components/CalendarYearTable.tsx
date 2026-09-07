import type { MfCalendarYearRow, Ratio } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { SectionUnavailable } from './MetricValue';
import { formatRatioAsPct } from '../mfFormat';

/**
 * Calendar-year returns with the category quartile for each year.
 *
 * Discrete years are the honest complement to a trailing CAGR: a five-year
 * number cannot show that a fund made all of it in one year and trailed in the
 * other four, and the quartile column is what turns "up 14%" into "up 14% in a
 * year the category made 19%".
 *
 * Every cell is independently nullable and every null renders its reason. In
 * particular a null `quartile` reads "Not ranked", not "4" and not a dash: a
 * year the fund existed for only part of, or a year with too small a universe,
 * is not a bottom-quartile year.
 */

export function CalendarYearTable({ rows }: { rows: MfCalendarYearRow[] }) {
  return (
    <div data-testid="mf-calendar-years">
      <h3 className="mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Calendar-year returns
      </h3>
      {rows.length === 0 ? (
        <SectionUnavailable
          title="No calendar-year record"
          reason="This scheme has no completed calendar year inside the horizon, so there is nothing to tabulate."
        />
      ) : (
        <Card tone="flat">
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full min-w-[560px] text-[13px]">
              <thead>
                <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Year</th>
                  <th className="px-4 py-2.5 font-medium">Fund</th>
                  <th className="px-4 py-2.5 font-medium">Benchmark</th>
                  <th className="px-4 py-2.5 font-medium">Category median</th>
                  <th className="px-4 py-2.5 font-medium">Rank</th>
                  <th className="px-4 py-2.5 font-medium">Quartile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {rows.map((row) => (
                  <tr key={row.year} data-calendar-year={row.year}>
                    <td className="px-4 py-2 numeric font-medium">{row.year}</td>
                    <td className="px-4 py-2">
                      <ReturnCell value={row.fund} missingReason="the fund has no full year here" />
                    </td>
                    <td className="px-4 py-2">
                      <ReturnCell
                        value={row.benchmark}
                        missingReason="no benchmark series for this year"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <ReturnCell
                        value={row.categoryMedian}
                        missingReason="the category had no published median"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <RankCell rank={row.rank} universeSize={row.universeSize} />
                    </td>
                    <td className="px-4 py-2">
                      <QuartileBadge quartile={row.quartile} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReturnCell({ value, missingReason }: { value: Ratio | null; missingReason: string }) {
  if (value === null) {
    return (
      <span
        data-metric-value
        data-status="INSUFFICIENT_DATA"
        className="text-[11px] leading-snug text-muted-foreground"
      >
        Not available — {missingReason}
      </span>
    );
  }
  return (
    <span data-metric-value data-status="OK" className="numeric tabular-nums">
      {formatRatioAsPct(value, 2, true)}
    </span>
  );
}

function RankCell({ rank, universeSize }: { rank: number | null; universeSize: number | null }) {
  if (rank === null || universeSize === null) {
    return (
      <span
        data-metric-value
        data-status="INSUFFICIENT_DATA"
        className="text-[11px] leading-snug text-muted-foreground"
      >
        Not available — not ranked that year
      </span>
    );
  }
  return (
    <span data-metric-value data-status="OK" className="numeric tabular-nums">
      {rank} of {universeSize}
    </span>
  );
}

const QUARTILE_CLASS: Record<1 | 2 | 3 | 4, string> = {
  1: 'bg-positive/12 text-positive border-positive/30',
  2: 'bg-positive/8 text-positive/90 border-positive/20',
  3: 'bg-amber-500/12 text-amber-600 border-amber-500/30',
  4: 'bg-negative/12 text-negative border-negative/30',
};

function QuartileBadge({ quartile }: { quartile: 1 | 2 | 3 | 4 | null }) {
  if (quartile === null) {
    return (
      <span
        data-metric-value
        data-status="INSUFFICIENT_DATA"
        className="text-[11px] leading-snug text-muted-foreground"
      >
        Not ranked
      </span>
    );
  }
  return (
    <span
      data-metric-value
      data-status="OK"
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
        QUARTILE_CLASS[quartile],
      )}
    >
      Q{quartile}
    </span>
  );
}
