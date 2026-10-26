---
id: F-DOCS-004
title: "View, download or delete a file"
module: "Documents"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DOCS-003]
---

[← Documents](../modules/documents.md) · [Index](../INDEX.md)

# View, download or delete a file

`F-DOCS-004` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** For each file: view it in the app (PDFs and images), download it, or delete it after a second confirmation.

**Why it exists:** Inferred from behavior: basic file handling inside the sorted folders.

**Where to find it:** **Tools → Documents** → a person folder or **Needs attention** → icons on a file row.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click the eye icon to open the viewer.
2. Click the download icon to save the file.
3. Click the bin icon, then **Delete** to confirm (or **Keep** to cancel). The toast "Deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Eye (label "View <file>") | Button | Opens the viewer | Shown only for PDFs/images not being read |
| Download (label "Download <file>") | Button | Downloads the file | — |
| Bin (label "Delete <file>") | Button | Asks to confirm | — |
| **Delete** / **Keep** | Buttons | Confirm or cancel deletion | Shown after the bin is clicked |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Delete removes the document. View and download change nothing.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't delete the file" / "Couldn't download the file" | Server error | Try again |

**Limitations:** None beyond the viewer supporting only PDFs and images.

**How it works:** Uses the shared documents API: `DELETE /api/documents/:id` and the download endpoint `GET /api/documents/:id/download`; the viewer is the shared document viewer ([D-DOCS-001](../dependencies.md#d-docs-001)).

**Related features:** [F-DOCS-003](F-DOCS-003.md), [D-DOCS-001](../dependencies.md#d-docs-001).

**Sources:** `apps/web/src/pages/documentSorter/FileRow.tsx:21`, `apps/web/src/pages/documentSorter/FileRow.tsx:43`, `apps/web/src/pages/documentSorter/FileRow.tsx:56`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:49`, `apps/web/src/api/documents.api.ts:43`
