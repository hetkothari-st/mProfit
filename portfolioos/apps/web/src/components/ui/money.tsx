import * as React from 'react';
import { cn } from '@/lib/cn';

interface MoneyProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Pre-formatted INR string (e.g. output of formatINR). */
  children: string;
  /** Style applied to the rupee glyph (defaults to accent gold, smaller optical size). */
  symbolClassName?: string;
  /** When true, render hero treatment with subtle gradient on digits. */
  hero?: boolean;
}

/**
 * Renders a formatted INR string with optically-tuned ₹ symbol — accent-coloured,
 * smaller, baseline-aligned, slightly kerned away from the first digit. Optional
 * `hero` mode adds a subtle ink gradient to the digits so big numbers carry weight.
 */
export const Money = React.forwardRef<HTMLSpanElement, MoneyProps>(
  ({ children, className, symbolClassName, hero, ...props }, ref) => {
    const text = String(children ?? '');
    const match = text.match(/^([+-]?)(₹|Rs\.?\s?)?(.*)$/);
    if (!match) {
      return <span ref={ref} className={cn('numeric', className)} {...props}>{text}</span>;
    }
    const [, sign, symbol, digits] = match;

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-baseline whitespace-nowrap numeric',
          className,
        )}
        {...props}
      >
        {sign && (
          <span aria-hidden="true" className="money-sign mr-[0.04em]">{sign}</span>
        )}
        {symbol && (
          <span
            aria-hidden="true"
            className={cn(
              'mr-[0.06em] translate-y-[-0.04em] text-[0.74em] font-medium text-accent/85',
              symbolClassName,
            )}
            style={{ letterSpacing: 0 }}
          >
            {symbol.trim()}
          </span>
        )}
        <span
          className={cn(
            'tabular-nums',
            hero ? 'money-hero-digits' : 'money-digits',
          )}
        >
          {digits}
        </span>
      </span>
    );
  },
);
Money.displayName = 'Money';
