---
id: F-STOCK-003
title: "Refresh stock prices"
module: "Stocks"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-STOCK-001]
---

[← Stocks](../modules/stocks.md) · [Index](../INDEX.md)

# Refresh stock prices

`F-STOCK-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** **Refresh prices** fetches current prices for held stocks and re-values holdings, then shows "Refreshed N stock prices".

**Why it exists:** Scheduled price jobs run at fixed times; this lets you update on demand. Inferred from behavior.

**Where to find it:** **Asset Classes → Stocks** → **Refresh prices** (route `/stocks`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (any signed-in user).

**Steps**
1. Click **Refresh prices**. The button shows a spinner.
2. When done, the toast "Refreshed N stock prices" appears and the table reloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh prices** | Button | Runs the price refresh | While a refresh is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Stored prices and holding values update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Refresh failed" (or the server's message) | Upstream price source or server error | Try again later |

**Limitations:** The refresh is not limited to your holdings: it fetches prices for stocks held by any user and re-values every holding in the system, so it can be slow (DOCUMENTATION_GAPS.md). N counts stock prices updated across all users.

**How it works:** `POST /api/assets/refresh-prices` runs a Yahoo price update for all held stocks (`onlyHeld`), then re-prices every holding row (market-priced classes) and recomputes every accrual holding (FD, RD, NSC, KVP, PO TD, SSY, PO RD). Response `{ stocks: { updated, failed }, holdings: { updated } }`.

**Related features:** [F-STOCK-001](F-STOCK-001.md), [D-ASSET-007](../dependencies.md#d-asset-007).

**Sources:** `apps/web/src/pages/assetClasses/StocksPage.tsx:90`, `packages/api/src/routes/assets.routes.ts:42`, `packages/api/src/controllers/assets.controller.ts:88`, `packages/api/src/controllers/assets.controller.ts:89`, `packages/api/src/services/holdings/holdingsProjection.ts:694`
