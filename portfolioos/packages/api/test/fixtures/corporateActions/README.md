# Corporate-action fixtures

`nse-api-2025-06.json` — trimmed **real** response from NSE's corporate-actions
JSON API, fetched 2026-11-27:

- `GET https://www.nseindia.com/api/corporates-corporateActions?index=equities&symbol=BAJFINANCE`
  (2025 rows kept), and
- `GET ...?index=equities&from_date=01-06-2025&to_date=30-06-2025` (one row per
  kind kept: splits, a bonus, distributions).

`www.nseindia.com` answers with a 301 to `www.nseindia.in`, which served the
JSON (HTTP 200, `application/json`). The old archive CSV
(`archives.nseindia.com/content/equities/corporate_actions.csv`) returns 404.
A two-year `from_date`/`to_date` window came back in one call (4,209 rows).

Public market data only — no user data.
