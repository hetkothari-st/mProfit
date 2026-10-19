# ingestion/

Everything that brings data in from outside and turns it into our shapes. Fetching, scraping, OAuth clients and
parsing live here. What the app then *does* with the data lives in `services/<feature>/`.

- Pipeline pieces at this root: `hash.ts` (idempotency `sourceHash`), `pii.ts` (redaction before LLM calls),
  `projection.ts` (CanonicalEvent → Transaction/CashFlow), `templates.ts` + `contractNoteTemplates.ts` (learned
  email templates), `types.ts` (the shared adapter contract).
- One folder per source:
  - `gmail/`: OAuth connector, inbox discovery, poller, classifier, body extraction.
  - `zerodha/`: Kite OAuth connector.
  - `finfactor/`: Finvu account-aggregator client, consent and sync.
  - `casparser/`: CASParser API client.
  - `llm/`: Claude parsing with a budget cap.
  - `fileImport/`: uploaded statement and contract-note runner, plus `parsers/` (one per file format).
  - `fno/`: F&O broker connectors and `brokerOauth/` (Kite, Upstox, Angel login).
  - `mfcentral/`, `mfMailback/`: MF Central and CAS mailback.
  - `mfFactsheet/`: per-AMC factsheet parsers.
  - `pf/`: EPFO and per-bank PPF passbooks.
  - `vehicle/`: RC, challan and photo lookups.
  - `valuation/`: used-vehicle prices.
  - `otpDriven/`: shared OTP-flow types.
- Every parser declares `{id, version}`. A format change adds a new version file (`*.v2.ts`); never edit a tested
  parser in place.
- Tests mirror this tree under `packages/api/test/ingestion/`.
