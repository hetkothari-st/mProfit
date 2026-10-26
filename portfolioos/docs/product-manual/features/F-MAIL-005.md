---
id: F-MAIL-005
title: "Gmail auto-connect banner"
module: "Gmail connection and inbox scans"
status: Live
roles: "Gmail-address users without a connection"
settings: [S-MAIL-001]
related: [F-MAIL-001, F-MAIL-006]
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Gmail auto-connect banner

`F-MAIL-005` · Live · Roles: Gmail-address users without a connection

**What it does:** A strip at the top of every app page: "Auto-import statements from your inbox. Connect <your email> — we'll fetch contract notes, CAS PDFs, and trade confirmations automatically. You approve each new sender once." with **Connect Gmail** and a dismiss button.

**Why it exists:** Inferred from behavior: prompts Gmail users to switch on automatic statement import.

**Where to find it:** Top of the app shell on any signed-in page.

**Who can use it:** Shown only when your sign-in email ends in @gmail.com or @googlemail.com, Gmail sign-in is configured on the server, you have no active Gmail connection, and you have not dismissed it on this browser.

**Steps**
1. Click **Connect Gmail** to start [F-MAIL-001](F-MAIL-001.md).
2. Or click the cross (tooltip "Dismiss") to hide it on this browser for good.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Disabled while starting |
| Cross (tooltip "Dismiss") | Button | Hides the banner on this browser | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-MAIL-001](../settings/gmail-connection-and-inbox-scans.md#s-mail-001) **Dismiss** — stored on this browser only; other browsers still show the banner.

**Results:** Connect: as [F-MAIL-001](F-MAIL-001.md). Dismiss: banner hidden on this browser.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Google sign-in" | Server error | Try again |

**Limitations:** "You approve each new sender once" is not exactly what happens: attachments from any sender are imported when their file name looks like a statement ([F-MAIL-006](F-MAIL-006.md)), and monitored senders start with auto-commit on. A paused (access-lost) account counts as "not connected", so the banner returns.

**How it works:** Reads `GET /api/auth/me`, `GET /api/mailboxes` and `GET /api/gmail/config` (each cached for 60 seconds); dismissal writes localStorage key `gmail-auto-connect-dismissed` = `1`.

**Related features:** [F-MAIL-001](F-MAIL-001.md), [F-MAIL-006](F-MAIL-006.md).

**Sources:** `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:11`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:45`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:51`, `apps/web/src/components/layout/GmailAutoConnectBanner.tsx:72`, `apps/web/src/components/layout/AppShell.tsx:97`
