---
id: F-DOCS-005
title: "Move or assign a file"
module: "Documents"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DOCS-002, F-DOCS-003, F-DOCS-007]
---

[← Documents](../modules/documents.md) · [Index](../INDEX.md)

# Move or assign a file

`F-DOCS-005` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Moves a file to another person and/or type — or assigns a file that could not be sorted — creating a new person folder if needed, and renames it to match.

**Why it exists:** Inferred from behavior: corrects or completes the automatic sorting.

**Where to find it:** **Tools → Documents** → a file's move (folder-arrow) icon, or **Assign** on a file that needs review or could not be read.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click the move icon or **Assign**. The dialog "Move to a folder" opens with the file name.
2. Choose **Person** (or **New person…** and type the name in **New person**).
3. Choose **Document type**.
4. Click **Move and rename**. The toast "Moved and renamed" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Move icon (label "Move <file>") | Button | Opens the dialog | Hidden while the file is being read |
| **Assign** | Button | Opens the dialog | Shown for **Needs review** or **Could not be read** files |
| **Person** | Select | Target person, or **New person…** | Hidden when you have no folders |
| **New person** | Text | Name for a new folder; placeholder "Full name, as on the document" | Shown for **New person…** or when there are no folders |
| **Document type** | Select | One of the fixed types | — |
| **Cancel** / **Move and rename** | Buttons | Close / save | Save disabled while saving or without a person |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| New person | Text | Yes when creating | 1–80 characters, letters only after cleaning | Empty | "Enter a name using letters only" |
| Document type | Select | Yes | Fixed list | The file's current type, else Other | — |

**Settings and toggles here:** None.

**Results:** The file moves to the chosen person and type, is marked filed, and is renamed "<Type>_<date>" (date = document date, else upload date), with "-2", "-3"… if taken.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This document is still being read. Try again in a moment." | Still processing | Wait |
| "Couldn't move the file" | Other error | Try again |
| "Person not found" / "Document not found" | Removed meanwhile | Reload |

**Limitations:** The document date cannot be edited in the dialog (the API supports it).

**How it works:** For a new person the page first calls `POST /api/documents-sorter/people`, then `PATCH /api/documents-sorter/files/:id` with `personId` and `docType`.

**Related features:** [F-DOCS-002](F-DOCS-002.md), [F-DOCS-003](F-DOCS-003.md), [F-DOCS-007](F-DOCS-007.md).

**Sources:** `apps/web/src/pages/documentSorter/MoveDialog.tsx:22`, `apps/web/src/pages/documentSorter/MoveDialog.tsx:46`, `apps/web/src/pages/documentSorter/MoveDialog.tsx:83`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:41`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:89`, `packages/api/src/controllers/documentSorter.controller.ts:17`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:85`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:118`
