import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  FileDown,
  BarChart3,
  Loader2,
  Mail,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ChevronRight,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import { portfoliosApi } from '@/api/portfolios.api';
import { reportsApi } from '@/api/reports.api';
import { importsApi } from '@/api/imports.api';
import { useAuthStore } from '@/stores/auth.store';
import {
  Decimal,
  toDecimal,
  IMPORT_STATUS_LABELS,
  type ImportJobDTO,
  type ImportStatus,
} from '@portfolioos/shared';

type Tab =
  | 'summary'
  | 'intraday'
  | 'stcg'
  | 'ltcg'
  | 'schedule-112a'
  | 'income'
  | 'unrealised'
  | 'xirr'
  | 'historical';

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'unrealised', label: 'Unrealised P&L' },
  { key: 'intraday', label: 'Intraday' },
  { key: 'stcg', label: 'STCG' },
  { key: 'ltcg', label: 'LTCG' },
  { key: 'schedule-112a', label: 'Schedule 112A' },
  { key: 'income', label: 'Income' },
  { key: 'xirr', label: 'XIRR' },
  { key: 'historical', label: 'Historical' },
];

function currentFy(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function fyOptions(): string[] {
  const years: string[] = [];
  const now = new Date();
  const startYear = now.getUTCMonth() + 1 >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  for (let y = startYear; y >= startYear - 7; y--) {
    years.push(`${y}-${String(y + 1).slice(2)}`);
  }
  return years;
}

// Route Money strings through Decimal before display so the en-IN grouping
// we render matches the exact value on the wire (§3.2). `Number(n)` would
// coerce "123456789.1234" via IEEE-754 and lose the last digit.
function fmt(n: string | number | null | undefined, decimals = 2): string {
  if (n == null || n === '') return '—';
  let d: Decimal;
  try {
    d = toDecimal(n);
  } catch {
    return '—';
  }
  if (!d.isFinite()) return '—';
  const fixed = d.toFixed(decimals, Decimal.ROUND_HALF_EVEN);
  const [intPart, fracPart] = fixed.split('.');
  const negative = intPart!.startsWith('-');
  const digits = negative ? intPart!.slice(1) : intPart!;
  let grouped: string;
  if (digits.length <= 3) grouped = digits;
  else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }
  const signed = negative ? '-' + grouped : grouped;
  return fracPart ? `${signed}.${fracPart}` : signed;
}

function isNonNegativeMoney(s: string | number | null | undefined): boolean {
  if (s == null || s === '') return true;
  try {
    return !toDecimal(s).isNegative();
  } catch {
    return true;
  }
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return '—';
  return `${(n * 100).toFixed(2)}%`;
}

export function ReportsPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>('summary');
  const [portfolioId, setPortfolioId] = useState<string>('');
  const [fy, setFy] = useState<string>(currentFy());

  const { data: portfolios } = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });

  useMemo(() => {
    if (!portfolioId && portfolios && portfolios.length > 0) {
      setPortfolioId(portfolios[0]!.id);
    }
  }, [portfolios, portfolioId]);

  const summaryQ = useQuery({
    queryKey: ['report-summary', portfolioId],
    queryFn: () => reportsApi.summary(portfolioId),
    enabled: tab === 'summary' && !!portfolioId,
  });
  const unrealisedQ = useQuery({
    queryKey: ['report-unrealised', portfolioId],
    queryFn: () => reportsApi.unrealised(portfolioId),
    enabled: tab === 'unrealised' && !!portfolioId,
  });
  const intradayQ = useQuery({
    queryKey: ['report-intraday', portfolioId, fy],
    queryFn: () => reportsApi.intraday(portfolioId, fy),
    enabled: tab === 'intraday' && !!portfolioId,
  });
  const stcgQ = useQuery({
    queryKey: ['report-stcg', portfolioId, fy],
    queryFn: () => reportsApi.stcg(portfolioId, fy),
    enabled: tab === 'stcg' && !!portfolioId,
  });
  const ltcgQ = useQuery({
    queryKey: ['report-ltcg', portfolioId, fy],
    queryFn: () => reportsApi.ltcg(portfolioId, fy),
    enabled: tab === 'ltcg' && !!portfolioId,
  });
  const s112Q = useQuery({
    queryKey: ['report-112a', portfolioId, fy],
    queryFn: () => reportsApi.schedule112a(portfolioId, fy),
    enabled: tab === 'schedule-112a' && !!portfolioId,
  });
  const incomeQ = useQuery({
    queryKey: ['report-income', portfolioId, fy],
    queryFn: () => reportsApi.income(portfolioId, fy),
    enabled: tab === 'income' && !!portfolioId,
  });
  const xirrQ = useQuery({
    queryKey: ['report-xirr', portfolioId],
    queryFn: () => reportsApi.xirr(portfolioId),
    enabled: tab === 'xirr' && !!portfolioId,
  });
  const histQ = useQuery({
    queryKey: ['report-historical', portfolioId],
    queryFn: () => reportsApi.historical(portfolioId, 'MONTHLY'),
    enabled: tab === 'historical' && !!portfolioId,
  });

  const downloadableEndpoint = (
    {
      intraday: 'intraday',
      stcg: 'stcg',
      ltcg: 'ltcg',
      'schedule-112a': 'schedule-112a',
      income: 'income',
      unrealised: 'unrealised',
    } as const
  )[tab as 'intraday' | 'stcg' | 'ltcg' | 'schedule-112a' | 'income' | 'unrealised'];

  const download = (format: 'xlsx' | 'pdf') => {
    if (!downloadableEndpoint || !portfolioId) return;
    const url = reportsApi.downloadUrl(downloadableEndpoint, portfolioId, format, fy);
    // Authorization header cannot be sent via window.open; fetch + save as blob
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `${downloadableEndpoint}-${fy}.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => alert(e.message ?? 'Download failed'));
  };

  const needsFy =
    tab === 'intraday' || tab === 'stcg' || tab === 'ltcg' || tab === 'schedule-112a' || tab === 'income';

  return (
    <div>
      <PageHeader
        title="Reports"
        description="Capital gains, income, XIRR and historical valuation"
      />

      <Card className="mb-4">
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[220px]">
            <Label>Portfolio</Label>
            <Select
              className="mt-1"
              value={portfolioId}
              onChange={(e) => setPortfolioId(e.target.value)}
            >
              {portfolios?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          {needsFy && (
            <div>
              <Label>Financial Year</Label>
              <Select className="mt-1" value={fy} onChange={(e) => setFy(e.target.value)}>
                {fyOptions().map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </Select>
            </div>
          )}
          {downloadableEndpoint && (
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" onClick={() => download('xlsx')}>
                <FileDown className="h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" onClick={() => download('pdf')}>
                <FileDown className="h-4 w-4" /> PDF
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-1 mb-4 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'px-3 py-2 text-sm border-b-2 transition-colors',
              tab === t.key
                ? 'border-accent text-accent font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!portfolioId ? (
        <div className="text-sm text-muted-foreground p-6 text-center">
          Select a portfolio to view reports.
        </div>
      ) : (
        <>
          {tab === 'summary' && <SummaryView data={summaryQ.data} loading={summaryQ.isLoading} />}
          {tab === 'unrealised' && (
            <UnrealisedView data={unrealisedQ.data} loading={unrealisedQ.isLoading} />
          )}
          {tab === 'intraday' && (
            <GainsView data={intradayQ.data} loading={intradayQ.isLoading} kind="Intraday" />
          )}
          {tab === 'stcg' && (
            <GainsView data={stcgQ.data} loading={stcgQ.isLoading} kind="Short-Term" />
          )}
          {tab === 'ltcg' && (
            <GainsView data={ltcgQ.data} loading={ltcgQ.isLoading} kind="Long-Term" />
          )}
          {tab === 'schedule-112a' && (
            <GainsView data={s112Q.data} loading={s112Q.isLoading} kind="Schedule 112A" />
          )}
          {tab === 'income' && <IncomeView data={incomeQ.data} loading={incomeQ.isLoading} />}
          {tab === 'xirr' && <XirrView data={xirrQ.data} loading={xirrQ.isLoading} />}
          {tab === 'historical' && (
            <HistoricalView data={histQ.data} loading={histQ.isLoading} />
          )}
        </>
      )}

      <RecentEmailImports />
    </div>
  );
}

const STATUS_STYLES: Record<ImportStatus, string> = {
  PENDING: 'bg-muted text-muted-foreground',
  PROCESSING: 'bg-blue-500/10 text-blue-600',
  COMPLETED: 'bg-positive/10 text-positive',
  COMPLETED_WITH_ERRORS: 'bg-amber-500/10 text-amber-700',
  FAILED: 'bg-negative/10 text-negative',
};
const STATUS_ICONS: Record<ImportStatus, typeof FileText> = {
  PENDING: Loader2,
  PROCESSING: Loader2,
  COMPLETED: CheckCircle2,
  COMPLETED_WITH_ERRORS: AlertTriangle,
  FAILED: XCircle,
};

function RecentEmailImports() {
  const importsQ = useQuery({
    queryKey: ['imports'],
    queryFn: () => importsApi.list(),
    staleTime: 30_000,
  });
  const emailImports = (importsQ.data ?? []).filter(
    (j: ImportJobDTO) => j.gmailMessageId !== null,
  );
  const recent = emailImports.slice(0, 8);

  return (
    <Card className="mt-6">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Mail className="h-4 w-4 text-accent" /> Recent imports from email
        </CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/import">
            View all <ChevronRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {importsQ.isLoading ? (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" /> Loading…
          </div>
        ) : recent.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            Nothing yet. Once you connect Gmail and approve senders, imported statements
            land here automatically.
          </div>
        ) : (
          <ul className="divide-y">
            {recent.map((j) => {
              const status = j.status as ImportStatus;
              const Icon = STATUS_ICONS[status];
              const isRunning = status === 'PENDING' || status === 'PROCESSING';
              return (
                <li
                  key={j.id}
                  className="flex items-center gap-3 px-4 py-2 text-sm hover:bg-muted/30"
                >
                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate font-medium">{j.fileName}</span>
                  {j.broker && (
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      {j.broker}
                    </span>
                  )}
                  <span
                    className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
                  >
                    <Icon className={`h-3 w-3 ${isRunning ? 'animate-spin' : ''}`} />
                    {IMPORT_STATUS_LABELS[status]}
                  </span>
                  {!isRunning && j.totalRows != null && (
                    <span className="text-xs text-muted-foreground tabular-nums hidden md:inline">
                      {j.successRows ?? 0}/{j.totalRows} rows
                    </span>
                  )}
                  {j.gmailMessageId && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${j.gmailMessageId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-accent hover:underline"
                      title="Open in Gmail"
                    >
                      <Mail className="h-3 w-3" />
                    </a>
                  )}
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {new Date(j.createdAt).toLocaleDateString()}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground p-8 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function SummaryView({ data, loading }: { data: ReturnType<typeof reportsApi.summary> extends Promise<infer T> ? T | undefined : never; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return null;
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Portfolio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="text-lg font-semibold">{data.portfolio.name}</div>
          <div className="text-xs text-muted-foreground">
            Currency {data.portfolio.currency} · {data.counts.transactions} tx ·{' '}
            {data.counts.holdings} holdings
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Unrealised</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>Invested: ₹{fmt(data.unrealised.totalCost)}</div>
          <div>Value: ₹{fmt(data.unrealised.totalValue)}</div>
          <div
            className={
              isNonNegativeMoney(data.unrealised.unrealisedPnL)
                ? 'text-positive'
                : 'text-negative'
            }
          >
            P&L: ₹{fmt(data.unrealised.unrealisedPnL)}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">XIRR</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>Overall: {fmtPct(data.xirr.overall)}</div>
          <div>1Y: {fmtPct(data.xirr.oneYear)}</div>
          <div>3Y: {fmtPct(data.xirr.threeYear)}</div>
          <div>5Y: {fmtPct(data.xirr.fiveYear)}</div>
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Capital Gains by Financial Year
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-2">FY</th>
                  <th className="text-right p-2">Intraday</th>
                  <th className="text-right p-2">STCG</th>
                  <th className="text-right p-2">LTCG</th>
                  <th className="text-right p-2">Taxable</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.capitalGainsByFy)
                  .sort(([a], [b]) => (a < b ? 1 : -1))
                  .map(([k, v]) => (
                    <tr key={k} className="border-b">
                      <td className="p-2 font-medium">{k}</td>
                      <td className="p-2 text-right">₹{fmt(v.intraday)}</td>
                      <td className="p-2 text-right">₹{fmt(v.stcg)}</td>
                      <td className="p-2 text-right">₹{fmt(v.ltcg)}</td>
                      <td className="p-2 text-right">₹{fmt(v.taxable)}</td>
                    </tr>
                  ))}
                {Object.keys(data.capitalGainsByFy).length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      No realised gains yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function UnrealisedView({
  data,
  loading,
}: {
  data: ReturnType<typeof reportsApi.unrealised> extends Promise<infer T> ? T | undefined : never;
  loading: boolean;
}) {
  if (loading) return <Loading />;
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {data.count} holdings · Invested ₹{fmt(data.totalCost)} · Value ₹
          {fmt(data.totalValue)} · P&L{' '}
          <span
            className={
              isNonNegativeMoney(data.unrealisedPnL) ? 'text-positive' : 'text-negative'
            }
          >
            ₹{fmt(data.unrealisedPnL)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2">Asset</th>
                <th className="text-left p-2">Class</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Avg</th>
                <th className="text-right p-2">CMP</th>
                <th className="text-right p-2">Invested</th>
                <th className="text-right p-2">Value</th>
                <th className="text-right p-2">P&L</th>
                <th className="text-right p-2">%</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.assetName ?? r.isin ?? '—'}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.assetClass}</td>
                  <td className="p-2 text-right">{fmt(r.quantity, 4)}</td>
                  <td className="p-2 text-right">{fmt(r.avgCostPrice)}</td>
                  <td className="p-2 text-right">{fmt(r.currentPrice)}</td>
                  <td className="p-2 text-right">{fmt(r.totalCost)}</td>
                  <td className="p-2 text-right">{fmt(r.currentValue)}</td>
                  <td
                    className={cn(
                      'p-2 text-right',
                      isNonNegativeMoney(r.unrealisedPnL) ? 'text-positive' : 'text-negative',
                    )}
                  >
                    {fmt(r.unrealisedPnL)}
                  </td>
                  <td className="p-2 text-right">{r.pctReturn}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

interface GainsData {
  rows: Array<{
    assetName: string;
    isin: string | null;
    buyDate: string;
    sellDate: string;
    quantity: string;
    buyPrice: string;
    sellPrice: string;
    buyAmount: string;
    sellAmount: string;
    gainLoss: string;
    taxableGain: string;
    financialYear: string;
  }>;
  totalGain: string;
  taxable?: string;
  exemptionLimit?: string;
  count: number;
}

function GainsView({
  data,
  loading,
  kind,
}: {
  data: GainsData | undefined;
  loading: boolean;
  kind: string;
}) {
  if (loading) return <Loading />;
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          {kind} · {data.count} rows · Total ₹{fmt(data.totalGain)}
          {data.exemptionLimit && <span> · Exemption ₹{fmt(data.exemptionLimit)}</span>}
          {data.taxable && <span> · Taxable ₹{fmt(data.taxable)}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2">Asset</th>
                <th className="text-left p-2">Buy Date</th>
                <th className="text-left p-2">Sell Date</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Buy ₹</th>
                <th className="text-right p-2">Sell ₹</th>
                <th className="text-right p-2">Cost</th>
                <th className="text-right p-2">Proceeds</th>
                <th className="text-right p-2">Gain/Loss</th>
                <th className="text-right p-2">Taxable</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2">{r.assetName || r.isin || '—'}</td>
                  <td className="p-2">{r.buyDate.slice(0, 10)}</td>
                  <td className="p-2">{r.sellDate.slice(0, 10)}</td>
                  <td className="p-2 text-right">{fmt(r.quantity, 4)}</td>
                  <td className="p-2 text-right">{fmt(r.buyPrice)}</td>
                  <td className="p-2 text-right">{fmt(r.sellPrice)}</td>
                  <td className="p-2 text-right">{fmt(r.buyAmount)}</td>
                  <td className="p-2 text-right">{fmt(r.sellAmount)}</td>
                  <td
                    className={cn(
                      'p-2 text-right',
                      isNonNegativeMoney(r.gainLoss) ? 'text-positive' : 'text-negative',
                    )}
                  >
                    {fmt(r.gainLoss)}
                  </td>
                  <td className="p-2 text-right">{fmt(r.taxableGain)}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="p-6 text-center text-muted-foreground">
                    No records for selected FY.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function IncomeView({
  data,
  loading,
}: {
  data: ReturnType<typeof reportsApi.income> extends Promise<infer T> ? T | undefined : never;
  loading: boolean;
}) {
  if (loading) return <Loading />;
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Dividends ₹{fmt(data.dividend)} · Interest ₹{fmt(data.interest)} · Maturity ₹
          {fmt(data.maturity)} · Total ₹{fmt(data.total)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Asset</th>
                <th className="text-right p-2">Amount</th>
                <th className="text-left p-2">Narration</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="p-2">{r.date.slice(0, 10)}</td>
                  <td className="p-2 text-xs">{r.type}</td>
                  <td className="p-2">{r.assetName}</td>
                  <td className="p-2 text-right">{fmt(r.amount)}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.narration ?? ''}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">
                    No income this FY.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function XirrView({
  data,
  loading,
}: {
  data: ReturnType<typeof reportsApi.xirr> extends Promise<infer T> ? T | undefined : never;
  loading: boolean;
}) {
  if (loading) return <Loading />;
  if (!data) return null;
  const rows = [
    { label: 'Overall', b: data.overall },
    { label: '1 Year', b: data.oneYear },
    { label: '3 Year', b: data.threeYear },
    { label: '5 Year', b: data.fiveYear },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Annualized Returns (XIRR)</CardTitle>
      </CardHeader>
      <CardContent>
        <table className="text-sm w-full">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="text-left p-2">Window</th>
              <th className="text-right p-2">XIRR</th>
              <th className="text-right p-2">Invested</th>
              <th className="text-right p-2">Terminal Value</th>
              <th className="text-right p-2">Cashflows</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b">
                <td className="p-2">{r.label}</td>
                <td className="p-2 text-right font-medium">{fmtPct(r.b.xirr)}</td>
                <td className="p-2 text-right">₹{fmt(r.b.totalInvested)}</td>
                <td className="p-2 text-right">₹{fmt(r.b.terminalValue)}</td>
                <td className="p-2 text-right">{r.b.cashflowCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function HistoricalView({
  data,
  loading,
}: {
  data: ReturnType<typeof reportsApi.historical> extends Promise<infer T> ? T | undefined : never;
  loading: boolean;
}) {
  if (loading) return <Loading />;
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Monthly valuation history · {data.points.length} points</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2">Month-end</th>
                <th className="text-right p-2">Cost</th>
                <th className="text-right p-2">Value</th>
                <th className="text-right p-2">Holdings</th>
              </tr>
            </thead>
            <tbody>
              {data.points.map((p) => (
                <tr key={p.date} className="border-b">
                  <td className="p-2">{p.date.slice(0, 10)}</td>
                  <td className="p-2 text-right">{fmt(p.cost)}</td>
                  <td className="p-2 text-right">{fmt(p.value)}</td>
                  <td className="p-2 text-right">{p.holdings}</td>
                </tr>
              ))}
              {data.points.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-6 text-center text-muted-foreground">
                    Not enough transaction history.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
