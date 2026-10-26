---
id: F-VEH-009
title: "Vehicle stock photo"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: []
related: [F-VEH-006, F-VEH-008]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Vehicle stock photo

`F-VEH-009` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Shows a generic stock image for the vehicle's make and model and lets you look one up again.

**Why it exists:** From the card text: "RTO does not publish vehicle-specific photos. Stock image keyed by make+model."

**Where to find it:** Vehicle page → **Photo** card.

**Who can use it:** All plans.

**Steps**
1. Without a photo the card says "No photo available. Refresh RC data to fetch a stock photo." Click **Find photo**.
2. With a photo, click **Refresh** to look again. Result: "Photo updated" or "No matching stock photo for this make/model."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Find photo** / **Refresh** | Button | Looks up a stock photo by make, model, class and fuel | While running |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** The vehicle's photo and its source label ("Stock photo · <source>") update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No matching stock photo for this make/model." | Make/model unknown or not in the photo source | Refresh RC details first so make/model are known |
| "Photo refresh failed" | Server error | Retry |

**Limitations:** It is never a photo of your actual vehicle. Which external photo sources are used was not traced further than the resolver entry point.

**How it works:** `POST /api/vehicles/:id/refresh-photo` calls the photo resolver with make, model, vehicle class and fuel; on a hit it stores the URL and source. If the image fails to load in the browser it is hidden.

**Related features:** [F-VEH-008](F-VEH-008.md), [F-VEH-006](F-VEH-006.md).

**Sources:** `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:156`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:316`, `packages/api/src/services/vehicles/vehicles.service.ts:366`, `packages/api/src/ingestion/vehicle/photo.ts:44`
