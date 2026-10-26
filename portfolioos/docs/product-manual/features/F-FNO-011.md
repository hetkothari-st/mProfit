---
id: [F-FNO-011](F-FNO-011.md)
title: "Option chain and margin snapshot endpoints"
module: "Futures & Options"
status: Backend-only
roles: "[R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)"
in_manual: false
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# Option chain and margin snapshot endpoints

`F-FNO-011` · Backend-only · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Futures & Options |
| Page / route | — (no UI) |
| Actions | — |
| Settings | — |
| Backend | GET /api/fo/option-chain; GET /api/fo/margin |
| Data read / changed | OptionChain snapshot, MarginSnapshot (read) |
| Sources | `packages/api/src/routes/fo.routes.ts:45`, `packages/api/src/routes/fo.routes.ts:47` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
