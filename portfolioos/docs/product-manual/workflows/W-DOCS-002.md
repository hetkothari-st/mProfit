[Index](../INDEX.md)

# Fix a document that needs attention

`W-DOCS-002` · Documents

**Goal:** File documents the sorter could not file.
**Who:** [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
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
