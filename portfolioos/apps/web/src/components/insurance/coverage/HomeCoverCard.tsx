import { Link } from 'react-router-dom';
import type { CoverageFacts, HomeCheck, NextStep } from '@portfolioos/shared';
import { AreaCard } from './AreaCard';

/** Home cover — optional, so it's a gentle note rather than a gap. */
export function HomeCoverCard({
  facts,
  check,
  onAddPolicy,
}: {
  facts: CoverageFacts;
  check: HomeCheck;
  onAddPolicy: (step: NextStep) => void;
}) {
  return (
    <AreaCard id="coverage-home" title="Home" check={check} onAddPolicy={onAddPolicy}>
      {facts.properties.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm">
          {facts.properties.map((p) => (
            <li key={p.id}>
              <Link
                to={p.kind === 'OWNED' ? `/real-estate/${p.id}` : `/rental/${p.id}`}
                className="inline-block rounded-full border border-border/70 px-3 py-1 hover:border-accent/50"
              >
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AreaCard>
  );
}
