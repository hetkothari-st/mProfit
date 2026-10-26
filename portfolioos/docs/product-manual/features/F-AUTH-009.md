---
id: [F-AUTH-009](F-AUTH-009.md)
title: "Sign out everywhere (API flag)"
module: "Sign-in & session"
status: Backend-only
roles: "—"
in_manual: false
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Sign out everywhere (API flag)

`F-AUTH-009` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Sign-in & session |
| Page / route | none |
| Actions | POST /api/auth/logout {everywhere} |
| Settings | — |
| Backend | POST /api/auth/logout |
| Data read / changed | RefreshToken |
| Sources | `packages/api/src/controllers/auth.controller.ts:158`, `packages/api/src/routes/auth.routes.ts:37` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
