# EveryPaisa Product Manual — Index

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Start here. Each row links to one small file, so you only open what you need.

| Look for | Open |
|---|---|
| A screen or area | [Modules](#modules) → `modules/<area>.md` |
| One feature in full (what, why, steps, controls, errors, how it works) | [Features](#features) → `features/<F-ID>.md` |
| A setting or toggle | [Settings](#settings) → `settings/<area>.md` |
| A task, step by step | [Workflows](#workflows) → `workflows/<W-ID>.md` |
| Who can do what | [roles.md](roles.md) |
| What changed after this manual was written | [CHANGES.md](CHANGES.md) |
| A term | [glossary.md](glossary.md) |
| Known gaps and possible defects | [DOCUMENTATION_GAPS.md](DOCUMENTATION_GAPS.md) |

> These files are generated from the full deliverables in this folder (`PRODUCT_MANUAL.md` and the others) by `_work/split.py`. Edit the source and re-run the script; don't edit the generated files by hand.

## Modules

| Module | Features |
|---|---|
| [Getting started](modules/getting-started.md) | 0 |
| [Sign-in & session](modules/sign-in-session.md) | 9 |
| [First-run setup](modules/first-run-setup.md) | 5 |
| [Settings](modules/settings.md) | 8 |
| [Account Access](modules/account-access.md) | 6 |
| [Connections](modules/connections.md) | 8 |
| [Plans & billing](modules/plans-billing.md) | 4 |
| [Legal pages](modules/legal-pages.md) | 1 |
| [App layout and navigation](modules/app-layout-and-navigation.md) | 10 |
| [AI Assistant](modules/ai-assistant.md) | 5 |
| [Dashboard](modules/dashboard.md) | 18 |
| [Portfolios](modules/portfolios.md) | 9 |
| [Transactions](modules/transactions.md) | 7 |
| [Bank Accounts](modules/bank-accounts.md) | 8 |
| [Alerts & Reminders](modules/alerts-reminders.md) | 5 |
| [Import](modules/import.md) | 10 |
| [Email ingestion](modules/email-ingestion.md) | 9 |
| [Gmail connection and inbox scans](modules/gmail-connection-and-inbox-scans.md) | 7 |
| [CAS](modules/cas.md) | 2 |
| [Documents](modules/documents.md) | 8 |
| [Mutual Funds](modules/mutual-funds.md) | 10 |
| [Mutual Fund Analytics](modules/mutual-fund-analytics.md) | 13 |
| [How asset-class pages work](modules/how-asset-class-pages-work.md) | 0 |
| [Stocks](modules/stocks.md) | 3 |
| [Futures & Options](modules/futures-options.md) | 9 |
| [Bonds](modules/bonds.md) | 2 |
| [FDs & RDs](modules/fds-rds.md) | 7 |
| [Gold & Silver](modules/gold-silver.md) | 4 |
| [Crypto](modules/crypto.md) | 3 |
| [NPS](modules/nps.md) | 2 |
| [Post Office](modules/post-office.md) | 6 |
| [Other Assets](modules/other-assets.md) | 2 |
| [Loans](modules/loans.md) | 20 |
| [EMI Calculator](modules/emi-calculator.md) | 10 |
| [Credit Cards](modules/credit-cards.md) | 7 |
| [Vehicles](modules/vehicles.md) | 16 |
| [Real Estate](modules/real-estate.md) | 13 |
| [Rental](modules/rental.md) | 19 |
| [Insurance](modules/insurance.md) | 23 |
| [PPF & EPF](modules/ppf-epf.md) | 10 |
| [Forex](modules/forex.md) | 8 |
| [Goals](modules/goals.md) | 3 |
| [Income](modules/income.md) | 3 |
| [Cash Activity](modules/cash-activity.md) | 2 |
| [Accounting](modules/accounting.md) | 13 |
| [Reports](modules/reports.md) | 17 |
| [Tax Planning](modules/tax-planning.md) | 10 |
| [Analytics](modules/analytics.md) | 13 |
| [Portfolio Score](modules/portfolio-score.md) | 2 |
| [Investment Advisor](modules/investment-advisor.md) | 11 |
| [Professional workspace (Client books)](modules/professional-workspace-client-books.md) | 17 |
| [Split Expenses](modules/split-expenses.md) | 19 |
| [Family](modules/family.md) | 24 |
| [Succession](modules/succession.md) | 8 |
| [Will Maker](modules/will-maker.md) | 13 |

## Features

### [Sign-in & session](modules/sign-in-session.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-AUTH-001](features/F-AUTH-001.md) | Sign in with email and password | Live | Signs you in with the email and password of an existing account and opens the page you were heading for. |
| [F-AUTH-002](features/F-AUTH-002.md) | Create an account (email verification code) | Live | Creates a new EveryPaisa account in two steps: you enter your details, the app emails a 6-digit code, and the account exists only once that … |
| [F-AUTH-003](features/F-AUTH-003.md) | Sign in or sign up with Google | Live | Signs you in with your Google account. |
| [F-AUTH-004](features/F-AUTH-004.md) | Two-factor code at sign-in | Live | For accounts with two-factor sign-in on, asks for the 6-digit code from your authenticator app, or one of your backup codes, after the … |
| [F-AUTH-005](features/F-AUTH-005.md) | Reset a forgotten password | Live | Emails a 6-digit reset code and lets you set a new password with it. |
| [F-AUTH-006](features/F-AUTH-006.md) | Staying signed in: resume, refresh and expiry | Live | Keeps you signed in without asking again: it renews your access every 15 minutes in the background, picks your session back up after a … |
| [F-AUTH-007](features/F-AUTH-007.md) | Sign out | Live | Ends the session in this browser and revokes its refresh token on the server. |
| [F-AUTH-008](features/F-AUTH-008.md) | Security notice emails (new device, failed sign-ins) | Live | Emails you when your account is signed in from a device type not seen in the last 90 days, and when there have been 5 failed sign-in … |
| [F-AUTH-010](features/F-AUTH-010.md) | Page not found | Live | Shows a friendly screen for an address inside the app that does not exist, instead of silently redirecting. |

### [First-run setup](modules/first-run-setup.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ONB-001](features/F-ONB-001.md) | Welcome panels | Live | Shows three panels before asking for anything: a greeting, what the app does, and what happens to your data. |
| [F-ONB-002](features/F-ONB-002.md) | Starter portfolio created automatically | Live | Creates a portfolio called "My Portfolio" (type Investment) for you as soon as the wizard opens, so the things you add have somewhere to go. |
| [F-ONB-003](features/F-ONB-003.md) | "What do you have?" picker | Live | Lets you tick the kinds of things you own so the wizard asks only about those. |
| [F-ONB-004](features/F-ONB-004.md) | Quick-add forms (9 kinds) | Live | For each ticked item, shows a short form; each Add saves one real record and lists it above the form so you can add another straight away. |
| [F-ONB-005](features/F-ONB-005.md) | Finish, skip and resume setup | Live | Ends the wizard with a summary and sends you to the dashboard; remembers in this browser if you left setup unfinished so you are brought … |

### [Settings](modules/settings.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-SET-001](features/F-SET-001.md) | Profile (name, phone, PAN, date of birth) | Live | Lets you edit your full name, phone, PAN and date of birth. |
| [F-SET-002](features/F-SET-002.md) | Plan card | Live | Shows your current plan and your "I am" role, with a link to Pricing. |
| [F-SET-003](features/F-SET-003.md) | Two-factor sign-in | Live | Turns on sign-in with an authenticator-app code, shows 10 one-time backup codes, replaces them, or turns two-factor off. |
| [F-SET-004](features/F-SET-004.md) | Email notifications (Connect Gmail, Send test) | Live | Connects your Gmail account so EveryPaisa can send rent reminders from your own address, and lets you send yourself a test email. |
| [F-SET-005](features/F-SET-005.md) | Loan rate alerts | Live | One checkbox that turns refinance and repo-rate/MCLR-change alerts for your loans on or off. |
| [F-SET-006](features/F-SET-006.md) | Desktop app download and version | Live | Offers the EveryPaisa desktop app for Windows or Mac (latest published release), in Settings and as a Desktop app link in the header; … |
| [F-SET-007](features/F-SET-007.md) | Delete account (30-day grace, restore, purge) | Live | Schedules your account and all its data for permanent deletion in 30 days, signs you out everywhere and locks the account. |
| [F-SET-014](features/F-SET-014.md) | Loan rates admin | Live | Lets an administrator review and correct the lender interest rates shown on the EMI calculator's Live rates tab: approve or reject … |

### [Account Access](modules/account-access.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-SET-008](features/F-SET-008.md) | Account Access overview | Live | Lists every professional relationship in three groups: With access (can open your books now), Waiting to accept (invited, nothing shared … |
| [F-SET-009](features/F-SET-009.md) | Invite a professional (and send the email) | Partial | Creates an invitation for your CA or advisor by name and email, then lets you edit and send the invitation email (or copy the link to send … |
| [F-SET-010](features/F-SET-010.md) | Manage a professional's access (scope panel) | Live | Opens a panel under an active professional where you choose what they can do, which portfolios, categories and asset classes they can see, … |
| [F-SET-011](features/F-SET-011.md) | Withdraw, restore, cancel invitation | Live | Ends a professional's access (Withdraw), gives it back (Restore), or cancels an invitation nobody has accepted (Cancel invitation). |
| [F-SET-012](features/F-SET-012.md) | Activity feed of professionals' actions | Live | Shows the most recent things done to your books by professionals and by you in this relationship (invited, accepted, scope changes, … |
| [F-SET-013](features/F-SET-013.md) | "Do you keep books for clients?" card | Live | For people on the Pro/Advisor plan who have no clients yet, shows a card pointing to the client books workspace. |

### [Connections](modules/connections.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CONN-001](features/F-CONN-001.md) | Connect ChatGPT or Claude (AI connectors) | Live | Gives you the EveryPaisa connector address and step-by-step instructions to add it as a custom connector in ChatGPT or Claude. |
| [F-CONN-002](features/F-CONN-002.md) | Connected chatbots: revoke and recent activity | Live | Lists every chatbot connected to your account with when it was connected and last used and what it may read; lets you revoke it and see its … |
| [F-CONN-003](features/F-CONN-003.md) | Edit what a chatbot can read | Live | Changes which areas, and which family members' data, an already-connected chatbot may read. |
| [F-CONN-004](features/F-CONN-004.md) | Allow family to include me in their AI connectors | Live | Your consent for relatives who can already see your data in EveryPaisa to let their own chatbot read it too. |
| [F-CONN-005](features/F-CONN-005.md) | Approve a chatbot connection | Live | The page your chatbot sends you to when you click Connect in it. |
| [F-CONN-007](features/F-CONN-007.md) | Broker connectors (Zerodha, Upstox, Angel One) | Live | Stores your own broker developer-app keys and logs in to the broker so trades and positions can be synced (the sync itself runs from the … |
| [F-CONN-008](features/F-CONN-008.md) | Legacy broker connections (deprecated) | Live | Lists broker accounts linked through an older paste-token flow, lets you sync them once more or remove them. |
| [F-CONN-009](features/F-CONN-009.md) | Account Aggregator (Finvu) consent | Live | Starts an RBI Account Aggregator consent through Finvu for mutual funds and equities, lists your consents with status and dates, and lets … |

### [Plans & billing](modules/plans-billing.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-PLAN-001](features/F-PLAN-001.md) | Compare plans (Pricing page) | Live | Shows the four plans with prices, a feature list and your current plan, with a Monthly/Annual switch. |
| [F-PLAN-002](features/F-PLAN-002.md) | Upgrade with Razorpay checkout | Live | Buys a plan for 30 days (monthly) or 365 days (annual) through Razorpay's checkout window; on success your plan changes immediately. |
| [F-PLAN-003](features/F-PLAN-003.md) | Admin plan switch (no payment) | Live | Lets an administrator set their own plan to any tier without paying, to test what each plan unlocks. |
| [F-PLAN-004](features/F-PLAN-004.md) | Plan expiry (back to Free) | Live | When a paid plan's end date passes, the account is treated as Free everywhere: lock cards reappear and Free limits apply. |

### [Legal pages](modules/legal-pages.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-LEGAL-001](features/F-LEGAL-001.md) | How EveryPaisa uses AI in advice (notice page) | Live | Shows the full AI-use notice: title "How EveryPaisa uses AI in advice", a version date, a summary and sections "Where AI is used", "What … |

### [App layout and navigation](modules/app-layout-and-navigation.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-SHELL-001](features/F-SHELL-001.md) | Sidebar navigation | Live | The sidebar lists every area of EveryPaisa as links. |
| [F-SHELL-002](features/F-SHELL-002.md) | Asset Classes sidebar customisation | Live | Lets you choose which asset classes appear in the sidebar, in what order, and whether they are sorted by how much you hold. |
| [F-SHELL-003](features/F-SHELL-003.md) | Planning group fold/unfold | Live | The Planning heading in the sidebar folds and unfolds the group holding Goals, Will Maker, Succession, Tax Planning and AI connectors. |
| [F-SHELL-004](features/F-SHELL-004.md) | Phone navigation (tab bar, drawer, swipe) | Live | On screens narrower than 768px the sidebar is replaced by a bottom tab bar with Dashboard, Portfolios, Transactions, Analytics and More. |
| [F-SHELL-005](features/F-SHELL-005.md) | Header and user menu | Live | The top bar shows today's date (in India time) and "Welcome back, <your name>" on the left, and on the right: Upgrade, the desktop-app … |
| [F-SHELL-006](features/F-SHELL-006.md) | Light / dark theme | Live | The sun/moon button switches the whole app between dark and light colours. |
| [F-SHELL-007](features/F-SHELL-007.md) | Hide values (privacy mode) | Live | The eye button in the top bar hides amounts, percentages and counts across the app by covering them with grey bars, so you can use … |
| [F-SHELL-008](features/F-SHELL-008.md) | Alerts bell with unread count | Live | The bell in the top bar opens the Alerts & Reminders page and shows a badge with how many unread alerts you have (up to "99+"). |
| [F-SHELL-009](features/F-SHELL-009.md) | Upgrade prompts (header button, sidebar card, lock card) | Live | Three prompts lead to the plans page. |
| [F-SHELL-010](features/F-SHELL-010.md) | Page error screen | Live | If a page fails while drawing, EveryPaisa replaces just that page with "Something went wrong on this screen — Your data is safe. |

### [AI Assistant](modules/ai-assistant.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-AI-001](features/F-AI-001.md) | AI Assistant launcher and panel | Live | A round button at the bottom-right of every page (Open AI Assistant, tooltip "Ask the AI Assistant") opens the assistant panel. |
| [F-AI-002](features/F-AI-002.md) | AI-use notice acceptance | Live | Before your first question, the panel shows "How EveryPaisa uses AI in advice" with six short points (Where AI is used, What the AI does … |
| [F-AI-003](features/F-AI-003.md) | Ask the assistant (streamed answers, cards, daily quota) | Live | You type a question (up to 2,000 characters) or tap a suggested one, and the assistant writes its answer word by word, based on your … |
| [F-AI-004](features/F-AI-004.md) | Free plan locked preview | Live | On the Free plan the panel looks and behaves the same, and you can send one question. |
| [F-AI-005](features/F-AI-005.md) | Chat history (sessions) | Live | Keeps several separate chats. |

### [Dashboard](modules/dashboard.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-DASH-001](features/F-DASH-001.md) | Dashboard page, portfolio filter and empty state | Live | Shows the page "Dashboard — Your financial portrait" ("A complete, hand-curated view of every asset, liability, and signal — engineered for … |
| [F-DASH-002](features/F-DASH-002.md) | Total Net Worth hero | Live | The large card at the top shows Total Net Worth · Consolidated — hidden as "₹ • • • • • • •" until you click the small eye (Show net worth). |
| [F-DASH-003](features/F-DASH-003.md) | Dashboard alerts strip | Live | Under the hero, up to four urgent items are listed, most urgent first, each with an icon by urgency, title, description and days left … |
| [F-DASH-004](features/F-DASH-004.md) | Liabilities summary (Loans & credit cards) | Live | When you owe anything, a card "Liabilities · FY <year> — Loans & credit cards" shows Net after debts ("Assets minus liabilities"), Total … |
| [F-DASH-005](features/F-DASH-005.md) | Net worth over time chart | Live | "Trend — Net worth over time" draws your net worth after liabilities from one snapshot per day, with the change over the chosen period … |
| [F-DASH-006](features/F-DASH-006.md) | FX rates strip | Live | A thin strip "FX" shows USD/INR, EUR/INR, GBP/INR and JPY/INR with two decimals and a source badge (green for RBI or FRANKFURTER, blue … |
| [F-DASH-007](features/F-DASH-007.md) | Tax strip (this financial year) | Live | "Tax · FY <yyyy-yy>" shows this financial year's Realised gain, Est. |
| [F-DASH-008](features/F-DASH-008.md) | Investment metric cards | Live | Four cards: Portfolio value ("<n> holdings"), Total invested (with "XIRR x% · TWR y%"), Unrealised P&L (with percentage) and Today's change … |
| [F-DASH-009](features/F-DASH-009.md) | Portfolio value over time chart | Live | "Trajectory — Portfolio value over time" plots the market value of the selected portfolios day by day. |
| [F-DASH-010](features/F-DASH-010.md) | Net worth breakdown pie | Live | A ring chart "Net worth breakdown" with one slice per kind of holding (Equity, Mutual Fund, Fixed Deposit, …) plus Vehicles, Real Estate … |
| [F-DASH-011](features/F-DASH-011.md) | Top holdings | Live | "Top holdings — Ranked by current value · N positions" lists your 10 largest holdings across the selected portfolios: rank, asset (and … |
| [F-DASH-012](features/F-DASH-012.md) | Real Estate, Vehicles and Insurance cards | Live | Three cards. |
| [F-DASH-013](features/F-DASH-013.md) | Recent transactions card | Live | "Recent transactions" lists your 5 latest transactions: name, trade date · type, net amount and quantity @ price. |
| [F-DASH-014](features/F-DASH-014.md) | Refresh prices (dashboard) | Live | Refresh fetches the latest prices for the stocks you hold and re-values all your holdings, then reloads the Dashboard. |
| [F-DASH-015](features/F-DASH-015.md) | Export dashboard report | Live | Export opens "Download Report" to download the Dashboard as a PDF or Excel file. |
| [F-DASH-016](features/F-DASH-016.md) | Free plan upgrade banner | Live | On the Free plan the Dashboard opens with "You're on the Free plan — Upgrade to Plus for the full tax report catalog, AA auto-import, … |
| [F-DASH-017](features/F-DASH-017.md) | Gmail connect and scan progress cards | Live | If you have not connected Gmail, a card "Auto-import from Gmail — Scan your inbox for contract notes and statements — you approve each … |
| [F-DASH-018](features/F-DASH-018.md) | Daily net-worth snapshot | Live | Every night at 23:45 India time, EveryPaisa records each active user's net worth (gross, liabilities, net after liabilities and the … |

### [Portfolios](modules/portfolios.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-PORT-001](features/F-PORT-001.md) | Portfolios list | Live | The Portfolios page ("Allocation — Portfolios: Group holdings by goal, strategy, or account. |
| [F-PORT-002](features/F-PORT-002.md) | Create or edit a portfolio | Live | The dialog "Create a new portfolio" / "Edit portfolio" ("A portfolio groups holdings by strategy, goal, or account.") sets a portfolio's … |
| [F-PORT-003](features/F-PORT-003.md) | Delete a portfolio | Live | Permanently deletes a portfolio and everything recorded in it. |
| [F-PORT-004](features/F-PORT-004.md) | Portfolio detail | Live | Shows one portfolio: name and description, four cards (Current value, Invested, Unrealised P&L, Today's change) and a Holdings table with … |
| [F-PORT-005](features/F-PORT-005.md) | Refresh prices (one portfolio) | Live | Refresh prices re-values this portfolio's holdings from the latest prices and shows "N holdings refreshed". |
| [F-PORT-006](features/F-PORT-006.md) | Portfolio groups: create, edit, delete | Live | "Create a portfolio group" ("Bundle multiple portfolios (e.g. |
| [F-PORT-007](features/F-PORT-007.md) | Portfolio group detail | Live | Shows a group: "Members:" chips (each opens that portfolio), cards Combined value, Invested, Unrealised P&L, Today's change, and Combined … |
| [F-PORT-008](features/F-PORT-008.md) | Scheduled market price feeds | Live | EveryPaisa downloads market prices on a fixed India-time schedule and re-values every user's holdings after each price download, so values, … |
| [F-PORT-009](features/F-PORT-009.md) | Automatic corporate-action application | Live | After the daily 20:00 corporate-action download, EveryPaisa adds stock splits, bonus issues and cash dividends to the affected stock … |

### [Transactions](modules/transactions.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-TXN-001](features/F-TXN-001.md) | Transactions list | Live | The Transactions page ("All buys, sells, dividends, SIPs, and corporate actions") lists every transaction, newest trade date first, 50 per … |
| [F-TXN-002](features/F-TXN-002.md) | Add a transaction | Live | The "Add transaction" dialog ("Record a buy, sell, SIP, dividend, or corporate action. |
| [F-TXN-003](features/F-TXN-003.md) | Edit a transaction | Live | Opens a transaction in the same dialog ("Edit transaction") with its values filled in; Save changes updates it and recalculates the holding … |
| [F-TXN-004](features/F-TXN-004.md) | Delete a transaction | Live | Removes a transaction and recalculates its holding and capital gains. |
| [F-TXN-005](features/F-TXN-005.md) | Duplicate warning on save | Live | When a new transaction matches one already recorded, the dialog shows "You may already have this one" with the server's explanation, Let me … |
| [F-TXN-006](features/F-TXN-006.md) | Find duplicates | Live | "Duplicates" ("Rows that record the same money twice. |
| [F-TXN-007](features/F-TXN-007.md) | Add the missing purchase (from Reports) | Live | When a report finds a sale with no purchase behind it, its link opens Transactions with "Add transaction" pre-filled: BUY, the portfolio, … |

### [Bank Accounts](modules/bank-accounts.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-BANK-001](features/F-BANK-001.md) | Bank accounts list | Live | The page "Bank Accounts" ("Your savings, current, and salary accounts in one place — branch, IFSC, balance, nominee, and linked debit card … |
| [F-BANK-002](features/F-BANK-002.md) | Add or edit a bank account | Live | "Add bank account" / "Edit bank account" records an account's details. |
| [F-BANK-003](features/F-BANK-003.md) | Delete a bank account | Live | Deletes an account after an in-tile confirmation "Delete <bank> account ending <last 4>?". |
| [F-BANK-004](features/F-BANK-004.md) | Bank account detail | Live | Shows one account: the large building tile, Edit, Record balance, Share details; an Available balance card ("As of <date>", with a pulsing … |
| [F-BANK-005](features/F-BANK-005.md) | Reveal full account number | Live | The account number shows as "●●●● ●●●● 1234". |
| [F-BANK-006](features/F-BANK-006.md) | Share bank details | Live | Share details prepares a text with the bank name, holder, full account number, IFSC, branch and branch address. |
| [F-BANK-007](features/F-BANK-007.md) | Record balance and balance history | Live | Record balance saves an account's balance on a date. |
| [F-BANK-008](features/F-BANK-008.md) | Recent activity and live balance from email | Live | Recent activity lists up to 50 latest credits and debits attached to this account (date, description, +/− amount). |

### [Alerts & Reminders](modules/alerts-reminders.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ALERT-001](features/F-ALERT-001.md) | Alerts & Reminders page | Live | "Inbox — Alerts & Reminders" ("Maturities, premium due dates, expiries and your own reminders — grouped by when they land.") lists alerts … |
| [F-ALERT-002](features/F-ALERT-002.md) | Mark read, mark all read, dismiss | Live | Each unread alert has a tick (Mark as read); every alert has a bin (Dismiss) that removes it from the list; Mark all read marks all your … |
| [F-ALERT-003](features/F-ALERT-003.md) | New reminder | Live | "New reminder" creates your own dated reminder with a Title, optional Description (optional) and Reminder date. |
| [F-ALERT-004](features/F-ALERT-004.md) | Scan now | Live | Scan now runs all of EveryPaisa's alert checks for your account immediately instead of waiting for the nightly run, then reloads the list … |
| [F-ALERT-005](features/F-ALERT-005.md) | Daily alert scan | Live | Every day at 20:45 India time, the same checks as Scan now run for every account, so new alerts are waiting for you. |

### [Import](modules/import.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-IMPORT-001](features/F-IMPORT-001.md) | Upload a file | Live | Sends one file (PDF, XLSX, XLS, CSV or TSV, up to 50 MB by default) to the server, optionally into a portfolio you choose, and starts a … |
| [F-IMPORT-002](features/F-IMPORT-002.md) | Import history | Live | Lists your 50 most recent import jobs, newest first, with File, Type, Status, Rows, Success, Failed, Uploaded (date and time in IST) and … |
| [F-IMPORT-003](features/F-IMPORT-003.md) | Import issues dialog | Live | Shows why rows of an import were not added: the parser used, a general error, how many rows were skipped as duplicates, the parser's … |
| [F-IMPORT-004](features/F-IMPORT-004.md) | Unlock a password-protected import | Live | When a PDF or Excel file is locked and none of the passwords the app tries automatically opens it, the job stops at Needs password. |
| [F-IMPORT-005](features/F-IMPORT-005.md) | Reprocess an import | Live | Runs an existing import job again from its stored copy of the file, without re-uploading. |
| [F-IMPORT-006](features/F-IMPORT-006.md) | Download the source file | Live | Downloads the original file of an import job under its original file name. |
| [F-IMPORT-007](features/F-IMPORT-007.md) | Delete import records | Live | Removes one import record, or several selected ones, from Import history together with its stored file. |
| [F-IMPORT-008](features/F-IMPORT-008.md) | How imported files are read (parsers) | Live | Every import job — from the Import page, the mutual fund CAS card, a Gmail attachment or an approved inbox-scan document — goes through one … |
| [F-IMPORT-009](features/F-IMPORT-009.md) | Duplicate protection on imports | Live | Stops the same trade from being added twice when you upload a file again, when the same file arrives twice by email, or when a trade … |
| [F-IMPORT-010](features/F-IMPORT-010.md) | Background processing and automatic recovery | Live | Runs import jobs in a background queue and repairs jobs that get stuck or fail: re-queues jobs left Pending, marks long-dead Processing … |

### [Email ingestion](modules/email-ingestion.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-INGEST-001](features/F-INGEST-001.md) | Email ingestion page and status strip | Live | Shows the page "Email ingestion" with a status strip — Gmail connected / Connect Gmail, "<n> sender(s)" / Add senders, and once both exist … |
| [F-INGEST-002](features/F-INGEST-002.md) | Discover financial senders | Live | Scans a connected Gmail inbox for senders that look financial, scores them, and lists the ones you do not monitor yet; you tick the ones to … |
| [F-INGEST-003](features/F-INGEST-003.md) | Currently monitored senders (on the ingestion page) | Live | Lists your monitored senders under "Currently monitored (<n>)" with their label, address, an Auto badge when auto-commit is on, and … |
| [F-INGEST-004](features/F-INGEST-004.md) | Pending review queue | Live | Lists events read from your monitored senders that are waiting for you, grouped by sender. |
| [F-INGEST-005](features/F-INGEST-005.md) | Auto-commit offer | Live | When a sender without auto-commit reaches its approval threshold (default 5 approved events), a banner offers to trust it: "<sender> has … |
| [F-INGEST-006](features/F-INGEST-006.md) | Monitored senders page | Live | The page "Monitored senders" lists every sender with its approval progress and lets you add a sender by hand, switch auto-commit, pause or … |
| [F-INGEST-007](features/F-INGEST-007.md) | Ingestion history (Review ingestion) | Live | The page "Review ingestion" shows events in three tabs: Pending review (same actions as F-INGEST-004), Auto-committed (every event that has … |
| [F-INGEST-008](features/F-INGEST-008.md) | How emails become events | Live | On every mailbox poll, for each connected Gmail account, the app searches for new emails from your active monitored senders, reads each … |
| [F-INGEST-009](features/F-INGEST-009.md) | What approving an event creates | Live | Turns a confirmed event into a record in your books: buys and sells become transactions; money in and money out become cash-flow entries; … |

### [Gmail connection and inbox scans](modules/gmail-connection-and-inbox-scans.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-MAIL-001](features/F-MAIL-001.md) | Connect Gmail | Live | Sends you to Google to choose an account and grant access, then stores an encrypted access grant for that mailbox. |
| [F-MAIL-002](features/F-MAIL-002.md) | Email accounts and disconnect | Live | The Email accounts card lists each connected Gmail with "Last checked <date time>" or "Not polled yet", any last error, Active or Paused, … |
| [F-MAIL-003](features/F-MAIL-003.md) | Choose how far back to scan | Live | Starts a one-off *inbox scan* of your most recently connected active Gmail for every PDF, XLSX, XLS or CSV attachment between two dates, … |
| [F-MAIL-004](features/F-MAIL-004.md) | Inbox scan processing | Live | Works through a scan job: lists matching emails, downloads each attachment, marks attachments already imported as duplicates, asks an AI … |
| [F-MAIL-005](features/F-MAIL-005.md) | Gmail auto-connect banner | Live | A strip at the top of every app page: "Auto-import statements from your inbox. |
| [F-MAIL-006](features/F-MAIL-006.md) | Automatic Gmail attachment import | Live | On every mailbox poll (every 3 minutes by default), each active Gmail account is searched for emails with attachments from brokers, … |
| [F-MAIL-007](features/F-MAIL-007.md) | Scan inbox now | Live | Runs the Gmail attachment import (F-MAIL-006) immediately for every active Gmail account, without waiting for the next poll, and refreshes … |

### [CAS](modules/cas.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CAS-001](features/F-CAS-001.md) | Request CAS helper | Live | You choose a provider and optionally type a PAN, email and date range; Generate Request returns a link Open provider portal, a list of … |
| [F-CAS-002](features/F-CAS-002.md) | Provider info | Live | Shows facts about the selected provider: name, coverage, PDF password, Email from, Subject and notes. |

### [Documents](modules/documents.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-DOCS-001](features/F-DOCS-001.md) | Upload documents to sort | Live | Accepts many files at once (by drag-and-drop or Choose files), uploads them in groups of 10, and lists the latest 12 with their progress: … |
| [F-DOCS-002](features/F-DOCS-002.md) | How documents are read and filed | Live | For each uploaded PDF or image, the server extracts text, decides the document type, the person's name and the document date, finds or … |
| [F-DOCS-003](features/F-DOCS-003.md) | Browse person folders | Live | Shows "<n> people · <m> files" and one folder card per person ("<n> files · <k> types", "· auto-created" when made automatically), plus an … |
| [F-DOCS-004](features/F-DOCS-004.md) | View, download or delete a file | Live | For each file: view it in the app (PDFs and images), download it, or delete it after a second confirmation. |
| [F-DOCS-005](features/F-DOCS-005.md) | Move or assign a file | Live | Moves a file to another person and/or type — or assigns a file that could not be sorted — creating a new person folder if needed, and … |
| [F-DOCS-006](features/F-DOCS-006.md) | Unlock a password-protected document | Live | For a PDF stuck at Needs a password, sends the password you type so the file is read again. |
| [F-DOCS-007](features/F-DOCS-007.md) | Rename or merge person folders | Live | Renames a person's folder, or merges it into another person's folder (all its files move there). |
| [F-DOCS-008](features/F-DOCS-008.md) | Download folders as ZIP | Live | Downloads filed documents as a ZIP: everything (Download everything), one person (Download all), or one person's type (Zip). |

### [Mutual Funds](modules/mutual-funds.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-MF-001](features/F-MF-001.md) | Mutual fund holdings overview | Live | Shows four summary tiles — Current value, Invested, Unrealised P&L, Return — and a holdings table with one row per mutual fund position: … |
| [F-MF-002](features/F-MF-002.md) | Mutual fund transactions list | Live | Lists your mutual fund transactions (newest first) under the heading Transactions with Date, Scheme (and ISIN), Type, Units (3 decimals), … |
| [F-MF-003](features/F-MF-003.md) | CAS PDF upload and Recent imports | Live | The Automated CAS Import card lets you drop or choose a CAMS / KFintech Consolidated Account Statement (CAS) file; the file is parsed in … |
| [F-MF-004](features/F-MF-004.md) | Sync AMFI NAV | Live | The Sync AMFI NAV button downloads the current AMFI NAV file on demand and stores the latest NAV for every scheme, creating scheme records … |
| [F-MF-005](features/F-MF-005.md) | Sync MF via CASParser | Live | The Sync MF via CASParser button opens the dialog Sync Mutual Funds via PAN + Email. |
| [F-MF-006](features/F-MF-006.md) | Sync via CAMS / KFintech | Live | The Sync via CAMS / KFintech button opens Sync Mutual Funds via CAMS + KFintech CAS. |
| [F-MF-007](features/F-MF-007.md) | Scan inbox | Live | The Scan inbox button checks your connected Gmail for new CAS emails right away instead of waiting for the scheduled poll. |
| [F-MF-008](features/F-MF-008.md) | Direct vs Regular & overlap | Live | The card Plan analysis — Direct vs Regular & overlap counts your schemes by plan type and groups schemes that look like the same fund under … |
| [F-MF-009](features/F-MF-009.md) | Finvu (Account Aggregator) sandbox explorer | Partial | The card Finvu (Account Aggregator) via Finfactor Wealthscape lets you send a Unique identifier to eight Finfactor Wealthscape mutual fund … |
| [F-MF-010](features/F-MF-010.md) | Finvu import to portfolio | Partial | In the Import into EveryPaisa box of the Finvu card, Import to portfolio fetches the insights and full statement for the current Unique … |

### [Mutual Fund Analytics](modules/mutual-fund-analytics.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-MF-011](features/F-MF-011.md) | Portfolio analysis — totals and scope notice | Live | The Portfolio analysis page opens with a summary card Mutual fund book: current value, invested value, number of schemes (and how many are … |
| [F-MF-012](features/F-MF-012.md) | Funds you hold | Live | A table Funds you hold with one row per scheme: Scheme (AMC logo, name linking to the fund page, AMC · plan type · "SIP active" · "held N … |
| [F-MF-013](features/F-MF-013.md) | Overlap | Live | The Overlap section lists, for each pair of your funds, the share of their portfolios made of the same securities, in two tables: Equity … |
| [F-MF-014](features/F-MF-014.md) | Look-through | Live | The Look-through section adds up what your funds own underneath: Asset class split, Sectors, Underlying stocks (top 25, with Of MF book, Of … |
| [F-MF-015](features/F-MF-015.md) | Cost | Live | The Cost section shows Weighted TER, Annual cost, Cost rank in category ("Higher is cheaper") and Direct-plan saving, per year, then a … |
| [F-MF-016](features/F-MF-016.md) | Tax lots | Live | The Tax section shows Unrealised STCG, Unrealised LTCG, §112A headroom and Financial year, a list Lots currently at a loss, and Open lots: … |
| [F-MF-017](features/F-MF-017.md) | Goals fit | Live | The Goals section shows, for each active goal linked to portfolios that hold funds, a suitability chip (Suitable, Mismatch, Underpowered), … |
| [F-MF-018](features/F-MF-018.md) | Fund detail — Overview | Live | A fund page (/mutual-funds/<scheme code>) shows the AMC logo, scheme name, "AMC · SEBI category / sub-category · plan type plan" and, on … |
| [F-MF-019](features/F-MF-019.md) | Fund alternatives | Live | On the fund Overview, Ranked higher by your adviser lists up to 3 funds in the same category that the adviser's signed fund ranking places … |
| [F-MF-020](features/F-MF-020.md) | Fund detail — Detailed calculations | Live | The Detailed calculations tab shows: the Fund score card (composite, stars, rating status, risk-o-meter, category universe, median and … |
| [F-MF-021](features/F-MF-021.md) | Findings, verdict and Refresh analysis | Live | The What we found block on the Detailed calculations tab shows the latest analysis run of *your* portfolio for this fund: a verdict chip … |
| [F-MF-022](features/F-MF-022.md) | Scoring methodology | Live | How we score a fund shows the scoring rules read live from the scorer: an overview (percentile ranks within the fund's own SEBI … |
| [F-MF-023](features/F-MF-023.md) | Fund research data pipeline | Live | Scheduled server jobs keep the research data behind the fund pages current: NAV adjustment for payouts (22:30 IST daily), metrics (23:15 … |

### [Stocks](modules/stocks.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-STOCK-001](features/F-STOCK-001.md) | Stocks holdings overview | Live | Shows four summary cards (Current value, Invested, Unrealised P&L, Return) and an Equity Holdings table with one row per stock or ETF, … |
| [F-STOCK-002](features/F-STOCK-002.md) | Add, edit and delete stock transactions | Live | Add transaction opens the app's standard transaction form to record a stock or ETF trade. |
| [F-STOCK-003](features/F-STOCK-003.md) | Refresh stock prices | Live | Refresh prices fetches current prices for held stocks and re-values holdings, then shows "Refreshed N stock prices". |

### [Futures & Options](modules/futures-options.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-FNO-001](features/F-FNO-001.md) | F&O summary and expiring-soon banner | Live | Shows four cards — Open positions (count), Realized P&L, Unrealized P&L, Expiring 7d (count, amber when above zero) — and, when any open … |
| [F-FNO-002](features/F-FNO-002.md) | Open and closed positions | Live | The Open (n) and Closed (n) tabs split positions into a Futures Ledger (Contract, Side, Expiry with a days-left badge, Net Qty, Lot, Avg … |
| [F-FNO-003](features/F-FNO-003.md) | F&O trades tab | Live | The Trades tab shows the full Trade Tape: every F&O trade in the portfolio, newest first, with Date, Side (BUY/SELL), Instrument, Strike, … |
| [F-FNO-004](features/F-FNO-004.md) | F&O Tax / P&L statement | Live | The Tax / P&L tab shows one card per financial year ("FY <year>": total P&L, "Turnover: … · Trades: N", note "Non-speculative §43(5) · … |
| [F-FNO-005](features/F-FNO-005.md) | Expiry-day close approvals | Live | On expiry day a server job turns each open contract expiring that day into an "Expiry close" request (status shown as "EXPIRY ?") and … |
| [F-FNO-006](features/F-FNO-006.md) | Live F&O prices | Live | While the page is open and visible, it asks the server every 5 seconds to re-mark open positions from NSE live derivative quotes. |
| [F-FNO-007](features/F-FNO-007.md) | Recompute positions | Live | The circular-arrow button (tooltip "Recompute derivative positions"; text "Recompute" on small screens) rebuilds every F&O position in the … |
| [F-FNO-008](features/F-FNO-008.md) | Connect, log in to and disconnect a broker | Live | The header shows a chip for each supported broker — Kite (Zerodha), Upstox, Angel One — with connect (not set up), login (set up, no live … |
| [F-FNO-009](features/F-FNO-009.md) | Sync broker trades | Partial | Sync Kite pulls today's F&O trades from your Zerodha account into the current portfolio and shows "Synced — N new trades". |

### [Bonds](modules/bonds.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-BOND-001](features/F-BOND-001.md) | Bonds holdings and entries | Live | Shows summary cards Invested, Current value, Unrealised P&L (with %), a holdings table (Name with ISIN, Type — Govt Bond / Corp Bond / … |
| [F-BOND-002](features/F-BOND-002.md) | Add, edit and delete a bond entry | Live | The "Add Bond" / "Edit Bond Entry" dialog records a bond buy, sell, coupon, maturity or redemption. |

### [FDs & RDs](modules/fds-rds.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-FD-001](features/F-FD-001.md) | Deposits overview cards | Live | Shows Total Invested (with "N deposit(s)"), Current Value ("live valuation") and Total Earnings ("realised + unrealised", with %), then a … |
| [F-FD-002](features/F-FD-002.md) | "Coming up" deposit reminders panel | Live | Above the cards, a Coming up list shows every deposit maturing within 30 days ("Matures in N days" / "Matures today") and, for RDs, the … |
| [F-FD-003](features/F-FD-003.md) | Add, edit and delete an FD or RD entry | Live | The "Add Fixed Deposit" / "Add Recurring Deposit" dialog (edit: "Edit Fixed Deposit Entry" / "Edit Recurring Deposit Entry") records a … |
| [F-FD-004](features/F-FD-004.md) | Deposit detail page | Live | One deposit's page: a header with the bank name, "Fixed Deposit"/"Recurring Deposit" and "№ <6 characters>", term, payout and portfolio, … |
| [F-FD-005](features/F-FD-005.md) | RD installment schedule | Live | For a recurring deposit, an Installment schedule card ("<paid> / <total> paid") lists every month: #, Due date, Installment, Cumulative … |
| [F-FD-006](features/F-FD-006.md) | Deposit payment log | Live | A Payment log ("N records") lists the deposit's entries newest first (Date, Type, Amount, Notes) with edit/delete (shown on hover) and, for … |
| [F-FD-007](features/F-FD-007.md) | Deposit maturity and installment alerts | Live | Every day the server adds alerts to the bell: "<Bank> FD/RD matures in N days" at 30, 15, 7 and 1 days before maturity (with "₹<principal> … |

### [Gold & Silver](modules/gold-silver.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-GOLD-001](features/F-GOLD-001.md) | Gold & Silver holdings with live valuation | Live | Shows the live rate bar (F-GOLD-002), cards Invested, Current value (with a pulsing "live" dot) and Unrealised P&L (with %), a holdings … |
| [F-GOLD-002](features/F-GOLD-002.md) | Live gold and silver rate bar | Live | A sticky bar at the top shows the current Gold and Silver price per gram ("/g") at a purity you pick, and "Live · updated <just now | Ns … |
| [F-GOLD-003](features/F-GOLD-003.md) | Add, edit and delete a gold or silver entry | Live | The "Add Gold / Silver" / "Edit Gold / Silver Entry" dialog records a buy or sale (and for SGBs, interest and maturity), pre-fills today's … |
| [F-GOLD-004](features/F-GOLD-004.md) | Gold holding detail page | Live | A page per metal holding: photo carousel (previous/next, dots, "N / M", Delete photo), type and portfolio, purity badge and name, ISIN, … |

### [Crypto](modules/crypto.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CRYPTO-001](features/F-CRYPTO-001.md) | Crypto holdings with live prices | Live | Shows a live ticker strip (first 8 coins with a price: symbol, 24h change %, INR price), cards Invested, Current value (INR and USD, … |
| [F-CRYPTO-002](features/F-CRYPTO-002.md) | Add, edit and delete a crypto entry | Live | The "Add Cryptocurrency" / "Edit Crypto Entry" dialog records a Buy, Sell, Staking Reward, Transfer In or Transfer Out, with coin search, … |
| [F-CRYPTO-003](features/F-CRYPTO-003.md) | Coin detail page | Live | A page per coin holding: symbol and portfolio badges, a CoinGecko link, Current Value (INR, USD, price per coin, 24h change), Unrealised … |

### [NPS](modules/nps.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-NPS-001](features/F-NPS-001.md) | NPS holdings and entries | Live | Shows Invested, Current value, Unrealised P&L cards, a holdings table (Name with PRAN, Type, Portfolio, Qty / Units, Avg cost, Invested, … |
| [F-NPS-002](features/F-NPS-002.md) | Add, edit and delete an NPS entry | Live | The "Add NPS Entry" / "Edit NPS Entry" dialog records a Contribution, Growth / returns, Exit / partial withdrawal or Opening balance. |

### [Post Office](modules/post-office.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-PO-001](features/F-PO-001.md) | Post Office schemes overview | Live | Shows Invested ("N account(s)"), Current value ("across all schemes"), Unrealised P&L ("interest accrual") and one row per scheme in a … |
| [F-PO-002](features/F-PO-002.md) | Add, edit and delete a Post Office entry | Live | The "Add Post Office Entry" / "Edit Post Office Entry" dialog records a purchase, deposit, interest, withdrawal, maturity or opening … |
| [F-PO-003](features/F-PO-003.md) | Post Office account detail page | Live | A page per PO account: header (scheme label, "№ <6 characters>", name, full scheme name, term, portfolio, rate "per annum"), Term progress … |
| [F-PO-004](features/F-PO-004.md) | Post Office installment schedule | Live | For PO RD (monthly) and SSY (yearly), a Monthly installment schedule / Annual deposit schedule card lists each installment with due date, … |
| [F-PO-005](features/F-PO-005.md) | Post Office transaction log | Live | A Transaction log lists the account's entries newest first with edit/delete, plus, for SCSS and MIS, computed interest payout rows for each … |
| [F-PO-006](features/F-PO-006.md) | Post Office maturity alerts | Live | Daily, the server adds a bell alert "<Scheme> matures in N days" ("<name> matures on <date>") at 30, 15, 7 and 1 days before the maturity … |

### [Other Assets](modules/other-assets.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-OTHER-001](features/F-OTHER-001.md) | Other assets holdings and entries | Live | Shows Invested, Current value, Unrealised P&L cards, a holdings table (Name, Type — PMS, AIF, ULIP, REIT, InvIT, Real Estate, Art, Cash, … |
| [F-OTHER-002](features/F-OTHER-002.md) | Add, edit and delete an other-asset entry | Live | The "Add Other Asset" / "Edit Other Asset" dialog records an entry for one of 8 types, with per-type transaction choices and quantity/price … |

### [Loans](modules/loans.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-LOAN-001](features/F-LOAN-001.md) | Loans page overview and section switcher | Live | Shows two summary panels at the top of the Loans page — You owe · loans taken and Owed to you · loans given — and a sticky Taken / Given … |
| [F-LOAN-002](features/F-LOAN-002.md) | Loans taken list | Live | Lists every loan you have taken as an "EMI coupon" card. |
| [F-LOAN-003](features/F-LOAN-003.md) | Add or edit a loan (full form) | Live | Opens the Add loan (or Edit loan) dialog to record a loan you have taken: lender, loan type, borrower, account number, principal, rate, … |
| [F-LOAN-004](features/F-LOAN-004.md) | Delete a loan | Live | Permanently deletes a loan taken and all its recorded payments. |
| [F-LOAN-005](features/F-LOAN-005.md) | Loan detail: summary, progress and charts | Live | Shows one loan in depth. |
| [F-LOAN-006](features/F-LOAN-006.md) | Edit a loan from its detail page | Live | A shorter Edit loan dialog on the loan's page for the figures that change most: lender, loan type, principal, interest rate, tenure, EMI … |
| [F-LOAN-007](features/F-LOAN-007.md) | Record a loan payment and manage payment history | Live | Records a payment against a loan taken — EMI, Prepayment, Foreclosure or Processing fee — and lists every payment in Payment history (Date, … |
| [F-LOAN-008](features/F-LOAN-008.md) | Amortization schedule with Mark paid and Undo | Live | The Amortization schedule table lists every EMI: #, Date, Opening, EMI, Principal, Interest, Closing, Status (Paid with date, Overdue, … |
| [F-LOAN-009](features/F-LOAN-009.md) | Loan tax benefit panel | Live | For a loan with a Tax benefit section, shows Tax benefit — Section 80C + 24(b) (home loan) or Tax benefit — Section 80E (education loan) … |
| [F-LOAN-010](features/F-LOAN-010.md) | Compare with market (refinance check) | Live | On an active loan, the Compare with market card shows your rate against the lowest current market rate for your loan type ("Market from X% … |
| [F-LOAN-011](features/F-LOAN-011.md) | Linked vehicle and property on a loan | Partial | When a loan carries a link to a vehicle or a rental property, the loan page shows a Linked vehicle card ("View vehicle details →") or a … |
| [F-LOAN-012](features/F-LOAN-012.md) | EMI due and overdue reminders | Live | Creates reminders in Alerts for each active loan taken: "<lender> EMI due in N days" 30, 15, 7 and 1 days before the next unpaid EMI, … |
| [F-LOAN-013](features/F-LOAN-013.md) | Refinance and benchmark-change alerts | Live | Every morning, checks each active loan taken against live lender rates and benchmark rates and creates two kinds of alert. |
| [F-LOAN-016](features/F-LOAN-016.md) | Loans given list | Live | The Loans given section lists money you have lent, one card per loan: the borrower's name, relationship and "Lent <date>", a status badge … |
| [F-LOAN-017](features/F-LOAN-017.md) | Lend money / edit a loan given | Live | The Lend money dialog (titled Edit loan given when editing) records who you lent to, how much, when, the yearly interest rate and how it … |
| [F-LOAN-018](features/F-LOAN-018.md) | Loan given detail page | Live | Shows one loan given: the borrower's initials, name, status badge and a line "<relationship> · <contact> · Monthly EMI / Flexible repayment … |
| [F-LOAN-019](features/F-LOAN-019.md) | Record a repayment or other entry on a loan given | Live | Adds an entry to a loan given's ledger: Repayment received (flexible) or Lump-sum repayment (EMI), Interest received (only for loans with … |
| [F-LOAN-020](features/F-LOAN-020.md) | EMI repayment schedule for a loan given | Live | For a loan given on Monthly EMI, the Repayment schedule card ("₹… every month · N EMIs from <date>") lists each instalment: #, Due (and … |
| [F-LOAN-021](features/F-LOAN-021.md) | Settle, write off, reopen or delete a loan given | Live | From More actions (⋯) on a loan given: Mark settled closes it as fully settled on a date; Write off forgives the principal still owed and … |
| [F-LOAN-022](features/F-LOAN-022.md) | Repayment-due reminders for loans given | Live | Creates reminders in Alerts for each active loan given with a next payment: "<borrower>'s repayment is due in N days" 30, 15, 7 and 1 days … |

### [EMI Calculator](modules/emi-calculator.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-EMI-001](features/F-EMI-001.md) | Calculate: EMI, maximum loan or tenure | Live | Computes a loan from the inputs you give, in one of three modes: EMI (loan amount + rate + tenure → monthly EMI), Max loan (EMI you can pay … |
| [F-EMI-002](features/F-EMI-002.md) | Prepayments and rate changes | Live | Under Advanced, adds one-off or yearly Prepayments (month number, amount, Repeat Once / Every year, Effect Cut tenure / Cut EMI) and Rate … |
| [F-EMI-003](features/F-EMI-003.md) | Processing fee and charges (APR) | Live | With Processing fee and charges switched on, adds a processing fee (% of loan or Fixed Rs.), GST on fee (%) and Other charges (Rs.). |
| [F-EMI-004](features/F-EMI-004.md) | Tax benefit in the calculator | Live | With Tax benefit switched on, estimates the income-tax saved each financial year for a home or education loan and shows Tax saved, Cost … |
| [F-EMI-005](features/F-EMI-005.md) | Repayment schedule by financial year | Live | Below the result, Repayment schedule groups every EMI by financial year ("FY 2026-27") with totals for EMI paid, Interest, Principal, … |
| [F-EMI-006](features/F-EMI-006.md) | Compare loan offers | Live | The Compare tab puts two or three loan offers side by side. |
| [F-EMI-007](features/F-EMI-007.md) | Live rates | Live | The Live rates tab lists indicative published rates by lender for one Loan type (Home, Car, Two-wheeler, Personal, Education, Gold, Loan … |
| [F-EMI-008](features/F-EMI-008.md) | Share a calculator link | Live | Share copies a link to the calculator with every input of the Calculate and Compare tabs and the current tab. |
| [F-EMI-009](features/F-EMI-009.md) | Export the schedule to PDF or Excel | Live | PDF and Excel download the current calculation as emi-schedule.pdf or emi-schedule.xlsx: a summary (loan amount, rate, tenure, EMI, total … |
| [F-EMI-010](features/F-EMI-010.md) | Daily lender-rate refresh | Live | Every day at 07:30 IST the server reads the published loan rates and MCLR of tracked lenders (SBI, HDFC Bank, ICICI Bank, Axis Bank, Kotak, … |

### [Credit Cards](modules/credit-cards.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CARD-001](features/F-CARD-001.md) | Credit cards list and summary | Live | Shows a summary strip — Total credit limit ("across N active cards"), Total outstanding ("combined across active cards") and Avg … |
| [F-CARD-002](features/F-CARD-002.md) | Add or edit a credit card | Live | The Add credit card / Edit credit card dialog ("The card's limit and billing days. |
| [F-CARD-003](features/F-CARD-003.md) | Delete a credit card | Live | Permanently deletes a card and all its statements. |
| [F-CARD-004](features/F-CARD-004.md) | Reveal the full card number | Live | The eye button on a card face shows the full saved card number; clicking again hides it. |
| [F-CARD-005](features/F-CARD-005.md) | Credit card detail page | Live | Shows one card: title "<issuer> — <card name>", network and status; the large card face (with reveal); metrics Credit limit ("Statement … |
| [F-CARD-006](features/F-CARD-006.md) | Credit card statements: add, mark paid, delete | Live | Statement history lists each month's bill — Month, Statement, Min due, Due date (with "in Nd", "today" or "Nd ago" until paid), Paid, Paid … |
| [F-CARD-007](features/F-CARD-007.md) | Credit card payment reminders | Live | Creates reminders in Alerts for unpaid statements of active cards: "<issuer> <card> ••••<last 4> payment due in N days" 30, 15, 7 and 1 … |

### [Vehicles](modules/vehicles.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-VEH-001](features/F-VEH-001.md) | Vehicles list | Live | Shows every vehicle on your account as a card with its registration number, make and model, owner name, a shield icon and three expiry rows … |
| [F-VEH-002](features/F-VEH-002.md) | Individual / Family grouping | Live | Switches the Vehicles list between one flat grid (Individual) and sections grouped by the RC owner name (Family), each headed by the owner … |
| [F-VEH-003](features/F-VEH-003.md) | Add a vehicle (CarInfo owner verification) | Live | A three-step wizard that takes your registration number and mobile number, has CarInfo send an OTP to that mobile, and on verification … |
| [F-VEH-004](features/F-VEH-004.md) | Paste VAHAN SMS | Live | Lets you text "VAHAN <reg-no>" to 07738299899, paste the reply, and have the app parse it into the vehicle record — updating an existing … |
| [F-VEH-005](features/F-VEH-005.md) | Delete a vehicle | Live | Permanently removes a vehicle and its challans. |
| [F-VEH-006](features/F-VEH-006.md) | Vehicle detail page | Live | Shows one vehicle: header with registration number and shield, description (make model variant), action buttons, a Photo card, a … |
| [F-VEH-007](features/F-VEH-007.md) | Edit a vehicle | Live | Opens the vehicle form ("Edit vehicle") to change make, variant, year, colour, chassis last 4, the Insurance, PUC/Emission, Fitness … |
| [F-VEH-008](features/F-VEH-008.md) | Refresh RC details | Live | Re-fetches the vehicle's RC details from a chain of free sources and merges the fresh values into the vehicle, then shows which source … |
| [F-VEH-009](features/F-VEH-009.md) | Vehicle stock photo | Live | Shows a generic stock image for the vehicle's make and model and lets you look one up again. |
| [F-VEH-010](features/F-VEH-010.md) | Challans | Live | Fetches traffic challans (e-challans) for the vehicle, stores them, and lists them with filter tabs, counts and rupee totals. |
| [F-VEH-011](features/F-VEH-011.md) | Fuel and electricity prices | Live | Shows today's petrol, diesel (₹/litre), CNG (₹/kg), LPG (14.2 kg cylinder) and electricity (₹/kWh) prices for a chosen state, with a … |
| [F-VEH-012](features/F-VEH-012.md) | Vehicle valuation | Live | Estimates a used vehicle's price from category, make, model, year, trim/variant, kilometres, whether you are buying or selling and to/from … |
| [F-VEH-013](features/F-VEH-013.md) | Use my car and Save to my vehicle | Live | When the valuation page is opened from a vehicle, Use my car (<REG>) fills the inputs from that vehicle and fetches a quote; Save to my … |
| [F-VEH-014](features/F-VEH-014.md) | Automatic RC refresh | Live | Every day at 02:15 IST the server refreshes RC details for every vehicle that has never been refreshed or was last refreshed more than 7 … |
| [F-VEH-015](features/F-VEH-015.md) | Monthly challan scan | Live | On the 1st of every month at 03:00 IST the server runs the challan check (F-VEH-010) for every vehicle. |
| [F-VEH-016](features/F-VEH-016.md) | Vehicle expiry alerts | Live | Creates an alert when a vehicle's PUC, Insurance, Fitness Certificate or Road Tax expires in exactly 30, 15, 7 or 1 day(s), e.g. |

### [Real Estate](modules/real-estate.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-REST-001](features/F-REST-001.md) | Real estate list and summary | Live | Lists your properties as cards and, above them, three tiles: Active properties ("of N total"), Portfolio value ("current estimate") and … |
| [F-REST-002](features/F-REST-002.md) | Grid and map view of properties | Live | Switches the Real Estate or Rental list between cards and a map of all properties with pins; clicking a pin opens a preview card with cover … |
| [F-REST-003](features/F-REST-003.md) | Add or edit an owned property | Live | A long form ("Add property" / "Edit property") with sections Identity, Specs, Ownership, Purchase cost, Current value, Property tax & … |
| [F-REST-004](features/F-REST-004.md) | Delete an owned property | Live | Deletes a property after an inline confirmation. |
| [F-REST-005](features/F-REST-005.md) | Property detail page | Live | Shows one property: name (with a "Sold" tag when sold), type · status, action buttons, the Rentals banner when linked, Photos, three tiles … |
| [F-REST-006](features/F-REST-006.md) | Update current value | Live | Records the latest market value of the property. |
| [F-REST-007](features/F-REST-007.md) | Mark property sold | Live | Records the sale date, sale price and optional sale brokerage, flips the status to Sold and makes the property inactive. |
| [F-REST-008](features/F-REST-008.md) | Capital gain on sale | Live | For a sold property, shows sale price, net proceeds ("after brokerage"), total cost basis, holding period in months (long-term over 24 … |
| [F-REST-009](features/F-REST-009.md) | Make rental and Remove from rentals | Live | Make rental creates a matching Rental property (name, address, type, purchase date and price, current value, portfolio) linked to this … |
| [F-REST-010](features/F-REST-010.md) | Property photos | Live | Lets you add up to 20 photos per property, shows them as a mosaic (first five), opens a full-screen viewer, sets the cover photo used on … |
| [F-REST-011](features/F-REST-011.md) | Property location pin | Live | Shows the property's address beside a map with its pin. |
| [F-REST-012](features/F-REST-012.md) | Real estate alerts | Live | Creates alerts 30, 15, 7 and 1 day(s) before: the property-tax due date (1st of the chosen Tax due month), the expected possession date of … |
| [F-REST-013](features/F-REST-013.md) | Linked loan and insurance records | Partial | On the property page, Linked records shows links "Linked loan", "Linked insurance" and "Rented out (rental record)" when the property … |

### [Rental](modules/rental.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-RENT-001](features/F-RENT-001.md) | Rental properties list | Live | The Properties tab lists rental properties as ticket-style cards: type band (Residential, Commercial, Land, Parking) with a short reference … |
| [F-RENT-002](features/F-RENT-002.md) | Add or edit a rental property | Live | A short dialog ("Add property" / "Edit property") for name, type, address, purchase date, purchase price and current value. |
| [F-RENT-003](features/F-RENT-003.md) | Delete a rental property | Live | Deletes a rental property and everything under it. |
| [F-RENT-004](features/F-RENT-004.md) | Collections | Live | Lists every active tenant who owes money, highest balance first, with property name, "Oldest pending: YYYY-MM" and a Remind button. |
| [F-RENT-005](features/F-RENT-005.md) | Rental property detail and this financial year | Live | Shows a rental property: name, type · address, Add expense and Add tenancy, the Photos gallery, "This financial year" tiles (rent received … |
| [F-RENT-006](features/F-RENT-006.md) | Add a tenancy | Live | Records a tenant and lease terms and generates the monthly rent schedule; a security deposit is entered into the tenant's khata. |
| [F-RENT-007](features/F-RENT-007.md) | Tenancy cards and rent receipts | Live | Each tenancy shows initials, name, Active/Ended, "N overdue", monthly rent, start → end month, "received/total collected" and Total … |
| [F-RENT-008](features/F-RENT-008.md) | Mark rent received | Live | Records a rent payment against a month: adds a payment to the khata, creates a cash inflow, and updates the month's status (Received or … |
| [F-RENT-009](features/F-RENT-009.md) | Skip a month and undo actions | Live | Skip marks a month as not owed (e.g. |
| [F-RENT-010](features/F-RENT-010.md) | Bank-credit auto-match | Live | When an imported UPI or NEFT credit (from bank alerts) is turned into a cash inflow, the app looks for a matching rent month and, if … |
| [F-RENT-011](features/F-RENT-011.md) | Property expenses | Live | Records costs of a rental property (Property Tax, Maintenance, Repairs, Utilities, Agent Fee, Legal, Other) and lists them (Date, Type, … |
| [F-RENT-012](features/F-RENT-012.md) | Tenant khata (ledger) | Live | A running account per tenancy: a big balance ("To collect", "In advance" or "Settled up"), "Deposit held", the Rent credited to picker, and … |
| [F-RENT-013](features/F-RENT-013.md) | Rent credited to | Live | Chooses which of your bank accounts a tenant's rent lands in. |
| [F-RENT-014](features/F-RENT-014.md) | Share statement | Live | Downloads a PDF "Rent statement — <tenant>" with the period, a table (Date, Details, Charged, Paid, Balance) oldest first, totals, Balance … |
| [F-RENT-015](features/F-RENT-015.md) | WhatsApp rent reminder | Live | Builds a reminder message from the tenant's balance and opens WhatsApp (wa.me) in a new tab with it pre-typed. |
| [F-RENT-016](features/F-RENT-016.md) | Pending tenant reminders (email and SMS) | Live | A collapsible panel "Pending tenant reminders" (with "N awaiting approval") that queues reminder messages for upcoming and overdue rent and … |
| [F-RENT-017](features/F-RENT-017.md) | Reminder preview and edit | Live | Shows a queued reminder ("Preview reminder — <Month Year>") and lets you edit the email subject, greeting, opening line, payment … |
| [F-RENT-018](features/F-RENT-018.md) | Overdue rent status and alerts | Live | Daily at 01:00 IST the server re-derives rent statuses so months 7+ days past due become Overdue. |
| [F-RENT-019](features/F-RENT-019.md) | Daily reminder scan | Live | Daily at 09:00 IST the server queues rent reminders for all users exactly as Run scan does (F-RENT-016). |

### [Insurance](modules/insurance.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-INS-001](features/F-INS-001.md) | Insurance page overview | Live | Shows your policies as certificate-style cards, with a three-figure summary on top — Life cover (sum assured of active term, whole life, … |
| [F-INS-002](features/F-INS-002.md) | Add a policy | Live | Opens the Add a policy dialog to record a policy: an optional catalogue pick that fills insurer, plan and type, then insurer, policy … |
| [F-INS-003](features/F-INS-003.md) | Edit a policy | Live | Opens Edit policy with the saved values (the policy number box is empty and shows "Saved, ending 1234 — type to replace"). |
| [F-INS-004](features/F-INS-004.md) | Delete a policy | Live | Deletes a policy together with its premium payments and claims, after confirmation. |
| [F-INS-005](features/F-INS-005.md) | Show the full policy number | Live | Policy numbers are shown masked as "●●●● 1234". |
| [F-INS-006](features/F-INS-006.md) | Coming up and recording a premium payment | Live | The Coming up panel lists active policies with a premium due within 30 days or overdue, most at risk first, each with what to do and a … |
| [F-INS-007](features/F-INS-007.md) | Premium schedule | Live | The Premiums card on a policy page lists every premium from the start date to the next three upcoming ones (newest first, first 12 shown), … |
| [F-INS-008](features/F-INS-008.md) | Policy page | Live | Shows one policy in full: a certificate-style header (insurer, plan, type, policyholder, Sum assured or Cover, masked policy number), an … |
| [F-INS-009](features/F-INS-009.md) | Nominees | Live | The Nominees card lists who receives the money (name, relation, share and appointee for a minor). |
| [F-INS-010](features/F-INS-010.md) | Who to call | Live | The Who to call card holds your own contacts for the policy — Insurer helpline, Claims email, Claims web page, TPA and TPA helpline (health … |
| [F-INS-011](features/F-INS-011.md) | Start a claim | Live | Start a claim asks "What happened?" with the claim kinds that fit the policy type, shows who to tell first (your saved helpline or the … |
| [F-INS-012](features/F-INS-012.md) | Claim tracker | Live | Each claim on the policy page shows what is claimed, when it was reported and its status; a "next" box (Waiting — until <date>, Waiting on … |
| [F-INS-013](features/F-INS-013.md) | Claims in progress | Live | On the Insurance page, lists every claim not yet closed across all policies, those needing a push first (Ombudsman, then complaint, then … |
| [F-INS-014](features/F-INS-014.md) | Tax on your premiums | Live | A foldable card that works out what the premiums recorded in a financial year are worth under the Income-tax Act, 2025, old regime only: … |
| [F-INS-015](features/F-INS-015.md) | Surrender value | Live | For whole life, endowment and ULIP policies, records the insurer's surrender quote (Quoted value (₹), Quoted on) and compares it with the … |
| [F-INS-016](features/F-INS-016.md) | Premiums from imported statements | Live | The From your imported statements card lists premiums found in imported insurance statements that may belong to this policy, matched by … |
| [F-INS-017](features/F-INS-017.md) | Find my insurance documents in Gmail | Live | A per-Gmail-account permission. |
| [F-INS-018](features/F-INS-018.md) | Insurance documents from Gmail | Live | Shows what the Gmail search found and what became of it: Policies found (N) to review and add, Renewals to confirm (N) with proposed … |
| [F-INS-019](features/F-INS-019.md) | Coverage check | Live | Answers "Are you covered enough, and where are the gaps?" for four areas — Life cover, Health cover, Vehicles, Home — each with a verdict … |
| [F-INS-020](features/F-INS-020.md) | Family insurance sheet | Live | One printable page of your active policies grouped as Life cover, Health cover and Other cover: for each, the cover, type, Policyholder, … |
| [F-INS-021](features/F-INS-021.md) | Help and rights | Live | A searchable library of 16 topics in four groups — Buying, Owning, Claiming, When things go wrong — explaining what IRDAI's rules say you … |
| [F-INS-022](features/F-INS-022.md) | Premium and claim reminders | Live | Creates alerts in Alerts for each active policy's next premium: 30, 15, 7 and 1 days before and on the due day ("<insurer> — <plan> premium … |
| [F-INS-023](features/F-INS-023.md) | Premiums matched from bank and payment emails | Live | When an approved email event of type "premium paid" is turned into a cash-flow entry, EveryPaisa tries to link it to one of your active … |

### [PPF & EPF](modules/ppf-epf.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-PF-001](features/F-PF-001.md) | Provident Fund page and holdings | Live | Shows your PPF and EPF holdings across all portfolios with a summary strip (Invested, Current value, Unrealised P&L), the holdings, a … |
| [F-PF-002](features/F-PF-002.md) | Add or edit an EPF entry | Live | The Add EPF Entry dialog records one EPF entry: employer, optional UAN, entry type (Contribution (monthly), Annual interest credit, … |
| [F-PF-003](features/F-PF-003.md) | Add or edit a PPF entry | Live | The Add PPF Entry dialog records one PPF entry: bank / post office, optional PPF account number, entry type (Annual / partial deposit, … |
| [F-PF-004](features/F-PF-004.md) | Link a PF account for auto-fetch | Live | Registers an EPF UAN (institution EPFO) or a PPF account at SBI, India Post, HDFC Bank, ICICI Bank, Axis Bank, Punjab National Bank or Bank … |
| [F-PF-005](features/F-PF-005.md) | Auto-fetch accounts and refresh nudges | Live | Lists linked accounts (holder name, last 4 digits, type, institution, balance when known, last refresh date) with Passbook and Refresh … |
| [F-PF-006](features/F-PF-006.md) | Refresh from the EPFO portal | Partial | Refresh Provident Fund asks for the UAN and Password, starts a server-side fetch of the passbook, and relays the portal's captcha image and … |
| [F-PF-007](features/F-PF-007.md) | Upload a passbook PDF | Partial | Upload Passbook PDF imports an EPFO passbook PDF without the live portal. |
| [F-PF-008](features/F-PF-008.md) | Reset the EPFO password | Partial | Reset your EPFO password collects the UAN, the mobile number registered with EPFO and a new password that meets EPFO's rules, and is meant … |
| [F-PF-009](features/F-PF-009.md) | Browser extension pairing | Live | The Browser Extension page pairs the EveryPaisa browser extension with your account using an 8-character code valid for 5 minutes, and … |
| [F-PF-010](features/F-PF-010.md) | PF refresh-due alerts | Live | Once a day, creates a "Refresh EPF account" / "Refresh PPF account" alert for each active linked account not refreshed for 30 days or more … |

### [Forex](modules/forex.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-FX-001](features/F-FX-001.md) | Live FX rates | Live | The Live FX rates panel shows the latest stored rate for each INR pair (USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY → INR) and … |
| [F-FX-002](features/F-FX-002.md) | Foreign currency balances | Live | The Cash tab lists foreign-currency balances (for example Wise, a foreign bank or a forex card) with currency, account label and last 4 … |
| [F-FX-003](features/F-FX-003.md) | FX pair positions | Live | The FX pairs tab lists currency-pair positions (for example USDINR or EURUSD) recorded as transactions, with live value from the stored … |
| [F-FX-004](features/F-FX-004.md) | Forex pair P&L by financial year | Live | The Speculative business income (FOREX_PAIR P&L) table shows, per portfolio, pair and financial year, buy and sell quantity, realised P&L … |
| [F-FX-005](features/F-FX-005.md) | Foreign equities | Live | The Foreign equities tab lists US and international shares (for example AAPL, MSFT) recorded as transactions, valued with the Yahoo price … |
| [F-FX-006](features/F-FX-006.md) | LRS utilisation | Live | The LRS utilisation card shows "FY <year> · $used of $250000.00 used", a bar (green, amber above 80%, red at 100%) and "N% of annual LRS … |
| [F-FX-007](features/F-FX-007.md) | Record or delete an LRS remittance | Live | Record LRS remittance saves an outward remittance (date, purpose, currency, amount, optional FX rate, bank, reference, TCS deducted, … |
| [F-FX-008](features/F-FX-008.md) | TCS credits | Partial | When TCS credits exist, the TCS credits table lists them (FY, collector, TAN, amount). |

### [Goals](modules/goals.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-GOAL-001](features/F-GOAL-001.md) | Goals list and progress | Live | Lists your goals as cards in three sections — Active, Achieved and Paused / abandoned — each with category and priority badges, a progress … |
| [F-GOAL-002](features/F-GOAL-002.md) | Create or edit a goal | Live | Create goal (or Edit goal) sets name, category, priority, target and initial amounts, target date, status (edit only), inflation rate, … |
| [F-GOAL-003](features/F-GOAL-003.md) | Delete a goal | Live | Deletes a goal after the browser confirmation "Delete this goal?". |

### [Income](modules/income.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-INC-001](features/F-INC-001.md) | Income list and total | Live | Shows Total active monthly income and cards in Active and Inactive sections, each with source name, type, Inactive badge, monthly amount … |
| [F-INC-002](features/F-INC-002.md) | Add or edit income | Live | Add income (or Edit income) records type, source, monthly amount, typical credit day, active flag and notes. |
| [F-INC-003](features/F-INC-003.md) | Delete income | Live | Deletes an income entry immediately, with no confirmation. |

### [Cash Activity](modules/cash-activity.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CASH-001](features/F-CASH-001.md) | Scheduled cashflow forecast | Live | The Scheduled cashflow card ("Forecast · next 12 months") shows Expected inflows, Expected outflows and Net, a monthly bar chart of inflows … |
| [F-CASH-002](features/F-CASH-002.md) | Cash flow entries | Live | Lists cash-flow entries newest first, 50 per page, with All / Inflows / Outflows tabs, Inflows (this page) and Outflows (this page) totals, … |

### [Accounting](modules/accounting.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ACCT-001](features/F-ACCT-001.md) | Accounting page and plan lock | Live | Shows four tabs — Chart of Accounts, Vouchers, Ledger, Reports — under the header "Double-entry bookkeeping — chart of accounts, vouchers, … |
| [F-ACCT-002](features/F-ACCT-002.md) | Chart of accounts | Live | Shows your accounts as a tree with Code, Name, Type (ASSET, LIABILITY, EQUITY, INCOME, EXPENSE) and Opening Balance. |
| [F-ACCT-003](features/F-ACCT-003.md) | Add or delete an account | Live | Add Account creates an account with code, type, name, parent and opening balance. |
| [F-ACCT-004](features/F-ACCT-004.md) | Vouchers list | Live | Lists vouchers newest first, 50 per page: Date, Voucher No., Type (JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES, with "auto" for … |
| [F-ACCT-005](features/F-ACCT-005.md) | New voucher | Live | New Voucher records a voucher with type, number (suggested automatically), date, narration and one or more lines, each a debit account, a … |
| [F-ACCT-006](features/F-ACCT-006.md) | Delete a voucher | Live | Deletes a voucher after the confirmation "Delete this voucher?". |
| [F-ACCT-007](features/F-ACCT-007.md) | Generate vouchers from activity | Live | Generate from activity creates, updates or removes "auto" vouchers so the books match your activity: buys, SIPs and deposits (PURCHASE: … |
| [F-ACCT-008](features/F-ACCT-008.md) | Receipts | Live | Each voucher can be opened as a PDF receipt (View receipt) or downloaded (Download receipt (PDF)); rent, premium and loan vouchers become a … |
| [F-ACCT-009](features/F-ACCT-009.md) | Ledger | Live | Shows one account's postings in a date range: Opening and Closing balances and a table of Date, Voucher, Narration, Debit, Credit and … |
| [F-ACCT-010](features/F-ACCT-010.md) | Trial Balance | Live | Lists every account grouped as Assets, Liabilities, Equity, Income, Expenses with Code, Account, Opening (wide screens), Debit, Credit and … |
| [F-ACCT-011](features/F-ACCT-011.md) | P&L Statement | Live | Shows Income and Expenses accounts with their movement in a period, Total Income, Total Expenses and Net Profit or Net Loss. |
| [F-ACCT-012](features/F-ACCT-012.md) | Balance Sheet | Live | Shows Assets and Liabilities & Equity (including Retained Earnings = income − expenses to date) with totals, as of a date. |
| [F-ACCT-013](features/F-ACCT-013.md) | Export to Tally | Live | Downloads your books as one ZIP for TallyPrime: "1 - Masters.xml" (groups and ledgers with opening balances), one "Transactions … |

### [Reports](modules/reports.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-REPORT-001](features/F-REPORT-001.md) | Reports page filters and tabs | Live | Gives the page its common filter card — Portfolio, Report for (only when you can report on someone else), Financial Year (only on tabs that … |
| [F-REPORT-002](features/F-REPORT-002.md) | Report search | Live | A search box above the filters ("Search reports… e.g. |
| [F-REPORT-003](features/F-REPORT-003.md) | Data checks banner and Fix now | Live | Above every tab except Inbox imports, a line says whether the reports can be trusted: "All data checks passed." with "Data as of: … |
| [F-REPORT-004](features/F-REPORT-004.md) | Summary tab | Live | Shows three cards — Portfolio (name, currency, number of transactions and holdings), Unrealised (Invested, Value, P&L) and XIRR (Overall, … |
| [F-REPORT-005](features/F-REPORT-005.md) | Unrealised P&L tab | Live | Lists every open holding with Asset, Class, Qty, Avg, CMP (current market price), Invested, Value, P&L and %, under a heading "N holdings · … |
| [F-REPORT-006](features/F-REPORT-006.md) | Capital gains tabs: Intraday, STCG, LTCG, Schedule 112A | Live | Four tabs listing realised gains for the chosen FY, one row per FIFO match of a sale to a purchase: Asset, Buy Date, Sell Date, Qty, Buy ₹, … |
| [F-REPORT-007](features/F-REPORT-007.md) | Income tab | Live | Lists dividends, interest and maturity credits in the FY (Date, Type, Asset, Amount, Narration), headed "Dividends ₹… · Interest ₹… · Total … |
| [F-REPORT-008](features/F-REPORT-008.md) | XIRR tab | Live | Table "Annualized Returns (XIRR)" with rows Overall, 1 Year, 3 Year, 5 Year and columns XIRR, Invested, Terminal Value, Cashflows. |
| [F-REPORT-009](features/F-REPORT-009.md) | Historical tab | Live | "Monthly valuation history · N points": one row per month-end since your first transaction, with Cost, Value and number of Holdings. |
| [F-REPORT-010](features/F-REPORT-010.md) | Excel / PDF download of the open tab | Live | On Unrealised P&L, Intraday, STCG, LTCG, Schedule 112A and Income, the Excel and PDF buttons download the same report as a file named … |
| [F-REPORT-011](features/F-REPORT-011.md) | Statements tab | Live | Four download cards, each with PDF and Excel: Holdings Statement (per-asset positions by class with avg cost, market value, unrealised P&L … |
| [F-REPORT-012](features/F-REPORT-012.md) | Tax & MIS downloads — inputs and free reports | Live | The Tax & MIS downloads tab is a catalog of 42 print-style reports (PDF + Excel each; Export to Tally is ZIP). |
| [F-REPORT-013](features/F-REPORT-013.md) | Tax & CA Report Catalog (Plus) | Live | 34 further catalog reports, available from the Plus plan: Grandfathering LTCG (Sec 112A); Demat Account-wise Holdings; M2M Report — Equity … |
| [F-REPORT-014](features/F-REPORT-014.md) | Accounting reports and Export to Tally (Pro/Advisor) | Live | Six catalog entries for the double-entry books: Trial Balance, Account Ledger — All Accounts, Profit & Loss Statement, Balance Sheet, Chart … |
| [F-REPORT-015](features/F-REPORT-015.md) | Inbox imports tab | Live | The review queue for attachments found by a Gmail scan. |
| [F-REPORT-016](features/F-REPORT-016.md) | Download Report dialog (on other pages) | Live | A Download button used on the dashboard and on many asset and liability pages (stocks, mutual funds, F&O, crypto, deposits, post office, … |
| [F-REPORT-017](features/F-REPORT-017.md) | Nightly stored-data integrity check | Live | Every night at 02:15 IST the app first retries failed imports and emails, then, for every portfolio of every active user, recomputes … |

### [Tax Planning](modules/tax-planning.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-TAX-001](features/F-TAX-001.md) | Tax page controls | Live | A card with Financial Year, Download reports for (when you can report on others) and a download button that depends on the tab, plus 10 … |
| [F-TAX-002](features/F-TAX-002.md) | Tax summary (estimated tax by section) | Live | Three cards — Total Realised Gain (FY), Estimated Tax Liability ("Excludes surcharge & cess") and Effective Rate (Tax / Realised Gain) — … |
| [F-TAX-003](features/F-TAX-003.md) | CA Tax Report (PDF) | Live | Downloads "CA-ready capital gains report" — "One PDF with tax summary, unrealised snapshot, harvesting opportunities, and full transaction … |
| [F-TAX-004](features/F-TAX-004.md) | Schedule 112A tab and ITR-portal CSV | Live | Lists the FY's long-term sales of listed equity and equity-oriented funds ("Schedule 112A · LTCG on listed equity / equity MF") with Asset, … |
| [F-TAX-005](features/F-TAX-005.md) | Schedule 112 tab | Live | "Schedule 112 · LTCG on other assets (with indexation)": long-term sales of non-equity assets with an Indexed Cost column. |
| [F-TAX-006](features/F-TAX-006.md) | STCG, LTCG and Intraday tabs | Live | Three lists for the FY: "Short-Term Capital Gains", "Long-Term Capital Gains" (with Indexed Cost) and "Intraday (Sec. |
| [F-TAX-007](features/F-TAX-007.md) | F&O (Sec. 43(5)) tab | Live | "F&O Schedule 43 / ITR-3 Schedule BP · FY …": Gross Profit, Gross Loss, Net P&L, Turnover (ICAI), Trades, an audit note, and a … |
| [F-TAX-008](features/F-TAX-008.md) | Dividend & Interest tab | Live | "Dividends ₹… · Interest ₹… · Maturity ₹… · Total ₹…" and a table Date, Type, Portfolio, Asset, Amount, Narration across all portfolios. |
| [F-TAX-009](features/F-TAX-009.md) | Tax Harvest tab | Live | Cards Total Unrealised Loss, STCG Loss Available (with "Realised STCG this FY"), LTCG Loss Available (with "Realised LTCG this FY") and a … |
| [F-TAX-010](features/F-TAX-010.md) | Grandfathering (112A FMV) tab | Live | For the FY's sales of equity bought on or before 31-Jan-2018: cards Rows requiring FMV, Gain without FMV, Gain with FMV ("Using Sec. |

### [Analytics](modules/analytics.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ANLYT-001](features/F-ANLYT-001.md) | Analytics page controls | Live | A portfolio selector (All portfolios (N) or one portfolio), period pills 1M, 3M, 6M, 1Y, 3Y, 5Y, All, and two views, Overview and Detail. |
| [F-ANLYT-002](features/F-ANLYT-002.md) | Headline numbers (KPI cards) | Live | Three cards: Current value ("You put in ₹…"), Profit if you sold today (₹ with sign and % of invested) and Annualised return (XIRR; hint … |
| [F-ANLYT-003](features/F-ANLYT-003.md) | Portfolio value over time | Live | A line chart: solid line = market value of your holdings, dashed line = amount invested in them, over the selected period. |
| [F-ANLYT-004](features/F-ANLYT-004.md) | AI Portfolio Insights | Live | A foldable panel AI Portfolio Insights. |
| [F-ANLYT-005](features/F-ANLYT-005.md) | Allocation and concentration | Live | Allocation by class — a pie of today's value by asset type. |
| [F-ANLYT-006](features/F-ANLYT-006.md) | Best and worst holdings | Live | One table of up to 5 biggest losers and 5 biggest gainers ranked by rupees, with Asset, Class, Value, Gain / loss and %. |
| [F-ANLYT-007](features/F-ANLYT-007.md) | Tax block: financial year and "What you'll owe" | Live | Under the heading Tax, a financial-year selector (labelled "FY 2026-27" etc.) and the card What you'll owe: the tax on gains booked so far … |
| [F-ANLYT-008](features/F-ANLYT-008.md) | Cut your tax bill (harvesting) | Live | For the current FY only: a sentence with the estimated saving ("Selling the holdings below at a loss before 31 March could reduce this … |
| [F-ANLYT-009](features/F-ANLYT-009.md) | Capital gains by FY and Income by month | Live | On Detail: Capital gains by FY — grouped bars Intraday, STCG, LTCG for the last 6 financial years; Income by month — stacked bars Dividend, … |
| [F-ANLYT-010](features/F-ANLYT-010.md) | Sector allocation and XIRR by asset class | Live | Sector allocation — pie of directly held stocks by sector (unknown = Unclassified; slices over 6% labelled). |
| [F-ANLYT-011](features/F-ANLYT-011.md) | Money in and out; What you own and owe | Live | Money in and out — monthly bars of cash coming back to you (sales, dividends, interest, maturities) against money you put in (buys, SIPs, … |
| [F-ANLYT-012](features/F-ANLYT-012.md) | Risk: swings, worst fall, return correlation | Live | Cards How much it swings (annualised volatility from month-to-month value changes) and Worst fall (largest peak-to-trough fall in the … |
| [F-ANLYT-013](features/F-ANLYT-013.md) | What-if: simulate a sale | Live | Pick a holding, a Sell qty and optionally a Sell price (opt.), click Simulate: shows Proceeds, the realised gain (labelled Realised STCG / … |

### [Portfolio Score](modules/portfolio-score.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-INTEL-001](features/F-INTEL-001.md) | Financial Health Score overview | Live | Shows a gauge with your overall score and grade, "Updated <date and time>", a Grade scale (A Excellent 85–100, B Good 70–84, C Fair 55–69, … |
| [F-INTEL-002](features/F-INTEL-002.md) | Score dimensions | Live | Six cards — Emergency Fund, Investment Rate, Debt Burden, Diversification, Insurance Coverage, Goal Progress — each with "Weight N%", its … |

### [Investment Advisor](modules/investment-advisor.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ADV-001](features/F-ADV-001.md) | Advisor page, plan lock and disclaimer | Live | Opens the Investment Advisor page (eyebrow "Intelligence"). |
| [F-ADV-002](features/F-ADV-002.md) | Risk questionnaire (take or retake) | Live | Seven questions that set your risk category and therefore the target allocation every recommendation is measured against. |
| [F-ADV-003](features/F-ADV-003.md) | Risk profile summary | Live | A card showing your current category (Conservative, Balanced, Growth or Aggressive) with its one-line description, a Score badge, three … |
| [F-ADV-004](features/F-ADV-004.md) | Allocation vs target (drift) | Live | The card Where you sit vs. |
| [F-ADV-005](features/F-ADV-005.md) | Refresh recommendations (advice engine run) | Live | Refresh recommendations runs six rules over your current data and updates your recommendation list. |
| [F-ADV-006](features/F-ADV-006.md) | Recommendation feed and status tabs | Live | The section Recommendations — What to do next lists your recommendations as cards (F-ADV-007), filtered by the tabs Open, Accepted, … |
| [F-ADV-007](features/F-ADV-007.md) | Recommendation card and actions | Live | Each card shows the category (for example "Tax Harvest", "Rebalance"), an urgency badge, the status if not Open, "Suggested <date>", where … |
| [F-ADV-008](features/F-ADV-008.md) | Why this — inputs and fund evidence | Live | Why this expands Inputs this was computed from: every figure the rule used, with readable labels (rupee values formatted as money, … |
| [F-ADV-009](features/F-ADV-009.md) | Explain in plain English (AI narration) | Live | Explain in plain English asks an AI model to rewrite the card's reasoning in 2–4 plain sentences, shown under In plain English with the … |
| [F-ADV-010](features/F-ADV-010.md) | Override list (approved products) | Live | The Override list card (marked "Optional") lets you name the exact funds or stocks the engine must use for a bucket. |
| [F-ADV-014](features/F-ADV-014.md) | Nightly fund scoring (house methodology) | Live | Each night the server scores mutual funds under the firm's ranking methodology. |

### [Professional workspace (Client books)](modules/professional-workspace-client-books.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CA-001](features/F-CA-001.md) | Client books entry and two-factor gate | Live | Adds Client books to the sidebar (next to Account Access) once you hold at least one client relationship, and guards /ca and … |
| [F-CA-002](features/F-CA-002.md) | Clients list | Live | The Clients page (eyebrow "Practice") lists the people whose books you keep in three groups: Your clients (active; each card shows name, … |
| [F-CA-003](features/F-CA-003.md) | Close an engagement | Live | Ends your access to one client's books from your side. |
| [F-CA-004](features/F-CA-004.md) | Invite a client (practice) | Live | A Pro/Advisor practice invites someone to share their books. |
| [F-CA-005](features/F-CA-005.md) | Accept a practice's invitation (account holder) | Live | The page Give your accountant access explains what accepting grants and lets you Accept or choose Not now. |
| [F-CA-006](features/F-CA-006.md) | Accept an account holder's invitation (professional) | Live | When an account holder invites their professional from Account Access, the emailed link opens a page — viewable before signing in — titled … |
| [F-CA-007](features/F-CA-007.md) | Client books header and live access changes | Live | At the top of /ca/clients/:id: All clients back link, the client's name and email, a badge (Keep the books / Make some changes / View … |
| [F-CA-008](features/F-CA-008.md) | Chart of accounts | Live | The Chart of accounts tab lists the client's ledger heads (Code, Account, Type). |
| [F-CA-009](features/F-CA-009.md) | Vouchers and receipts | Live | The Vouchers tab lists double-entry vouchers (No., Type, Date, Narration). |
| [F-CA-010](features/F-CA-010.md) | Generate from activity | Live | Derives vouchers from what the client recorded (trades, loan payments, rent, premiums). |
| [F-CA-011](features/F-CA-011.md) | Trial balance | Live | Shows every account's Opening, Debit, Credit and Balance, with a Total row and a badge "Debits and credits agree" or "Out of balance by ₹…". |
| [F-CA-012](features/F-CA-012.md) | Client transactions | Live | The Transactions tab lists the client's trades (Date, Asset, Type, Qty, Price, Net). |
| [F-CA-013](features/F-CA-013.md) | Import a statement for a client | Live | Import file uploads a statement, contract note or CAS into the client's books and parses it in the background ("File uploaded — parsing in … |
| [F-CA-014](features/F-CA-014.md) | Fair market value on 31 Jan 2018 | Live | The FMV (31 Jan 2018) tab lists per-scrip values used to grandfather long-term equity gains under Section 55(2)(ac) (ISIN, Scrip, Source — … |
| [F-CA-015](features/F-CA-015.md) | Client reports | Live | The Reports tab runs the app's report catalogue (D-CA-003) against the client's data. |
| [F-CA-016](features/F-CA-016.md) | Client documents | Live | The Documents tab lists files the client attached to properties, vehicles, policies and portfolios (name, owner type, category, size, date). |
| [F-CA-017](features/F-CA-017.md) | Client activity | Live | The Activity tab, Everything you have done here, is a day-grouped timeline of your changes to this client's books (and access events), each … |

### [Split Expenses](modules/split-expenses.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-SPLIT-001](features/F-SPLIT-001.md) | Split home | Live | The Split Expenses page shows two totals (You are owed, You owe), your Groups (name, number of people, currency and your balance), Friends … |
| [F-SPLIT-002](features/F-SPLIT-002.md) | Add a person | Live | Add a person saves someone you split with: Name, Email (optional), Phone (optional) ("Optional — used later to invite them."). |
| [F-SPLIT-003](features/F-SPLIT-003.md) | New group | Live | New group creates a group with Group name, Type (Trip, Home, Couple, Other), Currency and People (tick saved people, or + Add a person). |
| [F-SPLIT-004](features/F-SPLIT-004.md) | Group page and expense list | Live | A group page shows the name, people count and currency (or "Your 1:1 expenses"), Your balance, and four tabs: Expenses, Balances … |
| [F-SPLIT-005](features/F-SPLIT-005.md) | Add or edit an expense | Live | The Add expense / Edit expense dialog records Description, Amount, Currency (with "1 <ccy> in <group ccy>" exchange rate when different), … |
| [F-SPLIT-006](features/F-SPLIT-006.md) | Expense details, delete and restore | Live | The expense page shows the description, date and split mode ("Split equally", "Exact amounts", "By percent", "By shares"), the amount (and … |
| [F-SPLIT-007](features/F-SPLIT-007.md) | Receipt | Live | The Receipt card shows the attached image or an Open PDF link, with Add receipt / Replace and Remove ("Remove this receipt?"). |
| [F-SPLIT-008](features/F-SPLIT-008.md) | Labels | Live | Group-level labels (name + one of 7 colours) you can tick on an expense; New label creates one. |
| [F-SPLIT-009](features/F-SPLIT-009.md) | Comments | Live | A comment thread on each expense: author, time, text; Post adds one; your own comments have a delete button ("Delete this comment?"). |
| [F-SPLIT-010](features/F-SPLIT-010.md) | Add my share to Cash Activity | Live | A switch "Add my share (₹…) to Cash Activity" on each expense you are part of. |
| [F-SPLIT-011](features/F-SPLIT-011.md) | Balances and suggested payments | Live | The Balances tab lists each member's net ("you are owed / you owe" for you, "is owed / owes" for others) and then Suggested payments (when … |
| [F-SPLIT-012](features/F-SPLIT-012.md) | Settle up (record a payment) | Live | The Settle up dialog records money paid between two members: Paid by, Paid to, Amount (<currency>), Method (Cash, UPI, Other) and Date. |
| [F-SPLIT-013](features/F-SPLIT-013.md) | Pay via UPI | Live | Pay on a balance row opens Pay <name>: the amount, the payee's name and UPI ID, Open UPI app (a upi://pay link), Copy pay link and a QR … |
| [F-SPLIT-014](features/F-SPLIT-014.md) | Remind and share a pay link | Live | On a balance row where someone owes you: Remind emails them "Reminder: you owe <you> <amount>"; Share pay link opens your phone's share … |
| [F-SPLIT-015](features/F-SPLIT-015.md) | Group settings and members | Live | The group's Settings tab: Group name with Rename, Simplify debts (fewest payments to settle), "Currency: <ccy> (fixed once a group is … |
| [F-SPLIT-016](features/F-SPLIT-016.md) | Friend balances and 1:1 expenses | Live | A friend's page shows Overall (owes you / you owe, "≈" if converted), "Includes groups in other currencies, converted at the latest rate." … |
| [F-SPLIT-017](features/F-SPLIT-017.md) | Split settings | Live | Split settings has three cards: Payments (UPI ID, "Friends see this when they pay you"), Defaults (Home currency, Default portfolio), … |
| [F-SPLIT-018](features/F-SPLIT-018.md) | Activity and weekly email digests | Live | Sends two kinds of email: an activity digest "<N> updates in your shared expenses" about changes other people made in your groups, and a … |
| [F-SPLIT-019](features/F-SPLIT-019.md) | Linking people who join | Live | When someone signs up or signs in with an email that you saved on a person, that person is linked to their account: they see your shared … |

### [Family](modules/family.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-FAM-001](features/F-FAM-001.md) | Family page and family selector | Live | Lists every family you belong to and shows one of them at a time. |
| [F-FAM-002](features/F-FAM-002.md) | Create a family | Live | Creates a new family with a name and makes you its first Owner. |
| [F-FAM-003](features/F-FAM-003.md) | Family workspace header and seats | Live | Shows the selected family's name, description, the number of active members, your role, a seat-usage line, and the View this family across … |
| [F-FAM-004](features/F-FAM-004.md) | Family dashboard: household wealth | Live | On the Overview tab, shows the household's gross assets, liabilities and net of liabilities, a breakdown of "Who the household's wealth … |
| [F-FAM-005](features/F-FAM-005.md) | Family dashboard: needs attention | Live | A feed titled Needs attention listing open items across members: deposits maturing within 90 days, insurance premiums due within 30 days, … |
| [F-FAM-006](features/F-FAM-006.md) | Family dashboard: household goals | Live | Card "What the household is saving for": every goal of every member you may see, with owner, target, current value, shortfall, … |
| [F-FAM-007](features/F-FAM-007.md) | Family dashboard: protection and liabilities | Live | Card "Cover, gaps and what falls due": per member life cover, recommended cover, gap, health cover, annual premium, debt outstanding and … |
| [F-FAM-008](features/F-FAM-008.md) | Family tree | Live | On Members & sharing, draws the family as an indented tree: each person as a pill (crown icon for Owners, eye icon for Viewers), spouses … |
| [F-FAM-009](features/F-FAM-009.md) | Add a member directly (managed member) | Live | Adds a relative who has no email or login — a grandparent, a child — as a managed member: a real EveryPaisa profile that cannot sign in, … |
| [F-FAM-010](features/F-FAM-010.md) | Add several members at once | Live | Adds up to 25 managed members in one go. |
| [F-FAM-011](features/F-FAM-011.md) | Invite a member by email | Live | Creates an invitation for someone with an email address, then lets you read, edit and send the invitation email from the app, or copy the … |
| [F-FAM-012](features/F-FAM-012.md) | Pay for an extra family seat | Live | When adding one more person (by invitation or as a managed member) would exceed the family's included seats, the app explains what is using … |
| [F-FAM-013](features/F-FAM-013.md) | Pending invitations | Live | Lists invitations that have not been accepted and have not expired (email, role, expiry date) and lets owners cancel them. |
| [F-FAM-014](features/F-FAM-014.md) | Edit a member's role and visibility | Live | Changes a signed-in member's relation, role (What they can do) and the asset classes and non-portfolio categories they may see of the other … |
| [F-FAM-015](features/F-FAM-015.md) | Edit a managed member | Live | For a member with no login, changes how they are related (owners) and who keeps their books. |
| [F-FAM-016](features/F-FAM-016.md) | Hand a managed account to its owner | Live | Sends the person a managed profile belongs to an invitation to take it over: they set a password and the profile becomes their own account … |
| [F-FAM-017](features/F-FAM-017.md) | Remove a member | Live | Removes someone from the family. |
| [F-FAM-018](features/F-FAM-018.md) | Shared portfolios | Live | Lists the family's shared portfolios (name, currency, holdings, transactions) and lets owners and contributors create a new shared … |
| [F-FAM-019](features/F-FAM-019.md) | Accept a family invitation | Live | The page behind the invitation email's link. |
| [F-FAM-020](features/F-FAM-020.md) | Take over your account | Live | The page behind a hand-over email. |
| [F-FAM-021](features/F-FAM-021.md) | Family member page | Live | One member in full: net worth, gross assets, invested, unrealised P&L, liabilities, allocation chart ("What they own"), … |
| [F-FAM-022](features/F-FAM-022.md) | Switch view (family view across the app) | Live | The header menu Switch view lets you see the app as Personal view or as one of your families. |
| [F-FAM-023](features/F-FAM-023.md) | Sidebar family tree | Live | At the top of the sidebar, for users in at least one family: each family as a row (house icon) that opens /family, with a chevron that … |
| [F-FAM-024](features/F-FAM-024.md) | Managing a family member's account | Live | Lets the person who keeps a managed member's books switch the browser tab into that member's account to add their FDs, insurance and … |

### [Succession](modules/succession.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-SUCC-001](features/F-SUCC-001.md) | Succession status and controls | Live | Shows the plan's Status badge and a one-line next event, and offers the controls that fit the status: Turn on, Pause (with a date), Resume, … |
| [F-SUCC-002](features/F-SUCC-002.md) | When to share | Live | Sets what starts the countdown — If I'm inactive, On a date, or Whichever comes first — the inactivity period, the release date and an … |
| [F-SUCC-003](features/F-SUCC-003.md) | Succession test mode (admins) | Live | For administrators only, a checkbox Test mode: 1 minute (admins only) makes inactivity and every reminder stage last 1 minute, so nominees … |
| [F-SUCC-004](features/F-SUCC-004.md) | Nominees | Live | Lists up to 10 nominees (name, relationship, Verifier badge, email with confirmation state, what they can see, whether amounts are shown) … |
| [F-SUCC-005](features/F-SUCC-005.md) | Confirm it's you (step-up) | Live | Before any change to Succession, asks for a fresh code: your authenticator code (or a backup code) if two-factor sign-in is on, otherwise a … |
| [F-SUCC-006](features/F-SUCC-006.md) | Countdown, reminders and release | Live | Runs the plan automatically. |
| [F-SUCC-007](features/F-SUCC-007.md) | Email link actions: I'm OK, Confirm, Verifier answer | Live | Three no-login pages behind emailed links. |
| [F-SUCC-008](features/F-SUCC-008.md) | Nominee view of shared information | Live | After release, a nominee opens their link, receives a one-time code by email, and sees "<owner>'s financial information": the owner's … |

### [Will Maker](modules/will-maker.md)

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-WILL-001](features/F-WILL-001.md) | Will Maker overview | Live | Shows your will's status (Not created, Draft, Generated, Executed), the current draft or latest generated version with its actions, an … |
| [F-WILL-002](features/F-WILL-002.md) | Will history | Live | Card History listing every version (newest first) with its status badge and a line such as "Started … - generated … - signed … - replaced … |
| [F-WILL-003](features/F-WILL-003.md) | Will review reminders | Live | Two years after you sign (and every two years after a review), a banner "Time to review your will" appears on Will Maker and an alert "Time … |
| [F-WILL-004](features/F-WILL-004.md) | Will wizard: navigation and saving | Live | The frame around steps 2–8: a stepper (full row on wide screens, "Step N of 8" bar on narrow), Back and Next, a save status ("Saving...", … |
| [F-WILL-005](features/F-WILL-005.md) | Step 2: Your details | Live | Collects your identity and family situation: full legal name, how you are described ("Son of …"), date of birth, country whose law applies, … |
| [F-WILL-006](features/F-WILL-006.md) | Step 3: People & roles | Live | Builds the list of people and organisations in your will and assigns the executor, back-up executor, guardian and back-up guardian. |
| [F-WILL-007](features/F-WILL-007.md) | Step 4: Assets & liabilities | Live | Lists the assets and liabilities fetched from your EveryPaisa accounts with value, ownership (Sole, Joint, Nominee only, HUF) and your … |
| [F-WILL-008](features/F-WILL-008.md) | Step 5: Allocate | Live | Decides who gets what: By percentage (the residuary estate shared in percentages that must total 100%, shown in a donut chart), Specific … |
| [F-WILL-009](features/F-WILL-009.md) | Step 6: Instructions | Live | One optional text box, Additional instructions (optional), for wishes such as funeral arrangements or organ donation, "printed word for … |
| [F-WILL-010](features/F-WILL-010.md) | Step 7: Review | Live | A checklist of every rule with a tick, warning or cross and the message for each problem, a Fix button that jumps to the right step (and … |
| [F-WILL-011](features/F-WILL-011.md) | Step 8: Preview and generate the PDF | Live | Shows a summary and the full text of the will as it will print, asks you to tick the acknowledgement, and generates the PDF as a new … |
| [F-WILL-012](features/F-WILL-012.md) | Sign and store (step 9) | Live | Explains how to sign the will correctly, links to free legal help, and records the signing date and two witnesses with a scan or photo of … |
| [F-WILL-013](features/F-WILL-013.md) | Will documents after a plan lapse | Live | Below PLUS, Will Maker is locked but the card "Your will documents" still offers Download PDF and Download signed copy for your current … |

### Not described in the manual

Inventory entries with no manual section (mostly backend jobs or hidden pages); each has a short file. Details: [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md).

| ID | Feature | Module | Status |
|---|---|---|---|
| [F-AUTH-009](features/F-AUTH-009.md) | Sign out everywhere (API flag) | Sign-in & session | Backend-only |
| [F-SET-015](features/F-SET-015.md) | Per-user SMTP sending config | Settings | Backend-only |
| [F-CONN-006](features/F-CONN-006.md) | MCP server and OAuth endpoints for chatbots | Connections | Backend-only |
| [F-CONN-010](features/F-CONN-010.md) | Finfactor webhooks | Connections | Backend-only |
| [F-LEGAL-002](features/F-LEGAL-002.md) | Browser extension privacy policy | Legal pages | Hidden |
| [F-SHELL-011](features/F-SHELL-011.md) | Placeholder page | App layout and navigation | Hidden |
| [F-PORT-010](features/F-PORT-010.md) | Corporate actions API | Portfolios | Backend-only |
| [F-PORT-011](features/F-PORT-011.md) | Manual market-data sync endpoints | Portfolios | Backend-only |
| [F-IMPORT-011](features/F-IMPORT-011.md) | Ingestion failures page (dead-letter queue): list, filter, detail, retry, mark resolved | Import | Hidden |
| [F-IMPORT-012](features/F-IMPORT-012.md) | Market data & scoring failures card | Import | Hidden |
| [F-IMPORT-013](features/F-IMPORT-013.md) | Read one import job | Import | Backend-only |
| [F-INGEST-010](features/F-INGEST-010.md) | Edit or read one event before approval | Email ingestion | Backend-only |
| [F-INGEST-011](features/F-INGEST-011.md) | LLM spend gauge | Email ingestion | Hidden |
| [F-INGEST-012](features/F-INGEST-012.md) | Auto-discover senders after connecting (`?auto-discover=1`) | Email ingestion | Hidden |
| [F-MAIL-008](features/F-MAIL-008.md) | IMAP mailboxes (add, test, edit, delete, sync) — old Mailboxes page | Gmail | Hidden |
| [F-MAIL-009](features/F-MAIL-009.md) | Manual Gmail attachment sync endpoint | Gmail | Backend-only |
| [F-MAIL-010](features/F-MAIL-010.md) | Inbox scan cancel / resume and auto-approve rule management | Gmail | Backend-only |
| [F-MF-024](features/F-MF-024.md) | MF qualitative facts admin | Mutual Fund Analytics | Hidden |
| [F-MF-025](features/F-MF-025.md) | MF Central OTP sync | Mutual Funds | Hidden |
| [F-MF-026](features/F-MF-026.md) | CDSL CAS via CASParser OTP | Mutual Funds | Backend-only |
| [F-MF-027](features/F-MF-027.md) | CAS mailback job list and detail | Mutual Funds | Backend-only |
| [F-MF-028](features/F-MF-028.md) | Per-scheme reference reads (meta, metrics, score, peers, holdings) | Mutual Fund Analytics | Backend-only |
| [F-MF-029](features/F-MF-029.md) | Qualitative fact correction (PATCH) | Mutual Fund Analytics | Backend-only |
| [F-MF-030](features/F-MF-030.md) | Finvu holding by ISIN | Mutual Funds | Backend-only |
| [F-FNO-010](features/F-FNO-010.md) | F&O portfolio settings endpoint (auto-approve expiry close, default equity tax treatment) | Futures & Options | Backend-only |
| [F-FNO-011](features/F-FNO-011.md) | Option chain and margin snapshot endpoints | Futures & Options | Backend-only |
| [F-FNO-012](features/F-FNO-012.md) | Underlying Activity panel (per-underlying drill-down) | Futures & Options | Hidden |
| [F-ASSET-001](features/F-ASSET-001.md) | Manual price/universe sync and lookup endpoints under /api/assets (sync-all, sync-prices, sync-universe, sync-corp-actions, sync-commodities, sync-crypto, sync-fx, amfi/refresh-holdings, quote, stocks/:id/price, commodities/latest, fx/latest) | Asset classes (common) | Backend-only |
| [F-ASSET-002](features/F-ASSET-002.md) | Gold holding side sheet component | Gold & Silver | Hidden |
| [F-LOAN-014](features/F-LOAN-014.md) | Reveal full loan account number (audited, 5/min) | Loans | Backend-only |
| [F-LOAN-015](features/F-LOAN-015.md) | Compute EMI utility endpoint | Loans | Backend-only |
| [F-VEH-017](features/F-VEH-017.md) | Linked insurance policies on a vehicle | Vehicles | Hidden |
| [F-VEH-018](features/F-VEH-018.md) | Vehicle fields with no form input (model, fuel, owner, purchase date/price, current value, permit expiry) | Vehicles | Backend-only |
| [F-VEH-019](features/F-VEH-019.md) | Parivahan portal OTP adapter (headed browser) | Vehicles | Hidden |
| [F-REST-014](features/F-REST-014.md) | Real estate summary endpoint | Real Estate | Backend-only |
| [F-RENT-020](features/F-RENT-020.md) | Edit tenancy terms, end or delete a tenancy | Rental | Backend-only |
| [F-RENT-021](features/F-RENT-021.md) | Landlord name and payment instructions (per property / per account) | Rental | Backend-only |
| [F-RENT-022](features/F-RENT-022.md) | Receipt list, expense list, manual overdue flip, ledger entry edit | Rental | Backend-only |
| [F-INS-024](features/F-INS-024.md) | Account Aggregator insurance views (Finvu card, life/general/statement views) | Insurance | Hidden |
| [F-INS-025](features/F-INS-025.md) | Insurance endpoints and fields without a screen (alerts trigger; status, health-cover details, vehicle, portfolio via API) | Insurance | Backend-only |
| [F-PF-011](features/F-PF-011.md) | PF endpoints without a screen (UAN lookup, forget credentials, extension-facing routes) | PPF & EPF | Backend-only |
| [F-FX-009](features/F-FX-009.md) | Forex endpoints without a screen (TCS create/delete, account reveal, currencies, FY filters) | Forex | Backend-only |
| [F-GOAL-004](features/F-GOAL-004.md) | Read one goal endpoint | Goals | Backend-only |
| [F-INC-004](features/F-INC-004.md) | Read one income entry endpoint | Income | Backend-only |
| [F-ACCT-014](features/F-ACCT-014.md) | Accounting endpoints without a screen (edit account, get/edit voucher, suggest voucher) | Accounting | Backend-only |
| [F-REPORT-018](features/F-REPORT-018.md) | Report endpoints with no UI in scope (rebuild capital gains; JSON grandfathering / demat / M2M; provident-fund statement and FY bundle used only by the CA workspace) | Reports | Backend-only |
| [F-TAX-011](features/F-TAX-011.md) | Tax endpoints with no UI caller (Schedule 112A CSV honouring subject; list FMV overrides) | Tax Planning | Backend-only |
| [F-ANLYT-014](features/F-ANLYT-014.md) | Benchmark series endpoint (NIFTY 50 + Sensex rebased to 100) with no UI caller | Analytics | Backend-only |
| [F-ADV-011](features/F-ADV-011.md) | Reorder override list | Advisor | Backend-only |
| [F-ADV-012](features/F-ADV-012.md) | List model portfolios / edit target weights | Advisor | Backend-only |
| [F-ADV-013](features/F-ADV-013.md) | Engine run history | Advisor | Backend-only |
| [F-CA-018](features/F-CA-018.md) | Managed (shadow) client records without a login | Professional workspace | Deprecated |
| [F-CA-019](features/F-CA-019.md) | Ledger, P&L, balance sheet, voucher detail/edit API | Professional workspace | Backend-only |
| [F-SPLIT-020](features/F-SPLIT-020.md) | Contact edit/delete, settlement edit, group type change, deleted-expense listing | Split Expenses | Backend-only |
| [F-FAM-025](features/F-FAM-025.md) | Rename / re-describe a family | Family | Backend-only |
| [F-FAM-026](features/F-FAM-026.md) | Leave a family | Family | Backend-only |
| [F-FAM-027](features/F-FAM-027.md) | Unshare a portfolio from a family | Family | Backend-only |

## Settings

### [Sign-in & session](settings/sign-in-session.md)

| ID | Setting | Default |
|---|---|---|
| [S-AUTH-001](settings/sign-in-session.md#s-auth-001) | Remember me on this device | Ticked, unless this browser last stored "not remembered" (source: … |

### [Settings](settings/settings.md)

| ID | Setting | Default |
|---|---|---|
| [S-SET-001](settings/settings.md#s-set-001) | Two-factor sign-in | Off (no secret stored) — packages/api/src/services/auth/twoFactor.service.ts:74 |
| [S-SET-003](settings/settings.md#s-set-003) | Gmail connection for email notifications | Not connected |
| [S-SET-002](settings/settings.md#s-set-002) | Tell me when I could save by refinancing a loan, and when the repo rate or my lender's MCLR changes | On (packages/api/prisma/schema.prisma:176) |
| [S-SET-004](settings/settings.md#s-set-004) | What they can do | All four permissions off — view only (packages/api/prisma/schema.prisma:520) |
| [S-SET-005](settings/settings.md#s-set-005) | Portfolios | All ("All, including ones you add later") — packages/api/prisma/schema.prisma:525 |
| [S-SET-006](settings/settings.md#s-set-006) | Categories | All ("Loans, cards, property, insurance and the rest") — … |
| [S-SET-007](settings/settings.md#s-set-007) | Asset classes | All ("Every asset class") — packages/api/prisma/schema.prisma:526 |
| [S-SET-008](settings/settings.md#s-set-008) | When (From / Until) | Blank — no start and no end ("No end date") — packages/api/prisma/schema.prisma:508 |
| [S-SET-009](settings/settings.md#s-set-009) | Rate override (Set rate) | No override; users see the rate read from the bank page |

### [Connections](settings/connections.md)

| ID | Setting | Default |
|---|---|---|
| [S-CONN-001](settings/connections.md#s-conn-001) | Choose what <chatbot> can read | On: Investments, Retirement, Banking and cards, Loans, Insurance, Property, Vehicles, … |
| [S-CONN-002](settings/connections.md#s-conn-002) | Whose data | Nobody ticked; a reconnect keeps whoever was shared before and is still shareable … |
| [S-CONN-003](settings/connections.md#s-conn-003) | Allow family to include me in their AI connectors | Off (packages/api/prisma/schema.prisma:58) |
| [S-CONN-004](settings/connections.md#s-conn-004) | Broker setup fields | Not configured |

### [Plans & billing](settings/plans-billing.md)

| ID | Setting | Default |
|---|---|---|
| [S-PLAN-001](settings/plans-billing.md#s-plan-001) | Monthly / Annual | Monthly (apps/web/src/pages/pricing/PricingPage.tsx:97) |

### [App layout and navigation](settings/app-layout-and-navigation.md)

| ID | Setting | Default |
|---|---|---|
| [S-SHELL-001](settings/app-layout-and-navigation.md#s-shell-001) | Collapse sidebar | Expanded (source: apps/web/src/components/layout/Sidebar.tsx:13 — only the stored value … |
| [S-SHELL-002](settings/app-layout-and-navigation.md#s-shell-002) | Planning group open | Open (source: apps/web/src/components/layout/PlanningNavGroup.tsx:19) |
| [S-SHELL-003](settings/app-layout-and-navigation.md#s-shell-003) | By value / My order | By value (source: apps/web/src/hooks/useSidebarClassValues.ts:54) |
| [S-SHELL-004](settings/app-layout-and-navigation.md#s-shell-004) | Asset class order and visibility | Bank Accounts, Stocks, F & O, Mutual Funds, FDs & RDs, Gold & Silver, PPF & EPF, Real … |
| [S-SHELL-005](settings/app-layout-and-navigation.md#s-shell-005) | Theme | Dark (source: apps/web/src/stores/theme.store.ts:18) |
| [S-SHELL-006](settings/app-layout-and-navigation.md#s-shell-006) | Hide values | Off (source: apps/web/src/stores/privacy.store.ts:13) |

### [AI Assistant](settings/ai-assistant.md)

| ID | Setting | Default |
|---|---|---|
| [S-AI-001](settings/ai-assistant.md#s-ai-001) | Assistant big window | Docked (source: apps/web/src/components/ai/AIAssistant.tsx:84) |
| [S-AI-002](settings/ai-assistant.md#s-ai-002) | Assistant teaser dismissed | Not dismissed (source: apps/web/src/components/ai/AssistantButton.tsx:50) |
| [S-AI-003](settings/ai-assistant.md#s-ai-003) | AI-use notice accepted | Not accepted (source: packages/api/src/ai/aiDisclosure.ts:32) |

### [Dashboard](settings/dashboard.md)

| ID | Setting | Default |
|---|---|---|
| [S-DASH-001](settings/dashboard.md#s-dash-001) | Dashboard portfolio picker | All portfolios (N) (source: apps/web/src/pages/dashboard/DashboardPage.tsx:305) |
| [S-DASH-002](settings/dashboard.md#s-dash-002) | Net worth eye | Hidden (source: apps/web/src/pages/dashboard/DashboardPage.tsx:314) |
| [S-DASH-003](settings/dashboard.md#s-dash-003) | Portfolio chart period | 1Y (365 days) (source: apps/web/src/pages/dashboard/DashboardPage.tsx:306) |
| [S-DASH-004](settings/dashboard.md#s-dash-004) | Net worth trend period | 1Y (source: apps/web/src/components/dashboard/NetWorthTrendChart.tsx:30) |
| [S-DASH-005](settings/dashboard.md#s-dash-005) | Alerts strip folded | Unfolded (source: apps/web/src/pages/dashboard/DashboardPage.tsx:322) |
| [S-DASH-006](settings/dashboard.md#s-dash-006) | Upgrade banner dismissed | Shown on Free (source: apps/web/src/components/dashboard/UpgradeBanner.tsx:19) |
| [S-DASH-007](settings/dashboard.md#s-dash-007) | Dashboard export options | Scope All portfolios combined, Format PDF, Appearance = current app theme, Report for = … |

### [Portfolios](settings/portfolios.md)

| ID | Setting | Default |
|---|---|---|
| [S-PORT-001](settings/portfolios.md#s-port-001) | Portfolio type | Investment (source: apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:28, server … |
| [S-PORT-002](settings/portfolios.md#s-port-002) | Portfolio currency | INR (source: apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:29) |
| [S-PORT-003](settings/portfolios.md#s-port-003) | Set as default portfolio | Off (source: apps/web/src/pages/portfolios/PortfolioFormDialog.tsx:31) |
| [S-PORT-004](settings/portfolios.md#s-port-004) | XIRR sort | Off (source: apps/web/src/pages/portfolios/PortfolioDetailPage.tsx:73) |

### [Transactions](settings/transactions.md)

| ID | Setting | Default |
|---|---|---|
| [S-TXN-001](settings/transactions.md#s-txn-001) | Transactions portfolio filter | All portfolios (source: apps/web/src/pages/transactions/TransactionsPage.tsx:18) |

### [Bank Accounts](settings/bank-accounts.md)

| ID | Setting | Default |
|---|---|---|
| [S-BANK-001](settings/bank-accounts.md#s-bank-001) | Account type | Savings (source: apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:76) |
| [S-BANK-002](settings/bank-accounts.md#s-bank-002) | Account status | Active (source: packages/api/src/services/banking/bankAccounts.service.ts:192) |

### [Alerts & Reminders](settings/alerts-reminders.md)

| ID | Setting | Default |
|---|---|---|
| [S-ALERT-001](settings/alerts-reminders.md#s-alert-001) | Alert lens | All (source: apps/web/src/pages/alerts/AlertsPage.tsx:323) |
| [S-ALERT-002](settings/alerts-reminders.md#s-alert-002) | Alert type filter | All types (source: apps/web/src/pages/alerts/AlertsPage.tsx:322) |

### [Import](settings/import.md)

| ID | Setting | Default |
|---|---|---|
| [S-IMPORT-001](settings/import.md#s-import-001) | Target portfolio (optional) | Default / first portfolio (empty value) (source: … |
| [S-IMPORT-002](settings/import.md#s-import-002) | Remember this password for future locked files | on (source: apps/web/src/components/upload/PasswordPromptDialog.tsx:42); server default … |

### [Email ingestion](settings/email-ingestion.md)

| ID | Setting | Default |
|---|---|---|
| [S-INGEST-001](settings/email-ingestion.md#s-ingest-001) | Active / Paused (Pause polling / Resume polling) | on (Active) — schema default; … |
| [S-INGEST-002](settings/email-ingestion.md#s-ingest-002) | Auto-commit | on for every new sender (source: … |
| [S-INGEST-003](settings/email-ingestion.md#s-ingest-003) | Auto-commit after N confirmed events | 5 (source: apps/web/src/pages/ingestion/SendersPage.tsx:23, … |
| [S-INGEST-004](settings/email-ingestion.md#s-ingest-004) | Display label (optional) | Empty; server fills the institution seed label only when the value is missing (null) |

### [Gmail connection and inbox scans](settings/gmail-connection-and-inbox-scans.md)

| ID | Setting | Default |
|---|---|---|
| [S-MAIL-001](settings/gmail-connection-and-inbox-scans.md#s-mail-001) | Dismiss (Gmail auto-connect banner) | Not dismissed |
| [S-MAIL-002](settings/gmail-connection-and-inbox-scans.md#s-mail-002) | Scan from / Scan until | From 5 years ago to today (source: apps/web/src/pages/mailboxes/GmailScanSetupPage.tsx:31) |

### [Mutual Funds](settings/mutual-funds.md)

| ID | Setting | Default |
|---|---|---|
| [S-MF-001](settings/mutual-funds.md#s-mf-001) | Period | All to Date (source: apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:66) |
| [S-MF-002](settings/mutual-funds.md#s-mf-002) | Portfolio | Default (source: apps/web/src/pages/mutualFunds/MFCasparserDialog.tsx:207) |
| [S-MF-003](settings/mutual-funds.md#s-mf-003) | Nickname | empty |
| [S-MF-004](settings/mutual-funds.md#s-mf-004) | Period | All to Date (source: apps/web/src/pages/mutualFunds/MFCasMailbackDialog.tsx:75) |
| [S-MF-005](settings/mutual-funds.md#s-mf-005) | Portfolio | Default — server uses your default portfolio, else your first (source: … |
| [S-MF-006](settings/mutual-funds.md#s-mf-006) | Nickname | empty |
| [S-MF-007](settings/mutual-funds.md#s-mf-007) | Unique identifier | The Finfactor sandbox sample identifier (source: … |
| [S-MF-008](settings/mutual-funds.md#s-mf-008) | Destination portfolio | + New "Finvu Imports" portfolio (auto-create) (source: … |
| [S-MF-009](settings/mutual-funds.md#s-mf-009) | Statement filter chips | All (source: apps/web/src/pages/mutualFunds/finvu/StatementView.tsx:34) |
| [S-MF-010](settings/mutual-funds.md#s-mf-010) | Overview / Detailed calculations | Overview (source: apps/web/src/pages/mf/FundDetailPage.tsx:56) |
| [S-MF-011](settings/mutual-funds.md#s-mf-011) | Horizon tabs (1Y, 3Y, 5Y, 7Y, 10Y) | The shortest horizon with metrics; 3Y if none (source: … |

### [Gold & Silver](settings/gold-silver.md)

| ID | Setting | Default |
|---|---|---|
| [S-GOLD-001](settings/gold-silver.md#s-gold-001) | Gold purity | 24 (24K · 999) — first option (source: apps/web/src/lib/metalPurity.ts:32, … |
| [S-GOLD-002](settings/gold-silver.md#s-gold-002) | Silver purity | 999 (999 Fine) — first option (source: apps/web/src/lib/metalPurity.ts:39) |

### [Futures & Options](settings/futures-options.md)

| ID | Setting | Default |
|---|---|---|
| [S-FNO-001](settings/futures-options.md#s-fno-001) | Auto-approve expiry close | false (source: packages/api/prisma/schema.prisma:2863) |
| [S-FNO-002](settings/futures-options.md#s-fno-002) | Default equity tax treatment | CAPITAL_GAINS (source: packages/api/prisma/schema.prisma:622) |

### [Loans](settings/loans.md)

| ID | Setting | Default |
|---|---|---|
| [S-LOAN-001](settings/loans.md#s-loan-001) | Loan type | Home in the add form (source: apps/web/src/pages/loans/LoanListPage.tsx:338); the server … |
| [S-LOAN-002](settings/loans.md#s-loan-002) | Prepayment option | Reduce tenure (form: apps/web/src/pages/loans/LoanListPage.tsx:347; server fallback … |
| [S-LOAN-003](settings/loans.md#s-loan-003) | Rate type | Not sure (form: apps/web/src/pages/loans/LoanRateFields.tsx:24; DB default UNKNOWN: … |
| [S-LOAN-004](settings/loans.md#s-loan-004) | Linked to | Not set (source: apps/web/src/pages/loans/LoanRateFields.tsx:90) |
| [S-LOAN-005](settings/loans.md#s-loan-005) | Next rate reset (optional) | Empty (source: apps/web/src/pages/loans/LoanRateFields.tsx:25) |
| [S-LOAN-006](settings/loans.md#s-loan-006) | Tax benefit section | None (source: apps/web/src/pages/loans/LoanListPage.tsx:348) |
| [S-LOAN-007](settings/loans.md#s-loan-007) | Status | Active (form apps/web/src/pages/loans/LoanListPage.tsx:349; server … |
| [S-LOAN-008](settings/loans.md#s-loan-008) | Portfolio | None (source: apps/web/src/pages/loans/LoanListPage.tsx:350) |
| [S-LOAN-009](settings/loans.md#s-loan-009) | Switching costs (Processing fee (%) and Other charges (₹)) | 0.5% and ₹10,000 (source: packages/shared/src/loans/loanChecks.ts:55) |
| [S-LOAN-010](settings/loans.md#s-loan-010) | How will it be repaid? | Whenever (form apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:66; DB default … |

### [EMI Calculator](settings/emi-calculator.md)

| ID | Setting | Default |
|---|---|---|
| [S-EMI-001](settings/emi-calculator.md#s-emi-001) | Calculate mode (EMI / Max loan / Tenure) | EMI (source: apps/web/src/pages/emi/emiState.ts:56) |
| [S-EMI-002](settings/emi-calculator.md#s-emi-002) | Tenure unit (Years / Months) | Years (source: apps/web/src/pages/emi/emiState.ts:56) |
| [S-EMI-003](settings/emi-calculator.md#s-emi-003) | Prepayment Repeat | Once (source: apps/web/src/pages/emi/AdvancedInputs.tsx:40) |
| [S-EMI-004](settings/emi-calculator.md#s-emi-004) | Prepayment Effect | Cut tenure (source: apps/web/src/pages/emi/AdvancedInputs.tsx:40) |
| [S-EMI-005](settings/emi-calculator.md#s-emi-005) | Rate change: Bank adjusts | Tenure (keep EMI) (source: apps/web/src/pages/emi/AdvancedInputs.tsx:57) |
| [S-EMI-006](settings/emi-calculator.md#s-emi-006) | Processing fee and charges | Off (source: apps/web/src/pages/emi/emiState.ts:59) |
| [S-EMI-007](settings/emi-calculator.md#s-emi-007) | Fee type | % of loan (source: apps/web/src/pages/emi/emiState.ts:59) |
| [S-EMI-008](settings/emi-calculator.md#s-emi-008) | Tax benefit | Off (source: apps/web/src/pages/emi/emiState.ts:60) |
| [S-EMI-009](settings/emi-calculator.md#s-emi-009) | Tax regime | Old regime (source: apps/web/src/pages/emi/emiState.ts:60) |
| [S-EMI-010](settings/emi-calculator.md#s-emi-010) | Loan for | Home - self-occupied (source: apps/web/src/pages/emi/emiState.ts:60); set automatically … |
| [S-EMI-011](settings/emi-calculator.md#s-emi-011) | Loan type (Live rates) | Home (source: apps/web/src/pages/emi/LiveRatesTab.tsx:46) |

### [Credit Cards](settings/credit-cards.md)

| ID | Setting | Default |
|---|---|---|
| [S-CARD-001](settings/credit-cards.md#s-card-001) | Status (card) | Active (form apps/web/src/pages/creditCards/CreditCardListPage.tsx:288; server … |
| [S-CARD-002](settings/credit-cards.md#s-card-002) | Network | — select — (none); filled from the catalogue when a catalogue card is picked |
| [S-CARD-003](settings/credit-cards.md#s-card-003) | Statement day | 1 (source: apps/web/src/pages/creditCards/CreditCardListPage.tsx:284) |
| [S-CARD-004](settings/credit-cards.md#s-card-004) | Due day | 20 (source: apps/web/src/pages/creditCards/CreditCardListPage.tsx:285) |

### [Vehicles](settings/vehicles.md)

| ID | Setting | Default |
|---|---|---|
| [S-VEH-001](settings/vehicles.md#s-veh-001) | Individual / Family | individual (source: apps/web/src/pages/vehicles/VehicleListPage.tsx:36) |
| [S-VEH-002](settings/vehicles.md#s-veh-002) | State | State code from the first vehicle's RTO (list) or this vehicle's RTO (detail); MH if none … |
| [S-VEH-003](settings/vehicles.md#s-veh-003) | Transaction | SELL (I want to sell) (source: apps/web/src/pages/vehicles/VehicleValuePage.tsx:67) |
| [S-VEH-004](settings/vehicles.md#s-veh-004) | Counterparty | INDIVIDUAL (source: apps/web/src/pages/vehicles/VehicleValuePage.tsx:68) |
| [S-VEH-005](settings/vehicles.md#s-veh-005) | Condition sliders | All Good (source: apps/web/src/pages/vehicles/VehicleValuePage.tsx:72) |
| [S-VEH-006](settings/vehicles.md#s-veh-006) | Portfolio (vehicle) | None (source: packages/api/src/services/vehicles/vehicles.service.ts:151) |

### [Real Estate](settings/real-estate.md)

| ID | Setting | Default |
|---|---|---|
| [S-REST-001](settings/real-estate.md#s-rest-001) | Grid / Map (Real Estate) | grid (source: apps/web/src/components/property/useListView.ts:9) |
| [S-REST-002](settings/real-estate.md#s-rest-002) | Status | SELF_OCCUPIED (sources: apps/web/src/pages/realEstate/PropertyFormDialog.tsx:71, … |
| [S-REST-003](settings/real-estate.md#s-rest-003) | Portfolio (property) | None |
| [S-REST-004](settings/real-estate.md#s-rest-004) | Tax due month | None ("—") |
| [S-REST-005](settings/real-estate.md#s-rest-005) | Hand-placed pin | Off — pin comes from the address lookup |

### [Rental](settings/rental.md)

| ID | Setting | Default |
|---|---|---|
| [S-RENT-001](settings/rental.md#s-rent-001) | Grid / Map (Rental) | grid (source: apps/web/src/components/property/useListView.ts:9) |
| [S-RENT-002](settings/rental.md#s-rent-002) | Rent credited to | "Not tracked" (null) |
| [S-RENT-004](settings/rental.md#s-rent-004) | Due day of month | 1 (sources: apps/web/src/pages/rental/RentalDetailPage.tsx:639, … |
| [S-RENT-003](settings/rental.md#s-rent-003) | Send via Email / SMS | Both on (source: apps/web/src/pages/rental/RentalRemindersPanel.tsx:526); a chip is off … |
| [S-RENT-005](settings/rental.md#s-rent-005) | Apply to month | "Settle oldest first" (blank) |

### [Insurance](settings/insurance.md)

| ID | Setting | Default |
|---|---|---|
| [S-INS-001](settings/insurance.md#s-ins-001) | Type | Term life (source: apps/web/src/components/insurance/PolicyFormDialog.tsx:52) |
| [S-INS-002](settings/insurance.md#s-ins-002) | Paid (premium frequency) | Yearly (source: apps/web/src/components/insurance/PolicyFormDialog.tsx:57) |
| [S-INS-003](settings/insurance.md#s-ins-003) | Next premium due | Blank → today on the server (source: … |
| [S-INS-004](settings/insurance.md#s-ins-004) | Grace period (days) | Blank = usual: 30 days (life/health, non-monthly), 15 days (monthly), none otherwise … |
| [S-INS-005](settings/insurance.md#s-ins-005) | Critical illness cover | Not recorded (source: apps/web/src/components/insurance/PolicyFormDialog.tsx:62) |
| [S-INS-006](settings/insurance.md#s-ins-006) | Find my insurance documents in Gmail (Turn on / Turn off) | Off (source: packages/api/src/services/insurance/insuranceGmailFetch.service.ts:4) |
| [S-INS-007](settings/insurance.md#s-ins-007) | Remember it (encrypted) for future PDFs | On (source: apps/web/src/components/insurance/InsuranceDocumentsCard.tsx:59) |
| [S-INS-008](settings/insurance.md#s-ins-008) | Who the policy covers | Not set (source: apps/web/src/components/insurance/TaxSummaryCard.tsx:298) |
| [S-INS-009](settings/insurance.md#s-ins-009) | Senior citizen (60+) | Unticked (source: apps/web/src/components/insurance/TaxSummaryCard.tsx:305) |
| [S-INS-010](settings/insurance.md#s-ins-010) | Tax summary open state and financial year | Folded; current financial year (source: … |
| [S-INS-011](settings/insurance.md#s-ins-011) | Coverage assumptions | Seeded from your data: income × 12, expenses × 12, support 20 years, loans, … |
| [S-INS-012](settings/insurance.md#s-ins-012) | Under 18 | Unticked (source: apps/web/src/components/insurance/NomineesCard.tsx:163) |

### [PPF & EPF](settings/ppf-epf.md)

| ID | Setting | Default |
|---|---|---|
| [S-PF-001](settings/ppf-epf.md#s-pf-001) | Entry Type (EPF) | Contribution (monthly) (source: apps/web/src/pages/assetClasses/EPFFormDialog.tsx:154) |
| [S-PF-002](settings/ppf-epf.md#s-pf-002) | Entry Type (PPF) | Annual / partial deposit (source: … |
| [S-PF-003](settings/ppf-epf.md#s-pf-003) | Save credentials (encrypted) | Off (source: apps/web/src/pages/pf/PfRefreshDialog.tsx:36) |
| [S-PF-004](settings/ppf-epf.md#s-pf-004) | Snooze 30d | Not snoozed (source: packages/api/prisma/schema.prisma:3464) |
| [S-PF-005](settings/ppf-epf.md#s-pf-005) | Account type and bank (Link PF Account) | EPF; PPF bank SBI (source: apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:261) |

### [Forex](settings/forex.md)

| ID | Setting | Default |
|---|---|---|
| [S-FX-001](settings/forex.md#s-fx-001) | Currency (balance) | USD (source: apps/web/src/pages/forex/ForexCashTab.tsx:263) |
| [S-FX-002](settings/forex.md#s-fx-002) | Purpose (LRS) | INVESTMENT (source: apps/web/src/pages/forex/LrsTab.tsx:291) |
| [S-FX-003](settings/forex.md#s-fx-003) | Currency (remittance) | USD (same line as S-FX-002) |

### [Goals](settings/goals.md)

| ID | Setting | Default |
|---|---|---|
| [S-GOAL-001](settings/goals.md#s-goal-001) | Category | Custom (source: apps/web/src/pages/goals/GoalDialog.tsx:79) |
| [S-GOAL-002](settings/goals.md#s-goal-002) | Priority | Medium (source: apps/web/src/pages/goals/GoalDialog.tsx:80) |
| [S-GOAL-003](settings/goals.md#s-goal-003) | Status | Active (source: apps/web/src/pages/goals/GoalDialog.tsx:81) |
| [S-GOAL-004](settings/goals.md#s-goal-004) | Inflation rate (decimal) | 0.06 (source: apps/web/src/pages/goals/GoalDialog.tsx:84) |
| [S-GOAL-005](settings/goals.md#s-goal-005) | Expected return (decimal) | 0.12 (source: apps/web/src/pages/goals/GoalDialog.tsx:85) |
| [S-GOAL-006](settings/goals.md#s-goal-006) | Linked portfolios | None (source: apps/web/src/pages/goals/GoalDialog.tsx:89) |

### [Income](settings/income.md)

| ID | Setting | Default |
|---|---|---|
| [S-INC-001](settings/income.md#s-inc-001) | Income type | Salary (source: apps/web/src/pages/income/IncomeDialog.tsx:33) |
| [S-INC-002](settings/income.md#s-inc-002) | Currently active | On (source: apps/web/src/pages/income/IncomeDialog.tsx:37) |

### [Cash Activity](settings/cash-activity.md)

| ID | Setting | Default |
|---|---|---|
| [S-CASH-001](settings/cash-activity.md#s-cash-001) | Direction tab (All / Inflows / Outflows) | All (source: apps/web/src/pages/cashflows/CashFlowsPage.tsx:17) |

### [Accounting](settings/accounting.md)

| ID | Setting | Default |
|---|---|---|
| [S-ACCT-001](settings/accounting.md#s-acct-001) | Type (account) | ASSET (source: apps/web/src/pages/accounting/AccountingPage.tsx:93) |
| [S-ACCT-002](settings/accounting.md#s-acct-002) | Parent Account | None (top-level), or the row's account when added with + (source: … |
| [S-ACCT-003](settings/accounting.md#s-acct-003) | Opening Balance (₹) | 0 (source: apps/web/src/pages/accounting/AccountingPage.tsx:93) |
| [S-ACCT-004](settings/accounting.md#s-acct-004) | Voucher type | JOURNAL (source: apps/web/src/pages/accounting/AccountingPage.tsx:218) |
| [S-ACCT-005](settings/accounting.md#s-acct-005) | Voucher type filter | All types (source: apps/web/src/pages/accounting/AccountingPage.tsx:431) |

### [Reports](settings/reports.md)

| ID | Setting | Default |
|---|---|---|
| [S-REPORT-001](settings/reports.md#s-report-001) | Portfolio | All portfolios (all) (source: apps/web/src/pages/reports/ReportsPage.tsx:197) |
| [S-REPORT-002](settings/reports.md#s-report-002) | Report for | Me (self) (source: apps/web/src/components/reports/useReportSubject.ts:102) |
| [S-REPORT-003](settings/reports.md#s-report-003) | Financial Year (Reports) | Current Indian FY (source: apps/web/src/pages/reports/ReportsPage.tsx:198) |
| [S-REPORT-004](settings/reports.md#s-report-004) | Financial year (Tax & MIS) | The page's FY when the tab opens (source: … |
| [S-REPORT-005](settings/reports.md#s-report-005) | As-of date | Today (source: apps/web/src/pages/reports/TaxMisDownloads.tsx:532) |
| [S-REPORT-006](settings/reports.md#s-report-006) | From | Empty (report's default range) (source: … |
| [S-REPORT-007](settings/reports.md#s-report-007) | To | Today (source: apps/web/src/pages/reports/TaxMisDownloads.tsx:534) |
| [S-REPORT-011](settings/reports.md#s-report-011) | Report theme | The app's current theme (source: apps/web/src/lib/reportTheme.ts:13) |
| [S-REPORT-008](settings/reports.md#s-report-008) | Status filter | Pending review (source: apps/web/src/pages/reports/InboxImportsTab.tsx:28) |
| [S-REPORT-009](settings/reports.md#s-report-009) | Sender filter | All senders (source: apps/web/src/pages/reports/InboxImportsTab.tsx:29) |
| [S-REPORT-010](settings/reports.md#s-report-010) | Doc type filter | All doc types (source: apps/web/src/pages/reports/InboxImportsTab.tsx:30) |

### [Tax Planning](settings/tax-planning.md)

| ID | Setting | Default |
|---|---|---|
| [S-TAX-001](settings/tax-planning.md#s-tax-001) | Financial Year (Tax) | Latest FY with activity, else current FY (source: apps/web/src/pages/tax/TaxPage.tsx:146) |
| [S-TAX-002](settings/tax-planning.md#s-tax-002) | Download reports for | Me |
| [S-TAX-003](settings/tax-planning.md#s-tax-003) | FMV / unit override | Seed value where one exists, else empty ("Enter FMV") |

### [Analytics](settings/analytics.md)

| ID | Setting | Default |
|---|---|---|
| [S-ANLYT-001](settings/analytics.md#s-anlyt-001) | Portfolio (Analytics) | All portfolios (N) (source: apps/web/src/pages/analytics/AnalyticsPage.tsx:50) |
| [S-ANLYT-002](settings/analytics.md#s-anlyt-002) | Period | 1Y (source: apps/web/src/pages/analytics/AnalyticsPage.tsx:51) |
| [S-ANLYT-003](settings/analytics.md#s-anlyt-003) | View | Overview (source: apps/web/src/pages/analytics/AnalyticsPage.tsx:57) |
| [S-ANLYT-004](settings/analytics.md#s-anlyt-004) | Tax financial year (Analytics) | Current FY (source: apps/web/src/pages/analytics/AnalyticsPage.tsx:55) |
| [S-ANLYT-005](settings/analytics.md#s-anlyt-005) | AI Insights panel folded | Open (source: apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:136) |

### [Investment Advisor](settings/investment-advisor.md)

| ID | Setting | Default |
|---|---|---|
| [S-ADV-001](settings/investment-advisor.md#s-adv-001) | Age | Blank; on a retake the last answer (apps/web/src/pages/advisor/RiskQuestionnaire.tsx:159) |
| [S-ADV-002](settings/investment-advisor.md#s-adv-002) | Investment horizon | None (must choose) |
| [S-ADV-003](settings/investment-advisor.md#s-adv-003) | Drawdown reaction | None |
| [S-ADV-004](settings/investment-advisor.md#s-adv-004) | Investable share of income | None |
| [S-ADV-005](settings/investment-advisor.md#s-adv-005) | Objective | None |
| [S-ADV-006](settings/investment-advisor.md#s-adv-006) | Emergency fund | None |
| [S-ADV-007](settings/investment-advisor.md#s-adv-007) | Tax slab | None |
| [S-ADV-008](settings/investment-advisor.md#s-adv-008) | Recommendation status tab | Open (apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:33) |
| [S-ADV-009](settings/investment-advisor.md#s-adv-009) | Bucket (override list) | Equity — Domestic (first bucket) (apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:34) |

### [Professional workspace (Client books)](settings/professional-workspace-client-books.md)

| ID | Setting | Default |
|---|---|---|
| [S-CA-001](settings/professional-workspace-client-books.md#s-ca-001) | Account type | Asset (apps/web/src/components/ca/AccountFormDialog.tsx:45) |
| [S-CA-002](settings/professional-workspace-client-books.md#s-ca-002) | Voucher type | Journal (apps/web/src/components/ca/VoucherFormDialog.tsx:51) |
| [S-CA-003](settings/professional-workspace-client-books.md#s-ca-003) | Transaction type and asset class | Buy / Equity (apps/web/src/components/ca/AddTransactionDialog.tsx:41) |
| [S-CA-004](settings/professional-workspace-client-books.md#s-ca-004) | Report period filters | Current FY (April–March); As-of and To = today; From blank … |

### [Split Expenses](settings/split-expenses.md)

| ID | Setting | Default |
|---|---|---|
| [S-SPLIT-001](settings/split-expenses.md#s-split-001) | Group type | Trip in the dialog; Other on the server when omitted … |
| [S-SPLIT-002](settings/split-expenses.md#s-split-002) | Group currency | INR (packages/api/prisma/schema.prisma:5247) |
| [S-SPLIT-003](settings/split-expenses.md#s-split-003) | Simplify debts | On (packages/api/prisma/schema.prisma:5248) |
| [S-SPLIT-004](settings/split-expenses.md#s-split-004) | Archive group | Not archived |
| [S-SPLIT-005](settings/split-expenses.md#s-split-005) | Split mode | Equally |
| [S-SPLIT-006](settings/split-expenses.md#s-split-006) | Expense currency and exchange rate | Group currency; rate blank = latest stored rate |
| [S-SPLIT-007](settings/split-expenses.md#s-split-007) | UPI ID | Empty (packages/api/src/services/split/settings.service.ts:12) |
| [S-SPLIT-008](settings/split-expenses.md#s-split-008) | Home currency | INR (packages/api/prisma/schema.prisma:5435) |
| [S-SPLIT-009](settings/split-expenses.md#s-split-009) | Default portfolio | None |
| [S-SPLIT-010](settings/split-expenses.md#s-split-010) | Email about activity | On (packages/api/prisma/schema.prisma:5441) |
| [S-SPLIT-011](settings/split-expenses.md#s-split-011) | Weekly balance summary | Off (packages/api/prisma/schema.prisma:5442) |
| [S-SPLIT-012](settings/split-expenses.md#s-split-012) | Add my share to Cash Activity | Off |
| [S-SPLIT-013](settings/split-expenses.md#s-split-013) | Payment method | Cash (apps/web/src/pages/split/SettleUpDialog.tsx:96); Pay via UPI records UPI |

### [Family](settings/family.md)

| ID | Setting | Default |
|---|---|---|
| [S-FAM-001](settings/family.md#s-fam-001) | Their place in the family | CONTRIBUTOR (source: apps/web/src/pages/family/FamilyPage.tsx:971; server default … |
| [S-FAM-002](settings/family.md#s-fam-002) | Who keeps their books | You (apps/web/src/pages/family/FamilyPage.tsx:968); server default caller … |
| [S-FAM-009](settings/family.md#s-fam-009) | Related to / As their | Related to: you, or the person whose card opened the dialog; relation: none … |
| [S-FAM-003](settings/family.md#s-fam-003) | What they can do | CONTRIBUTOR (apps/web/src/pages/family/FamilyPage.tsx:1409; server … |
| [S-FAM-004](settings/family.md#s-fam-004) | Asset classes (visibility) | Empty list (apps/web/src/pages/family/FamilyPage.tsx:1412; schema … |
| [S-FAM-005](settings/family.md#s-fam-005) | Non-portfolio categories (visibility) | Empty list (packages/api/prisma/schema.prisma:3812) |
| [S-FAM-006](settings/family.md#s-fam-006) | Viewing as family | null = Personal view (apps/web/src/stores/familyScope.store.ts:26) |
| [S-FAM-007](settings/family.md#s-fam-007) | Managing (acting as) | null (your own account) (apps/web/src/stores/actingAs.store.ts:31) |
| [S-FAM-008](settings/family.md#s-fam-008) | Sidebar family expansion | All expanded until first toggle (apps/web/src/components/layout/FamilyNavTree.tsx:58) |

### [Succession](settings/succession.md)

| ID | Setting | Default |
|---|---|---|
| [S-SUCC-001](settings/succession.md#s-succ-001) | Trigger | INACTIVITY (apps/web/src/pages/legacy/LegacyPage.tsx:43) |
| [S-SUCC-002](settings/succession.md#s-succ-002) | Inactive for (days) | 90 (packages/shared/src/legacy.ts:12) |
| [S-SUCC-003](settings/succession.md#s-succ-003) | Release date | Empty |
| [S-SUCC-004](settings/succession.md#s-succ-004) | Personal letter | Empty |
| [S-SUCC-005](settings/succession.md#s-succ-005) | Test mode: 1 minute (admins only) | Off (packages/api/src/schemas/legacy.schemas.ts:14) |
| [S-SUCC-006](settings/succession.md#s-succ-006) | Pause until | Empty |
| [S-SUCC-007](settings/succession.md#s-succ-007) | What they can see | Insurance + Bank accounts (apps/web/src/pages/legacy/NomineeDialog.tsx:13) |
| [S-SUCC-008](settings/succession.md#s-succ-008) | Show amounts | Off (apps/web/src/pages/legacy/NomineeDialog.tsx:13) |
| [S-SUCC-009](settings/succession.md#s-succ-009) | Verifier | Off |
| [S-SUCC-010](settings/succession.md#s-succ-010) | Priority | 1 |
| [S-SUCC-011](settings/succession.md#s-succ-011) | Documents to share | None |

### [Will Maker](settings/will-maker.md)

| ID | Setting | Default |
|---|---|---|
| [S-WILL-001](settings/will-maker.md#s-will-001) | Country whose law applies | India (apps/web/src/pages/will/steps/DetailsStep.tsx:57) |
| [S-WILL-002](settings/will-maker.md#s-will-002) | Religion / personal law | Not chosen |
| [S-WILL-006](settings/will-maker.md#s-will-006) | If they die before you, their gifts go to | "Shared among the others (default)" |
| [S-WILL-004](settings/will-maker.md#s-will-004) | Ownership | From the data; Joint sets 50%, others 100% |
| [S-WILL-005](settings/will-maker.md#s-will-005) | Include / Exclude | Fetched items start as Needs review; manual items Confirmed |
| [S-WILL-003](settings/will-maker.md#s-will-003) | How long must someone outlive you to inherit? | 30 days (packages/shared/src/will/schema.ts:131) |

## Workflows

| ID | Workflow | Module |
|---|---|---|
| [W-AUTH-001](workflows/W-AUTH-001.md) | Create an account and finish setup | Sign-in & session |
| [W-AUTH-002](workflows/W-AUTH-002.md) | Sign in with two-factor | Sign-in & session |
| [W-AUTH-003](workflows/W-AUTH-003.md) | Reset a forgotten password | Sign-in & session |
| [W-SET-001](workflows/W-SET-001.md) | Turn on two-factor sign-in | Settings |
| [W-SET-002](workflows/W-SET-002.md) | Delete your account, and restore it | Settings |
| [W-SET-003](workflows/W-SET-003.md) | Invite your CA or advisor | Settings |
| [W-CONN-001](workflows/W-CONN-001.md) | Connect ChatGPT or Claude | Connections |
| [W-PLAN-001](workflows/W-PLAN-001.md) | Upgrade your plan | Plans & billing |
| [W-CONN-002](workflows/W-CONN-002.md) | Connect a broker (Zerodha) | Connections |
| [W-ONB-001](workflows/W-ONB-001.md) | First-run setup on a second device | First-run setup |
| [W-SHELL-001](workflows/W-SHELL-001.md) | Set up your sidebar | App layout and navigation |
| [W-DASH-001](workflows/W-DASH-001.md) | Check your net worth on the Dashboard | Dashboard |
| [W-PORT-001](workflows/W-PORT-001.md) | Create a portfolio and group it with another | Portfolios |
| [W-TXN-001](workflows/W-TXN-001.md) | Record a trade and clean up a duplicate | Transactions |
| [W-BANK-001](workflows/W-BANK-001.md) | Add a bank account and share its details | Bank Accounts |
| [W-ALERT-001](workflows/W-ALERT-001.md) | Work through your alerts | Alerts & Reminders |
| [W-AI-001](workflows/W-AI-001.md) | Ask the AI Assistant your first question | AI Assistant |
| [W-IMPORT-001](workflows/W-IMPORT-001.md) | Import a contract note or statement file | Import |
| [W-IMPORT-002](workflows/W-IMPORT-002.md) | Unlock a password-protected statement | Import |
| [W-IMPORT-003](workflows/W-IMPORT-003.md) | Recover a failed or partial import | Import |
| [W-INGEST-001](workflows/W-INGEST-001.md) | Set up email ingestion | Email ingestion |
| [W-INGEST-002](workflows/W-INGEST-002.md) | Review and approve email events | Email ingestion |
| [W-MAIL-001](workflows/W-MAIL-001.md) | Connect Gmail and back-fill with an inbox scan | Gmail connection and inbox scans |
| [W-CAS-001](workflows/W-CAS-001.md) | Request a CAS and get it imported | CAS |
| [W-DOCS-001](workflows/W-DOCS-001.md) | Sort documents into folders | Documents |
| [W-DOCS-002](workflows/W-DOCS-002.md) | Fix a document that needs attention | Documents |
| [W-MF-001](workflows/W-MF-001.md) | Import your mutual fund history from a CAS PDF | Mutual Funds |
| [W-MF-002](workflows/W-MF-002.md) | Request a CAS from CAMS and KFintech | Mutual Funds |
| [W-MF-003](workflows/W-MF-003.md) | Request a CAS through CASParser | Mutual Funds |
| [W-MF-004](workflows/W-MF-004.md) | Review your mutual fund portfolio analysis | Mutual Funds |
| [W-MF-005](workflows/W-MF-005.md) | Research a fund and refresh findings | Mutual Funds |
| [W-MF-006](workflows/W-MF-006.md) | Import mutual funds from Finvu (operator sandbox) | Mutual Funds |
| [W-STOCK-001](workflows/W-STOCK-001.md) | Record a stock purchase and check it | Stocks |
| [W-FD-001](workflows/W-FD-001.md) | Add a fixed deposit and follow it to maturity | FDs & RDs |
| [W-FD-002](workflows/W-FD-002.md) | Run a recurring deposit installment by installment | FDs & RDs |
| [W-GOLD-001](workflows/W-GOLD-001.md) | Record gold jewellery with photos | Gold & Silver |
| [W-CRYPTO-001](workflows/W-CRYPTO-001.md) | Add a coin with live pricing | Crypto |
| [W-PO-001](workflows/W-PO-001.md) | Record a Post Office scheme | Post Office |
| [W-FNO-001](workflows/W-FNO-001.md) | Connect Zerodha and sync today's F&O trades | Futures & Options |
| [W-FNO-002](workflows/W-FNO-002.md) | Close an F&O position at expiry | Futures & Options |
| [W-LOAN-001](workflows/W-LOAN-001.md) | Add a home loan and keep it up to date | Loans |
| [W-LOAN-002](workflows/W-LOAN-002.md) | Record a prepayment or close a loan early | Loans |
| [W-LOAN-003](workflows/W-LOAN-003.md) | Check whether refinancing pays off | Loans |
| [W-LOAN-004](workflows/W-LOAN-004.md) | Record money you lent and track repayments | Loans |
| [W-LOAN-005](workflows/W-LOAN-005.md) | Track a loan given on monthly EMIs | Loans |
| [W-EMI-001](workflows/W-EMI-001.md) | Plan a loan with prepayments and export the schedule | EMI Calculator |
| [W-EMI-002](workflows/W-EMI-002.md) | Compare offers starting from live rates | EMI Calculator |
| [W-CARD-001](workflows/W-CARD-001.md) | Add a credit card and follow a statement to payment | Credit Cards |
| [W-CARD-002](workflows/W-CARD-002.md) | Look up a saved card number | Credit Cards |
| [W-VEH-001](workflows/W-VEH-001.md) | Add a vehicle with CarInfo verification | Vehicles |
| [W-VEH-002](workflows/W-VEH-002.md) | Add or update a vehicle from the VAHAN SMS | Vehicles |
| [W-VEH-003](workflows/W-VEH-003.md) | Check a vehicle's challans | Vehicles |
| [W-VEH-004](workflows/W-VEH-004.md) | Value a vehicle and save it | Vehicles |
| [W-REST-001](workflows/W-REST-001.md) | Add a property and keep its value current | Real Estate |
| [W-REST-002](workflows/W-REST-002.md) | Sell a property and see the capital gain | Real Estate |
| [W-REST-003](workflows/W-REST-003.md) | Turn an owned property into a rental | Real Estate |
| [W-RENT-001](workflows/W-RENT-001.md) | Set up a rental property and tenancy | Rental |
| [W-RENT-002](workflows/W-RENT-002.md) | Record rent and fix mistakes | Rental |
| [W-RENT-003](workflows/W-RENT-003.md) | Send rent reminders | Rental |
| [W-RENT-004](workflows/W-RENT-004.md) | Share a tenant statement | Rental |
| [W-INS-001](workflows/W-INS-001.md) | Add a policy and stay on top of its premiums | Insurance |
| [W-INS-002](workflows/W-INS-002.md) | Make and track a claim | Insurance |
| [W-INS-003](workflows/W-INS-003.md) | Bring in policies from Gmail | Insurance |
| [W-PF-001](workflows/W-PF-001.md) | Track EPF by hand | PPF & EPF |
| [W-PF-002](workflows/W-PF-002.md) | Fetch the EPF passbook from EPFO | PPF & EPF |
| [W-FX-001](workflows/W-FX-001.md) | Record an LRS remittance | Forex |
| [W-GOAL-001](workflows/W-GOAL-001.md) | Set a financial goal | Goals |
| [W-INC-001](workflows/W-INC-001.md) | Record your income | Income |
| [W-CASH-001](workflows/W-CASH-001.md) | Read cash activity and the forecast | Cash Activity |
| [W-ACCT-001](workflows/W-ACCT-001.md) | Set up books and read statements | Accounting |
| [W-ACCT-002](workflows/W-ACCT-002.md) | Export to Tally | Accounting |
| [W-REPORT-001](workflows/W-REPORT-001.md) | Check your data before trusting a report | Reports |
| [W-REPORT-002](workflows/W-REPORT-002.md) | Download your capital gains for the income-tax return | Reports |
| [W-REPORT-003](workflows/W-REPORT-003.md) | Download a report for a family member or the whole household | Reports |
| [W-TAX-001](workflows/W-TAX-001.md) | Enter grandfathering FMV and download Schedule 112A | Tax Planning |
| [W-TAX-002](workflows/W-TAX-002.md) | Plan tax-loss harvesting before 31 March | Tax Planning |
| [W-ANLYT-001](workflows/W-ANLYT-001.md) | Generate AI portfolio insights | Analytics |
| [W-INTEL-001](workflows/W-INTEL-001.md) | Raise your Financial Health Score | Portfolio Score |
| [W-ADV-001](workflows/W-ADV-001.md) | Get your first investment recommendations | Investment Advisor |
| [W-ADV-002](workflows/W-ADV-002.md) | Act on a recommendation | Investment Advisor |
| [W-ADV-003](workflows/W-ADV-003.md) | Make the Advisor use a specific fund | Investment Advisor |
| [W-CA-001](workflows/W-CA-001.md) | Accept a client's invitation and open their books (professional) | Professional workspace (Client books) |
| [W-CA-002](workflows/W-CA-002.md) | Onboard a client of your own (practice) | Professional workspace (Client books) |
| [W-CA-003](workflows/W-CA-003.md) | Keep a client's books and correct a trade | Professional workspace (Client books) |
| [W-CA-004](workflows/W-CA-004.md) | Download a client's year-end pack | Professional workspace (Client books) |
| [W-SPLIT-001](workflows/W-SPLIT-001.md) | Share a trip's costs and settle up | Split Expenses |
| [W-SPLIT-002](workflows/W-SPLIT-002.md) | Ask a friend to pay you back | Split Expenses |
| [W-SPLIT-003](workflows/W-SPLIT-003.md) | Track your share of shared bills in Cash Activity | Split Expenses |
| [W-FAM-001](workflows/W-FAM-001.md) | Set up a family and keep a grandparent's books | Family |
| [W-FAM-002](workflows/W-FAM-002.md) | Invite a relative by email and have them join | Family |
| [W-FAM-003](workflows/W-FAM-003.md) | Hand a managed account to its owner | Family |
| [W-SUCC-001](workflows/W-SUCC-001.md) | Turn on Succession | Succession |
| [W-SUCC-002](workflows/W-SUCC-002.md) | Stop or complete a Succession countdown | Succession |
| [W-SUCC-003](workflows/W-SUCC-003.md) | A nominee opens the shared information | Succession |
| [W-WILL-001](workflows/W-WILL-001.md) | Write and generate a will | Will Maker |
| [W-WILL-002](workflows/W-WILL-002.md) | Sign, store and review a will | Will Maker |

## Roles

| ID | Role |
|---|---|
| [R-VISITOR](roles.md#r-visitor) | Signed-out visitor |
| [R-FREE](roles.md#r-free) | Free user |
| [R-PLUS](roles.md#r-plus) | Plus subscriber |
| [R-FAMILY](roles.md#r-family) | Family subscriber |
| [R-PRO](roles.md#r-pro) | Pro/Advisor subscriber |
| [R-ADMIN](roles.md#r-admin) | Administrator |
| [R-FAMOWNER](roles.md#r-famowner) | Family owner |
| [R-FAMCONTRIB](roles.md#r-famcontrib) | Family contributor |
| [R-FAMVIEWER](roles.md#r-famviewer) | Family viewer |
| [R-MANAGER](roles.md#r-manager) | Managing a family member's account |
| [R-PROF](roles.md#r-prof) | Professional acting for a client |
| [R-AICONN](roles.md#r-aiconn) | AI chatbot connection |
| [R-NOMINEE](roles.md#r-nominee) | Succession nominee |
