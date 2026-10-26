---
id: F-BOND-001
title: "Bonds holdings and entries"
module: "Bonds"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-BOND-002]
---

[← Bonds](../modules/bonds.md) · [Index](../INDEX.md)

# Bonds holdings and entries

`F-BOND-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows summary cards **Invested**, **Current value**, **Unrealised P&L** (with %), a holdings table (Name with ISIN, Type — Govt Bond / Corp Bond / Bond, Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table (Date, Name, Type, Qty, Price, Amount) with edit and delete on each row.

**Why it exists:** Track bond holdings and coupons alongside other assets. Page description: "Track bonds, government securities, and corporate bonds".

**Where to find it:** **Asset Classes → Bonds** (route `/bonds`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (no plan gate); [R-MANAGER](../roles.md#r-manager) on the managed person's data; changes only in portfolios you own.

**Steps**
1. Open **Asset Classes → Bonds**. Summary, holdings and transactions load (skeleton rows while loading).
2. To delete a transaction, click its bin, then **Yes** ("Transaction deleted"); **No** cancels.
3. To edit, click the pencil; the bond form opens ([F-BOND-002](F-BOND-002.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** | Button | Report dialog filtered to Bond, Govt Bond, Corp Bond ([D-ASSET-001](../dependencies.md#d-asset-001)) | — |
| **Add** | Button | Opens "Add Bond" ([F-BOND-002](F-BOND-002.md)) | — |
| **Add first entry** | Button | Same, from the empty state | Only when empty |
| Edit (pencil, "Edit") | Icon | Opens the entry in the bond form | — |
| Delete (bin, "Delete") → **Yes** / **No** | Icon + buttons | Deletes the transaction after "Sure?" | — |

**Fields and rules:** Not applicable — view only (see [F-BOND-002](F-BOND-002.md)).

**Settings and toggles here:** None.

**Results:** Delete removes the transaction and rebuilds the holding.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No bonds yet" / "Add a transaction to start tracking this asset class." | No bond holdings or transactions | **Add first entry** |
| Current value ₹0 and P&L equal to minus the invested amount | Bonds have no price source, so no holding has a current value; the summary adds only holdings that have one | Read **Invested**; ignore Current value and P&L (DOCUMENTATION_GAPS.md) |
| "Failed to delete" | Not your portfolio, or server error | — |

**Limitations:** No market or accrued valuation for bonds; the holdings table shows "—" under Current and P&L. Coupon entries do not change the holding.

**How it works:** Same as every asset-class page: holdings from `GET /api/portfolios/:id/holdings` filtered to BOND, GOVT_BOND, CORPORATE_BOND; transactions from `GET /api/transactions?assetClass=…&pageSize=200` per class, merged newest first. Summary: Invested = Σ cost; Current value = Σ of holdings that have a current value; P&L = Current − Invested; % = P&L ÷ Invested × 100 to 1 decimal.

**Related features:** [F-BOND-002](F-BOND-002.md), [D-ASSET-001](../dependencies.md#d-asset-001), [D-ASSET-008](../dependencies.md#d-asset-008).

**Sources:** `apps/web/src/pages/assetClasses/BondsPage.tsx:7`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:137`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:188`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:297`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:411`, `packages/api/src/priceFeeds/router.service.ts:94`
