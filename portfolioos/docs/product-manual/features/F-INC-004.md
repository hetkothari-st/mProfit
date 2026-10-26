---
id: [F-INC-004](F-INC-004.md)
title: "Read one income entry endpoint"
module: "Income"
status: Backend-only
roles: "Signed-in callers"
in_manual: false
---

[← Income](../modules/income.md) · [Index](../INDEX.md)

# Read one income entry endpoint

`F-INC-004` · Backend-only · Roles: Signed-in callers

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Income |
| Page / route | none |
| Actions | API only |
| Settings | — |
| Backend | GET /api/income/:id |
| Data read / changed | Income (read) |
| Sources | ``packages/api/src/routes/income.routes.ts:14`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
