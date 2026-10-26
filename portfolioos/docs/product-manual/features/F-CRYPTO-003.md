---
id: F-CRYPTO-003
title: "Coin detail page"
module: "Crypto"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CRYPTO-001, F-CRYPTO-002]
---

[← Crypto](../modules/crypto.md) · [Index](../INDEX.md)

# Coin detail page

`F-CRYPTO-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** A page per coin holding: symbol and portfolio badges, a **CoinGecko** link, **Current Value** (INR, USD, price per coin, 24h change), **Unrealised P&L**, stats **Invested**, **Quantity**, **Avg cost**, **XIRR** and **Held for** when available, a **Source** box (Exchange, Network, Wallet from the latest transaction), and **Transactions** with an edit pencil.

**Why it exists:** One coin's position and history. Inferred from behavior.

**Where to find it:** Click a coin card on **Crypto** (route `/crypto/:holdingId`).

**Who can use it:** Same as [F-CRYPTO-001](F-CRYPTO-001.md).

**Steps**
1. Open a coin card. Prices refresh every 15 s.
2. Click a transaction's pencil to edit it (delete from inside the form).
3. **Cryptocurrency** (back) returns.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cryptocurrency** (back) | Button | Returns to `/crypto` | — |
| **CoinGecko** | Link | Opens the coin on coingecko.com in a new tab | Free-text coins |
| Edit (pencil) | Icon | Opens the crypto form | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Read only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent back to `/crypto` | Opened by a direct link or refresh | Open it from the list (DOCUMENTATION_GAPS.md) |
| "No transactions found." | None matched | — |

**Limitations:** The transactions list includes this coin's entries from every portfolio, while the figures are for one portfolio's holding. Stats don't refresh after an edit until reopened.

**How it works:** Transactions (newest 200 crypto) filtered by CoinGecko id, else exact name.

**Related features:** [F-CRYPTO-001](F-CRYPTO-001.md), [F-CRYPTO-002](F-CRYPTO-002.md).

**Sources:** `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:44`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:58`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:70`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:135`, `apps/web/src/pages/assetClasses/CryptoDetailPage.tsx:228`
