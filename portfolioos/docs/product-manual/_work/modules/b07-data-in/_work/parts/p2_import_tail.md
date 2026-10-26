
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
