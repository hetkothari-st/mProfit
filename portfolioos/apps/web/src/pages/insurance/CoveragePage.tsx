import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { Decimal, computeCoverage, type CoverageAssumptions, type NextStep } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { insuranceCoverageApi } from '@/api/insuranceCoverage.api';
import { PolicyFormDialog } from '@/components/insurance/PolicyFormDialog';
import { CoverageSummary } from '@/components/insurance/coverage/CoverageSummary';
import { FlagList } from '@/components/insurance/coverage/FlagList';
import { HealthCoverCard } from '@/components/insurance/coverage/HealthCoverCard';
import { HomeCoverCard } from '@/components/insurance/coverage/HomeCoverCard';
import { LifeCoverCard } from '@/components/insurance/coverage/LifeCoverCard';
import { VehicleCoverCard } from '@/components/insurance/coverage/VehicleCoverCard';

/** "1800000.0000" → "1800000": seeded amounts, as someone would type them. */
const plain = (money: string) => new Decimal(money).toString();

function forEditing(a: CoverageAssumptions): CoverageAssumptions {
  return {
    ...a,
    annualIncome: plain(a.annualIncome),
    annualExpenses: a.annualExpenses === null ? null : plain(a.annualExpenses),
    loans: plain(a.loans),
    healthBenchmark: plain(a.healthBenchmark),
  };
}

/**
 * "Am I covered enough, and where are the gaps?" — life, health, vehicles
 * and home, from the user's own figures. Every assumption is seeded from
 * their data and editable here; edits recompute on the spot with the shared
 * computeCoverage and aren't saved.
 */
export function CoveragePage() {
  // Under 'insurance-policies' so adding or editing a policy anywhere refreshes it.
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['insurance-policies', 'coverage'],
    queryFn: () => insuranceCoverageApi.get(),
  });
  const [edits, setEdits] = useState<CoverageAssumptions | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const seeded = useMemo(() => (data ? forEditing(data.defaults) : null), [data]);
  const assumptions = edits ?? seeded;
  const report = useMemo(() => (data && assumptions ? computeCoverage(data, assumptions) : null), [data, assumptions]);

  const change = (patch: Partial<CoverageAssumptions>) => {
    if (assumptions) setEdits({ ...assumptions, ...patch });
  };
  const onAddPolicy = (_step: NextStep) => setAddOpen(true);

  return (
    <div>
      <PageHeader
        eyebrow="Insurance"
        title="Coverage check"
        description="Are you covered enough, and where are the gaps? Worked out from what you’ve recorded — change any figure below and the answer updates."
        actions={
          <div className="flex flex-wrap gap-2">
            {edits && (
              <Button variant="ghost" onClick={() => setEdits(null)}>
                <RotateCcw className="h-4 w-4" /> Use my recorded figures
              </Button>
            )}
            <Button asChild variant="outline">
              <Link to="/insurance">
                <ArrowLeft className="h-4 w-4" /> Policies
              </Link>
            </Button>
          </div>
        }
      />

      {isLoading && (
        <div className="space-y-4">
          <Card className="h-16 animate-pulse bg-muted/60" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="h-48 animate-pulse bg-muted/60" />
          ))}
        </div>
      )}

      {isError && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <p className="text-sm">Couldn’t load your coverage. Check your connection and try again.</p>
          <Button variant="outline" onClick={() => void refetch()} disabled={isFetching}>
            Try again
          </Button>
        </Card>
      )}

      {data && report && assumptions && (
        <div className="space-y-4">
          <CoverageSummary
            areas={[
              { id: 'coverage-life', title: 'Life cover', check: report.life },
              { id: 'coverage-health', title: 'Health cover', check: report.health },
              { id: 'coverage-vehicles', title: 'Vehicles', check: report.vehicle },
              { id: 'coverage-home', title: 'Home', check: report.home },
            ]}
          />

          {report.alsoWorthALook.length > 0 && (
            <section aria-labelledby="coverage-also-title" className="space-y-2">
              <h2 id="coverage-also-title" className="text-sm text-muted-foreground">
                Also worth a look
              </h2>
              <FlagList flags={report.alsoWorthALook} onAddPolicy={onAddPolicy} />
            </section>
          )}

          <LifeCoverCard facts={data} check={report.life} assumptions={assumptions} onChange={change} onAddPolicy={onAddPolicy} />
          <HealthCoverCard facts={data} check={report.health} assumptions={assumptions} onChange={change} onAddPolicy={onAddPolicy} />
          <div className="grid gap-4 lg:grid-cols-2">
            <VehicleCoverCard check={report.vehicle} onAddPolicy={onAddPolicy} />
            <HomeCoverCard facts={data} check={report.home} onAddPolicy={onAddPolicy} />
          </div>

          <p className="pb-2 text-xs text-muted-foreground">
            A guide from the figures you’ve recorded, not advice on any product. Rules of thumb are marked as such; the law we
            quote links to its official source.
          </p>
        </div>
      )}

      <PolicyFormDialog open={addOpen} onOpenChange={setAddOpen} initial={null} />
    </div>
  );
}
