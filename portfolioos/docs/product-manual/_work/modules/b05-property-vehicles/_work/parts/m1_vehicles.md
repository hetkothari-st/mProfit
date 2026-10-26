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
