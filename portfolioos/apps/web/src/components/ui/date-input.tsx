import * as React from 'react';
import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/cn';
import { formatIsoAsDmy, maskDateTyping, normalizeIso, parseDateText } from '@/lib/dateInput';

export interface DateInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'defaultValue' | 'onChange' | 'ref'> {
  /** YYYY-MM-DD, or empty. Leave it out for a form library that manages the value through `ref`. */
  value?: string | null;
  defaultValue?: string;
  /** Called with `e.target.value` as YYYY-MM-DD, or '' while the date is empty or incomplete. */
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/**
 * A date field that always reads dd/mm/yyyy.
 *
 * The browser's own date box draws itself from the browser's language and
 * region, so it showed mm/dd/yyyy to Indian users on US-set browsers, and
 * nothing the page does changes that. This is a text box with a calendar
 * button instead. The value it holds and reports is still YYYY-MM-DD, as the
 * native box's was, so a form that stores or sends a date does not change.
 *
 * It stands in for `<Input type="date">` in all three ways that was used:
 *   - controlled:  value + onChange(e) reading e.target.value
 *   - spread from a `field(...)` helper that returns value/onChange
 *   - react-hook-form `{...register('x')}`, which reads and writes the value
 *     through `ref`. The ref points at a hidden input whose `value` is the
 *     YYYY-MM-DD date; setting it (a default, reset, setValue) updates what is
 *     shown, and focusing it focuses the visible box.
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, defaultValue, onChange, onBlur, name, className, disabled, id, min, max, placeholder, ...rest },
  forwardedRef,
) {
  const controlled = value !== undefined;
  const [iso, setIso] = React.useState(() => normalizeIso(controlled ? value : defaultValue));
  const [text, setText] = React.useState(() => formatIsoAsDmy(controlled ? value : defaultValue));
  const [blurred, setBlurred] = React.useState(false);
  const isoRef = React.useRef(iso);
  const textRef = React.useRef(text);
  const visibleRef = React.useRef<HTMLInputElement>(null);
  const pickerRef = React.useRef<HTMLInputElement>(null);
  // Keep the latest callbacks without re-creating the hidden input's accessor.
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;
  const nameRef = React.useRef(name);
  nameRef.current = name;

  const show = React.useCallback((nextIso: string) => {
    isoRef.current = nextIso;
    textRef.current = formatIsoAsDmy(nextIso);
    setIso(nextIso);
    setText(textRef.current);
  }, []);

  // The parent changed the value from outside (not by this field's own typing).
  React.useEffect(() => {
    if (!controlled) return;
    const next = normalizeIso(value);
    if (next !== (parseDateText(textRef.current) ?? '')) show(next);
  }, [controlled, value, show]);

  const emit = (nextIso: string, type: 'change' | 'blur') => {
    // Not a DOM event: the handlers it goes to read `e.target.value` / `e.target.name`.
    const event = { target: { name: nameRef.current, value: nextIso }, type } as unknown as React.ChangeEvent<HTMLInputElement>;
    if (type === 'change') onChangeRef.current?.(event);
    else onBlur?.(event as unknown as React.FocusEvent<HTMLInputElement>);
  };

  // The element a form library registers: the date as YYYY-MM-DD, settable.
  const setHidden = React.useCallback(
    (node: HTMLInputElement | null) => {
      if (node) {
        Object.defineProperty(node, 'value', {
          configurable: true,
          get: () => isoRef.current,
          set: (v: unknown) => show(normalizeIso(v == null ? '' : String(v))),
        });
        node.focus = () => visibleRef.current?.focus();
      }
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef, show],
  );

  const commit = (nextText: string) => {
    textRef.current = nextText;
    setText(nextText);
    const nextIso = parseDateText(nextText) ?? '';
    if (nextIso !== isoRef.current) {
      isoRef.current = nextIso;
      setIso(nextIso);
      emit(nextIso, 'change');
    }
  };

  // Not a real date, or outside min/max (the native box flagged both).
  const parsedNow = parseDateText(text);
  const outOfRange =
    parsedNow !== null &&
    ((typeof min === 'string' && min !== '' && parsedNow < min) || (typeof max === 'string' && max !== '' && parsedNow > max));
  const invalid = blurred && text.trim() !== '' && (parsedNow === null || outOfRange);

  return (
    <div className="relative">
      <input type="hidden" ref={setHidden} />
      <input
        {...rest}
        ref={visibleRef}
        id={id}
        name={name}
        type="text"
        min={typeof min === 'string' ? min : undefined}
        max={typeof max === 'string' ? max : undefined}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder ?? 'dd/mm/yyyy'}
        maxLength={10}
        disabled={disabled}
        value={text}
        aria-invalid={invalid ? true : undefined}
        title={
          invalid
            ? outOfRange
              ? `Use a date between ${formatIsoAsDmy(typeof min === 'string' ? min : '') || 'any time'} and ${formatIsoAsDmy(typeof max === 'string' ? max : '') || 'any time'}`
              : 'Enter a real date as dd/mm/yyyy'
            : rest.title
        }
        onChange={(e) => commit(maskDateTyping(e.target.value, textRef.current))}
        onBlur={() => {
          setBlurred(true);
          // 5/6/2026 is tidied to 05/06/2026 once the person has finished.
          const parsed = parseDateText(textRef.current);
          if (parsed) {
            textRef.current = formatIsoAsDmy(parsed);
            setText(textRef.current);
          }
          emit(isoRef.current, 'blur');
        }}
        className={cn(
          'flex h-10 w-full rounded-md border border-border/80 bg-card py-2 pl-3.5 pr-9 text-[13.5px] text-foreground transition-all',
          'placeholder:text-muted-foreground/70',
          'hover:border-border focus-visible:outline-none focus-visible:border-accent/60 focus-visible:ring-2 focus-visible:ring-accent/20 focus-visible:ring-offset-0',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'autofill:!bg-card autofill:shadow-[inset_0_0_0_1000px_hsl(var(--card))]',
          invalid && 'border-negative',
          className,
        )}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label="Pick a date from the calendar"
        onClick={() => pickerRef.current?.showPicker?.()}
        className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground disabled:opacity-50"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      {/* The browser's calendar, used only to pick: its box is never shown. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={iso}
        min={typeof min === 'string' ? min : undefined}
        max={typeof max === 'string' ? max : undefined}
        disabled={disabled}
        onChange={(e) => {
          const picked = normalizeIso(e.target.value);
          commit(formatIsoAsDmy(picked));
          visibleRef.current?.focus();
        }}
        className="pointer-events-none absolute right-1.5 top-1/2 h-px w-px opacity-0"
      />
    </div>
  );
});
DateInput.displayName = 'DateInput';
