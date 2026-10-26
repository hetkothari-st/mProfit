---
id: [F-TAX-011](F-TAX-011.md)
title: "Tax endpoints with no UI caller (Schedule 112A CSV honouring subject; list FMV overrides)"
module: "Tax Planning"
status: Backend-only
roles: "Authenticated callers"
in_manual: false
---

[← Tax Planning](../modules/tax-planning.md) · [Index](../INDEX.md)

# Tax endpoints with no UI caller (Schedule 112A CSV honouring subject; list FMV overrides)

`F-TAX-011` · Backend-only · Roles: Authenticated callers

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Tax Planning |
| Page / route | none |
| Actions | API only |
| Settings | — |
| Backend | GET /api/tax/schedule-112a.csv; GET /api/tax/fmv-overrides |
| Data read / changed | Read only |
| Sources | ``packages/api/src/routes/tax.routes.ts:42``, ``packages/api/src/routes/tax.routes.ts:45``, ``apps/web/src/api/tax.api.ts:270`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
