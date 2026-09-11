import {
  RULES_OF_THUMB,
  SUPER_TOP_UP_EXPLAINER,
  type CoverageAssumptions,
  type CoverageFacts,
  type HealthCheck,
  type NextStep,
  type ParentsAnswer,
} from '@portfolioos/shared';
import { Link } from 'react-router-dom';
import { AreaCard } from './AreaCard';
import { FlagList } from './FlagList';
import { MoneyField } from './fields';
import { inr } from './verdict';

const PARENTS_OPTIONS: Array<[ParentsAnswer, string]> = [
  ['YES', 'Yes'],
  ['NO', 'No'],
  ['UNSURE', 'Not sure'],
];

/** Health cover against a benchmark the user sets, plus the fine print worth checking. */
export function HealthCoverCard({
  facts,
  check,
  assumptions,
  onChange,
  onAddPolicy,
}: {
  facts: CoverageFacts;
  check: HealthCheck;
  assumptions: CoverageAssumptions;
  onChange: (patch: Partial<CoverageAssumptions>) => void;
  onAddPolicy: (step: NextStep) => void;
}) {
  // The "not sure" question is asked by the form itself, so don't repeat it as a flag.
  const flags = check.flags.filter((f) => !(f.id === 'parents' && f.tone === 'neutral'));

  return (
    <AreaCard id="coverage-health" title="Health cover" check={check} onAddPolicy={onAddPolicy}>
      {facts.healthPolicies.length > 0 && (
        <ul className="space-y-1 text-sm">
          {facts.healthPolicies.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-x-3">
              <Link to={`/insurance/${p.id}`} className="min-w-0 truncate hover:underline">
                {p.insurer}
                {p.planName ? ` — ${p.planName}` : ''}
              </Link>
              <span className="tabular-nums text-muted-foreground">
                {inr(p.sumAssured)}
                {p.members.length > 0 && ` · ${p.members.join(', ')}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <MoneyField
          id="cov-health-benchmark"
          label="Health cover to compare against"
          value={assumptions.healthBenchmark}
          blankNote="Enter a figure to compare with"
          onChange={(v) => onChange({ healthBenchmark: v })}
          note={RULES_OF_THUMB.healthBenchmark}
        />
        <fieldset>
          <legend className="text-sm font-medium">Do your parents rely on you for their medical bills?</legend>
          <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-2">
            {PARENTS_OPTIONS.map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="cov-parents"
                  className="h-4 w-4 accent-[hsl(var(--accent))]"
                  checked={assumptions.parentsDependent === value}
                  onChange={() => onChange({ parentsDependent: value })}
                />
                {label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            If they do, check they have cover of their own or are on one of your policies.
          </p>
        </fieldset>
      </div>

      <FlagList flags={flags} onAddPolicy={onAddPolicy} />

      <details className="group rounded-lg border border-border/70 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium marker:text-muted-foreground">What’s a super top-up?</summary>
        <p className="mt-2 text-muted-foreground">{SUPER_TOP_UP_EXPLAINER}</p>
      </details>
    </AreaCard>
  );
}
