---
id: F-IMPORT-004
title: "Unlock a password-protected import"
module: "Import"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER"
settings: [S-IMPORT-002]
related: [F-IMPORT-005, F-IMPORT-008]
---

[← Import](../modules/import.md) · [Index](../INDEX.md)

# Unlock a password-protected import

`F-IMPORT-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager)

**What it does:** When a PDF or Excel file is locked and none of the passwords the app tries automatically opens it, the job stops at **Needs password**. Clicking that chip opens a dialog where you type the password; the job is then processed again with it, and the password can be remembered for future files.

**Why it exists:** CAS statements and many broker and bank PDFs are encrypted (usually with your PAN or PAN plus date of birth). The upload screen says: "Password-protected PDFs: enter your PAN when prompted after upload."

**Where to find it:** **Tools → Import → Import history**, amber **Needs password** chip on a row.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro); [R-MANAGER](../roles.md#r-manager) for the managed person's imports.

**Steps**
1. Find the row with **Needs password** and click the chip. The dialog "Unlock <file name>" opens with the text "This file is password-protected. Enter the password to continue."
2. Type the password in **Password**.
3. Leave **Remember this password for future locked files** ticked to save it, or untick it.
4. Click **Unlock** (or press Enter). The dialog closes, a toast says "Password accepted — reprocessing", and the list reloads.
5. Check the row: it moves to **Completed**/**Partial**/**Failed** if the password worked, or stays **Needs password** if it did not.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Needs password** | Chip button | Opens the unlock dialog | Shown only for jobs in that status |
| **Password** | Password input | The file password (max 200 characters, trimmed) | Disabled while submitting |
| **Remember this password for future locked files** | Checkbox | Save the password for automatic use later | Disabled while submitting |
| **Cancel** | Button | Closes without trying | Disabled while submitting |
| **Unlock** | Button | Reprocesses the job with the password | Disabled while submitting or when the field is empty |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Password | Text (hidden) | Yes | 1–200 characters; spaces at the ends removed | Empty | None for a wrong password — see Limitations |
| Remember this password… | Checkbox | No | — | Ticked | — |

**Settings and toggles here:** [S-IMPORT-002](../settings/import.md#s-import-002) **Remember this password for future locked files** — ticked: a password that unlocks the file is added to your saved file passwords (newest first, at most 10) and tried automatically on every later locked file; a password shaped like a PAN (five letters, four digits, one letter) is instead saved as your profile PAN if you have none. Unticked: the password is used once and not kept. Nothing is saved when the password does not unlock the file.

**Results:** The job runs again inline with the password. If it unlocks, transactions are added and the password may be saved as described above.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Toast "Password accepted — reprocessing" but the row is still **Needs password** | The password was wrong; the server reports success for the request itself | Click the chip again and try another password |
| Row warning "PDF is password-protected. Set your PAN (and date of birth if your statement uses PAN+DOB) in Settings, or enter the password directly." | No saved password or profile detail was available to try | Enter the password, or add PAN/date of birth in Settings |
| Row warning "PDF is password-protected and saved passwords did not unlock it. Enter the correct password to retry." | Automatic passwords were tried and failed | Enter the password |
| "Excel file is password-protected. Enter the password to unlock and import." | Encrypted XLSX | Enter the password |
| "Reprocessing timed out — try a smaller file" | The run took longer than 5 minutes | Split the file |
| "Too many import requests" | More than 10 reprocess/upload requests in a minute | Wait a minute |

**Limitations:** A wrong password closes the dialog with a success toast; you only see the failure in the row status. The password itself is never stored on the job; a job re-queued after a server restart asks for it again.

**How it works:** Before asking you, the pipeline tries, in order: any password passed with the request, your saved file passwords (encrypted list, at most 10), then candidates built from your profile — PAN; PAN + date of birth as DDMMYYYY; PAN + DDMM; DDMMYYYY; DD/MM/YYYY; DD + three-letter month + YYYY (for example 05Jan1990); your email in lower case; your phone digits (and the last 10 digits if longer). **Unlock** calls `POST /api/imports/:id/reprocess` with `{ password, save }`. The server runs the job inline (bounded at 5 minutes), then re-reads the job: if it is no longer NEEDS_PASSWORD the password counts as having worked and is persisted (PAN-shaped → encrypted profile PAN if empty; otherwise, when `save` is true, prepended to `User.savedFilePasswordsEnc`). A locked job gets no dead-letter record because it is expected to be resolved interactively.

**Related features:** [F-IMPORT-005](F-IMPORT-005.md), [F-IMPORT-008](F-IMPORT-008.md), [D-IMPORT-007](../dependencies.md#d-import-007) (PAN and date of birth in Settings).

**Sources:** `apps/web/src/pages/imports/ImportPage.tsx:46`, `apps/web/src/pages/imports/ImportPage.tsx:280`, `apps/web/src/components/upload/PasswordPromptDialog.tsx:63`, `apps/web/src/components/upload/PasswordPromptDialog.tsx:97`, `apps/web/src/hooks/useUploadWithPasswordRetry.ts:111`, `packages/api/src/controllers/imports.controller.ts:176`, `packages/api/src/controllers/imports.controller.ts:206`, `packages/api/src/controllers/imports.controller.ts:214`, `packages/api/src/lib/userDocPasswords.ts:5`, `packages/api/src/lib/userDocPasswords.ts:47`, `packages/api/src/lib/decryptIfNeeded.ts:187`, `packages/api/src/lib/pdf.ts:92`, `packages/api/src/lib/pdf.ts:119`, `packages/api/src/ingestion/fileImport/runner.ts:168`, `packages/api/src/services/imports/import.service.ts:247`
