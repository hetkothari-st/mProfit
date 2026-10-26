# EveryPaisa Product Manual — B01 Asset classes fragment

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Stocks, Futures & Options, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Other Assets (batch B01). Mutual Funds (B02), PPF & EPF and Forex (B11) are dependencies only.

<!-- BEGIN MODULES -->
## How asset-class pages work

Every page in the **Asset Classes** sidebar section covered here (Stocks, F & O, Bonds, FDs & RDs, Gold & Silver, Crypto, NPS, Post Office, Others) is a view over the same thing: the transactions you record. You never type a holding directly. Each entry you add is saved as a transaction, and the app rebuilds the holding (units held, cost, value) from all of that asset's transactions every time one is added, changed or deleted. This chapter explains the rules every page shares; each page's own chapter repeats the parts that matter for it.

**How a holding is rebuilt from entries.** Entries are grouped into one holding per portfolio and per asset identity. The identity is, in order: the linked stock or fund, else the identifier you typed in the ISIN / account / certificate / PRAN / CoinGecko field, else the name (case and surrounding spaces ignored). So two entries with the same name but one with an account number and one without become two separate holdings. Entries are replayed oldest first (same day: in the order they were entered). These entry types add units: Buy, Deposit, Opening balance, SIP, switch-in, bonus (at zero cost), rights, merger/demerger in, dividend reinvest. These remove units, oldest units first: Sell, Redemption, Maturity, Withdrawal, switch-out, merger/demerger out. Interest received, coupon, staking reward, dividend and similar income entries are recorded and listed but **do not change the holding's units, cost or value**. When units fall to zero the holding disappears from the page (its transactions stay).

**Amount-only entries count as 1 unit.** FDs/RDs, NPS, PPF and Post Office entries are saved as quantity 1 at a price equal to the amount. A Withdrawal or Maturity entry therefore removes one whole earlier entry (the oldest), whatever amount you typed.

**How current value is worked out**, by class:

| Class | Current value |
|---|---|
| Stocks, ETFs | Units × latest stored stock price (price date shown as "as of …"; flagged stale after 5 days). |
| Physical gold, Sovereign Gold Bond, Gold ETF | Server: units × latest stored 24K gold price per gram. The Gold & Silver page replaces this with its own live calculation (see that chapter). |
| Physical silver | Server: grams × latest stored silver price per gram. |
| Crypto | Units × latest stored CoinGecko INR price for the linked coin (stale after 2 days). |
| FDs and RDs | Each deposit entry grown at its own rate and payout/compounding frequency up to today (capped at its maturity date). |
| NSC, KVP, SSY | Each deposit grown at its rate, compounded yearly. Post Office Time Deposit and RD: compounded quarterly. |
| SCSS, Post Office MIS, Post Office Savings | Equal to the amount invested (interest is treated as paid out). |
| Bonds, NPS, PMS, AIF, ULIP, REIT, InvIT, Art, Cash, Other | No current value — there is no price source. |

**Transactions lists show the newest 200.** Every asset page asks for up to 200 (FD and Post Office detail pages ask for 500, but the server caps every list at 200) transactions per asset class, newest first. Older entries are not listed, and RD installment counts and matching on detail pages only see those 200.

**Duplicate guard.** Saving an entry that matches one already recorded (same portfolio, asset, type, date, quantity and price) is refused with: "A <TYPE> of <qty> <name> at <price> on <date> is already recorded. Record it again only if this is a second, genuine trade." The asset-class dialogs have no "record anyway" option; change a field (for example add an account number) to save a genuinely separate entry.

**Who can change entries.** You can add, edit and delete entries only in portfolios you own; the server refuses others with "Forbidden".

### What this area doesn't do
- You cannot type a holding's quantity or value directly; only transactions.
- There is no manual "current value" field for Bonds, NPS, PMS, AIF, ULIP, REIT, InvIT, art, cash or other assets, so those holdings show no current value.
- Interest, coupon, dividend and staking entries do not increase the holding's value.
- Lists do not page beyond the newest 200 transactions per asset class.
- There is no bulk edit or bulk delete of entries on these pages.

## Stocks

The **Stocks** page shows your equity and ETF holdings combined across every portfolio, with live-ish prices, and lets you drill into each stock's transactions.

### Stocks holdings overview <!-- F-STOCK-001 -->
**What it does:** Shows four summary cards (**Current value**, **Invested**, **Unrealised P&L**, **Return**) and an **Equity Holdings** table with one row per stock or ETF, aggregated across all your portfolios: Symbol (with an "ETF" tag for ETFs), Name, Qty, Avg cost, LTP with its price date, Value, P&L, %, and the portfolios that hold it. Clicking a row expands it to show a **Per-portfolio breakdown** (only when more than one portfolio holds it) and the stock's **Transactions** list.

**Why it exists:** One place to see what you own in listed equities regardless of which portfolio it sits in. Inferred from behavior and the page description "Equity holdings aggregated across all portfolios".

**Where to find it:** **Asset Classes → Stocks** (route `/stocks`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate); R-ADMIN as their plan; R-MANAGER sees the managed person's stocks. In family view (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER) the page lists whatever portfolios and transactions the family view returns.

**Steps**
1. Open **Asset Classes → Stocks**. The summary cards and the Equity Holdings table load.
2. Click a stock's row. It expands to show the per-portfolio breakdown (if held in 2+ portfolios) and its transactions, newest first.
3. Click the row again to collapse it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Stock row | Click | Expands/collapses the per-portfolio breakdown and transactions | — |
| **Download** | Button | Opens the report download dialog for holdings filtered to asset class Equity (D-ASSET-001) | — |
| **Refresh prices** | Button | See F-STOCK-003 | While refreshing |
| **Add transaction** | Button | See F-STOCK-002 | — |

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

**Related features:** F-STOCK-002, F-STOCK-003, D-ASSET-001, D-ASSET-002, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/StocksPage.tsx:83`, `apps/web/src/pages/assetClasses/StocksPage.tsx:123`, `apps/web/src/pages/assetClasses/StocksPage.tsx:216`, `apps/web/src/pages/assetClasses/StocksPage.tsx:229`, `apps/web/src/pages/assetClasses/StocksPage.tsx:498`, `apps/web/src/lib/holdingsSummary.ts:23`, `apps/web/src/components/common/PriceAsOf.tsx:10`, `packages/api/src/services/holdings/priceStaleness.ts:27`, `packages/api/src/services/holdings/transaction.service.ts:660`

### Add, edit and delete stock transactions <!-- F-STOCK-002 -->
**What it does:** **Add transaction** opens the app's standard transaction form to record a stock or ETF trade. In an expanded stock row each transaction has a pencil (**Edit**) that opens the same form pre-filled, and a bin (**Delete**) that asks "Sure?" with **Yes** / **No**.

**Why it exists:** Holdings are built only from transactions, so this is how you change what the page shows. Inferred from behavior.

**Where to find it:** **Asset Classes → Stocks** → **Add transaction** (header or empty state); edit/delete inside an expanded row (route `/stocks`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER on the managed person's portfolios. Only the owner of the portfolio can save or delete (others get "Forbidden").

**Steps**
1. Click **Add transaction**. The "Add transaction" form opens (D-ASSET-002).
2. Fill it in and save. The holdings and transactions refresh.
3. To edit, expand a stock row and click the pencil. The "Edit transaction" form opens pre-filled; change and save.
4. To delete, click the bin, then **Yes**. The toast "Transaction deleted" appears and the holding is rebuilt; **No** cancels.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add transaction** | Button | Opens the add form | — |
| Edit (pencil, tooltip "Edit") | Icon button | Opens the edit form for that transaction | — |
| Delete (bin, tooltip "Delete") | Icon button | Shows "Sure?" **Yes** / **No** | — |
| **Yes** | Button | Deletes the transaction | Spinner while deleting |
| **No** | Button | Cancels the delete | — |

**Fields and rules:** The form's fields and rules are documented with the Transactions module (D-ASSET-002).

**Settings and toggles here:** None.

**Results:** A new, changed or deleted transaction makes the server rebuild the holding for that stock and recompute capital gains for it; the page, portfolio and dashboard data refresh.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete" (or the server's message) | Delete refused, e.g. "Forbidden" for a portfolio you don't own, "Transaction not found" | Check you own the portfolio; reload |

**Limitations:** Delete has no undo.

**How it works:** Delete calls `DELETE /api/transactions/:id`; the server checks the portfolio belongs to you, deletes the row, rebuilds the holding (FIFO replay) and recomputes stored capital gains for that asset. Saving a new Equity/ETF transaction also triggers a background refresh of held stock prices.

**Related features:** F-STOCK-001, D-ASSET-002.

**Sources:** `apps/web/src/pages/assetClasses/StocksPage.tsx:100`, `apps/web/src/pages/assetClasses/StocksPage.tsx:221`, `apps/web/src/pages/assetClasses/StocksPage.tsx:654`, `apps/web/src/pages/assetClasses/StocksPage.tsx:681`, `packages/api/src/services/holdings/transaction.service.ts:549`, `packages/api/src/services/holdings/transaction.service.ts:344`

### Refresh stock prices <!-- F-STOCK-003 -->
**What it does:** **Refresh prices** fetches current prices for held stocks and re-values holdings, then shows "Refreshed N stock prices".

**Why it exists:** Scheduled price jobs run at fixed times; this lets you update on demand. Inferred from behavior.

**Where to find it:** **Asset Classes → Stocks** → **Refresh prices** (route `/stocks`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (any signed-in user).

**Steps**
1. Click **Refresh prices**. The button shows a spinner.
2. When done, the toast "Refreshed N stock prices" appears and the table reloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh prices** | Button | Runs the price refresh | While a refresh is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Stored prices and holding values update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Refresh failed" (or the server's message) | Upstream price source or server error | Try again later |

**Limitations:** The refresh is not limited to your holdings: it fetches prices for stocks held by any user and re-values every holding in the system, so it can be slow (DOCUMENTATION_GAPS.md). N counts stock prices updated across all users.

**How it works:** `POST /api/assets/refresh-prices` runs a Yahoo price update for all held stocks (`onlyHeld`), then re-prices every holding row (market-priced classes) and recomputes every accrual holding (FD, RD, NSC, KVP, PO TD, SSY, PO RD). Response `{ stocks: { updated, failed }, holdings: { updated } }`.

**Related features:** F-STOCK-001, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/StocksPage.tsx:90`, `packages/api/src/routes/assets.routes.ts:42`, `packages/api/src/controllers/assets.controller.ts:88`, `packages/api/src/controllers/assets.controller.ts:89`, `packages/api/src/services/holdings/holdingsProjection.ts:694`

### What this area doesn't do
- No stock search, watchlist, price chart or corporate-action screen here.
- No per-portfolio filter on the page; it always aggregates every portfolio.
- No sorting or column filtering on the holdings table.
