import { cn } from '@/lib/cn';

/** The EveryPaisa "e" mark on its dark tile. Size it with h-/w- classes. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/everypaisa-mark.png"
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('h-10 w-10 shrink-0 rounded-md shadow-sm select-none', className)}
    />
  );
}

/** "Every" in the ink colour, "Paisa" in the logo's sage. */
export function BrandWordmark({
  className,
  everyClassName = 'text-foreground',
}: {
  className?: string;
  /** Override for surfaces with their own foreground, e.g. the sidebar. */
  everyClassName?: string;
}) {
  return (
    <span className={cn('font-brand inline-flex items-baseline leading-none text-[22px]', className)}>
      <span className={everyClassName}>Every</span>
      <span className="text-brand-sage">Paisa</span>
    </span>
  );
}
