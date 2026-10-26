[Index](../INDEX.md)

# Sign in with two-factor

`W-AUTH-002` · Sign-in & session

**Goal:** Sign in to an account with two-factor sign-in on.
**Who:** [R-VISITOR](../roles.md#r-visitor) whose account has [S-SET-001](../settings/settings.md#s-set-001) on.
**Before you start:** Your authenticator app or a backup code.

| # | You do | The app does |
|---|---|---|
| 1 | Enter email and password (or use Google) | Asks for "the 6-digit code from your authenticator app" |
| 2 | Enter the code, **Verify and sign in** | Signs you in with a two-factor session |
| 3 | (No phone) **Use a backup code**, enter one | Signs you in, emails "A backup code was used to sign in" |

**Success:** Signed in; the professional workspace and admin tools are available if your role allows.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Too many wrong codes. Please sign in again." | 5 wrong codes | Start again |
| "This sign-in has expired. Please sign in again." | More than 5 minutes | Start again |
| Lost phone and all backup codes | No in-app recovery | Contact support |
