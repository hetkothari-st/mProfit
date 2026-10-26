---
id: F-EMI-002
title: "Prepayments and rate changes"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: [S-EMI-003, S-EMI-004, S-EMI-005]
related: [F-EMI-001, F-EMI-005]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Prepayments and rate changes

`F-EMI-002` · Live · Roles: All signed-in

**What it does:** Under **Advanced**, adds one-off or yearly **Prepayments** (month number, amount, **Repeat** Once / Every year, **Effect** Cut tenure / Cut EMI) and **Rate changes (floating loans)** (from month number, new rate, **Bank adjusts** Tenure (keep EMI) / EMI (keep tenure)). The result then shows **Interest saved by prepaying** and the schedule shows a **Prepaid** column.

**Why it exists:** Inferred from behavior: to see how part-prepayments and floating-rate resets change the cost and end date of a loan.

**Where to find it:** **Tools → EMI Calculator → Calculate → Advanced - prepayments, rate changes, fees, tax** (route `/emi`).

**Who can use it:** All signed-in users (as [F-EMI-001](F-EMI-001.md)).

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

**Settings and toggles here:** [S-EMI-003](../settings/emi-calculator.md#s-emi-003) **Repeat**, [S-EMI-004](../settings/emi-calculator.md#s-emi-004) **Effect**, [S-EMI-005](../settings/emi-calculator.md#s-emi-005) **Bank adjusts**.

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

**Related features:** [F-EMI-001](F-EMI-001.md), [F-EMI-005](F-EMI-005.md).

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:7`, `apps/web/src/pages/emi/AdvancedInputs.tsx:28`, `apps/web/src/pages/emi/AdvancedInputs.tsx:40`, `apps/web/src/pages/emi/AdvancedInputs.tsx:46`, `apps/web/src/pages/emi/AdvancedInputs.tsx:57`, `apps/web/src/pages/emi/EmiResults.tsx:16`, `apps/web/src/pages/emi/CalculateTab.tsx:24`, `packages/shared/src/loans/emi.ts:78`, `packages/shared/src/loans/emi.ts:108`, `packages/shared/src/loans/emiWire.ts:89`
