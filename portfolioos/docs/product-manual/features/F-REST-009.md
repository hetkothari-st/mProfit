---
id: F-REST-009
title: "Make rental and Remove from rentals"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: []
related: [F-RENT-001, F-RENT-006, F-REST-010]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Make rental and Remove from rentals

`F-REST-009` · Live · Roles: as [F-REST-001](F-REST-001.md)

**What it does:** **Make rental** creates a matching Rental property (name, address, type, purchase date and price, current value, portfolio) linked to this owned property and sets its status to Rented out. **Remove from rentals** undoes that link and deletes the rental record, provided it has no tenancies or expenses.

**Why it exists:** Code comment: the owned property keeps the cost basis and sale view; the rental record owns income (tenancies, receipts).

**Where to find it:** Property page → **Make rental**; once linked, the banner "This property is also tracked in Rentals." with **Open rental record** and the undo icon (**Remove from rentals**).

**Who can use it:** All plans; not for sold properties.

**Steps**
1. Click **Make rental**. Toast ""<name>" added to Rentals" with **Undo** (8 seconds).
2. Click **Open rental record** to add tenancies ([F-RENT-006](F-RENT-006.md)).
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

**Limitations:** Making a rental twice returns the same link (idempotent). Edits on either side are not synced afterwards. The refusal message "Cannot unlink rental — tenancies or expenses already exist. Delete those first." is not shown in production (see DOCUMENTATION_GAPS [F-REST-009](F-REST-009.md)), and tenancies cannot be deleted from the web app.

**How it works:** `POST /api/real-estate/properties/:id/promote-to-rental` and `POST …/unlink-rental`, each in one database transaction.

**Related features:** [F-RENT-001](F-RENT-001.md), [F-RENT-006](F-RENT-006.md), [F-REST-010](F-REST-010.md).

**Sources:** `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:72`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:81`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:174`, `packages/api/src/services/realEstate/realEstate.service.ts:359`, `packages/api/src/services/realEstate/realEstate.service.ts:372`, `packages/api/src/services/realEstate/realEstate.service.ts:413`
