---
id: [F-ADV-012](F-ADV-012.md)
title: "List model portfolios / edit target weights"
module: "Advisor"
status: Backend-only
roles: "—"
in_manual: false
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# List model portfolios / edit target weights

`F-ADV-012` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Advisor |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | GET /api/advisor/model-portfolios, PUT /api/advisor/model-portfolios/:id/targets |
| Data read / changed | ModelPortfolioVersion (insert) |
| Sources | ``packages/api/src/routes/advisor.routes.ts:65``, ``packages/api/src/services/advisor/modelPortfolio.service.ts:127`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
