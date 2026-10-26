[Index](../INDEX.md)

# Recover a failed or partial import

`W-IMPORT-003` · Import

**Goal:** Get the missing rows of a failed or partial import in.
**Who:** Same as [W-IMPORT-001](W-IMPORT-001.md).
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Errors** on the row and read the reasons | Shows warnings and row errors |
| 2 | Fix the cause (create a portfolio, set PAN, get a text PDF) | — |
| 3 | Click the reprocess icon | Runs again from the stored copy; only missing rows are added |
| 4 | Or wait | The app retries **Failed**/**Partial** jobs automatically up to 3 times (nightly at 02:15 IST and after restarts, at least an hour after the last run) |

**Success:** Row **Completed**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Failed** with no **Errors** button | Worker stopped the job; reason not displayed | Reprocess or upload again |
| "Source file not found on server" | Very old job without a stored copy | Upload again |
