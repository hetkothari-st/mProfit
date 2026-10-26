# Settings and Toggles Reference — Loans, EMI Calculator, Credit Cards (B04)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Loans, EMI Calculator, Credit Cards

Loan and card settings are saved on the loan or card record. EMI Calculator settings are never saved to your account: they live only in the page address (share link) and reset to defaults when you open `/emi` without one. The account-level **Loan rate alerts** switch lives in Settings (B06, D-LOAN-002).

<!-- BEGIN SETTINGS -->
## Loans → Add loan / Edit loan

### Loan type <!-- S-LOAN-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** (both the list dialog and the detail-page dialog) |
| Purpose | Kind of loan |
| Default | `Home` in the add form (source: `apps/web/src/pages/loans/LoanListPage.tsx:338`); the server has no default (required) |
| Values | Home, Car, Personal, Education, Business, Gold, LAS, Other. Each except **Other** maps to a market loan type for **Compare with market** and refinance alerts; **Other** shows "No market data for this loan type." Also sets the card's watermark icon and the alert wording ("Home loan", "Loan against securities", …) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Loan.loanType` |
| Backend effect | Market-rate lookup in market check and daily refinance check |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:56`, `packages/shared/src/loans/loanChecks.ts:48`, `packages/api/src/services/loans/loanChecks/loanAlertText.ts:7` |

### Prepayment option <!-- S-LOAN-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** (list dialog only) |
| Purpose | What a prepayment does to the schedule |
| Default | `Reduce tenure` (form: `apps/web/src/pages/loans/LoanListPage.tsx:347`; server fallback `REDUCE_TENURE`: `packages/api/src/services/loans/loans.service.ts:740`; DB default `packages/api/prisma/schema.prisma:3073`) |
| Values | `Reduce tenure`: same EMI, schedule ends earlier · `Reduce EMI`: same end month, EMI recomputed after each prepayment/foreclosure |
| Depends on | Only matters when prepayments are recorded (F-LOAN-007) |
| Persists | Yes — server |
| Stored in | `Loan.prepaymentOption` |
| Backend effect | Schedule rebuild in summary, schedule, market check, alerts |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:519`, `packages/api/src/services/loans/loans.service.ts:333` |

### Rate type <!-- S-LOAN-003 -->
| Attribute | Value |
|---|---|
| Control type | Select (also **Fixed** / **Floating** buttons on **Compare with market**) |
| Location | **Loans → Add loan / Edit loan**; loan page **Compare with market** |
| Purpose | Whether the loan's rate is fixed or follows a benchmark |
| Default | `Not sure` (form: `apps/web/src/pages/loans/LoanRateFields.tsx:24`; DB default `UNKNOWN`: `packages/api/prisma/schema.prisma:3085`) |
| Values | `Fixed`: "Fixed rate - no benchmark alerts." · `Floating`: shows **Linked to** and **Next rate reset**; eligible for benchmark alerts · `Not sure`: the market card asks "Fixed or floating?" |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Loan.rateType` |
| Backend effect | Switching away from Floating clears benchmark and reset date; a benchmark or reset date for a non-floating loan is refused ("A benchmark and a reset date apply to floating-rate loans only") |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:62`, `apps/web/src/pages/loans/MarketCheckCard.tsx:150`, `packages/api/src/services/loans/loans.service.ts:176`, `packages/shared/src/loans/loanChecks.ts:16` |

### Linked to <!-- S-LOAN-004 -->
| Attribute | Value |
|---|---|
| Control type | Select (shown only for Floating) |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Which benchmark a floating loan follows |
| Default | `Not set` (source: `apps/web/src/pages/loans/LoanRateFields.tsx:90`) |
| Values | `Repo rate (EBLR)`: repo alerts; reset step 3 months · `MCLR`: the lender's 1-year MCLR (repo shown if the lender is not tracked); reset step 12 months · `Other / not sure` or `Not set`: no benchmark alerts; card says to set it |
| Depends on | S-LOAN-003 = Floating |
| Persists | Yes — server |
| Stored in | `Loan.rateBenchmark` |
| Backend effect | Selects benchmark series for the market card and daily benchmark alerts |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:80`, `packages/shared/src/loans/loanChecks.ts:24`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:61`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:202` |

### Next rate reset (optional) <!-- S-LOAN-005 -->
| Attribute | Value |
|---|---|
| Control type | Date (shown only for Floating) |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Next date the lender revises the rate |
| Default | Empty (source: `apps/web/src/pages/loans/LoanRateFields.tsx:25`) |
| Values | Any real date; used to estimate "(≈ <date>)" in benchmark alerts, rolled forward by 3 or 12 months until on or after today |
| Depends on | S-LOAN-003 = Floating |
| Persists | Yes — server |
| Stored in | `Loan.nextRateResetDate` |
| Backend effect | Alert text only; "Not a real date" refused |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:97`, `packages/shared/src/loans/loanChecks.ts:154`, `packages/api/src/services/loans/loans.service.ts:182` |

### Tax benefit section <!-- S-LOAN-006 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Turns on the tax benefit panel |
| Default | `None` (source: `apps/web/src/pages/loans/LoanListPage.tsx:348`) |
| Values | `None`: no panel · `80C + 24B (Home loan)`: principal ≤ ₹1,50,000 and interest ≤ ₹2,00,000 this FY, saving at 30% · `80E (Education loan)`: all interest this FY, saving at 30% |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Loan.taxBenefitSection` (`80C+24B`, `80E`; older rows may hold `80C_24B`, treated the same) |
| Backend effect | `taxBenefit` in the loan summary |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:548`, `packages/api/src/services/loans/loans.service.ts:56`, `packages/api/src/services/loans/loans.service.ts:577` |

### Status <!-- S-LOAN-007 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Lifecycle of the loan |
| Default | `Active` (form `apps/web/src/pages/loans/LoanListPage.tsx:349`; server `packages/api/src/services/loans/loans.service.ts:745`) |
| Values | `Active`: outstanding from schedule, next EMI, reminders, market card, refinance/benchmark alerts, dashboard liability · `Closed` / `Foreclosed`: listed under **Closed / Foreclosed** showing loan amount; no reminders, no market card · `Default`: same as Closed, stamped **Default**; not counted as a liability on the dashboard |
| Depends on | Recording a **Foreclosure** payment sets `Foreclosed` automatically; deleting it reverts to `Active` |
| Persists | Yes — server |
| Stored in | `Loan.status`, `Loan.closedDate` (set only by a foreclosure payment) |
| Backend effect | Filters in alerts, loan checks, dashboard |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:566`, `apps/web/src/pages/loans/LoanListPage.tsx:155`, `packages/api/src/services/loans/loans.service.ts:856`, `packages/api/src/services/loans/loans.service.ts:951`, `packages/api/src/services/analytics/dashboard.service.ts:239` |

### Portfolio <!-- S-LOAN-008 -->
| Attribute | Value |
|---|---|
| Control type | Portfolio picker |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | "Optional — assign this loan to a portfolio to group it with related assets." |
| Default | None (source: `apps/web/src/pages/loans/LoanListPage.tsx:350`) |
| Values | Any of your portfolios, or none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Loan.portfolioId` |
| Backend effect | None found in this module's screens (stored only) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:574`, `packages/api/src/services/loans/loans.service.ts:743` |

## Loans → Compare with market

### Switching costs (Processing fee (%) and Other charges (₹)) <!-- S-LOAN-009 -->
| Attribute | Value |
|---|---|
| Control type | Two text fields |
| Location | Loan page → **Compare with market** |
| Purpose | Costs of moving the loan to a cheaper lender |
| Default | 0.5% and ₹10,000 (source: `packages/shared/src/loans/loanChecks.ts:55`) |
| Values | Fee 0–10%; other charges 0 to ₹100 crore. Change **Switching costs**, **Net saving**, **Break-even** and the **Open in calculator** link |
| Depends on | Shown only when the market rate is below your rate |
| Persists | No — reset when the page reloads |
| Stored in | Not stored |
| Backend effect | None; the daily refinance alert always uses the defaults |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/MarketCheckCard.tsx:100`, `apps/web/src/pages/loans/marketCheck.ts:27`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:168` |

## Loans → Lend money / Edit loan given

### How will it be repaid? <!-- S-LOAN-010 -->
| Attribute | Value |
|---|---|
| Control type | Two toggle buttons |
| Location | **Loans given → Lend money / Edit** |
| Purpose | Repayment mode of a loan given |
| Default | `Whenever` (form `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:66`; DB default `FLEXIBLE`: `packages/api/prisma/schema.prisma:3012`) |
| Values | `Whenever` (FLEXIBLE): shows **Expected back by (optional)**; daily simple interest; reminders only with a date · `Monthly EMI` (EMI): shows **EMI (₹)**, **Months**, **First EMI on** (all required); instalment schedule, EMI reminders |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `LoanGiven.repaymentMode` (+ `dueDate` or `emiAmount`/`tenureMonths`/`firstEmiDate`) |
| Backend effect | Summary, schedule and reminder logic (F-LOAN-018, F-LOAN-020, F-LOAN-022) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:225`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:137`, `packages/api/src/services/loans/loansGiven.service.ts:450` |

## EMI Calculator → Calculate

### Calculate mode (EMI / Max loan / Tenure) <!-- S-EMI-001 -->
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

### Tenure unit (Years / Months) <!-- S-EMI-002 -->
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

### Prepayment Repeat <!-- S-EMI-003 -->
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

### Prepayment Effect <!-- S-EMI-004 -->
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

### Rate change: Bank adjusts <!-- S-EMI-005 -->
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

### Processing fee and charges <!-- S-EMI-006 -->
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

### Fee type <!-- S-EMI-007 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced** (fees on); each offer on **Compare** |
| Purpose | How the processing fee is given |
| Default | `% of loan` (source: `apps/web/src/pages/emi/emiState.ts:59`) |
| Values | `% of loan`: up to 10% · `Fixed Rs.`: an amount |
| Depends on | S-EMI-006 on (Calculate) |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:66`, `packages/shared/src/loans/apr.ts:14` |

### Tax benefit <!-- S-EMI-008 -->
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

### Tax regime <!-- S-EMI-009 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced → Tax benefit** |
| Purpose | Which income-tax regime applies |
| Default | `Old regime` (source: `apps/web/src/pages/emi/emiState.ts:60`) |
| Values | `Old regime`: deductions per **Loan for** · `New regime`: no deduction, note shown |
| Depends on | S-EMI-008 on |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:78`, `packages/shared/src/loans/emiTax.ts:57` |

### Loan for <!-- S-EMI-010 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Calculate → Advanced → Tax benefit** |
| Purpose | Which deduction rules apply |
| Default | `Home - self-occupied` (source: `apps/web/src/pages/emi/emiState.ts:60`); set automatically by **Use this rate** on Live rates |
| Values | `Home - self-occupied`: interest ≤ ₹2,00,000 + principal within 80C room · `Home - let out`: same, excess interest listed as carried forward (not valued) · `Education`: all interest, first 8 FYs · `Other (no benefit)`: none |
| Depends on | S-EMI-008 on |
| Persists | In the page address only |
| Stored in | URL |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/emi/AdvancedInputs.tsx:79`, `apps/web/src/pages/emi/liveRates.ts:4`, `packages/shared/src/loans/emiTax.ts:24` |

## EMI Calculator → Live rates

### Loan type (Live rates) <!-- S-EMI-011 -->
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

## Credit Cards → Add / Edit credit card

### Status (card) <!-- S-CARD-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Card lifecycle |
| Default | `Active` (form `apps/web/src/pages/creditCards/CreditCardListPage.tsx:288`; server `packages/api/src/services/banking/creditCards.service.ts:180`) |
| Values | `Active`: counted in the summary strip and dashboard, high-utilisation warning, reminders · `Blocked` / `Closed`: listed under **Blocked / Closed**, excluded from totals and reminders; **Payment due** only when an unpaid statement exists. (`INACTIVE` is accepted by the API but not offered.) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.status` |
| Backend effect | Filters for reminders and dashboard |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:546`, `packages/api/src/services/banking/creditCards.service.ts:26`, `packages/api/src/services/banking/creditCards.service.ts:450` |

### Network <!-- S-CARD-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Card network shown on the card face |
| Default | `— select —` (none); filled from the catalogue when a catalogue card is picked |
| Values | Visa, Mastercard, RuPay, American Express, Diners Club (`OTHER` accepted by the API) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.network` |
| Backend effect | None beyond display |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:258`, `packages/api/src/services/banking/creditCards.service.ts:24` |

### Statement day <!-- S-CARD-003 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Day of the month the bill is generated |
| Default | `1` (source: `apps/web/src/pages/creditCards/CreditCardListPage.tsx:284`) |
| Values | 1–31; shown on the card page ("Statement day: N") |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.statementDay` |
| Backend effect | None found (display only) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:515`, `packages/api/src/controllers/creditCards.controller.ts:34` |

### Due day <!-- S-CARD-004 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Credit Cards → Add card / Edit** |
| Purpose | Day of the month payment is due |
| Default | `20` (source: `apps/web/src/pages/creditCards/CreditCardListPage.tsx:285`) |
| Values | 1–31; with no unpaid statement, **Payment due** on the list is the next occurrence of this day (clamped to the month's last day) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `CreditCard.dueDay` |
| Backend effect | None (reminders use statement due dates) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/creditCards/CreditCardListPage.tsx:520`, `apps/web/src/lib/creditCardDue.ts:67` |
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| Page address `/emi?v=1&tab=…&s=…&c=…` | Entire EMI Calculator state (Calculate and Compare inputs, current tab), base64url JSON | 0.4 s after each change (replaces the history entry) | On every change | No — it is the state; an old or edited link falls back to defaults with a message |
| React Query cache `loans`, `loan`, `loan-summary`, `loan-amortization`, `loan-market-check`, `loans-given` (in memory) | Loans, summaries, schedules, market checks | On page load | After saves on these pages; otherwise after 30 s when a page remounts | Yes — up to 30 s (for example a card edit on the list does not refresh an open loan page's cache) |
| React Query cache `credit-cards`, `credit-card`, `credit-card-summary` (in memory) | Cards and statements | On page load | Statement changes refresh only the card page caches | Yes — the Credit Cards list can show old outstanding/due figures for up to 30 s after a statement change |
| React Query cache `loan-rates` (in memory) | Live rates per loan type | On tab load | After 10 minutes | Yes — up to 10 minutes |
| Revealed card number (component state only) | Full card number after **Show card number** | On reveal | Cleared when the card changes or the page unmounts | No — never cached or persisted |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| `ENABLE_LOAN_RATES_CRON` | `false` disables the 07:30 IST rate refresh and the loan checks that follow it | Enabled |
| `ENABLE_ALERT_CRONS` | `false` disables the 20:45 IST alert scan (EMI, money-lent and card reminders) | Enabled |
| `APP_ENCRYPTION_KEY` | Purpose: key that encrypts loan account numbers and card numbers at rest | See B06 / security reference; card-number reveal fails with "Could not decrypt the card number — the encryption key may have changed" if the key changes |
| `PII_BACKFILL_CLEAR_PLAINTEXT` | `true` clears legacy plaintext loan account numbers during the PII backfill | Legacy plaintext kept |
<!-- END OPERATOR-CONFIG -->
