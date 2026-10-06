import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CopyCheck, Plus, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { transactionsApi } from '@/api/transactions.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { TransactionFormDialog } from './TransactionFormDialog';
import { DuplicatesDialog } from './DuplicatesDialog';
import type { TransactionDTO } from '@everypaisa/shared';
import { ASSET_CLASS_LABELS, formatINR, formatQuantity } from '@everypaisa/shared';

export function TransactionsPage() {
  const [portfolioFilter, setPortfolioFilter] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionDTO | null>(null);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [page, setPage] = useState(1);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const { data } = useQuery({
    queryKey: ['transactions', portfolioFilter, page],
    queryFn: () =>
      transactionsApi.list({
        portfolioId: portfolioFilter || undefined,
        page,
        pageSize: 50,
      }),
  });

  const rows = data?.items ?? [];

  return (
    <div>
      <PageHeader
        title="Transactions"
        description="All buys, sells, dividends, SIPs, and corporate actions"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setDuplicatesOpen(true)}>
              <CopyCheck className="h-4 w-4" /> Find duplicates
            </Button>
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4" /> Add transaction
            </Button>
          </div>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 pb-3">
            <Select
              className="min-w-0 max-w-xs"
              value={portfolioFilter}
              onChange={(e) => { setPortfolioFilter(e.target.value); setPage(1); }}
            >
              <option value="">All portfolios</option>
              {portfolios?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            {data && (
              <div className="shrink-0 whitespace-nowrap text-sm text-muted-foreground">
                {data.pagination.total} transaction{data.pagination.total === 1 ? '' : 's'}
              </div>
            )}
          </div>

          {rows.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              description="Add your first buy or sell to populate holdings and P&L."
              action={
                <Button onClick={() => { setEditing(null); setOpen(true); }}>
                  <Plus className="h-4 w-4" /> Add transaction
                </Button>
              }
            />
          ) : (
            <>
            {/* Phones: two lines per transaction instead of a seven-row card
                with an always-empty Broker line. Tap a row to edit it. */}
            <ul className="md:hidden -mx-1 divide-y divide-border/50">
              {rows.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => { setEditing(r); setOpen(true); }}
                    className="w-full px-1 py-2.5 text-left active:bg-accent/20"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium">{r.assetName}</span>
                      <span className="shrink-0 text-sm font-medium tabular-nums">{formatINR(r.netAmount)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className={`shrink-0 rounded px-1.5 py-px text-[10.5px] font-medium ${txTypeTone(r.transactionType)}`}>
                          {r.transactionType.replace(/_/g, ' ')}
                        </span>
                        <span className="shrink-0 tabular-nums">{r.tradeDate}</span>
                        <span className="truncate">· {r.symbol ?? r.schemeCode ?? r.isin ?? ASSET_CLASS_LABELS[r.assetClass] ?? r.assetClass}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {formatQuantity(r.quantity)} × {formatINR(r.price)}
                      </span>
                    </div>
                    {r.broker && <div className="mt-0.5 text-[11px] text-muted-foreground">{r.broker}</div>}
                  </button>
                </li>
              ))}
            </ul>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm rtable">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground uppercase tracking-wide border-b">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Type</th>
                    <th className="py-2 pr-4">Asset</th>
                    <th className="py-2 pr-4 text-right">Qty</th>
                    <th className="py-2 pr-4 text-right">Price</th>
                    <th className="py-2 pr-4 text-right">Net</th>
                    <th className="py-2 pr-4">Broker</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b last:border-0 hover:bg-accent/20 cursor-pointer"
                      onClick={() => { setEditing(r); setOpen(true); }}
                    >
                      <td data-label="Date" className="py-2 pr-4 tabular-nums">{r.tradeDate}</td>
                      <td data-label="Type" className="py-2 pr-4">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${txTypeTone(r.transactionType)}`}>
                          {r.transactionType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td data-label="Asset" className="py-2 pr-4">
                        <div className="font-medium truncate max-w-xs">{r.assetName}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.symbol ?? r.schemeCode ?? r.isin ?? r.assetClass}
                        </div>
                      </td>
                      <td data-label="Qty" className="py-2 pr-4 text-right tabular-nums">{formatQuantity(r.quantity)}</td>
                      <td data-label="Price" className="py-2 pr-4 text-right tabular-nums">{formatINR(r.price)}</td>
                      <td data-label="Net" className="py-2 pr-4 text-right tabular-nums font-medium">{formatINR(r.netAmount)}</td>
                      <td data-label="Broker" className="py-2 pr-4 text-muted-foreground">{r.broker ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          {data && data.pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-3 text-sm">
              <div className="text-muted-foreground">
                Page {data.pagination.page} of {data.pagination.totalPages}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pagination.totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <TransactionFormDialog open={open} onOpenChange={setOpen} initial={editing} />
      <DuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} />
    </div>
  );
}

function txTypeTone(type: string): string {
  if (type === 'BUY' || type === 'SIP' || type === 'SWITCH_IN') return 'bg-positive/10 text-positive';
  if (type === 'SELL' || type === 'SWITCH_OUT' || type === 'REDEMPTION') return 'bg-negative/10 text-negative';
  return 'bg-muted text-muted-foreground';
}
