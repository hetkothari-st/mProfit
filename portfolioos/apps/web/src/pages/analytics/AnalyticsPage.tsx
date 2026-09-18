import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, BarChart3 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { portfoliosApi } from '@/api/portfolios.api';
import { analyticsApi, type Period } from '@/api/analytics.api';
import { KpiCards } from './widgets/KpiCards';
import { AllocationByClassPie, SectorPie } from './widgets/AllocationWidgets';
import { PortfolioValueLine } from './widgets/PerformanceWidgets';
import { BestAndWorst, ConcentrationCard, AssetClassXirrBar } from './widgets/ReturnsWidgets';
import { CgByFyBar, IncomeTrendBar, TaxHarvestTable } from './widgets/TaxWidgets';
import { AdvanceTaxCard, FinancialYearSelect } from './widgets/TaxYearWidgets';
import { currentFy } from './financialYear';
import { CashflowWaterfall } from './widgets/CashflowWidget';
import { RiskMetricsCards, ReturnCorrelationGrid } from './widgets/RiskWidget';
import { LiabilitiesVsAssetsCard } from './widgets/LiabilitiesWidget';
import { InsightsPanel } from './widgets/InsightsPanel';
import { WhatIfSimulator } from './widgets/WhatIfSimulator';
import { LockedFeature } from '@/components/common/LockedFeature';

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: '3Y', value: '3Y' },
  { label: '5Y', value: '5Y' },
  { label: 'All', value: 'All' },
];

/**
 * Two views of the same data.
 *
 * Overview answers the four questions people actually open this page with:
 * what is it worth, am I up or down, what is doing badly, and what will March
 * cost me. Detail holds everything else — still one click away, never in the
 * way of those four.
 *
 * The split is in the URL so a view can be linked and reloaded into.
 */
type View = 'overview' | 'detail';

export function AnalyticsPage() {
  const [selectedId, setSelectedId] = useState<string>('ALL');
  const [period, setPeriod] = useState<Period>('1Y');
  // The financial year drives the tax block only. Everything else on the page
  // is "as of today" or follows the period selector, and pretending otherwise
  // would be the same lie the period pills already tell.
  const [fy, setFy] = useState<string>(() => currentFy());
  const [searchParams, setSearchParams] = useSearchParams();
  const view: View = searchParams.get('view') === 'detail' ? 'detail' : 'overview';
  const setView = (next: View) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'overview') params.delete('view');
    else params.set('view', next);
    setSearchParams(params, { replace: true });
  };

  const portfoliosQuery = useQuery({
    queryKey: ['portfolios'],
    queryFn: () => portfoliosApi.list(),
  });
  const portfolios = portfoliosQuery.data ?? [];

  const scopeId = selectedId === 'ALL' ? undefined : selectedId;

  const snapshotQuery = useQuery({
    queryKey: ['analytics', 'snapshot', selectedId, period],
    queryFn: () => analyticsApi.snapshot(scopeId, period),
    enabled: portfolios.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Risk and correlation only appear on the detail tab, so they are only
  // fetched once someone opens it.
  const riskQuery = useQuery({
    queryKey: ['analytics', 'risk', selectedId, period],
    queryFn: () => analyticsApi.risk(scopeId, period),
    enabled: !!snapshotQuery.data && view === 'detail',
    staleTime: 15 * 60 * 1000,
  });

  if (portfoliosQuery.isLoading) return <AnalyticsSkeleton />;

  if (portfolios.length === 0) {
    return (
      <div>
        <PageHeader title="Analytics" description="Multi-dimensional view of your wealth" />
        <EmptyState
          icon={BarChart3}
          title="No portfolios yet"
          description="Create a portfolio and add transactions to unlock analytics."
          action={
            <Button asChild>
              <Link to="/onboarding">Get started</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const data = snapshotQuery.data;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analytics"
        title="Your money, in detail"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-52"
            >
              <option value="ALL">All portfolios ({portfolios.length})</option>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <div className="flex gap-0.5 rounded-md border border-border/70 bg-background/40 p-0.5">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPeriod(opt.value)}
                  className={`px-2.5 py-1 rounded-[5px] text-[11px] font-medium tracking-wide transition-all ${
                    period === opt.value
                      ? 'bg-foreground text-background shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <div className="flex gap-1 border-b border-border/70">
        {([
          { key: 'overview', label: 'Overview' },
          { key: 'detail', label: 'Detail' },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            aria-current={view === t.key ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              view === t.key
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {snapshotQuery.isLoading || !data ? (
        <AnalyticsSkeleton hidePageHeader />
      ) : view === 'overview' ? (
        <>
          {/* What is it worth, and am I up or down */}
          <KpiCards kpis={data.kpis} />

          {/* The one chart that tells the whole story */}
          <PortfolioValueLine points={data.portfolioValueLine} />

          <LockedFeature requiredTier="PLUS" featureName="AI Insights">
            <InsightsPanel portfolioId={scopeId} period={period} />
          </LockedFeature>

          {/* Where the money sits, and how much of it sits in one place */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AllocationByClassPie slices={data.allocationByClass} />
            <ConcentrationCard rows={data.concentrationRisk} />
          </div>

          {/* What is doing badly — ranked by rupees, not percent */}
          <BestAndWorst
            winners={data.topWinnersLosers.winners}
            losers={data.topWinnersLosers.losers}
          />

          {/* What the tax year costs, and what can still be done about it */}
          <div className="flex items-center justify-between gap-3 flex-wrap pt-2">
            <h2 className="font-display text-[20px] leading-none tracking-tight">Tax</h2>
            <FinancialYearSelect fy={fy} onChange={setFy} className="w-36" />
          </div>
          <AdvanceTaxCard fy={fy} />
          {fy === currentFy() ? (
            <TaxHarvestTable data={data.taxHarvest} />
          ) : (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Harvesting losses only helps for the year you are still in. Switch to FY {currentFy()} to see
                what you could still do.
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CgByFyBar rows={data.cgByFy} />
            <IncomeTrendBar rows={data.incomeTrend} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectorPie slices={data.sectorAllocation} />
            <AssetClassXirrBar rows={data.assetClassXirr} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CashflowWaterfall rows={data.cashflowWaterfall} />
            <LiabilitiesVsAssetsCard data={data.liabilitiesVsAssets} />
          </div>

          <RiskMetricsCards metrics={riskQuery.data} loading={riskQuery.isLoading} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ReturnCorrelationGrid
              correlation={riskQuery.data?.classCorrelation}
              loading={riskQuery.isLoading}
              allocation={data.allocationByClass}
            />
            <WhatIfSimulator />
          </div>
        </>
      )}
    </div>
  );
}

function AnalyticsSkeleton({ hidePageHeader = false }: { hidePageHeader?: boolean }) {
  return (
    <div className="space-y-6">
      {!hidePageHeader && <PageHeader title="Analytics" />}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="h-28 animate-pulse bg-muted/60" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 h-72 animate-pulse bg-muted/60" />
        <Card className="h-72 animate-pulse bg-muted/60" />
      </div>
      <Card className="h-48 animate-pulse bg-muted/60">
        <CardContent className="flex items-center justify-center h-full">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    </div>
  );
}
