[Index](../INDEX.md)

# Set up a rental property and tenancy

`W-RENT-001` · Rental

**Goal:** Start tracking rent.
**Who:** Any signed-in user.
**Before you start:** Optional: add the bank account rent goes to (Bank Accounts) so you can pick it.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Rental → Add property**, fill **Name *** and **Type**, **Save** | Property card appears |
| 2 | Open the card | Rental property page |
| 3 | **Add tenancy**: tenant name, start date, monthly rent, due day, deposit, email/phone, **Rent credited to** → **Add tenancy** | Generates monthly receipts (to end date, or 12 months); past months 7+ days due are Overdue; deposit goes to the khata |

**Success:** The tenancy card lists months with Expected/Overdue status.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Request failed with status code 422/400" | Invalid value (rent ≤ 0, end before start, commas) | Correct and retry |
| Wrong rent or dates after saving | Terms can't be edited in the app | See DOCUMENTATION_GAPS [F-RENT-020](../features/F-RENT-020.md) |
