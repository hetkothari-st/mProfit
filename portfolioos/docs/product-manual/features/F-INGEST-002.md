---
id: F-INGEST-002
title: "Discover financial senders"
module: "Email ingestion"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (Gmail connected)"
settings: [S-INGEST-001, S-INGEST-002, S-INGEST-003]
related: [F-INGEST-003, F-INGEST-006, F-INGEST-008, F-MAIL-001]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Discover financial senders

`F-INGEST-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (Gmail connected)

**What it does:** Scans a connected Gmail inbox for senders that look financial, scores them, and lists the ones you do not monitor yet; you tick the ones to watch and add them in one click.

**Why it exists:** The card explains: "Only addresses on this list are fetched. Scan your inbox for financial senders, then pick the ones you want us to watch." It saves you from finding each bank's alert address yourself.

**Where to find it:** **Inbox → Connect your Gmail**, step **2 Senders to monitor**, one box per connected Gmail account.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with a connected Gmail. Not available to [R-MANAGER](../roles.md#r-manager).

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

**Settings and toggles here:** Adding a sender creates it with [S-INGEST-001](../settings/email-ingestion.md#s-ingest-001) (Active) on, [S-INGEST-002](../settings/email-ingestion.md#s-ingest-002) (Auto-commit) on and [S-INGEST-003](../settings/email-ingestion.md#s-ingest-003) threshold 5; its display label is the matched institution's suggested label or the sender's display name.

**Results:** Each added address becomes a monitored sender. From the next poll, emails from it are read and turned into events ([F-INGEST-008](F-INGEST-008.md)).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No financial senders detected in this inbox." | Nothing scored at least 3 | Add a sender manually ([F-INGEST-006](F-INGEST-006.md)) |
| "Every detected sender is already on your monitor list." | All results are already monitored | Nothing to do |
| "Scan failed" / "Gmail account not found" | Gmail access lost or account removed | Reconnect Gmail ([F-MAIL-001](F-MAIL-001.md)) |
| "All <n> add operations failed" / "Sender <address> is already monitored" | Sender exists already | Nothing to do |

**Limitations:** The scan looks at up to 1,000 messages from the last 730 days (2 years). Senders are added with auto-commit already on. Known-institution matching is by exact address only.

**How it works:** `GET /api/gmail/:id/discover` searches the inbox with `newer_than:730d -in:trash -in:spam` plus a financial keyword query, reads each message's sender, subject and snippet, and scores each sender: 2 × keyword score of each subject + keyword score of each snippet; senders scoring below 3 are dropped. Results are sorted by score, then by message count, and matched against built-in institution seeds. The text on the card says scoring uses subject keywords; the code also scores message snippets. Adding calls `POST /api/monitored-senders` once per selected sender.

**Related features:** [F-INGEST-003](F-INGEST-003.md), [F-INGEST-006](F-INGEST-006.md), [F-INGEST-008](F-INGEST-008.md), [F-MAIL-001](F-MAIL-001.md).

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:495`, `apps/web/src/pages/ingestion/IngestionPage.tsx:556`, `apps/web/src/pages/ingestion/IngestionPage.tsx:570`, `apps/web/src/pages/ingestion/IngestionPage.tsx:652`, `apps/web/src/pages/ingestion/IngestionPage.tsx:658`, `apps/web/src/pages/ingestion/IngestionPage.tsx:781`, `packages/api/src/controllers/gmail.controller.ts:75`, `packages/api/src/ingestion/gmail/discovery.ts:239`, `packages/api/src/ingestion/gmail/discovery.ts:251`, `packages/api/src/ingestion/gmail/keywords.ts:36`, `packages/api/src/ingestion/gmail/keywords.ts:153`
