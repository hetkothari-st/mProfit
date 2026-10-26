---
id: F-FNO-002
title: "Open and closed positions"
module: "Futures & Options"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-FNO-003, F-FNO-006, F-FNO-007, F-FNO-008]
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# Open and closed positions

`F-FNO-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The **Open (n)** and **Closed (n)** tabs split positions into a **Futures Ledger** (Contract, Side, Expiry with a days-left badge, Net Qty, Lot, Avg Entry, LTP or "awaiting LTP", Notional, Realized, Unrealized, Status) and an **Options Chain** (Underlying, Type CE/PE, Strike, Payoff glyph, Expiry, Net Qty, Lot, Premium, LTP, Outlay, Realized, Unrealized, Status), each with Notional/Premium Outlay, Realized, Unrealized and Net P&L totals. Clicking a contract row lists its trades. Below them a **Trade Tape** shows your latest 50 F&O trades.

**Why it exists:** Futures and options need contract-level views (strike, expiry, lots), not the average-cost view used for stocks. Inferred from code comments.

**Where to find it:** **Asset Classes → F & O** → **Open** / **Closed** tabs (route `/fo`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); own positions only.

**Steps**
1. Click **Open (n)** (default) or **Closed (n)**.
2. Click a contract row to expand its trades (Date, Side, Qty, Price, Net, Broker); click again to collapse.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open (n)** / **Closed (n)** | Tabs | Switch position lists | — |
| Contract row | Click | Expand/collapse its trades | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No open F&O positions" / "Sync your broker or import contract notes to populate positions." | No open position | Sync a broker ([F-FNO-008](F-FNO-008.md)) or import contract notes ([D-ASSET-012](../dependencies.md#d-asset-012)) |
| "No closed positions" | Nothing closed yet | — |
| "awaiting LTP" | No live or end-of-day price matched the contract | Wait for **Sync prices** or the 16:45 bhavcopy job |
| "No transactions on file for this contract." | No trade matched by underlying, expiry, strike and type | Check the contract was imported |

**Limitations:** Open = status OPEN or "EXPIRY ?" (pending expiry approval); Closed = CLOSED, EXPIRED_WORTHLESS or EXERCISED; statuses are shown as these raw words. The trade tape under both tabs shows all trades, not only those of the listed positions.

**How it works:** Positions come from `GET /api/fo/positions?portfolioId=` (refetched every 5 s while visible), trades from `GET /api/fo/trades?portfolioId=`. A contract's trades are matched by the leading letters of the trade's instrument name (underlying), expiry, and for options strike and Call/Put. Positions are rebuilt from F&O transactions by the server (not the stock holding engine); unrealized P&L = Σ over open lots (mark − entry) × signed quantity.

**Related features:** [F-FNO-003](F-FNO-003.md), [F-FNO-006](F-FNO-006.md), [F-FNO-007](F-FNO-007.md).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:214`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:297`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:653`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:688`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:698`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1023`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1218`, `packages/api/src/services/fo/derivativePosition.service.ts:233`
