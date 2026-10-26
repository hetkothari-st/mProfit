---
id: F-EMI-004
title: "Tax benefit in the calculator"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: [S-EMI-008, S-EMI-009, S-EMI-010]
related: [F-EMI-001, F-EMI-006, F-LOAN-009]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Tax benefit in the calculator

`F-EMI-004` · Live · Roles: All signed-in

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

**Settings and toggles here:** [S-EMI-008](../settings/emi-calculator.md#s-emi-008) **Tax benefit**, [S-EMI-009](../settings/emi-calculator.md#s-emi-009) **Tax regime**, [S-EMI-010](../settings/emi-calculator.md#s-emi-010) **Loan for**. Choosing a lender's rate on **Live rates** sets **Loan for** to match its loan type (home → self-occupied unless already let out; education → Education; others → Other (no benefit)).

**Results:** Nothing is stored. The **Compare** tab uses the same tax settings.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No deduction under the new tax regime for this loan (self-occupied home loan interest and 80C/80E are not allowed)." | **New regime** chosen | Informational — tax saved is 0 |

**Limitations:** A simplified estimate: per financial year, self-occupied home: interest up to ₹2,00,000 plus principal (prepayments included) up to your 80C room; let-out home: interest up to ₹2,00,000 valued, the rest listed as carried forward but not valued, plus principal up to 80C room; education: all interest, for the first 8 financial years of the schedule. The same 80C room is applied in every year.

**How it works:** Schedule rows are grouped by Indian financial year (April–March). Tax saved per year = (interest deduction + principal deduction) × slab ÷ 100 × 1.04 (4% cess), rounded half-up to paise. **Cost after tax** = total cost − total tax saved.

**Related features:** [F-EMI-001](F-EMI-001.md), [F-EMI-006](F-EMI-006.md), [F-LOAN-009](F-LOAN-009.md).

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:75`, `apps/web/src/pages/emi/AdvancedInputs.tsx:79`, `apps/web/src/pages/emi/TaxBenefitTable.tsx:12`, `apps/web/src/pages/emi/liveRates.ts:4`, `packages/shared/src/loans/emiTax.ts:20`, `packages/shared/src/loans/emiTax.ts:21`, `packages/shared/src/loans/emiTax.ts:22`, `packages/shared/src/loans/emiTax.ts:24`, `packages/shared/src/loans/emiTax.ts:57`, `packages/shared/src/loans/emiWire.ts:123`
