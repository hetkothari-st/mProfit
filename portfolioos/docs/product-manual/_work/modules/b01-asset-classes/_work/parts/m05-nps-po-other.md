
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
