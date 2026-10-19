# services/imports/

What happens to imported data after a source parser (in `src/ingestion/`) has read it.

- `import.service.ts` — import jobs: upload → parse → preview → confirm. State lives on the `ImportJob` row.
- `canonicalEvents.service.ts` — review queue for `CanonicalEvent`s: list, edit, approve or reject, then project.
- `ingestionFailures.service.ts` — the dead-letter queue (`IngestionFailure`): write, list, resolve.
- `sourceHash.ts` — deterministic idempotency keys (natural-key and positional hashes).
- `duplicates.service.ts`, `duplicateMatch.ts` — find and remove duplicate transactions.
- `templateSeeds.service.ts` — pre-seeded sender templates for first-run Gmail setup.

Worker: `jobs/importWorker.ts`. HTTP: `routes/imports.routes.ts`, `routes/canonicalEvents.routes.ts`, `routes/ingestionFailures.routes.ts`.
