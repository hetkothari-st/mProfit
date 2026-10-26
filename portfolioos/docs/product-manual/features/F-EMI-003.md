---
id: F-EMI-003
title: "Processing fee and charges (APR)"
module: "EMI Calculator"
status: Live
roles: "All signed-in"
settings: [S-EMI-006, S-EMI-007]
related: [F-EMI-001, F-EMI-006]
---

[← EMI Calculator](../modules/emi-calculator.md) · [Index](../INDEX.md)

# Processing fee and charges (APR)

`F-EMI-003` · Live · Roles: All signed-in

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

**Settings and toggles here:** [S-EMI-006](../settings/emi-calculator.md#s-emi-006) **Processing fee and charges**, [S-EMI-007](../settings/emi-calculator.md#s-emi-007) **Fee type**.

**Results:** Nothing is stored.

**Errors and troubleshooting:** As in the table above.

**Limitations:** Fees are treated as paid at the start (deducted from what you receive). GST applies to the processing fee only.

**How it works:** Fee = loan × % ÷ 100 (or the fixed amount), GST = fee × GST% ÷ 100, other charges as typed, each rounded half-up to paise; total = sum. APR uses (loan − total fees) as the amount received (see [F-EMI-001](F-EMI-001.md)).

**Related features:** [F-EMI-001](F-EMI-001.md), [F-EMI-006](F-EMI-006.md).

**Sources:** `apps/web/src/pages/emi/AdvancedInputs.tsx:63`, `apps/web/src/pages/emi/AdvancedInputs.tsx:66`, `packages/shared/src/loans/apr.ts:11`, `packages/shared/src/loans/emiWire.ts:104`, `packages/shared/src/loans/summary.ts:19`
