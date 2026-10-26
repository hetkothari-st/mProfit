---
id: F-IMPORT-001
title: "Upload a file"
module: "Import"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-IMPORT-001]
related: [F-IMPORT-002, F-IMPORT-004, F-IMPORT-008, F-IMPORT-009, F-IMPORT-010]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Upload a file

`F-IMPORT-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Sends one file (PDF, XLSX, XLS, CSV or TSV, up to 50 MB by default) to the server, optionally into a portfolio you choose, and starts a background import job for it. The page shows "File uploaded — import running in background" and the job appears at the top of **Import history**.

**Why it exists:** The page header states the purpose: "Upload contract notes, CAS statements, back-office CSVs or Excel files. Transactions will be parsed and added to your portfolio automatically." It saves you from typing every trade by hand.

**Where to find it:** **Tools → Import** (route `/import`), card **Upload a file**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (no plan gate). [R-MANAGER](../roles.md#r-manager) uploads into the managed person's data. Signed-out visitors ([R-VISITOR](../roles.md#r-visitor)) are sent to sign in. Professionals ([R-PROF](../roles.md#r-prof)) upload client files from the CA workspace, not here.

**Steps**
1. Open **Tools → Import**.
2. Optional: pick a portfolio in **Target portfolio (optional)**. Leave it at **Default / first portfolio** to let the app choose.
3. Drag a file onto the dashed box, or click **Choose file** and pick one. The box shows a spinner and "Uploading…".
4. When the upload finishes, a toast says "File uploaded — import running in background". The new row in **Import history** shows **Pending**, then **Processing**, then its final status. The table refreshes itself every 2 seconds while any job is Pending or Processing.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Target portfolio (optional)** | Select | Portfolio the transactions go into; first option **Default / first portfolio** | Never |
| Drop area "Drag & drop a file here, or click to browse" | Drop zone | Uploads the first dropped file (only one file per drop) | Shows "Uploading…" while a file is uploading |
| **Choose file** | Button | Opens the file picker, limited to .pdf, .csv, .tsv, .xlsx, .xls | Disabled while uploading |
| **Supported formats** card | Display | Lists PDF, Excel and CSV/TSV sources and the password hint | Never |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| File | File | Yes | Extensions .pdf, .csv, .tsv, .xlsx, .xls (the server also accepts .html/.htm, but the picker does not offer them); size up to `MAX_UPLOAD_SIZE_MB` (default 50 MB); content must match the extension | None | "File is too large" (over the limit); "Uploaded file content does not match its \".pdf\" extension (detected: …)." (content mismatch); see Errors below |
| Target portfolio | Select | No | One of your portfolios | Default / first portfolio | "Portfolio not found" |

**Settings and toggles here:** [S-IMPORT-001](../settings/import.md#s-import-001) **Target portfolio (optional)** — a chosen portfolio receives every transaction from the file; left empty, the server uses your portfolio marked default, else your first portfolio. It is not remembered between uploads.

**Results:** An import job is created with status **Pending**; an encrypted copy of the file is stored so the job can be processed, reprocessed and downloaded later. When the job finishes, its transactions appear in **Transactions**, holdings are recomputed, and the row shows counts of **Rows**, **Success** and **Failed**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "File is too large" | File bigger than the upload limit (default 50 MB) | Split or compress the file |
| "Uploaded file content does not match its \"…\" extension (detected: …)." | The file's real type differs from its name (for example a renamed file) | Upload the original file |
| "This is a SEBI-mandated broker retention/compliance report — it contains no transactions or holdings to import. Zerodha sends these automatically; you can ignore them." | File name looks like a retention statement | Nothing to import; ignore the file |
| "This is a margin utilisation statement — it contains no importable transaction data." | File name contains "margin statement" | Nothing to import |
| "This appears to be a regulatory compliance document with no importable transaction data." | File name matches margin pledge, SEBI circular, annual report or welcome kit | Nothing to import |
| "Too many import requests" | More than 10 uploads or reprocesses in one minute | Wait a minute |
| "Internal server error" after dropping a file | A file with an unsupported extension (for example .docx) was dragged onto the box; the server rejects it without a mapped message | Use one of the supported formats |
| "Upload failed" | Network or other error | Try again |

**Limitations:** One file per upload; dropping several files uploads only the first. Re-uploading the exact same bytes creates a new job but adds no duplicate transactions (see [F-IMPORT-009](F-IMPORT-009.md)). Every PDF is labelled **CONTRACT NOTE PDF** in the **Type** column whatever it contains, every spreadsheet **GENERIC EXCEL** and every CSV/TSV **GENERIC CSV**; the real parser is chosen from the content ([F-IMPORT-008](F-IMPORT-008.md)). Unsupported extensions dropped on the box produce a generic "Internal server error" in production (logged in DOCUMENTATION_GAPS.md).

**How it works:** The browser posts the file as `multipart/form-data` (`file`, optional `portfolioId`) to `POST /api/imports`. Rate limit: 10 requests per minute per user (`importLimiter`). Multer stores the upload under `<UPLOAD_DIR>/imports/<userId>/<YYYY-MM>/` with a random name; the extension allow-list is .pdf, .csv, .tsv, .xlsx, .xls, .html, .htm. The server then (1) checks the file's magic bytes against the extension and, on mismatch, deletes the file, writes an ingestion-failure record (adapter `upload.contentVerification`) and rejects; (2) rejects regulatory documents by file name; (3) infers the stored type from the extension only (.pdf → CONTRACT_NOTE_PDF, .xlsx/.xls → GENERIC_EXCEL, else GENERIC_CSV); (4) checks the chosen portfolio belongs to you; (5) saves an encrypted copy of the bytes (`blobKey`) because the local disk is wiped on deploy; (6) creates the `ImportJob` row (status PENDING) and adds it to the Bull queue `imports` with the job id as the queue id. If Redis cannot take the job within 5 seconds the row stays PENDING and is re-queued at the next server start ([F-IMPORT-010](F-IMPORT-010.md)). Processing is described in [F-IMPORT-008](F-IMPORT-008.md).

**Related features:** [F-IMPORT-002](F-IMPORT-002.md) (history), [F-IMPORT-004](F-IMPORT-004.md) (passwords), [F-IMPORT-008](F-IMPORT-008.md) (pipeline), [F-IMPORT-009](F-IMPORT-009.md) (duplicates), [D-IMPORT-001](../dependencies.md#d-import-001) (mutual fund CAS card uses the same upload), [D-IMPORT-006](../dependencies.md#d-import-006) (Transactions).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:71`, `apps/web/src/pages/imports/ImportPage.tsx:155`, `apps/web/src/pages/imports/ImportDropzone.tsx:10`, `apps/web/src/pages/imports/ImportDropzone.tsx:48`, `apps/web/src/api/imports/imports.api.ts:17`, `packages/api/src/routes/imports.routes.ts:24`, `packages/api/src/middleware/upload.ts:18`, `packages/api/src/middleware/upload.ts:58`, `packages/api/src/middleware/rateLimit.ts:242`, `packages/api/src/controllers/imports.controller.ts:46`, `packages/api/src/controllers/imports.controller.ts:62`, `packages/api/src/controllers/imports.controller.ts:85`, `packages/api/src/services/imports/import.service.ts:74`, `packages/api/src/services/imports/import.service.ts:110`, `packages/api/src/services/imports/import.service.ts:132`, `packages/api/src/config/env.ts:58`, `packages/api/src/middleware/errorHandler.ts:111`
