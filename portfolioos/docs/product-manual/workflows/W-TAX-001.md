[Index](../INDEX.md)

# Enter grandfathering FMV and download Schedule 112A

`W-TAX-001` · Tax Planning

**Goal:** Use the 31-Jan-2018 price for equity bought before that date so long-term gains are not overstated.
**Who:** [R-FREE](../roles.md#r-free) and up; [R-MANAGER](../roles.md#r-manager).
**Before you start:** Have sales of pre-31-Jan-2018 equity in the FY.

| # | You do | The app does |
|---|---|---|
| 1 | **Planning → Tax Planning**, pick **Financial Year**, open **Grandfathering (112A FMV)** | Shows rows; "Rows requiring FMV" count |
| 2 | Click **Enter FMV** on a row, type the closing price, press **Enter** | Saves the override ("edited"), starts a recompute, reloads tables |
| 3 | Repeat until "All FMVs are filled in" | Gain with FMV and Tax benefit update |
| 4 | Click **Schedule 112A CSV (with FMV)** | Saves `schedule-112a-grandfathering-<FY>.csv` |

**Success:** CSV with the FMV column filled.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Value not kept, no message | Save failed | Retry; reload |
| "no ISIN" | Row has no ISIN | Add the ISIN to the transaction |
| CSV is your own data although a member is selected | These buttons ignore **Download reports for** | Sign in as / manage that member instead |
