# B07 discovery — Data in (imports, email ingestion, Gmail, CAS, Documents)

Source commit 9d9025c4 · code-only.

## Routes owned (13)
- `/import` ImportPage (Tools → Import) — `apps/web/src/App.tsx:261`
- `/import/failures` FailuresPage — Hidden (nav commented `apps/web/src/components/layout/navItems.tsx:122`, link commented `apps/web/src/pages/imports/ImportPage.tsx:137`)
- `/ops/ingestion-failures` → redirect `/import/failures` (`apps/web/src/App.tsx:264`)
- `/mailboxes` → redirect `/ingestion` (`apps/web/src/App.tsx:268`); `MailboxesPage` imported, never routed (dead)
- `/gmail/callback` GmailCallbackPage, `/gmail/scan-setup` GmailScanSetupPage
- `/cas` CasPage (Tools → CAS)
- `/ingestion` IngestionPage (Inbox → Connect your Gmail); `/ingestion/senders`; `/ingestion/history`; `/ingestion/review` + `/ingestion/discovery` → redirect `/ingestion`
- `/documents` DocumentSorterPage (Tools → Documents)

## Extra scope
- GmailAutoConnectBanner + ScanContext (AppShell) — `apps/web/src/components/layout/AppShell.tsx:90`
- Shared pipeline internals: import jobs (Bull queue `imports`), file parsers (`packages/api/src/ingestion/fileImport/adapters.ts`), Gmail attachment sync, monitored-sender poller, full-inbox scan worker, DLQ (`IngestionFailure`), ingestion recovery.

## Backend mounts
`/api/imports`, `/api/ingestion-failures`, `/api/mailboxes`, `/api/gmail` (two routers), `/api/cas`, `/api/canonical-events`, `/api/monitored-senders`, `/api/ingestion`, `/api/documents-sorter` — `packages/api/src/routes/index.ts:73`.

## Jobs
- importWorker (Bull, concurrency 2, 5-min timeout, 1 attempt), boot rescue + orphan sweep
- mailboxPoller (setInterval, `MAILBOX_POLL_INTERVAL_MIN` default 3) → monitored-sender poll + Gmail attachment sync per Gmail account; IMAP poll for IMAP rows
- gmailScanWorker (Bull `gmail-scan`, 3 attempts, 30-min timeout)
- docSortWorker (Bull `doc-sort`, concurrency 2)
- ingestion recovery: boot (+2 min) and nightly inside dataIntegrityJob 02:15 IST

## Checklist
- [x] Import module
- [x] Email ingestion module
- [x] Gmail module
- [x] CAS module
- [x] Documents module
- [x] Hidden/backend-only listed
