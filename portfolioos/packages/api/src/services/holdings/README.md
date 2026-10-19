# services/holdings/

Portfolios, transactions, and the holdings derived from them. **Holdings are never edited directly.** They are
replayed from transactions and corporate actions (`holdingsProjection.ts`).

- `portfolio.service.ts`, `portfolioGroup.service.ts` — portfolio CRUD, scope-aware listing, and groups of portfolios.
- `transaction.service.ts` — transaction create/update/delete/list; every write triggers a projection recompute.
- `holdingsProjection.ts` — `recomputeForAsset` / `recomputeForPortfolio`: FIFO replay into `HoldingProjection`.
- `holdings.service.ts` — read API over the projection (compatibility shim for code that used the legacy `Holding` table).
- `holdingsAsOf.service.ts` — holdings and prices as of a past date.
- `assetKey.ts` — the canonical identity of an instrument (`stock:` / `fund:` / `isin:` / `name:` key).
- `masterData.service.ts` — stock and mutual-fund master lookups and search.
- `priceStaleness.ts`, `valuationMethod.ts` — how each asset class is valued, and when its price counts as stale.

HTTP: `routes/portfolios.routes.ts`, `routes/transactions.routes.ts`, `routes/portfolioGroups.routes.ts`, `routes/assets.routes.ts`.
