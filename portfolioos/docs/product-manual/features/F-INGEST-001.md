---
id: F-INGEST-001
title: "Email ingestion page and status strip"
module: "Email ingestion"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-INGEST-002, F-INGEST-004, F-INGEST-006, F-INGEST-007, F-MAIL-001, F-MAIL-002]
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Email ingestion page and status strip

`F-INGEST-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows the page "Email ingestion" with a status strip — **Gmail connected** / **Connect Gmail**, "<n> sender(s)" / **Add senders**, and once both exist "<n> event(s) to review" / **Inbox clear** — then the three steps: **Connect your email** (or **Email accounts**), **Senders to monitor** and **Pending review**.

**Why it exists:** The header says: "Automatically capture transactions from your bank, broker, and insurer emails. Everything is reviewable before it lands in your records." A code comment describes it as one screen that walks you through connect → pick senders → review.

**Where to find it:** **Inbox → Connect your Gmail** (route `/ingestion`). Old addresses `/mailboxes`, `/ingestion/review` and `/ingestion/discovery` redirect here.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-MANAGER](../roles.md#r-manager): the email-account parts fail with "Switch back to your own account to do this." because Gmail is an account-level connection.

**Steps**
1. Open **Inbox → Connect your Gmail**.
2. Read the status strip to see which step is next.
3. Click **Refresh** (top right) to reload accounts, senders and events.
4. Click **Sender settings** to open the full sender list ([F-INGEST-006](F-INGEST-006.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Reloads email accounts, senders and events | Never |
| Status chips | Display | Progress through the three steps | The review chip is hidden until Gmail and at least one sender exist |
| **Sender settings** | Link | Opens `/ingestion/senders` | Never |
| Step 2 placeholder "Senders to monitor" — "Available once Gmail is connected …" | Display | Keeps the numbering while Gmail is not connected | Hidden once a Gmail account exists |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this part of the page.

**Results:** Nothing changes.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Switch back to your own account to do this." | You are managing a family member's account | Click **Back to my account** |

**Limitations:** The page header promises everything is reviewable, but senders added from this page or the senders page start with auto-commit switched on, so their confident events are written without review (see [F-INGEST-006](F-INGEST-006.md) and DOCUMENTATION_GAPS.md).

**How it works:** The page loads `GET /api/mailboxes` (only accounts with provider GMAIL_OAUTH are shown), `GET /api/monitored-senders`, and `GET /api/canonical-events?status=PARSED&limit=200` plus `?status=PENDING_REVIEW&limit=200`. The pending count is the size of those two lists combined.

**Related features:** [F-MAIL-001](F-MAIL-001.md), [F-MAIL-002](F-MAIL-002.md), [F-INGEST-002](F-INGEST-002.md), [F-INGEST-004](F-INGEST-004.md), [F-INGEST-006](F-INGEST-006.md), [F-INGEST-007](F-INGEST-007.md).

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:62`, `apps/web/src/pages/ingestion/IngestionPage.tsx:168`, `apps/web/src/pages/ingestion/IngestionPage.tsx:259`, `apps/web/src/pages/ingestion/IngestionPage.tsx:320`, `apps/web/src/App.tsx:268`, `apps/web/src/App.tsx:275`, `packages/api/src/services/family/managedProfile.service.ts:45`
