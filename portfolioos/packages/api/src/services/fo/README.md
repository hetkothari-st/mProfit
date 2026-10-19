# services/fo/

Futures & options. Broker connectors and OAuth live in `src/ingestion/fno/`.

- `derivativePosition.service.ts` — open positions, replayed from F&O transactions (like holdings).
- `foPnl.service.ts` — realised/unrealised F&O P&L per portfolio and user.
- `foExpiry.service.ts` — positions nearing expiry and closing them out.
- `foBrokerSync.service.ts` — pulls trades from a connected broker.

Job: `jobs/foExpiryClose.job.ts`. HTTP: `routes/fo.routes.ts`.
