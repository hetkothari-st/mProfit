import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { LockedFeature } from '@/components/common/LockedFeature';
import { useEntitlement } from '@/hooks/useEntitlement';
import { apiErrorMessage } from '@/api/client';
import { mfAnalyticsApi } from '@/api/mfAnalytics.api';
import { mfAnalyticsKeys } from '@/api/mfAnalyticsKeys';
import { AnalyticsDisclaimer } from './components/AnalyticsDisclaimer';
import { CostPanel } from './components/CostPanel';
import { GoalFit } from './components/GoalFit';
import { HeldFunds } from './components/HeldFunds';
import { LookThrough } from './components/LookThrough';
import { SectionUnavailable } from './components/MetricValue';
import { MfScopeNotice } from './components/MfScopeNotice';
import { OverlapMatrix } from './components/OverlapMatrix';
import { PortfolioTotals } from './components/PortfolioTotals';
import { TaxLots } from './components/TaxLots';
import { formatIsoDate } from './mfFormat';

/**
 * Portfolio-level MF analysis (`04-PORTFOLIO-ANALYSIS.md`,
 * `07-IMPLEMENTATION-PLAN.md` Task 4.3).
 *
 * This is the layer no fund website can offer, because none of them know the
 * user's holdings: their own XIRR against the fund's CAGR over the same window,
 * how much of two funds is the same twenty stocks, what their book actually
 * owns once you look through the wrappers, what it costs to keep, and what
 * selling any lot would cost today.
 *
 * **No type is declared in this file or in any component it renders.** Every
 * shape comes from `@portfolioos/shared`. CONTEXT.md §11 records why: the
 * `/advisor` page crashed on first load because the client declared its own
 * version of a server shape — the API returned `{profile, history}` while the
 * UI destructured a bare profile — and `tsc`, having only the client's word for
 * what the server sends, certified the drift instead of catching it. A local
 * `interface Totals { … }` here would do the same thing, silently, at the
 * moment the server changed.
 *
 * The sections are ordered by what a reader can act on, not by the order of the
 * DTO. Cost sits above tax because `directPlanSavingsInr` is usually the single
 * largest actionable number in a retail portfolio — a recurring charge with a
 * known size that stops when the plan changes — while everything in the tax
 * section is contingent on a decision to sell.
 *
 * Three honesty states run across the whole page and are handled by the
 * components rather than here, but they are worth naming in one place because
 * each is a way a null could become a reassuring number:
 *
 *  1. `scope.partial` — every aggregate is a floor and the hidden categories are
 *     named in prose (`MfScopeNotice`, reusing the family layer's vocabulary
 *     rather than inventing a second dialect).
 *  2. `totals.weightedTerPct` / `annualCostInr` null — no held fund disclosed a
 *     TER. Rendered as unavailable, never ₹0 or 0.00%, which would tell the
 *     reader their portfolio is free to run.
 *  3. `lookThrough.fundsWithoutHoldings` non-empty — the look-through is a
 *     floor and the section says so above its first table.
 */
export function MfPortfolioPage() {
  // The same `FEATURE_MIN_TIER` map the server's `requireFeature` reads, so the
  // page never fires a request it already knows will come back 403.
  const { allowed, requiredTier } = useEntitlement('MF_ANALYTICS');

  const { data, isLoading, error } = useQuery({
    // Not parameterised by family id: `main.tsx` prefixes every query's cache
    // hash with the active `viewingAsFamilyId`, so switching household already
    // gets its own cache entry. See `mfAnalyticsKeys.portfolio`.
    queryKey: mfAnalyticsKeys.portfolio(),
    queryFn: () => mfAnalyticsApi.portfolio(),
    enabled: allowed,
  });

  return (
    <div>
      <PageHeader
        eyebrow="Mutual funds"
        title="Portfolio analysis"
        description="Your own returns, overlap, look-through exposure, cost and tax lots across every mutual fund you hold."
        actions={
          <Link
            to="/methodology/mf-score"
            className="text-[12px] text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            How funds are scored
          </Link>
        }
      />

      <LockedFeature requiredTier={requiredTier} featureName="Portfolio analytics" compact>
        {isLoading && (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="inline h-5 w-5 animate-spin" /> Analysing your mutual fund book…
          </div>
        )}

        {/* No silent catch: the server's own message is surfaced, because
            "you are not a member of that family" and "the analytics service is
            down" need different reactions from the reader. */}
        {error !== null && !isLoading && (
          <SectionUnavailable
            title="Could not analyse your portfolio"
            reason={apiErrorMessage(error, 'The analytics service did not respond.')}
          />
        )}

        {data && (
          <div className="space-y-10">
            <MfScopeNotice scope={data.scope} />

            <PortfolioTotals
              totals={data.totals}
              scope={data.scope}
              asOf={formatIsoDate(data.asOf) ?? data.asOf}
              runId={data.runId}
            />

            <HeldFunds funds={data.funds} />

            {/* Everything below is derived from the funds above. On an empty
                book the service still returns well-formed empty structures, and
                each section renders its own "nothing to compare" state rather
                than vanishing — a section that disappears reads as a section
                with nothing wrong in it. */}
            <OverlapMatrix overlap={data.overlap} funds={data.funds} />

            <LookThrough lookThrough={data.lookThrough} funds={data.funds} />

            <CostPanel cost={data.cost} funds={data.funds} />

            <TaxLots tax={data.tax} />

            <GoalFit goals={data.goals} funds={data.funds} />

            <AnalyticsDisclaimer />
          </div>
        )}
      </LockedFeature>
    </div>
  );
}
