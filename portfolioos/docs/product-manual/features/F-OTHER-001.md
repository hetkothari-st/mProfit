---
id: F-OTHER-001
title: "Other assets holdings and entries"
module: "Other Assets"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-OTHER-002]
---

[← Other Assets](../modules/other-assets.md) · [Index](../INDEX.md)

# Other assets holdings and entries

`F-OTHER-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows **Invested**, **Current value**, **Unrealised P&L** cards, a holdings table (Name, Type — PMS, AIF, ULIP, REIT, InvIT, Real Estate, Art, Cash, Other — Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table with edit and delete.

**Why it exists:** Record assets that have no dedicated page. Page description: "Track PMS, AIF, ULIP, REIT, InvIT, real estate, and more".

**Where to find it:** **Asset Classes → Others** (route `/others`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager); edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → Others**; edit or delete transactions as on other pages.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report filtered to these classes ([D-ASSET-001](../dependencies.md#d-asset-001)) | — |
| **Add** / **Add first entry** | Button | Opens "Add Other Asset" | — |
| Edit / Delete → **Yes** / **No** | Icons + buttons | Edit or delete | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No other assets yet" | No entries | **Add first entry** |
| Current value ₹0 and P&L equal to minus the invested amount | None of these classes has a price source | Read **Invested** only (DOCUMENTATION_GAPS.md) |

**Limitations:** No valuation for any of these classes; Real Estate entries made elsewhere appear here, but the dedicated **Real Estate** page is separate.

**How it works:** Standard asset-class page over PMS, AIF, ULIP, REIT, INVIT, REAL_ESTATE, ART_COLLECTIBLES, CASH, OTHER.

**Related features:** [F-OTHER-002](F-OTHER-002.md).

**Sources:** `apps/web/src/pages/assetClasses/OtherAssetsPage.tsx:7`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:192`, `packages/api/src/priceFeeds/router.service.ts:102`
