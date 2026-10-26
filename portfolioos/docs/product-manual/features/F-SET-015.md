---
id: [F-SET-015](F-SET-015.md)
title: "Per-user SMTP sending config"
module: "Settings"
status: Backend-only
roles: "—"
in_manual: false
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Per-user SMTP sending config

`F-SET-015` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Settings |
| Page / route | none |
| Actions | GET/PUT/DELETE /api/notifications/config |
| Settings | — |
| Backend | /api/notifications/config |
| Data read / changed | UserNotificationConfig |
| Sources | `packages/api/src/routes/notifications.routes.ts:17`, `packages/api/src/services/notifications/config.service.ts:97` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
