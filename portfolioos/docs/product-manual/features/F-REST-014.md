---
id: [F-REST-014](F-REST-014.md)
title: "Real estate summary endpoint"
module: "Real Estate"
status: Backend-only
roles: "—"
in_manual: false
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Real estate summary endpoint

`F-REST-014` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Real Estate |
| Page / route | none in B05 (sidebar value, B10) |
| Actions | — |
| Settings | — |
| Backend | GET /api/real-estate/summary |
| Data read / changed | OwnedProperty (read) |
| Sources | ``packages/api/src/routes/realEstate.routes.ts:22``, ``apps/web/src/hooks/useSidebarClassValues.ts:29`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
