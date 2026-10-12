import { useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { TaxInputWire } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Field, Select, UnitToggle, errorFor } from './EmiField';
import { useDebounced } from './useDebounced';
import { computeCompare, money, type CompareState, type OfferState } from './emiState';

/** Offer fields that have an input on this tab; any other error is listed in a card. */
const OFFER_FIELDS = ['principal', 'annualRatePct', 'tenureMonths', 'fees.processingFeeValue', 'fees.otherCharges'];
const shownInOffer = (field: string) => OFFER_FIELDS.some((f) => new RegExp(`^offers\\.\\d+\\.${f.replace('.', '\\.')}$`).test(field));

export function CompareTab({ state, firstEmiDate, tax, onChange }: { state: CompareState; firstEmiDate: string; tax?: TaxInputWire; onChange: (s: CompareState) => void }) {
  const debounced = useDebounced(state, 150);
  const outcome = useMemo(() => computeCompare(debounced, firstEmiDate, tax), [debounced, firstEmiDate, tax]);
  const errors = outcome.ok ? [] : outcome.errors;
  const hiddenMessages = [...new Set(errors.filter((e) => !shownInOffer(e.field)).map((e) => e.message))];
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
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field id={`offer-${i}-t`} label={`Tenure (${o.tenureUnit === 'Y' ? 'years' : 'months'})`} inputMode="numeric" value={o.tenure} onChange={(v) => setOffer(i, { tenure: v })} error={errorFor(errors, `offers.${i}.tenureMonths`)} />
                <UnitToggle value={o.tenureUnit} onChange={(u) => setOffer(i, { tenureUnit: u })} label={`Tenure unit, ${o.label || `offer ${i + 1}`}`} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select id={`offer-${i}-fk`} label="Fee type" value={o.feeKind} onChange={(v) => setOffer(i, { feeKind: v })} options={[{ value: 'PCT', label: '% of loan' }, { value: 'AMOUNT', label: 'Fixed Rs.' }]} />
                <Field id={`offer-${i}-f`} label={o.feeKind === 'PCT' ? 'Processing fee (%)' : 'Processing fee (Rs.)'} inputMode="decimal" value={o.feeValue} onChange={(v) => setOffer(i, { feeValue: v })} error={errorFor(errors, `offers.${i}.fees.processingFeeValue`)} />
              </div>
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
      <p className="text-xs text-muted-foreground">Uses the first EMI date and tax settings from the Calculate tab.</p>

      {hiddenMessages.length > 0 && (
        <Card data-testid="compare-errors">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <p>Fix these to compare the offers:</p>
            {hiddenMessages.map((m) => <p key={m} className="mt-2 text-destructive">{m}</p>)}
          </CardContent>
        </Card>
      )}

      {outcome.ok && (
        <div className="grid gap-4 md:grid-cols-3">
          {outcome.result.offers.map((o, i) => {
            const cheapest = outcome.result.cheapestTotal.includes(i);
            return (
              <Card key={i} data-testid={`offer-result-${i}`} className={cheapest ? 'border-primary' : undefined}>
                <CardContent className="space-y-1 pt-6 text-sm tabular-nums">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{o.label}</span>
                    {cheapest && <span className="rounded bg-primary/10 px-2 py-0.5 text-xs text-primary">Cheapest overall</span>}
                  </div>
                  {outcome.result.cheapestPostTax?.includes(i) && <div className="text-xs text-primary">Cheapest after tax</div>}
                  <Row k="EMI" v={money(o.emi)} />
                  <Row k="Total interest" v={money(o.totalInterest)} />
                  <Row k="Fees + GST" v={money(o.fees.total)} />
                  <Row k="Total cost" v={money(o.totalCost)} />
                  <Row k="APR" v={`${o.aprPct.toFixed(2)}%`} />
                  {o.postTaxCost && <Row k="Cost after tax" v={money(o.postTaxCost)} />}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between gap-2"><span className="text-muted-foreground">{k}</span><span className="whitespace-nowrap">{v}</span></div>;
}
