# services/accounting/

Double-entry books and the Tally export.

- `accounting.service.ts` — chart of accounts (default tree), accounts, vouchers.
- `tally/` — the one-click Tally ZIP export: ledger naming, account-group mapping, XML, validation and packaging.

HTTP: `routes/accounting.routes.ts`, the Tally export under `routes/reports.routes.ts`. Tests: `test/services/accounting/tally/`.
