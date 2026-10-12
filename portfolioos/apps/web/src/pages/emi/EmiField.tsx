import type { FieldError } from '@everypaisa/shared';
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
