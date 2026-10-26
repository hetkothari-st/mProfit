---
id: [F-MAIL-009](F-MAIL-009.md)
title: "Manual Gmail attachment sync endpoint"
module: "Gmail"
status: Backend-only
roles: "—"
in_manual: false
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# Manual Gmail attachment sync endpoint

`F-MAIL-009` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Gmail |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | POST /api/gmail/:id/sync |
| Data read / changed | ImportJob |
| Sources | ``packages/api/src/routes/gmail.routes.ts:19``, ``apps/web/src/api/gmail/gmail.api.ts:25`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
