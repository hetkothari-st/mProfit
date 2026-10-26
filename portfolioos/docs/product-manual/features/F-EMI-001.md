---
id: F-EMI-001
title: "Calculate: EMI, maximum loan or tenure"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: [S-EMI-001, S-EMI-002]
related: [F-EMI-002, F-EMI-003, F-EMI-004, F-EMI-005, F-EMI-008, F-EMI-009, F-LOAN-010]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Calculate: EMI, maximum loan or tenure

`F-EMI-001` · Live · Roles: All signed-in

**What it does:** Computes a loan from the inputs you give, in one of three modes: **EMI** (loan amount + rate + tenure → monthly EMI), **Max loan** (EMI you can pay + rate + tenure → "You can borrow"), **Tenure** (loan amount + EMI + rate → "Loan paid off in"). The **Result** card shows **Monthly EMI**, **Total interest**, **Total paid**, **Tenure**, **Fees + GST** (when fees are on), **APR (true yearly cost)** with "nominal X% p.a.", and when relevant **Interest saved by prepaying**, **Tax saved** and **Cost after tax**, plus a principal/interest donut and a balance chart.

**Why it exists:** The page description states it; inferred from behavior: to see the real cost of a loan, including fees, before signing.

**Where to find it:** **Tools → EMI Calculator → Calculate** (route `/emi`, default tab). **Open in calculator** on a loan's market card ([F-LOAN-010](F-LOAN-010.md)) also opens it pre-filled.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-ADMIN](../roles.md#r-admin), and [R-MANAGER](../roles.md#r-manager) (no plan gate; the calculator reads no account data).

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
| **Advanced - prepayments, rate changes, fees, tax** | Expand button | Shows [F-EMI-002](F-EMI-002.md), [F-EMI-003](F-EMI-003.md), [F-EMI-004](F-EMI-004.md) inputs | Opens automatically when an advanced field has an error |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| **Loan amount (Rs.)** | Text (commas, spaces, ₹ allowed) | Yes (EMI, Tenure modes) | > 0 and ≤ ₹100 crore | 25,00,000 | "Enter a loan amount above 0" / "Loan amount can be at most Rs. 100 crore" |
| **EMI you can pay (Rs.)** | Text | Yes (Max loan, Tenure modes) | > 0 | 25,000 | "Enter an EMI above 0"; Max loan: "This EMI is too small to give a loan" / "This EMI gives a loan above the Rs. 100 crore limit"; Tenure: "EMI never pays off the loan - it does not cover the monthly interest", "This EMI takes longer than 40 years to repay" |
| **Interest rate (% p.a.)** | Text | Yes | 0–50 | 8.5 | "Rate must be between 0% and 50%" |
| **Tenure** | Whole number | Yes (EMI, Max loan modes) | 1–480 months (40 years) | 20 (years) | "Tenure must be 1-480 months" |
| **First EMI date** | Date | Yes | A real date | 5th of next month (your local calendar) | "Pick a valid first EMI date" |

**Settings and toggles here:** [S-EMI-001](../settings/emi-calculator.md#s-emi-001) **Calculate** mode — EMI / Max loan / Tenure; [S-EMI-002](../settings/emi-calculator.md#s-emi-002) **Tenure unit** — Years / Months (also applies to the slider range).

**Results:** Nothing is stored. The address bar updates (after 0.4 s) with the full state.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix the highlighted fields to see your EMI." | One or more inputs invalid | Fix the messages under the fields (messages for hidden fields are listed in the result card) |
| "That EMI gives a tenure outside the allowed range: …" | Tenure mode with an EMI so small the tenure exceeds 480 months | Raise the EMI |
| "This loan would not be repaid within 100 years - check the EMI and rates" | Extreme combination of rate changes | Adjust inputs |
| Amber notes such as "A prepayment was larger than the balance - it was capped and closes the loan." | Warnings from the schedule (see [F-EMI-002](F-EMI-002.md)) | Informational |

**Limitations:** Amounts on screen are rounded to whole rupees on phones and in tables; the PDF and Excel keep paise. The EMI is rounded **up** to the next rupee, so the last instalment is smaller than the others.

**How it works:** EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1) with r = annual rate ÷ 1200, rounded up to the whole rupee (minimum ₹1; P ÷ n at 0%). Max loan = EMI × ((1+r)^n − 1) ÷ (r × (1+r)^n), rounded down to the rupee. Tenure = ln(EMI ÷ (EMI − P × r)) ÷ ln(1 + r), rounded up. The schedule: each month interest = opening × r rounded half-up to paise; principal = EMI − interest; the final month pays the remaining balance plus interest. Totals: total paid = EMIs + prepayments; total cost = total paid + fees. APR: the monthly rate i at which the present value of all payments equals the amount received (loan − fees), found by bisection; shown as (1+i)^12 − 1 and as the nominal i × 12, both to 2 decimals. Calculations use 40 significant digits.

**Related features:** [F-EMI-002](F-EMI-002.md), [F-EMI-003](F-EMI-003.md), [F-EMI-004](F-EMI-004.md), [F-EMI-005](F-EMI-005.md), [F-EMI-008](F-EMI-008.md), [F-EMI-009](F-EMI-009.md), [F-LOAN-010](F-LOAN-010.md).

**Sources:** `apps/web/src/pages/emi/EmiCalculatorPage.tsx:19`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:36`, `apps/web/src/pages/emi/CalculateTab.tsx:13`, `apps/web/src/pages/emi/CalculateTab.tsx:45`, `apps/web/src/pages/emi/CalculateTab.tsx:68`, `apps/web/src/pages/emi/CalculateTab.tsx:93`, `apps/web/src/pages/emi/CalculateTab.tsx:108`, `apps/web/src/pages/emi/emiState.ts:53`, `apps/web/src/pages/emi/emiState.ts:84`, `apps/web/src/pages/emi/emiState.ts:126`, `apps/web/src/pages/emi/EmiResults.tsx:61`, `packages/shared/src/loans/emi.ts:22`, `packages/shared/src/loans/emi.ts:40`, `packages/shared/src/loans/emi.ts:49`, `packages/shared/src/loans/emi.ts:63`, `packages/shared/src/loans/emiWire.ts:23`, `packages/shared/src/loans/emiWire.ts:61`, `packages/shared/src/loans/apr.ts:33`
