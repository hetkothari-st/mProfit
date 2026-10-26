---
id: F-INS-016
title: "Premiums from imported statements"
module: "Insurance"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-INS-007, F-INS-014]
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Premiums from imported statements

`F-INS-016` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The **From your imported statements** card lists premiums found in imported insurance statements that may belong to this policy, matched by **Same policy number** or **Same insurer, similar amount**. **Link** records the payment against the premium it covers; **Not this policy** stops suggesting it here. Hidden when there is nothing to review.

**Why it exists:** To bring statement premiums into the schedule without retyping; only exact policy-number matches are linked automatically on import (code comment).

**Where to find it:** Policy page (route `/insurance/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Read each suggestion (amount, paid date, source, match reason, "for the premium due <date>").
2. Click **Link** (toast "Payment recorded on this policy") or **Not this policy** (toast "It won't be suggested for this policy again").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Link** | Button | Records the payment | Disabled while busy |
| **Not this policy** | Button | Dismisses | Disabled while busy |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A premium payment is created (once per imported transaction) or the suggestion is dismissed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not link the payment" / "Could not dismiss it" | Server error | Try again |

**Limitations:** At most 500 imported premiums are considered per policy page. Matching by insurer uses an amount within ±5%.

**How it works:** `GET /api/insurance/policies/:id/import-suggestions`, `POST …/import-suggestions/link` and `…/dismiss`. Statement premiums are stored as insurance transactions by the importer ([D-INS-005](../dependencies.md#d-ins-005)).

**Related features:** [F-INS-007](F-INS-007.md), [F-INS-014](F-INS-014.md), [D-INS-005](../dependencies.md#d-ins-005).

**Sources:** `apps/web/src/components/insurance/ImportedPremiumsCard.tsx:17`, `apps/web/src/components/insurance/ImportedPremiumsCard.tsx:102`, `packages/api/src/services/insurance/insuranceExtras.service.ts:35`, `packages/api/src/services/insurance/insuranceExtras.service.ts:37`, `packages/api/src/services/insurance/insuranceExtras.service.ts:214`
