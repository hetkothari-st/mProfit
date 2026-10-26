---
id: [F-IMPORT-011](F-IMPORT-011.md)
title: "Ingestion failures page (dead-letter queue): list, filter, detail, retry, mark resolved"
module: "Import"
status: Hidden
roles: "[R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (typed URL only)"
in_manual: false
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Ingestion failures page (dead-letter queue): list, filter, detail, retry, mark resolved

`F-IMPORT-011` · Hidden · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (typed URL only)

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Import |
| Page / route | /import/failures (also /ops/ingestion-failures) |
| Actions | Filter chips, adapter filter, Load more, Retry parse, Mark as resolved |
| Settings | — |
| Backend | GET /api/ingestion-failures, GET /:id, POST /:id/retry, POST /:id/resolve |
| Data read / changed | IngestionFailure |
| Sources | ``apps/web/src/pages/imports/FailuresPage.tsx:46``, ``apps/web/src/components/layout/navItems.tsx:122``, ``apps/web/src/pages/imports/ImportPage.tsx:137``, ``packages/api/src/routes/ingestionFailures.routes.ts:16`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
