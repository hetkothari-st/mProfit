---
id: F-DOCS-003
title: "Browse person folders"
module: "Documents"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DOCS-002, F-DOCS-004, F-DOCS-005, F-DOCS-006, F-DOCS-007, F-DOCS-008]
---

[← Documents](../modules/documents.md) · [Index](../INDEX.md)

# Browse person folders

`F-DOCS-003` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows "<n> people · <m> files" and one folder card per person ("<n> files · <k> types", "· auto-created" when made automatically), plus an amber **Needs attention** card for files still reading or waiting for you. Opening a person shows their files grouped by document type.

**Why it exists:** Inferred from behavior: the sorted result of [F-DOCS-002](F-DOCS-002.md), organised the way people look for documents — by person, then type.

**Where to find it:** **Tools → Documents**, below the drop area.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click a person's folder card. The person view lists sections such as "Bank Statement (3)".
2. Click the back arrow ("Back to all folders") to return.
3. Click **Needs attention** to see unfiled files ("<n> file(s) reading or waiting for you").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Person folder card | Button | Opens that person | — |
| **Needs attention** | Button | Opens unfiled files | Shown only when some exist |
| Back arrow | Button | Back to all folders | In a person or Needs attention view |
| Per-file actions | Buttons | See [F-DOCS-004](F-DOCS-004.md), [F-DOCS-005](F-DOCS-005.md), [F-DOCS-006](F-DOCS-006.md) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing here yet. Drop a few documents above and folders appear on their own." | No documents | Upload some |
| "Couldn't load your documents" | Server error | Reload |
| "Folder not found" | The folder was merged or renamed meanwhile | Go back |
| Amber note "This folder was created automatically from a name on your documents. Rename it, or merge it into another folder if it is the same person." | Auto-created folder | Rename or merge ([F-DOCS-007](F-DOCS-007.md)) |

**Limitations:** There is no search or sort. Document types are fixed: ITR, Form 16, Income Certificate, Bank Statement, Salary Slip, CAS, Contract Note, Insurance, FD Certificate, ID Proof, Other.

**How it works:** `GET /api/documents-sorter/tree` returns people with files grouped by type, and an `unassigned` list of files with no person or not yet FILED.

**Related features:** [F-DOCS-004](F-DOCS-004.md), [F-DOCS-005](F-DOCS-005.md), [F-DOCS-006](F-DOCS-006.md), [F-DOCS-007](F-DOCS-007.md), [F-DOCS-008](F-DOCS-008.md).

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:124`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:181`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:213`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:241`, `packages/shared/src/documentSorter.ts:3`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:47`
