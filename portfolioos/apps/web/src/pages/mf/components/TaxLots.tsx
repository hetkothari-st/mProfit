import type { MfLotDto, MfTaxSummary } from '@portfolioos/shared';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { MetricStat, SectionUnavailable } from './MetricValue';
import { MoneyCell, NullableMoneyCell, NullablePctCell, UnitsCell } from './MetricCells';
import { formatIsoDate, known } from '../mfFormat';

/**
 * Open lots, FIFO, with the tax consequence of selling each today (`04 §5`).
 *
 * Three nulls in `MfLotDto` mean three different things, and every one of them
 * would be a lie as a zero:
 *
 * **`exitLoadPct === null` means UNKNOWN, not zero.** The contract states it
 * outright: *"Null means we do not know this scheme's exit load, not that it is
 * zero."* A holder deciding whether to switch out of a fund reads a zero exit
 * load as "free to leave"; the truth may be one percent of the redemption. The
 * cell says we do not know, and `exitLoadInr` alongside it does the same.
 *
 * **`taxIfSoldTodayInr === null` is not a tax bill of nothing.** The commonest
 * cause is short-term gain on a non-equity fund, where the liability is at the
 * holder's income slab and the slab is not knowable from anything this system
 * holds — the contract is explicit that this figure is computed *"at the
 * statutory CG rate — never the income slab"*, so where no statutory rate
 * applies there is no honest number to print. Rendering ₹0 would tell someone
 * a redemption is tax-free when it may be taxed at thirty percent.
 *
 * **`grandfatheredCost === null` simply means §112A does not apply** — the units
 * were bought after 31 Jan 2018, or are not equity-oriented. That is an absence
 * of applicability rather than a missing measurement, so the column shows a
 * plain em-dash-free "does not apply" rather than an unavailability, and it is
 * NOT marked as a metric value.
 *
 * The LTCG countdown is `daysToLtcg` and it exists only on STCG lots; a lot that
 * has already crossed carries null there, which is the one null in this DTO that
 * genuinely means "not applicable" and is rendered as the crossing rather than
 * as a gap.
 */
export function TaxLots({ tax }: { tax: MfTaxSummary }) {
  return (
    <section data-testid="mf-tax" className="space-y-4">
      <h2 className="font-display text-[22px] leading-none text-foreground">Tax</h2>

      <Card tone="flat">
        <CardContent className="grid grid-cols-2 gap-x-6 gap-y-5 p-5 sm:grid-cols-4">
          <MetricStat label="Unrealised STCG" hint="Gain on lots still inside the short-term window">
            <MoneyCell resolved={known(tax.unrealisedStcg)} />
          </MetricStat>
          <MetricStat label="Unrealised LTCG" hint="Gain on lots that have crossed into long-term">
            <MoneyCell resolved={known(tax.unrealisedLtcg)} />
          </MetricStat>
          <MetricStat
            label="§112A headroom"
            hint="Annual long-term exemption left, after gains already realised this year"
          >
            <MoneyCell resolved={known(tax.ltcgExemptionHeadroomInr)} />
          </MetricStat>
          <MetricStat label="Financial year">
            <span className="numeric tabular-nums text-foreground">{tax.financialYear}</span>
          </MetricStat>
        </CardContent>
      </Card>

      {tax.harvestCandidates.length > 0 && (
        <div data-testid="mf-tax-harvest">
          <SubHeading>Lots currently at a loss</SubHeading>
          <p className="mb-2 text-[11.5px] leading-relaxed text-muted-foreground">
            Selling these would realise a loss that can be set against gains. Listed as an
            observation about your lots, not as a recommendation to sell — whether it is worth doing
            depends on what you would buy instead and when.
          </p>
          <LotTable lots={tax.harvestCandidates} testId="mf-tax-harvest-table" />
        </div>
      )}

      <div>
        <SubHeading>Open lots</SubHeading>
        {tax.lots.length === 0 ? (
          <SectionUnavailable
            title="No open lots"
            reason="There are no unredeemed purchase lots in this view. The summary above is computed from your realised gains for the year, which exist independently of whether you currently hold anything."
          />
        ) : (
          <LotTable lots={tax.lots} testId="mf-tax-lots" />
        )}
      </div>
    </section>
  );
}

function LotTable({ lots, testId }: { lots: MfLotDto[]; testId: string }) {
  return (
    <Card tone="flat">
      <CardContent className="overflow-x-auto p-0" data-testid={testId}>
        <table className="w-full min-w-[1000px] text-[13px]">
          <thead>
            <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Scheme</th>
              <th className="px-4 py-2.5 font-medium">Bought</th>
              <th className="px-4 py-2.5 text-right font-medium">Units</th>
              <th className="px-4 py-2.5 text-right font-medium">Cost</th>
              <th className="px-4 py-2.5 text-right font-medium">Value</th>
              <th className="px-4 py-2.5 text-right font-medium">Gain</th>
              <th className="px-4 py-2.5 font-medium">Type</th>
              <th className="px-4 py-2.5 text-right font-medium">Exit load</th>
              <th className="px-4 py-2.5 text-right font-medium">Tax if sold today</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {lots.map((lot, i) => (
              <LotRow key={`${lot.schemeCode}-${lot.purchaseDate}-${i}`} lot={lot} />
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LotRow({ lot }: { lot: MfLotDto }) {
  return (
    <tr data-lot={`${lot.schemeCode}:${lot.purchaseDate}`}>
      <td className="px-4 py-2">
        <span className="text-foreground">{lot.schemeName}</span>
        {lot.grandfatheredCost !== null && (
          <span
            data-grandfathered
            title="Cost basis substituted with the fair market value on 31 January 2018 under §112A, because that is higher than what you paid."
            className="ml-2 rounded-full border border-border bg-muted px-1.5 py-px text-[9.5px] uppercase tracking-kerned text-muted-foreground"
          >
            Grandfathered
          </span>
        )}
      </td>
      <td className="px-4 py-2 text-[12px] text-muted-foreground">
        {formatIsoDate(lot.purchaseDate) ?? lot.purchaseDate}
        <span className="block text-[11px]">held {lot.holdingDays} days</span>
      </td>
      <td className="px-4 py-2 text-right">
        <UnitsCell value={lot.units} />
      </td>
      <td className="px-4 py-2 text-right">
        <MoneyCell resolved={known(lot.cost)} />
      </td>
      <td className="px-4 py-2 text-right">
        <MoneyCell resolved={known(lot.currentValue)} />
      </td>
      <td className="px-4 py-2 text-right">
        <MoneyCell resolved={known(lot.gain)} />
        {lot.harvestableLossInr !== null && (
          <span className="mt-0.5 block text-[11px] text-muted-foreground">
            harvestable <MoneyCell resolved={known(lot.harvestableLossInr)} />
          </span>
        )}
      </td>
      <td className="px-4 py-2">
        <GainType lot={lot} />
      </td>
      <td className="px-4 py-2 text-right">
        {/* UNKNOWN, not zero. See the module header. */}
        <NullablePctCell
          value={lot.exitLoadPct}
          reason="we hold no exit-load ladder for this scheme, so the charge on redeeming is unknown rather than nil"
        />
        <span className="mt-0.5 block text-[11px]">
          <NullableMoneyCell
            value={lot.exitLoadInr}
            reason="the charge cannot be computed without this scheme's exit-load ladder"
          />
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        <NullableMoneyCell
          value={lot.taxIfSoldTodayInr}
          // No digits in this reason: the keystone walker rejects a digit
          // inside a non-OK metric, and rightly — a number beside "not
          // available" is a number the reader will take as the answer.
          reason="this gain is taxed at your income slab rather than at a statutory rate, and we do not hold your slab"
        />
      </td>
    </tr>
  );
}

/**
 * The LTCG countdown. `daysToLtcg` is null once a lot has crossed, which is the
 * one null in this DTO that means "no longer applicable" — so the crossed state
 * is rendered as an achieved fact, and only an STCG lot shows a countdown.
 */
function GainType({ lot }: { lot: MfLotDto }) {
  if (lot.gainType === 'LTCG') {
    return (
      <span
        data-gain-type="LTCG"
        className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-px text-[10.5px] text-muted-foreground"
      >
        Long term
      </span>
    );
  }
  return (
    <span data-gain-type="STCG" className="inline-block">
      <span className="inline-flex items-center rounded-full border border-border bg-muted px-2 py-px text-[10.5px] text-muted-foreground">
        Short term
      </span>
      {lot.daysToLtcg !== null && (
        <span
          data-days-to-ltcg={lot.daysToLtcg}
          className={cn(
            'mt-0.5 block text-[11px]',
            // Under two months is close enough that the holder may want to wait
            // before redeeming; it is a fact about the calendar, not advice.
            lot.daysToLtcg <= 60 ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground',
          )}
        >
          {lot.daysToLtcg} days to long term
        </span>
      )}
    </span>
  );
}

function SubHeading({ children }: { children: string }) {
  return (
    <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </h3>
  );
}
