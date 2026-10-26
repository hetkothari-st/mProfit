[Index](../INDEX.md)

# Import

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Import** page (sidebar **Tools → Import**, route `/import`) is where you upload broker contract notes, CAS statements, back-office spreadsheets and other statements as files. Every file becomes an *import job* that runs in the background: the app works out what kind of document it is, reads the transactions out of it, adds them to a portfolio, and records what happened in **Import history**. The same pipeline also runs every file that arrives from your Gmail, from the mutual fund CAS upload card, and from inbox scans you approve, so this chapter is also the reference for how imported files are processed everywhere in the app.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-IMPORT-001](../features/F-IMPORT-001.md) | Upload a file | Live | Sends one file (PDF, XLSX, XLS, CSV or TSV, up to 50 MB by default) to the server, optionally into a portfolio you choose, and starts a … |
| [F-IMPORT-002](../features/F-IMPORT-002.md) | Import history | Live | Lists your 50 most recent import jobs, newest first, with File, Type, Status, Rows, Success, Failed, Uploaded (date and time in IST) and … |
| [F-IMPORT-003](../features/F-IMPORT-003.md) | Import issues dialog | Live | Shows why rows of an import were not added: the parser used, a general error, how many rows were skipped as duplicates, the parser's … |
| [F-IMPORT-004](../features/F-IMPORT-004.md) | Unlock a password-protected import | Live | When a PDF or Excel file is locked and none of the passwords the app tries automatically opens it, the job stops at Needs password. |
| [F-IMPORT-005](../features/F-IMPORT-005.md) | Reprocess an import | Live | Runs an existing import job again from its stored copy of the file, without re-uploading. |
| [F-IMPORT-006](../features/F-IMPORT-006.md) | Download the source file | Live | Downloads the original file of an import job under its original file name. |
| [F-IMPORT-007](../features/F-IMPORT-007.md) | Delete import records | Live | Removes one import record, or several selected ones, from Import history together with its stored file. |
| [F-IMPORT-008](../features/F-IMPORT-008.md) | How imported files are read (parsers) | Live | Every import job — from the Import page, the mutual fund CAS card, a Gmail attachment or an approved inbox-scan document — goes through one … |
| [F-IMPORT-009](../features/F-IMPORT-009.md) | Duplicate protection on imports | Live | Stops the same trade from being added twice when you upload a file again, when the same file arrives twice by email, or when a trade … |
| [F-IMPORT-010](../features/F-IMPORT-010.md) | Background processing and automatic recovery | Live | Runs import jobs in a background queue and repairs jobs that get stuck or fail: re-queues jobs left Pending, marks long-dead Processing … |

Settings for this module: [settings/import.md](../settings/import.md)

### What this area doesn't do
- You can't upload more than one file at a time on the Import page (only the first dropped file is sent).
- You can't map columns or preview rows before they are added; parsing and adding happen in one step.
- You can't delete the transactions of an import from **Import history**; deleting an import keeps its transactions.
- You can't change an import's target portfolio after upload.
- You can't read scanned (image-only) PDFs.
- The list of failed rows across all imports (the "Ingestion failures" page) exists but is not linked anywhere in the app.
