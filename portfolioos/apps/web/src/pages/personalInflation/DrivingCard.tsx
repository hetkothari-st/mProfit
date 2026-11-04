import { Decimal, cpiDivisionLabel, type PersonalInflationSummary } from '@everypaisa/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { formatRatePct } from './personalInflationView';

/**
 * "What's driving it": each category's share of the user's spend and the rate
 * it rises at, ordered by how much it pushes the personal rate up (share ×
 * rate). Bars scale to the fastest-rising category; categories rising faster
 * than official CPI are drawn in the warning colour.
 */
export function DrivingCard({ data }: { data: PersonalInflationSummary }) {
  const headline = data.official.find((o) => o.divisionCode === '00')?.longRunRate ?? null;
  const rows = data.byDivision
    .filter((d) => d.rate != null)
    .map((d) => ({
      code: d.divisionCode,
      share: new Decimal(d.share),
      rate: new Decimal(d.rate!),
      official: data.official.find((o) => o.divisionCode === d.divisionCode)?.longRunRate ?? null,
    }))
    .sort((a, b) => b.share.times(b.rate).comparedTo(a.share.times(a.rate)));
  const fixed = data.fixedPayments;
  if (rows.length === 0 && !fixed) return null;

  const max = Decimal.max(...rows.map((r) => r.rate), new Decimal('0.0001'));

  return (
    <Card>
      <CardHeader>
        <CardTitle>What&apos;s driving it</CardTitle>
        <p className="text-sm text-muted-foreground">
          Biggest push first: how much you spend in each category, and how fast it rises.
          {headline && <> Orange means faster than official CPI ({formatRatePct(headline)}).</>}
        </p>
      </CardHeader>
      <CardContent>
        <ul className="space-y-4">
          {rows.map((r) => {
            const hot = headline != null && r.rate.greaterThan(headline);
            const width = Decimal.max(r.rate, 0).dividedBy(max).times(100).toDecimalPlaces(1).toNumber();
            return (
              <li key={r.code}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">{cpiDivisionLabel(r.code)}</span>
                    <span className="text-muted-foreground"> · {r.share.times(100).toFixed(0)}% of spend</span>
                  </span>
                  <span className="numeric font-semibold shrink-0">{formatRatePct(r.rate.toString())}</span>
                </div>
                <div className="mt-1.5 h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <div
                    className={cn('h-full rounded-full', hot ? 'bg-warning' : 'bg-primary')}
                    style={{ width: `${width}%` }}
                  />
                </div>
                {r.official && (
                  <div className="text-[11px] text-muted-foreground mt-1">Official for this category: {formatRatePct(r.official)}</div>
                )}
              </li>
            );
          })}
          {fixed && (
            <li>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">Fixed payments</span>
                  <span className="text-muted-foreground"> · {new Decimal(fixed.share).times(100).toFixed(0)}% of spend</span>
                </span>
                <span className="numeric font-semibold shrink-0">0.0%</span>
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                EMIs and level life premiums stay the same, so they pull your rate down.
              </div>
            </li>
          )}
        </ul>
      </CardContent>
    </Card>
  );
}
