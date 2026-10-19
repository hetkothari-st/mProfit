# Phase 3 — Intelligence & Differentiators — Plan

> Master roadmap: `2026-05-29-portfolioos-master-roadmap.md`. This expands Phase 3.

**Hard constraint (carries from analytics.insights.ts):** SEBI describe-never-prescribe. No card/feature may tell the investor to buy/sell/trim/rebalance a named security, or output personalised target allocations. "Actions" = navigation to the user's own data/tools + neutral worksheets, never advice.

## 3a — Insights → actions  *(this task)*
Each `InsightCard` gets a deterministic, code-derived **navigation CTA** to the tool that addresses the finding. No LLM advice; pure category→tool map, so it works on cached cards too and can't drift into prescription.

Mapping (category → CTA):
- `tax_optimisation` → "View tax-harvest worksheet" → `/tax`
- `risk_concentration` → "Review concentration" → `/analytics#concentration`
- `diversification` → "View allocation" → `/analytics#allocation`
- `underperformers` → "Review holdings" → `/stocks`
- `sector_tilt` → "View sector breakdown" → `/analytics#sector`
- `cash_drag` → "Review cash flow" → `/cashflows`

- Backend: `insightActions.ts` — `actionForCategory(category): InsightAction | null`; attach `action` to every card in all three return paths (cached / fresh / latest).
- Frontend: render the CTA link on each insight card in AnalyticsPage.

## 3b — Tax-harvest optimizer  *(next)*
Worksheet (the data already exists in `taxHarvest` snapshot): exact lots, STCG/LTCG offset, ₹1.25L LTCG exemption, projected tax saved; CA-exportable. Neutral framing + "consult a tax professional on timing." Builds on `capitalGains.service.ts` + `tax.service.ts`.

## 3c — What-if simulator
Read-only scenario: "if N units of X were sold" → recompute tax, allocation, XIRR, net worth deltas. Pure compute over current holdings; presents outcomes, makes no recommendation.

## 3d — Zero-entry onboarding via Gmail
Extend gmail scan/ingestion to auto-create holdings/policies/FDs with review-before-commit. The acquisition demo.

## 3e — NRI mode
NRE/NRO/FCNR, repatriable flag, DTAA, Form 67, TCS on NRO (`LrsRemittance`, `TcsCredit` exist).

## 3f — Advisor/CA layer
Multi-client switcher, white-label, bulk tax export, client read-only shares. Roles exist in schema.

**Acceptance (3a):** every insight card renders a neutral CTA linking to the relevant tool; mapping unit-tested; no prescriptive language introduced.
