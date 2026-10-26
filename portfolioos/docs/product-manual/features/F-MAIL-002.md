---
id: F-MAIL-002
title: "Email accounts and disconnect"
module: "Gmail connection and inbox scans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-MAIL-001, F-MAIL-006]
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Email accounts and disconnect

`F-MAIL-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** The **Email accounts** card lists each connected Gmail with "Last checked <date time>" or "Not polled yet", any last error, **Active** or **Paused**, and a disconnect button.

**Why it exists:** Inferred from behavior: shows whether the inbox is being read and lets you revoke access.

**Where to find it:** **Inbox → Connect your Gmail**, step 1 card **Email accounts** (shown once a Gmail is connected).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). Not [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Read the account line. **Paused** with "Gmail access lost: …" means the app lost access.
2. To disconnect, click the cross and confirm "Disconnect <email>?". The toast "Gmail disconnected" appears.
3. Click **Refresh** at the top of the page to see the account removed.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Cross icon | Button | Disconnects the account after confirmation | Disabled while disconnecting |
| **Active** / **Paused** | Display | Whether the account is polled | — |

**Fields and rules:** None.

**Settings and toggles here:** None (an account cannot be paused by hand; it is paused automatically when access is lost).

**Results:** The app asks Google to revoke its grant and deletes the mailbox record. Already imported transactions, events and inbox-scan documents stay.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Gmail access lost: Access token rejected (refresh_token may be expired or revoked). Click Reconnect on the Mailboxes page." | Google rejected the stored grant; the account was paused | Click **Add another** and sign in with the same account (there is no Reconnect button or Mailboxes page) |
| Account still listed after "Gmail disconnected" | The card does not reload on its own | Click **Refresh** |
| "Failed to disconnect" / "Gmail account not found" | Server error, or already removed | Refresh the page |

**Limitations:** After disconnecting, the list is not refreshed automatically. The reauthorisation message names a page and button that no longer exist.

**How it works:** `DELETE /api/gmail/:id` checks the account is yours and a Gmail account, calls Google's token revocation (errors ignored) and deletes the `MailboxAccount` row. When any poll gets an authorisation error, the account is set inactive with the "Gmail access lost" message.

**Related features:** [F-MAIL-001](F-MAIL-001.md), [F-MAIL-006](F-MAIL-006.md).

**Sources:** `apps/web/src/pages/ingestion/IngestionPage.tsx:354`, `apps/web/src/pages/ingestion/IngestionPage.tsx:434`, `apps/web/src/pages/ingestion/IngestionPage.tsx:456`, `packages/api/src/controllers/gmail.controller.ts:88`, `packages/api/src/ingestion/gmail/gmail.connector.ts:247`, `packages/api/src/ingestion/gmail/gmail.connector.ts:544`
