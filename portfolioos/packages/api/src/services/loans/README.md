# services/loans/

Loans taken and loans given, the EMI calculator, and live lender rates.

- `loans.service.ts` — loans taken: rate fields, EMI, amortisation schedule, current position.
- `loansGiven.service.ts` — money lent to others: schedule and summary.
- `emi/` — EMI calculator export.
- `loanRates/` — scraping lenders' published rates (`sources/`, robots.txt respected, sanity checks, admin).
- `loanChecks/` — checks on a user's existing loans against market rates, and the resulting alerts.

Jobs: `jobs/loanRatesJob.ts`, `jobs/loanChecksJob.ts`. HTTP: `routes/loans.routes.ts`, `routes/loansGiven.routes.ts`, `routes/emi.routes.ts`, `routes/loanRates.routes.ts`, `routes/adminLoanRates.routes.ts`. Tests: `test/emi/`, `test/loanRates/`, `test/loanChecks/`, colocated `loanMath.test.ts`.
