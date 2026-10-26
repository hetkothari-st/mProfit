---
id: F-ONB-004
title: "Quick-add forms (9 kinds)"
module: "First-run setup"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: []
related: [F-ONB-002, F-ONB-005]
---

[← First-run setup](../modules/first-run-setup.md) · [Index](../INDEX.md)

# Quick-add forms (9 kinds)

`F-ONB-004` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** For each ticked item, shows a short form; each **Add** saves one real record and lists it above the form so you can add another straight away.

**Why it exists:** The code comment: each form "asks for the least a new user is likely to know off-hand, fills every other required field with a sensible estimate, and saves through the same API the full forms use".

**Where to find it:** `/onboarding`, one step per ticked item, with "N of M" and a progress bar.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).

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

**Related features:** [F-ONB-002](F-ONB-002.md), [F-ONB-005](F-ONB-005.md).

**Sources:** `apps/web/src/pages/onboarding/QuickAddForms.tsx:84`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:131`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:170`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:183`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:236`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:300`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:366`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:423`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:471`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:530`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:576`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:650`, `apps/web/src/pages/onboarding/QuickAddForms.tsx:736`
