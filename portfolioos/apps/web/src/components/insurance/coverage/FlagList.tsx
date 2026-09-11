import type { CoverageFlag, NextStep } from '@portfolioos/shared';
import { TONE_DOT } from '@/lib/insurance';
import { NextStepButton } from './AreaCard';

/** Things to check, each with its next step. */
export function FlagList({ flags, onAddPolicy }: { flags: CoverageFlag[]; onAddPolicy: (step: NextStep) => void }) {
  if (flags.length === 0) return null;
  return (
    <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
      {flags.map((f) => (
        <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
          <p className="flex min-w-0 flex-1 gap-2.5 text-sm">
            <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[f.tone]}`} />
            <span>{f.text}</span>
          </p>
          {f.next && <NextStepButton step={f.next} onAddPolicy={onAddPolicy} variant="ghost" />}
        </li>
      ))}
    </ul>
  );
}
