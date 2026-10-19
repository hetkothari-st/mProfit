# services/insurance/

Insurance policies.

- `insurance.service.ts` — policy CRUD; policy numbers are normalised and hashed for lookup.
- `insuranceCoverage.service.ts` — the coverage view (who and what is covered, and the gaps).
- `insuranceExtras.service.ts` — matches imported premium payments to policies.

Job: `jobs/insuranceJobs.ts`. HTTP: `routes/insurance.routes.ts`.
