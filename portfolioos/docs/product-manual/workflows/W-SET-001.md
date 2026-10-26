[Index](../INDEX.md)

# Turn on two-factor sign-in

`W-SET-001` · Settings

**Goal:** Protect the account with a second factor (also required for professional and admin tools).
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** An authenticator app.

| # | You do | The app does |
|---|---|---|
| 1 | **Settings → Two-factor sign-in → Turn on** | Shows a QR code and a typed key |
| 2 | Scan, enter the 6-digit code, **Turn on** | Turns it on, upgrades your current session, emails a notice |
| 3 | Save the 10 backup codes (**Copy**/**Download**), **I've saved them** | Closes; card shows "On" and codes left |

**Success:** Next sign-ins ask for a code.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "That code didn't match. Check the time on your phone and try the newest code." | Clock drift or old code | Fix phone time; retry |
| "Start setup first." | Setup expired | **Turn on** again |
