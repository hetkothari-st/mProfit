---
id: F-RENT-011
title: "Property expenses"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-005]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Property expenses

`F-RENT-011` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Records costs of a rental property (Property Tax, Maintenance, Repairs, Utilities, Agent Fee, Legal, Other) and lists them (Date, Type, Description, Amount) for the P&L.

**Why it exists:** Inferred from behavior: net rental income = rent − expenses.

**Where to find it:** Rental property page → **Add expense**; **Expenses** section.

**Who can use it:** All plans.

**Steps**
1. Click **Add expense** (dialog "Add expense"). Choose **Type**, enter **Amount (₹)**, **Date** (default today), **Description**.
2. Click **Add expense**. It appears in the list and the P&L.
3. To remove, hover the row and click the trash icon (no confirmation).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add expense** | Button | Save ("Saving…") | While saving |
| **Cancel** | Button | Close | — |
| Trash icon | Button | Deletes immediately | Visible on hover |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Type | Select | Yes | One of the seven types | Maintenance | — |
| Amount (₹) | Text | Yes | Decimal > 0 | Empty | raw request error ("amount must be positive" on server) |
| Date | Date | Yes | YYYY-MM-DD | Today | — |
| Description | Text | No | ≤2000 | — | — |

**Settings and toggles here:** None.

**Results:** Expense saved; FY P&L updates. Expenses do not create cash-flow entries.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Request failed with status code 422" | Empty or invalid amount | Enter a positive number |

**Limitations:** Expenses cannot be edited, only deleted and re-added; delete has no confirmation and no undo.

**How it works:** `POST /api/rental/properties/:id/expenses`, `DELETE /api/rental/expenses/:id` (ownership checked through the property).

**Related features:** [F-RENT-005](F-RENT-005.md).

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:802`, `apps/web/src/pages/rental/RentalDetailPage.tsx:821`, `apps/web/src/pages/rental/RentalDetailPage.tsx:1137`, `packages/api/src/services/rental/rental.service.ts:871`, `packages/api/src/services/rental/rental.service.ts:897`
