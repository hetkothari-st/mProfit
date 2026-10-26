[Index](../INDEX.md)

# Crypto

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Cryptocurrency** page (sidebar **Crypto**, an optional class added with **Add asset class**) tracks coins with live INR and USD prices from CoinGecko.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CRYPTO-001](../features/F-CRYPTO-001.md) | Crypto holdings with live prices | Live | Shows a live ticker strip (first 8 coins with a price: symbol, 24h change %, INR price), cards Invested, Current value (INR and USD, … |
| [F-CRYPTO-002](../features/F-CRYPTO-002.md) | Add, edit and delete a crypto entry | Live | The "Add Cryptocurrency" / "Edit Crypto Entry" dialog records a Buy, Sell, Staking Reward, Transfer In or Transfer Out, with coin search, … |
| [F-CRYPTO-003](../features/F-CRYPTO-003.md) | Coin detail page | Live | A page per coin holding: symbol and portfolio badges, a CoinGecko link, Current Value (INR, USD, price per coin, 24h change), Unrealised … |

### What this area doesn't do
- No exchange or wallet API import; no tax (VDA 30%/1% TDS) computation here.
- No coin outside the app's coin list can be searched or live-priced.
