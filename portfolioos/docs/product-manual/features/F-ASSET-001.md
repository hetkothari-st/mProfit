---
id: [F-ASSET-001](F-ASSET-001.md)
title: "Manual price/universe sync and lookup endpoints under /api/assets (sync-all, sync-prices, sync-universe, sync-corp-actions, sync-commodities, sync-crypto, sync-fx, amfi/refresh-holdings, quote, stocks/:id/price, commodities/latest, fx/latest)"
module: "Asset classes (common)"
status: Backend-only
roles: "Any signed-in user"
in_manual: false
---

[Index](../INDEX.md)

# Manual price/universe sync and lookup endpoints under /api/assets (sync-all, sync-prices, sync-universe, sync-corp-actions, sync-commodities, sync-crypto, sync-fx, amfi/refresh-holdings, quote, stocks/:id/price, commodities/latest, fx/latest)

`F-ASSET-001` · Backend-only · Roles: Any signed-in user

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Asset classes (common) |
| Page / route | — (no B01 caller) |
| Actions | — |
| Settings | — |
| Backend | /api/assets/* |
| Data read / changed | Price tables, HoldingProjection (write, all users) |
| Sources | `packages/api/src/routes/assets.routes.ts:50`, `packages/api/src/routes/assets.routes.ts:56` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
