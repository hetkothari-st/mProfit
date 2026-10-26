---
id: F-INS-007
title: "Premium schedule"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INS-003, S-INS-004]
related: [F-INS-006, F-INS-016, F-INS-022]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Premium schedule

`F-INS-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **Premiums** card on a policy page lists every premium from the start date to the next three upcoming ones (newest first, first 12 shown), each with due date, period, amount and status **Paid <date>**, **Not recorded** (overdue) or **Upcoming**, plus payments that don't line up with any due date under **Other recorded payments**. The header totals what is recorded and counts overdue premiums; it also states the grace period.

**Why it exists:** "Every premium, paid or not, from the same shared schedule the server uses for reminders — so this table and the 'next due' everywhere else agree." (code comment)

**Where to find it:** Policy page (route `/insurance/:id`), **Premiums** card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Open a policy. Scroll to **Premiums**.
2. Click **Mark paid** on a row to record that premium (opens **Record premium payment** prefilled with that row's period), or **Record** in the header for any payment.
3. Click the bin on a paid row to remove that payment (no confirmation). The toast "Payment removed" appears.
4. Click **Show all N** / **Show fewer** to expand the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Record** | Button | Opens **Record premium payment** (empty period) | Never |
| **Mark paid** | Button | Opens it prefilled for that row | Shown on unpaid rows |
| Bin (aria "Remove the payment for <date>") | Button | Deletes that payment | Disabled while removing |
| **Show all N** / **Show fewer** | Button | Toggles the list length | Shown with more than 12 rows |
| **What the grace period means** | Link | Opens `/insurance/help#grace-period` | Shown for non-single premiums |
| **IRDAI rules** | Link | Opens the regulator's circular | Shown when the grace period is the default |

**Fields and rules:** Not applicable — see [F-INS-006](F-INS-006.md) for the payment dialog.

**Settings and toggles here:** [S-INS-003](../settings/insurance.md#s-ins-003) (premiums due before it show as "earlier premium … aren't tracked here and count as paid"); [S-INS-004](../settings/insurance.md#s-ins-004) grace period.

**Results:** Recording or removing a payment changes the policy's next due date and its reminders.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not remove the payment" | Server error | Try again |
| A payment appears under **Other recorded payments** | Its **Covers from** month matches no due date | Remove it and record it with the right period |

**Limitations:** A payment is matched to a due date only when its **Covers from** falls in the same calendar month. A single-premium policy shows only the payments recorded. At most 600 rows are generated.

**How it works:** Due dates are counted from the start date (start + n × 1, 3, 6 or 12 months; a 31st start date is clamped per month, not drifting). No premium falls due on or after the end date. Unpaid premiums before **Next premium due** (as first entered) are "untracked" and treated as paid. Default grace: 30 days for life and health policies paid in instalments, 15 days if monthly, none for single premiums and other policy types; your **Grace period (days)** overrides it. The page builds the schedule from all payments returned by `GET /api/insurance/policies/:id`.

**Related features:** [F-INS-006](F-INS-006.md), [F-INS-022](F-INS-022.md), [F-INS-016](F-INS-016.md).

**Sources:** `apps/web/src/components/insurance/PremiumScheduleCard.tsx:17`, `apps/web/src/components/insurance/PremiumScheduleCard.tsx:196`, `apps/web/src/components/insurance/PremiumScheduleCard.tsx:177`, `packages/shared/src/insurance/premiumSchedule.ts:133`, `packages/shared/src/insurance/premiumSchedule.ts:169`, `packages/shared/src/insurance/premiumSchedule.ts:89`, `packages/api/src/services/insurance/insurance.service.ts:749`
