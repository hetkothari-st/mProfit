---
id: [F-INGEST-010](F-INGEST-010.md)
title: "Edit or read one event before approval"
module: "Email ingestion"
status: Backend-only
roles: "—"
in_manual: false
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Edit or read one event before approval

`F-INGEST-010` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Email ingestion |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | PATCH /api/canonical-events/:id, GET /api/canonical-events/:id |
| Data read / changed | CanonicalEvent |
| Sources | ``packages/api/src/routes/canonicalEvents.routes.ts:19``, ``packages/api/src/controllers/canonicalEvents.controller.ts:35`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
