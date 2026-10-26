---
id: F-LOAN-011
title: "Linked vehicle and property on a loan"
module: "Loans"
status: Partial
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: []
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Linked vehicle and property on a loan

`F-LOAN-011` · Partial · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** When a loan carries a link to a vehicle or a rental property, the loan page shows a **Linked vehicle** card ("View vehicle details →") or a **Linked property** card ("View property details →") that opens that record.

**Why it exists:** Inferred from behavior: a car loan or home loan belongs to an asset tracked elsewhere in the app.

**Where to find it:** Loan detail page (route `/loans/:id`), below the market card.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

**Steps**
1. Open a loan that has a link. Click **View vehicle details →** or **View property details →**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View vehicle details →** | Link | Opens `/vehicles/:id` ([D-LOAN-005](../dependencies.md#d-loan-005)) | Hidden when no vehicle is linked |
| **View property details →** | Link | Opens `/rental/:id` ([D-LOAN-005](../dependencies.md#d-loan-005)) | Hidden when no rental property is linked |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Navigation only.

**Errors and troubleshooting:** None found.

**Limitations:** No screen in the Loans module sets these links — the add and edit forms have no vehicle or property field; the link exists only if it was saved through the API. Treat this card as rarely visible.

**How it works:** The loan record has optional `vehicleId` and `rentalPropertyId` columns accepted by `POST/PATCH /api/loans`; the web forms never send them.

**Related features:** [D-LOAN-005](../dependencies.md#d-loan-005).

**Sources:** `apps/web/src/pages/loans/LoanDetailPage.tsx:1221`, `packages/api/src/controllers/loans.controller.ts:44`, `packages/api/prisma/schema.prisma:3049`
