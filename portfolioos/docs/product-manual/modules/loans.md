[Index](../INDEX.md)

# Loans

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Loans** page (sidebar **Asset Classes → Loans**, route `/loans`) keeps both sides of borrowing in one place: **Loans taken** (home, car, personal and other loans you are repaying to a lender) and **Loans given** (money you lent to a friend, relative, colleague or business). For a loan taken, EveryPaisa computes the full amortization schedule from the loan's terms and the payments you record, so the outstanding balance, next EMI, interest paid, tax benefit and a market comparison are always derived, never typed in. For a loan given, it keeps a ledger of repayments, interest, top-ups and amounts forgiven, and derives what is still owed from it. Reminders for upcoming and missed EMIs, repayments due back to you, refinancing opportunities and benchmark-rate changes appear in **Alerts**.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-LOAN-001](../features/F-LOAN-001.md) | Loans page overview and section switcher | Live | Shows two summary panels at the top of the Loans page — You owe · loans taken and Owed to you · loans given — and a sticky Taken / Given … |
| [F-LOAN-002](../features/F-LOAN-002.md) | Loans taken list | Live | Lists every loan you have taken as an "EMI coupon" card. |
| [F-LOAN-003](../features/F-LOAN-003.md) | Add or edit a loan (full form) | Live | Opens the Add loan (or Edit loan) dialog to record a loan you have taken: lender, loan type, borrower, account number, principal, rate, … |
| [F-LOAN-004](../features/F-LOAN-004.md) | Delete a loan | Live | Permanently deletes a loan taken and all its recorded payments. |
| [F-LOAN-005](../features/F-LOAN-005.md) | Loan detail: summary, progress and charts | Live | Shows one loan in depth. |
| [F-LOAN-006](../features/F-LOAN-006.md) | Edit a loan from its detail page | Live | A shorter Edit loan dialog on the loan's page for the figures that change most: lender, loan type, principal, interest rate, tenure, EMI … |
| [F-LOAN-007](../features/F-LOAN-007.md) | Record a loan payment and manage payment history | Live | Records a payment against a loan taken — EMI, Prepayment, Foreclosure or Processing fee — and lists every payment in Payment history (Date, … |
| [F-LOAN-008](../features/F-LOAN-008.md) | Amortization schedule with Mark paid and Undo | Live | The Amortization schedule table lists every EMI: #, Date, Opening, EMI, Principal, Interest, Closing, Status (Paid with date, Overdue, … |
| [F-LOAN-009](../features/F-LOAN-009.md) | Loan tax benefit panel | Live | For a loan with a Tax benefit section, shows Tax benefit — Section 80C + 24(b) (home loan) or Tax benefit — Section 80E (education loan) … |
| [F-LOAN-010](../features/F-LOAN-010.md) | Compare with market (refinance check) | Live | On an active loan, the Compare with market card shows your rate against the lowest current market rate for your loan type ("Market from X% … |
| [F-LOAN-011](../features/F-LOAN-011.md) | Linked vehicle and property on a loan | Partial | When a loan carries a link to a vehicle or a rental property, the loan page shows a Linked vehicle card ("View vehicle details →") or a … |
| [F-LOAN-012](../features/F-LOAN-012.md) | EMI due and overdue reminders | Live | Creates reminders in Alerts for each active loan taken: "<lender> EMI due in N days" 30, 15, 7 and 1 days before the next unpaid EMI, … |
| [F-LOAN-013](../features/F-LOAN-013.md) | Refinance and benchmark-change alerts | Live | Every morning, checks each active loan taken against live lender rates and benchmark rates and creates two kinds of alert. |
| [F-LOAN-016](../features/F-LOAN-016.md) | Loans given list | Live | The Loans given section lists money you have lent, one card per loan: the borrower's name, relationship and "Lent <date>", a status badge … |
| [F-LOAN-017](../features/F-LOAN-017.md) | Lend money / edit a loan given | Live | The Lend money dialog (titled Edit loan given when editing) records who you lent to, how much, when, the yearly interest rate and how it … |
| [F-LOAN-018](../features/F-LOAN-018.md) | Loan given detail page | Live | Shows one loan given: the borrower's initials, name, status badge and a line "<relationship> · <contact> · Monthly EMI / Flexible repayment … |
| [F-LOAN-019](../features/F-LOAN-019.md) | Record a repayment or other entry on a loan given | Live | Adds an entry to a loan given's ledger: Repayment received (flexible) or Lump-sum repayment (EMI), Interest received (only for loans with … |
| [F-LOAN-020](../features/F-LOAN-020.md) | EMI repayment schedule for a loan given | Live | For a loan given on Monthly EMI, the Repayment schedule card ("₹… every month · N EMIs from <date>") lists each instalment: #, Due (and … |
| [F-LOAN-021](../features/F-LOAN-021.md) | Settle, write off, reopen or delete a loan given | Live | From More actions (⋯) on a loan given: Mark settled closes it as fully settled on a date; Write off forgives the principal still owed and … |
| [F-LOAN-022](../features/F-LOAN-022.md) | Repayment-due reminders for loans given | Live | Creates reminders in Alerts for each active loan given with a next payment: "<borrower>'s repayment is due in N days" 30, 15, 7 and 1 days … |

Settings for this module: [settings/loans.md](../settings/loans.md)
