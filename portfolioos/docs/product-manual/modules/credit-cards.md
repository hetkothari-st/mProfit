[Index](../INDEX.md)

# Credit Cards

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Credit Cards** page (sidebar **Asset Classes → Credit Cards**, route `/credit-cards`) tracks your cards' limits, billing days, monthly statements and payments: "Track credit cards, statements, and payment history". Each card is drawn as a realistic card face (using the issuer's official art where available). Utilisation and dues come from the statements you enter; the full card number is optional, stored encrypted and shown only on request.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CARD-001](../features/F-CARD-001.md) | Credit cards list and summary | Live | Shows a summary strip — Total credit limit ("across N active cards"), Total outstanding ("combined across active cards") and Avg … |
| [F-CARD-002](../features/F-CARD-002.md) | Add or edit a credit card | Live | The Add credit card / Edit credit card dialog ("The card's limit and billing days. |
| [F-CARD-003](../features/F-CARD-003.md) | Delete a credit card | Live | Permanently deletes a card and all its statements. |
| [F-CARD-004](../features/F-CARD-004.md) | Reveal the full card number | Live | The eye button on a card face shows the full saved card number; clicking again hides it. |
| [F-CARD-005](../features/F-CARD-005.md) | Credit card detail page | Live | Shows one card: title "<issuer> — <card name>", network and status; the large card face (with reveal); metrics Credit limit ("Statement … |
| [F-CARD-006](../features/F-CARD-006.md) | Credit card statements: add, mark paid, delete | Live | Statement history lists each month's bill — Month, Statement, Min due, Due date (with "in Nd", "today" or "Nd ago" until paid), Paid, Paid … |
| [F-CARD-007](../features/F-CARD-007.md) | Credit card payment reminders | Live | Creates reminders in Alerts for unpaid statements of active cards: "<issuer> <card> ••••<last 4> payment due in N days" 30, 15, 7 and 1 … |

Settings for this module: [settings/credit-cards.md](../settings/credit-cards.md)
