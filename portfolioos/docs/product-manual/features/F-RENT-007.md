---
id: F-RENT-007
title: "Tenancy cards and rent receipts"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-008, F-RENT-009, F-RENT-010, F-RENT-012]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Tenancy cards and rent receipts

`F-RENT-007` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Each tenancy shows initials, name, **Active**/**Ended**, "N overdue", monthly rent, start → end month, "received/total collected" and **Total received**. Expanded, it shows tiles **Collection** (percentage and progress bar), **Received**, **Expected**, **Overdue** (or **Skipped**) and a table: Month, Expected, Received ("short by ₹…", "auto-matched"), Due (date and weekday), Status, Actions.

**Why it exists:** Inferred from behavior: month-by-month view of what was expected and what came in.

**Where to find it:** Rental property page → **Tenancies**.

**Who can use it:** All plans.

**Steps**
1. Click the chevron to expand/collapse (active tenancies start expanded).
2. Click the tenant name to open the khata ([F-RENT-012](F-RENT-012.md)).
3. Use row actions ([F-RENT-008](F-RENT-008.md), [F-RENT-009](F-RENT-009.md), [F-RENT-010](F-RENT-010.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Tenant name | Link | Khata | — |
| Chevron | Toggle | Expand/collapse | — |
| **Received**, **Skip** | Row buttons | [F-RENT-008](F-RENT-008.md) / [F-RENT-009](F-RENT-009.md) | Only for Expected or Overdue rows |
| **Undo** | Row button | Undo auto-match / mark-received / skip | Depends on row state |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None — view only.

**Errors and troubleshooting:** None specific.

**Limitations:** Collection % = total received ÷ total expected of all receipts including future months, so it is low early in a lease. Tone: ≥90% green, ≥60% neutral, else amber.

**How it works:** Status is derived from the khata, not typed: Skipped if skipped; Received if money allocated ≥ expected; Partial if some; otherwise Overdue when the due date is 7 or more days ago (at or before today − 7 days, UTC), else Expected. Money is allocated by the rules in [F-RENT-012](F-RENT-012.md).

**Related features:** [F-RENT-008](F-RENT-008.md) to [F-RENT-012](F-RENT-012.md).

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:399`, `apps/web/src/pages/rental/RentalDetailPage.tsx:223`, `apps/web/src/pages/rental/RentalDetailPage.tsx:56`, `packages/api/src/services/rental/rentalLedgerMath.ts:159`, `packages/api/src/services/rental/rentalLedger.service.ts:54`
