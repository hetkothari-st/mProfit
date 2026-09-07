import type { MfGoalFitDto, MfHeldFundDto } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { MetricStat } from './MetricValue';
import { NullableMoneyCell, RatioCell } from './MetricCells';
import { formatIsoDate, known } from '../mfFormat';

const SUITABILITY_LABEL: Record<MfGoalFitDto['suitability'], string> = {
  SUITABLE: 'Suitable',
  MISMATCH: 'Mismatch',
  UNDERPOWERED: 'Underpowered',
};

/**
 * The basis is rendered from `projectionBasis` rather than asserted in prose,
 * even though the union has exactly one member today. A second basis added to
 * the contract must not leave this page confidently describing the projection
 * as something it is no longer computed from — the label would go stale
 * silently, which is the failure mode this whole layer is built to avoid.
 */
const PROJECTION_BASIS_LABEL: Record<MfGoalFitDto['projectionBasis'], string> = {
  CATEGORY_MEDIAN_ROLLING: "the category's median rolling return",
};

/**
 * Goal fit (`04 §6`).
 *
 * The projection here is deliberately pessimistic relative to what the reader
 * will see anywhere else, and the page says so where they will read it. From
 * the contract:
 *
 * > Projected using the fund's **category median** rolling return, not its own
 * > past return. Using the fund's own history is the classic over-promise, and
 * > it is the number every brochure quotes.
 *
 * A top-decile fund projected on its own trailing return produces a figure that
 * assumes it stays top-decile for fifteen years. Nothing in the data supports
 * that, so the basis is stated on screen rather than buried in a tooltip — a
 * projection whose method is invisible is indistinguishable from a promise.
 *
 * `projectedValue`, `targetValue` and `shortfall` are each independently
 * nullable, and none may render as ₹0: a goal with no target amount on file has
 * an unknown shortfall, and "₹0 short" is the most reassuring possible way to
 * say "we have no idea".
 *
 * Renders nothing at all when there are no goals mapped to funds. An empty
 * "Goals" heading with a blank card would read as "your goals are fine".
 */
export function GoalFit({
  goals,
  funds,
}: {
  goals: MfGoalFitDto[];
  funds: MfHeldFundDto[];
}) {
  if (goals.length === 0) return null;

  const nameFor = (schemeCode: string) =>
    funds.find((f) => f.schemeCode === schemeCode)?.meta.schemeName ?? schemeCode;

  return (
    <section data-testid="mf-goals" className="space-y-4">
      <h2 className="font-display text-[22px] leading-none text-foreground">Goals</h2>
      <p className="text-[12px] leading-relaxed text-muted-foreground">
        Projected forward at the <strong className="font-medium text-foreground">category
        median</strong> rolling return for each fund — not at the fund&apos;s own past return, which
        assumes it keeps outperforming for the whole horizon and is the number every brochure
        quotes.
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        {goals.map((goal) => (
          <Card key={goal.goalId} tone="flat" data-goal={goal.goalId}>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{goal.goalName}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                    Target {formatIsoDate(goal.targetDate) ?? goal.targetDate}
                  </p>
                </div>
                <span
                  data-suitability={goal.suitability}
                  className={cn(
                    'inline-flex items-center rounded-full border px-2 py-px text-[10.5px] font-medium uppercase tracking-kerned',
                    goal.suitability === 'SUITABLE'
                      ? 'border-border bg-muted text-muted-foreground'
                      : 'border-amber-400/50 bg-amber-400/10 text-amber-700 dark:text-amber-300',
                  )}
                >
                  {SUITABILITY_LABEL[goal.suitability]}
                </span>
              </div>

              <p className="text-[12px] leading-relaxed text-muted-foreground">{goal.reason}</p>

              <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-4">
                <MetricStat label="Horizon" hint="Years to the target date">
                  {/* A `Ratio` that is NOT a fraction — years. Percent-
                      formatting it would render a 12-year horizon as 1200%. */}
                  <RatioCell resolved={known(goal.horizonYears)} fractionDigits={1} />
                </MetricStat>
                <MetricStat label="Projected value">
                  <NullableMoneyCell
                    value={goal.projectedValue}
                    reason="we hold no category-median rolling return for these funds, and projecting on the funds' own history would be an over-promise"
                  />
                </MetricStat>
                <MetricStat label="Target value">
                  <NullableMoneyCell
                    value={goal.targetValue}
                    reason="this goal has no target amount recorded against it"
                  />
                </MetricStat>
                <MetricStat label="Shortfall">
                  <NullableMoneyCell
                    value={goal.shortfall}
                    // "₹0 short" is the most reassuring possible way to say
                    // "we could not work it out".
                    reason="a shortfall needs both a projection and a target amount, and one of them is missing"
                  />
                </MetricStat>
              </div>

              <p className="border-t border-border/60 pt-3 text-[11.5px] text-muted-foreground">
                Funded by {goal.schemeCodes.map(nameFor).join(', ')}. Projected at{' '}
                <span data-projection-basis={goal.projectionBasis}>
                  {PROJECTION_BASIS_LABEL[goal.projectionBasis]}
                </span>
                .
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
