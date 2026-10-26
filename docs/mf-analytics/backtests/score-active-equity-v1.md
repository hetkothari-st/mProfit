# MF score backtest — score-active-equity-v1

## INSUFFICIENT DATA — NOT ELIGIBLE TO SHIP

This run produced **no regression coefficient**. `REPLACEMENT_EXPECTED_EDGE` in
`services/mf/mfAnalytics/constants.ts` must stay `null`, and with it `05 §5` row 3 cannot
match, so no `SWITCH_CANDIDATE` verdict naming a replacement can be justified. Funds that
would otherwise be switch candidates fall through to `REVIEW`, which is the correct and
honest outcome while the evidence does not exist.

Run date: 2026-10-26
Window attempted: 2016-01-31 → 2023-09-30
Month-ends attempted: 93

## What is missing

| # | Check | Required | Observed | What would satisfy it |
|---|---|---|---|---|
| 1 | `SURVIVORSHIP_BIAS` | schemes that merged or wound up inside the window must appear in the months when they were still ACTIVE | 4 such schemes exist in MfSchemeMeta; 0 were ever ranked | MfSchemeMetrics rows are written for ACTIVE schemes only, so a fund that has since died has no historical metric rows and silently drops out of every past universe. Backfill metrics for dead schemes over the months they were alive (02 §6), or the backtest measures survivors only and its result is biased upward. |

## Coverage observed

| Measure | Value |
|---|---|
| `scoredMonths` | 63 |
| `gateModelMonths` | 63 |
| `quintileEligibleUniverseMonths` | 397 |
| `tooSmallUniverseMonths` | 1047 |
| `distinctSchemes` | 281 |
| `gateModelDistinctSchemes` | 281 |
| `regressionObservations` | 9408 |
| `regressionXVariance` | 4515552.518700 |
| `deadSchemesInWindow` | 4 |
| `deadSchemesRanked` | 0 |

## Acceptance thresholds (not evaluated)

- Q1 − Q5 forward-return spread > 0 in ≥ 65% of months for `ACTIVE_EQUITY`.
- Q1 forward max drawdown no worse than Q5.

Neither was evaluated: a threshold applied to a sample this thin would report a verdict on
noise. The gate is the data precondition, not the acceptance criterion.
