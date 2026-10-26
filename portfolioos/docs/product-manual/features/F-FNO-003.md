---
id: F-FNO-003
title: "F&O trades tab"
module: "Futures & Options"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-FNO-002]
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# F&O trades tab

`F-FNO-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The **Trades** tab shows the full **Trade Tape**: every F&O trade in the portfolio, newest first, with Date, Side (BUY/SELL), Instrument, Strike, Expiry, Qty, Price, Net and Broker.

**Why it exists:** An audit trail of every derivative trade. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** → **Trades** (route `/fo`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Trades**. The tape loads (scrollable, sticky header).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Trades** | Tab | Shows the tape | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No F&O trades yet" / "Sync your broker or import a contract note to see trades here." | No F&O transactions | Sync or import |

**Limitations:** Only the newest 500 F&O trades are returned. No filtering, search or edit/delete of F&O trades on this page.

**How it works:** `GET /api/fo/trades?portfolioId=` returns your FUTURES/OPTIONS transactions for that portfolio, newest first, at most 500.

**Related features:** [F-FNO-002](F-FNO-002.md), [D-ASSET-012](../dependencies.md#d-asset-012).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:442`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1430`, `packages/api/src/controllers/fo.controller.ts:45`, `packages/api/src/controllers/fo.controller.ts:57`
