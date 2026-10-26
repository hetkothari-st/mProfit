---
id: F-FAM-017
title: "Remove a member"
module: "Family"
status: Live
roles: "R-FAMOWNER"
settings: []
related: [F-FAM-008, F-FAM-026]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Remove a member

`F-FAM-017` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner)

**What it does:** Removes someone from the family. A member with a login leaves the family but keeps their account and data. A managed member is **deleted permanently** with everything recorded for them.

**Why it exists:** Service comment: a managed profile "has no login, and its manager's access came only through this family — so keeping it would only keep someone's finances somewhere no one can see or erase them."

**Where to find it:** Tree → person → **Remove**.

**Who can use it:** Owners only ([R-FAMOWNER](../roles.md#r-famowner)). You cannot remove yourself here.

**Steps**
1. Click **Remove**. A browser confirmation appears:
   - managed member: "Delete <name> from the family? Their account and everything recorded in it — portfolios, FDs, insurance — will be deleted permanently. This cannot be undone."
   - member with login: "Remove <name> from the family? They keep their own EveryPaisa account and data; they just leave this family."
2. Confirm. The toast "Removed from the family" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Remove** | Button | Removes after confirmation | Owners only |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** The membership row is deleted (managed: the whole profile is purged). Their children on the tree move up; managed members they were keeping pass to the owner who removed them.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Use \"leave family\" to revoke your own access." | Removing yourself | No leave button exists in the UI ([F-FAM-026](F-FAM-026.md)) |
| "Cannot revoke the last OWNER of a family." | Target is the only owner | Promote someone first |

**Limitations:** Deleting a managed member cannot be undone.

**How it works:** `DELETE /api/families/:familyId/members/:memberUserId` (owner check). Detaches from the tree, reassigns kept profiles to the caller, then purges a managed profile (account-deletion purge) or deletes the membership row.

**Related features:** [F-FAM-008](F-FAM-008.md), [F-FAM-026](F-FAM-026.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:393`, `packages/api/src/routes/families.routes.ts:220`, `packages/api/src/services/family/family.service.ts:306`, `packages/api/src/services/family/family.service.ts:355`
