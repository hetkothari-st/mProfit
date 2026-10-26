---
id: F-FAM-001
title: "Family page and family selector"
module: "Family"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO; members"
settings: []
related: [F-FAM-002, F-FAM-003, F-FAM-019, F-FAM-022, F-FAM-023]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Family page and family selector

`F-FAM-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); members

**What it does:** Lists every family you belong to and shows one of them at a time. With one family it opens that family straight away; with two or more, a row of family buttons (each showing the family name and your role in lower case) appears above the workspace so you can pick one. With no family it shows an empty state.

**Why it exists:** The page comment states the feature "has real weight" and so gets a full page rather than a Settings section; the header text says it gives "One picture of the family's wealth, shared goals, protection and open items — with the per-member breakdown behind it".

**Where to find it:** **Overview → Family** (route `/family`), or the family name row in the sidebar family tree ([F-FAM-023](F-FAM-023.md)).

**Who can use it:** Every signed-in user ([R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)). Creating a family needs [R-FAMILY](../roles.md#r-family) or [R-PRO](../roles.md#r-pro) ([F-FAM-002](F-FAM-002.md)). Members of someone else's family ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)) see that family here whatever their own plan.

**Steps**
1. Open **Overview → Family**. The page header reads "The household, whole".
2. If you belong to no family, the empty state "No families yet" appears with **Create a family**.
3. If you belong to two or more families, click a family button to switch the workspace below to it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **New family** | Button (header) | Opens the "Create a new family" card ([F-FAM-002](F-FAM-002.md)) | Never hidden |
| **Create a family** | Button (empty state) | Same as **New family** | Shown only when you belong to no family |
| Family buttons (name + role) | Toggle buttons | Select which family the workspace shows | Shown only when you belong to two or more families |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed; the selection is kept only while the page is open (it is not saved).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No families yet" — "Create a family to invite members and manage shared portfolios. If an OWNER already sent you an invite, click the link they shared." | You have no active or pending membership | Create a family ([F-FAM-002](F-FAM-002.md)) or open the invitation link you were sent ([F-FAM-019](F-FAM-019.md)) |

**Limitations:** The selected family is not part of the URL. Opening `/family` (including from a sidebar family row) always selects the first family in the list, ordered by when you joined. The list refreshes every 30 seconds and when the window regains focus.

**How it works:** `GET /api/families` returns every membership with status ACTIVE or PENDING, ordered by join date, with the family name, description, your role, your status, join date and a seat summary ([F-FAM-003](F-FAM-003.md)). The page auto-selects the first family when nothing is selected. The same query key is shared with the header switcher ([F-FAM-022](F-FAM-022.md)) and sidebar tree ([F-FAM-023](F-FAM-023.md)), so creating or accepting a family updates all three.

**Related features:** [F-FAM-002](F-FAM-002.md), [F-FAM-003](F-FAM-003.md), [F-FAM-022](F-FAM-022.md), [F-FAM-023](F-FAM-023.md).

**Sources:** `apps/web/src/pages/family/FamilyPage.tsx:71`, `apps/web/src/pages/family/FamilyPage.tsx:91`, `apps/web/src/pages/family/FamilyPage.tsx:185`, `apps/web/src/pages/family/FamilyPage.tsx:195`, `packages/api/src/routes/families.routes.ts:171`, `packages/api/src/services/family/family.service.ts:97`
