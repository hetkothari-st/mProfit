import { cleanNumber, type FieldError } from '@everypaisa/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function errorFor(errors: FieldError[], field: string): string | undefined {
  return errors.find((e) => e.field === field)?.message;
}

export function Field(props: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; inputMode?: 'decimal' | 'numeric'; type?: string; suffix?: string }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.label}</Label>
      <div className="relative">
        <Input
          id={props.id}
          type={props.type ?? 'text'}
          inputMode={props.inputMode}
          value={props.value}
          aria-invalid={props.error ? true : undefined}
          aria-describedby={props.error ? `${props.id}-err` : undefined}
          onChange={(e) => props.onChange(e.target.value)}
          className={props.suffix ? 'pr-10' : undefined}
        />
        {props.suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{props.suffix}</span>}
      </div>
      {props.error && <p id={`${props.id}-err`} className="text-xs text-destructive">{props.error}</p>}
    </div>
  );
}

export function Select<T extends string>(props: { id: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={props.id}>{props.label}</Label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value as T)}
        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm">
        {props.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/** Years / Months segmented toggle. */
export function UnitToggle({ value, onChange, label = 'Tenure unit' }: { value: 'Y' | 'M'; onChange: (u: 'Y' | 'M') => void; label?: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="mb-[2px] flex rounded-md bg-muted p-1">
      {(['Y', 'M'] as const).map((u) => (
        <button key={u} type="button" role="radio" aria-checked={value === u} onClick={() => onChange(u)}
          className={`rounded px-3 py-1 text-sm ${value === u ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>
          {u === 'Y' ? 'Years' : 'Months'}
        </button>
      ))}
    </div>
  );
}

/**
 * Range slider kept in sync with a text field. The text field may hold a
 * value outside the slider's range; the thumb then just sits at the nearest end.
 */
export function Slider(props: { label: string; text: string; min: number; max: number; step: number; onChange: (raw: string) => void }) {
  const cleaned = cleanNumber(props.text);
  // Thumb position only (never money maths): <input type=range> takes a plain number.
  const parsed = /^(\d+\.?\d*|\.\d+)$/.test(cleaned) ? Number.parseFloat(cleaned) : props.min;
  const value = Math.min(props.max, Math.max(props.min, parsed));
  return (
    <input
      type="range"
      aria-label={props.label}
      min={props.min}
      max={props.max}
      step={props.step}
      value={value}
      onChange={(e) => props.onChange(e.target.value)}
      className="mt-2 w-full cursor-pointer accent-[hsl(var(--primary))]"
    />
  );
}
