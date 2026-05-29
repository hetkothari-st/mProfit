# PortfolioOS — Master Roadmap (Sections 1a → 5e)

> **Scope note:** This roadmap spans many independent subsystems (~multi-month). Per the writing-plans skill, it is a **phased master plan**. Each section expands into its own detailed bite-sized plan when reached. Section 1 is already expanded — see `2026-05-29-section-1-valuation-correctness.md`.

**Repo:** `portfolioos` (pnpm monorepo). `apps/web` (React 18 + Vite + Tailwind + Radix + React Query + Zustand), `packages/api` (Express + Prisma 5.22 + PostgreSQL, Bull/Redis jobs), `packages/shared` (types, finance utils, Decimal.js).

**Guiding principle (calibrated after code review):** The codebase is far more mature than the live UI implies. Most "bugs" are **display/labeling + edge-guard** issues, not missing engines. Work is **trust, accuracy, onboarding** — not raw features. Verify before building; never re-implement what exists.

**Test/run commands:**
- `pnpm --filter @portfolioos/api test` / `pnpm --filter @portfolioos/shared test` / `pnpm --filter @portfolioos/web test` (Vitest)
- `pnpm typecheck` · `pnpm lint` · `pnpm build`
- `pnpm docker:up` (Postgres + Redis) → `pnpm db:migrate` → `pnpm db:seed` for DB-touching tests
- Dev: `pnpm dev:api` (3001) + `pnpm dev:web` (3030)

---

## Phase 1 — Valuation Correctness & Trust  *(LAUNCH BLOCKER — detailed plan exists)*

| Item | Current state (grounded) | Gap → fix |
|---|---|---|
| 1a XIRR | `xirr.service.ts` Newton-Raphson on Decimal cashflows — math correct. -78.73% = ~-6% loss annualized over ~3-week span. | Add `spanDays`+`reliable` to result; suppress/relabel when span < 90d; always show absolute return alongside. |
| 1b Fixed income | `holdingsProjection.ts` already accrual-based (FD/RD/NSC/KVP/PO compounding). | Display: tag `valuationMethod`, label as **Accrued**, suppress daily/MTM % on accrual rows; surface maturity value + effective yield. |
| 1c Corporate actions | `corporateActions.service.ts` fetches/parses/stores; `replayTransactions` applies SPLIT/BONUS *if a tx row exists*. | Build auto-apply service+job: CorporateAction → idempotent SPLIT/BONUS/DIVIDEND tx rows → recompute. Add merger/rights. |
| 1d Price staleness | feeds store dated prices; `refreshPricesForRows` stamps `computedAt`; no as-of surfaced, no staleness check. | Add `priceAsOf` to projection + API; `isPriceStale()` helper; amber "as of <date>" badge in UI. |
| 1e Denominators | `dashboard.service.ts` returns `totalNetWorth` + `netWorthAfterLiabilities`. | Add scope metadata to payload; per-card scope tooltips; one canonical definition documented. |

**Acceptance:** No misleading number on dashboard/analytics; every figure states scope + as-of; corp-action split keeps P&L continuous; regression tests lock each calc.

---

## Phase 2 — Auto-Import & Completeness  *(the real moat vs MProfit)*

- **2a Account Aggregator (AA)** — integrate Setu/Finvu/Anumati consent flow; pull bank + deposit + some MF/insurance read-only. New `connectors/aa.*`, models for consent/handle. Biggest unlock.
- **2a Broker OAuth done right** — replace manual `request_token` paste (`ConnectorsPage.tsx`, `brokerOauth.service.ts`) with full server-side redirect handshake. Add Upstox, Angel One, Groww, Dhan, 5paisa, ICICIdirect (schema `BrokerProvider` already lists them).
- **2a CAS auto-loop** — close request→Gmail→parse loop; auto-detect CAS arrival, parse, dedupe vs holdings, review-before-commit diff.
- **2a Parser robustness** — per-broker contract-note templates + LLM-extraction fallback (LlmSpend metering exists); DLQ auto-retry + "fix mapping" UI (`IngestionFailure`, `/imports/failures`).
- **2b Liabilities fully netted** — amortization schedule, EMI calendar, interest-paid-YTD on `Loan`/`CreditCard`; surface assets−liabilities prominently.
- **2c Goals & planning** — new `Goal` model + service; retirement/education/FIRE/emergency templates; SIP-to-goal mapping + required-CAGR gauge.
- **2d Cashflow forecast** — merge rent-in / EMI-out / premiums / SIPs / maturities / dividends into forward-12-month timeline with liquidity warnings.
- **2e Benchmarking** — portfolio vs NIFTY50/Sensex/category/gold/FD; per-holding alpha; TWR alongside XIRR (`analytics.benchmark.ts` exists — extend).
- **2f Family/household** — household roll-up over portfolios; per-member PAN/tax-residency; nominee + ownership %.
- **2g Asset depth** — F&O margin/expiry/MTM (`DerivativePosition`, `MarginSnapshot`); MF direct-vs-regular + overlap; insurance adequacy gap.

**Acceptance:** A new user connects AA + a broker + Gmail and sees a populated, deduped portfolio within minutes, no manual entry.

---

## Phase 3 — Intelligence & Differentiators  *(10× past MProfit)*

- **3a Insights → actions** — each `PortfolioInsight` gets an action (harvest plan / rebalance trades / SIP bump / diversify). SEBI-compliant descriptive framing (already started).
- **3b Tax-harvest optimizer** — scan unrealised losses, match vs realised gains, output exact lots to sell + tax saved + ₹1.25L LTCG exemption harvesting; export to CA. Builds on `capitalGains.service.ts`, `tax.service.ts`.
- **3c What-if simulator** — "sell X" / "add SIP Y" → instant tax, allocation, XIRR, risk, net-worth deltas.
- **3d Zero-entry onboarding via Gmail** — extend `gmailScan`/ingestion to auto-create holdings/policies/FDs from inbox with review-before-commit. The demo that sells the product.
- **3e NRI mode** — NRE/NRO/FCNR, repatriable flag, DTAA, Form 67, TCS on NRO (`LrsRemittance`, `TcsCredit` exist).
- **3f Advisor/CA layer** — multi-client switcher, white-label, bulk tax export, client read-only shares. Roles already in schema (ADVISOR/CA/FAMILY_OFFICE).

**Acceptance:** Insights are actionable; tax-harvest worksheet exports; "connect Gmail → instant portfolio" works end-to-end.

---

## Phase 4 — UX Hardening  *(grounded in live review)*

- 3-step onboarding wizard (`OnboardingWizard` exists — flesh out) + empty-state CTAs per asset page.
- Alerts: group/collapse, Snooze / Mark-paid / Dismiss (`AlertsPage`, `alerts.service.ts`).
- One-denominator scope labels (ties to 1e).
- Trajectory chart: autoscale Y to data range (`DashboardPage` chart).
- Hide internal "LLM spend" gauge from normal users → Settings/admin.
- Connectors: server-side OAuth (ties to 2a).
- Failed imports: "fix mapping" + retry (ties to 2a).
- Mobile responsive audit + PWA.
- Stocks/asset pages: sector, benchmark column, dividend history, corp-action flag.
- Background scheduled refresh + "last synced" stamp everywhere.
- **Net-worth masking (•••••) stays as-is per owner decision — do NOT change default.**

**Acceptance:** First-run user reaches first value < 5 min; no internal metrics leak; charts read truthfully on mobile.

---

## Phase 5 — Trust, Compliance & Go-To-Market  *(how it sells)*

- **5a Security page** — make AES-256 + Postgres RLS claims concrete; "read-only, never transact, never store broker creds"; 2FA; session mgmt; audit log (`AuditLog` exists); SOC2/ISO roadmap; India data residency.
- **5b Methodology page** — public doc: how XIRR/TWR computed, per-asset valuation, price sources + timestamps, corp-action handling.
- **5c Pricing tiers** — Free (manual + net worth) / Pro (auto-import, tax, AI, goals, benchmarking) / Family (multi-member, NRI) / Advisor (multi-client, white-label). `PlanTier` exists — wire entitlements.
- **5d Anti-lock-in export** — ITR-ready CSV/JSON, CA PDF, full data export (`export.service.ts`, `reportBuilder/*` exist — extend).
- **5e GTM** — "connect Gmail → instant portfolio" hero demo; CA/RIA channel; tax-season (Jan–Mar) push; free net-worth tracker as funnel.

**Acceptance:** Security + methodology pages live; tiered entitlements enforced; full export works; pricing page published.

---

## Cross-cutting rules
- TDD for all calc logic. Frequent commits. Never break existing component contracts.
- Decimal.js for all money; never floats in valuation.
- RLS-aware: tests run serial (Vitest forks, `fileParallelism:false`).
- Each phase ships working, testable software before the next begins.
