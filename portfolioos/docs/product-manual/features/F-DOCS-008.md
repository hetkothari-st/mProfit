---
id: F-DOCS-008
title: "Download folders as ZIP"
module: "Documents"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DOCS-003]
---

[← Documents](../modules/documents.md) · [Index](../INDEX.md)

# Download folders as ZIP

`F-DOCS-008` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Downloads filed documents as a ZIP: everything (**Download everything**), one person (**Download all**), or one person's type (**Zip**).

**Why it exists:** Inferred from behavior: hand a person's or a type's documents to someone in one file.

**Where to find it:** **Tools → Documents** → **Download everything** (top), or inside a person: **Download all** and **Zip** on each type.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click the relevant button. The browser saves the ZIP ("all-documents.zip", "<person>-documents.zip" or "<person>-<type>.zip").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download everything** | Button | ZIP of all filed documents | Shown when there is at least one filed file |
| **Download all** | Button | ZIP of one person | In a person view |
| **Zip** | Button | ZIP of one type for that person | On each type section |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** A ZIP is saved on your device.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That is too much to zip in one go. Download one person or one type at a time." | Over 300 MB | Download a smaller set |
| "There are no files in that folder" | Nothing filed | — |
| "Couldn't download the folder" | Other error | Try again |

**Limitations:** Only filed documents are included (not those in **Needs attention**).

**How it works:** `GET /api/documents-sorter/folder-zip?personId=&docType=` builds the ZIP in memory (limit 300 MB total).

**Related features:** [F-DOCS-003](F-DOCS-003.md).

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:72`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:176`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:217`, `packages/api/src/controllers/documentSorter.controller.ts:66`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:15`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:212`
