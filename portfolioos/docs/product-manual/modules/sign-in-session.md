[Index](../INDEX.md)

# Sign-in & session

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Everything about getting into EveryPaisa and staying in: signing in with email and password or Google, creating an account (proved by an emailed code), the optional two-factor step, resetting a forgotten password, how a session is kept alive and ended, the security emails the app sends about sign-ins, and the screen shown for an address that does not exist.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-AUTH-001](../features/F-AUTH-001.md) | Sign in with email and password | Live | Signs you in with the email and password of an existing account and opens the page you were heading for. |
| [F-AUTH-002](../features/F-AUTH-002.md) | Create an account (email verification code) | Live | Creates a new EveryPaisa account in two steps: you enter your details, the app emails a 6-digit code, and the account exists only once that … |
| [F-AUTH-003](../features/F-AUTH-003.md) | Sign in or sign up with Google | Live | Signs you in with your Google account. |
| [F-AUTH-004](../features/F-AUTH-004.md) | Two-factor code at sign-in | Live | For accounts with two-factor sign-in on, asks for the 6-digit code from your authenticator app, or one of your backup codes, after the … |
| [F-AUTH-005](../features/F-AUTH-005.md) | Reset a forgotten password | Live | Emails a 6-digit reset code and lets you set a new password with it. |
| [F-AUTH-006](../features/F-AUTH-006.md) | Staying signed in: resume, refresh and expiry | Live | Keeps you signed in without asking again: it renews your access every 15 minutes in the background, picks your session back up after a … |
| [F-AUTH-007](../features/F-AUTH-007.md) | Sign out | Live | Ends the session in this browser and revokes its refresh token on the server. |
| [F-AUTH-008](../features/F-AUTH-008.md) | Security notice emails (new device, failed sign-ins) | Live | Emails you when your account is signed in from a device type not seen in the last 90 days, and when there have been 5 failed sign-in … |
| [F-AUTH-010](../features/F-AUTH-010.md) | Page not found | Live | Shows a friendly screen for an address inside the app that does not exist, instead of silently redirecting. |

Settings for this module: [settings/sign-in-session.md](../settings/sign-in-session.md)
