---
id: F-MAIL-007
title: "Scan inbox now"
module: "Gmail connection and inbox scans"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-INGEST-008, F-MAIL-006]
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Scan inbox now

`F-MAIL-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Runs the Gmail attachment import ([F-MAIL-006](F-MAIL-006.md)) immediately for every active Gmail account, without waiting for the next poll, and refreshes the import lists when it finishes.

**Why it exists:** Inferred from behavior: after requesting a CAS by email you can pull it in as soon as it arrives.

**Where to find it:** **Asset Classes → Mutual Funds**, button **Scan inbox** (the button belongs to the Mutual Funds page; the behaviour is shared app-wide).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with an active Gmail. [R-MANAGER](../roles.md#r-manager) gets an error (account route).

**Steps**
1. Click **Scan inbox**. A toast says "Scanning Gmail — imports will appear when found".
2. When it finishes, import lists refresh; new files appear in **Import history**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Scan inbox** | Button | Starts the scan | Ignored while a scan is already running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** As [F-MAIL-006](F-MAIL-006.md).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No active Gmail account connected" | No Gmail, or access lost | Connect Gmail |

**Limitations:** Only attachments are imported; the email-text event reader ([F-INGEST-008](F-INGEST-008.md)) is not triggered. If the poller is running for the same account at that moment, the manual run returns at once with nothing done.

**How it works:** The shell-wide scan context calls `POST /api/mailboxes/:id/poll` for each active Gmail account in parallel; for Gmail this runs `syncGmailAccount`.

**Related features:** [F-MAIL-006](F-MAIL-006.md), [D-IMPORT-001](../dependencies.md#d-import-001).

**Sources:** `apps/web/src/context/ScanContext.tsx:22`, `apps/web/src/context/ScanContext.tsx:27`, `apps/web/src/context/ScanContext.tsx:35`, `apps/web/src/components/layout/AppShell.tsx:90`, `packages/api/src/controllers/mailboxes.controller.ts:120`, `packages/api/src/ingestion/gmail/gmail.connector.ts:348`
