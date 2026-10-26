
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
