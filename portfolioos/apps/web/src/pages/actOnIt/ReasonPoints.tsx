import { cn } from '@/lib/cn';
import { figureParts, reasonPoints } from './actOnItView';

/**
 * The reason as short points, one per sentence, with rupee amounts and
 * percentages set in the number font. `limit` keeps the card short; the full
 * list is in "Ask why".
 */
export function ReasonPoints({ rationale, limit, className }: { rationale: string; limit?: number; className?: string }) {
  const points = reasonPoints(rationale).slice(0, limit);
  return (
    <ul className={cn('space-y-2.5', className)}>
      {points.map((point) => (
        <li key={point} className="flex gap-3 text-[14.5px] leading-relaxed text-muted-foreground">
          <span aria-hidden className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
          <span>
            {figureParts(point).map((p, i) =>
              p.figure ? <b key={i} className="numeric-display font-semibold text-foreground">{p.text}</b> : <span key={i}>{p.text}</span>,
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
