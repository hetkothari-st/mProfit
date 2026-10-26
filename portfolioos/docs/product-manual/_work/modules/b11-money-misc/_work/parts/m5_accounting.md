## Accounting

The **Accounting** page (sidebar **Tools → Accounting**, route `/accounting`) is double-entry bookkeeping over your EveryPaisa data: a chart of accounts, vouchers (entered by hand or generated from your transactions, loans, rent and premiums), an account ledger, and three statements — **Trial Balance**, **P&L Statement** and **Balance Sheet** — plus printable receipts and a one-click **Export to Tally**. The whole module needs the **Pro/Advisor** plan.

### Accounting page and plan lock <!-- F-ACCT-001 -->
**What it does:** Shows four tabs — **Chart of Accounts**, **Vouchers**, **Ledger**, **Reports** — under the header "Double-entry bookkeeping — chart of accounts, vouchers, ledger, and financial statements", with **Export to Tally** in the header for Pro/Advisor accounts.

**Why it exists:** Page description (above).

**Where to find it:** **Tools → Accounting** (route `/accounting`).

**Who can use it:** R-PRO (server-enforced: ACCOUNTING_MODULE). R-FREE, R-PLUS, R-FAMILY see the tabs blurred behind "Accounting Module is locked — Upgrade to Pro/Advisor to unlock Accounting Module." with **View plans**. R-MANAGER: the manager's plan decides; books are the managed person's. R-PROF reaches a client's books through the CA workspace (D-ACCT-004).

**Steps**
1. Open **Tools → Accounting**. **Chart of Accounts** is the default tab.
2. Switch tabs as needed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Chart of Accounts** / **Vouchers** / **Ledger** / **Reports** | Tabs | Switch section | — |
| **Export to Tally** | Button | F-ACCT-013 | Hidden below Pro/Advisor |
| **View plans** | Link | Opens Pricing | Shown only when locked |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Messages like "Request failed with status code 400" on any action | The page shows the browser's generic error instead of the server's reason (defect) | See the specific feature for likely causes |

**Limitations:** Error toasts on this page show the generic request error, not the server's message (see DOCUMENTATION_GAPS.md).

**How it works:** Every `/api/accounting/*` route requires sign-in and the ACCOUNTING_MODULE feature (Pro/Advisor), answering "This feature requires the PRO_ADVISOR plan or higher" otherwise.

**Related features:** F-ACCT-002 to F-ACCT-013.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#export function AccountingPage@@, @@W/pages/accounting/AccountingPage.tsx#<LockedFeature requiredTier="PRO_ADVISOR" featureName="Accounting Module">@@, @@W/pages/accounting/AccountingPage.tsx#onError: (e: Error) => toast.error(e.message),@@, @@A/routes/accounting.routes.ts#accountingRouter.use(requireFeature('ACCOUNTING_MODULE'));@@, @@A/middleware/requirePlan.ts#plan or higher@@

### Chart of accounts <!-- F-ACCT-002 -->
**What it does:** Shows your accounts as a tree with **Code**, **Name**, **Type** (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE) and **Opening Balance**. The first time it is opened, a default chart of 36 accounts is created: Assets (Bank Accounts, Cash in Hand, Investments with Equity, Mutual Fund, Fixed Deposits, Bonds & Debentures, Gold and Other), Liabilities (Loans & Borrowings), Equity & Capital (Capital Account, Retained Earnings), Income (Dividend, Interest, Short-term and Long-term Capital Gains, Rental, Other, Speculative, F&O) and Expenses (Brokerage & Charges, STT, Fund Management Charges, Insurance Premiums, Property Expenses, Capital Losses, Other, Loan Interest, Speculative Loss, Loan Charges, F&O Loss).

**Why it exists:** The accounts every voucher and statement posts to. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Chart of Accounts**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Open the tab. Top-level accounts are expanded; click the chevron to expand or collapse others.
2. Hover a row to see its **+** (add a sub-account) and bin (delete) buttons.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Chevron ("Expand" / "Collapse") | Button | Shows/hides sub-accounts | No effect without children |
| **+** (aria "Add account under <name>") | Button | Opens **Add Account** with that parent | Visible on hover |
| Bin (aria "Delete <name>") | Button | F-ACCT-003 | Visible on hover |
| **Add account** | Button | Opens **Add Account** (top level) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None (beyond the first-time default chart).

**Errors and troubleshooting:** "Loading default chart of accounts…" shows while the list is empty.

**Limitations:** Accounts can't be renamed or re-coded in the app. A deleted default account is created again the next time the chart loads.

**How it works:** `GET /api/accounting/accounts/tree` and `/flat` first create any missing default account (by code), then return all accounts ordered by code.

**Related features:** F-ACCT-003, F-ACCT-005.

**Sources:** @@A/services/accounting/accounting.service.ts#{ code: '1000', name: 'Assets', type: 'ASSET' },@@, @@A/services/accounting/accounting.service.ts#{ code: '5011', name: 'F&O Loss'@@, @@A/services/accounting/accounting.service.ts#export async function ensureDefaultAccounts@@, @@A/services/accounting/accounting.service.ts#export async function listAccountsTree@@, @@W/pages/accounting/AccountingPage.tsx#function AccountTreeNode@@, @@W/pages/accounting/AccountingPage.tsx#Loading default chart of accounts…@@

### Add or delete an account <!-- F-ACCT-003 -->
**What it does:** **Add Account** creates an account with code, type, name, parent and opening balance. Delete removes an account that has no voucher entries and no sub-accounts.

**Why it exists:** To shape the chart to your books. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Chart of Accounts → Add account**, or a row's **+** / bin.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **Add account** (or **+** on a row). **Add Account** opens.
2. Fill **Code** (placeholder "e.g. 1001"), **Type**, **Name**, **Parent Account** (**None (top-level)** or an account), **Opening Balance (₹)**.
3. Click **Create**. The toast "Account created" appears.
4. To delete: click the bin and confirm `Delete account "<name>"?`. The toast "Account deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Create** | Button | Saves; "Creating…" | Disabled until code and name are filled, and while saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Code** | Text | Yes | 1–20, unique | Empty | Server: "Account code <code> already exists" (shown as a generic error) |
| **Type** | Select: ASSET, LIABILITY, EQUITY, INCOME, EXPENSE | Yes | — | ASSET | — |
| **Name** | Text | Yes | 1–200 | Empty | — |
| **Parent Account** | Select | No | Your accounts | None (top-level), or the row's account | Server: "Parent account … not found" |
| **Opening Balance (₹)** | Number | No | Positive decimal only | 0 | Server validation (shown as a generic error) |

**Settings and toggles here:** S-ACCT-001 **Type**; S-ACCT-002 **Parent Account**; S-ACCT-003 **Opening Balance (₹)**.

**Results:** The account appears in the tree and in every account picker. Delete removes it.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error on delete | The account has voucher entries ("Cannot delete account with existing voucher entries") or sub-accounts ("Cannot delete account with sub-accounts") | Delete those first |

**Limitations:** Opening balances can't be negative; a credit opening on an asset account (or the reverse) can't be entered. If you close **Add Account** without saving, what you typed is kept for the next time it opens.

**How it works:** `POST /api/accounting/accounts`, `DELETE /api/accounting/accounts/:id`.

**Related features:** F-ACCT-002.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function ChartOfAccountsTab@@, @@W/pages/accounting/AccountingPage.tsx#Delete account "${name}"?@@, @@A/schemas/accounting.schema.ts#export const createAccountSchema@@, @@A/services/accounting/accounting.service.ts#export async function createAccount@@, @@A/services/accounting/accounting.service.ts#Cannot delete account with existing voucher entries@@, @@A/services/accounting/accounting.service.ts#Cannot delete account with sub-accounts@@

### Vouchers list <!-- F-ACCT-004 -->
**What it does:** Lists vouchers newest first, 50 per page: **Date**, **Voucher No.**, **Type** (JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES, with "auto" for generated ones), **Narration**, **Amount** (sum of its lines), **Entries** count, and view / download / delete buttons. A type filter narrows the list.

**Why it exists:** The day book of all postings. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Vouchers**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Pick a type in the filter (**All types** by default).
2. Page with **Previous** / **Next** when there are more than 50.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Type filter (**All types**, JOURNAL…SALES) | Select | Filters; back to page 1 | — |
| **Previous** / **Next** | Buttons | Page | Shown with more than 50; disabled at the ends |
| Eye ("View receipt") / Download ("Download receipt (PDF)") / Bin ("Delete voucher") | Buttons | F-ACCT-008 / F-ACCT-006 | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-ACCT-005 **Voucher type filter** (not saved).

**Results:** None.

**Errors and troubleshooting:** "No vouchers yet — create one above."

**Limitations:** Vouchers can't be opened or edited in the app.

**How it works:** `GET /api/accounting/vouchers?type=&page=&limit=50` (limit up to 200), ordered by date.

**Related features:** F-ACCT-005 to F-ACCT-008.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function VouchersTab@@, @@W/pages/accounting/AccountingPage.tsx#No vouchers yet — create one above.@@, @@A/services/accounting/accounting.service.ts#export async function listVouchers@@

### New voucher <!-- F-ACCT-005 -->
**What it does:** **New Voucher** records a voucher with type, number (suggested automatically), date, narration and one or more lines, each a debit account, a credit account, an amount and an optional narration, with a running **Total**.

**Why it exists:** To post entries the automatic generation doesn't cover. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Vouchers → New Voucher**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **New Voucher**. Type **JOURNAL**, today's date and a suggested number (for example "JO0001") fill in.
2. Change **Type** if needed; the suggested number follows the type's two-letter prefix.
3. For each line pick **Debit Account** and **Credit Account** and type **Amount (₹)**; click **Add row** for more lines, the bin (aria "Remove row") to drop one.
4. Click **Save Voucher**. The toast "Voucher created" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add row** | Button | Adds a line | — |
| Bin (aria "Remove row") | Button | Removes a line | Hidden with one line |
| **Save Voucher** | Button | Saves; "Saving…" | Disabled until every line has both accounts and an amount, and while saving |
| **Cancel** | Button | Closes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Type** | Select (6) | Yes | — | JOURNAL | — |
| **Voucher No.** | Text | Yes | 1–50; unique per type | Suggested | Server: "Voucher number <no> already exists for type <type>" (shown as a generic error) |
| **Date** | Date | Yes | YYYY-MM-DD | Today | — |
| **Narration** | Text | No | Up to 500 | Empty | — |
| **Debit Account** / **Credit Account** | Select | Yes | Your accounts | "Select…" | Server: "One or more account IDs not found" |
| **Amount (₹)** | Number | Yes | Positive decimal | Empty | — |

**Settings and toggles here:** S-ACCT-004 **Voucher type**.

**Results:** The voucher is saved and appears in the list, ledger and statements.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error when saving a second voucher | The suggested number isn't refreshed after a save (and a typed number is kept), so it repeats (defect) | Type a new number, or reload the page |

**Limitations:** The dialog keeps the previous voucher's lines after saving. With only generated ("AUTO-…") vouchers of a type, the suggested number is built from the digits inside the generated voucher's id, giving a very long number (defect). After number 9999 the suggestion stops increasing because numbers are compared as text.

**How it works:** `GET /api/accounting/vouchers/next-no?type=` returns the type's first two letters + the last number + 1, padded to 4 digits (cached for 30 seconds in the browser). `POST /api/accounting/vouchers` checks every account is yours and the number is unused for the type. Each line is its own debit/credit pair, so a voucher always balances.

**Related features:** F-ACCT-004, F-ACCT-009.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function VoucherFormDialog@@, @@W/pages/accounting/AccountingPage.tsx#queryKey: ['voucher-next-no', type],@@, @@W/pages/accounting/AccountingPage.tsx#qc.invalidateQueries({ queryKey: ['vouchers'] });@@, @@W/pages/accounting/AccountingPage.tsx#Save Voucher@@, @@W/main.tsx#staleTime: 30_000,@@, @@A/schemas/accounting.schema.ts#export const createVoucherSchema@@, @@A/services/accounting/accounting.service.ts#export async function createVoucher@@, @@A/services/accounting/accounting.service.ts#export async function nextVoucherNo@@, @@A/services/accounting/accounting.service.ts#const num = parseInt(last.voucherNo.replace@@

### Delete a voucher <!-- F-ACCT-006 -->
**What it does:** Deletes a voucher after the confirmation "Delete this voucher?".

**Why it exists:** Removes a wrong posting. Inferred from behavior.

**Where to find it:** Bin (title "Delete voucher") on a voucher row.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click the bin and confirm. The toast "Deleted" appears.

**Controls:** Bin (title "Delete voucher").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The voucher and its lines are removed.

**Errors and troubleshooting:** Generic request error if it fails.

**Limitations:** A generated ("auto") voucher comes back the next time you open the ledger or a statement, or click **Generate from activity**, because the books are re-projected from your activity (see DOCUMENTATION_GAPS.md).

**How it works:** `DELETE /api/accounting/vouchers/:id`.

**Related features:** F-ACCT-007.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#Delete this voucher?@@, @@A/services/accounting/accounting.service.ts#export async function deleteVoucher@@, @@A/controllers/accounting.controller.ts#async function projectBeforeRead@@

### Generate vouchers from activity <!-- F-ACCT-007 -->
**What it does:** **Generate from activity** creates, updates or removes "auto" vouchers so the books match your activity: buys, SIPs and deposits (PURCHASE: investment Dr, bank Cr), dividend reinvestment and opening balances (JOURNAL), sales and redemptions (SALES, splitting short-term, long-term and intraday gains or losses), dividends and interest (RECEIPT), realised F&O profit or loss, loan disbursements and loan payments (principal, interest, processing fees), rent received and insurance premiums. The same projection runs automatically before the ledger and every statement is shown.

**Why it exists:** Button tooltip: "Auto-create vouchers from BUY/SELL transactions, dividends, rent receipts, loan EMIs and premium payments".

**Where to find it:** **Tools → Accounting → Vouchers → Generate from activity**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **Generate from activity** ("Generating…").
2. Read the toast: "Created N voucher(s) from existing activity" or "No new vouchers — every existing transaction is already projected".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Generate from activity** | Button | Runs the projection | Disabled while running |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Auto vouchers numbered `AUTO-<kind>-<id>` are created, rewritten when their source changed, and deleted when their source is gone.

**Errors and troubleshooting:** Per-voucher failures are counted and skipped.

**Limitations:** The toast reports only newly created vouchers; updates and removals are not mentioned. Investment accounts by asset class: equity/ETF → Equity Holdings; mutual funds → Mutual Fund Holdings; FD/RD → Fixed Deposits; bonds → Bonds & Debentures; gold → Gold Holdings; F&O, insurance, ULIP and cash are not booked as investments; others → Other Investments. All money moves through **Bank Accounts** (1001).

**How it works:** `POST /api/accounting/generate-from-activity`; ledger, trial balance, P&L and balance sheet requests call the same projection first and log (not show) a failure.

**Related features:** F-ACCT-004, F-ACCT-009 to F-ACCT-012, D-ACCT-001.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#Generate from activity@@, @@W/pages/accounting/AccountingPage.tsx#Created ${r.created} voucher@@, @@A/services/accounting/accounting.service.ts#export async function generateVouchersFromActivity@@, @@A/services/accounting/accounting.service.ts#function investmentAccountCode@@, @@A/services/accounting/accounting.service.ts#const ACCOUNTING_ROLE@@, @@A/controllers/accounting.controller.ts#async function projectBeforeRead@@

### Receipts <!-- F-ACCT-008 -->
**What it does:** Each voucher can be opened as a PDF receipt (**View receipt**) or downloaded (**Download receipt (PDF)**); rent, premium and loan vouchers become a "Rent Receipt", "Premium Payment Receipt" or "Loan Payment Receipt", others a plainer voucher receipt. **Receipts (ZIP)** downloads every rent, premium and loan receipt (plus RECEIPT and PAYMENT vouchers) matching the type filter as one PDF each; **Receipts (Excel)** gives the same set as one totalled spreadsheet.

**Why it exists:** Code comment: "a receipt is the document somebody actually wants — to hand a tenant, to attach to a return, to keep."

**Where to find it:** **Tools → Accounting → Vouchers** (row buttons and header buttons).

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click the eye on a row to open the receipt in a new tab, or the download arrow to save `<date>-<voucher no>.pdf`.
2. Click **Receipts (ZIP)** or **Receipts (Excel)** to download `receipts.zip` / `receipts.xlsx` for the current filter.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Eye (title "View receipt") | Button | Opens the PDF | — |
| Download (title "Download receipt (PDF)") | Button | Saves the PDF | — |
| **Receipts (ZIP)** / **Receipts (Excel)** | Buttons | Bundle download | Disabled while one is being built |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-ACCT-005 (the type filter decides the bundle).

**Results:** Files are downloaded; nothing is stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Generic request error (for example status 404) on a bundle | No receipts in the selection ("No receipts in that range.") — the page doesn't show the server text | Change the type filter |
| A new tab doesn't open | Pop-ups blocked | Allow pop-ups, or use download |

**Limitations:** A bundle holds the newest 500 receipts; when more exist only a response header says so. Bundles can't be limited by date in the app.

**How it works:** `GET /api/accounting/vouchers/:id/receipt.pdf` (`?inline=true` to view), `GET /api/accounting/receipts.zip|.xlsx?type=`; receipts are built one at a time.

**Related features:** F-ACCT-004.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#const receipt = async@@, @@W/pages/accounting/AccountingPage.tsx#Receipts (ZIP)@@, @@W/api/accounting.api.ts#async downloadReceiptBundle@@, @@A/controllers/accounting.controller.ts#export async function getReceiptsZip@@, @@A/services/receipts/receiptBundle.ts#const MAX_RECEIPTS = 500;@@, @@A/services/receipts/receiptData.ts#title: 'Rent Receipt',@@

### Ledger <!-- F-ACCT-009 -->
**What it does:** Shows one account's postings in a date range: **Opening** and **Closing** balances and a table of **Date**, **Voucher**, **Narration**, **Debit**, **Credit** and running **Balance**.

**Why it exists:** To check an account's movement. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Ledger**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Pick an **Account** ("Select an account to view its ledger." until you do).
2. Optionally set **From** and **To**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Account** | Select | Chooses the account | — |
| **From** / **To** | Dates | Range | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (the books are re-projected first — F-ACCT-007).

**Errors and troubleshooting:** "No entries in this period."

**Limitations:** None beyond F-ACCT-007.

**How it works:** `GET /api/accounting/ledger/:accountId?from=&to=`. Opening = the account's opening balance + every posting before **From**. Balances are on the account's normal side: debits raise assets and expenses, credits raise liabilities, equity and income.

**Related features:** F-ACCT-007, F-ACCT-010.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function LedgerTab@@, @@W/pages/accounting/AccountingPage.tsx#Select an account to view its ledger.@@, @@A/services/accounting/accounting.service.ts#export async function getAccountLedger@@, @@A/services/accounting/accounting.service.ts#const signedMovement@@

### Trial Balance <!-- F-ACCT-010 -->
**What it does:** Lists every account grouped as **Assets**, **Liabilities**, **Equity**, **Income**, **Expenses** with **Code**, **Account**, **Opening** (wide screens), **Debit**, **Credit** and **Balance**, and a **Total** row, as of a date.

**Why it exists:** Standard check that the books balance. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Reports → Trial Balance**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Optionally set **As of date** (blank = everything to date).

**Controls:** **As of date** (date).

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** None specific.

**Limitations:** The **Total** row's **Balance** is total debits − total credits, which ignores opening balances.

**How it works:** `GET /api/accounting/reports/trial-balance?asOf=`; vouchers on or before the date; closing = opening + movement on the normal side.

**Related features:** F-ACCT-011, F-ACCT-012.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function TrialBalanceReport@@, @@A/services/accounting/accounting.service.ts#export async function getTrialBalance@@

### P&L Statement <!-- F-ACCT-011 -->
**What it does:** Shows **Income** and **Expenses** accounts with their movement in a period, **Total Income**, **Total Expenses** and **Net Profit** or **Net Loss**. The period defaults to the current Indian financial year (April–March).

**Why it exists:** Standard profit and loss for the period. Inferred from behavior.

**Where to find it:** **Tools → Accounting → Reports → P&L Statement**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Adjust **From** and **To** if needed.

**Controls:** **From**, **To** (dates).

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** "No income recorded" / "No expenses recorded" when empty.

**Limitations:** None known.

**How it works:** `GET /api/accounting/reports/pnl?from=&to=`; each account's balance at **To** minus its balance before **From**.

**Related features:** F-ACCT-010.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function PnLReport@@, @@A/services/accounting/accounting.service.ts#export async function getPnL@@

### Balance Sheet <!-- F-ACCT-012 -->
**What it does:** Shows **Assets** and **Liabilities & Equity** (including **Retained Earnings** = income − expenses to date) with totals, as of a date. When opening balances don't net to zero, a **Difference in Opening Balances** line is added to the short side so the totals agree.

**Why it exists:** Code comment: shown "as Tally does" instead of leaving totals unequal.

**Where to find it:** **Tools → Accounting → Reports → Balance Sheet**.

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Optionally set **As of date**.

**Controls:** **As of date**.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None (re-projection first).

**Errors and troubleshooting:** None specific.

**Limitations:** None known.

**How it works:** `GET /api/accounting/reports/balance-sheet?asOf=`; difference = debit-side openings − credit-side openings.

**Related features:** F-ACCT-010.

**Sources:** @@W/pages/accounting/AccountingPage.tsx#function BalanceSheetReport@@, @@W/pages/accounting/AccountingPage.tsx#Difference in Opening Balances@@, @@A/services/accounting/accounting.service.ts#export async function getBalanceSheet@@

### Export to Tally <!-- F-ACCT-013 -->
**What it does:** Downloads your books as one ZIP for TallyPrime: "1 - Masters.xml" (groups and ledgers with opening balances), one "Transactions FY<year>.xml" per financial year, "Holdings at end of FY<year>.xlsx" per year, and "README - How to import into Tally.txt".

**Why it exists:** Code comment: "the user's books as one ZIP ready for TallyPrime".

**Where to find it:** **Tools → Accounting**, header **Export to Tally** (also on Reports — D-ACCT-002).

**Who can use it:** R-PRO; R-MANAGER per the manager's plan.

**Steps**
1. Click **Export to Tally** ("Preparing…").
2. The ZIP downloads with the toast "Tally export downloaded. The README inside has the import steps."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Export to Tally** | Button | Builds and downloads the ZIP | Hidden below Pro/Advisor; disabled while preparing |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A ZIP named after the account ("…-tally-export.zip") is downloaded.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "The Tally export was stopped because Tally would reject part of it (N problems): …" | Your data breaks a Tally rule; no partial file is produced | Fix the listed records and try again |
| "Export failed (HTTP <status>)" | Other server failure | Try again |

**Limitations:** The export is built from your transactions, bank accounts, cash flows, loans, cards, rent and premiums directly — manual vouchers and your chart of accounts on this page are not included.

**How it works:** `GET /api/reports/download/tally-export` (Pro/Advisor-gated) builds the Tally book from source records and refuses to produce a file that would break a Tally rule.

**Related features:** D-ACCT-002.

**Sources:** @@W/components/tally/TallyExportButton.tsx#export function TallyExportButton@@, @@W/components/tally/TallyExportButton.tsx#Tally export downloaded.@@, @@W/api/tallyExport.api.ts#export async function downloadTallyExport@@, @@A/services/accounting/tally/tallyZip.service.ts#export async function buildTallyZip@@, @@A/services/accounting/tally/tallyPackage.ts#The Tally export was stopped because Tally would reject part of it@@, @@A/services/accounting/tally/tallySources.ts#prisma.cashFlow.findMany({@@, @@A/routes/reports.routes.ts#reportsRouter.get('/download/tally-export'@@

### What this area doesn't do

- You can't edit an account or a voucher, or open a voucher's detail, on this page.
- There is no bank reconciliation, GST or inventory here.
- Manual vouchers don't go into the Tally export.
