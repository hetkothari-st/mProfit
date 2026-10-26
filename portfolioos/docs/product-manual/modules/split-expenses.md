[Index](../INDEX.md)

# Split Expenses

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

**Split Expenses** (sidebar **Tools → Split Expenses**) shares costs with friends, flatmates and trips: add people and groups, record who paid and how a bill is split, see who owes whom, and settle up in cash or by UPI. It is available on every plan. People you split with do not need an account; if one signs up later with the email you saved, they are linked automatically.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-SPLIT-001](../features/F-SPLIT-001.md) | Split home | Live | The Split Expenses page shows two totals (You are owed, You owe), your Groups (name, number of people, currency and your balance), Friends … |
| [F-SPLIT-002](../features/F-SPLIT-002.md) | Add a person | Live | Add a person saves someone you split with: Name, Email (optional), Phone (optional) ("Optional — used later to invite them."). |
| [F-SPLIT-003](../features/F-SPLIT-003.md) | New group | Live | New group creates a group with Group name, Type (Trip, Home, Couple, Other), Currency and People (tick saved people, or + Add a person). |
| [F-SPLIT-004](../features/F-SPLIT-004.md) | Group page and expense list | Live | A group page shows the name, people count and currency (or "Your 1:1 expenses"), Your balance, and four tabs: Expenses, Balances … |
| [F-SPLIT-005](../features/F-SPLIT-005.md) | Add or edit an expense | Live | The Add expense / Edit expense dialog records Description, Amount, Currency (with "1 <ccy> in <group ccy>" exchange rate when different), … |
| [F-SPLIT-006](../features/F-SPLIT-006.md) | Expense details, delete and restore | Live | The expense page shows the description, date and split mode ("Split equally", "Exact amounts", "By percent", "By shares"), the amount (and … |
| [F-SPLIT-007](../features/F-SPLIT-007.md) | Receipt | Live | The Receipt card shows the attached image or an Open PDF link, with Add receipt / Replace and Remove ("Remove this receipt?"). |
| [F-SPLIT-008](../features/F-SPLIT-008.md) | Labels | Live | Group-level labels (name + one of 7 colours) you can tick on an expense; New label creates one. |
| [F-SPLIT-009](../features/F-SPLIT-009.md) | Comments | Live | A comment thread on each expense: author, time, text; Post adds one; your own comments have a delete button ("Delete this comment?"). |
| [F-SPLIT-010](../features/F-SPLIT-010.md) | Add my share to Cash Activity | Live | A switch "Add my share (₹…) to Cash Activity" on each expense you are part of. |
| [F-SPLIT-011](../features/F-SPLIT-011.md) | Balances and suggested payments | Live | The Balances tab lists each member's net ("you are owed / you owe" for you, "is owed / owes" for others) and then Suggested payments (when … |
| [F-SPLIT-012](../features/F-SPLIT-012.md) | Settle up (record a payment) | Live | The Settle up dialog records money paid between two members: Paid by, Paid to, Amount (<currency>), Method (Cash, UPI, Other) and Date. |
| [F-SPLIT-013](../features/F-SPLIT-013.md) | Pay via UPI | Live | Pay on a balance row opens Pay <name>: the amount, the payee's name and UPI ID, Open UPI app (a upi://pay link), Copy pay link and a QR … |
| [F-SPLIT-014](../features/F-SPLIT-014.md) | Remind and share a pay link | Live | On a balance row where someone owes you: Remind emails them "Reminder: you owe <you> <amount>"; Share pay link opens your phone's share … |
| [F-SPLIT-015](../features/F-SPLIT-015.md) | Group settings and members | Live | The group's Settings tab: Group name with Rename, Simplify debts (fewest payments to settle), "Currency: <ccy> (fixed once a group is … |
| [F-SPLIT-016](../features/F-SPLIT-016.md) | Friend balances and 1:1 expenses | Live | A friend's page shows Overall (owes you / you owe, "≈" if converted), "Includes groups in other currencies, converted at the latest rate." … |
| [F-SPLIT-017](../features/F-SPLIT-017.md) | Split settings | Live | Split settings has three cards: Payments (UPI ID, "Friends see this when they pay you"), Defaults (Home currency, Default portfolio), … |
| [F-SPLIT-018](../features/F-SPLIT-018.md) | Activity and weekly email digests | Live | Sends two kinds of email: an activity digest "<N> updates in your shared expenses" about changes other people made in your groups, and a … |
| [F-SPLIT-019](../features/F-SPLIT-019.md) | Linking people who join | Live | When someone signs up or signs in with an email that you saved on a person, that person is linked to their account: they see your shared … |

Settings for this module: [settings/split-expenses.md](../settings/split-expenses.md)
