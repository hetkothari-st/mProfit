# 06 — Quality, Accuracy and Compliance

"Accurate" is a property you prove, not assert. This doc lists the mechanisms
that make the analytics layer defensible: to a user, to an auditor, and to SEBI.

---

## 1. Invariant tests (add to `test/invariants/`)

| File | Asserts |
|---|---|
| `mf-reference-not-user-scoped.test.ts` | reference models are absent from `USER_SCOPED_MODELS` and have no RLS policy |
| `mf-user-scoped-coverage.test.ts` | `MfAnalysisRun`, `MfFinding`, `MfFundVerdict` are in `USER_SCOPED_MODELS` **and** have a policy (extends existing coverage test) |
| `mf-score-append-only.test.ts` | an update to an existing `MfSchemeScore` / `MfFundVerdict` row via the service layer is impossible (service exposes no update path; a direct Prisma update in the test is the only way, and the test asserts the service never calls it — spy) |
| `mf-benchmark-tri-only.test.ts` | seeding a `BenchmarkIndex` with `isTotalReturn: false` and referencing it from a scheme throws at seed time |
| `mf-no-rating-under-36m.test.ts` | property test over random history lengths 1–35 months ⇒ `rating: null` |
| `mf-decimal-boundary.test.ts` | every DTO in `mfAnalytics.types.ts` serialises numerics as strings (walk fixtures) |
| `mf-idempotency.test.ts` | every job run twice on the same day ⇒ identical row counts and hashes |
| `mf-rules-pure.test.ts` | rule modules import nothing from `lib/prisma` or `services/*` except `types` and `constants` (static import graph check) |

---

## 2. Reconciliation job (`mfReconciliationJob`, monthly)

For a fixed panel of 30 schemes across categories (seed list in
`test/fixtures/mf/reconciliation-panel.json`):

- Pull our 1y / 3y / 5y CAGR at month-end.
- Fetch AMFI's published trailing returns for the same date (AMFI publishes
  scheme performance; MFAPI exposes it; a paid feed is better).
- Tolerance: ±0.10 pp on returns. Breach ⇒ `IngestionFailure` with reason
  `reconciliation_drift`, scheme, metric, our value, their value; and an
  `Alert` to admins.
- Also reconcile latest TER and AUM against the AMC factsheet (exact match
  expected; TER is disclosed daily).

Drift is nearly always one of: quarantined NAV gap, wrong IDCW adjustment,
window start off by a day, or a merged scheme. The reason string must name
the scheme so the fix is fast.

---

## 3. Backtest (before any methodology version becomes default)

`scripts/mf-backtest.ts` (under `test/scripts/` conventions):

1. For each month-end `t` from 2016 onwards, compute the score **using only
   data available at `t`** (respect `asOf` everywhere — this is why every
   metric row carries it).
2. Sort each universe into quintiles by composite.
3. Measure the **forward** 3-year CAGR and forward max drawdown per quintile.
4. Report: Q1 − Q5 forward-return spread, monotonicity across quintiles, hit
   rate (share of months where Q1 > Q5), and the same for each pillar alone.
5. Persist to `docs/mf-analytics/backtests/<version>.md`.

Acceptance to ship a version: Q1 − Q5 spread > 0 in ≥ 65% of months for
`ACTIVE_EQUITY`, and Q1 forward drawdown not worse than Q5. If a version fails,
adjust weights and re-run; do not ship a score that does not discriminate.

The regression coefficient of forward excess return on composite gap from this
backtest is the `replacementExpectedEdge` input in `05 §5`. Store it in
`constants.ts` per version with the backtest date.

---

## 4. Compliance gating (SEBI Investment Adviser Regulations)

Not legal advice — confirm with counsel. The working assumption:

- **Research / information**: scores, metrics, category ranks, overlap,
  cost, tax lot status, generic educational findings. Available to all users
  with the `MF_ANALYTICS` entitlement (PLUS).
- **Advice**: `SWITCH_CANDIDATE` verdicts naming a replacement, allocation
  drift with a target, "reduce X / add Y" prose. Requires the deploying entity
  to hold an RIA registration (or route through a registered advisor).

Implementation:

- New env `RIA_VERDICTS_ENABLED` (boolean, default `false`) in `config/env.ts`.
  When false: verdicts are computed and stored (for the audit trail and for
  advisor users) but the API strips `SWITCH_CANDIDATE` to `REVIEW`, removes
  `suggestedReplacementSchemeCode`, and the prose prompt forbids imperatives.
- Entitlements (`entitlements.ts`): `MF_ANALYTICS` at `PLUS`; the verdict
  layer rides on the existing `ADVICE_ENGINE` flag.
- Every displayed verdict and prose is persisted with its inputs
  (`factsSnapshot`, `ruleVersionsSnapshot`, `methodologyVersion`) — this is the
  record-keeping SEBI expects of an adviser.
- Mandatory disclaimer component on every analytics page:
  "Past performance… Ratings are relative to the SEBI category… Not a
  recommendation unless marked as such" — text in one shared constant,
  `MF_ANALYTICS_DISCLAIMER`, so it cannot drift between pages.
- Risk-o-meter of the scheme displayed alongside any score (SEBI expects it
  wherever a scheme is presented).

---

## 5. Methodology transparency

- Public page `/methodology/mf-score` renders the current model tables from the
  same constants the scorer uses (import from `mfScoring/models/*`, do not
  hand-copy).
- `METHODOLOGY-CHANGELOG.md` — one entry per version bump: what changed, why,
  backtest delta.
- Every score in the UI links to its pillar breakdown and every pillar input
  to its universe median and percentile (`03 §10`).

---

## 6. Staleness and honesty in the UI

Mirrors `CONTEXT.md §6` "a partial view must say so":

| Condition | Render |
|---|---|
| metric `status ≠ OK` | "Not available — {reason}", never 0 or a dash without reason |
| `ratingStatus: INSUFFICIENT_HISTORY` | "Unrated — {N} months of history (rated from {date})" |
| `ratingStatus: CATEGORY_TOO_SMALL` | "Unrated — only {n} peers in category" |
| holdings snapshot > 60 days old | badge "Portfolio as of {date}" in amber |
| `proseVerified: false` | show headlines; no prose; no error to the user |
| run `PARTIAL` | banner naming the missing rule category |
| family view with caps | `PartialDataNotice`, "floor" wording on aggregates |
| `RIA_VERDICTS_ENABLED = false` | verdict chip reads "Review" and tooltip says analysis only |

---

## 7. Operational alerts

Via existing `alertJobs` / admin `Alert`:

- `benchmarkPriceJob` has no new row for a benchmark for > 3 business days.
- `mfMetricsJob` computed < 90% of ACTIVE schemes.
- > 2% of NAV rows quarantined in a day.
- Reconciliation drift.
- Prose verification failure rate > 5% over a day (indicates prompt regression).
- `mfAnalysisJob` `PARTIAL` rate > 5%.
