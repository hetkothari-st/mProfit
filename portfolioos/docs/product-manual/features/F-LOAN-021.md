---
id: F-LOAN-021
title: "Settle, write off, reopen or delete a loan given"
module: "Loans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-LOAN-018, F-LOAN-019]
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Settle, write off, reopen or delete a loan given

`F-LOAN-021` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** From **More actions** (⋯) on a loan given: **Mark settled** closes it as fully settled on a date; **Write off** forgives the principal still owed and closes it; **Reopen** returns a closed loan to Active; **Delete loan** removes it and its whole history.

**Why it exists:** The dialogs explain: settling "Closes the loan. Record any final repayment first so the history is complete."; writing off "Forgives the ₹… still owed and closes the loan. You can reopen it later."; deleting "Deletes the loan and its whole history. This cannot be undone."

**Where to find it:** Loan given page → **More actions** (⋯) (route `/loans/given/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click **More actions** (⋯), then **Mark settled**, **Write off**, **Reopen** or **Delete loan**.
2. For settle and write-off, confirm or change **Date** (today by default) in **Mark as settled?** / **Write off this loan?**, then click **Mark settled** / **Write off**.
3. For delete, click **Delete** in **Delete this loan?**. You return to the given section with "Loan deleted".
4. **Reopen** acts immediately ("Reopened").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Mark settled** | Menu item → dialog button | Closes as settled | Menu item only for Active loans |
| **Write off** | Menu item → dialog button | Forgives what is owed and closes | Only for Active loans |
| **Reopen** | Menu item | Back to Active | Only for closed loans |
| **Delete loan** / **Delete** | Menu item → dialog button | Deletes everything | Always |
| **Cancel** | Button | Closes the dialog | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Date** | Date (settle, write-off) | Yes | YYYY-MM-DD | Today | Toast with the server message, or "Something went wrong" |

**Settings and toggles here:** None.

**Results:** Settled → status **Settled**, closed on the date; the loan stops counting as owed to you and stops accruing interest. Write off → a forgiveness entry for the principal still owed (note "Written off" unless given) plus status **Written off**. Reopen → status Active, closing date cleared; a write-off's forgiveness entry stays until you remove it. Delete → the loan and its entries are removed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Something went wrong" or the server's message | Server error | Retry |

**Limitations:** **Mark settled** does not check that the balance is 0 and adds no entry; a settled flexible loan may still show money owed on its card. Write-off forgives principal only; interest due on a flexible loan is not separately written off.

**How it works:** `POST /api/loans-given/:id/settle` and `/write-off` take `{ date, notes? }`; write-off computes the outstanding principal and, in one transaction, creates the WAIVER entry and sets status WRITTEN_OFF. `POST /api/loans-given/:id/reopen`; `DELETE /api/loans-given/:id` (entries cascade). Only active loans are counted by the dashboard, the will estate and reminders.

**Related features:** [F-LOAN-018](F-LOAN-018.md), [F-LOAN-019](F-LOAN-019.md).

**Sources:** `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:264`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:394`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:698`, `apps/web/src/pages/loans/given/LoanGivenDetailPage.tsx:712`, `packages/api/src/controllers/loansGiven.controller.ts:55`, `packages/api/src/services/loans/loansGiven.service.ts:630`, `packages/api/src/services/loans/loansGiven.service.ts:640`, `packages/api/src/services/loans/loansGiven.service.ts:664`, `packages/api/src/services/loans/loansGiven.service.ts:678`
