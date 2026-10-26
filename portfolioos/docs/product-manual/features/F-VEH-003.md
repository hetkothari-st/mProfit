---
id: F-VEH-003
title: "Add a vehicle (CarInfo owner verification)"
module: "Vehicles"
status: Live
roles: "as F-VEH-001"
settings: []
related: [F-VEH-004, F-VEH-006, F-VEH-008, F-VEH-009]
---

[← Vehicles](../modules/vehicles.md) · [Index](../INDEX.md)

# Add a vehicle (CarInfo owner verification)

`F-VEH-003` · Live · Roles: as [F-VEH-001](F-VEH-001.md)

**What it does:** A three-step wizard that takes your registration number and mobile number, has CarInfo send an OTP to that mobile, and on verification creates the vehicle with the RC details CarInfo returns (owner, make/model, fuel, colour, expiries, RC status, class, emission norms, seating, weight, engine number, hypothecation, registration date) plus a stock photo. It then runs an automatic RC refresh to fill any gaps and opens the new vehicle.

**Why it exists:** From the dialog text: "Enter your mobile number to receive an OTP from CarInfo. This is required to fetch private owner and insurance details."

**Where to find it:** **Asset Classes → Vehicles → Add vehicle** (or **Add your first vehicle**) — dialog on `/vehicles`.

**Who can use it:** All plans. Requests are limited to 5 vehicle lookups per minute per user (shared with **Refresh** and **Check challans**).

**Steps**
1. Click **Add vehicle**. The dialog "Add a vehicle" opens with a four-segment progress bar.
2. Type the full number plate in **Registration number** (placeholder MH47BT5950). Click **Next** (enabled at 5+ characters).
3. Screen "Owner verification required": type your 10-digit mobile number (non-digits are stripped). Click **Get OTP**. The app shows "OTP sent".
4. Screen "Verify OTP" ("Enter the OTP sent to +91 …"): type the OTP (digits only, up to 6). Click **Verify & Fetch Details** (enabled at 4+ digits).
5. The app shows "Vehicle added", closes the dialog and opens the vehicle page.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Next** | Button | Goes to the mobile step | Registration number shorter than 5 characters |
| **Get OTP** | Button | Starts a CarInfo session and requests the OTP | Mobile not exactly 10 digits, or request running |
| **Verify & Fetch Details** | Button | Submits the OTP, creates/updates the vehicle | OTP shorter than 4 digits, or request running |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Registration number | Text (upper-cased display) | Yes | Server: 5–20 characters; spaces removed and upper-cased | Empty | "Failed to send OTP" or server message |
| Mobile number | Phone | Yes | Exactly 10 digits | Empty | "Failed to send OTP" |
| OTP | Text | Yes | 4–6 digits | Empty | "Verification failed" or CarInfo's message, e.g. "CarInfo OTP Error: …" |

**Settings and toggles here:** None.

**Results:** A new vehicle row (or, if a vehicle with the same number already exists on your account, that vehicle updated without blanking fields you filled) with refresh source "carinfo-playwright" and "Last refreshed" set to now. The mobile number is used only to receive the OTP; it is not stored on the vehicle.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to send OTP" / "Internal server error" | CarInfo page could not be driven (site change, timeout) | Retry later, or use **Paste SMS** ([F-VEH-004](F-VEH-004.md)) |
| "Session expired or not found" | More than 10 minutes passed since **Get OTP**, or the server restarted | Start again from **Add vehicle** |
| "No registration number returned by CarInfo" | CarInfo returned no plate | Use **Paste SMS** |
| "Vehicle creation failed — try again or use SMS paste" | Verify returned no vehicle | Retry or use **Paste SMS** |
| "Saved. Could not fetch RC details automatically — retry from the vehicle page." | The follow-up automatic refresh failed | Open the vehicle and click **Refresh** |
| "Too many vehicle lookups. Please wait a minute." | More than 5 lookups in a minute | Wait one minute |

**Limitations:** There is no manual way to add a vehicle in this dialog: the form step ("Verify vehicle details") is only reachable when editing an existing vehicle. If CarInfo is unavailable, use **Paste SMS**. The OTP is CarInfo's, sent to whatever mobile you enter; whether CarInfo requires the RC owner's own number could not be verified from code.

**How it works:** **Get OTP** calls `POST /api/vehicles/carinfo/init` (rate-limited), which opens a server-side browser session on carinfo.app tied to your user id and valid for 10 minutes. **Verify & Fetch Details** calls `POST /api/vehicles/carinfo/verify`; only the user who started a session can complete it. The parsed record is written directly; the RTO code falls back to the first letters/digits of the plate (for example MH47). A stock photo is looked up by make/model. The browser then calls `POST /api/vehicles/:id/refresh` in **auto** mode ([F-VEH-008](F-VEH-008.md)) to backfill fields such as norms, seating, weight and hypothecation. The registration number and engine number are stored encrypted with a searchable fingerprint and last-4 digits.

**Related features:** [F-VEH-004](F-VEH-004.md), [F-VEH-008](F-VEH-008.md), [F-VEH-009](F-VEH-009.md), [F-VEH-006](F-VEH-006.md).

**Sources:** `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:258`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:176`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:189`, `packages/api/src/controllers/vehicles.controller.ts:132`, `packages/api/src/controllers/vehicles.controller.ts:149`, `packages/api/src/lib/playwrightSessions.ts:61`, `packages/api/src/middleware/rateLimit.ts:280`
