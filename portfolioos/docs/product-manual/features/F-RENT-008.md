---
id: F-RENT-008
title: "Mark rent received"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: [S-RENT-002]
related: [F-RENT-009, F-RENT-012, F-RENT-013]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Mark rent received

`F-RENT-008` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Records a rent payment against a month: adds a payment to the khata, creates a cash inflow, and updates the month's status (Received or Partial).

**Why it exists:** Inferred from behavior: record money the tenant paid.

**Where to find it:** Rental property page → tenancy table → **Received** on an Expected or Overdue month (dialog "Mark as received — YYYY-MM").

**Who can use it:** All plans.

**Steps**
1. Click **Received**. **Amount received (₹)** is pre-filled with the expected rent; **Date received** with today.
2. Adjust and optionally add **Notes (optional)**. Click **Mark received**.
3. If the same amount for the same month on the same day already exists, the dialog shows "This rent is already on the khata" with the server message; click **Record it anyway** only for a genuine second payment.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | — |
| **Mark received** | Button | Save | While saving |
| **Record it anyway** | Button | Save despite duplicate | Shown only after the duplicate warning |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Amount received (₹) | Text | Yes | Decimal > 0 | Expected rent | "receivedAmount must be positive" / "Could not record the payment" |
| Date received | Date | Yes | YYYY-MM-DD | Today | — |
| Notes (optional) | Text | No | ≤2000 | — | — |

**Settings and toggles here:** [S-RENT-002](../settings/rental.md#s-rent-002) — when the tenancy has **Rent credited to** set, the inflow carries that bank account.

**Results:** A PAYMENT khata entry pinned to that month; a cash inflow "Rent received — <property> / <tenant> (<month>)" in the property's portfolio (or your default/first portfolio; none if you have no portfolio). Overpayment spills to the oldest unpaid month, then becomes an advance. Pending reminders for a now-settled month are superseded and its overdue alert removed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "A rent payment of N for YYYY-MM is already recorded on YYYY-MM-DD. Record it again only if a second payment really came in that day." | Duplicate guard | **Record it anyway** or **Cancel** |

**Limitations:** Partial payments are recorded by entering a smaller amount; each call adds a new payment.

**How it works:** `POST /api/rental/receipts/:id/mark-received` (duplicate check → 409 DUPLICATE_RENT_PAYMENT unless allowDuplicate) then, in one transaction: cash flow, ledger entry, optional receipt note, ledger recompute (locks the tenancy row to serialise concurrent recomputes).

**Related features:** [F-RENT-009](F-RENT-009.md), [F-RENT-012](F-RENT-012.md), [F-RENT-013](F-RENT-013.md), [D-RENT-002](../dependencies.md#d-rent-002).

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:102`, `apps/web/src/pages/rental/RentalDetailPage.tsx:169`, `packages/api/src/services/rental/rental.service.ts:702`, `packages/api/src/services/rental/rental.service.ts:729`, `packages/api/src/services/rental/rentalLedger.service.ts:325`, `packages/api/src/services/rental/rentalLedger.service.ts:65`
