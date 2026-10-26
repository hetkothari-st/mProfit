---
id: F-RENT-010
title: "Bank-credit auto-match"
module: "Rental"
status: Live
roles: "System; user undoes"
settings: []
related: [F-RENT-007, F-RENT-008]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Bank-credit auto-match

`F-RENT-010` · Live · Roles: System; user undoes

**What it does:** When an imported UPI or NEFT credit (from bank alerts) is turned into a cash inflow, the app looks for a matching rent month and, if exactly one fits, records it as a payment marked "auto-matched". **Undo** removes the match.

**Why it exists:** Code comment §8.2: mark rent received automatically from bank credits.

**Where to find it:** Automatic; matched months show "auto-matched" and **Undo** on the rental property page.

**Who can use it:** Users whose bank alerts are imported ([D-RENT-003](../dependencies.md#d-rent-003)).

**Steps**
1. Nothing to do; matched months turn Received/Partial.
2. If the match is wrong, click **Undo** (title "Undo auto-match") on that month.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Undo** | Button | Undo auto-match | Only on auto-matched rows |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** A PAYMENT entry "Auto-matched from bank credit" linked to the bank credit; the receipt shows "auto-matched".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A rent credit was not matched | No single month fits (amount, date or name) | Use **Received** manually |

**Limitations:** Match rules: amount within ±₹10 of the expected rent, due date within ±5 days of the credit date, and (when the credit names a sender) name similarity ≥ 0.5 with the tenant name; month must be Expected or Overdue; two or more candidates → no match. Undo also deletes the bank credit's own cash-flow entry (see DOCUMENTATION_GAPS [F-RENT-010](F-RENT-010.md)). An undone credit is not matched again automatically.

**How it works:** Called from the import projection after an inbound UPI_CREDIT/NEFT_CREDIT cash flow is created; failures are logged and never block the import. `POST /api/rental/receipts/:id/undo-auto-match` deletes ledger entries for that month carrying an event id and their cash flows, then recomputes.

**Related features:** [F-RENT-008](F-RENT-008.md), [F-RENT-007](F-RENT-007.md), [D-RENT-003](../dependencies.md#d-rent-003).

**Sources:** `packages/api/src/ingestion/projection.ts:312`, `packages/api/src/services/rental/rental.service.ts:975`, `packages/api/src/services/rental/rental.service.ts:1033`, `packages/api/src/services/rental/rental.service.ts:1093`, `packages/api/src/services/rental/rental.service.ts:1186`, `apps/web/src/pages/rental/RentalDetailPage.tsx:335`
