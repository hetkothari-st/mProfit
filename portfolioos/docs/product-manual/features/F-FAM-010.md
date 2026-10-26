---
id: F-FAM-010
title: "Add several members at once"
module: "Family"
status: Live
roles: "R-FAMOWNER"
settings: [S-FAM-001, S-FAM-002]
related: [F-FAM-009, F-FAM-012]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Add several members at once

`F-FAM-010` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner)

**What it does:** Adds up to 25 managed members in one go. Each line is a person with a relation that can point at an existing member or at someone listed above on the same form; the keeper and place apply to everyone.

**Why it exists:** Code comment: "a grandmother, three uncles and their wives is nine trips through the same four fields."

**Where to find it:** **Family → Members & sharing → Add member → Add several**.

**Who can use it:** Owners only ([R-FAMOWNER](../roles.md#r-famowner)).

**Steps**
1. Choose **Add several**. Two empty lines appear (columns "Name", "Is the", "Of").
2. For each line enter a name, choose a relation ("Relation…") and who they are related to (existing members, or "<name> — added above").
3. Click **Add another** for more lines (up to 25) or the × to remove a line.
4. Choose **Who keeps their books** and **Their place in the family** for the whole list.
5. Click **Add N people** (or **Add to family** for one). The toast "N people added to the family" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add another** | Button | Adds a line | Disabled at 25 lines or while saving |
| Remove person N (×) | Icon button | Removes a line; anyone related to it falls back to the default anchor | Disabled when only one line remains |
| **Add N people** / **Add to family** | Button | Creates everyone | Disabled until every named line has a relation and anchor and a keeper is set |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name (per line) | Text | For lines to be added | ≤ 80 characters; blank lines are skipped | Empty | "Row N: a name is needed." / "Row N: that name is too long." |
| Relation (per line) | Select | Yes | From the fixed list | "Relation…" | — |
| Of (per line) | Select | Yes | An existing member or a line above | You / the tree card's person | "Row N: can only be related to someone listed above them." |
| List size | — | — | 1–25 people | 2 lines | "Add at least one person." / "You can add up to 25 people at a time." |

**Settings and toggles here:** [S-FAM-001](../settings/family.md#s-fam-001), [S-FAM-002](../settings/family.md#s-fam-002) (applied to every line).

**Results:** All people are created together or none; each gets a default portfolio and is placed on the tree in list order.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Your family's N included seats are taken by … You are adding N people with … left — add them one at a time to pay per seat, or remove some from the list." | Not enough free seats | Remove lines or add one at a time with payment ([F-FAM-012](F-FAM-012.md)) |

**Limitations:** No seat payment in bulk; no per-line email or role.

**How it works:** `POST /api/families/:familyId/members/managed/bulk` with up to 25 rows; seats are checked for the whole batch first, every row is validated before anything is written, and all profiles are created in one transaction.

**Related features:** [F-FAM-009](F-FAM-009.md), [F-FAM-012](F-FAM-012.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:1158`, `apps/web/src/pages/family/FamilyPage.tsx:1332`, `apps/web/src/pages/family/FamilyPage.tsx:1382`, `packages/api/src/routes/families.routes.ts:142`, `packages/api/src/services/family/family.service.ts:1112`, `packages/api/src/services/family/family.service.ts:1149`
