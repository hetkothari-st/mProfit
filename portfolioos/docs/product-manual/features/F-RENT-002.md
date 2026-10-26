---
id: F-RENT-002
title: "Add or edit a rental property"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-001, F-RENT-006, F-RENT-021]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Add or edit a rental property

`F-RENT-002` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

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

**Limitations:** Errors show the raw request message rather than the server's explanation. Landlord name and payment instructions (used in reminders) and portfolio cannot be set here ([F-RENT-021](F-RENT-021.md)). Rent tracking is per tenancy, not per property.

**How it works:** `POST /api/rental/properties` / `PATCH /api/rental/properties/:id`; the server trims the name and stores money as decimals.

**Related features:** [F-RENT-001](F-RENT-001.md), [F-RENT-006](F-RENT-006.md), [F-RENT-021](F-RENT-021.md).

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:172`, `apps/web/src/pages/rental/RentalListPage.tsx:225`, `apps/web/src/pages/rental/RentalListPage.tsx:309`, `packages/api/src/controllers/rental.controller.ts:31`, `packages/api/src/services/rental/rental.service.ts:249`, `packages/api/src/services/rental/rental.service.ts:286`
