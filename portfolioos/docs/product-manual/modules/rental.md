[Index](../INDEX.md)

# Rental

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Rental tracks property you let out: tenancies, a monthly rent schedule, payments received, skipped months, a per-tenant running ledger ("khata"), property expenses, this financial year's rental profit and loss, and tenant reminders by WhatsApp link, email or SMS. It is reached from **Asset Classes → Rental** (`/rental`). No plan is required. Rental records can also be created from a Real Estate property ([F-REST-009](../features/F-REST-009.md)).

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-RENT-001](../features/F-RENT-001.md) | Rental properties list | Live | The Properties tab lists rental properties as ticket-style cards: type band (Residential, Commercial, Land, Parking) with a short reference … |
| [F-RENT-002](../features/F-RENT-002.md) | Add or edit a rental property | Live | A short dialog ("Add property" / "Edit property") for name, type, address, purchase date, purchase price and current value. |
| [F-RENT-003](../features/F-RENT-003.md) | Delete a rental property | Live | Deletes a rental property and everything under it. |
| [F-RENT-004](../features/F-RENT-004.md) | Collections | Live | Lists every active tenant who owes money, highest balance first, with property name, "Oldest pending: YYYY-MM" and a Remind button. |
| [F-RENT-005](../features/F-RENT-005.md) | Rental property detail and this financial year | Live | Shows a rental property: name, type · address, Add expense and Add tenancy, the Photos gallery, "This financial year" tiles (rent received … |
| [F-RENT-006](../features/F-RENT-006.md) | Add a tenancy | Live | Records a tenant and lease terms and generates the monthly rent schedule; a security deposit is entered into the tenant's khata. |
| [F-RENT-007](../features/F-RENT-007.md) | Tenancy cards and rent receipts | Live | Each tenancy shows initials, name, Active/Ended, "N overdue", monthly rent, start → end month, "received/total collected" and Total … |
| [F-RENT-008](../features/F-RENT-008.md) | Mark rent received | Live | Records a rent payment against a month: adds a payment to the khata, creates a cash inflow, and updates the month's status (Received or … |
| [F-RENT-009](../features/F-RENT-009.md) | Skip a month and undo actions | Live | Skip marks a month as not owed (e.g. |
| [F-RENT-010](../features/F-RENT-010.md) | Bank-credit auto-match | Live | When an imported UPI or NEFT credit (from bank alerts) is turned into a cash inflow, the app looks for a matching rent month and, if … |
| [F-RENT-011](../features/F-RENT-011.md) | Property expenses | Live | Records costs of a rental property (Property Tax, Maintenance, Repairs, Utilities, Agent Fee, Legal, Other) and lists them (Date, Type, … |
| [F-RENT-012](../features/F-RENT-012.md) | Tenant khata (ledger) | Live | A running account per tenancy: a big balance ("To collect", "In advance" or "Settled up"), "Deposit held", the Rent credited to picker, and … |
| [F-RENT-013](../features/F-RENT-013.md) | Rent credited to | Live | Chooses which of your bank accounts a tenant's rent lands in. |
| [F-RENT-014](../features/F-RENT-014.md) | Share statement | Live | Downloads a PDF "Rent statement — <tenant>" with the period, a table (Date, Details, Charged, Paid, Balance) oldest first, totals, Balance … |
| [F-RENT-015](../features/F-RENT-015.md) | WhatsApp rent reminder | Live | Builds a reminder message from the tenant's balance and opens WhatsApp (wa.me) in a new tab with it pre-typed. |
| [F-RENT-016](../features/F-RENT-016.md) | Pending tenant reminders (email and SMS) | Live | A collapsible panel "Pending tenant reminders" (with "N awaiting approval") that queues reminder messages for upcoming and overdue rent and … |
| [F-RENT-017](../features/F-RENT-017.md) | Reminder preview and edit | Live | Shows a queued reminder ("Preview reminder — <Month Year>") and lets you edit the email subject, greeting, opening line, payment … |
| [F-RENT-018](../features/F-RENT-018.md) | Overdue rent status and alerts | Live | Daily at 01:00 IST the server re-derives rent statuses so months 7+ days past due become Overdue. |
| [F-RENT-019](../features/F-RENT-019.md) | Daily reminder scan | Live | Daily at 09:00 IST the server queues rent reminders for all users exactly as Run scan does (F-RENT-016). |

Settings for this module: [settings/rental.md](../settings/rental.md)

### What this area doesn't do
- You can't change a tenancy's rent, end date or due day, end a tenancy, or delete a tenancy in the app.
- You can't set a landlord name or payment instructions for reminders (other than editing each reminder's text).
- Reminders are never sent automatically; there is no history of sent reminders.
- You can't edit an expense or a khata entry — delete and re-add.
- There is no rent agreement generator, TDS calculation or rental income tax computation here.
- Rent increases (escalation) are not modelled.
