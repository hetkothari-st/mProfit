---
id: F-VEH-006
title: "Vehicle detail page"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: []
related: [F-VEH-001, F-VEH-004, F-VEH-005, F-VEH-007, F-VEH-008, F-VEH-009, F-VEH-010, F-VEH-011, F-VEH-013, F-VEH-017]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Vehicle detail page

`F-VEH-006` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Shows one vehicle: header with registration number and shield, description (make model variant), action buttons, a **Photo** card, a **Registration & owner** card, an **Expiries** card, the fuel-price card and the **Challans** card.

**Why it exists:** Inferred from behavior: the single place for every RC fact and expiry for a vehicle.

**Where to find it:** **Asset Classes → Vehicles** → arrow on a card (route `/vehicles/:id`).

**Who can use it:** All plans, own vehicles.

**Steps**
1. Open a vehicle. "Loading…" shows while fetching.
2. Read the cards. Use **Vehicles** (back arrow) to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Vehicles** | Back link | Returns to `/vehicles` | — |
| **Get valuation** | Link | Opens `/vehicles/value?vehicleId=…` ([F-VEH-013](F-VEH-013.md)) | — |
| **SMS** | Button | Opens Paste VAHAN SMS with the number filled ([F-VEH-004](F-VEH-004.md)) | — |
| **Refresh** | Button | RC refresh ([F-VEH-008](F-VEH-008.md)) | While running |
| **Edit** | Button | Edit dialog ([F-VEH-007](F-VEH-007.md)) | — |
| **Delete** | Button | [F-VEH-005](F-VEH-005.md) | While deleting |
| **Find photo** / **Refresh** (photo card) | Button | [F-VEH-009](F-VEH-009.md) | While running |
| **Check challans** and tabs | Button / tabs | [F-VEH-010](F-VEH-010.md) | While running |

**Fields and rules:** Not applicable — view only. **Registration & owner** shows: Owner, RTO, Fuel, Color, Manufacturing year, Chassis (last 4), Registration date, RC status, Vehicle class, Emission norms, Vehicle age, Seating capacity, Unloaded weight (kg), Engine no., Hypothecation ("Clear" when empty or NONE), Purchase date, Purchase price, Current value; empty values show "—". A line "Last refreshed <date time> via <source>" appears once the vehicle has been refreshed. **Expiries** shows Insurance, PUC, Fitness, Road tax, Permit with the date (or "Not recorded") and a countdown badge.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Page stays on "Loading…" | The vehicle does not exist or is not yours (the page has no not-found state) | Go back to **Vehicles** |

**Limitations:** Vehicle age shows "<years/months> (mfg) · <…> (reg)" only when both ages exist and differ; manufacturing age counts from 1 January of the manufacturing year. Linked motor insurance policies are loaded with the vehicle but not displayed (see DOCUMENTATION_GAPS [F-VEH-017](F-VEH-017.md)).

**How it works:** `GET /api/vehicles/:id` returns the vehicle with all challans (newest offence first) and the linked insurance policies' summary (never the policy number). The header shield is amber when any of the five expiries is 30 days or less away; countdown colours as in [F-VEH-001](F-VEH-001.md).

**Related features:** [F-VEH-007](F-VEH-007.md) to [F-VEH-011](F-VEH-011.md), [F-VEH-013](F-VEH-013.md).

**Sources:** `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:123`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:226`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:369`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:435`, `packages/api/src/services/vehicles/vehicles.service.ts:123`
