---
id: F-GOLD-002
title: "Live gold and silver rate bar"
module: "Gold & Silver"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-GOLD-001, S-GOLD-002]
related: [F-GOLD-001]
---

[← Gold & Silver](../modules/gold-silver.md) · [Index](../INDEX.md)

# Live gold and silver rate bar

`F-GOLD-002` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** A sticky bar at the top shows the current **Gold** and **Silver** price per gram ("/g") at a purity you pick, and "Live · updated <just now | Ns ago | N min ago>" (or "Loading…", or "Live feed unavailable" in red).

**Why it exists:** Quick reference price, at the same purity factors used to value holdings ("the price the top bar shows for 22K is the price a 22K holding is valued at" — code comment).

**Where to find it:** **Asset Classes → Gold & Silver**, top (route `/gold`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Pick a purity in the selector next to **Gold** or **Silver**. The price updates and the choice is remembered on this device.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Gold purity (aria "Gold purity") | Select | 24K · 999, 22K · 916, 18K · 750, 14K · 585 | — |
| Silver purity (aria "Silver purity") | Select | 999 Fine, 925 Sterling, 800 | — |

**Fields and rules:** None.

**Settings and toggles here:** [S-GOLD-001](../settings/gold-silver.md#s-gold-001) **Gold purity** — the karat whose price is shown; default 24K; remembered on this device only. [S-GOLD-002](../settings/gold-silver.md#s-gold-002) **Silver purity** — default 999 Fine; this device only. Neither changes how holdings are valued.

**Results:** Display only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Live feed unavailable" | The live request failed and no earlier data | Wait; retried twice and polled every 10 s |
| Price "—" | Neither live nor stored price available | — |

**Limitations:** If storage is blocked (private mode), the choice applies but isn't remembered.

**How it works:** Price = base × factor to 2 decimals (gold factor = karat ÷ 24; silver 1 / 0.925 / 0.8). The server keeps a 15-second in-memory cache: gold from CoinGecko PAX Gold (INR ÷ 31.1035 g), then gold-api XAU × USD/INR, then Yahoo GC=F; silver from gold-api XAG × FX, Yahoo SI=F × FX, or SILVERBEES. If both live sources fail it returns the last stored daily price (updated 23:30 IST). A cold start waits at most 4 seconds.

**Related features:** [F-GOLD-001](F-GOLD-001.md).

**Sources:** `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:37`, `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:131`, `apps/web/src/pages/assetClasses/GoldSilverTopBar.tsx:177`, `apps/web/src/lib/metalPurity.ts:31`, `packages/api/src/priceFeeds/commodity.service.ts:33`, `packages/api/src/priceFeeds/commodity.service.ts:303`, `packages/api/src/controllers/assets.controller.ts:153`, `packages/api/src/jobs/priceJobs.ts:347`
