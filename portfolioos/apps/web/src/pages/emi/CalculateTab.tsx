import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { computeCalc, type CalcMode, type CalcOutcome, type CalcState } from './emiState';
import { useDebounced } from './useDebounced';
import { AdvancedInputs } from './AdvancedInputs';
import { EmiResults } from './EmiResults';
import { ScheduleTable } from './ScheduleTable';
import { Field, errorFor } from './EmiField';

const MODES: { value: CalcMode; label: string }[] = [
  { value: 'EMI', label: 'EMI' },
  { value: 'MAX_LOAN', label: 'Max loan' },
  { value: 'TENURE', label: 'Tenure' },
];

export function CalculateTab({ state, onChange, onOutcome }: { state: CalcState; onChange: (s: CalcState) => void; onOutcome?: (o: CalcOutcome) => void }) {
  const [advanced, setAdvanced] = useState(state.prepayments.length > 0 || state.rateChanges.length > 0 || state.feesOn || state.taxOn);
  const debounced = useDebounced(state, 150);
  const outcome = useMemo(() => computeCalc(debounced), [debounced]);
  // Same inputs without prepayments/rate changes, for "interest saved".
  const baseline = useMemo(
    () => (debounced.prepayments.length > 0 ? computeCalc({ ...debounced, prepayments: [], rateChanges: [] }) : null),
    [debounced],
  );
  useEffect(() => { onOutcome?.(outcome); }, [outcome, onOutcome]);
  const errors = outcome.ok ? [] : outcome.errors;
  const set = <K extends keyof CalcState>(k: K, v: CalcState[K]) => onChange({ ...state, [k]: v });

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
            <Field id="emi-principal" label="Loan amount (Rs.)" inputMode="decimal" value={state.principal} onChange={(v) => set('principal', v)} error={errorFor(errors, 'principal')} />
          )}
          {state.mode !== 'EMI' && (
            <Field id="emi-emi" label="EMI you can pay (Rs.)" inputMode="decimal" value={state.emi} onChange={(v) => set('emi', v)} error={errorFor(errors, 'emi')} />
          )}
          <Field id="emi-rate" label="Interest rate (% p.a.)" inputMode="decimal" value={state.ratePct} onChange={(v) => set('ratePct', v)} error={errorFor(errors, 'annualRatePct')} suffix="%" />
          {state.mode !== 'TENURE' && (
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <Field id="emi-tenure" label="Tenure" inputMode="numeric" value={state.tenure} onChange={(v) => set('tenure', v)} error={errorFor(errors, 'tenureMonths')} />
              <div role="radiogroup" aria-label="Tenure unit" className="mb-[2px] flex rounded-md bg-muted p-1">
                {(['Y', 'M'] as const).map((u) => (
                  <button key={u} type="button" role="radio" aria-checked={state.tenureUnit === u} onClick={() => set('tenureUnit', u)}
                    className={`rounded px-3 py-1 text-sm ${state.tenureUnit === u ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>
                    {u === 'Y' ? 'Years' : 'Months'}
                  </button>
                ))}
              </div>
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
            <ScheduleTable summary={outcome.summary} />
          </>
        ) : (
          <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Fix the highlighted fields to see your EMI.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
