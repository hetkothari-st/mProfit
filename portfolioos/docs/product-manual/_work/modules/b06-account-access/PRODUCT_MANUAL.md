# EveryPaisa User Manual — Account & access (B06 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Sign-in & session (`/login`, `/register`, `/forgot-password`, session handling, Sign out, unknown-page screen), First-run setup (`/onboarding`), Settings (`/settings`, `/settings/loan-rates`), Account Access (`/settings/professional-access`), Connections (`/settings/ai-connectors`, `/connect/authorize`, `/connectors`), Plans & billing (`/pricing`), Legal pages (`/legal/ai-use`, `/privacy`)

## Contents
- [Sign-in & session](#sign-in--session)
- [First-run setup](#first-run-setup)
- [Settings](#settings)
- [Account Access](#account-access)
- [Connections](#connections)
- [Plans & billing](#plans--billing)
- [Legal pages](#legal-pages)
- [Roles and profiles](#roles-and-profiles)
- [Glossary](#glossary)

<!-- BEGIN MODULES -->

## Sign-in & session

Everything about getting into EveryPaisa and staying in: signing in with email and password or Google, creating an account (proved by an emailed code), the optional two-factor step, resetting a forgotten password, how a session is kept alive and ended, the security emails the app sends about sign-ins, and the screen shown for an address that does not exist.

### Sign in with email and password <!-- F-AUTH-001 -->
**What it does:** Signs you in with the email and password of an existing account and opens the page you were heading for. If the account has two-factor sign-in on, it asks for a code next (F-AUTH-004). If the account is scheduled for deletion, it offers to restore it instead.

**Why it exists:** Every page inside the app needs a signed-in session. The code comments state that the sign-in result is the same for unknown accounts and wrong passwords so it "can't be used to probe for accounts", and that an explicit `?next=` destination wins because "the person was in the middle of something — accepting an invitation, usually".

**Where to find it:** The **Sign in** page (route `/login`). Any signed-in page you open while signed out sends you here first. From **Create your account**, the footer link **Sign in**.

**Who can use it:** R-VISITOR (anyone with an account). Accounts created by a professional for a client who has no login (shadow clients), deactivated accounts and unknown emails are all refused with the same message.

**Steps**
1. Open `/login`. The page shows "Sign in" and "Track all your Indian investments in one place."
2. Type your **Email** and **Password**.
3. Leave **Remember me on this device** ticked to stay signed in after closing the browser, or untick it.
4. Click **Sign in**. A spinner shows while the request runs.
5. On success the toast "Welcome back, <first name>!" appears and you land on: the `?next=` address if one was given; else the setup wizard if this account left setup unfinished in this browser; else the page that sent you to sign in; else **Dashboard**.
6. If two-factor sign-in is on, the form is replaced by the code step (F-AUTH-004).
7. If the account is scheduled for deletion, a red box says "This account is scheduled for deletion on <date>. Restore it to keep your data and sign in." Click **Restore account** to cancel the deletion and sign in, or **Cancel**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Email** | Email field | Account email | — |
| **Password** | Password field with show/hide | Account password | — |
| **Remember me on this device** | Checkbox | See S-AUTH-001 | — |
| **Sign in** | Button | Submits | Disabled while signing in |
| **Forgot password?** | Link (twice: under the form, and inside the "Incorrect email or password." message) | Opens `/forgot-password` with the typed email carried over | — |
| Google button ("Sign in with Google") | Google button | F-AUTH-003 | Replaced by a notice when the web build lacks a Google client id |
| **Create one** | Footer link | Opens `/register`, keeping any `?next=` | — |
| **Restore account** / **Cancel** | Buttons in the deletion notice | Restore and sign in / dismiss | Shown only for an account pending deletion |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Email | Text | Yes | Valid email; lower-cased by the server | Email carried from the sign-up page, else empty | "Enter a valid email address" |
| Password | Text | Yes | At least 1 character | Empty | "Password is required" |

**Settings and toggles here:** S-AUTH-001 **Remember me on this device** — ticked: the session survives closing the browser; unticked: it ends with the tab.

**Results:** A new session (15-minute access token, 30-day refresh token) is stored in this browser. The server records a `login` audit entry and may email a new-device notice (F-AUTH-008).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Incorrect email or password." (under the password) | Wrong email or password, unknown account, deactivated account, or a client record with no login | Check both fields or use **Forgot password?** |
| "This account is scheduled for deletion on <date>…" | You asked to delete the account within the last 30 days | **Restore account** cancels the deletion |
| "Too many auth attempts" | More than 20 sign-in-type requests from your network address in 15 minutes | Wait up to 15 minutes |
| "Login failed" | Any other failure (network, server) | Try again |

**Limitations:** The "Incorrect email or password." message never says which of the two was wrong. The 20-per-15-minutes limit counts every sign-in, sign-up, reset and code request from the same network address together. Whether setup resumes after sign-in depends on a flag kept only in this browser.

**How it works:** POST `/api/auth/login` with email and password. The server looks the user up; for an unknown or inactive account it still runs a bcrypt comparison against a dummy hash so the response takes as long as a real wrong password. Passwords are bcrypt with cost 12. A shadow client is refused with "Invalid credentials". With two-factor on, the response is a challenge, not a session. A pending deletion is refused with code `ACCOUNT_PENDING_DELETION` (status 403) unless `restore: true` is sent, in which case the deletion dates are cleared and `account_deletion_cancelled` is audited. A successful sign-in writes audit `login`; a failed one writes `login_failed` with the email only, and after exactly 5 failures in 15 minutes emails the account owner (F-AUTH-008). The access token carries user id, email, role and the effective plan (F-PLAN-004). The landing page is decided by one rule shared with the already-signed-in redirect: `?next=` (internal paths only — anything not starting with a single `/` or containing a backslash is ignored), then unfinished setup, then the page that redirected you, then `/dashboard`. A signed-in person who opens `/login` is redirected by the same rule.

**Related features:** F-AUTH-003, F-AUTH-004, F-AUTH-005, F-AUTH-006, F-AUTH-008, F-SET-007, F-ONB-005, D-AUTH-001.

**Sources:** `apps/web/src/pages/auth/LoginPage.tsx:23`, `apps/web/src/pages/auth/LoginPage.tsx:51`, `apps/web/src/pages/auth/LoginPage.tsx:181`, `apps/web/src/pages/auth/loginRedirect.ts:24`, `apps/web/src/hooks/useNextPath.ts:25`, `apps/web/src/components/auth/RestoreAccountNotice.tsx:34`, `packages/api/src/controllers/auth.controller.ts:121`, `packages/api/src/services/auth/auth.service.ts:376`, `packages/api/src/services/auth/password.service.ts:3`, `packages/api/src/services/account/accountDeletion.service.ts:216`, `packages/api/src/middleware/rateLimit.ts:159`

### Create an account (email verification code) <!-- F-AUTH-002 -->
**What it does:** Creates a new EveryPaisa account in two steps: you enter your details, the app emails a 6-digit code, and the account exists only once that code is entered. You are then signed in and taken to the setup wizard.

**Why it exists:** The code comment: "Nobody gets an account for an address they haven't proven they can read." Every new account starts on the Free plan; the form note says upgrades "happen via /pricing + billing, never by self-selecting a paid tier here".

**Where to find it:** **Create your account** page (route `/register`), from **Sign in → Create one**.

**Who can use it:** R-VISITOR.

**Steps**
1. Open `/register`. The page shows "Create your account" and "Consolidate every asset. Automate capital gains. Stay ITR-ready."
2. Fill in **Full name**, **Email**, **Password** and **Confirm password**.
3. Pick **I am** (Individual Investor, HNI, Family Office, Financial Advisor or Chartered Accountant).
4. Click **Create account**. The toast "Verification code sent to <email>" appears and the page changes to "Verify your email".
5. Read the box: "We sent a 6-digit code to <email>. It expires in 10 minutes — check your spam folder if you don't see it."
6. Type or paste the code into **Verification code**. The sixth digit submits automatically; or click **Verify and create account**.
7. On success the toast "Email verified. Welcome to EveryPaisa!" appears and you go to the setup wizard (`/onboarding`), or to the `?next=` address if you came from an invitation.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Create account** | Button | Sends the details and emails a code | Disabled while sending |
| Google button ("Sign up with Google") | Google button | F-AUTH-003 | — |
| **Sign in** (footer, and inside the "already have an account" box) | Link | Goes to `/login`, carrying the email | — |
| **Reset password** | Link (in the "already have an account" box) | Goes to `/forgot-password` | Shown only after the server says the email is taken |
| **Verify and create account** | Button | Submits the code | Disabled until 6 digits are typed, and while verifying |
| **Change details** | Link | Back to the form with your details still filled | — |
| **Resend code** / "Resend code in Ns" | Link | Emails a new code | Disabled during the 60-second cooldown |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Full name | Text | Yes | 2–100 characters | Empty | "Full name is required" |
| Email | Email | Yes | Valid email, stored lower-case | Empty | "Enter a valid email address" |
| Password | Password | Yes | 8–100 characters | Empty | "Minimum 8 characters" |
| Confirm password | Password | Yes | Must equal Password | Empty | "Passwords do not match" |
| I am | Select | Yes | INVESTOR, HNI, FAMILY_OFFICE, ADVISOR, CA (ADMIN refused: "Cannot self-register with this role") | Individual Investor | — |
| Verification code | Numeric | Yes | Exactly 6 digits | Empty | "Enter the 6-digit code" (server) |

**Settings and toggles here:** None. (The new session is always remembered — see S-AUTH-001.)

**Results:** A user account on the Free plan, with the chosen "I am" role (which grants no extra access — see R-FREE). Split-expense placeholders that friends created with this email are linked to the new account.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "You already have an account with this email." with **Sign in** / **Reset password** | The email is already registered | Sign in or reset the password |
| "Please wait Ns before requesting another code" | A code was sent less than 60 seconds ago | Wait |
| "We could not send the verification email. Please try again in a few minutes." | Mail delivery failed (production) | Try again later |
| "Incorrect code. N attempts left." | Wrong code | Retype it; after 5 wrong tries request a new code |
| "Too many incorrect attempts. Request a new code." | 5 wrong codes | **Resend code** |
| "This code has expired. Request a new one." | More than 10 minutes passed | **Resend code** |
| "No signup in progress for this email. Please start again." | The pending signup was removed (e.g. verified elsewhere) | **Change details** and submit again |

**Limitations:** The "I am" choice is only a label; it does not change features. There is no phone field on the form, although the server accepts one.

**How it works:** POST `/api/auth/register` stores the details in a pending-registration row (password already hashed) with an HMAC of the code bound to the email, attempts 0, expiry now + 10 minutes, and emails the code (subject "Your EveryPaisa verification code"; the code is never put in the subject). If sending fails the pending row is deleted so the cooldown does not block a retry; in non-production the code is written to the server log instead. POST `/register/resend` replaces the code after the 60-second cooldown. POST `/register/verify` checks expiry, attempts (max 5) and the code, then creates the user and deletes the pending row in one transaction, links Split placeholders, and returns a session. If the email was taken in between (for example by a Google sign-in) the answer is "Email already registered".

**Related features:** F-AUTH-001, F-AUTH-003, F-ONB-001, F-PLAN-001, D-AUTH-001, W-AUTH-001.

**Sources:** `apps/web/src/pages/auth/RegisterPage.tsx:22`, `apps/web/src/pages/auth/RegisterPage.tsx:123`, `apps/web/src/pages/auth/RegisterPage.tsx:207`, `apps/web/src/pages/auth/RegisterPage.tsx:294`, `packages/api/src/controllers/auth.controller.ts:33`, `packages/api/src/services/auth/auth.service.ts:132`, `packages/api/src/services/auth/auth.service.ts:217`, `packages/api/src/services/auth/auth.service.ts:259`, `packages/api/src/services/auth/auth.service.ts:277`

### Sign in or sign up with Google <!-- F-AUTH-003 -->
**What it does:** Signs you in with your Google account. If no EveryPaisa account exists for that Google email, one is created on the Free plan and you go to the setup wizard.

**Why it exists:** Inferred from behavior: lets people skip choosing a password. The code comment notes Google users "can later set one via forgot password".

**Where to find it:** The Google button under "or" on **Sign in** (`/login`) and **Create your account** (`/register`).

**Who can use it:** R-VISITOR with a Google account whose email Google has verified.

**Steps**
1. Click the Google button. Google's popup opens; pick your account.
2. "Signing in…" shows under the button.
3. Existing account: toast "Welcome back, <first name>!" and you land on `?next=`, the unfinished setup, or **Dashboard**. New account: toast "Welcome to EveryPaisa, <first name>!" and you land on `?next=` or the setup wizard.
4. If two-factor is on, the code step appears (on `/register` you are first sent to `/login` to enter it).
5. If the account is scheduled for deletion, the restore box appears (as in F-AUTH-001).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Google button | Google-rendered button | Starts Google sign-in in a popup | Replaced by "Google sign-in unavailable (admin: set VITE_GOOGLE_CLIENT_ID)." when not configured |
| **Restore account** / **Cancel** | Buttons | As in F-AUTH-001 | Only for a pending deletion |

**Fields and rules:** Not applicable — no fields; Google supplies the identity.

**Settings and toggles here:** S-AUTH-001 — on `/login` the Google button follows the **Remember me on this device** box; on `/register` the session is remembered.

**Results:** Same session as F-AUTH-001. A new account gets the name from Google (or the part of the email before @), role Individual Investor, plan Free, and an unusable random password.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Invalid Google credential" | Google's token could not be verified | Try again |
| "Google account email is not verified" | Google says the email is unverified | Verify the email with Google |
| "Google sign-in is not configured. Set GOOGLE_OAUTH_CLIENT_ID on the server." | Operator configuration missing | Contact the operator |
| "Invalid credentials" | The email belongs to a client record a professional keeps (no login) | Ask that professional to invite you properly |
| "Account deactivated" | The account is deactivated | Contact support |
| "Google sign-in failed" | Any other failure | Try again |

**Limitations:** A two-factor check is skipped for a brand-new Google account (nothing to check yet). Google sign-ins are audited as `login` but failed Google attempts are not counted for the failed-sign-in email.

**How it works:** The browser loads Google Identity Services and posts the returned ID token to POST `/api/auth/google`. The server verifies it against the configured client id, requires a verified email, matches an existing user by lower-cased email or creates one, links Split placeholders for a new user, then applies the shadow-client, two-factor and pending-deletion checks in that order. New accounts get status 201 and `isNew: true`. A new-device email (F-AUTH-008) is considered only for existing accounts.

**Related features:** F-AUTH-001, F-AUTH-002, F-AUTH-004, F-SET-007, F-AUTH-008.

**Sources:** `apps/web/src/components/auth/GoogleSignInButton.tsx:100`, `apps/web/src/components/auth/GoogleSignInButton.tsx:111`, `apps/web/src/components/auth/GoogleSignInButton.tsx:127`, `apps/web/src/components/auth/GoogleSignInButton.tsx:181`, `packages/api/src/controllers/auth.controller.ts:232`, `packages/api/src/services/auth/auth.service.ts:618`, `packages/api/src/services/auth/auth.service.ts:645`, `packages/api/src/services/auth/auth.service.ts:662`

### Two-factor code at sign-in <!-- F-AUTH-004 -->
**What it does:** For accounts with two-factor sign-in on, asks for the 6-digit code from your authenticator app, or one of your backup codes, after the password or Google step.

**Why it exists:** The Settings text: "Someone who learns your password still can't get in." It is also how a session gets the "signed in with a second factor" mark that the professional workspace and admin tools require.

**Where to find it:** Appears on the **Sign in** page in place of the form, right after a successful password or Google step.

**Who can use it:** R-VISITOR whose account has S-SET-001 on.

**Steps**
1. Read "Enter the 6-digit code from your authenticator app."
2. Type the code in **Authentication code** and click **Verify and sign in**.
3. Lost your phone? Click **Use a backup code**, type one code such as the ABCD-EFGH pattern shown, then **Verify and sign in**.
4. On success you are signed in exactly as in F-AUTH-001.
5. **Back to sign in** returns to the password form.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Authentication code** / **Backup code** | Text | The code | — |
| **Verify and sign in** | Button | Submits | Disabled until a 6-digit code (or a backup code of at least 8 characters, ignoring spaces and dashes) is typed, and while checking |
| **Use a backup code** / **Use the authenticator app** | Link | Switches between the two kinds | — |
| **Back to sign in** | Link | Cancels the second step | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Authentication code | Numeric | Yes | 6 digits | Empty | "That code didn't match. Try the newest code from your app, or a backup code." |
| Backup code | Text | Yes | 8 letters/digits; spaces and dashes ignored; case-insensitive | Empty | Same as above |

**Settings and toggles here:** S-SET-001 **Two-factor sign-in** — this step appears only when it is on.

**Results:** A session marked as signed in with a second factor, which stays marked across refreshes. Using a backup code uses it up and emails "A backup code was used to sign in" with how many are left.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That code didn't match. Try the newest code from your app, or a backup code." | Wrong or already-used code | Wait for the next code; each 30-second code works once |
| "Too many wrong codes. Please sign in again." | 5 wrong codes on this attempt | Start again from the password |
| "This sign-in has expired. Please sign in again." | More than 5 minutes since the password step, or the step was already used | Sign in again |
| "This sign-in has already been used. Please sign in again." | Two submissions raced | Sign in again |

**Limitations:** A code is accepted for the 30-second step before and after the current one, but never the same step twice. Restoring a pending-deletion account waits until this step passes.

**How it works:** The password/Google step returns a challenge token (a signed token of type `mfa`, valid 5 minutes, which cannot be used as a session) tied to a challenge row. POST `/api/auth/2fa/verify` checks the challenge (not consumed, not expired, under 5 attempts), then accepts a TOTP code (SHA-1, 6 digits, 30-second period, ±1 step) newer than the last accepted step, or an unused backup code (stored as an HMAC). The fifth wrong code burns the challenge. Success writes audit `login` with which factor was used; failure writes `login_failed` with reason `second_factor`.

**Related features:** F-SET-003, F-AUTH-001, F-AUTH-003, W-AUTH-002.

**Sources:** `apps/web/src/components/auth/TwoFactorChallenge.tsx:20`, `apps/web/src/components/auth/TwoFactorChallenge.tsx:34`, `packages/api/src/services/auth/twoFactor.service.ts:32`, `packages/api/src/services/auth/twoFactor.service.ts:130`, `packages/api/src/services/auth/twoFactor.service.ts:209`, `packages/api/src/services/auth/twoFactor.service.ts:244`, `packages/api/src/lib/totp.ts:78`, `packages/api/src/controllers/auth.controller.ts:288`

### Reset a forgotten password <!-- F-AUTH-005 -->
**What it does:** Emails a 6-digit reset code and lets you set a new password with it. Setting a new password signs you out everywhere.

**Why it exists:** The code comment: every outcome "is identical whether or not the address has an account — no distinct errors, no skipped delay", so the page cannot be used to find out who has an account.

**Where to find it:** **Forgot password?** on the Sign in page, or **Reset password** on the sign-up page when the email is taken (route `/forgot-password`).

**Who can use it:** R-VISITOR. Accounts kept by a professional for a client (no login) and deactivated accounts never get a code.

**Steps**
1. Open "Reset your password". Your email is pre-filled if you came from Sign in.
2. Click **Send reset code**. The page changes to "Set a new password" with "If an account exists for <email>, we've sent it a 6-digit code. It expires in 15 minutes — check your spam folder if you don't see it."
3. Enter **Reset code**, **New password** and **Confirm new password**.
4. Click **Reset password**. Toast "Password updated. Sign in with your new password." and you go to **Sign in**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Send reset code** | Button | Requests a code | Disabled while sending |
| **Reset password** | Button | Sets the new password | Disabled while saving |
| **Use a different email** | Link | Back to the email step | — |
| **Resend code** / "Resend code in Ns" | Link | Requests a new code; toast "If the account exists, a new code is on its way" | Disabled for 60 seconds (counted in the browser) |
| **Back to sign in** | Footer link | Goes to `/login` | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Email | Email | Yes | Valid email | Carried from Sign in | "Enter a valid email address" |
| Reset code | Numeric | Yes | 6 digits | Empty | "Enter the 6-digit code" |
| New password | Password | Yes | 8–100 characters | Empty | "Minimum 8 characters" |
| Confirm new password | Password | Yes | Must match | Empty | "Passwords do not match" |

**Settings and toggles here:** None.

**Results:** The password changes, the code is used up and every existing session (refresh token) is revoked, so every device must sign in again.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That code is incorrect or has expired. Check it or request a new one." | Wrong code, expired (15 minutes), 5 wrong tries, an older code, no such account, or a used code | Request a new code |
| No email arrives | No account, a client record with no login, deactivated, a request within 60 seconds of the last one, or delivery failed — the page looks the same in every case | Check the address and spam folder; wait a minute and resend |
| "Too many auth attempts" | Rate limit (20 per 15 minutes per network address) | Wait |

**Limitations:** Only the newest code works; requesting a new one kills earlier ones. The resend countdown in the browser mirrors, but does not read, the server's 60-second cooldown.

**How it works:** POST `/api/auth/forgot-password` always answers "If an account with that email exists, a reset code has been sent." and audits `password_reset_requested`. For a valid account outside the cooldown it marks earlier codes used, stores an HMAC of the new code (prefixed so it can never match a signup code), and emails it (subject "Your EveryPaisa password reset code"). POST `/api/auth/reset-password` checks the newest unused unexpired code, counts wrong attempts (max 5), then in one transaction claims the code, saves the new bcrypt hash and revokes all refresh tokens.

**Related features:** F-AUTH-001, F-AUTH-003 (Google users can add a password this way), W-AUTH-003.

**Sources:** `apps/web/src/pages/auth/ForgotPasswordPage.tsx:19`, `apps/web/src/pages/auth/ForgotPasswordPage.tsx:107`, `apps/web/src/pages/auth/ForgotPasswordPage.tsx:191`, `packages/api/src/controllers/auth.controller.ts:175`, `packages/api/src/services/auth/auth.service.ts:465`, `packages/api/src/services/auth/auth.service.ts:482`, `packages/api/src/services/auth/auth.service.ts:532`, `packages/api/src/services/auth/auth.service.ts:572`

### Staying signed in: resume, refresh and expiry <!-- F-AUTH-006 -->
**What it does:** Keeps you signed in without asking again: it renews your access every 15 minutes in the background, picks your session back up after a reload or in a new tab, and signs you out only when the server rejects the session.

**Why it exists:** The code comments: a rate limit, a server error or "a phone that has lost signal" must not sign you out; only the server rejecting the session may.

**Where to find it:** Not applicable — it runs on every signed-in page. While your session is being resumed you see a spinner.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (any signed-in person).

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-AUTH-001 decides whether the stored session survives closing the browser.

**Results:** You stay signed in for up to 30 days of inactivity on a remembered device. If the session is rejected you are sent to **Sign in**, and after signing in you return to the page you were on.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Sent to Sign in unexpectedly | Refresh token expired (30 days), revoked (signed out, password reset, account deletion), or reused | Sign in again |
| Signed out on every device at once | A refresh token was presented twice — the server treats this as a copied session and revokes all sessions ("Session invalidated — please sign in again") | Sign in again; consider changing your password |
| Endless spinner on load | The network is down; the app keeps retrying with backoff up to 30 seconds | Wait for the connection |

**Limitations:** A plan change made elsewhere (for example a plan that expired) is reflected only at the next refresh, up to 15 minutes later. A non-admin calling an admin-only API gets a "401" which makes the app refresh the session once before showing the error (see DOCUMENTATION_GAPS).

**How it works:** The session (access token, refresh token, expiry) is kept in local or session storage under `everypaisa.auth`; your profile is not stored and is re-fetched from GET `/api/auth/me` on load. A timer refreshes 2 minutes before the 15-minute access token expires (POST `/api/auth/refresh`). Any API call answered 401 (other than `/api/auth/*`) triggers one refresh and a retry. Only one refresh runs at a time, because refresh tokens are single-use. Each refresh revokes the used refresh token, issues a new pair, keeps the "second factor" mark, and refuses deactivated accounts ("Account deactivated"), client records with no login, and accounts scheduled for deletion ("Account scheduled for deletion"). A refresh also counts as activity for Succession inactivity tracking (B03).

**Related features:** F-AUTH-001, F-AUTH-007, F-PLAN-004.

**Sources:** `apps/web/src/components/layout/ProtectedRoute.tsx:12`, `apps/web/src/hooks/useResolvedSession.ts:24`, `apps/web/src/hooks/useResolvedSession.ts:37`, `apps/web/src/hooks/useTokenRefresh.ts:5`, `apps/web/src/components/layout/AppShell.tsx:33`, `apps/web/src/api/client.ts:64`, `apps/web/src/api/client.ts:86`, `apps/web/src/api/client.ts:98`, `apps/web/src/stores/auth.store.ts:120`, `packages/api/src/services/auth/auth.service.ts:411`, `packages/api/src/services/auth/auth.service.ts:427`, `packages/api/src/services/auth/jwt.service.ts:20`

### Sign out <!-- F-AUTH-007 -->
**What it does:** Ends the session in this browser and revokes its refresh token on the server.

**Why it exists:** Inferred from behavior: lets you leave a shared or public device safely.

**Where to find it:** Header user menu (your initials/avatar, top right) → **Sign out**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click your avatar in the header. The menu shows "Signed in as <email>".
2. Click **Sign out**. You land on **Sign in**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Sign out** | Menu item (red) | Signs out | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** This browser's session is removed (including the "viewing as family" selection) and the refresh token is revoked. Other devices stay signed in.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| None shown | A failed revoke call is ignored; the browser session is still cleared | None needed |

**Limitations:** There is no "sign out of all devices" button; resetting your password or deleting the account is the only way to end every session. Sign-outs are not recorded in the audit log (see DOCUMENTATION_GAPS).

**How it works:** POST `/api/auth/logout` with the refresh token marks it revoked. The route has no session check, so the server never knows who signed out: the audit entry and the "everywhere" option (F-AUTH-009) never run.

**Related features:** F-AUTH-006, F-AUTH-009, D-AUTH-004.

**Sources:** `apps/web/src/components/layout/Header.tsx:51`, `apps/web/src/components/layout/Header.tsx:261`, `apps/web/src/stores/auth.store.ts:84`, `packages/api/src/routes/auth.routes.ts:37`, `packages/api/src/controllers/auth.controller.ts:156`, `packages/api/src/services/auth/auth.service.ts:446`

### Security notice emails (new device, failed sign-ins) <!-- F-AUTH-008 -->
**What it does:** Emails you when your account is signed in from a device type not seen in the last 90 days, and when there have been 5 failed sign-in attempts in 15 minutes.

**Why it exists:** The email text: "If it wasn't, reset your password now from the sign-in page".

**Where to find it:** Your inbox. Subjects: "New sign-in to your EveryPaisa account" and "Failed sign-in attempts on your EveryPaisa account".

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO — automatic.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None — these emails cannot be turned off.

**Results:** New-device email: device description, time (IST) and network address of the sign-in, and advice. Failed-sign-in email: "There have been 5 failed attempts to sign in to your account in the last 15 minutes."

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| No email on your first ever sign-in | The first sign-in is not "new device" news | None |
| No email after the 6th or later failure | Only the 5th failure in the window sends one | None |

**Limitations:** "Device" is a coarse description built from the browser's user-agent, so a different browser on the same computer can count as new. Failed Google sign-ins are not counted.

**How it works:** After each audited sign-in the server compares the device description against `login` audit rows from the last 90 days (up to 200). After each audited failure it counts `login_failed` rows for that email in 15 minutes and emails only when the count equals 5. Both run in the background and never block sign-in. Separately, an operator-only scan every 15 minutes looks for credential stuffing and unusual export or PII-reveal volume (operator configuration).

**Related features:** F-AUTH-001, F-AUTH-004, F-AUTH-005.

**Sources:** `packages/api/src/services/security/securityAlerts.service.ts:25`, `packages/api/src/services/security/securityAlerts.service.ts:80`, `packages/api/src/services/security/securityAlerts.service.ts:105`, `packages/api/src/services/security/securityAlerts.service.ts:120`, `packages/api/src/controllers/auth.controller.ts:144`, `packages/api/src/jobs/securityAlertJobs.ts:9`

### Page not found <!-- F-AUTH-010 -->
**What it does:** Shows a friendly screen for an address inside the app that does not exist, instead of silently redirecting.

**Why it exists:** The code comment: redirecting to the dashboard "made a mistyped or out-of-date link look like a broken page".

**Where to find it:** Any unknown address while signed in.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. A signed-out visitor opening an unknown address is sent to **Sign in** first, because this screen sits inside the signed-in area.

**Steps**
1. The screen shows "This page doesn’t exist" and "Nothing lives at <address>. The link may be old or mistyped."
2. Click **Go to dashboard**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Go to dashboard** | Button | Opens `/dashboard` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** None.

**How it works:** It is the catch-all route inside the protected app shell.

**Related features:** F-AUTH-006.

**Sources:** `apps/web/src/pages/notFound/NotFoundPage.tsx:16`, `apps/web/src/App.tsx:282`

**What this area doesn't do**
- You can't change your email address — the Settings email field is read-only, and no API accepts a new email.
- You can't change your password while signed in; use **Forgot password?** instead.
- There is no "sign out of all devices" button, and no list of active sessions or devices.
- Sign-in is by email/password or Google only — no phone/OTP sign-in.
- The "I am" role chosen at sign-up cannot be changed later in the app and does not unlock anything.

## First-run setup

A full-screen wizard (no sidebar) that new accounts see right after signing up: three short welcome panels, a picker of what you own, a quick form per item, and a summary. Every step can be skipped, and everything you add is saved through the same records the full pages use, so it can be refined later.

### Welcome panels <!-- F-ONB-001 -->
**What it does:** Shows three panels before asking for anything: a greeting, what the app does, and what happens to your data.

**Why it exists:** The code comment: "somebody deciding whether to trust a stranger with their net worth has the answer before they are asked for a single number", while "Somebody who wants to get on with entering their fixed deposits can be past all of it in one tap".

**Where to find it:** Route `/onboarding`, reached automatically after sign-up (F-AUTH-002/F-AUTH-003) or when you sign in with setup unfinished in this browser.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Not available while managing a family member's account (R-MANAGER): you are sent to **Portfolios** instead.

**Steps**
1. Panel 1 ("Welcome"): "Let's get your books in order, <first name>." with one randomly chosen line (for example "You cannot compound what you cannot count."). Click **Continue**.
2. Panel 2 ("What you get"): "Built for everything you actually own" with six points — All of it, in one place; Returns you can defend; Your statements do the typing; The whole household; Nothing lapses quietly; Ready for the return. Click **Continue**.
3. Panel 3 ("Privacy"): "Your money is your business" with five commitments and the footer "We are moving to keeping your ledger on your own device. Until that ships, this is exactly what happens to it." Click **Set up my account**.
4. **Skip** on any panel jumps straight to the picker.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Continue** | Button | Next panel | Panels 1–2 |
| **Set up my account** | Button | Ends the panels | Panel 3 |
| **Skip** | Link | Ends the panels | — |
| Three dots | Indicator | Shows which panel you are on | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is saved by the panels themselves; the starter portfolio (F-ONB-002) is created in the background while you read.

**Errors and troubleshooting:** None.

**Limitations:** The privacy panel shows the "hosted" wording. A "data stays on your device" version exists in code but is switched off until that storage model ships.

**How it works:** The panel copy comes from fixed lists in the web app. The privacy copy is chosen by a single constant `STORAGE_MODE`, currently `hosted`.

**Related features:** F-ONB-002, F-ONB-003.

**Sources:** `apps/web/src/pages/onboarding/WelcomePanels.tsx:26`, `apps/web/src/pages/onboarding/WelcomePanels.tsx:43`, `apps/web/src/pages/onboarding/welcomeContent.ts:29`, `apps/web/src/pages/onboarding/welcomeContent.ts:67`, `apps/web/src/lib/privacyPromise.ts:31`, `apps/web/src/lib/privacyPromise.ts:45`, `apps/web/src/components/family/NotWhileManaging.tsx:15`, `apps/web/src/App.tsx:147`

### Starter portfolio created automatically <!-- F-ONB-002 -->
**What it does:** Creates a portfolio called "My Portfolio" (type Investment) for you as soon as the wizard opens, so the things you add have somewhere to go. If you already have a portfolio, it reuses your oldest one instead of creating another.

**Why it exists:** The code comment: "Every holding needs a portfolio, so one is created up front instead of asking the user to name it."

**Where to find it:** Not applicable — automatic when `/onboarding` opens.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — automatic. If it fails you see the error and **Try again**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Try again** | Button | Retries creating the portfolio | Shown only after a failure |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A "My Portfolio" portfolio exists (or your oldest portfolio is used).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not set up your account" (or the server's message) with **Try again** | The create call failed | **Try again** |

**Limitations:** None.

**How it works:** POST `/api/portfolios` with `onboarding: true`. The server skips the plan's portfolio cap for this call and, inside a transaction, returns your oldest portfolio if one exists. The result is cached for the session so it is never posted twice.

**Related features:** F-ONB-004.

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:50`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:104`, `packages/api/src/controllers/portfolio.controller.ts:55`, `packages/api/src/services/holdings/portfolio.service.ts:311`

### "What do you have?" picker <!-- F-ONB-003 -->
**What it does:** Lets you tick the kinds of things you own so the wizard asks only about those.

**Why it exists:** The page text: "Pick everything that applies. You'll add each one with just a few details — rough numbers are fine."

**Where to find it:** `/onboarding`, after the welcome panels.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read "What do you have?".
2. Tick any of: **Savings & investments** — Mutual funds, Stocks, Fixed deposits, PPF / EPF / NPS; **Physical assets** — Gold, Vehicles; **Loans & cards** — Loans, Credit cards; **Protection** — Insurance.
3. Click **Continue**, or **Skip — I'll add things later** to finish without adding anything.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Nine item buttons | Toggle buttons | Select/deselect (a tick shows when selected) | — |
| **Continue** | Button | Starts the quick-add steps, in the order shown on screen | Disabled until at least one item is ticked |
| **Skip — I'll add things later** | Link | Finishes setup (F-ONB-005) | — |

**Fields and rules:** Not applicable — selections only.

**Settings and toggles here:** None.

**Results:** Your selection decides the quick-add steps; it is not saved.

**Errors and troubleshooting:** None.

**Limitations:** Property is deliberately not offered. The code note says the dashboard's net worth reads rental properties only, so a Real Estate entry made here would not show up there. Bank accounts, crypto, bonds and other classes are also not offered.

**How it works:** Steps follow the on-screen order, not the order you tapped.

**Related features:** F-ONB-004, F-ONB-005.

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:114`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:157`, `apps/web/src/pages/onboarding/onboardingItems.ts:19`, `apps/web/src/pages/onboarding/onboardingItems.ts:41`

### Quick-add forms (9 kinds) <!-- F-ONB-004 -->
**What it does:** For each ticked item, shows a short form; each **Add** saves one real record and lists it above the form so you can add another straight away.

**Why it exists:** The code comment: each form "asks for the least a new user is likely to know off-hand, fills every other required field with a sensible estimate, and saves through the same API the full forms use".

**Where to find it:** `/onboarding`, one step per ticked item, with "N of M" and a progress bar.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read the step's prompt (for example "Add each fund with roughly how much you have invested.").
2. Fill the fields and click **Add**. The saved line appears with a tick.
3. Add more, or click **Next** (or **Finish** on the last step). Without any added entry the button says **Skip**.
4. **Back** goes to the previous step, or to the picker from the first step.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** | Button | Saves one entry | Disabled while saving |
| **Next** / **Finish** / **Skip** | Button | Moves on | — |
| **Back** | Link | Previous step | — |
| Search boxes (fund, stock), institution pickers (bank, lender, issuer, insurer) | Search/select | Pick the item | — |

**Fields and rules**
| Form | Fields (exact labels) | What gets saved |
|---|---|---|
| Mutual funds | **Fund** (search), **Amount invested** | A BUY dated today; units = amount ÷ today's NAV, rounded down to 4 decimals; price = NAV |
| Stocks | **Stock** (search), **Shares**, **Avg buy price (₹)** | A BUY dated today at that price (exchange from the search hit, else NSE) |
| Fixed deposits | **Bank**, **Amount (₹)**, **Matures on**, **Interest rate % (optional)** | A deposit named "<bank> FD" dated today with maturity date and rate |
| PPF / EPF / NPS | **Account** (PPF, EPF (Provident Fund), NPS), **Current balance (₹)** | An opening balance dated today |
| Gold | **Purity** (24K, 22K, 18K), **Grams**, **Total paid (₹)** | A BUY of "<purity> Gold"; price per gram = total ÷ grams |
| Vehicles | **Registration no.**, **Vehicle (optional)**, **Current value (₹)** ("Roughly what it would sell for today.") | A vehicle with a manual current value |
| Loans | **Lender**, **Type** (Home, Car, Personal, Education, Gold, Business, Other), **Still owed (₹)**, **EMI (₹)**, **Rate %** | A loan starting today for the amount still owed, first EMI next month on the same day (capped at the 28th); tenure computed from balance, EMI and rate, between 1 and 600 months; prepayment option "reduce tenure" |
| Credit cards | **Issuer**, **Last 4 digits**, **Credit limit (₹)**, **Amount due now (₹)** | A card named "<issuer> Credit Card", statement day today (max 28), due 20 days later; if an amount is due, a statement for this month |
| Insurance | **Type** (Term life, Health, Endowment / LIC, ULIP, Motor, Home, Personal accident), **Insurer**, **Policy number**, **Cover amount (₹)**, **Yearly premium (₹)** | A policy holder = your name, annual premium, start date today |

Amounts accept commas, spaces and ₹ and must be greater than 0: "Enter <what> as a number greater than 0". Other exact messages: "Pick a fund first", "Pick a stock first", "We don't have prices for this fund yet. Try another, or skip and upload your CAS later.", "This fund's latest price is unavailable. Try another fund.", "Enter the bank name", "Pick the maturity date", "Enter the interest rate as a number, e.g. 7.1", "Enter the registration number, e.g. MH01AB1234" (fewer than 5 characters), "Enter the lender", "Enter the interest rate as a number, e.g. 8.5", "That EMI is too low to ever repay this balance at this rate — check the numbers.", "Enter the card issuer", "Enter the last 4 digits of the card", "Enter the amount due as a number", "Enter the insurer", "Enter the policy number". A server failure shows its message or "Could not save this entry".

**Settings and toggles here:** None.

**Results:** Real records appear on the matching pages (Mutual Funds, Stocks, FDs & RDs, PPF & EPF / NPS, Gold & Silver, Vehicles, Loans, Credit Cards, Insurance) and feed the dashboard.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Any validation message above, under the form | Missing or invalid input | Correct and **Add** again |
| A plan or duplicate message from the server | The full feature's server rules apply | Follow the message, or skip and add later from the full page |

**Limitations:** Every entry is an estimate dated today: mutual funds are valued at today's NAV for the amount you entered (a later CAS upload replaces it with real history), loans are recorded as a fresh loan starting today, and card cycle days are guesses to be corrected on the card's page. Vehicles are saved without a portfolio; every other entry goes into the starter portfolio.

**How it works:** Each form calls the regular API for that record type (transactions, vehicles, loans, credit cards plus statement, insurance policies). The loan tenure uses the amortisation formula n = −ln(1 − B·r/EMI) / ln(1 + r) with r = rate ÷ 1200, rounded up; with a 0% rate, n = B ÷ EMI rounded up.

**Related features:** F-ONB-002, F-ONB-005.

**Sources:** `apps/web/src/pages/onboarding/QuickAddForms.tsx:84`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:131`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:170`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:183`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:236`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:300`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:366`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:423`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:471`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:530`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:576`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:650`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:736`

### Finish, skip and resume setup <!-- F-ONB-005 -->
**What it does:** Ends the wizard with a summary and sends you to the dashboard; remembers in this browser if you left setup unfinished so you are brought back to it.

**Why it exists:** The code comment: "an account that started setup and walked away should resume it".

**Where to find it:** The last screen of `/onboarding`, and **Skip — I'll add things later** on the picker.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. After the last step: "You're all set" with "N entries added. Your dashboard is ready — you can refine any of them from its own page." and a count per item — or "Nothing added yet" with "No problem — you can add investments any time from the sidebar."
2. Click **Go to dashboard**, or **Go back and add more** to return to the last step.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Go to dashboard** | Button | Finishes setup | — |
| **Go back and add more** | Link | Back to the last step | Hidden when nothing was ticked |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Setup is marked finished in this browser; all cached data is refreshed; you land on **Dashboard**.

**Errors and troubleshooting:** None.

**Limitations:** Both "setup unfinished" and "setup done" are kept in this browser only. On another device or after clearing site data, the dashboard sends an account with no portfolios to setup again, and a started-but-unfinished setup is not resumed.

**How it works:** Opening the wizard writes `everypaisa.onboarding.inProgress.<userId>` = 1; finishing removes it and writes `onboarding_v2_done` = 1. Sign-in sends you to `/onboarding` while the in-progress flag exists; the dashboard does the same, and also when `onboarding_v2_done` is missing and you have no portfolio.

**Related features:** F-AUTH-001, F-ONB-003, D-AUTH-003, W-ONB-001.

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:44`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:60`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:249`, `apps/web/src/lib/onboardingProgress.ts:12`, `apps/web/src/lib/onboardingProgress.ts:31`, `apps/web/src/App.tsx:151`, `apps/web/src/pages/dashboard/DashboardPage.tsx:358`, `apps/web/src/pages/dashboard/DashboardPage.tsx:367`

**What this area doesn't do**
- It does not ask for your PAN, phone or Gmail — those are in **Settings** and **Inbox**.
- It does not import statements; upload a CAS or contract note later from **Tools → CAS** or **Tools → Import**.
- There is no menu entry to reopen it once finished (typing `/onboarding` opens it again).

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

## Account Access

**Account Access** (sidebar item for everyone, route `/settings/professional-access`, page title "Account access") is where you, the account holder, bring in your CA or advisor and decide what they can see, what they can do and until when. It is never plan-gated: "Whoever can reach someone's financial position, the person it belongs to must be able to see it and stop it." The professional's side of the same relationship (the **Client books** workspace) is documented by the advice/CA chapter (D-SET-004).

### Account Access overview <!-- F-SET-008 -->
**What it does:** Lists every professional relationship in three groups: **With access** (can open your books now), **Waiting to accept** (invited, nothing shared yet) and **Past access** (withdrawn). Each active row shows a "reach" strip: **Sees**, **Can**, **Until**.

**Why it exists:** The code comment: the page answers "who may look at it, what they may look at, and until when" for each professional "at a glance".

**Where to find it:** Sidebar → **Account Access**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. While managing a family member's account (R-MANAGER) the page shows your own relationships, not theirs.

**Steps**
1. Open **Account Access**. While loading, two grey placeholders show.
2. With no relationships: "Nobody else can see your books" with three numbered steps (Invite them by email — a link that "works once and expires in 14 days"; They accept from their own account — "Signing up is free for them"; You decide what they reach) and **Invite a professional**.
3. Otherwise read **With access N** ("These people can open your books right now.") and **Waiting to accept N** ("Nothing of yours is shared until they accept from their own account.").
4. Click **Past access (N)** to expand withdrawn relationships ("No access since <date>").
5. When a professional accepts while the page is open, a toast says "<name> accepted your invitation."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Invite a professional** | Button (header and empty state) | F-SET-009 | — |
| **Manage access** / **Close** | Button | F-SET-010 | Active rows only |
| **Withdraw** | Button | F-SET-011 | Active rows only |
| **Send again** | Button | Opens "Send the invitation again" (same link, same expiry) | Invited rows only |
| **Cancel invitation** | Button | F-SET-011 | Invited rows only |
| **Past access (N)** | Expander | Shows withdrawn rows | Hidden when there are none |
| **Restore** | Button | F-SET-011 | Past rows where someone had accepted |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None directly; the reach strip summarises S-SET-004 to S-SET-008.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Page shows the empty state even though you invited someone | The relationship feature is switched off on this server (ENABLE_FAMILY) | Contact the operator |

**Limitations:** Invited rows show "Link expires <date>"; an expired invitation stays in **Waiting to accept** until you cancel it.

**How it works:** GET `/api/me/professional-access/grants` returns every relationship you are the subject of, including unaccepted invitations, refreshed on a short live interval (and the activity feed at twice that interval). **Sees** reads "Everything" or counts of portfolios/categories/asset classes; **Can** reads "View only", "Make some changes" or "Keep your books"; **Until** reads the end date or "No end date".

**Related features:** F-SET-009, F-SET-010, F-SET-011, F-SET-012, F-SET-013, D-SET-004.

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:55`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:68`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:141`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:187`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:264`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:400`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:470`, `packages/api/src/routes/ca.routes.ts:182`

### Invite a professional (and send the email) <!-- F-SET-009 -->
**What it does:** Creates an invitation for your CA or advisor by name and email, then lets you edit and send the invitation email (or copy the link to send it yourself).

**Why it exists:** The dialog text: "They accept from their own account. Nothing of yours is shared until they do."

**Where to find it:** **Account Access → Invite a professional**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. In this version the email step also needs two-factor sign-in (see Limitations).

**Steps**
1. Click **Invite a professional**. Enter **Their name** and **Their email**. The note says "They start view-only. Once they accept you can let them keep your books, limit them to particular portfolios, and set a date their access ends by itself."
2. Click **Continue to the email**. The invitation is created and the dialog becomes "Send the invitation".
3. Edit **Subject** and **Your message**; the **Preview** updates. "The accept link, the expiry date and your name are added below your message and cannot be removed — that is what lets them tell this apart from a phishing mail."
4. Click **Send email** (shows "N sends left for this invitation"), or the copy button ("Copy the link and send it yourself instead"), or **Later**.
5. After sending: a confirmation with **Done**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Their name**, **Their email** | Text | Who you invite | — |
| **Continue to the email** | Button | Creates the invitation | Disabled until both are filled, and while creating ("Creating…") |
| **Cancel** | Button | Closes without inviting | — |
| **Subject**, **Your message** | Text, textarea | Email text (160 / 4000 characters in the browser) | — |
| Copy link button | Icon button | Copies the accept link | — |
| **Send email** | Button | Sends | Disabled when the server has no mail set up, no sends are left, or while sending |
| **Later** | Button | Closes; the invitation stays in **Waiting to accept** | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Their name | Text | Yes | 1–200 characters | Empty | "A name is required." |
| Their email | Email | Yes | Valid email; not your own; not someone already invited or with access | Empty | "That is your own address — invite the professional you work with." / "<email> already has access to your books." / "You have already invited <email>. Cancel that invitation first, or send it again." |
| Subject | Text | No | Up to 200 (server) | Server default | — |
| Your message | Text | No | Up to 5000 (server) | Server default | — |

**Settings and toggles here:** None (scope is set after they accept, F-SET-010).

**Results:** A pending relationship with a single-use link valid for 14 days. The professional opens it at `/professional-invitations/<token>` (B09).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Preparing the email…" never finishes | The email preview is served from the professional workspace, which requires two-factor sign-in used for this session; without it the request is refused and the page keeps waiting | Turn on two-factor sign-in (F-SET-003), sign in again with a code, then use **Send again** |
| "Email is not configured on this server, so copy the link above and send it yourself." | No mail server configured | Copy the link |
| "This invitation has already been emailed 5 times. Copy the link and send it yourself, or start a fresh invitation." / "No sends left — copy the link instead" | 5 sends per invitation | Copy the link |
| "That invitation has expired. Send a fresh one." | Older than 14 days | Cancel it and invite again |
| "Could not create that invitation" / "Could not send the invitation" | Other failures | Retry |

**Limitations:** Confirmed defect: the email/preview step calls the professional workspace API, which is behind the two-factor gate, so an account holder without two-factor sign-in cannot see, send or copy the invitation link at all (the invitation itself is created). There is also an hourly cap of 20 invitation emails per sender.

**How it works:** POST `/api/me/professional-access/invite` creates a `Client` row with no advisor, status PENDING, initiated by the client, an encrypted single-use token and expiry now + 14 days, and records "CLIENT_INVITED" in the professional activity log. The composer posts to `/api/ca/clients/<id>/invite-email/preview` and `/send`; the server builds the email and accept URL, and refuses accepted, withdrawn, expired or tokenless invitations.

**Related features:** F-SET-008, F-SET-010, F-SET-003, D-SET-004, W-SET-003.

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:559`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:633`, `apps/web/src/components/ca/InviteEmailComposer.tsx:108`, `apps/web/src/components/ca/InviteEmailComposer.tsx:159`, `apps/web/src/components/ca/InviteEmailComposer.tsx:200`, `packages/api/src/controllers/ca.controller.ts:183`, `packages/api/src/services/ca/caAccess.service.ts:43`, `packages/api/src/services/ca/caAccess.service.ts:944`, `packages/api/src/routes/ca.routes.ts:73`, `packages/api/src/routes/ca.routes.ts:98`, `packages/api/src/services/ca/caInviteEmail.service.ts:42`, `packages/api/src/services/ca/caInviteEmail.service.ts:263`

### Manage a professional's access (scope panel) <!-- F-SET-010 -->
**What it does:** Opens a panel under an active professional where you choose what they can do, which portfolios, categories and asset classes they can see, and the dates their access works.

**Why it exists:** The code comment: "the person whose books these are decides which portfolios a professional may open … and between which dates any of it works. A CA can read their own scope and nothing else."

**Where to find it:** **Account Access → With access → Manage access**.

**Who can use it:** The account holder (R-FREE, R-PLUS, R-FAMILY, R-PRO). Never the professional.

**Steps**
1. Click **Manage access**. The panel opens.
2. **What they can do** ("Reading is always included. Changing anything is up to you."): pick **View only** or **Keep my books**, or **Choose each permission** for the four switches.
3. **What they can see**: for **Portfolios**, **Categories** and **Asset classes** pick **All** or **Chosen** and tick items.
4. **When** ("Access stops by itself on the end date. Leave blank for no limit."): set **From** and/or **Until**.
5. The save bar says "You have unsaved changes". Click **Save access** (toast "Access saved") or **Discard**. With nothing changed, **Close**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View only** / **Keep my books** | Mode cards | All permissions off / on | — |
| **Choose each permission** | Expander | Shows four switches | — |
| **Keep my books**, **Add and correct transactions**, **Upload statements**, **Set fair market values** | Switches | Individual permissions | — |
| **All** / **Chosen (n)** | Segmented control (×3) | Widen or narrow | — |
| Portfolio / category / asset-class chips | Chips | Pick items | — |
| **From**, **Until** | Date fields | Access window | — |
| **Save access** | Button | Saves | Disabled when nothing changed or while saving |
| **Discard** / **Close** | Button | Undo changes / close | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Portfolios | Multi-select | No | Up to 200; must be yours | All | "One of those portfolios is not yours." |
| From / Until | Date | No | YYYY-MM-DD; Until not before From | Blank | "Access cannot end before it starts." / "<field> is not a real date." |

**Settings and toggles here:** S-SET-004 **What they can do** (default view only); S-SET-005 **Portfolios**, S-SET-006 **Categories**, S-SET-007 **Asset classes** (default All); S-SET-008 **When** (default no limit).

**Results:** The professional's access changes on their next request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save access" (or the server message) | Validation or permission failure | Read the message and correct |
| "That grant is not yours to manage." | Not your relationship | — |

**Limitations:** None beyond the rules above.

**How it works:** GET `/api/me/professional-access/<id>` returns the grant in full; PATCH `.../scope` accepts any subset: an absent field is untouched and an explicit `null` widens that dimension back to everything. Changes are logged in the professional activity log.

**Related features:** F-SET-008, F-SET-012, D-SET-004.

**Sources:** `apps/web/src/components/ca/GrantScopePanel.tsx:42`, `apps/web/src/components/ca/GrantScopePanel.tsx:145`, `apps/web/src/components/ca/GrantScopePanel.tsx:300`, `apps/web/src/components/ca/GrantScopePanel.tsx:312`, `packages/api/src/controllers/ca.controller.ts:125`, `packages/api/src/services/ca/caAccess.service.ts:711`, `packages/api/src/services/ca/caAccess.service.ts:728`, `packages/api/prisma/schema.prisma:520`

### Withdraw, restore, cancel invitation <!-- F-SET-011 -->
**What it does:** Ends a professional's access (**Withdraw**), gives it back (**Restore**), or cancels an invitation nobody has accepted (**Cancel invitation**).

**Why it exists:** The code comment: "A revoke button that needed a subscription would not be a revoke button."

**Where to find it:** **Account Access** rows.

**Who can use it:** The account holder (R-FREE, R-PLUS, R-FAMILY, R-PRO). The professional can also end an engagement from their side (B09), but only you can restore it.

**Steps**
1. Active row: click **Withdraw**, then confirm "Withdraw their access?" with **Withdraw** (or **Keep**). Toast "Access withdrawn".
2. Invited row: click **Cancel invitation**. Toast "Invitation cancelled".
3. **Past access**: click **Restore**. Toast "Access restored".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Withdraw** → **Withdraw** / **Keep** | Buttons | Two-step withdraw | Disabled while withdrawing |
| **Cancel invitation** | Button | Cancels | Disabled while cancelling |
| **Restore** | Button | Restores | Hidden for invitations nobody accepted; disabled while restoring |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Withdraw/cancel: status becomes REVOKED and the link is invalidated; the professional loses access at once. Restore: status ACTIVE again with the previous scope.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "That invitation was accepted — withdraw the access instead." | Tried to cancel an accepted invitation | Use **Withdraw** |
| "That invitation was never accepted, so there is nothing to restore — send a new one." | Restoring a cancelled invitation | Invite again |
| "Could not withdraw access" / "Could not cancel that invitation" / "Could not restore access" | Other failures | Retry |

**Limitations:** None.

**How it works:** POST `/api/me/professional-access/<id>/revoke`, `/cancel`, `/reinstate`. Each writes an entry to the professional activity log ("You revoked your CA’s access to your books.", "You cancelled the invitation to …").

**Related features:** F-SET-008, F-SET-012.

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:84`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:336`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:455`, `packages/api/src/services/ca/caAccess.service.ts:538`, `packages/api/src/services/ca/caAccess.service.ts:820`, `packages/api/src/services/ca/caAccess.service.ts:1115`

### Activity feed of professionals' actions <!-- F-SET-012 -->
**What it does:** Shows the most recent things done to your books by professionals and by you in this relationship (invited, accepted, scope changes, withdrawals, and the professional's edits).

**Why it exists:** The page header: "…what each of them can reach, and everything they have done."

**Where to find it:** **Account Access**, the **Activity** list near the bottom.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — view only. With nothing yet: "Nothing has happened yet. Everything a professional does to your books will appear here."

**Controls:** None.

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** Up to 100 entries, newest first.

**How it works:** GET `/api/me/professional-access/activity` reads the professional audit log where you are the actor or the subject (database row-level security restricts it to your side).

**Related features:** F-SET-008, F-SET-010, F-SET-011.

**Sources:** `apps/web/src/components/ca/CaActivityFeed.tsx:19`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:223`, `packages/api/src/controllers/ca.controller.ts:106`, `packages/api/src/services/ca/caAccess.service.ts:579`

### "Do you keep books for clients?" card <!-- F-SET-013 -->
**What it does:** For people on the Pro/Advisor plan who have no clients yet, shows a card pointing to the client books workspace.

**Why it exists:** The code comment: the sidebar's **Client books** entry appears only once a professional holds a grant, "so a practice that has just subscribed would otherwise have nowhere to start".

**Where to find it:** **Account Access**, below the relationships.

**Who can use it:** R-PRO with no clients.

**Steps**
1. Read "Do you keep books for clients? Your plan lets you act for other people. Invite your first client to get started."
2. Click **Open client books** (goes to `/ca`, D-SET-004).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Open client books** | Link button | Opens the workspace | Card hidden below Pro/Advisor, when you have clients, or when the client list errors |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The workspace itself requires two-factor sign-in.

**How it works:** Checks the CA_WORKSPACE entitlement in the browser and GET `/api/ca/clients`.

**Related features:** D-SET-004, F-SET-003.

**Sources:** `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:522`, `apps/web/src/pages/settings/ProfessionalAccessPage.tsx:541`, `packages/api/src/routes/ca.routes.ts:71`

**What this area doesn't do**
- It does not show professionals you act for (that is **Client books**).
- It does not let you pick which professional actions are logged; everything is.
- It has no plan gate and no per-professional notification settings.

## Connections

Two pages that link EveryPaisa to outside services. **AI connectors** (Planning → AI connectors, the user menu → **AI connectors**, or the Settings card **Manage AI connectors**; route `/settings/ai-connectors`) lets your own ChatGPT or Claude read your data, read-only. **Connectors** (Tools → Connectors, route `/connectors`, page title "Broker Connectors") links brokers and the Account Aggregator.

### Connect ChatGPT or Claude (AI connectors) <!-- F-CONN-001 -->
**What it does:** Gives you the EveryPaisa connector address and step-by-step instructions to add it as a custom connector in ChatGPT or Claude. The actual approval happens on F-CONN-005 when the chatbot calls back.

**Why it exists:** The page text: "Let your own ChatGPT or Claude answer questions about your money using your EveryPaisa data. It can only read what you choose, never change anything, and you can revoke it any time."

**Where to find it:** **Planning → AI connectors** (route `/settings/ai-connectors`), header "AI connectors — Use your own ChatGPT or Claude with your EveryPaisa data."

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. On Free the connect card is behind a lock card with **View plans**. Not while managing a family member's account (R-MANAGER): "AI connectors work on your own account only. Switch back to your own account."

**Steps**
1. Click **Connect ChatGPT** or **Connect Claude**. The address is copied (toast "Connector address copied") and the chatbot's connector settings open in a new tab.
2. Follow the three steps shown, e.g. for Claude: "In Claude, open Settings > Connectors and choose Add custom connector." → "Paste the address we copied for you and name it EveryPaisa." → "Click Connect, sign in to EveryPaisa if asked, choose what to share and Approve."
3. The chatbot opens the approval page (F-CONN-005).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect ChatGPT** / **Connect Claude** | Buttons | Copy address, open the chatbot's settings, show steps | Behind the lock card below Plus |
| Connector address + copy button ("Copy connector address") | Text + icon button | Copies the address (toast "Copied") | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None on this card (see F-CONN-003, F-CONN-004).

**Results:** Nothing changes until you approve the chatbot.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not copy. Copy the address below by hand." | Clipboard blocked | Select and copy the address |
| "Not found" in the Connected list | AI connectors are switched off on this server (MCP_ENABLED/API_PUBLIC_URL) | Contact the operator |

**Limitations:** "Custom connectors need a paid ChatGPT or Claude plan." ChatGPT may need developer mode on.

**How it works:** The address is the API's public origin + `/mcp` (from the web build setting, else the page's own origin). ChatGPT settings open at chatgpt.com, Claude at claude.ai.

**Related features:** F-CONN-005, F-CONN-002, D-CONN-003, W-CONN-001.

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:21`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:53`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:82`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:89`, `apps/web/src/pages/settings/aiConnectorSetup.ts:6`, `apps/web/src/pages/settings/aiConnectorSetup.ts:23`, `packages/api/src/routes/connect.routes.ts:14`

### Connected chatbots: revoke and recent activity <!-- F-CONN-002 -->
**What it does:** Lists every chatbot connected to your account with when it was connected and last used and what it may read; lets you revoke it and see its last 20 lookups.

**Why it exists:** The code comment: list and revoke are "Ungated on purpose: a downgraded user must always be able to see and revoke."

**Where to find it:** **AI connectors → Connected**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Each card shows the chatbot (ChatGPT or Claude), "Connected <date> - last used <date>" or "Not used yet", and badges for shared areas ("Overview only" when none) and "+N family".
2. Click **Recent activity** to see lines like "<tool> - one person - N rows - <date>" ("failed" when a lookup failed; "No lookups yet.").
3. Click **Revoke**, then **Revoke access** in "Revoke <chatbot>?" ("It will lose access to your EveryPaisa data straight away. You can connect it again later."). Toast "Access revoked".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Edit sharing** | Button | F-CONN-003 | Hidden below Plus |
| **Revoke** → **Revoke access** | Buttons | Ends the connection | — |
| **Recent activity** | Link | Expands activity | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A revoked chatbot is refused on its very next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not load your connections." | Load failed (or connectors switched off) | Reload |
| "Could not revoke. Try again." / "Connection not found" | Failure or already revoked | Reload |
| "Could not load activity." | Load failed | Retry |

**Limitations:** Activity shows the tool name, number of people and rows only, never the data itself. Only the last 20 lookups.

**How it works:** GET `/api/connect/connections` lists unrevoked grants, newest first. DELETE `/api/connect/connections/<id>` marks the grant revoked (audit `mcp_revoked`). Activity reads `mcp_tool_called` audit rows for that grant (20 newest). The chatbot's token is checked on every call with no caching.

**Related features:** F-CONN-003, F-CONN-006.

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:94`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:137`, `apps/web/src/pages/settings/AiConnectionExtras.tsx:64`, `packages/api/src/routes/connect.routes.ts:30`, `packages/api/src/services/mcp/oauth.service.ts:323`, `packages/api/src/services/mcp/oauth.service.ts:337`, `packages/api/src/services/mcp/oauth.service.ts:394`

### Edit what a chatbot can read <!-- F-CONN-003 -->
**What it does:** Changes which areas, and which family members' data, an already-connected chatbot may read.

**Why it exists:** The code comment: "Widening what a chatbot reads is like approving it, so it needs the plan."

**Where to find it:** **AI connectors → (connection) → Edit sharing**.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Edit sharing**. "Edit what <chatbot> can read" opens.
2. Tick or untick areas under "Choose what <chatbot> can read", and people under "Whose data".
3. Click **Save**. Toast "Sharing updated".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Area checkboxes (11) | Checkboxes | S-CONN-001 | — |
| Person checkboxes | Checkboxes | S-CONN-002 | Disabled for people who have not opted in |
| **Save** / **Cancel** | Buttons | Save / close | Save disabled while saving |

**Fields and rules:** Not applicable — checkboxes only. Server errors: "Unknown sharing area", "One of these people cannot be shared".

**Settings and toggles here:** S-CONN-001 **Choose what <chatbot> can read**; S-CONN-002 **Whose data**.

**Results:** Takes effect on the chatbot's next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "One of these people cannot be shared" | Adding someone who has not opted in | Ask them to turn on S-CONN-003 |
| "Could not save. Try again." / "This feature requires the PLUS plan or higher" | Failure / plan lapsed | Retry / upgrade |

**Limitations:** On Free you can no longer narrow sharing either; only revoke is available.

**How it works:** PATCH `/api/connect/connections/<id>` (requires the AI_CONNECTOR plan feature). People already on the connection who have since opted out or left are dropped quietly; adding someone new who cannot be shared is refused. Audit `mcp_sharing_changed`.

**Related features:** F-CONN-002, F-CONN-004, F-CONN-005.

**Sources:** `apps/web/src/pages/settings/AiConnectionExtras.tsx:19`, `apps/web/src/pages/connect/SharingToggles.tsx:15`, `packages/api/src/routes/connect.routes.ts:71`, `packages/api/src/services/mcp/oauth.service.ts:159`, `packages/api/src/services/mcp/oauth.service.ts:374`

### Allow family to include me in their AI connectors <!-- F-CONN-004 -->
**What it does:** Your consent for relatives who can already see your data in EveryPaisa to let their own chatbot read it too.

**Why it exists:** The code comment: "being included in a relative's connector is the relative's plan, not this user's" — so the consent is free on every plan.

**Where to find it:** **AI connectors**, bottom card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Tick or untick "Allow family to include me in their AI connectors" ("When on, family members who can already see your data in EveryPaisa may also let their own ChatGPT or Claude read it. Off by default.").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Opt-in checkbox | Checkbox | Saves immediately | Disabled while loading or saving |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-CONN-003 **Allow family to include me in their AI connectors** — on: you can be shared by relatives; off (default): you cannot.

**Results:** Turning it off removes you from relatives' chatbots on their next call.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save. Try again." | Failure | Retry |

**Limitations:** Managed profiles (relatives without their own login) don't need this; the person keeping their books can share them.

**How it works:** GET/PUT `/api/connect/family-opt-in` reads/writes `User.aiConnectorFamilyOptIn`; audit `mcp_sharing_changed`.

**Related features:** F-CONN-003, F-CONN-005.

**Sources:** `apps/web/src/pages/settings/AiConnectorsPage.tsx:27`, `apps/web/src/pages/settings/AiConnectorsPage.tsx:126`, `packages/api/src/routes/connect.routes.ts:60`, `packages/api/src/services/mcp/oauth.service.ts:367`

### Approve a chatbot connection <!-- F-CONN-005 -->
**What it does:** The page your chatbot sends you to when you click Connect in it. You choose what it can read and click **Approve**, or **Cancel**; either way the browser returns to the chatbot.

**Why it exists:** The code comment: "The user picks what to share; Approve or Cancel sends the browser back to the chatbot with a code or access_denied."

**Where to find it:** Opened by the chatbot (route `/connect/authorize?req=…`), outside the normal app layout. Signed-out visitors sign in first and come back.

**Who can use it:** Approve: R-PLUS, R-FAMILY, R-PRO. Cancel: any signed-in person. Not R-MANAGER.

**Steps**
1. Read "<chatbot> wants read-only access to your EveryPaisa data" and "Verified address: <host>".
2. On Free: "Connecting your own ChatGPT or Claude needs the Plus plan." with **See plans** and **Cancel**.
3. Otherwise tick areas (S-CONN-001) and people (S-CONN-002), read the four promises (read-only; account, card, policy and ID numbers shown as last 4 characters; data goes to OpenAI/Anthropic under your account; revocable in Settings > AI connectors).
4. Click **Approve** or **Cancel**. The browser goes back to the chatbot.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Area and person checkboxes | Checkboxes | What to share | Hidden below Plus |
| **Approve** | Button | Grants access | Hidden below Plus; disabled while saving |
| **Cancel** | Button | Declines | Disabled while saving |
| **See plans** | Link button | Opens Pricing | Only below Plus |
| **Go to Settings > AI connectors** | Link | Shown with an expired/missing request | — |

**Fields and rules:** Not applicable — checkboxes only.

**Settings and toggles here:** S-CONN-001 (defaults: nine areas on, Will and succession and Documents off; a reconnect keeps the previous choice); S-CONN-002 (nobody by default; a reconnect keeps previous shareable people).

**Results:** Approve: a connection (grant) is created or updated; you get an in-app alert and an email "<chatbot> connected to your EveryPaisa" ("Not you? Revoke it in Settings > AI connectors."). Cancel: the chatbot is told access was denied.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This connection request has expired. Start again from your chatbot." | More than 10 minutes, or already answered | Reconnect from the chatbot |
| "This link is missing its connection request. Start again from your chatbot." | Opened without `?req=` | Reconnect from the chatbot |
| "This connection request was already answered." | Double click | Reconnect if needed |
| "Could not save your choice. Try again." | Other failure | Retry |

**Limitations:** The chatbot's name shown is derived from where the approval code is sent (chatgpt.com/chat.openai.com → ChatGPT, claude.ai/claude.com → Claude), never from what the client calls itself. Only callback addresses on the server's allow-list can register.

**How it works:** The chatbot calls `/oauth/authorize`, which stores a 10-minute request and redirects to this page. GET `/api/connect/requests/<reqId>` returns the client name, host, current sharing and shareable people. POST `/decision` validates input, claims the request (single use), and on approval creates/updates the grant and a 60-second one-time code bound to the chatbot's PKCE challenge, then redirects to the chatbot's callback. Audit `mcp_connected` or `mcp_sharing_changed`.

**Related features:** F-CONN-001, F-CONN-006, F-PLAN-001, W-CONN-001.

**Sources:** `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:24`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:34`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:71`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:92`, `apps/web/src/pages/connect/ConnectAuthorizePage.tsx:105`, `packages/api/src/routes/connect.routes.ts:53`, `packages/api/src/services/mcp/oauth.service.ts:104`, `packages/api/src/services/mcp/oauth.service.ts:172`, `packages/api/src/services/mcp/notice.service.ts:12`, `packages/shared/src/aiConnector.ts:13`, `packages/shared/src/aiConnector.ts:39`

### Broker connectors (Zerodha, Upstox, Angel One) <!-- F-CONN-007 -->
**What it does:** Stores your own broker developer-app keys and logs in to the broker so trades and positions can be synced (the sync itself runs from the F&O page, D-CONN-001).

**Why it exists:** The page description: "OAuth-linked brokers for automatic trade & holdings sync".

**Where to find it:** **Tools → Connectors** (route `/connectors`), one card per broker.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. While managing a family member's account the credentials are saved for that person.

**Steps**
1. On a card showing **Not configured**, click **Configure** and fill the fields (S-CONN-004). Click **Save**. Toast "<broker> configured".
2. Angel One logs in straight away. For Zerodha or Upstox, the card now shows **Needs login**: copy the **Server redirect URI** shown into the broker's developer console, then click **Connect**. A popup opens the broker's login; after login it shows "Login successful — closing window…" and the toast "Connected: <broker>" appears.
3. Connected cards show **Connected**, "Last sync: …" and "Token expires: …"; use **Refresh** to renew, **Reconfigure** to change keys, or **Disconnect** (confirm "Disconnect <broker>?").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Configure** | Button | Opens the setup form | Only when not configured |
| **Save** / **Cancel** | Buttons | Save keys / close | Save disabled until required fields are filled |
| **Connect** | Button | Broker login (popup) / Angel inline login | Configured but not connected |
| **Refresh** | Button | Renews the session | Only when connected |
| **Reconfigure** | Button | Re-opens the form | Configured |
| **Disconnect** | Button | Deletes the stored credential after a browser confirm | Configured |
| **Docs** | Link | Broker API docs (new tab) | — |
| Status badge | Badge | Loading…, Not configured, Connected, Needs login | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| API key | Text | Yes | Non-empty | Empty | "apiKey required" |
| API secret (Zerodha, Upstox) | Password | Yes | Non-empty | Empty | "Kite apiSecret required" / "Upstox apiSecret required" |
| Redirect URI (Upstox) | Text | Yes | A URL | Empty | "Upstox redirectUri required" |
| Client code, Login PIN/password (Angel) | Text, password | Yes | Non-empty | Empty | "Angel clientCode required" / "Angel password required" |
| TOTP seed (Base32) (Angel) | Password | Yes | At least 8 characters | Empty | "Angel TOTP seed required" |

**Settings and toggles here:** S-CONN-004 **Broker setup fields**.

**Results:** A stored, encrypted credential and (after login) a broker session token with an expiry.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Popup blocked — allow popups for this site" | Browser blocked the login popup | Allow popups and click **Connect** again |
| "OAuth state expired — start login again" | Took longer than 10 minutes to log in | **Connect** again |
| "Kite session expired — login again" / "Upstox refresh failed — login again" | Broker session ended | **Connect** again |
| "Set up broker credentials first" | Refresh before setup | **Configure** |
| "OAuth failed" or the broker's message | Login failed in the popup | Check keys and the redirect URI |

**Limitations:** You need your own broker developer app. The Upstox field hint says to paste the value "from "Server redirect" below", but that box appears only after the first save. Disconnect uses a plain browser confirm.

**How it works:** POST `/api/fo/brokers/setup` encrypts and stores the keys (one credential per broker per user). POST `/oauth/start` returns the broker login URL with a random state valid 10 minutes; the broker redirects to `/api/fo/brokers/<id>/callback` (no session; the state authenticates it), which exchanges the code and posts the result to the opener window. GET `/brokers/status` reports configured/connected (a live, unexpired token).

**Related features:** F-CONN-008, D-CONN-001, W-CONN-002.

**Sources:** `apps/web/src/pages/connectors/ConnectorsPage.tsx:41`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:63`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:168`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:211`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:505`, `packages/api/src/routes/fo.routes.ts:36`, `packages/api/src/controllers/brokerOauth.controller.ts:28`, `packages/api/src/controllers/brokerOauth.controller.ts:63`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:23`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:30`, `packages/api/src/ingestion/fno/brokerOauth/index.ts:324`

### Legacy broker connections (deprecated) <!-- F-CONN-008 -->
**What it does:** Lists broker accounts linked through an older paste-token flow, lets you sync them once more or remove them.

**Why it exists:** The card text: "These were linked via the older paste-token flow. Reconnect via the OAuth cards above to keep them in sync."

**Where to find it:** **Tools → Connectors → Legacy connections** (badge "deprecated"), shown only if you have any.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Each row shows label/provider, status (CONNECTED/ERROR/…), user id, "Last synced …" or "Never synced", and any last error.
2. Click the refresh icon ("Sync now"); toast "Synced N trades".
3. Click the bin icon ("Remove"), confirm "Remove this legacy connection?"; toast "Removed".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Sync now (icon) | Button | Syncs | Disabled while syncing |
| Remove (icon) | Button | Removes after confirm | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Synced trades are imported; removed connections disappear.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Server error message as a toast | Sync failed | Reconnect via the broker cards above |

**Limitations:** No way to add new legacy connections in the UI.

**How it works:** GET `/api/connectors`, POST `/api/connectors/<id>/sync`, DELETE `/api/connectors/<id>`.

**Related features:** F-CONN-007.

**Sources:** `apps/web/src/pages/connectors/ConnectorsPage.tsx:336`, `apps/web/src/pages/connectors/ConnectorsPage.tsx:347`, `packages/api/src/routes/connectors.routes.ts:15`

### Account Aggregator (Finvu) consent <!-- F-CONN-009 -->
**What it does:** Starts an RBI Account Aggregator consent through Finvu for mutual funds and equities, lists your consents with status and dates, and lets you revoke an approved one. In demo mode it creates a test consent you can approve with one click.

**Why it exists:** The card text: "Pull mutual funds, deposits and equities directly from the user's linked banks via the RBI-regulated Account Aggregator framework."

**Where to find it:** **Tools → Connectors → Account Aggregator (Finvu)** (bottom of the page).

**Who can use it:** R-PLUS, R-FAMILY, R-PRO (server-enforced). The card itself has no lock for Free users.

**Steps**
1. Check the badge: **Demo mode**, **Configured** or **Token missing**.
2. Click **Connect via Finvu** (or **Re-initiate consent** when one is approved). A popup opens Finvu ("Consent flow opened in a popup. Approve in your bank app to continue."). In demo mode: "[Demo] Consent initiated — click Simulate approval to mark it approved."
3. Approve in Finvu. The list refreshes every 10 seconds; **Refresh** forces it.
4. Pending rows offer **Open Finvu** (or **Simulate approval** in demo). Approved rows offer **Revoke**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect via Finvu** / **Re-initiate consent** | Button | Starts a consent | Disabled when not configured or while starting |
| **Refresh** | Button | Reloads consents | Disabled while loading |
| **Simulate approval** | Button | Marks a demo consent approved | Demo mode, pending rows only |
| **Open Finvu** | Link | Re-opens the consent page | Not demo, pending rows with a redirect address |
| **Revoke** | Button | Revokes an approved consent | Approved rows only |

**Fields and rules:** Not applicable — the consent asks for MUTUAL_FUNDS and EQUITIES.

**Settings and toggles here:** None.

**Results:** A consent row (Initiated, Pending, Approved, Rejected, Expired, Revoked) with Initiated/Approved/Expires dates and FI types.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" (toast) | Free plan | Upgrade |
| "Set FINFACTOR_API_TOKEN in the API env to enable consent flows." | Not configured | Contact the operator |
| "Popup blocked — allow popups for this site and retry" | Popup blocked | Allow popups |
| "Consent created — check Finvu for the redirect URL." | Finvu returned no redirect | Use **Open Finvu** later |

**Limitations:** The card says "Once approved, holdings sync automatically", but data notifications from Finvu are only logged; importing the data is a manual step elsewhere (D-CONN-002). For a Free user the consents list silently stays empty while its requests are refused. Consent approval status depends on Finvu's webhook (F-CONN-010).

**How it works:** GET `/api/integrations/finfactor/status` (ungated) returns configured/demo flags. Everything else requires the AA_FINVU_AUTOIMPORT (Plus) feature: POST `/consent/initiate`, GET `/consent`, POST `/consent/<handle>/revoke`, POST `/consent/<handle>/approve-demo` (demo mode only: "consent demo-approve is only available in demo mode"). Status changes from Finvu arrive on the consent webhook.

**Related features:** F-CONN-010, D-CONN-002, F-PLAN-001.

**Sources:** `apps/web/src/pages/connectors/FinvuConsentCard.tsx:59`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:65`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:138`, `apps/web/src/pages/connectors/FinvuConsentCard.tsx:173`, `packages/api/src/routes/finfactor.routes.ts:38`, `packages/api/src/routes/finfactor.routes.ts:42`, `packages/api/src/controllers/finfactor.controller.ts:211`, `packages/api/src/ingestion/finfactor/webhooks.service.ts:110`

**What this area doesn't do**
- Chatbots can never add, change or delete anything — the connector is read-only.
- AI connectors does not include the in-app AI Assistant chat (D-CONN-003).
- Broker connectors do not import anything on this page; sync runs from the F&O page.
- There is no Account Aggregator support for bank-account statements on this card (consents ask for mutual funds and equities).

## Plans & billing

The **Pricing** page (route `/pricing`, reached from the header **Upgrade** button, the sidebar upgrade card, lock cards' **View plans**, and **Settings → Plan → Pricing**) shows the four plans and sells them through Razorpay. Plans are a strict ladder — Free < Plus < Family < Pro/Advisor — and each includes everything below it.

### Compare plans (Pricing page) <!-- F-PLAN-001 -->
**What it does:** Shows the four plans with prices, a feature list and your current plan, with a Monthly/Annual switch.

**Why it exists:** The page text: "Free forever for a single portfolio and the essentials. Upgrade as your needs grow — every tier includes everything in the tier below it."

**Where to find it:** **Pricing** (route `/pricing`), eyebrow "Pricing", title "Plans for every stage of your portfolio".

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Choose **Monthly** or **Annual**.
2. Compare the cards. Your plan's button reads **Current plan**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Monthly** / **Annual** | Switch | S-PLAN-001 | — |
| Plan buttons | Buttons | F-PLAN-002 | See F-PLAN-002 |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-PLAN-001 **Monthly / Annual** — Monthly: Plus ₹499, Family ₹899, Pro/Advisor ₹1,999 a month; Annual: Plus ₹4,999 a year, other paid plans "No annual plan yet".

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The prices and the Family note ("3 members included, +₹199/month per extra member (placeholder)") are marked as placeholders in code. Some listed features have no matching restriction in the app (see Plan card contents below and DOCUMENTATION_GAPS).

Plan card contents (exact):
| Plan | Tagline | Listed features |
|---|---|---|
| Free (₹0) | Get your net worth in one place. | Net worth + dashboard; Manual entry across all asset classes; 1 portfolio; Basic reports (holdings summary, XIRR, cash flow) |
| Plus ("Most popular") | Automate ingestion, unlock the full report catalog. | Everything in Free; Full 30+ tax/CA report catalog; AA/Finvu auto-import — bank, MF, stocks; Multiple portfolios; AI insights (rule-based + LLM); AI Assistant — ask it your XIRR, tax exposure, or "am I overweight in IT?" in plain English; Goal projections |
| Family | One consolidated view for the whole household. | Everything in Plus; Family portfolio sharing (3 seats included); Consolidated family net worth; Consolidated family reports |
| Pro/Advisor | For CAs and advisors running client books. | Everything in Family; Full accounting module — Trial Balance, P&L, Balance Sheet; Unlimited portfolios / clients; F&O-heavy reports (Schedule 43); Priority AA refresh frequency; PDF/ITR exports |

What the server actually gates is listed in the Roles and profiles chapter (R-FREE to R-PRO). "Priority AA refresh frequency" and "Unlimited … clients" are not enforced anywhere; "PDF/ITR exports" has no Pro-only restriction.

**How it works:** Prices come from one shared table that is also what Razorpay charges. The current plan shown is your effective plan (F-PLAN-004).

**Related features:** F-PLAN-002, F-PLAN-003, F-PLAN-004, D-AUTH-004.

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:27`, `apps/web/src/pages/pricing/PricingPage.tsx:72`, `apps/web/src/pages/pricing/PricingPage.tsx:86`, `apps/web/src/pages/pricing/PricingPage.tsx:159`, `packages/shared/src/pricing.ts:18`, `packages/shared/src/entitlements.ts:68`, `packages/shared/src/entitlements.ts:70`

### Upgrade with Razorpay checkout <!-- F-PLAN-002 -->
**What it does:** Buys a plan for 30 days (monthly) or 365 days (annual) through Razorpay's checkout window; on success your plan changes immediately.

**Why it exists:** The code comment: upgrades happen "only through the billing flow, never by self-declaring a paid tier at signup".

**Where to find it:** **Pricing → Upgrade to <plan>**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (your own account; refused while managing someone else's).

**Steps**
1. Click **Upgrade to Plus** (or Family, Pro/Advisor). The button reads "Starting checkout…".
2. Razorpay's window opens with your name and email filled in. Pay.
3. On success: toast "Upgraded to <plan>" and features unlock at once.
4. Closing the window cancels quietly.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Upgrade to <plan>** | Button | Starts checkout | Disabled on your current plan ("Current plan"), on Free ("Included"), when that cycle has no price, and while starting |

**Fields and rules:** Not applicable — payment details are entered in Razorpay's window.

**Settings and toggles here:** S-PLAN-001 decides the cycle and duration.

**Results:** Your plan is set to the bought tier with an end date of payment time + 30 or 365 days; a fresh session is issued so the new plan applies to every request.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Payments are coming soon. No checkout session was created." | Razorpay not configured on this server | — |
| "Payment failed" or Razorpay's failure text | Payment declined | Try another method |
| "Payment signature verification failed" | Tampered or invalid payment reply | Contact support |
| "This order does not belong to you" | Replaying someone else's order | — |
| "Failed to load Razorpay checkout script" | Script blocked | Allow checkout.razorpay.com |

**Limitations:** Confirmed: the buttons let a paid user buy a lower plan (for example a Pro/Advisor user can click **Upgrade to Plus**), which replaces the higher plan. You cannot renew your current plan early (its button is disabled), there is no automatic renewal, no reminder before expiry, and the end date is not shown in the app. A plan bought while another is active starts its 30/365 days from the payment, not from the old end date.

**How it works:** POST `/api/billing/checkout-intent` creates a Razorpay order for the price, with your user id, tier and cycle stored in the order's notes. After payment, POST `/api/billing/verify-payment` checks the HMAC signature, re-reads the order from Razorpay to trust only its notes, records the payment once (a replay returns your session without extending the plan) and sets plan and end date in one transaction.

**Related features:** F-PLAN-001, F-PLAN-004, W-PLAN-001.

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:118`, `apps/web/src/pages/pricing/PricingPage.tsx:217`, `apps/web/src/lib/razorpay.ts:54`, `packages/api/src/routes/billing.routes.ts:33`, `packages/api/src/routes/billing.routes.ts:83`, `packages/api/src/services/billing/planActivation.service.ts:4`, `packages/api/src/services/billing/planActivation.service.ts:27`, `packages/api/src/services/billing/razorpay.service.ts:72`

### Admin plan switch (no payment) <!-- F-PLAN-003 -->
**What it does:** Lets an administrator set their own plan to any tier without paying, to test what each plan unlocks.

**Why it exists:** The code comment: an "ADMIN-only QA escape hatch … without spending real money on every check". Admins get no automatic bypass of plan gates.

**Where to find it:** **Pricing**, under each plan button: **Set (no payment — dev)** (administrators only).

**Who can use it:** R-ADMIN with two-factor sign-in used for this session.

**Steps**
1. Click **Set (no payment — dev)** under a plan.
2. Toast "Plan set to <PLAN> (no payment — ADMIN dev switch)".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Set (no payment — dev)** | Button | Sets your plan | Hidden for non-admins; disabled while switching |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Your plan changes with no end date (it never lapses) and a fresh session is issued.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Turn on two-factor sign-in (Settings) to use admin tools." | No two-factor | F-SET-003 |
| "Sign out and sign in again with your authenticator code to use admin tools." | Session not two-factor | Sign in again |
| "Could not switch plan" | Other failure | Retry |

**Limitations:** None.

**How it works:** POST `/api/billing/dev-set-plan` requires the ADMIN role and a two-factor session, sets the plan and clears the end date.

**Related features:** F-PLAN-001, F-SET-003.

**Sources:** `apps/web/src/pages/pricing/PricingPage.tsx:100`, `apps/web/src/pages/pricing/PricingPage.tsx:228`, `packages/api/src/routes/billing.routes.ts:133`, `packages/api/src/routes/billing.routes.ts:143`

### Plan expiry (back to Free) <!-- F-PLAN-004 -->
**What it does:** When a paid plan's end date passes, the account is treated as Free everywhere: lock cards reappear and Free limits apply. Your data is kept.

**Why it exists:** The code comment: "a lapsed subscription stops unlocking features instead of lasting forever".

**Where to find it:** Not applicable — automatic. The plan shown in **Settings → Plan** and the **Current plan** button change to Free.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO (applies to them).

**Steps:** Not applicable — buy again on **Pricing** to restore.

**Controls:** None.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Paid features lock; with more than one portfolio you cannot add more (existing ones stay).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "This feature requires the PLUS plan or higher" (or FAMILY/PRO_ADVISOR) | Plan lapsed | Buy again |

**Limitations:** It takes effect at your next session refresh (within 15 minutes). Confirmed defect: connected chatbots (AI connectors) keep working after a paid plan lapses, because that check reads the stored plan, not the effective one. No email warns you before or after expiry.

**How it works:** Every place that turns the stored plan into access (access token, profile, AI Assistant quota) uses the effective plan: a paid plan whose end date is in the past counts as FREE; no end date means it stands.

**Related features:** F-PLAN-002, F-AUTH-006, F-CONN-006.

**Sources:** `packages/api/src/lib/effectivePlan.ts:16`, `packages/api/src/services/auth/auth.service.ts:92`, `packages/api/src/services/auth/auth.service.ts:65`, `packages/api/src/routes/mcp.routes.ts:48`

**What this area doesn't do**
- No invoices, receipts or payment history in the app.
- No cancellation, refund, downgrade-at-period-end or auto-renewal.
- No coupon or promo codes.
- Extra Family seats cannot be bought on this page (seat payments belong to the Family area, B03).

## Legal pages

Public pages readable without signing in.

### How EveryPaisa uses AI in advice (notice page) <!-- F-LEGAL-001 -->
**What it does:** Shows the full AI-use notice: title "How EveryPaisa uses AI in advice", a version date, a summary and sections "Where AI is used", "What the AI does not decide", "What the AI sees", "Who is responsible", "Its limits", "Records and changes".

**Why it exists:** The code comment: the notice is required under SEBI Investment Adviser Regulations 15(14) and 18(9), and is "public so it can be read before signing up".

**Where to find it:** Route `/legal/ai-use`; linked from the AI Assistant, the AI disclosure card and advisor recommendation cards ("how we use AI", "full notice").

**Who can use it:** R-VISITOR and every signed-in role.

**Steps**
1. Read the page. **← EveryPaisa** returns to the app (or Sign in when signed out).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **← EveryPaisa** | Link | Goes to `/` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The text is the version dated 2026-10-21 in code.

**How it works:** Renders a shared constant, so the same text is used wherever the disclosure appears.

**Related features:** D-CONN-003.

**Sources:** `apps/web/src/pages/legal/AiUsePage.tsx:5`, `packages/shared/src/aiDisclosure.ts:16`, `apps/web/src/components/ai/AIAssistant.tsx:740`, `apps/web/src/App.tsx:115`

**What this area doesn't do**
- There are no Terms of Service or general app privacy policy pages in the app; the `/privacy` page covers only the browser extension and has no in-app link (see DOCUMENTATION_GAPS).

<!-- END MODULES -->


## Roles and profiles

Role definitions are global (`_work/global/roles.md`); these headings are repeated so this fragment stands alone. How each role is affected by the features in this fragment:

### Signed-out visitor <!-- R-VISITOR -->
Can sign in, create an account, sign in with Google, reset a password, and read `/legal/ai-use` and `/privacy`. Opening `/connect/authorize` or `/onboarding` sends them to Sign in and back.

### Free user <!-- R-FREE -->
Every new account. Can use Settings, two-factor sign-in, account deletion, Account Access, broker connectors, see and revoke AI connections and set the family opt-in. Cannot approve or edit AI connectors or start an Account Aggregator consent.

### Plus subscriber <!-- R-PLUS -->
Everything Free can, plus approving and editing AI connectors and Account Aggregator consents. Bought on Pricing for 30 or 365 days.

### Family subscriber <!-- R-FAMILY -->
Same as Plus within this fragment.

### Pro/Advisor subscriber <!-- R-PRO -->
Same as Family within this fragment, plus the "Do you keep books for clients?" card on Account Access. The header Upgrade button is hidden for this plan.

### Administrator <!-- R-ADMIN -->
Admin powers here: the Loan rates admin page and the no-payment plan switch on Pricing, both requiring two-factor sign-in used for the session. Otherwise follows their own plan. Cannot be chosen at sign-up ("Cannot self-register with this role").

### Family owner <!-- R-FAMOWNER -->
n/a in this fragment, except that owning a family with other members blocks account deletion.

### Family contributor <!-- R-FAMCONTRIB -->
n/a in this fragment; can be shared with a relative's chatbot only after turning on the family opt-in.

### Family viewer <!-- R-FAMVIEWER -->
Same as Family contributor in this fragment.

### Managing a family member's account <!-- R-MANAGER -->
Settings profile, two-factor, deletion, Account Access and Pricing always act on the manager's own account. Loan rate alerts and broker connectors act on the managed person. Onboarding and AI connectors are refused.

### Professional acting for a client <!-- R-PROF -->
The other side of Account Access: the account holder controls this person's scope from Account Access. Needs two-factor sign-in (Settings).

### AI chatbot connection <!-- R-AICONN -->
Created and controlled from AI connectors and the approval page; reads only the shared areas through `/mcp`.

### Succession nominee <!-- R-NOMINEE -->
n/a in this fragment.

## Glossary
| Term | Meaning |
|---|---|
<!-- BEGIN GLOSSARY -->
| Remember me on this device | Sign-in choice: keep the session after the browser closes (ticked) or end it with the tab |
| Verification code | 6-digit code emailed at sign-up; valid 10 minutes, 5 tries |
| Reset code | 6-digit code emailed by "Forgot password?"; valid 15 minutes, 5 tries; only the newest works |
| Two-factor sign-in | Optional second sign-in step with a 6-digit authenticator-app code; required for the professional workspace and admin tools |
| Backup code | One of 10 one-time codes (format ABCD-EFGH) shown when two-factor is turned on; each signs you in once |
| Danger zone | The Settings card holding **Delete account** |
| Grace period | The 30 days between asking to delete an account and its permanent erasure; signing in offers **Restore account** |
| Account Access | The page where you invite professionals and control what they can see and do in your books |
| Professional | A CA or advisor you invite into your books from Account Access |
| Reach strip | The Sees / Can / Until summary under each professional on Account Access |
| AI connectors | Linking your own ChatGPT or Claude to read your EveryPaisa data, read-only |
| Connector address | The `/mcp` web address you paste into ChatGPT or Claude |
| Sharing area | One of 11 data areas a connected chatbot may read (Investments … Documents) |
| Broker Connectors | The Connectors page cards that store your Zerodha, Upstox or Angel One developer keys and broker login |
| Account Aggregator (Finvu) | RBI-regulated consent framework, via Finvu, for pulling financial data; consents are started on the Connectors page |
| Demo mode | Server setting under which Account Aggregator consents are test fixtures approved with **Simulate approval** |
| Effective plan | The plan in force: a paid plan past its end date counts as Free |
| Billing cycle | Monthly (30 days) or Annual (365 days) when buying a plan |
| Starter portfolio | "My Portfolio", created automatically when setup opens |
<!-- END GLOSSARY -->

