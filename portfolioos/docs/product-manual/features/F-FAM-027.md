---
id: [F-FAM-027](F-FAM-027.md)
title: "Unshare a portfolio from a family"
module: "Family"
status: Backend-only
roles: "Portfolio owner"
in_manual: false
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Unshare a portfolio from a family

`F-FAM-027` · Backend-only · Roles: Portfolio owner

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Family |
| Page / route | none (API only) |
| Actions | POST |
| Settings | — |
| Backend | POST /api/families/:familyId/portfolios/:pid/unshare |
| Data read / changed | Portfolio.familyId → null |
| Sources | ``packages/api/src/routes/families.routes.ts:402``, ``packages/api/src/services/family/family.service.ts:1615`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
