---
id: F-PORT-005
title: "Refresh prices (one portfolio)"
module: "Portfolios"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DASH-014, F-PORT-008]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Refresh prices (one portfolio)

`F-PORT-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** **Refresh prices** re-values this portfolio's holdings from the latest prices and shows "N holdings refreshed".

**Why it exists:** Inferred from behavior: update one portfolio without waiting for the schedule.

**Where to find it:** Portfolio detail → **Refresh prices**.

**Who can use it:** The portfolio's creator only (others get "Portfolio not found").

**Steps**
1. Click **Refresh prices**. A spinner shows; then "N holdings refreshed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh prices** | Button | Refreshes this portfolio | Disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Holdings' current price, value and P&L are updated.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Refresh failed" / "Portfolio not found" | Error, or the portfolio is not yours | Use your own portfolio |

**Limitations:** Uses prices already stored (and live quotes where the price router supports them); it does not first download new stock closes the way the Dashboard's **Refresh** does.

**How it works:** `POST /api/assets/portfolios/:id/refresh-prices` checks `portfolio.userId` equals you, then re-prices that portfolio's holdings.

**Related features:** [F-DASH-014](F-DASH-014.md), [F-PORT-008](F-PORT-008.md).

**Sources:** `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:91`, `packages/api/src/controllers/assets.controller.ts:76`, `packages/api/src/services/holdings/holdingsProjection.ts:712`
