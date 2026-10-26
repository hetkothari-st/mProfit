---
id: F-VEH-012
title: "Vehicle valuation"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: [S-VEH-003, S-VEH-004, S-VEH-005]
related: [F-VEH-013]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Vehicle valuation

`F-VEH-012` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Estimates a used vehicle's price from category, make, model, year, trim/variant, kilometres, whether you are buying or selling and to/from an individual or dealer. Shows an adjustable estimate, prices for five conditions (Bad, Fair, Good, Very Good, Excellent), projections (1, 3, 5 years, residual, salvage, clunker/scrappage) and 11 condition sliders.

**Why it exists:** Page subtitle: "OBV-style price estimate. Adjust condition with sliders to see live price changes."

**Where to find it:** **Asset Classes → Vehicles → Get valuation** (route `/vehicles/value`).

**Who can use it:** All plans.

**Steps**
1. Choose **Transaction** (**I want to sell** / **I want to buy**) and **Counterparty** (**Individual** / **Dealer**).
2. Pick **Category** (optional, "Any"), **Make**, **Model**, **Year**, **Trim / Variant** in order (each unlocks the next), and enter **Kilometers driven**.
3. Click **Get price**. "Quote ready" appears, or a warning that live data was unavailable.
4. Move the condition sliders; the big figure updates instantly. **Reset** returns all sliders to Good.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **I want to sell** / **I want to buy** | Toggle | Sets transaction type | — |
| **Individual** / **Dealer** | Toggle | Sets counterparty | — |
| **Category**, **Make**, **Model**, **Year**, **Trim / Variant** | Selects | Cascading vehicle choice | Model needs a make; Year needs a model; Trim needs a year |
| **Kilometers driven** | Number | Usage | — |
| **Get price** | Button | Requests the quote | Make, model, year or trim missing; while running |
| 11 sliders: AC, Brakes, Car Exterior, Car Interior, Electrical, Engine, Frame, Steering, Suspension, Transmission, Wheel and Tyres | Range (Fair, Good, Very Good, Excellent) | Adjusts the estimate | Shown after a quote |
| **Reset** | Button | All sliders to Good | — |
| **Vehicles** | Back link | Returns to the list | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Year | Select | Yes | Server: 1980 to next year | — | "Validation failed" |
| Kilometers driven | Number | Yes | 0–1,000,000 (negative typed values become 0) | 0 | "Validation failed" |

**Settings and toggles here:** [S-VEH-003](../settings/vehicles.md#s-veh-003) **Transaction** (default **I want to sell**), [S-VEH-004](../settings/vehicles.md#s-veh-004) **Counterparty** (default **Individual**), [S-VEH-005](../settings/vehicles.md#s-veh-005) condition sliders (default all **Good**). None are remembered.

**Results:** The estimate shows as "Estimated sell|buy price (individual|dealer)" with "Anchor (Good condition): ₹…", plus "Sources: … · Cached until <date time>". Nothing is saved to your vehicles unless you use [F-VEH-013](F-VEH-013.md).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Market data temporarily unavailable for this vehicle. Please try again later or use a different trim." | No source returned a price and no list price (MSRP) is known | Try another trim or later |
| Banner "Estimated price. Live market data is temporarily unavailable…" | Only the depreciation formula produced a price | Accept as an estimate or retry later |
| "Quote failed" | Network/server error | Retry |

**Limitations:** The catalogue (makes, models, trims, list prices) comes from a monthly crawl of CarDekho and BikeWale; models not in it cannot be valued. For models still on sale the year list reaches 7 years before launch. The rupee figure is rounded to whole rupees for display.

**How it works:** `POST /api/valuations/quote` builds a cache key from make, model, year, trim, kilometres rounded down to 5,000, transaction and counterparty; a cached quote is reused for 24 hours (shared by all users). Otherwise sources CarDekho, CarWale and Cars24 are tried; the median of their "Good" prices is used. If none answers, a deterministic depreciation formula on the catalogue list price is used and the quote is flagged estimated. Mode multipliers on the Good price: sell-to-individual ×1.00, sell-to-dealer ×0.88, buy-from-individual ×1.05, buy-from-dealer ×1.10. Condition: each slider stop has a value (Fair 0.75, Good 0.85, Very Good 0.92, Excellent 1.00); the weighted score uses weights Engine 0.20, Transmission 0.15, Frame 0.12, Brakes 0.10, Suspension 0.10, Car Exterior 0.09, Electrical 0.08, Wheel and Tyres 0.07, Car Interior 0.05, Steering 0.03, AC 0.01; price = Good price × score ÷ 0.85. Bad = Good × 0.65. Projections compound yearly depreciation of 20%, 15%, 15%, 10%, 10%, then 10% per year with a floor of 5% of today's price; residual = 5-year value; salvage = 12% of today's price; clunker = a flat scrappage value by category (Hatchback 25,000, Sedan 35,000, SUV 45,000, MUV/MPV 40,000, Coupe/Convertible 35,000, Bike 5,000, Scooter 4,000; default 25,000). Total failure writes one import-failure row.

**Related features:** [F-VEH-013](F-VEH-013.md), [D-VEH-005](../dependencies.md#d-veh-005).

**Sources:** `apps/web/src/pages/vehicles/VehicleValuePage.tsx:56`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:110`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:344`, `packages/api/src/controllers/valuation.controller.ts:127`, `packages/api/src/services/valuation/quoteService.ts:31`, `packages/api/src/services/valuation/quoteService.ts:54`, `packages/api/src/ingestion/valuation/chain.ts:30`, `packages/shared/src/valuation/conditionEngine.ts:17`, `packages/shared/src/valuation/conditionEngine.ts:71`, `packages/shared/src/valuation/projections.ts:20`, `packages/shared/src/valuation/projections.ts:59`, `packages/api/src/jobs/catalogJobs.ts:68`
