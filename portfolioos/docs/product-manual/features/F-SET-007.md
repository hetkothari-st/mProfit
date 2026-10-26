---
id: F-SET-007
title: "Delete account (30-day grace, restore, purge)"
module: "Settings"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-AUTH-001, F-AUTH-003]
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Delete account (30-day grace, restore, purge)

`F-SET-007` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Schedules your account and all its data for permanent deletion in 30 days, signs you out everywhere and locks the account. Signing in during those 30 days offers to restore it. After 30 days a nightly job erases everything.

**Why it exists:** The privacy promise: "delete the account outright — which deletes the data, not just the login". The code comment explains the grace period and the three confirmations.

**Where to find it:** **Tools → Settings → Danger zone → Delete account** ("Permanently erase your account and all its data. You get 30 days to change your mind.").

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). Blocked while you created a family that still has other members.

**Steps**
1. Click **Delete account**. "Delete your account?" lists what is erased: Portfolios, transactions, holdings and capital gains; Bank accounts, FDs, loans, credit cards and insurance policies; Property, vehicles, rental records and goals; Uploaded documents, statements and photos; Connected Gmail and broker links.
2. If you own a family with members, a red box says "You own a family with other members: <names>. Remove the members or hand over the family first." and **Continue** is disabled.
3. Click **Continue**. In "Confirm it's you", type `DELETE` and your **Password**, or click "Signed up with Google? Email me a code instead", then **Send code** and type the 6-digit **Code from your email**.
4. Click **Continue**. "Last chance" warns you will be signed out everywhere.
5. Click **Delete my account** (or **Keep my account**). Toast "Your account will be deleted on <date>. Sign in before then to restore it." and you land on **Sign in**.
6. To undo: sign in within 30 days and click **Restore account** ([F-AUTH-001](F-AUTH-001.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Delete account** | Button | Opens the dialog | — |
| **Continue** (step 1) | Button | Next | Disabled while loading or when blocked |
| **Cancel** | Button | Closes | — |
| **Type DELETE to confirm** | Text | Confirmation | — |
| **Password** | Password | Identity check | Hidden in code mode |
| "Signed up with Google? Email me a code instead" / "Use my password instead" | Links | Switch method | — |
| **Send code** / **Resend** | Button | Emails a code | Disabled while sending |
| **Continue** (step 2) | Button | Next | Disabled until DELETE is typed exactly and a password or 6-digit code is entered |
| **Back** | Button | Step 1 | — |
| **Keep my account** / **Delete my account** | Buttons | Cancel / confirm | Disabled while deleting |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Confirmation | Text | Yes | Exactly `DELETE` | Empty | "Type DELETE to confirm" |
| Password | Password | One of password/code | Your password | Empty | "Incorrect password" |
| Code from your email | Numeric | One of password/code | 6 digits, 10-minute expiry, 5 tries | Empty | "That code is incorrect or has expired. Request a new one." |

**Settings and toggles here:** None.

**Results:** Immediately: deletion date set to now + 30 days, all refresh tokens revoked (every device signed out), sign-in refused until restored. After 30 days: the account and its rows are erased, including stored import files, transaction photos and Gmail attachments; families you created, your Succession plan, wills, AI-connector grants and Split groups nobody else is in; and any client records you kept as a professional.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You own a family with other members (…). Remove the members or hand over the family before deleting your account." | You created a family others are still in | Remove members or hand over on the Family page ([D-SET-005](../dependencies.md#d-set-005)) |
| "Please wait a minute before requesting another code" | Code requested within 60 seconds | Wait |
| "We could not send the confirmation email. Please try again shortly." | Mail failed (production) | Try later or use your password |
| "Enter your password, or request an email code" | Neither given | Enter one |
| "Could not delete the account" | Other failure | Try again |

**Limitations:** Two-factor sign-in is not asked for during deletion (password or emailed code is enough). If someone joins your family during the 30 days, the purge skips the account until the blocker is gone. Restoring requires signing in; there is no restore link in an email.

**How it works:** GET `/api/auth/me/deletion` returns blockers (families you created with other members) and the grace days (30). POST `/api/auth/me/deletion/code` emails a code (subject "Confirm deleting your EveryPaisa account", 60-second cooldown). POST `/api/auth/me/deletion` checks DELETE, the password or code, and blockers, then in one transaction sets the deletion dates and revokes refresh tokens; audit `account_deletion_requested`. A repeat request returns the existing date. The purge job runs daily at 03:30 IST (system context), re-checks blockers, deletes rows with restrictive foreign keys first, then the user (most data cascades), then files inside the upload folders; audit `account_purged`.

**Related features:** [F-AUTH-001](F-AUTH-001.md), [F-AUTH-003](F-AUTH-003.md), [D-SET-005](../dependencies.md#d-set-005), [W-SET-002](../workflows/W-SET-002.md).

**Sources:** `apps/web/src/pages/settings/DeleteAccountSection.tsx:26`, `apps/web/src/pages/settings/DeleteAccountSection.tsx:82`, `apps/web/src/pages/settings/DeleteAccountSection.tsx:104`, `apps/web/src/pages/settings/DeleteAccountSection.tsx:165`, `packages/api/src/services/account/accountDeletion.service.ts:36`, `packages/api/src/services/account/accountDeletion.service.ts:51`, `packages/api/src/services/account/accountDeletion.service.ts:80`, `packages/api/src/services/account/accountDeletion.service.ts:156`, `packages/api/src/services/account/accountDeletion.service.ts:296`, `packages/api/src/services/account/accountDeletion.service.ts:360`, `packages/api/src/jobs/accountDeletionJob.ts:36`, `packages/api/src/controllers/auth.controller.ts:268`
