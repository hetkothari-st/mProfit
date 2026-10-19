# services/rental/

Rental properties, tenancies and the rent ledger.

- `rental.service.ts` — rental property and tenancy CRUD, rent receipts and property expenses.
- `rentalLedger.service.ts`, `rentalLedgerMath.ts` — the tenancy ledger: credits are allocated to rent due, and receipt status is derived from that.
- `rental.reminders.service.ts` — rent reminders (queue, supersede, approve or reject).

Job: `jobs/rentalJobs.ts`. HTTP: `routes/rental.routes.ts`.
