---
id: F-MAIL-003
title: "Choose how far back to scan"
module: "Gmail connection and inbox scans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-MAIL-002]
related: [F-MAIL-001, F-MAIL-004]
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Choose how far back to scan

`F-MAIL-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Starts a one-off *inbox scan* of your most recently connected active Gmail for every PDF, XLSX, XLS or CSV attachment between two dates, then sends you to **Reports → Inbox imports** to review what it finds.

**Why it exists:** The page says: "We'll look for every PDF, XLSX, XLS or CSV attachment in your Gmail between these dates." It back-fills history right after you connect.

**Where to find it:** Shown automatically after connecting Gmail (route `/gmail/scan-setup`). There is no menu entry.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with an active Gmail. Not [R-MANAGER](../roles.md#r-manager).

**Steps**
1. Adjust **Scan from** and **Scan until**, or click a preset: **Last 7 days**, **Last 30 days**, **Last 1 year**, **Last 5 years**.
2. Click **Start scan**. The toast "Scan started — review docs as they appear" appears and you go to **Reports → Inbox imports**.
3. Or click **Skip for now** to go to the dashboard.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan from** | Date | First day to scan | Cannot be after **Scan until** |
| **Scan until** | Date | Last day to scan | Cannot be before **Scan from** or after today |
| **Last 7 days** / **Last 30 days** / **Last 1 year** / **Last 5 years** | Buttons | Set **Scan from** and set **Scan until** to today | — |
| **Skip for now** | Button | Goes to `/dashboard` | — |
| **Start scan** | Button | Creates the scan | Disabled while starting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Scan from | Date | Yes | YYYY-MM-DD | 5 years ago | "lookbackTo must be after lookbackFrom" (same day as **Scan until**) |
| Scan until | Date | Yes | YYYY-MM-DD, not after today | Today | As above |

**Settings and toggles here:** [S-MAIL-002](../settings/gmail-connection-and-inbox-scans.md#s-mail-002) **Scan from / Scan until** — the scan window; used once, not remembered.

**Results:** A scan job starts in the background. Found attachments appear one by one in **Reports → Inbox imports** for approval ([F-MAIL-004](F-MAIL-004.md)).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Connect Gmail before starting a scan" | No active Gmail | Connect Gmail |
| "lookbackTo must be after lookbackFrom" | Both dates are the same day | Pick at least two different days |
| "Too many requests for this operation. Please wait a minute." | More than 5 scans started in one minute | Wait a minute |
| "Failed to start scan" | Other error | Try again |

**Limitations:** The page text says "Both dates inclusive" and allows the same date twice, but the server refuses a one-day range. With several Gmail accounts, only the most recently connected active one is scanned. A running scan cannot be cancelled or resumed from the app.

**How it works:** `POST /api/gmail/scan-jobs` (`lookbackFrom`, `lookbackTo` as YYYY-MM-DD, parsed at 12:00 UTC) under the costly-operation rate limit (5 per minute); creates a `GmailScanJob` (kind FULL, status PENDING) and queues it on `gmail-scan`.

**Related features:** [F-MAIL-001](F-MAIL-001.md), [F-MAIL-004](F-MAIL-004.md), [D-MAIL-001](../dependencies.md#d-mail-001).

**Sources:** `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:21`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:34`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:46`, `apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:88`, `packages/api/src/routes/gmailScan.routes.ts:28`, `packages/api/src/controllers/gmailScan.controller.ts:36`, `packages/api/src/services/gmail/gmailScanJobs.service.ts:16`
