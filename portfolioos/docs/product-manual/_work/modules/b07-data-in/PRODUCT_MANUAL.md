# EveryPaisa User Manual — Data in (B07 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Import (`/import`, hidden `/import/failures`), Email ingestion (`/ingestion`, `/ingestion/senders`, `/ingestion/history`), Gmail connection and inbox scans (`/gmail/callback`, `/gmail/scan-setup`, shell banner, scan shortcut), CAS (`/cas`), Documents (`/documents`), and the shared import pipeline behind them

## Contents
- [Import](#import)
- [Email ingestion](#email-ingestion)
- [Gmail connection and inbox scans](#gmail-connection-and-inbox-scans)
- [CAS](#cas)
- [Documents](#documents)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
## Import

The **Import** page (sidebar **Tools → Import**, route `/import`) is where you upload broker contract notes, CAS statements, back-office spreadsheets and other statements as files. Every file becomes an *import job* that runs in the background: the app works out what kind of document it is, reads the transactions out of it, adds them to a portfolio, and records what happened in **Import history**. The same pipeline also runs every file that arrives from your Gmail, from the mutual fund CAS upload card, and from inbox scans you approve, so this chapter is also the reference for how imported files are processed everywhere in the app.

### Upload a file <!-- F-IMPORT-001 -->
**What it does:** Sends one file (PDF, XLSX, XLS, CSV or TSV, up to 50 MB by default) to the server, optionally into a portfolio you choose, and starts a background import job for it. The page shows "File uploaded — import running in background" and the job appears at the top of **Import history**.

**Why it exists:** The page header states the purpose: "Upload contract notes, CAS statements, back-office CSVs or Excel files. Transactions will be parsed and added to your portfolio automatically." It saves you from typing every trade by hand.

**Where to find it:** **Tools → Import** (route `/import`), card **Upload a file**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (no plan gate). R-MANAGER uploads into the managed person's data. Signed-out visitors (R-VISITOR) are sent to sign in. Professionals (R-PROF) upload client files from the CA workspace, not here.

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

**Settings and toggles here:** S-IMPORT-001 **Target portfolio (optional)** — a chosen portfolio receives every transaction from the file; left empty, the server uses your portfolio marked default, else your first portfolio. It is not remembered between uploads.

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

**Limitations:** One file per upload; dropping several files uploads only the first. Re-uploading the exact same bytes creates a new job but adds no duplicate transactions (see F-IMPORT-009). Every PDF is labelled **CONTRACT NOTE PDF** in the **Type** column whatever it contains, every spreadsheet **GENERIC EXCEL** and every CSV/TSV **GENERIC CSV**; the real parser is chosen from the content (F-IMPORT-008). Unsupported extensions dropped on the box produce a generic "Internal server error" in production (logged in DOCUMENTATION_GAPS.md).

**How it works:** The browser posts the file as `multipart/form-data` (`file`, optional `portfolioId`) to `POST /api/imports`. Rate limit: 10 requests per minute per user (`importLimiter`). Multer stores the upload under `<UPLOAD_DIR>/imports/<userId>/<YYYY-MM>/` with a random name; the extension allow-list is .pdf, .csv, .tsv, .xlsx, .xls, .html, .htm. The server then (1) checks the file's magic bytes against the extension and, on mismatch, deletes the file, writes an ingestion-failure record (adapter `upload.contentVerification`) and rejects; (2) rejects regulatory documents by file name; (3) infers the stored type from the extension only (.pdf → CONTRACT_NOTE_PDF, .xlsx/.xls → GENERIC_EXCEL, else GENERIC_CSV); (4) checks the chosen portfolio belongs to you; (5) saves an encrypted copy of the bytes (`blobKey`) because the local disk is wiped on deploy; (6) creates the `ImportJob` row (status PENDING) and adds it to the Bull queue `imports` with the job id as the queue id. If Redis cannot take the job within 5 seconds the row stays PENDING and is re-queued at the next server start (F-IMPORT-010). Processing is described in F-IMPORT-008.

**Related features:** F-IMPORT-002 (history), F-IMPORT-004 (passwords), F-IMPORT-008 (pipeline), F-IMPORT-009 (duplicates), D-IMPORT-001 (mutual fund CAS card uses the same upload), D-IMPORT-006 (Transactions).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:71`, `apps/web/src/pages/imports/ImportPage.tsx:155`, `apps/web/src/pages/imports/ImportDropzone.tsx:10`, `apps/web/src/pages/imports/ImportDropzone.tsx:48`, `apps/web/src/api/imports/imports.api.ts:17`, `packages/api/src/routes/imports.routes.ts:24`, `packages/api/src/middleware/upload.ts:18`, `packages/api/src/middleware/upload.ts:58`, `packages/api/src/middleware/rateLimit.ts:242`, `packages/api/src/controllers/imports.controller.ts:46`, `packages/api/src/controllers/imports.controller.ts:62`, `packages/api/src/controllers/imports.controller.ts:85`, `packages/api/src/services/imports/import.service.ts:74`, `packages/api/src/services/imports/import.service.ts:110`, `packages/api/src/services/imports/import.service.ts:132`, `packages/api/src/config/env.ts:58`, `packages/api/src/middleware/errorHandler.ts:111`

### Import history <!-- F-IMPORT-002 -->
**What it does:** Lists your 50 most recent import jobs, newest first, with **File**, **Type**, **Status**, **Rows**, **Success**, **Failed**, **Uploaded** (date and time in IST) and per-row actions. It includes jobs started from this page, from the mutual fund CAS card, from Gmail attachments and from approved inbox-scan documents.

**Why it exists:** Inferred from behavior: imports run in the background, so you need one place to see whether each file finished, how many rows went in, and which need attention.

**Where to find it:** **Tools → Import** (route `/import`), card **Import history**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER sees the managed person's imports. Family view does not change the list: it always shows your own jobs.

**Steps**
1. Open **Tools → Import** and scroll to **Import history**.
2. Read each row's status chip. While any job is **Pending** or **Processing**, the list refreshes every 2 seconds on its own.
3. Click **Refresh** to reload the list at any time.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Reloads the list | Never |
| Status chip | Display / button | **Pending**, **Processing** (spinning icon), **Completed**, **Partial**, **Failed**, **Needs password** (clickable, see F-IMPORT-004) | Never |
| **Errors** / **Warnings** | Button | Opens the issues dialog (F-IMPORT-003) | Shown only when the job has failed rows, row errors or parser warnings, and is not **Needs password** |
| Download icon (label **Download** on phones) | Button | Downloads the original file (F-IMPORT-006) | Never |
| Reprocess icon (label **Reprocess** on phones) | Button | Runs the job again (F-IMPORT-005) | Disabled while a reprocess is running |
| Delete icon (label **Delete** on phones) | Button | Deletes the import record (F-IMPORT-007) | Disabled while a delete is running |
| Row checkbox / header checkbox | Toggle | Selects rows for bulk delete (F-IMPORT-007) | Never |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes; this is a read-only list.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No imports yet" — "Drag & drop a contract note or CAS PDF above to get started." | You have no import jobs | Upload a file (F-IMPORT-001) |
| A row shows **Failed** with no **Errors** button | The background worker stopped the job (timeout, crash or a restart) and recorded the reason in a field the page does not display | Click **Reprocess**, or upload the file again |
| A row stays **Pending** | The job queue (Redis) was unavailable when the file was uploaded | It is re-queued automatically when the server restarts; or click **Reprocess** |

**Limitations:** Only the 50 newest jobs are listed; older jobs are not reachable from the page. The **Type** column shows the type inferred from the file name, not the parser actually used. The row does not show which portfolio received the transactions.

**How it works:** `GET /api/imports` returns `ImportJob` rows for the signed-in user ordered by creation time, descending, limited to 50 (`take` capped at 200 in the service). Status labels come from a shared table: PENDING "Pending", PROCESSING "Processing", COMPLETED "Completed", COMPLETED_WITH_ERRORS "Partial", FAILED "Failed", NEEDS_PASSWORD "Needs password". The page polls every 2000 ms while any row is PENDING or PROCESSING and stops polling otherwise. **Rows** = events the parser produced; **Success** = transactions newly added; **Failed** = rows that could not be added; rows skipped as duplicates are counted in neither and shown in the issues dialog.

**Related features:** F-IMPORT-003, F-IMPORT-004, F-IMPORT-005, F-IMPORT-006, F-IMPORT-007, F-IMPORT-010, D-IMPORT-004 (data-quality banner lists unfinished imports).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:60`, `apps/web/src/pages/imports/ImportPage.tsx:189`, `apps/web/src/pages/imports/ImportPage.tsx:222`, `apps/web/src/pages/imports/ImportPage.tsx:276`, `apps/web/src/pages/imports/ImportPage.tsx:307`, `packages/shared/src/types/imports.ts:51`, `packages/api/src/services/imports/import.service.ts:162`

### Import issues dialog <!-- F-IMPORT-003 -->
**What it does:** Shows why rows of an import were not added: the parser used, a general error, how many rows were skipped as duplicates, the parser's warnings, and a table of **Row errors** with **Row** number and **Reason**.

**Why it exists:** Inferred from behavior: a partial or failed import is only fixable if you can see which rows failed and why.

**Where to find it:** **Tools → Import → Import history**, button **Errors** (or **Warnings** when there are only warnings) on a row.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person's imports.

**Steps**
1. In **Import history**, click **Errors** or **Warnings** on a row. The dialog "Import issues — <file name>" opens.
2. Read the sections shown. Close the dialog with the close button or by clicking outside it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Parser: <id>" | Display | Name of the parser that read the file (for example `zerodha.contract_note`) | Hidden when not recorded |
| General error box | Display | One error for the whole job, for example "No portfolio selected and user has no portfolios" | Hidden when none |
| "<n> row(s) skipped as duplicates — they were already imported from this file." | Display | Count of rows that already existed | Hidden when 0 |
| **Parser warnings** | List | Warnings from the parser | Hidden when none |
| **Row errors (<n>)** | Table | **Row**, **Reason** per failed row | Hidden when none |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Not imported — figures not found in the document: …" (row reason) | An AI-read row had a quantity, price, ISIN or date that is not present in the document text, so it was held back | Check the document and add the transaction by hand if it is real |
| "Asset class <CLASS> is outside what your professional may edit for this client." | The file was uploaded by a professional whose grant covers fewer asset classes | The account holder imports it, or widens the grant |
| "This PDF contains no extractable text — it looks like a scanned image. …" (warning) | Scanned/image PDF | Get a text-based PDF or a CSV/Excel export |
| "No parser accepted this file. Supported: CSV, Excel, Zerodha PDF, CAMS/KFintech CAS PDF, NSDL/CDSL depository CAS PDF." | No parser recognised the content | Use a supported statement |
| "CAS statement confirmed — no mutual fund transactions in the requested period. This is correct if you had no MF activity." | A valid CAS with no transactions; job marked **Completed** | Nothing to fix |

**Limitations:** Failures recorded by the background worker (timeouts, "Import was interrupted. Please upload the file again.") are stored but this dialog does not display them, and the button that opens it is not shown for such jobs.

**How it works:** The dialog reads the job's stored `errorLog` (fields `parser`, `general`, `skippedAsDuplicates`, `parserWarnings`, `rowErrors`). Row numbers are 1-based positions in the parser's output, not spreadsheet line numbers. The empty-CAS sentinel produced by the CAS parser is replaced by the friendly sentence above before saving.

**Related features:** F-IMPORT-002, F-IMPORT-008, F-IMPORT-009.

**Sources:** `apps/web/src/pages/imports/ImportErrorDialog.tsx:10`, `apps/web/src/pages/imports/ImportErrorDialog.tsx:30`, `apps/web/src/pages/imports/ImportErrorDialog.tsx:47`, `packages/api/src/services/imports/import.service.ts:396`, `packages/api/src/services/imports/import.service.ts:415`, `packages/api/src/services/imports/import.service.ts:524`, `packages/api/src/ingestion/fileImport/runner.ts:188`, `packages/api/src/ingestion/fileImport/runner.ts:222`, `packages/api/src/jobs/importWorker.ts:60`

### Unlock a password-protected import <!-- F-IMPORT-004 -->
**What it does:** When a PDF or Excel file is locked and none of the passwords the app tries automatically opens it, the job stops at **Needs password**. Clicking that chip opens a dialog where you type the password; the job is then processed again with it, and the password can be remembered for future files.

**Why it exists:** CAS statements and many broker and bank PDFs are encrypted (usually with your PAN or PAN plus date of birth). The upload screen says: "Password-protected PDFs: enter your PAN when prompted after upload."

**Where to find it:** **Tools → Import → Import history**, amber **Needs password** chip on a row.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person's imports.

**Steps**
1. Find the row with **Needs password** and click the chip. The dialog "Unlock <file name>" opens with the text "This file is password-protected. Enter the password to continue."
2. Type the password in **Password**.
3. Leave **Remember this password for future locked files** ticked to save it, or untick it.
4. Click **Unlock** (or press Enter). The dialog closes, a toast says "Password accepted — reprocessing", and the list reloads.
5. Check the row: it moves to **Completed**/**Partial**/**Failed** if the password worked, or stays **Needs password** if it did not.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Needs password** | Chip button | Opens the unlock dialog | Shown only for jobs in that status |
| **Password** | Password input | The file password (max 200 characters, trimmed) | Disabled while submitting |
| **Remember this password for future locked files** | Checkbox | Save the password for automatic use later | Disabled while submitting |
| **Cancel** | Button | Closes without trying | Disabled while submitting |
| **Unlock** | Button | Reprocesses the job with the password | Disabled while submitting or when the field is empty |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Password | Text (hidden) | Yes | 1–200 characters; spaces at the ends removed | Empty | None for a wrong password — see Limitations |
| Remember this password… | Checkbox | No | — | Ticked | — |

**Settings and toggles here:** S-IMPORT-002 **Remember this password for future locked files** — ticked: a password that unlocks the file is added to your saved file passwords (newest first, at most 10) and tried automatically on every later locked file; a password shaped like a PAN (five letters, four digits, one letter) is instead saved as your profile PAN if you have none. Unticked: the password is used once and not kept. Nothing is saved when the password does not unlock the file.

**Results:** The job runs again inline with the password. If it unlocks, transactions are added and the password may be saved as described above.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Password accepted — reprocessing" but the row is still **Needs password** | The password was wrong; the server reports success for the request itself | Click the chip again and try another password |
| Row warning "PDF is password-protected. Set your PAN (and date of birth if your statement uses PAN+DOB) in Settings, or enter the password directly." | No saved password or profile detail was available to try | Enter the password, or add PAN/date of birth in Settings |
| Row warning "PDF is password-protected and saved passwords did not unlock it. Enter the correct password to retry." | Automatic passwords were tried and failed | Enter the password |
| "Excel file is password-protected. Enter the password to unlock and import." | Encrypted XLSX | Enter the password |
| "Reprocessing timed out — try a smaller file" | The run took longer than 5 minutes | Split the file |
| "Too many import requests" | More than 10 reprocess/upload requests in a minute | Wait a minute |

**Limitations:** A wrong password closes the dialog with a success toast; you only see the failure in the row status. The password itself is never stored on the job; a job re-queued after a server restart asks for it again.

**How it works:** Before asking you, the pipeline tries, in order: any password passed with the request, your saved file passwords (encrypted list, at most 10), then candidates built from your profile — PAN; PAN + date of birth as DDMMYYYY; PAN + DDMM; DDMMYYYY; DD/MM/YYYY; DD + three-letter month + YYYY (for example 05Jan1990); your email in lower case; your phone digits (and the last 10 digits if longer). **Unlock** calls `POST /api/imports/:id/reprocess` with `{ password, save }`. The server runs the job inline (bounded at 5 minutes), then re-reads the job: if it is no longer NEEDS_PASSWORD the password counts as having worked and is persisted (PAN-shaped → encrypted profile PAN if empty; otherwise, when `save` is true, prepended to `User.savedFilePasswordsEnc`). A locked job gets no dead-letter record because it is expected to be resolved interactively.

**Related features:** F-IMPORT-005, F-IMPORT-008, D-IMPORT-007 (PAN and date of birth in Settings).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:46`, `apps/web/src/pages/imports/ImportPage.tsx:280`, `apps/web/src/components/upload/PasswordPromptDialog.tsx:63`, `apps/web/src/components/upload/PasswordPromptDialog.tsx:97`, `apps/web/src/hooks/useUploadWithPasswordRetry.ts:111`, `packages/api/src/controllers/imports.controller.ts:176`, `packages/api/src/controllers/imports.controller.ts:206`, `packages/api/src/controllers/imports.controller.ts:214`, `packages/api/src/lib/userDocPasswords.ts:5`, `packages/api/src/lib/userDocPasswords.ts:47`, `packages/api/src/lib/decryptIfNeeded.ts:187`, `packages/api/src/lib/pdf.ts:92`, `packages/api/src/lib/pdf.ts:119`, `packages/api/src/ingestion/fileImport/runner.ts:168`, `packages/api/src/services/imports/import.service.ts:247`

### Reprocess an import <!-- F-IMPORT-005 -->
**What it does:** Runs an existing import job again from its stored copy of the file, without re-uploading. Rows already imported are skipped, so only missing rows are added.

**Why it exists:** Inferred from behavior and code comments: a job may fail for a temporary reason or because a parser has since been fixed; reprocessing recovers it safely because every imported row carries a deterministic fingerprint.

**Where to find it:** **Tools → Import → Import history**, reprocess (circular arrows) icon on a row; labelled **Reprocess** on phones.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person's imports.

**Steps**
1. Click the reprocess icon on the row. The icon is disabled while the request runs (this can take up to 5 minutes for a large file).
2. When it returns, a toast says "Reprocessing started" and the list reloads with the new counts.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Reprocess icon (tooltip "Reprocess") | Button | Re-runs the job | Disabled while any reprocess request is in flight |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The job's status, counts and issues are replaced with the new run's results. New rows are added; existing ones are counted as skipped duplicates.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Reprocessing timed out — try a smaller file" | Run exceeded 5 minutes | Split the file |
| "Source file not found on server" (download) / reprocess fails | Very old jobs stored only on local disk lost their file in a deploy | Upload the file again |
| "Reprocess failed" | Other error | Try again later |

**Limitations:** The toast appears only after the run has finished, despite saying "started". The job keeps its original target portfolio.

**How it works:** `POST /api/imports/:id/reprocess` (rate-limited, 10/min) calls the same processing function as the worker, inline, raced against a 5-minute timer. The encrypted copy is decrypted to a temporary local file for the parsers and removed again afterwards.

**Related features:** F-IMPORT-004, F-IMPORT-008, F-IMPORT-009, F-IMPORT-010.

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:90`, `apps/web/src/pages/imports/ImportPage.tsx:331`, `packages/api/src/routes/imports.routes.ts:28`, `packages/api/src/controllers/imports.controller.ts:191`, `packages/api/src/services/imports/import.service.ts:191`

### Download the source file <!-- F-IMPORT-006 -->
**What it does:** Downloads the original file of an import job under its original file name.

**Why it exists:** Inferred from behavior: lets you check exactly what was imported or re-use the file elsewhere.

**Where to find it:** **Tools → Import → Import history**, download icon (tooltip "Download source file"; label **Download** on phones).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person's imports.

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

**Related features:** F-IMPORT-002, F-IMPORT-007.

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:320`, `apps/web/src/api/imports/imports.api.ts:46`, `packages/api/src/controllers/imports.controller.ts:237`

### Delete import records <!-- F-IMPORT-007 -->
**What it does:** Removes one import record, or several selected ones, from **Import history** together with its stored file. The transactions the import created are kept.

**Why it exists:** Inferred from behavior: tidies the history (for example failed or duplicate uploads) without losing data.

**Where to find it:** **Tools → Import → Import history**: delete (bin) icon on a row, or tick rows and click **Delete selected**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER for the managed person's imports.

**Steps**
1. Single row: click the bin icon. Confirm "Delete this import record? Transactions will be kept." The toast "Import removed" appears.
2. Several rows: tick the row checkboxes (or the header checkbox for all). The header shows "<n> selected", **Delete selected** and **Clear**.
3. Click **Delete selected** and confirm "Delete <n> import record(s)? Transactions will be kept.". A toast says "Deleted <n> import(s)" or "<n> deletions failed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Bin icon (tooltip "Delete") | Button | Deletes one record after confirmation | Disabled while a single delete runs |
| Row checkbox | Toggle | Selects the row | Never |
| Header checkbox | Toggle | Selects or clears all listed rows | Never |
| **Delete selected** | Button | Deletes all selected after confirmation | Shown only when something is selected; disabled while deleting |
| **Clear** | Button | Clears the selection | Shown only when something is selected |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The `ImportJob` row and its stored copies are deleted. Transactions stay, but lose their link to the import (they no longer show which file they came from).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Remove failed" | Server error | Try again |
| "<n> deletions failed" | Some of the bulk deletions failed | Retry the remaining rows |

**Limitations:** There is no option to delete the transactions together with the import; delete them from **Transactions** instead. Bulk delete sends one request per row.

**How it works:** `DELETE /api/imports/:id` checks ownership, sets `importJobId` to null on every transaction of that job, deletes the job row, then deletes the local file and the encrypted copy (best effort).

**Related features:** F-IMPORT-002, D-IMPORT-006.

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:117`, `apps/web/src/pages/imports/ImportPage.tsx:191`, `apps/web/src/pages/imports/ImportPage.tsx:342`, `packages/api/src/services/imports/import.service.ts:171`, `packages/api/src/services/imports/import.service.ts:177`

### How imported files are read (parsers) <!-- F-IMPORT-008 -->
**What it does:** Every import job — from the Import page, the mutual fund CAS card, a Gmail attachment or an approved inbox-scan document — goes through one pipeline: unlock the file, recognise the document type, extract transactions, and add them to a portfolio.

**Why it exists:** Code comments describe the design: one adapter interface with versioned parsers so every imported row records which parser produced it, and failures are kept for review instead of crashing the import.

**Where to find it:** Automatic. Results appear in **Tools → Import → Import history** and in **Overview → Transactions**.

**Who can use it:** Runs for every user's import jobs (R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER on behalf of the managed person).

**Steps:** Not applicable — automatic. Upload a file (F-IMPORT-001) and the steps below run on their own.

**Controls:** None — this is background processing.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-IMPORT-001 (target portfolio) decides where rows land.

**Results:** Transactions are created with the parser name and version recorded on each row; holdings for affected assets are recomputed; insurance-premium rows are linked to a matching policy when the policy number matches exactly; the job gets its final status.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Job **Failed** with warning "No parser accepted this file. …" | Content not recognised | Use a supported statement |
| Job **Failed**, general error "No portfolio selected and user has no portfolios" | You have no portfolio | Create a portfolio, then **Reprocess** |
| "File type … is not allowed for upload." / "Detected file type (…) does not match what this upload accepts." | Archive, video, image or other type | Upload a PDF, Excel or CSV |
| Some rows "Not imported — figures not found in the document: …" | AI-read figures not present in the document text | Check and enter by hand |

**Limitations:** Scanned (image-only) PDFs are not read. The AI contract-note parser and the AI CAS fallback run only when the operator has configured them (see Settings reference → Operator configuration); otherwise those documents yield no rows. Insurance premiums are auto-linked only on an exact policy-number match.

**How it works:**
1. *Unlock and sniff.* The file's magic bytes decide its real kind (PDF, XLSX, encrypted XLSX, XLS, CSV); other kinds are rejected as junk. Locked files are tried with the passwords listed in F-IMPORT-004; still locked → status NEEDS_PASSWORD. A PDF with no text → warning "This PDF contains no extractable text …".
2. *Pick a parser,* in this fixed order, the first that accepts the content wins: Zerodha contract note (`zerodha.contract_note` v1: text has "CONTRACT NOTE"/"CONFIRMATION OF TRADE" and "ZERODHA"/"TRADING MEMBER"/"SEBI REGISTRATION"); generic broker contract note (`broker.contract_note.generic` v1, AI-read with Claude Haiku, for other brokers); NSDL/CDSL depository CAS (`cas.depository.nsdl_cdsl` v2); CAMS/KFintech mutual fund CAS (`cas.mf.cams_kfintech` v1, with an AI fallback using Gemini when the regular reader finds no trades and `GEMINI_API_KEY` is set); FD certificate (`fd.certificate.pdf`, 2+ keywords); insurance statement (`insurance.statement.pdf`, 3+ keywords, not a bank/account statement); salary slip (`salary.slip.pdf`, 3+ keywords); bank statement (`bank.statement.pdf`, 3+ keywords, not a contract note or CAS); generic Excel (`generic.excel`, any .xlsx/.xls, first sheet converted to CSV); generic CSV (`generic.csv`, any .csv/.tsv).
3. *Verify AI-read rows.* For parsers that return their source text, each row's quantity, price, ISIN and date must be found in the document; otherwise the row is held back as a failed row.
4. *Choose the portfolio:* the job's target, else your default portfolio, else your first portfolio.
5. *Write rows.* Trades are written first; depository "Opening holding from …" rows go last and add only the units your existing transactions (across all portfolios) do not already explain, to 3 decimal places. Each row is created through the normal transaction service with duplicate protection (F-IMPORT-009). A row that throws becomes a row error and an ingestion-failure record.
6. *Final status:* empty-CAS sentinel → COMPLETED; no rows and some warnings → FAILED; no failed rows → COMPLETED; failed rows and nothing added or skipped → FAILED; otherwise COMPLETED_WITH_ERRORS (shown **Partial**). A depository statement's closing position is saved for the nightly statement reconciliation. If the job came from an inbox-scan document, that document's status is mirrored (IMPORTED or PARSE_FAILED).

**Related features:** F-IMPORT-004, F-IMPORT-009, F-IMPORT-010, F-MAIL-003, F-MAIL-006, D-IMPORT-001, D-IMPORT-005, D-IMPORT-006.

**Sources:** `packages/api/src/ingestion/fileImport/runner.ts:21`, `packages/api/src/ingestion/fileImport/runner.ts:139`, `packages/api/src/ingestion/fileImport/adapters.ts:170`, `packages/api/src/ingestion/fileImport/adapters.ts:239`, `packages/api/src/ingestion/fileImport/parsers/zerodhaContractNote.parser.ts:85`, `packages/api/src/ingestion/fileImport/parsers/mfCas.parser.ts:116`, `packages/api/src/ingestion/fileImport/parsers/bankStatement.parser.ts:104`, `packages/api/src/lib/decryptIfNeeded.ts:213`, `packages/api/src/services/imports/import.service.ts:343`, `packages/api/src/services/imports/import.service.ts:385`, `packages/api/src/services/imports/import.service.ts:420`, `packages/api/src/services/imports/import.service.ts:470`, `packages/api/src/services/imports/import.service.ts:503`, `packages/api/src/services/imports/import.service.ts:539`

### Duplicate protection on imports <!-- F-IMPORT-009 -->
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

**Related features:** F-IMPORT-001, F-IMPORT-005, F-IMPORT-008, F-MAIL-006.

**Sources:** `packages/api/src/services/imports/import.service.ts:83`, `packages/api/src/services/imports/import.service.ts:95`, `packages/api/src/services/imports/import.service.ts:326`, `packages/api/src/services/imports/import.service.ts:433`, `packages/api/src/services/imports/import.service.ts:454`, `apps/web/src/pages/imports/ImportErrorDialog.tsx:30`

### Background processing and automatic recovery <!-- F-IMPORT-010 -->
**What it does:** Runs import jobs in a background queue and repairs jobs that get stuck or fail: re-queues jobs left **Pending**, marks long-dead **Processing** jobs as **Failed**, and automatically retries **Failed** and **Partial** jobs up to three times.

**Why it exists:** Code comments explain it: before this, a failed file was a dead end until someone pressed Reprocess, and an outage once left weeks of statements silently missing.

**Where to find it:** Automatic. Effects show in **Tools → Import → Import history** (status changes) and in the reports data-quality banner (D-IMPORT-004).

**Who can use it:** Runs for every user.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None for users. Operators can disable the worker (`ENABLE_IMPORT_WORKER=false`) — see Operator configuration.

**Results:** Stuck jobs move on; recoverable failures heal without your action; persistently failing jobs stop being retried after three attempts and stay visible.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Job **Failed** after a deploy (reason "Import was interrupted. Please upload the file again." stored but not displayed) | The job was **Processing** for over an hour with no live queue job | Click **Reprocess** or upload again |
| Job stays **Needs password** after a restart | Passwords are never saved on the job | Enter it again (F-IMPORT-004) |

**Limitations:** The recovery reason is not shown on the Import page (see F-IMPORT-003 Limitations). Auto-retry waits at least one hour after a job finished before retrying it.

**How it works:** The worker processes queue `imports` with concurrency 2, one attempt per job, a 5-minute timeout and a 5-minute lock; a job running longer than 60 seconds is logged as slow. When a queue job fails terminally the `ImportJob` is set to FAILED with `workerError` and `timedOut`. At worker start: up to 100 PENDING jobs are re-queued (each add waits at most 5 seconds for Redis); up to 200 PROCESSING jobs created more than 60 minutes ago with no live queue job are marked FAILED ("Import was interrupted. Please upload the file again."). Ingestion recovery runs 2 minutes after every server start and nightly at 02:15 IST (inside the data-integrity job): every FAILED or COMPLETED_WITH_ERRORS job with a stored copy, finished more than 60 minutes ago, is re-run as its owner (5-minute bound each) until it has been auto-retried 3 times (`errorLog.autoRetries`); a job that comes back COMPLETED with no failed rows also resolves its earlier row-level failure records. A one-time recovery (marker `ingestion.recover.2026-10-upload-dir`) rewound IMAP mailbox cursors to 2026-09-16 after an upload-directory outage.

**Related features:** F-IMPORT-002, F-IMPORT-005, F-IMPORT-008, D-IMPORT-004, D-IMPORT-005.

**Sources:** `packages/api/src/jobs/importWorker.ts:24`, `packages/api/src/jobs/importWorker.ts:47`, `packages/api/src/jobs/importWorker.ts:88`, `packages/api/src/jobs/importWorker.ts:91`, `packages/api/src/jobs/importWorker.ts:144`, `packages/api/src/lib/queue.ts:40`, `packages/api/src/services/imports/ingestionRecovery.service.ts:30`, `packages/api/src/services/imports/ingestionRecovery.service.ts:33`, `packages/api/src/services/imports/ingestionRecovery.service.ts:99`, `packages/api/src/services/imports/ingestionRecovery.service.ts:171`, `packages/api/src/index.ts:245`, `packages/api/src/jobs/dataIntegrityJob.ts:60`, `packages/api/src/jobs/dataIntegrityJob.ts:175`

### What this area doesn't do
- You can't upload more than one file at a time on the Import page (only the first dropped file is sent).
- You can't map columns or preview rows before they are added; parsing and adding happen in one step.
- You can't delete the transactions of an import from **Import history**; deleting an import keeps its transactions.
- You can't change an import's target portfolio after upload.
- You can't read scanned (image-only) PDFs.
- The list of failed rows across all imports (the "Ingestion failures" page) exists but is not linked anywhere in the app.

## Email ingestion

**Email ingestion** (sidebar **Inbox → Connect your Gmail**, route `/ingestion`) reads the *text* of emails from banks, brokers and insurers you choose ("monitored senders") and turns each transaction alert into an *event* — a buy, sell, dividend, UPI credit, card spend and so on. Events wait in **Pending review** until you approve them; approving writes a transaction or a cash-flow entry. A sender you trust can be set to *auto-commit*, so its events are written without review. The page is laid out in three numbered steps: 1 connect your email, 2 choose senders, 3 review events. Email *attachments* (statements, contract notes) are handled separately by the Gmail attachment import (F-MAIL-006) and the Import pipeline.

### Email ingestion page and status strip <!-- F-INGEST-001 -->
**What it does:** Shows the page "Email ingestion" with a status strip — **Gmail connected** / **Connect Gmail**, "<n> sender(s)" / **Add senders**, and once both exist "<n> event(s) to review" / **Inbox clear** — then the three steps: **Connect your email** (or **Email accounts**), **Senders to monitor** and **Pending review**.

**Why it exists:** The header says: "Automatically capture transactions from your bank, broker, and insurer emails. Everything is reviewable before it lands in your records." A code comment describes it as one screen that walks you through connect → pick senders → review.

**Where to find it:** **Inbox → Connect your Gmail** (route `/ingestion`). Old addresses `/mailboxes`, `/ingestion/review` and `/ingestion/discovery` redirect here.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER: the email-account parts fail with "Switch back to your own account to do this." because Gmail is an account-level connection.

**Steps**
1. Open **Inbox → Connect your Gmail**.
2. Read the status strip to see which step is next.
3. Click **Refresh** (top right) to reload accounts, senders and events.
4. Click **Sender settings** to open the full sender list (F-INGEST-006).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Reloads email accounts, senders and events | Never |
| Status chips | Display | Progress through the three steps | The review chip is hidden until Gmail and at least one sender exist |
| **Sender settings** | Link | Opens `/ingestion/senders` | Never |
| Step 2 placeholder "Senders to monitor" — "Available once Gmail is connected …" | Display | Keeps the numbering while Gmail is not connected | Hidden once a Gmail account exists |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this part of the page.

**Results:** Nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Switch back to your own account to do this." | You are managing a family member's account | Click **Back to my account** |

**Limitations:** The page header promises everything is reviewable, but senders added from this page or the senders page start with auto-commit switched on, so their confident events are written without review (see F-INGEST-006 and DOCUMENTATION_GAPS.md).

**How it works:** The page loads `GET /api/mailboxes` (only accounts with provider GMAIL_OAUTH are shown), `GET /api/monitored-senders`, and `GET /api/canonical-events?status=PARSED&limit=200` plus `?status=PENDING_REVIEW&limit=200`. The pending count is the size of those two lists combined.

**Related features:** F-MAIL-001, F-MAIL-002, F-INGEST-002, F-INGEST-004, F-INGEST-006, F-INGEST-007.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:62`, `apps/web/src/pages/ingestion/IngestionPage.tsx:168`, `apps/web/src/pages/ingestion/IngestionPage.tsx:259`, `apps/web/src/pages/ingestion/IngestionPage.tsx:320`, `apps/web/src/App.tsx:268`, `apps/web/src/App.tsx:275`, `packages/api/src/services/family/managedProfile.service.ts:45`

### Discover financial senders <!-- F-INGEST-002 -->
**What it does:** Scans a connected Gmail inbox for senders that look financial, scores them, and lists the ones you do not monitor yet; you tick the ones to watch and add them in one click.

**Why it exists:** The card explains: "Only addresses on this list are fetched. Scan your inbox for financial senders, then pick the ones you want us to watch." It saves you from finding each bank's alert address yourself.

**Where to find it:** **Inbox → Connect your Gmail**, step **2 Senders to monitor**, one box per connected Gmail account.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with a connected Gmail. Not available to R-MANAGER.

**Steps**
1. Click **Scan inbox** on the account's box. The button shows "Scanning…". When done, a toast says "Found <n> financial sender(s)" or "Scan complete — no financial senders found".
2. Review the table: **Sender** (name and address), **Match** (a known institution name, or "Unknown — review manually"), **Score**, **Mail** (messages seen).
3. Tick the senders to watch (click a row or its checkbox; the header checkbox selects all).
4. Click **Add <n> senders**. A toast says "Added <n> sender(s)" (and "· <m> failed" if some failed).
5. Click **Re-scan** to scan again later.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan inbox** / **Re-scan** | Button | Runs the discovery scan | Disabled while scanning |
| "· <n> new candidate(s)" | Display | Count of results not yet monitored | Shown after a scan |
| **Select all** (header checkbox) | Checkbox | Selects all candidates | Shown when there are candidates |
| Row checkbox / row click | Toggle | Selects a sender | — |
| **Add <n> senders** | Button | Adds the selected senders | Disabled when nothing is selected or while adding |

**Fields and rules:** Not applicable — selection only.

**Settings and toggles here:** Adding a sender creates it with S-INGEST-001 (Active) on, S-INGEST-002 (Auto-commit) on and S-INGEST-003 threshold 5; its display label is the matched institution's suggested label or the sender's display name.

**Results:** Each added address becomes a monitored sender. From the next poll, emails from it are read and turned into events (F-INGEST-008).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No financial senders detected in this inbox." | Nothing scored at least 3 | Add a sender manually (F-INGEST-006) |
| "Every detected sender is already on your monitor list." | All results are already monitored | Nothing to do |
| "Scan failed" / "Gmail account not found" | Gmail access lost or account removed | Reconnect Gmail (F-MAIL-001) |
| "All <n> add operations failed" / "Sender <address> is already monitored" | Sender exists already | Nothing to do |

**Limitations:** The scan looks at up to 1,000 messages from the last 730 days (2 years). Senders are added with auto-commit already on. Known-institution matching is by exact address only.

**How it works:** `GET /api/gmail/:id/discover` searches the inbox with `newer_than:730d -in:trash -in:spam` plus a financial keyword query, reads each message's sender, subject and snippet, and scores each sender: 2 × keyword score of each subject + keyword score of each snippet; senders scoring below 3 are dropped. Results are sorted by score, then by message count, and matched against built-in institution seeds. The text on the card says scoring uses subject keywords; the code also scores message snippets. Adding calls `POST /api/monitored-senders` once per selected sender.

**Related features:** F-INGEST-003, F-INGEST-006, F-INGEST-008, F-MAIL-001.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:495`, `apps/web/src/pages/ingestion/IngestionPage.tsx:556`, `apps/web/src/pages/ingestion/IngestionPage.tsx:570`, `apps/web/src/pages/ingestion/IngestionPage.tsx:652`, `apps/web/src/pages/ingestion/IngestionPage.tsx:658`, `apps/web/src/pages/ingestion/IngestionPage.tsx:781`, `packages/api/src/controllers/gmail.controller.ts:75`, `packages/api/src/ingestion/gmail/discovery.ts:239`, `packages/api/src/ingestion/gmail/discovery.ts:251`, `packages/api/src/ingestion/gmail/keywords.ts:36`, `packages/api/src/ingestion/gmail/keywords.ts:153`

### Currently monitored senders (on the ingestion page) <!-- F-INGEST-003 -->
**What it does:** Lists your monitored senders under "Currently monitored (<n>)" with their label, address, an **Auto** badge when auto-commit is on, and **Active**/**Paused**, with a remove button for each.

**Why it exists:** Inferred from behavior: lets you see and prune the allow-list without leaving the setup page.

**Where to find it:** **Inbox → Connect your Gmail**, step **2 Senders to monitor**, below the scan boxes.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with Gmail connected.

**Steps**
1. Find the sender in the list.
2. Click the bin icon (tooltip "Remove sender") and confirm "Remove <address>?". The toast "Sender removed" appears.
3. Click **Auto-commit settings** to open the full senders page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Auto-commit settings** | Link | Opens `/ingestion/senders` | Never |
| Bin icon | Button | Removes the sender after confirmation | Disabled while removing |
| **Auto** badge, **Active**/**Paused** | Display | Current settings | — |

**Fields and rules:** None.

**Settings and toggles here:** Shows S-INGEST-001 and S-INGEST-002; change them on the senders page.

**Results:** Removing stops future fetching from that address. Past events stay.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No senders yet. Scan above, or add manually from the settings page." | Empty list | Scan or add a sender |
| "Could not remove sender" | Server error | Try again |

**Limitations:** The whole step is hidden until a Gmail account is connected.

**How it works:** `DELETE /api/monitored-senders/:id` deletes the row after checking ownership; events from that sender are not deleted.

**Related features:** F-INGEST-002, F-INGEST-006.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:514`, `apps/web/src/pages/ingestion/IngestionPage.tsx:798`, `apps/web/src/pages/ingestion/IngestionPage.tsx:840`, `packages/api/src/services/gmail/monitoredSenders.service.ts:137`

### Pending review queue <!-- F-INGEST-004 -->
**What it does:** Lists events read from your monitored senders that are waiting for you, grouped by sender. You approve (write it to your records) or reject each one, approve all events of a sender at once, or open an event to see every extracted detail.

**Why it exists:** The card says: "Events parsed from your monitored senders, waiting for your approval before they land as transactions."

**Where to find it:** **Inbox → Connect your Gmail**, step **3 Pending review**. The same queue is the **Pending review** tab of **See committed / rejected** (F-INGEST-007).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER can act on the managed person's events but that person has no Gmail connection, so the list is normally empty.

**Steps**
1. Read each row: date, event type (for example **UPI_CREDIT**), counterparty or instrument, the parser's note, and amount in ₹.
2. Click the tick to approve. The toast says "Event approved and committed", or "Approval rolled back — projection failed: <reason>" if the event could not be written.
3. Click the cross to reject. The toast says "Event rejected".
4. To approve every event of a sender with more than one waiting, click **Approve all** in its group header. The toast says "Bulk approved: <a> succeeded, <f> failed of <n>".
5. Click a row to open "Event details". There you can type an optional **Rejection reason** and click **Reject**, or click **Approve & commit**. Gmail events have a **View original in Gmail** link.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Tick icon | Button | Approve and commit the event | Disabled while that event is being approved |
| Cross icon | Button | Reject the event | Disabled while that event is being rejected |
| **Approve all** | Button | Approve all waiting events of that sender | Shown only for a known sender with 2+ events; disabled during a bulk approve |
| Row | Click | Opens "Event details" | — |
| **Rejection reason (optional)** | Text | Reason stored with the rejection | Shown only for events still waiting |
| **Reject** / **Approve & commit** | Buttons | As above | Disabled while an action runs; shown only for waiting events |
| **View original in Gmail** | Link | Opens the email in Gmail (account /u/0) in a new tab | Shown only for Gmail events |
| **See committed / rejected** | Link | Opens `/ingestion/history` | Never |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Rejection reason | Text | No | Up to 500 characters (server) | Empty | "Validation failed" when longer |

**Settings and toggles here:** S-INGEST-002 decides which events skip this queue.

**Results:** Approve: the event becomes CONFIRMED, the sender's approved count goes up by one, and the event is written (F-INGEST-009); on success it becomes PROJECTED and leaves the queue. Reject: the event becomes REJECTED with your reason and moves to the history's **Rejected / failed** tab.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Inbox is clear" — "Nothing waiting for review. New emails from your monitored senders will show up here (poller runs every 10 minutes)." | Nothing waiting | None (the default poll interval is actually 3 minutes) |
| "Connect Gmail to start receiving events" / "Add at least one sender to start receiving events" | Setup incomplete | Complete steps 1 and 2 |
| "Approval rolled back — projection failed: BUY requires amount and quantity to project" (or SELL) | The trade has no amount or quantity | Reject it and add the trade by hand |
| "Approval rolled back — projection failed: User has no portfolio to project this event into" | No portfolio | Create a portfolio, then approve again |
| "Canonical event in status <STATUS> cannot be approved" | Already handled (for example in another tab) | Click **Refresh** |

**Limitations:** Events cannot be edited before approval in the app (the edit API exists but has no screen). "View original in Gmail" opens the first Gmail account signed in on your browser (`/u/0`), which may not be the connected one. Each status list loads at most 200 events. The rejection reason box keeps its text when you open another event.

**How it works:** Approve calls `POST /api/canonical-events/:id/approve`: only PARSED or PENDING_REVIEW events are accepted; in one database transaction the event becomes CONFIRMED and the matching sender's `confirmedEventCount` is incremented; projection then runs outside the transaction; if projection fails the event goes back to its previous status (the sender count stays incremented). Reject calls `POST /api/canonical-events/:id/reject` with an optional reason (max 500). **Approve all** calls `POST /api/canonical-events/bulk-approve` with the sender address (must be a valid email) and approves every PARSED/PENDING_REVIEW event of that sender one by one. The list sorts by event date, then creation time, newest first.

**Related features:** F-INGEST-005, F-INGEST-007, F-INGEST-008, F-INGEST-009.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:110`, `apps/web/src/pages/ingestion/IngestionPage.tsx:137`, `apps/web/src/pages/ingestion/IngestionPage.tsx:902`, `apps/web/src/pages/ingestion/IngestionPage.tsx:967`, `apps/web/src/pages/ingestion/IngestionPage.tsx:988`, `apps/web/src/pages/ingestion/IngestionPage.tsx:1128`, `apps/web/src/pages/ingestion/IngestionPage.tsx:1163`, `packages/api/src/controllers/canonicalEvents.controller.ts:48`, `packages/api/src/controllers/canonicalEvents.controller.ts:52`, `packages/api/src/services/imports/canonicalEvents.service.ts:50`, `packages/api/src/services/imports/canonicalEvents.service.ts:178`, `packages/api/src/services/imports/canonicalEvents.service.ts:239`, `packages/api/src/services/imports/canonicalEvents.service.ts:275`, `packages/api/src/config/env.ts:91`

### Auto-commit offer <!-- F-INGEST-005 -->
**What it does:** When a sender without auto-commit reaches its approval threshold (default 5 approved events), a banner offers to trust it: "<sender> has <n> confirmed events. Trust it and skip review next time?" with **Enable auto-commit**. On the history page, the approval that crosses the threshold also shows a toast "<address> is reliable. Enable auto-commit on the Senders page." with **Go**.

**Why it exists:** Inferred from behavior and code comments: let a sender earn trust through manual approvals before its events skip review.

**Where to find it:** **Inbox → Connect your Gmail**, top of step **3 Pending review**; and the **Pending review** tab of `/ingestion/history`.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. When the banner appears, click **Enable auto-commit**. The toast "Auto-commit enabled" appears and the banner disappears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Enable auto-commit** | Button | Turns on auto-commit for that sender | Disabled while saving; banner shown only for active senders with auto-commit off and approved count ≥ threshold |
| **Go** (toast) | Button | Opens the senders page | Toast lasts 10 seconds |

**Fields and rules:** None.

**Settings and toggles here:** S-INGEST-002 **Auto-commit** (turned on here) and S-INGEST-003 (the threshold).

**Results:** Future confident events from that sender are written without review.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Approve <n> more event(s) from this sender before enabling auto-commit." | Threshold not reached | Approve more events first |
| "Could not enable auto-commit" | Other error | Try again |

**Limitations:** Because new senders start with auto-commit on, the banner appears only for senders whose auto-commit you turned off.

**How it works:** `PATCH /api/monitored-senders/:id` with `{ autoCommitEnabled: true }`; the server refuses when `confirmedEventCount < autoCommitAfter`.

**Related features:** F-INGEST-004, F-INGEST-006, F-INGEST-007.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:98`, `apps/web/src/pages/ingestion/IngestionPage.tsx:930`, `apps/web/src/pages/ingestion/ReviewPage.tsx:149`, `apps/web/src/pages/ingestion/ReviewPage.tsx:216`, `packages/api/src/controllers/monitoredSenders.controller.ts:54`

### Monitored senders page <!-- F-INGEST-006 -->
**What it does:** The page "Monitored senders" lists every sender with its approval progress and lets you add a sender by hand, switch auto-commit, pause or resume polling, and delete it.

**Why it exists:** The header says: "The email addresses we scan for financial events. Only senders listed here are polled — everything else is ignored."

**Where to find it:** **Inbox → Connect your Gmail → Sender settings** (or **Auto-commit settings**), route `/ingestion/senders`.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. To add a sender, fill **Email address** (a full address or `@domain.com`), optionally **Display label (optional)** and **Auto-commit after N confirmed events**, then click **Add sender**. The toast "Sender added" appears.
2. In **Configured senders**, each row shows label, **Active**/**Paused**, an **Auto-commit** badge when on, the address, "<approved> / <threshold> approved", and "last fetched <date time>" or "never fetched", with a progress bar.
3. Click the lightning icon to switch auto-commit on or off.
4. Click the power icon to pause or resume polling.
5. Click the bin icon and confirm "Remove <address>? This won't delete past events." to delete.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Email address** | Text | Sender to add; placeholder "alerts@hdfcbank.net or @hdfcbank.net" | — |
| **Display label (optional)** | Text | Friendly name; placeholder "HDFC Bank alerts" | — |
| **Auto-commit after N confirmed events** | Number | Threshold for the auto-commit offer | — |
| **Add sender** | Button | Creates the sender | Disabled when the address is empty or while saving |
| Lightning icon (tooltip "Disable auto-commit", "Enable auto-commit" or "Approve <n> more to enable") | Button | Toggles auto-commit | Disabled while saving |
| Power icon (tooltip "Pause polling" / "Resume polling") | Button | Toggles active | Disabled while saving |
| Bin icon | Button | Deletes the sender after confirmation | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Email address | Text | Yes | A full email address or the `@domain` form, stored in lower case | Empty | "Invalid sender address \"<value>\". Expected \"user@host\" or \"@host\"."; "Sender <address> is already monitored" |
| Display label | Text | No | Up to 120 characters | Empty | "Validation failed" |
| Auto-commit after N confirmed events | Number | No | Whole number 1–100 | 5 | "Validation failed" |

**Settings and toggles here:** S-INGEST-001 **Active** (power icon) — on: the sender's emails are fetched each poll; off ("Paused"): ignored. S-INGEST-002 **Auto-commit** (lightning) — on: confident events (confidence 0.70 or more, all figures found in the email) are written without review; off: every event waits in **Pending review**; it starts **on** for every new sender. S-INGEST-003 **Auto-commit after N confirmed events** — how many approvals are needed before auto-commit can be switched back on. S-INGEST-004 **Display label** — name shown instead of the address.

**Results:** Changes apply from the next poll. Deleting stops fetching and keeps past events.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Approve <n> more event(s) from this sender before enabling auto-commit." | Turning auto-commit back on before the threshold | Approve more events |
| "Could not add sender" / "Update failed" / "Could not remove sender" | Server error | Try again |
| A sender shows an empty name | Added with the label box left as an empty string | Delete and re-add, or type a label |
| `@domain` sender never produces events | Domain-form senders are fetched but never matched to emails (confirmed defect) | Add the full alert address instead |

**Limitations:** A sender's address cannot be edited (delete and re-add). The page has no way to edit the display label or threshold after creation. A sender added in `@domain.com` form is included in the Gmail search but its emails are never matched back to it, so they are never parsed (logged in DOCUMENTATION_GAPS.md). Pausing a sender also stops its emails being used to relax the attachment-name filter (F-MAIL-006).

**How it works:** `POST /api/monitored-senders` (address, displayLabel, autoCommitAfter 1–100) normalises the address, refuses duplicates per user, fills a missing label from the institution seed, and creates the sender with `autoCommitEnabled = true` unless the caller says otherwise (this page never says otherwise). `PATCH /api/monitored-senders/:id` updates `isActive`, `autoCommitEnabled`, `displayLabel` or `autoCommitAfter`; turning auto-commit on is refused below the threshold. The list is ordered active first, then by address.

**Related features:** F-INGEST-002, F-INGEST-003, F-INGEST-005, F-INGEST-008, F-MAIL-006.

**Sources:** `apps/web/src/pages/ingestion/SendersPage.tsx:20`, `apps/web/src/pages/ingestion/SendersPage.tsx:70`, `apps/web/src/pages/ingestion/SendersPage.tsx:88`, `apps/web/src/pages/ingestion/SendersPage.tsx:131`, `apps/web/src/pages/ingestion/SendersPage.tsx:171`, `apps/web/src/pages/ingestion/SendersPage.tsx:253`, `apps/web/src/pages/ingestion/SendersPage.tsx:274`, `packages/api/src/controllers/monitoredSenders.controller.ts:13`, `packages/api/src/services/gmail/monitoredSenders.service.ts:39`, `packages/api/src/services/gmail/monitoredSenders.service.ts:99`, `packages/api/src/ingestion/gmail/poller.ts:165`

### Ingestion history (Review ingestion) <!-- F-INGEST-007 -->
**What it does:** The page "Review ingestion" shows events in three tabs: **Pending review** (same actions as F-INGEST-004), **Auto-committed** (every event that has been written, with a status badge) and **Rejected / failed** (rejected, failed and over-budget archived events).

**Why it exists:** The header says: "Canonical events extracted from your email. Approve to commit them to transactions; reject to drop them."

**Where to find it:** **Inbox → Connect your Gmail → See committed / rejected** (route `/ingestion/history`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click a tab: **Pending review**, **Auto-committed** or **Rejected / failed**.
2. Click a row to open "Canonical event" with all details, parser notes and any rejection reason.
3. On **Pending review**, approve, reject or **Approve all** as in F-INGEST-004.
4. Click **Refresh** to reload.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Pending review** / **Auto-committed** / **Rejected / failed** | Tabs | Switch the list | — |
| **Refresh** | Button | Reloads events | Never |
| Tick / cross / **Approve all** / **Approve & commit** / **Reject** | Buttons | As in F-INGEST-004 | Only on **Pending review** |
| Status badge | Display | Event status on the other tabs | — |
| **Enable auto-commit** banner | Button | As in F-INGEST-005 | Only on **Pending review** |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Rejection reason | Text | No | Up to 500 characters | Empty | "Validation failed" |

**Settings and toggles here:** S-INGEST-002 (via the banner).

**Results:** Same as F-INGEST-004 for actions; otherwise read-only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing auto-committed yet" | No written events | — |
| "No rejected or failed events" — "Nothing to see — clean history." | None | — |

**Limitations:** **Auto-committed** lists every written event, including ones you approved by hand. Each status shows at most 200 events. CONFIRMED events (approved but not yet written) are not shown on any tab. There is no search, filter or date range.

**How it works:** One `GET /api/canonical-events?status=…&limit=200` request per status in the tab (PARSED + PENDING_REVIEW; PROJECTED; REJECTED + FAILED + ARCHIVED), merged and sorted by event date then creation time, newest first. Requests run only for the open tab.

**Related features:** F-INGEST-004, F-INGEST-005, F-INGEST-008.

**Sources:** `apps/web/src/pages/ingestion/ReviewPage.tsx:35`, `apps/web/src/pages/ingestion/ReviewPage.tsx:41`, `apps/web/src/pages/ingestion/ReviewPage.tsx:227`, `apps/web/src/pages/ingestion/ReviewPage.tsx:273`, `apps/web/src/pages/ingestion/ReviewPage.tsx:298`, `packages/api/src/services/imports/canonicalEvents.service.ts:61`

### How emails become events <!-- F-INGEST-008 -->
**What it does:** On every mailbox poll, for each connected Gmail account, the app searches for new emails from your active monitored senders, reads each email's text, extracts financial events with an AI model (or a learned template), and stores them as events — waiting for review, or written straight away for auto-commit senders.

**Why it exists:** Code comments describe the design goals: never duplicate on re-polls, never send personal identifiers to the AI, stop at a monthly AI budget, and keep every failure for review.

**Where to find it:** Automatic. Results appear in **Inbox → Connect your Gmail → Pending review** and `/ingestion/history`.

**Who can use it:** Runs for every user with a connected, active Gmail account and at least one active monitored sender.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-INGEST-001 (which senders are searched), S-INGEST-002 (review or auto-commit). Operator switches `ENABLE_MAILBOX_POLLER`, `MAILBOX_POLL_INTERVAL_MIN`, `ENABLE_LLM_PARSER`, `ANTHROPIC_API_KEY`, `LLM_MODEL` and the AI budget settings decide whether and how often it runs.

**Results:** New events appear; auto-committed ones also create transactions or cash-flow entries (F-INGEST-009).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No events ever appear although senders are set | The AI parser is switched off on the server (default in production), or the sender is in `@domain` form | Ask the operator; add full addresses |
| Events land in **Rejected / failed** as archived | Monthly AI budget reached | They wait; new budget next month |
| Event note ends "Held for review — …" | A figure the AI read is not in the email | Check before approving |

**Limitations:** Each poll looks at up to 500 matching emails per account. A sender never fetched before is searched back 730 days. Archived over-budget events are not re-parsed automatically. When the AI parser is off, every email becomes a hidden failure record and nothing reaches the review queue.

**How it works:**
1. *Search.* Query `(from:<a> OR from:<b> …) after:<YYYY/MM/DD> -in:trash -in:spam` over active senders, from the oldest sender's last fetch (or 730 days back); paged 100 at a time, capped at 500 message ids. Each message's From address must equal a monitored address exactly (lower case); others are counted as unmatched and skipped. After the tick every active sender's `lastFetchedAt` is set to the tick's start time.
2. *Idempotency.* A message whose fingerprint (`gmail:<messageId>` hashed) already produced events is skipped.
3. *AI gate.* In production both `ENABLE_LLM_PARSER=true` and `ANTHROPIC_API_KEY` are required (outside production only the key). Gate closed → one ingestion-failure record "llm_gate_closed: …" and stop.
4. *Template.* If a learned extraction recipe exists for this sender and email layout (promoted after 10 agreeing AI samples), it is applied without calling the AI; two consecutive misses deactivate it.
5. *AI call.* The email text is redacted (PAN, Aadhaar, account numbers, phone, OTP/CVV) and sent to Claude (default model `claude-haiku-4-5-20251001`). Budget: default warning ₹500 and cap ₹1,000 per user per calendar month (AppSetting `llm.monthly_warn_inr`, `llm.monthly_cap_inr`, per-user overrides); cost estimated at USD 1/5 per million input/output tokens and ₹90/USD unless overridden. At the cap the email is stored as an ARCHIVED event with the redacted body.
6. *Persist.* One event per extracted item; status PARSED for auto-commit senders when every figure (amount, quantity, price, ISIN, date) is found in the email, otherwise PENDING_REVIEW with the note "Held for review — …".
7. *Auto-commit.* For auto-commit senders each PARSED event with confidence ≥ 0.70 is confirmed and written immediately; lower confidence or a failed write moves it to PENDING_REVIEW.

**Related features:** F-INGEST-004, F-INGEST-006, F-INGEST-009, F-MAIL-006, F-IMPORT-011.

**Sources:** `packages/api/src/jobs/mailboxPoller.ts:213`, `packages/api/src/ingestion/gmail/poller.ts:41`, `packages/api/src/ingestion/gmail/poller.ts:50`, `packages/api/src/ingestion/gmail/poller.ts:127`, `packages/api/src/ingestion/gmail/poller.ts:165`, `packages/api/src/ingestion/gmail/pipeline.ts:171`, `packages/api/src/ingestion/gmail/pipeline.ts:257`, `packages/api/src/ingestion/gmail/pipeline.ts:274`, `packages/api/src/ingestion/gmail/pipeline.ts:522`, `packages/api/src/ingestion/llm/client.ts:182`, `packages/api/src/ingestion/llm/client.ts:243`, `packages/api/src/ingestion/llm/budget.ts:21`, `packages/api/src/ingestion/llm/budget.ts:107`, `packages/api/src/ingestion/templates.ts:53`, `packages/api/src/config/env.ts:102`

### What approving an event creates <!-- F-INGEST-009 -->
**What it does:** Turns a confirmed event into a record in your books: buys and sells become transactions; money in and money out become cash-flow entries; some types are only marked as handled.

**Why it exists:** Code comments: approved events must update holdings and dashboards through the normal derived records, with the event kept as the audit trail.

**Where to find it:** Automatic on approval or auto-commit. Results appear in **Overview → Transactions** and **Overview → Cash Activity**.

**Who can use it:** Every user approving events.

**Steps:** Not applicable — runs when you approve (F-INGEST-004) or on auto-commit.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results by event type:**
- **BUY**, **SELL** → a transaction (asset class Mutual Fund when the ISIN starts with "INF", otherwise Equity); if the same trade already exists from a contract note or CAS, the event is linked to it and nothing new is written. **FNO_TRADE** → an F&O transaction.
- **DIVIDEND**, **INTEREST_CREDIT**, **MATURITY_CREDIT**, **UPI_CREDIT**, **NEFT_CREDIT** → cash-flow inflow.
- **INTEREST_DEBIT**, **EMI_DEBIT**, **CARD_PURCHASE**, **CARD_PAYMENT**, **UPI_DEBIT**, **NEFT_DEBIT** → cash-flow outflow.
- **PREMIUM_PAID** → cash-flow outflow, then an attempt to link it to a matching insurance policy.
- **RENT_RECEIVED**, **RENT_PAID**, **VEHICLE_CHALLAN**, **FD_CREATION**, **FD_MATURITY**, **SIP_INSTALLMENT**, **VALUATION_SNAPSHOT**, provident-fund types, F&O lifecycle types and **OTHER** → marked handled with no record written.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "… requires amount and quantity to project" / "… requires amount to project" | Missing figures | Reject and enter by hand |
| "User has no portfolio to project this event into" | No portfolio | Create one |
| "FNO_TRADE requires underlying, instrument_type, expiry_date, side" | Incomplete F&O event | Enter the trade by hand |

**Limitations:** An approved SIP instalment, FD, rent or challan email creates no transaction or cash-flow entry. Bonds, FDs and other classes are never created from emails. Rows go to the event's portfolio, else your default, else your first portfolio.

**How it works:** Projection accepts only CONFIRMED events (already PROJECTED → no-op). The domain row, the status flip to PROJECTED and the back-reference are written in one database transaction; holdings for the asset are recomputed afterwards.

**Related features:** F-INGEST-004, F-INGEST-008, D-INGEST-001, D-INGEST-002, D-IMPORT-006.

**Sources:** `packages/api/src/ingestion/projection.ts:100`, `packages/api/src/ingestion/projection.ts:145`, `packages/api/src/ingestion/projection.ts:154`, `packages/api/src/ingestion/projection.ts:463`, `packages/api/src/ingestion/projection.ts:485`, `packages/api/src/ingestion/projection.ts:503`, `packages/api/src/ingestion/projection.ts:510`, `packages/api/src/ingestion/projection.ts:537`

### What this area doesn't do
- You can't edit an event's amount, date or type before approving it.
- You can't connect Outlook, Yahoo or other IMAP mailboxes from the app (the old mailbox page is no longer reachable).
- You can't see the monthly AI spend (the gauge is hidden).
- You can't re-parse archived over-budget emails from the app.
- You can't choose which portfolio an email event goes into.

## Gmail connection and inbox scans

Connecting a Gmail account (Google sign-in, no password stored) powers three separate things: the email-text events of [Email ingestion](#email-ingestion); a regular *attachment import* that picks up contract notes, CAS PDFs and statements from your inbox and sends them to [Import](#import); and an on-demand *inbox scan* that looks through a date range of mail for financial attachments for you to approve. The review screen for inbox-scan documents is **Reports → Inbox imports** (documented in the Reports chapter).

### Connect Gmail <!-- F-MAIL-001 -->
**What it does:** Sends you to Google to choose an account and grant access, then stores an encrypted access grant for that mailbox. After a successful connection you land on the scan-range page (F-MAIL-003).

**Why it exists:** The empty state explains it: "EveryPaisa scans Gmail for financial emails (read-only) and turns them into transactions. Connect once — we never scan anything except the senders you explicitly allow."

**Where to find it:** **Inbox → Connect your Gmail**, step **1 Connect your email** → **Connect Gmail**; or **Add another** on the **Email accounts** card; or **Connect Gmail** on the shell banner (F-MAIL-005). Google returns you to `/gmail/callback`.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Denied to R-MANAGER ("Switch back to your own account to do this.").

**Steps**
1. Click **Connect Gmail** (or **Add another**). The browser goes to Google's account chooser and consent screen.
2. Choose the Google account and allow access.
3. Google sends you back; the page shows "Connecting Gmail…", then a toast "Connected <email>".
4. After about half a second you are taken to **Choose how far back to scan** (F-MAIL-003). If something failed you are taken back to **Email ingestion**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Disabled while the sign-in link is being created; shown when no Gmail is connected |
| **Add another** | Button | Connects another (or reconnects the same) Google account | Shown when at least one Gmail is connected |

**Fields and rules:** None in the app; Google asks for account and consent.

**Settings and toggles here:** None.

**Results:** A Gmail mailbox record is created (or, for the same address, updated and re-activated with a fresh grant). From the next poll the app imports matching attachments (F-MAIL-006) and reads monitored senders' emails (F-INGEST-008).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Google sign-in" | Gmail sign-in is not configured on the server, or a network error | Ask the operator; try again |
| "Google rejected: <error>" | You cancelled or Google refused consent | Try again and allow access |
| "Incomplete response from Google — please try connecting again" | Missing code or state in the return address | Start again |
| "Invalid or expired OAuth state — start the connect flow again" | The sign-in was started by another session, reused, or took too long | Click **Connect Gmail** again |
| "Internal server error" | Google did not return a long-lived grant (for example access was granted before) or another unmapped error | Remove the app's access at your Google account permissions page, then connect again |

**Limitations:** The app asks Google for permission to read **and send** email (send is used for rental rent reminders), although the screen describes the connection as read-only. Reconnecting the same address replaces its grant.

**How it works:** `GET /api/gmail/auth-url` issues a single-use state value tied to you and returns Google's URL with offline access, prompt "select_account consent" and scopes `gmail.readonly` and `gmail.send`. The callback page posts `code` and `state` to `POST /api/gmail/callback`; the server rejects a state not issued to you, exchanges the code, requires a refresh token, reads the mailbox address from Gmail, and stores refresh and access tokens encrypted. If the callback page was opened as a pop-up (rental reminders), it closes itself instead of navigating.

**Related features:** F-MAIL-002, F-MAIL-003, F-MAIL-006, F-INGEST-002, D-MAIL-003.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:346`, `apps/web/src/pages/ingestion/IngestionPage.tsx:385`, `apps/web/src/pages/ingestion/IngestionPage.tsx:418`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:26`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:39`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:55`, `packages/api/src/controllers/gmail.controller.ts:42`, `packages/api/src/ingestion/gmail/gmail.connector.ts:24`, `packages/api/src/ingestion/gmail/gmail.connector.ts:147`, `packages/api/src/ingestion/gmail/gmail.connector.ts:162`, `packages/api/src/ingestion/gmail/gmail.connector.ts:173`

### Email accounts and disconnect <!-- F-MAIL-002 -->
**What it does:** The **Email accounts** card lists each connected Gmail with "Last checked <date time>" or "Not polled yet", any last error, **Active** or **Paused**, and a disconnect button.

**Why it exists:** Inferred from behavior: shows whether the inbox is being read and lets you revoke access.

**Where to find it:** **Inbox → Connect your Gmail**, step 1 card **Email accounts** (shown once a Gmail is connected).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Not R-MANAGER.

**Steps**
1. Read the account line. **Paused** with "Gmail access lost: …" means the app lost access.
2. To disconnect, click the cross and confirm "Disconnect <email>?". The toast "Gmail disconnected" appears.
3. Click **Refresh** at the top of the page to see the account removed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Cross icon | Button | Disconnects the account after confirmation | Disabled while disconnecting |
| **Active** / **Paused** | Display | Whether the account is polled | — |

**Fields and rules:** None.

**Settings and toggles here:** None (an account cannot be paused by hand; it is paused automatically when access is lost).

**Results:** The app asks Google to revoke its grant and deletes the mailbox record. Already imported transactions, events and inbox-scan documents stay.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Gmail access lost: Access token rejected (refresh_token may be expired or revoked). Click Reconnect on the Mailboxes page." | Google rejected the stored grant; the account was paused | Click **Add another** and sign in with the same account (there is no Reconnect button or Mailboxes page) |
| Account still listed after "Gmail disconnected" | The card does not reload on its own | Click **Refresh** |
| "Failed to disconnect" / "Gmail account not found" | Server error, or already removed | Refresh the page |

**Limitations:** After disconnecting, the list is not refreshed automatically. The reauthorisation message names a page and button that no longer exist.

**How it works:** `DELETE /api/gmail/:id` checks the account is yours and a Gmail account, calls Google's token revocation (errors ignored) and deletes the `MailboxAccount` row. When any poll gets an authorisation error, the account is set inactive with the "Gmail access lost" message.

**Related features:** F-MAIL-001, F-MAIL-006.

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:354`, `apps/web/src/pages/ingestion/IngestionPage.tsx:434`, `apps/web/src/pages/ingestion/IngestionPage.tsx:456`, `packages/api/src/controllers/gmail.controller.ts:88`, `packages/api/src/ingestion/gmail/gmail.connector.ts:247`, `packages/api/src/ingestion/gmail/gmail.connector.ts:544`

### Choose how far back to scan <!-- F-MAIL-003 -->
**What it does:** Starts a one-off *inbox scan* of your most recently connected active Gmail for every PDF, XLSX, XLS or CSV attachment between two dates, then sends you to **Reports → Inbox imports** to review what it finds.

**Why it exists:** The page says: "We'll look for every PDF, XLSX, XLS or CSV attachment in your Gmail between these dates." It back-fills history right after you connect.

**Where to find it:** Shown automatically after connecting Gmail (route `/gmail/scan-setup`). There is no menu entry.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with an active Gmail. Not R-MANAGER.

**Steps**
1. Adjust **Scan from** and **Scan until**, or click a preset: **Last 7 days**, **Last 30 days**, **Last 1 year**, **Last 5 years**.
2. Click **Start scan**. The toast "Scan started — review docs as they appear" appears and you go to **Reports → Inbox imports**.
3. Or click **Skip for now** to go to the dashboard.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan from** | Date | First day to scan | Cannot be after **Scan until** |
| **Scan until** | Date | Last day to scan | Cannot be before **Scan from** or after today |
| **Last 7 days** / **Last 30 days** / **Last 1 year** / **Last 5 years** | Buttons | Set **Scan from** and set **Scan until** to today | — |
| **Skip for now** | Button | Goes to `/dashboard` | — |
| **Start scan** | Button | Creates the scan | Disabled while starting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Scan from | Date | Yes | YYYY-MM-DD | 5 years ago | "lookbackTo must be after lookbackFrom" (same day as **Scan until**) |
| Scan until | Date | Yes | YYYY-MM-DD, not after today | Today | As above |

**Settings and toggles here:** S-MAIL-002 **Scan from / Scan until** — the scan window; used once, not remembered.

**Results:** A scan job starts in the background. Found attachments appear one by one in **Reports → Inbox imports** for approval (F-MAIL-004).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Connect Gmail before starting a scan" | No active Gmail | Connect Gmail |
| "lookbackTo must be after lookbackFrom" | Both dates are the same day | Pick at least two different days |
| "Too many requests for this operation. Please wait a minute." | More than 5 scans started in one minute | Wait a minute |
| "Failed to start scan" | Other error | Try again |

**Limitations:** The page text says "Both dates inclusive" and allows the same date twice, but the server refuses a one-day range. With several Gmail accounts, only the most recently connected active one is scanned. A running scan cannot be cancelled or resumed from the app.

**How it works:** `POST /api/gmail/scan-jobs` (`lookbackFrom`, `lookbackTo` as YYYY-MM-DD, parsed at 12:00 UTC) under the costly-operation rate limit (5 per minute); creates a `GmailScanJob` (kind FULL, status PENDING) and queues it on `gmail-scan`.

**Related features:** F-MAIL-001, F-MAIL-004, D-MAIL-001.

**Sources:** `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:21`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:34`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:46`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:88`, `packages/api/src/routes/gmailScan.routes.ts:28`, `packages/api/src/controllers/gmailScan.controller.ts:36`, `packages/api/src/services/gmail/gmailScanJobs.service.ts:16`

### Inbox scan processing <!-- F-MAIL-004 -->
**What it does:** Works through a scan job: lists matching emails, downloads each attachment, marks attachments already imported as duplicates, asks an AI classifier whether each one is a financial document, keeps likely ones as "pending approval", and applies your auto-approve rules. Approved documents become import jobs (F-IMPORT-008).

**Why it exists:** Inferred from behavior: lets you back-fill years of statements from your inbox without downloading them one by one, while you still choose what gets imported.

**Where to find it:** Automatic after **Start scan**. Progress shows on the dashboard scan card and the documents to approve in **Reports → Inbox imports**.

**Who can use it:** Every user who starts a scan.

**Steps:** Not applicable — automatic. Approve or reject documents in **Reports → Inbox imports** (D-MAIL-001).

**Controls:** None on B07 pages.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-MAIL-002 (the window).

**Results:** Each attachment becomes a discovered document with status DUPLICATE (same bytes already imported), NOT_FINANCIAL (classifier says not financial or confidence below 0.40) or PENDING_APPROVAL; approved ones move through IMPORTING to IMPORTED or PARSE_FAILED.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Scan stops early with the budget message stored on the job | Monthly AI budget reached | Wait for next month or ask the operator to raise the cap |
| Every document is pending with a note like "disabled: …" | AI classification unavailable; documents are kept for manual review | Review them by hand |

**Limitations:** Attachments whose file names contain unsubscribe, newsletter, promotion or deal(s) are ignored. Insurance scans (started from Insurance) are handled by the Insurance area, not imported.

**How it works:** Queue `gmail-scan`, concurrency 2, up to 3 attempts, 30-minute timeout. Query `(filename:pdf OR filename:xlsx OR filename:xls OR filename:csv) has:attachment after:<from> before:<until + 1 day>`, listed 500 ids per page. Phases: LISTING → DOWNLOADING → CLASSIFYING → COMPLETED (or FAILED/CANCELLED). Each attachment is stored encrypted with its SHA-256; classification uses the first 4 KB of extracted text, sender and subject. After classification, auto-approve rules (sender + document type) approve matching documents. Approval creates an import job with the document's content hash (so identical bytes reuse an existing job).

**Related features:** F-MAIL-003, F-IMPORT-008, F-IMPORT-009, D-MAIL-001, D-MAIL-002, D-MAIL-004.

**Sources:** `packages/api/src/jobs/gmailScanWorker.ts:35`, `packages/api/src/jobs/gmailScanWorker.ts:75`, `packages/api/src/jobs/gmailScanWorker.ts:188`, `packages/api/src/jobs/gmailScanWorker.ts:239`, `packages/api/src/jobs/gmailScanWorker.ts:268`, `packages/api/src/jobs/gmailScanWorker.ts:323`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:31`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:34`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:61`, `packages/api/src/lib/queue.ts:112`, `packages/api/src/services/gmail/gmailDocApproval.service.ts:59`, `packages/api/src/services/gmail/gmailDocApproval.service.ts:123`

### Gmail auto-connect banner <!-- F-MAIL-005 -->
**What it does:** A strip at the top of every app page: "Auto-import statements from your inbox. Connect <your email> — we'll fetch contract notes, CAS PDFs, and trade confirmations automatically. You approve each new sender once." with **Connect Gmail** and a dismiss button.

**Why it exists:** Inferred from behavior: prompts Gmail users to switch on automatic statement import.

**Where to find it:** Top of the app shell on any signed-in page.

**Who can use it:** Shown only when your sign-in email ends in @gmail.com or @googlemail.com, Gmail sign-in is configured on the server, you have no active Gmail connection, and you have not dismissed it on this browser.

**Steps**
1. Click **Connect Gmail** to start F-MAIL-001.
2. Or click the cross (tooltip "Dismiss") to hide it on this browser for good.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Disabled while starting |
| Cross (tooltip "Dismiss") | Button | Hides the banner on this browser | — |

**Fields and rules:** None.

**Settings and toggles here:** S-MAIL-001 **Dismiss** — stored on this browser only; other browsers still show the banner.

**Results:** Connect: as F-MAIL-001. Dismiss: banner hidden on this browser.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Google sign-in" | Server error | Try again |

**Limitations:** "You approve each new sender once" is not exactly what happens: attachments from any sender are imported when their file name looks like a statement (F-MAIL-006), and monitored senders start with auto-commit on. A paused (access-lost) account counts as "not connected", so the banner returns.

**How it works:** Reads `GET /api/auth/me`, `GET /api/mailboxes` and `GET /api/gmail/config` (each cached for 60 seconds); dismissal writes localStorage key `gmail-auto-connect-dismissed` = `1`.

**Related features:** F-MAIL-001, F-MAIL-006.

**Sources:** `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:11`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:45`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:51`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:72`, `apps/web/src/components/layout/AppShell.tsx:97`

### Automatic Gmail attachment import <!-- F-MAIL-006 -->
**What it does:** On every mailbox poll (every 3 minutes by default), each active Gmail account is searched for emails with attachments from brokers, registrars and depositories or with statement-like subjects; matching attachments are saved and imported through the Import pipeline. You see them as new rows in **Import history**.

**Why it exists:** Code comments: CAS emails arrive 5–60 minutes after a request, and a 3-minute poll gives near-real-time auto-import.

**Where to find it:** Automatic. Results in **Tools → Import → Import history**.

**Who can use it:** Every user with an active Gmail connection.

**Steps:** Not applicable — automatic. Use **Scan inbox** (F-MAIL-007) to run it immediately.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-INGEST-001 — attachments from active monitored senders skip the file-name filter. Operator: `ENABLE_MAILBOX_POLLER`, `MAILBOX_POLL_INTERVAL_MIN`.

**Results:** New import jobs (target portfolio: default, else first). Each email message is imported at most once.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Account shows **Paused** and "Gmail access lost …" | Google rejected the grant | Reconnect with **Add another** |
| Account shows another last error | Search failed | It is retried on the next poll |
| An expected statement never arrives | File name did not match the patterns and the sender is not monitored, or it is a regulatory document | Add the sender as a monitored sender, or upload the file |

**Limitations:** Searches mail newer than 2 years, up to 500 messages per poll. Regulatory documents (retention statements, margin statements/pledges, client reporting, SEBI circulars, regulatory disclosures, annual reports, welcome kits, onboarding) are always skipped. Imports go to the default portfolio.

**How it works:** Query `has:attachment newer_than:2y (from:(cams OR camsonline OR kfintech OR karvy OR nsdl OR cdsl OR zerodha OR … OR dhan) OR subject:("contract note" OR "consolidated account" OR "CAS" OR "transaction statement" OR "trade confirmation" OR "account statement")) -in:trash`. Allowed extensions: .pdf, .csv, .tsv, .xlsx, .xls, .html, .htm. File names must match contract-note, trade-confirmation, CAS, transaction/holding-statement or spreadsheet patterns unless the sender is an active monitored sender (full address or `@domain` match here). A message already linked to an import job is skipped; identical bytes (SHA-256) are skipped. Each saved attachment becomes an import job with the inferred type and broker. A message that throws is recorded once as an unresolved failure (`gmail.attachment`) and resolved when a later poll succeeds. A per-account lock prevents the poller and a manual scan running together. The same poll first runs the monitored-sender email reader (F-INGEST-008). Accounts with provider IMAP (from the retired mailbox page) are polled for unread mail since the last poll (7 days on the first run).

**Related features:** F-MAIL-001, F-MAIL-007, F-IMPORT-008, F-IMPORT-009, F-INGEST-008.

**Sources:** `packages/api/src/ingestion/gmail/gmail.connector.ts:28`, `packages/api/src/ingestion/gmail/gmail.connector.ts:35`, `packages/api/src/ingestion/gmail/gmail.connector.ts:63`, `packages/api/src/ingestion/gmail/gmail.connector.ts:113`, `packages/api/src/ingestion/gmail/gmail.connector.ts:345`, `packages/api/src/ingestion/gmail/gmail.connector.ts:407`, `packages/api/src/ingestion/gmail/gmail.connector.ts:443`, `packages/api/src/jobs/mailboxPoller.ts:99`, `packages/api/src/jobs/mailboxPoller.ts:194`, `packages/api/src/jobs/mailboxPoller.ts:242`, `packages/api/src/config/env.ts:91`

### Scan inbox now <!-- F-MAIL-007 -->
**What it does:** Runs the Gmail attachment import (F-MAIL-006) immediately for every active Gmail account, without waiting for the next poll, and refreshes the import lists when it finishes.

**Why it exists:** Inferred from behavior: after requesting a CAS by email you can pull it in as soon as it arrives.

**Where to find it:** **Asset Classes → Mutual Funds**, button **Scan inbox** (the button belongs to the Mutual Funds page; the behaviour is shared app-wide).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO with an active Gmail. R-MANAGER gets an error (account route).

**Steps**
1. Click **Scan inbox**. A toast says "Scanning Gmail — imports will appear when found".
2. When it finishes, import lists refresh; new files appear in **Import history**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan inbox** | Button | Starts the scan | Ignored while a scan is already running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** As F-MAIL-006.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No active Gmail account connected" | No Gmail, or access lost | Connect Gmail |

**Limitations:** Only attachments are imported; the email-text event reader (F-INGEST-008) is not triggered. If the poller is running for the same account at that moment, the manual run returns at once with nothing done.

**How it works:** The shell-wide scan context calls `POST /api/mailboxes/:id/poll` for each active Gmail account in parallel; for Gmail this runs `syncGmailAccount`.

**Related features:** F-MAIL-006, D-IMPORT-001.

**Sources:** `apps/web/src/context/ScanContext.tsx:22`, `apps/web/src/context/ScanContext.tsx:27`, `apps/web/src/context/ScanContext.tsx:35`, `apps/web/src/components/layout/AppShell.tsx:90`, `packages/api/src/controllers/mailboxes.controller.ts:120`, `packages/api/src/ingestion/gmail/gmail.connector.ts:348`

### What this area doesn't do
- You can't connect a non-Gmail mailbox (IMAP) from the app; existing IMAP connections still poll but cannot be managed.
- You can't pause a Gmail connection by hand; you can only disconnect it.
- You can't cancel or resume an inbox scan from the app, or view and delete auto-approve rules.
- You can't choose which Gmail account an inbox scan uses when several are connected.

## CAS

The **CAS** page (sidebar **Tools → CAS**, route `/cas`, title "Consolidated Account Statement") is a helper for requesting a Consolidated Account Statement from CAMS, KFintech, NSDL or CDSL yourself. It does not contact the providers: it prepares the details to enter, links to the provider's request page, and tells you what happens next. To have the app submit a CAS request for you, use the mutual fund sync dialogs on **Asset Classes → Mutual Funds** (D-IMPORT-002).

### Request CAS helper <!-- F-CAS-001 -->
**What it does:** You choose a provider and optionally type a PAN, email and date range; **Generate Request** returns a link **Open provider portal**, a list of **Instructions** (the values to type there) and **Next steps**.

**Why it exists:** A code comment explains: CAMS and KFintech have no public API to request a CAS; both use a web form and email a password-protected PDF, so the app provides structured guidance and deep links.

**Where to find it:** **Tools → CAS** (route `/cas`), card **Request CAS**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER (nothing is saved).

**Steps**
1. Choose a **Provider**: CAMS, KFintech, NSDL (e-CAS) or CDSL (e-CAS); each option shows its coverage.
2. Optional: type **PAN (optional)** (converted to capitals), **Email (optional)**, **From date** and **To date**.
3. Click **Generate Request**. A box appears below with **Open provider portal**, **Instructions** and **Next steps**.
4. Click **Open provider portal** (opens in a new tab) and submit the provider's form with the listed values.
5. When the PDF arrives by email, it is imported automatically if Gmail is connected (F-MAIL-006); otherwise upload it on **Tools → Import**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Provider** | Select | Provider to request from | — |
| **PAN (optional)** | Text | PAN to list in the instructions | Max 10 characters |
| **Email (optional)** | Email | Email to list in the instructions | — |
| **From date** / **To date** | Date | Period to list | — |
| **Generate Request** | Button | Builds the instructions | Disabled while building |
| **Open provider portal** | Link | Opens the provider's page in a new tab | Shown after generating |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Provider | Select | Yes | CAMS, KFINTECH, NSDL, CDSL | CAMS | — |
| PAN | Text | No | Exactly 10 characters when given | Empty | "Validation failed" |
| Email | Email | No | Valid email when given | Empty | "Validation failed" |
| From date / To date | Date | No | YYYY-MM-DD; period is listed only when both are given | Empty | — |

**Settings and toggles here:** None.

**Results:** Nothing is saved or sent. **Instructions** list "PAN: …" and "Email: …" when given, "Statement type: DETAILED", "Period: <from> to <to>" (or "Period: All transactions" unless both dates are set) and "PDF password will be your PAN in uppercase (most providers)".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Validation failed" | PAN not 10 characters, or invalid email | Correct the field or clear it |

**Limitations:** **Next steps** say "If an IMAP mailbox is configured, EveryPaisa will auto-import the PDF" and "Otherwise, upload the PDF via Imports → CAS PDF and provide the PDF password"; IMAP setup is no longer available in the app (Gmail is the supported route) and the Import page has a single upload box, not a "CAS PDF" option. The statement type is always "Detailed". The dates are not checked against each other.

**How it works:** `GET /api/cas/providers` returns a fixed list; `POST /api/cas/request` validates the input and returns the portal URL for the provider plus the text lines. No request is made to the provider.

**Related features:** F-CAS-002, F-IMPORT-001, F-MAIL-006, D-IMPORT-002.

**Sources:** `apps/web/src/pages/cas/CasPage.tsx:26`, `apps/web/src/pages/cas/CasPage.tsx:42`, `apps/web/src/pages/cas/CasPage.tsx:97`, `apps/web/src/pages/cas/CasPage.tsx:108`, `packages/api/src/controllers/cas.controller.ts:73`, `packages/api/src/controllers/cas.controller.ts:106`, `packages/api/src/controllers/cas.controller.ts:115`

### Provider info <!-- F-CAS-002 -->
**What it does:** Shows facts about the selected provider: name, coverage, **PDF password**, **Email from**, **Subject** and notes.

**Why it exists:** Inferred from behavior: tells you which email to look for and which password opens the PDF.

**Where to find it:** **Tools → CAS**, card **Provider info**.

**Who can use it:** Same as F-CAS-001.

**Steps**
1. Choose a provider in **Provider**; the card updates.

**Controls:** None — display only.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes.

| Provider | Coverage (as shown) | PDF password | Email from | Subject |
|---|---|---|---|---|
| CAMS | Mutual funds serviced by CAMS (~60% of MF industry) | PAN in uppercase | @camsonline.com | Consolidated Account Statement |
| KFintech | Mutual funds serviced by KFintech (~40% of MF industry) | PAN in uppercase | @kfintech.com | Consolidated Account Statement |
| NSDL (e-CAS) | Demat holdings + MF consolidated across NSDL | PAN + DOB (DDMMYYYY) | @nsdl.co.in | e-CAS |
| CDSL (e-CAS) | Demat holdings + MF consolidated across CDSL | PAN | @cdslindia.com | e-CAS |

**Errors and troubleshooting:** None.

**Limitations:** The information is fixed in the app and is not checked against the providers.

**How it works:** Read from `GET /api/cas/providers`.

**Related features:** F-CAS-001, F-IMPORT-004 (the app tries PAN and PAN + date of birth automatically).

**Sources:** `apps/web/src/pages/cas/CasPage.tsx:133`, `packages/api/src/controllers/cas.controller.ts:24`

### What this area doesn't do
- The CAS page does not submit the request to the provider or fetch the PDF itself.
- It does not remember the PAN or email you type.

## Documents

**Documents** (sidebar **Tools → Documents**, route `/documents`) is a document sorter: you drop PDFs and photos, and the app reads each one on the server, works out whose document it is and what kind (ITR, Form 16, bank statement and so on), files it into a folder for that person and renames it. It is a Plus feature.

### Upload documents to sort <!-- F-DOCS-001 -->
**What it does:** Accepts many files at once (by drag-and-drop or **Choose files**), uploads them in groups of 10, and lists the latest 12 with their progress: "Uploading <n>%", "Uploaded — reading…", "Already in your Documents", or the filing result.

**Why it exists:** The page says: "Drop your documents. We work out whose they are and what they are, file them in the right folder, and name them for you."

**Where to find it:** **Tools → Documents** (route `/documents`), drop area at the top.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. R-FREE sees the locked card "Documents is locked" with **View plans**. R-MANAGER uses it with the manager's plan for the managed person's documents.

**Steps**
1. Open **Tools → Documents**.
2. Drag files onto the box ("Drop your documents here — we sort them for you"), or click **Choose files**.
3. Watch the list below: each file moves from uploading to reading to "Filed into <person> / <type>", or to a status that needs you (see F-DOCS-003).
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
| "This feature requires the PLUS plan or higher" | Free plan (API refuses) | Upgrade (D-DOCS-002) |

**Limitations:** Only PDFs and images are read automatically; other accepted types are stored with "This file type is stored but not read automatically yet." and wait in **Needs attention**. The progress list is lost when you leave the page.

**How it works:** `POST /api/documents-sorter/upload` (multipart field `files`, up to 10) behind the DOCUMENT_SORTER plan gate. For each file: SHA-256 dedup per user; the real type is sniffed; PDFs and images are queued on `doc-sort` (if the queue cannot take it the file shows "Could not start reading this file. Drop it again to retry."). A file still "reading" after 10 minutes is treated as lost and re-queued when dropped again. The page polls the folder tree every 3 seconds while any file is being read.

**Related features:** F-DOCS-002, F-DOCS-003, D-DOCS-002.

**Sources:** `apps/web/src/pages/documentSorter/DocumentSorterPage.tsx:20`, `apps/web/src/pages/documentSorter/DocumentSorterPage.tsx:44`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:10`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:11`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:80`, `apps/web/src/pages/documentSorter/SorterDropzone.tsx:107`, `packages/api/src/routes/documentSorter.routes.ts:10`, `packages/api/src/middleware/documentUpload.ts:48`, `packages/api/src/middleware/documentUpload.ts:49`, `packages/api/src/services/documents/docSorter/sorter.service.ts:34`, `packages/shared/src/entitlements.ts:58`

### How documents are read and filed <!-- F-DOCS-002 -->
**What it does:** For each uploaded PDF or image, the server extracts text, decides the document type, the person's name and the document date, finds or creates that person's folder, and renames the file to "<Type>_<YYYY-MM-DD>.<ext>".

**Why it exists:** A code comment cites the design spec: read each file, find its person and type, file it and rename it, recording every outcome so a file is never lost.

**Where to find it:** Automatic after upload; results in the folders (F-DOCS-003).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The file ends in one of these states: **Filed** (in a person's folder, renamed), **Needs a password**, **Needs review** (with a reason), **Could not be read** (failed), or still **Reading…**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Needs review — Could not find a name on this document." | No person name found | Use **Assign** (F-DOCS-005) |
| "Needs review — AI reading is over budget this month." / "AI reading was not available." | Rules were unsure and the AI fallback could not run | Use **Assign** |
| "Needs review — Could not read this file." | Text extraction failed | Use **Assign**, or upload a clearer copy |
| "Needs a password" | Locked PDF and automatic passwords failed | Use **Enter password** (F-DOCS-006) |
| "Could not be read" ("Processing error.") | Unexpected error | Use **Assign**, or drop the file again |

**Limitations:** Scanned PDFs are OCR'd on the server for the first 3 pages only. When two existing folders are similarly named, the app does not guess and leaves the file for review. Folders can be created automatically from names on documents ("auto-created").

**How it works:** Text comes from the PDF text layer, else OCR (tesseract.js on the server; at most 3 pages; images scaled to at most 8 million pixels), within a 4.5-minute budget. Passwords tried: the one you entered, then the profile-based candidates listed in F-IMPORT-004. Local rules find type, name, PAN last 4 and date; if rule confidence is below 0.70 or no name was found, an AI fallback (same gate and monthly budget as email parsing; PAN/Aadhaar/account/phone masked, the name kept) is used when its confidence is at least 0.5. Person matching: exact name key or alias first; otherwise a single similar name whose PAN last 4 does not conflict; ambiguity → review. A new name creates an auto-created folder. Filing takes a per-user lock; the new name is "<Type label>_<document date or upload date>" plus "-2", "-3"… when taken.

**Related features:** F-DOCS-001, F-DOCS-003, F-DOCS-005, F-DOCS-006.

**Sources:** `packages/api/src/services/documents/docSorter/sorter.service.ts:28`, `packages/api/src/services/documents/docSorter/sorter.service.ts:168`, `packages/api/src/services/documents/docSorter/sorter.service.ts:180`, `packages/api/src/services/documents/docSorter/sorter.service.ts:199`, `packages/api/src/services/documents/docSorter/sorter.service.ts:212`, `packages/api/src/services/documents/docSorter/textExtract.ts:16`, `packages/api/src/services/documents/docSorter/rules.ts:20`, `packages/api/src/services/documents/docSorter/personMatch.ts:66`, `packages/api/src/services/documents/docSorter/naming.ts:18`, `packages/api/src/services/documents/docSorter/llmFallback.ts:13`

### Browse person folders <!-- F-DOCS-003 -->
**What it does:** Shows "<n> people · <m> files" and one folder card per person ("<n> files · <k> types", "· auto-created" when made automatically), plus an amber **Needs attention** card for files still reading or waiting for you. Opening a person shows their files grouped by document type.

**Why it exists:** Inferred from behavior: the sorted result of F-DOCS-002, organised the way people look for documents — by person, then type.

**Where to find it:** **Tools → Documents**, below the drop area.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

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
| Per-file actions | Buttons | See F-DOCS-004, F-DOCS-005, F-DOCS-006 | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing here yet. Drop a few documents above and folders appear on their own." | No documents | Upload some |
| "Couldn't load your documents" | Server error | Reload |
| "Folder not found" | The folder was merged or renamed meanwhile | Go back |
| Amber note "This folder was created automatically from a name on your documents. Rename it, or merge it into another folder if it is the same person." | Auto-created folder | Rename or merge (F-DOCS-007) |

**Limitations:** There is no search or sort. Document types are fixed: ITR, Form 16, Income Certificate, Bank Statement, Salary Slip, CAS, Contract Note, Insurance, FD Certificate, ID Proof, Other.

**How it works:** `GET /api/documents-sorter/tree` returns people with files grouped by type, and an `unassigned` list of files with no person or not yet FILED.

**Related features:** F-DOCS-004, F-DOCS-005, F-DOCS-006, F-DOCS-007, F-DOCS-008.

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:124`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:181`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:213`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:241`, `packages/shared/src/documentSorter.ts:3`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:47`

### View, download or delete a file <!-- F-DOCS-004 -->
**What it does:** For each file: view it in the app (PDFs and images), download it, or delete it after a second confirmation.

**Why it exists:** Inferred from behavior: basic file handling inside the sorted folders.

**Where to find it:** **Tools → Documents** → a person folder or **Needs attention** → icons on a file row.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

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

**How it works:** Uses the shared documents API: `DELETE /api/documents/:id` and the download endpoint `GET /api/documents/:id/download`; the viewer is the shared document viewer (D-DOCS-001).

**Related features:** F-DOCS-003, D-DOCS-001.

**Sources:** `apps/web/src/pages/documentSorter/FileRow.tsx:21`, `apps/web/src/pages/documentSorter/FileRow.tsx:43`, `apps/web/src/pages/documentSorter/FileRow.tsx:56`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:49`, `apps/web/src/api/documents.api.ts:43`

### Move or assign a file <!-- F-DOCS-005 -->
**What it does:** Moves a file to another person and/or type — or assigns a file that could not be sorted — creating a new person folder if needed, and renames it to match.

**Why it exists:** Inferred from behavior: corrects or completes the automatic sorting.

**Where to find it:** **Tools → Documents** → a file's move (folder-arrow) icon, or **Assign** on a file that needs review or could not be read.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

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

**Related features:** F-DOCS-002, F-DOCS-003, F-DOCS-007.

**Sources:** `apps/web/src/pages/documentSorter/MoveDialog.tsx:22`, `apps/web/src/pages/documentSorter/MoveDialog.tsx:46`, `apps/web/src/pages/documentSorter/MoveDialog.tsx:83`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:41`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:89`, `packages/api/src/controllers/documentSorter.controller.ts:17`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:85`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:118`

### Unlock a password-protected document <!-- F-DOCS-006 -->
**What it does:** For a PDF stuck at **Needs a password**, sends the password you type so the file is read again.

**Why it exists:** Inferred from behavior: many statements are encrypted with PAN or date of birth.

**Where to find it:** **Tools → Documents** → **Needs attention** (or a folder) → **Enter password** on the file.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Enter password**. The dialog "Unlock <file>" shows "Try the PDF's password — often your PAN or date of birth."
2. Type the password and click **Unlock**.
3. The file returns to **Reading…** and then to its result.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Enter password** | Button | Opens the dialog | Shown only for **Needs a password** files |
| **Password** | Password input | The PDF password | — |
| **Cancel** / **Unlock** | Buttons | Close / submit | **Unlock** disabled when empty or submitting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Password | Text (hidden) | Yes | 1–200 characters | Empty | "This document is not waiting for a password"; "Couldn't use that password" |

**Settings and toggles here:** None (no "remember" option here).

**Results:** The file is queued for reading with the password. The password travels only with the queue job and is never stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| File goes back to **Needs a password** | Wrong password | Try again |

**Limitations:** A wrong password is reported only by the file returning to **Needs a password**.

**How it works:** `POST /api/documents-sorter/files/:id/password` (202 Accepted) sets the file to PROCESSING and queues it with the password.

**Related features:** F-DOCS-002, F-IMPORT-004.

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:64`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:85`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:114`, `packages/api/src/controllers/documentSorter.controller.ts:44`, `packages/api/src/services/documents/docSorter/sorter.service.ts:333`

### Rename or merge person folders <!-- F-DOCS-007 -->
**What it does:** Renames a person's folder, or merges it into another person's folder (all its files move there).

**Why it exists:** Folder names can be auto-created from documents; the page's note says "Rename it, or merge it into another folder if it is the same person."

**Where to find it:** **Tools → Documents** → open a person → **Rename**, and **Merge into…** + **Merge**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

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

**Related features:** F-DOCS-003, F-DOCS-005.

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:54`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:152`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:167`, `packages/api/src/controllers/documentSorter.controller.ts:55`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:146`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:159`

### Download folders as ZIP <!-- F-DOCS-008 -->
**What it does:** Downloads filed documents as a ZIP: everything (**Download everything**), one person (**Download all**), or one person's type (**Zip**).

**Why it exists:** Inferred from behavior: hand a person's or a type's documents to someone in one file.

**Where to find it:** **Tools → Documents** → **Download everything** (top), or inside a person: **Download all** and **Zip** on each type.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

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

**Related features:** F-DOCS-003.

**Sources:** `apps/web/src/pages/documentSorter/PersonFolders.tsx:72`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:176`, `apps/web/src/pages/documentSorter/PersonFolders.tsx:217`, `packages/api/src/controllers/documentSorter.controller.ts:66`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:15`, `packages/api/src/services/documents/docSorter/sorterEdit.service.ts:212`

### What this area doesn't do
- Documents does not import transactions from the files you drop (use **Tools → Import** for that).
- You can't edit a document's date, add tags, or search across documents.
- You can't remember PDF passwords from this page.
- You can't delete a person folder.
<!-- END MODULES -->

## Roles and profiles

### Signed-out visitor <!-- R-VISITOR -->
Cannot open any page in this area; sent to sign in.

### Free user <!-- R-FREE -->
Full use of Import, Email ingestion, Gmail connection and inbox scans, and CAS. **Documents** shows a lock card.

### Plus subscriber <!-- R-PLUS -->
Everything Free has, plus **Documents**.

### Family subscriber <!-- R-FAMILY -->
Same as Plus in this area.

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Plus in this area.

### Administrator <!-- R-ADMIN -->
No admin-only powers here; access follows the admin's own plan.

### Family owner <!-- R-FAMOWNER -->
Family view does not change these pages: imports, events, senders, Gmail and documents are always your own.

### Family contributor <!-- R-FAMCONTRIB -->
Same as family owner here.

### Family viewer <!-- R-FAMVIEWER -->
Same as family owner here.

### Managing a family member's account <!-- R-MANAGER -->
Imports, events, senders and Documents act on the managed person's data under the manager's plan. Gmail connection, inbox scans and the scan shortcut are refused with "Switch back to your own account to do this."

### Professional acting for a client <!-- R-PROF -->
Not applicable here — professionals upload client files from the CA workspace.

### AI chatbot connection <!-- R-AICONN -->
No access to these features.

### Succession nominee <!-- R-NOMINEE -->
No access.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Import job | One uploaded or emailed file being processed; shown as a row in **Import history** with a status. |
| Partial | Import status meaning some rows were added and some failed (stored as COMPLETED_WITH_ERRORS). |
| Needs password | Import status: the file is encrypted and none of the automatic passwords opened it. |
| Parser | The reader that recognises one document format (for example Zerodha contract note, CAMS/KFintech CAS) and extracts its transactions; its name and version are stored on each imported row. |
| Contract note | The broker's legally required record of the trades you made on a day. |
| Source hash | A fingerprint stored on each imported row so the same row is never added twice. |
| Ingestion failure | A record kept when a file, row or email could not be processed, with its raw data, for review or automatic retry (the "dead-letter queue"). |
| Monitored sender | An email address (or `@domain`) whose emails the app is allowed to read for financial events. |
| Event | A single financial fact read from an email (a buy, a UPI credit, a premium…) waiting for review or already written to your books. |
| Auto-commit | A monitored-sender setting: its confident events are written without manual review. |
| Approve & commit | Accept an event so it is written as a transaction or cash-flow entry. |
| Inbox scan | A one-off search of a date range of your Gmail for financial attachments to approve and import. |
| Inbox imports | The Reports tab where documents found by an inbox scan are approved or rejected. |
| Needs attention | The Documents card holding files that are still being read or need a password, review or assignment. |
| Auto-created folder | A Documents person folder the app created from a name found on a document. |
<!-- END GLOSSARY -->
