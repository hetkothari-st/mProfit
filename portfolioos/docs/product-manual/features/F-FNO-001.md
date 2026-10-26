---
id: F-FNO-001
title: "F&O summary and expiring-soon banner"
module: "Futures & Options"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-FNO-002, F-FNO-005, F-FNO-006]
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# F&O summary and expiring-soon banner

`F-FNO-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows four cards — **Open positions** (count), **Realized P&L**, **Unrealized P&L**, **Expiring 7d** (count, amber when above zero) — and, when any open contract expires within 7 days, an amber banner "**Expiring soon:** <underlying> (<date>), …".

**Why it exists:** A quick read of derivative exposure and upcoming expiries. Inferred from behavior and the page description "Open positions, P&L, expiry lifecycle, broker sync."

**Where to find it:** **Asset Classes → F & O** (route `/fo`). The page works on the portfolio given in `?portfolioId=`; without it, on your first portfolio.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (no plan gate); [R-ADMIN](../roles.md#r-admin) as their plan. Only your own positions are shown (family view does not add other members' F&O).

**Steps**
1. Open **Asset Classes → F & O**. The cards load and refresh every 5 seconds while the tab is visible.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report dialog for holdings filtered to Futures and Options ([D-ASSET-001](../dependencies.md#d-asset-001)) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Cards missing | No portfolio yet, or the summary request failed | Create a portfolio; reload |

**Limitations:** There is no portfolio picker on the page; to see another portfolio you need a link with `?portfolioId=`. Realized P&L sums every position (open and closed); Unrealized sums only OPEN positions.

**How it works:** `GET /api/fo/summary?portfolioId=` reads your DerivativePosition rows: open = status OPEN; realized = sum of realizedPnl over all; unrealized = sum of unrealizedPnl over open; "expiring soon" = open positions whose expiry is 0–7 days away (rounded up to whole days).

**Related features:** [F-FNO-002](F-FNO-002.md), [F-FNO-005](F-FNO-005.md), [F-FNO-006](F-FNO-006.md).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:149`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:221`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:374`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:396`, `packages/api/src/controllers/fo.controller.ts:75`
