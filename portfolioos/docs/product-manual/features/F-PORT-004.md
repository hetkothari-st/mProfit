---
id: F-PORT-004
title: "Portfolio detail"
module: "Portfolios"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-PORT-004]
related: [F-DASH-008, F-PORT-005, F-TXN-002]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Portfolio detail

`F-PORT-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows one portfolio: name and description, four cards (**Current value**, **Invested**, **Unrealised P&L**, **Today's change**) and a **Holdings** table with Asset, Class, Qty, Avg cost, Invested, CMP, Value, P&L and **XIRR**.

**Why it exists:** Inferred from behavior: the full picture of one portfolio's positions and returns.

**Where to find it:** **Portfolios → Inspect** (route `/portfolios/:id`).

**Who can use it:** Anyone who can read the portfolio: its creator; in a family, any active member (peers' personal portfolios included). Adding a transaction needs you to be the portfolio's creator (see [F-TXN-002](F-TXN-002.md)).

**Steps**
1. Read the cards and table.
2. Click **XIRR** in the header to sort: highest first, then lowest first, then unsorted.
3. Click **Add transaction** (or **Add transaction** in the empty state) to record one in this portfolio.
4. Click **Back to portfolios** to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back to portfolios** | Link | Opens `/portfolios` | — |
| **Refresh prices** | Button | [F-PORT-005](F-PORT-005.md) | — |
| **Add transaction** | Button | Opens the transaction dialog with this portfolio chosen | — |
| **XIRR** | Sort button | Cycles descending → ascending → off | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-PORT-004](../settings/portfolios.md#s-port-004) **XIRR sort** — off (default), descending, ascending; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet — Import a contract note or add a manual transaction to see holdings here." | Empty portfolio | Add a transaction |
| "Portfolio not found" / forbidden | The portfolio was deleted or is not yours to see | Go back to Portfolios |

**Limitations:** Holdings are listed in the order they were last recalculated, not by value. A holding's XIRR is shown only when it has a current price and enough history; holdings without XIRR sort last. XIRR colours: red below 0, green at 7% a year or more, amber in between (7% is a fixed-deposit benchmark used only for colour). The cards do not refresh immediately after you add a transaction from this page — reload or revisit (see DOCUMENTATION_GAPS.md).

**How it works:** Summary as in [F-DASH-008](F-DASH-008.md). Holdings come from the recalculated holdings table with stock symbol or fund scheme code added; per-holding XIRR is solved from all the portfolio's transactions with today's value as the final cash flow.

**Related features:** [F-PORT-005](F-PORT-005.md), [F-TXN-002](F-TXN-002.md), [F-DASH-008](F-DASH-008.md).

**Sources:** `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:38`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:59`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:108`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:144`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:185`, `apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:268`, `packages/api/src/services/holdings/portfolio.service.ts:251`, `packages/api/src/services/holdings/portfolio.service.ts:547`, `packages/api/src/services/holdings/portfolio.service.ts:631`
