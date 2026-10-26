---
id: F-RENT-001
title: "Rental properties list"
module: "Rental"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER: managed person's)"
settings: [S-RENT-001]
related: [F-RENT-002, F-RENT-003, F-RENT-004, F-RENT-005, F-RENT-016, F-REST-002, F-REST-010]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Rental properties list

`F-RENT-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) ([R-MANAGER](../roles.md#r-manager): managed person's)

**What it does:** The **Properties** tab lists rental properties as ticket-style cards: type band (Residential, Commercial, Land, Parking) with a short reference "№ <last 8 of id>" and "Next · <date>" of the next expected rent, name and address, active tenant and **Monthly rent**, an occupancy stamp (**OCCUPIED**, **VACANT**, **OVERDUE**), and a "Last 12 months" strip of coloured cells. Above the cards: tiles **Active tenancies**, **Monthly income**, **Overdue receipts**, and the pending reminders panel ([F-RENT-016](F-RENT-016.md)).

**Why it exists:** Page subtitle: "Track properties, tenancies, rent receipts, and expenses".

**Where to find it:** **Asset Classes → Rental** (route `/rental`), tab **Properties**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-MANAGER](../roles.md#r-manager) sees the managed person's rentals. Family view does not add other members' rentals.

**Steps**
1. Open the page. With none: "No rental properties yet" — "Add a property, set up a tenancy, and let EveryPaisa track rent receipts automatically." and **Add your first property**.
2. Click a card to open it ([F-RENT-005](F-RENT-005.md)). Hover to reveal **Edit** (pencil) and **Delete** (trash).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Properties** / **Collections** | Tabs | Switch tab ([F-RENT-004](F-RENT-004.md)) | — |
| **Download** (report button) | Button | Rental report ([D-RENT-001](../dependencies.md#d-rent-001)) | — |
| **Add property** / **Add your first property** | Button | [F-RENT-002](F-RENT-002.md) | — |
| **Grid** / **Map** | Toggle | [F-REST-002](F-REST-002.md) | Hidden with no properties |
| Pencil (title "Edit") / Trash (title "Delete") | Icon buttons | [F-RENT-002](F-RENT-002.md) / [F-RENT-003](F-RENT-003.md) | Shown on hover |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-RENT-001](../settings/rental.md#s-rent-001) **Grid / Map** view (remembered on this device).

**Results:** None — view only.

**Errors and troubleshooting:** None specific.

**Limitations:** **Monthly income** sums the rent of every active tenancy, not money received. The 12-month strip shows the last 12 calendar months by browser time: green Received, amber Partial, red Overdue, outlined Expected, grey Skipped, faint = no record.

**How it works:** `GET /api/rental/properties` returns properties (active first, then by name) with tenancies (active first, newest start first) and all their rent receipts. OVERDUE stamp = any receipt overdue; OCCUPIED = an active tenancy; else VACANT.

**Related features:** [F-RENT-002](F-RENT-002.md) to [F-RENT-005](F-RENT-005.md), [F-RENT-016](F-RENT-016.md), [F-REST-002](F-REST-002.md), [F-REST-010](F-REST-010.md).

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:670`, `apps/web/src/pages/rental/RentalListPage.tsx:110`, `apps/web/src/pages/rental/RentalListPage.tsx:128`, `apps/web/src/pages/rental/RentalListPage.tsx:329`, `apps/web/src/pages/rental/RentalListPage.tsx:517`, `packages/api/src/services/rental/rental.service.ts:213`
