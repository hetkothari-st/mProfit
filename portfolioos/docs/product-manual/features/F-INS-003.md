---
id: F-INS-003
title: "Edit a policy"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-INS-001, S-INS-002, S-INS-003, S-INS-004, S-INS-005]
related: [F-INS-001, F-INS-002, F-INS-007]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Edit a policy

`F-INS-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Opens **Edit policy** with the saved values (the policy number box is empty and shows "Saved, ending 1234 — type to replace"). Saving updates the policy and, when a schedule field changed, recomputes the next premium due.

**Why it exists:** Premiums, cover and dates change at renewal; this keeps the schedule and reminders right. Inferred from behavior.

**Where to find it:** Pencil on a policy card (route `/insurance`), or **Edit** on the policy page (route `/insurance/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click the pencil on a card or **Edit** on the policy page. **Edit policy** opens with saved values.
2. Change any field. Leave **Policy number** blank to keep the saved number, or type a new one to replace it.
3. Change **Next premium due** only if the insurer says otherwise — the hint reads "Change only if the insurer says otherwise — earlier premiums then count as paid."
4. Click **Save changes**. The toast "Policy updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Closes without saving | Never |
| **Save changes** | Button | Saves; label "Saving…" | Disabled while saving |

**Fields and rules:** Same fields and rules as [F-INS-002](F-INS-002.md) except: **Policy number** is optional (blank keeps it); **Next premium due** is sent only if you changed it; the catalogue picker is not shown; **Attach a PDF** is shown.

**Settings and toggles here:** [S-INS-001](../settings/insurance.md#s-ins-001), [S-INS-002](../settings/insurance.md#s-ins-002), [S-INS-003](../settings/insurance.md#s-ins-003), [S-INS-004](../settings/insurance.md#s-ins-004), [S-INS-005](../settings/insurance.md#s-ins-005) (as in [F-INS-002](F-INS-002.md)).

**Results:** The policy is updated. If type, frequency, start date, end date, grace period or next premium due changed, the next due date is recomputed from the recorded payments.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You already have this policy saved for this insurer" | The new number or insurer collides with another saved policy | Check the number |
| "Could not update the policy" | Server error | Try again |

**Limitations:** The catalogue picker is shown only when adding; a PDF attached while editing is uploaded after the save. Status cannot be changed (see [F-INS-001](F-INS-001.md)).

**How it works:** `PATCH /api/insurance/policies/:id` with only the fields sent. A new number is re-encrypted with a new fingerprint and last 4. Changing **Next premium due** moves `premiumsTrackedFrom`, so earlier unpaid premiums become "untracked" (treated as paid).

**Related features:** [F-INS-002](F-INS-002.md), [F-INS-007](F-INS-007.md).

**Sources:** `apps/web/src/components/insurance/PolicyFormDialog.tsx:270`, `apps/web/src/components/insurance/PolicyFormDialog.tsx:357`, `apps/web/src/components/insurance/PolicyFormDialog.tsx:208`, `packages/api/src/services/insurance/insurance.service.ts:533`, `packages/api/src/services/insurance/insurance.service.ts:559`
