---
id: F-SET-003
title: "Two-factor sign-in"
module: "Settings"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-SET-001]
related: [F-AUTH-004, F-PLAN-003, F-SET-013, F-SET-014]
---

[← Settings](../modules/settings.md) · [Index](../INDEX.md)

# Two-factor sign-in

`F-SET-003` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Turns on sign-in with an authenticator-app code, shows 10 one-time backup codes, replaces them, or turns two-factor off.

**Why it exists:** The card text: "Add a second step to signing in … Someone who learns your password still can't get in." It is also required for the professional workspace ([R-PROF](../roles.md#r-prof)) and admin tools ([R-ADMIN](../roles.md#r-admin)).

**Where to find it:** **Tools → Settings → Two-factor sign-in**.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

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

**Settings and toggles here:** [S-SET-001](../settings/settings.md#s-set-001) **Two-factor sign-in** — on: every sign-in asks for a code; off: password or Google only.

**Results:** On: the next sign-ins require a code ([F-AUTH-004](F-AUTH-004.md)); your current session is swapped for one marked as two-factor-verified, so the professional workspace opens without signing in again; you get an email "Two-factor sign-in turned on". Off: secret and backup codes deleted; email "Two-factor sign-in turned off".

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

**Related features:** [F-AUTH-004](F-AUTH-004.md), [F-SET-014](F-SET-014.md), [F-PLAN-003](F-PLAN-003.md), [F-SET-013](F-SET-013.md), [W-SET-001](../workflows/W-SET-001.md).

**Sources:** `apps/web/src/pages/settings/TwoFactorSection.tsx:45`, `apps/web/src/pages/settings/TwoFactorSection.tsx:124`, `apps/web/src/pages/settings/TwoFactorSection.tsx:155`, `apps/web/src/pages/settings/TwoFactorSection.tsx:246`, `packages/api/src/services/auth/twoFactor.service.ts:34`, `packages/api/src/services/auth/twoFactor.service.ts:47`, `packages/api/src/services/auth/twoFactor.service.ts:92`, `packages/api/src/services/auth/twoFactor.service.ts:102`, `packages/api/src/services/auth/twoFactor.service.ts:158`, `packages/api/src/services/auth/twoFactor.service.ts:175`, `packages/api/src/controllers/auth.controller.ts:322`, `packages/api/src/lib/totp.ts:8`
