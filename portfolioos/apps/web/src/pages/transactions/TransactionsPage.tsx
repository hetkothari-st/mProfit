import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Receipt } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { transactionsApi } from '@/api/transactions.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { TransactionFormDialog } from './TransactionFormDialog';
import type { TransactionDTO } from '@portfolioos/shared';
import { formatINR, formatQuantity } from '@portfolioos/shared';

export function TransactionsPage() {
  const [portfolioFilter, setPortfolioFilter] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionDTO | null>(null);
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
          <Button onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4" /> Add transaction
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3 pb-3">
            <Select
              className="max-w-xs"
              value={portfolioFilter}
              onChange={(e) => { setPortfolioFilter(e.target.value); setPage(1); }}
            >
              <option value="">All portfolios</option>
              {portfolios?.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            {data && (
              <div className="text-sm text-muted-foreground">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
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
                      <td className="py-2 pr-4 tabular-nums">{r.tradeDate}</td>
                      <td className="py-2 pr-4">
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                            r.transactionType === 'BUY' || r.transactionType === 'SIP' || r.transactionType === 'SWITCH_IN'
                              ? 'bg-positive/10 text-positive'
                              : r.transactionType === 'SELL' || r.transactionType === 'SWITCH_OUT' || r.transactionType === 'REDEMPTION'
                              ? 'bg-negative/10 text-negative'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {r.transactionType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-2 pr-4">
                        <div className="font-medium truncate max-w-xs">{r.assetName}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.symbol ?? r.schemeCode ?? r.isin ?? r.assetClass}
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatQuantity(r.quantity)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums">{formatINR(r.price)}</td>
                      <td className="py-2 pr-4 text-right tabular-nums font-medium">{formatINR(r.netAmount)}</td>
                      <td className="py-2 pr-4 text-muted-foreground">{r.broker ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
    </div>
  );
}
