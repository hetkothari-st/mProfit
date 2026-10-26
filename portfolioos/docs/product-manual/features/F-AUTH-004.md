---
id: F-AUTH-004
title: "Two-factor code at sign-in"
module: "Sign-in & session"
status: Live
roles: "R-VISITOR"
settings: [S-SET-001]
related: [F-AUTH-001, F-AUTH-003, F-SET-003]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Two-factor code at sign-in

`F-AUTH-004` · Live · Roles: [R-VISITOR](../roles.md#r-visitor)

**What it does:** For accounts with two-factor sign-in on, asks for the 6-digit code from your authenticator app, or one of your backup codes, after the password or Google step.

**Why it exists:** The Settings text: "Someone who learns your password still can't get in." It is also how a session gets the "signed in with a second factor" mark that the professional workspace and admin tools require.

**Where to find it:** Appears on the **Sign in** page in place of the form, right after a successful password or Google step.

**Who can use it:** [R-VISITOR](../roles.md#r-visitor) whose account has [S-SET-001](../settings/settings.md#s-set-001) on.

**Steps**
1. Read "Enter the 6-digit code from your authenticator app."
2. Type the code in **Authentication code** and click **Verify and sign in**.
3. Lost your phone? Click **Use a backup code**, type one code such as the ABCD-EFGH pattern shown, then **Verify and sign in**.
4. On success you are signed in exactly as in [F-AUTH-001](F-AUTH-001.md).
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

**Settings and toggles here:** [S-SET-001](../settings/settings.md#s-set-001) **Two-factor sign-in** — this step appears only when it is on.

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

**Related features:** [F-SET-003](F-SET-003.md), [F-AUTH-001](F-AUTH-001.md), [F-AUTH-003](F-AUTH-003.md), [W-AUTH-002](../workflows/W-AUTH-002.md).

**Sources:** `apps/web/src/components/auth/TwoFactorChallenge.tsx:20`, `apps/web/src/components/auth/TwoFactorChallenge.tsx:34`, `packages/api/src/services/auth/twoFactor.service.ts:32`, `packages/api/src/services/auth/twoFactor.service.ts:130`, `packages/api/src/services/auth/twoFactor.service.ts:209`, `packages/api/src/services/auth/twoFactor.service.ts:244`, `packages/api/src/lib/totp.ts:78`, `packages/api/src/controllers/auth.controller.ts:288`
