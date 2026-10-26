---
id: F-FNO-004
title: "F&O Tax / P&L statement"
module: "Futures & Options"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: []
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# F&O Tax / P&L statement

`F-FNO-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The **Tax / P&L** tab shows one card per financial year ("FY <year>": total P&L, "Turnover: … · Trades: N", note "Non-speculative §43(5) · ITR-3") and a table of closed contracts: Underlying, Type, Strike, Expiry, Side (INTRADAY or POSITIONAL), FY, Realized P&L, Turnover, Trades.

**Why it exists:** F&O profit is taxed as business income under section 43(5), not capital gains, and needs ICAI turnover for tax-audit checks. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** → **Tax / P&L** (route `/fo`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). (The separate Schedule 43 report needs Pro/Advisor — [D-ASSET-010](../dependencies.md#d-asset-010).)

**Steps**
1. Click **Tax / P&L**. The statement loads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Tax / P&L** | Tab | Loads the statement | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No realized P&L yet" / "P&L is computed once you close positions or hold past expiry." | No closed trades | — |

**Limitations:** Not a filing document; use the reports area for Schedule 43.

**How it works:** `GET /api/fo/pnl?portfolioId=` replays each contract's trades first-in-first-out into close events. Turnover follows the current ICAI note: futures = Σ |realized per trade|; options = Σ |realized P&L| only. Intraday equity would be speculative; F&O is non-speculative.

**Related features:** [D-ASSET-010](../dependencies.md#d-asset-010).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:465`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1508`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1545`, `packages/api/src/services/fo/foPnl.service.ts:1`, `packages/api/src/controllers/fo.controller.ts:62`
