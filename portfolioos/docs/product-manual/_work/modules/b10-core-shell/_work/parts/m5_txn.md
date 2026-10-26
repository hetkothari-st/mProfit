## Transactions

Transactions are the record from which every holding, gain and chart is calculated: buys, sells, SIPs, switches, dividends, bonuses, splits and redemptions, whether typed in, imported or created automatically. Editing or deleting a transaction recalculates the holding it belongs to.

### Transactions list <!-- F-TXN-001 -->

**What it does:** The Transactions page ("All buys, sells, dividends, SIPs, and corporate actions") lists every transaction, newest trade date first, 50 per page, with Date, Type, Asset, Qty, Price, Net and Broker. A picker narrows it to one portfolio; the total count shows beside it. Clicking a row opens it for editing.

**Why it exists:** Inferred from behavior: one ledger of everything that changed your holdings.

**Where to find it:** **Overview → Transactions** (route `/transactions`); phone tab **Transactions**; **View all** on the Dashboard's Recent transactions.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. In family view the list includes family-shared portfolios and other members' personal portfolios (R-FAMCONTRIB/R-FAMVIEWER limited to their permitted asset classes); you can open their rows but only save changes to portfolios you created.

**Steps**
1. Pick **All portfolios** or one portfolio. The list returns to page 1.
2. Use **Previous** / **Next** to page ("Page X of Y").
3. Click a row (on phones, tap it) to edit it (F-TXN-003).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Find duplicates** | Button | F-TXN-006 | — |
| **Add transaction** | Button | F-TXN-002 | — |
| Portfolio picker (**All portfolios**) | Select | Filters by portfolio | — |
| Row | Clickable row | Opens the edit dialog | — |
| **Previous** / **Next** | Buttons | Change page | Shown only with more than one page; disabled at the ends |

**Fields and rules:** None.

**Settings and toggles here:** S-TXN-001 **Transactions portfolio filter** — **All portfolios** (default) or one; not remembered.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No transactions yet — Add your first buy or sell to populate holdings and P&L." | Nothing recorded (or nothing in the chosen portfolio) | **Add transaction** |

**Limitations:** No search, date-range, type or asset filters on this page (the server supports asset class, type and date filters, but the page does not offer them). The Type badge is green for BUY, SIP and SWITCH IN, red for SELL, SWITCH OUT and REDEMPTION, grey otherwise. The Asset sub-line shows symbol, scheme code, ISIN or the class. Phones show two lines per transaction.

**How it works:** `GET /api/transactions?portfolioId=&page=&pageSize=50` (page size capped at 200 on the server). In family view the server reads your rows plus each other member's personal rows, sorts by trade date then creation time (newest first) and pages the result.

**Related features:** F-TXN-002, F-TXN-003, F-TXN-006, F-DASH-013.

**Sources:** `apps/web/src/pages/transactions/TransactionsPage.tsx:52`, `apps/web/src/pages/transactions/TransactionsPage.tsx:84`, `apps/web/src/pages/transactions/TransactionsPage.tsx:101`, `apps/web/src/pages/transactions/TransactionsPage.tsx:159`, `apps/web/src/pages/transactions/TransactionsPage.tsx:189`, `apps/web/src/pages/transactions/TransactionsPage.tsx:226`, `packages/api/src/controllers/transaction.controller.ts:74`, `packages/api/src/services/holdings/transaction.service.ts:605`, `packages/api/src/services/holdings/transaction.service.ts:653`

### Add a transaction <!-- F-TXN-002 -->

**What it does:** The "Add transaction" dialog ("Record a buy, sell, SIP, dividend, or corporate action. Holdings recalculate automatically.") records one transaction and recalculates the holding. A live preview shows **Gross**, **Charges** and **Net (outflow)** or **Net (inflow)**.

**Why it exists:** Inferred from behavior: manual entry for anything not imported.

**Where to find it:** **Transactions → Add transaction**; **Portfolios → <portfolio> → Add transaction** (that portfolio pre-selected).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — only into portfolios you created (R-MANAGER: portfolios of the person you manage).

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
| "You may already have this one" banner | The same trade already exists (F-TXN-005) | **Let me check** or **Record it anyway** |
| "Save failed" / "Forbidden" | Server rejected it, or the portfolio is not yours | Use your own portfolio |
| Clicking **Add transaction** does nothing | Trade date (or price) is invalid or blank — the form shows no message for these | Fill in a valid date and price |

**Limitations:** Net = Gross + Charges for buy-type entries (BUY, SIP, SWITCH IN, DIVIDEND REINVEST and, on the server, also BONUS, RIGHTS ISSUE, OPENING BALANCE, MERGER IN, DEMERGER IN), otherwise Gross − Charges; the preview treats BONUS as an inflow while the server treats it as buy-type. Only portfolios you created accept new transactions, even family-shared ones. After adding from a portfolio's page, that page's top cards and the Dashboard keep their old numbers until revisited. A stock symbol not yet known is added to the stock list (NSE by default; NASDAQ for foreign equity).

**How it works:** `POST /api/transactions`. The server checks the portfolio is yours, quantity and price, a repeat by source key (silently returns the existing row) and a repeat by trade details (409, F-TXN-005); resolves the stock or fund; computes gross = quantity × price, charges, net; stores the row; recalculates the holding. For FOREIGN EQUITY/FOREX PAIR with a rate, the INR equivalent = gross × rate is stored.

**Related features:** F-TXN-005, F-TXN-003, F-PORT-004.

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:62`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:124`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:138`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:208`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:252`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:286`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:319`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:364`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:466`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:481`, `apps/web/src/components/common/AssetSearch.tsx:21`, `apps/web/src/components/common/AssetSearch.tsx:37`, `packages/api/src/controllers/transaction.controller.ts:28`, `packages/api/src/services/holdings/transaction.service.ts:104`, `packages/api/src/services/holdings/transaction.service.ts:123`, `packages/api/src/services/holdings/transaction.service.ts:169`, `packages/api/src/services/holdings/transaction.service.ts:224`, `packages/api/src/services/holdings/transaction.service.ts:342`, `packages/api/src/services/holdings/transaction.service.ts:346`

### Edit a transaction <!-- F-TXN-003 -->

**What it does:** Opens a transaction in the same dialog ("Edit transaction") with its values filled in; **Save changes** updates it and recalculates the holding and its capital gains.

**Why it exists:** Code comment: edits cascade "projection + capital-gains" recalculation so nothing is left stale.

**Where to find it:** **Transactions** → click a row.

**Who can use it:** The creator of the portfolio the transaction is in.

**Steps**
1. Click the row. The dialog opens with its values (the asset search box starts empty; the saved asset is kept unless you pick another).
2. Change fields; click **Save changes**. "Transaction updated" appears.

**Controls:** Same as F-TXN-002 plus **Delete** (F-TXN-004). Types not offered for new entries (for example DEPOSIT, MATURITY, OPENING BALANCE) still show in the **Type** list for a transaction that has them.

**Fields and rules:** Same as F-TXN-002; fields you do not change keep their saved values.

**Settings and toggles here:** None.

**Results:** The row is updated. If its asset or portfolio changed, both the old and the new holding are recalculated, with their capital gains.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Saving this would match a <TYPE> of <qty> <asset> at <price> already recorded on <date>. Save it only if both are genuine." | The edit makes it identical to another row | Check the other row; see Limitations |
| "Transaction not found" | Deleted meanwhile | Refresh the list |

**Limitations:** For an edit, **Record it anyway** on the duplicate banner does not work — the app does not pass the override on edits, so the same warning returns (see DOCUMENTATION_GAPS.md). Change a detail (or delete the other row) instead.

**How it works:** `PATCH /api/transactions/:id` merges your changes with the saved row, re-resolves the asset, recomputes amounts and the asset key, runs the duplicate check excluding itself, saves, then recalculates holdings and capital gains for the old and new asset/portfolio.

**Related features:** F-TXN-002, F-TXN-004, F-TXN-005.

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:179`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:283`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:360`, `packages/api/src/services/holdings/transaction.service.ts:356`, `packages/api/src/services/holdings/transaction.service.ts:461`, `packages/api/src/services/holdings/transaction.service.ts:537`

### Delete a transaction <!-- F-TXN-004 -->

**What it does:** Removes a transaction and recalculates its holding and capital gains.

**Why it exists:** Inferred from behavior: correct mistakes and remove wrong imports.

**Where to find it:** **Transactions** → row → **Delete**.

**Who can use it:** The creator of the portfolio.

**Steps**
1. Open the transaction and click **Delete**.
2. Confirm "Delete this transaction? Holdings will recalculate." "Transaction deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** | Button | Deletes after confirmation | Edit only; disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The row is gone; the holding is recalculated (it disappears when nothing is left); capital-gain records that used it are rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Delete failed" | Not yours, or server error | — |

**Limitations:** No undo.

**How it works:** `DELETE /api/transactions/:id`, then holding and capital-gains recalculation for that asset.

**Related features:** F-TXN-003, F-TXN-006.

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:304`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:367`, `packages/api/src/services/holdings/transaction.service.ts:549`, `packages/api/src/services/holdings/transaction.service.ts:568`

### Duplicate warning on save <!-- F-TXN-005 -->

**What it does:** When a new transaction matches one already recorded, the dialog shows "You may already have this one" with the server's explanation, **Let me check** and **Record it anyway**.

**Why it exists:** Code comment: the same trade can arrive "in a CAS, again in a contract note, again typed in"; this stops double-counting unless you confirm.

**Where to find it:** Top of the Add/Edit transaction dialog after saving.

**Who can use it:** Same as F-TXN-002.

**Steps**
1. Click **Let me check** to close the banner and review, or
2. Click **Record it anyway** to save it as a second, genuine trade.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Let me check** | Button | Hides the banner | — |
| **Record it anyway** | Button | Saves with the duplicate check skipped | Disabled while saving; does not work for edits |

**Fields and rules:** A duplicate is another transaction in the same portfolio, same asset, same type, same trade date, same quantity and same price (charges ignored). It is not a duplicate when both rows carry broker order and trade numbers and they differ (two fills of one order).

**Settings and toggles here:** None.

**Results:** With **Record it anyway**, the transaction is saved.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "A <TYPE> of <qty> <asset> at <price> on <date> is already recorded. Record it again only if this is a second, genuine trade." | Duplicate found | Decide as above |

**Limitations:** See F-TXN-003 for edits.

**How it works:** Server error 409 `DUPLICATE_TRANSACTION` with the matching row's id; the app keeps your values and resends with `allowDuplicate`.

**Related features:** F-TXN-002, F-TXN-006.

**Sources:** `apps/web/src/pages/transactions/TransactionFormDialog.tsx:229`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:383`, `packages/api/src/services/holdings/transaction.service.ts:265`, `packages/api/src/services/holdings/transaction.service.ts:288`, `packages/api/src/services/imports/duplicateMatch.ts:244`, `packages/api/src/services/imports/duplicateMatch.ts:262`

### Find duplicates <!-- F-TXN-006 -->

**What it does:** "Duplicates" ("Rows that record the same money twice. The oldest row in each set is kept; tick anything else you want removed. Holdings, gains and the rent khata are recalculated after.") scans all your transactions and rent entries, groups repeats, and deletes only the rows you tick.

**Why it exists:** Code comment: "The same trade can reach the books from a CAS, a contract note and a typed entry — three sources, one event."

**Where to find it:** **Transactions → Find duplicates**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — over your own portfolios and rentals only.

**Steps**
1. Click **Find duplicates**. "Looking through your books…" shows.
2. Review each set: its label ("N × <TYPE> <qty> <asset> on <date> (<portfolio>)"), reason, a badge **Duplicate** or **Probably fine**, and its rows (amount · source · order/trade numbers · "added <date>"). The oldest row is marked "oldest — kept".
3. Tick or untick rows. Rows in **Duplicate** sets are pre-ticked except the oldest; **Probably fine** sets start unticked.
4. Click **Remove N selected**, then **Yes — remove N row(s)** to confirm. "Removed N transaction(s) and M rent entr(y/ies)" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Row checkbox ("Remove <row>") | Checkbox | Marks a row for removal | — |
| **Remove N selected** → **Yes — remove N row(s)** | Two-step button | Deletes ticked rows | Disabled with nothing ticked or while removing; hidden when there are no sets |
| **Close** | Button | Closes | — |

**Fields and rules:** Up to 1,000 transaction ids and 1,000 rent-entry ids per removal; at least one ("Nothing selected to remove").

**Settings and toggles here:** None.

**Results:** Each ticked row is deleted through its normal delete (holdings, capital gains and rent ledger recalculated).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing is recorded twice across N transactions and M rent entries." | No repeats | — |
| "Could not read your transactions" | Scan failed | Reopen |
| "Could not remove the selected rows" | A delete failed (earlier rows may already be removed) | Reopen and retry |

**Limitations:** A set is "Probably fine" when every row has its own broker order+trade number, or all rows came from one imported file. Rent entries repeat when tenancy, entry type, date, amount and month match ("usually the 'mark received' button pressed twice"). Family members' portfolios are not scanned.

**How it works:** `GET /api/transactions/duplicates` groups by portfolio + asset + type + date + quantity + price (trailing zeros ignored); `POST /api/transactions/duplicates/remove` deletes ids one by one.

**Related features:** F-TXN-004, F-TXN-005, D-TXN-001 (Rental khata).

**Sources:** `apps/web/src/pages/transactions/DuplicatesDialog.tsx:42`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:66`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:131`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:158`, `apps/web/src/pages/transactions/DuplicatesDialog.tsx:228`, `packages/api/src/controllers/transaction.controller.ts:98`, `packages/api/src/services/imports/duplicates.service.ts:24`, `packages/api/src/services/imports/duplicates.service.ts:120`, `packages/api/src/services/imports/duplicateMatch.ts:81`, `packages/api/src/services/imports/duplicateMatch.ts:124`, `packages/api/src/services/imports/duplicateMatch.ts:189`

### Add the missing purchase (from Reports) <!-- F-TXN-007 -->

**What it does:** When a report finds a sale with no purchase behind it, its link opens Transactions with "Add transaction" pre-filled: BUY, the portfolio, asset and quantity filled in, and **Trade date** left blank with the hint "When you bought these units — on or before the sale on <date>." (dates after the sale cannot be picked).

**Why it exists:** Code comment: "A prefilled purchase has no known date. Left blank … rather than defaulted: a default the user forgets to change would book a wrong holding period".

**Where to find it:** Reached from the Reports data-quality banner (D-TXN-002); address `/transactions?add=purchase&…`.

**Who can use it:** Same as F-TXN-002.

**Steps**
1. Follow the link from Reports. The dialog opens pre-filled.
2. Enter the purchase **Trade date** and **Price**; click **Add transaction**.

**Controls:** As F-TXN-002.

**Fields and rules:** Trade date must be on or before the sale date (date picker maximum).

**Settings and toggles here:** None.

**Results:** As F-TXN-002. The address is cleaned so reloading does not reopen the form.

**Errors and troubleshooting:** As F-TXN-002 (a blank date gives no message).

**Limitations:** Quantity is pre-filled only when it is a positive number.

**How it works:** Reads `portfolioId`, `assetClass` (default EQUITY), `symbol`, `assetName`, `isin`, `quantity`, `onOrBefore` from the address once, then clears it.

**Related features:** F-TXN-002, D-TXN-002.

**Sources:** `apps/web/src/pages/transactions/TransactionsPage.tsx:27`, `apps/web/src/pages/transactions/TransactionsPage.tsx:42`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:104`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:215`, `apps/web/src/pages/transactions/TransactionFormDialog.tsx:518`

### What this area doesn't do
- There is no bulk edit, bulk delete (other than duplicates) or export from this page (exports are on Reports).
- You cannot search transactions or filter by date, type or asset on this page.
- You cannot attach photos here (photo attachments exist only on Gold pages).
- You cannot add transactions to a portfolio someone else created, even in a family.
- F&O-specific fields (strike, expiry, option type, lot size) are not in this form; F&O is entered on its own page.

