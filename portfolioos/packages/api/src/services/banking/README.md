# services/banking/

Bank accounts, credit cards and deposits.

- `bankAccounts.service.ts` — bank account CRUD (account numbers encrypted at rest).
- `creditCards.service.ts` — credit card CRUD.
- `depositReminders.service.ts` — FD/RD maturity reminders.
- `ifscLookup.service.ts` — IFSC → bank and branch lookup.
- `cashDirection.ts` — whether a transaction type is money in or money out.

HTTP: `routes/bankAccounts.routes.ts`, `routes/creditCards.routes.ts`.
