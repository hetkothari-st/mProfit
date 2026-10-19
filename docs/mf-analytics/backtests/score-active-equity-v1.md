# MF score backtest — score-active-equity-v1

## INSUFFICIENT DATA — NOT ELIGIBLE TO SHIP

This run produced **no regression coefficient**. `REPLACEMENT_EXPECTED_EDGE` in
`services/mfAnalytics/constants.ts` must stay `null`, and with it `05 §5` row 3 cannot
match, so no `SWITCH_CANDIDATE` verdict naming a replacement can be justified. Funds that
would otherwise be switch candidates fall through to `REVIEW`, which is the correct and
honest outcome while the evidence does not exist.

Run date: 2026-09-07
Window attempted: 2016-01-31 → (no NAV history)
Month-ends attempted: 0

## What is missing

| # | Check | Required | Observed | What would satisfy it |
|---|---|---|---|---|
| 1 | `INSUFFICIENT_MONTHS` | ≥ 60 month-ends with at least one quintile-eligible universe and a complete 3-year forward window | 0 | Backfill daily adjusted NAV and MfSchemeMetrics rows so that month-ends from 2016-01-31 onward each have scoreable schemes, and so that NAV extends 3 years past the last scored month. |
| 2 | `INSUFFICIENT_GATE_MODEL_MONTHS` | ≥ 60 month-ends with a quintile-eligible ACTIVE_EQUITY universe | 0 | The ACTIVE_EQUITY model is the one the 06 §3 acceptance threshold is written for; its universes must be populated even if others are not. |
| 3 | `NO_QUINTILE_ELIGIBLE_UNIVERSE` | at least one universe-month with ≥ 20 scoreable schemes | 0 eligible (0 universe-months were below the floor) | A quintile needs ≥ 4 funds per bucket. Backfill metadata and metrics for whole sub-categories rather than sampling schemes across many of them. |
| 4 | `INSUFFICIENT_DISTINCT_SCHEMES` | ≥ 120 distinct schemes scored at least once | 0 | Backfill MfSchemeMeta + MFNav.adjustedNav + MfSchemeMetrics for a broad cross-section, not a handful of funds repeated across many months. |
| 5 | `INSUFFICIENT_GATE_MODEL_SCHEMES` | ≥ 50 distinct ACTIVE_EQUITY schemes | 0 | Backfill the equity sub-categories (Large/Mid/Small/Flexi/Multi/Focused/ELSS/…) so ACTIVE_EQUITY universes are realistic. |
| 6 | `INSUFFICIENT_REGRESSION_OBSERVATIONS` | ≥ 1000 pooled (month, scheme) observations | 0 | The regression slope becomes REPLACEMENT_EXPECTED_EDGE and decides whether a real person is told to sell a real fund. It needs a real sample. |

## Coverage observed

| Measure | Value |
|---|---|
| `scoredMonths` | 0 |
| `gateModelMonths` | 0 |
| `quintileEligibleUniverseMonths` | 0 |
| `tooSmallUniverseMonths` | 0 |
| `distinctSchemes` | 0 |
| `gateModelDistinctSchemes` | 0 |
| `regressionObservations` | 0 |
| `regressionXVariance` | null |
| `deadSchemesInWindow` | 0 |
| `deadSchemesRanked` | 0 |

## Acceptance thresholds (not evaluated)

- Q1 − Q5 forward-return spread > 0 in ≥ 65% of months for `ACTIVE_EQUITY`.
- Q1 forward max drawdown no worse than Q5.

Neither was evaluated: a threshold applied to a sample this thin would report a verdict on
noise. The gate is the data precondition, not the acceptance criterion.
