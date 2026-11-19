import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, CopyCheck, Download, Plus, Receipt, Search, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { transactionsApi } from '@/api/transactions.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { TransactionFormDialog, type TransactionPrefill } from './TransactionFormDialog';
import { DuplicatesDialog } from './DuplicatesDialog';
import { useDebounced } from '@/pages/emi/useDebounced';
import {
  DEFAULT_DIR,
  EMPTY_FILTERS,
  TRANSACTION_TYPE_OPTIONS,
  hasActiveFilters,
  toListParams,
  type SortDir,
  type SortKey,
  type TransactionFilters,
} from './transactionFilters';
import type { TransactionDTO } from '@everypaisa/shared';
import { ASSET_CLASS_LABELS, formatINR, formatQuantity, formatDateOnly, transactionTypeLabel } from '@everypaisa/shared';

export function TransactionsPage() {
  const [portfolioFilter, setPortfolioFilter] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TransactionDTO | null>(null);
  const [prefill, setPrefill] = useState<TransactionPrefill | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // ?add=purchase&… — opened from the Reports data-quality banner for a sale
  // with no purchase behind it. Read once, then cleared from the URL so a
  // refresh does not reopen the form.
  useEffect(() => {
    if (searchParams.get('add') !== 'purchase') return;
    const qty = Number(searchParams.get('quantity'));
    setPrefill({
      portfolioId: searchParams.get('portfolioId') ?? undefined,
      transactionType: 'BUY',
      assetClass: (searchParams.get('assetClass') ?? 'EQUITY') as TransactionPrefill['assetClass'],
      stockSymbol: searchParams.get('symbol') ?? undefined,
      assetName: searchParams.get('assetName') ?? undefined,
      isin: searchParams.get('isin') ?? undefined,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : undefined,
      onOrBefore: searchParams.get('onOrBefore') ?? undefined,
    });
    setEditing(null);
    setOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [duplicatesOpen, setDuplicatesOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>('date');
  const [dir, setDir] = useState<SortDir>('desc');
  const [exporting, setExporting] = useState(false);
  // Search waits for a pause in typing so each keystroke is not a request.
  const debouncedQ = useDebounced(filters.q, 300);
  const effective: TransactionFilters = { ...filters, q: debouncedQ };

  const patchFilters = (patch: Partial<TransactionFilters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setPage(1);
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setPortfolioFilter('');
    setPage(1);
  };
  const toggleSort = (key: SortKey) => {
    if (sort === key) setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSort(key);
      setDir(DEFAULT_DIR[key]);
    }
    setPage(1);
  };
  const filtered = hasActiveFilters(effective, portfolioFilter);

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  const listParams = toListParams(effective, portfolioFilter, sort, dir);
  const { data } = useQuery({
    queryKey: ['transactions', listParams, page],
    queryFn: () => transactionsApi.list({ ...listParams, page, pageSize: 50 }),
    // Keep the old rows on screen while a new search loads, so typing does not flash the table empty.
    placeholderData: keepPreviousData,
  });

  async function exportCsv() {
    setExporting(true);
    try {
      await transactionsApi.exportCsv(listParams);
    } catch {
      toast.error('Could not export transactions. Please try again.');
    } finally {
      setExporting(false);
    }
  }

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
          <div className="space-y-3 pb-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[12rem] flex-1 sm:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={filters.q}
                  onChange={(e) => patchFilters({ q: e.target.value })}
                  placeholder="Search asset, symbol, ISIN or broker"
                  aria-label="Search transactions"
                  className="pl-9"
                />
              </div>
              <Select
                className="w-auto min-w-0 max-w-[11rem]"
                aria-label="Portfolio"
                value={portfolioFilter}
                onChange={(e) => { setPortfolioFilter(e.target.value); setPage(1); }}
              >
                <option value="">All portfolios</option>
                {portfolios?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <Select
                className="w-auto min-w-0 max-w-[11rem]"
                aria-label="Transaction type"
                value={filters.transactionType}
                onChange={(e) => patchFilters({ transactionType: e.target.value })}
              >
                <option value="">All types</option>
                {TRANSACTION_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
              <Select
                className="w-auto min-w-0 max-w-[12rem]"
                aria-label="Asset class"
                value={filters.assetClass}
                onChange={(e) => patchFilters({ assetClass: e.target.value })}
              >
                <option value="">All asset classes</option>
                {Object.entries(ASSET_CLASS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                From
                <Input
                  type="date"
                  value={filters.from}
                  max={filters.to || undefined}
                  onChange={(e) => patchFilters({ from: e.target.value })}
                  aria-label="From date"
                  className="h-9 w-auto"
                />
              </label>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                To
                <Input
                  type="date"
                  value={filters.to}
                  min={filters.from || undefined}
                  onChange={(e) => patchFilters({ to: e.target.value })}
                  aria-label="To date"
                  className="h-9 w-auto"
                />
              </label>
              {/* Wide screens sort by tapping a column header; phones have no headers. */}
              <Select
                className="h-9 w-auto min-w-0 md:hidden"
                aria-label="Sort by"
                value={`${sort}:${dir}`}
                onChange={(e) => {
                  const [k, d] = e.target.value.split(':') as [SortKey, SortDir];
                  setSort(k);
                  setDir(d);
                  setPage(1);
                }}
              >
                <option value="date:desc">Newest first</option>
                <option value="date:asc">Oldest first</option>
                <option value="amount:desc">Amount: high to low</option>
                <option value="amount:asc">Amount: low to high</option>
                <option value="asset:asc">Asset: A to Z</option>
              </Select>
              {filtered && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" /> Clear filters
                </Button>
              )}
              <div className="ml-auto flex items-center gap-3">
                {data && (
                  <div className="shrink-0 whitespace-nowrap text-sm text-muted-foreground" aria-live="polite">
                    {data.pagination.total} transaction{data.pagination.total === 1 ? '' : 's'}
                    {filtered ? ' found' : ''}
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void exportCsv()}
                  disabled={exporting || !data || data.pagination.total === 0}
                  title={filtered ? 'Download the transactions matching these filters' : 'Download all transactions'}
                >
                  <Download className="h-3.5 w-3.5" /> {exporting ? 'Exporting…' : 'Export CSV'}
                </Button>
              </div>
            </div>
          </div>

          {rows.length === 0 && filtered ? (
            <EmptyState
              icon={Search}
              title="No transactions match these filters"
              description="Try a different word, widen the dates, or clear the filters."
              action={<Button variant="outline" onClick={clearFilters}>Clear filters</Button>}
            />
          ) : rows.length === 0 ? (
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
                          {transactionTypeLabel(r.transactionType)}
                        </span>
                        <span className="shrink-0 tabular-nums">{formatDateOnly(r.tradeDate)}</span>
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
                    <SortableTh label="Date" sortKey="date" sort={sort} dir={dir} onSort={toggleSort} />
                    <SortableTh label="Type" sortKey="type" sort={sort} dir={dir} onSort={toggleSort} />
                    <SortableTh label="Asset" sortKey="asset" sort={sort} dir={dir} onSort={toggleSort} />
                    <SortableTh label="Qty" sortKey="quantity" sort={sort} dir={dir} onSort={toggleSort} align="right" />
                    <th className="py-2 pr-4 text-right">Price</th>
                    <SortableTh label="Net" sortKey="amount" sort={sort} dir={dir} onSort={toggleSort} align="right" />
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
                      <td data-label="Date" className="py-2 pr-4 tabular-nums">{formatDateOnly(r.tradeDate)}</td>
                      <td data-label="Type" className="py-2 pr-4">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${txTypeTone(r.transactionType)}`}>
                          {transactionTypeLabel(r.transactionType)}
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

      <TransactionFormDialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPrefill(null);
        }}
        initial={editing}
        prefill={prefill}
      />
      <DuplicatesDialog open={duplicatesOpen} onOpenChange={setDuplicatesOpen} />
    </div>
  );
}

function txTypeTone(type: string): string {
  if (type === 'BUY' || type === 'SIP' || type === 'SWITCH_IN') return 'bg-positive/10 text-positive';
  if (type === 'SELL' || type === 'SWITCH_OUT' || type === 'REDEMPTION') return 'bg-negative/10 text-negative';
  return 'bg-muted text-muted-foreground';
}

function SortableTh({
  label,
  sortKey,
  sort,
  dir,
  onSort,
  align = 'left',
}: {
  label: string;
  sortKey: SortKey;
  sort: SortKey;
  dir: SortDir;
  onSort: (k: SortKey) => void;
  align?: 'left' | 'right';
}) {
  const active = sort === sortKey;
  const Arrow = dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      className={`py-2 pr-4 ${align === 'right' ? 'text-right' : ''}`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground ${active ? 'text-foreground' : ''}`}
      >
        {label}
        {active && <Arrow className="h-3 w-3" aria-hidden />}
      </button>
    </th>
  );
}
