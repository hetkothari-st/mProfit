[Index](../INDEX.md)

# Settings — EMI Calculator

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-emi-001"></a>
### Calculate mode (EMI / Max loan / Tenure)
| Attribute | Value |
|---|---|
| Control type | Radio switch |
| Location | **Tools → EMI Calculator → Calculate** |
| Purpose | What the calculator solves for |
| Default | `EMI` (source: `apps/web/src/pages/emi/emiState.ts:56`) |
| Values | `EMI`: shows loan amount and tenure, result **Monthly EMI** · `Max loan`: shows EMI and tenure, result **You can borrow** · `Tenure`: shows loan amount and EMI, result **Loan paid off in** |
| Depends on | — |
| Persists | In the page address / share link only |
| Stored in | URL parameter `s` |
| Backend effect | None (exports re-send the inputs) |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/CalculateTab.tsx:13`, `apps/web/src/pages/emi/emiState.ts:84` |

<a id="s-emi-002"></a>
### Tenure unit (Years / Months)
| Attribute | Value |
|---|---|
| Control type | Toggle |
| Location | **Calculate** tab (and each offer on **Compare**) |
| Purpose | Unit of the tenure field |
| Default | `Years` (source: `apps/web/src/pages/emi/emiState.ts:56`) |
| Values | `Years`: value × 12 months; slider 1–30 · `Months`: as typed; slider 12–360 |
| Depends on | Hidden in Tenure mode |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/CalculateTab.tsx:45`, `apps/web/src/pages/emi/EmiField.tsx:44` |

<a id="s-emi-003"></a>
### Prepayment Repeat
| Attribute | Value |
|---|---|
| Control type | Select (per prepayment) |
| Location | **Calculate → Advanced → Prepayments** |
| Purpose | One-off or yearly prepayment |
| Default | `Once` (source: `apps/web/src/pages/emi/AdvancedInputs.tsx:40`) |
| Values | `Once`: in that month only · `Every year`: that month and every 12 months after |
| Depends on | A prepayment row |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:33`, `packages/shared/src/loans/emi.ts:110` |

<a id="s-emi-004"></a>
### Prepayment Effect
| Attribute | Value |
|---|---|
| Control type | Select (per prepayment) |
| Location | **Calculate → Advanced → Prepayments** |
| Purpose | What the prepayment changes |
| Default | `Cut tenure` (source: `apps/web/src/pages/emi/AdvancedInputs.tsx:40`) |
| Values | `Cut tenure`: keep EMI, finish earlier · `Cut EMI`: keep end month, lower EMI |
| Depends on | A prepayment row |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:34`, `packages/shared/src/loans/emi.ts:120` |

<a id="s-emi-005"></a>
### Rate change: Bank adjusts
| Attribute | Value |
|---|---|
| Control type | Select (per rate change) |
| Location | **Calculate → Advanced → Rate changes (floating loans)** |
| Purpose | How the bank absorbs a rate change |
| Default | `Tenure (keep EMI)` (source: `apps/web/src/pages/emi/AdvancedInputs.tsx:57`) |
| Values | `Tenure (keep EMI)`: end month moves (EMI raised if it no longer covers interest or the loan would pass 40 years) · `EMI (keep tenure)`: EMI recomputed |
| Depends on | A rate-change row |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:51`, `packages/shared/src/loans/emi.ts:82` |

<a id="s-emi-006"></a>
### Processing fee and charges
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Calculate → Advanced** |
| Purpose | Include fees in total cost and APR |
| Default | Off (source: `apps/web/src/pages/emi/emiState.ts:59`) |
| Values | On: fee, GST and other charges fields shown and applied · Off: no fees |
| Depends on | — |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | Included in exports when on |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:63`, `apps/web/src/pages/emi/emiState.ts:116` |

<a id="s-emi-007"></a>
### Fee type
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced** (fees on); each offer on **Compare** |
| Purpose | How the processing fee is given |
| Default | `% of loan` (source: `apps/web/src/pages/emi/emiState.ts:59`) |
| Values | `% of loan`: up to 10% · `Fixed Rs.`: an amount |
| Depends on | [S-EMI-006](../settings/emi-calculator.md#s-emi-006) on (Calculate) |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:66`, `packages/shared/src/loans/apr.ts:14` |

<a id="s-emi-008"></a>
### Tax benefit
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Calculate → Advanced** |
| Purpose | Estimate tax saved and cost after tax |
| Default | Off (source: `apps/web/src/pages/emi/emiState.ts:60`) |
| Values | On: tax fields, **Tax saved**, **Cost after tax**, **Tax benefit by year**, and **Cheapest after tax** on Compare · Off: none |
| Depends on | — |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | Included in exports when on |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:75`, `apps/web/src/pages/emi/EmiCalculatorPage.tsx:48` |

<a id="s-emi-009"></a>
### Tax regime
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced → Tax benefit** |
| Purpose | Which income-tax regime applies |
| Default | `Old regime` (source: `apps/web/src/pages/emi/emiState.ts:60`) |
| Values | `Old regime`: deductions per **Loan for** · `New regime`: no deduction, note shown |
| Depends on | [S-EMI-008](../settings/emi-calculator.md#s-emi-008) on |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:78`, `packages/shared/src/loans/emiTax.ts:57` |

<a id="s-emi-010"></a>
### Loan for
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced → Tax benefit** |
| Purpose | Which deduction rules apply |
| Default | `Home - self-occupied` (source: `apps/web/src/pages/emi/emiState.ts:60`); set automatically by **Use this rate** on Live rates |
| Values | `Home - self-occupied`: interest ≤ ₹2,00,000 + principal within 80C room · `Home - let out`: same, excess interest listed as carried forward (not valued) · `Education`: all interest, first 8 FYs · `Other (no benefit)`: none |
| Depends on | [S-EMI-008](../settings/emi-calculator.md#s-emi-008) on |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:79`, `apps/web/src/pages/emi/liveRates.ts:4`, `packages/shared/src/loans/emiTax.ts:24` |

<a id="s-emi-011"></a>
### Loan type (Live rates)
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → EMI Calculator → Live rates** |
| Purpose | Which loan type's rates to list |
| Default | `Home` (source: `apps/web/src/pages/emi/LiveRatesTab.tsx:46`) |
| Values | Home, Car, Two-wheeler, Personal, Education, Gold, Loan against property, Loan against securities, Business |
| Depends on | — |
| Persists | No — resets to Home on reload (not in the share link) |
| Stored in | Not stored |
| Backend effect | `GET /api/loan-rates?loanType=` |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/LiveRatesTab.tsx:63`, `packages/shared/src/loans/loanRates.ts:9` |
