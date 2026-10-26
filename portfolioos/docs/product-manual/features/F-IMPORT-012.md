---
id: [F-IMPORT-012](F-IMPORT-012.md)
title: "Market data & scoring failures card"
module: "Import"
status: Hidden
roles: "Any signed-in user (typed URL only)"
in_manual: false
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Market data & scoring failures card

`F-IMPORT-012` · Hidden · Roles: Any signed-in user (typed URL only)

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Import |
| Page / route | /import/failures |
| Actions | View |
| Settings | — |
| Backend | GET /api/ingestion-failures/feeds |
| Data read / changed | FeedRunLog (read, global) |
| Sources | ``apps/web/src/pages/imports/FailuresPage.tsx:436``, ``packages/api/src/services/imports/ingestionFailures.service.ts:226`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
