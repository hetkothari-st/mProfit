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
