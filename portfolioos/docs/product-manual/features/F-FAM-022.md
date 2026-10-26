---
id: F-FAM-022
title: "Switch view (family view across the app)"
module: "Family"
status: Live
roles: "R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER"
settings: [S-FAM-006]
related: [F-FAM-003, F-FAM-014]
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Switch view (family view across the app)

`F-FAM-022` · Live · Roles: [R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)

**What it does:** The header menu **Switch view** lets you see the app as **Personal view** or as one of your families. In family view, data pages show the household's combined data, filtered by your role and caps. The Dashboard shows a strip with the family name, your role, member count and a **Personal view** exit.

**Why it exists:** Code comment: without the dashboard strip, an owner inviting an empty new member "sees no dashboard change and thinks the switch is broken."

**Where to find it:** Header, next to the user menu (person icon / family icon with the current view name). Hidden when you have no active family.

**Who can use it:** Any active family member ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)). Family view is cleared whenever you enter or leave a managed account.

**Steps**
1. Click **Switch view**. The menu lists **Personal view** and each family with your role.
2. Choose a family. All cached data is dropped and pages refetch in family view.
3. To leave, choose **Personal view** in the menu or click **Personal view** on the dashboard strip.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Switch view** | Menu button | Opens the view menu | Hidden with no active family |
| **Personal view** | Menu item | Back to your own data | — |
| Family items | Menu items | Switch to that family | Active memberships only |
| **Personal view** ×(dashboard strip, tooltip "Exit family view") | Button | Back to personal view | Strip shown only in family view |

**Fields and rules:** Not applicable — no data entry.

**Settings and toggles here:** [S-FAM-006](../settings/family.md#s-fam-006) **Viewing as family** — stored on this browser, survives reloads, cleared on sign-out/account switch.

**Results:** Every request carries the family selector until you switch back.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You are not an active member of this family." on data pages | You were removed but the browser still holds the family view | Choose **Personal view** |

**Limitations:** Writes always land on your own data or on family-shared portfolios you can write; nobody can edit another member's personal data in family view.

**How it works:** The web client adds an `X-Viewing-As-Family` header to every API request; the server resolves the caller's scope (owner: all active members' personal data + family-shared portfolios, no caps; contributor/viewer: same members filtered by their caps; contributors may write family-shared portfolios, viewers may not). Query caches are keyed by the view, and switching removes and refetches all queries.

**Related features:** [F-FAM-003](F-FAM-003.md), [F-FAM-014](F-FAM-014.md), [D-FAM-003](../dependencies.md#d-fam-003).

**Sources:** `apps/web/src/components/family/FamilyScopeSwitcher.tsx:17`, `apps/web/src/components/family/FamilyScopeSwitcher.tsx:57`, `apps/web/src/components/family/FamilyScopeBanner.tsx:18`, `apps/web/src/components/layout/Header.tsx:129`, `apps/web/src/api/client.ts:42`, `apps/web/src/stores/familyScope.store.ts:32`, `packages/api/src/lib/familyHeader.ts:16`, `packages/api/src/services/family/familyScope.service.ts:132`
