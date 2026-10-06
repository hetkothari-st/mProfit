import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { inr } from './verdict';

const MONEY = /^\d+(\.\d+)?$/;

/** A rupee amount the user can edit. Shows the amount in words-ish ("₹18 L") or what to fix. */
export function MoneyField({
  id,
  label,
  value,
  onChange,
  blankNote = 'Leave blank if none',
  note,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  blankNote?: string;
  note?: string;
}) {
  const clean = value.replace(/,/g, '').trim();
  const valid = clean === '' || MONEY.test(clean);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        aria-invalid={!valid}
        aria-describedby={`${id}-help`}
        onChange={(e) => onChange(e.target.value)}
      />
      <p id={`${id}-help`} className={`text-xs ${valid ? 'text-muted-foreground' : 'text-negative'}`}>
        {valid
          ? `${clean === '' ? blankNote : inr(clean)}${note ? ` · ${note}` : ''}`
          : 'Enter an amount in rupees using digits only, like 1200000.'}
      </p>
    </div>
  );
}

/** Whole years, 0–60. Keeps what's typed so clearing the box doesn't snap to 0. */
export function YearsField({
  id,
  label,
  value,
  onChange,
  note,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (v: number) => void;
  note?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => {
    setDraft((d) => (Number.parseInt(d, 10) === value ? d : String(value)));
  }, [value]);

  const parsed = Number.parseInt(draft, 10);
  const valid = /^\d{1,2}$/.test(draft.trim()) && parsed <= 60;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={draft}
        aria-invalid={!valid}
        aria-describedby={`${id}-help`}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          const n = Number.parseInt(next, 10);
          if (/^\d{1,2}$/.test(next.trim()) && n <= 60) onChange(n);
        }}
      />
      <p id={`${id}-help`} className={`text-xs ${valid ? 'text-muted-foreground' : 'text-negative'}`}>
        {valid ? note : 'Enter a number of years from 0 to 60.'}
      </p>
    </div>
  );
}

export function CheckRow({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="min-w-0">{children}</span>
    </label>
  );
}
