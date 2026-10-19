# services/valuation/

`quoteService.ts` produces a vehicle valuation quote: cache check → the adapter chain in `src/ingestion/valuation/` → price bucket → cache write. HTTP: `routes/valuation.routes.ts`.
