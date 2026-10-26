# Workflows and Troubleshooting — Account & access (B06 fragment)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Sign-in & session, First-run setup, Settings & Account Access, Connections, Plans & billing

<!-- BEGIN WORKFLOWS -->
## Create an account and finish setup <!-- W-AUTH-001 -->
**Goal:** Get a new account with a few holdings on the dashboard.
**Who:** R-VISITOR.
**Before you start:** An email address you can read.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Sign in → Create one** | Shows "Create your account" |
| 2 | Fill Full name, Email, Password, Confirm password, I am; click **Create account** | Emails a 6-digit code; toast "Verification code sent to <email>"; shows "Verify your email" |
| 3 | Type the code | Creates the account on Free, signs you in (remembered), toast "Email verified. Welcome to EveryPaisa!" |
| 4 | Read the three welcome panels or **Skip** | Creates "My Portfolio" in the background |
| 5 | Tick what you own, **Continue** | One quick form per item |
| 6 | **Add** entries, **Next** … **Finish** | Saves each entry; shows "You're all set" |
| 7 | **Go to dashboard** | Marks setup finished in this browser |

**Success:** Dashboard with your entries.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "You already have an account with this email." | Email registered | **Sign in** or **Reset password** |
| "This code has expired. Request a new one." | Over 10 minutes | **Resend code** |
| "Could not set up your account" in setup | Starter portfolio failed | **Try again** |
| Closed the tab mid-setup | Setup flag kept in this browser | Sign in again in the same browser; setup resumes |

## Sign in with two-factor <!-- W-AUTH-002 -->
**Goal:** Sign in to an account with two-factor sign-in on.
**Who:** R-VISITOR whose account has S-SET-001 on.
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

## Reset a forgotten password <!-- W-AUTH-003 -->
**Goal:** Regain access with a new password.
**Who:** R-VISITOR.
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

## Turn on two-factor sign-in <!-- W-SET-001 -->
**Goal:** Protect the account with a second factor (also required for professional and admin tools).
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
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

## Delete your account, and restore it <!-- W-SET-002 -->
**Goal:** Erase the account and its data (or undo within 30 days).
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Remove members from (or hand over) any family you created that others are in.

| # | You do | The app does |
|---|---|---|
| 1 | **Settings → Danger zone → Delete account** | Lists what will be erased; checks blockers |
| 2 | **Continue**, type DELETE, enter password (or email code), **Continue** | Shows "Last chance" |
| 3 | **Delete my account** | Schedules deletion in 30 days, signs out every device, toast with the date |
| 4 | (To undo) Sign in within 30 days, **Restore account** | Cancels deletion, toast "Your account has been restored." |
| 5 | (Otherwise) Nothing | At 03:30 IST after the date passes, the account and data are erased |

**Success:** Account scheduled for deletion, then erased.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "You own a family with other members (…)…" | Blocker | Remove members or hand over the family (D-SET-005) |
| "Incorrect password" | Wrong password | Retry or use the email code |
| Account not erased after 30 days | Someone joined your family during the grace period | Sign in, fix the blocker, delete again |

## Invite your CA or advisor <!-- W-SET-003 -->
**Goal:** Let a professional see (and optionally keep) your books.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Turn on two-factor sign-in and sign in with a code (needed for the email step in this version).

| # | You do | The app does |
|---|---|---|
| 1 | **Account Access → Invite a professional**, enter name and email, **Continue to the email** | Creates the invitation (14-day link) |
| 2 | Edit subject/message, **Send email** or copy the link | Sends the email or copies the link |
| 3 | The professional accepts from their own account | Toast "<name> accepted your invitation."; row moves to **With access** (view only) |
| 4 | **Manage access**, set permissions, scope and dates, **Save access** | Applies on their next request |

**Success:** The professional appears under **With access** with the reach you chose. Their side continues in **Client books** (D-SET-004).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Preparing the email…" never finishes | No two-factor session | Turn on two-factor, sign in again, use **Send again** |
| "You have already invited <email>…" | Duplicate | **Send again** or **Cancel invitation** first |
| "That invitation has expired. Send a fresh one." | Over 14 days | Cancel and invite again |

## Connect ChatGPT or Claude <!-- W-CONN-001 -->
**Goal:** Ask your own chatbot about your money.
**Who:** R-PLUS, R-FAMILY, R-PRO (not while managing someone else's account).
**Before you start:** A paid ChatGPT or Claude plan that allows custom connectors; AI connectors enabled on the server.

| # | You do | The app does |
|---|---|---|
| 1 | **Planning → AI connectors → Connect Claude** (or ChatGPT) | Copies the connector address, opens the chatbot's settings, shows steps |
| 2 | In the chatbot add a custom connector with the address, click Connect | Chatbot opens EveryPaisa's approval page (sign in if asked) |
| 3 | Choose areas and family members, **Approve** | Returns to the chatbot; alert + email "<chatbot> connected to your EveryPaisa" |
| 4 | Ask questions in the chatbot | Each lookup is listed under **Recent activity** |

**Success:** The connection appears under **Connected**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This connection request has expired. Start again from your chatbot." | Over 10 minutes | Reconnect from the chatbot |
| "Connecting your own ChatGPT or Claude needs the Plus plan." | Free plan | **See plans**, or **Cancel** |
| "Your EveryPaisa plan no longer includes the AI connector…" (in the chatbot) | Plan below Plus | Upgrade |
| "Too many requests from this chatbot. Try again in a minute." / "Daily limit reached for this chatbot. Try again tomorrow." | 60 a minute / 2000 a day per connection | Wait |

## Upgrade your plan <!-- W-PLAN-001 -->
**Goal:** Unlock paid features.
**Who:** R-FREE (or any plan).
**Before you start:** A Razorpay payment method.

| # | You do | The app does |
|---|---|---|
| 1 | **Upgrade** (header) or **Settings → Plan → Pricing** | Shows plans |
| 2 | Pick **Monthly** or **Annual**, click **Upgrade to <plan>** | Opens Razorpay checkout |
| 3 | Pay | Verifies, sets the plan for 30/365 days, toast "Upgraded to <plan>" |

**Success:** Locks disappear immediately.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Payments are coming soon. No checkout session was created." | Payments not configured | — |
| Closed the window | Cancelled | Click again |
| Paid but still locked | Session not updated (e.g. tab closed before verify finished) | Reload; if still locked contact support with the Razorpay payment id |

## Connect a broker (Zerodha) <!-- W-CONN-002 -->
**Goal:** Let the F&O page sync trades from your broker.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** A Kite Connect developer app (API key and secret).

| # | You do | The app does |
|---|---|---|
| 1 | **Tools → Connectors → Zerodha → Configure**, enter API key and secret, **Save** | Stores them encrypted; card shows **Needs login** and the **Server redirect URI** |
| 2 | Register that redirect URI in the Kite developer console | — |
| 3 | **Connect**, log in in the popup | Popup closes; toast "Connected: zerodha" |
| 4 | Sync from the F&O page (D-CONN-001) | Imports trades |

**Success:** Card shows **Connected** and the token expiry.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Popup blocked — allow popups for this site" | Browser setting | Allow popups |
| "OAuth state expired — start login again" | More than 10 minutes | **Connect** again |
| "Kite session expired — login again" on **Refresh** | The broker session has ended and Kite has no refresh | **Connect** again |

## First-run setup on a second device <!-- W-ONB-001 -->
**Goal:** Understand why setup appears again.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** —

| # | You do | The app does |
|---|---|---|
| 1 | Sign in on a new browser with an account that has no portfolio | Dashboard sends you to setup (the "done" flag is per browser) |
| 2 | **Skip — I'll add things later** or add entries | Reuses your oldest portfolio if you have one; marks setup done here |

**Success:** Dashboard.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Setup keeps appearing | Site data cleared, or no portfolio yet | Finish or skip once in this browser |
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| "Too many auth attempts" | 20 sign-in, sign-up, reset, code or two-factor requests per network address in 15 minutes | Wait up to 15 minutes |
| Signed out on every device at once | A refresh token was used twice (treated as copied), a password reset, or account deletion | Sign in again; change your password if you did not cause it |
| Spinner on reload that never ends | The app keeps retrying while offline | Restore the connection |
| "Validation failed" | The server rejected the request's format | Check the fields and retry |
| "Switch back to your own account to do this." | An account action attempted while managing a family member | **Back to my account** in the user menu |
| "Turn on two-factor sign-in (Settings) to use …" / "Sign out and sign in again with your authenticator code to use …" | Professional or admin tools need two-factor used for this session | Settings → Two-factor sign-in; then sign in again |
| "This feature requires the <PLAN> plan or higher" | Plan gate | Pricing |
| Email codes not arriving | Spam folder, 60-second cooldown, or mail server down | Check spam; wait; resend |
<!-- END TROUBLESHOOTING -->
