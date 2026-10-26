[Index](../INDEX.md)

# Review and approve email events

`W-INGEST-002` · Email ingestion

**Goal:** Decide which parsed events become records.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** [W-INGEST-001](W-INGEST-001.md) done.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Inbox → Connect your Gmail**, step 3 | Lists waiting events by sender |
| 2 | Click a row to check details, or **View original in Gmail** | Shows amount, type, counterparty, confidence, notes |
| 3 | Click **Approve & commit** (or the tick) | "Event approved and committed"; a transaction or cash-flow entry is created |
| 4 | Or type a **Rejection reason (optional)** and click **Reject** | "Event rejected" |
| 5 | For a trusted sender with several events, click **Approve all** | "Bulk approved: <a> succeeded, <f> failed of <n>" |
| 6 | When the banner offers it, click **Enable auto-commit** | Future confident events skip review |

**Success:** The queue shows "Inbox is clear".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Approval rolled back — projection failed: …" | Missing amount/quantity or no portfolio | Reject and enter by hand, or create a portfolio |
| Approved SIP/FD/rent event created nothing | Those types are only marked handled | Enter the record by hand |
