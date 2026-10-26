---
id: F-TXN-001
title: "Transactions list"
module: "Transactions"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-TXN-001]
related: [F-DASH-013, F-TXN-002, F-TXN-003, F-TXN-006]
---

[← Transactions](../modules/transactions.md) · [Index](../INDEX.md)

# Transactions list

`F-TXN-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The Transactions page ("All buys, sells, dividends, SIPs, and corporate actions") lists every transaction, newest trade date first, 50 per page, with Date, Type, Asset, Qty, Price, Net and Broker. A picker narrows it to one portfolio; the total count shows beside it. Clicking a row opens it for editing.

**Why it exists:** Inferred from behavior: one ledger of everything that changed your holdings.

**Where to find it:** **Overview → Transactions** (route `/transactions`); phone tab **Transactions**; **View all** on the Dashboard's Recent transactions.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). In family view the list includes family-shared portfolios and other members' personal portfolios ([R-FAMCONTRIB](../roles.md#r-famcontrib)/[R-FAMVIEWER](../roles.md#r-famviewer) limited to their permitted asset classes); you can open their rows but only save changes to portfolios you created.

**Steps**
1. Pick **All portfolios** or one portfolio. The list returns to page 1.
2. Use **Previous** / **Next** to page ("Page X of Y").
3. Click a row (on phones, tap it) to edit it ([F-TXN-003](F-TXN-003.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Find duplicates** | Button | [F-TXN-006](F-TXN-006.md) | — |
| **Add transaction** | Button | [F-TXN-002](F-TXN-002.md) | — |
| Portfolio picker (**All portfolios**) | Select | Filters by portfolio | — |
| Row | Clickable row | Opens the edit dialog | — |
| **Previous** / **Next** | Buttons | Change page | Shown only with more than one page; disabled at the ends |

**Fields and rules:** None.

**Settings and toggles here:** [S-TXN-001](../settings/transactions.md#s-txn-001) **Transactions portfolio filter** — **All portfolios** (default) or one; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No transactions yet — Add your first buy or sell to populate holdings and P&L." | Nothing recorded (or nothing in the chosen portfolio) | **Add transaction** |

**Limitations:** No search, date-range, type or asset filters on this page (the server supports asset class, type and date filters, but the page does not offer them). The Type badge is green for BUY, SIP and SWITCH IN, red for SELL, SWITCH OUT and REDEMPTION, grey otherwise. The Asset sub-line shows symbol, scheme code, ISIN or the class. Phones show two lines per transaction.

**How it works:** `GET /api/transactions?portfolioId=&page=&pageSize=50` (page size capped at 200 on the server). In family view the server reads your rows plus each other member's personal rows, sorts by trade date then creation time (newest first) and pages the result.

**Related features:** [F-TXN-002](F-TXN-002.md), [F-TXN-003](F-TXN-003.md), [F-TXN-006](F-TXN-006.md), [F-DASH-013](F-DASH-013.md).

**Sources:** `apps/web/src/pages/transactions/TransactionsPage.tsx:52`, `apps/web/src/pages/transactions/TransactionsPage.tsx:84`, `apps/web/src/pages/transactions/TransactionsPage.tsx:101`, `apps/web/src/pages/transactions/TransactionsPage.tsx:159`, `apps/web/src/pages/transactions/TransactionsPage.tsx:189`, `apps/web/src/pages/transactions/TransactionsPage.tsx:226`, `packages/api/src/controllers/transaction.controller.ts:74`, `packages/api/src/services/holdings/transaction.service.ts:605`, `packages/api/src/services/holdings/transaction.service.ts:653`
