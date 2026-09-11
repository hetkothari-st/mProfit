import { Link } from 'react-router-dom';
import type { NextStep, VehicleCheck, VehicleState } from '@portfolioos/shared';
import { SourceLink } from '@/components/insurance/SourceLink';
import { TONE_DOT, TONE_TEXT, formatDay, type Tone } from '@/lib/insurance';
import { AreaCard, NextStepButton } from './AreaCard';

const STATE_TONE: Record<VehicleState, Tone> = {
  COVERED: 'ok',
  UNTRACKED: 'neutral',
  EXPIRED: 'danger',
  NONE: 'danger',
};

/** Each vehicle's motor cover, and the law that makes third-party cover compulsory. */
export function VehicleCoverCard({ check, onAddPolicy }: { check: VehicleCheck; onAddPolicy: (step: NextStep) => void }) {
  return (
    <AreaCard id="coverage-vehicles" title="Vehicles" check={check} onAddPolicy={onAddPolicy} hideNext>
      {check.vehicles.length > 0 && (
        <ul className="divide-y divide-border/60 rounded-lg border border-border/70">
          {check.vehicles.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <Link to={`/vehicles/${v.id}`} className="block truncate text-sm font-medium hover:underline">
                  {v.label}
                  {v.label !== v.registrationNo && <span className="font-normal text-muted-foreground"> · {v.registrationNo}</span>}
                </Link>
                <p className={`mt-0.5 flex gap-1.5 text-sm ${TONE_TEXT[STATE_TONE[v.state]]}`}>
                  <span aria-hidden className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${TONE_DOT[STATE_TONE[v.state]]}`} />
                  <span>{v.text}</span>
                </p>
              </div>
              {v.next && <NextStepButton step={v.next} onAddPolicy={onAddPolicy} />}
            </li>
          ))}
        </ul>
      )}

      {check.vehicles.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="text-foreground">The law:</span> {check.rule.text} <SourceLink source={check.rule.source} />{' '}
          <span className="whitespace-nowrap">Checked {formatDay(check.rule.checkedOn)}.</span>
        </p>
      )}
    </AreaCard>
  );
}
