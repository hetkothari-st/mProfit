---
id: F-GOLD-001
title: "Gold & Silver holdings with live valuation"
module: "Gold & Silver"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-GOLD-002, F-GOLD-003, F-GOLD-004]
---

[← Gold & Silver](../modules/gold-silver.md) · [Index](../INDEX.md)

# Gold & Silver holdings with live valuation

`F-GOLD-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows the live rate bar ([F-GOLD-002](F-GOLD-002.md)), cards **Invested**, **Current value** (with a pulsing "live" dot) and **Unrealised P&L** (with %), a holdings table (Name, Type — Physical Gold / Gold Bond / Gold ETF / Silver, Portfolio, Qty / Units, Avg cost, Invested, Current, P&L) and a **Transactions** table with photo thumbnails (up to 3, then "+N"; click to enlarge), edit and delete. Clicking a holding opens its detail page ([F-GOLD-004](F-GOLD-004.md)).

**Why it exists:** Value metal holdings at today's rate. Page description: "Track physical gold, sovereign gold bonds, gold ETFs, and silver".

**Where to find it:** **Asset Classes → Gold & Silver** (route `/gold`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) on the managed person's data; edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → Gold & Silver**. Values refresh every 10 seconds.
2. Click a holding row for its detail page; click a photo thumbnail to enlarge it.
3. Delete a transaction with the bin → **Yes**; edit with the pencil ([F-GOLD-003](F-GOLD-003.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Holding row | Click | Opens `/gold/<id>` | — |
| Photo thumbnail ("View photo") | Button | Enlarges the photo | No photos |
| **Download** | Button | Report filtered to Physical Gold, Gold Bond, Gold ETF, Silver ([D-ASSET-001](../dependencies.md#d-asset-001)) | — |
| **Add** / **Add first entry** | Button | Opens "Add Gold / Silver" | — |
| Edit (pencil) / Delete (bin) → **Yes** / **No** | Icons + buttons | Edit or delete a transaction | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None on this table (purity pickers: [F-GOLD-002](F-GOLD-002.md)).

**Results:** Read only (delete rebuilds the holding).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No gold & silver yet" / "Add a transaction to start tracking this asset class." | No entries | **Add first entry** |
| Gold ETF value far too high | The name doesn't contain a recognised ticker, so the page falls back to the server value, which prices ETF units as grams of gold | Put the ticker (e.g. GOLDBEES) in the name (DOCUMENTATION_GAPS.md) |

**Limitations:** The page's live value and the server's stored value (used by the dashboard, reports and net worth) differ: the server values physical gold at the 24K price whatever the carat, ignores silver purity, and values Gold ETF units at the per-gram gold price (DOCUMENTATION_GAPS.md). Recognised gold ETF tickers: GOLDBEES, GOLDIETF, AXISGOLD, HDFCGOLD, KOTAKGOLD, SETFGOLD, LICMFGOLD, QGOLDHALF.

**How it works:** Live prices from `GET /api/assets/commodities/live` every 10 s. Per holding: Physical gold = 24K price per gram × (carat ÷ 24) × grams, carat read from a "22K"-style tag in the name (default 24); SGB = 24K price × units; Gold ETF = that ticker's NAV × units; Silver = silver price per gram × purity factor (999 → 1, 925 → 0.925, 800 → 0.8, read from a leading "999/925/800" in the name) × grams. If no live value can be made, the server value is used; P&L = value − cost.

**Related features:** [F-GOLD-002](F-GOLD-002.md), [F-GOLD-003](F-GOLD-003.md), [F-GOLD-004](F-GOLD-004.md), [D-ASSET-007](../dependencies.md#d-asset-007).

**Sources:** `apps/web/src/pages/assetClasses/GoldPage.tsx:10`, `apps/web/src/pages/assetClasses/GoldPage.tsx:24`, `apps/web/src/pages/assetClasses/GoldPage.tsx:39`, `apps/web/src/pages/assetClasses/GoldPage.tsx:45`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:173`, `apps/web/src/pages/assetClasses/SimpleAssetPage.tsx:371`, `packages/api/src/priceFeeds/router.service.ts:65`, `packages/api/src/services/holdings/holdingsProjection.ts:478`
