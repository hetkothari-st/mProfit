---
id: F-FNO-006
title: "Live F&O prices"
module: "Futures & Options"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-FNO-002]
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# Live F&O prices

`F-FNO-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** While the page is open and visible, it asks the server every 5 seconds to re-mark open positions from NSE live derivative quotes. A chip shows "waiting for first poll", "fetching", or "Live · <matched>/<total> · <n>s ago" (green all matched, amber some, red none). **Sync prices** triggers a refresh immediately. If nothing matches, a one-time message explains: "Live feed: 0/<total> matched. NSE returned no live data — check API logs (host may be IP-blocked, or markets are closed)." or "…AssetKey shape mismatch — open API logs to see missed keys."

**Why it exists:** Unrealized P&L needs a current mark during market hours. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** header (route `/fo`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Keep the page open; marks update automatically.
2. Click **Sync prices** (tooltip "Pull live MTM from NSE quote-derivative") to refresh now.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Live status chip | Indicator | Shows last poll result | — |
| **Sync prices** | Button | Refreshes marks now | No portfolio, or a refresh is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Open positions' LTP and unrealized P&L update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Live refresh failed" | Server error | Retry |
| Red chip "Live · 0/N" | NSE blocked or market closed | Rely on the end-of-day bhavcopy |

**Limitations:** Polling pauses when the browser tab is hidden. Outside these page polls, a server job also marks positions every minute 09:00–15:59 IST Mon–Fri and from the bhavcopy at 16:45 ([D-ASSET-007](../dependencies.md#d-asset-007)).

**How it works:** `POST /api/fo/refresh-live?portfolioId=` loads your OPEN positions, fetches NSE quotes once per underlying (server caches each underlying 5 s), and updates mtmPrice/unrealized; returns `{ updated, total, missedKeys, sampleHits }`.

**Related features:** [F-FNO-002](F-FNO-002.md), [D-ASSET-007](../dependencies.md#d-asset-007).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:164`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:193`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:206`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1626`, `packages/api/src/controllers/fo.controller.ts:185`, `packages/api/src/services/fo/derivativePosition.service.ts:352`, `packages/api/src/jobs/priceJobs.ts:372`
