[Index](../INDEX.md)

# Post Office

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Post Office Schemes** page (sidebar **Post Office**, an optional class) groups all eight India Post schemes — NSC, KVP, SCSS, SSY, MIS, RD, Time Deposit and Savings — with interest-accrual values and a detail page per account.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-PO-001](../features/F-PO-001.md) | Post Office schemes overview | Live | Shows Invested ("N account(s)"), Current value ("across all schemes"), Unrealised P&L ("interest accrual") and one row per scheme in a … |
| [F-PO-002](../features/F-PO-002.md) | Add, edit and delete a Post Office entry | Live | The "Add Post Office Entry" / "Edit Post Office Entry" dialog records a purchase, deposit, interest, withdrawal, maturity or opening … |
| [F-PO-003](../features/F-PO-003.md) | Post Office account detail page | Live | A page per PO account: header (scheme label, "№ <6 characters>", name, full scheme name, term, portfolio, rate "per annum"), Term progress … |
| [F-PO-004](../features/F-PO-004.md) | Post Office installment schedule | Live | For PO RD (monthly) and SSY (yearly), a Monthly installment schedule / Annual deposit schedule card lists each installment with due date, … |
| [F-PO-005](../features/F-PO-005.md) | Post Office transaction log | Live | A Transaction log lists the account's entries newest first with edit/delete, plus, for SCSS and MIS, computed interest payout rows for each … |
| [F-PO-006](../features/F-PO-006.md) | Post Office maturity alerts | Live | Daily, the server adds a bell alert "<Scheme> matures in N days" ("<name> matures on <date>") at 30, 15, 7 and 1 days before the maturity … |

### What this area doesn't do
- No India Post statement import; rates are not fetched live.
- No interest-on-savings computation for Post Office Savings.
