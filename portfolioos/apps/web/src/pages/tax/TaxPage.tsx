import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileDown, Loader2, Info } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth.store';
import { Decimal, toDecimal } from '@portfolioos/shared';
import {
  taxApi,
  type TaxGainsReport,
  type TaxIncomeReport,
  type Schedule43Report,
  type TaxHarvestReport,
  type TaxSummary,
} from '@/api/tax.api';

type Tab =
  | 'summary'
  | 'schedule-112a'
  | 'schedule-112'
  | 'stcg'
  | 'ltcg'
  | 'intraday'
  | 'fno'
  | 'income'
  | 'harvest';

const TABS: { key: Tab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'schedule-112a', label: 'Schedule 112A' },
  { key: 'schedule-112', label: 'Schedule 112' },
  { key: 'stcg', label: 'STCG' },
  { key: 'ltcg', label: 'LTCG' },
  { key: 'intraday', label: 'Intraday' },
  { key: 'fno', label: 'F&O (Sec. 43(5))' },
  { key: 'income', label: 'Dividend & Interest' },
  { key: 'harvest', label: 'Tax Harvest' },
];

function currentFy(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String(start + 1).slice(2)}`;
}

function fyOptionsFallback(): string[] {
  const years: string[] = [];
  const now = new Date();
  const startYear = now.getUTCMonth() + 1 >= 4 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  for (let y = startYear; y >= startYear - 7; y--) {
    years.push(`${y}-${String(y + 1).slice(2)}`);
  }
  return years;
}

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

export function TaxPage() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [tab, setTab] = useState<Tab>('summary');
  const [fy, setFy] = useState<string>('');

  const availableFysQ = useQuery({
    queryKey: ['tax-available-fys'],
    queryFn: () => taxApi.availableFys(),
    staleTime: 60_000,
  });

  // Pick the latest FY that has actual data; fall back to the current FY.
  // Without this the dropdown defaults to today's FY and shows ₹0 across
  // the board if the user's last transactions were in a prior FY.
  useEffect(() => {
    if (fy) return;
    const fromApi = availableFysQ.data?.fys ?? [];
    if (fromApi.length > 0) setFy(fromApi[0]!);
    else if (availableFysQ.isFetched) setFy(currentFy());
  }, [availableFysQ.data, availableFysQ.isFetched, fy]);

  const fyOptions = useMemo<string[]>(() => {
    const fromApi = availableFysQ.data?.fys ?? [];
    if (fromApi.length > 0) return fromApi;
    return fyOptionsFallback();
  }, [availableFysQ.data]);

  const summaryQ = useQuery({
    queryKey: ['tax-summary', fy],
    queryFn: () => taxApi.summary(fy),
    enabled: tab === 'summary' && !!fy,
  });
  const s112AQ = useQuery({
    queryKey: ['tax-112a', fy],
    queryFn: () => taxApi.schedule112A(fy),
    enabled: tab === 'schedule-112a' && !!fy,
  });
  const s112Q = useQuery({
    queryKey: ['tax-112', fy],
    queryFn: () => taxApi.schedule112(fy),
    enabled: tab === 'schedule-112' && !!fy,
  });
  const stcgQ = useQuery({
    queryKey: ['tax-stcg', fy],
    queryFn: () => taxApi.stcg(fy),
    enabled: tab === 'stcg' && !!fy,
  });
  const ltcgQ = useQuery({
    queryKey: ['tax-ltcg', fy],
    queryFn: () => taxApi.ltcg(fy),
    enabled: tab === 'ltcg' && !!fy,
  });
  const intradayQ = useQuery({
    queryKey: ['tax-intraday', fy],
    queryFn: () => taxApi.intraday(fy),
    enabled: tab === 'intraday' && !!fy,
  });
  const fnoQ = useQuery({
    queryKey: ['tax-fno', fy],
    queryFn: () => taxApi.schedule43(fy),
    enabled: tab === 'fno' && !!fy,
  });
  const incomeQ = useQuery({
    queryKey: ['tax-income', fy],
    queryFn: () => taxApi.income(fy),
    enabled: tab === 'income' && !!fy,
  });
  const harvestQ = useQuery({
    queryKey: ['tax-harvest', fy],
    queryFn: () => taxApi.harvest(fy),
    enabled: tab === 'harvest' && !!fy,
  });

  const downloadCsv = () => {
    const url = taxApi.schedule112ACsvUrl(fy);
    fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        const blob = await r.blob();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `schedule-112a-${fy}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      })
      .catch((e) => alert(e.message ?? 'Download failed'));
  };

  return (
    <div>
      <PageHeader
        title="Tax Reports"
        description="ITR-aligned capital gains, business income and tax-harvesting across all portfolios"
      />

      <Card className="mb-4">
        <CardContent className="pt-4 flex flex-wrap items-end gap-3">
          <div>
            <Label>Financial Year</Label>
            <Select className="mt-1" value={fy} onChange={(e) => setFy(e.target.value)}>
              {fyOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </Select>
          </div>
          {tab === 'schedule-112a' && (
            <Button variant="outline" className="ml-auto" onClick={downloadCsv}>
              <FileDown className="h-4 w-4" /> ITR-portal CSV
            </Button>
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

      {tab === 'summary' && <SummaryView data={summaryQ.data} loading={summaryQ.isLoading} />}
      {tab === 'schedule-112a' && (
        <GainsView
          data={s112AQ.data}
          loading={s112AQ.isLoading}
          kind="Schedule 112A · LTCG on listed equity / equity MF"
          showRate
        />
      )}
      {tab === 'schedule-112' && (
        <GainsView
          data={s112Q.data}
          loading={s112Q.isLoading}
          kind="Schedule 112 · LTCG on other assets (with indexation)"
          showIndexed
        />
      )}
      {tab === 'stcg' && (
        <GainsView data={stcgQ.data} loading={stcgQ.isLoading} kind="Short-Term Capital Gains" />
      )}
      {tab === 'ltcg' && (
        <GainsView data={ltcgQ.data} loading={ltcgQ.isLoading} kind="Long-Term Capital Gains" showIndexed />
      )}
      {tab === 'intraday' && (
        <GainsView data={intradayQ.data} loading={intradayQ.isLoading} kind="Intraday (Sec. 43(5) Speculative)" />
      )}
      {tab === 'fno' && <Schedule43View data={fnoQ.data} loading={fnoQ.isLoading} />}
      {tab === 'income' && <IncomeView data={incomeQ.data} loading={incomeQ.isLoading} />}
      {tab === 'harvest' && <HarvestView data={harvestQ.data} loading={harvestQ.isLoading} />}
    </div>
  );
}

function Loading() {
  return (
    <div className="flex items-center gap-2 text-muted-foreground p-8 text-sm">
      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
    </div>
  );
}

function SummaryView({ data, loading }: { data: TaxSummary | undefined; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return null;
  const cg = data.capitalGains;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Realised Gain</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                'text-2xl font-semibold',
                isNonNegativeMoney(data.totalRealisedGain) ? 'text-positive' : 'text-negative',
              )}
            >
              ₹{fmt(data.totalRealisedGain)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">FY {data.financialYear}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Estimated Tax Liability</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₹{fmt(data.totalEstimatedTax)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Excludes surcharge & cess
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Effective Rate</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {(() => {
                const g = toDecimal(data.totalRealisedGain);
                if (g.isZero() || g.isNegative()) return '—';
                const t = toDecimal(data.totalEstimatedTax);
                return `${t.dividedBy(g).times(100).toFixed(2)}%`;
              })()}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Tax / Realised Gain</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Capital Gains Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2">Section</th>
                <th className="text-left p-2">Description</th>
                <th className="text-right p-2">Gain</th>
                <th className="text-right p-2">Taxable</th>
                <th className="text-right p-2">Rate</th>
                <th className="text-right p-2">Tax</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b">
                <td className="p-2 font-medium">Sec. 111A</td>
                <td className="p-2">STCG on listed equity (STT paid)</td>
                <td className={cn('p-2 text-right', isNonNegativeMoney(cg.section111A_stcgEquity.gain) ? 'text-positive' : 'text-negative')}>
                  ₹{fmt(cg.section111A_stcgEquity.gain)}
                </td>
                <td className="p-2 text-right">₹{fmt(cg.section111A_stcgEquity.gain)}</td>
                <td className="p-2 text-right">{data.rates.stcgEquityPct}%</td>
                <td className="p-2 text-right font-medium">₹{fmt(cg.section111A_stcgEquity.tax)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 font-medium">Sec. 112A</td>
                <td className="p-2">
                  LTCG on listed equity (exemption ₹{fmt(cg.section112A_ltcgEquity.exemption, 0)})
                </td>
                <td className={cn('p-2 text-right', isNonNegativeMoney(cg.section112A_ltcgEquity.gain) ? 'text-positive' : 'text-negative')}>
                  ₹{fmt(cg.section112A_ltcgEquity.gain)}
                </td>
                <td className="p-2 text-right">₹{fmt(cg.section112A_ltcgEquity.taxable)}</td>
                <td className="p-2 text-right">{data.rates.ltcgEquityPct}%</td>
                <td className="p-2 text-right font-medium">₹{fmt(cg.section112A_ltcgEquity.tax)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 font-medium">Sec. 112</td>
                <td className="p-2">LTCG on other assets (indexed 20% / non-indexed 12.5%)</td>
                <td className={cn('p-2 text-right', isNonNegativeMoney(cg.section112_ltcgOther.gain) ? 'text-positive' : 'text-negative')}>
                  ₹{fmt(cg.section112_ltcgOther.gain)}
                </td>
                <td className="p-2 text-right">₹{fmt(cg.section112_ltcgOther.taxable)}</td>
                <td className="p-2 text-right">mixed</td>
                <td className="p-2 text-right font-medium">₹{fmt(cg.section112_ltcgOther.tax)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 font-medium">Slab</td>
                <td className="p-2">STCG on non-equity (debt, bonds, gold, etc.)</td>
                <td className={cn('p-2 text-right', isNonNegativeMoney(cg.stcgOther.gain) ? 'text-positive' : 'text-negative')}>
                  ₹{fmt(cg.stcgOther.gain)}
                </td>
                <td className="p-2 text-right">₹{fmt(cg.stcgOther.gain)}</td>
                <td className="p-2 text-right">{data.rates.slabPct}%</td>
                <td className="p-2 text-right font-medium">₹{fmt(cg.stcgOther.tax)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 font-medium">Sec. 43(5)</td>
                <td className="p-2">Intraday speculative business income</td>
                <td className={cn('p-2 text-right', isNonNegativeMoney(cg.intradaySpeculative.gain) ? 'text-positive' : 'text-negative')}>
                  ₹{fmt(cg.intradaySpeculative.gain)}
                </td>
                <td className="p-2 text-right">₹{fmt(cg.intradaySpeculative.gain)}</td>
                <td className="p-2 text-right">{data.rates.slabPct}%</td>
                <td className="p-2 text-right font-medium">₹{fmt(cg.intradaySpeculative.tax)}</td>
              </tr>
              <tr className="border-b">
                <td className="p-2 font-medium">Sec. 43(5)</td>
                <td className="p-2">
                  F&O non-speculative {data.fnoBusinessIncome.auditApplicable && <span className="text-xs text-amber-600 ml-1">· Sec. 44AB audit</span>}
                </td>
                <td className={cn('p-2 text-right', isNonNegativeMoney(data.fnoBusinessIncome.netPnl) ? 'text-positive' : 'text-negative')}>
                  ₹{fmt(data.fnoBusinessIncome.netPnl)}
                </td>
                <td className="p-2 text-right">₹{fmt(data.fnoBusinessIncome.netPnl)}</td>
                <td className="p-2 text-right">{data.rates.slabPct}%</td>
                <td className="p-2 text-right font-medium">₹{fmt(data.fnoBusinessIncome.tax)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/20 font-semibold">
                <td colSpan={2} className="p-2">Total</td>
                <td className="p-2 text-right">₹{fmt(data.totalRealisedGain)}</td>
                <td className="p-2 text-right">—</td>
                <td className="p-2 text-right">—</td>
                <td className="p-2 text-right">₹{fmt(data.totalEstimatedTax)}</td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Other Income (taxed at slab — outside this estimate)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Dividends</div>
              <div className="font-medium">₹{fmt(data.otherIncome.dividend)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Interest</div>
              <div className="font-medium">₹{fmt(data.otherIncome.interest)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Maturity Proceeds</div>
              <div className="font-medium">₹{fmt(data.otherIncome.maturity)}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground flex items-start gap-2 px-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          Estimates use current statutory rates and exclude surcharge, cess, deductions
          (Sec. 80C / Sec. 80D), set-off of brought-forward losses, and any FMV adjustment
          for pre-31-Jan-2018 equity (grandfathering). Confirm with your CA before filing.
        </span>
      </div>
    </div>
  );
}

function GainsView({
  data,
  loading,
  kind,
  showRate,
  showIndexed,
}: {
  data: TaxGainsReport | undefined;
  loading: boolean;
  kind: string;
  showRate?: boolean;
  showIndexed?: boolean;
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
          {showRate && data.ratePct !== undefined && <span> · Rate {data.ratePct}%</span>}
          {data.estimatedTax && <span> · Est. Tax ₹{fmt(data.estimatedTax)}</span>}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2">Asset</th>
                <th className="text-left p-2">ISIN</th>
                <th className="text-left p-2">Buy</th>
                <th className="text-left p-2">Sell</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Cost</th>
                <th className="text-right p-2">Proceeds</th>
                {showIndexed && <th className="text-right p-2">Indexed Cost</th>}
                <th className="text-right p-2">Gain/Loss</th>
                <th className="text-right p-2">Taxable</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r, i) => (
                <tr key={i} className="border-b">
                  <td className="p-2">{r.assetName || r.isin || '—'}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.isin ?? '—'}</td>
                  <td className="p-2">{r.buyDate.slice(0, 10)}</td>
                  <td className="p-2">{r.sellDate.slice(0, 10)}</td>
                  <td className="p-2 text-right">{fmt(r.quantity, 4)}</td>
                  <td className="p-2 text-right">{fmt(r.buyAmount)}</td>
                  <td className="p-2 text-right">{fmt(r.sellAmount)}</td>
                  {showIndexed && (
                    <td className="p-2 text-right">
                      {r.indexedCostOfAcquisition ? fmt(r.indexedCostOfAcquisition) : '—'}
                    </td>
                  )}
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
                  <td colSpan={showIndexed ? 10 : 9} className="p-6 text-center text-muted-foreground">
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

function Schedule43View({ data, loading }: { data: Schedule43Report | undefined; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return null;
  const ns = data.nonSpeculative;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            F&O Schedule 43 / ITR-3 Schedule BP · FY {data.financialYear}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Gross Profit</div>
              <div className="font-medium text-positive">₹{fmt(ns.grossProfit)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Gross Loss</div>
              <div className="font-medium text-negative">₹{fmt(ns.grossLoss)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net P&L</div>
              <div className={cn('font-medium', isNonNegativeMoney(ns.netPnl) ? 'text-positive' : 'text-negative')}>
                ₹{fmt(ns.netPnl)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Turnover (ICAI)</div>
              <div className="font-medium">₹{fmt(ns.turnover)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Trades</div>
              <div className="font-medium">{ns.tradeCount}</div>
            </div>
          </div>
          <div
            className={cn(
              'mt-3 text-xs px-3 py-2 rounded border',
              data.taxAuditApplicable
                ? 'bg-amber-500/10 text-amber-700 border-amber-300'
                : 'bg-muted/30 text-muted-foreground border-border',
            )}
          >
            {data.taxAuditNote}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Per-instrument breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-2">Underlying</th>
                  <th className="text-left p-2">Type</th>
                  <th className="text-left p-2">Strike</th>
                  <th className="text-left p-2">Expiry</th>
                  <th className="text-left p-2">Side</th>
                  <th className="text-right p-2">P&L</th>
                  <th className="text-right p-2">Turnover</th>
                  <th className="text-right p-2">Trades</th>
                </tr>
              </thead>
              <tbody>
                {data.perInstrumentRows.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{r.underlying}</td>
                    <td className="p-2 text-xs">{r.instrumentType}</td>
                    <td className="p-2">{r.strikePrice ?? '—'}</td>
                    <td className="p-2">{r.expiryDate.slice(0, 10)}</td>
                    <td className="p-2 text-xs">{r.side}</td>
                    <td className={cn('p-2 text-right', isNonNegativeMoney(r.realizedPnl) ? 'text-positive' : 'text-negative')}>
                      {fmt(r.realizedPnl)}
                    </td>
                    <td className="p-2 text-right">{fmt(r.turnover)}</td>
                    <td className="p-2 text-right">{r.closedTradeCount}</td>
                  </tr>
                ))}
                {data.perInstrumentRows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="p-6 text-center text-muted-foreground">
                      No F&O trades closed in this FY.
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

function IncomeView({ data, loading }: { data: TaxIncomeReport | undefined; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">
          Dividends ₹{fmt(data.dividend)} · Interest ₹{fmt(data.interest)} · Maturity ₹{fmt(data.maturity)} · Total ₹{fmt(data.total)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-auto">
          <table className="text-sm w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Portfolio</th>
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
                  <td className="p-2 text-xs">{r.portfolioName}</td>
                  <td className="p-2">{r.assetName}</td>
                  <td className="p-2 text-right">{fmt(r.amount)}</td>
                  <td className="p-2 text-xs text-muted-foreground">{r.narration ?? ''}</td>
                </tr>
              ))}
              {data.rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">
                    No income in this FY.
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

function HarvestView({ data, loading }: { data: TaxHarvestReport | undefined; loading: boolean }) {
  if (loading) return <Loading />;
  if (!data) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Total Unrealised Loss</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold text-negative">₹{fmt(data.totals.unrealisedLoss)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">STCG Loss Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₹{fmt(data.totals.stcgLossAvailable)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Realised STCG this FY: ₹{fmt(data.totals.realisedStcgInFy)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">LTCG Loss Available</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">₹{fmt(data.totals.ltcgLossAvailable)}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Realised LTCG this FY: ₹{fmt(data.totals.realisedLtcgInFy)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Holdings sorted by unrealised loss (harvest candidates)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <table className="text-sm w-full">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left p-2">Asset</th>
                  <th className="text-left p-2">Class</th>
                  <th className="text-left p-2">Portfolio</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="text-right p-2">Avg</th>
                  <th className="text-right p-2">CMP</th>
                  <th className="text-right p-2">Invested</th>
                  <th className="text-right p-2">Value</th>
                  <th className="text-right p-2">P&L</th>
                  <th className="text-right p-2">%</th>
                  <th className="text-left p-2">Classification</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={i} className="border-b">
                    <td className="p-2">{r.assetName || r.isin || '—'}</td>
                    <td className="p-2 text-xs text-muted-foreground">{r.assetClass}</td>
                    <td className="p-2 text-xs">{r.portfolioName}</td>
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
                    <td className="p-2 text-xs">
                      <span
                        className={cn(
                          'inline-flex items-center rounded px-1.5 py-0.5 font-medium',
                          r.classification === 'STCG_LOSS' && 'bg-negative/10 text-negative',
                          r.classification === 'LTCG_LOSS' && 'bg-amber-500/10 text-amber-700',
                          r.classification === 'STCG_GAIN' && 'bg-positive/10 text-positive',
                          r.classification === 'LTCG_GAIN' && 'bg-blue-500/10 text-blue-700',
                        )}
                      >
                        {r.classification.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={11} className="p-6 text-center text-muted-foreground">
                      No holdings to analyse.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground flex items-start gap-2 px-1">
        <Info className="h-3 w-3 mt-0.5 shrink-0" />
        <span>
          STCG losses can offset both STCG and LTCG. LTCG losses can offset only LTCG.
          Unabsorbed losses can be carried forward for 8 AYs (Sec. 74). Holding-period
          classification uses the oldest BUY in the lot — actual FIFO matching at sell
          time may differ.
        </span>
      </div>
    </div>
  );
}
