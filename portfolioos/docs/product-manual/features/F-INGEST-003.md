---
id: F-INGEST-003
title: "Currently monitored senders (on the ingestion page)"
module: "Email ingestion"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-INGEST-001, S-INGEST-002]
related: [F-INGEST-002, F-INGEST-006]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Currently monitored senders (on the ingestion page)

`F-INGEST-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Lists your monitored senders under "Currently monitored (<n>)" with their label, address, an **Auto** badge when auto-commit is on, and **Active**/**Paused**, with a remove button for each.

**Why it exists:** Inferred from behavior: lets you see and prune the allow-list without leaving the setup page.

**Where to find it:** **Inbox → Connect your Gmail**, step **2 Senders to monitor**, below the scan boxes.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with Gmail connected.

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

**Settings and toggles here:** Shows [S-INGEST-001](../settings/email-ingestion.md#s-ingest-001) and [S-INGEST-002](../settings/email-ingestion.md#s-ingest-002); change them on the senders page.

**Results:** Removing stops future fetching from that address. Past events stay.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No senders yet. Scan above, or add manually from the settings page." | Empty list | Scan or add a sender |
| "Could not remove sender" | Server error | Try again |

**Limitations:** The whole step is hidden until a Gmail account is connected.

**How it works:** `DELETE /api/monitored-senders/:id` deletes the row after checking ownership; events from that sender are not deleted.

**Related features:** [F-INGEST-002](F-INGEST-002.md), [F-INGEST-006](F-INGEST-006.md).

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:514`, `apps/web/src/pages/ingestion/IngestionPage.tsx:798`, `apps/web/src/pages/ingestion/IngestionPage.tsx:840`, `packages/api/src/services/gmail/monitoredSenders.service.ts:137`
