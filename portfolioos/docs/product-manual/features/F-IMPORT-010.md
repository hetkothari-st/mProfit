---
id: F-IMPORT-010
title: "Background processing and automatic recovery"
module: "Import"
status: Live
roles: "System"
settings: []
related: [F-IMPORT-002, F-IMPORT-003, F-IMPORT-004, F-IMPORT-005, F-IMPORT-008]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Background processing and automatic recovery

`F-IMPORT-010` · Live · Roles: System

**What it does:** Runs import jobs in a background queue and repairs jobs that get stuck or fail: re-queues jobs left **Pending**, marks long-dead **Processing** jobs as **Failed**, and automatically retries **Failed** and **Partial** jobs up to three times.

**Why it exists:** Code comments explain it: before this, a failed file was a dead end until someone pressed Reprocess, and an outage once left weeks of statements silently missing.

**Where to find it:** Automatic. Effects show in **Tools → Import → Import history** (status changes) and in the reports data-quality banner ([D-IMPORT-004](../dependencies.md#d-import-004)).

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
| Job stays **Needs password** after a restart | Passwords are never saved on the job | Enter it again ([F-IMPORT-004](F-IMPORT-004.md)) |

**Limitations:** The recovery reason is not shown on the Import page (see [F-IMPORT-003](F-IMPORT-003.md) Limitations). Auto-retry waits at least one hour after a job finished before retrying it.

**How it works:** The worker processes queue `imports` with concurrency 2, one attempt per job, a 5-minute timeout and a 5-minute lock; a job running longer than 60 seconds is logged as slow. When a queue job fails terminally the `ImportJob` is set to FAILED with `workerError` and `timedOut`. At worker start: up to 100 PENDING jobs are re-queued (each add waits at most 5 seconds for Redis); up to 200 PROCESSING jobs created more than 60 minutes ago with no live queue job are marked FAILED ("Import was interrupted. Please upload the file again."). Ingestion recovery runs 2 minutes after every server start and nightly at 02:15 IST (inside the data-integrity job): every FAILED or COMPLETED_WITH_ERRORS job with a stored copy, finished more than 60 minutes ago, is re-run as its owner (5-minute bound each) until it has been auto-retried 3 times (`errorLog.autoRetries`); a job that comes back COMPLETED with no failed rows also resolves its earlier row-level failure records. A one-time recovery (marker `ingestion.recover.2026-10-upload-dir`) rewound IMAP mailbox cursors to 2026-09-16 after an upload-directory outage.

**Related features:** [F-IMPORT-002](F-IMPORT-002.md), [F-IMPORT-005](F-IMPORT-005.md), [F-IMPORT-008](F-IMPORT-008.md), [D-IMPORT-004](../dependencies.md#d-import-004), [D-IMPORT-005](../dependencies.md#d-import-005).

**Sources:** `packages/api/src/jobs/importWorker.ts:24`, `packages/api/src/jobs/importWorker.ts:47`, `packages/api/src/jobs/importWorker.ts:88`, `packages/api/src/jobs/importWorker.ts:91`, `packages/api/src/jobs/importWorker.ts:144`, `packages/api/src/lib/queue.ts:40`, `packages/api/src/services/imports/ingestionRecovery.service.ts:30`, `packages/api/src/services/imports/ingestionRecovery.service.ts:33`, `packages/api/src/services/imports/ingestionRecovery.service.ts:99`, `packages/api/src/services/imports/ingestionRecovery.service.ts:171`, `packages/api/src/index.ts:245`, `packages/api/src/jobs/dataIntegrityJob.ts:60`, `packages/api/src/jobs/dataIntegrityJob.ts:175`
