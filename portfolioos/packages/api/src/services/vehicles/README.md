# services/vehicles/

Vehicles the user owns.

- `vehicles.service.ts` — vehicle CRUD (registration numbers encrypted at rest).
- `challans.service.ts` — traffic-challan scans, on demand and monthly.

RC/challan lookups and valuations live in `src/ingestion/vehicle/` and `src/ingestion/valuation/`. Job: `jobs/vehicleJobs.ts`. HTTP: `routes/vehicles.routes.ts`, `routes/valuation.routes.ts`.
