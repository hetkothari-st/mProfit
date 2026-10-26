---
id: F-LOAN-004
title: "Delete a loan"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-LOAN-002]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Delete a loan

`F-LOAN-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Permanently deletes a loan taken and all its recorded payments.

**Why it exists:** Inferred from behavior: to remove a loan added by mistake or no longer worth tracking.

**Where to find it:** **Asset Classes → Loans**, bin icon on the loan card's stub (route `/loans`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click the bin icon on the loan's card. The card is replaced by "Delete "<lender>" loan?" (for a closed loan, "Delete "<lender>"?") with **Yes** and **No**.
2. Click **Yes**. The toast "Loan deleted" appears and the card disappears. Click **No** to keep it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Bin (aria "Delete loan") | Icon button | Shows the confirmation | Never |
| **Yes** | Button | Deletes | Disabled (spinner) while deleting |
| **No** | Button | Cancels | Never |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The loan and all its payments are removed (payments are deleted with the loan). A real-estate property that pointed at this loan keeps no link. Alerts already created for the loan stay in **Alerts**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Failed to delete loan" | Network error or the loan no longer exists | Reload the list |

**Limitations:** There is no undo. Deletion is only available from the list page, not from the loan's detail page.

**How it works:** `DELETE /api/loans/:id`; the server checks the loan belongs to you, then deletes it. `LoanPayment` rows cascade. Linking columns elsewhere that point at the loan are optional and are cleared by the database's default for optional relations.

**Related features:** [F-LOAN-002](F-LOAN-002.md).

**Sources:** `apps/web/src/pages/loans/LoanListPage.tsx:638`, `apps/web/src/pages/loans/LoanListPage.tsx:795`, `packages/api/src/services/loans/loans.service.ts:802`, `packages/api/prisma/schema.prisma:3103`
