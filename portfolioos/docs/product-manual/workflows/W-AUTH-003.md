[Index](../INDEX.md)

# Reset a forgotten password

`W-AUTH-003` · Sign-in & session

**Goal:** Regain access with a new password.
**Who:** [R-VISITOR](../roles.md#r-visitor).
**Before you start:** Access to the account's email.

| # | You do | The app does |
|---|---|---|
| 1 | **Sign in → Forgot password?**, **Send reset code** | Shows "Set a new password" (same message whether or not the account exists) |
| 2 | Enter the code and a new password twice, **Reset password** | Changes the password, signs out every device, toast "Password updated. Sign in with your new password." |
| 3 | Sign in | Normal sign-in |

**Success:** Signed in with the new password.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "That code is incorrect or has expired. Check it or request a new one." | Wrong, old or expired code | **Resend code** after 60 seconds |
| No email | No such account, cooldown, or mail failure | Check the address and spam; resend later |
