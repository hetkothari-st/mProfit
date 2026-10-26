[Index](../INDEX.md)

# Accounting

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Accounting** page (sidebar **Tools → Accounting**, route `/accounting`) is double-entry bookkeeping over your EveryPaisa data: a chart of accounts, vouchers (entered by hand or generated from your transactions, loans, rent and premiums), an account ledger, and three statements — **Trial Balance**, **P&L Statement** and **Balance Sheet** — plus printable receipts and a one-click **Export to Tally**. The whole module needs the **Pro/Advisor** plan.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ACCT-001](../features/F-ACCT-001.md) | Accounting page and plan lock | Live | Shows four tabs — Chart of Accounts, Vouchers, Ledger, Reports — under the header "Double-entry bookkeeping — chart of accounts, vouchers, … |
| [F-ACCT-002](../features/F-ACCT-002.md) | Chart of accounts | Live | Shows your accounts as a tree with Code, Name, Type (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE) and Opening Balance. |
| [F-ACCT-003](../features/F-ACCT-003.md) | Add or delete an account | Live | Add Account creates an account with code, type, name, parent and opening balance. |
| [F-ACCT-004](../features/F-ACCT-004.md) | Vouchers list | Live | Lists vouchers newest first, 50 per page: Date, Voucher No., Type (JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES, with "auto" for … |
| [F-ACCT-005](../features/F-ACCT-005.md) | New voucher | Live | New Voucher records a voucher with type, number (suggested automatically), date, narration and one or more lines, each a debit account, a … |
| [F-ACCT-006](../features/F-ACCT-006.md) | Delete a voucher | Live | Deletes a voucher after the confirmation "Delete this voucher?". |
| [F-ACCT-007](../features/F-ACCT-007.md) | Generate vouchers from activity | Live | Generate from activity creates, updates or removes "auto" vouchers so the books match your activity: buys, SIPs and deposits (PURCHASE: … |
| [F-ACCT-008](../features/F-ACCT-008.md) | Receipts | Live | Each voucher can be opened as a PDF receipt (View receipt) or downloaded (Download receipt (PDF)); rent, premium and loan vouchers become a … |
| [F-ACCT-009](../features/F-ACCT-009.md) | Ledger | Live | Shows one account's postings in a date range: Opening and Closing balances and a table of Date, Voucher, Narration, Debit, Credit and … |
| [F-ACCT-010](../features/F-ACCT-010.md) | Trial Balance | Live | Lists every account grouped as Assets, Liabilities, Equity, Income, Expenses with Code, Account, Opening (wide screens), Debit, Credit and … |
| [F-ACCT-011](../features/F-ACCT-011.md) | P&L Statement | Live | Shows Income and Expenses accounts with their movement in a period, Total Income, Total Expenses and Net Profit or Net Loss. |
| [F-ACCT-012](../features/F-ACCT-012.md) | Balance Sheet | Live | Shows Assets and Liabilities & Equity (including Retained Earnings = income − expenses to date) with totals, as of a date. |
| [F-ACCT-013](../features/F-ACCT-013.md) | Export to Tally | Live | Downloads your books as one ZIP for TallyPrime: "1 - Masters.xml" (groups and ledgers with opening balances), one "Transactions … |

Settings for this module: [settings/accounting.md](../settings/accounting.md)

### What this area doesn't do

- You can't edit an account or a voucher, or open a voucher's detail, on this page.
- There is no bank reconciliation, GST or inventory here.
- Manual vouchers don't go into the Tally export.
