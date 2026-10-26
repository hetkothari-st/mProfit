[Index](../INDEX.md)

# Hand a managed account to its owner

`W-FAM-003` · Family

**Goal:** Let a relative whose books were kept for them take over their own account.
**Who:** [R-FAMOWNER](../roles.md#r-famowner) sends; the relative ([R-VISITOR](../roles.md#r-visitor)) claims.
**Before you start:** The relative's email must not already have an EveryPaisa account.

| # | You do | The app does |
|---|---|---|
| 1 | Tree → managed member → **Edit** → **Hand the account to them** | **Their email** appears, pre-filled |
| 2 | **Next**, then **Send email** | Email "<you> has set up your EveryPaisa account" with **Take over my account** ([F-FAM-016](../features/F-FAM-016.md)) |
| 3 | Relative opens the link, sets a password twice, clicks **Take over my account** | Toast "This account is yours now"; dashboard opens ([F-FAM-020](../features/F-FAM-020.md)) |

**Success:** The profile is no longer managed; holdings and family place are unchanged; it leaves the keeper's "Accounts you manage".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "<email> already has an EveryPaisa account…" | Address in use | Use another address |
| "That link has expired." | 14 days passed | Send a new hand-over |
