---
id: F-VEH-014
title: "Automatic RC refresh"
module: "Vehicles"
status: Live
roles: "System"
settings: []
related: [F-VEH-008, F-VEH-016]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Automatic RC refresh

`F-VEH-014` · Live · Roles: System

**What it does:** Every day at 02:15 IST the server refreshes RC details for every vehicle that has never been refreshed or was last refreshed more than 7 days ago, using only sources that need no user interaction.

**Why it exists:** Code comment §7.6: keep expiry dates current without the user pressing **Refresh**.

**Where to find it:** Automatic. The effect shows on the vehicle page ("Last refreshed … via …") and in updated expiry dates.

**Who can use it:** Runs for every vehicle of every user (system job). Operator can switch it off (`ENABLE_VEHICLE_CRONS=false`).

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None (operator setting only).

**Results:** Same merge as [F-VEH-008](F-VEH-008.md). Vehicles that get no data keep their values; a failure row is written to the import-failures queue when all sources fail.

**Errors and troubleshooting:** None shown to users; failures appear in the import-failures queue ([D-VEH-005](../dependencies.md#d-veh-005)).

**Limitations:** Only CarInfo, mParivahan and Rahastas run; the portal and SMS sources are skipped. Whether the job succeeds in production depends on those third-party sites.

**How it works:** node-cron "15 2 * * *" Asia/Kolkata runs under the system database context, loops vehicles with `lastRefreshedAt` null or older than 7 days, and calls the refresh in auto mode; an overlapping run is skipped.

**Related features:** [F-VEH-008](F-VEH-008.md), [F-VEH-016](F-VEH-016.md).

**Sources:** `packages/api/src/jobs/vehicleJobs.ts:43`, `packages/api/src/jobs/vehicleJobs.ts:112`, `packages/api/src/jobs/vehicleJobs.ts:119`, `packages/api/src/ingestion/vehicle/chain.ts:64`
