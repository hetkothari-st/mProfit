---
id: F-REST-003
title: "Add or edit an owned property"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: [S-REST-002, S-REST-003, S-REST-004]
related: [F-REST-005, F-REST-006, F-REST-007, F-REST-012, F-REST-013]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Add or edit an owned property

`F-REST-003` · Live · Roles: as [F-REST-001](F-REST-001.md)

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

**Settings and toggles here:** [S-REST-002](../settings/real-estate.md#s-rest-002) **Status** (affects summary totals, alerts and the Sold workflow), [S-REST-003](../settings/real-estate.md#s-rest-003) **Portfolio**, [S-REST-004](../settings/real-estate.md#s-rest-004) **Tax due month** (drives property-tax alerts).

**Results:** The property is saved. Empty text fields are saved as empty (cleared). Entering a current value stamps "Updated today". When neither Type nor Status is Under construction, the builder, project, RERA, expected possession and paid-so-far fields are cleared on save so possession alerts stop.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Required" under Name | Name empty | Enter a name |
| "Validation failed" | A number has commas, a minus sign or letters, or a limit is exceeded | Enter plain digits, e.g. 4500000 |
| "Save failed" | Other server error | Retry |

**Limitations:** Linking a loan or insurance policy to the property is not possible in this form ([F-REST-013](F-REST-013.md)). Choosing **Sold** here only changes the label; use **Mark sold** to record the sale and get capital gain. Clearing **My share (%)** may be rejected ("Validation failed").

**How it works:** `POST /api/real-estate/properties` (201) or `PATCH /api/real-estate/properties/:id` with the full form; the server validates with the schema shown, defaults status SELF_OCCUPIED, ownership SOLE at 100%, maintenance MONTHLY and current-value source "manual", and stores money as decimals.

**Related features:** [F-REST-005](F-REST-005.md), [F-REST-006](F-REST-006.md), [F-REST-007](F-REST-007.md), [F-REST-012](F-REST-012.md), [F-REST-013](F-REST-013.md).

**Sources:** `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:27`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:68`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:165`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:220`, `packages/api/src/schemas/realEstate.schema.ts:23`, `packages/api/src/services/realEstate/realEstate.service.ts:140`, `packages/api/src/services/realEstate/realEstate.service.ts:201`
