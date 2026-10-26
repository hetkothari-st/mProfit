---
id: [F-INGEST-012](F-INGEST-012.md)
title: "Auto-discover senders after connecting (`?auto-discover=1`)"
module: "Email ingestion"
status: Hidden
roles: "—"
in_manual: false
---

[← Email ingestion](../modules/email-ingestion.md) · [Index](../INDEX.md)

# Auto-discover senders after connecting (`?auto-discover=1`)

`F-INGEST-012` · Hidden · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Email ingestion |
| Page / route | /ingestion?auto-discover=1 |
| Actions | Auto scan + preselect |
| Settings | — |
| Backend | GET /api/gmail/:id/discover |
| Data read / changed | — |
| Sources | ``apps/web/src/pages/ingestion/IngestionPage.tsx:60``, ``apps/web/src/pages/ingestion/IngestionPage.tsx:603`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
