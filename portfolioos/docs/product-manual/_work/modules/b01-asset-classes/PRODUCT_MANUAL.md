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

## Futures & Options

The **Futures & Options** page (sidebar **F & O**) tracks derivative contracts separately from your stock holdings: open and closed positions, live mark-to-market, the trade tape, F&O business P&L by financial year, and closing positions on expiry day. Trades arrive from a connected broker or from imported contract notes.

### F&O summary and expiring-soon banner <!-- F-FNO-001 -->
**What it does:** Shows four cards — **Open positions** (count), **Realized P&L**, **Unrealized P&L**, **Expiring 7d** (count, amber when above zero) — and, when any open contract expires within 7 days, an amber banner "**Expiring soon:** <underlying> (<date>), …".

**Why it exists:** A quick read of derivative exposure and upcoming expiries. Inferred from behavior and the page description "Open positions, P&L, expiry lifecycle, broker sync."

**Where to find it:** **Asset Classes → F & O** (route `/fo`). The page works on the portfolio given in `?portfolioId=`; without it, on your first portfolio.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate); R-ADMIN as their plan. Only your own positions are shown (family view does not add other members' F&O).

**Steps**
1. Open **Asset Classes → F & O**. The cards load and refresh every 5 seconds while the tab is visible.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report dialog for holdings filtered to Futures and Options (D-ASSET-001) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Cards missing | No portfolio yet, or the summary request failed | Create a portfolio; reload |

**Limitations:** There is no portfolio picker on the page; to see another portfolio you need a link with `?portfolioId=`. Realized P&L sums every position (open and closed); Unrealized sums only OPEN positions.

**How it works:** `GET /api/fo/summary?portfolioId=` reads your DerivativePosition rows: open = status OPEN; realized = sum of realizedPnl over all; unrealized = sum of unrealizedPnl over open; "expiring soon" = open positions whose expiry is 0–7 days away (rounded up to whole days).

**Related features:** F-FNO-002, F-FNO-005, F-FNO-006.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:149`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:221`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:374`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:396`, `packages/api/src/controllers/fo.controller.ts:75`

### Open and closed positions <!-- F-FNO-002 -->
**What it does:** The **Open (n)** and **Closed (n)** tabs split positions into a **Futures Ledger** (Contract, Side, Expiry with a days-left badge, Net Qty, Lot, Avg Entry, LTP or "awaiting LTP", Notional, Realized, Unrealized, Status) and an **Options Chain** (Underlying, Type CE/PE, Strike, Payoff glyph, Expiry, Net Qty, Lot, Premium, LTP, Outlay, Realized, Unrealized, Status), each with Notional/Premium Outlay, Realized, Unrealized and Net P&L totals. Clicking a contract row lists its trades. Below them a **Trade Tape** shows your latest 50 F&O trades.

**Why it exists:** Futures and options need contract-level views (strike, expiry, lots), not the average-cost view used for stocks. Inferred from code comments.

**Where to find it:** **Asset Classes → F & O** → **Open** / **Closed** tabs (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; own positions only.

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
| "No open F&O positions" / "Sync your broker or import contract notes to populate positions." | No open position | Sync a broker (F-FNO-008) or import contract notes (D-ASSET-012) |
| "No closed positions" | Nothing closed yet | — |
| "awaiting LTP" | No live or end-of-day price matched the contract | Wait for **Sync prices** or the 16:45 bhavcopy job |
| "No transactions on file for this contract." | No trade matched by underlying, expiry, strike and type | Check the contract was imported |

**Limitations:** Open = status OPEN or "EXPIRY ?" (pending expiry approval); Closed = CLOSED, EXPIRED_WORTHLESS or EXERCISED; statuses are shown as these raw words. The trade tape under both tabs shows all trades, not only those of the listed positions.

**How it works:** Positions come from `GET /api/fo/positions?portfolioId=` (refetched every 5 s while visible), trades from `GET /api/fo/trades?portfolioId=`. A contract's trades are matched by the leading letters of the trade's instrument name (underlying), expiry, and for options strike and Call/Put. Positions are rebuilt from F&O transactions by the server (not the stock holding engine); unrealized P&L = Σ over open lots (mark − entry) × signed quantity.

**Related features:** F-FNO-003, F-FNO-006, F-FNO-007.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:214`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:297`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:653`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:688`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:698`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1023`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1218`, `packages/api/src/services/fo/derivativePosition.service.ts:233`

### F&O trades tab <!-- F-FNO-003 -->
**What it does:** The **Trades** tab shows the full **Trade Tape**: every F&O trade in the portfolio, newest first, with Date, Side (BUY/SELL), Instrument, Strike, Expiry, Qty, Price, Net and Broker.

**Why it exists:** An audit trail of every derivative trade. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** → **Trades** (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

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

**Related features:** F-FNO-002, D-ASSET-012.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:442`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1430`, `packages/api/src/controllers/fo.controller.ts:45`, `packages/api/src/controllers/fo.controller.ts:57`

### F&O Tax / P&L statement <!-- F-FNO-004 -->
**What it does:** The **Tax / P&L** tab shows one card per financial year ("FY <year>": total P&L, "Turnover: … · Trades: N", note "Non-speculative §43(5) · ITR-3") and a table of closed contracts: Underlying, Type, Strike, Expiry, Side (INTRADAY or POSITIONAL), FY, Realized P&L, Turnover, Trades.

**Why it exists:** F&O profit is taxed as business income under section 43(5), not capital gains, and needs ICAI turnover for tax-audit checks. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** → **Tax / P&L** (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. (The separate Schedule 43 report needs Pro/Advisor — D-ASSET-010.)

**Steps**
1. Click **Tax / P&L**. The statement loads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Tax / P&L** | Tab | Loads the statement | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No realized P&L yet" / "P&L is computed once you close positions or hold past expiry." | No closed trades | — |

**Limitations:** Not a filing document; use the reports area for Schedule 43.

**How it works:** `GET /api/fo/pnl?portfolioId=` replays each contract's trades first-in-first-out into close events. Turnover follows the current ICAI note: futures = Σ |realized per trade|; options = Σ |realized P&L| only. Intraday equity would be speculative; F&O is non-speculative.

**Related features:** D-ASSET-010.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:465`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1508`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1545`, `packages/api/src/services/fo/foPnl.service.ts:1`, `packages/api/src/controllers/fo.controller.ts:62`

### Expiry-day close approvals <!-- F-FNO-005 -->
**What it does:** On expiry day a server job turns each open contract expiring that day into an "Expiry close" request (status shown as "EXPIRY ?") and raises an alert "<underlying> <type> expires today". The **Expiry** tab lists pending requests ("Expiry close <date>", "<n> contracts · settlement <price | pending>") with **Reject** and **Approve**. Approving books a closing trade at the settlement price; an option settling at 0 is marked EXPIRED_WORTHLESS.

**Why it exists:** Positions held to expiry never get a closing trade from the broker; this books one so P&L is complete. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** → **Expiry** (route `/fo`); alert in the bell (D-ASSET-006).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, for their own portfolios.

**Steps**
1. On expiry day after 17:30 IST, open **F & O → Expiry**.
2. Check the settlement price, then click **Approve** ("Approved") or **Reject** ("Rejected").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Expiry** | Tab | Lists pending requests | — |
| **Approve** | Button | Books the closing trade at settlement | — |
| **Reject** | Button | Marks the request rejected | — |

**Fields and rules:** None.

**Settings and toggles here:** S-FNO-001 **Auto-approve expiry close** — on: the job approves automatically when a settlement price exists; off (default): requests wait for you. It has no control in the app. S-FNO-002 **Default equity tax treatment** is stored by the same endpoint but not read anywhere.

**Results:** Approve: a SELL (long) or BUY (short) transaction at settlement, the position rebuilt and closed. Reject: request marked REJECTED; the position keeps status "EXPIRY ?".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No settlement price for this contract yet — add it before closing the position at expiry." | Bhavcopy price for the contract not stored | Wait for the 16:45 bhavcopy; there is no field to type it |
| "No pending expiry approvals" / "Expiry close requests appear here on expiry day after settlement is published." | Nothing pending | — |
| "Approve failed" / "Reject failed" | Server error or not your portfolio | Reload |

**Limitations:** A rejected request leaves the position as "EXPIRY ?" under **Open** indefinitely; the job only scans OPEN positions expiring that day, so it is never re-offered (DOCUMENTATION_GAPS.md). The list shows up to 100 requests across all your portfolios.

**How it works:** `jobs/foExpiryClose.job.ts` runs Mon–Fri 17:30 IST as a system task (unless `ENABLE_FO_EXPIRY_CRON=false`), finds OPEN positions with expiry today, reads the stored contract settlement price, creates an ExpiryCloseJob (PENDING_REVIEW), sets the position to PENDING_EXPIRY_APPROVAL, creates an `FO_EXPIRY_TODAY` alert, and auto-approves only when the portfolio setting is on and a price exists. `POST /api/fo/expiry-jobs/:id/approve|reject` check the portfolio is yours.

**Related features:** F-FNO-001, D-ASSET-006, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:494`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:521`, `packages/api/src/jobs/foExpiryClose.job.ts:30`, `packages/api/src/services/fo/foExpiry.service.ts:25`, `packages/api/src/services/fo/foExpiry.service.ts:65`, `packages/api/src/services/fo/foExpiry.service.ts:101`, `packages/api/src/controllers/fo.controller.ts:241`, `packages/api/src/controllers/fo.controller.ts:268`, `packages/api/prisma/schema.prisma:2863`

### Live F&O prices <!-- F-FNO-006 -->
**What it does:** While the page is open and visible, it asks the server every 5 seconds to re-mark open positions from NSE live derivative quotes. A chip shows "waiting for first poll", "fetching", or "Live · <matched>/<total> · <n>s ago" (green all matched, amber some, red none). **Sync prices** triggers a refresh immediately. If nothing matches, a one-time message explains: "Live feed: 0/<total> matched. NSE returned no live data — check API logs (host may be IP-blocked, or markets are closed)." or "…AssetKey shape mismatch — open API logs to see missed keys."

**Why it exists:** Unrealized P&L needs a current mark during market hours. Stated in code comments.

**Where to find it:** **Asset Classes → F & O** header (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

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

**Limitations:** Polling pauses when the browser tab is hidden. Outside these page polls, a server job also marks positions every minute 09:00–15:59 IST Mon–Fri and from the bhavcopy at 16:45 (D-ASSET-007).

**How it works:** `POST /api/fo/refresh-live?portfolioId=` loads your OPEN positions, fetches NSE quotes once per underlying (server caches each underlying 5 s), and updates mtmPrice/unrealized; returns `{ updated, total, missedKeys, sampleHits }`.

**Related features:** F-FNO-002, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:164`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:193`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:206`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1626`, `packages/api/src/controllers/fo.controller.ts:185`, `packages/api/src/services/fo/derivativePosition.service.ts:352`, `packages/api/src/jobs/priceJobs.ts:372`

### Recompute positions <!-- F-FNO-007 -->
**What it does:** The circular-arrow button (tooltip "Recompute derivative positions"; text "Recompute" on small screens) rebuilds every F&O position in the portfolio from its transactions and shows "Positions recomputed".

**Why it exists:** Repairs positions after imports or edits. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** header (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, for portfolios they own.

**Steps**
1. Click the recompute button. It spins; then "Positions recomputed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Recompute (icon) | Button | Rebuild positions | No portfolio, or running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** All derivative positions for the portfolio are rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Recompute failed" / "Forbidden" | Not your portfolio or server error | Check the portfolio |

**Limitations:** None known.

**How it works:** `POST /api/fo/recompute` with `{ portfolioId }`; the server checks ownership and replays every F&O asset.

**Related features:** F-FNO-002.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:244`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:358`, `packages/api/src/controllers/fo.controller.ts:195`

### Connect, log in to and disconnect a broker <!-- F-FNO-008 -->
**What it does:** The header shows a chip for each supported broker — **Kite (Zerodha)**, **Upstox**, **Angel One** — with **connect** (not set up), **login** (set up, no live session) or a tick and **×** (connected; tooltip "Forget credentials"). **connect** opens the **Connect broker** dialog where you paste API credentials once; **login** opens the broker's login in a popup (Angel logs in without a popup).

**Why it exists:** Lets the app pull F&O trades from your broker account. Dialog text: "Paste API credentials once. After this, sync runs without re-entering anything (Kite needs a daily 2-click login)."

**Where to find it:** **Asset Classes → F & O** header (route `/fo`). Broker sessions can also be refreshed from **Tools → Connectors** (D-ASSET-009).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; credentials belong to your own account.

**Steps**
1. Click **connect** on a broker chip. The **Connect broker** dialog opens.
2. Choose **Broker**, read the help line, and fill the fields for that broker.
3. Click **Save & continue**. Kite and Upstox then open a login popup; Angel logs in directly. "<Broker> configured" appears, then "<Broker> login complete".
4. Later, click **login** on the chip when the session has expired.
5. To remove, click **×**, confirm "Disconnect <Broker>?". "Disconnected" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **connect** | Link | Opens the dialog | Shown only when not set up |
| **login** | Link | Starts broker login | Shown when set up but no live session |
| **×** | Link | Deletes stored credentials after a browser confirm | Shown when connected |
| **Connect broker** | Button | Opens the dialog for Kite | Shown only if the status list is empty |
| **Broker** | Select | Kite (Zerodha) / Upstox / Angel One; switching clears the form | — |
| **Save & continue** | Button | Saves credentials, then logs in | Until required fields are filled, or while saving |
| **Cancel** | Button | Closes the dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| API key | Text | Yes | — | empty | Button stays disabled |
| API secret (Kite) / Client secret (Upstox) | Password | Kite, Upstox | — | empty | Button stays disabled |
| Redirect URI | Text | Upstox | "Register this exact URL on the Upstox dashboard before saving." | Filled with the server's callback URL | "Upstox redirectUri required" |
| Client code | Text | Angel | — | empty | Button stays disabled |
| Password / PIN | Password | Angel | — | empty | Button stays disabled |
| TOTP secret (base32) | Password | Angel | at least 8 characters after removing spaces | empty | Button stays disabled |

**Settings and toggles here:** None.

**Results:** Credentials are stored encrypted per user and broker; a successful login stores an access token. Disconnect deletes the stored credential.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Popup blocked — allow popups and retry." | Browser blocked the login window | Allow popups for the site |
| "Could not start login" / "Login failed" | Broker or setup problem | Check the keys and redirect URL |
| "Save failed" | Server rejected the credentials | Re-enter |
| "Disconnect failed" | Server error | Retry |

**Limitations:** Kite needs a fresh login every day. The popup result is accepted from any window without an origin check (DOCUMENTATION_GAPS.md).

**How it works:** `POST /api/fo/brokers/setup` encrypts API key, secret (Angel: the password) and TOTP seed and upserts BrokerCredential; Angel logs in immediately (`needsLogin: false`). `POST /api/fo/brokers/:id/oauth/start` returns a login URL; the broker redirects to `/api/fo/brokers/:id/callback` (public, authenticated by a random state token), whose page posts `broker_oauth_result` to the opener and closes. Status (`GET /api/fo/brokers/status`, refetched every 60 s) reports configured, connected (token present and not expired), and expiry. `DELETE /api/fo/brokers/:id` deletes the credential.

**Related features:** F-FNO-009, D-ASSET-009.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:46`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:329`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1696`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1761`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:1888`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:44`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:324`, `packages/api/src/controllers/brokerOauth.controller.ts:120`, `packages/api/src/routes/fo.routes.ts:36`

### Sync broker trades <!-- F-FNO-009 -->
**What it does:** **Sync Kite** pulls today's F&O trades from your Zerodha account into the current portfolio and shows "Synced — N new trades". If Kite is not set up, it says "Connect Kite (Zerodha) first." and opens the dialog, resuming the sync after saving; if the session expired, it says "Login to Kite (Zerodha)." and opens the login popup, then syncs.

**Why it exists:** Saves typing trades by hand. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** → **Sync Kite** (route `/fo`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with a Zerodha API app.

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

**Related features:** F-FNO-008, F-FNO-002.

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:253`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:343`, `packages/api/src/controllers/fo.controller.ts:204`, `packages/api/src/services/fo/foBrokerSync.service.ts:31`, `packages/api/src/services/fo/foBrokerSync.service.ts:97`, `packages/api/src/ingestion/fno/broker-connector/types.ts:16`

### What this area doesn't do
- No manual F&O trade entry form on this page (use imports or the Transactions page).
- No portfolio selector; no option-chain or margin screen (the endpoints exist but nothing calls them).
- No automatic broker sync; no Upstox/Angel sync button.
- No way to type a settlement price for expiry close.

## Bonds

The **Bonds** page tracks government, corporate and other bonds you record by hand. It is an optional sidebar class: it appears under **Asset Classes** only after you add it with **Add asset class** (D-ASSET-008); the address `/bonds` works either way.

### Bonds holdings and entries <!-- F-BOND-001 -->
**What it does:** Shows summary cards **Invested**, **Current value**, **Unrealised P&L** (with %), a holdings table (Name with ISIN, Type — Govt Bond / Corp Bond / Bond, Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table (Date, Name, Type, Qty, Price, Amount) with edit and delete on each row.

**Why it exists:** Track bond holdings and coupons alongside other assets. Page description: "Track bonds, government securities, and corporate bonds".

**Where to find it:** **Asset Classes → Bonds** (route `/bonds`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate); R-MANAGER on the managed person's data; changes only in portfolios you own.

**Steps**
1. Open **Asset Classes → Bonds**. Summary, holdings and transactions load (skeleton rows while loading).
2. To delete a transaction, click its bin, then **Yes** ("Transaction deleted"); **No** cancels.
3. To edit, click the pencil; the bond form opens (F-BOND-002).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report dialog filtered to Bond, Govt Bond, Corp Bond (D-ASSET-001) | — |
| **Add** | Button | Opens "Add Bond" (F-BOND-002) | — |
| **Add first entry** | Button | Same, from the empty state | Only when empty |
| Edit (pencil, "Edit") | Icon | Opens the entry in the bond form | — |
| Delete (bin, "Delete") → **Yes** / **No** | Icon + buttons | Deletes the transaction after "Sure?" | — |

**Fields and rules:** Not applicable — view only (see F-BOND-002).

**Settings and toggles here:** None.

**Results:** Delete removes the transaction and rebuilds the holding.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No bonds yet" / "Add a transaction to start tracking this asset class." | No bond holdings or transactions | **Add first entry** |
| Current value ₹0 and P&L equal to minus the invested amount | Bonds have no price source, so no holding has a current value; the summary adds only holdings that have one | Read **Invested**; ignore Current value and P&L (DOCUMENTATION_GAPS.md) |
| "Failed to delete" | Not your portfolio, or server error | — |

**Limitations:** No market or accrued valuation for bonds; the holdings table shows "—" under Current and P&L. Coupon entries do not change the holding.

**How it works:** Same as every asset-class page: holdings from `GET /api/portfolios/:id/holdings` filtered to BOND, GOVT_BOND, CORPORATE_BOND; transactions from `GET /api/transactions?assetClass=…&pageSize=200` per class, merged newest first. Summary: Invested = Σ cost; Current value = Σ of holdings that have a current value; P&L = Current − Invested; % = P&L ÷ Invested × 100 to 1 decimal.

**Related features:** F-BOND-002, D-ASSET-001, D-ASSET-008.

**Sources:** `apps/web/src/pages/assetClasses/BondsPage.tsx:7`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:137`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:188`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:297`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:411`, `packages/api/src/priceFeeds/router.service.ts:94`

### Add, edit and delete a bond entry <!-- F-BOND-002 -->
**What it does:** The "Add Bond" / "Edit Bond Entry" dialog records a bond buy, sell, coupon, maturity or redemption.

**Why it exists:** Bonds are tracked only through entries. Inferred from behavior.

**Where to find it:** **Asset Classes → Bonds** → **Add**, or the pencil on a transaction (route `/bonds`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Click **Add**. "Add Bond" opens with Bond Type "Government Bond", Transaction "Buy", today's date, Coupon Frequency "Semi-annual".
2. Pick the **Portfolio**, **Bond Type** and **Transaction**; type the **Bond Name / Issuer**, optional **ISIN**, **Date**, **Units** and **Price / Unit (₹)** (label becomes **Coupon Received (₹)** for coupons).
3. For a Buy, optionally fill **Bond Details**: **Coupon Rate (% p.a.)**, **Coupon Frequency**, **Maturity Date**.
4. Click **Add bond** ("Bond added") or **Save changes** ("Bond entry updated").
5. In edit mode, **Delete** → "Sure?" → **Yes, delete** ("Bond entry deleted"); **Cancel** backs out.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add bond** / **Save changes** | Button | Saves | While saving |
| **Cancel** | Button | Closes | — |
| **Delete** → **Yes, delete** / **Cancel** | Buttons | Deletes this entry | Edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | your portfolios | first portfolio | "Select a portfolio" |
| Bond Type | Select | Yes | Government Bond, Corporate Bond, Other Bond | Government Bond | — |
| Transaction | Select | Yes | Buy, Sell, Coupon received, Maturity, Redemption | Buy | — |
| Bond Name / Issuer | Text | Yes | placeholder "e.g. 7.26% GOI 2033" | — | "Enter bond name / issuer" |
| ISIN | Text | No | max 20 characters (server) | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Units | Number | Yes | > 0 | — | "Must be > 0" |
| Price / Unit (₹) / Coupon Received (₹) | Number | Yes | ≥ 0 | — | — |
| Coupon Rate (% p.a.) | Number | No | 0–100 | — | — |
| Coupon Frequency | Select | No | Monthly, Quarterly, Semi-annual, Annual | Semi-annual | — |
| Maturity Date | Date | No | — | — | — |
| Notes | Text area | No | max 500 characters (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** A transaction is saved; the bond holding is rebuilt (Buy adds units; Sell, Maturity, Redemption remove units; Coupon received does not change the holding).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" or the duplicate message ("…is already recorded…") | Server refused | Change a field or check the existing entry |
| "Forbidden" | Portfolio not yours | Choose your own portfolio |

**Limitations:** Coupon rate, frequency and maturity are stored but not used to value the bond.

**How it works:** `POST /api/transactions` (or `PATCH /api/transactions/:id`) with assetClass, type, name, ISIN, date, quantity = Units, price, maturityDate, interestRate, interestFrequency, narration. The server computes gross = qty × price and rebuilds the holding.

**Related features:** F-BOND-001.

**Sources:** `apps/web/src/pages/assetClasses/BondFormDialog.tsx:27`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:44`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:116`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:136`, `apps/web/src/pages/assetClasses/BondFormDialog.tsx:233`, `packages/api/src/controllers/transaction.controller.ts:39`, `packages/api/src/controllers/transaction.controller.ts:61`

### What this area doesn't do
- No bond price feed, yield-to-maturity or accrued-interest valuation.
- No coupon schedule or coupon reminders.

## FDs & RDs

The **Fixed & Recurring Deposits** page (sidebar **FDs & RDs**) shows each bank deposit as a receipt-style card with what it becomes at maturity, reminders for maturities and RD installments, and a detail page per deposit with growth charts.

### Deposits overview cards <!-- F-FD-001 -->
**What it does:** Shows **Total Invested** (with "N deposit(s)"), **Current Value** ("live valuation") and **Total Earnings** ("realised + unrealised", with %), then a **Fixed Deposits** section and a **Recurring Deposits** section of cards. An FD card shows the bank's logo and colour, "Fixed deposit no. <8 characters>", rate, portfolio, payout text (for example "Interest paid quarterly"), a "Matured" stamp when past maturity, **At maturity** value, a progress bar ("Opened <date>", "Matures <date>, in N days" / "Matured <date>"), and Principal, Tenure, Next payout, Completed %, Worth today, Interest so far. An RD card shows "Recurring deposit no. …", "Interest compounded quarterly", **At maturity**, **Installments paid** "<n> of <tenure>" with one square per month (up to 24, then "+N"), and EMI, Tenure, Next EMI (red with "Overdue — record the installment once paid" when late, "All paid" when complete), Principal, Completed, Interest so far.

**Why it exists:** See every deposit's maturity and progress at a glance. Page description: "Track FDs and RDs across banks — one-time deposits or monthly installments."

**Where to find it:** **Asset Classes → FDs & RDs** (route `/fds`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER on the managed person's deposits.

**Steps**
1. Open **Asset Classes → FDs & RDs**.
2. Click a card to open its detail page (F-FD-004), or the card's edit icon ("Edit deposit") to edit its first deposit entry (F-FD-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Deposit card | Click | Opens `/fds/<id>` | — |
| Edit deposit (icon) | Button | Opens the first deposit entry in the form | No matching entry found |
| **Download** | Button | Report filtered to FD and RD (D-ASSET-001) | — |
| **Add** ▾ → **Fixed Deposit** / **Recurring Deposit** | Menu | Opens the form preset to FD or RD | — |
| **Add first deposit** | Button | Opens the form for an FD | Only when empty |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No deposits yet" / "Add a Fixed or Recurring Deposit to start tracking." | No FD/RD holding | **Add first deposit** |
| "Add a rate and maturity date to see what this deposit becomes." | First deposit entry has no rate or maturity | Edit the deposit |
| At maturity "—" | Missing rate, maturity date, or tenure under 1 month | Edit the deposit |

**Limitations:** The card's **At maturity** uses a different formula from the detail page and from the server's current value, so the three can disagree: FD cards compound by the payout frequency but use simple interest for "At maturity" payout; RD cards compound monthly although they say "Interest compounded quarterly" and ignore the RD's chosen compounding (DOCUMENTATION_GAPS.md). Card terms (rate, dates, payout) come from the deposit's first Deposit entry. Only the newest 200 FD and 200 RD transactions are read.

**How it works:** Holdings of class FIXED_DEPOSIT / RECURRING_DEPOSIT from every portfolio; transactions from `GET /api/transactions?assetClass=FIXED_DEPOSIT|RECURRING_DEPOSIT&pageSize=500` (server returns at most 200). Entries are matched to a card by portfolio + class, then by account number (case/space-insensitive), else by bank name, else — if the portfolio has exactly one entry of that class — that entry. Tenure = whole months between opening and maturity. FD at maturity = P × (1 + r/n)^(n × months/12), n = 12/4/2/1 for Monthly/Quarterly/Half-yearly/Annual; for "At maturity" P × (1 + r × years). RD at maturity = M × ((1+i)^months − 1)/i × (1+i), i = rate/12. Next payout = next opening-date anniversary step (1/3/6/12 months) on or after today, capped at maturity. RD next EMI = opening date + (installments paid) months. Totals: Invested = Σ cost; Current Value = Σ server current values; Earnings = difference.

**Related features:** F-FD-002, F-FD-003, F-FD-004, D-ASSET-001.

**Sources:** `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:77`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:100`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:157`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:313`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:401`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:457`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:504`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:561`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:583`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:714`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:754`

### "Coming up" deposit reminders panel <!-- F-FD-002 -->
**What it does:** Above the cards, a **Coming up** list shows every deposit maturing within 30 days ("Matures in N days" / "Matures today") and, for RDs, the next installment due within 7 days or overdue ("Installment due in N days", "Installment due today", "Installment overdue by N days"), with the date and the amount (installment, or the maturity value). The most pressing reminder also appears as a strip at the top of that deposit's card. Clicking a row opens the deposit.

**Why it exists:** So you don't miss a maturity or an RD payment. Stated in code comments; the alerts bell gets the same reminders (F-FD-007).

**Where to find it:** **Asset Classes → FDs & RDs**, top of page (route `/fds`).

**Who can use it:** Same as F-FD-001.

**Steps**
1. Read the list; click a row to open that deposit.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Reminder row | Button | Opens the deposit's detail page | Panel hidden when nothing is due |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No reminder for a deposit you expect | It has no maturity date, or matured already | Add the maturity date |
| An RD shows overdue after you paid | The installment isn't recorded, or is older than the newest 200 RD entries | Record it (**Mark paid** on the detail page) |

**Limitations:** Order: overdue first, then urgent (7 days or less), then the rest, soonest first. Dates are compared as UTC calendar days.

**How it works:** For each card: maturity reminder when 0–30 days away (urgent at 7 or less); RD installment reminder when the next due date (opening + installments paid months) is at most 7 days away or past, and installments paid is below tenure. Amount: installment = the first deposit's amount; maturity = the card's At maturity value.

**Related features:** F-FD-001, F-FD-007.

**Sources:** `apps/web/src/lib/depositReminders.ts:11`, `apps/web/src/lib/depositReminders.ts:59`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:207`, `apps/web/src/pages/assetClasses/FixedDepositsPage.tsx:635`

### Add, edit and delete an FD or RD entry <!-- F-FD-003 -->
**What it does:** The "Add Fixed Deposit" / "Add Recurring Deposit" dialog (edit: "Edit Fixed Deposit Entry" / "Edit Recurring Deposit Entry") records a deposit or RD installment, an interest credit, a premature withdrawal or a maturity payout.

**Why it exists:** Deposits are tracked only through entries; each RD installment is its own entry ("Each monthly installment is logged as its own entry. Add new installments as you pay them; the maturity projection updates automatically.").

**Where to find it:** **FDs & RDs** → **Add** ▾, a card's edit icon, the detail page's **Log payment** / **Edit** / **Edit details**, or a payment-log pencil (routes `/fds`, `/fds/:holdingId`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Click **Add** ▾ → **Fixed Deposit** (or **Recurring Deposit**).
2. When adding, pick **Deposit type**: **Fixed Deposit** ("One-time lump‑sum") or **Recurring Deposit** ("Monthly installments").
3. Choose **Portfolio** and **Entry type**: FD — **New / top-up deposit**, **Interest credited**, **Premature withdrawal**, **Maturity payout**; RD — **Monthly installment** and the same three others.
4. Type **Bank / Issuer** (suggestions from a list of Indian banks; any issuer can be typed) and optional **Account / FD No.** (RD: **RD Account No.**).
5. Enter the **Date** (RD installment: **Installment date**) and the amount (**Principal Amount (₹)**, **Monthly Installment (₹)**, **Interest Credited (₹)**, **Withdrawn Amount (₹)** or **Maturity Amount (₹)**).
6. For a deposit, fill **FD Details** / **RD Details**: **Interest Rate (% p.a.)**, **Interest Payout** (RD: **Compounding**), RD **Tenure (months)** (fills **Maturity Date (auto-filled)**), or FD **Maturity Date**.
7. Click **Add FD entry** / **Add RD entry** ("FD entry added" / "RD entry added") or **Save changes** ("FD entry updated" / "RD entry updated").
8. Edit mode: **Delete** → **Yes, delete** ("Entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Deposit type** cards | Radio | FD or RD | Hidden when editing |
| **Entry type** buttons | Radio | Transaction type | — |
| Bank logo | Display | Shows the matched bank's logo | — |
| **Add FD entry** / **Add RD entry** / **Save changes** | Button | Saves | While saving |
| **Cancel** | Button | Closes | — |
| **Delete** → **Yes, delete** / **Cancel** | Buttons | Deletes | Edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Bank / Issuer | Text with suggestions | Yes | placeholder "Search HDFC, SBI… or type any issuer" | — | "Enter bank / issuer name" |
| Account / FD No. / RD Account No. | Text | No | max 20 characters (server); also used to tell deposits apart | — | "Validation failed" |
| Date / Installment date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Amount (label varies) | Number | Yes | ≥ 0, step 0.01 | — | — |
| Interest Rate (% p.a.) | Number | No | 0–100 | — | — |
| Interest Payout / Compounding | Select | No | Monthly, Quarterly, Half-yearly, Annual, At maturity | Quarterly | — |
| Tenure (months) | Number | No (RD only) | 1–240, whole | — | — |
| Maturity Date | Date | No | RD: auto-filled = date + tenure when adding | — | — |
| Notes | Text area | No | max 500 characters (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** One transaction (quantity 1, price = amount) is saved and the deposit holding is rebuilt and re-valued.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "…is already recorded. Record it again only if this is a second, genuine trade." | Same bank, type, date and amount already recorded in that portfolio | Add an account number to separate two genuine deposits |
| "Failed to save" / "Forbidden" | Server refused / not your portfolio | — |

**Limitations:** **Tenure (months)** is not saved; only the maturity date it fills. Interest credited entries do not change the deposit's value. A **Premature withdrawal** or **Maturity payout** entry removes the oldest whole deposit entry regardless of the amount: on an FD it closes the deposit; on an RD it removes one installment, so the RD stays on the page (DOCUMENTATION_GAPS.md). Rate, payout and maturity are read from the deposit's first Deposit entry on the cards and detail page.

**How it works:** `POST /api/transactions` with assetClass FIXED_DEPOSIT/RECURRING_DEPOSIT, quantity 1, price = amount, isin = account number, interestRate, interestFrequency, maturityDate. The server's current value grows each deposit entry separately: principal × (1 + rate/n)^(years × n), n from its payout/compounding frequency (Monthly 12, Quarterly 4, Half-yearly 2, Annual 1, At maturity 1; none → Quarterly), years = days elapsed ÷ 365.25 up to today (IST date) or maturity, whichever is earlier. Without a rate, current value = cost.

**Related features:** F-FD-001, F-FD-004, F-FD-005.

**Sources:** `apps/web/src/pages/assetClasses/FDFormDialog.tsx:37`, `apps/web/src/pages/assetClasses/FDFormDialog.tsx:63`, `apps/web/src/pages/assetClasses/FDFormDialog.tsx:78`, `apps/web/src/pages/assetClasses/FDFormDialog.tsx:132`, `apps/web/src/pages/assetClasses/FDFormDialog.tsx:178`, `apps/web/src/pages/assetClasses/FDFormDialog.tsx:231`, `apps/web/src/pages/assetClasses/FDFormDialog.tsx:291`, `apps/web/src/pages/assetClasses/FDFormDialog.tsx:366`, `packages/api/src/services/holdings/holdingsProjection.ts:66`, `packages/api/src/services/holdings/holdingsProjection.ts:198`, `packages/api/src/services/holdings/holdingsProjection.ts:468`, `packages/api/src/services/holdings/transaction.service.ts:289`

### Deposit detail page <!-- F-FD-004 -->
**What it does:** One deposit's page: a header with the bank name, "Fixed Deposit"/"Recurring Deposit" and "№ <6 characters>", term, payout and portfolio, the rate "per annum", a **Term progress** bar with a badge ("Nd to maturity" — red ≤30, amber ≤90, green otherwise — or "Matured Nd ago"); stats **Principal** (RD: **Total Deposited**), **Current Value**, **Interest Earned** (with %), **At Maturity** ("on <date>"); charts **Projected growth** (Value vs Principal with a "Today" line), **Maturity composition** (Principal vs Interest donut with "Interest as % of total") and **Accrual split — principal vs interest**; then the RD installment schedule (F-FD-005) and the payment log (F-FD-006).

**Why it exists:** Shows how a deposit grows and what it pays out. Inferred from behavior.

**Where to find it:** Click a card or reminder on **FDs & RDs** (route `/fds/:holdingId`). Direct links and refreshes also work: the page looks the deposit up across your portfolios.

**Who can use it:** Same as F-FD-001.

**Steps**
1. Open a deposit. Charts appear when the deposit has a rate and maturity date.
2. If they're missing, a notice says "Add interest rate and maturity date to see growth charts, maturity projection, and installment schedule." (or the rate-only / maturity-only variant); click **Edit details**.
3. Use **Log payment** to add an entry, **Edit** to edit the first deposit entry, **FDs & RDs** (back arrow) to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **FDs & RDs** (back) | Button | Returns to `/fds` | — |
| **Log payment** | Button | Opens an empty FD/RD form preset to this class and portfolio | — |
| **Edit** | Button | Edits the first deposit entry | No entry matched |
| **Edit details** | Button | Same, from the missing-data notice | Notice hidden when rate and maturity exist |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Redirect to `/fds` | The deposit no longer exists or isn't yours | — |
| "Loading…" | Looking the deposit up | Wait |
| Entries from another deposit appear | No entry matched by account number or name, so the page shows every entry of that class in the portfolio | Give each deposit a distinct account number |

**Limitations:** Detail figures use compounding by payout frequency (At maturity treated as yearly), so they can differ from the card's **At maturity** (DOCUMENTATION_GAPS.md). Matching also accepts partial name matches (one name containing the other).

**How it works:** Entries are read with `pageSize=500` (server caps at 200) for the deposit's class and portfolio, matched by account number, exact name, partial name, else all. Projected value at date t = P × (1 + r/n)^(n × years), years = days ÷ 365.25, n from the first entry's frequency (default Quarterly). RD maturity = Σ over each month's installment of its own growth to maturity. Interest Earned = server current value − principal.

**Related features:** F-FD-003, F-FD-005, F-FD-006.

**Sources:** `apps/web/src/pages/assetClasses/FdDetailPage.tsx:369`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:392`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:430`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:456`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:472`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:687`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:775`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:797`, `apps/web/src/lib/depositMath.ts:63`

### RD installment schedule <!-- F-FD-005 -->
**What it does:** For a recurring deposit, an **Installment schedule** card ("<paid> / <total> paid") lists every month: #, Due date, Installment, Cumulative principal, Projected value, Status (**Paid <date>** green, **Overdue** red, **Upcoming**) and an action: **Mark paid** or **Undo**. The first 12 rows show; **Show all N** / **Show less** toggles.

**Why it exists:** Tick off installments as you pay them. Inferred from behavior.

**Where to find it:** RD detail page (route `/fds/:holdingId`).

**Who can use it:** Portfolio owner (R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER).

**Steps**
1. Find the month and click **Mark paid**. "Installment marked paid" appears; the row turns Paid.
2. To reverse, click **Undo** on a paid row ("Entry removed").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Mark paid** | Button | Records an installment dated on the due date | Paid rows |
| **Undo** | Button | Deletes that installment entry | Unpaid rows |
| **Show all N** / **Show less** | Button | Expand/collapse | 12 rows or fewer |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Mark paid adds a Deposit entry with the first installment's amount, rate, frequency and maturity; Undo deletes the entry. The holding is rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to mark paid" | Server refused (duplicate, not your portfolio) | — |
| "Failed to delete" | Server refused | — |

**Limitations:** A payment counts for a month when its date falls in that calendar month offset from the opening date; two payments in one month match only one row. Schedule needs a rate and maturity date.

**How it works:** Rows = tenure months; due date of row k = opening + (k−1) months; projected value = Σ growth of installments to that due date.

**Related features:** F-FD-004, F-FD-007.

**Sources:** `apps/web/src/pages/assetClasses/FdDetailPage.tsx:131`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:548`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:640`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:658`

### Deposit payment log <!-- F-FD-006 -->
**What it does:** A **Payment log** ("N records") lists the deposit's entries newest first (Date, Type, Amount, Notes) with edit/delete (shown on hover) and, for FDs paying out interest periodically, computed "accrued" interest rows ("Computed from rate & frequency") for each payout date up to today or maturity that has no matching Interest credited entry.

**Why it exists:** See every payment and expected interest credit. Inferred from behavior.

**Where to find it:** Deposit detail page (route `/fds/:holdingId`).

**Who can use it:** Same as F-FD-004; edit/delete need portfolio ownership.

**Steps**
1. Hover a real entry; click the pencil to edit or the bin, then **Yes**, to delete ("Entry removed").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Edit (pencil, "Edit") | Icon | Opens the FD/RD form | Accrued rows |
| Delete (bin, "Delete") → **Yes** / **No** | Icon + buttons | Deletes the entry | Accrued rows |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Edits/deletes rebuild the holding.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No payments recorded yet." | No entries matched | — |

**Limitations:** Accrued rows are display-only estimates: principal × rate ÷ periods per year each period (simple, not compounding); they are not saved.

**How it works:** Payout step = 12 ÷ periods per year months from the opening date; a row is skipped if an Interest credited entry exists on exactly that date.

**Related features:** F-FD-003, F-FD-004.

**Sources:** `apps/web/src/pages/assetClasses/FdDetailPage.tsx:252`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:587`, `apps/web/src/pages/assetClasses/FdDetailPage.tsx:602`

### Deposit maturity and installment alerts <!-- F-FD-007 -->
**What it does:** Every day the server adds alerts to the bell: "<Bank> FD/RD matures in N days" at 30, 15, 7 and 1 days before maturity (with "₹<principal> deposit matures on <date>" for FDs), and for RDs "<Bank> RD installment due in N days" / "…due today" at 3, 1 and 0 days, plus once "…installment overdue by N days" per missed installment.

**Why it exists:** Reminders outside the app page. Stated in code comments.

**Where to find it:** The header alerts bell and **Tools → Alerts** (D-ASSET-006).

**Who can use it:** Every signed-in user with FD/RD entries.

**Steps:** Not applicable — automatic.

**Controls:** None on this page.

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Alert rows appear in the bell.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No alert for a deposit | No maturity date, or it has a Maturity/Withdrawal entry (closed) | Add the maturity date |

**Limitations:** Runs once a day at 20:45 IST, so an alert lands only on the exact threshold day. Deposits are grouped by portfolio + class + account number or name.

**How it works:** `jobs/alertJobs.ts` lists users as a system task, then runs each user's scan under that user (so row-level security returns their data). `generateDepositReminderAlerts` reads Deposit/Maturity/Withdrawal entries; each alert has a key (deposit, date, threshold) so it's created once.

**Related features:** F-FD-002, D-ASSET-006.

**Sources:** `packages/api/src/services/banking/depositReminders.service.ts:24`, `packages/api/src/services/banking/depositReminders.service.ts:85`, `packages/api/src/jobs/alertJobs.ts:36`, `packages/api/src/jobs/alertJobs.ts:48`

### What this area doesn't do
- No bank-statement auto-import of FDs on this page; no TDS or tax on interest.
- No premature-withdrawal penalty calculation.
- No partial withdrawal: any withdrawal removes a whole deposit entry.

## Gold & Silver

The **Gold & Silver** page tracks physical gold, Sovereign Gold Bonds (SGB), gold ETFs and physical silver, values them from a live metal-price feed, and keeps photos of jewellery and coins.

### Gold & Silver holdings with live valuation <!-- F-GOLD-001 -->
**What it does:** Shows the live rate bar (F-GOLD-002), cards **Invested**, **Current value** (with a pulsing "live" dot) and **Unrealised P&L** (with %), a holdings table (Name, Type — Physical Gold / Gold Bond / Gold ETF / Silver, Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table with photo thumbnails (up to 3, then "+N"; click to enlarge), edit and delete. Clicking a holding opens its detail page (F-GOLD-004).

**Why it exists:** Value metal holdings at today's rate. Page description: "Track physical gold, sovereign gold bonds, gold ETFs, and silver".

**Where to find it:** **Asset Classes → Gold & Silver** (route `/gold`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER on the managed person's data; edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → Gold & Silver**. Values refresh every 10 seconds.
2. Click a holding row for its detail page; click a photo thumbnail to enlarge it.
3. Delete a transaction with the bin → **Yes**; edit with the pencil (F-GOLD-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Holding row | Click | Opens `/gold/<id>` | — |
| Photo thumbnail ("View photo") | Button | Enlarges the photo | No photos |
| **Download** | Button | Report filtered to Physical Gold, Gold Bond, Gold ETF, Silver (D-ASSET-001) | — |
| **Add** / **Add first entry** | Button | Opens "Add Gold / Silver" | — |
| Edit (pencil) / Delete (bin) → **Yes** / **No** | Icons + buttons | Edit or delete a transaction | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this table (purity pickers: F-GOLD-002).

**Results:** Read only (delete rebuilds the holding).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No gold & silver yet" / "Add a transaction to start tracking this asset class." | No entries | **Add first entry** |
| Gold ETF value far too high | The name doesn't contain a recognised ticker, so the page falls back to the server value, which prices ETF units as grams of gold | Put the ticker (e.g. GOLDBEES) in the name (DOCUMENTATION_GAPS.md) |

**Limitations:** The page's live value and the server's stored value (used by the dashboard, reports and net worth) differ: the server values physical gold at the 24K price whatever the carat, ignores silver purity, and values Gold ETF units at the per-gram gold price (DOCUMENTATION_GAPS.md). Recognised gold ETF tickers: GOLDBEES, GOLDIETF, AXISGOLD, HDFCGOLD, KOTAKGOLD, SETFGOLD, LICMFGOLD, QGOLDHALF.

**How it works:** Live prices from `GET /api/assets/commodities/live` every 10 s. Per holding: Physical gold = 24K price per gram × (carat ÷ 24) × grams, carat read from a "22K"-style tag in the name (default 24); SGB = 24K price × units; Gold ETF = that ticker's NAV × units; Silver = silver price per gram × purity factor (999 → 1, 925 → 0.925, 800 → 0.8, read from a leading "999/925/800" in the name) × grams. If no live value can be made, the server value is used; P&L = value − cost.

**Related features:** F-GOLD-002, F-GOLD-003, F-GOLD-004, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/GoldPage.tsx:10`, `apps/web/src/pages/assetClasses/GoldPage.tsx:24`, `apps/web/src/pages/assetClasses/GoldPage.tsx:39`, `apps/web/src/pages/assetClasses/GoldPage.tsx:45`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:173`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:371`, `packages/api/src/priceFeeds/router.service.ts:65`, `packages/api/src/services/holdings/holdingsProjection.ts:478`

### Live gold and silver rate bar <!-- F-GOLD-002 -->
**What it does:** A sticky bar at the top shows the current **Gold** and **Silver** price per gram ("/g") at a purity you pick, and "Live · updated <just now | Ns ago | N min ago>" (or "Loading…", or "Live feed unavailable" in red).

**Why it exists:** Quick reference price, at the same purity factors used to value holdings ("the price the top bar shows for 22K is the price a 22K holding is valued at" — code comment).

**Where to find it:** **Asset Classes → Gold & Silver**, top (route `/gold`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Pick a purity in the selector next to **Gold** or **Silver**. The price updates and the choice is remembered on this device.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Gold purity (aria "Gold purity") | Select | 24K · 999, 22K · 916, 18K · 750, 14K · 585 | — |
| Silver purity (aria "Silver purity") | Select | 999 Fine, 925 Sterling, 800 | — |

**Fields and rules:** None.

**Settings and toggles here:** S-GOLD-001 **Gold purity** — the karat whose price is shown; default 24K; remembered on this device only. S-GOLD-002 **Silver purity** — default 999 Fine; this device only. Neither changes how holdings are valued.

**Results:** Display only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Live feed unavailable" | The live request failed and no earlier data | Wait; retried twice and polled every 10 s |
| Price "—" | Neither live nor stored price available | — |

**Limitations:** If storage is blocked (private mode), the choice applies but isn't remembered.

**How it works:** Price = base × factor to 2 decimals (gold factor = karat ÷ 24; silver 1 / 0.925 / 0.8). The server keeps a 15-second in-memory cache: gold from CoinGecko PAX Gold (INR ÷ 31.1035 g), then gold-api XAU × USD/INR, then Yahoo GC=F; silver from gold-api XAG × FX, Yahoo SI=F × FX, or SILVERBEES. If both live sources fail it returns the last stored daily price (updated 23:30 IST). A cold start waits at most 4 seconds.

**Related features:** F-GOLD-001.

**Sources:** `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:37`, `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:131`, `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:177`, `apps/web/src/lib/metalPurity.ts:31`, `packages/api/src/priceFeeds/commodity.service.ts:33`, `packages/api/src/priceFeeds/commodity.service.ts:303`, `packages/api/src/controllers/assets.controller.ts:153`, `packages/api/src/jobs/priceJobs.ts:347`

### Add, edit and delete a gold or silver entry <!-- F-GOLD-003 -->
**What it does:** The "Add Gold / Silver" / "Edit Gold / Silver Entry" dialog records a buy or sale (and for SGBs, interest and maturity), pre-fills today's price, and lets you attach up to 5 photos.

**Why it exists:** Metal holdings are tracked through entries; photos document jewellery and coins. Inferred from behavior and UI text "Click to add photos of your jewellery, coins, etc."

**Where to find it:** **Gold & Silver** → **Add**, a transaction pencil, or the detail page's edit (routes `/gold`, `/gold/:holdingId`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Click **Add**. Pick **Portfolio** and **Type**: **Physical Gold** ("tracked in grams"), **Sovereign Gold Bond (SGB)** ("units"), **Gold ETF** ("units"), **Physical Silver** ("grams").
2. Pick **Transaction** (Buy/Sell; SGB also **Interest received (2.5%)** and **Maturity / Redemption**) and **Date**.
3. Physical metal: pick the **Carat** (24K/22K/18K/14K) or **Purity** (999/925/800 purity).
4. Type **Name / Description**; for SGB/ETF optionally **ISIN**.
5. Enter **Weight (grams)** or **Units** and the price. When adding, the price fills from the live rate (marked "live"); typing your own clears the mark.
6. SGB buy: optional **Interest Rate (% p.a.)** ("RBI pays 2.5% p.a. semi-annually") and **Maturity Date** ("8 years from issue date").
7. Optionally **Add photo**. Click **Add entry** ("Entry added") or **Save changes** ("Entry updated").
8. Edit mode: **Delete** → **Yes, delete** ("Entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Type** cards | Radio | Asset type; switching resets transaction, purity and (when adding) price | — |
| Carat / Purity buttons | Toggle | Purity | Physical gold/silver only |
| "live" / "Fetching…" | Indicator | Price came from the live feed | Adding only |
| **Add photo** / camera tile | Button | Picks images | 5 photos reached |
| Photo × | Button | Removes a pending photo, or deletes a saved one | — |
| **Add entry** / **Save changes** ("Saving…") | Button | Saves, then uploads pending photos | While saving |
| **Cancel** / **Delete** → **Yes, delete** | Buttons | Close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Name / Description | Text | Yes | the carat/purity is added as a prefix for physical metal ("22K Gold bracelet") | — | "Enter a name or description" |
| ISIN | Text | No | SGB/ETF only; max 20 (server) | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Weight (grams) / Units (SGB interest: Units held) | Number | Yes | > 0, step 0.001 | — | "Must be > 0" |
| Price per gram (₹) / Issue / Market Price (₹/unit) / NAV / Price (₹/unit) / Interest per unit (₹) | Number | Yes | ≥ 0 | live price when adding | — |
| Interest Rate (% p.a.) | Number | No | 0–100, SGB buy only | — | — |
| Maturity Date | Date | No | SGB buy only | — | — |
| Notes | Text area | No | max 500 (server); placeholder "Storage location, purchase source, etc." | — | — |
| Photos | Files | No | JPEG, PNG, WebP, HEIC/HEIF; max 5 per entry in the form | — | "Max 5 photos per entry" |

**Settings and toggles here:** None.

**Results:** The entry is saved, the holding rebuilt, then photos uploaded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / duplicate message | Server refused | — |
| "Failed to delete photo" | Server refused | Retry |
| A photo silently missing after save | Upload failed; failures are ignored | Add it again from the detail page (DOCUMENTATION_GAPS.md) |

**Limitations:** Changing the carat on an existing entry renames it ("24K …" → "22K …"), which can split it into a separate holding. SGB interest entries do not change value. Files of other types are silently skipped.

**How it works:** `POST/PATCH /api/transactions` then `POST /api/transactions/:id/photos` per photo. The server checks the file's real type from its first bytes ("That file is not a JPEG, PNG, WebP or HEIC image."), stores it encrypted in the database, and limits size to `MAX_UPLOAD_SIZE_MB` (default 50 MB).

**Related features:** F-GOLD-001, F-GOLD-004.

**Sources:** `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:29`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:46`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:210`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:255`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:283`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:330`, `apps/web/src/pages/assetClasses/GoldFormDialog.tsx:487`, `packages/api/src/controllers/transactionPhotos.controller.ts:78`, `packages/api/src/config/env.ts:58`

### Gold holding detail page <!-- F-GOLD-004 -->
**What it does:** A page per metal holding: photo carousel (previous/next, dots, "N / M", **Delete photo**), type and portfolio, purity badge and name, ISIN, **Current Valuation** (live), price per gram/unit with premium % over your average cost, **Unrealised** P&L, a two-point **Cost · Value** chart, **The Ledger** (Invested "across N lots", Weight/Units, Avg Cost, Live Price, Held For, XIRR or Activity), **First Acquired**, **Last Activity**, **Net Position** (bought − sold), and a **Transactions** timeline with edit/delete and photo thumbnails.

**Why it exists:** A record of one piece or lot with its photos and value. Inferred from behavior.

**Where to find it:** Click a holding on **Gold & Silver** (route `/gold/:holdingId`).

**Who can use it:** Same as F-GOLD-001.

**Steps**
1. Open a holding from the list.
2. With no photos, click **Add Photo** to attach one (to the newest transaction).
3. Hover a transaction to edit (pencil) or delete (bin → confirm bin, or **Cancel**).
4. **Gold & Silver** (back) returns to the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Gold & Silver** (back) | Button | Returns to `/gold` | — |
| **Add Photo** | Button | Uploads one image to the newest transaction | Hidden once any photo exists |
| **Previous photo** / **Next photo** / dots | Buttons | Browse photos | One photo or fewer |
| **Delete photo** | Button | Deletes the shown photo | — |
| **Edit transaction** / **Delete transaction** → **Confirm delete transaction** / **Cancel** | Icons | Edit or delete | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Photo and transaction changes are saved; deleting the last transaction returns you to the list.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent back to `/gold` | Opened by a direct link or after refresh — the page only works when opened from the list | Open it from the list (DOCUMENTATION_GAPS.md) |
| "Add a transaction before uploading a photo" | No transaction found | — |
| Photo shows "Unavailable" | The image could not be loaded | Delete and re-add |

**Limitations:** Stats come from the list's snapshot and don't refresh after an edit until you reopen. Only the newest 200 transactions of that class are searched. Once one photo exists there is no further **Add Photo** button here; add more through the edit form (max 5).

**How it works:** Transactions are filtered by the holding's asset key. Live value as in F-GOLD-001 (refresh every 60 s). Held For = server holding period, else days since the first transaction ("Ny Nmo"). XIRR shown when the server returns a reliable one.

**Related features:** F-GOLD-001, F-GOLD-003.

**Sources:** `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:318`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:337`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:343`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:356`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:390`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:401`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:518`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:626`

### What this area doesn't do
- No making charges, GST or wastage in the cost; no hallmark/HUID field.
- No price history chart (only cost vs today).
- No platinum or other metals.

## Crypto

The **Cryptocurrency** page (sidebar **Crypto**, an optional class added with **Add asset class**) tracks coins with live INR and USD prices from CoinGecko.

### Crypto holdings with live prices <!-- F-CRYPTO-001 -->
**What it does:** Shows a live ticker strip (first 8 coins with a price: symbol, 24h change %, INR price), cards **Invested**, **Current value** (INR and USD, "live"), **Unrealised P&L** (with %), **Coins held** ("N with live prices"), a **Your Coins** grid (one card per holding: current value in INR and USD, Qty, P&L %, 24h change; sorted by value) and a **Transactions** table (Date, Coin, Type, Qty, Price, Amount) with edit and delete.

**Why it exists:** Track crypto at market prices. Page description: "Track Bitcoin, Ethereum, and other digital assets with live prices".

**Where to find it:** **Asset Classes → Crypto** (route `/crypto`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER; edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → Crypto**. Prices refresh every 15 seconds while the tab is visible.
2. Click a coin card to open its detail page (F-CRYPTO-003).
3. Delete a transaction: bin → **Yes**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Coin card | Button | Opens `/crypto/<id>` | — |
| **Download** | Button | Report filtered to Crypto (D-ASSET-001) | — |
| **Add Crypto** / **Add your first coin** | Button | Opens "Add Cryptocurrency" | — |
| Edit (pencil) / Delete → **Yes** / **No** | Icons | Edit or delete a transaction | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No crypto holdings yet" / "Track Bitcoin, Ethereum, Solana and more with live INR + USD prices." | No entries | **Add your first coin** |
| A coin shows no live price | It was typed as free text, not picked from search | Edit and pick it from search |

**Limitations:** Live prices exist only for coins in the app's coin list (13 seeded: Bitcoin, Ethereum, Solana, Cardano, XRP, Dogecoin, Polkadot, Polygon, Chainlink, Avalanche, BNB, Tether, USD Coin, plus any coin added for analytics). Staking rewards don't add to the holding.

**How it works:** Live data from `GET /api/assets/crypto/live` (server caches 10 s; falls back to the last stored price). A holding is matched to a coin by the CoinGecko id stored in its ISIN field. Value = units × live INR price, else the server's stored value. The server also re-prices crypto holdings every 2 minutes.

**Related features:** F-CRYPTO-002, F-CRYPTO-003, D-ASSET-007.

**Sources:** `apps/web/src/pages/assetClasses/CryptoPage.tsx:192`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:197`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:224`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:253`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:360`, `packages/api/src/priceFeeds/crypto.service.ts:9`, `packages/api/src/priceFeeds/crypto.service.ts:232`, `packages/api/src/jobs/priceJobs.ts:351`

### Add, edit and delete a crypto entry <!-- F-CRYPTO-002 -->
**What it does:** The "Add Cryptocurrency" / "Edit Crypto Entry" dialog records a Buy, Sell, Staking Reward, Transfer In or Transfer Out, with coin search, exchange, network, wallet and a one-click live price.

**Why it exists:** Crypto is tracked through entries. Inferred from behavior.

**Where to find it:** **Crypto** → **Add Crypto**, a transaction pencil, or the detail page pencil (routes `/crypto`, `/crypto/:holdingId`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Click **Add Crypto**. Pick **Portfolio** and **Transaction**.
2. Type in **Coin** ("Search Bitcoin, ETH, SOL…") and pick a result. "Linked to CoinGecko · live prices enabled" appears; typing free text shows "Free-text coin name. Live prices only available when matched from search."
3. Optionally choose **Exchange / Platform**, **Network / Chain**, **Wallet Address / Account ID**.
4. Enter **Date**, **Quantity**, **Price ₹** — or click the "Live price: ₹… Use this →" bar.
5. Click **Add entry** ("Crypto entry added") or **Save changes** ("Crypto entry updated"). Edit mode: **Delete** → **Yes, delete** ("Entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Transaction buttons | Radio | Buy, Sell, Staking Reward, Transfer In, Transfer Out | — |
| Coin search + result list | Search | Links the coin | Results need at least 1 character |
| Clear (×) | Button | Clears the coin | Empty |
| "Live price … Use this →" | Button | Copies the live INR price into Price | Only for a linked coin with a price |
| **Add entry** / **Save changes** / **Cancel** / **Delete** → **Yes, delete** | Buttons | Save / close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Coin | Search text | Yes | — | — | "Select or enter a coin" |
| Exchange / Platform | Select | No | Coinbase, Binance, WazirX, CoinDCX, Kraken, KuCoin, Bybit, Upbit, Mudrex, Self-custody, Other | — select — | — |
| Network / Chain | Select | No | Bitcoin, Ethereum, Binance Smart Chain, Solana, Polygon, Avalanche, Cardano, Polkadot, Tron, Other | — select — | — |
| Wallet Address / Account ID | Text | No | — | — | — |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Quantity | Number | Yes | > 0, step 0.00000001 | — | "Must be > 0" |
| Price ₹ | Number | Yes | ≥ 0 | — | — |
| Notes | Text area | No | exchange, network, wallet and notes are stored together; max 500 characters (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** Saved as a transaction; the coin's holding is rebuilt (Buy and Transfer In add units at the price entered; Sell and Transfer Out remove; Staking Reward is listed but adds nothing).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / "Validation failed" | Server refused (e.g. text over 500 characters) | Shorten notes/wallet |
| Duplicate message | Same entry already recorded | — |

**Limitations:** Transfer In counts as a purchase at the price you type. Search only finds coins in the app's coin list.

**How it works:** Saved with assetClass CRYPTOCURRENCY, isin = CoinGecko id, narration = "Exchange: … | Network: … | Wallet: … | <notes>". Server search: coin list rows whose id, symbol or name contain the text (max 12 shown).

**Related features:** F-CRYPTO-001, F-CRYPTO-003.

**Sources:** `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:29`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:47`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:90`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:167`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:295`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:352`, `apps/web/src/pages/assetClasses/cryptoUtils.ts:26`, `packages/api/src/priceFeeds/crypto.service.ts:327`

### Coin detail page <!-- F-CRYPTO-003 -->
**What it does:** A page per coin holding: symbol and portfolio badges, a **CoinGecko** link, **Current Value** (INR, USD, price per coin, 24h change), **Unrealised P&L**, stats **Invested**, **Quantity**, **Avg cost**, **XIRR** and **Held for** when available, a **Source** box (Exchange, Network, Wallet from the latest transaction), and **Transactions** with an edit pencil.

**Why it exists:** One coin's position and history. Inferred from behavior.

**Where to find it:** Click a coin card on **Crypto** (route `/crypto/:holdingId`).

**Who can use it:** Same as F-CRYPTO-001.

**Steps**
1. Open a coin card. Prices refresh every 15 s.
2. Click a transaction's pencil to edit it (delete from inside the form).
3. **Cryptocurrency** (back) returns.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cryptocurrency** (back) | Button | Returns to `/crypto` | — |
| **CoinGecko** | Link | Opens the coin on coingecko.com in a new tab | Free-text coins |
| Edit (pencil) | Icon | Opens the crypto form | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent back to `/crypto` | Opened by a direct link or refresh | Open it from the list (DOCUMENTATION_GAPS.md) |
| "No transactions found." | None matched | — |

**Limitations:** The transactions list includes this coin's entries from every portfolio, while the figures are for one portfolio's holding. Stats don't refresh after an edit until reopened.

**How it works:** Transactions (newest 200 crypto) filtered by CoinGecko id, else exact name.

**Related features:** F-CRYPTO-001, F-CRYPTO-002.

**Sources:** `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:44`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:58`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:70`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:135`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:228`

### What this area doesn't do
- No exchange or wallet API import; no tax (VDA 30%/1% TDS) computation here.
- No coin outside the app's coin list can be searched or live-priced.

## NPS

The **NPS** page (an optional sidebar class added with **Add asset class**) records National Pension System contributions by hand.

### NPS holdings and entries <!-- F-NPS-001 -->
**What it does:** Shows **Invested**, **Current value**, **Unrealised P&L** cards, a holdings table (Name with PRAN, Type, Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table with edit and delete.

**Why it exists:** Keep NPS in your net-worth picture. Page description: "Track your National Pension System PRAN and scheme allocations".

**Where to find it:** **Asset Classes → NPS** (route `/nps`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER; edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → NPS**.
2. Edit (pencil) or delete (bin → **Yes**) a transaction.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report filtered to NPS (D-ASSET-001) | — |
| **Add** / **Add first entry** | Button | Opens "Add NPS Entry" | — |
| Edit / Delete → **Yes** / **No** | Icons + buttons | Edit or delete | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No NPS yet" / "Add a transaction to start tracking this asset class." | No entries | **Add first entry** |
| Current value ₹0 and P&L equal to minus the invested amount | NPS has no price source; no holding has a current value | Read **Invested** only (DOCUMENTATION_GAPS.md) |

**Limitations:** No NAV or scheme-allocation tracking despite the page description; "Growth / returns" entries do not change the holding.

**How it works:** Standard asset-class page over class NPS (see "How asset-class pages work").

**Related features:** F-NPS-002, D-ASSET-008.

**Sources:** `apps/web/src/pages/assetClasses/NpsPage.tsx:7`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:188`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:301`, `packages/api/src/priceFeeds/router.service.ts:99`

### Add, edit and delete an NPS entry <!-- F-NPS-002 -->
**What it does:** The "Add NPS Entry" / "Edit NPS Entry" dialog records a **Contribution**, **Growth / returns**, **Exit / partial withdrawal** or **Opening balance**.

**Why it exists:** NPS is tracked through entries. Inferred from behavior.

**Where to find it:** **NPS** → **Add** or a pencil (route `/nps`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Click **Add**. Pick **Portfolio**.
2. Type **Fund Manager / Scheme** (e.g. "SBI Pension Funds – Tier I") and optional **PRAN Number**.
3. Pick **Entry Type**, enter **Date** and the amount (**Contribution Amount (₹)**, **Returns Credited (₹)**, **Amount Withdrawn (₹)**, **Current Corpus (₹)**).
4. For Growth / returns, optionally **Interest / Return Rate (% p.a.)**.
5. Click **Add NPS entry** ("NPS entry added") or **Save changes** ("NPS entry updated"). Edit: **Delete** → **Yes, delete** ("NPS entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Entry Type** buttons | Radio | Contribution, Growth / returns, Exit / partial withdrawal, Opening balance | — |
| **Add NPS entry** / **Save changes** / **Cancel** / **Delete** | Buttons | Save / close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Fund Manager / Scheme | Text | Yes | — | — | "Enter account name" |
| PRAN Number | Text | No | placeholder "12-digit PRAN"; max 20 (server); also separates holdings | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Amount | Number | Yes | ≥ 0 | — | — |
| Interest / Return Rate (% p.a.) | Number | No | 0–30; Growth / returns only | — | — |
| Notes | Text area | No | max 500 (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** Quantity-1 transaction saved; holding rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / duplicate message | Server refused | — |

**Limitations:** An "Exit / partial withdrawal" removes the oldest whole contribution regardless of amount. Entries with and without a PRAN become separate holdings.

**How it works:** `POST/PATCH /api/transactions`, assetClass NPS, quantity 1, price = amount, isin = PRAN.

**Related features:** F-NPS-001, D-ASSET-004.

**Sources:** `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:36`, `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:214`, `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:294`, `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:434`

### What this area doesn't do
- No NSDL/CRA statement import, NAV feed, Tier I/II split or asset-allocation (E/C/G/A) view.

## Post Office

The **Post Office Schemes** page (sidebar **Post Office**, an optional class) groups all eight India Post schemes — NSC, KVP, SCSS, SSY, MIS, RD, Time Deposit and Savings — with interest-accrual values and a detail page per account.

### Post Office schemes overview <!-- F-PO-001 -->
**What it does:** Shows **Invested** ("N account(s)"), **Current value** ("across all schemes"), **Unrealised P&L** ("interest accrual") and one row per scheme in a fixed order. Schemes you hold are expandable cards (label, count, full name, Invested, Current, P&L) listing each account (Account, Portfolio, Invested, Current, P&L) with an **Add <scheme>** button; schemes you don't hold show a dashed "**Add first <scheme>**" row.

**Why it exists:** "NSC, KVP, SCSS, SSY, MIS, RD, TD and Savings — all India Post investments in one place." (page description).

**Where to find it:** **Asset Classes → Post Office** (route `/post-office`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.

**Steps**
1. Open the page. Schemes with accounts start expanded.
2. Click a scheme header to collapse/expand; click an account row to open it (F-PO-003).
3. Click **Add scheme**, **Add first <scheme>** or **Add <scheme>** to add an entry with that scheme preselected.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report filtered to the 8 PO classes (D-ASSET-001) | — |
| **Add scheme** / **Add first scheme** | Button | Opens the form at NSC | — |
| Scheme header | Button | Expand/collapse | Empty schemes |
| **Add first <label>** (phone: **Add**) | Button | Opens the form at that scheme | Held schemes |
| **Add <label>** | Button | Opens the form at that scheme | Collapsed / empty |
| Account row | Click | Opens `/post-office/<id>` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No Post Office schemes yet" / "Add an NSC, KVP, SCSS, SSY, MIS, RD, TD or Savings account to start tracking." | No PO holdings | **Add first scheme** |
| Current equals invested for SCSS, MIS, Savings | These are valued at cost (interest treated as paid out) | — |

**Limitations:** Post Office Savings shows the amount deposited, not interest credited; interest entries don't change it.

**How it works:** Holdings of classes NSC, KVP, SCSS, SSY, POST_OFFICE_MIS, POST_OFFICE_RD, POST_OFFICE_TD, POST_OFFICE_SAVINGS from all portfolios. Server current value: NSC, KVP, SSY = Σ deposit × (1 + rate)^years; PO TD and PO RD = Σ deposit × (1 + rate/4)^(4 × years); years = days ÷ 365.25, capped at maturity; no rate → no value; SCSS, MIS, Savings = cost.

**Related features:** F-PO-002, F-PO-003, F-PO-006, D-ASSET-008.

**Sources:** `apps/web/src/pages/assetClasses/PostOfficePage.tsx:61`, `apps/web/src/pages/assetClasses/PostOfficePage.tsx:72`, `apps/web/src/pages/assetClasses/PostOfficePage.tsx:95`, `apps/web/src/pages/assetClasses/PostOfficePage.tsx:138`, `apps/web/src/pages/assetClasses/PostOfficePage.tsx:155`, `apps/web/src/lib/poSchemes.ts:258`, `packages/api/src/services/holdings/holdingsProjection.ts:25`, `packages/api/src/services/holdings/holdingsProjection.ts:106`

### Add, edit and delete a Post Office entry <!-- F-PO-002 -->
**What it does:** The "Add Post Office Entry" / "Edit Post Office Entry" dialog records a purchase, deposit, interest, withdrawal, maturity or opening balance for one scheme, with scheme-specific labels, the current rate as a hint and an auto-filled maturity date.

**Why it exists:** PO schemes are tracked through entries. Inferred from behavior.

**Where to find it:** **Post Office** add buttons; detail page **Add entry**, **Edit**, **Edit details**, log pencil (routes `/post-office`, `/post-office/:holdingId`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Open the form. When adding, pick the **Scheme** (8 tiles); when editing, the scheme is shown read-only ("Scheme: <full name>").
2. Pick **Portfolio**; type the account name (e.g. **Post Office branch**) and optional number (e.g. **Certificate number**, **Account number**).
3. Pick **Entry type** (per scheme, below), enter **Date** and the amount.
4. For Purchase/Deposit/Opening balance, optionally enter **Interest rate (% p.a.)** (placeholder = current rate; hint shown) and **Maturity date** (auto-filled N years after the date for NSC, SCSS, MIS, RD — 5 years).
5. Click **Add entry** ("Post Office entry added") or **Save changes** ("Entry updated"). Edit: **Delete** → **Yes, delete** ("Entry deleted").

| Scheme | Entry types (labels) | Rate hint | Auto maturity |
|---|---|---|---|
| NSC | Purchase certificate, Maturity / redemption | 7.7%, compounded annually | 5 years |
| KVP | Purchase certificate, Maturity / redemption | 7.5% (doubles in ~115 months) | — |
| SCSS | Deposit / top-up, Quarterly interest received, Premature withdrawal, Maturity proceeds, Opening balance | 8.2%, quarterly payout, 5-year term | 5 years |
| SSY | Annual deposit, Interest credited (31 Mar), Partial withdrawal (18+), Maturity at age 21, Opening balance | 8.2%, annual; enter her 21st birthday as maturity | — |
| MIS | Deposit, Monthly interest received, Premature withdrawal, Maturity proceeds, Opening balance | 7.4%, monthly payout, 5-year term | 5 years |
| RD | Monthly installment, Interest credited, Maturity proceeds, Opening balance | 6.7%, quarterly compounding | 5 years |
| Time Deposit | Deposit, Interest credited, Maturity proceeds, Opening balance | 1yr 6.9% · 2yr 7.0% · 3yr 7.1% · 5yr 7.5% | — |
| Savings | Deposit, Withdrawal, Interest credited, Opening balance | 4.0% simple | no maturity field |

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scheme** tiles | Radio | Scheme; switching resets an invalid entry type | Hidden when editing |
| **Entry type** buttons | Radio | Transaction type | — |
| **Add entry** / **Save changes** / **Cancel** / **Delete** → **Yes, delete** | Buttons | Save / close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Account / branch name | Text | Yes | placeholder "e.g. Andheri PO" | — | "Enter account / branch name" |
| Certificate / account number | Text | No | max 20 (server); separates holdings | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Amount | Number | Yes | ≥ 0 (browser minimum 0.01) | — | "Enter amount" |
| Interest rate (% p.a.) | Number | No | 0–30 | — | — |
| Maturity date | Date | No | auto-filled when adding | — | — |
| Notes | Text area | No | max 500 (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** Quantity-1 transaction saved; account holding rebuilt and re-valued.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / duplicate message | Server refused | — |

**Limitations:** The rate hints are fixed text (e.g. "Q1 FY 2024-25"), not live rates. A withdrawal or maturity entry removes one whole earlier entry regardless of amount.

**How it works:** `POST/PATCH /api/transactions` with the scheme's class, quantity 1, price = amount, isin = number, interestRate, maturityDate.

**Related features:** F-PO-001, F-PO-003.

**Sources:** `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx:27`, `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx:66`, `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx:71`, `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx:116`, `apps/web/src/pages/assetClasses/PostOfficeFormDialog.tsx:170`, `apps/web/src/lib/poSchemes.ts:45`

### Post Office account detail page <!-- F-PO-003 -->
**What it does:** A page per PO account: header (scheme label, "№ <6 characters>", name, full scheme name, term, portfolio, rate "per annum"), **Term progress** (not for Savings), stats (**Principal** / **Total Deposited** / **Net Deposited**, **Current Value**, **Interest Earned** / **Interest Paid**, **At Maturity** / **Principal at Maturity** / **Balance**), charts (**Projected growth** or **Running balance**, **Maturity composition** or **Balance split**), a **Returns** card (**XIRR (money-weighted)**, **CAGR (projected)** "to maturity" or the nominal rate), an **Interest accrual timeline** or **Interest payout timeline** bar chart, the installment schedule (F-PO-004) and the transaction log (F-PO-005).

**Why it exists:** Shows how each scheme grows or pays out. Code comment: a behaviour "family" (lump-sum, recurring, payout, savings) drives the layout.

**Where to find it:** Click an account row on **Post Office** (route `/post-office/:holdingId`).

**Who can use it:** Same as F-PO-001.

**Steps**
1. Open an account from the list.
2. If rate or maturity is missing, a notice ("Add an interest rate and maturity date to see growth charts and projections." or the single-field variant) offers **Edit details**.
3. **Add entry** adds another entry; **Edit** edits the first purchase/deposit; **Post Office** (back) returns.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Post Office** (back) | Button | Returns | — |
| **Add entry** | Button | Opens the PO form preset to this scheme and portfolio | — |
| **Edit** / **Edit details** | Button | Edits the first purchase/deposit entry | No entry; notice hidden when data complete |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent back to `/post-office` | Opened by a direct link or refresh | Open it from the list (DOCUMENTATION_GAPS.md) |
| Another account's entries appear | No entry matched by number or name, so all entries of the scheme in the portfolio are shown | Give accounts distinct numbers |
| "Add rate & maturity to project interest payouts." | Missing data | **Edit details** |

**Limitations:** Projections use the first entry's rate and, for RD/SSY, the first installment amount for every period (RD monthly, SSY yearly). Payout schemes' "Interest Paid" sums recorded interest entries, else estimates simple interest since opening.

**How it works:** Lump-sum value = P × (1 + r/n)^(n × years) with n = 1 (NSC, KVP), 4 (TD); recurring = Σ installments grown to the date (n = 4 RD, 1 SSY); payout schemes stay flat at principal with payouts = P × r ÷ n per period (n = 4 SCSS, 12 MIS); Savings = running balance of entries. CAGR = (maturity ÷ principal)^(1/years) − 1.

**Related features:** F-PO-002, F-PO-004, F-PO-005.

**Sources:** `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:319`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:354`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:404`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:442`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:601`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:654`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:728`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:865`, `apps/web/src/lib/poSchemes.ts:21`

### Post Office installment schedule <!-- F-PO-004 -->
**What it does:** For PO RD (monthly) and SSY (yearly), a **Monthly installment schedule** / **Annual deposit schedule** card lists each installment with due date, amount, cumulative amount and status (Paid / Overdue / Upcoming) and **Mark paid** / **Undo** buttons.

**Why it exists:** Tick off RD and SSY payments. Inferred from behavior.

**Where to find it:** PO RD or SSY detail page (route `/post-office/:holdingId`).

**Who can use it:** Portfolio owner.

**Steps**
1. Click **Mark paid** on a due row ("Installment marked paid"); **Undo** deletes it ("Entry removed").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Mark paid** | Button | Adds a Deposit entry on the due date with the first installment's amount, rate and maturity | Paid rows |
| **Undo** | Button | Deletes that entry | Unpaid rows |
| **Show all N** / **Show less** | Button | Expand/collapse the list | Short lists |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Entry added or deleted; holding rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to mark paid" / "Failed to delete" | Server refused | — |

**Limitations:** Needs an opening date and maturity date; installment count = tenure months ÷ 1 (RD) or ÷ 12 (SSY).

**How it works:** A row counts as paid when a Deposit/Purchase entry falls exactly that many months after opening.

**Related features:** F-PO-003.

**Sources:** `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:226`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:552`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:633`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:904`

### Post Office transaction log <!-- F-PO-005 -->
**What it does:** A **Transaction log** lists the account's entries newest first with edit/delete, plus, for SCSS and MIS, computed interest payout rows for each period up to today or maturity that has no recorded interest entry on that date.

**Why it exists:** History of the account with expected payouts. Inferred from behavior.

**Where to find it:** PO detail page (route `/post-office/:holdingId`).

**Who can use it:** Same as F-PO-003; edits need ownership.

**Steps**
1. Use the pencil to edit or the bin → **Yes** to delete ("Entry removed").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Edit (pencil, "Edit") / Delete (bin, "Delete") → **Yes** / **No** | Icons + buttons | Edit / delete | Computed rows |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Edits rebuild the holding.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Loading entries…" | Loading | Wait |

**Limitations:** Computed rows are estimates (P × rate ÷ periods) and are not saved.

**How it works:** Payout step = 12 ÷ periods months from the opening date.

**Related features:** F-PO-003.

**Sources:** `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:123`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:584`, `apps/web/src/pages/assetClasses/PostOfficeDetailPage.tsx:917`

### Post Office maturity alerts <!-- F-PO-006 -->
**What it does:** Daily, the server adds a bell alert "<Scheme> matures in N days" ("<name> matures on <date>") at 30, 15, 7 and 1 days before the maturity date of an NSC, KVP, SCSS, SSY, MIS, RD or Time Deposit entry.

**Why it exists:** Maturity reminders. Inferred from behavior.

**Where to find it:** Alerts bell / **Tools → Alerts** (D-ASSET-006).

**Who can use it:** Every signed-in user with PO entries.

**Steps:** Not applicable — automatic.

**Controls:** None on this page.

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Alert rows in the bell.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No alert | Entry has no maturity date | Add one |

**Limitations:** One alert per purchase/deposit entry, so an RD or SSY with many installments raises one alert per installment carrying the maturity date. Alerts still fire after you record a maturity payout. Runs at 20:45 IST; an alert lands only on the exact threshold day.

**How it works:** `generatePoMaturityAlerts` reads Purchase/Deposit/Opening balance entries with maturity in the next 30 days, run per user by `jobs/alertJobs.ts`; key per entry and threshold prevents repeats.

**Related features:** F-PO-001, D-ASSET-006.

**Sources:** `packages/api/src/services/notifications/alerts.service.ts:256`, `packages/api/src/services/notifications/alerts.service.ts:270`, `packages/api/src/jobs/alertJobs.ts:48`

### What this area doesn't do
- No India Post statement import; rates are not fetched live.
- No interest-on-savings computation for Post Office Savings.

## Other Assets

The **Other Assets** page (sidebar **Others**) is a catch-all for PMS, AIF, ULIP, REIT, InvIT, art and collectibles, cash and anything else.

### Other assets holdings and entries <!-- F-OTHER-001 -->
**What it does:** Shows **Invested**, **Current value**, **Unrealised P&L** cards, a holdings table (Name, Type — PMS, AIF, ULIP, REIT, InvIT, Real Estate, Art, Cash, Other — Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table with edit and delete.

**Why it exists:** Record assets that have no dedicated page. Page description: "Track PMS, AIF, ULIP, REIT, InvIT, real estate, and more".

**Where to find it:** **Asset Classes → Others** (route `/others`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER; edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → Others**; edit or delete transactions as on other pages.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report filtered to these classes (D-ASSET-001) | — |
| **Add** / **Add first entry** | Button | Opens "Add Other Asset" | — |
| Edit / Delete → **Yes** / **No** | Icons + buttons | Edit or delete | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No other assets yet" | No entries | **Add first entry** |
| Current value ₹0 and P&L equal to minus the invested amount | None of these classes has a price source | Read **Invested** only (DOCUMENTATION_GAPS.md) |

**Limitations:** No valuation for any of these classes; Real Estate entries made elsewhere appear here, but the dedicated **Real Estate** page is separate.

**How it works:** Standard asset-class page over PMS, AIF, ULIP, REIT, INVIT, REAL_ESTATE, ART_COLLECTIBLES, CASH, OTHER.

**Related features:** F-OTHER-002.

**Sources:** `apps/web/src/pages/assetClasses/OtherAssetsPage.tsx:7`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:192`, `packages/api/src/priceFeeds/router.service.ts:102`

### Add, edit and delete an other-asset entry <!-- F-OTHER-002 -->
**What it does:** The "Add Other Asset" / "Edit Other Asset" dialog records an entry for one of 8 types, with per-type transaction choices and quantity/price labels.

**Why it exists:** Inferred from behavior.

**Where to find it:** **Others** → **Add** or a pencil (route `/others`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; portfolio owner only.

**Steps**
1. Click **Add**. Pick **Portfolio** and **Asset Type**.
2. Pick **Transaction** (per type, below), type **Asset Name** (e.g. "Helios Capital PMS") and optional **ISIN / Identifier**.
3. Enter **Date**, the quantity (label per type) and **Price (₹)**.
4. Click **Add entry** ("Entry added") or **Save changes** ("Entry updated"); edit: **Delete** → **Yes, delete** ("Entry deleted").

| Asset Type (option) | Transactions | Quantity label |
|---|---|---|
| PMS (Portfolio Management Service) | Invest / top-up, Withdraw / exit | Capital Invested (₹) |
| AIF (Alternative Investment Fund) | Invest, Redeem | Capital Invested (₹) |
| ULIP (Unit-linked Insurance Plan) | Premium paid, Surrender / withdrawal, Maturity | Premium Amount (₹) |
| REIT / InvIT | Buy units, Sell units, Distribution received | Units |
| Art & Collectibles | Buy, Sell | Quantity |
| Cash / Liquid Savings | Deposit / credit, Withdrawal / debit, Opening balance | Amount (₹) |
| Other | Buy / invest, Sell / exit, Deposit, Withdrawal | Quantity |

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Asset Type** | Select | The 8 types above | — |
| **Transaction** buttons | Radio | Per type | — |
| **Add entry** / **Save changes** / **Cancel** / **Delete** → **Yes, delete** | Buttons | Save / close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Asset Name | Text | Yes | — | — | "Enter asset name" |
| ISIN / Identifier | Text | No | max 20 (server) | — | "Validation failed" |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Quantity (label per type) | Number | Yes | > 0, step 0.0001 | — | "Must be > 0" |
| Price (₹) | Number | Yes | ≥ 0 | — | — |
| Notes | Text area | No | max 500 (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** Transaction saved; holding rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / duplicate message | Server refused | — |

**Limitations:** For PMS, AIF, ULIP and Cash the amount goes in the quantity field; a hint line under the fields explains the price per type (for example "NAV / unit value (₹) — use 1 if entering lump sum" for PMS, "Use 1 (enter amount in Quantity)" for Cash), while the price box itself is always labelled "Price (₹)". There is no Real Estate option in **Asset Type**, although the page lists Real Estate holdings; editing one shows the first option instead (DOCUMENTATION_GAPS.md).

**How it works:** `POST/PATCH /api/transactions` with the chosen class, quantity and price.

**Related features:** F-OTHER-001.

**Sources:** `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:26`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:37`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:49`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:73`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:142`, `apps/web/src/pages/assetClasses/OtherAssetFormDialog.tsx:257`

### What this area doesn't do
- No NAV/price for PMS, AIF, ULIP, REIT or InvIT; no distribution yield.
<!-- END MODULES -->

## Roles and profiles

Global role definitions live in the whole-app manual (`_work/global/roles.md`); this section repeats the headings this fragment references. None of the B01 pages is plan-gated.

### Signed-out visitor <!-- R-VISITOR -->
Cannot open any asset-class page; sent to sign-in.

### Free user <!-- R-FREE -->
Full use of every B01 page on their own data (1 portfolio).

### Plus subscriber <!-- R-PLUS -->
Same as Free on these pages (up to 5 portfolios).

### Family subscriber <!-- R-FAMILY -->
Same as Free on these pages (up to 5 portfolios).

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Free on these pages (unlimited portfolios); the F&O Schedule 43 report elsewhere needs this plan.

### Administrator <!-- R-ADMIN -->
No admin-only powers on these pages; access follows their plan.

### Family owner <!-- R-FAMOWNER -->
In family view, sees what the family view returns; can change entries only in portfolios they own.

### Family contributor <!-- R-FAMCONTRIB -->
In family view, sees data within their caps; changes only portfolios they own.

### Family viewer <!-- R-FAMVIEWER -->
In family view, sees data within their caps; changes only portfolios they own.

### Managing a family member's account <!-- R-MANAGER -->
Reads and writes the managed person's entries on these pages, under the manager's plan.

### Professional acting for a client <!-- R-PROF -->
Does not use these pages for a client; client books are reached through **Client books**.

### AI chatbot connection <!-- R-AICONN -->
Cannot use these pages; read-only data access is through the AI connector.

### Succession nominee <!-- R-NOMINEE -->
Cannot use these pages.

## Glossary

| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Holding | What you own of one asset in one portfolio, rebuilt by the app from your transactions (units, cost, current value). |
| Invested | On asset-class pages: the cost of the units you still hold, including charges. |
| Current value | On asset-class pages: today's value of a holding — market price × units, interest accrued to today for deposits and compounding Post Office schemes, cost for payout schemes, and nothing for classes without a price source. |
| Unrealised P&L | Current value minus invested for holdings you still hold. |
| LTP | Last traded price used to value a stock, ETF or F&O contract. |
| as of | The date of the price behind a holding's value; shown amber with ⚠ when older than 5 days (2 days for crypto). |
| ETF | Exchange-traded fund; shown with stocks, tagged "ETF". |
| Equity Holdings | The Stocks page table aggregating each stock across portfolios. |
| F&O | Futures and options contracts, tracked on the Futures & Options page as positions rather than holdings. |
| Futures Ledger | The futures section of the F&O open/closed tabs. |
| Options Chain | On the F&O page, the options section listing your CE/PE positions (not an exchange option chain). |
| CE / PE | Call option / put option. |
| Lot | The contract size of an F&O instrument; quantities are shown as units with "×<lot>". |
| Trade Tape | The F&O list of trades, newest first. |
| Expiry close | A request created on expiry day to close an open F&O contract at the exchange settlement price, approved or rejected on the Expiry tab. |
| EXPIRY ? | Status of an F&O position waiting for its expiry close to be approved. |
| Settlement price | The exchange's closing settlement price for a contract on expiry day, used to book the expiry close. |
| Sync Kite | Pulls today's F&O trades from a connected Zerodha (Kite) account. |
| Turnover (F&O) | ICAI tax-audit turnover: for futures and options, the sum of absolute realised profit and loss per closed trade. |
| FD | Fixed deposit: a one-time deposit with a bank or issuer. |
| RD | Recurring deposit: monthly installments, each recorded as its own entry. |
| At maturity | The projected amount a deposit or scheme pays at its maturity date. |
| Coming up | The FDs & RDs list of maturities within 30 days and RD installments due within 7 days or overdue. |
| Installment schedule | The month-by-month list of an RD's (or Post Office RD/SSY's) installments with Mark paid / Undo. |
| Accrued | A computed interest row in a payment log, estimated from rate and payout frequency, not saved. |
| SGB | Sovereign Gold Bond: government bond priced on gold, tracked in units of 1 gram. |
| Carat / Purity | Gold fineness (24K, 22K, 18K, 14K) or silver grade (999, 925, 800) used to scale the per-gram price. |
| CoinGecko | The crypto price source; a coin "linked to CoinGecko" gets live prices. |
| Staking Reward | A crypto income entry; listed but does not add units. |
| Transfer In / Transfer Out | Crypto moved into or out of a wallet/exchange; counted as a buy or sell at the price entered. |
| PRAN | Permanent Retirement Account Number of an NPS account. |
| NSC | National Savings Certificate (Post Office). |
| KVP | Kisan Vikas Patra (Post Office). |
| SCSS | Senior Citizen Savings Scheme. |
| SSY | Sukanya Samriddhi Yojana. |
| MIS | Post Office Monthly Income Scheme. |
| PMS | Portfolio Management Service. |
| AIF | Alternative Investment Fund. |
| ULIP | Unit-linked Insurance Plan. |
| REIT / InvIT | Real Estate / Infrastructure Investment Trust units. |
<!-- END GLOSSARY -->
