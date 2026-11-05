import { Decimal, cpiDivisionLabel, formatINR, type PersonalInflationSummary } from '@everypaisa/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { driverRows, formatRatePct } from './personalInflationView';

/**
 * "What's driving it": each category's share of the user's spend and the rate
 * it rises at, ordered by how much it pushes the personal rate up (share ×
 * rate). Bars scale to the fastest-rising category; categories rising faster
 * than official CPI are drawn in the warning colour. Categories under 2% of
 * spend share one row. EMIs and life premiums are noted below, outside the basket.
 */
export function DrivingCard({ data }: { data: PersonalInflationSummary }) {
  const headline = data.official.find((o) => o.divisionCode === '00')?.longRunRate ?? null;
  const rows = driverRows(data.byDivision).map((r) => ({
    ...r,
    official: r.code ? data.official.find((o) => o.divisionCode === r.code)?.longRunRate ?? null : null,
  }));
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
              <li key={r.code ?? 'other'}>
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium">
                      {r.code ? cpiDivisionLabel(r.code) : `${r.count} small categories`}
                    </span>
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
        </ul>
        {fixed && (
          <p className="mt-5 border-t pt-4 text-xs text-muted-foreground leading-relaxed">
            Not counted: {fixed.count === 1 ? 'one EMI or life premium' : `${fixed.count} EMIs and life premiums`}{' '}
            (<span className="numeric">{formatINR(fixed.annualAmount, { compact: true })}</span> a year). They repay the same
            loan or buy the same cover each month, so they don&apos;t rise with prices.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
