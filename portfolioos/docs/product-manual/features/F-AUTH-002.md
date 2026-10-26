---
id: F-AUTH-002
title: "Create an account (email verification code)"
module: "Sign-in & session"
status: Live
roles: "R-VISITOR"
settings: [S-AUTH-001]
related: [F-AUTH-001, F-AUTH-003, F-ONB-001, F-PLAN-001]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Create an account (email verification code)

`F-AUTH-002` · Live · Roles: [R-VISITOR](../roles.md#r-visitor)

**What it does:** Creates a new EveryPaisa account in two steps: you enter your details, the app emails a 6-digit code, and the account exists only once that code is entered. You are then signed in and taken to the setup wizard.

**Why it exists:** The code comment: "Nobody gets an account for an address they haven't proven they can read." Every new account starts on the Free plan; the form note says upgrades "happen via /pricing + billing, never by self-selecting a paid tier here".

**Where to find it:** **Create your account** page (route `/register`), from **Sign in → Create one**.

**Who can use it:** [R-VISITOR](../roles.md#r-visitor).

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
| Google button ("Sign up with Google") | Google button | [F-AUTH-003](F-AUTH-003.md) | — |
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

**Settings and toggles here:** None. (The new session is always remembered — see [S-AUTH-001](../settings/sign-in-session.md#s-auth-001).)

**Results:** A user account on the Free plan, with the chosen "I am" role (which grants no extra access — see [R-FREE](../roles.md#r-free)). Split-expense placeholders that friends created with this email are linked to the new account.

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

**Related features:** [F-AUTH-001](F-AUTH-001.md), [F-AUTH-003](F-AUTH-003.md), [F-ONB-001](F-ONB-001.md), [F-PLAN-001](F-PLAN-001.md), [D-AUTH-001](../dependencies.md#d-auth-001), [W-AUTH-001](../workflows/W-AUTH-001.md).

**Sources:** `apps/web/src/pages/auth/RegisterPage.tsx:22`, `apps/web/src/pages/auth/RegisterPage.tsx:123`, `apps/web/src/pages/auth/RegisterPage.tsx:207`, `apps/web/src/pages/auth/RegisterPage.tsx:294`, `packages/api/src/controllers/auth.controller.ts:33`, `packages/api/src/services/auth/auth.service.ts:132`, `packages/api/src/services/auth/auth.service.ts:217`, `packages/api/src/services/auth/auth.service.ts:259`, `packages/api/src/services/auth/auth.service.ts:277`
