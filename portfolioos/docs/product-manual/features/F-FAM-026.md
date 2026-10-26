---
id: [F-FAM-026](F-FAM-026.md)
title: "Leave a family"
module: "Family"
status: Backend-only
roles: "Any member"
in_manual: false
---

[← Family](../modules/family.md) · [Index](../INDEX.md)

# Leave a family

`F-FAM-026` · Backend-only · Roles: Any member

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Family |
| Page / route | none (API only) |
| Actions | POST |
| Settings | — |
| Backend | POST /api/families/:familyId/leave |
| Data read / changed | FamilyMember.status → REVOKED |
| Sources | ``packages/api/src/routes/families.routes.ts:228``, ``packages/api/src/services/family/family.service.ts:415`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
