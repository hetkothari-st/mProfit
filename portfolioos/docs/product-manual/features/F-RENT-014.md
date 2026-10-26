---
id: F-RENT-014
title: "Share statement"
module: "Rental"
status: Live
roles: "as F-RENT-001"
settings: []
related: [F-RENT-012]
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Share statement

`F-RENT-014` · Live · Roles: as [F-RENT-001](F-RENT-001.md)

**What it does:** Downloads a PDF "Rent statement — <tenant>" with the period, a table (Date, Details, Charged, Paid, Balance) oldest first, totals, Balance Due, Deposit Held and Monthly Rent.

**Why it exists:** Code comment: a statement a landlord can hand to the tenant.

**Where to find it:** Khata page → **Share statement**.

**Who can use it:** All plans.

**Steps**
1. Click **Share statement**. A file "rent-statement-<tenant>.pdf" downloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share statement** | Button | Downloads the PDF | While running |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** None (the PDF follows the app's light/dark report theme).

**Results:** A PDF download; nothing is sent to the tenant.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to download statement" / raw request error | Server error | Retry |

**Limitations:** The button downloads; sharing is done by you outside the app. When deposits moved, a note explains that deposits are included in the Paid/Charged totals but not in the balance.

**How it works:** `GET /api/rental/tenancies/:id/statement?theme=light|dark`; rent rows read "Rent — YYYY-MM", others "<Type> — <note>".

**Related features:** [F-RENT-012](F-RENT-012.md).

**Sources:** `apps/web/src/pages/rental/TenantKhataPage.tsx:361`, `apps/web/src/api/rental/rental.api.ts:442`, `packages/api/src/controllers/rental.controller.ts:329`
