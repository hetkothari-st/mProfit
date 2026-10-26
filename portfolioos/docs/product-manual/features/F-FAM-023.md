---
id: F-FAM-023
title: "Sidebar family tree"
module: "Family"
status: Live
roles: "Family members"
settings: [S-FAM-008]
related: [F-FAM-001, F-FAM-021]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Sidebar family tree

`F-FAM-023` · Live · Roles: Family members

**What it does:** At the top of the sidebar, for users in at least one family: each family as a row (house icon) that opens `/family`, with a chevron that expands its active members ("You" first, then by name); each member row opens their member page. In the collapsed icon rail each family shows as its first letter.

**Why it exists:** Code comment: "A family is not a feature you visit — it is a set of people whose pages you move between". Users with no family see nothing.

**Where to find it:** Sidebar, above **Overview**.

**Who can use it:** Any family member.

**Steps**
1. Click the chevron to expand or collapse a family ("Loading members" shows while fetching).
2. Click a member to open [F-FAM-021](F-FAM-021.md), or the family name to open `/family`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Expand / Collapse <family> | Chevron button | Shows/hides members | — |
| Family row | Link | Opens `/family` | — |
| Member row | Link | Opens `/family/members/<id>?familyId=<family>` | Only ACTIVE members are listed |

**Fields and rules:** Not applicable — navigation.

**Settings and toggles here:** [S-FAM-008](../settings/family.md#s-fam-008) **Sidebar family expansion** (this browser only).

**Results:** Navigation only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load members" | Members request failed | Collapse and expand again |

**Limitations:** Every family row opens `/family`, which always shows the first family; clicking a second family's name does not select it.

**How it works:** Shares the `families` and members queries with the Family page; members load only when expanded. Families default to expanded until you first toggle one.

**Related features:** [F-FAM-001](F-FAM-001.md), [F-FAM-021](F-FAM-021.md).

**Sources:** `apps/web/src/components/layout/FamilyNavTree.tsx:28`, `apps/web/src/components/layout/FamilyNavTree.tsx:40`, `apps/web/src/components/layout/FamilyNavTree.tsx:150`, `apps/web/src/components/layout/FamilyNavTree.tsx:243`, `apps/web/src/components/layout/SidebarNav.tsx:131`
