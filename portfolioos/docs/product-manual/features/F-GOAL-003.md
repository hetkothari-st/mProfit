---
id: F-GOAL-003
title: "Delete a goal"
module: "Goals"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-GOAL-001]
---

[← Goals](../modules/goals.md) · [Index](../INDEX.md)

# Delete a goal

`F-GOAL-003` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Deletes a goal after the browser confirmation "Delete this goal?".

**Why it exists:** Removes a goal you no longer track. Inferred from behavior.

**Where to find it:** Bin on a goal card (route `/goals`).

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) per the manager's plan.

**Steps**
1. Click the bin and confirm. The toast "Goal removed" appears.

**Controls:** Bin (title "Delete").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The goal is removed; linked portfolios are not affected.

**Errors and troubleshooting:** The server message, for example "Goal not found".

**Limitations:** No undo.

**How it works:** `DELETE /api/goals/:id`.

**Related features:** [F-GOAL-001](F-GOAL-001.md).

**Sources:** `apps/web/src/pages/goals/GoalsPage.tsx:121`, `packages/api/src/services/goals/goals.service.ts:134`
