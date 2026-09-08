import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { FundAnalysis } from './components/FundAnalysis';
import { SectionUnavailable } from './components/MetricValue';
import { PlainOverview } from './components/PlainOverview';

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
  /**
   * Overview is the default because the reader who needs the most help is the
   * one least likely to go looking for a toggle. Someone who wants Sortino and
   * tracking error knows to ask for them; someone who does not know what they
   * are cannot be expected to discover that the page has a friendlier half.
   */
  const [view, setView] = useState<'overview' | 'detailed'>('overview');
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

  // ---------------------------------------------------------------------
  // The user-scoped half (Task 5.6)
  // ---------------------------------------------------------------------
  //
  // Three queries rather than fields on the composed read above. The composed
  // endpoint serves shared market data with no owner; findings, verdicts and
  // runs are the caller's own rows, read under their RLS context, and folding
  // them into a reference response would blur a boundary the controllers keep
  // deliberately sharp. It also means a slow analysis read cannot delay the
  // score card, and a refresh invalidates only what it actually changed.
  const queryClient = useQueryClient();

  // Reference data, so it sits with the composed read rather than the
  // user-scoped block below — but as its own query: a fund with no score yet
  // still renders everything else while this returns an empty list.
  const alternativesQuery = useQuery({
    queryKey: mfAnalyticsKeys.alternatives(schemeCode ?? ''),
    queryFn: () => mfAnalyticsApi.alternatives(schemeCode!),
    enabled: allowed && Boolean(schemeCode),
  });
  const runQuery = useQuery({
    queryKey: mfAnalyticsKeys.latestRun(),
    queryFn: () => mfAnalyticsApi.latestRun(),
    enabled: allowed,
  });

  const findingsQuery = useQuery({
    queryKey: mfAnalyticsKeys.findings(schemeCode ?? ''),
    queryFn: () => mfAnalyticsApi.fundFindings(schemeCode!),
    enabled: allowed && Boolean(schemeCode),
  });

  const verdictQuery = useQuery({
    queryKey: mfAnalyticsKeys.verdict(schemeCode ?? ''),
    queryFn: () => mfAnalyticsApi.fundVerdict(schemeCode!),
    enabled: allowed && Boolean(schemeCode),
  });

  const refresh = useMutation({
    mutationFn: () => mfAnalyticsApi.refreshAnalysis(),
    // The whole namespace, not the three keys this page reads: a run rewrites
    // findings and verdicts for EVERY held fund, so invalidating only the fund
    // in view would leave eleven other cached pages asserting conclusions the
    // run has already superseded.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mfAnalyticsKeys.all }),
  });

  // The 1/hour limit is the server's to enforce; its 429 message names the time
  // the next refresh is allowed. Re-deriving that deadline here would be a
  // second implementation of the limit, free to disagree with the first.
  const refreshError =
    refresh.error === null
      ? null
      : apiErrorMessage(refresh.error, 'The analysis could not be refreshed.');

  const analysisLoading =
    runQuery.isLoading || findingsQuery.isLoading || verdictQuery.isLoading;
  const analysisError = runQuery.error ?? findingsQuery.error ?? verdictQuery.error;

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
            <div className="flex justify-end">
              <Tabs
                value={view}
                onValueChange={(v) => setView(v === 'detailed' ? 'detailed' : 'overview')}
              >
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="detailed">Detailed calculations</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {view === 'overview' ? (
              <PlainOverview
                data={data}
                alternatives={alternativesQuery.data ?? null}
                onShowDetail={() => setView('detailed')}
              />
            ) : (
              <>
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

            <FundAnalysis
              run={runQuery.data ?? null}
              findings={findingsQuery.data ?? []}
              verdict={verdictQuery.data ?? null}
              isLoading={analysisLoading}
              loadError={
                analysisError === null || analysisError === undefined
                  ? null
                  : apiErrorMessage(analysisError, 'The analysis service did not respond.')
              }
              onRefresh={() => refresh.mutate()}
              isRefreshing={refresh.isPending}
              refreshError={refreshError}
            />

            <PortfolioCharacteristics profile={data.profile} />

            <StructuralFacts meta={data.meta} profile={data.profile} />
              </>
            )}

            {/* Outside the toggle: the disclaimer applies to the plain
                summary exactly as much as to the calculations behind it, and
                the reader on the simpler view is the one who most needs it. */}
            <AnalyticsDisclaimer />
          </div>
        )}
      </LockedFeature>
    </div>
  );
}
