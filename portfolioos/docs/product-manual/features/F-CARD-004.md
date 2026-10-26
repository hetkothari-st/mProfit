---
id: F-CARD-004
title: "Reveal the full card number"
module: "Credit Cards"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: []
related: [F-CARD-001, F-CARD-002, F-CARD-005]
---

[← Credit Cards](../modules/credit-cards.md) · [Index](../INDEX.md)

# Reveal the full card number

`F-CARD-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** The eye button on a card face shows the full saved card number; clicking again hides it. Each reveal is recorded in the audit log.

**Why it exists:** The dialog explains the number is "Optional — lets you reveal it later"; the server comment states plaintext only leaves through this audited, rate-limited action.

**Where to find it:** Eye button on the card face — **Asset Classes → Credit Cards** list and the card's page (routes `/credit-cards`, `/credit-cards/:id`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person. Limited to 5 reveals per minute.

**Steps**
1. Click the eye ("Show card number"). The number appears on the card.
2. Click it again ("Hide card number") to mask it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "Show card number" / "Hide card number" | Toggle button | Reveals / hides | Disabled (spinner) while loading |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** An audit-log entry "pii_view" for the card is written before the number is returned. The number is held only on the page (not cached) and is masked again when the card changes or you leave.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Only the last 4 digits are saved. Edit the card to add the full number." | No full number saved | Edit the card and type it |
| Toast "Could not reveal the card number. Try again in a minute." | More than 5 reveals in a minute, or a server error (for example "Could not decrypt the card number — the encryption key may have changed") | Wait a minute and retry |

**Limitations:** Reveals are limited to 5 per minute per user (shared with other "reveal" actions in the app).

**How it works:** `POST /api/credit-cards/:id/reveal` (rate-limited, response marked no-store). The server checks ownership, decrypts, writes the audit row (if that write fails, the reveal fails) and returns the number; with no saved number it returns nothing and writes no audit row.

**Related features:** [F-CARD-001](F-CARD-001.md), [F-CARD-002](F-CARD-002.md), [F-CARD-005](F-CARD-005.md).

**Sources:** `apps/web/src/components/creditCards/CreditCardVisual.tsx:330`, `apps/web/src/components/creditCards/CreditCardVisual.tsx:492`, `packages/api/src/routes/creditCards.routes.ts:32`, `packages/api/src/controllers/creditCards.controller.ts:105`, `packages/api/src/services/banking/creditCards.service.ts:248`, `packages/api/src/services/banking/creditCards.service.ts:270`, `packages/api/src/middleware/rateLimit.ts:196`
