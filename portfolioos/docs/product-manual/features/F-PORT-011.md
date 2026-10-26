---
id: [F-PORT-011](F-PORT-011.md)
title: "Manual market-data sync endpoints"
module: "Portfolios"
status: Backend-only
roles: "Any signed-in API caller"
in_manual: false
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Manual market-data sync endpoints

`F-PORT-011` · Backend-only · Roles: Any signed-in API caller

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Portfolios |
| Page / route | None (no web caller except AMFI sync on Mutual Funds) |
| Actions | POST sync-all, sync-prices, sync-universe, sync-corp-actions, sync-commodities, sync-crypto, sync-fx |
| Settings | None |
| Backend | /api/assets/sync-* |
| Data read / changed | Shared market tables |
| Sources | `packages/api/src/routes/assets.routes.ts:50` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
