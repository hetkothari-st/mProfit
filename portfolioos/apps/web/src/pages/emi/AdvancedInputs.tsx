import { Plus, Trash2 } from 'lucide-react';
import type { FieldError } from '@everypaisa/shared';
import { Button } from '@/components/ui/button';
import { Field, Select, errorFor } from './EmiField';
import type { CalcState, PrepaymentRow, RateChangeRow } from './emiState';

const MODE_LABEL = { REDUCE_TENURE: 'Cut tenure', REDUCE_EMI: 'Cut EMI' } as const;
const newId = () => Math.random().toString(36).slice(2, 10);

function Switch({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 text-sm font-medium">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4" />
      {label}
    </label>
  );
}

export function AdvancedInputs({ state, onChange, errors }: { state: CalcState; onChange: (s: CalcState) => void; errors: FieldError[] }) {
  const set = <K extends keyof CalcState>(k: K, v: CalcState[K]) => onChange({ ...state, [k]: v });
  const setPre = (i: number, patch: Partial<PrepaymentRow>) => set('prepayments', state.prepayments.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const setRc = (i: number, patch: Partial<RateChangeRow>) => set('rateChanges', state.rateChanges.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const modeOptions = (['REDUCE_TENURE', 'REDUCE_EMI'] as const).map((v) => ({ value: v, label: MODE_LABEL[v] }));

  return (
    <div className="space-y-6 border-t pt-4">
      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Prepayments</h3>
        {state.prepayments.map((p, i) => (
          <div key={p.id} data-testid={`prepayment-${i}`} className="grid grid-cols-2 gap-2 rounded-md border p-2">
            <Field id={`pre-${p.id}-m`} label="Month #" inputMode="numeric" value={p.month} onChange={(v) => setPre(i, { month: v })} error={errorFor(errors, `prepayments.${i}.month`)} />
            <Field id={`pre-${p.id}-a`} label="Amount (Rs.)" inputMode="decimal" value={p.amount} onChange={(v) => setPre(i, { amount: v })} error={errorFor(errors, `prepayments.${i}.amount`)} />
            <Select id={`pre-${p.id}-r`} label="Repeat" value={p.recurrence} onChange={(v) => setPre(i, { recurrence: v })} options={[{ value: 'ONCE', label: 'Once' }, { value: 'YEARLY', label: 'Every year' }]} />
            <Select id={`pre-${p.id}-mode`} label="Effect" value={p.mode} onChange={(v) => setPre(i, { mode: v })} options={modeOptions} />
            <Button type="button" variant="ghost" size="sm" className="col-span-2 justify-self-end" onClick={() => set('prepayments', state.prepayments.filter((_, j) => j !== i))}>
              <Trash2 className="mr-1 h-4 w-4" /> Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set('prepayments', [...state.prepayments, { id: newId(), month: '12', amount: '1,00,000', recurrence: 'ONCE', mode: 'REDUCE_TENURE' }])}>
          <Plus className="mr-1 h-4 w-4" /> Add prepayment
        </Button>
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Rate changes (floating loans)</h3>
        {state.rateChanges.map((c, i) => (
          <div key={c.id} data-testid={`ratechange-${i}`} className="grid grid-cols-2 gap-2 rounded-md border p-2">
            <Field id={`rc-${c.id}-m`} label="From month #" inputMode="numeric" value={c.fromMonth} onChange={(v) => setRc(i, { fromMonth: v })} error={errorFor(errors, `rateChanges.${i}.fromMonth`)} />
            <Field id={`rc-${c.id}-r`} label="New rate (%)" inputMode="decimal" value={c.ratePct} onChange={(v) => setRc(i, { ratePct: v })} error={errorFor(errors, `rateChanges.${i}.annualRatePct`)} />
            <Select id={`rc-${c.id}-mode`} label="Bank adjusts" value={c.mode} onChange={(v) => setRc(i, { mode: v })} options={[{ value: 'REDUCE_TENURE', label: 'Tenure (keep EMI)' }, { value: 'REDUCE_EMI', label: 'EMI (keep tenure)' }]} />
            <Button type="button" variant="ghost" size="sm" className="self-end justify-self-end" onClick={() => set('rateChanges', state.rateChanges.filter((_, j) => j !== i))}>
              <Trash2 className="mr-1 h-4 w-4" /> Remove
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => set('rateChanges', [...state.rateChanges, { id: newId(), fromMonth: '13', ratePct: state.ratePct, mode: 'REDUCE_TENURE' }])}>
          <Plus className="mr-1 h-4 w-4" /> Add rate change
        </Button>
      </section>

      <section className="space-y-3">
        <Switch id="fees-on" label="Processing fee and charges" checked={state.feesOn} onChange={(v) => set('feesOn', v)} />
        {state.feesOn && (
          <div className="grid grid-cols-2 gap-2">
            <Select id="fee-kind" label="Fee type" value={state.feeKind} onChange={(v) => set('feeKind', v)} options={[{ value: 'PCT', label: '% of loan' }, { value: 'AMOUNT', label: 'Fixed Rs.' }]} />
            <Field id="fee-value" label={state.feeKind === 'PCT' ? 'Fee (%)' : 'Fee (Rs.)'} inputMode="decimal" value={state.feeValue} onChange={(v) => set('feeValue', v)} error={errorFor(errors, 'fees.processingFeeValue')} />
            <Field id="fee-gst" label="GST on fee (%)" inputMode="decimal" value={state.gstPct} onChange={(v) => set('gstPct', v)} error={errorFor(errors, 'fees.gstPct')} />
            <Field id="fee-other" label="Other charges (Rs.)" inputMode="decimal" value={state.otherCharges} onChange={(v) => set('otherCharges', v)} error={errorFor(errors, 'fees.otherCharges')} />
          </div>
        )}
      </section>

      <section className="space-y-3">
        <Switch id="tax-on" label="Tax benefit" checked={state.taxOn} onChange={(v) => set('taxOn', v)} />
        {state.taxOn && (
          <div className="grid grid-cols-2 gap-2">
            <Select id="tax-regime" label="Tax regime" value={state.regime} onChange={(v) => set('regime', v)} options={[{ value: 'OLD', label: 'Old regime' }, { value: 'NEW', label: 'New regime' }]} />
            <Select id="tax-kind" label="Loan for" value={state.loanKind} onChange={(v) => set('loanKind', v)} options={[
              { value: 'HOME_SELF', label: 'Home - self-occupied' }, { value: 'HOME_LET_OUT', label: 'Home - let out' },
              { value: 'EDUCATION', label: 'Education' }, { value: 'NONE', label: 'Other (no benefit)' },
            ]} />
            <Field id="tax-slab" label="Your tax slab (%)" inputMode="decimal" value={state.slabPct} onChange={(v) => set('slabPct', v)} error={errorFor(errors, 'tax.slabPct')} />
            <Field id="tax-80c" label="80C room left (Rs.)" inputMode="decimal" value={state.remaining80C} onChange={(v) => set('remaining80C', v)} error={errorFor(errors, 'tax.remaining80C')} />
          </div>
        )}
      </section>
    </div>
  );
}
