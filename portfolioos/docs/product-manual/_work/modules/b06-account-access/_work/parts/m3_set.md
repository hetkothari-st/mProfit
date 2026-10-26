## Settings

**Tools → Settings** (also the header user menu → **Profile & Settings**, route `/settings`) holds your profile, your plan, two-factor sign-in, email notifications, loan rate alerts, the desktop app, a link to AI connectors, an admin-only link to loan rates, and the account-deletion "Danger zone". The page header reads "Settings — Manage your profile and account preferences".

### Profile (name, phone, PAN, date of birth) <!-- F-SET-001 -->
**What it does:** Lets you edit your full name, phone, PAN and date of birth. Your email is shown but cannot be changed.

**Why it exists:** The page hint says the date of birth is "Used only as a password for encrypted CAS PDFs (CAMS sometimes uses PAN+DOB)". PAN is stored encrypted; the code comment says the full PAN was removed from the profile payload because it ended up in the browser's storage.

**Where to find it:** **Tools → Settings → Profile**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. While managing a family member's account (R-MANAGER) this card still edits your own profile.

**Steps**
1. Edit **Full name**, **Phone**, **PAN** and/or **Date of birth**.
2. Click **Save profile**. Toast "Profile updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Full name** | Text | Your display name | — |
| **Email** | Text | Shows your sign-in email | Always disabled |
| **Phone** | Text | Your phone | — |
| **PAN** | Text, upper-case, max 10 | Sets a new PAN | — |
| **Date of birth** | Date | Your date of birth | — |
| **Save profile** | Button | Saves | Disabled while saving |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Full name | Text | Yes | 2–100 characters | Current name | Generic length message from the form library (no custom text) |
| Phone | Text | No | Any text | Current phone | — |
| PAN | Text | No | 5 letters, 4 digits, 1 letter; trimmed and upper-cased | Always blank (your saved PAN is never shown here) | "Invalid PAN format (e.g., <sample PAN>)" |
| Date of birth | Date | No | YYYY-MM-DD | Current date of birth | "Use YYYY-MM-DD" |

**Settings and toggles here:** None.

**Results:** Your profile is updated; the header greeting uses the new name. A typed PAN replaces the stored one (encrypted, with only the last 4 characters kept readable for masking).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Invalid PAN format (e.g., …)" | PAN not in the form five letters, four digits, one letter | Correct it |
| "Update failed" | Server error | Try again |

**Limitations:** The PAN box is always empty — there is no indication in Settings whether a PAN is already saved, and leaving it blank keeps the saved one; you cannot clear a saved PAN here. The Phone box sends whatever is typed, so clearing it saves an empty phone. You cannot change your email.

**How it works:** PATCH `/api/auth/me` with only the fields sent. The server validates the same PAN pattern ("Invalid PAN format"), stores PAN in encrypted columns, and returns your profile with the PAN masked (XXXXX + last part) and a `hasPan` flag. The full PAN can be read only through a separate audited, rate-limited (5 a minute) endpoint used by the mutual fund CAS mailback dialog (D-AUTH-002).

**Related features:** F-SET-002, D-AUTH-002.

**Sources:** `apps/web/src/pages/settings/SettingsPage.tsx:21`, `apps/web/src/pages/settings/SettingsPage.tsx:50`, `apps/web/src/pages/settings/SettingsPage.tsx:94`, `apps/web/src/pages/settings/SettingsPage.tsx:119`, `packages/api/src/controllers/auth.controller.ts:75`, `packages/api/src/services/auth/auth.service.ts:61`, `packages/api/src/services/auth/auth.service.ts:668`, `packages/api/src/controllers/auth.controller.ts:201`, `packages/api/src/middleware/rateLimit.ts:196`

### Plan card <!-- F-SET-002 -->
**What it does:** Shows your current plan and your "I am" role, with a link to **Pricing**.

**Why it exists:** Inferred from behavior: tells you which plan is in force.

**Where to find it:** **Tools → Settings → Plan** (right of Profile).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — view only. Click **Pricing** in "To change your plan, go to Pricing." to change plan.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Pricing** | Link | Opens `/pricing` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The plan and role are shown as raw codes (for example `PRO_ADVISOR`, `INVESTOR`). The plan's end date is not shown anywhere in the app.

**How it works:** Reads your profile; the plan shown is the effective plan (a lapsed paid plan shows `FREE`, F-PLAN-004).

**Related features:** F-PLAN-001, F-PLAN-004.

**Sources:** `apps/web/src/pages/settings/SettingsPage.tsx:135`, `apps/web/src/pages/settings/SettingsPage.tsx:140`, `apps/web/src/pages/settings/SettingsPage.tsx:148`, `packages/api/src/services/auth/auth.service.ts:65`

### Two-factor sign-in <!-- F-SET-003 -->
**What it does:** Turns on sign-in with an authenticator-app code, shows 10 one-time backup codes, replaces them, or turns two-factor off.

**Why it exists:** The card text: "Add a second step to signing in … Someone who learns your password still can't get in." It is also required for the professional workspace (R-PROF) and admin tools (R-ADMIN).

**Where to find it:** **Tools → Settings → Two-factor sign-in**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Off state: click **Turn on**. The dialog "Set up your authenticator app" shows a QR code and, under "Can't scan? Enter this key in the app:", the key in groups of 4.
2. Scan it, type the 6-digit **Code from the app**, click **Turn on**. Toast "Two-factor sign-in is on".
3. "Your backup codes" lists 10 codes: "Save these somewhere safe, like a password manager. Each code signs you in once if you lose your phone. They won't be shown again." Use **Copy** or **Download**, then **I've saved them**.
4. On state: the card shows "On — Signing in needs a code from your authenticator app. N backup codes left."
5. **New backup codes**: enter a current code in "Replace your backup codes?" and click **Replace codes**; the new 10 codes are shown once.
6. **Turn off**: enter a code (app or backup) in "Turn off two-factor sign-in?" and click **Turn off**. Toast "Two-factor sign-in is off".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Turn on** (card) | Button | Starts setup | Only when off; disabled while starting |
| **Turn on** (dialog) | Button | Confirms the code | Disabled until 6 digits |
| **Copy** / **Download** | Buttons | Copy the codes, or download `everypaisa-backup-codes.txt` | — |
| **I've saved them** | Button | Closes | — |
| **New backup codes** | Button | Opens replace dialog | Only when on |
| **Replace codes** | Button | Confirms | Disabled until at least 6 characters |
| **Turn off** (card / dialog) | Buttons | Opens / confirms turning off | Dialog button disabled until at least 6 characters |
| **Cancel** | Button | Closes the dialog | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Code from the app | Numeric | Yes | 6 digits | Empty | "That code didn't match. Check the time on your phone and try the newest code." |
| Code (turn off / replace) | Text | Yes | 6–20 characters; app code or backup code | Empty | "That code didn't match." |

**Settings and toggles here:** S-SET-001 **Two-factor sign-in** — on: every sign-in asks for a code; off: password or Google only.

**Results:** On: the next sign-ins require a code (F-AUTH-004); your current session is swapped for one marked as two-factor-verified, so the professional workspace opens without signing in again; you get an email "Two-factor sign-in turned on". Off: secret and backup codes deleted; email "Two-factor sign-in turned off".

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Two-factor sign-in is already on." | Setup started twice | Close and reload |
| "Start setup first." | The dialog's setup expired | Click **Turn on** again |
| "That code didn't match. Check the time on your phone and try the newest code." | Wrong code or phone clock off | Fix the phone's time; use the newest code |
| "Two-factor sign-in is off." | Tried to replace codes while off | — |
| "Too many auth attempts" | Rate limit (shared 20 per 15 minutes) | Wait |

**Limitations:** Turning off or replacing codes needs a current code, not your password (so it also works for Google-only accounts). If you lose both your phone and all backup codes there is no self-service recovery in the app.

**How it works:** POST `/api/auth/me/2fa/setup` stores a pending secret (encrypted) and returns an `otpauth://` URI (issuer "EveryPaisa", SHA-1, 6 digits, 30 s); the QR code is drawn in the browser so the secret never goes to a QR service. `/enable` verifies a code, promotes the secret, creates 10 backup codes (8 characters from an alphabet without look-alikes, stored as HMACs) and returns a new two-factor session. `/disable` and `/backup-codes` require an accepted code. Each change is audited.

**Related features:** F-AUTH-004, F-SET-014, F-PLAN-003, F-SET-013, W-SET-001.

**Sources:** `apps/web/src/pages/settings/TwoFactorSection.tsx:45`, `apps/web/src/pages/settings/TwoFactorSection.tsx:124`, `apps/web/src/pages/settings/TwoFactorSection.tsx:155`, `apps/web/src/pages/settings/TwoFactorSection.tsx:246`, `packages/api/src/services/auth/twoFactor.service.ts:34`, `packages/api/src/services/auth/twoFactor.service.ts:47`, `packages/api/src/services/auth/twoFactor.service.ts:92`, `packages/api/src/services/auth/twoFactor.service.ts:102`, `packages/api/src/services/auth/twoFactor.service.ts:158`, `packages/api/src/services/auth/twoFactor.service.ts:175`, `packages/api/src/controllers/auth.controller.ts:322`, `packages/api/src/lib/totp.ts:8`

### Email notifications (Connect Gmail, Send test) <!-- F-SET-004 -->
**What it does:** Connects your Gmail account so EveryPaisa can send rent reminders from your own address, and lets you send yourself a test email.

**Why it exists:** The card text: "Rent reminders are sent via your Gmail account. One-time sign-in, no passwords stored."

**Where to find it:** **Tools → Settings → Email notifications**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Not connected: read "Sign in with your Google account to allow EveryPaisa to send rent reminders on your behalf…" and click **Connect Gmail**. You are taken to Google.
2. After Google, the app continues to the Gmail scan setup page (B07, D-SET-001).
3. Connected: the card shows "Gmail connected" and the Gmail address, with **Reconnect**.
4. Under **Send test email**, type an address and click **Send test**. Toast "Test email sent to <address>".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google consent | Only when not connected; disabled while starting |
| **Reconnect** | Button | Runs Google consent again | Only when connected |
| Test address | Email field | Recipient | Only when connected |
| **Send test** | Button | Sends "EveryPaisa — test email" | Disabled with an empty address or while sending |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Test address | Email | Yes | Valid email (server) | Empty | Server "Validation failed" for a malformed address |

**Settings and toggles here:** S-SET-003 **Gmail connection** — connected: reminders and tests go through Gmail; not connected: tests fail with "Connect Gmail above first".

**Results:** A Gmail connection is stored (shared with inbox import). Test emails arrive from your Gmail address.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Test failed — Connect Gmail above first" | No active Gmail connection | **Connect Gmail** |
| "Test failed — Click Reconnect — the current Gmail grant is missing the send permission" | Connected before the send permission was added | **Reconnect** |
| "Test failed — <reason>" | Gmail API error | Reconnect or try later |
| "Could not start Google sign-in" | Could not get the Google link | Try again |

**Limitations:** The note under the button says "You'll be redirected to Google, then back here", but the app goes to the Gmail scan setup page. The grant includes Gmail read-only access, so it also enables inbox import (B07). There is no "Disconnect" here; that is in the Inbox area.

**How it works:** **Connect Gmail** fetches the Google consent URL from the Gmail API module (scopes `gmail.readonly` and `gmail.send`) and navigates there. GET `/api/notifications/status` reports whether an active Gmail OAuth mailbox with a refresh token exists and its address. POST `/api/notifications/test` sends through the Gmail API only; it never falls back to SMTP.

**Related features:** F-SET-005, F-SET-015, D-SET-001, D-SET-002.

**Sources:** `apps/web/src/pages/settings/NotificationsSection.tsx:29`, `apps/web/src/pages/settings/NotificationsSection.tsx:50`, `apps/web/src/pages/settings/NotificationsSection.tsx:146`, `packages/api/src/routes/notifications.routes.ts:16`, `packages/api/src/services/notifications/config.service.ts:203`, `packages/api/src/services/notifications/config.service.ts:226`, `packages/api/src/services/notifications/gmailSender.service.ts:33`, `packages/api/src/ingestion/gmail/gmail.connector.ts:24`

### Loan rate alerts <!-- F-SET-005 -->
**What it does:** One checkbox that turns refinance and repo-rate/MCLR-change alerts for your loans on or off.

**Why it exists:** The code comment calls it the "opt-out: refinance and repo/MCLR change alerts for this profile's loans. Default on."

**Where to find it:** **Tools → Settings → Loan rate alerts** — "Checked every morning against live lender rates and RBI / MCLR changes."

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER changes the managed person's setting.

**Steps**
1. Tick or untick "Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes".
2. Toast "Loan rate alerts on" or "Loan rate alerts off".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Alert checkbox | Checkbox | Saves immediately | Disabled while saving |
| **Try again** | Button | Reloads the setting | Shown only after "Couldn't load this setting." |

**Fields and rules:** Not applicable — one checkbox.

**Settings and toggles here:** S-SET-002 **Loan rate alerts** — on (default): alerts may be raised; off: none.

**Results:** The setting is saved on your account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load this setting." | Load failed | **Try again** |
| "Couldn't save - try again" | Save failed | Click again |

**Limitations:** The alerts themselves are produced by the loan module (B04); this card only switches them.

**How it works:** GET/PUT `/api/notifications/preferences` with `{ loanRateAlerts: true|false }` (no other keys accepted) reads and writes `User.loanRateAlerts`. Because `/api/notifications` is not an account route, while managing a family member it applies to that person.

**Related features:** D-SET-003.

**Sources:** `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:13`, `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:41`, `apps/web/src/pages/settings/LoanRateAlertsCard.tsx:53`, `packages/api/src/controllers/alertPrefs.controller.ts:7`, `packages/api/src/services/notifications/alertPrefs.service.ts:4`, `packages/api/prisma/schema.prisma:176`

### Desktop app download and version <!-- F-SET-006 -->
**What it does:** Offers the EveryPaisa desktop app for Windows or Mac (latest published release), in Settings and as a **Desktop app** link in the header; inside the desktop app, shows which version is running.

**Why it exists:** The card text: "EveryPaisa in its own window on your computer, with the same account and data. It keeps itself up to date."

**Where to find it:** **Tools → Settings → Desktop app**, and the header **Desktop app** link (download icon, wider screens only).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO on a Windows or Mac computer.

**Steps**
1. In Settings, click **Download for Windows** or **Download for Mac** (the one for your computer is highlighted and first). Or click the header link ("Download EveryPaisa for Mac/Windows").
2. Inside the desktop app, the card reads "You're using the EveryPaisa desktop app, version <v>. It updates itself; Help → Check for Updates checks now."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download for Windows** / **Download for Mac** | Link buttons | Download the installer | Hidden when that installer is missing from the release |
| Header **Desktop app** | Link | Downloads the installer for your computer | Hidden on phones/tablets (<768px), inside the desktop app, and until a release exists |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** The installer downloads from GitHub.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| The card or header link is missing | No published release yet, GitHub unreachable, a phone/tablet or other OS, or no installer for your OS | Use the web app |

**Limitations:** Only Windows and Mac. Drafts and pre-releases are ignored.

**How it works:** The browser (without your session) calls GitHub's "latest release" API for the app's repository and picks assets named `EveryPaisa-Setup-*.exe` and `*-mac.dmg`. The result is cached for 1 hour and not retried on failure. The desktop app identifies itself to the page with its version.

**Related features:** D-SET-006.

**Sources:** `apps/web/src/pages/settings/DesktopAppSection.tsx:12`, `apps/web/src/pages/settings/DesktopAppSection.tsx:29`, `apps/web/src/pages/settings/DesktopAppSection.tsx:36`, `apps/web/src/components/layout/DesktopDownloadButton.tsx:10`, `apps/web/src/components/layout/DesktopDownloadButton.tsx:24`, `apps/web/src/lib/desktopApp.ts:44`, `apps/web/src/lib/desktopApp.ts:51`, `apps/web/src/lib/desktopApp.ts:64`

### Delete account (30-day grace, restore, purge) <!-- F-SET-007 -->
**What it does:** Schedules your account and all its data for permanent deletion in 30 days, signs you out everywhere and locks the account. Signing in during those 30 days offers to restore it. After 30 days a nightly job erases everything.

**Why it exists:** The privacy promise: "delete the account outright — which deletes the data, not just the login". The code comment explains the grace period and the three confirmations.

**Where to find it:** **Tools → Settings → Danger zone → Delete account** ("Permanently erase your account and all its data. You get 30 days to change your mind.").

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Blocked while you created a family that still has other members.

**Steps**
1. Click **Delete account**. "Delete your account?" lists what is erased: Portfolios, transactions, holdings and capital gains; Bank accounts, FDs, loans, credit cards and insurance policies; Property, vehicles, rental records and goals; Uploaded documents, statements and photos; Connected Gmail and broker links.
2. If you own a family with members, a red box says "You own a family with other members: <names>. Remove the members or hand over the family first." and **Continue** is disabled.
3. Click **Continue**. In "Confirm it's you", type `DELETE` and your **Password**, or click "Signed up with Google? Email me a code instead", then **Send code** and type the 6-digit **Code from your email**.
4. Click **Continue**. "Last chance" warns you will be signed out everywhere.
5. Click **Delete my account** (or **Keep my account**). Toast "Your account will be deleted on <date>. Sign in before then to restore it." and you land on **Sign in**.
6. To undo: sign in within 30 days and click **Restore account** (F-AUTH-001).

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
| "You own a family with other members (…). Remove the members or hand over the family before deleting your account." | You created a family others are still in | Remove members or hand over on the Family page (D-SET-005) |
| "Please wait a minute before requesting another code" | Code requested within 60 seconds | Wait |
| "We could not send the confirmation email. Please try again shortly." | Mail failed (production) | Try later or use your password |
| "Enter your password, or request an email code" | Neither given | Enter one |
| "Could not delete the account" | Other failure | Try again |

**Limitations:** Two-factor sign-in is not asked for during deletion (password or emailed code is enough). If someone joins your family during the 30 days, the purge skips the account until the blocker is gone. Restoring requires signing in; there is no restore link in an email.

**How it works:** GET `/api/auth/me/deletion` returns blockers (families you created with other members) and the grace days (30). POST `/api/auth/me/deletion/code` emails a code (subject "Confirm deleting your EveryPaisa account", 60-second cooldown). POST `/api/auth/me/deletion` checks DELETE, the password or code, and blockers, then in one transaction sets the deletion dates and revokes refresh tokens; audit `account_deletion_requested`. A repeat request returns the existing date. The purge job runs daily at 03:30 IST (system context), re-checks blockers, deletes rows with restrictive foreign keys first, then the user (most data cascades), then files inside the upload folders; audit `account_purged`.

**Related features:** F-AUTH-001, F-AUTH-003, D-SET-005, W-SET-002.

**Sources:** `apps/web/src/pages/settings/DeleteAccountSection.tsx:26`, `apps/web/src/pages/settings/DeleteAccountSection.tsx:82`, `apps/web/src/pages/settings/DeleteAccountSection.tsx:104`, `apps/web/src/pages/settings/DeleteAccountSection.tsx:165`, `packages/api/src/services/account/accountDeletion.service.ts:36`, `packages/api/src/services/account/accountDeletion.service.ts:51`, `packages/api/src/services/account/accountDeletion.service.ts:80`, `packages/api/src/services/account/accountDeletion.service.ts:156`, `packages/api/src/services/account/accountDeletion.service.ts:296`, `packages/api/src/services/account/accountDeletion.service.ts:360`, `packages/api/src/jobs/accountDeletionJob.ts:36`, `packages/api/src/controllers/auth.controller.ts:268`

### Loan rates admin <!-- F-SET-014 -->
**What it does:** Lets an administrator review and correct the lender interest rates shown on the EMI calculator's Live rates tab: approve or reject suspicious readings, set or clear a manual rate, and re-read bank pages.

**Why it exists:** The page description: "Daily lender rates behind the EMI calculator's Live rates tab. A rate you set here wins over the bank page until you clear it."

**Where to find it:** **Tools → Settings → Loan rates → Open loan rates** (card shown only to administrators), route `/settings/loan-rates`.

**Who can use it:** R-ADMIN with two-factor sign-in on and used for this session. Others see "Admins only."

**Steps**
1. Review **Needs review (N)**: each suspicious reading shows lender, type, rate and when it was read. Click **Approve**, or **Reject** then confirm "Reject this reading?" ("It will not be shown to users.").
2. Filter cards with **Lender**.
3. On a lender card, click **Run now** (automatic sources only) to read the bank page again, or **Run all now** at the top ("Started - refresh in a minute").
4. Click **Set rate**, fill **Basis**, **Tenor** (MCLR only), **From (% p.a.)**, **To (% p.a., optional)**, **With effect from (optional)**, **Note (where this rate comes from)**, then **Save rate**.
5. **Clear override** removes your rate after "Clear this override?" ("Users will see the bank page figure again.").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Run all now** | Button | Re-reads every source | Disabled while running |
| **Approve** / **Reject** | Buttons | Review a suspect reading | Disabled while another review runs |
| **Lender** | Select | Filter (All or a lender) | — |
| Mode badge, **Stale** badge | Badges | Source mode; stale data | Stale only when stale |
| **Run now** | Button | Re-read one source | Only for AUTO sources |
| **Set rate** / **Save rate** / **Cancel** | Buttons | Manual override | — |
| **Clear override** | Button | Remove override | Only where an override exists |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Basis | Select | Yes | One of the rate bases | Current basis, else MCLR for MCLR sources / Other | — |
| Tenor | Select | MCLR only | MCLR tenors | 1Y | — |
| From (% p.a.) | Decimal | Yes | 1–2 digits, up to 3 decimals | Empty | "Use a rate like 8.50" |
| To (% p.a., optional) | Decimal | No | Same | Empty | "Use a rate like 8.50" |
| With effect from | Date | No | YYYY-MM-DD | Empty | — |
| Note | Text | Yes | 3–500 characters | Empty | Browser required/min-length check; server "Validation failed" |

**Settings and toggles here:** S-SET-009 **Rate override** — set: your rate is shown to users; cleared: the bank page rate is shown.

**Results:** Users of the EMI calculator see the approved or overridden rates (D-SET-003). Every write is audited.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Turn on two-factor sign-in (Settings) to use admin tools." | Admin without two-factor | Turn it on (F-SET-003) |
| "Sign out and sign in again with your authenticator code to use admin tools." | Session not signed in with a code | Sign out and in again |
| "Too many runs - please wait a minute" | More than 3 runs a minute | Wait |
| "That didn't work" / "Couldn't save the rate" / "Couldn't load loan rates" | Other failures | Retry |

**Limitations:** The Settings card is shown by checking your role in the browser; the server is what enforces access.

**How it works:** `/api/admin/loan-rates` routes require sign-in, the ADMIN role, then a two-factor session. Run calls are limited to 3 per minute per admin. Reads and writes go to the loan-rate tables owned by the loan module (B04).

**Related features:** F-SET-003, D-SET-003.

**Sources:** `apps/web/src/pages/settings/SettingsPage.tsx:176`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:45`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:83`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:97`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:154`, `apps/web/src/pages/settings/LoanRatesAdminPage.tsx:318`, `packages/api/src/routes/adminLoanRates.routes.ts:17`, `packages/api/src/controllers/loanRates.controller.ts:19`, `packages/api/src/middleware/rateLimit.ts:231`, `packages/api/src/lib/professionalMfa.ts:29`

**What this area doesn't do**
- You can't change your email, password or "I am" role here.
- There is no setting for the security notice emails (F-AUTH-008); they always send.
- There is no SMTP/app-password form (the API exists but no page uses it, F-SET-015).
- There is no data export button on this page.
- There is no list of signed-in devices or sessions.
