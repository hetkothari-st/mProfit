[Index](../INDEX.md)

# FDs & RDs

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Fixed & Recurring Deposits** page (sidebar **FDs & RDs**) shows each bank deposit as a receipt-style card with what it becomes at maturity, reminders for maturities and RD installments, and a detail page per deposit with growth charts.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-FD-001](../features/F-FD-001.md) | Deposits overview cards | Live | Shows Total Invested (with "N deposit(s)"), Current Value ("live valuation") and Total Earnings ("realised + unrealised", with %), then a … |
| [F-FD-002](../features/F-FD-002.md) | "Coming up" deposit reminders panel | Live | Above the cards, a Coming up list shows every deposit maturing within 30 days ("Matures in N days" / "Matures today") and, for RDs, the … |
| [F-FD-003](../features/F-FD-003.md) | Add, edit and delete an FD or RD entry | Live | The "Add Fixed Deposit" / "Add Recurring Deposit" dialog (edit: "Edit Fixed Deposit Entry" / "Edit Recurring Deposit Entry") records a … |
| [F-FD-004](../features/F-FD-004.md) | Deposit detail page | Live | One deposit's page: a header with the bank name, "Fixed Deposit"/"Recurring Deposit" and "№ <6 characters>", term, payout and portfolio, … |
| [F-FD-005](../features/F-FD-005.md) | RD installment schedule | Live | For a recurring deposit, an Installment schedule card ("<paid> / <total> paid") lists every month: #, Due date, Installment, Cumulative … |
| [F-FD-006](../features/F-FD-006.md) | Deposit payment log | Live | A Payment log ("N records") lists the deposit's entries newest first (Date, Type, Amount, Notes) with edit/delete (shown on hover) and, for … |
| [F-FD-007](../features/F-FD-007.md) | Deposit maturity and installment alerts | Live | Every day the server adds alerts to the bell: "<Bank> FD/RD matures in N days" at 30, 15, 7 and 1 days before maturity (with "₹<principal> … |

### What this area doesn't do
- No bank-statement auto-import of FDs on this page; no TDS or tax on interest.
- No premature-withdrawal penalty calculation.
- No partial withdrawal: any withdrawal removes a whole deposit entry.
