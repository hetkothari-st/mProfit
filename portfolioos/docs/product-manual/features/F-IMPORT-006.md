---
id: F-IMPORT-006
title: "Download the source file"
module: "Import"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-IMPORT-002, F-IMPORT-007]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Download the source file

`F-IMPORT-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Downloads the original file of an import job under its original file name.

**Why it exists:** Inferred from behavior: lets you check exactly what was imported or re-use the file elsewhere.

**Where to find it:** **Tools → Import → Import history**, download icon (tooltip "Download source file"; label **Download** on phones).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person's imports.

**Steps**
1. Click the download icon on a row. The browser saves the file.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Download icon | Button | Downloads the file | Never |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** A copy of the file is saved on your device. Nothing changes in the app.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Source file not found on server" | An old job without an encrypted copy lost its local file | None — upload the file again if needed |

**Limitations:** Files from deleted import records cannot be downloaded.

**How it works:** `GET /api/imports/:id/download` checks the job belongs to you, then streams the decrypted encrypted copy (`blobKey`) or, for legacy jobs, the file on disk.

**Related features:** [F-IMPORT-002](F-IMPORT-002.md), [F-IMPORT-007](F-IMPORT-007.md).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:320`, `apps/web/src/api/imports/imports.api.ts:46`, `packages/api/src/controllers/imports.controller.ts:237`
