# Workflows and Troubleshooting — B10 core shell

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): App layout and navigation, AI Assistant, Dashboard, Portfolios, Transactions, Bank Accounts, Alerts & Reminders (batch B10)

<!-- BEGIN WORKFLOWS -->
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
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| "Something went wrong on this screen" | A page failed to display | **Try again**, then **Reload**, or open another page |
| Numbers look out of date after a change on another page | Screens reuse data for 30 seconds and some are not reloaded after saving a transaction | Leave the page and come back, or reload |
| Values show as grey bars | **Hide values** is on | Click **Show values** in the top bar |
| A chart axis still shows amounts with **Hide values** on | Some charts do not honour Hide values | Avoid showing those charts when sharing your screen |
| The sidebar order differs on another browser | Sort mode (**By value**/**My order**), theme, folding and Planning are per browser | Set them again on that browser |
| "Request failed with status code …" on Alerts actions | The Alerts page shows generic request errors | Reload and try again |
| The bell count does not match the Dashboard alerts strip | The bell counts saved alerts; the strip is computed live | Use **Scan now** on Alerts |
| A page opened from a link says "This page doesn't exist" | The address is not in the app (e.g. `/holdings`) | Use the sidebar |
<!-- END TROUBLESHOOTING -->
