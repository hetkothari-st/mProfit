---
id: F-MAIL-004
title: "Inbox scan processing"
module: "Gmail connection and inbox scans"
status: Live
roles: "Scanning users"
settings: [S-MAIL-002]
related: [F-IMPORT-008, F-IMPORT-009, F-MAIL-003]
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Inbox scan processing

`F-MAIL-004` · Live · Roles: Scanning users

**What it does:** Works through a scan job: lists matching emails, downloads each attachment, marks attachments already imported as duplicates, asks an AI classifier whether each one is a financial document, keeps likely ones as "pending approval", and applies your auto-approve rules. Approved documents become import jobs ([F-IMPORT-008](F-IMPORT-008.md)).

**Why it exists:** Inferred from behavior: lets you back-fill years of statements from your inbox without downloading them one by one, while you still choose what gets imported.

**Where to find it:** Automatic after **Start scan**. Progress shows on the dashboard scan card and the documents to approve in **Reports → Inbox imports**.

**Who can use it:** Every user who starts a scan.

**Steps:** Not applicable — automatic. Approve or reject documents in **Reports → Inbox imports** ([D-MAIL-001](../dependencies.md#d-mail-001)).

**Controls:** None on B07 pages.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-MAIL-002](../settings/gmail-connection-and-inbox-scans.md#s-mail-002) (the window).

**Results:** Each attachment becomes a discovered document with status DUPLICATE (same bytes already imported), NOT_FINANCIAL (classifier says not financial or confidence below 0.40) or PENDING_APPROVAL; approved ones move through IMPORTING to IMPORTED or PARSE_FAILED.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Scan stops early with the budget message stored on the job | Monthly AI budget reached | Wait for next month or ask the operator to raise the cap |
| Every document is pending with a note like "disabled: …" | AI classification unavailable; documents are kept for manual review | Review them by hand |

**Limitations:** Attachments whose file names contain unsubscribe, newsletter, promotion or deal(s) are ignored. Insurance scans (started from Insurance) are handled by the Insurance area, not imported.

**How it works:** Queue `gmail-scan`, concurrency 2, up to 3 attempts, 30-minute timeout. Query `(filename:pdf OR filename:xlsx OR filename:xls OR filename:csv) has:attachment after:<from> before:<until + 1 day>`, listed 500 ids per page. Phases: LISTING → DOWNLOADING → CLASSIFYING → COMPLETED (or FAILED/CANCELLED). Each attachment is stored encrypted with its SHA-256; classification uses the first 4 KB of extracted text, sender and subject. After classification, auto-approve rules (sender + document type) approve matching documents. Approval creates an import job with the document's content hash (so identical bytes reuse an existing job).

**Related features:** [F-MAIL-003](F-MAIL-003.md), [F-IMPORT-008](F-IMPORT-008.md), [F-IMPORT-009](F-IMPORT-009.md), [D-MAIL-001](../dependencies.md#d-mail-001), [D-MAIL-002](../dependencies.md#d-mail-002), [D-MAIL-004](../dependencies.md#d-mail-004).

**Sources:** `packages/api/src/jobs/gmailScanWorker.ts:35`, `packages/api/src/jobs/gmailScanWorker.ts:75`, `packages/api/src/jobs/gmailScanWorker.ts:188`, `packages/api/src/jobs/gmailScanWorker.ts:239`, `packages/api/src/jobs/gmailScanWorker.ts:268`, `packages/api/src/jobs/gmailScanWorker.ts:323`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:31`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:34`, `packages/api/src/ingestion/gmail/gmailMessageLister.ts:61`, `packages/api/src/lib/queue.ts:112`, `packages/api/src/services/gmail/gmailDocApproval.service.ts:59`, `packages/api/src/services/gmail/gmailDocApproval.service.ts:123`
