---
id: F-IMPORT-007
title: "Delete import records"
module: "Import"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-IMPORT-002]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Delete import records

`F-IMPORT-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Removes one import record, or several selected ones, from **Import history** together with its stored file. The transactions the import created are kept.

**Why it exists:** Inferred from behavior: tidies the history (for example failed or duplicate uploads) without losing data.

**Where to find it:** **Tools → Import → Import history**: delete (bin) icon on a row, or tick rows and click **Delete selected**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person's imports.

**Steps**
1. Single row: click the bin icon. Confirm "Delete this import record? Transactions will be kept." The toast "Import removed" appears.
2. Several rows: tick the row checkboxes (or the header checkbox for all). The header shows "<n> selected", **Delete selected** and **Clear**.
3. Click **Delete selected** and confirm "Delete <n> import record(s)? Transactions will be kept.". A toast says "Deleted <n> import(s)" or "<n> deletions failed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Bin icon (tooltip "Delete") | Button | Deletes one record after confirmation | Disabled while a single delete runs |
| Row checkbox | Toggle | Selects the row | Never |
| Header checkbox | Toggle | Selects or clears all listed rows | Never |
| **Delete selected** | Button | Deletes all selected after confirmation | Shown only when something is selected; disabled while deleting |
| **Clear** | Button | Clears the selection | Shown only when something is selected |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The `ImportJob` row and its stored copies are deleted. Transactions stay, but lose their link to the import (they no longer show which file they came from).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Remove failed" | Server error | Try again |
| "<n> deletions failed" | Some of the bulk deletions failed | Retry the remaining rows |

**Limitations:** There is no option to delete the transactions together with the import; delete them from **Transactions** instead. Bulk delete sends one request per row.

**How it works:** `DELETE /api/imports/:id` checks ownership, sets `importJobId` to null on every transaction of that job, deletes the job row, then deletes the local file and the encrypted copy (best effort).

**Related features:** [F-IMPORT-002](F-IMPORT-002.md), [D-IMPORT-006](../dependencies.md#d-import-006).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:117`, `apps/web/src/pages/imports/ImportPage.tsx:191`, `apps/web/src/pages/imports/ImportPage.tsx:342`, `packages/api/src/services/imports/import.service.ts:171`, `packages/api/src/services/imports/import.service.ts:177`
