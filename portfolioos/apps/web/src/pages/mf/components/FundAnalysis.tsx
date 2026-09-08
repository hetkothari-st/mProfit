import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import type {
  MfAnalysisRunDto,
  MfFinding,
  MfFindingCategory,
  MfFundVerdictDto,
} from '@portfolioos/shared';
import { Button } from '@/components/ui/button';
import { SectionUnavailable } from './MetricValue';
import { FindingsList } from './FindingsList';
import { VerdictBlock } from './VerdictChip';
import { formatIsoDate, humanizeKey } from '../mfFormat';

/**
 * The analysis section of the fund page: run status, verdict, findings, refresh
 * (`07-IMPLEMENTATION-PLAN.md` Task 5.6).
 *
 * Pure — every input is a prop. The page owns the three queries and the
 * mutation; this component owns only the honesty states, which is what makes
 * them testable as fixtures rather than as network conditions.
 *
 * The four states from `06-QUALITY-COMPLIANCE.md §6` that land here:
 *
 *  - **run `PARTIAL`** → a banner naming the missing rule categories. Never a
 *    silent omission. This is the state that matters most, because a page that
 *    quietly drops the COST rules looks exactly like a page where cost is fine.
 *  - **`proseVerified: false`** → headlines, no prose, no error. Handled inside
 *    `VerdictBlock`; the server has already withheld the text.
 *  - **`RIA_VERDICTS_ENABLED = false`** → the chip reads "Review" with the
 *    "analysis only" note. Handled inside `VerdictChip` off `advisoryGated`.
 *  - **no run at all** → an empty state that says the engine has not run, not
 *    that the fund is clean.
 */

export interface FundAnalysisProps {
  /** Null when no analysis has ever completed for this user. */
  run: MfAnalysisRunDto | null;
  findings: MfFinding[];
  verdict: MfFundVerdictDto | null;
  isLoading: boolean;
  /** The API's own message, surfaced verbatim — see `onRefresh`. */
  loadError: string | null;
  onRefresh: () => void;
  isRefreshing: boolean;
  /**
   * The server's refresh error, already unwrapped by `apiErrorMessage`.
   *
   * The 1/hour limit reaches the user through here: the 429's message names the
   * time the next refresh is allowed, and reproducing that deadline on the
   * client would mean a second implementation of the limit that can disagree
   * with the first. The button therefore stays enabled and the server answers.
   */
  refreshError: string | null;
}

/**
 * The `PARTIAL` banner.
 *
 * It names categories where it can, and falls back to naming the failed rule
 * ids where it cannot. That fallback is not defensive padding: `missingCategories`
 * is derived server-side by joining the run's `ruleVersionsSnapshot` back
 * against the live rule registry, so a rule DELETED since the run was recorded
 * resolves to no category at all. Reporting "some checks failed" with nothing
 * after it would be exactly the silent omission this banner exists to prevent,
 * and the rule ids are still in the snapshot.
 */
function PartialRunBanner({ run }: { run: MfAnalysisRunDto }) {
  const failedRules = run.ruleVersionsSnapshot.filter((r) => r.error !== undefined);
  const categories: MfFindingCategory[] = run.missingCategories;

  return (
    <div
      data-testid="mf-partial-banner"
      role="status"
      className="flex gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 text-[12px] leading-relaxed">
        <p className="font-medium text-foreground">This analysis is incomplete.</p>
        {categories.length > 0 ? (
          <p className="mt-0.5 text-muted-foreground">
            {categories.length === 1 ? 'One check category' : 'These check categories'} could not be
            evaluated on this run:{' '}
            <span className="text-foreground">
              {categories.map((c) => humanizeKey(c.toLowerCase())).join(', ')}
            </span>
            . Nothing below reflects them, so treat their absence as unknown rather than as clear.
          </p>
        ) : (
          <p className="mt-0.5 text-muted-foreground">
            Some checks failed on this run:{' '}
            <span className="text-foreground">
              {failedRules.map((r) => r.ruleId).join(', ') || 'the run did not record which'}
            </span>
            . Nothing below reflects them.
          </p>
        )}
      </div>
    </div>
  );
}

export function FundAnalysis({
  run,
  findings,
  verdict,
  isLoading,
  loadError,
  onRefresh,
  isRefreshing,
  refreshError,
}: FundAnalysisProps) {
  return (
    <section data-testid="mf-analysis" aria-label="Findings and verdict">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[22px] leading-none text-foreground">
            What we found
          </h2>
          {run !== null && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Analysis of {formatIsoDate(run.asOf) ?? run.asOf}
              {run.completedAt !== null && ` · run ${formatIsoDate(run.completedAt) ?? ''}`}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={isRefreshing}
          data-testid="mf-refresh"
        >
          {isRefreshing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          {isRefreshing ? 'Re-running…' : 'Refresh analysis'}
        </Button>
      </div>

      {/* The rate limit surfaces here, in the server's own words. It is not an
          application failure and is not styled as one: the user pressed a
          button, nothing happened, and they are entitled to know why and when
          it will work. */}
      {refreshError !== null && (
        <p
          data-testid="mf-refresh-error"
          role="status"
          className="mb-4 rounded-md border border-border/70 bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground"
        >
          {refreshError}
        </p>
      )}

      {isLoading && (
        <div className="py-10 text-center text-[13px] text-muted-foreground">
          <Loader2 className="inline h-4 w-4 animate-spin" /> Loading analysis…
        </div>
      )}

      {loadError !== null && !isLoading && (
        <SectionUnavailable title="Could not load the analysis" reason={loadError} />
      )}

      {!isLoading && loadError === null && (
        <div className="space-y-5">
          {run !== null && run.status === 'PARTIAL' && <PartialRunBanner run={run} />}

          {verdict === null ? (
            <SectionUnavailable
              title="No verdict for this fund"
              reason={
                run === null
                  ? 'No analysis has run for your portfolio yet, so nothing has been concluded about this fund. Use Refresh analysis to run one.'
                  : 'The latest run reached no standing conclusion for this scheme — most often because you do not hold it, or because it was added after the run.'
              }
            />
          ) : (
            <VerdictBlock verdict={verdict} />
          )}

          <FindingsList
            findings={findings}
            emptyReason={
              run === null
                ? 'No analysis has run for your portfolio yet. This is not a clean bill of health — nothing has been checked.'
                : 'The latest run examined this fund and none of its rules fired. Any category named in the banner above was not evaluated at all.'
            }
          />
        </div>
      )}
    </section>
  );
}
