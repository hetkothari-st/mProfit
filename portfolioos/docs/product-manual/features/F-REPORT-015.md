---
id: F-REPORT-015
title: "Inbox imports tab"
module: "Reports"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (not R-MANAGER)"
settings: [S-REPORT-008, S-REPORT-009, S-REPORT-010]
related: []
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Inbox imports tab

`F-REPORT-015` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (not [R-MANAGER](../roles.md#r-manager))

**What it does:** The review queue for attachments found by a Gmail scan. While a scan runs, a blue line shows "Scanning your inbox — X / Y messages • N documents pending review". Status chips (**Pending review**, **Approved**, **Imported**, **Parse failed**, **All**), sender and document-type filters, and a table (File, From, Date, Type, Confidence, Status, Actions) with **Preview**, **Approve**, **+ Always**, **Reject** per row and bulk **Approve selected** / **Reject selected** / **Clear**.

**Why it exists:** Documents found in email are only imported after you approve them. Inferred from behavior.

**Where to find it:** **Tools → Reports → Inbox imports**; also opened from the dashboard Gmail scan card and after starting a Gmail scan (`/reports?tab=inbox-imports`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) with a connected Gmail. [R-MANAGER](../roles.md#r-manager) cannot use it: `/api/gmail` is an account route ("Switch back to your own account to do this.").

**Steps**
1. Open the tab. **Pending review** is selected.
2. Optional: filter by sender or document type.
3. Click **Preview** (or the file name) to open the document.
4. Click **Approve** to import it, **+ Always** to approve and auto-approve future documents from that sender, or **Reject**.
5. To act on many: tick rows (only pending ones can be ticked), then **Approve selected** or **Reject selected**. Toast "Approved selected" / "Rejected selected".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Status chips | Buttons | [S-REPORT-008](../settings/reports.md#s-report-008) | — |
| **All senders** select | Select | [S-REPORT-009](../settings/reports.md#s-report-009) | — |
| **All doc types** select | Select | [S-REPORT-010](../settings/reports.md#s-report-010) | — |
| Row checkbox | Checkbox | Select for bulk action | Disabled unless the row is pending review |
| **Preview** | Button | Opens the preview sheet | — |
| **Approve** / **+ Always** / **Reject** | Buttons | Act on one document | Shown only for pending rows; disabled while an action runs |
| **Approve selected** / **Reject selected** / **Clear** | Buttons | Bulk actions | Shown only when rows are selected |

**Fields and rules:** Not applicable — filters only.

**Settings and toggles here:** [S-REPORT-008](../settings/reports.md#s-report-008) **Status filter**, [S-REPORT-009](../settings/reports.md#s-report-009) **Sender filter**, [S-REPORT-010](../settings/reports.md#s-report-010) **Doc type filter** — not saved.

**Results:** Approved documents are queued for import into your transactions; rejected ones are marked rejected. **+ Always** also creates an auto-approve rule for that sender.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Approve failed" / "Reject failed" / "Bulk approve failed" / "Bulk reject failed" (or the server's message) | The action was refused or failed | Retry; see the Gmail inbox page ([D-REPORT-003](../dependencies.md#d-report-003)) |
| "No documents in this filter." | Nothing matches | Switch to **All** |

**Limitations:** Shows at most 200 documents per filter. The statuses Rejected, Not financial and Already imported can only be seen under **All**. Single-row **Reject** never adds the sender to a blocklist.

**How it works:** Scan jobs are polled every 5 seconds; while one is PENDING/LISTING/DOWNLOADING/CLASSIFYING, or any listed document is CLASSIFYING/IMPORTING, the list refreshes every 3 seconds. Endpoints are the Gmail scan API owned by B07 (list scans, list docs with `limit=200`, senders, approve, reject, bulk approve with `createAutoApproveRule=false`, bulk reject).

**Related features:** [D-REPORT-003](../dependencies.md#d-report-003).

**Sources:** `apps/web/src/pages/reports/InboxImportsTab.tsx:28`, `apps/web/src/pages/reports/InboxImportsTab.tsx:38`, `apps/web/src/pages/reports/InboxImportsTab.tsx:51`, `apps/web/src/pages/reports/InboxImportsTab.tsx:55`, `apps/web/src/pages/reports/InboxImportsTab.tsx:113`, `apps/web/src/pages/reports/InboxImportsTab.tsx:122`, `apps/web/src/pages/reports/InboxImportsTab.tsx:185`, `apps/web/src/pages/reports/InboxImportsTab.tsx:216`, `apps/web/src/components/upload/InboxImportRow.tsx:47`, `apps/web/src/components/upload/InboxImportRow.tsx:99`
