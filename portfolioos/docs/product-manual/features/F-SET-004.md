---
id: F-SET-004
title: "Email notifications (Connect Gmail, Send test)"
module: "Settings"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-SET-003]
related: [F-SET-005, F-SET-015]
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Email notifications (Connect Gmail, Send test)

`F-SET-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Connects your Gmail account so EveryPaisa can send rent reminders from your own address, and lets you send yourself a test email.

**Why it exists:** The card text: "Rent reminders are sent via your Gmail account. One-time sign-in, no passwords stored."

**Where to find it:** **Tools → Settings → Email notifications**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Not connected: read "Sign in with your Google account to allow EveryPaisa to send rent reminders on your behalf…" and click **Connect Gmail**. You are taken to Google.
2. After Google, the app continues to the Gmail scan setup page (B07, [D-SET-001](../dependencies.md#d-set-001)).
3. Connected: the card shows "Gmail connected" and the Gmail address, with **Reconnect**.
4. Under **Send test email**, type an address and click **Send test**. Toast "Test email sent to <address>".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google consent | Only when not connected; disabled while starting |
| **Reconnect** | Button | Runs Google consent again | Only when connected |
| Test address | Email field | Recipient | Only when connected |
| **Send test** | Button | Sends "EveryPaisa — test email" | Disabled with an empty address or while sending |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Test address | Email | Yes | Valid email (server) | Empty | Server "Validation failed" for a malformed address |

**Settings and toggles here:** [S-SET-003](../settings/settings.md#s-set-003) **Gmail connection** — connected: reminders and tests go through Gmail; not connected: tests fail with "Connect Gmail above first".

**Results:** A Gmail connection is stored (shared with inbox import). Test emails arrive from your Gmail address.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Test failed — Connect Gmail above first" | No active Gmail connection | **Connect Gmail** |
| "Test failed — Click Reconnect — the current Gmail grant is missing the send permission" | Connected before the send permission was added | **Reconnect** |
| "Test failed — <reason>" | Gmail API error | Reconnect or try later |
| "Could not start Google sign-in" | Could not get the Google link | Try again |

**Limitations:** The note under the button says "You'll be redirected to Google, then back here", but the app goes to the Gmail scan setup page. The grant includes Gmail read-only access, so it also enables inbox import (B07). There is no "Disconnect" here; that is in the Inbox area.

**How it works:** **Connect Gmail** fetches the Google consent URL from the Gmail API module (scopes `gmail.readonly` and `gmail.send`) and navigates there. GET `/api/notifications/status` reports whether an active Gmail OAuth mailbox with a refresh token exists and its address. POST `/api/notifications/test` sends through the Gmail API only; it never falls back to SMTP.

**Related features:** [F-SET-005](F-SET-005.md), [F-SET-015](F-SET-015.md), [D-SET-001](../dependencies.md#d-set-001), [D-SET-002](../dependencies.md#d-set-002).

**Sources:** `apps/web/src/pages/settings/NotificationsSection.tsx:29`, `apps/web/src/pages/settings/NotificationsSection.tsx:50`, `apps/web/src/pages/settings/NotificationsSection.tsx:146`, `packages/api/src/routes/notifications.routes.ts:16`, `packages/api/src/services/notifications/config.service.ts:203`, `packages/api/src/services/notifications/config.service.ts:226`, `packages/api/src/services/notifications/gmailSender.service.ts:33`, `packages/api/src/ingestion/gmail/gmail.connector.ts:24`
