---
id: F-INGEST-005
title: "Auto-commit offer"
module: "Email ingestion"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-INGEST-002, S-INGEST-003]
related: [F-INGEST-004, F-INGEST-006, F-INGEST-007]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Auto-commit offer

`F-INGEST-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** When a sender without auto-commit reaches its approval threshold (default 5 approved events), a banner offers to trust it: "<sender> has <n> confirmed events. Trust it and skip review next time?" with **Enable auto-commit**. On the history page, the approval that crosses the threshold also shows a toast "<address> is reliable. Enable auto-commit on the Senders page." with **Go**.

**Why it exists:** Inferred from behavior and code comments: let a sender earn trust through manual approvals before its events skip review.

**Where to find it:** **Inbox → Connect your Gmail**, top of step **3 Pending review**; and the **Pending review** tab of `/ingestion/history`.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. When the banner appears, click **Enable auto-commit**. The toast "Auto-commit enabled" appears and the banner disappears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Enable auto-commit** | Button | Turns on auto-commit for that sender | Disabled while saving; banner shown only for active senders with auto-commit off and approved count ≥ threshold |
| **Go** (toast) | Button | Opens the senders page | Toast lasts 10 seconds |

**Fields and rules:** None.

**Settings and toggles here:** [S-INGEST-002](../settings/email-ingestion.md#s-ingest-002) **Auto-commit** (turned on here) and [S-INGEST-003](../settings/email-ingestion.md#s-ingest-003) (the threshold).

**Results:** Future confident events from that sender are written without review.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Approve <n> more event(s) from this sender before enabling auto-commit." | Threshold not reached | Approve more events first |
| "Could not enable auto-commit" | Other error | Try again |

**Limitations:** Because new senders start with auto-commit on, the banner appears only for senders whose auto-commit you turned off.

**How it works:** `PATCH /api/monitored-senders/:id` with `{ autoCommitEnabled: true }`; the server refuses when `confirmedEventCount < autoCommitAfter`.

**Related features:** [F-INGEST-004](F-INGEST-004.md), [F-INGEST-006](F-INGEST-006.md), [F-INGEST-007](F-INGEST-007.md).

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:98`, `apps/web/src/pages/ingestion/IngestionPage.tsx:930`, `apps/web/src/pages/ingestion/ReviewPage.tsx:149`, `apps/web/src/pages/ingestion/ReviewPage.tsx:216`, `packages/api/src/controllers/monitoredSenders.controller.ts:54`
