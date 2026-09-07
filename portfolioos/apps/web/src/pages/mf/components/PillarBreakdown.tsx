import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { MF_HORIZONS, type MfPillarInput, type MfPillarScore } from '@portfolioos/shared';
import { cn } from '@/lib/cn';
import { MetricValue } from './MetricValue';
import {
  formatPercentileOrdinal,
  formatRatio,
  formatRatioAsPct,
  humanizeKey,
  statusReasonText,
} from '../mfFormat';

/**
 * Why the score is what it is.
 *
 * `03-SCORING.md §10` stores, per pillar input, the value, its percentile, its
 * status, the universe median and the per-horizon percentiles before blending,
 * "so the UI and the findings engine can say 'Sortino 1.12 vs category median
 * 0.87 (78th percentile), consistent across 3, 5 and 10 years' without
 * recomputation". `06 §5` then requires every score in the UI to link to its
 * pillar breakdown and every input to its universe median and percentile. This
 * component is that requirement — a rating nobody can interrogate is a number
 * the user has to take on faith, which is precisely what a research product is
 * not allowed to ask for.
 *
 * Three details worth keeping:
 *
 *  1. **`weight` is the post-redistribution weight.** When no input in a pillar
 *     had `status: OK` the pillar's own score is null and its weight was
 *     redistributed to the others, so the weights on screen always sum to 1 and
 *     the reader can check that. Showing the pre-redistribution weight would
 *     make the arithmetic on screen fail to add up.
 *  2. **A null pillar score is not a zero pillar.** A pillar with no usable
 *     input contributed nothing *and was not counted*; rendering it as 0 would
 *     say the fund scored worst-possible on it.
 *  3. **Keys come from the models, not from here.** `pillars` and `inputs` are
 *     `Record<string, …>` because the model set grows (`03 §4-7`). Labels are
 *     derived from the key so a newly added input renders legibly instead of
 *     silently as a blank row.
 */

export function PillarBreakdown({ pillars }: { pillars: Record<string, MfPillarScore> }) {
  const entries = Object.entries(pillars);
  return (
    <div data-testid="mf-pillar-breakdown">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Score breakdown
      </p>
      <p className="mt-1 text-[12px] text-muted-foreground">
        Each pillar expands to the inputs behind it, with the category median and
        percentile for every one.
      </p>
      <div className="mt-3 divide-y divide-border/60 rounded-md border border-border/60">
        {entries.map(([key, pillar]) => (
          <PillarRow key={key} pillarKey={key} pillar={pillar} />
        ))}
      </div>
    </div>
  );
}

function PillarRow({ pillarKey, pillar }: { pillarKey: string; pillar: MfPillarScore }) {
  const [open, setOpen] = useState(false);
  const inputs = Object.entries(pillar.inputs);
  const label = humanizeKey(pillarKey);

  return (
    <div data-pillar={pillarKey}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 text-[13px] font-medium text-foreground">{label}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">
          weight {formatRatioAsPct(pillar.weight, 0)}
        </span>
        <span className="w-28 shrink-0 text-right text-[13px]">
          {pillar.score === null ? (
            // Weight redistributed away from this pillar; it scored nothing
            // because nothing in it was measurable, which is not a score of 0.
            <span
              data-metric-value
              data-status="INSUFFICIENT_DATA"
              className="text-[11px] italic text-muted-foreground"
            >
              Not scored
            </span>
          ) : (
            <span data-metric-value data-status="OK" className="numeric tabular-nums font-medium">
              {formatRatio(pillar.score, 1)}
            </span>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-border/50 bg-muted/20 px-3 py-3">
          {inputs.length === 0 ? (
            <p className="text-[12px] text-muted-foreground">
              This pillar reported no inputs, so there is nothing to explain here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-[12px]">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="pb-1.5 pr-3 font-medium">Input</th>
                    <th className="pb-1.5 pr-3 font-medium">Value</th>
                    <th className="pb-1.5 pr-3 font-medium">Category median</th>
                    <th className="pb-1.5 pr-3 font-medium">Percentile</th>
                    <th className="pb-1.5 pr-3 font-medium">Weight</th>
                    <th className="pb-1.5 font-medium">Across horizons</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {inputs.map(([inputKey, input]) => (
                    <InputRow key={inputKey} inputKey={inputKey} input={input} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function InputRow({ inputKey, input }: { inputKey: string; input: MfPillarInput }) {
  return (
    <tr data-pillar-input={inputKey} className="align-top">
      <td className="py-1.5 pr-3 text-foreground">{humanizeKey(inputKey)}</td>
      <td className="py-1.5 pr-3">
        <MetricValue
          value={input.value}
          status={input.status}
          reason={statusReasonText(input.status)}
          format={(v) => formatRatio(v, 2)}
          notApplicableHint="undefined for this fund by construction, not a missing measurement"
        />
      </td>
      <td className="py-1.5 pr-3">
        {input.universeMedian === null ? (
          <span
            data-metric-value
            data-status="INSUFFICIENT_DATA"
            className="italic text-muted-foreground"
          >
            Not available — no category median
          </span>
        ) : (
          <span data-metric-value data-status="OK" className="numeric tabular-nums">
            {formatRatio(input.universeMedian, 2)}
          </span>
        )}
      </td>
      <td className="py-1.5 pr-3">
        {input.percentile === null ? (
          <span
            data-metric-value
            data-status="INSUFFICIENT_DATA"
            className="italic text-muted-foreground"
          >
            Not available — not ranked
          </span>
        ) : (
          <span data-metric-value data-status="OK" className="numeric tabular-nums">
            {formatPercentileOrdinal(input.percentile)}
          </span>
        )}
      </td>
      <td className="py-1.5 pr-3 numeric tabular-nums text-muted-foreground">
        {formatRatioAsPct(input.weight, 0)}
      </td>
      <td className="py-1.5">
        <HorizonBlend blend={input.horizonBlend} />
      </td>
    </tr>
  );
}

/**
 * Per-horizon percentiles before blending (`03 §3`, `§10`).
 *
 * Optional on the contract, and absent is a real state: single-horizon inputs
 * never had a blend. Iterating `MF_HORIZONS` rather than `Object.keys` keeps
 * the columns in 1/3/5/7/10 order regardless of key insertion order, and only
 * the horizons actually present are drawn — an absent horizon is skipped, not
 * shown as a zero percentile.
 */
function HorizonBlend({ blend }: { blend: MfPillarInput['horizonBlend'] }) {
  if (!blend) {
    return <span className="text-[11px] text-muted-foreground/70">single horizon</span>;
  }
  const present = MF_HORIZONS.filter((h) => blend[`${h}`] !== undefined);
  if (present.length === 0) {
    return <span className="text-[11px] text-muted-foreground/70">single horizon</span>;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {present.map((h) => {
        const p = blend[`${h}`];
        return (
          <span
            key={h}
            className={cn(
              'inline-flex items-center gap-1 rounded border border-border/60 bg-background px-1.5 py-0.5',
              'text-[10px] text-muted-foreground',
            )}
          >
            <span className="font-medium text-foreground">{h}y</span>
            <span className="numeric tabular-nums">
              {p === undefined ? '' : formatPercentileOrdinal(p)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
