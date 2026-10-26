---
id: F-REST-013
title: "Linked loan and insurance records"
module: "Real Estate"
status: Partial
roles: "as F-REST-001"
settings: []
related: [F-REST-009, F-REST-012]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Linked loan and insurance records

`F-REST-013` · Partial · Roles: as [F-REST-001](F-REST-001.md)

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

**Limitations:** Partial: only the rental link can be created in the app ([F-REST-009](F-REST-009.md)). There is no picker for a loan or insurance policy; those links exist only if set through the API.

**How it works:** The property carries optional loan, insurance-policy and rental-property ids; the edit form re-sends whatever ids are stored, so it keeps but never sets them.

**Related features:** [F-REST-009](F-REST-009.md), [F-REST-012](F-REST-012.md), [D-REST-005](../dependencies.md#d-rest-005).

**Sources:** `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:387`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:103`, `packages/api/src/services/realEstate/realEstate.service.ts:246`
