---
id: F-RENT-004
title: "Collections"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-012, F-RENT-015, F-RENT-016]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Collections

`F-RENT-004` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Lists every active tenant who owes money, highest balance first, with property name, "Oldest pending: YYYY-MM" and a **Remind** button.

**Why it exists:** Inferred from behavior: one list of who to chase.

**Where to find it:** **Asset Classes → Rental → Collections** tab.

**Who can use it:** All plans.

**Steps**
1. Open **Collections**. With nobody owing: "All rent collected" — "No tenant has an outstanding balance right now."
2. Click a tenant name to open the khata ([F-RENT-012](F-RENT-012.md)), or **Remind** ([F-RENT-015](F-RENT-015.md)).

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
| "Add a phone number for this tenant first" | Phone not usable for WhatsApp | Add the tenant phone ([F-RENT-016](F-RENT-016.md) **Edit contact**) |
| "Failed to prepare reminder link" | Server error | Retry |

**Limitations:** Only active tenancies with a balance above zero appear.

**How it works:** `GET /api/rental/collections`: active tenancies with balance due > 0, ordered by balance; oldest unpaid = earliest-due receipt that is Expected, Overdue or Partial and not skipped.

**Related features:** [F-RENT-012](F-RENT-012.md), [F-RENT-015](F-RENT-015.md).

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:570`, `apps/web/src/pages/rental/RentalListPage.tsx:629`, `packages/api/src/services/rental/rentalLedger.service.ts:593`
