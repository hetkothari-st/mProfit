---
id: F-RENT-012
title: "Tenant khata (ledger)"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: [S-RENT-002, S-RENT-005]
related: [F-RENT-008, F-RENT-013, F-RENT-014, F-RENT-015]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Tenant khata (ledger)

`F-RENT-012` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** A running account per tenancy: a big balance ("To collect", "In advance" or "Settled up"), "Deposit held", the **Rent credited to** picker, and a table of every rent charge and entry with columns Date, **You gave**, **You got**, **Balance** (on phones one "Gave / got" column). Buttons **You gave** and **You got** add entries.

**Why it exists:** Code comments: "You gave" = a charge against the tenant, "You got" = money in — a familiar khata (ledger) model.

**Where to find it:** Tenant name on the rental property page or in **Collections** (route `/rental/tenancies/:tenancyId`, page title "Tenant khata" while loading).

**Who can use it:** All plans.

**Steps**
1. Click **You got** (payment, discount, deposit) or **You gave** (late fee, other charge, deposit refund).
2. Enter **Amount (₹) ***, **Date**, **Type**, optionally **Apply to month — leave blank to settle oldest first** and **Note**. Click **Save**. "Entry added".
3. To delete an entry, click its trash icon → "Delete this <type> of ₹… on <date>?" → **Yes, delete**. Rent rows cannot be deleted.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **You gave** / **You got** | Buttons | Open the entry dialog | — |
| **Save** / **Cancel** | Buttons | Save / close | Save disabled while saving |
| Trash (title "Delete entry"), **Yes, delete**, **Cancel** | Buttons | Delete with confirm | Not on rent rows |
| **Remind** | Button | [F-RENT-015](F-RENT-015.md) | While running |
| **Share statement** | Button | [F-RENT-014](F-RENT-014.md) | While running |
| Back arrow | Link | Rental property page | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Amount (₹) * | Decimal text | Yes | > 0 | Empty | "Enter a valid amount" |
| Date | Date | Yes | YYYY-MM-DD | Today | — |
| Type | Select | Yes | You got: Payment, Discount, Deposit · You gave: Late fee, Other charge, Deposit refund | Payment / Late fee | — |
| Apply to month | Select (rent months) | No | YYYY-MM or "Settle oldest first" | Settle oldest first | — |
| Note | Text | No | ≤2000 | — | — |

**Settings and toggles here:** [S-RENT-005](../settings/rental.md#s-rent-005) **Apply to month** — blank settles the oldest open charge first; a month pins the credit to that month first. [S-RENT-002](../settings/rental.md#s-rent-002) **Rent credited to**.

**Results:** Payment, Deposit and Deposit refund create a cash-flow entry (inflow, inflow, outflow) in the property's portfolio (or default/first portfolio); Discount, Late fee and Other charge do not. Balance and all month statuses are recomputed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Enter a valid amount" | Empty, zero or non-numeric | Enter a positive amount |
| "Request failed with status code …" | Server refused | Check the values |
| "Tenancy not found" — "This tenancy may have been removed." | Bad link | Go back |

**Limitations:** Entries cannot be edited in the app (delete and re-add). Deleting a payment also deletes its cash-flow entry, irreversibly.

**How it works:** Charges = rent receipts (not skipped) + late fees + other charges; credits = payments + discounts. Each credit first fills its pinned month (if any room), then the oldest charge by due date (rent before fees on the same date); leftovers are an advance. Balance = total charges − total credits. Deposit held = deposits − deposit refunds, kept outside the balance. Running balance in the table goes oldest to newest and skips deposit rows; rows are shown newest first. Endpoints: `GET /api/rental/tenancies/:id/ledger`, `POST /api/rental/tenancies/:id/entries`, `DELETE /api/rental/entries/:id`.

**Related features:** [F-RENT-008](F-RENT-008.md), [F-RENT-013](F-RENT-013.md), [F-RENT-014](F-RENT-014.md), [F-RENT-015](F-RENT-015.md), [D-RENT-002](../dependencies.md#d-rent-002).

**Sources:** `apps/web/src/pages/rental/TenantKhataPage.tsx:35`, `apps/web/src/pages/rental/TenantKhataPage.tsx:72`, `apps/web/src/pages/rental/TenantKhataPage.tsx:309`, `apps/web/src/pages/rental/TenantKhataPage.tsx:407`, `packages/api/src/services/rental/rentalLedger.service.ts:37`, `packages/api/src/services/rental/rentalLedger.service.ts:258`, `packages/api/src/services/rental/rentalLedger.service.ts:342`, `packages/api/src/services/rental/rentalLedger.service.ts:481`, `packages/api/src/services/rental/rentalLedgerMath.ts:1`
