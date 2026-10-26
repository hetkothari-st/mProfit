---
id: F-VEH-011
title: "Fuel and electricity prices"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: [S-VEH-002]
related: [F-VEH-001, F-VEH-006]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Fuel and electricity prices

`F-VEH-011` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Shows today's petrol, diesel (₹/litre), CNG (₹/kg), LPG (14.2 kg cylinder) and electricity (₹/kWh) prices for a chosen state, with a freshness indicator.

**Why it exists:** Inferred from behavior: running-cost context for vehicle owners.

**Where to find it:** Top of **Asset Classes → Vehicles** and on each vehicle page.

**Who can use it:** All signed-in users.

**Steps**
1. Read the five prices. The dot and label show "live" (green, petrol/diesel scraped) or "cached" (amber, built-in seed values) and how long ago ("just now", "Ns ago", "Nm ago", "Nh ago").
2. Pick another state in **State** to see its prices.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **State** | Select | Chooses the state | — |

**Fields and rules:** Not applicable — no form.

**Settings and toggles here:** [S-VEH-002](../settings/vehicles.md#s-veh-002) **State** — default: the state code from the first vehicle's RTO (list page) or this vehicle's RTO (detail page), else MH. Not remembered.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fetching prices…" stays | Price request pending/failed | Reload |
| A value shows "—" | No figure for that state | — |

**Limitations:** CNG, LPG and electricity are static seed values shipped with the app (code note: "Last reviewed 2026-04"); only petrol and diesel are scraped (from cardekho.com). Electricity is a representative residential 0–100 unit slab rate.

**How it works:** `GET /api/vehicles/prices/states` lists states; `GET /api/vehicles/prices?state=<code>` returns prices. The server keeps an in-memory petrol/diesel cache: fresh for 5 minutes, then served stale while refreshing in the background; a scheduled sync runs daily at 06:30 IST. The browser refetches every 60 seconds while the tab is visible and on window focus.

**Related features:** [F-VEH-001](F-VEH-001.md), [F-VEH-006](F-VEH-006.md).

**Sources:** `apps/web/src/pages/vehicles/FuelPricesCard.tsx:68`, `apps/web/src/pages/vehicles/FuelPricesCard.tsx:82`, `packages/api/src/controllers/vehicles.controller.ts:272`, `packages/api/src/priceFeeds/fuel.service.ts:53`, `packages/api/src/priceFeeds/fuel.service.ts:330`, `packages/api/src/jobs/priceJobs.ts:376`
