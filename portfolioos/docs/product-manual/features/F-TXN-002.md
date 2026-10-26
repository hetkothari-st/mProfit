---
id: F-TXN-002
title: "Add a transaction"
module: "Transactions"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-PORT-004, F-TXN-003, F-TXN-005]
---

[← Transactions](../modules/transactions.md) · [Index](../INDEX.md)

# Add a transaction

`F-TXN-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The "Add transaction" dialog ("Record a buy, sell, SIP, dividend, or corporate action. Holdings recalculate automatically.") records one transaction and recalculates the holding. A live preview shows **Gross**, **Charges** and **Net (outflow)** or **Net (inflow)**.

**Why it exists:** Inferred from behavior: manual entry for anything not imported.

**Where to find it:** **Transactions → Add transaction**; **Portfolios → <portfolio> → Add transaction** (that portfolio pre-selected).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) — only into portfolios you created ([R-MANAGER](../roles.md#r-manager): portfolios of the person you manage).

**Steps**
1. Choose **Portfolio** and **Type**.
2. Choose **Asset class**, then search the **Asset** box (at least 2 characters) and pick a result. Picking a stock sets the class to EQUITY; picking a fund sets MUTUAL FUND and fills its scheme code, AMC and ISIN. "Selected: <name>" confirms it.
3. For other classes, type **Asset name** and optionally **ISIN (optional)**.
4. For FOREIGN EQUITY or FOREX PAIR, set **Currency** and **Rate to INR at trade**.
5. Enter **Trade date**, **Quantity** and **Price**; optionally open **Charges (optional)** and **Narration (optional)**.
6. Click **Add transaction**. "Transaction added" appears and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Portfolio** ("Select portfolio…") | Select | Target portfolio | — |
| **Type** | Select | BUY, SELL, SIP, SWITCH IN, SWITCH OUT, DIVIDEND PAYOUT, DIVIDEND REINVEST, BONUS, SPLIT, REDEMPTION | — |
| **Asset class** | Select | EQUITY, MUTUAL FUND, ETF, BOND, GOVT BOND, CORPORATE BOND, FIXED DEPOSIT, RECURRING DEPOSIT, NPS, PPF, EPF, PHYSICAL GOLD, GOLD BOND, GOLD ETF, PHYSICAL SILVER, CRYPTOCURRENCY, REIT, INVIT, PMS, AIF, ULIP, FOREIGN EQUITY, FOREX PAIR, REAL ESTATE, ART COLLECTIBLES, CASH, OTHER | — |
| **Asset** search ("Search scheme name / code / ISIN…" or "Search symbol, name, or ISIN…") | Search box | Finds stocks and funds; results marked Stock/MF (and "· Yahoo" when from Yahoo) | Results appear after 2 characters; "No matches" when none |
| **Asset name** | Text | Name for non-stock, non-fund assets | Hidden for EQUITY, ETF, MUTUAL FUND, FOREIGN EQUITY |
| **ISIN (optional)** / **Pair code (e.g. USDINR / EURUSD)** | Text | Identifier (uppercase, max 12 characters) | Same as **Asset name** |
| **Currency** ("INR (default)", USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY) | Select | Trade currency | FOREIGN EQUITY / FOREX PAIR only |
| **Rate to INR at trade** | Number | FX rate frozen for tax ("Frozen for tax basis per Rule 115. INR equivalent = gross × rate.") | Same |
| **Trade date**, **Quantity**, **Price** | Date / numbers | Trade details | — |
| **Charges (optional)**: Brokerage, STT, Stamp duty, Exchange, GST, SEBI, Other, Broker | Collapsible fields | Costs and broker name | — |
| **Narration (optional)** | Text area | Note | — |
| **Cancel** / **Add transaction** | Buttons | Close / save | Save disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | One of your portfolios | Pre-selected portfolio, else your first | "Select a portfolio" |
| Trade date | Date | Yes | YYYY-MM-DD | Today (blank when opened from Reports) | None shown on the form (see Limitations); server "Date must be YYYY-MM-DD" |
| Quantity | Number | Yes | Greater than 0; up to 10^12 | 0 | "Must be > 0"; server "Quantity must be > 0" |
| Price | Number | Yes | 0 or more; up to 10^12 | 0 | None shown on the form; server "Price cannot be negative" |
| Charges (each) | Number | No | 0 or more | Empty | None shown on the form (the dialog does not save) |
| Asset name / symbol | Text | One of symbol, scheme or name | Symbol ≤40, stock name ≤200, scheme name ≤300, asset name ≤300, ISIN ≤20 | — | "Asset name or symbol is required" |
| Narration | Text | No | ≤500 characters | — | Server validation message |
| Broker | Text | No | ≤100 characters | — | Server validation message |

**Settings and toggles here:** None.

**Results:** The transaction is saved, the holding for that asset in that portfolio is recalculated, and for stocks, ETFs, mutual funds and foreign equity a price refresh starts in the background so the new holding gets a value quickly. Transactions, portfolios and holdings lists refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You may already have this one" banner | The same trade already exists ([F-TXN-005](F-TXN-005.md)) | **Let me check** or **Record it anyway** |
| "Save failed" / "Forbidden" | Server rejected it, or the portfolio is not yours | Use your own portfolio |
| Clicking **Add transaction** does nothing | Trade date (or price) is invalid or blank — the form shows no message for these | Fill in a valid date and price |

**Limitations:** Net = Gross + Charges for buy-type entries (BUY, SIP, SWITCH IN, DIVIDEND REINVEST and, on the server, also BONUS, RIGHTS ISSUE, OPENING BALANCE, MERGER IN, DEMERGER IN), otherwise Gross − Charges; the preview treats BONUS as an inflow while the server treats it as buy-type. Only portfolios you created accept new transactions, even family-shared ones. After adding from a portfolio's page, that page's top cards and the Dashboard keep their old numbers until revisited. A stock symbol not yet known is added to the stock list (NSE by default; NASDAQ for foreign equity).

**How it works:** `POST /api/transactions`. The server checks the portfolio is yours, quantity and price, a repeat by source key (silently returns the existing row) and a repeat by trade details (409, [F-TXN-005](F-TXN-005.md)); resolves the stock or fund; computes gross = quantity × price, charges, net; stores the row; recalculates the holding. For FOREIGN EQUITY/FOREX PAIR with a rate, the INR equivalent = gross × rate is stored.

**Related features:** [F-TXN-005](F-TXN-005.md), [F-TXN-003](F-TXN-003.md), [F-PORT-004](F-PORT-004.md).

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:62`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:124`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:138`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:208`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:252`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:286`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:319`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:364`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:466`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:481`, `apps/web/src/components/common/AssetSearch.tsx:21`, `apps/web/src/components/common/AssetSearch.tsx:37`, `packages/api/src/controllers/transaction.controller.ts:28`, `packages/api/src/services/holdings/transaction.service.ts:104`, `packages/api/src/services/holdings/transaction.service.ts:123`, `packages/api/src/services/holdings/transaction.service.ts:169`, `packages/api/src/services/holdings/transaction.service.ts:224`, `packages/api/src/services/holdings/transaction.service.ts:342`, `packages/api/src/services/holdings/transaction.service.ts:346`
