# EveryPaisa User Manual — Property & Vehicles (B05 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Vehicles (`/vehicles`, `/vehicles/value`, `/vehicles/:id`), Real Estate (`/real-estate`, `/real-estate/:id`), Rental (`/rental`, `/rental/:id`, `/rental/tenancies/:tenancyId`)

## Contents
- [Vehicles](#vehicles)
- [Real Estate](#real-estate)
- [Rental](#rental)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->
## Vehicles

The Vehicles area keeps one card per vehicle you own (identified by its registration number), fetches registration-certificate (RC) details from free public sources, tracks insurance, PUC, fitness, road-tax and permit expiry dates, lists traffic challans, shows state fuel prices and estimates the vehicle's resale value. It is reached from **Asset Classes → Vehicles** in the sidebar (`/vehicles`). No plan is required; every signed-in user can use it on their own data.

### Vehicles list <!-- F-VEH-001 -->
**What it does:** Shows every vehicle on your account as a card with its registration number, make and model, owner name, a shield icon and three expiry rows (**Insurance**, **PUC**, **Fitness**). Above the cards it shows the fuel-price card (see F-VEH-011) and the page actions.

**Why it exists:** Inferred from behavior and the page subtitle "Registration, insurance, PUC, fitness — all expiries in one place": one screen to see which vehicle document is about to lapse.

**Where to find it:** **Asset Classes → Vehicles** (route `/vehicles`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (all plans). While managing a family member's account (R-MANAGER) you see that person's vehicles. Family view (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER) does not add other members' vehicles — the list is always the signed-in (or managed) person's own.

**Steps**
1. Open **Asset Classes → Vehicles**. Three grey placeholder cards show while loading.
2. With no vehicles you see "No vehicles yet" — "Add an RC number — we'll track insurance, PUC, fitness, and challan expiries automatically." and **Add your first vehicle**.
3. With vehicles, read each card; click the arrow icon at the card's top right to open the vehicle (F-VEH-006).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Individual** / **Family** | Two-button switch | Changes grouping (F-VEH-002) | — |
| **Download** (report button) | Button | Downloads the vehicles report (D-VEH-001) | — |
| **Get valuation** | Link button | Opens `/vehicles/value` (F-VEH-012) | — |
| **Paste SMS** | Button | Opens the VAHAN SMS dialog (F-VEH-004) | — |
| **Add vehicle** / **Add your first vehicle** | Button | Opens the add-vehicle wizard (F-VEH-003) | — |
| Trash icon on a card | Icon button | Deletes the vehicle after a browser confirm (F-VEH-005) | Spinner while deleting |
| Arrow icon on a card | Link | Opens `/vehicles/:id` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-VEH-001 **Individual / Family** view — Individual shows one grid; Family groups cards by the owner name printed on the RC. Remembered on this device.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A card shows "Unknown vehicle" | Make and model are empty (RC details not fetched yet) | Open the vehicle and click **Refresh** (F-VEH-008) or paste the VAHAN SMS |
| An expiry row shows "—" | That date is not recorded | Edit the vehicle (F-VEH-007) or refresh RC details |

**Limitations:** The list cards show only Insurance, PUC and Fitness; road tax and permit appear on the detail page only. Expiry countdowns use your browser's clock.

**How it works:** `GET /api/vehicles` returns your vehicles (with their 5 most recent challans) sorted by registration number after decryption — the number is stored encrypted, so the database cannot sort it. Each expiry row computes whole days = floor((date − now) / 1 day): negative → "Expired Nd ago" in red; 0 → "Today"; 1–7 days → red "Nd left"; 8–30 → amber; more than 30 → grey. The card shows an amber warning shield when any of Insurance, PUC or Fitness is 30 days or less away (including already expired); otherwise a green check shield.

**Related features:** F-VEH-002, F-VEH-003, F-VEH-004, F-VEH-006, F-VEH-011, D-VEH-001.

**Sources:** `apps/web/src/pages/vehicles/VehicleListPage.tsx:44`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:139`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:199`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:239`, `packages/api/src/services/vehicles/vehicles.service.ts:103`

### Individual / Family grouping <!-- F-VEH-002 -->
**What it does:** Switches the Vehicles list between one flat grid (**Individual**) and sections grouped by the RC owner name (**Family**), each headed by the owner name and "N vehicle(s)".

**Why it exists:** Inferred from behavior: households register vehicles in different members' names; grouping by owner shows who holds what.

**Where to find it:** **Asset Classes → Vehicles**, page header, left of the action buttons (route `/vehicles`).

**Who can use it:** Everyone who can see the list (F-VEH-001).

**Steps**
1. Click **Family**. Cards regroup under owner names; vehicles with no owner name go under "Unassigned".
2. Click **Individual** to return to one grid.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Individual** | Tab button | Flat grid | — |
| **Family** | Tab button | Group by owner name | — |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** S-VEH-001 — default **Individual**; the choice is stored in this browser and reused next visit.

**Results:** Only the layout changes; no data changes.

**Errors and troubleshooting:** None.

**Limitations:** "Family" here means "grouped by the owner name on the RC". It is not linked to the Family feature (household members, family view) — it does not show other members' vehicles. Owner names that differ only in spelling form separate groups.

**How it works:** Grouping is done in the browser: owner name trimmed, empty → "Unassigned"; groups sorted by number of vehicles, largest first. The choice is saved under the browser key `vehicles_view_mode`.

**Related features:** F-VEH-001.

**Sources:** `apps/web/src/pages/vehicles/VehicleListPage.tsx:30`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:50`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:160`

### Add a vehicle (CarInfo owner verification) <!-- F-VEH-003 -->
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
| "Failed to send OTP" / "Internal server error" | CarInfo page could not be driven (site change, timeout) | Retry later, or use **Paste SMS** (F-VEH-004) |
| "Session expired or not found" | More than 10 minutes passed since **Get OTP**, or the server restarted | Start again from **Add vehicle** |
| "No registration number returned by CarInfo" | CarInfo returned no plate | Use **Paste SMS** |
| "Vehicle creation failed — try again or use SMS paste" | Verify returned no vehicle | Retry or use **Paste SMS** |
| "Saved. Could not fetch RC details automatically — retry from the vehicle page." | The follow-up automatic refresh failed | Open the vehicle and click **Refresh** |
| "Too many vehicle lookups. Please wait a minute." | More than 5 lookups in a minute | Wait one minute |

**Limitations:** There is no manual way to add a vehicle in this dialog: the form step ("Verify vehicle details") is only reachable when editing an existing vehicle. If CarInfo is unavailable, use **Paste SMS**. The OTP is CarInfo's, sent to whatever mobile you enter; whether CarInfo requires the RC owner's own number could not be verified from code.

**How it works:** **Get OTP** calls `POST /api/vehicles/carinfo/init` (rate-limited), which opens a server-side browser session on carinfo.app tied to your user id and valid for 10 minutes. **Verify & Fetch Details** calls `POST /api/vehicles/carinfo/verify`; only the user who started a session can complete it. The parsed record is written directly; the RTO code falls back to the first letters/digits of the plate (for example MH47). A stock photo is looked up by make/model. The browser then calls `POST /api/vehicles/:id/refresh` in **auto** mode (F-VEH-008) to backfill fields such as norms, seating, weight and hypothecation. The registration number and engine number are stored encrypted with a searchable fingerprint and last-4 digits.

**Related features:** F-VEH-004, F-VEH-008, F-VEH-009, F-VEH-006.

**Sources:** `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:258`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:176`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:189`, `packages/api/src/controllers/vehicles.controller.ts:132`, `packages/api/src/controllers/vehicles.controller.ts:149`, `packages/api/src/lib/playwrightSessions.ts:61`, `packages/api/src/middleware/rateLimit.ts:280`

### Paste VAHAN SMS <!-- F-VEH-004 -->
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

**Related features:** F-VEH-003, F-VEH-008, D-VEH-005.

**Sources:** `apps/web/src/pages/vehicles/SmsPasteDialog.tsx:38`, `packages/api/src/controllers/vehicles.controller.ts:69`, `packages/api/src/services/vehicles/vehicles.service.ts:41`, `packages/api/src/services/vehicles/vehicles.service.ts:396`, `packages/api/src/ingestion/vehicle/sms.ts:190`

### Delete a vehicle <!-- F-VEH-005 -->
**What it does:** Permanently removes a vehicle and its challans.

**Why it exists:** Inferred from behavior: remove sold or mistakenly added vehicles.

**Where to find it:** Trash icon on a card at **Asset Classes → Vehicles**; **Delete** on the vehicle page header; **Delete Vehicle** in the edit dialog.

**Who can use it:** All plans, on their own (or managed person's) vehicles.

**Steps**
1. Click the trash icon (or **Delete**). The browser asks "Delete vehicle <REG>?" (edit dialog: "… This cannot be undone.").
2. Confirm. The app shows "Vehicle <REG> deleted" (list) or "Vehicle deleted" and, from the detail page, returns to `/vehicles`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Trash icon (card) | Icon button | Delete after confirm | While deleting |
| **Delete** (detail) | Button | Delete after confirm | While deleting |
| **Delete Vehicle** (edit dialog) | Button | Delete after confirm | While deleting; shown only when editing |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** The vehicle and all its challans are deleted. Saved valuation history entries stay but lose their vehicle link.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete vehicle" / "Delete failed" | Network or server error | Retry |

**Limitations:** No undo. Challan review items already created in the ingestion review queue are not removed.

**How it works:** `DELETE /api/vehicles/:id` checks the vehicle belongs to you ("Vehicle not found" 404 / 403 otherwise) and deletes it; challans cascade in the database.

**Related features:** F-VEH-001, F-VEH-006, F-VEH-010.

**Sources:** `apps/web/src/pages/vehicles/VehicleListPage.tsx:272`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:176`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:169`, `packages/api/src/services/vehicles/vehicles.service.ts:220`, `packages/api/prisma/schema.prisma:2018`

### Vehicle detail page <!-- F-VEH-006 -->
**What it does:** Shows one vehicle: header with registration number and shield, description (make model variant), action buttons, a **Photo** card, a **Registration & owner** card, an **Expiries** card, the fuel-price card and the **Challans** card.

**Why it exists:** Inferred from behavior: the single place for every RC fact and expiry for a vehicle.

**Where to find it:** **Asset Classes → Vehicles** → arrow on a card (route `/vehicles/:id`).

**Who can use it:** All plans, own vehicles.

**Steps**
1. Open a vehicle. "Loading…" shows while fetching.
2. Read the cards. Use **Vehicles** (back arrow) to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Vehicles** | Back link | Returns to `/vehicles` | — |
| **Get valuation** | Link | Opens `/vehicles/value?vehicleId=…` (F-VEH-013) | — |
| **SMS** | Button | Opens Paste VAHAN SMS with the number filled (F-VEH-004) | — |
| **Refresh** | Button | RC refresh (F-VEH-008) | While running |
| **Edit** | Button | Edit dialog (F-VEH-007) | — |
| **Delete** | Button | F-VEH-005 | While deleting |
| **Find photo** / **Refresh** (photo card) | Button | F-VEH-009 | While running |
| **Check challans** and tabs | Button / tabs | F-VEH-010 | While running |

**Fields and rules:** Not applicable — view only. **Registration & owner** shows: Owner, RTO, Fuel, Color, Manufacturing year, Chassis (last 4), Registration date, RC status, Vehicle class, Emission norms, Vehicle age, Seating capacity, Unloaded weight (kg), Engine no., Hypothecation ("Clear" when empty or NONE), Purchase date, Purchase price, Current value; empty values show "—". A line "Last refreshed <date time> via <source>" appears once the vehicle has been refreshed. **Expiries** shows Insurance, PUC, Fitness, Road tax, Permit with the date (or "Not recorded") and a countdown badge.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Page stays on "Loading…" | The vehicle does not exist or is not yours (the page has no not-found state) | Go back to **Vehicles** |

**Limitations:** Vehicle age shows "<years/months> (mfg) · <…> (reg)" only when both ages exist and differ; manufacturing age counts from 1 January of the manufacturing year. Linked motor insurance policies are loaded with the vehicle but not displayed (see DOCUMENTATION_GAPS F-VEH-017).

**How it works:** `GET /api/vehicles/:id` returns the vehicle with all challans (newest offence first) and the linked insurance policies' summary (never the policy number). The header shield is amber when any of the five expiries is 30 days or less away; countdown colours as in F-VEH-001.

**Related features:** F-VEH-007 to F-VEH-011, F-VEH-013.

**Sources:** `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:123`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:226`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:369`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:435`, `packages/api/src/services/vehicles/vehicles.service.ts:123`

### Edit a vehicle <!-- F-VEH-007 -->
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
| **Delete Vehicle** | Button | F-VEH-005 | — |
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

**Settings and toggles here:** S-VEH-006 **Portfolio** — optional; "Optional — group this vehicle under a portfolio."

**Results:** Changed fields are saved. The disclaimer "Data synchronized via CarInfo RTO services. Please verify these details with your original documents." is informational.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Save failed" or "Validation failed" | Server rejected a value | Check year range and date format |

**Limitations:** Clearing a field does not clear it: empty inputs are dropped before sending, so the stored value stays. Model, fuel type, owner name, purchase date, purchase price, current value and permit expiry have no input here (current value can be set from the valuation page, F-VEH-013). The registration number cannot be changed from this dialog.

**How it works:** `PATCH /api/vehicles/:id` with only non-empty fields; the server validates (make/model/variant ≤120, year 1900–2100, fuel/colour ≤32, chassis ≤16, owner ≤160, dates YYYY-MM-DD, money as decimal strings) and updates only the fields sent.

**Related features:** F-VEH-006, F-VEH-005, F-VEH-013.

**Sources:** `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:30`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:117`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:374`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:443`, `packages/api/src/controllers/vehicles.controller.ts:32`, `packages/api/src/services/vehicles/vehicles.service.ts:175`

### Refresh RC details <!-- F-VEH-008 -->
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
| "No fresh data. vahan.carinfo.scraper: … · vahan.mparivahan.api: …" | Every source failed | Retry later or use **SMS** (F-VEH-004) |
| "Too many vehicle lookups. Please wait a minute." | Rate limit | Wait |
| "Refresh failed" | Network/server error | Retry |

**Limitations:** Data quality depends on third-party sites (carinfo.app, government VAHAN endpoints, rahastas.in) that can change without notice. The Parivahan portal source is disabled in production unless the operator enables it (F-VEH-019).

**How it works:** `POST /api/vehicles/:id/refresh` (mode interactive) runs, in order: CarInfo.app scraper (`vahan.carinfo.scraper`), mParivahan/VAHAN API (`vahan.mparivahan.api`), Rahastas.in scraper (`vahan.rahastas.scraper`), Parivahan portal (`vahan.parivahan.portal`, needs chassis last 4), VAHAN SMS (`vahan.sms`, needs a pasted SMS — not supplied by this button). The first source that succeeds wins. If all real attempts fail, one row is written to the import-failures queue ("All N vehicle adapter(s) failed for <REG>"). Timeouts: CarInfo 15 s, VAHAN endpoints 8–12 s, Rahastas 15 s.

**Related features:** F-VEH-003, F-VEH-004, F-VEH-014, F-VEH-019, D-VEH-005.

**Sources:** `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:137`, `packages/api/src/services/vehicles/vehicles.service.ts:238`, `packages/api/src/services/vehicles/vehicles.service.ts:304`, `packages/api/src/ingestion/vehicle/chain.ts:40`, `packages/api/src/ingestion/vehicle/chain.ts:117`, `packages/api/src/middleware/rateLimit.ts:280`

### Vehicle stock photo <!-- F-VEH-009 -->
**What it does:** Shows a generic stock image for the vehicle's make and model and lets you look one up again.

**Why it exists:** From the card text: "RTO does not publish vehicle-specific photos. Stock image keyed by make+model."

**Where to find it:** Vehicle page → **Photo** card.

**Who can use it:** All plans.

**Steps**
1. Without a photo the card says "No photo available. Refresh RC data to fetch a stock photo." Click **Find photo**.
2. With a photo, click **Refresh** to look again. Result: "Photo updated" or "No matching stock photo for this make/model."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Find photo** / **Refresh** | Button | Looks up a stock photo by make, model, class and fuel | While running |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** The vehicle's photo and its source label ("Stock photo · <source>") update.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No matching stock photo for this make/model." | Make/model unknown or not in the photo source | Refresh RC details first so make/model are known |
| "Photo refresh failed" | Server error | Retry |

**Limitations:** It is never a photo of your actual vehicle. Which external photo sources are used was not traced further than the resolver entry point.

**How it works:** `POST /api/vehicles/:id/refresh-photo` calls the photo resolver with make, model, vehicle class and fuel; on a hit it stores the URL and source. If the image fails to load in the browser it is hidden.

**Related features:** F-VEH-008, F-VEH-006.

**Sources:** `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:156`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:316`, `packages/api/src/services/vehicles/vehicles.service.ts:366`, `packages/api/src/ingestion/vehicle/photo.ts:44`

### Challans <!-- F-VEH-010 -->
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

**Related features:** F-VEH-015, D-VEH-005, D-VEH-006.

**Sources:** `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:108`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:182`, `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:454`, `packages/api/src/services/vehicles/challans.service.ts:77`, `packages/api/src/services/vehicles/challans.service.ts:121`, `packages/api/src/services/vehicles/challans.service.ts:192`, `packages/api/src/ingestion/vehicle/challan.ts:262`

### Fuel and electricity prices <!-- F-VEH-011 -->
**What it does:** Shows today's petrol, diesel (₹/litre), CNG (₹/kg), LPG (14.2 kg cylinder) and electricity (₹/kWh) prices for a chosen state, with a freshness indicator.

**Why it exists:** Inferred from behavior: running-cost context for vehicle owners.

**Where to find it:** Top of **Asset Classes → Vehicles** and on each vehicle page.

**Who can use it:** All signed-in users.

**Steps**
1. Read the five prices. The dot and label show "live" (green, petrol/diesel scraped) or "cached" (amber, built-in seed values) and how long ago ("just now", "Ns ago", "Nm ago", "Nh ago").
2. Pick another state in **State** to see its prices.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **State** | Select | Chooses the state | — |

**Fields and rules:** Not applicable — no form.

**Settings and toggles here:** S-VEH-002 **State** — default: the state code from the first vehicle's RTO (list page) or this vehicle's RTO (detail page), else MH. Not remembered.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fetching prices…" stays | Price request pending/failed | Reload |
| A value shows "—" | No figure for that state | — |

**Limitations:** CNG, LPG and electricity are static seed values shipped with the app (code note: "Last reviewed 2026-04"); only petrol and diesel are scraped (from cardekho.com). Electricity is a representative residential 0–100 unit slab rate.

**How it works:** `GET /api/vehicles/prices/states` lists states; `GET /api/vehicles/prices?state=<code>` returns prices. The server keeps an in-memory petrol/diesel cache: fresh for 5 minutes, then served stale while refreshing in the background; a scheduled sync runs daily at 06:30 IST. The browser refetches every 60 seconds while the tab is visible and on window focus.

**Related features:** F-VEH-001, F-VEH-006.

**Sources:** `apps/web/src/pages/vehicles/FuelPricesCard.tsx:68`, `apps/web/src/pages/vehicles/FuelPricesCard.tsx:82`, `packages/api/src/controllers/vehicles.controller.ts:272`, `packages/api/src/priceFeeds/fuel.service.ts:53`, `packages/api/src/priceFeeds/fuel.service.ts:330`, `packages/api/src/jobs/priceJobs.ts:376`

### Vehicle valuation <!-- F-VEH-012 -->
**What it does:** Estimates a used vehicle's price from category, make, model, year, trim/variant, kilometres, whether you are buying or selling and to/from an individual or dealer. Shows an adjustable estimate, prices for five conditions (Bad, Fair, Good, Very Good, Excellent), projections (1, 3, 5 years, residual, salvage, clunker/scrappage) and 11 condition sliders.

**Why it exists:** Page subtitle: "OBV-style price estimate. Adjust condition with sliders to see live price changes."

**Where to find it:** **Asset Classes → Vehicles → Get valuation** (route `/vehicles/value`).

**Who can use it:** All plans.

**Steps**
1. Choose **Transaction** (**I want to sell** / **I want to buy**) and **Counterparty** (**Individual** / **Dealer**).
2. Pick **Category** (optional, "Any"), **Make**, **Model**, **Year**, **Trim / Variant** in order (each unlocks the next), and enter **Kilometers driven**.
3. Click **Get price**. "Quote ready" appears, or a warning that live data was unavailable.
4. Move the condition sliders; the big figure updates instantly. **Reset** returns all sliders to Good.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **I want to sell** / **I want to buy** | Toggle | Sets transaction type | — |
| **Individual** / **Dealer** | Toggle | Sets counterparty | — |
| **Category**, **Make**, **Model**, **Year**, **Trim / Variant** | Selects | Cascading vehicle choice | Model needs a make; Year needs a model; Trim needs a year |
| **Kilometers driven** | Number | Usage | — |
| **Get price** | Button | Requests the quote | Make, model, year or trim missing; while running |
| 11 sliders: AC, Brakes, Car Exterior, Car Interior, Electrical, Engine, Frame, Steering, Suspension, Transmission, Wheel and Tyres | Range (Fair, Good, Very Good, Excellent) | Adjusts the estimate | Shown after a quote |
| **Reset** | Button | All sliders to Good | — |
| **Vehicles** | Back link | Returns to the list | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Year | Select | Yes | Server: 1980 to next year | — | "Validation failed" |
| Kilometers driven | Number | Yes | 0–1,000,000 (negative typed values become 0) | 0 | "Validation failed" |

**Settings and toggles here:** S-VEH-003 **Transaction** (default **I want to sell**), S-VEH-004 **Counterparty** (default **Individual**), S-VEH-005 condition sliders (default all **Good**). None are remembered.

**Results:** The estimate shows as "Estimated sell|buy price (individual|dealer)" with "Anchor (Good condition): ₹…", plus "Sources: … · Cached until <date time>". Nothing is saved to your vehicles unless you use F-VEH-013.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Market data temporarily unavailable for this vehicle. Please try again later or use a different trim." | No source returned a price and no list price (MSRP) is known | Try another trim or later |
| Banner "Estimated price. Live market data is temporarily unavailable…" | Only the depreciation formula produced a price | Accept as an estimate or retry later |
| "Quote failed" | Network/server error | Retry |

**Limitations:** The catalogue (makes, models, trims, list prices) comes from a monthly crawl of CarDekho and BikeWale; models not in it cannot be valued. For models still on sale the year list reaches 7 years before launch. The rupee figure is rounded to whole rupees for display.

**How it works:** `POST /api/valuations/quote` builds a cache key from make, model, year, trim, kilometres rounded down to 5,000, transaction and counterparty; a cached quote is reused for 24 hours (shared by all users). Otherwise sources CarDekho, CarWale and Cars24 are tried; the median of their "Good" prices is used. If none answers, a deterministic depreciation formula on the catalogue list price is used and the quote is flagged estimated. Mode multipliers on the Good price: sell-to-individual ×1.00, sell-to-dealer ×0.88, buy-from-individual ×1.05, buy-from-dealer ×1.10. Condition: each slider stop has a value (Fair 0.75, Good 0.85, Very Good 0.92, Excellent 1.00); the weighted score uses weights Engine 0.20, Transmission 0.15, Frame 0.12, Brakes 0.10, Suspension 0.10, Car Exterior 0.09, Electrical 0.08, Wheel and Tyres 0.07, Car Interior 0.05, Steering 0.03, AC 0.01; price = Good price × score ÷ 0.85. Bad = Good × 0.65. Projections compound yearly depreciation of 20%, 15%, 15%, 10%, 10%, then 10% per year with a floor of 5% of today's price; residual = 5-year value; salvage = 12% of today's price; clunker = a flat scrappage value by category (Hatchback 25,000, Sedan 35,000, SUV 45,000, MUV/MPV 40,000, Coupe/Convertible 35,000, Bike 5,000, Scooter 4,000; default 25,000). Total failure writes one import-failure row.

**Related features:** F-VEH-013, D-VEH-005.

**Sources:** `apps/web/src/pages/vehicles/VehicleValuePage.tsx:56`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:110`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:344`, `packages/api/src/controllers/valuation.controller.ts:127`, `packages/api/src/services/valuation/quoteService.ts:31`, `packages/api/src/services/valuation/quoteService.ts:54`, `packages/api/src/ingestion/valuation/chain.ts:30`, `packages/shared/src/valuation/conditionEngine.ts:17`, `packages/shared/src/valuation/conditionEngine.ts:71`, `packages/shared/src/valuation/projections.ts:20`, `packages/shared/src/valuation/projections.ts:59`, `packages/api/src/jobs/catalogJobs.ts:68`

### Use my car and Save to my vehicle <!-- F-VEH-013 -->
**What it does:** When the valuation page is opened from a vehicle, **Use my car (<REG>)** fills the inputs from that vehicle and fetches a quote; **Save to my vehicle** stores the slider-adjusted estimate as the vehicle's current value.

**Why it exists:** Inferred from behavior: keep the vehicle's current value (used in net worth) up to date without retyping.

**Where to find it:** Vehicle page → **Get valuation** (route `/vehicles/value?vehicleId=<id>`).

**Who can use it:** All plans, own vehicles.

**Steps**
1. On a vehicle, click **Get valuation**. The back link reads **Back to vehicle**.
2. Click **Use my car (<REG>)**. "Pre-filled from <make> <model>" appears and a quote shows.
3. Adjust sliders. Click **Save to my vehicle**. "Saved to <REG>" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Use my car (<REG>)** | Button | Auto-valuation from the vehicle | Vehicle still loading; while running; hidden without `vehicleId` |
| **Save to my vehicle** | Button | Saves the adjusted price | Hidden without `vehicleId` or before a quote; while saving |
| **Back to vehicle** | Link | Returns to the vehicle | — |

**Fields and rules:** Uses the current Transaction and Counterparty choice; kilometres are set to 0 by **Use my car**.

**Settings and toggles here:** S-VEH-003, S-VEH-004 (as in F-VEH-012).

**Results:** The vehicle's **Current value** becomes the adjusted price (2 decimals) with source = the first price source (or "estimated"), suffixed "+slider-adjusted" when it differs from the Good price by more than ₹1. A valuation log row records the slider positions.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Vehicle missing make/model/year — refresh RC first" | RC details incomplete | Refresh RC (F-VEH-008) or edit the vehicle |
| "No catalog entry for <make> <model> <year>" | Not in the catalogue | Value manually via the selects, if listed |
| "Valuation cache entry not found — re-run quote" | Quote cache entry missing | Click **Get price** again |
| "Auto-valuation failed" / "Save failed" | Other errors | Retry |

**Limitations:** After **Use my car**, the Model/Year/Trim selects may appear blank even though the quote is shown, because changing the upstream select resets the ones below it (see DOCUMENTATION_GAPS F-VEH-013); the quote and **Save** still work. The trim is chosen by matching the vehicle's variant text against catalogue trims; otherwise the newest catalogue row is used.

**How it works:** `GET /api/valuations/vehicles/:id/auto` resolves make, model, manufacturing year and trim from the catalogue and runs the same quote as F-VEH-012. `POST /api/valuations/vehicles/:id/save` validates the price (non-negative decimal), looks up the cached quote by key, writes a log row and updates the vehicle's current value and source.

**Related features:** F-VEH-012, F-VEH-006.

**Sources:** `apps/web/src/pages/vehicles/VehicleValuePage.tsx:137`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:159`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:191`, `packages/api/src/services/valuation/quoteService.ts:207`, `packages/api/src/services/valuation/quoteService.ts:274`

### Automatic RC refresh <!-- F-VEH-014 -->
**What it does:** Every day at 02:15 IST the server refreshes RC details for every vehicle that has never been refreshed or was last refreshed more than 7 days ago, using only sources that need no user interaction.

**Why it exists:** Code comment §7.6: keep expiry dates current without the user pressing **Refresh**.

**Where to find it:** Automatic. The effect shows on the vehicle page ("Last refreshed … via …") and in updated expiry dates.

**Who can use it:** Runs for every vehicle of every user (system job). Operator can switch it off (`ENABLE_VEHICLE_CRONS=false`).

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None (operator setting only).

**Results:** Same merge as F-VEH-008. Vehicles that get no data keep their values; a failure row is written to the import-failures queue when all sources fail.

**Errors and troubleshooting:** None shown to users; failures appear in the import-failures queue (D-VEH-005).

**Limitations:** Only CarInfo, mParivahan and Rahastas run; the portal and SMS sources are skipped. Whether the job succeeds in production depends on those third-party sites.

**How it works:** node-cron "15 2 * * *" Asia/Kolkata runs under the system database context, loops vehicles with `lastRefreshedAt` null or older than 7 days, and calls the refresh in auto mode; an overlapping run is skipped.

**Related features:** F-VEH-008, F-VEH-016.

**Sources:** `packages/api/src/jobs/vehicleJobs.ts:43`, `packages/api/src/jobs/vehicleJobs.ts:112`, `packages/api/src/jobs/vehicleJobs.ts:119`, `packages/api/src/ingestion/vehicle/chain.ts:64`

### Monthly challan scan <!-- F-VEH-015 -->
**What it does:** On the 1st of every month at 03:00 IST the server runs the challan check (F-VEH-010) for every vehicle.

**Why it exists:** Code comment §7.6: surface new challans without user action.

**Where to find it:** Automatic. Results appear in the vehicle's **Challans** card and the import review queue.

**Who can use it:** System job for all vehicles; operator switch `ENABLE_VEHICLE_CRONS`.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** As F-VEH-010 for every vehicle; one import-failure row per vehicle whose scan failed.

**Errors and troubleshooting:** None shown to users.

**Limitations:** Runs sequentially over all vehicles; success depends on third-party sites.

**How it works:** node-cron "0 3 1 * *" Asia/Kolkata → `scanChallansMonthlyForAllActiveVehicles` under the system context; per-vehicle errors are counted and logged, not fatal.

**Related features:** F-VEH-010.

**Sources:** `packages/api/src/jobs/vehicleJobs.ts:91`, `packages/api/src/jobs/vehicleJobs.ts:124`, `packages/api/src/services/vehicles/challans.service.ts:244`

### Vehicle expiry alerts <!-- F-VEH-016 -->
**What it does:** Creates an alert when a vehicle's PUC, Insurance, Fitness Certificate or Road Tax expires in exactly 30, 15, 7 or 1 day(s), e.g. "PUC expires in 7 days" — "Vehicle ending 5950 — PUC expires on <date>".

**Why it exists:** Inferred from behavior: reminders before a document lapses.

**Where to find it:** Alerts (header bell / **Tools → Alerts**, D-VEH-002).

**Who can use it:** Every user with vehicles.

**Steps:** Not applicable — automatic.

**Controls:** None here (alerts are managed on the Alerts page).

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** One alert per vehicle, field and threshold (never duplicated).

**Errors and troubleshooting:** None.

**Limitations:** Permit expiry does not raise alerts. An alert fires only if the scan runs on the exact 30/15/7/1-day mark; a missed day skips that threshold. The text shows only the last 4 characters of the number.

**How it works:** The daily alert job (20:45 IST, per user) and the Alerts page's scan run `generateVehicleExpiryAlerts`: vehicles with any of the four dates between today and today+30; days left = ceil((date − today midnight) / 1 day); alert type CUSTOM keyed `vehicle_expiry:<vehicle>:<field>:<N>d` for de-duplication.

**Related features:** F-VEH-006, D-VEH-002.

**Sources:** `packages/api/src/services/notifications/alerts.service.ts:13`, `packages/api/src/services/notifications/alerts.service.ts:112`, `packages/api/src/services/notifications/alerts.service.ts:119`, `packages/api/src/jobs/alertJobs.ts:48`

### What this area doesn't do
- You can't add a vehicle by typing its details by hand; adding always goes through the CarInfo OTP or the VAHAN SMS.
- You can't edit model, fuel, owner, purchase date, purchase price, permit expiry or the registration number in the app.
- You can't pay, dispute or delete a challan; challans are read-only.
- You can't upload your own vehicle photo; only stock images.
- The **Family** button does not show other family members' vehicles.
- There is no fuel-log, mileage or service-history tracking.

## Real Estate

Real Estate records property you own — flats, houses, villas, plots, commercial units, agricultural land, parking, under-construction units — with its full purchase cost, a manually maintained current value, photos, a map pin, documents, and the capital gain when you sell. It is reached from **Asset Classes → Real Estate** (`/real-estate`). No plan is required. A property you let out can be mirrored into Rental (F-REST-009), where tenancies and rent are tracked.

### Real estate list and summary <!-- F-REST-001 -->
**What it does:** Lists your properties as cards and, above them, three tiles: **Active properties** ("of N total"), **Portfolio value** ("current estimate") and **Unrealised gain** ("value − cost basis").

**Why it exists:** Page subtitle: "Properties you own — homes, plots, commercial. Manual current value, capital-gain on sale, document vault."

**Where to find it:** **Asset Classes → Real Estate** (route `/real-estate`).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER sees the managed person's properties. Family view does not add other members' properties.

**Steps**
1. Open the page. Placeholder cards show while loading; with none you see "No properties yet" — "Add a property to track purchase cost, current value, documents, and tax obligations." and **Add your first property**.
2. Click a card to open the property (F-REST-005). Hover a card to reveal the pencil (**Edit**) and trash (**Delete**) icons.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** (report button) | Button | Real-estate report (D-REST-001) | — |
| **Add property** / **Add your first property** | Button | Opens the form (F-REST-003) | — |
| **Grid** / **Map** | Toggle | F-REST-002 | Hidden when no properties |
| Pencil (title "Edit") | Icon button | Opens the form with this property | Visible on hover |
| Trash (title "Delete") | Icon button | Starts delete (F-REST-004) | Visible on hover; disabled while deleting |
| Card | Link | Opens `/real-estate/:id` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-REST-001 **Grid / Map** view, remembered on this device.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Card says "Current value not set" | No current value entered | Use **Refresh value** on the property |

**Limitations:** Totals use the full current value and full cost even when **My share** is below 100%. Sold properties are excluded from value, cost and the active count but remain listed (faded, stamped "SOLD").

**How it works:** `GET /api/real-estate/properties` returns your properties newest first. Each card shows a banner — the property's cover photo slideshow when it has photos (with a photo count when more than one), otherwise an illustration for its type — plus type label, a short reference "№ <last 6 of id>", city (or address), name, status label, current value and gain: gain = current value − (purchase price + stamp duty + registration fee + brokerage + other costs); percentage shown only when cost > 0, to 1 decimal. Covers come from `GET /api/property-photos/covers?ownerType=OWNED_PROPERTY`.

**Related features:** F-REST-002 to F-REST-005, F-REST-010.

**Sources:** `apps/web/src/pages/realEstate/RealEstateListPage.tsx:825`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:584`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:651`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:776`, `packages/shared/src/finance/realEstateMath.ts:15`, `packages/api/src/services/realEstate/realEstate.service.ts:123`

### Grid and map view of properties <!-- F-REST-002 -->
**What it does:** Switches the Real Estate or Rental list between cards and a map of all properties with pins; clicking a pin opens a preview card with cover photo, name, place, value (Real Estate) or "₹…/mo"/"Vacant" (Rental) and **Open**.

**Why it exists:** Inferred from behavior: see where your properties are.

**Where to find it:** **Asset Classes → Real Estate** or **Asset Classes → Rental** (Properties tab), right-aligned **Grid** / **Map** switch.

**Who can use it:** Everyone who can see the list.

**Steps**
1. Click **Map**. A counter shows "Finding your properties…" then "N of M on the map" ("· locating…" while addresses are still being looked up).
2. Click a pin to see its preview; **Open** goes to the property; the × closes the preview.
3. Below the map, properties without a pin are listed: "Not on the map yet: … Add an address, or place the pin from the property's page."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Grid** / **Map** | Toggle | Switch view | — |
| Pin | Map marker | Selects a property | — |
| **Open** | Link | Opens the property | — |
| Close (×) | Button | Closes the preview | — |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** S-REST-001 (Real Estate) and S-RENT-001 (Rental): default **Grid**, remembered per page in this browser.

**Results:** Looking up a property's address stores its pin on the property (see F-REST-011).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A property is listed under "Not on the map yet" | No address, or the address was not found | Add an address or place the pin on the property page |

**Limitations:** Each map refresh looks up at most 3 new addresses; the map re-asks every 2.5 seconds while any are pending. Map tiles come from OpenStreetMap; a network block on openstreetmap.org leaves the map blank. Pins marked approximate are placed on the area, not the building.

**How it works:** `GET /api/property-locations?ownerType=OWNED_PROPERTY|RENTAL_PROPERTY` returns each property's pin; for up to 3 properties whose address has never been looked up it queries OpenStreetMap Nominatim (one request at a time, at least 1.1 s apart) and saves the result with the address it came from, so an unchanged address is never looked up again. Rental properties use their single address field; owned properties use address, city, state, pincode and country.

**Related features:** F-REST-011, F-REST-001, F-RENT-001.

**Sources:** `apps/web/src/components/property/ViewToggle.tsx:10`, `apps/web/src/components/property/useListView.ts:5`, `apps/web/src/components/property/PropertiesMap.tsx:32`, `apps/web/src/components/property/PropertiesMap.tsx:117`, `packages/api/src/services/realEstate/propertyLocation.service.ts:56`, `packages/api/src/services/realEstate/propertyLocation.service.ts:190`, `packages/api/src/lib/nominatim.ts:12`

### Add or edit an owned property <!-- F-REST-003 -->
**What it does:** A long form ("Add property" / "Edit property") with sections Identity, Specs, Ownership, Purchase cost, Current value, Property tax & society, Identifiers (optional), Under construction (only when relevant), Lease (optional) and Notes.

**Why it exists:** Inferred from behavior: capture everything needed for cost basis, tax reminders and capital gain.

**Where to find it:** **Asset Classes → Real Estate → Add property**; pencil on a card; **Edit** on the property page.

**Who can use it:** All plans.

**Steps**
1. Click **Add property**. Fill at least **Name *** and **Type ***.
2. Fill other sections as needed. Choose **State** before **City** (City suggests cities of that state and is disabled until a state is chosen).
3. Click **Add property** (or **Save changes**). "Property added" / "Property updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close without saving | While saving |
| **Add property** / **Save changes** | Button | Save | While saving ("Saving…") |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name * | Text | Yes | 1–200 | Empty (placeholder "Andheri East flat") | "Required" |
| Type * | Select: Apartment / Flat, Independent house, Villa, Plot / Land, Commercial — office, Commercial — shop, Agricultural, Parking / Garage, Under construction, Other | Yes | — | Apartment / Flat | "Required" |
| Status | Select: Self-occupied, Second home, Vacant, Rented out, Under construction, Sold | No | — | Self-occupied | — |
| Portfolio | Portfolio picker | No | One of your portfolios | None | — |
| Address | Text | No | ≤500 | — | "Validation failed" |
| State | Select (Indian states) | No | ≤100 | "— select state —" | — |
| City | Text with suggestions | No | ≤100; cleared when the new state doesn't list it | — | — |
| Pincode | Text | No | ≤10 | — | — |
| Built-up (sqft), Carpet (sqft), Plot area (sqft) | Text | No | Decimal | — | "Validation failed" |
| Floors | Number | No | 0–500 | — | — |
| Ownership Type | Select: Sole owner, Joint, HUF, Company | No | — | Sole owner | — |
| My share (%) | Text | No | Decimal | 100 | — |
| Owner name | Text | No | ≤200 | — | — |
| Co-owners (free-text) | Text | No | ≤500 | — | — |
| Purchase date | Date | No | YYYY-MM-DD | — | — |
| Purchase price, Stamp duty, Registration fee, Brokerage, Other costs (₹) | Text | No | Non-negative decimal (no commas) | — | "Validation failed" |
| Estimated current value (₹) | Text | No | Non-negative decimal | — | "Validation failed" |
| Annual property tax (₹) | Text | No | Non-negative decimal | — | — |
| Tax due month | Select January–December | No | 1–12 | "—" | — |
| Society name | Text | No | ≤200 | — | — |
| Maintenance amount (₹) | Text | No | Non-negative decimal | — | — |
| Frequency | Select: Monthly, Quarterly, Annual | No | — | Monthly | — |
| Electricity consumer no., Water connection no., Gas connection no., Khata / Property ID, Survey no. | Text | No | ≤60 each | — | — |
| Builder name, Project name, RERA reg. no., Expected possession, Paid so far (%) | Text/date | No | Shown only when Type or Status is Under construction | — | — |
| Leasehold end date | Date | No | YYYY-MM-DD | — | — |
| Notes | Multi-line | No | ≤5000 | — | — |

**Settings and toggles here:** S-REST-002 **Status** (affects summary totals, alerts and the Sold workflow), S-REST-003 **Portfolio**, S-REST-004 **Tax due month** (drives property-tax alerts).

**Results:** The property is saved. Empty text fields are saved as empty (cleared). Entering a current value stamps "Updated today". When neither Type nor Status is Under construction, the builder, project, RERA, expected possession and paid-so-far fields are cleared on save so possession alerts stop.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Required" under Name | Name empty | Enter a name |
| "Validation failed" | A number has commas, a minus sign or letters, or a limit is exceeded | Enter plain digits, e.g. 4500000 |
| "Save failed" | Other server error | Retry |

**Limitations:** Linking a loan or insurance policy to the property is not possible in this form (F-REST-013). Choosing **Sold** here only changes the label; use **Mark sold** to record the sale and get capital gain. Clearing **My share (%)** may be rejected ("Validation failed").

**How it works:** `POST /api/real-estate/properties` (201) or `PATCH /api/real-estate/properties/:id` with the full form; the server validates with the schema shown, defaults status SELF_OCCUPIED, ownership SOLE at 100%, maintenance MONTHLY and current-value source "manual", and stores money as decimals.

**Related features:** F-REST-005, F-REST-006, F-REST-007, F-REST-012, F-REST-013.

**Sources:** `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:27`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:68`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:165`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:220`, `packages/api/src/schemas/realEstate.schema.ts:23`, `packages/api/src/services/realEstate/realEstate.service.ts:140`, `packages/api/src/services/realEstate/realEstate.service.ts:201`

### Delete an owned property <!-- F-REST-004 -->
**What it does:** Deletes a property after an inline confirmation.

**Why it exists:** Inferred from behavior: remove entries added by mistake.

**Where to find it:** **Asset Classes → Real Estate**, trash icon on a card.

**Who can use it:** All plans.

**Steps**
1. Hover a card and click the trash icon. The card turns into "Delete "<name>"?".
2. Click **Yes, delete** (or **Cancel**). "Property deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Yes, delete** | Button | Deletes | While deleting |
| **Cancel** | Button | Restores the card | — |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** The property and its photos are removed. A linked Rental record is not deleted.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete" or the server message | Not found / server error | Refresh the page |

**Limitations:** No undo. Delete is only offered on the list page, not on the property page. Documents uploaded to the property's document vault are handled by the vault (D-REST-003); their fate on delete was not traced.

**How it works:** `DELETE /api/real-estate/properties/:id` (404 "Property <id> not found" if not yours); photos cascade.

**Related features:** F-REST-001, F-REST-009.

**Sources:** `apps/web/src/pages/realEstate/RealEstateListPage.tsx:841`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:916`, `packages/api/src/services/realEstate/realEstate.service.ts:300`, `packages/api/prisma/schema.prisma:3365`

### Property detail page <!-- F-REST-005 -->
**What it does:** Shows one property: name (with a "Sold" tag when sold), type · status, action buttons, the Rentals banner when linked, **Photos**, three tiles (**Current value** with "Updated N day(s) ago", **Total cost basis** "incl. duties + fees", **Unrealised gain** or **Realised gain (raw)**), then sections Capital gain (sold only), Location, Specs, Ownership, Purchase cost breakdown, Property tax & society, Identifiers (when any), Under construction (when relevant), Linked records (when any), Sale (sold only), Lease (when set), Notes (when set) and Documents.

**Why it exists:** Inferred from behavior: the full record of one property.

**Where to find it:** **Asset Classes → Real Estate** → click a card (route `/real-estate/:id`).

**Who can use it:** All plans.

**Steps**
1. Open a property ("Loading…" first; "Property not found" if it is not yours or missing).
2. Use the back arrow to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Back arrow | Link | `/real-estate` | — |
| **Edit** | Button | F-REST-003 | — |
| **Make rental** | Button | F-REST-009 | Hidden when sold or already linked |
| **Refresh value** | Button | F-REST-006 | Hidden when sold |
| **Mark sold** | Button | F-REST-007 | Hidden when sold |
| **Linked loan** / **Linked insurance** / **Rented out (rental record)** | Links | Open the linked record | Shown only when linked |

**Fields and rules:** Not applicable — view only. Money shows in Indian format; empty values show "—"; Tax due month shows the month name; Maintenance shows "₹… monthly|quarterly|annual".

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Property not found" | Wrong link or not yours | Return to the list |

**Limitations:** For a sold property the tile **Realised gain (raw)** is computed from the current value, not the sale price; use the Capital gain section for the real sale figure. The Documents section uses the shared document vault (D-REST-003) with title "Sale deed, agreements & receipts".

**How it works:** `GET /api/real-estate/properties/:id` (filtered by your user id). "Updated N day(s) ago" counts whole days since the current value was last set.

**Related features:** F-REST-006 to F-REST-011, F-REST-013, D-REST-003.

**Sources:** `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:50`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:111`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:220`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:248`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:441`, `packages/api/src/services/realEstate/realEstate.service.ts:131`

### Update current value <!-- F-REST-006 -->
**What it does:** Records the latest market value of the property.

**Why it exists:** Form help text: "Update manually when market changes — automated price feeds for Indian property are unreliable."

**Where to find it:** Property page → **Refresh value** (dialog "Update current value").

**Who can use it:** All plans; not offered for sold properties.

**Steps**
1. Click **Refresh value**. The field is pre-filled with the current value.
2. Enter the new value in **Current value (₹) *** and click **Update**. "Current value updated" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | While saving |
| **Update** | Button | Save | Field empty or saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Current value (₹) * | Text | Yes | Non-negative decimal, no commas | Existing value | "Validation failed" / "Refresh failed" |

**Settings and toggles here:** None.

**Results:** Current value, its source ("manual") and its date ("Updated 0 day(s) ago") change; list totals and net-worth figures that read the current value change.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Validation failed" | Commas or letters | Use digits only |

**Limitations:** No automatic valuation; no value history is kept (only the latest value and date).

**How it works:** `POST /api/real-estate/properties/:id/refresh-value` with the value and source "manual"; sets `currentValueAsOf` to now.

**Related features:** F-REST-001, F-REST-005.

**Sources:** `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:511`, `packages/api/src/schemas/realEstate.schema.ts:92`, `packages/api/src/services/realEstate/realEstate.service.ts:329`

### Mark property sold <!-- F-REST-007 -->
**What it does:** Records the sale date, sale price and optional sale brokerage, flips the status to Sold and makes the property inactive.

**Why it exists:** Dialog text: "Capital gain (LTCG with CII indexation under section 112) will be computed automatically. Status will flip to SOLD; the row stays for tax records."

**Where to find it:** Property page → **Mark sold** (dialog "Mark "<name>" as sold").

**Who can use it:** All plans; not offered once sold.

**Steps**
1. Click **Mark sold**.
2. Enter **Sale date ***, **Sale price (₹) *** and optionally **Sale brokerage (₹)**.
3. Click **Mark sold**. "Marked as sold" appears; the page shows the Sale and Capital gain sections.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | While saving |
| **Mark sold** | Button | Save | While saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Sale date * | Date | Yes | YYYY-MM-DD | Empty | "Sale date and price required" |
| Sale price (₹) * | Text | Yes | Non-negative decimal | Empty | "Sale date and price required" / "Validation failed" |
| Sale brokerage (₹) | Text | No | Non-negative decimal | Empty | "Validation failed" |

**Settings and toggles here:** S-REST-002 Status becomes Sold.

**Results:** Status Sold, inactive; excluded from value totals and alerts; **Make rental**, **Refresh value** and **Mark sold** disappear.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to mark sold" | Server error | Retry |

**Limitations:** There is no "undo sale" button; editing Status back in the form changes the label but leaves the property inactive and keeps the sale fields.

**How it works:** `POST /api/real-estate/properties/:id/mark-sold` sets sale date/price/brokerage, status SOLD and isActive false.

**Related features:** F-REST-008, F-REST-005.

**Sources:** `apps/web/src/pages/realEstate/MarkSoldDialog.tsx:24`, `apps/web/src/pages/realEstate/MarkSoldDialog.tsx:48`, `packages/api/src/schemas/realEstate.schema.ts:86`, `packages/api/src/services/realEstate/realEstate.service.ts:308`

### Capital gain on sale <!-- F-REST-008 -->
**What it does:** For a sold property, shows sale price, net proceeds ("after brokerage"), total cost basis, holding period in months (long-term over 24 months, otherwise short-term), owner's share, and the gain and estimated tax under the applicable regime.

**Why it exists:** Code comment: property is "land or building" under section 112, with different rates depending on sale and purchase dates (Finance (No. 2) Act 2024).

**Where to find it:** Property page → **Capital gain (section 112)** (sold properties only).

**Who can use it:** All plans.

**Steps:** Not applicable — view only. "Computing…" shows while loading; "Capital gain unavailable — sale or purchase data missing." if purchase date, sale date or sale price is missing.

**Controls:** None.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Capital gain unavailable — sale or purchase data missing." | No purchase date | Edit the property and add **Purchase date** |
| "The indexed figure can't be computed: no Cost Inflation Index for FY …" | Purchase before FY 2001-02, or the sale year's index is not in the app yet | Use the non-indexed figure or compute manually |

**Limitations:** Estimates only — surcharge, cess, exemptions (e.g. sections 54/54F) and your slab are not applied; the short-term figure is a 30% top-bracket estimate. Purchases before FY 2001-02 need the 1-Apr-2001 fair market value, which the app does not take. The Cost Inflation Index table ends at FY 2025-26 (376), so sales in FY 2026-27 show the unavailable notice.

**How it works:** `GET /api/real-estate/properties/:id/capital-gain`. Cost = purchase price + stamp duty + registration fee + brokerage + other costs. Net proceeds = sale price − sale brokerage. Long-term when the sale date is after purchase date + 24 months. Share = My share ÷ 100. Non-indexed gain = (net proceeds − cost) × share; tax = max(gain, 0) × 12.5% (long-term) or × 30% (short-term), rounded half-even to paise. Indexed cost = cost × CII(sale FY) ÷ CII(purchase FY) (base FY 2001-02 = 100); indexed gain = (net proceeds − indexed cost) × share; tax = max(gain, 0) × 20%. Regime: short-term; sold before 23-Jul-2024 → indexed 20% only ("Sold before 23-Jul-2024 — …"); bought before and sold on/after 23-Jul-2024 → choice, shown as "Option A — Indexed @ 20%" and "Option B — Non-indexed @ 12.5%" ("Pick whichever produces the lower tax…"); bought on/after 23-Jul-2024 → 12.5% only.

**Related features:** F-REST-007, F-REST-003.

**Sources:** `apps/web/src/pages/realEstate/CapitalGainPanel.tsx:10`, `packages/api/src/services/realEstate/propertyCapitalGain.ts:27`, `packages/api/src/services/realEstate/propertyCapitalGain.ts:71`, `packages/api/src/services/realEstate/propertyCapitalGain.ts:140`, `packages/shared/src/finance/cii.ts:17`, `packages/shared/src/finance/cii.ts:69`

### Make rental and Remove from rentals <!-- F-REST-009 -->
**What it does:** **Make rental** creates a matching Rental property (name, address, type, purchase date and price, current value, portfolio) linked to this owned property and sets its status to Rented out. **Remove from rentals** undoes that link and deletes the rental record, provided it has no tenancies or expenses.

**Why it exists:** Code comment: the owned property keeps the cost basis and sale view; the rental record owns income (tenancies, receipts).

**Where to find it:** Property page → **Make rental**; once linked, the banner "This property is also tracked in Rentals." with **Open rental record** and the undo icon (**Remove from rentals**).

**Who can use it:** All plans; not for sold properties.

**Steps**
1. Click **Make rental**. Toast ""<name>" added to Rentals" with **Undo** (8 seconds).
2. Click **Open rental record** to add tenancies (F-RENT-006).
3. To undo later, click the undo icon in the banner. "Removed from rentals" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Make rental** | Button | Create and link the rental record | Hidden when sold or linked; "Adding…" while running |
| **Undo** (toast) | Button | Same as Remove from rentals | Toast lasts 8 s |
| **Open rental record** | Link | `/rental/:id` | — |
| **Remove from rentals** (undo icon) | Button | Unlink and delete the rental record | Hidden when sold; while running |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Make rental: a new rental property (type mapped: Apartment/House/Villa/Under construction/Other → Residential; office/shop → Commercial; Plot/Agricultural → Land; Parking → Parking) and status Rented out. Remove: link cleared, status Rented out → Self-occupied (other statuses unchanged), rental record deleted. Photos of the two linked records appear in both galleries.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Undo failed" / "Internal server error" | The rental record already has tenancies or expenses (the server refuses but returns a generic error) | Delete the tenancies/expenses first, or keep the link |
| "Promote failed" | Server error | Retry |

**Limitations:** Making a rental twice returns the same link (idempotent). Edits on either side are not synced afterwards. The refusal message "Cannot unlink rental — tenancies or expenses already exist. Delete those first." is not shown in production (see DOCUMENTATION_GAPS F-REST-009), and tenancies cannot be deleted from the web app.

**How it works:** `POST /api/real-estate/properties/:id/promote-to-rental` and `POST …/unlink-rental`, each in one database transaction.

**Related features:** F-RENT-001, F-RENT-006, F-REST-010.

**Sources:** `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:72`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:81`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:174`, `packages/api/src/services/realEstate/realEstate.service.ts:359`, `packages/api/src/services/realEstate/realEstate.service.ts:372`, `packages/api/src/services/realEstate/realEstate.service.ts:413`

### Property photos <!-- F-REST-010 -->
**What it does:** Lets you add up to 20 photos per property, shows them as a mosaic (first five), opens a full-screen viewer, sets the cover photo used on list cards, and deletes photos. Works on both Real Estate and Rental property pages.

**Why it exists:** Code comment: "A property's photos: a catalogue-style mosaic, a full-screen viewer, and uploads (shrunk in the browser first)".

**Where to find it:** **Photos** section of a property page (`/real-estate/:id` or `/rental/:id`).

**Who can use it:** All plans, own properties.

**Steps**
1. With no photos, click "Add photos of this property" (or drag photos onto the section). With photos, click **Add photos**.
2. Progress shows "Adding N of M…"; then "Photo added" / "N photos added".
3. Click a tile or **Show all N photos** to open the viewer; use the arrows or ← / → keys.
4. In the viewer click **Make cover** to set the cover, or the delete icon → "Delete this photo?" → **Yes, delete**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add photos** | Button | File picker (images, multiple) | Disabled at 20 photos ("Up to 20 photos per property") or while uploading |
| **Show all N photos** | Button | Opens viewer | Shown with 2+ photos |
| **Make cover** / "Cover" | Button | Makes this the cover | Shows "Cover" when already cover |
| Delete photo (icon), **Yes, delete**, **Cancel** | Buttons | Delete with confirm | While busy |
| Previous / Next photo | Buttons | Navigate | — |
| Close | Button | Close viewer | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Photo file | Image | — | JPEG, PNG or WebP; resized in the browser to ≤1600 px (thumbnail ≤480 px); server limits 4 MB full, 512 KB thumbnail; 20 per property | — | "Skipped N file(s) that isn't/aren't a photo", "A property can have up to 20 photos", "<file>: Photos must be JPEG, PNG or WebP images", "<file>: That photo is too large — try a smaller one" |

**Settings and toggles here:** None.

**Results:** Photos are stored in the database, private to you; the first photo in order is the cover and drives list-card slideshows. "Cover photo set" / "Photo deleted" confirm actions.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "<file>: couldn't be added — try a JPEG or PNG" | Upload failed | Try a JPEG or PNG |
| "Could not set the cover photo" / "Could not delete the photo" | Server error | Retry |

**Limitations:** 20 photos per property; a Real Estate property linked to a Rental record shares one gallery (and one 20-photo limit) with it. No captions can be typed in the UI.

**How it works:** Upload sends the resized full image and thumbnail via `POST /api/property-photos` (multipart, ≤5 MB per part); the server sniffs the real image type, checks sizes and count, and appends it last. Photos are served from `GET /api/property-photos/:id/full|thumb` with a private one-year cache. **Make cover** moves the photo to the front of the order.

**Related features:** F-REST-001, F-RENT-001, F-REST-009.

**Sources:** `apps/web/src/components/property/PropertyGallery.tsx:12`, `apps/web/src/components/property/PropertyGallery.tsx:86`, `apps/web/src/components/property/PhotoLightbox.tsx:154`, `apps/web/src/components/property/PhotoLightbox.tsx:176`, `apps/web/src/lib/imageResize.ts:9`, `packages/api/src/services/realEstate/propertyPhotos.service.ts:18`, `packages/api/src/services/realEstate/propertyPhotos.service.ts:78`, `packages/api/src/services/realEstate/propertyPhotos.service.ts:120`, `packages/api/src/controllers/propertyMedia.controller.ts:30`

### Property location pin <!-- F-REST-011 -->
**What it does:** Shows the property's address beside a map with its pin. The pin is looked up once from the address; you can place it, drag it, or put it back to the address.

**Why it exists:** Code comment: "Where a property is: its address beside a map with its pin."

**Where to find it:** **Location** section on a Real Estate or Rental property page.

**Who can use it:** All plans.

**Steps**
1. Read the status: "Found from the address", "Approximate — the area, not the exact building", "Pinned by you", "Couldn't find this address on the map — place the pin yourself", or "Add an address, or place the pin yourself".
2. Click **Place pin** (no pin) or **Adjust pin**; the note "Drag the pin, or click the map where the property is." appears. Drag or click; "Pin saved".
3. Click **Done** to stop editing. **Use the address** (only for a hand-placed pin) re-looks up the address ("Pin moved back to the address" or "Pin removed"). **Open map** opens the location on openstreetmap.org.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Place pin** / **Adjust pin** / **Done** | Toggle button | Edit mode | Disabled while loading |
| **Use the address** | Button | Reset to the address lookup | Only for hand-placed pins |
| **Open map** | External link | openstreetmap.org at zoom 17 | Only when there is a pin |

**Fields and rules:** Latitude −90 to 90, longitude −180 to 180 (server): "Latitude must be between -90 and 90" / "Longitude must be between -180 and 180".

**Settings and toggles here:** S-REST-005 hand-placed pin ("Pinned by you") — kept until you click **Use the address**.

**Results:** The pin is stored on the property and used by the map view (F-REST-002).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save the pin" / "Could not reset the pin" | Server error | Retry |
| No pin after adding an address | Lookup failed or found nothing | Place the pin by hand |

**Limitations:** The address text is sent to OpenStreetMap Nominatim, a third-party service. A failed lookup is retried on the next view; a lookup that found nothing is not retried until the address changes.

**How it works:** `GET /api/property-locations/:ownerType/:id` looks the address up only if it changed since the last lookup and no hand-placed pin exists; it tries up to 4 progressively broader parts of the address — the first (full) match is "geocoded", a broader match is "approximate". `PUT` stores a manual pin; `DELETE` clears it and immediately looks the address up again.

**Related features:** F-REST-002, F-REST-005, F-RENT-005.

**Sources:** `apps/web/src/components/property/PropertyLocationCard.tsx:11`, `apps/web/src/components/property/PropertyLocationCard.tsx:22`, `apps/web/src/components/property/PropertyLocationCard.tsx:113`, `packages/api/src/controllers/propertyMedia.controller.ts:145`, `packages/api/src/services/realEstate/propertyLocation.service.ts:54`, `packages/api/src/services/realEstate/propertyLocation.service.ts:155`, `packages/api/src/services/realEstate/propertyLocation.service.ts:159`

### Real estate alerts <!-- F-REST-012 -->
**What it does:** Creates alerts 30, 15, 7 and 1 day(s) before: the property-tax due date (1st of the chosen **Tax due month**), the expected possession date of an under-construction property, and the next premium of an insurance policy linked to the property.

**Why it exists:** Code comment: three classes of real-estate reminders.

**Where to find it:** Alerts (D-REST-002). Examples: "Property tax due in 7 days — <name>" ("₹<amount> property tax due on <date>"), "Possession in 30 days — <name>", "Insurance renewal in 15 days — <name>".

**Who can use it:** Every user with active, unsold properties.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** S-REST-004 **Tax due month** — without it no property-tax alert is made.

**Results:** Alerts of types property tax due, possession due and insurance premium, de-duplicated per property, date and threshold.

**Errors and troubleshooting:** None.

**Limitations:** Exact-day thresholds only (a missed scan day skips that reminder). The insurance alert needs a linked policy, which cannot be set in the UI (F-REST-013). Sold or inactive properties are skipped.

**How it works:** Run by the daily alert job at 20:45 IST per user and by the Alerts page scan. Due date for tax = 1st of the due month this year if that month has not passed, else next year; days = rounded days from today (UTC midnight).

**Related features:** F-REST-003, F-REST-013, D-REST-002.

**Sources:** `packages/api/src/services/realEstate/realEstateAlerts.ts:17`, `packages/api/src/services/realEstate/realEstateAlerts.ts:23`, `packages/api/src/services/realEstate/realEstateAlerts.ts:66`, `packages/api/src/services/realEstate/realEstateAlerts.ts:110`, `packages/api/src/services/realEstate/realEstateAlerts.ts:148`, `packages/api/src/services/notifications/alerts.service.ts:358`

### Linked loan and insurance records <!-- F-REST-013 -->
**What it does:** On the property page, **Linked records** shows links "Linked loan", "Linked insurance" and "Rented out (rental record)" when the property carries those links.

**Why it exists:** Inferred from behavior: connect a home loan and home insurance to the property.

**Where to find it:** Property page → **Linked records** (only when a link exists).

**Who can use it:** All plans.

**Steps**
1. Click a link to open the loan (`/loans/:id`), policy (`/insurance/:id`) or rental record.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Linked loan** / **Linked insurance** / **Rented out (rental record)** | Links | Open the record | Hidden when not linked |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** None — navigation only.

**Errors and troubleshooting:** None.

**Limitations:** Partial: only the rental link can be created in the app (F-REST-009). There is no picker for a loan or insurance policy; those links exist only if set through the API.

**How it works:** The property carries optional loan, insurance-policy and rental-property ids; the edit form re-sends whatever ids are stored, so it keeps but never sets them.

**Related features:** F-REST-009, F-REST-012, D-REST-005.

**Sources:** `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:387`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:103`, `packages/api/src/services/realEstate/realEstate.service.ts:246`

### What this area doesn't do
- No automatic market valuation of property; the current value is whatever you enter.
- No history of past current values.
- You can't link a home loan or insurance policy to a property in the app.
- You can't undo a sale with one click.
- Capital gain does not apply exemptions (sections 54/54EC/54F), surcharge or cess, and does not file anything.
- Delete is only available from the list page.

## Rental

Rental tracks property you let out: tenancies, a monthly rent schedule, payments received, skipped months, a per-tenant running ledger ("khata"), property expenses, this financial year's rental profit and loss, and tenant reminders by WhatsApp link, email or SMS. It is reached from **Asset Classes → Rental** (`/rental`). No plan is required. Rental records can also be created from a Real Estate property (F-REST-009).

### Rental properties list <!-- F-RENT-001 -->
**What it does:** The **Properties** tab lists rental properties as ticket-style cards: type band (Residential, Commercial, Land, Parking) with a short reference "№ <last 8 of id>" and "Next · <date>" of the next expected rent, name and address, active tenant and **Monthly rent**, an occupancy stamp (**OCCUPIED**, **VACANT**, **OVERDUE**), and a "Last 12 months" strip of coloured cells. Above the cards: tiles **Active tenancies**, **Monthly income**, **Overdue receipts**, and the pending reminders panel (F-RENT-016).

**Why it exists:** Page subtitle: "Track properties, tenancies, rent receipts, and expenses".

**Where to find it:** **Asset Classes → Rental** (route `/rental`), tab **Properties**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. R-MANAGER sees the managed person's rentals. Family view does not add other members' rentals.

**Steps**
1. Open the page. With none: "No rental properties yet" — "Add a property, set up a tenancy, and let EveryPaisa track rent receipts automatically." and **Add your first property**.
2. Click a card to open it (F-RENT-005). Hover to reveal **Edit** (pencil) and **Delete** (trash).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Properties** / **Collections** | Tabs | Switch tab (F-RENT-004) | — |
| **Download** (report button) | Button | Rental report (D-RENT-001) | — |
| **Add property** / **Add your first property** | Button | F-RENT-002 | — |
| **Grid** / **Map** | Toggle | F-REST-002 | Hidden with no properties |
| Pencil (title "Edit") / Trash (title "Delete") | Icon buttons | F-RENT-002 / F-RENT-003 | Shown on hover |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-RENT-001 **Grid / Map** view (remembered on this device).

**Results:** None — view only.

**Errors and troubleshooting:** None specific.

**Limitations:** **Monthly income** sums the rent of every active tenancy, not money received. The 12-month strip shows the last 12 calendar months by browser time: green Received, amber Partial, red Overdue, outlined Expected, grey Skipped, faint = no record.

**How it works:** `GET /api/rental/properties` returns properties (active first, then by name) with tenancies (active first, newest start first) and all their rent receipts. OVERDUE stamp = any receipt overdue; OCCUPIED = an active tenancy; else VACANT.

**Related features:** F-RENT-002 to F-RENT-005, F-RENT-016, F-REST-002, F-REST-010.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:670`, `apps/web/src/pages/rental/RentalListPage.tsx:110`, `apps/web/src/pages/rental/RentalListPage.tsx:128`, `apps/web/src/pages/rental/RentalListPage.tsx:329`, `apps/web/src/pages/rental/RentalListPage.tsx:517`, `packages/api/src/services/rental/rental.service.ts:213`

### Add or edit a rental property <!-- F-RENT-002 -->
**What it does:** A short dialog ("Add property" / "Edit property") for name, type, address, purchase date, purchase price and current value.

**Why it exists:** Inferred from behavior: the container for tenancies and expenses.

**Where to find it:** **Asset Classes → Rental → Add property**; pencil on a card.

**Who can use it:** All plans.

**Steps**
1. Click **Add property**. Enter **Name *** (placeholder "Andheri East flat") and choose **Type**.
2. Optionally fill **Address**, **Purchase date**, **Purchase price (₹)**, **Current value (₹)**.
3. Click **Save** (or **Save changes**). The dialog closes; the list refreshes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | — |
| **Save** / **Save changes** | Button | Save ("Saving…") | While saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Name * | Text | Yes | 1–200 | Empty | "Required" |
| Type | Select: Residential, Commercial, Land, Parking | Yes | — | Residential | — |
| Address | Text | No | ≤1000 | Empty | — |
| Purchase date | Date | No | YYYY-MM-DD | Empty | — |
| Purchase price (₹), Current value (₹) | Text | No | Decimal string | Empty | Raw request error text (see Limitations) |

**Settings and toggles here:** None.

**Results:** The property is created/updated. No success toast is shown.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Request failed with status code 422" (red text in the dialog) | A value failed validation (e.g. commas in a number) | Enter plain digits |
| "portfolioId does not belong to user" | — | Not reachable from this dialog |

**Limitations:** Errors show the raw request message rather than the server's explanation. Landlord name and payment instructions (used in reminders) and portfolio cannot be set here (F-RENT-021). Rent tracking is per tenancy, not per property.

**How it works:** `POST /api/rental/properties` / `PATCH /api/rental/properties/:id`; the server trims the name and stores money as decimals.

**Related features:** F-RENT-001, F-RENT-006, F-RENT-021.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:172`, `apps/web/src/pages/rental/RentalListPage.tsx:225`, `apps/web/src/pages/rental/RentalListPage.tsx:309`, `packages/api/src/controllers/rental.controller.ts:31`, `packages/api/src/services/rental/rental.service.ts:249`, `packages/api/src/services/rental/rental.service.ts:286`

### Delete a rental property <!-- F-RENT-003 -->
**What it does:** Deletes a rental property and everything under it.

**Why it exists:** Inferred from behavior: remove properties no longer held.

**Where to find it:** Trash icon on a card at **Asset Classes → Rental**.

**Who can use it:** All plans.

**Steps**
1. Click the trash icon. The card shows "Delete "<name>"?".
2. Click **Yes, delete** (or **Cancel**). "Property deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Yes, delete** / **Cancel** | Buttons | Confirm / abort | While deleting |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** The property, its tenancies, rent schedule, khata entries, expenses, reminders and photos are deleted. A linked Real Estate property loses its rental link but keeps the status Rented out.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to delete property" | Server error | Retry |

**Limitations:** No undo. Cash-flow entries created when rent was recorded are not deleted with the property (see DOCUMENTATION_GAPS F-RENT-003) and remain in Cash Activity.

**How it works:** `DELETE /api/rental/properties/:id`; the database cascades through tenancies → receipts, ledger entries, reminders, and expenses.

**Related features:** F-RENT-001, F-REST-009.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:686`, `apps/web/src/pages/rental/RentalListPage.tsx:776`, `packages/api/src/services/rental/rental.service.ts:324`, `packages/api/prisma/schema.prisma:2157`, `packages/api/prisma/schema.prisma:2239`

### Collections <!-- F-RENT-004 -->
**What it does:** Lists every active tenant who owes money, highest balance first, with property name, "Oldest pending: YYYY-MM" and a **Remind** button.

**Why it exists:** Inferred from behavior: one list of who to chase.

**Where to find it:** **Asset Classes → Rental → Collections** tab.

**Who can use it:** All plans.

**Steps**
1. Open **Collections**. With nobody owing: "All rent collected" — "No tenant has an outstanding balance right now."
2. Click a tenant name to open the khata (F-RENT-012), or **Remind** (F-RENT-015).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Tenant name | Link | `/rental/tenancies/:id` | — |
| **Remind** | Button | Opens WhatsApp with a reminder | Disabled when the tenant has no phone |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add a phone number for this tenant first" | Phone not usable for WhatsApp | Add the tenant phone (F-RENT-016 **Edit contact**) |
| "Failed to prepare reminder link" | Server error | Retry |

**Limitations:** Only active tenancies with a balance above zero appear.

**How it works:** `GET /api/rental/collections`: active tenancies with balance due > 0, ordered by balance; oldest unpaid = earliest-due receipt that is Expected, Overdue or Partial and not skipped.

**Related features:** F-RENT-012, F-RENT-015.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:570`, `apps/web/src/pages/rental/RentalListPage.tsx:629`, `packages/api/src/services/rental/rentalLedger.service.ts:593`

### Rental property detail and this financial year <!-- F-RENT-005 -->
**What it does:** Shows a rental property: name, type · address, **Add expense** and **Add tenancy**, the **Photos** gallery, "This financial year" tiles (rent received with payment count, expenses total with item count, **Net P&L** "Rent − expenses"), **Tenancies**, **Expenses**, **Location** and **Documents** ("Agreements & receipts").

**Why it exists:** Inferred from behavior: one page per let property with its income view.

**Where to find it:** **Asset Classes → Rental** → click a card (route `/rental/:id`).

**Who can use it:** All plans.

**Steps**
1. Open a property; with no tenancies you see "No tenancies yet. Add one to start tracking rent receipts."
2. Use the back arrow to return.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add expense** | Button | F-RENT-011 | — |
| **Add tenancy** / **Add one** | Button | F-RENT-006 | — |
| Back arrow | Link | `/rental` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Property not found. Go back" | Missing or not yours | Return to the list |

**Limitations:** The financial year shown is always the current one (April–March by browser date); there is no year picker. Rent received counts only khata payments (not discounts or deposits).

**How it works:** `GET /api/rental/properties/:id` and `GET /api/rental/properties/:id/pnl?from=YYYY-04-01&to=YYYY+1-03-31`: rent received = sum of PAYMENT entries dated in the window; expenses = sum of expenses paid in the window; net = rent − expenses (2 decimals); the counts are numbers of payments and expenses.

**Related features:** F-RENT-006, F-RENT-007, F-RENT-011, F-REST-010, F-REST-011, D-REST-003.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:915`, `apps/web/src/pages/rental/RentalDetailPage.tsx:981`, `apps/web/src/pages/rental/RentalDetailPage.tsx:1007`, `packages/api/src/services/rental/rental.service.ts:231`, `packages/api/src/services/rental/rental.service.ts:920`

### Add a tenancy <!-- F-RENT-006 -->
**What it does:** Records a tenant and lease terms and generates the monthly rent schedule; a security deposit is entered into the tenant's khata.

**Why it exists:** Inferred from behavior: a rent schedule to compare payments against.

**Where to find it:** Rental property page → **Add tenancy** (dialog "Add tenancy").

**Who can use it:** All plans.

**Steps**
1. Click **Add tenancy**.
2. Fill **Tenant name ***, **Start date ***, **Monthly rent (₹) *** and optionally **Tenant email** ("Used for rent reminders"), **Tenant phone** ("10-digit, used for SMS reminders"), **Other contact (optional)**, **End date**, **Due day of month**, **Security deposit (₹)**, **Rent credited to**.
3. Click **Add tenancy**. The tenancy appears with its rent receipts.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | — |
| **Add tenancy** | Button | Save ("Saving…") | While saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Tenant name * | Text | Yes | 1–200 | — | "Required" |
| Tenant email | Email | No | ≤200 (format not checked by server) | — | — |
| Tenant phone | Phone | No | ≤50 | — | — |
| Other contact (optional) | Text | No | ≤200 | — | — |
| Start date * | Date | Yes | YYYY-MM-DD | — | red outline |
| End date | Date | No | Not before start | — | "endDate cannot be before startDate" (shown as raw request error) |
| Monthly rent (₹) * | Text | Yes | Decimal > 0 | — | "Required"; server "monthlyRent must be positive" |
| Due day of month | Number | No | 1–31 | 1 | server "rentDueDay must be between 1 and 31" |
| Security deposit (₹) | Text | No | Decimal | — | — |
| Rent credited to | Select (your open bank accounts) or "Not tracked" | No | Must be your account | Not tracked | "That bank account does not belong to you" |

**Settings and toggles here:** S-RENT-004 **Due day of month**; S-RENT-002 **Rent credited to**.

**Results:** One rent receipt per month from the start month to the end month (or 12 months when there is no end date). Receipts due 7 or more days ago are created as Overdue at once; others as Expected. A deposit creates a "Security deposit" entry in the khata (it does not reduce rent owed). Tenant email, phone and other contact are stored encrypted.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Request failed with status code 400/422" | Validation failed (rent ≤ 0, end before start, bad number) | Correct the field |
| "Cannot create tenancy on inactive property" | Property set inactive via API | — |

**Limitations:** Errors show raw request text. Once created, the rent, end date, due day and active flag cannot be changed in the web app, and a tenancy cannot be ended or deleted there (F-RENT-020); only the tenant's email/phone (F-RENT-016) and rent account (F-RENT-013) can be edited. Without an end date only 12 months are generated; no later months are added automatically.

**How it works:** `POST /api/rental/properties/:id/tenancies` in one transaction: tenancy, receipts (unique per tenancy and month; due day clamped to the month's last day, e.g. 31 → 28/29 February), optional DEPOSIT entry, then ledger recompute.

**Related features:** F-RENT-007, F-RENT-012, F-RENT-013, F-RENT-020.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:625`, `apps/web/src/pages/rental/RentalDetailPage.tsx:657`, `packages/api/src/controllers/rental.controller.ts:58`, `packages/api/src/services/rental/rental.service.ts:178`, `packages/api/src/services/rental/rental.service.ts:188`, `packages/api/src/services/rental/rental.service.ts:339`, `packages/api/src/services/rental/rental.service.ts:392`

### Tenancy cards and rent receipts <!-- F-RENT-007 -->
**What it does:** Each tenancy shows initials, name, **Active**/**Ended**, "N overdue", monthly rent, start → end month, "received/total collected" and **Total received**. Expanded, it shows tiles **Collection** (percentage and progress bar), **Received**, **Expected**, **Overdue** (or **Skipped**) and a table: Month, Expected, Received ("short by ₹…", "auto-matched"), Due (date and weekday), Status, Actions.

**Why it exists:** Inferred from behavior: month-by-month view of what was expected and what came in.

**Where to find it:** Rental property page → **Tenancies**.

**Who can use it:** All plans.

**Steps**
1. Click the chevron to expand/collapse (active tenancies start expanded).
2. Click the tenant name to open the khata (F-RENT-012).
3. Use row actions (F-RENT-008, F-RENT-009, F-RENT-010).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Tenant name | Link | Khata | — |
| Chevron | Toggle | Expand/collapse | — |
| **Received**, **Skip** | Row buttons | F-RENT-008 / F-RENT-009 | Only for Expected or Overdue rows |
| **Undo** | Row button | Undo auto-match / mark-received / skip | Depends on row state |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting:** None specific.

**Limitations:** Collection % = total received ÷ total expected of all receipts including future months, so it is low early in a lease. Tone: ≥90% green, ≥60% neutral, else amber.

**How it works:** Status is derived from the khata, not typed: Skipped if skipped; Received if money allocated ≥ expected; Partial if some; otherwise Overdue when the due date is 7 or more days ago (at or before today − 7 days, UTC), else Expected. Money is allocated by the rules in F-RENT-012.

**Related features:** F-RENT-008 to F-RENT-012.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:399`, `apps/web/src/pages/rental/RentalDetailPage.tsx:223`, `apps/web/src/pages/rental/RentalDetailPage.tsx:56`, `packages/api/src/services/rental/rentalLedgerMath.ts:159`, `packages/api/src/services/rental/rentalLedger.service.ts:54`

### Mark rent received <!-- F-RENT-008 -->
**What it does:** Records a rent payment against a month: adds a payment to the khata, creates a cash inflow, and updates the month's status (Received or Partial).

**Why it exists:** Inferred from behavior: record money the tenant paid.

**Where to find it:** Rental property page → tenancy table → **Received** on an Expected or Overdue month (dialog "Mark as received — YYYY-MM").

**Who can use it:** All plans.

**Steps**
1. Click **Received**. **Amount received (₹)** is pre-filled with the expected rent; **Date received** with today.
2. Adjust and optionally add **Notes (optional)**. Click **Mark received**.
3. If the same amount for the same month on the same day already exists, the dialog shows "This rent is already on the khata" with the server message; click **Record it anyway** only for a genuine second payment.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | — |
| **Mark received** | Button | Save | While saving |
| **Record it anyway** | Button | Save despite duplicate | Shown only after the duplicate warning |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Amount received (₹) | Text | Yes | Decimal > 0 | Expected rent | "receivedAmount must be positive" / "Could not record the payment" |
| Date received | Date | Yes | YYYY-MM-DD | Today | — |
| Notes (optional) | Text | No | ≤2000 | — | — |

**Settings and toggles here:** S-RENT-002 — when the tenancy has **Rent credited to** set, the inflow carries that bank account.

**Results:** A PAYMENT khata entry pinned to that month; a cash inflow "Rent received — <property> / <tenant> (<month>)" in the property's portfolio (or your default/first portfolio; none if you have no portfolio). Overpayment spills to the oldest unpaid month, then becomes an advance. Pending reminders for a now-settled month are superseded and its overdue alert removed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "A rent payment of N for YYYY-MM is already recorded on YYYY-MM-DD. Record it again only if a second payment really came in that day." | Duplicate guard | **Record it anyway** or **Cancel** |

**Limitations:** Partial payments are recorded by entering a smaller amount; each call adds a new payment.

**How it works:** `POST /api/rental/receipts/:id/mark-received` (duplicate check → 409 DUPLICATE_RENT_PAYMENT unless allowDuplicate) then, in one transaction: cash flow, ledger entry, optional receipt note, ledger recompute (locks the tenancy row to serialise concurrent recomputes).

**Related features:** F-RENT-009, F-RENT-012, F-RENT-013, D-RENT-002.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:102`, `apps/web/src/pages/rental/RentalDetailPage.tsx:169`, `packages/api/src/services/rental/rental.service.ts:702`, `packages/api/src/services/rental/rental.service.ts:729`, `packages/api/src/services/rental/rentalLedger.service.ts:325`, `packages/api/src/services/rental/rentalLedger.service.ts:65`

### Skip a month and undo actions <!-- F-RENT-009 -->
**What it does:** **Skip** marks a month as not owed (e.g. rent-free month). **Undo** reverses a skip, or removes the payments recorded for a month via **Received**.

**Why it exists:** Inferred from behavior: correct the schedule and fix mistaken entries.

**Where to find it:** Rental property page → tenancy table row actions.

**Who can use it:** All plans.

**Steps**
1. On an Expected or Overdue month click **Skip**. The row becomes Skipped.
2. On a Skipped month click **Undo** (title "Undo skip").
3. On a Received or Partial month that was not auto-matched click **Undo** (title "Undo mark-received (also deletes cashflow)").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Skip** | Button | Skip month | Only Expected/Overdue |
| **Undo** (skip) | Button | Unskip | Only Skipped |
| **Undo** (received) | Button | Remove payments pinned to this month | Only Received/Partial without auto-match |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Skip removes the month's rent from the amount owed and supersedes its pending reminders. Undo-received deletes every payment pinned to that month and their cash inflows, then re-derives statuses.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| (no message shown) Skip does nothing | "Cannot skip a receipt with payments against it — remove the payment from the khata first" | Remove the payment first |
| (no message shown) Undo does nothing | "No payment is pinned to this month — remove the payment from the khata instead" | Delete the entry in the khata (F-RENT-012) |

**Limitations:** These buttons show no success or error toast; a refused action simply leaves the row unchanged. A payment that reached a month only by spill-over from another payment cannot be undone here.

**How it works:** `POST /api/rental/receipts/:id/skip`, `/unskip`, `/unmark-received`; each recomputes the tenancy ledger.

**Related features:** F-RENT-008, F-RENT-012.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:231`, `apps/web/src/pages/rental/RentalDetailPage.tsx:310`, `packages/api/src/services/rental/rental.service.ts:781`, `packages/api/src/services/rental/rental.service.ts:803`, `packages/api/src/services/rental/rental.service.ts:822`

### Bank-credit auto-match <!-- F-RENT-010 -->
**What it does:** When an imported UPI or NEFT credit (from bank alerts) is turned into a cash inflow, the app looks for a matching rent month and, if exactly one fits, records it as a payment marked "auto-matched". **Undo** removes the match.

**Why it exists:** Code comment §8.2: mark rent received automatically from bank credits.

**Where to find it:** Automatic; matched months show "auto-matched" and **Undo** on the rental property page.

**Who can use it:** Users whose bank alerts are imported (D-RENT-003).

**Steps**
1. Nothing to do; matched months turn Received/Partial.
2. If the match is wrong, click **Undo** (title "Undo auto-match") on that month.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Undo** | Button | Undo auto-match | Only on auto-matched rows |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** A PAYMENT entry "Auto-matched from bank credit" linked to the bank credit; the receipt shows "auto-matched".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A rent credit was not matched | No single month fits (amount, date or name) | Use **Received** manually |

**Limitations:** Match rules: amount within ±₹10 of the expected rent, due date within ±5 days of the credit date, and (when the credit names a sender) name similarity ≥ 0.5 with the tenant name; month must be Expected or Overdue; two or more candidates → no match. Undo also deletes the bank credit's own cash-flow entry (see DOCUMENTATION_GAPS F-RENT-010). An undone credit is not matched again automatically.

**How it works:** Called from the import projection after an inbound UPI_CREDIT/NEFT_CREDIT cash flow is created; failures are logged and never block the import. `POST /api/rental/receipts/:id/undo-auto-match` deletes ledger entries for that month carrying an event id and their cash flows, then recomputes.

**Related features:** F-RENT-008, F-RENT-007, D-RENT-003.

**Sources:** `packages/api/src/ingestion/projection.ts:312`, `packages/api/src/services/rental/rental.service.ts:975`, `packages/api/src/services/rental/rental.service.ts:1033`, `packages/api/src/services/rental/rental.service.ts:1093`, `packages/api/src/services/rental/rental.service.ts:1186`, `apps/web/src/pages/rental/RentalDetailPage.tsx:335`

### Property expenses <!-- F-RENT-011 -->
**What it does:** Records costs of a rental property (Property Tax, Maintenance, Repairs, Utilities, Agent Fee, Legal, Other) and lists them (Date, Type, Description, Amount) for the P&L.

**Why it exists:** Inferred from behavior: net rental income = rent − expenses.

**Where to find it:** Rental property page → **Add expense**; **Expenses** section.

**Who can use it:** All plans.

**Steps**
1. Click **Add expense** (dialog "Add expense"). Choose **Type**, enter **Amount (₹)**, **Date** (default today), **Description**.
2. Click **Add expense**. It appears in the list and the P&L.
3. To remove, hover the row and click the trash icon (no confirmation).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add expense** | Button | Save ("Saving…") | While saving |
| **Cancel** | Button | Close | — |
| Trash icon | Button | Deletes immediately | Visible on hover |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Type | Select | Yes | One of the seven types | Maintenance | — |
| Amount (₹) | Text | Yes | Decimal > 0 | Empty | raw request error ("amount must be positive" on server) |
| Date | Date | Yes | YYYY-MM-DD | Today | — |
| Description | Text | No | ≤2000 | — | — |

**Settings and toggles here:** None.

**Results:** Expense saved; FY P&L updates. Expenses do not create cash-flow entries.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Request failed with status code 422" | Empty or invalid amount | Enter a positive number |

**Limitations:** Expenses cannot be edited, only deleted and re-added; delete has no confirmation and no undo.

**How it works:** `POST /api/rental/properties/:id/expenses`, `DELETE /api/rental/expenses/:id` (ownership checked through the property).

**Related features:** F-RENT-005.

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:802`, `apps/web/src/pages/rental/RentalDetailPage.tsx:821`, `apps/web/src/pages/rental/RentalDetailPage.tsx:1137`, `packages/api/src/services/rental/rental.service.ts:871`, `packages/api/src/services/rental/rental.service.ts:897`

### Tenant khata (ledger) <!-- F-RENT-012 -->
**What it does:** A running account per tenancy: a big balance ("To collect", "In advance" or "Settled up"), "Deposit held", the **Rent credited to** picker, and a table of every rent charge and entry with columns Date, **You gave**, **You got**, **Balance** (on phones one "Gave / got" column). Buttons **You gave** and **You got** add entries.

**Why it exists:** Code comments: "You gave" = a charge against the tenant, "You got" = money in — a familiar khata (ledger) model.

**Where to find it:** Tenant name on the rental property page or in **Collections** (route `/rental/tenancies/:tenancyId`, page title "Tenant khata" while loading).

**Who can use it:** All plans.

**Steps**
1. Click **You got** (payment, discount, deposit) or **You gave** (late fee, other charge, deposit refund).
2. Enter **Amount (₹) ***, **Date**, **Type**, optionally **Apply to month — leave blank to settle oldest first** and **Note**. Click **Save**. "Entry added".
3. To delete an entry, click its trash icon → "Delete this <type> of ₹… on <date>?" → **Yes, delete**. Rent rows cannot be deleted.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **You gave** / **You got** | Buttons | Open the entry dialog | — |
| **Save** / **Cancel** | Buttons | Save / close | Save disabled while saving |
| Trash (title "Delete entry"), **Yes, delete**, **Cancel** | Buttons | Delete with confirm | Not on rent rows |
| **Remind** | Button | F-RENT-015 | While running |
| **Share statement** | Button | F-RENT-014 | While running |
| Back arrow | Link | Rental property page | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Amount (₹) * | Decimal text | Yes | > 0 | Empty | "Enter a valid amount" |
| Date | Date | Yes | YYYY-MM-DD | Today | — |
| Type | Select | Yes | You got: Payment, Discount, Deposit · You gave: Late fee, Other charge, Deposit refund | Payment / Late fee | — |
| Apply to month | Select (rent months) | No | YYYY-MM or "Settle oldest first" | Settle oldest first | — |
| Note | Text | No | ≤2000 | — | — |

**Settings and toggles here:** S-RENT-005 **Apply to month** — blank settles the oldest open charge first; a month pins the credit to that month first. S-RENT-002 **Rent credited to**.

**Results:** Payment, Deposit and Deposit refund create a cash-flow entry (inflow, inflow, outflow) in the property's portfolio (or default/first portfolio); Discount, Late fee and Other charge do not. Balance and all month statuses are recomputed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Enter a valid amount" | Empty, zero or non-numeric | Enter a positive amount |
| "Request failed with status code …" | Server refused | Check the values |
| "Tenancy not found" — "This tenancy may have been removed." | Bad link | Go back |

**Limitations:** Entries cannot be edited in the app (delete and re-add). Deleting a payment also deletes its cash-flow entry, irreversibly.

**How it works:** Charges = rent receipts (not skipped) + late fees + other charges; credits = payments + discounts. Each credit first fills its pinned month (if any room), then the oldest charge by due date (rent before fees on the same date); leftovers are an advance. Balance = total charges − total credits. Deposit held = deposits − deposit refunds, kept outside the balance. Running balance in the table goes oldest to newest and skips deposit rows; rows are shown newest first. Endpoints: `GET /api/rental/tenancies/:id/ledger`, `POST /api/rental/tenancies/:id/entries`, `DELETE /api/rental/entries/:id`.

**Related features:** F-RENT-008, F-RENT-013, F-RENT-014, F-RENT-015, D-RENT-002.

**Sources:** `apps/web/src/pages/rental/TenantKhataPage.tsx:35`, `apps/web/src/pages/rental/TenantKhataPage.tsx:72`, `apps/web/src/pages/rental/TenantKhataPage.tsx:309`, `apps/web/src/pages/rental/TenantKhataPage.tsx:407`, `packages/api/src/services/rental/rentalLedger.service.ts:37`, `packages/api/src/services/rental/rentalLedger.service.ts:258`, `packages/api/src/services/rental/rentalLedger.service.ts:342`, `packages/api/src/services/rental/rentalLedger.service.ts:481`, `packages/api/src/services/rental/rentalLedgerMath.ts:1`

### Rent credited to <!-- F-RENT-013 -->
**What it does:** Chooses which of your bank accounts a tenant's rent lands in.

**Why it exists:** Component comment: it turns a rent receipt into money moving through a named bank, in the app's cash flow and in the Tally export.

**Where to find it:** **Add tenancy** dialog, and the khata page under the balance.

**Who can use it:** All plans.

**Steps**
1. Pick an account (shown as nickname or "<bank> <type> ••<last4>") or **Not tracked**. On the khata page it saves immediately: "Rent account updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Rent credited to** | Select | Sets the account | Disabled while accounts load |

**Fields and rules:** Only your own non-closed accounts are listed; others are refused with "That bank account does not belong to you".

**Settings and toggles here:** S-RENT-002 (this control).

**Results:** Later rent cash-flow entries carry the account. Help text: "Rent then shows as a credit to this account, here and in the Tally export." or, with no accounts, "Add a bank account first to track where this rent lands."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not update the rent account" / raw request error | Server refused | Pick another account |

**Limitations:** Changing the account does not re-tag earlier entries. Auto-matched credits keep the bank credit's own account.

**How it works:** `PATCH /api/rental/tenancies/:id` with the account id; closing the bank account later sets the link to empty.

**Related features:** F-RENT-006, F-RENT-008, F-RENT-012, D-RENT-004.

**Sources:** `apps/web/src/components/rental/RentAccountPicker.tsx:12`, `apps/web/src/pages/rental/TenantKhataPage.tsx:337`, `packages/api/src/services/rental/rental.service.ts:379`, `packages/api/prisma/schema.prisma:2181`

### Share statement <!-- F-RENT-014 -->
**What it does:** Downloads a PDF "Rent statement — <tenant>" with the period, a table (Date, Details, Charged, Paid, Balance) oldest first, totals, Balance Due, Deposit Held and Monthly Rent.

**Why it exists:** Code comment: a statement a landlord can hand to the tenant.

**Where to find it:** Khata page → **Share statement**.

**Who can use it:** All plans.

**Steps**
1. Click **Share statement**. A file "rent-statement-<tenant>.pdf" downloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share statement** | Button | Downloads the PDF | While running |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None (the PDF follows the app's light/dark report theme).

**Results:** A PDF download; nothing is sent to the tenant.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to download statement" / raw request error | Server error | Retry |

**Limitations:** The button downloads; sharing is done by you outside the app. When deposits moved, a note explains that deposits are included in the Paid/Charged totals but not in the balance.

**How it works:** `GET /api/rental/tenancies/:id/statement?theme=light|dark`; rent rows read "Rent — YYYY-MM", others "<Type> — <note>".

**Related features:** F-RENT-012.

**Sources:** `apps/web/src/pages/rental/TenantKhataPage.tsx:361`, `apps/web/src/api/rental/rental.api.ts:442`, `packages/api/src/controllers/rental.controller.ts:329`

### WhatsApp rent reminder <!-- F-RENT-015 -->
**What it does:** Builds a reminder message from the tenant's balance and opens WhatsApp (wa.me) in a new tab with it pre-typed.

**Why it exists:** Inferred from behavior: the quickest way to nudge a tenant.

**Where to find it:** **Remind** in **Collections** and on the khata page.

**Who can use it:** All plans.

**Steps**
1. Click **Remind**. WhatsApp opens with the message; you send it yourself.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Remind** | Button | Opens wa.me link | Collections: disabled without a phone |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Message text: "Hi <tenant>," then either "This is a reminder that ₹… is outstanding on <property> (oldest pending: YYYY-MM)." (plus payment instructions if set), "Your rent account for <property> is fully settled — nothing is outstanding. Thank you!" or "…is settled, and you are ₹… in advance. Nothing is outstanding.", signed "— <landlord name or your name or "Your landlord">".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add a phone number for this tenant first" | No usable phone | Add the tenant phone |
| "Failed to prepare reminder link" / "Failed to build reminder" | Server error | Retry |

**Limitations:** Some browsers block the new tab because it opens after a network call. Phone rules: 8–15 digits after removing spaces, dashes, brackets and +; a leading 0 is dropped; a 10-digit number starting 6–9 gets the 91 prefix.

**How it works:** `GET /api/rental/tenancies/:id/reminder-link` returns the text and the wa.me URL.

**Related features:** F-RENT-004, F-RENT-012, F-RENT-016, F-RENT-021.

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:573`, `apps/web/src/pages/rental/TenantKhataPage.tsx:323`, `packages/api/src/services/rental/rentalLedger.service.ts:638`, `packages/api/src/services/rental/rentalLedger.service.ts:651`

### Pending tenant reminders (email and SMS) <!-- F-RENT-016 -->
**What it does:** A collapsible panel "Pending tenant reminders" (with "N awaiting approval") that queues reminder messages for upcoming and overdue rent and lets you choose channels, approve and send, or reject. Nothing is sent without your approval.

**Why it exists:** Code comment: "No auto-send: every outbound message is a deliberate human action so the system can't spam tenants".

**Where to find it:** **Asset Classes → Rental → Properties** tab, above the cards (shown once you have at least one property).

**Who can use it:** All plans. Email sending needs a connected Gmail with send permission (D-RENT-005); SMS needs the operator's SMS provider.

**Steps**
1. Reminders are queued daily at 09:00 IST, or click **Run scan** ("Queued N reminders" or "No new reminders to queue — …").
2. Reminders are grouped per tenant. If the tenant has no email or phone, the contact editor opens: fill **Tenant email**/**Tenant phone** and click **Save contact** ("Tenant contact saved — channels enabled"); otherwise **Edit contact** opens it.
3. Under **Send via**, toggle **Email** and **SMS** (a channel without a recipient is disabled: "Add a tenant email above" / "Add a tenant phone above").
4. Tick reminders (or **Select all**). Click **Approve & send** — result "N reminders sent", "N failed — <reasons>" or "N sent · M failed (…)" — or **Reject** ("Reminders rejected").
5. If Gmail lacks send permission, a "Reconnect Gmail" dialog offers **Reconnect Gmail** ("Gmail reconnected — try Approve & send again").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Panel header | Toggle | Expand/collapse | — |
| **Run scan** | Button | Queue reminders now | While running |
| **Edit contact** / **Save contact** / **Cancel** | Buttons | Edit tenant email/phone | Save disabled when unchanged or saving |
| **Email** / **SMS** | Channel chips | Channels for this send only | Disabled without a recipient |
| **Select all** / **Clear selection** | Link button | Select reminders | Shown with 2+ reminders |
| Row checkbox | Checkbox | Select | — |
| **Preview** | Button | F-RENT-017 | — |
| **Reject** | Button | Reject selected | Shown when ≥1 selected |
| **Approve & send** | Button | Send selected | No contact, or no channel ("Pick at least one channel"); while sending |

**Fields and rules:** Tenant email ≤200 characters, tenant phone ≤50 characters (server).

**Settings and toggles here:** S-RENT-003 **Email** / **SMS** channel chips — default both on where a recipient exists; one-shot for this send, not saved.

**Results:** Each approved reminder becomes Sent (if any channel succeeded) or Failed and leaves the panel; per-channel errors are recorded. Rejected reminders leave the panel.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Connect Gmail in Settings → Email notifications first" | Gmail not connected | Connect Gmail (D-RENT-005) |
| "Reconnect Gmail in Settings (existing connection is missing the send permission)" | Missing send scope | **Reconnect Gmail** |
| "SMS provider disabled (DLT-registered SMS provider not yet wired)" | Operator SMS provider is "none" | Use email or WhatsApp |
| "Twilio credentials missing in env" | Operator config | Contact support |
| "Tenant email not set" / "Tenant phone not set" / "Tenant phone is not a valid number" | Contact missing/invalid | Fix the contact |
| "No channels enabled — toggle email or SMS first" | No channel | Turn one on |

**Limitations:** Sent and failed reminders are not listed anywhere in the app. A rejected, failed or superseded reminder is put back in the queue whenever a later scan selects the same month and lead day again; for overdue months that is every daily scan, so rejecting an overdue reminder does not stop it — see DOCUMENTATION_GAPS F-RENT-016. Partly paid months get no reminder. Upcoming reminders are queued only when the scan runs exactly 5, 3, 1 or 0 days before the due date; overdue months get one reminder each. The panel refreshes every 60 seconds.

**How it works:** The scan first copies a legacy "contact" value into email or phone when it clearly is one, flips past-due months to Overdue, then: (1) for each lead day 5/3/1/0, every Expected month of an active tenancy due exactly that many days from today gets a reminder; (2) every Overdue month gets one reminder (lead −1, "overdue by N days"). Text comes from a template (subject "Rent reminder — <property> (<date>)" or "Overdue rent — …"; SMS "Hi <tenant>, your rent of ₹… for <property> is due …"). Landlord name: property's landlord name → your account name → operator default "Your landlord"; payment instructions: property → your account setting → operator default. Email goes through your Gmail; SMS through Twilio when the operator enabled it. Endpoints: `GET /api/rental/reminders?status=PENDING_APPROVAL`, `POST /api/rental/reminders/scan`, `POST /api/rental/reminders/:id/approve` (with one-shot channels), `POST /api/rental/reminders/:id/reject`.

**Related features:** F-RENT-017, F-RENT-019, F-RENT-015, F-RENT-021, D-RENT-005.

**Sources:** `apps/web/src/pages/rental/RentalRemindersPanel.tsx:24`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:487`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:703`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:770`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:856`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:927`, `packages/api/src/services/rental/rental.reminders.service.ts:37`, `packages/api/src/services/rental/rental.reminders.service.ts:79`, `packages/api/src/services/rental/rental.reminders.service.ts:324`, `packages/api/src/services/rental/rental.reminders.service.ts:541`, `packages/api/src/services/notifications/sms.service.ts:74`

### Reminder preview and edit <!-- F-RENT-017 -->
**What it does:** Shows a queued reminder ("Preview reminder — <Month Year>") and lets you edit the email subject, greeting, opening line, payment instructions, closing line, signature and SMS text, with a live email preview.

**Why it exists:** Code comment: the landlord edits plain text; the HTML layout is kept intact.

**Where to find it:** Pending reminders panel → **Preview** on a reminder.

**Who can use it:** All plans.

**Steps**
1. Click **Preview**. Edit fields; the preview updates as you type.
2. Click **Save changes** ("Reminder updated"), then **Close**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Save changes** | Button | Saves the edits | While saving |
| **Close** | Button | Close | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Email subject | Text | — | — | Template | "Update failed" |
| Greeting, Opening line, Payment instructions, Closing line, Signature | Text | — | Plain text (HTML characters are escaped) | Template | — |
| SMS body | Text | — | Up to 300 characters (counter shows "/160") | Template | — |

**Settings and toggles here:** None.

**Results:** The edited message is stored on that reminder only. Notes show "(email channel disabled — tenant email missing)" or "(SMS channel disabled — tenant phone missing)" when relevant.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Only PENDING_APPROVAL reminders can be edited" (raw request error) | Reminder already sent/rejected | Run a new scan |

**Limitations:** Edits apply to one reminder; a revived reminder (after rejection or failure) gets fresh template text, losing earlier edits.

**How it works:** `PATCH /api/rental/reminders/:id` with subject, HTML body (edited regions spliced between markers) and SMS body.

**Related features:** F-RENT-016.

**Sources:** `apps/web/src/pages/rental/RentalRemindersPanel.tsx:116`, `apps/web/src/pages/rental/RentalRemindersPanel.tsx:171`, `packages/api/src/services/rental/rental.reminders.service.ts:492`

### Overdue rent status and alerts <!-- F-RENT-018 -->
**What it does:** Daily at 01:00 IST the server re-derives rent statuses so months 7+ days past due become Overdue. The daily alert scan then creates "Rent overdue — <property>" alerts ("<YYYY-MM> rent of ₹… is overdue") and removes alerts for months that were since settled.

**Why it exists:** Code comment §8.1: surface delinquent receipts without user action.

**Where to find it:** Automatic; shown as Overdue on rental pages and in Alerts (D-REST-002).

**Who can use it:** All users with tenancies.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Status changes and one alert per overdue month (de-duplicated). Recording payment, skipping or auto-matching deletes that month's alert.

**Errors and troubleshooting:** None.

**Limitations:** Partly paid months are never marked Overdue. Operator switch `ENABLE_RENTAL_CRONS=false` stops the status job (statuses still re-derive whenever the tenancy changes or **Run scan** is used).

**How it works:** node-cron "0 1 * * *" Asia/Kolkata runs `markOverdueReceipts` in the system context: for each tenancy with an Expected month due on or before today − 7 days, recompute the ledger. The alert scan (20:45 IST per user) picks Overdue months due on or before today − 7 days.

**Related features:** F-RENT-007, F-RENT-016, D-REST-002.

**Sources:** `packages/api/src/jobs/rentalJobs.ts:21`, `packages/api/src/jobs/rentalJobs.ts:70`, `packages/api/src/services/rental/rental.service.ts:985`, `packages/api/src/services/notifications/alerts.service.ts:181`, `packages/api/src/services/notifications/alerts.service.ts:207`

### Daily reminder scan <!-- F-RENT-019 -->
**What it does:** Daily at 09:00 IST the server queues rent reminders for all users exactly as **Run scan** does (F-RENT-016).

**Why it exists:** Code comment: reminders are ready when landlords open the app in the morning.

**Where to find it:** Automatic; results in the pending reminders panel.

**Who can use it:** All users with tenancies.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** New or revived Pending reminders.

**Errors and troubleshooting:** None shown.

**Limitations:** Same as F-RENT-016; nothing is sent automatically.

**How it works:** node-cron "0 9 * * *" Asia/Kolkata runs `enqueuePendingReminders` in the system context; an overlapping run is skipped.

**Related features:** F-RENT-016.

**Sources:** `packages/api/src/jobs/rentalJobs.ts:43`, `packages/api/src/jobs/rentalJobs.ts:77`, `packages/api/src/services/rental/rental.reminders.service.ts:324`

### What this area doesn't do
- You can't change a tenancy's rent, end date or due day, end a tenancy, or delete a tenancy in the app.
- You can't set a landlord name or payment instructions for reminders (other than editing each reminder's text).
- Reminders are never sent automatically; there is no history of sent reminders.
- You can't edit an expense or a khata entry — delete and re-add.
- There is no rent agreement generator, TDS calculation or rental income tax computation here.
- Rent increases (escalation) are not modelled.

<!-- END MODULES -->

## Roles and profiles

Role definitions are global (see the merged manual's Roles chapter). How each role applies to Property & Vehicles:

### Signed-out visitor <!-- R-VISITOR -->
Cannot open any Vehicles, Real Estate or Rental page; is sent to sign-in.

### Free user <!-- R-FREE -->
Full use of all three areas on their own data. None of these areas is plan-gated.

### Plus subscriber <!-- R-PLUS -->
Same as Free user in these areas.

### Family subscriber <!-- R-FAMILY -->
Same as Free user in these areas.

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Free user in these areas.

### Administrator <!-- R-ADMIN -->
No admin-only powers in these areas; access follows the admin's own plan (all plans have full access here).

### Family owner <!-- R-FAMOWNER -->
Family view does not change these pages: they always show the signed-in person's own vehicles and properties. The **Family** button on Vehicles only groups by RC owner name.

### Family contributor <!-- R-FAMCONTRIB -->
Same as Family owner here — own data only.

### Family viewer <!-- R-FAMVIEWER -->
Same as Family owner here — own data only.

### Managing a family member's account <!-- R-MANAGER -->
Sees and edits the managed person's vehicles, properties, tenancies and reminders; everything added belongs to them. Email reminders are sent through the managed person's Gmail connection, if any.

### Professional acting for a client <!-- R-PROF -->
These pages are not part of the professional workspace; client books are reached through **Client books** (outside this area).

### AI chatbot connection <!-- R-AICONN -->
Can read (never change) vehicles and property/rental data through the AI connector's Vehicles and Property areas when the user approved them; outside these pages.

### Succession nominee <!-- R-NOMINEE -->
No access to these pages.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| RC | Registration certificate of a vehicle; the source of make, model, owner and expiry details. |
| VAHAN | The government vehicle registration database; "Paste VAHAN SMS" reads the SMS reply from its SMS service. |
| PUC | Pollution Under Control certificate; its expiry is tracked as "PUC" / "PUC / Emission". |
| Challan | A traffic e-challan (fine) issued against a vehicle. |
| Hypothecation | A lender's charge on a vehicle bought on loan; "Clear" means none recorded. |
| Stock photo | A generic image matched by make and model, not a photo of the user's own vehicle. |
| Anchor (Good condition) | The valuation's base price for a vehicle in Good condition, before the condition sliders. |
| Cost basis (property) | Purchase price + stamp duty + registration fee + brokerage + other costs. |
| CII | Cost Inflation Index used to index a property's cost for long-term capital gain. |
| Make rental | Creates a linked Rental record from an owned property. |
| Tenancy | One tenant's lease on a rental property, with monthly rent and due day. |
| Rent receipt | One month's expected rent for a tenancy, with status Expected, Received, Partial, Overdue or Skipped. |
| Khata | The tenant's running ledger: charges ("You gave") and money in ("You got"), with a balance. |
| Balance due / To collect / In advance | What the tenant owes (positive) or has paid ahead (negative) on the khata. |
| Deposit held | Security deposit received minus deposit refunds; kept outside the rent balance. |
| Auto-matched | A rent month marked received automatically from an imported bank credit. |
| Collections | The list of active tenants who currently owe money. |
| Pending tenant reminders | Email/SMS rent reminders waiting for the landlord's approval before sending. |
<!-- END GLOSSARY -->
