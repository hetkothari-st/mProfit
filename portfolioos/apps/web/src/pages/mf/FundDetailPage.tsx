import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { MF_HORIZONS, type MfHorizonYears } from '@portfolioos/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import { LockedFeature } from '@/components/common/LockedFeature';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEntitlement } from '@/hooks/useEntitlement';
import { apiErrorMessage } from '@/api/client';
import { mfAnalyticsApi } from '@/api/mfAnalytics.api';
import { mfAnalyticsKeys } from '@/api/mfAnalyticsKeys';
import { ScoreCard } from './components/ScoreCard';
import { HorizonMetricsPanel } from './components/HorizonMetricsPanel';
import { PortfolioCharacteristics } from './components/PortfolioCharacteristics';
import { StructuralFacts } from './components/StructuralFacts';
import { AnalyticsDisclaimer } from './components/AnalyticsDisclaimer';
import { PeerPercentiles } from './components/PeerPercentiles';
import { SectionUnavailable } from './components/MetricValue';

/**
 * Fund detail page (`07-IMPLEMENTATION-PLAN.md` Task 3.2).
 *
 * Everything it renders comes from one composed read,
 * `GET /api/mf-analytics/schemes/:schemeCode/analytics` → `MfFundAnalyticsDto`.
 * One round trip instead of five, and it makes `06 §4`'s "risk-o-meter
 * alongside any score" structural: `meta.riskometer` and `score` arrive in the
 * same payload, so this page cannot render a rating without holding the risk
 * disclosure that must sit beside it.
 *
 * **No type is declared in this file or any of its components.** Every shape
 * is imported from `@portfolioos/shared`. CONTEXT.md §11 records why: `/advisor`
 * crashed on first load because the client declared its own version of a server
 * shape and `tsc`, having only the client's word for it, certified the drift
 * instead of catching it. A local `interface FundScore { … }` here would do
 * exactly the same thing, silently, at the moment the server changes.
 *
 * The horizon tabs render all five of `MF_HORIZONS` even when a horizon is
 * missing from the payload. Hiding a tab would read as "this fund has no
 * 10-year record", which may be true or may be that the metrics job has not
 * covered it — two very different facts that the reader is entitled to
 * distinguish, so the missing tab says which.
 */

export function FundDetailPage() {
  const { schemeCode } = useParams<{ schemeCode: string }>();
  // Same `FEATURE_MIN_TIER` map the server's `requireFeature` reads, so the
  // page never fires a request it already knows will come back 403.
  const { allowed, requiredTier } = useEntitlement('MF_ANALYTICS');

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: mfAnalyticsKeys.analytics(schemeCode ?? ''),
    queryFn: () => mfAnalyticsApi.analytics(schemeCode!),
    enabled: allowed && Boolean(schemeCode),
  });

  const [horizon, setHorizon] = useState<MfHorizonYears | null>(null);

  // Default to the shortest horizon we actually have. Defaulting to a fixed
  // horizon would open most funds on an empty tab.
  const available = useMemo(
    () => MF_HORIZONS.filter((h) => data?.metrics[`${h}`] !== undefined),
    [data],
  );
  const activeHorizon: MfHorizonYears = horizon ?? available[0] ?? 3;
  const activeMetrics = data?.metrics[`${activeHorizon}`];

  return (
    <div>
      <PageHeader
        eyebrow="Mutual fund"
        title={data?.meta.schemeName ?? schemeCode ?? 'Fund'}
        description={
          data
            ? `${data.meta.amcName} · ${data.meta.sebiCategory}${
                data.meta.sebiSubCategory === 'UNMAPPED' ? '' : ` / ${data.meta.sebiSubCategory}`
              } · ${data.meta.planType} plan`
            : undefined
        }
      />

      <LockedFeature requiredTier={requiredTier} featureName="Fund analytics" compact>
        {isLoading && (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="inline h-5 w-5 animate-spin" /> Loading fund analytics…
          </div>
        )}

        {/* No silent catch: the server's own message is surfaced rather than a
            generic failure, because "scheme not found" and "the metrics service
            is down" need different reactions from the reader. */}
        {error !== null && !isLoading && (
          <SectionUnavailable
            title="Could not load this fund"
            reason={apiErrorMessage(error, 'The analytics service did not respond.')}
          />
        )}

        {data && (
          <div className="space-y-10">
            <ScoreCard meta={data.meta} score={data.score} categoryStats={data.categoryStats} />

            <section data-testid="mf-horizons">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-[22px] leading-none text-foreground">
                  Performance and risk
                </h2>
                <Tabs
                  value={String(activeHorizon)}
                  onValueChange={(v) => {
                    const next = MF_HORIZONS.find((h) => String(h) === v);
                    if (next !== undefined) setHorizon(next);
                  }}
                >
                  <TabsList>
                    {MF_HORIZONS.map((h) => (
                      <TabsTrigger key={h} value={String(h)}>
                        {h}Y
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {activeMetrics === undefined ? (
                <SectionUnavailable
                  title={`No ${activeHorizon}-year record`}
                  reason={`We hold no computed metrics for this scheme at the ${activeHorizon}-year horizon. That is either less NAV history than the window needs, or a horizon the metrics job has not covered — it is not a return of zero.`}
                />
              ) : (
                <div className="space-y-6">
                  <HorizonMetricsPanel metrics={activeMetrics} horizon={activeHorizon} />
                  {/* Peer ranks are per-horizon and keyed the same way the
                      metrics are, so they follow the selected tab rather than
                      sitting in a section of their own. */}
                  <PeerPercentiles peer={data.peer[`${activeHorizon}`]} />
                </div>
              )}
            </section>

            <PortfolioCharacteristics profile={data.profile} />

            <StructuralFacts meta={data.meta} profile={data.profile} />

            <AnalyticsDisclaimer />
          </div>
        )}
      </LockedFeature>
    </div>
  );
}
