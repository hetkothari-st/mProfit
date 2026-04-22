import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { Decimal, formatINR } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cashflowsApi, type CashFlowDTO } from '@/api/cashflows.api';

type Tab = 'all' | 'INFLOW' | 'OUTFLOW';

const PAGE_SIZE = 50;

export function CashFlowsPage() {
  const [tab, setTab] = useState<Tab>('all');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['cashflows', tab, page],
    queryFn: () =>
      cashflowsApi.list({
        type: tab === 'all' ? undefined : tab,
        page,
        pageSize: PAGE_SIZE,
      }),
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Summary for visible items
  const totalInflow = items
    .filter((cf) => cf.type === 'INFLOW')
    .reduce((sum, cf) => sum.plus(new Decimal(cf.amount)), new Decimal(0));
  const totalOutflow = items
    .filter((cf) => cf.type === 'OUTFLOW')
    .reduce((sum, cf) => sum.plus(new Decimal(cf.amount)), new Decimal(0));

  return (
    <div>
      <PageHeader
        title="Cash Activity"
        description="Bank credits and debits parsed from your connected accounts"
      />

      {/* Tab strip */}
      <div className="flex gap-1 mb-4 border-b">
        {(['all', 'INFLOW', 'OUTFLOW'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => { setTab(t); setPage(1); }}
            className={[
              'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t === 'all' ? 'All' : t === 'INFLOW' ? 'Inflows' : 'Outflows'}
          </button>
        ))}
      </div>

      {/* Summary cards */}
      {items.length > 0 && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Inflows (this page)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-semibold text-positive tabular-nums">
                {formatINR(totalInflow.toString())}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Outflows (this page)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="text-xl font-semibold text-negative tabular-nums">
                {formatINR(totalOutflow.toString())}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isLoading && (
            <div className="divide-y">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4 px-4 py-3">
                  <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-1">
                    <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                    <div className="h-3 w-20 bg-muted animate-pulse rounded" />
                  </div>
                  <div className="h-4 w-20 bg-muted animate-pulse rounded" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <ArrowDownLeft className="h-10 w-10 opacity-30" />
              <p className="text-sm">No cash flows found</p>
              <p className="text-xs">
                Connect a Gmail account and configure senders to start ingesting bank alerts.
              </p>
            </div>
          )}

          {!isLoading && items.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium w-[120px]">Date</th>
                  <th className="text-left px-4 py-2 font-medium">Description</th>
                  <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Portfolio</th>
                  <th className="text-right px-4 py-2 font-medium w-[140px]">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((cf) => (
                  <CashFlowRow key={cf.id} cf={cf} />
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>
            {total} total · page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function CashFlowRow({ cf }: { cf: CashFlowDTO }) {
  const isInflow = cf.type === 'INFLOW';
  const dateStr = new Date(cf.date).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const amountDecimal = new Decimal(cf.amount);

  return (
    <tr className="hover:bg-muted/40 transition-colors">
      <td className="px-4 py-3 text-muted-foreground tabular-nums whitespace-nowrap">
        {dateStr}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className={[
              'h-7 w-7 rounded-full flex items-center justify-center shrink-0',
              isInflow ? 'bg-positive/10 text-positive' : 'bg-negative/10 text-negative',
            ].join(' ')}
          >
            {isInflow ? (
              <ArrowDownLeft className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpRight className="h-3.5 w-3.5" />
            )}
          </div>
          <span className="truncate max-w-xs">
            {cf.description ?? (isInflow ? 'Credit' : 'Debit')}
          </span>
        </div>
      </td>
      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell truncate max-w-[160px]">
        {cf.portfolioName}
      </td>
      <td
        className={[
          'px-4 py-3 text-right tabular-nums font-medium',
          isInflow ? 'text-positive' : 'text-negative',
        ].join(' ')}
      >
        {isInflow ? '+' : '−'}
        {formatINR(amountDecimal.toString())}
      </td>
    </tr>
  );
}
