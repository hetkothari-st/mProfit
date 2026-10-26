---
id: F-VEH-008
title: "Refresh RC details"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: []
related: [F-VEH-003, F-VEH-004, F-VEH-014, F-VEH-019]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Refresh RC details

`F-VEH-008` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Re-fetches the vehicle's RC details from a chain of free sources and merges the fresh values into the vehicle, then shows which source answered.

**Why it exists:** Code comment: free, no-key sources tried in order so that one site's outage does not block the user; manual entry via SMS remains the last resort.

**Where to find it:** Vehicle page → **Refresh**.

**Who can use it:** All plans; 5 lookups per minute per user.

**Steps**
1. Click **Refresh**. A spinner shows.
2. On success: "Refreshed from <source>". On failure: "No fresh data. <source>: <error> · …" (6 seconds).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Runs the chain in interactive mode | While running |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Non-empty fresh values replace stored ones; empty fresh values never blank stored ones. Expiry dates and registration date are replaced only when the source has them. "Last refreshed" and the source name update. If the vehicle has no photo yet, a stock photo is looked up.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No fresh data. vahan.carinfo.scraper: … · vahan.mparivahan.api: …" | Every source failed | Retry later or use **SMS** ([F-VEH-004](F-VEH-004.md)) |
| "Too many vehicle lookups. Please wait a minute." | Rate limit | Wait |
| "Refresh failed" | Network/server error | Retry |

**Limitations:** Data quality depends on third-party sites (carinfo.app, government VAHAN endpoints, rahastas.in) that can change without notice. The Parivahan portal source is disabled in production unless the operator enables it ([F-VEH-019](F-VEH-019.md)).

**How it works:** `POST /api/vehicles/:id/refresh` (mode interactive) runs, in order: CarInfo.app scraper (`vahan.carinfo.scraper`), mParivahan/VAHAN API (`vahan.mparivahan.api`), Rahastas.in scraper (`vahan.rahastas.scraper`), Parivahan portal (`vahan.parivahan.portal`, needs chassis last 4), VAHAN SMS (`vahan.sms`, needs a pasted SMS — not supplied by this button). The first source that succeeds wins. If all real attempts fail, one row is written to the import-failures queue ("All N vehicle adapter(s) failed for <REG>"). Timeouts: CarInfo 15 s, VAHAN endpoints 8–12 s, Rahastas 15 s.

**Related features:** [F-VEH-003](F-VEH-003.md), [F-VEH-004](F-VEH-004.md), [F-VEH-014](F-VEH-014.md), [F-VEH-019](F-VEH-019.md), [D-VEH-005](../dependencies.md#d-veh-005).

**Sources:** `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:137`, `packages/api/src/services/vehicles/vehicles.service.ts:238`, `packages/api/src/services/vehicles/vehicles.service.ts:304`, `packages/api/src/ingestion/vehicle/chain.ts:40`, `packages/api/src/ingestion/vehicle/chain.ts:117`, `packages/api/src/middleware/rateLimit.ts:280`
