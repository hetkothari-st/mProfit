---
id: [F-MAIL-010](F-MAIL-010.md)
title: "Inbox scan cancel / resume and auto-approve rule management"
module: "Gmail"
status: Backend-only
roles: "—"
in_manual: false
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Inbox scan cancel / resume and auto-approve rule management

`F-MAIL-010` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Gmail |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | POST /api/gmail/scan-jobs/:id/cancel, /resume; GET/POST/DELETE /api/gmail/auto-approve-rules |
| Data read / changed | GmailScanJob, GmailAutoApproveRule |
| Sources | ``packages/api/src/routes/gmailScan.routes.ts:31``, ``packages/api/src/routes/gmailScan.routes.ts:44`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
