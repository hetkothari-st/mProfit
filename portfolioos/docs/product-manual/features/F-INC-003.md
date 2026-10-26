---
id: F-INC-003
title: "Delete income"
module: "Income"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INC-001]
---

[← Income](../modules/income.md) · [Index](../INDEX.md)

# Delete income

`F-INC-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Deletes an income entry immediately, with no confirmation.

**Why it exists:** Removes an income that no longer applies. Inferred from behavior.

**Where to find it:** Bin (title "Delete") on an income card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click the bin. The toast "Income entry removed" appears.

**Controls:** Bin (title "Delete").

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The entry is removed and the total updates.

**Errors and troubleshooting:** The server message, for example "Income entry not found".

**Limitations:** No confirmation and no undo; to pause an income instead, untick **Currently active**.

**How it works:** `DELETE /api/income/:id`.

**Related features:** [F-INC-001](F-INC-001.md).

**Sources:** `apps/web/src/pages/income/IncomePage.tsx:94`, `packages/api/src/services/income/income.service.ts:106`
