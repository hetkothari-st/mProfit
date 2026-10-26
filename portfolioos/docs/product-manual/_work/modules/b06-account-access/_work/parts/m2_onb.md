## First-run setup

A full-screen wizard (no sidebar) that new accounts see right after signing up: three short welcome panels, a picker of what you own, a quick form per item, and a summary. Every step can be skipped, and everything you add is saved through the same records the full pages use, so it can be refined later.

### Welcome panels <!-- F-ONB-001 -->
**What it does:** Shows three panels before asking for anything: a greeting, what the app does, and what happens to your data.

**Why it exists:** The code comment: "somebody deciding whether to trust a stranger with their net worth has the answer before they are asked for a single number", while "Somebody who wants to get on with entering their fixed deposits can be past all of it in one tap".

**Where to find it:** Route `/onboarding`, reached automatically after sign-up (F-AUTH-002/F-AUTH-003) or when you sign in with setup unfinished in this browser.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Not available while managing a family member's account (R-MANAGER): you are sent to **Portfolios** instead.

**Steps**
1. Panel 1 ("Welcome"): "Let's get your books in order, <first name>." with one randomly chosen line (for example "You cannot compound what you cannot count."). Click **Continue**.
2. Panel 2 ("What you get"): "Built for everything you actually own" with six points — All of it, in one place; Returns you can defend; Your statements do the typing; The whole household; Nothing lapses quietly; Ready for the return. Click **Continue**.
3. Panel 3 ("Privacy"): "Your money is your business" with five commitments and the footer "We are moving to keeping your ledger on your own device. Until that ships, this is exactly what happens to it." Click **Set up my account**.
4. **Skip** on any panel jumps straight to the picker.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Continue** | Button | Next panel | Panels 1–2 |
| **Set up my account** | Button | Ends the panels | Panel 3 |
| **Skip** | Link | Ends the panels | — |
| Three dots | Indicator | Shows which panel you are on | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is saved by the panels themselves; the starter portfolio (F-ONB-002) is created in the background while you read.

**Errors and troubleshooting:** None.

**Limitations:** The privacy panel shows the "hosted" wording. A "data stays on your device" version exists in code but is switched off until that storage model ships.

**How it works:** The panel copy comes from fixed lists in the web app. The privacy copy is chosen by a single constant `STORAGE_MODE`, currently `hosted`.

**Related features:** F-ONB-002, F-ONB-003.

**Sources:** `apps/web/src/pages/onboarding/WelcomePanels.tsx:26`, `apps/web/src/pages/onboarding/WelcomePanels.tsx:43`, `apps/web/src/pages/onboarding/welcomeContent.ts:29`, `apps/web/src/pages/onboarding/welcomeContent.ts:67`, `apps/web/src/lib/privacyPromise.ts:31`, `apps/web/src/lib/privacyPromise.ts:45`, `apps/web/src/components/family/NotWhileManaging.tsx:15`, `apps/web/src/App.tsx:147`

### Starter portfolio created automatically <!-- F-ONB-002 -->
**What it does:** Creates a portfolio called "My Portfolio" (type Investment) for you as soon as the wizard opens, so the things you add have somewhere to go. If you already have a portfolio, it reuses your oldest one instead of creating another.

**Why it exists:** The code comment: "Every holding needs a portfolio, so one is created up front instead of asking the user to name it."

**Where to find it:** Not applicable — automatic when `/onboarding` opens.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — automatic. If it fails you see the error and **Try again**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Try again** | Button | Retries creating the portfolio | Shown only after a failure |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** A "My Portfolio" portfolio exists (or your oldest portfolio is used).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not set up your account" (or the server's message) with **Try again** | The create call failed | **Try again** |

**Limitations:** None.

**How it works:** POST `/api/portfolios` with `onboarding: true`. The server skips the plan's portfolio cap for this call and, inside a transaction, returns your oldest portfolio if one exists. The result is cached for the session so it is never posted twice.

**Related features:** F-ONB-004.

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:50`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:104`, `packages/api/src/controllers/portfolio.controller.ts:55`, `packages/api/src/services/holdings/portfolio.service.ts:311`

### "What do you have?" picker <!-- F-ONB-003 -->
**What it does:** Lets you tick the kinds of things you own so the wizard asks only about those.

**Why it exists:** The page text: "Pick everything that applies. You'll add each one with just a few details — rough numbers are fine."

**Where to find it:** `/onboarding`, after the welcome panels.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read "What do you have?".
2. Tick any of: **Savings & investments** — Mutual funds, Stocks, Fixed deposits, PPF / EPF / NPS; **Physical assets** — Gold, Vehicles; **Loans & cards** — Loans, Credit cards; **Protection** — Insurance.
3. Click **Continue**, or **Skip — I'll add things later** to finish without adding anything.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Nine item buttons | Toggle buttons | Select/deselect (a tick shows when selected) | — |
| **Continue** | Button | Starts the quick-add steps, in the order shown on screen | Disabled until at least one item is ticked |
| **Skip — I'll add things later** | Link | Finishes setup (F-ONB-005) | — |

**Fields and rules:** Not applicable — selections only.

**Settings and toggles here:** None.

**Results:** Your selection decides the quick-add steps; it is not saved.

**Errors and troubleshooting:** None.

**Limitations:** Property is deliberately not offered. The code note says the dashboard's net worth reads rental properties only, so a Real Estate entry made here would not show up there. Bank accounts, crypto, bonds and other classes are also not offered.

**How it works:** Steps follow the on-screen order, not the order you tapped.

**Related features:** F-ONB-004, F-ONB-005.

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:114`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:157`, `apps/web/src/pages/onboarding/onboardingItems.ts:19`, `apps/web/src/pages/onboarding/onboardingItems.ts:41`

### Quick-add forms (9 kinds) <!-- F-ONB-004 -->
**What it does:** For each ticked item, shows a short form; each **Add** saves one real record and lists it above the form so you can add another straight away.

**Why it exists:** The code comment: each form "asks for the least a new user is likely to know off-hand, fills every other required field with a sensible estimate, and saves through the same API the full forms use".

**Where to find it:** `/onboarding`, one step per ticked item, with "N of M" and a progress bar.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read the step's prompt (for example "Add each fund with roughly how much you have invested.").
2. Fill the fields and click **Add**. The saved line appears with a tick.
3. Add more, or click **Next** (or **Finish** on the last step). Without any added entry the button says **Skip**.
4. **Back** goes to the previous step, or to the picker from the first step.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add** | Button | Saves one entry | Disabled while saving |
| **Next** / **Finish** / **Skip** | Button | Moves on | — |
| **Back** | Link | Previous step | — |
| Search boxes (fund, stock), institution pickers (bank, lender, issuer, insurer) | Search/select | Pick the item | — |

**Fields and rules**
| Form | Fields (exact labels) | What gets saved |
|---|---|---|
| Mutual funds | **Fund** (search), **Amount invested** | A BUY dated today; units = amount ÷ today's NAV, rounded down to 4 decimals; price = NAV |
| Stocks | **Stock** (search), **Shares**, **Avg buy price (₹)** | A BUY dated today at that price (exchange from the search hit, else NSE) |
| Fixed deposits | **Bank**, **Amount (₹)**, **Matures on**, **Interest rate % (optional)** | A deposit named "<bank> FD" dated today with maturity date and rate |
| PPF / EPF / NPS | **Account** (PPF, EPF (Provident Fund), NPS), **Current balance (₹)** | An opening balance dated today |
| Gold | **Purity** (24K, 22K, 18K), **Grams**, **Total paid (₹)** | A BUY of "<purity> Gold"; price per gram = total ÷ grams |
| Vehicles | **Registration no.**, **Vehicle (optional)**, **Current value (₹)** ("Roughly what it would sell for today.") | A vehicle with a manual current value |
| Loans | **Lender**, **Type** (Home, Car, Personal, Education, Gold, Business, Other), **Still owed (₹)**, **EMI (₹)**, **Rate %** | A loan starting today for the amount still owed, first EMI next month on the same day (capped at the 28th); tenure computed from balance, EMI and rate, between 1 and 600 months; prepayment option "reduce tenure" |
| Credit cards | **Issuer**, **Last 4 digits**, **Credit limit (₹)**, **Amount due now (₹)** | A card named "<issuer> Credit Card", statement day today (max 28), due 20 days later; if an amount is due, a statement for this month |
| Insurance | **Type** (Term life, Health, Endowment / LIC, ULIP, Motor, Home, Personal accident), **Insurer**, **Policy number**, **Cover amount (₹)**, **Yearly premium (₹)** | A policy holder = your name, annual premium, start date today |

Amounts accept commas, spaces and ₹ and must be greater than 0: "Enter <what> as a number greater than 0". Other exact messages: "Pick a fund first", "Pick a stock first", "We don't have prices for this fund yet. Try another, or skip and upload your CAS later.", "This fund's latest price is unavailable. Try another fund.", "Enter the bank name", "Pick the maturity date", "Enter the interest rate as a number, e.g. 7.1", "Enter the registration number, e.g. MH01AB1234" (fewer than 5 characters), "Enter the lender", "Enter the interest rate as a number, e.g. 8.5", "That EMI is too low to ever repay this balance at this rate — check the numbers.", "Enter the card issuer", "Enter the last 4 digits of the card", "Enter the amount due as a number", "Enter the insurer", "Enter the policy number". A server failure shows its message or "Could not save this entry".

**Settings and toggles here:** None.

**Results:** Real records appear on the matching pages (Mutual Funds, Stocks, FDs & RDs, PPF & EPF / NPS, Gold & Silver, Vehicles, Loans, Credit Cards, Insurance) and feed the dashboard.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Any validation message above, under the form | Missing or invalid input | Correct and **Add** again |
| A plan or duplicate message from the server | The full feature's server rules apply | Follow the message, or skip and add later from the full page |

**Limitations:** Every entry is an estimate dated today: mutual funds are valued at today's NAV for the amount you entered (a later CAS upload replaces it with real history), loans are recorded as a fresh loan starting today, and card cycle days are guesses to be corrected on the card's page. Vehicles are saved without a portfolio; every other entry goes into the starter portfolio.

**How it works:** Each form calls the regular API for that record type (transactions, vehicles, loans, credit cards plus statement, insurance policies). The loan tenure uses the amortisation formula n = −ln(1 − B·r/EMI) / ln(1 + r) with r = rate ÷ 1200, rounded up; with a 0% rate, n = B ÷ EMI rounded up.

**Related features:** F-ONB-002, F-ONB-005.

**Sources:** `apps/web/src/pages/onboarding/QuickAddForms.tsx:84`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:131`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:170`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:183`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:236`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:300`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:366`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:423`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:471`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:530`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:576`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:650`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:736`

### Finish, skip and resume setup <!-- F-ONB-005 -->
**What it does:** Ends the wizard with a summary and sends you to the dashboard; remembers in this browser if you left setup unfinished so you are brought back to it.

**Why it exists:** The code comment: "an account that started setup and walked away should resume it".

**Where to find it:** The last screen of `/onboarding`, and **Skip — I'll add things later** on the picker.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. After the last step: "You're all set" with "N entries added. Your dashboard is ready — you can refine any of them from its own page." and a count per item — or "Nothing added yet" with "No problem — you can add investments any time from the sidebar."
2. Click **Go to dashboard**, or **Go back and add more** to return to the last step.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Go to dashboard** | Button | Finishes setup | — |
| **Go back and add more** | Link | Back to the last step | Hidden when nothing was ticked |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Setup is marked finished in this browser; all cached data is refreshed; you land on **Dashboard**.

**Errors and troubleshooting:** None.

**Limitations:** Both "setup unfinished" and "setup done" are kept in this browser only. On another device or after clearing site data, the dashboard sends an account with no portfolios to setup again, and a started-but-unfinished setup is not resumed.

**How it works:** Opening the wizard writes `everypaisa.onboarding.inProgress.<userId>` = 1; finishing removes it and writes `onboarding_v2_done` = 1. Sign-in sends you to `/onboarding` while the in-progress flag exists; the dashboard does the same, and also when `onboarding_v2_done` is missing and you have no portfolio.

**Related features:** F-AUTH-001, F-ONB-003, D-AUTH-003, W-ONB-001.

**Sources:** `apps/web/src/pages/onboarding/OnboardingWizard.tsx:44`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:60`, `apps/web/src/pages/onboarding/OnboardingWizard.tsx:249`, `apps/web/src/lib/onboardingProgress.ts:12`, `apps/web/src/lib/onboardingProgress.ts:31`, `apps/web/src/App.tsx:151`, `apps/web/src/pages/dashboard/DashboardPage.tsx:358`, `apps/web/src/pages/dashboard/DashboardPage.tsx:367`

**What this area doesn't do**
- It does not ask for your PAN, phone or Gmail — those are in **Settings** and **Inbox**.
- It does not import statements; upload a CAS or contract note later from **Tools → CAS** or **Tools → Import**.
- There is no menu entry to reopen it once finished (typing `/onboarding` opens it again).
