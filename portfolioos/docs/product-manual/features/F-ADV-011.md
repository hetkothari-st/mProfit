---
id: [F-ADV-011](F-ADV-011.md)
title: "Reorder override list"
module: "Advisor"
status: Backend-only
roles: "—"
in_manual: false
---

[← Investment Advisor](../modules/investment-advisor.md) · [Index](../INDEX.md)

# Reorder override list

`F-ADV-011` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Advisor |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | PUT /api/advisor/approved-products/order |
| Data read / changed | AdvisorApprovedProduct.rank |
| Sources | ``packages/api/src/routes/advisor.routes.ts:58`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
