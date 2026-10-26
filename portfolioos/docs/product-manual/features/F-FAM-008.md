---
id: F-FAM-008
title: "Family tree"
module: "Family"
status: Live
roles: "Members (view); R-FAMOWNER (rearrange)"
settings: []
related: [F-FAM-009, F-FAM-014, F-FAM-015, F-FAM-017, F-FAM-024]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Family tree

`F-FAM-008` · Live · Roles: Members (view); [R-FAMOWNER](../roles.md#r-famowner) (rearrange)

**What it does:** On **Members & sharing**, draws the family as an indented tree: each person as a pill (crown icon for Owners, eye icon for Viewers), spouses side by side joined by a dashed "Married" line, children stepped in with the relation ("son", "daughter") on the line. Clicking a person opens a card with what you can do for them.

**Why it exists:** Code comment: "a wall-chart has to be shrunk to fit a phone, and a shrunk chart is one nobody can read. Here every name is full size at every family size".

**Where to find it:** **Overview → Family → Members & sharing** → **Family tree** card.

**Who can use it:** Any member can view. Only owners ([R-FAMOWNER](../roles.md#r-famowner)) get **Add a relative**, **Edit**, **Remove**, **Move under…** and **To the top**. Whoever keeps a managed member's books (owner or not) gets **Record something for <first name>**.

**Steps**
1. Open **Members & sharing**. The tree loads with a legend ("Parent to child", "Married") and "N people".
2. Click a person. Their card opens with "<relation> of <name>", "Kept by <name>" or their email.
3. Owners: choose a person in **Move under…** to place this person (and their spouse's row) under someone, or click **To the top** to make them the head. A toast "Tree rearranged" appears.
4. Click the empty board or **Close** (×) to close the card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Person pill | Button | Opens/closes that person's card | — |
| **Add member** | Button (card header) | Opens "Add a family member" ([F-FAM-009](F-FAM-009.md)) | Owners only |
| **Record something for <first name>** | Button | Opens their account ([F-FAM-024](F-FAM-024.md)) | Only if you keep this managed member's books |
| **Add a relative** | Button | Opens "Add a relative of <name>" | Owners only |
| **Edit** | Button | Opens [F-FAM-014](F-FAM-014.md) or [F-FAM-015](F-FAM-015.md) | Owners only |
| **Remove** | Button | Starts [F-FAM-017](F-FAM-017.md) | Owners only |
| **Move under…** | Select | Places the person under the chosen member | Owners only; disabled while saving |
| **To the top** | Button | Makes the person the head of the tree | Owners only; hidden for the current head; disabled while saving |
| **Close** (×) | Icon button | Closes the card | — |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** None.

**Results:** Rearranging saves the family's tree layout for every member.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nobody on the tree yet. Add a family member to start it." | No members returned | Add a member |
| "That arrangement puts someone under themselves." (toast "Could not rearrange the tree" fallback) | The move would create a loop | Choose a different parent |
| "OWNER role required." | You are not an owner | Ask an owner |

**Limitations:** Positions are not dragged; placement is automatic from relations plus the saved "who is under whom" choices. Removed members disappear entirely (they are not greyed out).

**How it works:** Reads `GET /api/families/:familyId/tree-layout` (any active member) and the members list; couples are the saved pairs plus pairs implied by spouse relations. Rearranging sends `PUT /api/families/:familyId/tree-layout` (owner only) with `parents` (child → parent or null) and `partners`; the server drops invalid entries and rejects loops. **To the top** sets the person's parent to none and moves every other unattached row under them; **Move under…** moves a couple together. Adding someone with a relation places them automatically (a father above, a wife beside, a son below); removing someone moves their children up to the surviving spouse or to their own parent.

**Related features:** [F-FAM-009](F-FAM-009.md), [F-FAM-014](F-FAM-014.md), [F-FAM-015](F-FAM-015.md), [F-FAM-017](F-FAM-017.md), [F-FAM-024](F-FAM-024.md).

**Sources:** `apps/web/src/components/family/FamilyTreeBoard.tsx:83`, `apps/web/src/components/family/FamilyTreeBoard.tsx:133`, `apps/web/src/components/family/FamilyTreeBoard.tsx:144`, `apps/web/src/components/family/FamilyTreeBoard.tsx:424`, `apps/web/src/pages/family/FamilyPage.tsx:365`, `packages/api/src/services/family/family.service.ts:1486`, `packages/api/src/services/family/family.service.ts:1534`, `packages/api/src/services/family/family.service.ts:375`
