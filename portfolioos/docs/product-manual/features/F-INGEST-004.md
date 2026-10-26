---
id: F-INGEST-004
title: "Pending review queue"
module: "Email ingestion"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-INGEST-002]
related: [F-INGEST-005, F-INGEST-007, F-INGEST-008, F-INGEST-009]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Pending review queue

`F-INGEST-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Lists events read from your monitored senders that are waiting for you, grouped by sender. You approve (write it to your records) or reject each one, approve all events of a sender at once, or open an event to see every extracted detail.

**Why it exists:** The card says: "Events parsed from your monitored senders, waiting for your approval before they land as transactions."

**Where to find it:** **Inbox → Connect your Gmail**, step **3 Pending review**. The same queue is the **Pending review** tab of **See committed / rejected** ([F-INGEST-007](F-INGEST-007.md)).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-MANAGER](../roles.md#r-manager) can act on the managed person's events but that person has no Gmail connection, so the list is normally empty.

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

**Settings and toggles here:** [S-INGEST-002](../settings/email-ingestion.md#s-ingest-002) decides which events skip this queue.

**Results:** Approve: the event becomes CONFIRMED, the sender's approved count goes up by one, and the event is written ([F-INGEST-009](F-INGEST-009.md)); on success it becomes PROJECTED and leaves the queue. Reject: the event becomes REJECTED with your reason and moves to the history's **Rejected / failed** tab.

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

**Related features:** [F-INGEST-005](F-INGEST-005.md), [F-INGEST-007](F-INGEST-007.md), [F-INGEST-008](F-INGEST-008.md), [F-INGEST-009](F-INGEST-009.md).

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:110`, `apps/web/src/pages/ingestion/IngestionPage.tsx:137`, `apps/web/src/pages/ingestion/IngestionPage.tsx:902`, `apps/web/src/pages/ingestion/IngestionPage.tsx:967`, `apps/web/src/pages/ingestion/IngestionPage.tsx:988`, `apps/web/src/pages/ingestion/IngestionPage.tsx:1128`, `apps/web/src/pages/ingestion/IngestionPage.tsx:1163`, `packages/api/src/controllers/canonicalEvents.controller.ts:48`, `packages/api/src/controllers/canonicalEvents.controller.ts:52`, `packages/api/src/services/imports/canonicalEvents.service.ts:50`, `packages/api/src/services/imports/canonicalEvents.service.ts:178`, `packages/api/src/services/imports/canonicalEvents.service.ts:239`, `packages/api/src/services/imports/canonicalEvents.service.ts:275`, `packages/api/src/config/env.ts:91`
