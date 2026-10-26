---
id: F-DOCS-007
title: "Rename or merge person folders"
module: "Documents"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DOCS-003, F-DOCS-005]
---

[← Documents](../modules/documents.md) · [Index](../INDEX.md)

# Rename or merge person folders

`F-DOCS-007` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Renames a person's folder, or merges it into another person's folder (all its files move there).

**Why it exists:** Folder names can be auto-created from documents; the page's note says "Rename it, or merge it into another folder if it is the same person."

**Where to find it:** **Tools → Documents** → open a person → **Rename**, and **Merge into…** + **Merge**.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Rename**, edit **Folder name**, and click the tick to save.
2. To merge, choose a folder in **Merge into…** and click **Merge**. The toast "Folders merged" appears and the target folder opens.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Rename** | Button | Shows the name field | — |
| **Folder name** + tick | Text + button | Saves the new name | Tick disabled while saving |
| **Merge into…** | Select | Target folder | Shown only when other folders exist |
| **Merge** | Button | Merges this folder into the target | Disabled without a target or while merging |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Folder name | Text | Yes | 1–80 characters, letters only after cleaning | Current name | "Enter a name using letters only"; "A folder with that name already exists. Merge the two folders instead." |

**Settings and toggles here:** None.

**Results:** Rename changes the folder name. Merge moves (and renames, if needed) every file into the target, remembers the merged name as an alias so future documents with that name file into the target, and deletes the merged folder.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't rename the folder" / "Couldn't merge the folders" | Server error or validation | Read the message and retry |
| "Pick two different folders to merge" | Same folder chosen | Choose another |

**Limitations:** There is no way to delete an empty folder from this page.

**How it works:** `PATCH /api/documents-sorter/people/:id` and `POST /api/documents-sorter/people/merge` (`fromId`, `intoId`).

**Related features:** [F-DOCS-003](F-DOCS-003.md), [F-DOCS-005](F-DOCS-005.md).

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:54`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:152`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:167`, `packages/api/src/controllers/documentSorter.controller.ts:55`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:146`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:159`
