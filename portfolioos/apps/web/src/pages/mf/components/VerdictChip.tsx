import type { MfFundVerdictDto, MfVerdictKind } from '@portfolioos/shared';
import { cn } from '@/lib/cn';
import { MetricStat } from './MetricValue';
import { MoneyCell, RatioCell } from './MetricCells';
import { known, resolveNullable } from '../mfFormat';

/**
 * The verdict chip, and the one place `06-QUALITY-COMPLIANCE.md §6`'s
 * RIA-gating row becomes pixels.
 *
 * > `RIA_VERDICTS_ENABLED = false` → verdict chip reads "Review" and tooltip
 * > says analysis only.
 *
 * The chip renders `verdict` exactly as it arrives. It does **not** re-derive
 * the gate: the server already downgraded a stored `SWITCH_CANDIDATE` to
 * `REVIEW`, stripped the replacement, and set `advisoryGated: true`
 * (`mfFindings.controller.ts`). A client-side "if gated then show REVIEW" would
 * be a second copy of a compliance rule — and the copy that gets edited.
 *
 * What `advisoryGated` changes here is only the **explanation**. A gated
 * "Review" and an ungated "Review" look identical and mean different things:
 * the second is what the engine concluded, the first is what we are permitted
 * to say. Presenting the gated one with the ordinary Review copy would let the
 * reader believe the analysis found less than it did, which is the specific
 * dishonesty the `advisoryGated` field was added to prevent.
 *
 * The tooltip is a `title` attribute rather than a floating popover: this
 * codebase has no tooltip primitive, and a native title is keyboard- and
 * screen-reader-reachable without one. The same text is also rendered as
 * visible copy beneath the chip when the verdict is gated, because a
 * disclosure that only exists on hover is a disclosure most readers never see —
 * the same reasoning `AnalyticsDisclaimer` gives for not collapsing itself.
 */

const VERDICT_LABEL: Record<MfVerdictKind, string> = {
  HOLD: 'Hold',
  MONITOR: 'Monitor',
  REVIEW: 'Review',
  SWITCH_CANDIDATE: 'Switch candidate',
  INSUFFICIENT_DATA: 'Not enough data',
};

/**
 * What the chip means, in the reader's terms. Deliberately none of these says
 * "buy" or "sell": `06 §4` reserves an imperative for a `SWITCH_CANDIDATE`
 * served with the RIA gate open, and even then the imperative belongs to the
 * prose, not to a five-word chip the reader skims.
 */
const VERDICT_HINT: Record<MfVerdictKind, string> = {
  HOLD: 'Nothing in this run argues against continuing to hold this fund.',
  MONITOR: 'One thing is worth watching. Nothing here calls for action today.',
  REVIEW: 'Enough has been flagged that this fund is worth a deliberate look.',
  SWITCH_CANDIDATE:
    'The findings meet the bar for considering a replacement, and the break-even cost of switching is shown alongside.',
  INSUFFICIENT_DATA:
    'We do not have enough history to rate this fund. That is a statement about our data, not about the fund.',
};

/** The copy `06 §6` requires when the deployment is not RIA-registered. */
export const ADVISORY_GATED_NOTE =
  'Analysis only. This deployment is not registered to give investment advice, so no replacement fund is named and the conclusion is shown as a review rather than a recommendation.';

const TONE: Record<MfVerdictKind, string> = {
  HOLD: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  MONITOR: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  REVIEW: 'border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300',
  SWITCH_CANDIDATE: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  INSUFFICIENT_DATA: 'border-border bg-muted/60 text-muted-foreground',
};

export function VerdictChip({
  verdict,
  advisoryGated,
  className,
}: {
  verdict: MfVerdictKind;
  advisoryGated: boolean;
  className?: string;
}) {
  const hint = advisoryGated ? ADVISORY_GATED_NOTE : VERDICT_HINT[verdict];
  return (
    <span
      data-verdict={verdict}
      data-advisory-gated={advisoryGated ? 'true' : 'false'}
      title={hint}
      aria-label={`Verdict: ${VERDICT_LABEL[verdict]}. ${hint}`}
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONE[verdict],
        className,
      )}
    >
      {VERDICT_LABEL[verdict]}
    </span>
  );
}

/**
 * The verdict block: chip, the reasons that drove it, the switch cost when one
 * was computed, and the LLM prose when — and only when — it was verified.
 *
 * `06 §6`, the `proseVerified: false` row: "show headlines; no prose; no error
 * to the user". A narration that failed numeric verification is discarded
 * server-side (`prose` arrives null), and the absence is silent here. It is not
 * an error state: the deterministic finding headlines below are the analysis,
 * and the prose was only ever a restatement of them.
 */
export function VerdictBlock({ verdict }: { verdict: MfFundVerdictDto }) {
  return (
    <div data-testid="mf-verdict" className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <VerdictChip verdict={verdict.verdict} advisoryGated={verdict.advisoryGated} />
        {verdict.suggestedReplacementName !== null && (
          // Only reachable with the RIA gate OPEN. With it shut the server
          // strips both the code and the name, so this branch cannot render a
          // recommendation the deployment is not permitted to make.
          <span data-testid="mf-verdict-replacement" className="text-[13px] text-muted-foreground">
            Approved alternative considered:{' '}
            <span className="text-foreground">{verdict.suggestedReplacementName}</span>
          </span>
        )}
      </div>

      {verdict.advisoryGated && (
        <p
          data-testid="mf-verdict-gated-note"
          className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-[12px] leading-relaxed text-muted-foreground"
        >
          {ADVISORY_GATED_NOTE}
        </p>
      )}

      {verdict.reasons.length > 0 && (
        <p className="text-[12px] text-muted-foreground">
          Driven by:{' '}
          <span className="text-foreground">{verdict.reasons.join(', ')}</span>
        </p>
      )}

      {verdict.switchCost !== null && (
        // Shown whatever the gate's position. What it would cost you to leave a
        // fund you already own is a fact about your own tax lots and this
        // scheme's exit load — research, not advice — and withholding it would
        // leave a reader unable to price a decision they are entitled to make.
        // `breakEvenMonths` is null when the expected edge of a replacement
        // cannot be estimated (`REPLACEMENT_EXPECTED_EDGE` is unset until the
        // backtest lands), and it renders as an explicit unavailability rather
        // than as an encouraging zero.
        <div
          data-testid="mf-switch-cost"
          className="grid grid-cols-1 gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2.5 sm:grid-cols-3"
        >
          <MetricStat label="Exit load if sold today">
            <MoneyCell resolved={known(verdict.switchCost.exitLoadInr)} />
          </MetricStat>
          <MetricStat label="Tax if sold today">
            <MoneyCell resolved={known(verdict.switchCost.taxInr)} />
          </MetricStat>
          <MetricStat
            label="Break-even"
            hint="Months for the expected cost edge to repay the exit load and tax"
          >
            <RatioCell
              resolved={resolveNullable(
                verdict.switchCost.breakEvenMonths,
                'we cannot yet estimate the cost edge of a replacement',
              )}
              fractionDigits={1}
            />
          </MetricStat>
        </div>
      )}

      {/* Rendered only when verified. No placeholder, no "narrative
          unavailable" — see the block comment above. */}
      {verdict.proseVerified && verdict.prose !== null && (
        <p data-testid="mf-verdict-prose" className="text-[13px] leading-relaxed text-foreground">
          {verdict.prose}
        </p>
      )}
    </div>
  );
}
