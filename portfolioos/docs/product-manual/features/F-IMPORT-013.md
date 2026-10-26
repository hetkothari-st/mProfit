---
id: [F-IMPORT-013](F-IMPORT-013.md)
title: "Read one import job"
module: "Import"
status: Backend-only
roles: "—"
in_manual: false
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Read one import job

`F-IMPORT-013` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Import |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | GET /api/imports/:id |
| Data read / changed | ImportJob (read) |
| Sources | ``packages/api/src/routes/imports.routes.ts:26``, ``apps/web/src/api/imports/imports.api.ts:32`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
