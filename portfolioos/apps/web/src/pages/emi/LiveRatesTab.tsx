import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import {
  RATE_BASIS_LABELS, RATE_LOAN_TYPES, RATE_LOAN_TYPE_LABELS, formatDateIST, formatDateOnly,
  type LoanRateRowWire, type RateLoanType,
} from '@everypaisa/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { loanRatesApi } from '@/api/loanRates.api';
import { bestRowId, rateRange, repoLine } from './liveRates';
import { useElementWidth } from './useElementWidth';

/** Below this container width the table becomes stacked cards (no sideways scroll at 375 px). */
const TABLE_MIN_WIDTH = 640;

function LenderLink({ row }: { row: LoanRateRowWire }) {
  return (
    <a href={row.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`${row.lender} rates page`} className="inline-flex text-muted-foreground hover:text-foreground">
      <ExternalLink className="h-4 w-4" />
    </a>
  );
}

function AsOf({ row }: { row: LoanRateRowWire }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span>{formatDateIST(row.asOf)}</span>
        {row.stale && <Badge variant="outline">Stale</Badge>}
      </div>
      {row.effectiveDate && <div className="text-xs text-muted-foreground">w.e.f. {formatDateOnly(row.effectiveDate)}</div>}
    </>
  );
}

/**
 * Live rates (spec s5.7): indicative market rates by lender for one loan type, refreshed daily on the
 * server. The calculator never depends on this tab: an empty load shows one line, a failed load one line and
 * a Try again button, and nothing else.
 */
export function LiveRatesTab({ onUseRate }: { onUseRate: (row: LoanRateRowWire) => void }) {
  const [loanType, setLoanType] = useState<RateLoanType>('HOME');
  const [boxRef, boxWidth] = useElementWidth<HTMLDivElement>();
  const query = useQuery({
    queryKey: ['loan-rates', loanType],
    queryFn: () => loanRatesApi.list(loanType),
    staleTime: 10 * 60_000,
  });
  const rows = useMemo(() => query.data?.rows ?? [], [query.data]);
  const best = useMemo(() => bestRowId(rows), [rows]);
  const wide = boxWidth >= TABLE_MIN_WIDTH;

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <CardTitle>Live loan rates</CardTitle>
          <div className="w-full space-y-1 sm:w-64">
            <Label htmlFor="rates-loan-type">Loan type</Label>
            <Select id="rates-loan-type" value={loanType} onChange={(e) => setLoanType(e.target.value as RateLoanType)}>
              {RATE_LOAN_TYPES.map((t) => (
                <option key={t} value={t}>{RATE_LOAN_TYPE_LABELS[t]}</option>
              ))}
            </Select>
          </div>
        </div>
        {query.data?.repo && (
          <p data-testid="repo-line" className="text-sm">{repoLine(query.data.repo)}</p>
        )}
        <p className="text-xs text-muted-foreground">Indicative. Your rate depends on credit score, loan amount and tenure.</p>
      </CardHeader>
      <CardContent>
        <div ref={boxRef}>
          {query.isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" aria-label="Loading rates" /></div>
          ) : query.isError && rows.length === 0 ? (
            <div data-testid="rates-error" className="flex flex-col items-center gap-2 py-6 text-center text-sm">
              <p className="text-muted-foreground">Couldn't load rates right now. The calculator still works.</p>
              <Button type="button" size="sm" variant="outline" disabled={query.isFetching} onClick={() => void query.refetch()}>
                <RefreshCw className="mr-1 h-4 w-4" />Try again
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <p data-testid="rates-empty" className="py-6 text-center text-sm text-muted-foreground">Rates not available yet</p>
          ) : wide ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Lender</th>
                  <th className="py-2 pr-3 font-medium">Rate (% p.a.)</th>
                  <th className="py-2 pr-3 font-medium">Basis</th>
                  <th className="py-2 pr-3 font-medium">As of</th>
                  <th className="py-2 pr-3 font-medium"><span className="sr-only">Lender page</span></th>
                  <th className="py-2 font-medium"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const isBest = row.sourceId === best;
                  return (
                    <tr key={row.sourceId} data-testid={`rate-row-${row.sourceId}`} className={`border-b last:border-0 ${isBest ? 'bg-emerald-500/10' : ''}`}>
                      <td className="py-2 pr-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{row.lender}</span>
                          {isBest && <Badge variant="secondary">Lowest</Badge>}
                        </div>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{rateRange(row)}</td>
                      <td className="py-2 pr-3">{RATE_BASIS_LABELS[row.basis]}</td>
                      <td className="py-2 pr-3"><AsOf row={row} /></td>
                      <td className="py-2 pr-3"><LenderLink row={row} /></td>
                      <td className="py-2 text-right">
                        <Button type="button" size="sm" variant="outline" onClick={() => onUseRate(row)}>Use this rate</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const isBest = row.sourceId === best;
                return (
                  <li key={row.sourceId} data-testid={`rate-row-${row.sourceId}`} className={`rounded-md border p-3 text-sm ${isBest ? 'bg-emerald-500/10' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="font-medium">{row.lender}</span>
                        {isBest && <Badge variant="secondary">Lowest</Badge>}
                      </div>
                      <LenderLink row={row} />
                    </div>
                    <div className="mt-1 text-base font-semibold tabular-nums">{rateRange(row)}</div>
                    <div className="text-xs text-muted-foreground">{RATE_BASIS_LABELS[row.basis]}</div>
                    <div className="mt-1 text-xs"><AsOf row={row} /></div>
                    <Button type="button" size="sm" variant="outline" className="mt-2 w-full" onClick={() => onUseRate(row)}>Use this rate</Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
