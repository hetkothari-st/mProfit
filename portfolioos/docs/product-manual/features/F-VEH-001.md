---
id: F-VEH-001
title: "Vehicles list"
module: "Vehicles"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER: managed person's)"
settings: [S-VEH-001]
related: [F-VEH-002, F-VEH-003, F-VEH-004, F-VEH-005, F-VEH-006, F-VEH-007, F-VEH-008, F-VEH-011, F-VEH-012]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Vehicles list

`F-VEH-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) ([R-MANAGER](../roles.md#r-manager): managed person's)

**What it does:** Shows every vehicle on your account as a card with its registration number, make and model, owner name, a shield icon and three expiry rows (**Insurance**, **PUC**, **Fitness**). Above the cards it shows the fuel-price card (see [F-VEH-011](F-VEH-011.md)) and the page actions.

**Why it exists:** Inferred from behavior and the page subtitle "Registration, insurance, PUC, fitness — all expiries in one place": one screen to see which vehicle document is about to lapse.

**Where to find it:** **Asset Classes → Vehicles** (route `/vehicles`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (all plans). While managing a family member's account ([R-MANAGER](../roles.md#r-manager)) you see that person's vehicles. Family view ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)) does not add other members' vehicles — the list is always the signed-in (or managed) person's own.

**Steps**
1. Open **Asset Classes → Vehicles**. Three grey placeholder cards show while loading.
2. With no vehicles you see "No vehicles yet" — "Add an RC number — we'll track insurance, PUC, fitness, and challan expiries automatically." and **Add your first vehicle**.
3. With vehicles, read each card; click the arrow icon at the card's top right to open the vehicle ([F-VEH-006](F-VEH-006.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Individual** / **Family** | Two-button switch | Changes grouping ([F-VEH-002](F-VEH-002.md)) | — |
| **Download** (report button) | Button | Downloads the vehicles report ([D-VEH-001](../dependencies.md#d-veh-001)) | — |
| **Get valuation** | Link button | Opens `/vehicles/value` ([F-VEH-012](F-VEH-012.md)) | — |
| **Paste SMS** | Button | Opens the VAHAN SMS dialog ([F-VEH-004](F-VEH-004.md)) | — |
| **Add vehicle** / **Add your first vehicle** | Button | Opens the add-vehicle wizard ([F-VEH-003](F-VEH-003.md)) | — |
| Trash icon on a card | Icon button | Deletes the vehicle after a browser confirm ([F-VEH-005](F-VEH-005.md)) | Spinner while deleting |
| Arrow icon on a card | Link | Opens `/vehicles/:id` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-VEH-001](../settings/vehicles.md#s-veh-001) **Individual / Family** view — Individual shows one grid; Family groups cards by the owner name printed on the RC. Remembered on this device.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A card shows "Unknown vehicle" | Make and model are empty (RC details not fetched yet) | Open the vehicle and click **Refresh** ([F-VEH-008](F-VEH-008.md)) or paste the VAHAN SMS |
| An expiry row shows "—" | That date is not recorded | Edit the vehicle ([F-VEH-007](F-VEH-007.md)) or refresh RC details |

**Limitations:** The list cards show only Insurance, PUC and Fitness; road tax and permit appear on the detail page only. Expiry countdowns use your browser's clock.

**How it works:** `GET /api/vehicles` returns your vehicles (with their 5 most recent challans) sorted by registration number after decryption — the number is stored encrypted, so the database cannot sort it. Each expiry row computes whole days = floor((date − now) / 1 day): negative → "Expired Nd ago" in red; 0 → "Today"; 1–7 days → red "Nd left"; 8–30 → amber; more than 30 → grey. The card shows an amber warning shield when any of Insurance, PUC or Fitness is 30 days or less away (including already expired); otherwise a green check shield.

**Related features:** [F-VEH-002](F-VEH-002.md), [F-VEH-003](F-VEH-003.md), [F-VEH-004](F-VEH-004.md), [F-VEH-006](F-VEH-006.md), [F-VEH-011](F-VEH-011.md), [D-VEH-001](../dependencies.md#d-veh-001).

**Sources:** `apps/web/src/pages/vehicles/VehicleListPage.tsx:44`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:139`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:199`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:239`, `packages/api/src/services/vehicles/vehicles.service.ts:103`
