---
id: F-RENT-005
title: "Rental property detail and this financial year"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-006, F-RENT-007, F-RENT-011, F-REST-010, F-REST-011]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Rental property detail and this financial year

`F-RENT-005` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

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
| **Add expense** | Button | [F-RENT-011](F-RENT-011.md) | — |
| **Add tenancy** / **Add one** | Button | [F-RENT-006](F-RENT-006.md) | — |
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

**Related features:** [F-RENT-006](F-RENT-006.md), [F-RENT-007](F-RENT-007.md), [F-RENT-011](F-RENT-011.md), [F-REST-010](F-REST-010.md), [F-REST-011](F-REST-011.md), [D-REST-003](../dependencies.md#d-rest-003).

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:915`, `apps/web/src/pages/rental/RentalDetailPage.tsx:981`, `apps/web/src/pages/rental/RentalDetailPage.tsx:1007`, `packages/api/src/services/rental/rental.service.ts:231`, `packages/api/src/services/rental/rental.service.ts:920`
