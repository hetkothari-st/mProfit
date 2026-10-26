---
id: F-VEH-015
title: "Monthly challan scan"
module: "Vehicles"
status: Live
roles: "System"
settings: []
related: [F-VEH-010]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Monthly challan scan

`F-VEH-015` · Live · Roles: System

**What it does:** On the 1st of every month at 03:00 IST the server runs the challan check ([F-VEH-010](F-VEH-010.md)) for every vehicle.

**Why it exists:** Code comment §7.6: surface new challans without user action.

**Where to find it:** Automatic. Results appear in the vehicle's **Challans** card and the import review queue.

**Who can use it:** System job for all vehicles; operator switch `ENABLE_VEHICLE_CRONS`.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** As [F-VEH-010](F-VEH-010.md) for every vehicle; one import-failure row per vehicle whose scan failed.

**Errors and troubleshooting:** None shown to users.

**Limitations:** Runs sequentially over all vehicles; success depends on third-party sites.

**How it works:** node-cron "0 3 1 * *" Asia/Kolkata → `scanChallansMonthlyForAllActiveVehicles` under the system context; per-vehicle errors are counted and logged, not fatal.

**Related features:** [F-VEH-010](F-VEH-010.md).

**Sources:** `packages/api/src/jobs/vehicleJobs.ts:91`, `packages/api/src/jobs/vehicleJobs.ts:124`, `packages/api/src/services/vehicles/challans.service.ts:244`
