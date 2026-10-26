---
id: F-CARD-006
title: "Credit card statements: add, mark paid, delete"
module: "Credit Cards"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CARD-005, F-CARD-007]
---

[← Credit Cards](../modules/credit-cards.md) · [Index](../INDEX.md)

# Credit card statements: add, mark paid, delete

`F-CARD-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** **Statement history** lists each month's bill — **Month**, **Statement**, **Min due**, **Due date** (with "in Nd", "today" or "Nd ago" until paid), **Paid**, **Paid on**, **Status** (pending, partial, paid, overdue) — newest month first. **Add statement** records a bill; the tick (title "Mark paid") records a payment; the bin deletes a statement.

**Why it exists:** The dialog describes it: "One month's bill: what was billed, the minimum due and the due date." Statements drive the due dates, reminders and outstanding.

**Where to find it:** Card page → **Statement history** (route `/credit-cards/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **Add statement**. Fill **For month \* (YYYY-MM)**, **Statement amount (₹) \***, optional **Minimum due (₹)**, and **Due date \***. Click **Save** — "Statement added".
2. To record payment, click the tick on an unpaid row. In **Mark statement paid** ("Record what you paid against this statement, and when.") check **Paid amount (₹) \*** (pre-filled with the statement amount) and **Paid on \*** (today), then **Confirm** — "Statement marked as paid".
3. To delete, click the bin, then **Del** (or **No**) — "Statement deleted".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add statement** | Button | Opens the dialog | — |
| Tick (title "Mark paid") | Icon button | Opens **Mark statement paid** | Hidden on paid rows |
| Bin (title "Delete") | Icon button | Shows **Del** / **No** | — |
| **Save** / **Confirm** / **Cancel** / **Del** / **No** | Buttons | As labelled | **Save**/**Confirm**/**Del** disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **For month \* (YYYY-MM)** | Text | Yes | `YYYY-MM`; one statement per card per month | Empty | "Format: YYYY-MM" |
| **Statement amount (₹) \*** | Text | Yes | Plain positive number | Empty | "Required" |
| **Minimum due (₹)** | Text | No | Plain positive number | Empty | — |
| **Due date \*** | Date | Yes | YYYY-MM-DD | Empty | "Required" |
| **Paid amount (₹) \*** | Text | Yes | Plain positive number | Statement amount | "Required" |
| **Paid on \*** | Date | Yes | YYYY-MM-DD | Today | "Required" |

**Settings and toggles here:** None.

**Results:** A new statement starts as **Pending**; adding it (unless marked paid) sets the card's outstanding to its amount. Marking paid sets status **Paid** when the amount covers the statement, **Partial** when less, **Pending** when 0. Deleting removes the row only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Failed to add statement" and "Request failed with status code 409" | A statement for that month already exists on this card | Delete or pay the existing one |
| Toast "Failed to add statement" with status 422 | Amount with commas or a bad format | Use plain numbers |
| Toast "Failed to mark as paid" / "Failed to delete statement" | Server or network error | Retry |

**Limitations:** Paying or deleting a statement does not change the card's **Outstanding** (confirmed defect — see DOCUMENTATION_GAPS.md). Statements cannot be edited; a paid statement cannot be changed back. Overdue status is set only by the nightly reminder scan for **Active** cards; until then the row is tinted red by date. After changing statements here, the Credit Cards list may show old figures for up to 30 seconds.

**How it works:** `POST /api/credit-cards/:id/statements` (status defaults to PENDING; database unique on card + month), `PATCH /api/credit-cards/statements/:statementId` (paidAmount, paidOn; status derived), `DELETE /api/credit-cards/statements/:statementId`, each checking that the card is yours. When a non-paid statement is added the card's `outstandingBalance` is overwritten with that statement's amount.

**Related features:** [F-CARD-005](F-CARD-005.md), [F-CARD-007](F-CARD-007.md).

**Sources:** `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:96`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:128`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:188`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:268`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:298`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:365`, `packages/api/src/controllers/creditCards.controller.ts:43`, `packages/api/src/controllers/creditCards.controller.ts:54`, `packages/api/src/services/banking/creditCards.service.ts:285`, `packages/api/src/services/banking/creditCards.service.ts:308`, `packages/api/src/services/banking/creditCards.service.ts:318`, `packages/api/src/services/banking/creditCards.service.ts:356`, `packages/api/prisma/schema.prisma:3160`, `packages/api/src/middleware/errorHandler.ts:73`
