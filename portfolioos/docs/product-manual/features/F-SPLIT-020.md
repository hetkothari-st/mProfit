---
id: [F-SPLIT-020](F-SPLIT-020.md)
title: "Contact edit/delete, settlement edit, group type change, deleted-expense listing"
module: "Split Expenses"
status: Backend-only
roles: "—"
in_manual: false
---

[← Split Expenses](../modules/split-expenses.md) · [Index](../INDEX.md)

# Contact edit/delete, settlement edit, group type change, deleted-expense listing

`F-SPLIT-020` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Split Expenses |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | PATCH/DELETE /api/split/contacts/:id, PATCH /api/split/settlements/:id, PATCH /api/split/groups/:id {type}, GET …/expenses?includeDeleted=1, DELETE /api/split/labels/:id |
| Data read / changed | Split tables |
| Sources | ``packages/api/src/routes/split.routes.ts:16``, ``packages/api/src/routes/split.routes.ts:40``, ``packages/api/src/controllers/split.controller.ts:96`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
