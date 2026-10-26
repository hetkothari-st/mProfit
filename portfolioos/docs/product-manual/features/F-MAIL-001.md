---
id: F-MAIL-001
title: "Connect Gmail"
module: "Gmail connection and inbox scans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-INGEST-002, F-INGEST-008, F-MAIL-002, F-MAIL-003, F-MAIL-005, F-MAIL-006]
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Connect Gmail

`F-MAIL-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Sends you to Google to choose an account and grant access, then stores an encrypted access grant for that mailbox. After a successful connection you land on the scan-range page ([F-MAIL-003](F-MAIL-003.md)).

**Why it exists:** The empty state explains it: "EveryPaisa scans Gmail for financial emails (read-only) and turns them into transactions. Connect once — we never scan anything except the senders you explicitly allow."

**Where to find it:** **Inbox → Connect your Gmail**, step **1 Connect your email** → **Connect Gmail**; or **Add another** on the **Email accounts** card; or **Connect Gmail** on the shell banner ([F-MAIL-005](F-MAIL-005.md)). Google returns you to `/gmail/callback`.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). Denied to [R-MANAGER](../roles.md#r-manager) ("Switch back to your own account to do this.").

**Steps**
1. Click **Connect Gmail** (or **Add another**). The browser goes to Google's account chooser and consent screen.
2. Choose the Google account and allow access.
3. Google sends you back; the page shows "Connecting Gmail…", then a toast "Connected <email>".
4. After about half a second you are taken to **Choose how far back to scan** ([F-MAIL-003](F-MAIL-003.md)). If something failed you are taken back to **Email ingestion**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Disabled while the sign-in link is being created; shown when no Gmail is connected |
| **Add another** | Button | Connects another (or reconnects the same) Google account | Shown when at least one Gmail is connected |

**Fields and rules:** None in the app; Google asks for account and consent.

**Settings and toggles here:** None.

**Results:** A Gmail mailbox record is created (or, for the same address, updated and re-activated with a fresh grant). From the next poll the app imports matching attachments ([F-MAIL-006](F-MAIL-006.md)) and reads monitored senders' emails ([F-INGEST-008](F-INGEST-008.md)).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Google sign-in" | Gmail sign-in is not configured on the server, or a network error | Ask the operator; try again |
| "Google rejected: <error>" | You cancelled or Google refused consent | Try again and allow access |
| "Incomplete response from Google — please try connecting again" | Missing code or state in the return address | Start again |
| "Invalid or expired OAuth state — start the connect flow again" | The sign-in was started by another session, reused, or took too long | Click **Connect Gmail** again |
| "Internal server error" | Google did not return a long-lived grant (for example access was granted before) or another unmapped error | Remove the app's access at your Google account permissions page, then connect again |

**Limitations:** The app asks Google for permission to read **and send** email (send is used for rental rent reminders), although the screen describes the connection as read-only. Reconnecting the same address replaces its grant.

**How it works:** `GET /api/gmail/auth-url` issues a single-use state value tied to you and returns Google's URL with offline access, prompt "select_account consent" and scopes `gmail.readonly` and `gmail.send`. The callback page posts `code` and `state` to `POST /api/gmail/callback`; the server rejects a state not issued to you, exchanges the code, requires a refresh token, reads the mailbox address from Gmail, and stores refresh and access tokens encrypted. If the callback page was opened as a pop-up (rental reminders), it closes itself instead of navigating.

**Related features:** [F-MAIL-002](F-MAIL-002.md), [F-MAIL-003](F-MAIL-003.md), [F-MAIL-006](F-MAIL-006.md), [F-INGEST-002](F-INGEST-002.md), [D-MAIL-003](../dependencies.md#d-mail-003).

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:346`, `apps/web/src/pages/ingestion/IngestionPage.tsx:385`, `apps/web/src/pages/ingestion/IngestionPage.tsx:418`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:26`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:39`, `apps/web/src/pages/mailboxes/GmailCallbackPage.tsx:55`, `packages/api/src/controllers/gmail.controller.ts:42`, `packages/api/src/ingestion/gmail/gmail.connector.ts:24`, `packages/api/src/ingestion/gmail/gmail.connector.ts:147`, `packages/api/src/ingestion/gmail/gmail.connector.ts:162`, `packages/api/src/ingestion/gmail/gmail.connector.ts:173`
