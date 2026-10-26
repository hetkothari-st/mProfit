---
id: F-MAIL-006
title: "Automatic Gmail attachment import"
module: "Gmail connection and inbox scans"
status: Live
roles: "Users with Gmail"
settings: [S-INGEST-001]
related: [F-IMPORT-008, F-IMPORT-009, F-INGEST-008, F-MAIL-001, F-MAIL-007]
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Automatic Gmail attachment import

`F-MAIL-006` · Live · Roles: Users with Gmail

**What it does:** On every mailbox poll (every 3 minutes by default), each active Gmail account is searched for emails with attachments from brokers, registrars and depositories or with statement-like subjects; matching attachments are saved and imported through the Import pipeline. You see them as new rows in **Import history**.

**Why it exists:** Code comments: CAS emails arrive 5–60 minutes after a request, and a 3-minute poll gives near-real-time auto-import.

**Where to find it:** Automatic. Results in **Tools → Import → Import history**.

**Who can use it:** Every user with an active Gmail connection.

**Steps:** Not applicable — automatic. Use **Scan inbox** ([F-MAIL-007](F-MAIL-007.md)) to run it immediately.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** [S-INGEST-001](../settings/email-ingestion.md#s-ingest-001) — attachments from active monitored senders skip the file-name filter. Operator: `ENABLE_MAILBOX_POLLER`, `MAILBOX_POLL_INTERVAL_MIN`.

**Results:** New import jobs (target portfolio: default, else first). Each email message is imported at most once.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Account shows **Paused** and "Gmail access lost …" | Google rejected the grant | Reconnect with **Add another** |
| Account shows another last error | Search failed | It is retried on the next poll |
| An expected statement never arrives | File name did not match the patterns and the sender is not monitored, or it is a regulatory document | Add the sender as a monitored sender, or upload the file |

**Limitations:** Searches mail newer than 2 years, up to 500 messages per poll. Regulatory documents (retention statements, margin statements/pledges, client reporting, SEBI circulars, regulatory disclosures, annual reports, welcome kits, onboarding) are always skipped. Imports go to the default portfolio.

**How it works:** Query `has:attachment newer_than:2y (from:(cams OR camsonline OR kfintech OR karvy OR nsdl OR cdsl OR zerodha OR … OR dhan) OR subject:("contract note" OR "consolidated account" OR "CAS" OR "transaction statement" OR "trade confirmation" OR "account statement")) -in:trash`. Allowed extensions: .pdf, .csv, .tsv, .xlsx, .xls, .html, .htm. File names must match contract-note, trade-confirmation, CAS, transaction/holding-statement or spreadsheet patterns unless the sender is an active monitored sender (full address or `@domain` match here). A message already linked to an import job is skipped; identical bytes (SHA-256) are skipped. Each saved attachment becomes an import job with the inferred type and broker. A message that throws is recorded once as an unresolved failure (`gmail.attachment`) and resolved when a later poll succeeds. A per-account lock prevents the poller and a manual scan running together. The same poll first runs the monitored-sender email reader ([F-INGEST-008](F-INGEST-008.md)). Accounts with provider IMAP (from the retired mailbox page) are polled for unread mail since the last poll (7 days on the first run).

**Related features:** [F-MAIL-001](F-MAIL-001.md), [F-MAIL-007](F-MAIL-007.md), [F-IMPORT-008](F-IMPORT-008.md), [F-IMPORT-009](F-IMPORT-009.md), [F-INGEST-008](F-INGEST-008.md).

**Sources:** `packages/api/src/ingestion/gmail/gmail.connector.ts:28`, `packages/api/src/ingestion/gmail/gmail.connector.ts:35`, `packages/api/src/ingestion/gmail/gmail.connector.ts:63`, `packages/api/src/ingestion/gmail/gmail.connector.ts:113`, `packages/api/src/ingestion/gmail/gmail.connector.ts:345`, `packages/api/src/ingestion/gmail/gmail.connector.ts:407`, `packages/api/src/ingestion/gmail/gmail.connector.ts:443`, `packages/api/src/jobs/mailboxPoller.ts:99`, `packages/api/src/jobs/mailboxPoller.ts:194`, `packages/api/src/jobs/mailboxPoller.ts:242`, `packages/api/src/config/env.ts:91`
