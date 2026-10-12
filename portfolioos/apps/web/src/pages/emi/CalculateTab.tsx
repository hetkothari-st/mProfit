import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { computeCalc, groupedWhole, type CalcMode, type CalcOutcome, type CalcState } from './emiState';
import { useDebounced } from './useDebounced';
import { AdvancedInputs } from './AdvancedInputs';
import { EmiResults } from './EmiResults';
import { ScheduleTable } from './ScheduleTable';
import { TaxBenefitTable } from './TaxBenefitTable';
import { Field, Slider, UnitToggle, errorFor } from './EmiField';

const MODES: { value: CalcMode; label: string }[] = [
  { value: 'EMI', label: 'EMI' },
  { value: 'MAX_LOAN', label: 'Max loan' },
  { value: 'TENURE', label: 'Tenure' },
];

export function CalculateTab({ state, onChange, onOutcome }: { state: CalcState; onChange: (s: CalcState) => void; onOutcome?: (o: CalcOutcome) => void }) {
  const [advanced, setAdvanced] = useState(state.prepayments.length > 0 || state.rateChanges.length > 0 || state.feesOn || state.taxOn);
  const debounced = useDebounced(state, 150);
  const outcome = useMemo(() => computeCalc(debounced), [debounced]);
  // Same inputs without prepayments (rate changes kept), for "interest saved".
  const baseline = useMemo(
    () => (debounced.prepayments.length > 0 ? computeCalc({ ...debounced, prepayments: [] }) : null),
    [debounced],
  );
  useEffect(() => { onOutcome?.(outcome); }, [outcome, onOutcome]);
  const errors = outcome.ok ? [] : outcome.errors;
  const ADVANCED_PREFIXES = ['prepayments.', 'rateChanges.', 'fees.', 'tax.'];
  const needsAdvanced = errors.some((e) => ADVANCED_PREFIXES.some((p) => e.field.startsWith(p)));
  useEffect(() => { if (needsAdvanced) setAdvanced(true); }, [needsAdvanced]);
  const isShown = (field: string): boolean => {
    if (field === 'principal') return state.mode !== 'MAX_LOAN';
    if (field === 'emi') return state.mode !== 'EMI';
    if (field === 'tenureMonths') return state.mode !== 'TENURE';
    if (field === 'annualRatePct' || field === 'firstEmiDate') return true;
    return advanced && ADVANCED_PREFIXES.some((p) => field.startsWith(p));
  };
  const hiddenMessages = errors.filter((e) => !isShown(e.field)).map((e) => {
    if (e.field === 'tenureMonths' && state.mode === 'TENURE') return `That EMI gives a tenure outside the allowed range: ${e.message}`;
    return e.message;
  });
  const set = <K extends keyof CalcState>(k: K, v: CalcState[K]) => onChange({ ...state, [k]: v });
  const tenureRange = state.tenureUnit === 'Y' ? { min: 1, max: 30 } : { min: 12, max: 360 };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div role="radiogroup" aria-label="Calculate" className="grid grid-cols-3 gap-1 rounded-md bg-muted p-1">
            {MODES.map((m) => (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={state.mode === m.value}
                onClick={() => set('mode', m.value)}
                className={`rounded px-2 py-1.5 text-sm ${state.mode === m.value ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {state.mode !== 'MAX_LOAN' && (
            <div>
              <Field id="emi-principal" label="Loan amount (Rs.)" inputMode="decimal" value={state.principal} onChange={(v) => set('principal', v)} error={errorFor(errors, 'principal')} />
              <Slider label="Loan amount slider" text={state.principal} min={100000} max={50000000} step={50000} onChange={(v) => set('principal', groupedWhole(v))} />
            </div>
          )}
          {state.mode !== 'EMI' && (
            <div>
              <Field id="emi-emi" label="EMI you can pay (Rs.)" inputMode="decimal" value={state.emi} onChange={(v) => set('emi', v)} error={errorFor(errors, 'emi')} />
              <Slider label="EMI slider" text={state.emi} min={1000} max={500000} step={500} onChange={(v) => set('emi', groupedWhole(v))} />
            </div>
          )}
          <div>
            <Field id="emi-rate" label="Interest rate (% p.a.)" inputMode="decimal" value={state.ratePct} onChange={(v) => set('ratePct', v)} error={errorFor(errors, 'annualRatePct')} suffix="%" />
            <Slider label="Rate slider" text={state.ratePct} min={5} max={20} step={0.05} onChange={(v) => set('ratePct', v)} />
          </div>
          {state.mode !== 'TENURE' && (
            <div>
              <div className="grid grid-cols-[1fr_auto] items-end gap-2">
                <Field id="emi-tenure" label="Tenure" inputMode="numeric" value={state.tenure} onChange={(v) => set('tenure', v)} error={errorFor(errors, 'tenureMonths')} />
                <UnitToggle value={state.tenureUnit} onChange={(u) => set('tenureUnit', u)} />
              </div>
              <Slider label={state.tenureUnit === 'Y' ? 'Tenure slider (years)' : 'Tenure slider (months)'} text={state.tenure} min={tenureRange.min} max={tenureRange.max} step={1} onChange={(v) => set('tenure', v)} />
            </div>
          )}
          <Field id="emi-first" label="First EMI date" type="date" value={state.firstEmiDate} onChange={(v) => set('firstEmiDate', v)} error={errorFor(errors, 'firstEmiDate')} />

          <Button type="button" variant="ghost" className="w-full justify-between px-2" onClick={() => setAdvanced((a) => !a)} aria-expanded={advanced}>
            Advanced - prepayments, rate changes, fees, tax
            {advanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
          {advanced && <AdvancedInputs state={state} onChange={onChange} errors={errors} />}
        </CardContent>
      </Card>

      <div className="min-w-0 space-y-4">
        {outcome.ok ? (
          <>
            <EmiResults outcome={outcome} mode={state.mode} baseline={baseline && baseline.ok ? baseline : null} />
            {outcome.summary.tax && outcome.taxWire && <TaxBenefitTable tax={outcome.summary.tax} letOut={outcome.taxWire.loanKind === 'HOME_LET_OUT'} />}
          </>
        ) : (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground"><p>Fix the highlighted fields to see your EMI.</p>{hiddenMessages.map((m) => <p key={m} className="mt-2 text-destructive">{m}</p>)}</CardContent></Card>
        )}
      </div>

      {/* Full width below inputs and results so every column fits without sideways scrolling. */}
      {outcome.ok && (
        <div className="min-w-0 lg:col-span-2">
          <ScheduleTable summary={outcome.summary} />
        </div>
      )}
    </div>
  );
}
