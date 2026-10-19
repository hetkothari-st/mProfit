# services/integrity/

Can the numbers be trusted?

- `storedDataIntegrity.service.ts` — the nightly check that stored holdings and gains still match a replay of the transactions.
- `reportDataQuality.service.ts` — the data-quality verdict, banner and stamp shown on reports and downloads.
- `statementReconciliation.service.ts` — reconciles imported CAS closing units against transactions.

Job: `jobs/dataIntegrityJob.ts`. HTTP: via `routes/reports.routes.ts`.
