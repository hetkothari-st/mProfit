---
id: F-FAM-014
title: "Edit a member's role and visibility"
module: "Family"
status: Live
roles: "R-FAMOWNER"
settings: [S-FAM-003, S-FAM-004, S-FAM-005]
related: [F-FAM-004, F-FAM-007, F-FAM-011, F-FAM-021, F-FAM-022]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Edit a member's role and visibility

`F-FAM-014` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner)

**What it does:** Changes a signed-in member's relation, role (**What they can do**) and the asset classes and non-portfolio categories they may see of the other members.

**Why it exists:** Service comment: owners can "Change a member's role or visibility caps"; the visibility caps decide what a contributor or viewer sees of the household.

**Where to find it:** **Family → Members & sharing →** click a person on the tree → **Edit** (members with their own login).

**Who can use it:** Owners only ([R-FAMOWNER](../roles.md#r-famowner)).

**Steps**
1. Open the person's card and click **Edit**. The dialog "Edit <name>" opens with their email.
2. Change **Related to** / **As their**, **What they can do**, and tick **Asset classes (n/N)** and **Non-portfolio categories (n/N)**.
3. Click **Save**. The toast "Saved" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **What they can do** | Select | Owner / Contributor / Viewer | — |
| Asset class checkboxes + **All** / **None** | Checkboxes | Choose visible asset classes | Greyed out when role is Owner |
| Category checkboxes + **All** / **None** | Checkboxes | Choose visible categories (Vehicle, Rental, Insurance, Loan, Credit card, Bank account, Owned property, Goal) | Greyed out when role is Owner |
| **Save** / **Cancel** | Buttons | Save / close | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Role | Select | No | OWNER/CONTRIBUTOR/VIEWER | Current role | "Cannot demote the last OWNER of a family." / "A managed member cannot be an owner; they cannot sign in." |
| Relation | Picker | No | ≤ 40 characters | Current | "Someone cannot be related to themselves." / "That relation would put someone under their own descendant on the tree." |

**Settings and toggles here:** [S-FAM-003](../settings/family.md#s-fam-003) **What they can do** — Owner sees everything and manages the family; Contributor sees a filtered view and can add to family-shared portfolios; Viewer sees a filtered view, read-only. [S-FAM-004](../settings/family.md#s-fam-004) **Asset classes** and [S-FAM-005](../settings/family.md#s-fam-005) **Non-portfolio categories** — ticked items are visible; an empty list hides everything in that dimension (the on-screen hint says the opposite — see Limitations).

**Results:** The change applies on the member's next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Update failed" toast with a server message | See the messages above | Correct and retry |

**Limitations:** Defect: the dialog note says "Owners see everything. Empty lists mean no restriction." and the matrix says "Empty = no restriction. Check specific classes to whitelist them." The server does the reverse: an empty list is deny-all for a contributor or viewer. Use **All** to grant full visibility. Caps apply only to other members' data; a member always sees their own data.

**How it works:** `PATCH /api/families/:familyId/members/:memberUserId/permissions` (owner check). The family scope gives an Owner no caps; a contributor or viewer gets exactly the stored lists, where an empty list means nothing is allowed. Changing the relation re-places the person on the tree and fails if that would create a loop.

**Related features:** [F-FAM-004](F-FAM-004.md)–[F-FAM-007](F-FAM-007.md), [F-FAM-011](F-FAM-011.md), [F-FAM-021](F-FAM-021.md), [F-FAM-022](F-FAM-022.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1729`, `apps/web/src/pages/family/FamilyPage.tsx:1808`, `apps/web/src/pages/family/FamilyPage.tsx:1826`, `apps/web/src/pages/family/FamilyPage.tsx:1897`, `packages/api/src/services/family/family.service.ts:213`, `packages/api/src/services/family/familyScope.service.ts:44`, `packages/api/src/services/family/familyScope.service.ts:208`
