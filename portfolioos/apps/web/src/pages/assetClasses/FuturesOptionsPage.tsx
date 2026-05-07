import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import { Activity, AlertTriangle, RefreshCw, Loader2, Calendar, TrendingUp, TrendingDown, CheckCircle2, X, KeyRound, ChevronRight, ChevronDown } from 'lucide-react';
import { formatINR, toDecimal, Decimal } from '@portfolioos/shared';
import { foApi, brokerApi, type FoPosition, type FoTrade, type BrokerStatus } from '@/api/fo.api';
import { portfoliosApi } from '@/api/portfolios.api';
import { apiErrorMessage } from '@/api/client';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/EmptyState';

type BrokerId = 'zerodha' | 'upstox' | 'angel';

const BROKER_LABEL: Record<BrokerId, string> = {
  zerodha: 'Kite (Zerodha)',
  upstox: 'Upstox',
  angel: 'Angel One',
};

const BROKER_HELP: Record<BrokerId, string> = {
  zerodha: 'developers.kite.trade → create app, paste apiKey + apiSecret here once. Daily 2-click login (Kite mandates daily).',
  upstox: 'upstox.com/developer → create app, paste clientId + clientSecret + redirectUri. One login lasts ~30 days (auto-refresh).',
  angel: 'smartapi.angelbroking.com → get apiKey, paste clientCode + password + TOTP secret. Fully automated, no popup.',
};

function detectBrokerError(err: unknown): { code: 'NO_BROKER_CREDENTIAL' | 'BROKER_LOGIN_REQUIRED'; broker: BrokerId } | null {
  if (!axios.isAxiosError(err)) return null;
  const data = err.response?.data as { code?: string; details?: { brokerId?: string } } | undefined;
  if (data?.code !== 'NO_BROKER_CREDENTIAL' && data?.code !== 'BROKER_LOGIN_REQUIRED') return null;
  const b = data.details?.brokerId;
  if (b === 'zerodha' || b === 'upstox' || b === 'angel') {
    return { code: data.code, broker: b };
  }
  return null;
}

function fmtINR(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '') return '—';
  try {
    return formatINR(toDecimal(v as string | number).toString());
  } catch {
    return '—';
  }
}

function pnlClass(v: string | null | undefined): string {
  if (!v) return '';
  return toDecimal(v).isPositive() ? 'text-emerald-600' : toDecimal(v).isNegative() ? 'text-rose-600' : '';
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

function ExpiryBadge({ iso }: { iso: string }) {
  const d = daysUntil(iso);
  const cls =
    d < 0 ? 'bg-zinc-200 text-zinc-700'
    : d <= 1 ? 'bg-rose-100 text-rose-700'
    : d <= 7 ? 'bg-amber-100 text-amber-700'
    : 'bg-emerald-100 text-emerald-700';
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cls}`}>
      {d < 0 ? 'expired' : d === 0 ? 'today' : `${d}d`}
    </span>
  );
}

function KpiCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className={`text-xl font-semibold mt-1 ${accent ?? ''}`}>{value}</div>
        </div>
        <Icon className="h-8 w-8 text-muted-foreground/40" />
      </CardContent>
    </Card>
  );
}

export function FuturesOptionsPage() {
  const [params] = useSearchParams();
  const portfolioIdQ = params.get('portfolioId') ?? undefined;
  const [tab, setTab] = useState<'open' | 'closed' | 'trades' | 'pnl' | 'expiry'>('open');
  const [connect, setConnect] = useState<{ broker: BrokerId; resumeSync: boolean } | null>(null);
  const queryClient = useQueryClient();

  const brokerStatusQ = useQuery({
    queryKey: ['fo', 'broker-status'],
    queryFn: async () => (await brokerApi.status()) as BrokerStatus[],
    refetchInterval: 60_000,
  });

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });
  const portfolioId = portfolioIdQ ?? portfolios?.[0]?.id;

  const positionsQ = useQuery({
    queryKey: ['fo', 'positions', portfolioId],
    queryFn: () => foApi.positions(portfolioId),
    enabled: !!portfolioId,
  });
  const summaryQ = useQuery({
    queryKey: ['fo', 'summary', portfolioId],
    queryFn: () => foApi.summary(portfolioId),
    enabled: !!portfolioId,
  });
  const tradesQ = useQuery({
    queryKey: ['fo', 'trades', portfolioId],
    queryFn: () => foApi.trades(portfolioId),
    enabled: tab === 'trades' && !!portfolioId,
  });
  const pnlQ = useQuery({
    queryKey: ['fo', 'pnl', portfolioId],
    queryFn: () => foApi.pnl(portfolioId),
    enabled: tab === 'pnl' && !!portfolioId,
  });
  const expiryJobsQ = useQuery({
    queryKey: ['fo', 'expiry-jobs', 'PENDING_REVIEW'],
    queryFn: () => foApi.expiryJobs('PENDING_REVIEW'),
    enabled: tab === 'expiry',
  });

  const recomputeMut = useMutation({
    mutationFn: () => foApi.recompute(portfolioId!),
    onSuccess: () => {
      toast.success('Positions recomputed');
      queryClient.invalidateQueries({ queryKey: ['fo'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Recompute failed')),
  });

  const syncMut = useMutation({
    mutationFn: (brokerId: BrokerId) =>
      foApi.syncBroker(brokerId, portfolioId!).then((r) => r.data?.data),
    onSuccess: (r) => {
      toast.success(`Synced — ${r?.tradesIngested ?? 0} new trades`);
      queryClient.invalidateQueries({ queryKey: ['fo'] });
    },
    onError: (err, brokerId) => {
      const nc = detectBrokerError(err);
      if (nc?.code === 'NO_BROKER_CREDENTIAL') {
        toast(`Connect ${BROKER_LABEL[nc.broker]} first.`, { icon: '🔑' });
        setConnect({ broker: nc.broker, resumeSync: true });
        return;
      }
      if (nc?.code === 'BROKER_LOGIN_REQUIRED') {
        toast(`Login to ${BROKER_LABEL[nc.broker]}.`, { icon: '🔑' });
        void launchBrokerLogin(nc.broker, () => {
          queryClient.invalidateQueries({ queryKey: ['fo', 'broker-status'] });
          syncMut.mutate(nc.broker);
        });
        return;
      }
      toast.error(apiErrorMessage(err, `Sync ${brokerId} failed`));
    },
  });

  const approveMut = useMutation({
    mutationFn: (id: string) => foApi.approveExpiry(id),
    onSuccess: () => {
      toast.success('Approved');
      queryClient.invalidateQueries({ queryKey: ['fo'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Approve failed')),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => foApi.rejectExpiry(id),
    onSuccess: () => {
      toast.success('Rejected');
      queryClient.invalidateQueries({ queryKey: ['fo'] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Reject failed')),
  });

  const open = useMemo(
    () =>
      (positionsQ.data ?? []).filter(
        (p) => p.status === 'OPEN' || p.status === 'PENDING_EXPIRY_APPROVAL',
      ),
    [positionsQ.data],
  );
  const closed = useMemo(
    () =>
      (positionsQ.data ?? []).filter(
        (p) =>
          p.status === 'CLOSED' || p.status === 'EXPIRED_WORTHLESS' || p.status === 'EXERCISED',
      ),
    [positionsQ.data],
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Futures & Options"
        description="Open positions, P&L, expiry lifecycle, broker sync."
        actions={
          <div className="flex flex-wrap gap-2 items-center">
            <BrokerStatusChips
              statuses={brokerStatusQ.data ?? []}
              onConnect={(b) => setConnect({ broker: b, resumeSync: false })}
              onLogin={(b) =>
                launchBrokerLogin(b, () =>
                  queryClient.invalidateQueries({ queryKey: ['fo', 'broker-status'] }),
                )
              }
              onDisconnect={async (b) => {
                if (!confirm(`Disconnect ${BROKER_LABEL[b]}?`)) return;
                try {
                  await brokerApi.disconnect(b);
                  toast.success('Disconnected');
                  queryClient.invalidateQueries({ queryKey: ['fo', 'broker-status'] });
                } catch (e) {
                  toast.error(apiErrorMessage(e, 'Disconnect failed'));
                }
              }}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => syncMut.mutate('zerodha')}
              disabled={!portfolioId || syncMut.isPending}
            >
              {syncMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sync Kite'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => recomputeMut.mutate()}
              disabled={!portfolioId || recomputeMut.isPending}
              title="Recompute derivative positions"
            >
              <RefreshCw className={`h-4 w-4 ${recomputeMut.isPending ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        }
      />

      {summaryQ.data && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <KpiCard label="Open positions" value={String(summaryQ.data.openCount)} icon={Activity} />
          <KpiCard
            label="Realized P&L"
            value={fmtINR(summaryQ.data.totalRealizedPnl)}
            icon={TrendingUp}
            accent={pnlClass(summaryQ.data.totalRealizedPnl)}
          />
          <KpiCard
            label="Unrealized P&L"
            value={fmtINR(summaryQ.data.totalUnrealizedPnl)}
            icon={TrendingDown}
            accent={pnlClass(summaryQ.data.totalUnrealizedPnl)}
          />
          <KpiCard
            label="Expiring 7d"
            value={String(summaryQ.data.expiringSoon.length)}
            icon={Calendar}
            accent={summaryQ.data.expiringSoon.length > 0 ? 'text-amber-600' : ''}
          />
        </div>
      )}

      {summaryQ.data && summaryQ.data.expiringSoon.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
            <div className="text-sm">
              <strong>Expiring soon:</strong>{' '}
              {summaryQ.data.expiringSoon.map((e) => `${e.underlying} (${e.expiryDate})`).join(', ')}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="border-b">
        <nav className="flex gap-6 -mb-px">
          {(['open', 'closed', 'trades', 'pnl', 'expiry'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`pb-2 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {t === 'open'
                ? `Open (${open.length})`
                : t === 'closed'
                  ? `Closed (${closed.length})`
                  : t === 'trades'
                    ? 'Trades'
                    : t === 'pnl'
                      ? 'Tax / P&L'
                      : 'Expiry'}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'open' && <PositionsTable rows={open} trades={tradesQ.data ?? []} />}
      {tab === 'closed' && <PositionsTable rows={closed} closedView trades={tradesQ.data ?? []} />}

      {tab === 'trades' && (
        <Card>
          <CardContent className="p-0">
            {tradesQ.isLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            ) : (tradesQ.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No F&O trades yet"
                description="Sync your broker or import a contract note to see trades here."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-xs uppercase text-muted-foreground">
                      <th className="text-left px-3 py-2">Date</th>
                      <th className="text-left px-3 py-2">Symbol</th>
                      <th className="text-left px-3 py-2">Side</th>
                      <th className="text-right px-3 py-2">Strike</th>
                      <th className="text-left px-3 py-2">Expiry</th>
                      <th className="text-right px-3 py-2">Qty</th>
                      <th className="text-right px-3 py-2">Lot</th>
                      <th className="text-right px-3 py-2">Price</th>
                      <th className="text-right px-3 py-2">Net</th>
                      <th className="text-left px-3 py-2">Broker</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tradesQ.data!.map((t) => (
                      <tr key={t.id} className="border-t">
                        <td className="px-3 py-2">{t.tradeDate}</td>
                        <td className="px-3 py-2 font-mono text-xs">{t.assetName}</td>
                        <td
                          className={`px-3 py-2 font-medium ${
                            t.transactionType === 'BUY' ? 'text-emerald-600' : 'text-rose-600'
                          }`}
                        >
                          {t.transactionType}
                        </td>
                        <td className="px-3 py-2 text-right">{t.strikePrice ?? '—'}</td>
                        <td className="px-3 py-2">{t.expiryDate ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{t.quantity}</td>
                        <td className="px-3 py-2 text-right">{t.lotSize ?? '—'}</td>
                        <td className="px-3 py-2 text-right">{fmtINR(t.price)}</td>
                        <td className="px-3 py-2 text-right">{fmtINR(t.netAmount)}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">
                          {t.broker ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {tab === 'pnl' && (
        <Card>
          <CardContent className="p-4">
            {pnlQ.isLoading ? (
              <div className="text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            ) : !pnlQ.data || pnlQ.data.rows.length === 0 ? (
              <EmptyState
                title="No realized P&L yet"
                description="P&L is computed once you close positions or hold past expiry."
              />
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                  {Object.entries(pnlQ.data.summaryByFy).map(([fy, s]) => (
                    <Card key={fy}>
                      <CardContent className="p-3">
                        <div className="text-xs text-muted-foreground">FY {fy}</div>
                        <div className="text-lg font-semibold mt-1">
                          <span className={pnlClass(s.totalPnl)}>{fmtINR(s.totalPnl)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Turnover: {fmtINR(s.turnover)} · Trades: {s.tradeCount}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Non-speculative (§43(5)) · ITR-3
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-xs uppercase text-muted-foreground">
                        <th className="text-left px-3 py-2">Underlying</th>
                        <th className="text-left px-3 py-2">Type</th>
                        <th className="text-right px-3 py-2">Strike</th>
                        <th className="text-left px-3 py-2">Expiry</th>
                        <th className="text-left px-3 py-2">Side</th>
                        <th className="text-left px-3 py-2">FY</th>
                        <th className="text-right px-3 py-2">Realized P&L</th>
                        <th className="text-right px-3 py-2">Turnover</th>
                        <th className="text-right px-3 py-2">Trades</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pnlQ.data.rows.map((r, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-3 py-2">{r.underlying}</td>
                          <td className="px-3 py-2">{r.instrumentType}</td>
                          <td className="px-3 py-2 text-right">{r.strikePrice ?? '—'}</td>
                          <td className="px-3 py-2">{r.expiryDate}</td>
                          <td className="px-3 py-2 text-xs">{r.side}</td>
                          <td className="px-3 py-2">{r.financialYear}</td>
                          <td
                            className={`px-3 py-2 text-right font-medium ${pnlClass(r.realizedPnl)}`}
                          >
                            {fmtINR(r.realizedPnl)}
                          </td>
                          <td className="px-3 py-2 text-right">{fmtINR(r.turnover)}</td>
                          <td className="px-3 py-2 text-right">{r.closedTradeCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <ConnectBrokerDialog
        state={connect}
        onClose={() => setConnect(null)}
        onSaved={(broker) => {
          const resume = connect?.resumeSync ?? false;
          setConnect(null);
          if (resume && portfolioId) syncMut.mutate(broker);
        }}
      />

      {tab === 'expiry' && (
        <Card>
          <CardContent className="p-4">
            {expiryJobsQ.isLoading ? (
              <div className="text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </div>
            ) : (expiryJobsQ.data?.length ?? 0) === 0 ? (
              <EmptyState
                title="No pending expiry approvals"
                description="Expiry close requests appear here on expiry day after settlement is published."
              />
            ) : (
              <div className="space-y-2">
                {expiryJobsQ.data!.map((j) => (
                  <div key={j.id} className="flex items-center justify-between border rounded p-3">
                    <div className="text-sm">
                      <div className="font-medium">Expiry close {j.expiryDate}</div>
                      <div className="text-xs text-muted-foreground">
                        {j.openQty} contracts · settlement{' '}
                        {j.settlementPrice ? fmtINR(j.settlementPrice) : 'pending'}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => rejectMut.mutate(j.id)}>
                        <X className="h-3 w-3 mr-1" /> Reject
                      </Button>
                      <Button size="sm" onClick={() => approveMut.mutate(j.id)}>
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Best-effort underlying extractor for an F&O trade. Trades store the
 * full instrument string in `assetName` (e.g. "NIFTY 25000 CE 28-APR-2026")
 * — the leading whitespace-bounded token is the underlying for every
 * Indian broker we've seen so far.
 */
function tradeUnderlying(t: FoTrade): string {
  const name = (t.assetName ?? '').trim();
  if (!name) return 'UNKNOWN';
  return name.split(/\s+/)[0]!.toUpperCase();
}

interface UnderlyingGroup {
  underlying: string;
  positions: FoPosition[];
  netRealizedPnl: Decimal;
  netUnrealizedPnl: Decimal;
  totalCost: Decimal;
  openContracts: number;
  closedContracts: number;
}

function groupByUnderlying(rows: FoPosition[]): UnderlyingGroup[] {
  const map = new Map<string, UnderlyingGroup>();
  for (const p of rows) {
    let g = map.get(p.underlying);
    if (!g) {
      g = {
        underlying: p.underlying,
        positions: [],
        netRealizedPnl: new Decimal(0),
        netUnrealizedPnl: new Decimal(0),
        totalCost: new Decimal(0),
        openContracts: 0,
        closedContracts: 0,
      };
      map.set(p.underlying, g);
    }
    g.positions.push(p);
    if (p.realizedPnl) g.netRealizedPnl = g.netRealizedPnl.plus(toDecimal(p.realizedPnl));
    if (p.unrealizedPnl) g.netUnrealizedPnl = g.netUnrealizedPnl.plus(toDecimal(p.unrealizedPnl));
    if (p.totalCost) g.totalCost = g.totalCost.plus(toDecimal(p.totalCost));
    if (p.status === 'OPEN' || p.status === 'PENDING_EXPIRY_APPROVAL') g.openContracts++;
    else g.closedContracts++;
  }
  // Largest absolute exposure first, with open contracts breaking ties
  return [...map.values()].sort((a, b) => {
    const expDiff = b.totalCost.abs().comparedTo(a.totalCost.abs());
    if (expDiff !== 0) return expDiff;
    return b.openContracts - a.openContracts;
  });
}

function PositionsTable({
  rows,
  closedView,
  trades,
}: {
  rows: FoPosition[];
  closedView?: boolean;
  trades: FoTrade[];
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const groups = useMemo(() => groupByUnderlying(rows), [rows]);
  const tradesByUnderlying = useMemo(() => {
    const m = new Map<string, FoTrade[]>();
    for (const t of trades) {
      const u = tradeUnderlying(t);
      const arr = m.get(u);
      if (arr) arr.push(t);
      else m.set(u, [t]);
    }
    return m;
  }, [trades]);

  if (groups.length === 0) {
    return (
      <EmptyState
        title={closedView ? 'No closed positions' : 'No open F&O positions'}
        description={
          closedView
            ? 'Closed positions will appear here once you trade out, expire, or roll.'
            : 'Sync your broker or import contract notes to populate positions.'
        }
      />
    );
  }

  function toggle(underlying: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(underlying)) next.delete(underlying);
      else next.add(underlying);
      return next;
    });
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="w-8 px-2 py-2"></th>
                <th className="text-left px-3 py-2">Underlying</th>
                <th className="text-right px-3 py-2">Contracts</th>
                <th className="text-right px-3 py-2">Total Cost</th>
                <th className="text-right px-3 py-2">Realized P&L</th>
                <th className="text-right px-3 py-2">Unrealized P&L</th>
                <th className="text-right px-3 py-2">Net P&L</th>
                <th className="text-right px-3 py-2">Trades</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = expanded.has(g.underlying);
                const tradesForU = tradesByUnderlying.get(g.underlying) ?? [];
                const netPnl = g.netRealizedPnl.plus(g.netUnrealizedPnl);
                return (
                  <UnderlyingRows
                    key={g.underlying}
                    group={g}
                    isOpen={isOpen}
                    onToggle={() => toggle(g.underlying)}
                    netPnl={netPnl}
                    trades={tradesForU}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function UnderlyingRows({
  group,
  isOpen,
  onToggle,
  netPnl,
  trades,
}: {
  group: UnderlyingGroup;
  isOpen: boolean;
  onToggle: () => void;
  netPnl: Decimal;
  trades: FoTrade[];
}) {
  const realizedClass = group.netRealizedPnl.isPositive()
    ? 'text-emerald-600'
    : group.netRealizedPnl.isNegative()
      ? 'text-rose-600'
      : '';
  const unrealizedClass = group.netUnrealizedPnl.isPositive()
    ? 'text-emerald-600'
    : group.netUnrealizedPnl.isNegative()
      ? 'text-rose-600'
      : '';
  const netClass = netPnl.isPositive()
    ? 'text-emerald-600'
    : netPnl.isNegative()
      ? 'text-rose-600'
      : '';

  return (
    <>
      <tr
        className={`border-t cursor-pointer hover:bg-muted/30 ${isOpen ? 'bg-muted/20' : ''}`}
        onClick={onToggle}
      >
        <td className="px-2 py-2 text-muted-foreground">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </td>
        <td className="px-3 py-2 font-medium">{group.underlying}</td>
        <td className="px-3 py-2 text-right text-xs">
          <span className="text-emerald-700">{group.openContracts} open</span>
          {group.closedContracts > 0 && (
            <span className="text-muted-foreground"> · {group.closedContracts} closed</span>
          )}
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtINR(group.totalCost.toString())}</td>
        <td className={`px-3 py-2 text-right tabular-nums ${realizedClass}`}>
          {fmtINR(group.netRealizedPnl.toString())}
        </td>
        <td className={`px-3 py-2 text-right tabular-nums ${unrealizedClass}`}>
          {fmtINR(group.netUnrealizedPnl.toString())}
        </td>
        <td className={`px-3 py-2 text-right font-semibold tabular-nums ${netClass}`}>
          {fmtINR(netPnl.toString())}
        </td>
        <td className="px-3 py-2 text-right text-xs text-muted-foreground tabular-nums">
          {trades.length}
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={8} className="bg-muted/10 p-0">
            <div className="border-l-2 border-primary/40 ml-4 mr-2 my-2 pl-3 pr-1 py-2 space-y-4">
              <UnderlyingContracts positions={group.positions} />
              <UnderlyingTrades trades={trades} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function UnderlyingContracts({ positions }: { positions: FoPosition[] }) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
        Contracts ({positions.length})
      </div>
      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-[10px] uppercase text-muted-foreground">
              <th className="text-left px-2 py-1.5">Type</th>
              <th className="text-right px-2 py-1.5">Strike</th>
              <th className="text-left px-2 py-1.5">Expiry</th>
              <th className="text-right px-2 py-1.5">Net Qty</th>
              <th className="text-right px-2 py-1.5">Lot</th>
              <th className="text-right px-2 py-1.5">Avg Entry</th>
              <th className="text-right px-2 py-1.5">LTP</th>
              <th className="text-right px-2 py-1.5">Realized</th>
              <th className="text-right px-2 py-1.5">Unrealized</th>
              <th className="text-left px-2 py-1.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {positions.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-2 py-1.5 font-medium">{p.instrumentType}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.strikePrice ?? '—'}</td>
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span>{p.expiryDate}</span>
                    {p.status === 'OPEN' && <ExpiryBadge iso={p.expiryDate} />}
                  </div>
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.netQuantity}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.lotSize}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtINR(p.avgEntryPrice)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{p.mtmPrice ? fmtINR(p.mtmPrice) : '—'}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${pnlClass(p.realizedPnl)}`}>
                  {fmtINR(p.realizedPnl)}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums ${pnlClass(p.unrealizedPnl)}`}>
                  {p.unrealizedPnl ? fmtINR(p.unrealizedPnl) : '—'}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${
                      p.status === 'OPEN'
                        ? 'bg-emerald-100 text-emerald-700'
                        : p.status === 'PENDING_EXPIRY_APPROVAL'
                          ? 'bg-amber-100 text-amber-700'
                          : p.status === 'EXPIRED_WORTHLESS'
                            ? 'bg-zinc-200 text-zinc-700'
                            : 'bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {p.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnderlyingTrades({ trades }: { trades: FoTrade[] }) {
  if (trades.length === 0) {
    return (
      <div>
        <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
          Transactions
        </div>
        <div className="text-xs text-muted-foreground italic">
          No transactions on file for this underlying.
        </div>
      </div>
    );
  }
  const sorted = [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
  return (
    <div>
      <div className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
        Transactions ({trades.length})
      </div>
      <div className="overflow-x-auto rounded border bg-background">
        <table className="w-full text-xs">
          <thead className="bg-muted/40">
            <tr className="text-[10px] uppercase text-muted-foreground">
              <th className="text-left px-2 py-1.5">Date</th>
              <th className="text-left px-2 py-1.5">Side</th>
              <th className="text-left px-2 py-1.5">Instrument</th>
              <th className="text-right px-2 py-1.5">Strike</th>
              <th className="text-left px-2 py-1.5">Expiry</th>
              <th className="text-right px-2 py-1.5">Qty</th>
              <th className="text-right px-2 py-1.5">Price</th>
              <th className="text-right px-2 py-1.5">Net Amount</th>
              <th className="text-left px-2 py-1.5">Broker</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="px-2 py-1.5 whitespace-nowrap">{t.tradeDate}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      t.transactionType === 'BUY'
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {t.transactionType}
                  </span>
                </td>
                <td className="px-2 py-1.5 truncate max-w-[260px]">{t.assetName ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{t.strikePrice ?? '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{t.expiryDate ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{t.quantity}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtINR(t.price)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtINR(t.netAmount)}</td>
                <td className="px-2 py-1.5 text-xs text-muted-foreground">{t.broker ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BrokerStatusChips({
  statuses,
  onConnect,
  onLogin,
  onDisconnect,
}: {
  statuses: BrokerStatus[];
  onConnect: (b: BrokerId) => void;
  onLogin: (b: BrokerId) => void;
  onDisconnect: (b: BrokerId) => void;
}) {
  if (statuses.length === 0) {
    return (
      <Button size="sm" variant="ghost" onClick={() => onConnect('zerodha')}>
        <KeyRound className="h-4 w-4 mr-1" /> Connect broker
      </Button>
    );
  }
  return (
    <div className="flex gap-1.5 items-center text-xs">
      {statuses.map((s) => {
        const b = s.brokerId as BrokerId;
        const cls = !s.configured
          ? 'border-dashed text-muted-foreground'
          : s.connected
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
            : 'border-amber-300 bg-amber-50 text-amber-700';
        return (
          <div key={b} className={`inline-flex items-center rounded border px-1.5 py-0.5 gap-1 ${cls}`}>
            <span className="font-medium">{BROKER_LABEL[b]}</span>
            {!s.configured && (
              <button type="button" className="underline" onClick={() => onConnect(b)}>
                connect
              </button>
            )}
            {s.configured && !s.connected && (
              <button type="button" className="underline" onClick={() => onLogin(b)}>
                login
              </button>
            )}
            {s.configured && s.connected && (
              <>
                <CheckCircle2 className="h-3 w-3" />
                <button
                  type="button"
                  className="underline ml-1 opacity-70"
                  onClick={() => onDisconnect(b)}
                  title="Forget credentials"
                >
                  ×
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Open the broker login URL in a popup, listen for the postMessage from the
 * callback page, then resolve. Used both for first-time connect and daily
 * re-login (Kite).
 */
async function launchBrokerLogin(brokerId: BrokerId, onSuccess?: () => void): Promise<void> {
  let resp: { url: string };
  try {
    resp = await brokerApi.startOauth(brokerId);
  } catch (e) {
    toast.error(apiErrorMessage(e, 'Could not start login'));
    return;
  }
  if (!resp.url) {
    // Angel — orchestrator already refreshed inline.
    toast.success(`${BROKER_LABEL[brokerId]} session refreshed`);
    onSuccess?.();
    return;
  }
  const popup = window.open(
    resp.url,
    'broker_login',
    'popup=yes,width=560,height=720,noopener=no',
  );
  if (!popup) {
    toast.error('Popup blocked — allow popups and retry.');
    return;
  }
  await new Promise<void>((resolve) => {
    let done = false;
    const onMsg = (ev: MessageEvent) => {
      const d = ev.data as { type?: string; payload?: { ok?: boolean; brokerId?: string; error?: string } } | undefined;
      if (!d || d.type !== 'broker_oauth_result') return;
      done = true;
      window.removeEventListener('message', onMsg);
      if (d.payload?.ok) {
        toast.success(`${BROKER_LABEL[brokerId]} login complete`);
        onSuccess?.();
      } else {
        toast.error(d.payload?.error ?? 'Login failed');
      }
      resolve();
    };
    window.addEventListener('message', onMsg);
    // Fallback: if popup closes without postMessage (user cancelled / browser
    // ate the message), give up after the popup is gone.
    const poll = window.setInterval(() => {
      if (popup.closed) {
        window.clearInterval(poll);
        if (!done) {
          window.removeEventListener('message', onMsg);
          resolve();
        }
      }
    }, 500);
  });
}

interface ConnectFormState {
  broker: BrokerId;
  apiKey: string;
  apiSecret: string;
  redirectUri: string;
  clientCode: string;
  password: string;
  totpSecret: string;
}

function emptyForm(broker: BrokerId, defaultRedirect: string): ConnectFormState {
  return {
    broker,
    apiKey: '',
    apiSecret: '',
    redirectUri: broker === 'upstox' ? defaultRedirect : '',
    clientCode: '',
    password: '',
    totpSecret: '',
  };
}

function ConnectBrokerDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { broker: BrokerId; resumeSync: boolean } | null;
  onClose: () => void;
  onSaved: (broker: BrokerId) => void;
}) {
  const open = state !== null;
  const broker = state?.broker ?? 'zerodha';
  const [form, setForm] = useState<ConnectFormState>(emptyForm(broker, ''));

  const redirectInfoQ = useQuery({
    queryKey: ['fo', 'redirect-info', form.broker],
    queryFn: () => brokerApi.redirectInfo(form.broker),
    enabled: open,
  });

  useEffect(() => {
    if (open) {
      setForm(emptyForm(broker, redirectInfoQ.data?.redirectUri ?? ''));
    }
  }, [broker, open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (form.broker === 'upstox' && redirectInfoQ.data?.redirectUri && !form.redirectUri) {
      setForm((f) => ({ ...f, redirectUri: redirectInfoQ.data!.redirectUri }));
    }
  }, [form.broker, redirectInfoQ.data, form.redirectUri]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const r = await brokerApi.setup({
        brokerId: form.broker,
        apiKey: form.apiKey.trim(),
        apiSecret: form.apiSecret.trim() || undefined,
        redirectUri: form.redirectUri.trim() || undefined,
        clientCode: form.clientCode.trim() || undefined,
        password: form.password || undefined,
        totpSecret: form.totpSecret.replace(/\s+/g, '').trim() || undefined,
      });
      if (r.needsLogin) {
        await launchBrokerLogin(form.broker);
      }
      return r;
    },
    onSuccess: () => {
      toast.success(`${BROKER_LABEL[form.broker]} configured`);
      onSaved(form.broker);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Save failed')),
  });

  const canSubmit =
    form.apiKey.trim().length > 0 &&
    (form.broker === 'zerodha'
      ? form.apiSecret.trim().length > 0
      : form.broker === 'upstox'
        ? form.apiSecret.trim().length > 0 && form.redirectUri.trim().length > 0
        : form.clientCode.trim().length > 0 &&
          form.password.length > 0 &&
          form.totpSecret.replace(/\s+/g, '').length >= 8);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect broker</DialogTitle>
          <DialogDescription>
            Paste API credentials once. After this, sync runs without re-entering anything (Kite needs a daily 2-click login).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label htmlFor="cb-broker">Broker</Label>
            <select
              id="cb-broker"
              value={form.broker}
              onChange={(e) =>
                setForm(emptyForm(e.target.value as BrokerId, redirectInfoQ.data?.redirectUri ?? ''))
              }
              className="mt-1 w-full rounded border bg-background px-2 py-1.5 text-sm"
            >
              <option value="zerodha">Kite (Zerodha)</option>
              <option value="upstox">Upstox</option>
              <option value="angel">Angel One</option>
            </select>
            <p className="text-[11px] text-muted-foreground mt-1">{BROKER_HELP[form.broker]}</p>
          </div>

          <div>
            <Label htmlFor="cb-key">API key</Label>
            <Input
              id="cb-key"
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {(form.broker === 'zerodha' || form.broker === 'upstox') && (
            <div>
              <Label htmlFor="cb-secret">{form.broker === 'zerodha' ? 'API secret' : 'Client secret'}</Label>
              <Input
                id="cb-secret"
                value={form.apiSecret}
                onChange={(e) => setForm({ ...form, apiSecret: e.target.value })}
                autoComplete="off"
                spellCheck={false}
                type="password"
              />
            </div>
          )}

          {form.broker === 'upstox' && (
            <div>
              <Label htmlFor="cb-redir">Redirect URI</Label>
              <Input
                id="cb-redir"
                value={form.redirectUri}
                onChange={(e) => setForm({ ...form, redirectUri: e.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Register this exact URL on the Upstox dashboard before saving.
              </p>
            </div>
          )}

          {form.broker === 'angel' && (
            <>
              <div>
                <Label htmlFor="cb-client">Client code</Label>
                <Input
                  id="cb-client"
                  value={form.clientCode}
                  onChange={(e) => setForm({ ...form, clientCode: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div>
                <Label htmlFor="cb-pw">Password / PIN</Label>
                <Input
                  id="cb-pw"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  type="password"
                />
              </div>
              <div>
                <Label htmlFor="cb-totp">TOTP secret (base32)</Label>
                <Input
                  id="cb-totp"
                  value={form.totpSecret}
                  onChange={(e) => setForm({ ...form, totpSecret: e.target.value })}
                  autoComplete="off"
                  spellCheck={false}
                  type="password"
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  From SmartAPI &quot;TOTP Setup&quot; — the seed shown beside the QR code (not the 6-digit code).
                </p>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" disabled={!canSubmit || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save & continue'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
