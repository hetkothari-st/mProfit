---
id: F-VEH-007
title: "Edit a vehicle"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: [S-VEH-006]
related: [F-VEH-005, F-VEH-006, F-VEH-013]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Edit a vehicle

`F-VEH-007` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Opens the vehicle form ("Edit vehicle") to change make, variant, year, colour, chassis last 4, the Insurance, PUC/Emission, Fitness Validity and Road Tax dates, and the portfolio the vehicle is grouped under.

**Why it exists:** Inferred from behavior: correct or complete what the automatic sources returned.

**Where to find it:** Vehicle page → **Edit**.

**Who can use it:** All plans, own vehicles.

**Steps**
1. Click **Edit**. The dialog shows a summary strip (number, fuel or "Fuel Unknown", model, owner) and the form.
2. Change fields. Click **Save Changes**. The app shows "Vehicle updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete Vehicle** | Button | [F-VEH-005](F-VEH-005.md) | — |
| **Cancel** | Button | Closes without saving | — |
| **Save Changes** | Submit | Saves changed fields | While saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Make | Text | No | ≤120 | Current value | "Save failed" / "Validation failed" |
| Variant | Text | No | ≤120 | Current | — |
| Year | Number | No | 1900–2100 | Current | — |
| Color | Text | No | ≤32 | Current | — |
| Chassis (Last 4) | Text | No | ≤16 | Current | — |
| Insurance / PUC / Emission / Fitness Validity / Road Tax | Date | No | YYYY-MM-DD | Current | "Use YYYY-MM-DD" |
| Portfolio | Portfolio picker | No | One of your portfolios or none | Current | — |

**Settings and toggles here:** [S-VEH-006](../settings/vehicles.md#s-veh-006) **Portfolio** — optional; "Optional — group this vehicle under a portfolio."

**Results:** Changed fields are saved. The disclaimer "Data synchronized via CarInfo RTO services. Please verify these details with your original documents." is informational.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Save failed" or "Validation failed" | Server rejected a value | Check year range and date format |

**Limitations:** Clearing a field does not clear it: empty inputs are dropped before sending, so the stored value stays. Model, fuel type, owner name, purchase date, purchase price, current value and permit expiry have no input here (current value can be set from the valuation page, [F-VEH-013](F-VEH-013.md)). The registration number cannot be changed from this dialog.

**How it works:** `PATCH /api/vehicles/:id` with only non-empty fields; the server validates (make/model/variant ≤120, year 1900–2100, fuel/colour ≤32, chassis ≤16, owner ≤160, dates YYYY-MM-DD, money as decimal strings) and updates only the fields sent.

**Related features:** [F-VEH-006](F-VEH-006.md), [F-VEH-005](F-VEH-005.md), [F-VEH-013](F-VEH-013.md).

**Sources:** `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:30`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:117`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:374`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:443`, `packages/api/src/controllers/vehicles.controller.ts:32`, `packages/api/src/services/vehicles/vehicles.service.ts:175`
