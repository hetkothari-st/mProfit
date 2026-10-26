---
id: F-AUTH-005
title: "Reset a forgotten password"
module: "Sign-in & session"
status: Live
roles: "R-VISITOR"
settings: []
related: [F-AUTH-001, F-AUTH-003]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Reset a forgotten password

`F-AUTH-005` · Live · Roles: [R-VISITOR](../roles.md#r-visitor)

**What it does:** Emails a 6-digit reset code and lets you set a new password with it. Setting a new password signs you out everywhere.

**Why it exists:** The code comment: every outcome "is identical whether or not the address has an account — no distinct errors, no skipped delay", so the page cannot be used to find out who has an account.

**Where to find it:** **Forgot password?** on the Sign in page, or **Reset password** on the sign-up page when the email is taken (route `/forgot-password`).

**Who can use it:** [R-VISITOR](../roles.md#r-visitor). Accounts kept by a professional for a client (no login) and deactivated accounts never get a code.

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

**Related features:** [F-AUTH-001](F-AUTH-001.md), [F-AUTH-003](F-AUTH-003.md) (Google users can add a password this way), [W-AUTH-003](../workflows/W-AUTH-003.md).

**Sources:** `apps/web/src/pages/auth/ForgotPasswordPage.tsx:19`, `apps/web/src/pages/auth/ForgotPasswordPage.tsx:107`, `apps/web/src/pages/auth/ForgotPasswordPage.tsx:191`, `packages/api/src/controllers/auth.controller.ts:175`, `packages/api/src/services/auth/auth.service.ts:465`, `packages/api/src/services/auth/auth.service.ts:482`, `packages/api/src/services/auth/auth.service.ts:532`, `packages/api/src/services/auth/auth.service.ts:572`
