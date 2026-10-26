# Workflows and Troubleshooting — Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting (B11)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting

<!-- BEGIN WORKFLOWS -->
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
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| Goals or Accounting page appears blurred with "… is locked" | Plan below Plus (Goals) or Pro/Advisor (Accounting) | **View plans** on Pricing |
| Accounting actions fail with "Request failed with status code …" | The page shows the generic request error, not the server's reason | Check codes are unique, accounts have no entries before deleting, and amounts are positive |
| Insurance or PF reminders arrive at odd times | Insurance reminders run once a day at 20:45 IST; PF refresh alerts at 03:30 IST | Open **Alerts** the next day |
| Forex INR figures show "—" | No stored rate for that currency | **Refresh** on the Forex rates panel |
| Cash Activity shows a foreign-currency settlement in rupees | The list always formats amounts as ₹ | Read the description; the amount is in the settlement currency |
<!-- END TROUBLESHOOTING -->
