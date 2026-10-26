---
id: F-INS-004
title: "Delete a policy"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-001, F-INS-008]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Delete a policy

`F-INS-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Deletes a policy together with its premium payments and claims, after confirmation.

**Why it exists:** Removes a policy you no longer hold or added by mistake. Inferred from behavior.

**Where to find it:** Bin on a policy card (route `/insurance`) or the bin button (aria "Delete policy") on the policy page.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. On a card, click the bin. The card turns red and asks "Delete <insurer> — <plan>, with its premiums and claims?"
2. Click **Delete** (or **Keep it** to cancel). The toast "Policy deleted" appears.
3. On the policy page, the bin opens a browser confirmation "Delete this policy, with its premiums and claims?"; confirming returns you to `/insurance`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete** | Button | Deletes | Disabled while deleting |
| **Keep it** | Button | Cancels | Never |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The policy, its premium payments and claims are removed; reminders for it stop.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not delete the policy" | Server error | Try again |

**Limitations:** There is no undo.

**How it works:** `DELETE /api/insurance/policies/:id` after checking the policy is yours.

**Related features:** [F-INS-001](F-INS-001.md), [F-INS-008](F-INS-008.md).

**Sources:** `apps/web/src/pages/insurance/InsuranceListPage.tsx:90`, `apps/web/src/pages/insurance/InsuranceDetailPage.tsx:257`, `packages/api/src/services/insurance/insurance.service.ts:617`
