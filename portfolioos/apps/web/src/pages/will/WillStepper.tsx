import { cn } from '@/lib/cn';
import { WILL_STEPS } from './willSteps';

export function WillStepper({ current, wide, onSelect }: { current: number; wide: boolean; onSelect: (n: number) => void }) {
  const meta = WILL_STEPS.find((s) => s.n === current) ?? WILL_STEPS[1]!;
  if (!wide) {
    return (
      <div className="space-y-2" data-testid="will-stepper-compact">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Step {current} of {WILL_STEPS.length}</span>
          <span className="truncate font-medium text-foreground">{meta.label}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${(current / WILL_STEPS.length) * 100}%` }} />
        </div>
      </div>
    );
  }
  return (
    <ol className="flex items-center gap-1" data-testid="will-stepper">
      {WILL_STEPS.map((s) => (
        <li key={s.n} className="flex min-w-0 flex-1 items-center gap-1">
          <button
            type="button"
            onClick={() => onSelect(s.n)}
            aria-current={s.n === current ? 'step' : undefined}
            className={cn(
              'flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-xs',
              s.n === current ? 'font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span
              className={cn(
                'grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px]',
                s.n === current ? 'bg-primary text-primary-foreground' : s.n < current ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
              )}
            >
              {s.n}
            </span>
            <span className="truncate">{s.label}</span>
          </button>
          {s.n < WILL_STEPS.length && <span className="h-px min-w-2 flex-1 bg-border" />}
        </li>
      ))}
    </ol>
  );
}
