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
