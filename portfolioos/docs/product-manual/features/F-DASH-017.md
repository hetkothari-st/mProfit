---
id: F-DASH-017
title: "Gmail connect and scan progress cards"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: []
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Gmail connect and scan progress cards

`F-DASH-017` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** If you have not connected Gmail, a card "Auto-import from Gmail — Scan your inbox for contract notes and statements — you approve each document before import." offers **Connect Gmail**. If Gmail is connected and an inbox scan is running, a card "Scanning your Gmail inbox…" shows "<processed> / <total> messages • N financial document(s) found", a progress bar and **Review docs**.

**Why it exists:** Inferred from behavior: invites automatic import and shows its progress where you land.

**Where to find it:** Dashboard, below the alerts strip area.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Click **Connect Gmail**. You are sent to Google to approve access (continued in the Gmail chapter).
2. While a scan runs, click **Review docs** to open Reports → inbox imports.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Hidden when an active Gmail mailbox exists |
| **Review docs** | Button link | Opens `/reports?tab=inbox-imports` | Shown only while a scan is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** See the Gmail chapter ([D-DASH-011](../dependencies.md#d-dash-011)).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Gmail connect" (or the server's message) | Could not get the Google sign-in link | Try again; ask the operator if Google sign-in is configured |

**Limitations:** The progress card disappears when no scan is running.

**How it works:** `GET /api/mailboxes` (active Gmail mailbox?), `GET /api/gmail/auth-url`, and `GET /api/gmail/scan-jobs` polled every 3 seconds while a scan is in PENDING, LISTING, DOWNLOADING or CLASSIFYING.

**Related features:** [D-DASH-011](../dependencies.md#d-dash-011).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:1499`, `apps/web/src/components/dashboard/ConnectGmailCard.tsx:8`, `apps/web/src/components/dashboard/ConnectGmailCard.tsx:24`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:9`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:18`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:49`
