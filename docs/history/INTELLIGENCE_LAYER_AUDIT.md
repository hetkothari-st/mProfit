> Historical document — superseded by `portfolioos/ARCHITECTURE.md` and the root `CLAUDE.md` as of 2026-10-19. Kept for reference.

# Intelligence Layer Audit

Source spec: `C:\Users\ST269\Downloads\PORTFOLIOOS_INTELLIGENCE_LAYER_PROMPT.md`
Audited: 2026-07-01. Stack mismatch note: spec assumes FastAPI/Python; repo is actually Node/Express/Prisma + React (`packages/api`, `apps/web`). Module *logic and API shape* below is reusable; code samples in the source doc are not.

## Verdict per module

| # | Module | State | Net-new work |
|---|---|---|---|
| 1 | Net Worth Engine | **Not present** (time-series) | High |
| 2 | XIRR Engine | **Partial** — solid backend, no per-holding breakdown, no cache, no frontend | Medium |
| 3 | Financial Health Score | **Not present** — but all 6 sub-score data sources already exist elsewhere | Medium (mostly aggregation, not new data) |
| 4 | Insights Feed | **Partial (~30%)** — LLM-generic-card system, not spec's 10 rule-based generators | High |
| 5 | Tax Intelligence | **Solid, exceeds spec** — FY24-25 rates correct, FIFO correct, 9-tab frontend vs spec's 4 | Low (PDF export + Pro-gate only) |
| 6 | Goal Planner | **Partial (~50%)** — CRUD done, projection math (FV/required-SIP/trajectory) missing entirely | Medium-High |

---

## Module 1 — Net Worth Engine

**Exists:** `getDashboardNetWorth()` (`packages/api/src/services/dashboard.service.ts:58-474`) — computes current assets − liabilities, breakdown by class, `GET /api/dashboard/net-worth`. Family-scope variant `getDashboardNetWorthForScope()` (line 492). Frontend shows current net worth via metric cards in `DashboardPage.tsx`, plus a *portfolio valuation* area chart (not net-worth-specific).

**Missing:** `net_worth_history` table, `compute_snapshot(asOf)`, `compute_history(months)`, `get_net_worth_change(period)`, `/api/intelligence/net-worth` endpoint, `NetWorthChart` component (3-layer area chart + 3 stat cards + period toggle).

**Assessment:** current-state computation is solid and reusable; zero time-series. This is the biggest genuinely-new piece — needs a snapshot table + daily cron + new chart component.

## Module 2 — XIRR Engine

**Exists:** Newton-Raphson solver w/ bisection fallback (`xirr.service.ts:67-111`), reliability flag for <90-day spans, portfolio/user/asset-class aggregation, rolling 1Y/3Y/5Y, `GET /api/reports/xirr(+/user)`. Frontend: `KpiCards.tsx` (hero XIRR + reliability), `AssetClassXirrBar` (asset-class level bar chart).

**Missing:** per-holding XIRR (`HoldingRow.xirr` is always `null` — `portfolio.service.ts:453`), 6h cache, `/api/intelligence/xirr` endpoint with `by_holding` array, Good/Average/Below-FD hero label, Nifty/FD comparison bar, sortable holdings table.

**Assessment:** algorithm layer is done and correct — don't touch it. Net-new work is the per-holding fan-out + a new display component.

## Module 3 — Financial Health Score

**Exists:** nothing named this. But every sub-score's raw data already lives somewhere:
- Emergency fund: `BankBalanceSnapshot`, `CanonicalEvent` (debits) — needs assembly.
- Investment rate: `CanonicalEvent` (SIP_INSTALLMENT, salary credits) — needs assembly.
- Debt burden: `Loan.emiAmount`, `CreditCard.minimumDue`, `cashflowForecast.service.ts:67-104` — nearly complete, just needs income denominator.
- Diversification: `portfolio.service.ts:459` `getAssetAllocation` — reusable directly.
- Insurance: `InsurancePolicy.sumAssured` — reusable directly.
- Goal progress: `goalMath.ts` `progressPct` — reusable directly, already unit-tested.

**Assessment:** cheapest module to build relative to spec ambition — it's an aggregation/scoring layer over data that already exists, not a new ingestion problem. ~1000-1300 LOC estimate (service + gauge component) from the audit agent.

## Module 4 — Insights Feed

**Exists:** `analytics.insights.ts` + `insightActions.ts` generate 6 **LLM-driven** generic categories (diversification, tax_optimisation, underperformers, cash_drag, sector_tilt, risk_concentration) via Claude Sonnet, cached, budget-tracked. `PortfolioInsight` model stores `cards` JSON + `narrative`. `GET /insights`, `POST /insights/generate`. Frontend `InsightsPanel.tsx` — color-coded-by-severity cards, regenerate button, cost display.

**Missing vs spec's 10 rule-based generators:** `high_interest_debt_alert`, `emergency_fund_warning`, `fd_maturity_reminder`, `salary_credit_detected`, `net_worth_milestone`, `fund_overlap_observation`, `goal_off_track_alert` — all absent. `tax_loss_harvesting_opportunity`/`sip_underperformance_alert`/`portfolio_concentration_warning` exist only as generic LLM prose, not deterministic rules with `impact_amount`. Schema missing `priority`, `impact_amount`, `dismissed_at`, `clicked_at`, `expires_at`. No dismiss/click API. Frontend missing swipe-dismiss, priority pulse, impact display, empty state.

**Assessment:** architecturally different approach (LLM prose vs deterministic rule engine) — this is the module most worth a real design conversation, since spec wants cheap/instant/deterministic insights and current system is LLM-cost-per-generation. Reusing current system as *one more generator* alongside 10 rule-based ones is probably right rather than a rebuild.

## Module 5 — Tax Intelligence

**Exists:** `tax.service.ts:45-55` — STCG 20%/LTCG 12.5%/₹1.25L exemption correctly gated on the July 23 2024 rate-change date. FIFO in `capitalGains.service.ts:264` handles bonus/demerger/rights at zero cost basis. Frontend `TaxPage.tsx` has **9 tabs** (Summary, 112A, 112, STCG, LTCG, Intraday, F&O Schedule 43, Dividend & Interest, Tax Harvest) — exceeds spec's 4-tab ask.

**Missing:** PDF/ITR report (only CSV export exists), Pro-tier gating (schema has `PlanTier` enum but `tax.routes.ts` doesn't check it — any authenticated user gets full access today).

**Assessment:** by far the most mature module. Only real gaps: PDF generation, and enforcing the tier gate that's already modeled in schema but not wired.

## Module 6 — Goal Planner

**Exists:** `Goal` model, full CRUD (`goals.service.ts`, `goals.routes.ts`), `goalMath.ts` gives progress%, inflation-adjusted target, required CAGR. Frontend: goal cards grid w/ progress bar + on-track badge, create/edit modal w/ 4 of 5 spec templates.

**Missing entirely:** FV-with-monthly-compounding formula, `monthly_projection` array, `required_sip_to_meet_target`, `sip_gap`, `probability_of_success`, `suggest_allocation()`, `/goals/{id}/projection` endpoint, goal detail page, trajectory chart (your-path vs required-path with gap fill), shareable image, live preview in modal, 5th template (dream vacation).

**Assessment:** the CRUD shell is done; the actual "intelligence" (projection math + trajectory visualization that spec calls the virality driver) is 0% built. Second-biggest genuinely-new chunk after net worth history.

---

## Recommended build scope (net-new only)

Ranked by leverage (spec impact ÷ effort), based on the above:

1. **Financial Health Score** — cheapest, all inputs exist, ships a highly visible dashboard feature.
2. **Goal Planner projection math** (FV formula, required-SIP, trajectory chart) — CRUD already there, just needs the math + one chart.
3. **XIRR per-holding + dedicated display** — algorithm reuse, moderate new surface.
4. **Net Worth history** (snapshot table + cron + chart) — needed for the Health Score's own dashboard placement and for milestone insights (Module 4 #8).
5. **Insights Feed — rule-based generators layered onto existing LLM system** — biggest scope, needs its own design decision (rule engine vs LLM-prose coexistence).
6. **Tax PDF export + Pro-tier gate enforcement** — small, mechanical, do whenever.

This list is a recommendation, not a plan — next step per your earlier answer is to brainstorm/design the pieces you want built, in whatever order you pick.
