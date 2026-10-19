# services/forex/

Foreign-currency holdings and the Indian remittance rules around them.

- `forex.service.ts` — forex balances (CRUD, INR valuation, masked account number), LRS remittances and yearly utilisation, TCS credits, and forex-pair P&L.

FX rates: `priceFeeds/fx.service.ts`. HTTP: `routes/forex.routes.ts`. Tests: colocated `forex.test.ts`.
