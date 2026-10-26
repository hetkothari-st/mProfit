---
id: F-REST-004
title: "Delete an owned property"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: []
related: [F-REST-001, F-REST-009]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Delete an owned property

`F-REST-004` · Live · Roles: as [F-REST-001](F-REST-001.md)

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

**Limitations:** No undo. Delete is only offered on the list page, not on the property page. Documents uploaded to the property's document vault are handled by the vault ([D-REST-003](../dependencies.md#d-rest-003)); their fate on delete was not traced.

**How it works:** `DELETE /api/real-estate/properties/:id` (404 "Property <id> not found" if not yours); photos cascade.

**Related features:** [F-REST-001](F-REST-001.md), [F-REST-009](F-REST-009.md).

**Sources:** `apps/web/src/pages/realEstate/RealEstateListPage.tsx:841`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:916`, `packages/api/src/services/realEstate/realEstate.service.ts:300`, `packages/api/prisma/schema.prisma:3365`
