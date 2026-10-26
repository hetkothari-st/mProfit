---
id: F-VEH-004
title: "Paste VAHAN SMS"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: []
related: [F-VEH-003, F-VEH-008]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Paste VAHAN SMS

`F-VEH-004` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** Lets you text "VAHAN <reg-no>" to 07738299899, paste the reply, and have the app parse it into the vehicle record — updating an existing vehicle with that number or creating a new one.

**Why it exists:** Code comment: "§7.4 SMS fallback UI" — a human-in-the-loop path that works when the automatic sources fail.

**Where to find it:** **Asset Classes → Vehicles → Paste SMS**, or **SMS** on a vehicle's page (number pre-filled).

**Who can use it:** All plans.

**Steps**
1. Click **Paste SMS** (or **SMS** on a vehicle). Dialog "Paste VAHAN SMS" opens.
2. Fill **Registration number** and paste the reply into **SMS body**.
3. Click **Apply SMS**. On success the app shows "Vehicle <REG> created from SMS" or "Vehicle <REG> updated from SMS" and closes the dialog.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Closes the dialog | — |
| **Apply SMS** | Button | Sends number + SMS for parsing | Running, number empty, or SMS shorter than 10 characters |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Registration number | Text | Yes | 5–20 characters; must match an Indian plate (e.g. MH47BT5950) or BH-series (e.g. 21BH1234AA) after removing spaces | Vehicle's number when opened from a vehicle | "Invalid registration number: …. Expected formats like MH47BT5950 or 21BH1234AA." |
| SMS body | Multi-line text | Yes | 10–4000 characters; must contain the registration number | Empty | "SMS does not appear to reference <REG>" |

**Settings and toggles here:** None.

**Results:** The vehicle's make, model, variant, fuel, colour, chassis last 4, owner, manufacturing year and the five expiry dates are filled from the SMS where present. A field missing from the SMS never blanks a stored value. Refresh source becomes "vahan.sms".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "SMS does not appear to reference <REG>" | The pasted text does not contain the number | Paste the reply for that vehicle |
| "SMS could not be parsed" | Parser returned no data | Check the paste is the full VAHAN reply |
| "SMS paste failed" / "Validation failed" | Network or input validation | Retry; check lengths |

**Limitations:** Only the formats the parser recognises are read: "Label: value, …" and "Label value | …" with dates as YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY or DD-MMM-YYYY. If almost nothing is recognised, the vehicle is still saved with just its number ("Only the registration number was saved — fill the rest manually." is recorded as a parser warning, not shown in the toast). The dialog closes even when parsing fails.

**How it works:** `POST /api/vehicles/sms-paste` runs the vehicle source chain with only the SMS adapter. Labels are matched case-insensitively; a bare fuel word (PETROL, DIESEL, CNG, LPG, ELECTRIC, EV, HYBRID, HYDROGEN) is picked up even without a label. A new vehicle also gets a stock photo. When parsing fails, one failure row is written to the import-failures queue.

**Related features:** [F-VEH-003](F-VEH-003.md), [F-VEH-008](F-VEH-008.md), [D-VEH-005](../dependencies.md#d-veh-005).

**Sources:** `apps/web/src/pages/vehicles/SmsPasteDialog.tsx:38`, `packages/api/src/controllers/vehicles.controller.ts:69`, `packages/api/src/services/vehicles/vehicles.service.ts:41`, `packages/api/src/services/vehicles/vehicles.service.ts:396`, `packages/api/src/ingestion/vehicle/sms.ts:190`
