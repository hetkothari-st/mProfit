---
id: F-RENT-009
title: "Skip a month and undo actions"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-008, F-RENT-012]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Skip a month and undo actions

`F-RENT-009` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** **Skip** marks a month as not owed (e.g. rent-free month). **Undo** reverses a skip, or removes the payments recorded for a month via **Received**.

**Why it exists:** Inferred from behavior: correct the schedule and fix mistaken entries.

**Where to find it:** Rental property page → tenancy table row actions.

**Who can use it:** All plans.

**Steps**
1. On an Expected or Overdue month click **Skip**. The row becomes Skipped.
2. On a Skipped month click **Undo** (title "Undo skip").
3. On a Received or Partial month that was not auto-matched click **Undo** (title "Undo mark-received (also deletes cashflow)").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Skip** | Button | Skip month | Only Expected/Overdue |
| **Undo** (skip) | Button | Unskip | Only Skipped |
| **Undo** (received) | Button | Remove payments pinned to this month | Only Received/Partial without auto-match |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Skip removes the month's rent from the amount owed and supersedes its pending reminders. Undo-received deletes every payment pinned to that month and their cash inflows, then re-derives statuses.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| (no message shown) Skip does nothing | "Cannot skip a receipt with payments against it — remove the payment from the khata first" | Remove the payment first |
| (no message shown) Undo does nothing | "No payment is pinned to this month — remove the payment from the khata instead" | Delete the entry in the khata ([F-RENT-012](F-RENT-012.md)) |

**Limitations:** These buttons show no success or error toast; a refused action simply leaves the row unchanged. A payment that reached a month only by spill-over from another payment cannot be undone here.

**How it works:** `POST /api/rental/receipts/:id/skip`, `/unskip`, `/unmark-received`; each recomputes the tenancy ledger.

**Related features:** [F-RENT-008](F-RENT-008.md), [F-RENT-012](F-RENT-012.md).

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:231`, `apps/web/src/pages/rental/RentalDetailPage.tsx:310`, `packages/api/src/services/rental/rental.service.ts:781`, `packages/api/src/services/rental/rental.service.ts:803`, `packages/api/src/services/rental/rental.service.ts:822`
