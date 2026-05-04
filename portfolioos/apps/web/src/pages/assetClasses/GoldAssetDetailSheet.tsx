import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Coins, Calendar, Package, ImageIcon, Pencil } from 'lucide-react';
import { Decimal, formatINR, type HoldingRow, type AssetClass } from '@portfolioos/shared';
import type { TransactionDTO } from '@portfolioos/shared';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { transactionsApi } from '@/api/transactions.api';
import { api } from '@/api/client';

interface Props {
  holding: (HoldingRow & { portfolioName: string; currentValue?: string | null }) | null;
  livePrice?: string | null;
  open: boolean;
  onClose: () => void;
  onEditTransaction?: (txn: TransactionDTO) => void;
}

const ASSET_CLASS_LABELS: Partial<Record<AssetClass, string>> = {
  PHYSICAL_GOLD: 'Physical Gold',
  GOLD_BOND: 'Sovereign Gold Bond',
  GOLD_ETF: 'Gold ETF',
  PHYSICAL_SILVER: 'Physical Silver',
};

const TXN_TYPE_LABELS: Record<string, string> = {
  BUY: 'Buy', SELL: 'Sell',
  INTEREST_RECEIVED: 'Interest',
  MATURITY: 'Maturity',
};

function StatCard({ label, value, sub, positive }: {
  label: string; value: string; sub?: string; positive?: boolean
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium mb-1">{label}</p>
      <p className={`text-lg font-bold tabular-nums ${positive === true ? 'text-green-600 dark:text-green-400' : positive === false ? 'text-red-600 dark:text-red-400' : ''}`}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function PhotoGrid({ txnId, photos }: { txnId: string; photos: TransactionDTO['photos'] }) {
  const [srcs, setSrcs] = useState<Record<string, string>>({});

  useEffect(() => {
    const newSrcs: Record<string, string> = {};
    Promise.all(
      photos.map(async (p) => {
        try {
          const { data } = await api.get(`/api/transactions/${txnId}/photos/${p.id}`, { responseType: 'blob' });
          newSrcs[p.id] = URL.createObjectURL(data);
        } catch {}
      }),
    ).then(() => setSrcs(newSrcs));
    return () => Object.values(newSrcs).forEach(URL.revokeObjectURL);
  }, [txnId, photos]);

  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <div key={p.id} className="h-20 w-20 rounded-lg border overflow-hidden bg-muted/30">
          {srcs[p.id]
            ? <img src={srcs[p.id]} alt={p.fileName} className="h-full w-full object-cover" />
            : <div className="h-full w-full flex items-center justify-center"><ImageIcon className="h-6 w-6 text-muted-foreground" /></div>
          }
        </div>
      ))}
    </div>
  );
}

export function GoldAssetDetailSheet({ holding, livePrice, open, onClose, onEditTransaction }: Props) {
  const assetName = holding?.assetName ?? '';

  const { data: txnData } = useQuery({
    queryKey: ['transactions', holding?.assetClass, holding?.assetName],
    queryFn: () => transactionsApi.list({ assetClass: holding!.assetClass, pageSize: 200 }),
    enabled: !!holding,
  });

  // Filter transactions to this specific asset by name
  const transactions = (txnData?.items ?? []).filter(
    (t) => (t.assetName ?? '') === assetName,
  );

  // All photos across all transactions for this asset
  const allPhotos = transactions.flatMap((t) =>
    (t.photos ?? []).map((p) => ({ ...p, txnId: t.id })),
  );

  if (!holding) return null;

  const invested = new Decimal(holding.totalCost);
  const current = holding.currentValue ? new Decimal(holding.currentValue) : null;
  const pnl = current ? current.minus(invested) : null;
  const pnlPct = current && !invested.isZero()
    ? pnl!.div(invested).times(100).toNumber()
    : null;
  const isGain = pnl ? pnl.gte(0) : null;

  // Parse purity/carat from name
  const goldCaratMatch = assetName.match(/^(\d{2}[kK])\b/);
  const silverPurityMatch = assetName.match(/^(999|925|800)\b/);
  const purityTag = goldCaratMatch?.[1]?.toUpperCase() ?? silverPurityMatch?.[1] ?? null;

  const displayName = purityTag
    ? assetName.replace(/^([\d]+[kK]?)\s*/, '').trim() || assetName
    : assetName;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex flex-col overflow-hidden p-0">
        {/* Header */}
        <SheetHeader className="shrink-0">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
              <Coins className="h-5 w-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="min-w-0 flex-1 pr-6">
              <SheetTitle className="truncate">{displayName || assetName}</SheetTitle>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {ASSET_CLASS_LABELS[holding.assetClass as AssetClass] ?? holding.assetClass}
                </span>
                {purityTag && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0 text-amber-700 border-amber-300 dark:text-amber-300 dark:border-amber-700">
                    {purityTag}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">· {holding.portfolioName}</span>
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              label="Invested"
              value={formatINR(holding.totalCost)}
            />
            <StatCard
              label="Current value"
              value={current ? formatINR(current.toString()) : '—'}
              sub={livePrice ? 'via live rate' : undefined}
            />
            <StatCard
              label="Unrealised P&L"
              value={pnl ? `${isGain ? '+' : ''}${formatINR(pnl.toString())}` : '—'}
              sub={pnlPct != null ? `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%` : undefined}
              positive={isGain ?? undefined}
            />
            <StatCard
              label="Quantity / Weight"
              value={`${new Decimal(holding.quantity).toFixed(3)} ${['PHYSICAL_GOLD', 'PHYSICAL_SILVER'].includes(holding.assetClass) ? 'g' : 'units'}`}
            />
          </div>

          {/* More details */}
          <div className="rounded-lg border divide-y text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Avg cost price</span>
              <span className="font-medium tabular-nums">{formatINR(holding.avgCostPrice)}</span>
            </div>
            {current && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Current price</span>
                <span className="font-medium tabular-nums">
                  {formatINR(new Decimal(current).div(new Decimal(holding.quantity)).toString())}
                  <span className="text-xs text-muted-foreground ml-1">/
                    {['PHYSICAL_GOLD', 'PHYSICAL_SILVER'].includes(holding.assetClass) ? 'g' : 'unit'}
                  </span>
                </span>
              </div>
            )}
            {holding.xirr != null && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">XIRR</span>
                <span className={`font-medium tabular-nums ${holding.xirr >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {holding.xirr >= 0 ? '+' : ''}{(holding.xirr * 100).toFixed(2)}%
                </span>
              </div>
            )}
            {holding.holdingPeriodDays != null && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">Holding period</span>
                <span className="font-medium">{Math.floor(holding.holdingPeriodDays / 365)}y {Math.floor((holding.holdingPeriodDays % 365) / 30)}m</span>
              </div>
            )}
            {holding.isin && (
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-muted-foreground">ISIN</span>
                <span className="font-mono text-xs">{holding.isin}</span>
              </div>
            )}
          </div>

          {/* Photos */}
          {allPhotos.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <ImageIcon className="h-4 w-4 text-muted-foreground" /> Photos
              </h3>
              {/* Group by transaction */}
              {transactions.filter((t) => t.photos?.length).map((t) => (
                <div key={t.id} className="mb-3">
                  <p className="text-xs text-muted-foreground mb-2">
                    {TXN_TYPE_LABELS[t.transactionType] ?? t.transactionType} · {t.tradeDate}
                  </p>
                  <PhotoGrid txnId={t.id} photos={t.photos ?? []} />
                </div>
              ))}
            </div>
          )}

          {/* Transactions */}
          {transactions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" /> Transactions
              </h3>
              <div className="rounded-lg border divide-y text-sm">
                {transactions.map((t) => {
                  const amount = new Decimal(t.quantity).times(new Decimal(t.price));
                  const isBuy = ['BUY', 'INTEREST_RECEIVED', 'MATURITY'].includes(t.transactionType);
                  return (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="shrink-0">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium
                          ${isBuy
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}>
                          {TXN_TYPE_LABELS[t.transactionType] ?? t.transactionType}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground text-xs">{t.tradeDate}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {new Decimal(t.quantity).toFixed(3)} {['PHYSICAL_GOLD', 'PHYSICAL_SILVER'].includes(t.assetClass) ? 'g' : 'units'}
                          {' · '}
                          {formatINR(t.price)}/{['PHYSICAL_GOLD', 'PHYSICAL_SILVER'].includes(t.assetClass) ? 'g' : 'unit'}
                        </div>
                        {t.narration && <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{t.narration}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-medium tabular-nums">{formatINR(amount.toString())}</p>
                        {onEditTransaction && (
                          <Button
                            variant="ghost" size="sm"
                            className="h-6 w-6 p-0 mt-1"
                            onClick={() => onEditTransaction(t)}
                          >
                            <Pencil className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
