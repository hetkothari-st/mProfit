# Workflows and Troubleshooting

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

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

## Set up your sidebar <!-- W-SHELL-001 -->
**Goal:** Show only the asset classes you use, in your order.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Use a screen at least 768px wide (or the phone drawer) with the sidebar expanded.

| # | You do | The app does |
|---|---|---|
| 1 | Click **My order** if the heading shows **By value** | The list switches to your saved order (remembered on this browser) |
| 2 | Click **Edit** next to **Asset Classes** | Drag handles, eye buttons and × buttons appear |
| 3 | Drag classes into order; click the eye on classes you don't use | Hidden classes turn faded and struck through |
| 4 | Click **Done** | **Saving…**, then the new list; hidden classes also leave the Dashboard |
| 5 | Click **Add asset class** → **Crypto** (for example) | Crypto is added at the end and saved |

**Success:** The sidebar shows your classes in your order on every device you sign in to.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Red text under the heading | Saving failed | Click **Done** again |
| You changed the order but the list is sorted by size | **By value** is on | Click **By value** to switch to **My order** |

## Check your net worth on the Dashboard <!-- W-DASH-001 -->
**Goal:** See today's net worth, debts and what needs attention.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** At least one portfolio with holdings, or other assets recorded.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Overview → Dashboard** | Cards load; the net worth is hidden as "₹ • • • • • • •" |
| 2 | Click **Refresh** (optional) | Fetches prices for stocks you hold and re-values holdings; shows "Updated N price(s) · M holding(s)" |
| 3 | Click the eye next to **Total Net Worth · Consolidated** | The gross total appears with Investments, Real Estate, Vehicles, Sum Assured |
| 4 | Read **Loans & credit cards** | **Net after debts** = total minus loans and card balances |
| 5 | Click an urgent item in the alerts strip | Its section opens (Insurance, Vehicles, Rental, Loans) |
| 6 | Pick one portfolio in the picker (optional) | Investment cards, portfolio chart, pie and top holdings show that portfolio only |

**Success:** You know your gross and net figures and your next dues.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Sent to the setup wizard | No portfolios and this browser never finished setup | Finish or skip the wizard |
| "Come back tomorrow to see your net worth trend." | Fewer than two nightly snapshots | Wait a day |
| **View all** under Top holdings shows "This page doesn't exist" | Broken link | Use **Portfolios → Inspect** |

## Create a portfolio and group it with another <!-- W-PORT-001 -->
**Goal:** Keep two portfolios separate and also see them combined.
**Who:** R-PLUS, R-FAMILY, R-PRO (Free allows only one portfolio).
**Before you start:** A plan that allows another portfolio.

| # | You do | The app does |
|---|---|---|
| 1 | **Portfolios → New portfolio**; enter **Name**, pick **Type** and **Currency**; **Create** | "Portfolio created"; a new card appears |
| 2 | Open it with **Inspect** → **Add transaction**; record a buy | "Transaction added"; the holding appears in the table |
| 3 | Back on **Portfolios**, click **New group** | "Create a portfolio group" opens |
| 4 | Enter **Name**, tick both portfolios (same currency), **Create group** | "Group created"; it appears under **Family groups** |
| 5 | Click **Inspect** on the group | Combined value, invested, P&L and merged holdings |

**Success:** The group page shows both portfolios combined.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **New portfolio** is greyed out; "Your FREE plan allows 1 portfolio. Upgrade to PLUS for multiple." | Plan limit | Upgrade via **upgrade to add more** |
| A portfolio cannot be ticked in the group | Different currency | Use portfolios with the same currency |
| The portfolio's top cards did not change after adding a transaction | Those cards are not reloaded automatically | Leave the page and return |

## Record a trade and clean up a duplicate <!-- W-TXN-001 -->
**Goal:** Add a buy, handle a "duplicate" warning, and remove a double entry.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** A portfolio you created.

| # | You do | The app does |
|---|---|---|
| 1 | **Transactions → Add transaction** | The dialog opens with today's date and type BUY |
| 2 | Pick the portfolio; search the stock (2+ letters) and pick it | "Selected: <name>"; asset class becomes EQUITY |
| 3 | Enter **Quantity**, **Price**, optional **Charges (optional)**; check **Net (outflow)** | Gross, charges and net update as you type |
| 4 | Click **Add transaction** | "Transaction added", or the banner "You may already have this one" |
| 5 | If the banner appears and it really is a second trade, click **Record it anyway**; otherwise **Let me check** and **Cancel** | Saved, or nothing saved |
| 6 | Later, after an import, click **Find duplicates** | Sets of repeated rows; obvious repeats are pre-ticked |
| 7 | Review, then **Remove N selected** → **Yes — remove N row(s)** | "Removed N transaction(s) …"; holdings recalculate |

**Success:** Each trade appears once; holdings and gains are correct.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Add transaction** does nothing | Trade date or price invalid/blank (no message is shown) | Fill a valid date and price |
| "Forbidden" | The portfolio was created by someone else | Add it in your own portfolio |
| Editing shows "Saving this would match …" and **Record it anyway** does nothing | Override is not sent for edits | Change a detail or delete the other row |

## Add a bank account and share its details <!-- W-BANK-001 -->
**Goal:** Record an account and send its details to someone paying you.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** The account's IFSC and customer ID; the full account number if you want to share it.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Bank Accounts → Add account** | "Add bank account" opens; holder is your name |
| 2 | Pick the **Bank** | IFSC starts with the bank's code; Customer ID copied from your other account at that bank |
| 3 | Type the **Full account number (optional)** | **Last 4 digits** fill in and lock |
| 4 | Type the full **IFSC** | "Looking up branch…", then branch and address fill in |
| 5 | Fill **Customer ID**, balance and other fields; **Add account** | "Account added"; a tile appears |
| 6 | Click **Share details** on the tile | Phone: share sheet opens; computer: "Bank details copied" |

**Success:** The tile shows the account and the shared text contains holder, number, IFSC and branch.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Required" under Customer ID | The form requires it | Enter the bank's customer ID |
| "Add the full account number (Edit) to share bank details." | Only last 4 saved | **Edit** and add the full number |
| "Couldn't load bank details. Try again in a minute." | More than 5 reveals/shares in a minute, or error | Wait a minute |

## Work through your alerts <!-- W-ALERT-001 -->
**Goal:** Clear what is due and add your own reminder.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | Click the bell in the top bar | Alerts & Reminders opens, grouped Overdue / This week / This month / Later |
| 2 | Click **Scan now** | All checks run; "Scan complete — N new alerts" (counts vehicle and rent only) |
| 3 | Click **Overdue** | Only overdue items on this page |
| 4 | Tick (**Mark as read**) or bin (**Dismiss**) each item | Rows update; the bell count drops |
| 5 | **New reminder** → **Title**, **Reminder date** → **Create** | "Alert created"; it appears in its band |

**Success:** Nothing unread; your reminder is listed.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Nothing in this view" | The chip hides all loaded alerts | **Show all** |
| A dismissed alert comes back later | A check raised it again at its next threshold | Dismiss it again, or fix the underlying item |

## Ask the AI Assistant your first question <!-- W-AI-001 -->
**Goal:** Get an answer about your own portfolio.
**Who:** R-PLUS, R-FAMILY, R-PRO (R-FREE sees a locked preview).
**Before you start:** The operator has the assistant switched on; you are not managing someone else's account.

| # | You do | The app does |
|---|---|---|
| 1 | Click the round assistant button | The panel opens; the AI-use notice appears the first time |
| 2 | Read it and click **I understand** | "Hi <name>. Ask me anything." with suggested questions |
| 3 | Tap a suggested question or type one and press Enter | "Thinking through your numbers…", then the answer streams in |
| 4 | Tap a "Try next" question, or **Chat history** → **New chat** for a fresh topic | Another answer / an empty chat |

**Success:** An answer based on your data; the header shows questions left today.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Blurred answer with **Upgrade to unlock** | Free plan | Upgrade to Plus or higher |
| "You've hit the daily limit of <n> questions. Resets tomorrow." | Daily limit used | Wait for 05:30 IST |
| "Request failed with status code 404" in the panel | Assistant switched off on this server | Ask the operator |
| "Chat session not found" | Managing a family member's account, or the chat was deleted | **Back to my account**, or **New chat** |

## Import a contract note or statement file <!-- W-IMPORT-001 -->
**Goal:** Add the trades in a broker contract note, CAS or spreadsheet to a portfolio.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER for the managed person).
**Before you start:** Have at least one portfolio. Add your PAN and date of birth in Settings so locked PDFs open automatically.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Import** | Shows **Upload a file** and **Import history** |
| 2 | Optionally choose **Target portfolio (optional)** | Remembers it for this upload only |
| 3 | Drop the file or click **Choose file** | Shows "Uploading…", then "File uploaded — import running in background" |
| 4 | Wait | The row goes **Pending** → **Processing** → final status; the list refreshes every 2 seconds |
| 5 | If the row shows **Errors**/**Warnings**, click it | Opens "Import issues — <file>" |

**Success:** Row **Completed** with a **Success** count; transactions appear in **Overview → Transactions**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Needs password** | Locked file | Follow W-IMPORT-002 |
| **Failed**, "No parser accepted this file. …" | Unsupported layout | Export CSV/Excel from the broker, or enter by hand |
| **Failed**, "This PDF contains no extractable text …" | Scanned PDF | Get a text PDF |
| **Partial** | Some rows failed | Open **Errors**, fix by hand, or **Reprocess** later |
| "Uploaded file content does not match its …" | Renamed file | Upload the original |

## Unlock a password-protected statement <!-- W-IMPORT-002 -->
**Goal:** Import a PDF or Excel file that is encrypted.
**Who:** Same as W-IMPORT-001.
**Before you start:** Know the password (often PAN in capitals, or PAN + date of birth DDMMYYYY).

| # | You do | The app does |
|---|---|---|
| 1 | Click the **Needs password** chip | Opens "Unlock <file>" |
| 2 | Type the password; leave **Remember this password for future locked files** ticked if you want it reused | — |
| 3 | Click **Unlock** | Runs the import again; shows "Password accepted — reprocessing" |
| 4 | Look at the row | **Completed**/**Partial** if unlocked; still **Needs password** if the password was wrong |

**Success:** The row leaves **Needs password**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Still **Needs password** after "Password accepted" | Wrong password (the toast does not say so) | Try again with another password |
| "Reprocessing timed out — try a smaller file" | Over 5 minutes | Split the file |

## Recover a failed or partial import <!-- W-IMPORT-003 -->
**Goal:** Get the missing rows of a failed or partial import in.
**Who:** Same as W-IMPORT-001.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Errors** on the row and read the reasons | Shows warnings and row errors |
| 2 | Fix the cause (create a portfolio, set PAN, get a text PDF) | — |
| 3 | Click the reprocess icon | Runs again from the stored copy; only missing rows are added |
| 4 | Or wait | The app retries **Failed**/**Partial** jobs automatically up to 3 times (nightly at 02:15 IST and after restarts, at least an hour after the last run) |

**Success:** Row **Completed**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Failed** with no **Errors** button | Worker stopped the job; reason not displayed | Reprocess or upload again |
| "Source file not found on server" | Very old job without a stored copy | Upload again |

## Set up email ingestion <!-- W-INGEST-001 -->
**Goal:** Have transaction alerts from your bank, broker or insurer emails read automatically.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (not while managing another account).
**Before you start:** A Gmail account that receives the alerts. The server must have the AI parser switched on (operator).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Inbox → Connect your Gmail** and click **Connect Gmail** | Sends you to Google |
| 2 | Choose the account and allow access | Returns to the app: "Connected <email>", then **Choose how far back to scan** |
| 3 | Click **Skip for now** (or start an inbox scan, W-MAIL-001), then go back to **Inbox → Connect your Gmail** | Step 2 **Senders to monitor** is now open |
| 4 | Click **Scan inbox** | Lists likely financial senders with scores |
| 5 | Tick the senders (use full addresses, not `@domain`) and click **Add <n> senders** | "Added <n> sender(s)"; senders start **Active** with auto-commit on |
| 6 | Optional: open **Sender settings** and switch auto-commit off for senders you want to review | Their events will wait in **Pending review** |
| 7 | Wait for the next poll (default every 3 minutes) | New events appear in **Pending review** or are written directly |

**Success:** Events from your senders appear under step 3 or in **See committed / rejected → Auto-committed**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| No events ever appear | AI parser disabled on the server, or `@domain` senders | Ask the operator; add full addresses |
| "Switch back to your own account to do this." | Managing another account | **Back to my account** |
| Account shows **Paused**, "Gmail access lost …" | Google rejected the grant | **Add another** with the same account |

## Review and approve email events <!-- W-INGEST-002 -->
**Goal:** Decide which parsed events become records.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** W-INGEST-001 done.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Inbox → Connect your Gmail**, step 3 | Lists waiting events by sender |
| 2 | Click a row to check details, or **View original in Gmail** | Shows amount, type, counterparty, confidence, notes |
| 3 | Click **Approve & commit** (or the tick) | "Event approved and committed"; a transaction or cash-flow entry is created |
| 4 | Or type a **Rejection reason (optional)** and click **Reject** | "Event rejected" |
| 5 | For a trusted sender with several events, click **Approve all** | "Bulk approved: <a> succeeded, <f> failed of <n>" |
| 6 | When the banner offers it, click **Enable auto-commit** | Future confident events skip review |

**Success:** The queue shows "Inbox is clear".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Approval rolled back — projection failed: …" | Missing amount/quantity or no portfolio | Reject and enter by hand, or create a portfolio |
| Approved SIP/FD/rent event created nothing | Those types are only marked handled | Enter the record by hand |

## Connect Gmail and back-fill with an inbox scan <!-- W-MAIL-001 -->
**Goal:** Pull years of statements and contract notes from Gmail at once.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | Connect Gmail (W-INGEST-001 steps 1–2) | Opens **Choose how far back to scan** |
| 2 | Pick **Scan from**/**Scan until** or a preset (default 5 years) | — |
| 3 | Click **Start scan** | "Scan started — review docs as they appear"; opens **Reports → Inbox imports** |
| 4 | Approve the documents you want in **Reports → Inbox imports** | Each approved document becomes an import job in **Tools → Import** |

**Success:** Approved documents show **Completed** in **Import history**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "lookbackTo must be after lookbackFrom" | Same day chosen twice | Pick a range of at least two days |
| "Connect Gmail before starting a scan" | No active Gmail | Connect again |
| "Too many requests for this operation. Please wait a minute." | More than 5 scans in a minute | Wait |

## Request a CAS and get it imported <!-- W-CAS-001 -->
**Goal:** Get a mutual fund or depository CAS into the app.
**Who:** Any signed-in user.
**Before you start:** Connect Gmail if you want the PDF imported automatically.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → CAS**, choose **Provider**, optionally PAN, email and dates | — |
| 2 | Click **Generate Request** | Shows **Open provider portal**, **Instructions**, **Next steps** |
| 3 | Open the portal and submit the provider's form | The provider emails a locked PDF |
| 4 | If Gmail is connected, wait (or click **Scan inbox** on **Asset Classes → Mutual Funds**) | The attachment becomes an import job |
| 5 | Otherwise download the PDF and upload it on **Tools → Import** | As W-IMPORT-001 |

**Success:** The CAS row in **Import history** is **Completed**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Validation failed" on **Generate Request** | PAN not 10 characters or bad email | Fix or clear the field |
| CAS row **Needs password** | Password not PAN / PAN+DOB, or profile missing them | W-IMPORT-002 |

## Sort documents into folders <!-- W-DOCS-001 -->
**Goal:** File personal documents by person and type.
**Who:** R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Plus plan or higher.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Documents** | Shows the drop area and folders |
| 2 | Drop PDFs/photos or click **Choose files** | Uploads in groups of 10, shows progress |
| 3 | Wait | Files are read and filed: "Filed into <person> / <type>" |
| 4 | Open a person folder | Files grouped by type, renamed "<Type>_<date>" |

**Success:** All files are in person folders; **Needs attention** is gone.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Files in **Needs attention** | Name not found, locked, unreadable or unsupported type | W-DOCS-002 |
| "Documents is locked" | Free plan | Upgrade |

## Fix a document that needs attention <!-- W-DOCS-002 -->
**Goal:** File documents the sorter could not file.
**Who:** R-PLUS, R-FAMILY, R-PRO.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | Click **Needs attention** | Lists unfiled files with their reason |
| 2 | For **Needs a password**: click **Enter password**, type it, click **Unlock** | Reads the file again |
| 3 | For **Needs review** / **Could not be read**: click **Assign**, choose **Person** (or **New person…**) and **Document type**, click **Move and rename** | "Moved and renamed"; the file is filed |
| 4 | If an auto-created folder duplicates a person, open it and use **Merge into…** + **Merge** | "Folders merged" |

**Success:** **Needs attention** disappears.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This document is still being read. Try again in a moment." | Still processing | Wait |
| "Enter a name using letters only" | Invalid new person name | Use letters only |
| "A folder with that name already exists. Merge the two folders instead." | Rename clash | Merge instead |

## Import your mutual fund history from a CAS PDF <!-- W-MF-001 -->
**Goal:** Get every mutual fund transaction from a CAMS / KFintech CAS into EveryPaisa.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER imports into the managed person's data).
**Before you start:** Download your CAS PDF (or request one with W-MF-002 / W-MF-003).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → Mutual Funds**, click **Import CAS PDF** | Scrolls to **Automated CAS Import** |
| 2 | Drop the PDF or click **Choose file** | Toast "CAS uploaded — parsing in background. Status will update below."; **Recent imports** shows Pending/Processing |
| 3 | Wait (10–30 seconds for large files) | Status polls every 2 seconds; holdings and transactions refresh when done |
| 4 | If **Needs password**: click it, enter the PDF password | "Password accepted — reprocessing" |
| 5 | Check the row count and the holdings table | Holdings show units, value and P&L (F-MF-001) |

**Success:** Status **Completed**, rows "N/N rows", funds appear in the holdings table.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Failed** or **Partial** | Some rows could not be parsed | Click **View**; fix via the Import page (D-MF-003) |
| "CAS confirmed — no MF transactions in this period. …" | The statement's date range has no MF transactions | Request a wider range (W-MF-002) |
| Funds listed without NAV | NAV not yet loaded for the scheme | Wait for the nightly update at 22:00 IST |

Continues on the Import page for error handling (D-MF-003).

## Request a CAS from CAMS and KFintech <!-- W-MF-002 -->
**Goal:** Have both registrars email you a CAS, then import it.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Know the email registered on your folios; Gmail connected if you want auto-import (D-MF-004).

| # | You do | The app does |
|---|---|---|
| 1 | Click **Sync via CAMS / KFintech** | Loads your saved PAN |
| 2 | If prompted, **Set PAN now** → type PAN → **Save PAN** | "PAN saved to profile" |
| 3 | Enter **Email**, choose **Period** (S-MF-004), click **Continue** | Opens both portals; toast "CAMS & KFintech reached" |
| 4 | Type each captcha shown | — |
| 5 | Click **Submit CAS Request** within 5 minutes of step 3 | Shows per-portal OK / failed result |
| 6 | Wait 5–60 minutes for the emails | Gmail import (if configured) or upload the PDF via W-MF-001 |

**Success:** **CAS request submitted** with "CAMS: OK" and/or "KFintech: OK".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Failed to reach CAMS or KFintech portals. Try again or use PDF upload." | Portals unreachable | Retry later or use W-MF-001 |
| "failed — CAMS session expired" | More than 5 minutes passed | Start again |
| "failed — … rejected the captcha" | Wrong captcha | Start again |
| No email | Email or PAN not on the folios | Check with the registrar |

## Request a CAS through CASParser <!-- W-MF-003 -->
**Goal:** Get a KFintech-issued CAS (covering CAMS and KFintech funds) by PAN + email, auto-imported from Gmail.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Gmail connected (D-MF-004) for automatic import.

| # | You do | The app does |
|---|---|---|
| 1 | Click **Sync MF via CASParser** | Opens **Sync Mutual Funds via PAN + Email**; shows CASParser credits when available |
| 2 | Enter **PAN**, **Email**, choose **Period** (S-MF-001) | **Request CAS** enables when both look valid |
| 3 | Click **Request CAS** | Shows **CAS request submitted** and a reference; adds CAS senders to your Gmail monitoring and starts a Gmail sync |
| 4 | Wait 5–60 minutes | The email is imported automatically when Gmail is connected; otherwise use W-MF-001 |

**Success:** A new CAS import appears under **Recent imports**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Too many requests for this operation. Please wait a minute." | More than 5 requests in a minute | Wait |
| "Internal server error" | CASParser not configured or rejected the call | Try W-MF-002 or upload a PDF |

## Review your mutual fund portfolio analysis <!-- W-MF-004 -->
**Goal:** Understand returns, overlap, cost and tax across your funds.
**Who:** R-PLUS, R-FAMILY, R-PRO.
**Before you start:** At least one mutual fund holding.

| # | You do | The app does |
|---|---|---|
| 1 | Click **Portfolio analysis** on the Mutual Funds page | Computes the analysis on request |
| 2 | Read **Mutual fund book**, **Funds you hold**, **Overlap**, **Look-through**, **Cost**, **Tax**, **Goals** | Each section states when a figure is unavailable and why |
| 3 | Click a scheme name | Opens the fund page (W-MF-005) |

**Success:** All sections render; unavailable figures carry a reason.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Lock card "Portfolio analytics is locked" | Free plan | **View plans** (D-MF-005) |
| **Could not analyse your portfolio** | Server error or invalid family view | Retry or switch to personal view |

## Research a fund and refresh findings <!-- W-MF-005 -->
**Goal:** See how a fund scores against its category and what the analysis concluded for your holding.
**Who:** R-PLUS, R-FAMILY, R-PRO.

| # | You do | The app does |
|---|---|---|
| 1 | Open a fund from **Funds you hold** | Shows **Overview** (S-MF-010) |
| 2 | Click **Detailed calculations**, choose a horizon (S-MF-011) | Shows score card, metrics, peer percentiles |
| 3 | In **What we found**, click **Refresh analysis** | Runs a new analysis (once per hour) and updates every fund page |

**Success:** A verdict chip and findings for the fund.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Analysis was refreshed less than an hour ago. Next refresh available at <time>." | Cooldown | Wait |
| **No verdict for this fund** | Not held, or added after the last run | Refresh analysis |
| "Unknown scheme code: <code>" | Scheme not in the research data | None |

## Import mutual funds from Finvu (operator sandbox) <!-- W-MF-006 -->
**Goal:** Pull Finvu account-aggregator mutual fund data into a portfolio.
**Who:** R-PLUS, R-FAMILY, R-PRO; Finfactor must be configured or in demo mode.

| # | You do | The app does |
|---|---|---|
| 1 | In the Finvu card, set **Unique identifier** (S-MF-007) | — |
| 2 | Optionally click **MF insights** or **Statement** to preview | Renders the response |
| 3 | Choose **Destination portfolio** (S-MF-008), click **Import to portfolio** | Creates transactions; toast with created/skipped counts |
| 4 | Reload the page | Holdings table shows the imported funds |

**Success:** Toast "Imported N txns into "<portfolio>" …".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This feature requires the PLUS plan or higher" | Free plan | Upgrade |
| Buttons disabled, **Token missing** | Not configured | Operator action |
| Page unchanged after import | Page cache not refreshed | Reload |

## Record a stock purchase and check it <!-- W-STOCK-001 -->
**Goal:** Add a stock you bought and see it valued.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).
**Before you start:** At least one portfolio.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → Stocks** | Shows holdings or "No equity holdings" |
| 2 | Click **Add transaction** | Opens "Add transaction" (D-ASSET-002) |
| 3 | Fill the stock, quantity, price and date; save | Saves; rebuilds the holding; starts a background price refresh |
| 4 | Click **Refresh prices** if LTP shows "—" | "Refreshed N stock prices"; LTP and Value fill in |

**Success:** The stock row shows Qty, Avg cost, LTP "as of …", Value and P&L.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "…is already recorded. Record it again only if this is a second, genuine trade." | Same trade exists | Confirm in the form if it's genuine (the Transactions form offers this) |
| LTP stays "—" | No price for the symbol | Check the symbol; wait for the 16:30 IST end-of-day job |

## Add a fixed deposit and follow it to maturity <!-- W-FD-001 -->
**Goal:** Track an FD's value and get maturity reminders.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).
**Before you start:** Bank name, amount, opening date, rate, payout frequency, maturity date.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → FDs & RDs** → **Add** ▾ → **Fixed Deposit** | Opens "Add Fixed Deposit" |
| 2 | Pick the bank, enter **Principal Amount (₹)**, date, **Interest Rate**, **Interest Payout**, **Maturity Date**; optionally the FD number | — |
| 3 | Click **Add FD entry** | "FD entry added"; a card appears with **At maturity**, progress and **Worth today** |
| 4 | Within 30 days of maturity | "Coming up" lists it; the bell gets alerts at 30, 15, 7 and 1 days |
| 5 | When it matures, add a **Maturity payout** entry | The deposit closes and leaves the page; reminders stop |

**Success:** The card shows the projected maturity value and the matured stamp after the date.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Add a rate and maturity date to see what this deposit becomes." | Missing rate or maturity | Edit the deposit |
| Two FDs at the same bank merged into one card | Same name, no FD number | Edit each to add its FD number |
| Duplicate message when adding a second identical FD | Same bank, date, amount | Add the FD number to tell them apart |

## Run a recurring deposit installment by installment <!-- W-FD-002 -->
**Goal:** Record an RD and tick off each month.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).
**Before you start:** Monthly amount, start date, rate, tenure.

| # | You do | The app does |
|---|---|---|
| 1 | **FDs & RDs** → **Add** ▾ → **Recurring Deposit** | Opens "Add Recurring Deposit" |
| 2 | Enter **Monthly Installment (₹)**, **Installment date** (first payment), rate, **Tenure (months)** | **Maturity Date (auto-filled)** = start + tenure |
| 3 | Click **Add RD entry** | "RD entry added"; RD card shows "1 of <tenure>" |
| 4 | Open the RD card | Detail page with **Installment schedule** |
| 5 | Each month click **Mark paid** on the due row | "Installment marked paid"; row turns **Paid** |
| 6 | Paid by mistake? Click **Undo** | "Entry removed" |

**Success:** "<paid> / <total> paid"; Next EMI moves forward; reminders 3/1/0 days before each due date.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Installment shows **Overdue** | Not recorded | **Mark paid** |
| After a **Maturity payout** entry the RD is still listed | That entry removes only one installment | Delete the remaining installments, or leave it (see DOCUMENTATION_GAPS.md) |

## Record gold jewellery with photos <!-- W-GOLD-001 -->
**Goal:** Add a piece of jewellery valued at today's rate.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Gold & Silver** → **Add** | "Add Gold / Silver" with today's 24K price filled ("live") |
| 2 | Keep **Physical Gold**, pick **Carat** (e.g. 22K) | Price per gram re-fills at 22/24 of the 24K price |
| 3 | Name it ("Gold bracelet"), enter **Weight (grams)** and date; adjust price to what you paid | — |
| 4 | **Add photo** (up to 5) and click **Add entry** | Saves as "22K Gold bracelet", uploads photos, "Entry added" |
| 5 | Click the holding | Detail page with photo carousel and live valuation |

**Success:** The page values the piece at the 22K live rate.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Max 5 photos per entry" | Too many photos | Remove some |
| Dashboard value differs from the Gold page | Server values at 24K | Known limitation (DOCUMENTATION_GAPS.md) |

## Add a coin with live pricing <!-- W-CRYPTO-001 -->
**Goal:** Track a crypto holding with live INR/USD value.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Crypto** → **Add Crypto** | Opens "Add Cryptocurrency" |
| 2 | Type "BTC" in **Coin** and pick **Bitcoin** | "Linked to CoinGecko · live prices enabled" |
| 3 | Enter **Quantity**, click "Use this →" or type **Price ₹**, pick exchange | — |
| 4 | Click **Add entry** | "Crypto entry added"; a coin card with live value appears |

**Success:** Card shows INR and USD value and 24h change.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Coin not in search | Not in the app's coin list | Enter as free text (no live price) |

## Record a Post Office scheme <!-- W-PO-001 -->
**Goal:** Track an NSC (or any of the 8 schemes).
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (portfolio owner).

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Post Office** → **Add first NSC** (or **Add scheme**) | "Add Post Office Entry" with NSC selected |
| 2 | Enter **Post Office branch**, **Certificate number**, date, **Certificate amount (₹)**, rate 7.7 | **Maturity date** auto-fills 5 years later |
| 3 | Click **Add entry** | "Post Office entry added"; NSC section shows the account with accrued value |
| 4 | Open the account | Detail page with projected growth and CAGR |

**Success:** Current value grows yearly; alerts at 30/15/7/1 days before maturity.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Current shows "—" | No interest rate saved | **Edit details** and add the rate |

## Connect Zerodha and sync today's F&O trades <!-- W-FNO-001 -->
**Goal:** Bring F&O trades in from Kite.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO with a Kite developer app.
**Before you start:** API key and secret from developers.kite.trade; the redirect address the dialog shows registered in your Kite app.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → F & O** → **connect** on **Kite (Zerodha)** | "Connect broker" dialog |
| 2 | Paste **API key**, **API secret**; **Save & continue** | "Kite (Zerodha) configured"; opens the Kite login popup |
| 3 | Log in to Kite in the popup | Popup closes; "Kite (Zerodha) login complete"; chip shows a tick |
| 4 | Click **Sync Kite** | "Synced — N new trades"; positions and trades refresh |
| 5 | Next day, click **login** on the chip before syncing | Kite needs a daily login |

**Success:** Open positions appear in the Futures Ledger / Options Chain.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Popup blocked — allow popups and retry." | Browser blocked popup | Allow popups |
| "Login to Kite (Zerodha)." | Session expired | Complete login; sync resumes |
| Earlier days' trades missing | Sync fetches today only | Import contract notes (D-ASSET-012) |

## Close an F&O position at expiry <!-- W-FNO-002 -->
**Goal:** Book the expiry of a contract held to expiry.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

| # | You do | The app does |
|---|---|---|
| 1 | Expiry day, after 17:30 IST | Job creates an expiry close request, sets status "EXPIRY ?", alert "… expires today" |
| 2 | **F & O** → **Expiry** | Lists "Expiry close <date>" with contracts and settlement |
| 3 | Click **Approve** | "Approved"; closing trade booked at settlement; position closed (EXPIRED_WORTHLESS if 0) |

**Success:** The contract moves to **Closed**; P&L appears under **Tax / P&L**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "No settlement price for this contract yet — add it before closing the position at expiry." | Bhavcopy not stored | Retry after the 16:45 bhavcopy job has run; there is no manual price field |
| Clicked **Reject** by mistake | Request rejected; position stays "EXPIRY ?" | No in-app way to re-open it (DOCUMENTATION_GAPS.md) |

## Add a home loan and keep it up to date <!-- W-LOAN-001 -->
**Goal:** Track an existing home loan so the outstanding balance, next EMI, tax benefit and reminders are right.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER for the managed person).
**Before you start:** Have the sanction letter or loan statement: principal, rate, tenure in months, EMI, disbursement date, first EMI date.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → Loans**, click **Add loan** | Opens **Add loan** (type Home, Reduce tenure, Not sure, None, Active) |
| 2 | Pick the lender, fill borrower, principal, rate, tenure, EMI (or click the calculator button), both dates | Validates required fields ("Required") |
| 3 | Set **Tax benefit section** to **80C + 24B (Home loan)**; set **Rate type** **Floating**, **Linked to** **Repo rate (EBLR)** if applicable | Shows the floating fields |
| 4 | Click **Save** | Toast "Loan added"; the loan card appears with **Outstanding**, **Next EMI**, **EMIs left** |
| 5 | Open the loan, scroll to **Amortization schedule** | Table scrolls to the first unpaid month; earlier unpaid months show **Overdue** |
| 6 | Click **Mark paid** on each EMI already paid | Toast "Marked paid" per row; outstanding and interest paid update |
| 7 | Each month, click **Mark paid** on the new EMI (or wait for the reminder in **Alerts**) | Reminders arrive 30, 15, 7, 1 days before and on the due day |

**Success:** **Outstanding balance** matches your lender statement within rounding; **Tax benefit — Section 80C + 24(b)** shows this year's estimate.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Toast "Failed to add loan" with "Request failed with status code 422" | An amount has commas or ₹, or tenure is above 600 | Use plain numbers |
| Outstanding differs from the bank's figure | Your bank's EMI/rounding or past rate resets differ from the stored terms | Edit the rate/EMI to current values, or record prepayments |
| Dashboard liability higher than the Loans page | Past EMIs not marked paid count differently on the dashboard | Mark past EMIs paid |

## Record a prepayment or close a loan early <!-- W-LOAN-002 -->
**Goal:** Reflect a part-prepayment, or a full foreclosure.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** The loan exists and is Active; choose **Prepayment option** (Reduce tenure / Reduce EMI) in Edit if not set.

| # | You do | The app does |
|---|---|---|
| 1 | Open the loan, click **Record payment** | Opens **Record payment** |
| 2 | Choose **Prepayment** (or **Foreclosure**), set **Paid on** and **Amount (₹)** | For prepayment shows "Prepayment savings will be shown after recording" |
| 3 | Click **Save** | Toast "Payment recorded"; schedule recomputes from the next EMI |
| 4 | (Prepayment) read the banner "This prepayment saves you ₹… in interest!" | **Dismiss** hides it |
| 5 | (Foreclosure) return to **Loans** | The loan moves under **Closed / Foreclosed** |

**Success:** **Remaining months** drops (Reduce tenure) or **Next EMI** amount drops (Reduce EMI); a foreclosed loan shows status Foreclosed.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Foreclosure recorded by mistake | — | Delete the foreclosure row in **Payment history** (**Del**); the loan reopens as Active |
| No savings banner | The saving versus the original plan is 0 or less | Expected |

## Check whether refinancing pays off <!-- W-LOAN-003 -->
**Goal:** Compare your loan with today's lowest market rate after switching costs.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** The loan is Active and its type is not **Other**.

| # | You do | The app does |
|---|---|---|
| 1 | Open the loan, find **Compare with market** | Shows "Your rate X%" and "Market from Y% (<lender>, as of <date>)" |
| 2 | If asked "Fixed or floating?", click one | Saves the rate type |
| 3 | Enter the new lender's **Processing fee (%)** and **Other charges (₹)** | Recomputes **Net saving** and **Break-even** |
| 4 | Click **Open in calculator** | Opens the EMI Calculator with the outstanding at the market rate over the remaining months |

**Success:** A green **Net saving** and "Break-even in month N".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Market rates are not available yet." | No fresh market rate | Try after the next 07:30 IST refresh |
| "Your rate is already at or below the lowest market rate." | Nothing cheaper | — |
| "Switching would not pay off at these costs" | Costs exceed interest saved | Negotiate lower fees |

Continues in the EMI Calculator (W-EMI-001). Daily alerts for this check are switched in **Settings → Notifications → Loan rate alerts** (D-LOAN-002).

## Record money you lent and track repayments <!-- W-LOAN-004 -->
**Goal:** Track an informal loan to a friend or relative repaid whenever.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Know the amount, date and any interest agreed.

| # | You do | The app does |
|---|---|---|
| 1 | **Loans → Lend money** | Opens **Lend money** with **Whenever** selected |
| 2 | Fill **Lent to**, **Amount lent (₹)**, **Lent on**, optional **Interest % / yr** and **Expected back by (optional)** | — |
| 3 | Click **Add loan** | Toast "Loan added"; the loan's page opens showing **Still owed to you** |
| 4 | When money comes back, click **Record payment**, choose **Repayment received**, enter amount and date, **Add** | Toast "Entry added"; still owed and interest due update |
| 5 | When fully repaid, **More actions → Mark settled**, confirm the date | Toast "Marked settled"; loan moves to **Settled / Written off** |

**Success:** History lists every repayment; the loan is Settled.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Enter who you lent to" / "Enter the amount lent" | Missing fields | Fill them |
| No reminder before the date | No **Expected back by** set | Edit the loan and set it |
| Settled by mistake | — | **More actions → Reopen** |
| Borrower will not pay | — | **More actions → Write off** (forgives the principal still owed) |

## Track a loan given on monthly EMIs <!-- W-LOAN-005 -->
**Goal:** Tick off monthly instalments someone pays you.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Agreed EMI, number of months and first EMI date.

| # | You do | The app does |
|---|---|---|
| 1 | **Lend money**, choose **Monthly EMI**, fill **EMI (₹)**, **Months**, **First EMI on** | Validates ("Enter the EMI amount", "Enter the number of monthly instalments", "Pick the first EMI date") |
| 2 | **Add loan** | The loan page opens with **Repayment schedule** |
| 3 | Each month click **Paid** on the instalment | Toast "EMI N marked paid" |
| 4 | For a short payment click **Partial**, enter **Received (₹)** and **On**, **Save** | Status **Partly paid**; excess flows to later instalments |
| 5 | If late, use **Mark EMI N paid** in the overdue banner | Settles the oldest open instalment |

**Success:** "N of M done"; the loan can be marked settled.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Reopen the loan to update its instalments" | Loan is closed | **More actions → Reopen** |
| A row shows "From history" | A lump-sum repayment covered it | Remove that History entry to free the row |

## Plan a loan with prepayments and export the schedule <!-- W-EMI-001 -->
**Goal:** See EMI, total cost, APR and tax saving for a planned loan, and save a file.
**Who:** Any signed-in user.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | **Tools → EMI Calculator** | Calculate tab with defaults |
| 2 | Enter loan amount, rate, tenure, first EMI date | **Result** updates |
| 3 | Open **Advanced**, **Add prepayment**, tick **Processing fee and charges** and **Tax benefit** | Shows **Interest saved by prepaying**, **APR**, **Tax saved**, **Cost after tax** |
| 4 | Click **PDF** or **Excel** | Downloads `emi-schedule.pdf` / `.xlsx` |
| 5 | Click **Share** | "Link copied" |

**Success:** File downloaded; link copied.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Fix the highlighted fields to see your EMI." | Invalid inputs | Fix the field messages |
| PDF/Excel buttons disabled | Inputs invalid, an export running, or not on Calculate | Fix inputs / switch tab |
| "Too many exports - please wait a minute" | More than 10 exports in a minute | Wait |

## Compare offers starting from live rates <!-- W-EMI-002 -->
**Goal:** Pick the cheapest of two or three lender offers.
**Who:** Any signed-in user.
**Before you start:** Offers' rate, fee and tenure.

| # | You do | The app does |
|---|---|---|
| 1 | **Live rates**, choose **Loan type** | Lists lenders lowest first, **Lowest** highlighted |
| 2 | **Use this rate** on a lender | Calculate tab uses that rate ("Using <lender> X% - check it against your own offer") |
| 3 | **Compare**, fill each offer, **Add offer** for a third | Result cards with **Cheapest overall** |

**Success:** One offer marked **Cheapest overall** (and **Cheapest after tax** when tax is on).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Couldn't load rates right now. The calculator still works." | Rate request failed | **Try again** |
| "Fix these to compare the offers:" | An error on the Calculate tab (for example first EMI date) | Fix it there |

## Add a credit card and follow a statement to payment <!-- W-CARD-001 -->
**Goal:** Track a card's bill and get due-date reminders.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Card issuer, product, last 4 digits, limit; this month's statement.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Credit Cards → Add card**; fill issuer, card, last 4 (or full number), limit, due day | Preview of the card face |
| 2 | **Save** | Toast "Card added" |
| 3 | Open the card, **Add statement**: month, amount, minimum due, due date, **Save** | "Statement added"; **Outstanding** becomes the statement amount; **Next due** shows the date |
| 4 | Reminders arrive 30, 15, 7 and 1 days before the due date in **Alerts** | — |
| 5 | After paying, click the tick, confirm amount and date, **Confirm** | "Statement marked as paid"; status Paid |

**Success:** Statement shows **paid** with the date.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Request failed with status code 409" when adding | A statement for that month exists | Use a different month or delete the old one |
| **Outstanding** unchanged after paying | Known defect: payments don't update outstanding | Add the next statement when it arrives |
| "That card number doesn't check out — check for a mistyped digit" | Luhn check failed | Re-type the number |

## Look up a saved card number <!-- W-CARD-002 -->
**Goal:** See the full card number you saved.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO.
**Before you start:** The full number was typed when adding or editing the card.

| # | You do | The app does |
|---|---|---|
| 1 | Click the eye on the card face ("Show card number") | Fetches and shows the number; writes an audit entry |
| 2 | Click again ("Hide card number") | Masks it |

**Success:** The number is visible on the card face.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Only the last 4 digits are saved. Edit the card to add the full number." | No full number saved | Edit the card and type it |
| "Could not reveal the card number. Try again in a minute." | Over 5 reveals a minute or a server error | Wait a minute |

## Add a vehicle with CarInfo verification <!-- W-VEH-001 -->
**Goal:** Get a vehicle and its RC details into the app.
**Who:** Any signed-in user (R-FREE and above).
**Before you start:** Have the full number plate and a mobile phone that can receive CarInfo's OTP.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Vehicles → Add vehicle** | Opens "Add a vehicle" |
| 2 | Type the **Registration number**, click **Next** | Shows "Owner verification required" |
| 3 | Type a 10-digit mobile, click **Get OTP** | "OTP sent"; shows "Verify OTP" |
| 4 | Type the OTP, click **Verify & Fetch Details** | Creates the vehicle from CarInfo data, runs an automatic RC refresh, shows "Vehicle added", opens the vehicle page |
| 5 | Check the **Expiries** card; click **Edit** to correct dates | Saves with "Vehicle updated" |

**Success:** The vehicle page shows owner, model and expiry dates; "Last refreshed … via carinfo-playwright" (or the source of the follow-up refresh).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Failed to send OTP" / "Internal server error" | CarInfo page could not be driven | Use **Paste SMS** (W-VEH-002) |
| "Session expired or not found" | More than 10 minutes, or server restarted | Start again |
| "Saved. Could not fetch RC details automatically — retry from the vehicle page." | Follow-up refresh failed | Vehicle page → **Refresh** |
| "Too many vehicle lookups. Please wait a minute." | 5 lookups per minute | Wait a minute |

## Add or update a vehicle from the VAHAN SMS <!-- W-VEH-002 -->
**Goal:** Fill RC details when automatic sources fail.
**Who:** Any signed-in user.
**Before you start:** Text "VAHAN <reg-no>" to 07738299899 from your phone and wait for the reply.

| # | You do | The app does |
|---|---|---|
| 1 | **Vehicles → Paste SMS** (or **SMS** on a vehicle) | Opens "Paste VAHAN SMS" |
| 2 | Enter the number, paste the reply, click **Apply SMS** | Parses labelled fields; creates or updates the vehicle |

**Success:** "Vehicle <REG> created from SMS" or "… updated from SMS".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Invalid registration number: …" | Number not in a recognised format | Use the plate without spaces, e.g. MH47BT5950 or 21BH1234AA |
| "SMS does not appear to reference <REG>" | Wrong SMS pasted | Paste the reply for this vehicle |
| Vehicle saved with almost no details | SMS format not recognised | Edit the vehicle by hand |

## Check a vehicle's challans <!-- W-VEH-003 -->
**Goal:** See pending fines.
**Who:** Any signed-in user.
**Before you start:** The vehicle exists. Optionally set **Chassis (Last 4)** (needed only for the operator-enabled browser source).

| # | You do | The app does |
|---|---|---|
| 1 | Open the vehicle → **Check challans** | Tries CarInfo, then the e-challan site |
| 2 | Read the toast and the table; use **Pending**/**Paid**/**Contested** tabs | Shows counts and totals |

**Success:** "Challan scan: N new, M updated" or "no changes"; new challans also appear for review in the import review queue.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "All challan sources failed — …" | Sources unavailable | Retry later; the monthly scan on the 1st also retries |

## Value a vehicle and save it <!-- W-VEH-004 -->
**Goal:** Keep the vehicle's current value up to date.
**Who:** Any signed-in user.
**Before you start:** Make, model and manufacturing year are known (refresh RC first if not).

| # | You do | The app does |
|---|---|---|
| 1 | Vehicle page → **Get valuation** | Opens `/vehicles/value?vehicleId=…` |
| 2 | Choose **I want to sell/buy** and **Individual/Dealer** | — |
| 3 | Click **Use my car (<REG>)** | Fills inputs, fetches a quote ("Pre-filled from …") |
| 4 | Set **Kilometers driven** and click **Get price** if needed; adjust condition sliders | Estimate updates live |
| 5 | Click **Save to my vehicle** | "Saved to <REG>"; vehicle's Current value updated |

**Success:** The vehicle page shows the new **Current value**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Vehicle missing make/model/year — refresh RC first" | RC incomplete | Refresh or edit the vehicle |
| "No catalog entry for …" | Not in the catalogue | Pick the closest make/model/trim in the selects and click **Get price**; **Save to my vehicle** still saves to the vehicle in the link |
| Model/Year/Trim selects look empty after **Use my car** | Known display issue | The quote shown is still correct; Save works |
| "Valuation cache entry not found — re-run quote" | Quote missing | Click **Get price** again |

## Add a property and keep its value current <!-- W-REST-001 -->
**Goal:** Record an owned property with full cost and value.
**Who:** Any signed-in user.
**Before you start:** Purchase documents for price, stamp duty, registration, brokerage.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Real Estate → Add property** | Opens the form |
| 2 | Fill **Name *** and **Type ***, purchase costs, **Estimated current value (₹)**, **Tax due month** | — |
| 3 | Click **Add property** | "Property added"; card shows value and gain |
| 4 | Open the property → **Photos** → **Add photos**; check **Location** pin | Photos stored; pin looked up from the address |
| 5 | Later: **Refresh value** → enter value → **Update** | "Current value updated" |

**Success:** Summary tiles show the property in **Portfolio value** and **Unrealised gain**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Validation failed" | Commas or text in amounts | Use digits only |
| "Couldn't find this address on the map — place the pin yourself" | Address not found | **Place pin** |

## Sell a property and see the capital gain <!-- W-REST-002 -->
**Goal:** Record a sale and get the section 112 estimate.
**Who:** Any signed-in user.
**Before you start:** The property has a **Purchase date** and purchase costs.

| # | You do | The app does |
|---|---|---|
| 1 | Property page → **Mark sold** | Opens the dialog |
| 2 | Enter **Sale date ***, **Sale price (₹) ***, optional **Sale brokerage (₹)**; click **Mark sold** | Status Sold; "Marked as sold" |
| 3 | Read **Capital gain (section 112)** | Shows holding period, regime and estimated tax |

**Success:** The Capital gain panel shows gain and estimated tax (both options when bought before and sold on/after 23-Jul-2024).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Capital gain unavailable — sale or purchase data missing." | No purchase date | **Edit** → add Purchase date |
| "The indexed figure can't be computed: no Cost Inflation Index for FY …" | Pre-2001 purchase or sale year index not in the app | Use the 12.5% figure or compute separately |
| Sold by mistake | No undo button | Edit status back; sale fields remain — see DOCUMENTATION_GAPS |

## Turn an owned property into a rental <!-- W-REST-003 -->
**Goal:** Track tenants for a property you own.
**Who:** Any signed-in user.
**Before you start:** The property exists in Real Estate and is not sold.

| # | You do | The app does |
|---|---|---|
| 1 | Property page → **Make rental** | Creates a linked Rental record; status Rented out; toast with **Undo** |
| 2 | Click **Open rental record** | Opens `/rental/:id` |
| 3 | Continue with W-RENT-001 step 3 | — |

**Success:** Banner "This property is also tracked in Rentals." on the Real Estate page.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Undo failed" / "Internal server error" when removing | The rental has tenancies or expenses | Keep the link (tenancies cannot be deleted in the app) |

## Set up a rental property and tenancy <!-- W-RENT-001 -->
**Goal:** Start tracking rent.
**Who:** Any signed-in user.
**Before you start:** Optional: add the bank account rent goes to (Bank Accounts) so you can pick it.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Rental → Add property**, fill **Name *** and **Type**, **Save** | Property card appears |
| 2 | Open the card | Rental property page |
| 3 | **Add tenancy**: tenant name, start date, monthly rent, due day, deposit, email/phone, **Rent credited to** → **Add tenancy** | Generates monthly receipts (to end date, or 12 months); past months 7+ days due are Overdue; deposit goes to the khata |

**Success:** The tenancy card lists months with Expected/Overdue status.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Request failed with status code 422/400" | Invalid value (rent ≤ 0, end before start, commas) | Correct and retry |
| Wrong rent or dates after saving | Terms can't be edited in the app | See DOCUMENTATION_GAPS F-RENT-020 |

## Record rent and fix mistakes <!-- W-RENT-002 -->
**Goal:** Keep the khata accurate.
**Who:** Any signed-in user.
**Before you start:** A tenancy exists.

| # | You do | The app does |
|---|---|---|
| 1 | Rental property page → month row → **Received** → amount, date → **Mark received** | Adds a payment, creates a cash inflow, month becomes Received/Partial |
| 2 | (Duplicate) dialog shows "This rent is already on the khata" | Click **Record it anyway** only for a real second payment |
| 3 | Wrong month? Row → **Undo** | Removes payments pinned to that month and their inflows |
| 4 | Rent-free month? **Skip** (undo with **Undo**) | Month no longer owed |
| 5 | Late fee / discount / deposit refund: tenant name → khata → **You gave** / **You got** | Entry added, balance recomputed |

**Success:** Khata balance shows "Settled up" or the correct "To collect".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Skip** or **Undo** does nothing | Server refused silently (payment exists / not pinned) | Delete the payment in the khata, then retry |
| An auto-matched month is wrong | Bank credit matched the wrong month | **Undo** on that row (note: this also removes the bank credit's cash entry — DOCUMENTATION_GAPS F-RENT-010) |

## Send rent reminders <!-- W-RENT-003 -->
**Goal:** Remind tenants before or after the due date.
**Who:** Any signed-in user. Email needs a connected Gmail with send permission; SMS needs the operator's provider.
**Before you start:** Tenant email and/or phone.

| # | You do | The app does |
|---|---|---|
| 1 | **Rental → Properties** → Pending tenant reminders → **Run scan** (or wait for 09:00 IST) | Queues reminders for months due in 5/3/1/0 days and overdue months |
| 2 | Fix missing contacts with **Edit contact** → **Save contact** | "Tenant contact saved — channels enabled" |
| 3 | Optional **Preview** → edit text → **Save changes** | "Reminder updated" |
| 4 | Pick **Email**/**SMS**, tick reminders, **Approve & send** | "N reminders sent" or per-reason failures |
| Alt | For WhatsApp: **Collections** → **Remind** | Opens WhatsApp with the message |

**Success:** Reminders leave the panel; tenants receive messages.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Connect Gmail in Settings → Email notifications first" | No Gmail | Connect Gmail |
| "Reconnect Gmail in Settings (existing connection is missing the send permission)" | Old Gmail grant | **Reconnect Gmail** in the dialog |
| "SMS provider disabled (DLT-registered SMS provider not yet wired)" | SMS not configured | Use email or WhatsApp |
| A rejected overdue reminder is back the next day | Scan revives rejected reminders | Reject again or settle/skip the month (DOCUMENTATION_GAPS F-RENT-016) |

## Share a tenant statement <!-- W-RENT-004 -->
**Goal:** Give a tenant a written account.
**Who:** Any signed-in user.
**Before you start:** The tenancy has entries.

| # | You do | The app does |
|---|---|---|
| 1 | Tenant name → khata → **Share statement** | Downloads "rent-statement-<tenant>.pdf" |
| 2 | Send the file yourself | — |

**Success:** The PDF shows the period, all rows oldest first, totals and balance due.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Failed to download statement" | Server error | Retry |

## Add a policy and stay on top of its premiums <!-- W-INS-001 -->
**Goal:** Record a policy so premiums are scheduled and reminded.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER for the managed person).
**Before you start:** Have the policy schedule: insurer, policy number, cover, premium, frequency, start date, next due date.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → Insurance**, click **Add policy** | Opens **Add a policy** (Term life, Yearly) |
| 2 | Optionally search **Pick the plan (optional)** and pick your product | Fills insurer, plan and type; shows the brochure brief |
| 3 | Fill policy number, policyholder, cover, premium, **Paid**, **Start date**, **Next premium due** | Shows the usual grace period as a placeholder |
| 4 | Optionally **Attach a PDF**; click **Add policy** | Toast "Policy added"; the card shows the next premium |
| 5 | Open the policy, add **Nominees** and **Who to call** | Toasts "Nominees saved", "Contacts saved"; nominee warning clears |
| 6 | When a premium is within 30 days it appears in **Coming up**; after paying, click **Record payment** and confirm | Toast "Premium recorded"; next due date moves on |

**Success:** The policy card shows "Next premium <date>" and reminders arrive 30/15/7/1 days before.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "You already have this policy saved for this insurer" | Same insurer and number exist | Open the existing policy |
| Paid premium still shown as due | **Covers from** not in the due month | Use **Mark paid** on the schedule row |
| Reminders keep coming for a matured policy | Status can't be changed in the app | Delete the policy |

## Make and track a claim <!-- W-INS-002 -->
**Goal:** Know what to do, gather documents and escalate if the insurer is late.
**Who:** Policy owners (R-FREE and up; R-MANAGER).
**Before you start:** Tell the insurer; note the claim number.

| # | You do | The app does |
|---|---|---|
| 1 | Open the policy, click **Start a claim**, pick what happened | Shows "First, tell <insurer>." with the helpline, steps, documents and rules |
| 2 | Fill **Reported to the insurer on**, **What for**, **Amount claimed (₹)**; click **Start tracking** | Toast "Claim started — track it under Claims" |
| 3 | Tick documents as you collect them; add notes | Saves each tick and note |
| 4 | Click **Update** to record documents-submitted date, decision, amount paid | Shows the next step and the decision-due date |
| 5 | If late, rejected or short-paid, follow **Next: raise a complaint**, then **Next: the Insurance Ombudsman** | Escalation panel with grievance and Bima Bharosa contacts; a reminder in **Alerts** |

**Success:** The claim shows **Settled** and folds into "settled claim".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "The complaint can't be dated before the claim" | Dates out of order | Correct the date |
| No checklist | Claim recorded as **Something else** | Remove and start again with a kind |

## Bring in policies from Gmail <!-- W-INS-003 -->
**Goal:** Let EveryPaisa find policy documents and premium receipts.
**Who:** R-FREE and up with Gmail connected.
**Before you start:** Connect Gmail (`/ingestion`).

| # | You do | The app does |
|---|---|---|
| 1 | On **Insurance**, click **Turn on** for your Gmail account | Toast "Searching your Gmail for insurance documents"; searches 3 years back |
| 2 | Wait; the line shows "Searching… N document(s) found so far" | Reads found PDFs and matches them |
| 3 | Under **Password protected**, enter the PDF password, click **Open** | Toast "Opened N PDFs" |
| 4 | Under **Policies found**, click **Review and add**, check figures, **Add policy** | Policy created with the document's number |
| 5 | Under **Renewals to confirm**, click **Update the policy** or **Ignore** | Policy updated or notice ignored |

**Success:** Receipts appear as payments on the matching policies; documents are filed in Documents.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Not read yet." for a long time | Reading budget reached or model unavailable | Wait for the nightly retry |
| **Needs your check** | Reading didn't match the PDF | **Add the policy myself** or **Dismiss** |

## Track EPF by hand <!-- W-PF-001 -->
**Goal:** Keep an EPF balance without portal access.
**Who:** R-FREE and up; R-MANAGER.
**Before you start:** Have a recent passbook balance.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → PPF & EPF**, click **Add → EPF entry** | Opens **Add EPF Entry** |
| 2 | Pick **Opening / current balance**, fill employer, UAN, date, **Current Balance (₹)**; **Add EPF entry** | Toast "EPF entry added"; holding appears |
| 3 | Each month add a **Contribution (monthly)** entry | Holding grows |

**Success:** The EPF holding shows on the page and in your portfolio.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Two EPF holdings for one account | Some entries have the UAN, some don't | Edit entries so all carry the UAN |

## Fetch the EPF passbook from EPFO <!-- W-PF-002 -->
**Goal:** Pull the passbook with captcha and OTP.
**Who:** R-FREE and up.
**Before you start:** Know your UAN and EPFO password; keep the registered mobile handy.

| # | You do | The app does |
|---|---|---|
| 1 | Click **Link account**, choose **EPF**, enter UAN and holder name, **Link Account** | Toast "Account linked" |
| 2 | Click **Refresh**, enter UAN and password, **Start** | Shows progress |
| 3 | Type the captcha, **Submit CAPTCHA**; type the OTP, **Submit OTP** | Continues the fetch |
| 4 | Read "Imported N new entries." and **Close** | Last refresh date updates; the banner clears |

**Success:** The account shows "refreshed <date>"; passbook entries appear in the provident-fund statement report.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Holdings don't change | Fetched rows aren't turned into holdings (defect) | Add an **Opening / current balance** entry by hand |
| "Could not start this right now…" | Queue unavailable | Retry in a minute |
| Password reset stays on "Contacting EPFO…" | Reset never starts from the web app (defect) | Reset on the EPFO portal |

## Record an LRS remittance <!-- W-FX-001 -->
**Goal:** Log money sent abroad and watch the yearly limit.
**Who:** R-FREE and up; R-MANAGER.
**Before you start:** Have the bank's remittance advice (amount, rate, TCS).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Forex → LRS & TCS**, click **Record remittance** | Opens the dialog (today, INVESTMENT, USD) |
| 2 | Fill **Amount**, **FX rate (optional)** and **TCS deducted** (type 0 if none) | — |
| 3 | Click **Record** | Toast "Remittance recorded"; utilisation updates |
| 4 | If **LRS limit warning** appears, click **Confirm anyway** or **Adjust** | Saves past the limit or lets you edit |

**Success:** The remittance is listed with its INR equivalent.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Record** does nothing | An optional box is empty (defect) | Fill both FX rate and TCS deducted |
| "No FX rate available for …→INR" | No stored rate | Click **Refresh** on the rates panel or type the rate |

## Set a financial goal <!-- W-GOAL-001 -->
**Goal:** Track progress toward a target.
**Who:** R-PLUS, R-FAMILY, R-PRO; R-MANAGER per the manager's plan.
**Before you start:** Have at least one portfolio for the money set aside.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Planning → Goals**, click **New goal** | Opens **Create goal** |
| 2 | Click a **Quick start** template or fill name, category, target and date | — |
| 3 | Tick **Linked portfolios**; set expected return as a fraction | — |
| 4 | Click **Create** | Toast "Goal created"; card shows progress and needed CAGR |

**Success:** The card shows progress, remaining and whether you are off-track.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This feature requires the PLUS plan or higher" | Free plan | Upgrade |
| "Validation failed" | Rate typed as a percentage of 10 or more | Type 0.12, not 12 |

## Record your income <!-- W-INC-001 -->
**Goal:** Give Health Score and Coverage check a real income figure.
**Who:** R-FREE and up; R-MANAGER.
**Before you start:** Know your monthly take-home or average.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Overview → Income**, click **Add income** | Opens the dialog (Salary) |
| 2 | Fill **Employer**, **Monthly amount (₹)**, **Typical credit day**; **Add** | Toast "Income added"; total updates |
| 3 | For rent, choose **Rental** and click a suggestion | Fills from your tenancy |

**Success:** **Total active monthly income** shows the sum.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Employer required" / "Monthly amount required" | Missing field | Fill it |

## Read cash activity and the forecast <!-- W-CASH-001 -->
**Goal:** See past money movements and the next 12 months' scheduled flows.
**Who:** R-FREE and up; R-MANAGER.
**Before you start:** Approve bank alerts in the inbox, or record rent / loans / policies.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Overview → Cash Activity** | Shows the forecast card and the list |
| 2 | Check "Negative cashflow month ahead" and **Upcoming events** | — |
| 3 | Switch **Inflows** / **Outflows**; page with **Next** | Totals for the visible page |

**Success:** You see what's due and what moved.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "No cash flows found" | No approved events, rent or settlements | Connect Gmail and approve bank alerts |

## Set up books and read statements <!-- W-ACCT-001 -->
**Goal:** Get a trial balance, P&L and balance sheet from your data.
**Who:** R-PRO (R-MANAGER per the manager's plan).
**Before you start:** Have transactions, loans, rent or premiums recorded.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Accounting** | Creates the default chart of 36 accounts on first open |
| 2 | Go to **Vouchers**, click **Generate from activity** | Toast "Created N vouchers from existing activity" |
| 3 | Add any manual vouchers with **New Voucher** | Toast "Voucher created" |
| 4 | Open **Reports → Trial Balance / P&L Statement / Balance Sheet** | Books are re-projected, then shown |

**Success:** Statements show; download receipts with **Receipts (ZIP)** or **Receipts (Excel)**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Request failed with status code 400" on a second voucher | Repeated suggested number (defect) | Type a new number or reload |
| A deleted auto voucher reappears | Books are re-projected from activity | Change or delete the source record instead |

## Export to Tally <!-- W-ACCT-002 -->
**Goal:** Move your books into TallyPrime.
**Who:** R-PRO.
**Before you start:** —

| # | You do | The app does |
|---|---|---|
| 1 | On **Accounting**, click **Export to Tally** | "Preparing…", then downloads the ZIP |
| 2 | Open the README in the ZIP and import Masters, then each year's Transactions file, in TallyPrime | — |

**Success:** Toast "Tally export downloaded. The README inside has the import steps."
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "The Tally export was stopped because Tally would reject part of it …" | Data breaks a Tally rule | Fix the listed records |

## Check your data before trusting a report <!-- W-REPORT-001 -->
**Goal:** Make sure the figures in Reports are complete before filing or sharing them.
**Who:** R-FREE, R-PLUS, R-FAMILY, R-PRO; R-MANAGER.
**Before you start:** Have your transactions imported.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Reports** | Runs data checks ("Checking your data…") |
| 2 | If amber/red, click **See N issues** | Lists each issue with up to 20 examples |
| 3 | For "Some sales are for more units than were ever bought …", click **Add purchase** or **Review N matching purchase(s) from email** | Opens the pre-filled transaction form or the email review page (D-REPORT-001, D-REPORT-002) |
| 4 | For "Some saved holdings do not match the transactions …", click **Fix now** | Rebuilds stored holdings and gains; toast "Rebuilt N holding(s) from your transactions" |
| 5 | Come back to Reports | "All data checks passed. Data as of: …" |

**Success:** Green line "All data checks passed."
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Could not rebuild holdings" | Repair failed | Retry; the nightly 02:15 IST job also repairs (F-REPORT-017) |
| "Data checks could not be run, so these reports have not been verified." | Check request failed | Reload the page |
| Prices flagged as old | Price older than 5 days (2 for crypto) | Wait for the price jobs; check the asset's identifier |

## Download your capital gains for the income-tax return <!-- W-REPORT-002 -->
**Goal:** Get capital gains files for an FY to file or send to your CA.
**Who:** R-FREE and up (catalog reports need R-PLUS).
**Before you start:** Complete W-REPORT-001.

| # | You do | The app does |
|---|---|---|
| 1 | **Tools → Reports**, set **Portfolio** to **All portfolios** | — |
| 2 | Open **Statements**; (to change year, first open an FY tab and pick **Financial Year**) | Shows four statement cards with "FY …" |
| 3 | Click **PDF** on **Capital Gains Statement** | Saves `everypaisa-capital-gains-<FY>.pdf` |
| 4 | Optional: **Tax & MIS downloads** → **Income Tax — Schedule 112A** → **Excel** | Saves the Schedule 112A layout (Plus) |
| 5 | Optional: **Planning → Tax Planning → Summary → Download PDF** | Saves the CA tax report |

**Success:** Files saved on your device.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Alert containing "This feature requires the PLUS plan or higher" | Catalog report on Free | Use Statements (free) or upgrade |
| Alert with "Forbidden" | A single portfolio chosen together with another member in **Report for** | Choose **All portfolios** |

## Download a report for a family member or the whole household <!-- W-REPORT-003 -->
**Goal:** Produce a report covering a spouse or the family.
**Who:** R-FAMOWNER; R-FAMCONTRIB / R-FAMVIEWER with an uncapped view.
**Before you start:** Switch the header view to the family (D-REPORT-007).

| # | You do | The app does |
|---|---|---|
| 1 | Open **Tools → Reports** | **Report for** appears |
| 2 | Choose a member or **Whole family (one section per member)** | Tax & MIS shows "These downloads cover …" |
| 3 | Keep **Portfolio** = **All portfolios**; download from a tab, Statements or Tax & MIS | File name ends with `-family` or the member's name |

**Success:** A file with one section per member (family) or that member's data.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Your view of this family is limited to certain categories, and reports cannot yet be produced in a limited form. …" | Your family role is capped | Download your own reports; ask an owner |
| "The Tally export covers one person — …" (or the holdings / dashboard export / FY bundle equivalent) | That report is one person per file | Pick a single member |
| "A family must be selected before a report can be run for another member or for the household." | No family view | Switch to the family view first |

## Enter grandfathering FMV and download Schedule 112A <!-- W-TAX-001 -->
**Goal:** Use the 31-Jan-2018 price for equity bought before that date so long-term gains are not overstated.
**Who:** R-FREE and up; R-MANAGER.
**Before you start:** Have sales of pre-31-Jan-2018 equity in the FY.

| # | You do | The app does |
|---|---|---|
| 1 | **Planning → Tax Planning**, pick **Financial Year**, open **Grandfathering (112A FMV)** | Shows rows; "Rows requiring FMV" count |
| 2 | Click **Enter FMV** on a row, type the closing price, press **Enter** | Saves the override ("edited"), starts a recompute, reloads tables |
| 3 | Repeat until "All FMVs are filled in" | Gain with FMV and Tax benefit update |
| 4 | Click **Schedule 112A CSV (with FMV)** | Saves `schedule-112a-grandfathering-<FY>.csv` |

**Success:** CSV with the FMV column filled.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Value not kept, no message | Save failed | Retry; reload |
| "no ISIN" | Row has no ISIN | Add the ISIN to the transaction |
| CSV is your own data although a member is selected | These buttons ignore **Download reports for** | Sign in as / manage that member instead |

## Plan tax-loss harvesting before 31 March <!-- W-TAX-002 -->
**Goal:** See how much tax selling loss-making holdings could save this year.
**Who:** R-FREE and up.
**Before you start:** Current-FY gains booked.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Analytics**, keep the Tax FY on the current year | **Cut your tax bill** shows the estimated saving and candidates |
| 2 | Optional: **Detail → What-if: simulate a sale** for one candidate | Shows gain/loss, tax and cash |
| 3 | Optional: **Planning → Tax Planning → Tax Harvest** for the full list with Days to LTCG | Lists holdings by unrealised loss |

**Success:** You know which sales would offset which gains.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Harvesting losses only helps for the year you are still in. …" | A past FY selected | Switch to the current FY |
| "… you have no gains this year for them to cancel out." | Nothing to offset | — |

## Generate AI portfolio insights <!-- W-ANLYT-001 -->
**Goal:** Get an AI-written review of your portfolio.
**Who:** R-PLUS, R-FAMILY, R-PRO.
**Before you start:** Have holdings.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Analytics**, choose portfolio and period | — |
| 2 | In **AI Portfolio Insights**, click **Generate insights** | Reuses a result under 24 h old or generates one; toast |
| 3 | Click **Regenerate** for a fresh run | New narrative and cards |

**Success:** Narrative, cards and disclaimer shown.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Monthly LLM budget reached …" | Monthly AI spend cap reached | Wait for next month |
| "AI Insights are disabled (set ENABLE_LLM_INSIGHTS=true)." | Server setting | Contact the operator |
| "AI Insights is locked" | Free plan | Upgrade (D-REPORT-004) |

## Raise your Financial Health Score <!-- W-INTEL-001 -->
**Goal:** Get a full grade and improve weak areas.
**Who:** R-FREE and up; R-MANAGER.
**Before you start:** None.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Portfolio Score** | Gauge, grade (or "—") and six cards |
| 2 | On each "Not scored" card, follow **To score this** via its **Go to …** link | Opens the page to add income, expenses, policies or goals |
| 3 | Return and click **Recalculate** | New score and grade |

**Success:** A letter grade and scores on all six cards.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Grade stays "—" | Less than half the weight scored | Add income and holdings first (each 20%) |
| "Couldn't load your health score. Try again shortly." | Request failed | Reload |

## Get your first investment recommendations <!-- W-ADV-001 -->
**Goal:** A ranked list of suggested moves for your portfolio.
**Who:** R-PLUS, R-FAMILY, R-PRO (or R-MANAGER for a managed account).
**Before you start:** Have your holdings in the app (imports or manual entry). On Free, upgrade first.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Overview → Advisor** | Shows the disclaimer and **Tell us how you invest** |
| 2 | Answer the seven questions and click **Get my recommendations** | "Risk profile saved"; shows your category, score and any **Adjustments we made**; creates your four model portfolios |
| 3 | Check **Where you sit vs. your target** | Shows current vs target per bucket and the largest gap |
| 4 | Click **Refresh recommendations** | Runs the six rules; toast "N recommendations ready" |
| 5 | Read cards on the **Open** tab; click **Why this** for the figures | Shows the trade legs, reasoning and inputs |

**Success:** Cards appear under **Open** (or "No open recommendations" when nothing is needed).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Locked card | Plan below Plus | Upgrade on **Pricing** |
| **Refresh recommendations** greyed out | No risk profile yet | Finish the questionnaire |
| "Could not refresh your recommendations" | Engine run failed | Try again later |
| Allocation targets look too aggressive for your category | Known defect (allocation card reads the newest-created model portfolio) | Rely on the recommendations, which use your category |

## Act on a recommendation <!-- W-ADV-002 -->
**Goal:** Record what you decided about a suggestion.
**Who:** As W-ADV-001.
**Before you start:** At least one Open recommendation.

| # | You do | The app does |
|---|---|---|
| 1 | Place the trade yourself with your broker/platform (optional) | Nothing — the app never trades |
| 2 | On the card click **Accept**, **Done**, **Snooze 7 days** or **Dismiss** | Toast "Marked …"; the card moves to that tab |
| 3 | Later, click **Refresh recommendations** | Closed advice is not re-issued unless it changes materially (rule version, instrument shape or amount by more than 10%) |

**Success:** The card shows under its new tab.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This recommendation has been superseded by a newer one — act on that instead" | A later run replaced it | Act on the new card in **Open** |
| A snoozed card never comes back to **Open** | Snoozes are not reopened automatically (known gap) | Open the **Snoozed** tab and act on it |

## Make the Advisor use a specific fund <!-- W-ADV-003 -->
**Goal:** Override the fund the Advisor names for a bucket.
**Who:** As W-ADV-001, after the risk assessment.

| # | You do | The app does |
|---|---|---|
| 1 | In **Override list** choose a **Bucket** | — |
| 2 | Search and pick a fund or stock the app tracks | "Selected: <name>" |
| 3 | Click **Add to <bucket>** | "Added to the approved list" |
| 4 | Click **Refresh recommendations** | New buy legs in that bucket name your product (badge **Adviser-approved product**) |

**Success:** Recommendations name your product.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Add** stays disabled with "…came from a live price lookup…" | Result not in the instrument master | Pick a tracked fund/stock |
| "That product is already approved for this bucket" | Duplicate | — |

## Accept a client's invitation and open their books (professional) <!-- W-CA-001 -->
**Goal:** Work in the books of someone who invited you.
**Who:** Any account (becomes R-PROF).
**Before you start:** You received the email from the account holder; two-factor sign-in must be switched on.

| # | You do | The app does |
|---|---|---|
| 1 | Open the link in the email | Shows "<Name> would like you to see their books", the invited email and expiry |
| 2 | **Sign in** or **Create account** with the invited email | Returns to the invitation |
| 3 | If two-factor is not on, turn it on in **Settings** and sign in again with your authenticator code | — |
| 4 | Click **Accept and open their books** | "You can now see <Name>'s books" |
| 5 | Click **Open their books** | Opens **Client books**; the client is under **Your clients** |
| 6 | Click **Open books** | Opens the client's books with the access the client gave you (new grants are view-only) |

**Success:** The client's books open; **Client books** is in your sidebar.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This invitation isn't open" | Expired (14 days), used or withdrawn | Ask for a new invitation |
| "That invitation was sent to a different email address." | Wrong account | **Sign in as <invited email>** |
| "Turn on two-factor sign-in (Settings)…" / "Sign out and sign in again with your authenticator code…" | Two-factor missing for this session | Turn it on / sign in again |
| "<Name> has given you view-only access, so you cannot …" | The client has not granted that right | Ask the client to change it on Account Access |

## Onboard a client of your own (practice) <!-- W-CA-002 -->
**Goal:** Invite a client into your practice.
**Who:** R-PRO with two-factor sign-in.

| # | You do | The app does |
|---|---|---|
| 1 | **Client books → Invite a client** | Opens **Invite a client** |
| 2 | Enter **Client name** and **Their email**, click **Create invitation** | Creates a pending invitation; shows **Send the invitation** |
| 3 | Edit **Subject** / **Your message**, click **Send email** (or copy the link) | "Sent to <address>"; link valid 14 days |
| 4 | Client opens the link, signs in and clicks **Accept** | The client moves from **Waiting to accept** to **Your clients** |
| 5 | Ask the client to set your access on Account Access | Your badge changes from **View only** as they grant rights |

**Success:** The client appears under **Your clients**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Invite your own clients** leads to a not-found page | Known broken link | Use **Pricing** to upgrade |
| "This invitation has already been emailed 5 times…" | Send limit | Copy the link and send it yourself |
| "Email is not configured on this server…" | No SMTP | Copy the link |

## Keep a client's books and correct a trade <!-- W-CA-003 -->
**Goal:** Bring a client's ledger up to date and fix a wrong transaction.
**Who:** R-PROF / R-PRO with the books and transactions rights.

| # | You do | The app does |
|---|---|---|
| 1 | Open the client's books | Seeds the default chart and derives vouchers from the client's activity |
| 2 | **Transactions** → pencil on a wrong trade → change quantity/price/date → **Save correction** | "Transaction corrected"; holdings and gains recompute; the client sees the change in their activity |
| 3 | **Vouchers → Generate from activity** | "Generated N vouchers" or "Books are already up to date" |
| 4 | **Trial balance** | "Debits and credits agree" or "Out of balance by ₹…" |

**Success:** The trial balance agrees.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| No pencil / **Generate** button | View-only grant | Ask the client for the right |
| "Transaction not found for this client" | Row outside your scope or gone | Reload |

## Download a client's year-end pack <!-- W-CA-004 -->
**Goal:** Collect a client's statements for a financial year.
**Who:** R-PROF / R-PRO (report gates check your own plan).

| # | You do | The app does |
|---|---|---|
| 1 | Client books → **Reports**, choose **Financial year** | — |
| 2 | Click **Everything for <FY>** | Downloads `FY<fy>-bundle.zip`; failed reports are named inside |
| 3 | **Documents** → **Select all** → **Download selected** | Downloads `documents.zip` |

**Success:** Both files download.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Alert "This feature requires the PLUS plan or higher" | Report gate checks the professional's plan (known defect) | Upgrade your own plan, or ask the client to download from their account |

## Share a trip's costs and settle up <!-- W-SPLIT-001 -->
**Goal:** Track a trip's shared spending and settle balances.
**Who:** Any signed-in user (R-FREE and above).

| # | You do | The app does |
|---|---|---|
| 1 | **Tools → Split Expenses → Add person** for each friend (add their email to invite them later) | "<name> added" |
| 2 | **New group**, name it, Type **Trip**, choose **Currency**, tick friends, **Create group** | Opens the group |
| 3 | **Add expense** for each bill (description, amount, who paid, split mode) | Expense listed; your line shows lent/borrowed |
| 4 | Open **Balances** | **Suggested payments** list "<A> pays <B> ₹…" |
| 5 | Record repayments with **Settle** (cash) or **Pay** (UPI, INR groups) | "Payment recorded"; balances drop |
| 6 | When everyone is at zero, **Settings → Archive group** | Group moves under **Show archived** |

**Success:** "Everyone is settled up."
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "No <A>/<B> rate — enter one manually" | Foreign-currency bill without a stored rate | Type the rate |
| "Settle this member to zero first" | Removing someone with a balance | Settle first |
| "<name> hasn't shared a UPI ID in this group yet" | Payee has no UPI ID | Ask them to add one in **Split settings**, or **Settle** in cash |

## Ask a friend to pay you back <!-- W-SPLIT-002 -->
**Goal:** Nudge someone who owes you.
**Who:** The member who is owed.
**Before you start:** For pay links, set your **UPI ID** in **Split settings** (INR groups only).

| # | You do | The app does |
|---|---|---|
| 1 | Group → **Balances** → row where they pay you → **Remind** | Emails "Reminder: you owe <you> <amount>"; "Reminder sent" |
| 2 | Or **Share pay link** | Opens your share sheet (or copies) with a UPI link that pays you |

**Success:** Reminder sent / link shared.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Already reminded today" | One reminder per person per day | Try tomorrow |
| "<name> has no email on file" | No email saved for them | — (the page can't edit a saved person) |
| "add your UPI ID in Split settings first" | No UPI ID | **Open Split settings** |

## Track your share of shared bills in Cash Activity <!-- W-SPLIT-003 -->
**Goal:** See your part of group spending among your own cash outflows.
**Who:** Members with a share.

| # | You do | The app does |
|---|---|---|
| 1 | **Split settings** → **Default portfolio** → **Save** (optional) | Saves the default |
| 2 | Open an expense → switch on "Add my share (₹…) to Cash Activity" (pick a portfolio if asked) | Creates an outflow "Split: <description> (<group>)" |
| 3 | Anyone edits or deletes the expense | Your outflow updates or disappears automatically |

**Success:** The outflow shows in **Cash Activity**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Not part of this split" | Your share is zero | — |
| "Pick one of your portfolios for Cash Activity" | Invalid portfolio | Choose one of yours |

## Set up a family and keep a grandparent's books <!-- W-FAM-001 -->
**Goal:** Create a family, add a relative with no email, and record their holdings.
**Who:** R-FAMILY or R-PRO (becomes R-FAMOWNER); then R-MANAGER.
**Before you start:** FAMILY plan or higher.

| # | You do | The app does |
|---|---|---|
| 1 | **Overview → Family → New family**, type a name, **Create** | Toast "Family created"; you are Owner; Overview tab opens (F-FAM-002) |
| 2 | **Members & sharing → Add member** | "Add a family member" opens on **Add them now** |
| 3 | Enter **Their name**, choose **Related to** you and **As their** (e.g. Father), leave **Who keeps their books** as you, click **Add to family** | Toast "<name> added to the family"; "<name> is on the tree."; a "<first name>'s portfolio" is created (F-FAM-009) |
| 4 | Click **Open <name>'s account** | Toast "Now managing <name>'s account"; dashboard opens with the amber strip "You are managing …" (F-FAM-024) |
| 5 | Add their FDs, insurance etc. on the usual pages | Everything is saved to their account |
| 6 | Click **Back to my account** | Dashboard opens in your own account |

**Success:** The relative appears on the tree, in the sidebar family tree and in "Accounts you manage".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Family Sharing is locked" | Plan below FAMILY | Upgrade on **Pricing** |
| Seat payment message | 3 included seats used | Pay ₹199 for a seat (F-FAM-012) or cancel an open invitation |
| "You cannot act for this profile." | You are not the keeper or a membership ended | Ask an owner to set you as keeper (F-FAM-015) |

## Invite a relative by email and have them join <!-- W-FAM-002 -->
**Goal:** Give a relative with their own email a place in the family.
**Who:** R-FAMOWNER invites; the invitee (any plan) accepts.
**Before you start:** A free seat, or Razorpay configured for a paid seat.

| # | You do | The app does |
|---|---|---|
| 1 | **Add member → Invite by email**, fill **Email**, relation, **What they can do** | — |
| 2 | For a contributor or viewer, click **All** in both visibility lists (or tick what they may see) | — |
| 3 | **Next: write the email** | Invitation created (14 days); composer opens (F-FAM-011) |
| 4 | Edit subject/message, **Send email** (or copy the link) | Toast "Sent to <email>"; **Pending invitations** lists it |
| 5 | Invitee opens the link, signs in with the invited email, clicks **Accept** | Toast "Invitation accepted"; they land on Settings; the family appears in their switcher and sidebar (F-FAM-019) |

**Success:** The member shows on the tree; seat line counts them as a member.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Contributor/viewer sees none of the household's data | Both visibility lists were left empty (deny-all) despite the "Empty = no restriction" hint | Owner edits the member and clicks **All** (F-FAM-014) |
| "This invitation was sent to a different email address." | Signed in with another account | Sign in with the invited email |
| "Invitation expired." | Older than 14 days | Cancel and invite again |
| Overview tab locked for the new member | Their own plan is below FAMILY | They upgrade; family view still works |

## Hand a managed account to its owner <!-- W-FAM-003 -->
**Goal:** Let a relative whose books were kept for them take over their own account.
**Who:** R-FAMOWNER sends; the relative (R-VISITOR) claims.
**Before you start:** The relative's email must not already have an EveryPaisa account.

| # | You do | The app does |
|---|---|---|
| 1 | Tree → managed member → **Edit** → **Hand the account to them** | **Their email** appears, pre-filled |
| 2 | **Next**, then **Send email** | Email "<you> has set up your EveryPaisa account" with **Take over my account** (F-FAM-016) |
| 3 | Relative opens the link, sets a password twice, clicks **Take over my account** | Toast "This account is yours now"; dashboard opens (F-FAM-020) |

**Success:** The profile is no longer managed; holdings and family place are unchanged; it leaves the keeper's "Accounts you manage".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "<email> already has an EveryPaisa account…" | Address in use | Use another address |
| "That link has expired." | 14 days passed | Send a new hand-over |

## Turn on Succession <!-- W-SUCC-001 -->
**Goal:** Arrange for nominees to receive your financial information if you become inactive.
**Who:** R-PLUS, R-FAMILY, R-PRO (on your own account).
**Before you start:** Access to your email (or authenticator) for confirmation codes.

| # | You do | The app does |
|---|---|---|
| 1 | **Planning → Succession**; choose **Trigger** and days/date; optional letter; **Save** | "Confirm it's you" asks for a code; toast "Saved" (F-SUCC-002, F-SUCC-005) |
| 2 | **Add nominee**; fill name, email, relationship; tick categories; **Save** | Nominee listed (F-SUCC-004) |
| 3 | **Turn on** | Toast "Succession is on"; status **On**; nominees get a "Confirm" email; you get "Your Succession plan was changed" |
| 4 | Nominees click **Confirm** in their email | List shows "· confirmed" |

**Success:** Status **On** with "First warning on <date> if you stay inactive."
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Add at least one nominee first." | No nominees | Add one |
| "⚠ email not confirmed yet" stays | Nominee hasn't clicked Confirm | Check the address; edit to resend |
| "Switch back to your own account to do this." | You are managing a relative | **Back to my account** |

## Stop or complete a Succession countdown <!-- W-SUCC-002 -->
**Goal:** Understand what happens when you are inactive, and how to stop it.
**Who:** Plan owner (any plan once armed); verifier nominee.

| # | You do | The app does |
|---|---|---|
| 1 | Stay inactive for the chosen days | Daily 10:00 IST: "Are you OK? (first Succession reminder)" (F-SUCC-006) |
| 2 | (Inactive 7 more days each) | Second, then final reminder |
| 3 | (Inactive 7 more days) | Status "Nominees notified"; owner gets "Your nominees will get access in 7 days"; nominees get a notice; verifier gets "Please confirm: is <you> OK?" |
| 4 | Click **I'm OK** in any reminder, or sign in | Countdown resets to **On**; nominees get "Update about <you>" if they were notified (F-SUCC-007) |
| 5 | If nothing happens for 7 days (or the verifier clicks **Yes, share their information now**) | Released: nominees get **View information**; owner gets "Your Succession plan was released" |
| 6 | Owner clicks **Revoke all access** if it was a mistake | Access ends; nominees get "<you> withdrew access"; plan re-arms |

**Success:** Either the countdown is reset, or nominees have read-only access.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| Settings locked | Plan is in a reminder or notice stage | **Pause** first |
| "This link is no longer valid." on I'm OK | Old link or plan moved on | Sign in instead |

## A nominee opens the shared information <!-- W-SUCC-003 -->
**Goal:** Read what the owner shared after release.
**Who:** R-NOMINEE.

| # | You do | The app does |
|---|---|---|
| 1 | Open **View information** from the release email | "Shared financial information" page |
| 2 | **Send code**, enter the 6-digit code, **Open** | Owner's letter, sections, documents (F-SUCC-008) |
| 3 | **Download PDF** / document **Download** | Files download; each access is logged for the owner |

**Success:** The information is visible for 30 minutes per session.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This link is no longer valid." | Link expired (90 days) or access revoked | **Email me a fresh link** |
| "Too many attempts. Try again in 30 minutes." | 5 wrong codes | Wait 30 minutes |
| "Session expired. Open your link again." | 30 minutes passed | Open the link again |

## Write and generate a will <!-- W-WILL-001 -->
**Goal:** Produce a will PDF from your EveryPaisa data.
**Who:** R-PLUS, R-FAMILY, R-PRO on their own account.

| # | You do | The app does |
|---|---|---|
| 1 | **Planning → Will Maker → Create my will** | Wizard opens at **Your details** (F-WILL-001) |
| 2 | Fill **Your details**, **Next** | Saved automatically; blockers listed (F-WILL-005) |
| 3 | **People & roles**: add beneficiaries, choose executor (and guardian if any child is under 18) | F-WILL-006 |
| 4 | **Assets & liabilities**: review each item, set ownership | F-WILL-007 |
| 5 | **Allocate**: shares to 100%, gifts, survival period | F-WILL-008 |
| 6 | **Instructions** (optional), **Review**: fix every cross | **Next** enabled at "Ready to preview" (F-WILL-010) |
| 7 | **Preview**: tick the acknowledgement, **Generate PDF** | "Version N is ready" (F-WILL-011) |

**Success:** Status **Generated**; **Download PDF** available.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "This will was changed in another tab or device…" | Edited elsewhere | **Reload** |
| "Your preview is from an earlier day…" | Date changed | **Reload preview** |
| Foreign/Muslim law notice | Unsupported | Consult an advocate |

## Sign, store and review a will <!-- W-WILL-002 -->
**Goal:** Record the signed will and keep it current.
**Who:** R-PLUS and above (downloads on any plan).

| # | You do | The app does |
|---|---|---|
| 1 | **Sign and store**; follow the six signing steps | Guide and lawyer links (F-WILL-012) |
| 2 | Enter **Date you signed**, two witnesses, attach the scan, **Store signed copy** | Toast "Your signed will is stored"; status **Executed**; next review in 2 years |
| 3 | When due, read "Time to review your will" | Banner on Will Maker and an alert (F-WILL-003) |
| 4 | **Reviewed - no changes** or **My circumstances changed** | Next review +2 years, or a new draft from the signed will |

**Success:** "Signed on <date>" with "Next review <date>".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "The signing date cannot be before the will was generated (<date>)." | Date too early | Correct the date |
| "You cannot be a witness to your own will. Choose someone else." | Own name as witness | Use other witnesses |
| Witness-is-beneficiary warning | Witness matches a beneficiary | Speak to a lawyer; consider re-signing |

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
| "Too many auth attempts" | 20 sign-in, sign-up, reset, code or two-factor requests per network address in 15 minutes | Wait up to 15 minutes |
| Signed out on every device at once | A refresh token was used twice (treated as copied), a password reset, or account deletion | Sign in again; change your password if you did not cause it |
| Spinner on reload that never ends | The app keeps retrying while offline | Restore the connection |
| "Validation failed" | The server rejected the request's format | Check the fields and retry |
| "Switch back to your own account to do this." | An account action attempted while managing a family member | **Back to my account** in the user menu |
| "Turn on two-factor sign-in (Settings) to use …" / "Sign out and sign in again with your authenticator code to use …" | Professional or admin tools need two-factor used for this session | Settings → Two-factor sign-in; then sign in again |
| "This feature requires the <PLAN> plan or higher" | Plan gate | Pricing |
| Email codes not arriving | Spam folder, 60-second cooldown, or mail server down | Check spam; wait; resend |
| "Something went wrong on this screen" | A page failed to display | **Try again**, then **Reload**, or open another page |
| Numbers look out of date after a change on another page | Screens reuse data for 30 seconds and some are not reloaded after saving a transaction | Leave the page and come back, or reload |
| Values show as grey bars | **Hide values** is on | Click **Show values** in the top bar |
| A chart axis still shows amounts with **Hide values** on | Some charts do not honour Hide values | Avoid showing those charts when sharing your screen |
| The sidebar order differs on another browser | Sort mode (**By value**/**My order**), theme, folding and Planning are per browser | Set them again on that browser |
| "Request failed with status code …" on Alerts actions | The Alerts page shows generic request errors | Reload and try again |
| The bell count does not match the Dashboard alerts strip | The bell counts saved alerts; the strip is computed live | Use **Scan now** on Alerts |
| A page opened from a link says "This page doesn't exist" | The address is not in the app (e.g. `/holdings`) | Use the sidebar |
| "Too many import requests" | More than 10 uploads/reprocesses per minute | Wait a minute |
| "Internal server error" when dropping a file | Unsupported file extension (Import or Documents) | Use a supported type |
| Import stuck at **Pending** | Job queue unavailable at upload time | Re-queued on the next server start; or **Reprocess** |
| New email events not visible | Lists refresh only on load or **Refresh** | Click **Refresh** |
| Gmail account still listed after disconnect | The card is not refreshed automatically | Click **Refresh** |
| "Gmail access lost … Click Reconnect on the Mailboxes page." | Google grant revoked or expired; the named page no longer exists | Click **Add another** on **Inbox → Connect your Gmail** and sign in with the same account |
| Mutual fund NAV marked with "⚠" | Stored price older than 5 days | Wait for the 22:00 IST NAV job; **Sync AMFI NAV** alone does not reprice holdings |
| A figure on the analysis or fund page reads "not available" with a reason | The data needed is missing, and the app will not show a zero instead | None — the reason names what is missing |
| Older mutual fund transactions missing from the Mutual Funds page | That list shows only the latest 200 | Use **Overview → Transactions** |
| "Internal server error" from a sync dialog | Third-party (CASParser / Finfactor) error not mapped to a message in production | Try the other sync route or upload a PDF |
| Asset page shows Current value ₹0 and a loss equal to everything invested (Bonds, NPS, Others) | These classes have no price source; the page adds only holdings with a value | Read Invested; no fix in the app |
| An older transaction isn't listed on an asset page | Only the newest 200 per asset class are loaded | Use **Overview → Transactions** with filters |
| "Validation failed" when saving an entry | Server rule broken, e.g. account/ISIN/PRAN over 20 characters or notes over 500 | Shorten the field |
| "Forbidden" when saving or deleting | The portfolio isn't yours (e.g. a family portfolio created by someone else) | Use a portfolio you own |
| Detail page (Gold, Crypto, Post Office) jumps back to the list | It was opened by a direct link or refreshed | Open it again from the list |
| A withdrawal removed the whole deposit | Amount-only entries are 1 unit; withdrawal removes one whole entry | No partial withdrawal exists; delete the withdrawal entry if you want the deposit kept on the page |
| A loan, payment or card form fails with "Request failed with status code 422" | The server only accepts plain numbers (no commas or ₹) and `YYYY-MM` / `YYYY-MM-DD` formats in these forms | Re-type amounts as digits with an optional decimal point |
| Loan figures on the dashboard or sidebar differ from the Loans page | The dashboard counts outstanding from the earliest unpaid EMI, the Loans page from the next EMI on or after today | Mark past EMIs paid on each loan's schedule |
| A reminder appears a day late or not at all | Reminders are created by a once-a-day scan at 20:45 IST at exact thresholds | Open **Alerts**, which can trigger a scan |
| Credit card **Outstanding** never goes down | Marking statements paid does not change it (known defect) | Rely on each statement's status; add the next statement |
| Live rates or market card empty | Lender pages could not be read, or no administrator rate exists | Check again after 07:30 IST next day |
| Vehicles: "Too many vehicle lookups. Please wait a minute." | **Refresh**, **Check challans** and **Get OTP** share a limit of 5 per minute per user | Wait one minute |
| Vehicles: a vehicle page shows only "Loading…" forever | The vehicle was deleted or the link is not yours (no not-found screen) | Go back to **Vehicles** |
| Vehicle/valuation/challan lookups keep failing | Third-party sites changed or are down; each total failure is logged to the import-failures queue | Use **Paste SMS** for RC details; retry later |
| Rental dialogs show "Request failed with status code 4xx" | These dialogs show the raw request error instead of the server's reason | Re-check amounts (digits only, positive), dates and required fields |
| Rental row buttons (Skip, Undo, expense delete) show no message | These actions have no success/error toasts | Refresh the page to see the result |
| Map shows no tiles | openstreetmap.org blocked on your network | Use **Grid** view |
| Amounts rejected with "Validation failed" (Real Estate) | Commas, minus signs or text in money fields | Enter plain digits, e.g. 4500000 or 4500000.50 |
| Goals or Accounting page appears blurred with "… is locked" | Plan below Plus (Goals) or Pro/Advisor (Accounting) | **View plans** on Pricing |
| Accounting actions fail with "Request failed with status code …" | The page shows the generic request error, not the server's reason | Check codes are unique, accounts have no entries before deleting, and amounts are positive |
| Insurance or PF reminders arrive at odd times | Insurance reminders run once a day at 20:45 IST; PF refresh alerts at 03:30 IST | Open **Alerts** the next day |
| Forex INR figures show "—" | No stored rate for that currency | **Refresh** on the Forex rates panel |
| Cash Activity shows a foreign-currency settlement in rupees | The list always formats amounts as ₹ | Read the description; the amount is in the settlement currency |
| A report tab or Analytics card stays empty with no message | The request failed; these pages show nothing on error (for example a family member's portfolio picked in **Portfolio**) | Choose **All portfolios**; reload |
| A browser alert full of raw text after clicking a download | Downloads show the server's raw error response | Read the "message" in the text; most common fixes: choose **Me**, fix dates, or upgrade |
| "Invalid financial year "…" — expected consecutive years like 2025-26" | Malformed FY in a link | Use the page's year selector |
| Numbers differ between Analytics "Realised P&L" style figures and taxable figures | Book gains vs taxable gains (grandfathering, indexation, exemption) | Expected; tax pages show taxable figures |
| Report figures change overnight | The 02:15 IST integrity job rebuilt drifted holdings/gains | Expected; check the data checks banner |
| "This feature requires the PLUS plan or higher" on Advisor | Advisor needs Plus; an expired paid plan counts as Free | Renew or upgrade on **Pricing** |
| Professional workspace shows **Two-factor sign-in required** | Two-factor is off, or this session started without a code | Turn on two-factor in **Settings**, then sign out and in with the code |
| "Switch back to your own account to do this." in Client books or on an invitation link | You are managing a family member's account | **Back to my account**, then retry |
| A client's change to your access appears late | Pages poll every 5 s (sidebar 30 s) | Wait a few seconds or switch back to the tab |
| Split pages show "Couldn't load …" with **Retry** | A request failed | Click **Retry**; Split error messages are shown without their internal code prefix |
| A Split group page says "This group doesn't exist or you're no longer in it." | You left or were removed, or the link is wrong | Ask a member to add you back |
| "Switch back to your own account to do this." | Family management, Succession and other account routes are refused while managing a relative's account | Click **Back to my account** |
| "You are not an active member of this family." on data pages | Your browser is still in a family's view after you were removed | **Switch view → Personal view** |
| Family dashboard locked although you are a member | The dashboard checks your own plan (FAMILY or higher) | Upgrade, or use family view on other pages |
| Contributor/viewer sees zeros for other members | Empty visibility lists mean "see nothing" | Owner clicks **All** in both lists (F-FAM-014) |
| "Confirm it is you first." | Succession step-up grant missing or older than 15 minutes (or page reloaded) | Enter the new code |
| "This request is too large." in Will Maker | Request over 512 KB | Shorten long text |
