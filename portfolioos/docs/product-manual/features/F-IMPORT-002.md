---
id: F-IMPORT-002
title: "Import history"
module: "Import"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-IMPORT-001, F-IMPORT-003, F-IMPORT-004, F-IMPORT-005, F-IMPORT-006, F-IMPORT-007, F-IMPORT-010]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Import history

`F-IMPORT-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Lists your 50 most recent import jobs, newest first, with **File**, **Type**, **Status**, **Rows**, **Success**, **Failed**, **Uploaded** (date and time in IST) and per-row actions. It includes jobs started from this page, from the mutual fund CAS card, from Gmail attachments and from approved inbox-scan documents.

**Why it exists:** Inferred from behavior: imports run in the background, so you need one place to see whether each file finished, how many rows went in, and which need attention.

**Where to find it:** **Tools → Import** (route `/import`), card **Import history**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-MANAGER](../roles.md#r-manager) sees the managed person's imports. Family view does not change the list: it always shows your own jobs.

**Steps**
1. Open **Tools → Import** and scroll to **Import history**.
2. Read each row's status chip. While any job is **Pending** or **Processing**, the list refreshes every 2 seconds on its own.
3. Click **Refresh** to reload the list at any time.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Reloads the list | Never |
| Status chip | Display / button | **Pending**, **Processing** (spinning icon), **Completed**, **Partial**, **Failed**, **Needs password** (clickable, see [F-IMPORT-004](F-IMPORT-004.md)) | Never |
| **Errors** / **Warnings** | Button | Opens the issues dialog ([F-IMPORT-003](F-IMPORT-003.md)) | Shown only when the job has failed rows, row errors or parser warnings, and is not **Needs password** |
| Download icon (label **Download** on phones) | Button | Downloads the original file ([F-IMPORT-006](F-IMPORT-006.md)) | Never |
| Reprocess icon (label **Reprocess** on phones) | Button | Runs the job again ([F-IMPORT-005](F-IMPORT-005.md)) | Disabled while a reprocess is running |
| Delete icon (label **Delete** on phones) | Button | Deletes the import record ([F-IMPORT-007](F-IMPORT-007.md)) | Disabled while a delete is running |
| Row checkbox / header checkbox | Toggle | Selects rows for bulk delete ([F-IMPORT-007](F-IMPORT-007.md)) | Never |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes; this is a read-only list.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No imports yet" — "Drag & drop a contract note or CAS PDF above to get started." | You have no import jobs | Upload a file ([F-IMPORT-001](F-IMPORT-001.md)) |
| A row shows **Failed** with no **Errors** button | The background worker stopped the job (timeout, crash or a restart) and recorded the reason in a field the page does not display | Click **Reprocess**, or upload the file again |
| A row stays **Pending** | The job queue (Redis) was unavailable when the file was uploaded | It is re-queued automatically when the server restarts; or click **Reprocess** |

**Limitations:** Only the 50 newest jobs are listed; older jobs are not reachable from the page. The **Type** column shows the type inferred from the file name, not the parser actually used. The row does not show which portfolio received the transactions.

**How it works:** `GET /api/imports` returns `ImportJob` rows for the signed-in user ordered by creation time, descending, limited to 50 (`take` capped at 200 in the service). Status labels come from a shared table: PENDING "Pending", PROCESSING "Processing", COMPLETED "Completed", COMPLETED_WITH_ERRORS "Partial", FAILED "Failed", NEEDS_PASSWORD "Needs password". The page polls every 2000 ms while any row is PENDING or PROCESSING and stops polling otherwise. **Rows** = events the parser produced; **Success** = transactions newly added; **Failed** = rows that could not be added; rows skipped as duplicates are counted in neither and shown in the issues dialog.

**Related features:** [F-IMPORT-003](F-IMPORT-003.md), [F-IMPORT-004](F-IMPORT-004.md), [F-IMPORT-005](F-IMPORT-005.md), [F-IMPORT-006](F-IMPORT-006.md), [F-IMPORT-007](F-IMPORT-007.md), [F-IMPORT-010](F-IMPORT-010.md), [D-IMPORT-004](../dependencies.md#d-import-004) (data-quality banner lists unfinished imports).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:60`, `apps/web/src/pages/imports/ImportPage.tsx:189`, `apps/web/src/pages/imports/ImportPage.tsx:222`, `apps/web/src/pages/imports/ImportPage.tsx:276`, `apps/web/src/pages/imports/ImportPage.tsx:307`, `packages/shared/src/types/imports.ts:51`, `packages/api/src/services/imports/import.service.ts:162`
