# Workflows and Troubleshooting — Data in (B07)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Import, Email ingestion, Gmail connection and inbox scans, CAS, Documents

<!-- BEGIN WORKFLOWS -->
## Import a contract note or statement file <!-- W-IMPORT-001 -->
**Goal:** Add the trades in a broker contract note, CAS or spreadsheet to a portfolio.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER for the managed person).
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
| **Needs password** | Locked file | Follow W-IMPORT-002 |
| **Failed**, "No parser accepted this file. …" | Unsupported layout | Export CSV/Excel from the broker, or enter by hand |
| **Failed**, "This PDF contains no extractable text …" | Scanned PDF | Get a text PDF |
| **Partial** | Some rows failed | Open **Errors**, fix by hand, or **Reprocess** later |
| "Uploaded file content does not match its …" | Renamed file | Upload the original |

## Unlock a password-protected statement <!-- W-IMPORT-002 -->
**Goal:** Import a PDF or Excel file that is encrypted.
**Who:** Same as W-IMPORT-001.
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

## Recover a failed or partial import <!-- W-IMPORT-003 -->
**Goal:** Get the missing rows of a failed or partial import in.
**Who:** Same as W-IMPORT-001.
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

## Set up email ingestion <!-- W-INGEST-001 -->
**Goal:** Have transaction alerts from your bank, broker or insurer emails read automatically.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (not while managing another account).
**Before you start:** A Gmail account that receives the alerts. The server must have the AI parser switched on (operator).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Inbox → Connect your Gmail** and click **Connect Gmail** | Sends you to Google |
| 2 | Choose the account and allow access | Returns to the app: "Connected <email>", then **Choose how far back to scan** |
| 3 | Click **Skip for now** (or start an inbox scan, W-MAIL-001), then go back to **Inbox → Connect your Gmail** | Step 2 **Senders to monitor** is now open |
| 4 | Click **Scan inbox** | Lists likely financial senders with scores |
| 5 | Tick the senders (use full addresses, not `@domain`) and click **Add <n> senders** | "Added <n> sender(s)"; senders start **Active** with auto-commit on |
| 6 | Optional: open **Sender settings** and switch auto-commit off for senders you want to review | Their events will wait in **Pending review** |
| 7 | Wait for the next poll (default every 3 minutes) | New events appear in **Pending review** or are written directly |

**Success:** Events from your senders appear under step 3 or in **See committed / rejected → Auto-committed**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| No events ever appear | AI parser disabled on the server, or `@domain` senders | Ask the operator; add full addresses |
| "Switch back to your own account to do this." | Managing another account | **Back to my account** |
| Account shows **Paused**, "Gmail access lost …" | Google rejected the grant | **Add another** with the same account |

## Review and approve email events <!-- W-INGEST-002 -->
**Goal:** Decide which parsed events become records.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** W-INGEST-001 done.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Inbox → Connect your Gmail**, step 3 | Lists waiting events by sender |
| 2 | Click a row to check details, or **View original in Gmail** | Shows amount, type, counterparty, confidence, notes |
| 3 | Click **Approve & commit** (or the tick) | "Event approved and committed"; a transaction or cash-flow entry is created |
| 4 | Or type a **Rejection reason (optional)** and click **Reject** | "Event rejected" |
| 5 | For a trusted sender with several events, click **Approve all** | "Bulk approved: <a> succeeded, <f> failed of <n>" |
| 6 | When the banner offers it, click **Enable auto-commit** | Future confident events skip review |

**Success:** The queue shows "Inbox is clear".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Approval rolled back — projection failed: …" | Missing amount/quantity or no portfolio | Reject and enter by hand, or create a portfolio |
| Approved SIP/FD/rent event created nothing | Those types are only marked handled | Enter the record by hand |

## Connect Gmail and back-fill with an inbox scan <!-- W-MAIL-001 -->
**Goal:** Pull years of statements and contract notes from Gmail at once.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | Connect Gmail (W-INGEST-001 steps 1–2) | Opens **Choose how far back to scan** |
| 2 | Pick **Scan from**/**Scan until** or a preset (default 5 years) | — |
| 3 | Click **Start scan** | "Scan started — review docs as they appear"; opens **Reports → Inbox imports** |
| 4 | Approve the documents you want in **Reports → Inbox imports** | Each approved document becomes an import job in **Tools → Import** |

**Success:** Approved documents show **Completed** in **Import history**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "lookbackTo must be after lookbackFrom" | Same day chosen twice | Pick a range of at least two days |
| "Connect Gmail before starting a scan" | No active Gmail | Connect again |
| "Too many requests for this operation. Please wait a minute." | More than 5 scans in a minute | Wait |

## Request a CAS and get it imported <!-- W-CAS-001 -->
**Goal:** Get a mutual fund or depository CAS into the app.
**Who:** Any signed-in user.
**Before you start:** Connect Gmail if you want the PDF imported automatically.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → CAS**, choose **Provider**, optionally PAN, email and dates | — |
| 2 | Click **Generate Request** | Shows **Open provider portal**, **Instructions**, **Next steps** |
| 3 | Open the portal and submit the provider's form | The provider emails a locked PDF |
| 4 | If Gmail is connected, wait (or click **Scan inbox** on **Asset Classes → Mutual Funds**) | The attachment becomes an import job |
| 5 | Otherwise download the PDF and upload it on **Tools → Import** | As W-IMPORT-001 |

**Success:** The CAS row in **Import history** is **Completed**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Validation failed" on **Generate Request** | PAN not 10 characters or bad email | Fix or clear the field |
| CAS row **Needs password** | Password not PAN / PAN+DOB, or profile missing them | W-IMPORT-002 |

## Sort documents into folders <!-- W-DOCS-001 -->
**Goal:** File personal documents by person and type.
**Who:** R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Plus plan or higher.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Documents** | Shows the drop area and folders |
| 2 | Drop PDFs/photos or click **Choose files** | Uploads in groups of 10, shows progress |
| 3 | Wait | Files are read and filed: "Filed into <person> / <type>" |
| 4 | Open a person folder | Files grouped by type, renamed "<Type>_<date>" |

**Success:** All files are in person folders; **Needs attention** is gone.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Files in **Needs attention** | Name not found, locked, unreadable or unsupported type | W-DOCS-002 |
| "Documents is locked" | Free plan | Upgrade |

## Fix a document that needs attention <!-- W-DOCS-002 -->
**Goal:** File documents the sorter could not file.
**Who:** R-PLUS, R-FAMILY, R-PRO.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | Click **Needs attention** | Lists unfiled files with their reason |
| 2 | For **Needs a password**: click **Enter password**, type it, click **Unlock** | Reads the file again |
| 3 | For **Needs review** / **Could not be read**: click **Assign**, choose **Person** (or **New person…**) and **Document type**, click **Move and rename** | "Moved and renamed"; the file is filed |
| 4 | If an auto-created folder duplicates a person, open it and use **Merge into…** + **Merge** | "Folders merged" |

**Success:** **Needs attention** disappears.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This document is still being read. Try again in a moment." | Still processing | Wait |
| "Enter a name using letters only" | Invalid new person name | Use letters only |
| "A folder with that name already exists. Merge the two folders instead." | Rename clash | Merge instead |
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| "Too many import requests" | More than 10 uploads/reprocesses per minute | Wait a minute |
| "Internal server error" when dropping a file | Unsupported file extension (Import or Documents) | Use a supported type |
| Import stuck at **Pending** | Job queue unavailable at upload time | Re-queued on the next server start; or **Reprocess** |
| New email events not visible | Lists refresh only on load or **Refresh** | Click **Refresh** |
| Gmail account still listed after disconnect | The card is not refreshed automatically | Click **Refresh** |
| "Gmail access lost … Click Reconnect on the Mailboxes page." | Google grant revoked or expired; the named page no longer exists | Click **Add another** on **Inbox → Connect your Gmail** and sign in with the same account |
<!-- END TROUBLESHOOTING -->
