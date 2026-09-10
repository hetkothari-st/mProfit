import {
  useEffect,
  useId,
  useMemo,
  useState,
  type InputHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/cn';

export interface SuggestOption {
  value: string;
  /** Secondary text shown on the right (e.g. an IFSC prefix or a relation). */
  hint?: string;
  /** Extra search terms: abbreviations, former names. */
  keywords?: string[];
}

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
  options: SuggestOption[];
  onPick?: (option: SuggestOption) => void;
  maxResults?: number;
}

/** Prefix matches first, then substring matches, each in list order. */
function rank(options: SuggestOption[], query: string, max: number): SuggestOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return options.slice(0, max);
  const prefix: SuggestOption[] = [];
  const contains: SuggestOption[] = [];
  for (const o of options) {
    const terms = [o.value, ...(o.keywords ?? [])].map((t) => t.toLowerCase());
    if (terms.some((t) => t.startsWith(q))) prefix.push(o);
    else if (terms.some((t) => t.includes(q))) contains.push(o);
  }
  return [...prefix, ...contains].slice(0, max);
}

/**
 * Text input with a filtered suggestion list (ARIA combobox). Free text is
 * always allowed — suggestions only speed typing up. Arrow keys move, Enter
 * picks, Escape closes the list without closing an enclosing dialog.
 */
export function SuggestInput({
  value,
  onValueChange,
  options,
  onPick,
  maxResults = 8,
  className,
  onFocus,
  onBlur,
  onKeyDown,
  ...inputProps
}: Props) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const results = useMemo(() => rank(options, value, maxResults), [options, value, maxResults]);
  // Nothing to suggest once the value already is the only match.
  const exactOnly =
    results.length === 1 && results[0]!.value.toLowerCase() === value.trim().toLowerCase();
  const showList = open && results.length > 0 && !exactOnly;

  // Radix dialogs close on an Escape keydown caught at the document in the
  // capture phase, before React sees it. While the list is open, intercept
  // Escape one level higher (window) so it closes only the list.
  useEffect(() => {
    if (!showList) return;
    function onWindowKeyDown(e: globalThis.KeyboardEvent) {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setOpen(false);
      setActive(-1);
    }
    window.addEventListener('keydown', onWindowKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onWindowKeyDown, { capture: true });
  }, [showList]);

  function pick(option: SuggestOption) {
    onValueChange(option.value);
    onPick?.(option);
    setOpen(false);
    setActive(-1);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && showList && active >= 0 && results[active]) {
      e.preventDefault();
      pick(results[active]);
    }
  }

  return (
    <div className="relative">
      <Input
        {...inputProps}
        value={value}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listId}
        aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className={className}
        onChange={(e) => {
          onValueChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={(e) => {
          setOpen(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setOpen(false);
          setActive(-1);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          {results.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              // Keep focus in the input so blur doesn't close the list first.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActive(i)}
              onClick={() => pick(o)}
              className={cn(
                'flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 text-sm',
                i === active && 'bg-accent text-accent-foreground',
              )}
            >
              <span className="truncate">{o.value}</span>
              {o.hint && <span className="shrink-0 text-xs text-muted-foreground">{o.hint}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
