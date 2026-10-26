---
id: F-CARD-003
title: "Delete a credit card"
module: "Credit Cards"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CARD-001]
---

[← Credit Cards](../modules/credit-cards.md) · [Index](../INDEX.md)

# Delete a credit card

`F-CARD-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Permanently deletes a card and all its statements.

**Why it exists:** Inferred from behavior: to remove a card added by mistake or no longer held.

**Where to find it:** **Asset Classes → Credit Cards**, bin on a card (route `/credit-cards`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person.

**Steps**
1. Click the bin. The card is replaced by "Delete "<issuer> ●●●● <last 4>"?" with **Yes** / **No**.
2. Click **Yes**. The toast "Card deleted" appears.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Bin (title "Delete") | Icon button | Shows the confirmation | — |
| **Yes** / **No** | Buttons | Delete / cancel | **Yes** disabled while deleting |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** The card, its encrypted number and its statements are removed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Failed to delete card" | Network error or card not found | Reload |

**Limitations:** No undo. Not available from the card's own page. Closing a card (status **Closed**) keeps its history instead.

**How it works:** `DELETE /api/credit-cards/:id` after an ownership check; statements cascade.

**Related features:** [F-CARD-001](F-CARD-001.md).

**Sources:** `apps/web/src/pages/creditCards/CreditCardListPage.tsx:583`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:641`, `packages/api/src/services/banking/creditCards.service.ts:236`, `packages/api/prisma/schema.prisma:3146`
