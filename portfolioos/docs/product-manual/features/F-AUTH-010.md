---
id: F-AUTH-010
title: "Page not found"
module: "Sign-in & session"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-AUTH-006]
---

[← Sign-in & session](../modules/sign-in-session.md) · [Index](../INDEX.md)

# Page not found

`F-AUTH-010` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows a friendly screen for an address inside the app that does not exist, instead of silently redirecting.

**Why it exists:** The code comment: redirecting to the dashboard "made a mistyped or out-of-date link look like a broken page".

**Where to find it:** Any unknown address while signed in.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). A signed-out visitor opening an unknown address is sent to **Sign in** first, because this screen sits inside the signed-in area.

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

**Related features:** [F-AUTH-006](F-AUTH-006.md).

**Sources:** `apps/web/src/pages/notFound/NotFoundPage.tsx:16`, `apps/web/src/App.tsx:282`

**What this area doesn't do**
- You can't change your email address — the Settings email field is read-only, and no API accepts a new email.
- You can't change your password while signed in; use **Forgot password?** instead.
- There is no "sign out of all devices" button, and no list of active sessions or devices.
- Sign-in is by email/password or Google only — no phone/OTP sign-in.
- The "I am" role chosen at sign-up cannot be changed later in the app and does not unlock anything.
