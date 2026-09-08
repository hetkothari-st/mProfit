# MF Scoring — Methodology Changelog

Required by `03-SCORING.md §9` and `06-QUALITY-COMPLIANCE.md §5`.

**One entry per `methodologyVersion` bump.** A version bump is mandatory for any
change to pillar weights, input weights, the set of inputs, a metric's
direction, the horizon-blend weights, the rating bucket cut-offs, or the
percentile formula. Scores are append-only (`00-README.md` invariant 7): a
re-run under a new version writes new rows and never edits the old ones, so a
figure a user was shown last month stays reproducible.

**Nothing becomes the default without a backtest.** `06 §3` sets the bar for
`ACTIVE_EQUITY`: the Q1−Q5 forward-return spread must be positive in ≥ 65% of
months, and Q1's forward drawdown must be no worse than Q5's. A version that
does not discriminate does not ship. Reports live in
`docs/mf-analytics/backtests/<version>.md`.

Each entry records: what changed, **why**, and the backtest delta against the
version it replaces.

---

## `score-active-equity-v1`, `score-index-v1`, `score-debt-duration-v1`, `score-debt-ultra-short-v1`, `score-hybrid-v1`, `score-fof-v1`

**Date:** 2026-09-04 — initial implementation
**Status:** ⚠️ **NOT YET BACKTESTED. Not eligible to be the default.**

Baseline. Weights transcribed directly from `03-SCORING.md §4–§7`; this entry
exists so the first real bump has something to diff against, not because
anything changed.

Decisions taken during implementation that the spec left open, and which a
future version should revisit first because they are calibration rather than
transcription:

| Area | Decision | Why it is provisional |
|---|---|---|
| `score-fof-v1` pillar weights | COST doubled 15 → 30 per `03 §2`; the other five pillars rescaled proportionally by 70/85 (PERFORMANCE 24.7, CONSISTENCY 16.5, DOWNSIDE 16.5, PORTFOLIO 8.2, PEOPLE_PARENT 4.1) | The doc says only "cost pillar doubled" and does not say how the remainder is redistributed. Proportional rescaling preserves the stated 6:1 PERFORMANCE:PEOPLE_PARENT ratio, but an equal haircut was equally defensible. |
| Input weights for `INDEX`, `DEBT_DURATION`, `DEBT_ULTRA_SHORT` | 50/50 for two-input pillars; 40/30/30 for `CREDIT_QUALITY` | `03 §5–§6` give pillar weights but no input weights. Mirrors the shape `§4` uses for three-input pillars. Revisit on backtest. |
| AUM plateau cap | ₹10,000 cr, above which all funds tie at the top percentile | `03 §1` says AUM is "higher is better **up to a cap**" without naming the cap. Anchored on SEBI's Mar-2024 mid/small-cap stress-testing threshold — the scale at which the regulator itself treats size as redemption risk rather than franchise strength. |
| Horizon blend with a 5y gap | `{3, 10}` available → 28.57 / 71.43, by renormalising the base 20/30/50 vector | `03 §3` does not enumerate this case. Renormalisation reproduces all three documented rows exactly, and avoids discarding a 10-year record because a 5-year one is missing. |
| `outperformanceAnn` direction | Split into two names: `outperformanceAnn` (higher-is-better, debt PERFORMANCE) and `trackingDifferenceAbs` (INDEX TRACKING) | `03 §5` and `§6` require opposite directions for what the doc calls one field. One name cannot carry both without the direction table lying. |
| Hybrid `PORTFOLIO` inputs | `equityAllocationDrift` given 25, the other three rescaled to 30 / 22.5 / 22.5 | `03 §7` adds a fourth input without restating the split; rescaling preserves the original ratios. |
| Rating gate scoped to declaring models | "Rating requires PERFORMANCE and CONSISTENCY" (`03 §4`) applied only to models that declare those pillars | Read literally it would make every INDEX fund permanently unratable, since that model has neither pillar. This is a reading of the doc, not a statement of it. |

### Before this version can become the default

1. Run `scripts/mf-backtest.ts` (`06 §3`) from 2016 and commit
   `docs/mf-analytics/backtests/score-active-equity-v1.md`.
2. Confirm the acceptance thresholds, or revise weights and re-run.
3. Record the regression coefficient of forward excess return on composite gap
   into `constants.ts` — it is the `replacementExpectedEdge` input to
   `breakEvenMonths` in `05-FINDINGS-ENGINE.md §5`, and without it no
   `SWITCH_CANDIDATE` verdict can be justified.
