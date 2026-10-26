---
id: [F-ADV-013](F-ADV-013.md)
title: "Engine run history"
module: "Advisor"
status: Backend-only
roles: "—"
in_manual: false
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Engine run history

`F-ADV-013` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Advisor |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | GET /api/advisor/runs |
| Data read / changed | AdvisorRun (read, newest 25) |
| Sources | ``packages/api/src/routes/advisor.routes.ts:39``, ``packages/api/src/services/advisor/advisorRecommendations.service.ts:257`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
