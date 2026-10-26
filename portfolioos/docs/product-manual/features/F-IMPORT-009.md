---
id: F-IMPORT-009
title: "Duplicate protection on imports"
module: "Import"
status: Live
roles: "All importing users"
settings: []
related: [F-IMPORT-001, F-IMPORT-005, F-IMPORT-008, F-MAIL-006]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Duplicate protection on imports

`F-IMPORT-009` · Live · Roles: All importing users

**What it does:** Stops the same trade from being added twice when you upload a file again, when the same file arrives twice by email, or when a trade already came in from another source (another file, a CAS, a broker sync).

**Why it exists:** Code comments state the rule: re-uploading the exact same bytes must produce zero new rows, and the same trade can arrive from a broker sync or a CAS as well as a contract note.

**Where to find it:** Automatic. Skipped rows are reported in the issues dialog as "<n> row(s) skipped as duplicates — they were already imported from this file."

**Who can use it:** Applies to every import job.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Re-imports add only rows that are not already present; the job's **Success** count shows only new rows.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A re-uploaded file shows 0 in **Success** | All its rows already exist | Nothing to fix |
| Two genuine identical fills in one file both appear | Intended: rows written by the same job are never treated as duplicates of each other | Nothing to fix |

**Limitations:** Uploading the same file through the Import page always creates a new job row (only Gmail and inbox-scan imports reuse an existing job for identical bytes); the duplicate check works at row level.

**How it works:** Each row gets a fingerprint (`sourceHash`) chosen in this order: one supplied by the parser; for broker rows with broker + order number + trade number, a natural-key hash derived by the transaction service; otherwise a positional hash of parser id + SHA-256 of the file bytes + row position. The transaction service is called with `onDuplicate: 'skip'` and ignores rows written by the same job. Gmail attachments and inbox-scan documents also carry the file's SHA-256 (`contentHash`) and the Gmail message id; a new job with a hash or message id already seen for you returns the existing job instead.

**Related features:** [F-IMPORT-001](F-IMPORT-001.md), [F-IMPORT-005](F-IMPORT-005.md), [F-IMPORT-008](F-IMPORT-008.md), [F-MAIL-006](F-MAIL-006.md).

**Sources:** `packages/api/src/services/imports/import.service.ts:83`, `packages/api/src/services/imports/import.service.ts:95`, `packages/api/src/services/imports/import.service.ts:326`, `packages/api/src/services/imports/import.service.ts:433`, `packages/api/src/services/imports/import.service.ts:454`, `apps/web/src/pages/imports/ImportErrorDialog.tsx:30`
