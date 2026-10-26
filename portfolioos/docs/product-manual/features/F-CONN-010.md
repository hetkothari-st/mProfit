---
id: [F-CONN-010](F-CONN-010.md)
title: "Finfactor webhooks"
module: "Connections"
status: Backend-only
roles: "external (Finvu)"
in_manual: false
---

[← Connections](../modules/connections.md) · [Index](../INDEX.md)

# Finfactor webhooks

`F-CONN-010` · Backend-only · Roles: external (Finvu)

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Connections |
| Page / route | /api/integrations/finfactor/webhook/* |
| Actions | external calls only |
| Settings | — |
| Backend | finfactor webhook router |
| Data read / changed | AaConsent (update) |
| Sources | `packages/api/src/routes/finfactor.routes.ts:89`, `packages/api/src/ingestion/finfactor/webhooks.service.ts:74` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
