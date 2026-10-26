---
id: F-PORT-008
title: "Scheduled market price feeds"
module: "Portfolios"
status: Live
roles: "All users"
settings: []
related: [F-DASH-014, F-DASH-018, F-PORT-009]
---

[← Portfolios](../modules/portfolios.md) · [Index](../INDEX.md)

# Scheduled market price feeds

`F-PORT-008` · Live · Roles: All users

**What it does:** EveryPaisa downloads market prices on a fixed India-time schedule and re-values every user's holdings after each price download, so values, P&L and charts stay current without you doing anything.

**Why it exists:** Code comments: prices are "valuation inputs behind every holding"; feeds are checked ("canary") so a broken source does not silently corrupt valuations.

**Where to find it:** Not a page; results appear in every value on the Dashboard, Portfolios and asset-class pages (with "price as of" dates where shown).

**Who can use it:** Runs for everyone automatically.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators: `ENABLE_PRICE_CRONS=false` stops all of these; `ENABLE_COST_SIZE_REFRESH=false` stops the fund cost/size refresh.

**Results:** Schedule (all India time):
| Feed | When | Then |
|---|---|---|
| Mutual fund NAVs (AMFI) | Daily 22:00 | All holdings re-priced |
| Fund expense ratio and size (AMFI) | Daily 22:30 | — |
| Stock end-of-day prices (Yahoo, all stocks) | Mon–Fri 16:30 | All holdings re-priced |
| Stock prices for held stocks | Mon–Fri every 15 minutes, 09:00–15:45 | All holdings re-priced |
| NSE/BSE stock and ETF lists | Sunday 03:00 | — |
| Corporate actions (NSE) | Daily 20:00 | [F-PORT-009](F-PORT-009.md) |
| Gold/silver and other commodities | Daily 23:30 | All holdings re-priced |
| Crypto | Every 2 minutes | All holdings re-priced |
| Currency rates | Hourly | — |
| Index benchmarks (NIFTY, Sensex) | Mon–Fri 16:40 and at server start | — |
| F&O lot sizes / end-of-day / live | Sun 03:30 / Mon–Fri 16:45 / every minute 09:00–15:59 Mon–Fri | F&O positions re-priced |
| Fuel prices | Daily 06:30 | — |

**Errors and troubleshooting:** None visible to users; a failed feed is logged and reported to monitoring, and prices stay at their last values.

**Limitations:** Market data comes from outside sources (AMFI, Yahoo, NSE, BSE, CoinGecko and others) whose availability cannot be verified from code. A job still running when its next run is due is skipped.

**How it works:** node-cron schedules in `Asia/Kolkata`; each job runs with system access (it updates shared price tables and all users' holdings) and is guarded against overlapping runs.

**Related features:** [F-PORT-009](F-PORT-009.md), [F-DASH-014](F-DASH-014.md), [F-DASH-018](F-DASH-018.md).

**Sources:** `packages/api/src/jobs/priceJobs.ts:49`, `packages/api/src/jobs/priceJobs.ts:64`, `packages/api/src/jobs/priceJobs.ts:320`, `packages/api/src/jobs/priceJobs.ts:327`, `packages/api/src/jobs/priceJobs.ts:335`, `packages/api/src/jobs/priceJobs.ts:338`, `packages/api/src/jobs/priceJobs.ts:344`, `packages/api/src/jobs/priceJobs.ts:351`, `packages/api/src/jobs/priceJobs.ts:372`
