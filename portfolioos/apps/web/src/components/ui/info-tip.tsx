import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Info } from 'lucide-react';
import { cn } from '@/lib/cn';

export interface InfoTipProps {
  /** What the tip explains — used for the accessible label, e.g. "Sharpe ratio". */
  title: string;
  /** Short plain-language explanation. A string, or a few short paragraphs. */
  children: React.ReactNode;
  className?: string;
  /** Which side of the button the panel opens on. Radix flips it if there's no room. */
  side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * A small "i" button that opens a short explanation.
 *
 * A popover rather than a hover tooltip on purpose: tooltips only open on
 * hover or focus, so on a phone there is no way to read them. This opens on
 * tap, click, Enter or Space, closes on Escape or an outside tap, and keeps
 * focus management and screen-reader semantics from Radix.
 */
export function InfoTip({ title, children, className, side = 'top' }: InfoTipProps) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`About ${title}`}
          className={cn(
            'inline-grid h-5 w-5 shrink-0 place-items-center rounded-full align-middle',
            'text-muted-foreground/70 transition-colors hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            'data-[state=open]:text-foreground',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" strokeWidth={1.9} />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side={side}
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className={cn(
            'z-50 w-72 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-popover p-3',
            'text-[12.5px] leading-relaxed text-popover-foreground shadow-elev-lg',
            'focus:outline-none',
          )}
        >
          <p className="mb-1 text-[11px] font-medium uppercase tracking-kerned text-muted-foreground">
            {title}
          </p>
          <div className="space-y-1.5">{children}</div>
          <PopoverPrimitive.Arrow className="fill-border" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
