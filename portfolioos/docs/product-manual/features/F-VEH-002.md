---
id: F-VEH-002
title: "Individual / Family grouping"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: [S-VEH-001]
related: [F-VEH-001]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Individual / Family grouping

`F-VEH-002` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Switches the Vehicles list between one flat grid (**Individual**) and sections grouped by the RC owner name (**Family**), each headed by the owner name and "N vehicle(s)".

**Why it exists:** Inferred from behavior: households register vehicles in different members' names; grouping by owner shows who holds what.

**Where to find it:** **Asset Classes → Vehicles**, page header, left of the action buttons (route `/vehicles`).

**Who can use it:** Everyone who can see the list ([F-VEH-001](F-VEH-001.md)).

**Steps**
1. Click **Family**. Cards regroup under owner names; vehicles with no owner name go under "Unassigned".
2. Click **Individual** to return to one grid.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Individual** | Tab button | Flat grid | — |
| **Family** | Tab button | Group by owner name | — |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** [S-VEH-001](../settings/vehicles.md#s-veh-001) — default **Individual**; the choice is stored in this browser and reused next visit.

**Results:** Only the layout changes; no data changes.

**Errors and troubleshooting:** None.

**Limitations:** "Family" here means "grouped by the owner name on the RC". It is not linked to the Family feature (household members, family view) — it does not show other members' vehicles. Owner names that differ only in spelling form separate groups.

**How it works:** Grouping is done in the browser: owner name trimmed, empty → "Unassigned"; groups sorted by number of vehicles, largest first. The choice is saved under the browser key `vehicles_view_mode`.

**Related features:** [F-VEH-001](F-VEH-001.md).

**Sources:** `apps/web/src/pages/vehicles/VehicleListPage.tsx:30`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:50`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:160`
