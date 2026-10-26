---
id: [F-PORT-010](F-PORT-010.md)
title: "Corporate actions API"
module: "Portfolios"
status: Backend-only
roles: "Any signed-in API caller"
in_manual: false
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Corporate actions API

`F-PORT-010` · Backend-only · Roles: Any signed-in API caller

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Portfolios |
| Page / route | None (no web caller) |
| Actions | GET report, POST sync, POST apply |
| Settings | None |
| Backend | /api/corporate-actions |
| Data read / changed | CorporateAction, Transaction |
| Sources | `packages/api/src/routes/corporateActions.routes.ts:15` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
