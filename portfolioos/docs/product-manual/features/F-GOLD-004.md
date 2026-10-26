---
id: F-GOLD-004
title: "Gold holding detail page"
module: "Gold & Silver"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-GOLD-001, F-GOLD-003]
---

[← Gold & Silver](../modules/gold-silver.md) · [Index](../INDEX.md)

# Gold holding detail page

`F-GOLD-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** A page per metal holding: photo carousel (previous/next, dots, "N / M", **Delete photo**), type and portfolio, purity badge and name, ISIN, **Current Valuation** (live), price per gram/unit with premium % over your average cost, **Unrealised** P&L, a two-point **Cost · Value** chart, **The Ledger** (Invested "across N lots", Weight/Units, Avg Cost, Live Price, Held For, XIRR or Activity), **First Acquired**, **Last Activity**, **Net Position** (bought − sold), and a **Transactions** timeline with edit/delete and photo thumbnails.

**Why it exists:** A record of one piece or lot with its photos and value. Inferred from behavior.

**Where to find it:** Click a holding on **Gold & Silver** (route `/gold/:holdingId`).

**Who can use it:** Same as [F-GOLD-001](F-GOLD-001.md).

**Steps**
1. Open a holding from the list.
2. With no photos, click **Add Photo** to attach one (to the newest transaction).
3. Hover a transaction to edit (pencil) or delete (bin → confirm bin, or **Cancel**).
4. **Gold & Silver** (back) returns to the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Gold & Silver** (back) | Button | Returns to `/gold` | — |
| **Add Photo** | Button | Uploads one image to the newest transaction | Hidden once any photo exists |
| **Previous photo** / **Next photo** / dots | Buttons | Browse photos | One photo or fewer |
| **Delete photo** | Button | Deletes the shown photo | — |
| **Edit transaction** / **Delete transaction** → **Confirm delete transaction** / **Cancel** | Icons | Edit or delete | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Photo and transaction changes are saved; deleting the last transaction returns you to the list.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent back to `/gold` | Opened by a direct link or after refresh — the page only works when opened from the list | Open it from the list (DOCUMENTATION_GAPS.md) |
| "Add a transaction before uploading a photo" | No transaction found | — |
| Photo shows "Unavailable" | The image could not be loaded | Delete and re-add |

**Limitations:** Stats come from the list's snapshot and don't refresh after an edit until you reopen. Only the newest 200 transactions of that class are searched. Once one photo exists there is no further **Add Photo** button here; add more through the edit form (max 5).

**How it works:** Transactions are filtered by the holding's asset key. Live value as in [F-GOLD-001](F-GOLD-001.md) (refresh every 60 s). Held For = server holding period, else days since the first transaction ("Ny Nmo"). XIRR shown when the server returns a reliable one.

**Related features:** [F-GOLD-001](F-GOLD-001.md), [F-GOLD-003](F-GOLD-003.md).

**Sources:** `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:318`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:337`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:343`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:356`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:390`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:401`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:518`, `apps/web/src/pages/assetClasses/GoldAssetDetailPage.tsx:626`
