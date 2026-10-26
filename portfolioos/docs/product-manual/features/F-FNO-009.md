---
id: F-FNO-009
title: "Sync broker trades"
module: "Futures & Options"
status: Partial
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (owner)"
settings: []
related: [F-FNO-002, F-FNO-008]
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# Sync broker trades

`F-FNO-009` · Partial · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (owner)

**What it does:** **Sync Kite** pulls today's F&O trades from your Zerodha account into the current portfolio and shows "Synced — N new trades". If Kite is not set up, it says "Connect Kite (Zerodha) first." and opens the dialog, resuming the sync after saving; if the session expired, it says "Login to Kite (Zerodha)." and opens the login popup, then syncs.

**Why it exists:** Saves typing trades by hand. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** → **Sync Kite** (route `/fo`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with a Zerodha API app.

**Steps**
1. Click **Sync Kite**. A spinner shows.
2. Follow any connect/login prompt.
3. "Synced — N new trades" appears; positions and trades refresh.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Sync Kite** | Button | Syncs Zerodha | No portfolio, or a sync is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** New trades become F&O transactions (each with a stable source hash, so re-syncing the same day adds nothing twice); touched positions are rebuilt; margin is stored when the broker returns it.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Connect Kite (Zerodha) first." | No active credential | Fill the dialog |
| "Login to Kite (Zerodha)." | No access token | Complete the popup login |
| "Sync zerodha failed" (or server message) | Broker error | Retry later |

**Limitations:** N counts every trade the broker returned for today, including ones already stored (re-syncing shows the same N but adds nothing). Only today's trades are fetched; earlier days must be imported from contract notes. The page has a sync button only for Zerodha: connected Upstox or Angel One accounts cannot be synced from anywhere in the app (DOCUMENTATION_GAPS.md). There is no scheduled automatic sync.

**How it works:** `POST /api/fo/sync-broker` `{ brokerId, portfolioId }` → checks ownership → the broker connector's `syncDay` (Kite `/trades`, NFO/BFO only) → each trade ingested as a transaction → positions recomputed.

**Related features:** [F-FNO-008](F-FNO-008.md), [F-FNO-002](F-FNO-002.md).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:253`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:343`, `packages/api/src/controllers/fo.controller.ts:204`, `packages/api/src/services/fo/foBrokerSync.service.ts:31`, `packages/api/src/services/fo/foBrokerSync.service.ts:97`, `packages/api/src/ingestion/fno/broker-connector/types.ts:16`
