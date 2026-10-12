import { useEffect, useRef, useState } from 'react';
import { Decimal } from '@everypaisa/shared';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';
import { isAmountText, isPercentText, normaliseAmountText } from './allocationMath';

/**
 * A money or percentage input that never hands the payload an invalid value:
 * the typed text lives here; `onValid` fires only for text the schema accepts
 * and that is above zero. `onInvalid` fires for anything else (including an
 * empty box), so a parent holding a draft can disable its button.
 */
export function DecimalField({ id, label, value, kind, onValid, onInvalid, className }: {
  id?: string;
  label: string;
  value: string;
  kind: 'percent' | 'amount';
  onValid: (v: string) => void;
  onInvalid?: () => void;
  className?: string;
}) {
  const [text, setText] = useState(value);
  const focused = useRef(false);
  // Follow the stored value, but never overwrite what is being typed.
  useEffect(() => {
    if (!focused.current) setText(value);
  }, [value]);
  const normalise = (t: string) => (kind === 'amount' ? normaliseAmountText(t) : t.trim());
  const ok = (t: string) => {
    const n = normalise(t);
    const shaped = kind === 'percent' ? isPercentText(n) : isAmountText(t);
    return shaped && new Decimal(n).greaterThan(0);
  };
  const valid = ok(text);
  const empty = text.trim() === '' && value === '';
  return (
    <div className={cn('min-w-0', className)}>
      <Input
        id={id}
        aria-label={label}
        aria-invalid={!valid && !empty}
        inputMode="decimal"
        value={text}
        onFocus={() => { focused.current = true; }}
        onBlur={() => {
          focused.current = false;
          setText(value);
        }}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (ok(t)) onValid(normalise(t));
          else onInvalid?.();
        }}
      />
      {!valid && !empty && (
        <p className="mt-1 text-xs text-negative">
          {kind === 'percent' ? 'Enter a percentage above 0, like 25 or 33.33' : 'Enter an amount above 0, like 50000 or 50000.50'}
        </p>
      )}
    </div>
  );
}
