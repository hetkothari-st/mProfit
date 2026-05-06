# Contract-note fixtures — top 25 Indian brokers

Each subdirectory mirrors a `BrokerDescriptor.id` from
`packages/api/src/data/brokers.ts`. Drop **anonymised** sample contract notes
here so the format-learning pipeline has something to chew on.

## Anonymisation rules (mandatory)

Before committing any sample:

| Field | Replace with |
|---|---|
| Full PAN | `XXXXX1234` (preserve last 4) |
| Aadhaar | `XXXX XXXX 1234` |
| Account / DP / client codes >6 digits | `XXXX1234` |
| Investor name | `TEST USER` |
| Phone | `XXXXXXX1234` |
| DOB | `01-Jan-1990` |
| Email | `test@example.com` |

**Do not commit** files that still carry real PII. CI scans new fixtures
via `test/security/redaction.test.ts` patterns; PRs containing
unredacted PAN/account numbers are blocked.

## File formats accepted

- `*.txt` — already-extracted PDF text. Easiest format; what the Zerodha
  fixtures use.
- `*.pdf` — original PDF (post-anonymisation). Should be password-free
  after anonymisation; if you must keep a password, document in
  `passwords.json` next to the file (this file is gitignored).
- `*.html` / `*.htm` — broker email body if the broker emails trade
  details inline (e.g. ICICI Direct pre-2024 format).

Filename convention: `<broker>-<segment>-<sequence>.{txt,pdf,html}` e.g.
`groww-eq-01.txt`, `upstox-fno-03.txt`.

## Per-broker minimum

Each broker directory should contain **≥5** samples covering:

1. Equity delivery BUY
2. Equity delivery SELL
3. Equity intraday round-trip
4. F&O futures (if broker supports)
5. F&O options (CE + PE, if broker supports)

Brokers without F&O support (rare) substitute with multi-trade equity
samples.

## Expected outputs (golden tests)

Once samples are present, run:

```bash
pnpm --filter @portfolioos/api test test/fixtures/contract_note
```

The first run snapshots the parsed output to
`test/fixtures/__snapshots__/parsers.fixtures.test.ts.snap`. Subsequent
runs fail if parser output drifts. Updating a snapshot is a deliberate
release action — review the diff carefully.

## Format learning

When 3+ samples land for a `(brokerId, structureHash)` pair, the
template-learning job (Phase 5-A §6.4) calls Claude Haiku to derive a
deterministic regex recipe and stores it in `LearnedTemplate`. Subsequent
parses for that pair go through the recipe — zero LLM cost — until the
recipe's confidence drops below threshold (e.g. broker changes format)
at which point it falls back to LLM, learns a new recipe, and bumps the
template version.

## Adding a new broker

1. Add a `BrokerDescriptor` to `packages/api/src/data/brokers.ts`.
2. `mkdir test/fixtures/contract_note/<id>/`.
3. Drop ≥5 anonymised samples.
4. Document any quirks (password rule, regional variation) in
   `BrokerDescriptor.notes`.
