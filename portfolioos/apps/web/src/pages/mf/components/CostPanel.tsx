import type { MfCostSummary, MfHeldFundDto } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { MetricStat } from './MetricValue';
import {
  MoneyCell,
  NullableMoneyCell,
  NullablePctCell,
  PercentileCell,
} from './MetricCells';
import { known } from '../mfFormat';

/**
 * Cost (`04 §4`), and the reason this section is placed where it is: for most
 * retail portfolios `directPlanSavingsInr` is **the single largest actionable
 * number on the page**. It is not a market view or a prediction; it is a
 * recurring charge with a known size that the holder can stop paying by
 * switching plan, and nothing else here is that certain.
 *
 * The honesty rule that governs the whole section, from
 * `MfCostSummary.weightedTerPct`:
 *
 * > Null when no held fund has a known TER — **never `0`**. Zero is a real (and
 * > excellent) expense ratio, so using it for "we don't know" tells the user
 * > their portfolio is free.
 *
 * And the second half of it, which is easy to lose: when SOME funds disclose a
 * TER, the weighted mean is taken over that subset and `annualCostInr` is
 * charged on the same subset, so both are a **floor**. `byFund` carries
 * `terPct: null` per fund precisely so that gap is visible rather than implied,
 * which is why the per-fund table below is not optional detail — it is the
 * evidence for the headline figure. The count of undisclosed funds is stated
 * above the table so a reader knows how much of their book the headline
 * actually covers.
 */
export function CostPanel({
  cost,
  funds,
}: {
  cost: MfCostSummary;
  funds: MfHeldFundDto[];
}) {
  const nameFor = (schemeCode: string) =>
    funds.find((f) => f.schemeCode === schemeCode)?.meta.schemeName ?? schemeCode;

  const undisclosed = cost.byFund.filter((r) => r.terPct === null);
  const regularPlansWithSibling = cost.byFund.filter(
    (r) => r.directSiblingSchemeCode !== null && r.annualSavingsInr !== null,
  );

  return (
    <section data-testid="mf-cost" className="space-y-4">
      <h2 className="font-display text-[22px] leading-none text-foreground">Cost</h2>

      <Card tone="flat">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4">
          <MetricStat
            label="Weighted TER"
            hint="Across the funds that disclosed one — see the table below for which did not"
          >
            <NullablePctCell
              value={cost.weightedTerPct}
              reason="no fund you hold has disclosed an expense ratio, and zero would say your portfolio is free"
            />
          </MetricStat>
          <MetricStat label="Annual cost" hint="Weighted TER charged on today's value">
            <NullableMoneyCell
              value={cost.annualCostInr}
              reason="no fund you hold has disclosed an expense ratio, so there is nothing to charge it against"
            />
          </MetricStat>
          <MetricStat
            label="Cost rank in category"
            hint="Higher is cheaper — a weighted mean of each fund's own cost percentile"
          >
            <PercentileCell
              value={cost.costCategoryPercentile}
              reason="none of your funds has been ranked for cost against a large enough peer group"
            />
          </MetricStat>
          <MetricStat
            label="Direct-plan saving, per year"
            hint="What the same schemes would cost in their direct plan, on today's value"
          >
            <MoneyCell resolved={known(cost.directPlanSavingsInr)} className="text-[17px]" />
          </MetricStat>
        </CardContent>
      </Card>

      {undisclosed.length > 0 && (
        <p
          data-testid="mf-cost-undisclosed"
          className="rounded-md border border-dashed border-border/70 bg-muted/30 px-4 py-3 text-[12px] leading-relaxed text-muted-foreground"
        >
          <strong className="font-medium text-foreground">
            {undisclosed.length === 1
              ? 'One fund has not disclosed an expense ratio'
              : `${undisclosed.length} funds have not disclosed an expense ratio`}
          </strong>{' '}
          — {undisclosed.map((r) => nameFor(r.schemeCode)).join(', ')}. The weighted TER and annual
          cost above are computed over the rest of your book only, so both are a floor. Your real
          annual cost is at least the figure shown.
        </p>
      )}

      {regularPlansWithSibling.length > 0 && (
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          {regularPlansWithSibling.length === 1
            ? 'One scheme you hold is a regular plan with a direct sibling.'
            : `${regularPlansWithSibling.length} schemes you hold are regular plans with direct siblings.`}{' '}
          The saving below is the TER difference applied to today&apos;s value — a recurring charge
          that stops when the plan changes, not a projected return. Switching realises capital
          gains and may attract an exit load; the tax section states both.
        </p>
      )}

      <Card tone="flat">
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead>
              <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2.5 font-medium">Scheme</th>
                <th className="px-4 py-2.5 text-right font-medium">TER</th>
                <th className="px-4 py-2.5 font-medium">Direct sibling</th>
                <th className="px-4 py-2.5 text-right font-medium">Its TER</th>
                <th className="px-4 py-2.5 text-right font-medium">Annual saving</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {cost.byFund.map((row) => (
                <tr key={row.schemeCode} data-cost-scheme={row.schemeCode}>
                  <td className="px-4 py-2 text-foreground">{nameFor(row.schemeCode)}</td>
                  <td className="px-4 py-2 text-right">
                    <NullablePctCell
                      value={row.terPct}
                      // The per-fund null is the whole reason the headline is a
                      // floor. Rendering it as a dash would hide the gap; as a
                      // zero would claim the fund is free.
                      reason="this scheme has not disclosed an expense ratio to us"
                    />
                  </td>
                  <td className="px-4 py-2 text-[12px] text-muted-foreground">
                    {row.directSiblingSchemeCode === null
                      ? 'None on file'
                      : nameFor(row.directSiblingSchemeCode)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <NullablePctCell
                      value={row.directSiblingTerPct}
                      reason="we have not matched a direct-plan sibling for this scheme, or the sibling has not disclosed its own expense ratio"
                    />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <NullableMoneyCell
                      value={row.annualSavingsInr}
                      // A regular plan whose sibling TER we lack has an unknown
                      // saving, not a saving of nothing.
                      reason="the saving needs both this scheme's expense ratio and its direct sibling's, and one of them is missing"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </section>
  );
}
