[Index](../INDEX.md)

# Unlock a password-protected statement

`W-IMPORT-002` · Import

**Goal:** Import a PDF or Excel file that is encrypted.
**Who:** Same as [W-IMPORT-001](W-IMPORT-001.md).
**Before you start:** Know the password (often PAN in capitals, or PAN + date of birth DDMMYYYY).

| # | You do | The app does |
|---|---|---|
| 1 | Click the **Needs password** chip | Opens "Unlock <file>" |
| 2 | Type the password; leave **Remember this password for future locked files** ticked if you want it reused | — |
| 3 | Click **Unlock** | Runs the import again; shows "Password accepted — reprocessing" |
| 4 | Look at the row | **Completed**/**Partial** if unlocked; still **Needs password** if the password was wrong |

**Success:** The row leaves **Needs password**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Still **Needs password** after "Password accepted" | Wrong password (the toast does not say so) | Try again with another password |
| "Reprocessing timed out — try a smaller file" | Over 5 minutes | Split the file |
