[Index](../INDEX.md)

# Set up books and read statements

`W-ACCT-001` · Accounting

**Goal:** Get a trial balance, P&L and balance sheet from your data.
**Who:** [R-PRO](../roles.md#r-pro) ([R-MANAGER](../roles.md#r-manager) per the manager's plan).
**Before you start:** Have transactions, loans, rent or premiums recorded.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Accounting** | Creates the default chart of 36 accounts on first open |
| 2 | Go to **Vouchers**, click **Generate from activity** | Toast "Created N vouchers from existing activity" |
| 3 | Add any manual vouchers with **New Voucher** | Toast "Voucher created" |
| 4 | Open **Reports → Trial Balance / P&L Statement / Balance Sheet** | Books are re-projected, then shown |

**Success:** Statements show; download receipts with **Receipts (ZIP)** or **Receipts (Excel)**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Request failed with status code 400" on a second voucher | Repeated suggested number (defect) | Type a new number or reload |
| A deleted auto voucher reappears | Books are re-projected from activity | Change or delete the source record instead |
