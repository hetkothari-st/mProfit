---
id: F-DOCS-001
title: "Upload documents to sort"
module: "Documents"
status: Live
roles: "R-PLUS, R-FAMILY, R-PRO (R-FREE locked)"
settings: []
related: [F-DOCS-002, F-DOCS-003]
---

[← Documents](../modules/documents.md) · [Index](../INDEX.md)

# Upload documents to sort

`F-DOCS-001` · Live · Roles: [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) ([R-FREE](../roles.md#r-free) locked)

**What it does:** Accepts many files at once (by drag-and-drop or **Choose files**), uploads them in groups of 10, and lists the latest 12 with their progress: "Uploading <n>%", "Uploaded — reading…", "Already in your Documents", or the filing result.

**Why it exists:** The page says: "Drop your documents. We work out whose they are and what they are, file them in the right folder, and name them for you."

**Where to find it:** **Tools → Documents** (route `/documents`), drop area at the top.

**Who can use it:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-FREE](../roles.md#r-free) sees the locked card "Documents is locked" with **View plans**. [R-MANAGER](../roles.md#r-manager) uses it with the manager's plan for the managed person's documents.

**Steps**
1. Open **Tools → Documents**.
2. Drag files onto the box ("Drop your documents here — we sort them for you"), or click **Choose files**.
3. Watch the list below: each file moves from uploading to reading to "Filed into <person> / <type>", or to a status that needs you (see [F-DOCS-003](F-DOCS-003.md)).
4. Click **Clear list** to empty the progress list (files are not affected).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Drop area | Drop zone | Uploads all dropped files | — |
| **Choose files** | Button | File picker (multiple), limited to .pdf, .png, .jpg, .jpeg, .heic, .webp, .tiff, .bmp | — |
| Progress list | Display | Latest 12 files with status | Hidden when empty |
| **Clear list** | Button | Empties the progress list | Shown with the list |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Files | Files | Yes | Up to 10 per request (the page splits larger drops); each up to 25 MB (or the server upload limit if lower); server accepts .pdf, .doc, .docx, .odt, .txt, .rtf, .xls, .xlsx, .ods, .csv, .ppt, .pptx, .odp, .png, .jpg, .jpeg, .heic, .webp, .gif, .bmp, .tiff | — | "Choose at least one file"; "File is too large"; "Upload failed" |

**Settings and toggles here:** None.

**Results:** Each new file is stored (encrypted) and queued for reading. A file with the same bytes as one you already have is not stored again ("Already in your Documents"); if that earlier copy failed or needs review, it is read again.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "File is too large" | Over 25 MB | Compress or split |
| "Internal server error" | A dropped file had an unsupported extension | Use a supported type |
| "Already in your Documents" | Identical file already uploaded | Nothing to do |
| "This feature requires the PLUS plan or higher" | Free plan (API refuses) | Upgrade ([D-DOCS-002](../dependencies.md#d-docs-002)) |

**Limitations:** Only PDFs and images are read automatically; other accepted types are stored with "This file type is stored but not read automatically yet." and wait in **Needs attention**. The progress list is lost when you leave the page.

**How it works:** `POST /api/documents-sorter/upload` (multipart field `files`, up to 10) behind the DOCUMENT_SORTER plan gate. For each file: SHA-256 dedup per user; the real type is sniffed; PDFs and images are queued on `doc-sort` (if the queue cannot take it the file shows "Could not start reading this file. Drop it again to retry."). A file still "reading" after 10 minutes is treated as lost and re-queued when dropped again. The page polls the folder tree every 3 seconds while any file is being read.

**Related features:** [F-DOCS-002](F-DOCS-002.md), [F-DOCS-003](F-DOCS-003.md), [D-DOCS-002](../dependencies.md#d-docs-002).

**Sources:** `apps/web/src/pages/documentSorter/DocumentSorterPage.tsx:20`, `apps/web/src/pages/documentSorter/DocumentSorterPage.tsx:44`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:10`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:11`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:80`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:107`, `packages/api/src/routes/documentSorter.routes.ts:10`, `packages/api/src/middleware/documentUpload.ts:48`, `packages/api/src/middleware/documentUpload.ts:49`, `packages/api/src/services/documents/docSorter/sorter.service.ts:34`, `packages/shared/src/entitlements.ts:58`
