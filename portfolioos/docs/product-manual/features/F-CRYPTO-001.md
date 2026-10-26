---
id: F-CRYPTO-001
title: "Crypto holdings with live prices"
module: "Crypto"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CRYPTO-002, F-CRYPTO-003]
---

[← Crypto](../modules/crypto.md) · [Index](../INDEX.md)

# Crypto holdings with live prices

`F-CRYPTO-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows a live ticker strip (first 8 coins with a price: symbol, 24h change %, INR price), cards **Invested**, **Current value** (INR and USD, "live"), **Unrealised P&L** (with %), **Coins held** ("N with live prices"), a **Your Coins** grid (one card per holding: current value in INR and USD, Qty, P&L %, 24h change; sorted by value) and a **Transactions** table (Date, Coin, Type, Qty, Price, Amount) with edit and delete.

**Why it exists:** Track crypto at market prices. Page description: "Track Bitcoin, Ethereum, and other digital assets with live prices".

**Where to find it:** **Asset Classes → Crypto** (route `/crypto`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager); edits only in portfolios you own.

**Steps**
1. Open **Asset Classes → Crypto**. Prices refresh every 15 seconds while the tab is visible.
2. Click a coin card to open its detail page ([F-CRYPTO-003](F-CRYPTO-003.md)).
3. Delete a transaction: bin → **Yes**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Coin card | Button | Opens `/crypto/<id>` | — |
| **Download** | Button | Report filtered to Crypto ([D-ASSET-001](../dependencies.md#d-asset-001)) | — |
| **Add Crypto** / **Add your first coin** | Button | Opens "Add Cryptocurrency" | — |
| Edit (pencil) / Delete → **Yes** / **No** | Icons | Edit or delete a transaction | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No crypto holdings yet" / "Track Bitcoin, Ethereum, Solana and more with live INR + USD prices." | No entries | **Add your first coin** |
| A coin shows no live price | It was typed as free text, not picked from search | Edit and pick it from search |

**Limitations:** Live prices exist only for coins in the app's coin list (13 seeded: Bitcoin, Ethereum, Solana, Cardano, XRP, Dogecoin, Polkadot, Polygon, Chainlink, Avalanche, BNB, Tether, USD Coin, plus any coin added for analytics). Staking rewards don't add to the holding.

**How it works:** Live data from `GET /api/assets/crypto/live` (server caches 10 s; falls back to the last stored price). A holding is matched to a coin by the CoinGecko id stored in its ISIN field. Value = units × live INR price, else the server's stored value. The server also re-prices crypto holdings every 2 minutes.

**Related features:** [F-CRYPTO-002](F-CRYPTO-002.md), [F-CRYPTO-003](F-CRYPTO-003.md), [D-ASSET-007](../dependencies.md#d-asset-007).

**Sources:** `apps/web/src/pages/assetClasses/CryptoPage.tsx:192`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:197`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:224`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:253`, `apps/web/src/pages/assetClasses/CryptoPage.tsx:360`, `packages/api/src/priceFeeds/crypto.service.ts:9`, `packages/api/src/priceFeeds/crypto.service.ts:232`, `packages/api/src/jobs/priceJobs.ts:351`
