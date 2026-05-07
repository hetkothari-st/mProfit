import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  Activity,
  AlertTriangle,
  RefreshCw,
  Loader2,
  Calendar,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  X,
  KeyRound,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
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
  return toDecimal(v).isPositive()
    ? 'text-emerald-700 dark:text-emerald-400'
    : toDecimal(v).isNegative()
      ? 'text-rose-700 dark:text-rose-400'
      : '';
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

function ExpiryBadge({ iso }: { iso: string }) {
  const d = daysUntil(iso);
  const cls =
    d < 0
      ? 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
      : d <= 1
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
        : d <= 7
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
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
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] font-semibold">
            {label}
          </div>
          <div className={`text-xl font-semibold mt-1 tabular-nums ${accent ?? ''}`}>{value}</div>
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

  // Auto-refresh live MTM in the background while the page is open. The
  // server-side service caches NSE quote-derivative responses for 5s per
  // underlying, so polling at 5s collapses onto one upstream call per
  // underlying. We pause when the tab is hidden to spare both NSE and
  // ourselves from idle traffic.
  const [liveStatus, setLiveStatus] = useState<{
    updated: number;
    total: number;
    at: number;
  } | null>(null);

  const liveRefreshMut = useMutation({
    mutationFn: () => foApi.refreshLive(portfolioId),
    onSuccess: (r) => {
      setLiveStatus({ updated: r.updated, total: r.total, at: Date.now() });
      queryClient.invalidateQueries({ queryKey: ['fo', 'positions'] });
      queryClient.invalidateQueries({ queryKey: ['fo', 'summary'] });
    },
  });

  useEffect(() => {
    if (!portfolioId) return;
    let cancelled = false;
    function tick() {
      if (cancelled) return;
      if (document.visibilityState !== 'visible') return;
      liveRefreshMut.mutate();
    }
    tick();
    const id = window.setInterval(tick, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [portfolioId]);

  const positionsQ = useQuery({
    queryKey: ['fo', 'positions', portfolioId],
    queryFn: () => foApi.positions(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const summaryQ = useQuery({
    queryKey: ['fo', 'summary', portfolioId],
    queryFn: () => foApi.summary(portfolioId),
    enabled: !!portfolioId,
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const tradesQ = useQuery({
    queryKey: ['fo', 'trades', portfolioId],
    queryFn: () => foApi.trades(portfolioId),
    enabled: !!portfolioId,
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
            <LiveStatusChip status={liveStatus} pending={liveRefreshMut.isPending} />
            <Button
              size="sm"
              variant="outline"
              onClick={() => liveRefreshMut.mutate()}
              disabled={!portfolioId || liveRefreshMut.isPending}
              title="Pull live MTM from NSE quote-derivative"
            >
              {liveRefreshMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sync prices'}
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
            accent={summaryQ.data.expiringSoon.length > 0 ? 'text-amber-600 dark:text-amber-400' : ''}
          />
        </div>
      )}

      {summaryQ.data && summaryQ.data.expiringSoon.length > 0 && (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-950/30">
          <CardContent className="p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="text-sm text-amber-900 dark:text-amber-200">
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

      {tab === 'open' && (
        <SplitFoTables rows={open} trades={tradesQ.data ?? []} />
      )}
      {tab === 'closed' && (
        <SplitFoTables rows={closed} closedView trades={tradesQ.data ?? []} />
      )}

      {tab === 'trades' && (
        <>
          {tradesQ.isLoading ? (
            <Card>
              <CardContent className="p-8 text-center">
                <Loader2 className="h-5 w-5 animate-spin mx-auto" />
              </CardContent>
            </Card>
          ) : (tradesQ.data?.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="p-0">
                <EmptyState
                  title="No F&O trades yet"
                  description="Sync your broker or import a contract note to see trades here."
                />
              </CardContent>
            </Card>
          ) : (
            <TapeSection trades={tradesQ.data!} />
          )}
        </>
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
              <PnlStatement data={pnlQ.data} />
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
                  <div
                    key={j.id}
                    className="flex items-center justify-between border rounded p-3 dark:border-border"
                  >
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

/* ───────────────────────────── Visual glyphs ─────────────────────────────
   Tiny inline SVGs that telegraph what each section actually is — futures
   are equal-weighted lots stacked on a time axis; options are asymmetric
   payoff curves around a strike. The point is that an analyst should be
   able to glance at the panel chrome and know which thing they're seeing
   without reading the title. */

function FuturesGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="6" width="3.5" height="11" className="fill-sky-500/40 dark:fill-sky-400/40" />
      <rect x="7.25" y="3" width="3.5" height="14" className="fill-sky-600/55 dark:fill-sky-300/55" />
      <rect x="12.5" y="9" width="3.5" height="8" className="fill-sky-500/40 dark:fill-sky-400/40" />
      <rect x="17.75" y="5" width="3.5" height="12" className="fill-sky-700/55 dark:fill-sky-300/65" />
      <line x1="1.5" y1="18.5" x2="22.5" y2="18.5" className="stroke-sky-700/70 dark:stroke-sky-300/70" strokeWidth="0.7" />
      <line x1="1.5" y1="20.5" x2="22.5" y2="20.5" className="stroke-sky-700/30 dark:stroke-sky-300/30" strokeWidth="0.4" />
    </svg>
  );
}

function OptionsGlyph({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 26 18" fill="none" aria-hidden>
      <line x1="13" y1="1.5" x2="13" y2="16.5" className="stroke-violet-500/40 dark:stroke-violet-300/50" strokeWidth="0.5" strokeDasharray="1 1.3" />
      <path d="M2 14 L13 14 L23 3" className="stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M3 3 L13 14 L24 14" className="stroke-rose-600 dark:stroke-rose-400" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray="0.6 1.4" />
    </svg>
  );
}

function PayoffCell({ type }: { type: 'CALL' | 'PUT' }) {
  if (type === 'CALL') {
    return (
      <svg viewBox="0 0 32 14" className="h-3.5 w-8 inline-block" aria-hidden>
        <path d="M1 11 H16 L31 1.5" className="stroke-emerald-600 dark:stroke-emerald-400" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="16" y1="1" x2="16" y2="13" className="stroke-emerald-700/30 dark:stroke-emerald-300/30" strokeWidth="0.5" strokeDasharray="1 1.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 14" className="h-3.5 w-8 inline-block" aria-hidden>
      <path d="M1 1.5 L16 11 H31" className="stroke-rose-600 dark:stroke-rose-400" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="16" y1="1" x2="16" y2="13" className="stroke-rose-700/30 dark:stroke-rose-300/30" strokeWidth="0.5" strokeDasharray="1 1.2" />
    </svg>
  );
}

function SideArrow({ qty }: { qty: string }) {
  const d = toDecimal(qty);
  if (d.isZero()) return <span className="text-muted-foreground">—</span>;
  if (d.isPositive()) {
    return (
      <span className="inline-flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-semibold tracking-wide">
        <ArrowUpRight className="h-3 w-3" /> LONG
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-rose-700 dark:text-rose-400 font-semibold tracking-wide">
      <ArrowDownRight className="h-3 w-3" /> SHORT
    </span>
  );
}

function StatusPill({ status }: { status: FoPosition['status'] }) {
  const cls =
    status === 'OPEN'
      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700/40'
      : status === 'PENDING_EXPIRY_APPROVAL'
        ? 'bg-amber-100 text-amber-700 ring-amber-200/60 dark:bg-amber-900/40 dark:text-amber-300 dark:ring-amber-700/40'
        : status === 'EXPIRED_WORTHLESS'
          ? 'bg-zinc-200 text-zinc-700 ring-zinc-300/60 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700/40'
          : 'bg-zinc-100 text-zinc-700 ring-zinc-300/60 dark:bg-zinc-800/70 dark:text-zinc-300 dark:ring-zinc-700/40';
  const label = status === 'PENDING_EXPIRY_APPROVAL' ? 'EXPIRY ?' : status;
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ring-1 ${cls}`}>
      {label}
    </span>
  );
}

function SideTagBadge({ side }: { side: 'BUY' | 'SELL' }) {
  const cls =
    side === 'BUY'
      ? 'bg-emerald-100 text-emerald-700 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700/40'
      : 'bg-rose-100 text-rose-700 ring-rose-200/60 dark:bg-rose-900/40 dark:text-rose-300 dark:ring-rose-700/40';
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ring-1 ${cls}`}>
      {side === 'BUY' ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
      {side}
    </span>
  );
}

/* ─────────────────────────── Top-level dispatcher ───────────────────────── */

function SplitFoTables({
  rows,
  closedView,
  trades,
}: {
  rows: FoPosition[];
  closedView?: boolean;
  trades: FoTrade[];
}) {
  const futures = useMemo(
    () => rows.filter((p) => p.instrumentType === 'FUTURES'),
    [rows],
  );
  const options = useMemo(
    () => rows.filter((p) => p.instrumentType === 'CALL' || p.instrumentType === 'PUT'),
    [rows],
  );

  if (rows.length === 0) {
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

  return (
    <div className="space-y-5">
      {futures.length > 0 && <FuturesLedger positions={futures} />}
      {options.length > 0 && <OptionsChain positions={options} />}
      {trades.length > 0 && <TapeSection trades={trades} limit={50} />}
    </div>
  );
}

/* ───────────────────────────── Futures Ledger ───────────────────────────── */

function FuturesLedger({ positions }: { positions: FoPosition[] }) {
  const sorted = useMemo(
    () =>
      [...positions].sort((a, b) => {
        const u = a.underlying.localeCompare(b.underlying);
        if (u !== 0) return u;
        return a.expiryDate.localeCompare(b.expiryDate);
      }),
    [positions],
  );

  const totals = useMemo(() => {
    let cost = new Decimal(0);
    let realized = new Decimal(0);
    let unrealized = new Decimal(0);
    for (const p of sorted) {
      if (p.totalCost) cost = cost.plus(toDecimal(p.totalCost));
      if (p.realizedPnl) realized = realized.plus(toDecimal(p.realizedPnl));
      if (p.unrealizedPnl) unrealized = unrealized.plus(toDecimal(p.unrealizedPnl));
    }
    return { cost, realized, unrealized, net: realized.plus(unrealized) };
  }, [sorted]);

  return (
    <Card className="overflow-hidden ring-1 ring-sky-200/70 dark:ring-sky-700/40 border-sky-100 dark:border-sky-900/40">
      {/* Header — graph-paper backdrop telegraphs the time-grid nature of futures lots */}
      <div className="relative border-b border-sky-200/70 dark:border-sky-700/40">
        <div
          className="absolute inset-0 opacity-[0.08] dark:opacity-[0.14] pointer-events-none text-sky-700 dark:text-sky-300"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, currentColor 0 1px, transparent 1px 18px), repeating-linear-gradient(0deg, currentColor 0 1px, transparent 1px 16px)',
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-sky-50/80 via-slate-50/30 to-sky-50/80 dark:from-sky-950/50 dark:via-slate-900/30 dark:to-sky-950/50">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-sky-600/10 dark:bg-sky-400/10 ring-1 ring-sky-300/60 dark:ring-sky-500/40">
              <FuturesGlyph className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-sky-800 dark:text-sky-200 font-semibold">
                Futures Ledger
              </div>
              <div className="text-[10px] uppercase tracking-wider text-sky-700/70 dark:text-sky-300/70">
                Standardized linear contracts · {sorted.length}{' '}
                {sorted.length === 1 ? 'position' : 'positions'}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <Stat label="Notional" value={fmtINR(totals.cost.abs().toString())} />
            <Stat label="Realized" value={fmtINR(totals.realized.toString())} accent={pnlClass(totals.realized.toString())} />
            <Stat label="Unrealized" value={fmtINR(totals.unrealized.toString())} accent={pnlClass(totals.unrealized.toString())} />
            <Stat label="Net P&L" value={fmtINR(totals.net.toString())} accent={pnlClass(totals.net.toString())} bold />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-sky-50/60 dark:bg-sky-950/30 border-b border-sky-200/60 dark:border-sky-800/40">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-sky-900/80 dark:text-sky-200/80">
              <th className="text-left pl-4 pr-2 py-2 font-semibold">Contract</th>
              <th className="text-left px-3 py-2 font-semibold">Side</th>
              <th className="text-left px-3 py-2 font-semibold">Expiry</th>
              <th className="text-right px-3 py-2 font-semibold">Net Qty</th>
              <th className="text-right px-3 py-2 font-semibold">Lot</th>
              <th className="text-right px-3 py-2 font-semibold">Avg Entry</th>
              <th className="text-right px-3 py-2 font-semibold">LTP</th>
              <th className="text-right px-3 py-2 font-semibold">Notional</th>
              <th className="text-right px-3 py-2 font-semibold">Realized</th>
              <th className="text-right px-3 py-2 font-semibold">Unrealized</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sorted.map((p) => {
              const qty = toDecimal(p.netQuantity);
              const long = qty.isPositive();
              const short = qty.isNegative();
              return (
                <tr
                  key={p.id}
                  className="border-t border-sky-100/70 dark:border-sky-900/40 hover:bg-sky-50/50 dark:hover:bg-sky-950/30 transition-colors"
                >
                  <td className="relative pl-4 pr-2 py-2.5">
                    <span
                      className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm ${
                        long
                          ? 'bg-emerald-500/85 dark:bg-emerald-400/80'
                          : short
                            ? 'bg-rose-500/85 dark:bg-rose-400/80'
                            : 'bg-sky-300/60'
                      }`}
                    />
                    <span className="font-semibold tracking-wide text-foreground">{p.underlying}</span>
                    <span className="ml-1.5 text-[10px] text-sky-700 dark:text-sky-300 bg-sky-100 dark:bg-sky-900/50 ring-1 ring-sky-200/60 dark:ring-sky-700/40 rounded px-1 py-0.5 font-sans uppercase tracking-wider">
                      FUT
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-sans">
                    <SideArrow qty={p.netQuantity} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground tabular-nums">{p.expiryDate}</span>
                      {(p.status === 'OPEN' || p.status === 'PENDING_EXPIRY_APPROVAL') && (
                        <ExpiryBadge iso={p.expiryDate} />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span
                      className={
                        long
                          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          : short
                            ? 'text-rose-700 dark:text-rose-400 font-semibold'
                            : ''
                      }
                    >
                      {long ? '+' : ''}
                      {p.netQuantity}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    ×{p.lotSize}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtINR(p.avgEntryPrice)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {p.mtmPrice ? (
                      fmtINR(p.mtmPrice)
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 italic text-xs font-normal">
                        awaiting LTP
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtINR(p.totalCost)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${pnlClass(p.realizedPnl)}`}>
                    {fmtINR(p.realizedPnl)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${pnlClass(p.unrealizedPnl)}`}>
                    {p.unrealizedPnl ? fmtINR(p.unrealizedPnl) : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-sans">
                    <StatusPill status={p.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ─────────────────────────── Options Chain ──────────────────────────────── */

function OptionsChain({ positions }: { positions: FoPosition[] }) {
  const sorted = useMemo(
    () =>
      [...positions].sort((a, b) => {
        const u = a.underlying.localeCompare(b.underlying);
        if (u !== 0) return u;
        const e = a.expiryDate.localeCompare(b.expiryDate);
        if (e !== 0) return e;
        const sa = Number(a.strikePrice ?? 0);
        const sb = Number(b.strikePrice ?? 0);
        return sa - sb;
      }),
    [positions],
  );

  const totals = useMemo(() => {
    let cost = new Decimal(0);
    let realized = new Decimal(0);
    let unrealized = new Decimal(0);
    let ce = 0;
    let pe = 0;
    for (const p of sorted) {
      if (p.totalCost) cost = cost.plus(toDecimal(p.totalCost));
      if (p.realizedPnl) realized = realized.plus(toDecimal(p.realizedPnl));
      if (p.unrealizedPnl) unrealized = unrealized.plus(toDecimal(p.unrealizedPnl));
      if (p.instrumentType === 'CALL') ce++;
      if (p.instrumentType === 'PUT') pe++;
    }
    return { cost, realized, unrealized, net: realized.plus(unrealized), ce, pe };
  }, [sorted]);

  return (
    <Card className="overflow-hidden ring-1 ring-violet-200/70 dark:ring-violet-700/40 border-violet-100 dark:border-violet-900/40">
      <div className="relative border-b border-violet-200/70 dark:border-violet-700/40">
        {/* Strike-grid dotted backdrop hints at the option-chain matrix */}
        <div
          className="absolute inset-0 opacity-[0.10] dark:opacity-[0.18] pointer-events-none text-violet-700 dark:text-violet-300"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 70%, currentColor 0.7px, transparent 1.5px), radial-gradient(circle at 75% 30%, currentColor 0.7px, transparent 1.5px)',
            backgroundSize: '16px 16px',
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-violet-50/80 via-amber-50/30 to-violet-50/80 dark:from-violet-950/50 dark:via-amber-950/20 dark:to-violet-950/50">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-10 rounded-md bg-violet-600/10 dark:bg-violet-400/10 ring-1 ring-violet-300/60 dark:ring-violet-500/40">
              <OptionsGlyph className="h-5 w-7" />
            </span>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-violet-800 dark:text-violet-200 font-semibold">
                Options Chain
              </div>
              <div className="text-[10px] uppercase tracking-wider text-violet-700/70 dark:text-violet-300/70 flex items-center gap-2">
                <span>Strike-indexed asymmetric payoffs</span>
                <span className="text-violet-300 dark:text-violet-700">·</span>
                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <ArrowUpRight className="h-2.5 w-2.5" /> {totals.ce} CE
                </span>
                <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400">
                  <ArrowDownRight className="h-2.5 w-2.5" /> {totals.pe} PE
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            <Stat label="Premium Outlay" value={fmtINR(totals.cost.abs().toString())} />
            <Stat label="Realized" value={fmtINR(totals.realized.toString())} accent={pnlClass(totals.realized.toString())} />
            <Stat label="Unrealized" value={fmtINR(totals.unrealized.toString())} accent={pnlClass(totals.unrealized.toString())} />
            <Stat label="Net P&L" value={fmtINR(totals.net.toString())} accent={pnlClass(totals.net.toString())} bold />
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-violet-50/60 dark:bg-violet-950/30 border-b border-violet-200/60 dark:border-violet-800/40">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-violet-900/80 dark:text-violet-200/80">
              <th className="text-left pl-4 pr-2 py-2 font-semibold">Underlying</th>
              <th className="text-left px-2 py-2 font-semibold">Type</th>
              <th className="text-right px-3 py-2 font-semibold">Strike</th>
              <th className="text-center px-2 py-2 font-semibold">Payoff</th>
              <th className="text-left px-3 py-2 font-semibold">Expiry</th>
              <th className="text-right px-3 py-2 font-semibold">Net Qty</th>
              <th className="text-right px-3 py-2 font-semibold">Lot</th>
              <th className="text-right px-3 py-2 font-semibold">Premium</th>
              <th className="text-right px-3 py-2 font-semibold">LTP</th>
              <th className="text-right px-3 py-2 font-semibold">Outlay</th>
              <th className="text-right px-3 py-2 font-semibold">Realized</th>
              <th className="text-right px-3 py-2 font-semibold">Unrealized</th>
              <th className="text-left px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sorted.map((p) => {
              const qty = toDecimal(p.netQuantity);
              const isCall = p.instrumentType === 'CALL';
              return (
                <tr
                  key={p.id}
                  className="border-t border-violet-100/70 dark:border-violet-900/40 hover:bg-violet-50/50 dark:hover:bg-violet-950/30 transition-colors"
                >
                  <td className="relative pl-4 pr-2 py-2.5">
                    <span
                      className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm ${
                        isCall
                          ? 'bg-emerald-500/85 dark:bg-emerald-400/80'
                          : 'bg-rose-500/85 dark:bg-rose-400/80'
                      }`}
                    />
                    <span className="font-semibold tracking-wide text-foreground">{p.underlying}</span>
                  </td>
                  <td className="px-2 py-2.5 font-sans">
                    <ContractTypeBadge instrumentType={p.instrumentType} />
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span className="inline-block text-xs font-semibold tabular-nums px-2 py-0.5 rounded bg-violet-100/80 dark:bg-violet-900/50 text-violet-900 dark:text-violet-100 ring-1 ring-violet-200/60 dark:ring-violet-700/40">
                      {p.strikePrice ?? '—'}
                    </span>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <PayoffCell type={isCall ? 'CALL' : 'PUT'} />
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground tabular-nums">{p.expiryDate}</span>
                      {(p.status === 'OPEN' || p.status === 'PENDING_EXPIRY_APPROVAL') && (
                        <ExpiryBadge iso={p.expiryDate} />
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    <span
                      className={
                        qty.isPositive()
                          ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                          : qty.isNegative()
                            ? 'text-rose-700 dark:text-rose-400 font-semibold'
                            : ''
                      }
                    >
                      {qty.isPositive() ? '+' : ''}
                      {p.netQuantity}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    ×{p.lotSize}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtINR(p.avgEntryPrice)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                    {p.mtmPrice ? (
                      fmtINR(p.mtmPrice)
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400 italic text-xs font-normal">
                        awaiting LTP
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtINR(p.totalCost)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${pnlClass(p.realizedPnl)}`}>
                    {fmtINR(p.realizedPnl)}
                  </td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${pnlClass(p.unrealizedPnl)}`}>
                    {p.unrealizedPnl ? fmtINR(p.unrealizedPnl) : '—'}
                  </td>
                  <td className="px-3 py-2.5 font-sans">
                    <StatusPill status={p.status} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ───────────────────────────── Trade Tape ──────────────────────────────── */

function TapeSection({ trades, limit }: { trades: FoTrade[]; limit?: number }) {
  const sorted = useMemo(() => {
    const s = [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
    return limit ? s.slice(0, limit) : s;
  }, [trades, limit]);
  return (
    <Card className="overflow-hidden ring-1 ring-amber-200/50 dark:ring-amber-700/30 border-amber-100/60 dark:border-amber-900/40">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-amber-200/60 dark:border-amber-800/40 bg-gradient-to-r from-amber-50/70 via-stone-50/40 to-amber-50/70 dark:from-amber-950/30 dark:via-stone-900/30 dark:to-amber-950/30">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-60" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-amber-600 dark:bg-amber-400" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-amber-800 dark:text-amber-300">
            Trade Tape
          </span>
          <span className="text-[10px] uppercase tracking-wider text-amber-700/70 dark:text-amber-300/70">
            {trades.length} total{limit && trades.length > limit ? ` · last ${sorted.length}` : ''}
          </span>
        </div>
        <div className="hidden md:block text-[10px] uppercase tracking-[0.3em] text-amber-700/40 dark:text-amber-300/30 font-mono">
          ── time-series ledger ──
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-amber-50/40 dark:bg-amber-950/20">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-amber-900/80 dark:text-amber-200/80">
              <th className="text-left pl-4 pr-2 py-2 font-semibold">Date</th>
              <th className="text-left px-3 py-2 font-semibold">Side</th>
              <th className="text-left px-3 py-2 font-semibold">Instrument</th>
              <th className="text-right px-3 py-2 font-semibold">Strike</th>
              <th className="text-left px-3 py-2 font-semibold">Expiry</th>
              <th className="text-right px-3 py-2 font-semibold">Qty</th>
              <th className="text-right px-3 py-2 font-semibold">Price</th>
              <th className="text-right px-3 py-2 font-semibold">Net</th>
              <th className="text-left px-3 py-2 font-semibold">Broker</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sorted.map((t, i) => (
              <tr
                key={t.id}
                className={`border-t border-amber-100/60 dark:border-amber-900/30 hover:bg-amber-50/50 dark:hover:bg-amber-950/30 transition-colors ${
                  i % 2 === 1 ? 'bg-amber-50/25 dark:bg-amber-950/15' : ''
                }`}
              >
                <td className="pl-4 pr-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                  <span className="text-amber-700/50 dark:text-amber-300/40 mr-1.5">▸</span>
                  {t.tradeDate}
                </td>
                <td className="px-3 py-2 font-sans">
                  <SideTagBadge side={t.transactionType} />
                </td>
                <td className="px-3 py-2 truncate max-w-[280px] text-xs">{t.assetName ?? '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">{t.strikePrice ?? '—'}</td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                  {t.expiryDate ?? '—'}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{t.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtINR(t.price)}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold">
                  {fmtINR(t.netAmount)}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground font-sans">
                  {t.broker ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ───────────────────── P&L statement (FY summary + rows) ────────────────── */

function PnlStatement({
  data,
}: {
  data: {
    rows: Array<{
      underlying: string;
      instrumentType: string;
      strikePrice: string | null;
      expiryDate: string;
      side: 'INTRADAY' | 'POSITIONAL';
      realizedPnl: string;
      turnover: string;
      closedTradeCount: number;
      financialYear: string;
    }>;
    summaryByFy: Record<string, { totalPnl: string; turnover: string; tradeCount: number }>;
  };
}) {
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
        {Object.entries(data.summaryByFy).map(([fy, s]) => (
          <Card
            key={fy}
            className="overflow-hidden border-t-2 border-t-accent/70 dark:border-t-accent/60"
          >
            <CardContent className="p-3">
              <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
                FY {fy}
              </div>
              <div className="text-lg font-semibold mt-1 tabular-nums">
                <span className={pnlClass(s.totalPnl)}>{fmtINR(s.totalPnl)}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1 tabular-nums">
                Turnover: {fmtINR(s.turnover)} · Trades: {s.tradeCount}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5 italic">
                Non-speculative §43(5) · ITR-3
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 dark:bg-muted/30 border-b border-border">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="text-left px-3 py-2 font-semibold">Underlying</th>
              <th className="text-left px-3 py-2 font-semibold">Type</th>
              <th className="text-right px-3 py-2 font-semibold">Strike</th>
              <th className="text-left px-3 py-2 font-semibold">Expiry</th>
              <th className="text-left px-3 py-2 font-semibold">Side</th>
              <th className="text-left px-3 py-2 font-semibold">FY</th>
              <th className="text-right px-3 py-2 font-semibold">Realized P&L</th>
              <th className="text-right px-3 py-2 font-semibold">Turnover</th>
              <th className="text-right px-3 py-2 font-semibold">Trades</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {data.rows.map((r, i) => (
              <tr key={i} className="border-t border-border hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2 font-semibold">{r.underlying}</td>
                <td className="px-3 py-2 font-sans">
                  {r.instrumentType === 'FUTURES' ? (
                    <ContractTypeBadge instrumentType="FUTURES" />
                  ) : r.instrumentType === 'CALL' ? (
                    <ContractTypeBadge instrumentType="CALL" />
                  ) : r.instrumentType === 'PUT' ? (
                    <ContractTypeBadge instrumentType="PUT" />
                  ) : (
                    <span className="text-xs text-muted-foreground">{r.instrumentType}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.strikePrice ?? '—'}</td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{r.expiryDate}</td>
                <td className="px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
                  {r.side}
                </td>
                <td className="px-3 py-2 tabular-nums">{r.financialYear}</td>
                <td className={`px-3 py-2 text-right tabular-nums font-semibold ${pnlClass(r.realizedPnl)}`}>
                  {fmtINR(r.realizedPnl)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{fmtINR(r.turnover)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.closedTradeCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Stat({
  label,
  value,
  accent,
  bold,
}: {
  label: string;
  value: string;
  accent?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex flex-col items-end leading-tight">
      <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
        {label}
      </span>
      <span
        className={`tabular-nums ${bold ? 'font-semibold text-sm' : 'font-medium'} ${accent ?? ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function LiveStatusChip({
  status,
  pending,
}: {
  status: { updated: number; total: number; at: number } | null;
  pending: boolean;
}) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!status && !pending) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-dashed px-2 py-0.5 text-[11px] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" /> waiting for first poll
      </span>
    );
  }
  if (pending && !status) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> fetching
      </span>
    );
  }
  if (!status) return null;
  const ageSec = Math.max(0, Math.floor((Date.now() - status.at) / 1000));
  const ok = status.updated > 0;
  const partial = status.updated > 0 && status.updated < status.total;
  const cls =
    ok && !partial
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300'
      : partial
        ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300'
        : 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-300';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          ok ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
        }`}
      />
      Live · {status.updated}/{status.total} · {ageSec}s ago
    </span>
  );
}

function ContractTypeBadge({ instrumentType }: { instrumentType: 'FUTURES' | 'CALL' | 'PUT' }) {
  if (instrumentType === 'FUTURES') {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-sky-100 text-sky-700 ring-1 ring-sky-200/60 dark:bg-sky-900/40 dark:text-sky-300 dark:ring-sky-700/40">
        <Layers className="h-2.5 w-2.5" /> FUT
      </span>
    );
  }
  if (instrumentType === 'CALL') {
    return (
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700/40">
        <ArrowUpRight className="h-2.5 w-2.5" /> CE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-900/40 dark:text-rose-300 dark:ring-rose-700/40">
      <ArrowDownRight className="h-2.5 w-2.5" /> PE
    </span>
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
            ? 'border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-300'
            : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300';
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
