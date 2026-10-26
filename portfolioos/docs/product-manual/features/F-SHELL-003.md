---
id: F-SHELL-003
title: "Planning group fold/unfold"
module: "App layout and navigation"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN"
settings: [S-SHELL-002]
related: [F-SHELL-001]
---

[← App layout and navigation](../modules/app-layout-and-navigation.md) · [Index](../INDEX.md)

# Planning group fold/unfold

`F-SHELL-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin)

**What it does:** The **Planning** heading in the sidebar folds and unfolds the group holding Goals, Will Maker, Succession, Tax Planning and AI connectors. When the group is folded and the page you are on is inside it, a small dot appears next to the heading.

**Why it exists:** Inferred from behavior: keeps forward-looking pages together and lets you shorten the sidebar.

**Where to find it:** Sidebar → **Planning** heading.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin).

**Steps**
1. Click **Planning**. The five links hide and the arrow points right.
2. Click it again. The links show and the arrow points down.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Planning** | Heading button | Folds/unfolds the group | On the icon rail the five icons are always shown and there is no heading |

**Fields and rules:** None.

**Settings and toggles here:** [S-SHELL-002](../settings/app-layout-and-navigation.md#s-shell-002) **Planning group open** — open (default) or folded; remembered on this browser.

**Results:** The group stays as you left it the next time you open the app in this browser.

**Errors and troubleshooting:** None — if the browser blocks storage, the group starts open and your choice lasts until the page reloads.

**Limitations:** Per browser, not per account.

**How it works:** localStorage key `sidebar_planning_open` (`"1"` open, `"0"` folded); any value other than `"0"` means open.

**Related features:** [F-SHELL-001](F-SHELL-001.md).

**Sources:** `apps/web/src/components/layout/PlanningNavGroup.tsx:15`, `apps/web/src/components/layout/PlanningNavGroup.tsx:38`, `apps/web/src/components/layout/PlanningNavGroup.tsx:59`
