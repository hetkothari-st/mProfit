---
id: F-RENT-006
title: "Add a tenancy"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: [S-RENT-002, S-RENT-004]
related: [F-RENT-007, F-RENT-012, F-RENT-013, F-RENT-016, F-RENT-020]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Add a tenancy

`F-RENT-006` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Records a tenant and lease terms and generates the monthly rent schedule; a security deposit is entered into the tenant's khata.

**Why it exists:** Inferred from behavior: a rent schedule to compare payments against.

**Where to find it:** Rental property page → **Add tenancy** (dialog "Add tenancy").

**Who can use it:** All plans.

**Steps**
1. Click **Add tenancy**.
2. Fill **Tenant name ***, **Start date ***, **Monthly rent (₹) *** and optionally **Tenant email** ("Used for rent reminders"), **Tenant phone** ("10-digit, used for SMS reminders"), **Other contact (optional)**, **End date**, **Due day of month**, **Security deposit (₹)**, **Rent credited to**.
3. Click **Add tenancy**. The tenancy appears with its rent receipts.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Cancel** | Button | Close | — |
| **Add tenancy** | Button | Save ("Saving…") | While saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Tenant name * | Text | Yes | 1–200 | — | "Required" |
| Tenant email | Email | No | ≤200 (format not checked by server) | — | — |
| Tenant phone | Phone | No | ≤50 | — | — |
| Other contact (optional) | Text | No | ≤200 | — | — |
| Start date * | Date | Yes | YYYY-MM-DD | — | red outline |
| End date | Date | No | Not before start | — | "endDate cannot be before startDate" (shown as raw request error) |
| Monthly rent (₹) * | Text | Yes | Decimal > 0 | — | "Required"; server "monthlyRent must be positive" |
| Due day of month | Number | No | 1–31 | 1 | server "rentDueDay must be between 1 and 31" |
| Security deposit (₹) | Text | No | Decimal | — | — |
| Rent credited to | Select (your open bank accounts) or "Not tracked" | No | Must be your account | Not tracked | "That bank account does not belong to you" |

**Settings and toggles here:** [S-RENT-004](../settings/rental.md#s-rent-004) **Due day of month**; [S-RENT-002](../settings/rental.md#s-rent-002) **Rent credited to**.

**Results:** One rent receipt per month from the start month to the end month (or 12 months when there is no end date). Receipts due 7 or more days ago are created as Overdue at once; others as Expected. A deposit creates a "Security deposit" entry in the khata (it does not reduce rent owed). Tenant email, phone and other contact are stored encrypted.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Request failed with status code 400/422" | Validation failed (rent ≤ 0, end before start, bad number) | Correct the field |
| "Cannot create tenancy on inactive property" | Property set inactive via API | — |

**Limitations:** Errors show raw request text. Once created, the rent, end date, due day and active flag cannot be changed in the web app, and a tenancy cannot be ended or deleted there ([F-RENT-020](F-RENT-020.md)); only the tenant's email/phone ([F-RENT-016](F-RENT-016.md)) and rent account ([F-RENT-013](F-RENT-013.md)) can be edited. Without an end date only 12 months are generated; no later months are added automatically.

**How it works:** `POST /api/rental/properties/:id/tenancies` in one transaction: tenancy, receipts (unique per tenancy and month; due day clamped to the month's last day, e.g. 31 → 28/29 February), optional DEPOSIT entry, then ledger recompute.

**Related features:** [F-RENT-007](F-RENT-007.md), [F-RENT-012](F-RENT-012.md), [F-RENT-013](F-RENT-013.md), [F-RENT-020](F-RENT-020.md).

**Sources:** `apps/web/src/pages/rental/RentalDetailPage.tsx:625`, `apps/web/src/pages/rental/RentalDetailPage.tsx:657`, `packages/api/src/controllers/rental.controller.ts:58`, `packages/api/src/services/rental/rental.service.ts:178`, `packages/api/src/services/rental/rental.service.ts:188`, `packages/api/src/services/rental/rental.service.ts:339`, `packages/api/src/services/rental/rental.service.ts:392`
