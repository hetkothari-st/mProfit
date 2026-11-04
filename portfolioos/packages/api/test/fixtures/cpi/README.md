# CPI fixtures (MoSPI eSankhyiki)

Real responses captured 2026-11-03 with `curl`. No auth, no headers needed.

| File | Request |
|---|---|
| `mospi-cpi2024-allindia-2026-09-p1.json` | `GET https://api.mospi.gov.in/api/cpi/getCPIData?base_year=2024&series=Current&Format=JSON&limit=100&page=1&year=2026&month_code=9&state_code=1` |
| `mospi-cpi2024-maharashtra-2026-09-p1.json` | same, `state_code=20` |
| `mospi-cpi2024-allindia-2026-10-empty.json` | same, `month_code=10` (not yet released on capture day → `"No Data Found"`) |
| `mospi-cpi2024-limit-error.json` | same, `limit=200` → `{"error":"Limit parameter too large. Maximum allowed is 100."}` |
| `mospi-cpi2012-allindia-2025-09.json` | `GET https://api.mospi.gov.in/api/cpi/getCPIIndex?base_year=2012&series=Current&Format=JSON&limit=200&page=1&year=2025&month_code=9&state_code=99` |
| `mospi-cpi2012-maharashtra-2025-09.json` | same, `state_code=27` (old-series code for Maharashtra) |

Facts measured while capturing (not assumed):

- Base-2024 series starts January 2026; 2025 months return no data.
- Base-2024 with a `state_code` filter: page 1 (limit 100) begins with all 39
  division-level rows (13 divisions × Rural/Urban/Combined, `group: null`),
  followed by group/class/item rows. Limit max 100, min 10.
- Base-2012 series ends December 2025. Limit max 200. `year` accepts a comma
  list; rows come back newest month first.
- A missing reading is JSON `null` (e.g. rural Housing in the old series, and
  Maharashtra combined Housing). It is never `0`.
- The two series number states differently: base-2024 `1` = All India,
  base-2012 `99` = All India. Mapping lives in `@everypaisa/shared` `CPI_STATES`.
