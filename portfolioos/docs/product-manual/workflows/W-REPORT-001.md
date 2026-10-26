[Index](../INDEX.md)

# Check your data before trusting a report

`W-REPORT-001` · Reports

**Goal:** Make sure the figures in Reports are complete before filing or sharing them.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager).
**Before you start:** Have your transactions imported.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Reports** | Runs data checks ("Checking your data…") |
| 2 | If amber/red, click **See N issues** | Lists each issue with up to 20 examples |
| 3 | For "Some sales are for more units than were ever bought …", click **Add purchase** or **Review N matching purchase(s) from email** | Opens the pre-filled transaction form or the email review page ([D-REPORT-001](../dependencies.md#d-report-001), [D-REPORT-002](../dependencies.md#d-report-002)) |
| 4 | For "Some saved holdings do not match the transactions …", click **Fix now** | Rebuilds stored holdings and gains; toast "Rebuilt N holding(s) from your transactions" |
| 5 | Come back to Reports | "All data checks passed. Data as of: …" |

**Success:** Green line "All data checks passed."
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Could not rebuild holdings" | Repair failed | Retry; the nightly 02:15 IST job also repairs ([F-REPORT-017](../features/F-REPORT-017.md)) |
| "Data checks could not be run, so these reports have not been verified." | Check request failed | Reload the page |
| Prices flagged as old | Price older than 5 days (2 for crypto) | Wait for the price jobs; check the asset's identifier |
