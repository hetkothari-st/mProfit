---
id: [F-MAIL-008](F-MAIL-008.md)
title: "IMAP mailboxes (add, test, edit, delete, sync) — old Mailboxes page"
module: "Gmail"
status: Hidden
roles: "—"
in_manual: false
---

[← Gmail connection and inbox scans](../modules/gmail-connection-and-inbox-scans.md) · [Index](../INDEX.md)

# IMAP mailboxes (add, test, edit, delete, sync) — old Mailboxes page

`F-MAIL-008` · Hidden · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Gmail |
| Page / route | /mailboxes (redirects to /ingestion; page never rendered) |
| Actions | — |
| Settings | — |
| Backend | POST /api/mailboxes, POST /test, PATCH/DELETE /:id, POST /api/gmail/:id/sync |
| Data read / changed | MailboxAccount |
| Sources | ``apps/web/src/App.tsx:37``, ``apps/web/src/App.tsx:268``, ``apps/web/src/pages/mailboxes/MailboxesPage.tsx:122``, ``packages/api/src/routes/mailboxes.routes.ts:17`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
