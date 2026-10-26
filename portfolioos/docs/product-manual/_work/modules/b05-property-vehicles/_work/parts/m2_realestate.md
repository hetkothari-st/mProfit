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
