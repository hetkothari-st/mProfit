---
id: F-NPS-001
title: "NPS holdings and entries"
module: "NPS"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-NPS-002]
---

[← NPS](../modules/nps.md) · [Index](../INDEX.md)

# NPS holdings and entries

`F-NPS-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows **Invested**, **Current value**, **Unrealised P&L** cards, a holdings table (Name with PRAN, Type, Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table with edit and delete.

**Why it exists:** Keep NPS in your net-worth picture. Page description: "Track your National Pension System PRAN and scheme allocations".

**Where to find it:** **Asset Classes → NPS** (route `/nps`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager); edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → NPS**.
2. Edit (pencil) or delete (bin → **Yes**) a transaction.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report filtered to NPS ([D-ASSET-001](../dependencies.md#d-asset-001)) | — |
| **Add** / **Add first entry** | Button | Opens "Add NPS Entry" | — |
| Edit / Delete → **Yes** / **No** | Icons + buttons | Edit or delete | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No NPS yet" / "Add a transaction to start tracking this asset class." | No entries | **Add first entry** |
| Current value ₹0 and P&L equal to minus the invested amount | NPS has no price source; no holding has a current value | Read **Invested** only (DOCUMENTATION_GAPS.md) |

**Limitations:** No NAV or scheme-allocation tracking despite the page description; "Growth / returns" entries do not change the holding.

**How it works:** Standard asset-class page over class NPS (see "How asset-class pages work").

**Related features:** [F-NPS-002](F-NPS-002.md), [D-ASSET-008](../dependencies.md#d-asset-008).

**Sources:** `apps/web/src/pages/assetClasses/NpsPage.tsx:7`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:188`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:301`, `packages/api/src/priceFeeds/router.service.ts:99`
