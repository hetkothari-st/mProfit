[Index](../INDEX.md)

# Settings — Loans

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-loan-001"></a>
### Loan type
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:56`, `packages/shared/src/loans/loanChecks.ts:48`, `packages/api/src/services/loans/loanChecks/loanAlertText.ts:7` |

<a id="s-loan-002"></a>
### Prepayment option
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Loans → Add loan / Edit loan** (list dialog only) |
| Purpose | What a prepayment does to the schedule |
| Default | `Reduce tenure` (form: `apps/web/src/pages/loans/LoanListPage.tsx:347`; server fallback `REDUCE_TENURE`: `packages/api/src/services/loans/loans.service.ts:740`; DB default `packages/api/prisma/schema.prisma:3073`) |
| Values | `Reduce tenure`: same EMI, schedule ends earlier · `Reduce EMI`: same end month, EMI recomputed after each prepayment/foreclosure |
| Depends on | Only matters when prepayments are recorded ([F-LOAN-007](../features/F-LOAN-007.md)) |
| Persists | Yes — server |
| Stored in | `Loan.prepaymentOption` |
| Backend effect | Schedule rebuild in summary, schedule, market check, alerts |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:519`, `packages/api/src/services/loans/loans.service.ts:333` |

<a id="s-loan-003"></a>
### Rate type
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:62`, `apps/web/src/pages/loans/MarketCheckCard.tsx:150`, `packages/api/src/services/loans/loans.service.ts:176`, `packages/shared/src/loans/loanChecks.ts:16` |

<a id="s-loan-004"></a>
### Linked to
| Attribute | Value |
|---|---|
| Control type | Select (shown only for Floating) |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Which benchmark a floating loan follows |
| Default | `Not set` (source: `apps/web/src/pages/loans/LoanRateFields.tsx:90`) |
| Values | `Repo rate (EBLR)`: repo alerts; reset step 3 months · `MCLR`: the lender's 1-year MCLR (repo shown if the lender is not tracked); reset step 12 months · `Other / not sure` or `Not set`: no benchmark alerts; card says to set it |
| Depends on | [S-LOAN-003](../settings/loans.md#s-loan-003) = Floating |
| Persists | Yes — server |
| Stored in | `Loan.rateBenchmark` |
| Backend effect | Selects benchmark series for the market card and daily benchmark alerts |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:80`, `packages/shared/src/loans/loanChecks.ts:24`, `packages/api/src/services/loans/loanChecks/marketCheck.service.ts:61`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:202` |

<a id="s-loan-005"></a>
### Next rate reset (optional)
| Attribute | Value |
|---|---|
| Control type | Date (shown only for Floating) |
| Location | **Loans → Add loan / Edit loan** |
| Purpose | Next date the lender revises the rate |
| Default | Empty (source: `apps/web/src/pages/loans/LoanRateFields.tsx:25`) |
| Values | Any real date; used to estimate "(≈ <date>)" in benchmark alerts, rolled forward by 3 or 12 months until on or after today |
| Depends on | [S-LOAN-003](../settings/loans.md#s-loan-003) = Floating |
| Persists | Yes — server |
| Stored in | `Loan.nextRateResetDate` |
| Backend effect | Alert text only; "Not a real date" refused |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/LoanRateFields.tsx:97`, `packages/shared/src/loans/loanChecks.ts:154`, `packages/api/src/services/loans/loans.service.ts:182` |

<a id="s-loan-006"></a>
### Tax benefit section
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:548`, `packages/api/src/services/loans/loans.service.ts:56`, `packages/api/src/services/loans/loans.service.ts:577` |

<a id="s-loan-007"></a>
### Status
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:566`, `apps/web/src/pages/loans/LoanListPage.tsx:155`, `packages/api/src/services/loans/loans.service.ts:856`, `packages/api/src/services/loans/loans.service.ts:951`, `packages/api/src/services/analytics/dashboard.service.ts:239` |

<a id="s-loan-008"></a>
### Portfolio
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/LoanListPage.tsx:574`, `packages/api/src/services/loans/loans.service.ts:743` |

<a id="s-loan-009"></a>
### Switching costs (Processing fee (%) and Other charges (₹))
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/MarketCheckCard.tsx:100`, `apps/web/src/pages/loans/marketCheck.ts:27`, `packages/api/src/services/loans/loanChecks/loanAlerts.service.ts:168` |

<a id="s-loan-010"></a>
### How will it be repaid?
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
| Backend effect | Summary, schedule and reminder logic ([F-LOAN-018](../features/F-LOAN-018.md), [F-LOAN-020](../features/F-LOAN-020.md), [F-LOAN-022](../features/F-LOAN-022.md)) |
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:225`, `apps/web/src/pages/loans/given/LoanGivenFormDialog.tsx:137`, `packages/api/src/services/loans/loansGiven.service.ts:450` |
