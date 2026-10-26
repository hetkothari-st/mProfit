---
id: [F-FAM-025](F-FAM-025.md)
title: "Rename / re-describe a family"
module: "Family"
status: Backend-only
roles: "[R-FAMOWNER](../roles.md#r-famowner)"
in_manual: false
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Rename / re-describe a family

`F-FAM-025` · Backend-only · Roles: [R-FAMOWNER](../roles.md#r-famowner)

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Family |
| Page / route | none (API only) |
| Actions | PATCH |
| Settings | — |
| Backend | PATCH /api/families/:familyId |
| Data read / changed | Family |
| Sources | ``packages/api/src/routes/families.routes.ts:187``, ``packages/api/src/services/family/family.service.ts:118`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
