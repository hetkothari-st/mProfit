[Index](../INDEX.md)

# Documents

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

**Documents** (sidebar **Tools → Documents**, route `/documents`) is a document sorter: you drop PDFs and photos, and the app reads each one on the server, works out whose document it is and what kind (ITR, Form 16, bank statement and so on), files it into a folder for that person and renames it. It is a Plus feature.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-DOCS-001](../features/F-DOCS-001.md) | Upload documents to sort | Live | Accepts many files at once (by drag-and-drop or Choose files), uploads them in groups of 10, and lists the latest 12 with their progress: … |
| [F-DOCS-002](../features/F-DOCS-002.md) | How documents are read and filed | Live | For each uploaded PDF or image, the server extracts text, decides the document type, the person's name and the document date, finds or … |
| [F-DOCS-003](../features/F-DOCS-003.md) | Browse person folders | Live | Shows "<n> people · <m> files" and one folder card per person ("<n> files · <k> types", "· auto-created" when made automatically), plus an … |
| [F-DOCS-004](../features/F-DOCS-004.md) | View, download or delete a file | Live | For each file: view it in the app (PDFs and images), download it, or delete it after a second confirmation. |
| [F-DOCS-005](../features/F-DOCS-005.md) | Move or assign a file | Live | Moves a file to another person and/or type — or assigns a file that could not be sorted — creating a new person folder if needed, and … |
| [F-DOCS-006](../features/F-DOCS-006.md) | Unlock a password-protected document | Live | For a PDF stuck at Needs a password, sends the password you type so the file is read again. |
| [F-DOCS-007](../features/F-DOCS-007.md) | Rename or merge person folders | Live | Renames a person's folder, or merges it into another person's folder (all its files move there). |
| [F-DOCS-008](../features/F-DOCS-008.md) | Download folders as ZIP | Live | Downloads filed documents as a ZIP: everything (Download everything), one person (Download all), or one person's type (Zip). |

### What this area doesn't do
- Documents does not import transactions from the files you drop (use **Tools → Import** for that).
- You can't edit a document's date, add tags, or search across documents.
- You can't remember PDF passwords from this page.
- You can't delete a person folder.
