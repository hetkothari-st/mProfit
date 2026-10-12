import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { TaxInputWire } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, errorFor } from './EmiField';
import { useDebounced } from './useDebounced';
import { computeCompare, money, type CompareState, type OfferState } from './emiState';

export function CompareTab({ state, firstEmiDate, tax, onChange }: { state: CompareState; firstEmiDate: string; tax?: TaxInputWire; onChange: (s: CompareState) => void }) {
  const debounced = useDebounced(state, 150);
  const outcome = useMemo(() => computeCompare(debounced, firstEmiDate, tax), [debounced, firstEmiDate, tax]);
  const errors = outcome.ok ? [] : outcome.errors;
  const setOffer = (i: number, patch: Partial<OfferState>) => onChange({ offers: state.offers.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3">
        {state.offers.map((o, i) => (
          <Card key={i} data-testid={`offer-input-${i}`}>
            <CardContent className="space-y-3 pt-6">
              <Field id={`offer-${i}-label`} label="Name" value={o.label} onChange={(v) => setOffer(i, { label: v })} />
              <Field id={`offer-${i}-p`} label="Loan amount (Rs.)" inputMode="decimal" value={o.principal} onChange={(v) => setOffer(i, { principal: v })} error={errorFor(errors, `offers.${i}.principal`)} />
              <Field id={`offer-${i}-r`} label="Interest rate (% p.a.)" inputMode="decimal" value={o.ratePct} onChange={(v) => setOffer(i, { ratePct: v })} error={errorFor(errors, `offers.${i}.annualRatePct`)} />
              <Field id={`offer-${i}-t`} label={`Tenure (${o.tenureUnit === 'Y' ? 'years' : 'months'})`} inputMode="numeric" value={o.tenure} onChange={(v) => setOffer(i, { tenure: v })} error={errorFor(errors, `offers.${i}.tenureMonths`)} />
              <Field id={`offer-${i}-f`} label={o.feeKind === 'PCT' ? 'Processing fee (%)' : 'Processing fee (Rs.)'} inputMode="decimal" value={o.feeValue} onChange={(v) => setOffer(i, { feeValue: v })} error={errorFor(errors, `offers.${i}.fees.processingFeeValue`)} />
              <Field id={`offer-${i}-o`} label="Other charges (Rs.)" inputMode="decimal" value={o.otherCharges} onChange={(v) => setOffer(i, { otherCharges: v })} error={errorFor(errors, `offers.${i}.fees.otherCharges`)} />
              {state.offers.length > 2 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ offers: state.offers.filter((_, j) => j !== i) })}>
                  <Trash2 className="mr-1 h-4 w-4" /> Remove offer
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        {state.offers.length < 3 && (
          <Button type="button" variant="outline" className="h-auto min-h-24 border-dashed" onClick={() => onChange({ offers: [...state.offers, { ...state.offers.at(-1)!, label: `Offer ${String.fromCharCode(65 + state.offers.length)}` }] })}>
            <Plus className="mr-1 h-4 w-4" /> Add offer
          </Button>
        )}
      </div>

      {outcome.ok && (
        <div className="grid gap-4 md:grid-cols-3">
          {outcome.result.offers.map((o, i) => (
            <Card key={i} data-testid={`offer-result-${i}`} className={i === outcome.result.cheapestTotal ? 'border-primary' : undefined}>
              <CardContent className="space-y-1 pt-6 text-sm tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{o.label}</span>
                  {i === outcome.result.cheapestTotal && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">Cheapest overall</span>}
                </div>
                {i === outcome.result.cheapestPostTax && <div className="text-xs text-primary">Cheapest after tax</div>}
                <Row k="EMI" v={money(o.emi)} />
                <Row k="Total interest" v={money(o.totalInterest)} />
                <Row k="Fees + GST" v={money(o.fees.total)} />
                <Row k="Total cost" v={money(o.totalCost)} />
                <Row k="APR" v={`${o.aprPct.toFixed(2)}%`} />
                {o.postTaxCost && <Row k="Cost after tax" v={money(o.postTaxCost)} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>;
}
