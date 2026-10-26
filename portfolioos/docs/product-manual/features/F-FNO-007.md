---
id: F-FNO-007
title: "Recompute positions"
module: "Futures & Options"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (owner)"
settings: []
related: [F-FNO-002]
---

[← Futures & Options](../modules/futures-options.md) · [Index](../INDEX.md)

# Recompute positions

`F-FNO-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (owner)

**What it does:** The circular-arrow button (tooltip "Recompute derivative positions"; text "Recompute" on small screens) rebuilds every F&O position in the portfolio from its transactions and shows "Positions recomputed".

**Why it exists:** Repairs positions after imports or edits. Inferred from behavior.

**Where to find it:** **Asset Classes → F & O** header (route `/fo`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), for portfolios they own.

**Steps**
1. Click the recompute button. It spins; then "Positions recomputed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Recompute (icon) | Button | Rebuild positions | No portfolio, or running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** All derivative positions for the portfolio are rebuilt.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Recompute failed" / "Forbidden" | Not your portfolio or server error | Check the portfolio |

**Limitations:** None known.

**How it works:** `POST /api/fo/recompute` with `{ portfolioId }`; the server checks ownership and replays every F&O asset.

**Related features:** [F-FNO-002](F-FNO-002.md).

**Sources:** `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:244`, `apps/web/src/pages/assetClasses/FuturesOptionsPage.tsx:358`, `packages/api/src/controllers/fo.controller.ts:195`
