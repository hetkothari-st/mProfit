## EMI Calculator

The **EMI Calculator** (sidebar **Tools → EMI Calculator**, route `/emi`) plans a loan before or while you take it: "Plan a loan: EMI, prepayments, rate changes, fees, tax benefit and offers side by side." It has three tabs — **Calculate**, **Compare**, **Live rates** — and header buttons **Share**, **PDF** and **Excel**. Nothing you type is saved to your account: the whole calculator state lives in the page address so it can be bookmarked or shared. All maths runs in your browser with exact decimal arithmetic; the PDF and Excel files are rebuilt on the server from the same inputs.

### Calculate: EMI, maximum loan or tenure <!-- F-EMI-001 -->
**What it does:** Computes a loan from the inputs you give, in one of three modes: **EMI** (loan amount + rate + tenure → monthly EMI), **Max loan** (EMI you can pay + rate + tenure → "You can borrow"), **Tenure** (loan amount + EMI + rate → "Loan paid off in"). The **Result** card shows **Monthly EMI**, **Total interest**, **Total paid**, **Tenure**, **Fees + GST** (when fees are on), **APR (true yearly cost)** with "nominal X% p.a.", and when relevant **Interest saved by prepaying**, **Tax saved** and **Cost after tax**, plus a principal/interest donut and a balance chart.

**Why it exists:** The page description states it; inferred from behavior: to see the real cost of a loan, including fees, before signing.

**Where to find it:** **Tools → EMI Calculator → Calculate** (route `/emi`, default tab). **Open in calculator** on a loan's market card (F-LOAN-010) also opens it pre-filled.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO, R-ADMIN, and R-MANAGER (no plan gate; the calculator reads no account data).

**Steps**
1. Open **Tools → EMI Calculator**. Defaults: mode **EMI**, loan ₹25,00,000, rate 8.5%, 20 years, first EMI on the 5th of next month.
2. Pick the mode in the **Calculate** switch: **EMI**, **Max loan** or **Tenure**.
3. Type or drag the sliders for **Loan amount (Rs.)** (or **EMI you can pay (Rs.)**), **Interest rate (% p.a.)** and **Tenure** (with **Years** / **Months**).
4. Set **First EMI date**.
5. Read the **Result** card; it updates about 0.15 seconds after you stop typing.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **EMI** / **Max loan** / **Tenure** | Radio switch ("Calculate") | Chooses what is computed | — |
| Loan amount slider | Range ₹1,00,000–₹5,00,00,000, step ₹50,000 | Sets **Loan amount** | Hidden in Max loan mode |
| EMI slider | Range ₹1,000–₹5,00,000, step ₹500 | Sets **EMI you can pay** | Hidden in EMI mode |
| Rate slider | Range 5–20%, step 0.05 | Sets the rate | — |
| Tenure slider | 1–30 years or 12–360 months | Sets the tenure | Hidden in Tenure mode |
| **Years** / **Months** | Toggle | Unit of **Tenure** | Hidden in Tenure mode |
| **Advanced - prepayments, rate changes, fees, tax** | Expand button | Shows F-EMI-002, F-EMI-003, F-EMI-004 inputs | Opens automatically when an advanced field has an error |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Loan amount (Rs.)** | Text (commas, spaces, ₹ allowed) | Yes (EMI, Tenure modes) | > 0 and ≤ ₹100 crore | 25,00,000 | "Enter a loan amount above 0" / "Loan amount can be at most Rs. 100 crore" |
| **EMI you can pay (Rs.)** | Text | Yes (Max loan, Tenure modes) | > 0 | 25,000 | "Enter an EMI above 0"; Max loan: "This EMI is too small to give a loan" / "This EMI gives a loan above the Rs. 100 crore limit"; Tenure: "EMI never pays off the loan - it does not cover the monthly interest", "This EMI takes longer than 40 years to repay" |
| **Interest rate (% p.a.)** | Text | Yes | 0–50 | 8.5 | "Rate must be between 0% and 50%" |
| **Tenure** | Whole number | Yes (EMI, Max loan modes) | 1–480 months (40 years) | 20 (years) | "Tenure must be 1-480 months" |
| **First EMI date** | Date | Yes | A real date | 5th of next month (your local calendar) | "Pick a valid first EMI date" |

**Settings and toggles here:** S-EMI-001 **Calculate** mode — EMI / Max loan / Tenure; S-EMI-002 **Tenure unit** — Years / Months (also applies to the slider range).

**Results:** Nothing is stored. The address bar updates (after 0.4 s) with the full state.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix the highlighted fields to see your EMI." | One or more inputs invalid | Fix the messages under the fields (messages for hidden fields are listed in the result card) |
| "That EMI gives a tenure outside the allowed range: …" | Tenure mode with an EMI so small the tenure exceeds 480 months | Raise the EMI |
| "This loan would not be repaid within 100 years - check the EMI and rates" | Extreme combination of rate changes | Adjust inputs |
| Amber notes such as "A prepayment was larger than the balance - it was capped and closes the loan." | Warnings from the schedule (see F-EMI-002) | Informational |

**Limitations:** Amounts on screen are rounded to whole rupees on phones and in tables; the PDF and Excel keep paise. The EMI is rounded **up** to the next rupee, so the last instalment is smaller than the others.

**How it works:** EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1) with r = annual rate ÷ 1200, rounded up to the whole rupee (minimum ₹1; P ÷ n at 0%). Max loan = EMI × ((1+r)^n − 1) ÷ (r × (1+r)^n), rounded down to the rupee. Tenure = ln(EMI ÷ (EMI − P × r)) ÷ ln(1 + r), rounded up. The schedule: each month interest = opening × r rounded half-up to paise; principal = EMI − interest; the final month pays the remaining balance plus interest. Totals: total paid = EMIs + prepayments; total cost = total paid + fees. APR: the monthly rate i at which the present value of all payments equals the amount received (loan − fees), found by bisection; shown as (1+i)^12 − 1 and as the nominal i × 12, both to 2 decimals. Calculations use 40 significant digits.

**Related features:** F-EMI-002, F-EMI-003, F-EMI-004, F-EMI-005, F-EMI-008, F-EMI-009, F-LOAN-010.

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:19`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:36`, `apps/web/src/pages/emi/CalculateTab.tsx:13`, `apps/web/src/pages/emi/CalculateTab.tsx:45`, `apps/web/src/pages/emi/CalculateTab.tsx:68`, `apps/web/src/pages/emi/CalculateTab.tsx:93`, `apps/web/src/pages/emi/CalculateTab.tsx:108`, `apps/web/src/pages/emi/emiState.ts:53`, `apps/web/src/pages/emi/emiState.ts:84`, `apps/web/src/pages/emi/emiState.ts:126`, `apps/web/src/pages/emi/EmiResults.tsx:61`, `packages/shared/src/loans/emi.ts:22`, `packages/shared/src/loans/emi.ts:40`, `packages/shared/src/loans/emi.ts:49`, `packages/shared/src/loans/emi.ts:63`, `packages/shared/src/loans/emiWire.ts:23`, `packages/shared/src/loans/emiWire.ts:61`, `packages/shared/src/loans/apr.ts:33`

### Prepayments and rate changes <!-- F-EMI-002 -->
**What it does:** Under **Advanced**, adds one-off or yearly **Prepayments** (month number, amount, **Repeat** Once / Every year, **Effect** Cut tenure / Cut EMI) and **Rate changes (floating loans)** (from month number, new rate, **Bank adjusts** Tenure (keep EMI) / EMI (keep tenure)). The result then shows **Interest saved by prepaying** and the schedule shows a **Prepaid** column.

**Why it exists:** Inferred from behavior: to see how part-prepayments and floating-rate resets change the cost and end date of a loan.

**Where to find it:** **Tools → EMI Calculator → Calculate → Advanced - prepayments, rate changes, fees, tax** (route `/emi`).

**Who can use it:** All signed-in users (as F-EMI-001).

**Steps**
1. Click **Advanced - prepayments, rate changes, fees, tax**.
2. Click **Add prepayment** (adds month 12, ₹1,00,000, Once, Cut tenure); edit **Month #**, **Amount (Rs.)**, **Repeat**, **Effect**.
3. Click **Add rate change** (adds from month 13 at the current rate, Tenure (keep EMI)); edit **From month #**, **New rate (%)**, **Bank adjusts**.
4. Click **Remove** on a row to delete it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add prepayment** / **Add rate change** | Buttons | Add a row | — |
| **Remove** | Button (per row) | Deletes the row | — |
| **Repeat** | Select: Once / Every year | Yearly repeats every 12 months after the first | — |
| **Effect** | Select: Cut tenure / Cut EMI | What the prepayment changes | — |
| **Bank adjusts** | Select: Tenure (keep EMI) / EMI (keep tenure) | What the rate change changes | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Month #** | Whole number | Yes | 1–480 | 12 | "Month must be 1-480" |
| **Amount (Rs.)** | Text | Yes | > 0 | 1,00,000 | "Enter an amount above 0" |
| **From month #** | Whole number | Yes | 1–480, one change per month | 13 | "Month must be 1-480" / "Only one rate change per month" |
| **New rate (%)** | Text | Yes | 0–50 | Current rate | "Rate must be between 0% and 50%" |

**Settings and toggles here:** S-EMI-003 **Repeat**, S-EMI-004 **Effect**, S-EMI-005 **Bank adjusts**.

**Results:** The schedule, totals, APR and warnings recompute; nothing is stored. Up to 50 prepayments and 50 rate changes survive in a share link.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "A prepayment was larger than the balance - it was capped and closes the loan." | Amount above the balance | Informational |
| "After a rate rise the old EMI would not cover the interest, so the EMI was raised." | Keep-EMI rate rise too large | Informational |
| "Some prepayments fall after the loan is already repaid and were ignored." / "Some rate changes fall after the loan is already repaid and were ignored." | Month beyond the end | Informational |
| "The rate rise would stretch the loan past 40 years, so the EMI was raised to finish by then." | Keep-EMI change past month 480 | Informational |

**Limitations:** A prepayment is applied right after that month's EMI. **Interest saved by prepaying** compares with the same inputs without prepayments (rate changes kept).

**How it works:** In the shared schedule builder: at a rate-change month the rate switches; **EMI (keep tenure)** recomputes the EMI over the months left; **Tenure (keep EMI)** recomputes the end month, unless the EMI no longer covers the interest (EMI raised) or the end passes month 480 (EMI raised to finish by 480). After each EMI, due prepayments reduce the balance; **Cut EMI** recomputes the EMI over the remaining planned months, **Cut tenure** recomputes the end month.

**Related features:** F-EMI-001, F-EMI-005.

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:7`, `apps/web/src/pages/emi/AdvancedInputs.tsx:28`, `apps/web/src/pages/emi/AdvancedInputs.tsx:40`, `apps/web/src/pages/emi/AdvancedInputs.tsx:46`, `apps/web/src/pages/emi/AdvancedInputs.tsx:57`, `apps/web/src/pages/emi/EmiResults.tsx:16`, `apps/web/src/pages/emi/CalculateTab.tsx:24`, `packages/shared/src/loans/emi.ts:78`, `packages/shared/src/loans/emi.ts:108`, `packages/shared/src/loans/emiWire.ts:89`

### Processing fee and charges (APR) <!-- F-EMI-003 -->
**What it does:** With **Processing fee and charges** switched on, adds a processing fee (**% of loan** or **Fixed Rs.**), **GST on fee (%)** and **Other charges (Rs.)**. The result shows **Fees + GST**, and **APR (true yearly cost)** rises above the nominal rate because you receive the loan minus the fees.

**Why it exists:** Inferred from behavior: two offers with the same rate can cost differently once fees are counted; the APR puts them on one scale.

**Where to find it:** **Tools → EMI Calculator → Calculate → Advanced → Processing fee and charges** (route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. Tick **Processing fee and charges**.
2. Choose **Fee type**, then fill **Fee (%)** or **Fee (Rs.)**, **GST on fee (%)** (default 18) and **Other charges (Rs.)** (default 0).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Processing fee and charges** | Checkbox | Turns fees on/off | — |
| **Fee type** | Select: % of loan / Fixed Rs. | How the fee is given | Hidden when fees are off |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Fee (%)** / **Fee (Rs.)** | Text | Yes when on | % up to 10 | 0.5 | "Enter a fee (0 if none)" / "Fee can be at most 10%" |
| **GST on fee (%)** | Text | Yes when on | 0–28 | 18 | "GST must be 0-28%" |
| **Other charges (Rs.)** | Text | Yes when on | ≥ 0 | 0 | "Enter other charges (0 if none)" |
| (all fees together) | — | — | Must be less than the loan | — | "Fees can't be more than the loan" |

**Settings and toggles here:** S-EMI-006 **Processing fee and charges**, S-EMI-007 **Fee type**.

**Results:** Nothing is stored.

**Errors and troubleshooting:** As in the table above.

**Limitations:** Fees are treated as paid at the start (deducted from what you receive). GST applies to the processing fee only.

**How it works:** Fee = loan × % ÷ 100 (or the fixed amount), GST = fee × GST% ÷ 100, other charges as typed, each rounded half-up to paise; total = sum. APR uses (loan − total fees) as the amount received (see F-EMI-001).

**Related features:** F-EMI-001, F-EMI-006.

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:63`, `apps/web/src/pages/emi/AdvancedInputs.tsx:66`, `packages/shared/src/loans/apr.ts:11`, `packages/shared/src/loans/emiWire.ts:104`, `packages/shared/src/loans/summary.ts:19`

### Tax benefit in the calculator <!-- F-EMI-004 -->
**What it does:** With **Tax benefit** switched on, estimates the income-tax saved each financial year for a home or education loan and shows **Tax saved**, **Cost after tax** and a **Tax benefit by year** table (**FY**, **Interest deduction**, **Principal (80C)**, **Tax saved**, and for a let-out home **Excess interest (carried forward, not valued)**).

**Why it exists:** Inferred from behavior: the after-tax cost is what matters when choosing a home or education loan.

**Where to find it:** **Tools → EMI Calculator → Calculate → Advanced → Tax benefit** (route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. Tick **Tax benefit**.
2. Choose **Tax regime** (Old regime / New regime) and **Loan for** (Home - self-occupied, Home - let out, Education, Other (no benefit)).
3. Fill **Your tax slab (%)** and **80C room left (Rs.)**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Tax benefit** | Checkbox | Turns the estimate on/off | — |
| **Tax regime** | Select | Old / New | Hidden when off |
| **Loan for** | Select | Which deduction rules apply | Hidden when off |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Your tax slab (%)** | Text | Yes when on | 0–30 | 30 | "Tax slab must be 0-30%" |
| **80C room left (Rs.)** | Text | Yes when on | 0–1,50,000 | 1,50,000 | "80C room must be Rs. 0 - 1,50,000" |

**Settings and toggles here:** S-EMI-008 **Tax benefit**, S-EMI-009 **Tax regime**, S-EMI-010 **Loan for**. Choosing a lender's rate on **Live rates** sets **Loan for** to match its loan type (home → self-occupied unless already let out; education → Education; others → Other (no benefit)).

**Results:** Nothing is stored. The **Compare** tab uses the same tax settings.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No deduction under the new tax regime for this loan (self-occupied home loan interest and 80C/80E are not allowed)." | **New regime** chosen | Informational — tax saved is 0 |

**Limitations:** A simplified estimate: per financial year, self-occupied home: interest up to ₹2,00,000 plus principal (prepayments included) up to your 80C room; let-out home: interest up to ₹2,00,000 valued, the rest listed as carried forward but not valued, plus principal up to 80C room; education: all interest, for the first 8 financial years of the schedule. The same 80C room is applied in every year.

**How it works:** Schedule rows are grouped by Indian financial year (April–March). Tax saved per year = (interest deduction + principal deduction) × slab ÷ 100 × 1.04 (4% cess), rounded half-up to paise. **Cost after tax** = total cost − total tax saved.

**Related features:** F-EMI-001, F-EMI-006, F-LOAN-009.

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:75`, `apps/web/src/pages/emi/AdvancedInputs.tsx:79`, `apps/web/src/pages/emi/TaxBenefitTable.tsx:12`, `apps/web/src/pages/emi/liveRates.ts:4`, `packages/shared/src/loans/emiTax.ts:20`, `packages/shared/src/loans/emiTax.ts:21`, `packages/shared/src/loans/emiTax.ts:22`, `packages/shared/src/loans/emiTax.ts:24`, `packages/shared/src/loans/emiTax.ts:57`, `packages/shared/src/loans/emiWire.ts:123`

### Repayment schedule by financial year <!-- F-EMI-005 -->
**What it does:** Below the result, **Repayment schedule** groups every EMI by financial year ("FY 2026-27") with totals for **EMI paid**, **Interest**, **Principal**, **Prepaid** (only when there are prepayments) and the year-end **Balance**. Click a year to expand its months.

**Why it exists:** Inferred from behavior: yearly totals match how interest certificates and tax returns are organised.

**Where to find it:** **Tools → EMI Calculator → Calculate**, below the results (route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. Scroll to **Repayment schedule**.
2. Click **FY …** to expand or collapse that year.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **FY yyyy-yy** | Toggle button | Expands / collapses the months | Hidden while inputs are invalid |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** None.

**Results:** Nothing is stored.

**Errors and troubleshooting:** None.

**Limitations:** "Whole rupees on screen; the PDF and Excel files show paise." On narrow screens the table becomes stacked cards.

**How it works:** Rows are grouped by consecutive Indian financial year; the group balance is the last month's closing balance.

**Related features:** F-EMI-001, F-EMI-009.

**Sources:** `apps/web/src/pages/emi/ScheduleTable.tsx:10`, `apps/web/src/pages/emi/ScheduleTable.tsx:26`, `apps/web/src/pages/emi/ScheduleTable.tsx:63`, `packages/shared/src/loans/summary.ts:43`

### Compare loan offers <!-- F-EMI-006 -->
**What it does:** The **Compare** tab puts two or three loan offers side by side. For each offer you enter **Name**, **Loan amount (Rs.)**, **Interest rate (% p.a.)**, **Tenure** (years or months), **Fee type**, **Processing fee** and **Other charges (Rs.)**; result cards show **EMI**, **Total interest**, **Fees + GST**, **Total cost**, **APR** and (with tax on) **Cost after tax**, marking **Cheapest overall** and **Cheapest after tax**.

**Why it exists:** Inferred from behavior: lenders quote different rates and fees; total cost decides which is cheaper.

**Where to find it:** **Tools → EMI Calculator → Compare** (route `/emi?tab=compare`).

**Who can use it:** All signed-in users.

**Steps**
1. Click **Compare**. Two offers are pre-filled: Offer A 8.5% with 0.5% fee, Offer B 8.35% with 1% fee, both ₹25,00,000 for 20 years.
2. Edit each offer. Click **Add offer** for a third (it copies the last offer); **Remove offer** appears when there are three.
3. Read the result cards; the cheapest total cost is outlined.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Add offer** | Button | Adds an offer (max 3) | Hidden at 3 offers |
| **Remove offer** | Button | Removes an offer | Shown only when there are 3 offers |
| **Years** / **Months** | Toggle (per offer) | Tenure unit | — |
| **Fee type** | Select: % of loan / Fixed Rs. | Fee kind | — |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Name** | Text | No | Up to 40 characters in a share link | Offer A / Offer B | — |
| **Loan amount (Rs.)**, **Interest rate (% p.a.)**, **Tenure**, **Processing fee**, **Other charges (Rs.)** | Text | Yes | Same limits as F-EMI-001 / F-EMI-003 | See step 1 | Same messages as F-EMI-001 / F-EMI-003 |

**Settings and toggles here:** S-EMI-002 **Tenure unit** (per offer), S-EMI-007 **Fee type** (per offer). "Uses the first EMI date and tax settings from the Calculate tab."

**Results:** Nothing is stored. The compare state is part of the share link.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix these to compare the offers:" followed by messages | Errors that have no field on this tab (for example the first EMI date) | Fix them on the Calculate tab |

**Limitations:** GST on the fee is fixed at 18% for every offer. Prepayments and rate changes are not applied to offers. **Cheapest after tax** appears only when tax is on in the Calculate tab and valid.

**How it works:** Each offer is summarised with the shared engine (F-EMI-001, F-EMI-003); cheapest = lowest total cost (EMIs + fees), ties all marked; cheapest after tax = lowest cost after tax when every offer has a tax estimate.

**Related features:** F-EMI-001, F-EMI-003, F-EMI-004, F-EMI-007.

**Sources:** `apps/web/src/pages/emi/CompareTab.tsx:11`, `apps/web/src/pages/emi/CompareTab.tsx:41`, `apps/web/src/pages/emi/CompareTab.tsx:47`, `apps/web/src/pages/emi/CompareTab.tsx:53`, `apps/web/src/pages/emi/CompareTab.tsx:58`, `apps/web/src/pages/emi/CompareTab.tsx:73`, `apps/web/src/pages/emi/emiState.ts:64`, `apps/web/src/pages/emi/emiState.ts:143`, `packages/shared/src/loans/summary.ts:78`

### Live rates <!-- F-EMI-007 -->
**What it does:** The **Live rates** tab lists indicative published rates by lender for one **Loan type** (Home, Car, Two-wheeler, Personal, Education, Gold, Loan against property, Loan against securities, Business), lowest first: **Lender**, **Rate (% p.a.)** ("from X%" or "X% - Y%"), **Basis** (Repo-linked, MCLR, Fixed, Other), **As of** (with "w.e.f." date and a **Stale** badge) and a link to the lender's rates page. The lowest non-stale row is highlighted **Lowest**. A line above shows the RBI repo rate and its last change. **Use this rate** copies a lender's minimum rate into the Calculate tab.

**Why it exists:** Inferred from behavior: to start a calculation from a realistic market rate. The tab notes: "Indicative. Your rate depends on credit score, loan amount and tenure."

**Where to find it:** **Tools → EMI Calculator → Live rates** (route `/emi?tab=rates`).

**Who can use it:** All signed-in users (any plan).

**Steps**
1. Click **Live rates**. Home loan rates load.
2. Choose another **Loan type** if needed.
3. Click **Use this rate** on a row. The Calculate tab opens with that rate; the toast reads "Using <lender> <rate>% - check it against your own offer".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Loan type** | Select | Chooses the loan type | — |
| Lender page link (aria "<lender> rates page") | External link | Opens the lender's page in a new tab | — |
| **Use this rate** | Button | Applies the rate and switches to Calculate | — |
| **Try again** | Button | Reloads | Shown only after a failed load; disabled while loading |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-EMI-011 **Loan type** (this tab only; not saved).

**Results:** **Use this rate** changes only the calculator's rate and tax **Loan for**.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't load rates right now. The calculator still works." | Request failed | **Try again** |
| "Rates not available yet" | No effective rate for this loan type | Try another type; rates refresh daily |
| **Stale** badge | The lender page has not been read successfully for more than 7 days | Treat the rate with caution |

**Limitations:** Rates come from lenders' public pages read once a day (F-EMI-010) or entered by an administrator; a lender with no current reading is simply absent. Results are cached in your browser for 10 minutes.

**How it works:** `GET /api/loan-rates?loanType=…` (any signed-in user). The server lists each lender source for the type with its effective rate — suspect readings are never shown; a manual override from the admin page takes precedence — sorted by minimum rate then lender, with `asOf` = the page's last successful read (automatic) or the admin entry time (manual), and **Stale** when an automatic source has had no success for 7 days. The repo line shows the latest RBI repo rate and, if the two latest readings differ, the signed change.

**Related features:** F-EMI-001, F-EMI-010, F-LOAN-010, D-EMI-001.

**Sources:** `apps/web/src/pages/emi/LiveRatesTab.tsx:45`, `apps/web/src/pages/emi/LiveRatesTab.tsx:51`, `apps/web/src/pages/emi/LiveRatesTab.tsx:74`, `apps/web/src/pages/emi/LiveRatesTab.tsx:82`, `apps/web/src/pages/emi/LiveRatesTab.tsx:88`, `apps/web/src/pages/emi/LiveRatesTab.tsx:117`, `apps/web/src/pages/emi/liveRates.ts:11`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:42`, `packages/api/src/routes/loanRates.routes.ts:9`, `packages/api/src/controllers/loanRates.controller.ts:11`, `packages/api/src/services/loans/loanRates/loanRates.service.ts:14`, `packages/api/src/services/loans/loanRates/loanRates.service.ts:46`, `packages/api/src/services/loans/loanRates/sanity.ts:67`, `packages/shared/src/loans/loanRates.ts:9`

### Share a calculator link <!-- F-EMI-008 -->
**What it does:** **Share** copies a link to the calculator with every input of the Calculate and Compare tabs and the current tab. Opening the link restores the same state.

**Why it exists:** Inferred from behavior: to send a loan scenario to someone or bookmark it, without saving anything to an account.

**Where to find it:** **Tools → EMI Calculator → Share** (header button, route `/emi`).

**Who can use it:** All signed-in users; the person opening the link must also be signed in.

**Steps**
1. Click **Share**. The toast "Link copied" appears.
2. Paste the link. The recipient sees the same inputs after signing in.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Share** | Button | Copies the link | Never |

**Fields and rules:** Not applicable.

**Settings and toggles here:** None.

**Results:** Your clipboard holds the link. The address bar always holds the same state, so copying it works too.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Couldn't copy - copy the address bar instead" | Clipboard blocked by the browser | Copy the address bar |
| "This calculator link couldn't be opened - showing the default loan instead" | Link from another version, edited or truncated | Re-share from the source |

**Limitations:** The link carries all your inputs in readable encoded form; do not share it if the figures are private.

**How it works:** State is JSON, base64url-encoded into `?v=1&tab=…&s=…&c=…`; on open it is validated (string fields up to 40 characters, up to 50 prepayments and rate changes, 2–3 offers). The address bar is updated 0.4 s after each change without adding history entries.

**Related features:** F-EMI-001, F-EMI-006.

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:53`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:31`, `apps/web/src/pages/emi/emiUrl.ts:5`, `apps/web/src/pages/emi/emiUrl.ts:15`, `apps/web/src/pages/emi/emiUrl.ts:37`, `apps/web/src/pages/emi/emiUrl.ts:47`

### Export the schedule to PDF or Excel <!-- F-EMI-009 -->
**What it does:** **PDF** and **Excel** download the current calculation as `emi-schedule.pdf` or `emi-schedule.xlsx`: a summary (loan amount, rate, tenure, EMI, total interest, total prepaid, fees, total cost, APR, nominal rate, tax saved and cost after tax when on, rate changes) and the full schedule with paise.

**Why it exists:** Inferred from behavior: to keep or share the schedule outside the app; the schedule card notes the files show paise.

**Where to find it:** **Tools → EMI Calculator → PDF** / **Excel** (header buttons, route `/emi`).

**Who can use it:** All signed-in users.

**Steps**
1. On the **Calculate** tab, with valid inputs, click **PDF** or **Excel**.
2. The file downloads.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **PDF** | Button | Downloads PDF | Disabled when inputs are invalid, while an export runs, or when not on the Calculate tab |
| **Excel** | Button | Downloads XLSX | Same as **PDF** |

**Fields and rules:** Not applicable.

**Settings and toggles here:** Tax and fee toggles (S-EMI-006, S-EMI-008) decide what is included.

**Results:** A file is downloaded; nothing is stored on the server.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Too many exports - please wait a minute" | More than 10 exports in a minute | Wait a minute |
| "Couldn't create the file" or the server's validation message | Server error or invalid input | Fix inputs and retry |

**Limitations:** The file title is always "Loan". The PDF writes "Rs." instead of "₹". Compare-tab offers are not exported.

**How it works:** `POST /api/emi/export?format=pdf|xlsx` with the same inputs; the server re-validates them with the shared validator, recomputes the summary and builds the file (Excel money cells use the `#,##,##0.00` format and real date cells). Limited to 10 per minute per user.

**Related features:** F-EMI-001, F-EMI-005.

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:60`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:81`, `apps/web/src/api/loans/emi.api.ts:5`, `packages/api/src/routes/emi.routes.ts:9`, `packages/api/src/controllers/emi.controller.ts:37`, `packages/api/src/services/loans/emi/emiExport.ts:17`, `packages/api/src/middleware/rateLimit.ts:219`

### Daily lender-rate refresh <!-- F-EMI-010 -->
**What it does:** Every day at 07:30 IST the server reads the published loan rates and MCLR of tracked lenders (SBI, HDFC Bank, ICICI Bank, Axis Bank, Kotak, PNB, Bank of Baroda, Canara Bank, Union Bank, LIC Housing Finance) and the RBI repo rate from their public web pages, and keeps the last good rate for each lender and loan type. These feed **Live rates** (F-EMI-007), **Compare with market** (F-LOAN-010) and the refinance and benchmark alerts (F-LOAN-013).

**Why it exists:** Inferred from behavior: to give market rates without a paid data feed; readings are sanity-checked so a misread page does not reach users.

**Where to find it:** No page of its own; its result appears on **Tools → EMI Calculator → Live rates** and on loan pages.

**Who can use it:** Automatic for everyone. Administrators can review suspect readings, set manual rates and run it on demand at **Settings → Loan rates** (D-EMI-001).

**Steps:** Not applicable — automatic.

**Controls:** None in this module.

**Fields and rules:** Not applicable.

**Settings and toggles here:** None for users. Operators can disable the job with `ENABLE_LOAN_RATES_CRON=false`.

**Results:** New readings are stored; a reading outside 4–30%, a ceiling outside the range, a jump of more than 2 points from the last good reading, or a page date more than 7 days ahead or too old (180 days for MCLR, 400 days for product rates) is kept as suspect and not shown. Failures are logged to the ingestion-failure list owned by the oldest active administrator; sources with no success for 7 days raise one operations alert per day to that administrator.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A lender missing from Live rates | Its page could not be read or the reading was suspect, and there is no earlier good reading | Administrator reviews it on **Settings → Loan rates** |
| **Stale** badge | No successful read in 7 days | Administrator checks the source |

**Limitations:** Many lender/loan-type pairs are not read automatically; they show only when an administrator enters a manual rate. Lender pages can change format at any time.

**How it works:** Runs under a system database context (the rate tables are shared reference data). The source list lives in code and is re-applied on every run; the job fetches each page once (allow-listed, respecting robots.txt), parses it, applies the sanity rules above, then runs the loan checks (F-LOAN-013). Only one run at a time; overlapping calls are skipped.

**Related features:** F-EMI-007, F-LOAN-010, F-LOAN-013, D-EMI-001.

**Sources:** `packages/api/src/jobs/loanRatesJob.ts:88`, `packages/api/src/jobs/loanRatesJob.ts:136`, `packages/api/src/jobs/loanRatesJob.ts:141`, `packages/api/src/jobs/loanRatesJob.ts:45`, `packages/api/src/services/loans/loanRates/sourceList.ts:30`, `packages/api/src/services/loans/loanRates/sourceList.ts:71`, `packages/api/src/services/loans/loanRates/sanity.ts:5`, `packages/api/src/services/loans/loanRates/sanity.ts:9`, `packages/api/src/services/loans/loanRates/sanity.ts:46`, `packages/api/src/services/loans/loanRates/sanity.ts:73`

**What this area doesn't do**
- It doesn't save calculations to your account; use **Share** or the address bar.
- It doesn't create a loan from a calculation — add the loan on the Loans page.
- It doesn't fetch a personalised offer or your credit score; live rates are public, indicative headline rates.
- The Compare tab doesn't model prepayments or rate changes, and doesn't export.

