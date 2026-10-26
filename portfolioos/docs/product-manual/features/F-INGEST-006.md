---
id: F-INGEST-006
title: "Monitored senders page"
module: "Email ingestion"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-INGEST-001, S-INGEST-002, S-INGEST-003, S-INGEST-004]
related: [F-INGEST-002, F-INGEST-003, F-INGEST-005, F-INGEST-008, F-MAIL-006]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Monitored senders page

`F-INGEST-006` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The page "Monitored senders" lists every sender with its approval progress and lets you add a sender by hand, switch auto-commit, pause or resume polling, and delete it.

**Why it exists:** The header says: "The email addresses we scan for financial events. Only senders listed here are polled — everything else is ignored."

**Where to find it:** **Inbox → Connect your Gmail → Sender settings** (or **Auto-commit settings**), route `/ingestion/senders`.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

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

**Settings and toggles here:** [S-INGEST-001](../settings/email-ingestion.md#s-ingest-001) **Active** (power icon) — on: the sender's emails are fetched each poll; off ("Paused"): ignored. [S-INGEST-002](../settings/email-ingestion.md#s-ingest-002) **Auto-commit** (lightning) — on: confident events (confidence 0.70 or more, all figures found in the email) are written without review; off: every event waits in **Pending review**; it starts **on** for every new sender. [S-INGEST-003](../settings/email-ingestion.md#s-ingest-003) **Auto-commit after N confirmed events** — how many approvals are needed before auto-commit can be switched back on. [S-INGEST-004](../settings/email-ingestion.md#s-ingest-004) **Display label** — name shown instead of the address.

**Results:** Changes apply from the next poll. Deleting stops fetching and keeps past events.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Approve <n> more event(s) from this sender before enabling auto-commit." | Turning auto-commit back on before the threshold | Approve more events |
| "Could not add sender" / "Update failed" / "Could not remove sender" | Server error | Try again |
| A sender shows an empty name | Added with the label box left as an empty string | Delete and re-add, or type a label |
| `@domain` sender never produces events | Domain-form senders are fetched but never matched to emails (confirmed defect) | Add the full alert address instead |

**Limitations:** A sender's address cannot be edited (delete and re-add). The page has no way to edit the display label or threshold after creation. A sender added in `@domain.com` form is included in the Gmail search but its emails are never matched back to it, so they are never parsed (logged in DOCUMENTATION_GAPS.md). Pausing a sender also stops its emails being used to relax the attachment-name filter ([F-MAIL-006](F-MAIL-006.md)).

**How it works:** `POST /api/monitored-senders` (address, displayLabel, autoCommitAfter 1–100) normalises the address, refuses duplicates per user, fills a missing label from the institution seed, and creates the sender with `autoCommitEnabled = true` unless the caller says otherwise (this page never says otherwise). `PATCH /api/monitored-senders/:id` updates `isActive`, `autoCommitEnabled`, `displayLabel` or `autoCommitAfter`; turning auto-commit on is refused below the threshold. The list is ordered active first, then by address.

**Related features:** [F-INGEST-002](F-INGEST-002.md), [F-INGEST-003](F-INGEST-003.md), [F-INGEST-005](F-INGEST-005.md), [F-INGEST-008](F-INGEST-008.md), [F-MAIL-006](F-MAIL-006.md).

**Sources:** `apps/web/src/pages/ingestion/SendersPage.tsx:20`, `apps/web/src/pages/ingestion/SendersPage.tsx:70`, `apps/web/src/pages/ingestion/SendersPage.tsx:88`, `apps/web/src/pages/ingestion/SendersPage.tsx:131`, `apps/web/src/pages/ingestion/SendersPage.tsx:171`, `apps/web/src/pages/ingestion/SendersPage.tsx:253`, `apps/web/src/pages/ingestion/SendersPage.tsx:274`, `packages/api/src/controllers/monitoredSenders.controller.ts:13`, `packages/api/src/services/gmail/monitoredSenders.service.ts:39`, `packages/api/src/services/gmail/monitoredSenders.service.ts:99`, `packages/api/src/ingestion/gmail/poller.ts:165`
