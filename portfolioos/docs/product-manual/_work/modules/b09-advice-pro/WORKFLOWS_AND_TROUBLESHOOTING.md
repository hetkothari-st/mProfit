# Workflows and Troubleshooting — Advisor, Professional workspace, Split Expenses (B09)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Investment Advisor, Professional workspace, Split Expenses

<!-- BEGIN WORKFLOWS -->
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
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| "This feature requires the PLUS plan or higher" on Advisor | Advisor needs Plus; an expired paid plan counts as Free | Renew or upgrade on **Pricing** |
| Professional workspace shows **Two-factor sign-in required** | Two-factor is off, or this session started without a code | Turn on two-factor in **Settings**, then sign out and in with the code |
| "Switch back to your own account to do this." in Client books or on an invitation link | You are managing a family member's account | **Back to my account**, then retry |
| A client's change to your access appears late | Pages poll every 5 s (sidebar 30 s) | Wait a few seconds or switch back to the tab |
| Split pages show "Couldn't load …" with **Retry** | A request failed | Click **Retry**; Split error messages are shown without their internal code prefix |
| A Split group page says "This group doesn't exist or you're no longer in it." | You left or were removed, or the link is wrong | Ask a member to add you back |
<!-- END TROUBLESHOOTING -->
