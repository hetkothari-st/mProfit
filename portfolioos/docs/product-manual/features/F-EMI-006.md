---
id: F-EMI-006
title: "Compare loan offers"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: [S-EMI-002, S-EMI-007]
related: [F-EMI-001, F-EMI-003, F-EMI-004, F-EMI-007]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Compare loan offers

`F-EMI-006` · Live · Roles: All signed-in

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
| **Loan amount (Rs.)**, **Interest rate (% p.a.)**, **Tenure**, **Processing fee**, **Other charges (Rs.)** | Text | Yes | Same limits as [F-EMI-001](F-EMI-001.md) / [F-EMI-003](F-EMI-003.md) | See step 1 | Same messages as [F-EMI-001](F-EMI-001.md) / [F-EMI-003](F-EMI-003.md) |

**Settings and toggles here:** [S-EMI-002](../settings/emi-calculator.md#s-emi-002) **Tenure unit** (per offer), [S-EMI-007](../settings/emi-calculator.md#s-emi-007) **Fee type** (per offer). "Uses the first EMI date and tax settings from the Calculate tab."

**Results:** Nothing is stored. The compare state is part of the share link.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Fix these to compare the offers:" followed by messages | Errors that have no field on this tab (for example the first EMI date) | Fix them on the Calculate tab |

**Limitations:** GST on the fee is fixed at 18% for every offer. Prepayments and rate changes are not applied to offers. **Cheapest after tax** appears only when tax is on in the Calculate tab and valid.

**How it works:** Each offer is summarised with the shared engine ([F-EMI-001](F-EMI-001.md), [F-EMI-003](F-EMI-003.md)); cheapest = lowest total cost (EMIs + fees), ties all marked; cheapest after tax = lowest cost after tax when every offer has a tax estimate.

**Related features:** [F-EMI-001](F-EMI-001.md), [F-EMI-003](F-EMI-003.md), [F-EMI-004](F-EMI-004.md), [F-EMI-007](F-EMI-007.md).

**Sources:** `apps/web/src/pages/emi/CompareTab.tsx:11`, `apps/web/src/pages/emi/CompareTab.tsx:41`, `apps/web/src/pages/emi/CompareTab.tsx:47`, `apps/web/src/pages/emi/CompareTab.tsx:53`, `apps/web/src/pages/emi/CompareTab.tsx:58`, `apps/web/src/pages/emi/CompareTab.tsx:73`, `apps/web/src/pages/emi/emiState.ts:64`, `apps/web/src/pages/emi/emiState.ts:143`, `packages/shared/src/loans/summary.ts:78`
