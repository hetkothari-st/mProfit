import { useQuery } from '@tanstack/react-query';
import { CalendarClock, Check, AlertTriangle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { formatINR, toDecimal } from '@everypaisa/shared';
import { taxApi, type AdvanceTaxReport } from '@/api/tax.api';
import { AnalyticsInfo } from '../AnalyticsInfo';
import { currentFy } from '../financialYear';

/**
 * The tax year, on the page where people actually look.
 *
 * The CA workspace has had a financial-year selector and per-FY statements for
 * a while, but an ordinary user never goes there — they open Analytics. So the
 * two things they ask at tax time now live here too: pick the year, and see
 * what is owed on it.
 *
 * "Advance tax" is a phrase most salaried investors have never had to care
 * about, so the card leads with the money and the date and keeps the section
 * numbers out of the way.
 */

export function FinancialYearSelect({
  fy,
  onChange,
  className,
}: {
  fy: string;
  onChange: (fy: string) => void;
  className?: string;
}) {
  const fysQuery = useQuery({
    queryKey: ['tax', 'available-fys'],
    queryFn: () => taxApi.availableFys(),
    staleTime: 60 * 60 * 1000,
  });
  // Always offer the current year, even before anything has been booked in it.
  const fys = [...new Set([currentFy(), ...(fysQuery.data?.fys ?? [])])].sort().reverse();
  return (
    <Select value={fy} onChange={(e) => onChange(e.target.value)} className={className}>
      {fys.map((y) => (
        <option key={y} value={y}>
          FY {y}
        </option>
      ))}
    </Select>
  );
}

function statusStyles(status: AdvanceTaxReport['instalments'][number]['status']) {
  if (status === 'met') {
    return { ring: 'border-border', dot: <Check className="h-3.5 w-3.5 text-positive" />, tone: 'text-muted-foreground' };
  }
  if (status === 'due') {
    return {
      ring: 'border-amber-300/70 dark:border-amber-900/70 bg-amber-50/50 dark:bg-amber-950/20',
      dot: <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />,
      tone: 'text-amber-700 dark:text-amber-300',
    };
  }
  return { ring: 'border-border', dot: <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />, tone: 'text-foreground' };
}

function formatDueDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function AdvanceTaxCard({ fy }: { fy: string }) {
  const query = useQuery({
    queryKey: ['tax', 'advance', fy],
    queryFn: () => taxApi.advance(fy),
    staleTime: 10 * 60 * 1000,
  });

  const data = query.data;
  const isCurrent = fy === currentFy();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-1.5">
          What you&apos;ll owe<AnalyticsInfo k="advanceTax" />
        </CardTitle>
      </CardHeader>
      <CardContent>
        {query.isLoading ? (
          <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
        ) : !data ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Could not work out the tax for FY {fy}.</p>
        ) : toDecimal(data.totalTax).lessThanOrEqualTo(0) ? (
          <p className="text-sm text-muted-foreground">
            {toDecimal(data.bookedGains).gt(0)
              ? `Nothing to pay on investments for FY ${fy} — the gains you have booked are covered by exemptions and set-off.`
              : `Nothing to pay on investments for FY ${fy} — no gains have been booked.`}
          </p>
        ) : (
          <>
            <p className="text-sm text-foreground">
              {isCurrent ? 'On the gains you have booked so far, you owe about ' : `For FY ${fy} you owed about `}
              <span className="font-semibold">{formatINR(data.totalTax)}</span>
              {data.belowThreshold ? (
                <> in tax. That is under the ₹10,000 mark, so there is nothing to pay in instalments — it settles with your return.</>
              ) : (
                <> in tax, payable in instalments through the year.</>
              )}
            </p>

            {!data.belowThreshold && (
              <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
                {data.instalments.map((i) => {
                  const s = statusStyles(i.status);
                  return (
                    <div key={i.dueDate} className={`rounded-lg border p-3 ${s.ring}`}>
                      <div className="flex items-center gap-1.5">
                        {s.dot}
                        <p className="text-xs font-medium text-muted-foreground">{formatDueDate(i.dueDate)}</p>
                      </div>
                      <p className={`mt-1 text-base font-semibold tabular-nums ${s.tone}`}>
                        {formatINR(i.cumulativeDue)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {i.status === 'due'
                          ? `Missed · ${formatINR(i.interest)} interest`
                          : i.status === 'met'
                            ? 'Nothing due'
                            : `${i.cumulativePct}% of the year`}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            {toDecimal(data.estimatedInterest).gt(0) && (
              <p className="mt-3 text-[12px] text-amber-600 dark:text-amber-400">
                Instalments already missed carry roughly {formatINR(data.estimatedInterest)} of interest at 1% a
                month (section 234C). Paying the rest sooner keeps it from growing.
              </p>
            )}

            <p className="mt-3 text-[11px] text-muted-foreground">
              Covers investment income this app can see — capital gains, intraday and crypto. Salary, TDS already
              deducted, other income and deductions are not included, so treat it as a floor rather than a tax
              return.
              {data.slabIsEstimate && ' Slab-rated amounts assume 30%; record your slab in your risk profile for your own rate.'}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
