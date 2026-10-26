---
id: F-CARD-001
title: "Credit cards list and summary"
module: "Credit Cards"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-CARD-001]
related: [F-CARD-002, F-CARD-003, F-CARD-004, F-CARD-005, F-CARD-006]
---

[← Credit Cards](../modules/credit-cards.md) · [Index](../INDEX.md)

# Credit cards list and summary

`F-CARD-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** Shows a summary strip — **Total credit limit** ("across N active cards"), **Total outstanding** ("combined across active cards") and **Avg utilization** ("High — consider paying down" above 80%, otherwise "within healthy range") — and a grid of cards. Under each card face: **Outstanding** with utilisation % and a coloured bar, **Limit**, **Payment due** (amount, date and a badge: **Overdue**, **Today** or "Nd"), **Status**, and a red "High utilization — may impact credit score" note at 80% or more. Active cards come first; others are under **Blocked / Closed**, faded.

**Why it exists:** The empty state states the purpose: "Add your credit cards to track statements, payments, and utilization."

**Where to find it:** **Asset Classes → Credit Cards** (route `/credit-cards`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) sees the managed person's cards. In family view the page still shows only your own cards.

**Steps**
1. Open **Asset Classes → Credit Cards**.
2. Read the summary strip and each card's figures.
3. Click a card face, or the arrow button (title "Open"), to open the card's page ([F-CARD-005](F-CARD-005.md)).
4. Click **Download** for the credit cards report ([D-CARD-001](../dependencies.md#d-card-001)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card face | Link | Opens `/credit-cards/:id` | — |
| Eye button ("Show card number" / "Hide card number") | Toggle | Reveals the full number ([F-CARD-004](F-CARD-004.md)) | — |
| Pencil (title "Edit") | Icon button | Opens **Edit credit card** ([F-CARD-002](F-CARD-002.md)) | Shows on hover (always visible on touch screens) |
| Bin (title "Delete") | Icon button | Asks to delete ([F-CARD-003](F-CARD-003.md)) | Spinner while deleting |
| Arrow (title "Open") | Link | Opens the card page | — |
| **Add card** / **Add first card** | Button | Opens **Add credit card** | **Add first card** only with no cards |
| **Download** | Button | Credit cards report ([D-CARD-001](../dependencies.md#d-card-001)) | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-CARD-001](../settings/credit-cards.md#s-card-001) **Status** — only **Active** cards count in the summary strip, get the high-utilisation note and are scanned for reminders.

**Results:** Nothing is changed.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Outstanding stays high after you paid a statement | Outstanding changes only when you add an unpaid statement (see Limitations) | Add the next statement; see DOCUMENTATION_GAPS.md |

**Limitations:** **Outstanding** is not a running balance: it is set to the amount of the most recently added unpaid statement and is not reduced when you mark a statement paid or delete it (a confirmed defect). **Payment due** without an unpaid statement is an estimate — the next occurrence of the card's due day ("Due on day N of the month"), clamped to short months. The list carries only each card's 3 latest statements (by due date), so an older unpaid statement does not drive **Payment due** here. No sort, search or filter.

**How it works:** `GET /api/credit-cards` returns your cards (newest first) with their 3 latest statements and `hasCardNumber`, never the encrypted number. Utilisation = outstanding ÷ limit × 100; bar colours: below 50% green, 50–79% yellow, 80–89% amber, 90% and above red. **Payment due**: the earliest unpaid (Pending, Partial or Overdue) statement's due date and remaining amount (statement − paid); otherwise the next due-day date. Closed or blocked cards show **Payment due** only when an unpaid statement exists. The card face shows the signed-in user's name as the holder.

**Related features:** [F-CARD-002](F-CARD-002.md), [F-CARD-003](F-CARD-003.md), [F-CARD-004](F-CARD-004.md), [F-CARD-005](F-CARD-005.md), [F-CARD-006](F-CARD-006.md), [D-CARD-001](../dependencies.md#d-card-001), [D-CARD-002](../dependencies.md#d-card-002).

**Sources:** `apps/web/src/pages/creditCards/CreditCardListPage.tsx:65`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:106`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:123`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:218`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:599`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:622`, `apps/web/src/pages/creditCards/CreditCardListPage.tsx:670`, `apps/web/src/lib/creditCardDue.ts:47`, `apps/web/src/components/creditCards/CreditCardVisual.tsx:463`, `packages/api/src/services/banking/creditCards.service.ts:135`, `packages/api/src/services/banking/creditCards.service.ts:141`, `packages/api/src/services/banking/creditCards.service.ts:307`
