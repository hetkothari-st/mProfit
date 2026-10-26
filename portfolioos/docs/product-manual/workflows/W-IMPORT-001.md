[Index](../INDEX.md)

# Import a contract note or statement file

`W-IMPORT-001` · Import

**Goal:** Add the trades in a broker contract note, CAS or spreadsheet to a portfolio.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) ([R-MANAGER](../roles.md#r-manager) for the managed person).
**Before you start:** Have at least one portfolio. Add your PAN and date of birth in Settings so locked PDFs open automatically.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Import** | Shows **Upload a file** and **Import history** |
| 2 | Optionally choose **Target portfolio (optional)** | Remembers it for this upload only |
| 3 | Drop the file or click **Choose file** | Shows "Uploading…", then "File uploaded — import running in background" |
| 4 | Wait | The row goes **Pending** → **Processing** → final status; the list refreshes every 2 seconds |
| 5 | If the row shows **Errors**/**Warnings**, click it | Opens "Import issues — <file>" |

**Success:** Row **Completed** with a **Success** count; transactions appear in **Overview → Transactions**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Needs password** | Locked file | Follow [W-IMPORT-002](W-IMPORT-002.md) |
| **Failed**, "No parser accepted this file. …" | Unsupported layout | Export CSV/Excel from the broker, or enter by hand |
| **Failed**, "This PDF contains no extractable text …" | Scanned PDF | Get a text PDF |
| **Partial** | Some rows failed | Open **Errors**, fix by hand, or **Reprocess** later |
| "Uploaded file content does not match its …" | Renamed file | Upload the original |
