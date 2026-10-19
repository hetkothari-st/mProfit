import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Wrench, XCircle } from 'lucide-react';
import { formatDateOnly } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { apiErrorMessage } from '@/api/client';
import { reportsApi, type DataQualityIssue } from '@/api/reports.api';

/**
 * Whether the figures on the Reports page can be trusted, and if not, why.
 *
 * Reports are computed live from stored data, so they are exactly as good as
 * that data. This sits above every tab and says, in plain words, what is
 * missing, out of date or inconsistent — instead of letting a report print a
 * confident total over a gap.
 */
export function DataQualityBanner({ portfolioId }: { portfolioId: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const q = useQuery({
    queryKey: ['report-data-quality', portfolioId],
    queryFn: () => reportsApi.dataQuality(portfolioId),
    enabled: !!portfolioId,
    staleTime: 60_000,
  });

  const repair = useMutation({
    mutationFn: () => reportsApi.repairStoredData(portfolioId),
    onSuccess: (r) => {
      toast.success(
        r.holdingsRebuilt > 0
          ? `Rebuilt ${r.holdingsRebuilt} holding(s) from your transactions`
          : 'Everything already matched your transactions',
      );
      // Every report reads the rebuilt rows.
      void qc.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith('report-') });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Could not rebuild holdings')),
  });

  if (q.isLoading) {
    return (
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Checking your data…
      </div>
    );
  }
  if (q.isError || !q.data) {
    return (
      <div className="mb-4 flex items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        Data checks could not be run, so these reports have not been verified.
      </div>
    );
  }

  const d = q.data;
  const asOf = [
    d.dataAsOf.lastTransactionDate && `transactions up to ${formatDateOnly(d.dataAsOf.lastTransactionDate)}`,
    d.dataAsOf.newestPriceDate && `prices up to ${formatDateOnly(d.dataAsOf.newestPriceDate)}`,
  ]
    .filter(Boolean)
    .join(' · ');

  if (d.ok) {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-positive" />
        <span>All data checks passed.</span>
        {asOf && <span>Data as of: {asOf}.</span>}
      </div>
    );
  }

  const hasErrors = d.errorCount > 0;
  const canRepair = d.issues.some((i) => i.code === 'HOLDINGS_OUT_OF_SYNC');

  return (
    <div
      className={cn(
        'mb-4 rounded-md border px-3 py-2 text-sm',
        hasErrors ? 'border-negative/40 bg-negative/10' : 'border-warning/40 bg-warning/10',
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {hasErrors ? (
          <XCircle className="h-4 w-4 shrink-0 text-negative" />
        ) : (
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
        )}
        <span className="font-medium">
          {hasErrors
            ? 'Some figures in these reports are incomplete or wrong.'
            : 'These reports may not include your latest data.'}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 text-accent hover:underline"
          aria-expanded={open}
        >
          {open ? 'Hide details' : `See ${d.issues.length} issue${d.issues.length === 1 ? '' : 's'}`}
          <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} />
        </button>
        {canRepair && (
          <Button
            size="sm"
            variant="outline"
            className="sm:ml-auto"
            disabled={repair.isPending}
            onClick={() => repair.mutate()}
          >
            {repair.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
            Fix now
          </Button>
        )}
      </div>
      {asOf && <div className="mt-1 text-muted-foreground">Data as of: {asOf}.</div>}
      {open && (
        <ul className="mt-3 space-y-3">
          {d.issues.map((issue) => (
            <IssueRow key={issue.code} issue={issue} />
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueRow({ issue }: { issue: DataQualityIssue }) {
  return (
    <li>
      <div className="flex items-start gap-2">
        <span
          className={cn(
            'mt-1.5 h-2 w-2 shrink-0 rounded-full',
            issue.severity === 'error' ? 'bg-negative' : 'bg-warning',
          )}
        />
        <div className="min-w-0">
          <div>
            {issue.message} <span className="text-muted-foreground">({issue.count})</span>
            {issue.scope === 'account' && (
              <span className="text-muted-foreground"> — across all your portfolios</span>
            )}
          </div>
          {issue.items.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-muted-foreground">
              {issue.items.map((item, i) => (
                <li key={i} className="break-words">
                  {item.label}
                  {item.detail && <span> — {item.detail}</span>}
                </li>
              ))}
              {issue.moreItems > 0 && <li>…and {issue.moreItems} more</li>}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
