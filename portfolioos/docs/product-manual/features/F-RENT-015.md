---
id: F-RENT-015
title: "WhatsApp rent reminder"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-004, F-RENT-012, F-RENT-016, F-RENT-021]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# WhatsApp rent reminder

`F-RENT-015` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Builds a reminder message from the tenant's balance and opens WhatsApp (wa.me) in a new tab with it pre-typed.

**Why it exists:** Inferred from behavior: the quickest way to nudge a tenant.

**Where to find it:** **Remind** in **Collections** and on the khata page.

**Who can use it:** All plans.

**Steps**
1. Click **Remind**. WhatsApp opens with the message; you send it yourself.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Remind** | Button | Opens wa.me link | Collections: disabled without a phone |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None.

**Results:** Message text: "Hi <tenant>," then either "This is a reminder that ₹… is outstanding on <property> (oldest pending: YYYY-MM)." (plus payment instructions if set), "Your rent account for <property> is fully settled — nothing is outstanding. Thank you!" or "…is settled, and you are ₹… in advance. Nothing is outstanding.", signed "— <landlord name or your name or "Your landlord">".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add a phone number for this tenant first" | No usable phone | Add the tenant phone |
| "Failed to prepare reminder link" / "Failed to build reminder" | Server error | Retry |

**Limitations:** Some browsers block the new tab because it opens after a network call. Phone rules: 8–15 digits after removing spaces, dashes, brackets and +; a leading 0 is dropped; a 10-digit number starting 6–9 gets the 91 prefix.

**How it works:** `GET /api/rental/tenancies/:id/reminder-link` returns the text and the wa.me URL.

**Related features:** [F-RENT-004](F-RENT-004.md), [F-RENT-012](F-RENT-012.md), [F-RENT-016](F-RENT-016.md), [F-RENT-021](F-RENT-021.md).

**Sources:** `apps/web/src/pages/rental/RentalListPage.tsx:573`, `apps/web/src/pages/rental/TenantKhataPage.tsx:323`, `packages/api/src/services/rental/rentalLedger.service.ts:638`, `packages/api/src/services/rental/rentalLedger.service.ts:651`
