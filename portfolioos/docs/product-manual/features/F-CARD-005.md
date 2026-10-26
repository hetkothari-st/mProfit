---
id: F-CARD-005
title: "Credit card detail page"
module: "Credit Cards"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CARD-001, F-CARD-004, F-CARD-006, F-CARD-007]
---

[← Credit Cards](../modules/credit-cards.md) · [Index](../INDEX.md)

# Credit card detail page

`F-CARD-005` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows one card: title "<issuer> — <card name>", network and status; the large card face (with reveal); metrics **Credit limit** ("Statement day: N, due day: M"), **Outstanding** ("N overdue" or "all current"), **Utilization** ("High — may impact credit score" above 80%, else "Within healthy range") and **Next due** (amount and "Due <date>" or "No pending dues"); a **Credit utilization** bar with marks at 30% (ideal), 80% and 100%; the annual fee and interest rate when set; and **Statement history** ([F-CARD-006](F-CARD-006.md)).

**Why it exists:** Inferred from behavior: one place for a card's limit, utilisation and bills.

**Where to find it:** **Asset Classes → Credit Cards**, click a card (route `/credit-cards/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Open a card. Read the metrics.
2. Click **Back** to return to the list.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Back** | Link button | Opens `/credit-cards` | — |
| Eye button | Toggle | Reveal ([F-CARD-004](F-CARD-004.md)) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is changed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Card not found." | Wrong id, deleted or not yours | Go back to the list |

**Limitations:** **Outstanding** and **Utilization** use the stored outstanding (see [F-CARD-001](F-CARD-001.md)). **Next due** considers only Pending or Partial statements due today or later — an overdue statement is not shown there. The annual fee line (and interest rate) appears only when an annual fee is set.

**How it works:** `GET /api/credit-cards/:id` (all statements) and `GET /api/credit-cards/:id/summary`: utilisation to 2 decimals; overdue = statements with status Overdue; next due = earliest Pending/Partial statement with due date ≥ today, amount = statement − paid (not below 0).

**Related features:** [F-CARD-004](F-CARD-004.md), [F-CARD-006](F-CARD-006.md), [F-CARD-007](F-CARD-007.md).

**Sources:** `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:409`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:437`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:464`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:489`, `apps/web/src/pages/creditCards/CreditCardDetailPage.tsx:509`, `packages/api/src/services/banking/creditCards.service.ts:369`, `packages/api/src/services/banking/creditCards.service.ts:399`
