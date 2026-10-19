# Intelligence Layer — Design Spec

Source: `PORTFOLIOOS_INTELLIGENCE_LAYER_PROMPT.md` (adapted from FastAPI/Python spec to this repo's actual Node/Express/Prisma/React stack). Prior audit: `INTELLIGENCE_LAYER_AUDIT.md`.

Build order (highest leverage → lowest, per audit):
1. Financial Health Score
2. Goal Planner projection math
3. XIRR per-holding + display
4. Net Worth history
5. Insights Feed — rule-based generators
6. Tax — PDF export + Pro-tier gate enforcement

Each ships as its own commit sequence (schema → service → route → frontend → tests), verified before moving to the next. Conventions locked from repo scan:
- Routes → controllers (Zod validation + auth) → services (logic). No business logic in routes.
- Cron: `node-cron`, one `startXJobs()` per file in `packages/api/src/jobs/`, registered in `index.ts`.
- Caching: DB column `computedAt`/`expiresAt`, checked for staleness in the service (matches existing insights cache pattern) — no new Redis KV usage.
- PDF: `pdfkit` already installed and used in `export.service.ts`.
- Charts: Recharts. Reuse `MetricCard` and `BudgetGauge` components where they fit instead of new primitives.
- Tests: Vitest, co-located `*.test.ts` next to the service file.
- Money: `Decimal` throughout (Prisma `Decimal` / `decimal.js`), never JS `Number` — matches this repo's existing calculators (xirr, tax, goalMath).

---

## Module 1 — Financial Health Score

**Schema:** no new table required for v1 (compute-on-read, cache via response `computedAt` + 24h staleness check held in a lightweight new table `HealthScoreSnapshot(userId, score, grade, subScores Json, computedAt)` — one row per user, upserted). Keeping it in DB rather than pure-compute lets the dashboard show "updated today at 9:00 AM" without recomputing every load.

**Backend — `packages/api/src/services/healthScore.service.ts`:**
- `estimateMonthlyExpenses(userId)` — avg debit total from `CanonicalEvent` last 3 months.
- `estimateMonthlyIncome(userId)` — recurring NEFT/UPI credits matched as salary from `CanonicalEvent`.
- `computeSubScores(userId)` → 6 sub-scores per spec (emergency fund 20%, investment rate 20%, debt burden 20%, diversification 20%, insurance 10%, goal progress 10%), each returns `{score, insight, action}`.
  - Emergency fund: liquid assets (bank + FD/liquid-MF classes) ÷ (6 × monthly expenses), reuse `BankBalanceSnapshot` + holdings asset-class filter.
  - Investment rate: (SIP + equity buys, 3mo avg) ÷ monthly income.
  - Debt burden: (loan EMIs + CC minimums) ÷ monthly income — reuse `cashflowForecast.service.ts` EMI aggregation directly.
  - Diversification: reuse `portfolio.service.ts` `getAssetAllocation`; penalize single-asset-class >60%, single-stock >50%, single-MF >40%; equity% vs (100-age) guideline.
  - Insurance: sum life-type `InsurancePolicy.sumAssured` vs 10× estimated annual income; `score=50` if no policies (data unavailable, not zero).
  - Goal progress: reuse `goalMath.ts` `progressPct`, averaged across active goals; `score=50` with prompt if no goals.
- `computeScore(userId)` — weighted average → `overall_score`, `grade` (A≥85/B≥70/C≥55/D≥40/F<40), upserts `HealthScoreSnapshot`, returns full payload.

**API:** `GET /api/intelligence/health-score` — controller checks 24h staleness, recomputes if stale else returns cached row.

**Frontend — `apps/web/src/components/intelligence/HealthScore.tsx`:**
- SVG circular gauge (hand-rolled, no new chart lib), red<40/orange 40-70/green>70, center = score + grade.
- 2×3 grid of dimension cards (name, mini bar via existing `BudgetGauge` pattern, score, insight text, "Fix this →" expandable action).
- Share button using `html-to-image` (new dep — small, well-maintained, MIT) to export gauge+score as PNG.
- Slot: dashboard, right after the Net Worth Hero section (`DashboardPage.tsx`, after current lines ~439-539).

**Tests:** `healthScore.service.test.ts` — one test per sub-score formula with fixed fixture data, plus grade-threshold boundary tests.

---

## Module 2 — Goal Planner projection math

**Schema:** no migration — `Goal` model already has `targetAmount`, `initialAmount`, `targetDate`, `expectedReturn`. Add nullable `monthlySip Decimal?` and `riskAllocation String?` columns (spec's `monthly_sip`/`asset_allocation`) since current schema has neither.

**Backend — extend `packages/api/src/services/goalMath.ts`:**
- `computeProjection(goal)` — FV formula with monthly compounding: `FV = PV(1+r)^n + PMT×[((1+r)^n-1)/r]`, `r` = `expectedReturn/12`, `n` = months remaining. Returns `{projectedValue, targetAmount, surplusDeficit, onTrack, requiredSipToMeetTarget, sipGap, monthlyProjection[], yearsRemaining, probabilityOfSuccess}`.
  - `requiredSipToMeetTarget` = inverse of the FV formula solved for PMT.
  - `probabilityOfSuccess` = `100` if surplus, else `min(100, projectedValue/targetAmount*100)` (spec's simplified version — no Monte Carlo, matches spec explicitly).
  - `monthlyProjection` = month-by-month array of `{month, projectedValue, targetTrajectory}` for the trajectory chart — `targetTrajectory` is a straight line from `currentCorpus` to `targetAmount`.
- `suggestAllocation(yearsRemaining)` — >10y aggressive(85/15), 5-10y moderate(60/40), 3-5y balanced(40/60), <3y conservative(20/80); returns suggested `expectedReturn`.

**API:** `GET /api/goals/:id/projection` (new endpoint, existing `goals.routes.ts`/`goals.controller.ts` pattern).

**Frontend:**
- Goal create/edit modal: add live preview panel (recompute projection client-side on field change, debounced) showing projected outcome + suggested SIP.
- New `apps/web/src/pages/goals/GoalDetailPage.tsx`: Recharts area chart, two series ("your trajectory" vs "required trajectory"), green fill above/red fill below, gap card ("Increase SIP by ₹X/month"), share-as-image button (reuse `html-to-image` from Module 1).
- Add 5th template (Dream vacation, 2y/₹2L) to existing 4-template quick-start.

**Tests:** extend `goalMath.test.ts` with FV/required-SIP fixture cases (known-answer: e.g. PV=0, PMT=10000, r=1%/mo, n=12 → known FV) and edge cases (n=0, r=0).

---

## Module 3 — XIRR per-holding + display

**Backend — extend `xirr.service.ts`:** add `computeHoldingXirr(portfolioId, holdingKey)` looping existing `computePortfolioXirr` machinery scoped to one holding's transactions; wire into `portfolio.service.ts:453` so `HoldingRow.xirr` is populated instead of always `null`. Add `computedAt`/staleness check on a new nullable `HoldingProjection.xirrCachedAt` + `xirrCached` pair (avoids recompute on every holdings-table render) — no Redis, matches repo's DB-cache convention.

**API:** `GET /api/intelligence/xirr` — new endpoint (spec's namespace) returning `{total_portfolio_xirr, mutual_funds_xirr, equity_xirr, by_holding: [...]}`, backed by existing `computePortfolioXirr`/`computeUserXirr` plus new per-holding fan-out. Existing `/api/reports/xirr` stays as-is (don't break it).

**Frontend — `apps/web/src/components/intelligence/XIRRDisplay.tsx`:**
- Hero stat with label (Good >12% / Average 7-12% / Below FD rate <7%).
- Comparison bar: user XIRR vs hardcoded Nifty 10Y CAGR (~13.5%) vs FD rate (7%).
- Sortable holdings table (name, XIRR%, invested, current value, gain/loss color-coded), top/worst performer highlighted.
- Slot: replaces/extends the existing `AssetClassXirrBar` widget area in analytics, and a summary version slots into the Intelligence Dashboard (Module 4/6 integration, see below).

**Tests:** extend `xirr.reliability.test.ts` with per-holding fixture; verify aggregate still matches sum-weighted total (regression guard).

---

## Module 4 — Net Worth history

**Schema — new migration:**
```prisma
model NetWorthSnapshot {
  id            String   @id @default(cuid())
  userId        String
  user          User     @relation(fields: [userId], references: [id])
  snapshotDate  DateTime @db.Date
  grossAssets   Decimal  @db.Decimal(18,2)
  totalLiabilities Decimal @db.Decimal(18,2)
  netWorth      Decimal  @db.Decimal(18,2)
  breakdown     Json
  createdAt     DateTime @default(now())

  @@unique([userId, snapshotDate])
  @@index([userId, snapshotDate])
}
```

**Backend — `packages/api/src/services/netWorth.service.ts`:**
- `computeSnapshot(userId, asOfDate)` — reuses existing `getDashboardNetWorth` logic (already correct), parameterized by date where historical data allows (falls back to current for dates without historical valuation).
- `computeHistory(userId, months=24)` — reads cached `NetWorthSnapshot` rows, computes+stores only the current month live, returns ascending list.
- `getNetWorthChange(userId, period)` — diff current vs snapshot at period start (1M/3M/6M/1Y/ALL).

**Job — `packages/api/src/jobs/netWorthJobs.ts`:** `startNetWorthJobs()`, daily `cron.schedule('0 6 * * *', ..., {timezone: 'Asia/Kolkata'})` snapshotting all active users, registered in `index.ts` next to existing job starts.

**API:** `GET /api/intelligence/net-worth` → `{current, history[], change_1m, change_1y}`.

**Frontend — `apps/web/src/components/intelligence/NetWorthChart.tsx`:** Recharts stacked area (gross assets teal 30%, liabilities red 20%, net worth solid line), period toggle 3M/6M/1Y/All, 3 `MetricCard`-based stat cards above. Slot: replaces the current "Net Worth Hero" static section in `DashboardPage.tsx` (lines ~439-539) with this richer chart version — direct upgrade, not an addition.

**Tests:** `netWorth.service.test.ts` — snapshot math against fixed dashboard-service fixtures; verify idempotent upsert on `(userId, snapshotDate)`.

---

## Module 5 — Insights Feed: rule-based generators

**Decision:** keep the existing LLM-prose system (`analytics.insights.ts`) as-is — it's a different, useful thing (narrative monthly summary) — and add a **separate, deterministic rule-engine** alongside it, since spec's 10 generators want instant/free/precise triggers (e.g. "FD matures in 12 days"), which an LLM call is the wrong tool for. Insights Feed becomes the union of both, tagged by `source: 'rule' | 'llm'`.

**Schema — extend `PortfolioInsight` or new `UserInsight` table** (new table is cleaner — different shape than the existing narrative-card model):
```prisma
model UserInsight {
  id             String   @id @default(cuid())
  userId         String
  user           User     @relation(fields: [userId], references: [id])
  type           String   // alert | recommendation | milestone | observation
  priority       Int      // 1-5
  category       String   // tax | investment | debt | savings | goal | market
  title          String
  body           String
  actionLabel    String?
  actionType     String?  // navigate | modal | external_link
  actionPayload  Json?
  impactAmount   Decimal? @db.Decimal(18,2)
  source         String   @default("rule")
  generatedAt    DateTime @default(now())
  expiresAt      DateTime
  dismissedAt    DateTime?
  clickedAt      DateTime?

  @@index([userId, dismissedAt, expiresAt])
}
```

**Backend — `packages/api/src/services/insightsEngine.service.ts`:** 10 generator functions per spec (`highInterestDebtAlert`, `sipUnderperformanceAlert`, `emergencyFundWarning`, `taxLossHarvestingOpportunity`, `fdMaturityReminder`, `portfolioConcentrationWarning`, `salaryCreditDetected`, `netWorthMilestone`, `fundOverlapObservation`, `goalOffTrackAlert`) — each reads existing services directly (no new data plumbing: reuses `creditCards.service`, `xirr.service` per-holding from Module 3, `healthScore` emergency-fund calc from Module 1, `taxHarvestMath.ts`, loans/FD data, `NetWorthSnapshot` from Module 4 for milestones, existing `/analytics/mf-overlap` endpoint, `goalMath` projection from Module 2). Run all generators → sort by priority then impactAmount → dedupe → upsert with 7-day expiry. Triggered on-demand (`POST /insights/regenerate`, matching existing pattern) rather than a new AA-sync hook (no AA integration is live yet per memory — see `[[project_finvu_aa_integration]]`, paused).

**API:** `GET /api/intelligence/insights`, `POST /api/intelligence/insights/:id/dismiss`, `POST /api/intelligence/insights/:id/click`.

**Frontend — extend `InsightsPanel.tsx`:** add priority-1 pulse dot, impact-amount display (green "saves ₹X" / red cost), dismiss button (X, not swipe — desktop-first app per existing UI), empty state, "View all" link to a new `/insights` page listing both rule + LLM-sourced cards merged and sorted.

**Tests:** `insightsEngine.service.test.ts` — one fixture-driven test per generator (trigger case + non-trigger case).

---

## Module 6 — Tax: PDF export + Pro-tier gate

**Backend — `generateItrReport(userId, financialYear)`** in `tax.service.ts` (or new `taxReport.service.ts`), using **pdfkit** (already installed) — reuse `export.service.ts`'s `streamPdf()` pattern. Sections: Equity STCG/LTCG, MF STCG/LTCG, Debt MF gains, FD interest, summary + tax disclaimer, mirroring the existing 9-tab web breakdown (superset of spec's Schedule-CG layout).

**Pro-gate middleware — `packages/api/src/middleware/requirePlan.ts`:** new middleware following the existing `requireRole()` shape in `authenticate.ts`, checks `req.user.plan` against an allowed-tiers list, throws `ForbiddenError`. Applied to the new PDF-download route only (`GET /api/intelligence/tax/report/download`) — leave existing CSV/JSON tax endpoints ungated (no behavior change to what's already shipped and presumably in use).

**Frontend:** "Download ITR-ready Report" button in `TaxPage.tsx` Summary tab — Pro users get direct download, free users see blurred/locked state with upgrade CTA (`user.plan` check client-side, enforced server-side by the middleware).

**Tests:** `taxReport.service.test.ts` (PDF byte-stream smoke test — non-empty buffer, correct page count) + `requirePlan.test.ts` (403 for FREE, 200 for PLUS+).

---

## Cross-module: Central Intelligence Dashboard

New page `apps/web/src/pages/intelligence/IntelligenceDashboard.tsx`, route `/intelligence` (additive — does not replace `/dashboard`, since the audit shows `DashboardPage.tsx` already has a mature, in-use layout; upgrading pieces of it in place per-module as noted above, and adding this as a focused second view mirrors spec's "central dashboard" ask without a risky full dashboard rewrite):
1. Health Score gauge (Module 1) — full width, top.
2. Net Worth Chart (Module 4) — full width.
3. Two-column: Insights Feed (Module 5, left 60%) | XIRR summary (Module 3, right 40%).
4. Tax snapshot strip (Module 6) — blurred/locked for free users.
5. Goals row (Module 2) — horizontal scroll of goal cards + add-goal card.

Out of scope for this build (explicitly deferred, flag if wrong): weekly email digest scheduler job, AMFI/NSE live market-data fetchers (repo already has `priceFeeds/` — reuse existing feeds, don't build new ones per spec's Module-adjacent "Utility: Indian Market Data Feeds" section), push notifications for Priority-1 insights.

## Out-of-scope confirmation needed
- Weekly digest email — build now or defer?
- `/intelligence` as new route vs folding pieces into existing `/dashboard` only — confirm the additive-page approach above, or prefer dashboard-only integration?
