---
id: F-CRYPTO-002
title: "Add, edit and delete a crypto entry"
module: "Crypto"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (owner)"
settings: []
related: [F-CRYPTO-001, F-CRYPTO-003]
---

[← Crypto](../modules/crypto.md) · [Index](../INDEX.md)

# Add, edit and delete a crypto entry

`F-CRYPTO-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (owner)

**What it does:** The "Add Cryptocurrency" / "Edit Crypto Entry" dialog records a Buy, Sell, Staking Reward, Transfer In or Transfer Out, with coin search, exchange, network, wallet and a one-click live price.

**Why it exists:** Crypto is tracked through entries. Inferred from behavior.

**Where to find it:** **Crypto** → **Add Crypto**, a transaction pencil, or the detail page pencil (routes `/crypto`, `/crypto/:holdingId`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); portfolio owner only.

**Steps**
1. Click **Add Crypto**. Pick **Portfolio** and **Transaction**.
2. Type in **Coin** ("Search Bitcoin, ETH, SOL…") and pick a result. "Linked to CoinGecko · live prices enabled" appears; typing free text shows "Free-text coin name. Live prices only available when matched from search."
3. Optionally choose **Exchange / Platform**, **Network / Chain**, **Wallet Address / Account ID**.
4. Enter **Date**, **Quantity**, **Price ₹** — or click the "Live price: ₹… Use this →" bar.
5. Click **Add entry** ("Crypto entry added") or **Save changes** ("Crypto entry updated"). Edit mode: **Delete** → **Yes, delete** ("Entry deleted").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Transaction buttons | Radio | Buy, Sell, Staking Reward, Transfer In, Transfer Out | — |
| Coin search + result list | Search | Links the coin | Results need at least 1 character |
| Clear (×) | Button | Clears the coin | Empty |
| "Live price … Use this →" | Button | Copies the live INR price into Price | Only for a linked coin with a price |
| **Add entry** / **Save changes** / **Cancel** / **Delete** → **Yes, delete** | Buttons | Save / close / delete | Delete in edit mode only |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolio | Select | Yes | — | first portfolio | "Select a portfolio" |
| Coin | Search text | Yes | — | — | "Select or enter a coin" |
| Exchange / Platform | Select | No | Coinbase, Binance, WazirX, CoinDCX, Kraken, KuCoin, Bybit, Upbit, Mudrex, Self-custody, Other | — select — | — |
| Network / Chain | Select | No | Bitcoin, Ethereum, Binance Smart Chain, Solana, Polygon, Avalanche, Cardano, Polkadot, Tron, Other | — select — | — |
| Wallet Address / Account ID | Text | No | — | — | — |
| Date | Date | Yes | YYYY-MM-DD | today | "Invalid date" |
| Quantity | Number | Yes | > 0, step 0.00000001 | — | "Must be > 0" |
| Price ₹ | Number | Yes | ≥ 0 | — | — |
| Notes | Text area | No | exchange, network, wallet and notes are stored together; max 500 characters (server) | — | "Validation failed" |

**Settings and toggles here:** None.

**Results:** Saved as a transaction; the coin's holding is rebuilt (Buy and Transfer In add units at the price entered; Sell and Transfer Out remove; Staking Reward is listed but adds nothing).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to save" / "Validation failed" | Server refused (e.g. text over 500 characters) | Shorten notes/wallet |
| Duplicate message | Same entry already recorded | — |

**Limitations:** Transfer In counts as a purchase at the price you type. Search only finds coins in the app's coin list.

**How it works:** Saved with assetClass CRYPTOCURRENCY, isin = CoinGecko id, narration = "Exchange: … | Network: … | Wallet: … | <notes>". Server search: coin list rows whose id, symbol or name contain the text (max 12 shown).

**Related features:** [F-CRYPTO-001](F-CRYPTO-001.md), [F-CRYPTO-003](F-CRYPTO-003.md).

**Sources:** `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:29`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:47`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:90`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:167`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:295`, `apps/web/src/pages/assetClasses/CryptoFormDialog.tsx:352`, `apps/web/src/pages/assetClasses/cryptoUtils.ts:26`, `packages/api/src/priceFeeds/crypto.service.ts:327`
