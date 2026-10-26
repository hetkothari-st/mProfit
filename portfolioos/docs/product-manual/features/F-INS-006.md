---
id: F-INS-006
title: "Coming up and recording a premium payment"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-007, F-INS-022]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Coming up and recording a premium payment

`F-INS-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Coming up** panel lists active policies with a premium due within 30 days or overdue, most at risk first, each with what to do and a **Record payment** button. With nothing urgent it says "Nothing due in the next 30 days." and names the next premium. **Record payment** opens **Record premium payment**, prefilled with today's date, the policy's premium and the period of the premium that is next due.

**Why it exists:** Shows "Premiums due within 30 days, and anything overdue" — the same list the daily reminders are drawn from (code comment).

**Where to find it:** **Asset Classes → Insurance**, **Coming up** panel; also the banner **Record payment** on a policy page when a premium is urgent.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Read each row: insurer and plan, a status line (for example "Due in 12 days", "Premium due today", "Overdue — 5 days of grace left", "May have lapsed", "Cover has ended") and a sentence of what to do.
2. Click **Record payment**. **Record premium payment** opens prefilled.
3. Check **Paid on**, **Amount (₹)**, **Covers from** and **Until**; click **Record payment**. The toast "Premium recorded" appears and the row leaves the panel once the premium is covered.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Policy name link | Link | Opens the policy page | Never |
| **Record payment** | Button | Opens **Record premium payment** | Never |
| **Cancel** | Button | Closes the dialog | Never |
| **Record payment** (dialog) | Button | Saves; "Saving…" | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Paid on** | Date | Yes | — | Today | "Required" (not displayed under the field; the dialog just doesn't save) |
| **Amount (₹)** | Text | Yes | Digits with optional decimals | The policy's premium | "Enter the amount paid, like 25000" |
| **Covers from** | Date | Yes | — | The due date of the next premium | "Required" (not displayed) |
| **Until** | Date | Yes | Not before **Covers from** | **Covers from** + one premium period | "Ends before it starts" |

**Settings and toggles here:** None.

**Results:** A premium payment is saved and the policy's next due date moves to the next unpaid premium. Reminders already sent for the paid premium are not repeated.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not record the payment" | Server error | Try again |
| The premium still shows as due after recording | The payment's **Covers from** month differs from the due date's month, so it was not matched to that premium | Record it with **Covers from** in the due month, or use **Mark paid** in the schedule ([F-INS-007](F-INS-007.md)) |

**Limitations:** Only active policies appear. The "Required" errors for **Paid on** and the period dates are set but not shown under those fields.

**How it works:** States come from the shared premium rules: **Due soon** within 30 days (red at 7 days or fewer), **In grace** after the due date until the grace period ends, **Lapse risk** after that (or immediately for a policy with no grace). Sorting: lapse risk, in grace, due soon, then by due date. Saving calls `POST /api/insurance/policies/:id/premiums`; the server stores the payment and recomputes `nextPremiumDue` in the same transaction.

**Related features:** [F-INS-007](F-INS-007.md), [F-INS-022](F-INS-022.md).

**Sources:** `apps/web/src/components/insurance/ComingUpPanel.tsx:16`, `apps/web/src/components/insurance/ComingUpPanel.tsx:34`, `apps/web/src/lib/insurance.ts:134`, `apps/web/src/lib/insurance.ts:196`, `apps/web/src/components/insurance/RecordPremiumDialog.tsx:53`, `packages/shared/src/insurance/premiumSchedule.ts:26`, `packages/api/src/services/insurance/insurance.service.ts:725`
