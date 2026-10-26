---
id: F-REST-005
title: "Property detail page"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: []
related: [F-REST-003, F-REST-006, F-REST-007, F-REST-009, F-REST-011, F-REST-013]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Property detail page

`F-REST-005` · Live · Roles: as [F-REST-001](F-REST-001.md)

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
| **Edit** | Button | [F-REST-003](F-REST-003.md) | — |
| **Make rental** | Button | [F-REST-009](F-REST-009.md) | Hidden when sold or already linked |
| **Refresh value** | Button | [F-REST-006](F-REST-006.md) | Hidden when sold |
| **Mark sold** | Button | [F-REST-007](F-REST-007.md) | Hidden when sold |
| **Linked loan** / **Linked insurance** / **Rented out (rental record)** | Links | Open the linked record | Shown only when linked |

**Fields and rules:** Not applicable — view only. Money shows in Indian format; empty values show "—"; Tax due month shows the month name; Maintenance shows "₹… monthly|quarterly|annual".

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Property not found" | Wrong link or not yours | Return to the list |

**Limitations:** For a sold property the tile **Realised gain (raw)** is computed from the current value, not the sale price; use the Capital gain section for the real sale figure. The Documents section uses the shared document vault ([D-REST-003](../dependencies.md#d-rest-003)) with title "Sale deed, agreements & receipts".

**How it works:** `GET /api/real-estate/properties/:id` (filtered by your user id). "Updated N day(s) ago" counts whole days since the current value was last set.

**Related features:** [F-REST-006](F-REST-006.md) to [F-REST-011](F-REST-011.md), [F-REST-013](F-REST-013.md), [D-REST-003](../dependencies.md#d-rest-003).

**Sources:** `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:50`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:111`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:220`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:248`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:441`, `packages/api/src/services/realEstate/realEstate.service.ts:131`
