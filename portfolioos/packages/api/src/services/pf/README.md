# services/pf/

EPF and PPF accounts. The portal and passbook scrapers live in `src/ingestion/pf/`; the browser extension is in repo-root `extension/`.

- `pfAccounts.service.ts` — PF account CRUD and its asset key.
- `pfCredentials.service.ts` — encrypted portal credentials.
- `pfFetchSessions.service.ts` — the state machine of one fetch session (started → OTP → done/failed).
- `sessionPrompt.ts` — the OTP/captcha prompt shown to the user during a session.
- `uanLookup.service.ts` — Know-your-UAN and password-reset flows.
- `pfCanonicalize.service.ts` — passbook rows → `CanonicalEvent`s.
- `pfNudges.service.ts` — "your PF data is stale" alerts.

Jobs: `jobs/pfFetchWorker.ts`, `jobs/pfNudgeJob.ts`. HTTP: `routes/pf.routes.ts`.
