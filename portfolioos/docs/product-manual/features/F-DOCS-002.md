---
id: F-DOCS-002
title: "How documents are read and filed"
module: "Documents"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-DOCS-001, F-DOCS-003, F-DOCS-005, F-DOCS-006, F-IMPORT-004]
---

[← Documents](../modules/documents.md) · [Index](../INDEX.md)

# How documents are read and filed

`F-DOCS-002` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** For each uploaded PDF or image, the server extracts text, decides the document type, the person's name and the document date, finds or creates that person's folder, and renames the file to "<Type>_<YYYY-MM-DD>.<ext>".

**Why it exists:** A code comment cites the design spec: read each file, find its person and type, file it and rename it, recording every outcome so a file is never lost.

**Where to find it:** Automatic after upload; results in the folders ([F-DOCS-003](F-DOCS-003.md)).

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The file ends in one of these states: **Filed** (in a person's folder, renamed), **Needs a password**, **Needs review** (with a reason), **Could not be read** (failed), or still **Reading…**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Needs review — Could not find a name on this document." | No person name found | Use **Assign** ([F-DOCS-005](F-DOCS-005.md)) |
| "Needs review — AI reading is over budget this month." / "AI reading was not available." | Rules were unsure and the AI fallback could not run | Use **Assign** |
| "Needs review — Could not read this file." | Text extraction failed | Use **Assign**, or upload a clearer copy |
| "Needs a password" | Locked PDF and automatic passwords failed | Use **Enter password** ([F-DOCS-006](F-DOCS-006.md)) |
| "Could not be read" ("Processing error.") | Unexpected error | Use **Assign**, or drop the file again |

**Limitations:** Scanned PDFs are OCR'd on the server for the first 3 pages only. When two existing folders are similarly named, the app does not guess and leaves the file for review. Folders can be created automatically from names on documents ("auto-created").

**How it works:** Text comes from the PDF text layer, else OCR (tesseract.js on the server; at most 3 pages; images scaled to at most 8 million pixels), within a 4.5-minute budget. Passwords tried: the one you entered, then the profile-based candidates listed in [F-IMPORT-004](F-IMPORT-004.md). Local rules find type, name, PAN last 4 and date; if rule confidence is below 0.70 or no name was found, an AI fallback (same gate and monthly budget as email parsing; PAN/Aadhaar/account/phone masked, the name kept) is used when its confidence is at least 0.5. Person matching: exact name key or alias first; otherwise a single similar name whose PAN last 4 does not conflict; ambiguity → review. A new name creates an auto-created folder. Filing takes a per-user lock; the new name is "<Type label>_<document date or upload date>" plus "-2", "-3"… when taken.

**Related features:** [F-DOCS-001](F-DOCS-001.md), [F-DOCS-003](F-DOCS-003.md), [F-DOCS-005](F-DOCS-005.md), [F-DOCS-006](F-DOCS-006.md).

**Sources:** `packages/api/src/services/documents/docSorter/sorter.service.ts:28`, `packages/api/src/services/documents/docSorter/sorter.service.ts:168`, `packages/api/src/services/documents/docSorter/sorter.service.ts:180`, `packages/api/src/services/documents/docSorter/sorter.service.ts:199`, `packages/api/src/services/documents/docSorter/sorter.service.ts:212`, `packages/api/src/services/documents/docSorter/textExtract.ts:16`, `packages/api/src/services/documents/docSorter/rules.ts:20`, `packages/api/src/services/documents/docSorter/personMatch.ts:66`, `packages/api/src/services/documents/docSorter/naming.ts:18`, `packages/api/src/services/documents/docSorter/llmFallback.ts:13`
