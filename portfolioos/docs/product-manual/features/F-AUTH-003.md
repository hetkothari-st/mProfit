---
id: F-AUTH-003
title: "Sign in or sign up with Google"
module: "Sign-in & session"
status: Live
roles: "R-VISITOR"
settings: [S-AUTH-001]
related: [F-AUTH-001, F-AUTH-002, F-AUTH-004, F-AUTH-008, F-SET-007]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Sign in or sign up with Google

`F-AUTH-003` · Live · Roles: [R-VISITOR](../roles.md#r-visitor)

**What it does:** Signs you in with your Google account. If no EveryPaisa account exists for that Google email, one is created on the Free plan and you go to the setup wizard.

**Why it exists:** Inferred from behavior: lets people skip choosing a password. The code comment notes Google users "can later set one via forgot password".

**Where to find it:** The Google button under "or" on **Sign in** (`/login`) and **Create your account** (`/register`).

**Who can use it:** [R-VISITOR](../roles.md#r-visitor) with a Google account whose email Google has verified.

**Steps**
1. Click the Google button. Google's popup opens; pick your account.
2. "Signing in…" shows under the button.
3. Existing account: toast "Welcome back, <first name>!" and you land on `?next=`, the unfinished setup, or **Dashboard**. New account: toast "Welcome to EveryPaisa, <first name>!" and you land on `?next=` or the setup wizard.
4. If two-factor is on, the code step appears (on `/register` you are first sent to `/login` to enter it).
5. If the account is scheduled for deletion, the restore box appears (as in [F-AUTH-001](F-AUTH-001.md)).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Google button | Google-rendered button | Starts Google sign-in in a popup | Replaced by "Google sign-in unavailable (admin: set VITE_GOOGLE_CLIENT_ID)." when not configured |
| **Restore account** / **Cancel** | Buttons | As in [F-AUTH-001](F-AUTH-001.md) | Only for a pending deletion |

**Fields and rules:** Not applicable — no fields; Google supplies the identity.

**Settings and toggles here:** [S-AUTH-001](../settings/sign-in-session.md#s-auth-001) — on `/login` the Google button follows the **Remember me on this device** box; on `/register` the session is remembered.

**Results:** Same session as [F-AUTH-001](F-AUTH-001.md). A new account gets the name from Google (or the part of the email before @), role Individual Investor, plan Free, and an unusable random password.

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

**How it works:** The browser loads Google Identity Services and posts the returned ID token to POST `/api/auth/google`. The server verifies it against the configured client id, requires a verified email, matches an existing user by lower-cased email or creates one, links Split placeholders for a new user, then applies the shadow-client, two-factor and pending-deletion checks in that order. New accounts get status 201 and `isNew: true`. A new-device email ([F-AUTH-008](F-AUTH-008.md)) is considered only for existing accounts.

**Related features:** [F-AUTH-001](F-AUTH-001.md), [F-AUTH-002](F-AUTH-002.md), [F-AUTH-004](F-AUTH-004.md), [F-SET-007](F-SET-007.md), [F-AUTH-008](F-AUTH-008.md).

**Sources:** `apps/web/src/components/auth/GoogleSignInButton.tsx:100`, `apps/web/src/components/auth/GoogleSignInButton.tsx:111`, `apps/web/src/components/auth/GoogleSignInButton.tsx:127`, `apps/web/src/components/auth/GoogleSignInButton.tsx:181`, `packages/api/src/controllers/auth.controller.ts:232`, `packages/api/src/services/auth/auth.service.ts:618`, `packages/api/src/services/auth/auth.service.ts:645`, `packages/api/src/services/auth/auth.service.ts:662`
