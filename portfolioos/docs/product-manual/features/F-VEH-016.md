---
id: F-VEH-016
title: "Vehicle expiry alerts"
module: "Vehicles"
status: Live
roles: "System (per user)"
settings: []
related: [F-VEH-006]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Vehicle expiry alerts

`F-VEH-016` · Live · Roles: System (per user)

**What it does:** Creates an alert when a vehicle's PUC, Insurance, Fitness Certificate or Road Tax expires in exactly 30, 15, 7 or 1 day(s), e.g. "PUC expires in 7 days" — "Vehicle ending 5950 — PUC expires on <date>".

**Why it exists:** Inferred from behavior: reminders before a document lapses.

**Where to find it:** Alerts (header bell / **Tools → Alerts**, [D-VEH-002](../dependencies.md#d-veh-002)).

**Who can use it:** Every user with vehicles.

**Steps:** Not applicable — automatic.

**Controls:** None here (alerts are managed on the Alerts page).

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** One alert per vehicle, field and threshold (never duplicated).

**Errors and troubleshooting:** None.

**Limitations:** Permit expiry does not raise alerts. An alert fires only if the scan runs on the exact 30/15/7/1-day mark; a missed day skips that threshold. The text shows only the last 4 characters of the number.

**How it works:** The daily alert job (20:45 IST, per user) and the Alerts page's scan run `generateVehicleExpiryAlerts`: vehicles with any of the four dates between today and today+30; days left = ceil((date − today midnight) / 1 day); alert type CUSTOM keyed `vehicle_expiry:<vehicle>:<field>:<N>d` for de-duplication.

**Related features:** [F-VEH-006](F-VEH-006.md), [D-VEH-002](../dependencies.md#d-veh-002).

**Sources:** `packages/api/src/services/notifications/alerts.service.ts:13`, `packages/api/src/services/notifications/alerts.service.ts:112`, `packages/api/src/services/notifications/alerts.service.ts:119`, `packages/api/src/jobs/alertJobs.ts:48`
