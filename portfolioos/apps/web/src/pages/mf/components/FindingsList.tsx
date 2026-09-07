import type { MfEvidence, MfFinding, MfFindingSeverity } from '@portfolioos/shared';
import { cn } from '@/lib/cn';
import { SectionUnavailable } from './MetricValue';
import { MoneyCell, PctCell, PercentileCell, RatioCell } from './MetricCells';
import { resolveNullable, humanizeKey } from '../mfFormat';

/**
 * The findings list for one fund (`05-FINDINGS-ENGINE.md §3`, Task 5.6).
 *
 * Three things are structural here rather than conventional, because each of
 * them is a rule the layer would quietly lose if it were left to the author of
 * the next component:
 *
 * **1. "What would change this" is mandatory and is rendered for every
 * finding.** `05 §3` states it as a contract and the engine throws on a rule
 * that omits it. A finding a reader can neither act on nor argue with is an
 * opinion; the counterfactual is what turns it back into an observation. So it
 * is not collapsed behind a disclosure, and a finding that somehow arrives
 * without one says so explicitly instead of rendering an empty line — an
 * absence the reader can see is worth more than one they cannot.
 *
 * **2. Every evidence number goes through `MetricValue`.** `06 §6`'s rule that
 * a zero must never stand in for an unknown is only as strong as its weakest
 * call site, and an evidence table is forty small numbers written quickly. The
 * cells in `MetricCells` are the single render path; a null cited value renders
 * "Not available — {reason}", never `0` and never a bare dash. The keystone
 * test walks `[data-metric-value]` across the whole page and fails on a digit
 * inside a non-OK one, which is what keeps this true after the next edit.
 *
 * **3. The unit comes off the evidence row, not off the metric name.**
 * `MfEvidence.value` is branded `Ratio` for transport regardless of what it
 * measures, and `unit` carries the semantics — `terPct` travels as a `Ratio`
 * with `unit: 'pct'` because re-branding it would have meant dividing by 100 and
 * contradicting the rule that produced it (see `debt.credit-quality.ts`). So
 * the formatter is chosen by `unit` and by nothing else. Choosing it from the
 * metric path would reintroduce the ×100 confusion the `Ratio`/`Pct` split
 * exists to make impossible.
 */

const SEVERITY_LABEL: Record<MfFindingSeverity, string> = {
  CRITICAL: 'Critical',
  WARNING: 'Warning',
  NOTICE: 'Notice',
  INFO: 'Note',
};

const SEVERITY_TONE: Record<MfFindingSeverity, string> = {
  CRITICAL: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  WARNING: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  NOTICE: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  INFO: 'border-border bg-muted/60 text-muted-foreground',
};

/**
 * The reason shown in place of a cited number the rule left null.
 *
 * No digits, deliberately: `MetricValue` renders the reason inside
 * `[data-metric-value]`, and the invariant test fails on a digit inside a
 * non-OK metric. A number inside an unavailability is a number the reader can
 * mistake for the answer.
 */
const NO_VALUE = 'the rule cited this metric without a value';
const NO_MEDIAN = 'no category median was cited for this metric';
const NO_PERCENTILE = 'this metric was not ranked against the category';

/**
 * One cited value, formatted by its declared unit.
 *
 * `days` and `count` are integers by nature and render with no decimal places;
 * showing "214.00 days" would imply a precision the source does not have.
 */
function EvidenceValue({
  value,
  unit,
  reason,
}: {
  value: string | null;
  unit: MfEvidence['unit'];
  reason: string;
}) {
  const resolved = resolveNullable(value, reason);
  switch (unit) {
    case 'inr':
      return <MoneyCell resolved={resolved} />;
    case 'pct':
      // Already in percent units — `0.62` is 0.62% a year. Never
      // `RatioPctCell`, which would render it as "62%".
      return <PctCell resolved={resolved} />;
    case 'days':
    case 'count':
      return <RatioCell resolved={resolved} fractionDigits={0} />;
    case 'ratio':
    default:
      return <RatioCell resolved={resolved} />;
  }
}

/**
 * The evidence table.
 *
 * A table, not a sentence, because `05 §3` makes the finding "only as good as
 * these" and a reader disputing a conclusion needs the fund's number, the
 * category's, and where the fund sits in the distribution side by side. The
 * benchmark column appears only when at least one row cites one — an always-on
 * column of "Not available" teaches nothing and pushes the numbers that matter
 * off a narrow screen.
 *
 * An empty evidence array is legitimate and says so: a finding whose trigger is
 * structural (a REGULAR plan, a manager change, a stale disclosure) cites no
 * metric, and pretending otherwise with an empty table would read as missing
 * data.
 */
function EvidenceTable({ evidence }: { evidence: MfEvidence[] }) {
  if (evidence.length === 0) {
    return (
      <p className="text-[12px] text-muted-foreground">
        This finding is structural — it follows from the scheme&apos;s own attributes rather than
        from a measured value, so there is no metric to cite.
      </p>
    );
  }

  const showBenchmark = evidence.some((e) => e.benchmarkValue !== undefined);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] border-collapse text-left text-[12px]">
        <thead>
          <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
            <th className="py-1.5 pr-3 font-medium">Metric</th>
            <th className="py-1.5 pr-3 font-medium">This fund</th>
            <th className="py-1.5 pr-3 font-medium">Category median</th>
            {showBenchmark && <th className="py-1.5 pr-3 font-medium">Benchmark</th>}
            <th className="py-1.5 font-medium">Percentile</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((row, i) => (
            <tr key={`${row.metric}-${row.horizonYears ?? 'x'}-${i}`} className="border-t border-border/50">
              <td className="py-1.5 pr-3 align-top">
                {/* `label` is written by the rule; `humanizeKey` on the dotted
                    metric path is the fallback so an unlabelled row is still
                    legible rather than blank. */}
                <span className="text-foreground">{row.label || humanizeKey(row.metric)}</span>
                {row.horizonYears !== undefined && (
                  <span className="ml-1.5 text-muted-foreground">({row.horizonYears}y)</span>
                )}
              </td>
              <td className="py-1.5 pr-3 align-top">
                <EvidenceValue value={row.value} unit={row.unit} reason={NO_VALUE} />
              </td>
              <td className="py-1.5 pr-3 align-top">
                <EvidenceValue
                  value={row.categoryMedian ?? null}
                  unit={row.unit}
                  reason={NO_MEDIAN}
                />
              </td>
              {showBenchmark && (
                <td className="py-1.5 pr-3 align-top">
                  <EvidenceValue
                    value={row.benchmarkValue ?? null}
                    unit={row.unit}
                    reason={NO_VALUE}
                  />
                </td>
              )}
              <td className="py-1.5 align-top">
                <PercentileCell value={row.percentile ?? null} reason={NO_PERCENTILE} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FindingCard({ finding }: { finding: MfFinding }) {
  return (
    <li
      data-testid="mf-finding"
      data-finding-code={finding.code}
      data-severity={finding.severity}
      className="rounded-lg border border-border/70 bg-card p-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 text-[14px] font-medium leading-snug text-foreground">
          {finding.headline}
        </p>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium',
            SEVERITY_TONE[finding.severity],
          )}
        >
          {SEVERITY_LABEL[finding.severity]}
        </span>
      </div>

      <div className="mt-3">
        <EvidenceTable evidence={finding.evidence} />
      </div>

      <div
        data-testid="mf-finding-counterfactual"
        className="mt-3 rounded-md border border-dashed border-border/70 bg-muted/30 px-3 py-2"
      >
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
          What would change this
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-foreground">
          {finding.whatWouldChangeThis.trim().length > 0 ? (
            finding.whatWouldChangeThis
          ) : (
            // Unreachable through the engine, which throws on an empty
            // counterfactual. Stated rather than left blank so a data problem
            // reads as a data problem instead of as a design that forgot.
            <span className="text-muted-foreground">
              This rule did not record what would clear the finding. That is a defect in the rule,
              not a judgement about the fund.
            </span>
          )}
        </p>
      </div>

      {/* Provenance. `05` guarantee 2 — "why was X flagged?" has to be
          answerable down to the exact rule version that said it, because a
          threshold change is a new opinion and must be distinguishable from the
          old one. Confidence is shown as text, not as a bar: a bar invites the
          reader to compare two findings' confidence, which is not what the
          number means (it scales with evidence quality, not with how wrong the
          fund is). */}
      <p className="mt-2 text-[10px] text-muted-foreground/80">
        {finding.ruleId} v{finding.ruleVersion} · confidence {finding.confidence}
      </p>
    </li>
  );
}

export function FindingsList({
  findings,
  emptyReason,
}: {
  findings: MfFinding[];
  /**
   * What an empty list MEANS here. There is no default: `[]` is genuinely
   * ambiguous on this contract — "the run examined this fund and flagged
   * nothing" and "no run has ever happened" both produce it — and the caller is
   * the only one who knows which. `mfAnalytics.api.ts` says the same thing at
   * the fetch site.
   */
  emptyReason: string;
}) {
  if (findings.length === 0) {
    return <SectionUnavailable title="No findings for this fund" reason={emptyReason} />;
  }

  return (
    <ul data-testid="mf-findings" className="space-y-3">
      {findings.map((f) => (
        <FindingCard key={f.id} finding={f} />
      ))}
    </ul>
  );
}
