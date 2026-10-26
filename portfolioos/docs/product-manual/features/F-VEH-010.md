---
id: F-VEH-010
title: "Challans"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: []
related: [F-VEH-015]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Challans

`F-VEH-010` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Fetches traffic challans (e-challans) for the vehicle, stores them, and lists them with filter tabs, counts and rupee totals.

**Why it exists:** Code comment §7.5: keep the user aware of pending fines; each new challan is also raised for review in the same queue as other imported events.

**Where to find it:** Vehicle page → **Challans** card.

**Who can use it:** All plans; 5 lookups per minute per user.

**Steps**
1. Click **Check challans**. A spinner shows.
2. Read the result: "Challan scan: N new, M updated" (or "no changes"); on failure the error text (6 seconds).
3. Use the tabs **All (n)**, **Pending (n)**, **Paid (n)**, **Contested (n)** to filter.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Check challans** | Button | Fetch and store challans | While running |
| **All** / **Pending** / **Paid** / **Contested** | Pill tabs | Filter the table | — |

**Fields and rules:** Not applicable — no inputs. Table columns: Challan, Offence, Date, Location, Amount, Status.

**Settings and toggles here:** None.

**Results:** New challans are added; existing ones get their amount/status updated. A totals strip shows "N challan(s) · Total: ₹…" and, on **All**, "(Pending: n · ₹… · Paid: n · ₹…)". Empty states: "No challans on record. Click "Check challans" to scan." or "No challans in "<tab>" tab."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "All challan sources failed — carinfo: … · echallan-http: … · …" | Every source failed | Retry later |
| "Challan scan failed" | Network/server error | Retry |

**Limitations:** Challans that disappear from the source are never removed. Totals are added up in the browser using ordinary numbers and shown without paise. Pending also counts status UNPAID; Paid counts DISPOSED; Contested counts COURT.

**How it works:** `POST /api/vehicles/:id/challans/scan` tries: CarInfo.app challan page; the echallan.parivahan.gov.in REST endpoint; a headed browser session (only if the operator enabled it and chassis last 4 is set); a fixture file (development). Source statuses are normalised: pending → PENDING, disposed/paid → PAID, in court/contested → CONTESTED, cancelled → CANCELLED. Each challan is upserted by (vehicle, challan number) in its own transaction; for each new one a "VEHICLE_CHALLAN" event with status PENDING_REVIEW is created in the import review queue. A failed scan writes one import-failure row.

**Related features:** [F-VEH-015](F-VEH-015.md), [D-VEH-005](../dependencies.md#d-veh-005), [D-VEH-006](../dependencies.md#d-veh-006).

**Sources:** `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:108`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:182`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:454`, `packages/api/src/services/vehicles/challans.service.ts:77`, `packages/api/src/services/vehicles/challans.service.ts:121`, `packages/api/src/services/vehicles/challans.service.ts:192`, `packages/api/src/ingestion/vehicle/challan.ts:262`
