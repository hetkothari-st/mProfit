import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
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
  ChevronDown,
  ChevronRight,
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
    missedKeys: string[];
    sampleHits: Array<{ assetKey: string; ltp: number }>;
  } | null>(null);

  const liveRefreshMut = useMutation({
    mutationFn: () => foApi.refreshLive(portfolioId),
    onSuccess: (r) => {
      setLiveStatus({
        updated: r.updated,
        total: r.total,
        at: Date.now(),
        missedKeys: r.missedKeys ?? [],
        sampleHits: r.sampleHits ?? [],
      });
      queryClient.invalidateQueries({ queryKey: ['fo', 'positions'] });
      queryClient.invalidateQueries({ queryKey: ['fo', 'summary'] });
    },
    onError: (err) => {
      toast.error(apiErrorMessage(err, 'Live refresh failed'));
    },
  });

  // Once per page lifetime tell the user when nothing matches — typical when
  // NSE blocks the host or every assetKey shape diverges.
  const reportedZeroRef = useRef(false);
  useEffect(() => {
    if (!liveStatus) return;
    if (liveStatus.total > 0 && liveStatus.updated === 0 && !reportedZeroRef.current) {
      reportedZeroRef.current = true;
      const hint =
        liveStatus.sampleHits.length === 0
          ? 'NSE returned no live data — check API logs (host may be IP-blocked, or markets are closed).'
          : 'AssetKey shape mismatch — open API logs to see missed keys.';
      toast(`Live feed: 0/${liveStatus.total} matched. ${hint}`, { duration: 8000 });
    }
  }, [liveStatus]);

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
  // Stacked lots on a baseline — depicts standardized linear contracts.
  // Theme-tone fills so the glyph reads as part of the editorial palette
  // rather than a candy-bright accent.
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="2" y="6" width="3.5" height="11" className="fill-accent/45 dark:fill-accent/40" />
      <rect x="7.25" y="3" width="3.5" height="14" className="fill-accent/70 dark:fill-accent/65" />
      <rect x="12.5" y="9" width="3.5" height="8" className="fill-accent/45 dark:fill-accent/40" />
      <rect x="17.75" y="5" width="3.5" height="12" className="fill-accent/85 dark:fill-accent/80" />
      <line x1="1.5" y1="18.5" x2="22.5" y2="18.5" className="stroke-foreground/60" strokeWidth="0.7" />
      <line x1="1.5" y1="20.5" x2="22.5" y2="20.5" className="stroke-foreground/25" strokeWidth="0.4" />
    </svg>
  );
}

function OptionsGlyph({ className = '' }: { className?: string }) {
  // Strike-chain matrix — CE bars (left) + PE bars (right) flanking a strike
  // axis. Mirrors the layout of an actual broker option-chain table so the
  // glyph telegraphs "this is an option chain" at a glance.
  return (
    <svg className={className} viewBox="0 0 26 18" fill="none" aria-hidden>
      <line
        x1="13"
        y1="1"
        x2="13"
        y2="17"
        className="stroke-foreground/50 dark:stroke-foreground/55"
        strokeWidth="0.7"
        strokeDasharray="1.4 1"
      />
      <rect x="2" y="2.5" width="8" height="2.8" rx="0.4" className="fill-emerald-600/65 dark:fill-emerald-400/70" />
      <rect x="16" y="2.5" width="8" height="2.8" rx="0.4" className="fill-rose-600/65 dark:fill-rose-400/70" />
      <rect x="2" y="7.5" width="8" height="2.8" rx="0.4" className="fill-emerald-600/85 dark:fill-emerald-400/90" />
      <rect x="16" y="7.5" width="8" height="2.8" rx="0.4" className="fill-rose-600/85 dark:fill-rose-400/90" />
      <rect x="2" y="12.5" width="8" height="2.8" rx="0.4" className="fill-emerald-600/50 dark:fill-emerald-400/55" />
      <rect x="16" y="12.5" width="8" height="2.8" rx="0.4" className="fill-rose-600/50 dark:fill-rose-400/55" />
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
      {futures.length > 0 && <FuturesLedger positions={futures} trades={trades} />}
      {options.length > 0 && <OptionsChain positions={options} trades={trades} />}
      {trades.length > 0 && <TapeSection trades={trades} limit={50} />}
    </div>
  );
}

/**
 * Match every trade in `all` that belongs to the same contract as `p`.
 * Futures: same underlying + expiry, no strike, no optionType.
 * Options: same underlying + expiry + strike + Call/Put.
 */
function tradesForPosition(p: FoPosition, all: FoTrade[]): FoTrade[] {
  return all.filter((t) => {
    const u = tradeUnderlyingOf(t);
    if (u !== p.underlying) return false;
    if ((t.expiryDate ?? '') !== p.expiryDate) return false;
    if (p.instrumentType === 'FUTURES') {
      return !t.strikePrice && !t.optionType;
    }
    const tStrike = t.strikePrice ? Number(t.strikePrice) : 0;
    const pStrike = p.strikePrice ? Number(p.strikePrice) : 0;
    if (tStrike !== pStrike) return false;
    const tType = t.optionType === 'PUT' ? 'PUT' : 'CALL';
    return tType === p.instrumentType;
  });
}

/** Compact trades table rendered inside an expanded contract row. */
function ContractTrades({ trades }: { trades: FoTrade[] }) {
  if (trades.length === 0) {
    return (
      <div className="text-xs text-muted-foreground italic py-2">
        No transactions on file for this contract.
      </div>
    );
  }
  const sorted = [...trades].sort((a, b) => b.tradeDate.localeCompare(a.tradeDate));
  return (
    <div className="overflow-x-auto rounded border border-border bg-background/60">
      <table className="w-full text-xs">
        <thead className="bg-muted/40">
          <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <th className="text-left px-2.5 py-1.5 font-semibold">Date</th>
            <th className="text-left px-2.5 py-1.5 font-semibold">Side</th>
            <th className="text-right px-2.5 py-1.5 font-semibold">Qty</th>
            <th className="text-right px-2.5 py-1.5 font-semibold">Price</th>
            <th className="text-right px-2.5 py-1.5 font-semibold">Net</th>
            <th className="text-left px-2.5 py-1.5 font-semibold">Broker</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr key={t.id} className="border-t border-border/60">
              <td className="px-2.5 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums">{t.tradeDate}</td>
              <td className="px-2.5 py-1.5">
                <span
                  className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    t.transactionType === 'BUY'
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                      : 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                  }`}
                >
                  {t.transactionType}
                </span>
              </td>
              <td className="px-2.5 py-1.5 text-right tabular-nums">{t.quantity}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums">{fmtINR(t.price)}</td>
              <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">{fmtINR(t.netAmount)}</td>
              <td className="px-2.5 py-1.5 text-xs text-muted-foreground">{t.broker ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ───────────────────── Per-underlying expandable activity ────────────────
   Drill-down per underlying. Each card is a tappable summary; expanding it
   reveals every transaction we have on file for that underlying. Position
   details already live in the Futures Ledger / Options Chain above, so the
   body here intentionally focuses on the *transactions* the user wanted
   back. */

interface UnderlyingActivityGroup {
  underlying: string;
  positions: FoPosition[];
  trades: FoTrade[];
  futCount: number;
  ceCount: number;
  peCount: number;
  openCount: number;
  closedCount: number;
  totalCost: Decimal;
  realizedPnl: Decimal;
  unrealizedPnl: Decimal;
}

/** Extract the underlying ticker from a trade's full instrument string.
 *  Handles both spaced ("NIFTY 25000 CE 28-APR-2026") and concatenated
 *  ("NIFTY27NOV2525500CE") forms by grabbing the leading run of letters. */
function tradeUnderlyingOf(t: FoTrade): string {
  const name = (t.assetName ?? '').trim();
  if (!name) return 'UNKNOWN';
  const m = name.match(/^([A-Za-z]+)/);
  const head = m?.[1] ?? name.split(/\s+/)[0] ?? 'UNKNOWN';
  return head.toUpperCase();
}

function groupUnderlyings(
  positions: FoPosition[],
  trades: FoTrade[],
): UnderlyingActivityGroup[] {
  const map = new Map<string, UnderlyingActivityGroup>();
  function ensure(u: string): UnderlyingActivityGroup {
    let g = map.get(u);
    if (!g) {
      g = {
        underlying: u,
        positions: [],
        trades: [],
        futCount: 0,
        ceCount: 0,
        peCount: 0,
        openCount: 0,
        closedCount: 0,
        totalCost: new Decimal(0),
        realizedPnl: new Decimal(0),
        unrealizedPnl: new Decimal(0),
      };
      map.set(u, g);
    }
    return g;
  }
  for (const p of positions) {
    const g = ensure(p.underlying);
    g.positions.push(p);
    if (p.totalCost) g.totalCost = g.totalCost.plus(toDecimal(p.totalCost));
    if (p.realizedPnl) g.realizedPnl = g.realizedPnl.plus(toDecimal(p.realizedPnl));
    if (p.unrealizedPnl) g.unrealizedPnl = g.unrealizedPnl.plus(toDecimal(p.unrealizedPnl));
    if (p.instrumentType === 'FUTURES') g.futCount++;
    else if (p.instrumentType === 'CALL') g.ceCount++;
    else if (p.instrumentType === 'PUT') g.peCount++;
    if (p.status === 'OPEN' || p.status === 'PENDING_EXPIRY_APPROVAL') g.openCount++;
    else g.closedCount++;
  }
  for (const t of trades) {
    const g = ensure(tradeUnderlyingOf(t));
    g.trades.push(t);
  }
  return [...map.values()].sort((a, b) => {
    const e = b.totalCost.abs().comparedTo(a.totalCost.abs());
    if (e !== 0) return e;
    return b.openCount - a.openCount;
  });
}

function UnderlyingActivity({
  positions,
  trades,
}: {
  positions: FoPosition[];
  trades: FoTrade[];
}) {
  const groups = useMemo(() => groupUnderlyings(positions, trades), [positions, trades]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (groups.length === 0) return null;

  function toggle(u: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
  }

  return (
    <Card className="overflow-hidden border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-gradient-to-r from-muted/40 via-card to-muted/40 dark:from-muted/30 dark:via-card dark:to-muted/30">
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-accent">
            Underlying Activity
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {groups.length} {groups.length === 1 ? 'underlying' : 'underlyings'} · click to expand
          </span>
        </div>
      </div>
      <div className="divide-y divide-border">
        {groups.map((g) => (
          <UnderlyingRow
            key={g.underlying}
            group={g}
            isOpen={expanded.has(g.underlying)}
            onToggle={() => toggle(g.underlying)}
          />
        ))}
      </div>
    </Card>
  );
}

function UnderlyingRow({
  group,
  isOpen,
  onToggle,
}: {
  group: UnderlyingActivityGroup;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const netPnl = group.realizedPnl.plus(group.unrealizedPnl);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </span>
          <span className="font-semibold tracking-wide text-foreground">{group.underlying}</span>
          <div className="flex items-center gap-1 flex-wrap">
            {group.futCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-foreground/80 ring-1 ring-border">
                <Layers className="h-2.5 w-2.5" /> FUT × {group.futCount}
              </span>
            )}
            {group.ceCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/60 dark:bg-emerald-900/40 dark:text-emerald-300 dark:ring-emerald-700/40">
                <ArrowUpRight className="h-2.5 w-2.5" /> CE × {group.ceCount}
              </span>
            )}
            {group.peCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 ring-1 ring-rose-200/60 dark:bg-rose-900/40 dark:text-rose-300 dark:ring-rose-700/40">
                <ArrowDownRight className="h-2.5 w-2.5" /> PE × {group.peCount}
              </span>
            )}
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <span className="text-emerald-700 dark:text-emerald-400 font-medium">{group.openCount} open</span>
            {group.closedCount > 0 && <> · {group.closedCount} closed</>}
            {group.trades.length > 0 && <> · {group.trades.length} txns</>}
          </span>
        </div>
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-xs">
          <Stat label="Exposure" value={fmtINR(group.totalCost.abs().toString())} />
          <Stat label="Realized" value={fmtINR(group.realizedPnl.toString())} accent={pnlClass(group.realizedPnl.toString())} />
          <Stat label="Unrealized" value={fmtINR(group.unrealizedPnl.toString())} accent={pnlClass(group.unrealizedPnl.toString())} />
          <Stat label="Net P&L" value={fmtINR(netPnl.toString())} accent={pnlClass(netPnl.toString())} bold />
        </div>
      </button>
      {isOpen && (
        <div className="bg-muted/20 dark:bg-muted/10 border-t border-border px-4 py-3">
          <UnderlyingTrades trades={group.trades} />
        </div>
      )}
    </div>
  );
}

function UnderlyingTrades({ trades }: { trades: FoTrade[] }) {
  if (trades.length === 0) {
    return (
      <div>
        <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-1.5">
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
      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
        Transactions ({trades.length})
      </div>
      <div className="overflow-x-auto rounded border border-border bg-card">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 dark:bg-muted/20">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="text-left pl-3 pr-2 py-1.5 font-semibold">Date</th>
              <th className="text-left px-2 py-1.5 font-semibold">Side</th>
              <th className="text-left px-2 py-1.5 font-semibold">Instrument</th>
              <th className="text-right px-2 py-1.5 font-semibold">Strike</th>
              <th className="text-left px-2 py-1.5 font-semibold">Expiry</th>
              <th className="text-right px-2 py-1.5 font-semibold">Qty</th>
              <th className="text-right px-2 py-1.5 font-semibold">Price</th>
              <th className="text-right px-2 py-1.5 font-semibold">Net</th>
              <th className="text-left px-2 py-1.5 font-semibold">Broker</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {sorted.map((t) => (
              <tr
                key={t.id}
                className="border-t border-border/70 hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors"
              >
                <td className="pl-3 pr-2 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
                  <span className="text-accent/60 mr-1.5">▸</span>
                  {t.tradeDate}
                </td>
                <td className="px-2 py-1.5 font-sans">
                  <SideTagBadge side={t.transactionType} />
                </td>
                <td className="px-2 py-1.5 truncate max-w-[260px] text-[11px]">{t.assetName ?? '—'}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{t.strikePrice ?? '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground tabular-nums">
                  {t.expiryDate ?? '—'}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{t.quantity}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{fmtINR(t.price)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums font-semibold">
                  {fmtINR(t.netAmount)}
                </td>
                <td className="px-2 py-1.5 text-[11px] text-muted-foreground font-sans">
                  {t.broker ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ───────────────────────────── Futures Ledger ───────────────────────────── */

function FuturesLedger({
  positions,
  trades,
}: {
  positions: FoPosition[];
  trades: FoTrade[];
}) {
  const sorted = useMemo(
    () =>
      [...positions].sort((a, b) => {
        const u = a.underlying.localeCompare(b.underlying);
        if (u !== 0) return u;
        return a.expiryDate.localeCompare(b.expiryDate);
      }),
    [positions],
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
    <Card className="overflow-hidden border-border">
      {/* Header chrome mirrors Options Chain — same dot backdrop in foreground
          tone — so the two cards read as a matched pair. The depictive
          element for futures lives in the FuturesGlyph icon. */}
      <div className="relative border-b border-border">
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.10] pointer-events-none text-foreground"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 70%, currentColor 0.7px, transparent 1.5px), radial-gradient(circle at 75% 30%, currentColor 0.7px, transparent 1.5px)',
            backgroundSize: '16px 16px',
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-muted/40 via-card to-muted/40 dark:from-muted/30 dark:via-card dark:to-muted/30">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-10 rounded-md bg-accent/10 dark:bg-accent/15 ring-1 ring-accent/30 dark:ring-accent/40">
              <FuturesGlyph className="h-5 w-5" />
            </span>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-accent font-semibold">
                Futures Ledger
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
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
          <thead className="bg-muted/40 dark:bg-muted/20 border-b border-border">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="w-7 pl-3 pr-2 py-2"></th>
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
              const isOpen = expanded.has(p.id);
              const tradesForThis = tradesForPosition(p, trades);
              return (
                <Fragment key={p.id}>
                <tr
                  className={`border-t border-border/70 hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors cursor-pointer ${isOpen ? 'bg-muted/30 dark:bg-muted/15' : ''}`}
                  onClick={() => toggle(p.id)}
                >
                  <td className="pl-3 pr-2 py-2.5 text-muted-foreground w-7">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </td>
                  <td className="relative pl-4 pr-2 py-2.5">
                    <span
                      className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-sm ${
                        long
                          ? 'bg-emerald-500/85 dark:bg-emerald-400/80'
                          : short
                            ? 'bg-rose-500/85 dark:bg-rose-400/80'
                            : 'bg-border'
                      }`}
                    />
                    <span className="font-semibold tracking-wide text-foreground">{p.underlying}</span>
                    <span className="ml-1.5 text-[10px] text-foreground/80 bg-muted ring-1 ring-border rounded px-1 py-0.5 font-sans uppercase tracking-wider">
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
                {isOpen && (
                  <tr className="bg-muted/15 dark:bg-muted/10">
                    <td colSpan={12} className="px-4 py-3 font-sans">
                      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
                        Transactions ({tradesForThis.length})
                      </div>
                      <ContractTrades trades={tradesForThis} />
                    </td>
                  </tr>
                )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ─────────────────────────── Options Chain ──────────────────────────────── */

function OptionsChain({
  positions,
  trades,
}: {
  positions: FoPosition[];
  trades: FoTrade[];
}) {
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

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card className="overflow-hidden border-border">
      <div className="relative border-b border-border">
        {/* Strike-grid dotted backdrop in foreground tone — hints at the option-chain matrix */}
        <div
          className="absolute inset-0 opacity-[0.06] dark:opacity-[0.10] pointer-events-none text-foreground"
          style={{
            backgroundImage:
              'radial-gradient(circle at 25% 70%, currentColor 0.7px, transparent 1.5px), radial-gradient(circle at 75% 30%, currentColor 0.7px, transparent 1.5px)',
            backgroundSize: '16px 16px',
          }}
        />
        <div className="relative flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-gradient-to-r from-muted/40 via-card to-muted/40 dark:from-muted/30 dark:via-card dark:to-muted/30">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center justify-center h-9 w-10 rounded-md bg-accent/10 dark:bg-accent/15 ring-1 ring-accent/30 dark:ring-accent/40">
              <OptionsGlyph className="h-5 w-7" />
            </span>
            <div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-accent font-semibold">
                Options Chain
              </div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <span>Strike-indexed asymmetric payoffs</span>
                <span className="text-muted-foreground/40">·</span>
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
          <thead className="bg-muted/40 dark:bg-muted/20 border-b border-border">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <th className="w-7 pl-3 pr-2 py-2"></th>
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
              const isOpen = expanded.has(p.id);
              const tradesForThis = tradesForPosition(p, trades);
              return (
                <Fragment key={p.id}>
                <tr
                  className={`border-t border-border/70 hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors cursor-pointer ${isOpen ? 'bg-muted/30 dark:bg-muted/15' : ''}`}
                  onClick={() => toggle(p.id)}
                >
                  <td className="pl-3 pr-2 py-2.5 text-muted-foreground w-7">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </td>
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
                    <span className="inline-block text-xs font-semibold tabular-nums px-2 py-0.5 rounded bg-muted text-foreground ring-1 ring-border">
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
                {isOpen && (
                  <tr className="bg-muted/15 dark:bg-muted/10">
                    <td colSpan={14} className="px-4 py-3 font-sans">
                      <div className="text-[10px] uppercase tracking-[0.16em] font-semibold text-muted-foreground mb-2">
                        Transactions ({tradesForThis.length})
                      </div>
                      <ContractTrades trades={tradesForThis} />
                    </td>
                  </tr>
                )}
                </Fragment>
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
    <Card className="overflow-hidden border-border">
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 border-b border-border bg-gradient-to-r from-muted/40 via-card to-muted/40 dark:from-muted/30 dark:via-card dark:to-muted/30">
        <div className="flex items-center gap-2">
          <span className="relative inline-flex h-2.5 w-2.5">
            <span className="absolute inset-0 rounded-full bg-emerald-500 animate-ping opacity-60" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
          </span>
          <span className="text-[11px] uppercase tracking-[0.2em] font-semibold text-accent">
            Trade Tape
          </span>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {trades.length} total{limit && trades.length > limit ? ` · last ${sorted.length}` : ''}
          </span>
        </div>
        <div className="hidden md:block text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50 font-mono">
          ── time-series ledger ──
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 dark:bg-muted/20">
            <tr className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
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
                className={`border-t border-border/70 hover:bg-muted/40 dark:hover:bg-muted/20 transition-colors ${
                  i % 2 === 1 ? 'bg-muted/20 dark:bg-muted/10' : ''
                }`}
              >
                <td className="pl-4 pr-2 py-2 whitespace-nowrap text-muted-foreground tabular-nums">
                  <span className="text-accent/60 mr-1.5">▸</span>
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
      <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold bg-muted text-foreground/80 ring-1 ring-border">
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
