import type { AreaCheck } from '@everypaisa/shared';
import { Card } from '@/components/ui/card';
import { TONE_DOT, TONE_TEXT } from '@/lib/insurance';
import { verdictLabel, verdictTone } from './verdict';

/** All four verdicts at a glance, each jumping to its card. */
export function CoverageSummary({ areas }: { areas: Array<{ id: string; title: string; check: AreaCheck }> }) {
  return (
    <Card className="grid grid-cols-2 divide-border/60 p-0 sm:grid-cols-4 sm:divide-x">
      {areas.map(({ id, title, check }) => {
        const tone = verdictTone(check);
        return (
          <a key={id} href={`#${id}`} className="px-4 py-3 transition-colors hover:bg-muted/40 sm:px-5">
            <p className="text-xs text-muted-foreground">{title}</p>
            <p className={`mt-1 flex items-center gap-1.5 text-sm font-medium ${TONE_TEXT[tone]}`}>
              <span aria-hidden className={`h-2 w-2 rounded-full ${TONE_DOT[tone]}`} />
              {verdictLabel(check)}
            </p>
          </a>
        );
      })}
    </Card>
  );
}
