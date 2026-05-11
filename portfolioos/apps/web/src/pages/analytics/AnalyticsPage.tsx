import { useState } from 'react';
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
import { AllocationByClassPie, AllocationTreemap, SectorPie } from './widgets/AllocationWidgets';
import { PortfolioValueLine, CostVsValueDrift, BenchmarkOverlay } from './widgets/PerformanceWidgets';
import { WinnersLosers, ConcentrationCard, AssetClassXirrBar } from './widgets/ReturnsWidgets';
import { CgByFyBar, IncomeTrendBar, RealisedVsUnrealisedCard, TaxHarvestTable } from './widgets/TaxWidgets';
import { CashflowWaterfall } from './widgets/CashflowWidget';
import { RiskMetricsCards, AllocationCorrelationGrid } from './widgets/RiskWidget';
import { LiabilitiesVsAssetsCard } from './widgets/LiabilitiesWidget';
import { InsightsPanel } from './widgets/InsightsPanel';

const PERIOD_OPTIONS: { label: string; value: Period }[] = [
  { label: '1M', value: '1M' },
  { label: '3M', value: '3M' },
  { label: '6M', value: '6M' },
  { label: '1Y', value: '1Y' },
  { label: '3Y', value: '3Y' },
  { label: '5Y', value: '5Y' },
  { label: 'All', value: 'All' },
];

export function AnalyticsPage() {
  const [selectedId, setSelectedId] = useState<string>('ALL');
  const [period, setPeriod] = useState<Period>('1Y');

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

  const benchmarkQuery = useQuery({
    queryKey: ['analytics', 'benchmark', period],
    queryFn: () => analyticsApi.benchmark(period),
    enabled: !!snapshotQuery.data,
    staleTime: 15 * 60 * 1000,
  });

  const riskQuery = useQuery({
    queryKey: ['analytics', 'risk', selectedId, period],
    queryFn: () => analyticsApi.risk(scopeId, period),
    enabled: !!snapshotQuery.data,
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
        title="Performance, risk and AI insights"
        description="Every metric, every chart, every signal — across portfolios and asset classes."
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

      {snapshotQuery.isLoading || !data ? (
        <AnalyticsSkeleton hidePageHeader />
      ) : (
        <>
          {/* KPI row */}
          <KpiCards kpis={data.kpis} />

          {/* AI Insights — high on the page so users see it */}
          <InsightsPanel portfolioId={scopeId} period={period} />

          {/* Performance row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <PortfolioValueLine points={data.portfolioValueLine} />
            <CostVsValueDrift points={data.costValueDrift} />
          </div>

          {/* Benchmark overlay (full width) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BenchmarkOverlay
              portfolio={data.portfolioValueLine}
              benchmark={benchmarkQuery.data?.series ?? []}
            />
            <LiabilitiesVsAssetsCard data={data.liabilitiesVsAssets} />
          </div>

          {/* Allocation row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <AllocationByClassPie slices={data.allocationByClass} />
            <AllocationTreemap nodes={data.allocationTreemap} />
            <SectorPie slices={data.sectorAllocation} />
          </div>

          {/* Concentration + Asset-class XIRR + Realised-vs-Unrealised */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <ConcentrationCard rows={data.concentrationRisk} />
            <AssetClassXirrBar rows={data.assetClassXirr} />
            <RealisedVsUnrealisedCard data={data.realisedVsUnrealised} />
          </div>

          {/* Winners + Losers */}
          <WinnersLosers
            winners={data.topWinnersLosers.winners}
            losers={data.topWinnersLosers.losers}
          />

          {/* Income + CG + Cashflow */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <CgByFyBar rows={data.cgByFy} />
            <IncomeTrendBar rows={data.incomeTrend} />
            <CashflowWaterfall rows={data.cashflowWaterfall} />
          </div>

          {/* Risk row */}
          <RiskMetricsCards metrics={riskQuery.data} loading={riskQuery.isLoading} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <AllocationCorrelationGrid
              allocation={data.allocationByClass}
              valueLine={data.portfolioValueLine}
            />
            <TaxHarvestTable data={data.taxHarvest} />
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
