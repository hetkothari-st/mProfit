# services/mf/

Mutual funds.

- `mfAnalytics/` — the MF analytics layer: metrics, peer rank, scoring models (`mfScoring/`), rule engine (`rules/`), verdicts, alternatives and portfolio analysis. Design docs: repo-root `docs/mf-analytics/`.
- `mfcentral/` — MF Central OTP sync.
- `mfCasMailback/` — CAMS/KFintech CAS mailback requests.
- `mfCasparser/` — CDSL/KFintech CAS via the CASParser API.
- `mfOverlap.service.ts` — portfolio overlap between funds.

The source clients these call live in `src/ingestion/` (`mfcentral/`, `mfMailback/`, `casparser/`, `mfFactsheet/`). Jobs: `jobs/mf*.ts`. HTTP: `routes/mf*.routes.ts`.
