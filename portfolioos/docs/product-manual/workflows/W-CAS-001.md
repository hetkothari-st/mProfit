[Index](../INDEX.md)

# Request a CAS and get it imported

`W-CAS-001` · CAS

**Goal:** Get a mutual fund or depository CAS into the app.
**Who:** Any signed-in user.
**Before you start:** Connect Gmail if you want the PDF imported automatically.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → CAS**, choose **Provider**, optionally PAN, email and dates | — |
| 2 | Click **Generate Request** | Shows **Open provider portal**, **Instructions**, **Next steps** |
| 3 | Open the portal and submit the provider's form | The provider emails a locked PDF |
| 4 | If Gmail is connected, wait (or click **Scan inbox** on **Asset Classes → Mutual Funds**) | The attachment becomes an import job |
| 5 | Otherwise download the PDF and upload it on **Tools → Import** | As [W-IMPORT-001](W-IMPORT-001.md) |

**Success:** The CAS row in **Import history** is **Completed**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Validation failed" on **Generate Request** | PAN not 10 characters or bad email | Fix or clear the field |
| CAS row **Needs password** | Password not PAN / PAN+DOB, or profile missing them | [W-IMPORT-002](W-IMPORT-002.md) |
