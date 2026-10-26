---
id: F-VEH-013
title: "Use my car and Save to my vehicle"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: [S-VEH-003, S-VEH-004]
related: [F-VEH-006, F-VEH-008, F-VEH-012]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Use my car and Save to my vehicle

`F-VEH-013` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** When the valuation page is opened from a vehicle, **Use my car (<REG>)** fills the inputs from that vehicle and fetches a quote; **Save to my vehicle** stores the slider-adjusted estimate as the vehicle's current value.

**Why it exists:** Inferred from behavior: keep the vehicle's current value (used in net worth) up to date without retyping.

**Where to find it:** Vehicle page → **Get valuation** (route `/vehicles/value?vehicleId=<id>`).

**Who can use it:** All plans, own vehicles.

**Steps**
1. On a vehicle, click **Get valuation**. The back link reads **Back to vehicle**.
2. Click **Use my car (<REG>)**. "Pre-filled from <make> <model>" appears and a quote shows.
3. Adjust sliders. Click **Save to my vehicle**. "Saved to <REG>" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Use my car (<REG>)** | Button | Auto-valuation from the vehicle | Vehicle still loading; while running; hidden without `vehicleId` |
| **Save to my vehicle** | Button | Saves the adjusted price | Hidden without `vehicleId` or before a quote; while saving |
| **Back to vehicle** | Link | Returns to the vehicle | — |

**Fields and rules:** Uses the current Transaction and Counterparty choice; kilometres are set to 0 by **Use my car**.

**Settings and toggles here:** [S-VEH-003](../settings/vehicles.md#s-veh-003), [S-VEH-004](../settings/vehicles.md#s-veh-004) (as in [F-VEH-012](F-VEH-012.md)).

**Results:** The vehicle's **Current value** becomes the adjusted price (2 decimals) with source = the first price source (or "estimated"), suffixed "+slider-adjusted" when it differs from the Good price by more than ₹1. A valuation log row records the slider positions.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Vehicle missing make/model/year — refresh RC first" | RC details incomplete | Refresh RC ([F-VEH-008](F-VEH-008.md)) or edit the vehicle |
| "No catalog entry for <make> <model> <year>" | Not in the catalogue | Value manually via the selects, if listed |
| "Valuation cache entry not found — re-run quote" | Quote cache entry missing | Click **Get price** again |
| "Auto-valuation failed" / "Save failed" | Other errors | Retry |

**Limitations:** After **Use my car**, the Model/Year/Trim selects may appear blank even though the quote is shown, because changing the upstream select resets the ones below it (see DOCUMENTATION_GAPS [F-VEH-013](F-VEH-013.md)); the quote and **Save** still work. The trim is chosen by matching the vehicle's variant text against catalogue trims; otherwise the newest catalogue row is used.

**How it works:** `GET /api/valuations/vehicles/:id/auto` resolves make, model, manufacturing year and trim from the catalogue and runs the same quote as [F-VEH-012](F-VEH-012.md). `POST /api/valuations/vehicles/:id/save` validates the price (non-negative decimal), looks up the cached quote by key, writes a log row and updates the vehicle's current value and source.

**Related features:** [F-VEH-012](F-VEH-012.md), [F-VEH-006](F-VEH-006.md).

**Sources:** `apps/web/src/pages/vehicles/VehicleValuePage.tsx:137`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:159`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:191`, `packages/api/src/services/valuation/quoteService.ts:207`, `packages/api/src/services/valuation/quoteService.ts:274`
