---
id: F-AUTH-001
title: "Sign in with email and password"
module: "Sign-in & session"
status: Live
roles: "R-VISITOR"
settings: [S-AUTH-001]
related: [F-AUTH-003, F-AUTH-004, F-AUTH-005, F-AUTH-006, F-AUTH-008, F-ONB-005, F-PLAN-004, F-SET-007]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Sign in with email and password

`F-AUTH-001` · Live · Roles: [R-VISITOR](../roles.md#r-visitor)

**What it does:** Signs you in with the email and password of an existing account and opens the page you were heading for. If the account has two-factor sign-in on, it asks for a code next ([F-AUTH-004](F-AUTH-004.md)). If the account is scheduled for deletion, it offers to restore it instead.

**Why it exists:** Every page inside the app needs a signed-in session. The code comments state that the sign-in result is the same for unknown accounts and wrong passwords so it "can't be used to probe for accounts", and that an explicit `?next=` destination wins because "the person was in the middle of something — accepting an invitation, usually".

**Where to find it:** The **Sign in** page (route `/login`). Any signed-in page you open while signed out sends you here first. From **Create your account**, the footer link **Sign in**.

**Who can use it:** [R-VISITOR](../roles.md#r-visitor) (anyone with an account). Accounts created by a professional for a client who has no login (shadow clients), deactivated accounts and unknown emails are all refused with the same message.

**Steps**
1. Open `/login`. The page shows "Sign in" and "Track all your Indian investments in one place."
2. Type your **Email** and **Password**.
3. Leave **Remember me on this device** ticked to stay signed in after closing the browser, or untick it.
4. Click **Sign in**. A spinner shows while the request runs.
5. On success the toast "Welcome back, <first name>!" appears and you land on: the `?next=` address if one was given; else the setup wizard if this account left setup unfinished in this browser; else the page that sent you to sign in; else **Dashboard**.
6. If two-factor sign-in is on, the form is replaced by the code step ([F-AUTH-004](F-AUTH-004.md)).
7. If the account is scheduled for deletion, a red box says "This account is scheduled for deletion on <date>. Restore it to keep your data and sign in." Click **Restore account** to cancel the deletion and sign in, or **Cancel**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Email** | Email field | Account email | — |
| **Password** | Password field with show/hide | Account password | — |
| **Remember me on this device** | Checkbox | See [S-AUTH-001](../settings/sign-in-session.md#s-auth-001) | — |
| **Sign in** | Button | Submits | Disabled while signing in |
| **Forgot password?** | Link (twice: under the form, and inside the "Incorrect email or password." message) | Opens `/forgot-password` with the typed email carried over | — |
| Google button ("Sign in with Google") | Google button | [F-AUTH-003](F-AUTH-003.md) | Replaced by a notice when the web build lacks a Google client id |
| **Create one** | Footer link | Opens `/register`, keeping any `?next=` | — |
| **Restore account** / **Cancel** | Buttons in the deletion notice | Restore and sign in / dismiss | Shown only for an account pending deletion |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Email | Text | Yes | Valid email; lower-cased by the server | Email carried from the sign-up page, else empty | "Enter a valid email address" |
| Password | Text | Yes | At least 1 character | Empty | "Password is required" |

**Settings and toggles here:** [S-AUTH-001](../settings/sign-in-session.md#s-auth-001) **Remember me on this device** — ticked: the session survives closing the browser; unticked: it ends with the tab.

**Results:** A new session (15-minute access token, 30-day refresh token) is stored in this browser. The server records a `login` audit entry and may email a new-device notice ([F-AUTH-008](F-AUTH-008.md)).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Incorrect email or password." (under the password) | Wrong email or password, unknown account, deactivated account, or a client record with no login | Check both fields or use **Forgot password?** |
| "This account is scheduled for deletion on <date>…" | You asked to delete the account within the last 30 days | **Restore account** cancels the deletion |
| "Too many auth attempts" | More than 20 sign-in-type requests from your network address in 15 minutes | Wait up to 15 minutes |
| "Login failed" | Any other failure (network, server) | Try again |

**Limitations:** The "Incorrect email or password." message never says which of the two was wrong. The 20-per-15-minutes limit counts every sign-in, sign-up, reset and code request from the same network address together. Whether setup resumes after sign-in depends on a flag kept only in this browser.

**How it works:** POST `/api/auth/login` with email and password. The server looks the user up; for an unknown or inactive account it still runs a bcrypt comparison against a dummy hash so the response takes as long as a real wrong password. Passwords are bcrypt with cost 12. A shadow client is refused with "Invalid credentials". With two-factor on, the response is a challenge, not a session. A pending deletion is refused with code `ACCOUNT_PENDING_DELETION` (status 403) unless `restore: true` is sent, in which case the deletion dates are cleared and `account_deletion_cancelled` is audited. A successful sign-in writes audit `login`; a failed one writes `login_failed` with the email only, and after exactly 5 failures in 15 minutes emails the account owner ([F-AUTH-008](F-AUTH-008.md)). The access token carries user id, email, role and the effective plan ([F-PLAN-004](F-PLAN-004.md)). The landing page is decided by one rule shared with the already-signed-in redirect: `?next=` (internal paths only — anything not starting with a single `/` or containing a backslash is ignored), then unfinished setup, then the page that redirected you, then `/dashboard`. A signed-in person who opens `/login` is redirected by the same rule.

**Related features:** [F-AUTH-003](F-AUTH-003.md), [F-AUTH-004](F-AUTH-004.md), [F-AUTH-005](F-AUTH-005.md), [F-AUTH-006](F-AUTH-006.md), [F-AUTH-008](F-AUTH-008.md), [F-SET-007](F-SET-007.md), [F-ONB-005](F-ONB-005.md), [D-AUTH-001](../dependencies.md#d-auth-001).

**Sources:** `apps/web/src/pages/auth/LoginPage.tsx:23`, `apps/web/src/pages/auth/LoginPage.tsx:51`, `apps/web/src/pages/auth/LoginPage.tsx:181`, `apps/web/src/pages/auth/loginRedirect.ts:24`, `apps/web/src/hooks/useNextPath.ts:25`, `apps/web/src/components/auth/RestoreAccountNotice.tsx:34`, `packages/api/src/controllers/auth.controller.ts:121`, `packages/api/src/services/auth/auth.service.ts:376`, `packages/api/src/services/auth/password.service.ts:3`, `packages/api/src/services/account/accountDeletion.service.ts:216`, `packages/api/src/middleware/rateLimit.ts:159`
