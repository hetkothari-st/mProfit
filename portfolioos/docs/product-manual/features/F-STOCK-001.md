---
id: F-STOCK-001
title: "Stocks holdings overview"
module: "Stocks"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-STOCK-002, F-STOCK-003]
---

[← Stocks](../modules/stocks.md) · [Index](../INDEX.md)

# Stocks holdings overview

`F-STOCK-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows four summary cards (**Current value**, **Invested**, **Unrealised P&L**, **Return**) and an **Equity Holdings** table with one row per stock or ETF, aggregated across all your portfolios: Symbol (with an "ETF" tag for ETFs), Name, Qty, Avg cost, LTP with its price date, Value, P&L, %, and the portfolios that hold it. Clicking a row expands it to show a **Per-portfolio breakdown** (only when more than one portfolio holds it) and the stock's **Transactions** list.

**Why it exists:** One place to see what you own in listed equities regardless of which portfolio it sits in. Inferred from behavior and the page description "Equity holdings aggregated across all portfolios".

**Where to find it:** **Asset Classes → Stocks** (route `/stocks`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (no plan gate); [R-ADMIN](../roles.md#r-admin) as their plan; [R-MANAGER](../roles.md#r-manager) sees the managed person's stocks. In family view ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)) the page lists whatever portfolios and transactions the family view returns.

**Steps**
1. Open **Asset Classes → Stocks**. The summary cards and the Equity Holdings table load.
2. Click a stock's row. It expands to show the per-portfolio breakdown (if held in 2+ portfolios) and its transactions, newest first.
3. Click the row again to collapse it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Stock row | Click | Expands/collapses the per-portfolio breakdown and transactions | — |
| **Download** | Button | Opens the report download dialog for holdings filtered to asset class Equity ([D-ASSET-001](../dependencies.md#d-asset-001)) | — |
| **Refresh prices** | Button | See [F-STOCK-003](F-STOCK-003.md) | While refreshing |
| **Add transaction** | Button | See [F-STOCK-002](F-STOCK-002.md) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes; read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No equity holdings" / "Add a BUY transaction on a stock to get started." | No Equity or ETF holding with units above zero | Click **Add transaction** |
| "No transactions on file for this stock." in an expanded row | The stock's transactions are older than the newest 200 equity (or ETF) transactions, or the name/symbol differs between holding and transactions | Use **Overview → Transactions** to find older entries |
| LTP shows "—" | No stored price yet for that stock | Wait for the next price job or click **Refresh prices** |
| "⚠ as of …" in amber | The price date is more than 5 days old | **Refresh prices** |

**Limitations:** Rows are merged by symbol (or name when there is no symbol), so the same symbol on two exchanges shows as one row. Only the newest 200 Equity and 200 ETF transactions are loaded. The **Download** report includes Equity only, not ETFs, although ETFs are shown on the page (DOCUMENTATION_GAPS.md).

**How it works:** The page loads your portfolio list, then each portfolio's holdings (`GET /api/portfolios/:id/holdings`), keeps rows of class EQUITY and ETF, and adds them up per symbol with exact decimal arithmetic: quantity and cost are summed, average cost = total cost ÷ quantity, value and P&L are summed when both sides have a value. The summary uses the shared rule: holdings with no price are carried at cost in **Current value** and kept out of P&L; the hint "1 holding at cost — no price yet" / "N holdings at cost — no price yet" appears under Current value. **Return** = P&L ÷ cost of priced holdings × 100. Transactions come from `GET /api/transactions?assetClass=EQUITY&pageSize=200` and `…ETF…`, merged and sorted newest first, and are attached to a row by symbol (else asset name). The row's % comes from the server (unrealised P&L ÷ cost × 100). Price freshness: "as of <relative time>", amber with ⚠ when older than 5 days.

**Related features:** [F-STOCK-002](F-STOCK-002.md), [F-STOCK-003](F-STOCK-003.md), [D-ASSET-001](../dependencies.md#d-asset-001), [D-ASSET-002](../dependencies.md#d-asset-002), [D-ASSET-007](../dependencies.md#d-asset-007).

**Sources:** `apps/web/src/pages/assetClasses/StocksPage.tsx:83`, `apps/web/src/pages/assetClasses/StocksPage.tsx:123`, `apps/web/src/pages/assetClasses/StocksPage.tsx:216`, `apps/web/src/pages/assetClasses/StocksPage.tsx:229`, `apps/web/src/pages/assetClasses/StocksPage.tsx:498`, `apps/web/src/lib/holdingsSummary.ts:23`, `apps/web/src/components/common/PriceAsOf.tsx:10`, `packages/api/src/services/holdings/priceStaleness.ts:27`, `packages/api/src/services/holdings/transaction.service.ts:660`
