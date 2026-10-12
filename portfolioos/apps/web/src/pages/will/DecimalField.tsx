import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { isAmountText, isPercentText, normaliseAmountText } from './allocationMath';

/**
 * A money or percentage input that never hands the payload an invalid value:
 * the typed text lives here; `onValid` fires only for text the schema accepts.
 */
export function DecimalField({ id, label, value, kind, onValid, className }: {
  id?: string;
  label: string;
  value: string;
  kind: 'percent' | 'amount';
  onValid: (v: string) => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const normalise = (t: string) => (kind === 'amount' ? normaliseAmountText(t) : t.trim());
  const ok = (t: string) => (kind === 'percent' ? isPercentText(normalise(t)) : isAmountText(t));
  const valid = ok(text);
  return (
    <div className={cn('min-w-0', className)}>
      <Input
        id={id}
        aria-label={label}
        aria-invalid={!valid}
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (ok(t)) onValid(normalise(t));
        }}
      />
      {!valid && (
        <p className="mt-1 text-xs text-negative">
          {kind === 'percent' ? 'Enter a percentage like 25 or 33.33' : 'Enter an amount like 50000 or 50000.50'}
        </p>
      )}
    </div>
  );
}
