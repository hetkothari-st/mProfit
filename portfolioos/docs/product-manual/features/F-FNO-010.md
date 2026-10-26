---
id: [F-FNO-010](F-FNO-010.md)
title: "F&O portfolio settings endpoint (auto-approve expiry close, default equity tax treatment)"
module: "Futures & Options"
status: Backend-only
roles: "[R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)"
in_manual: false
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# F&O portfolio settings endpoint (auto-approve expiry close, default equity tax treatment)

`F-FNO-010` · Backend-only · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Futures & Options |
| Page / route | — (no UI) |
| Actions | — |
| Settings | [S-FNO-001](../settings/futures-options.md#s-fno-001), [S-FNO-002](../settings/futures-options.md#s-fno-002) |
| Backend | PATCH /api/fo/settings/:portfolioId |
| Data read / changed | PortfolioSetting.autoApproveExpiryClose, Portfolio.defaultEquityTaxTreatment (write) |
| Sources | `packages/api/src/controllers/fo.controller.ts:273`, `packages/api/src/routes/fo.routes.ts:54` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
