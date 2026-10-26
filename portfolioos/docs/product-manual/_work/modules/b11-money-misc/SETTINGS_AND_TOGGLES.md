# Settings and Toggles Reference — Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting (B11)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Insurance, PPF & EPF, Forex, Goals, Income, Cash Activity, Accounting

<!-- BEGIN SETTINGS -->
## Insurance → Add a policy / Edit policy

### Type <!-- S-INS-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Kind of cover: Term life, Whole life, ULIP, Endowment, Health, Motor, Home, Travel, Personal accident |
| Default | Term life (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:52`) |
| Values | Life types count in **Life cover**, the nominee warning and section 123; Health in **Health cover**, section 126 and TPA fields; whole life/endowment/ULIP get **Surrender value**; life, health and personal accident allow critical illness; claim guides follow the type; default grace is 30/15 days only for life and health |
| Depends on | — |
| Persists | Yes — server |
| Stored in | InsurancePolicy.type |
| Backend effect | Recomputes the premium schedule and next due date when changed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:34`, `packages/shared/src/insurance/premiumSchedule.ts:45` |

### Paid (premium frequency) <!-- S-INS-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Insurance → Add policy / Edit** |
| Purpose | How often the premium is paid |
| Default | Yearly (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:57`) |
| Values | Monthly, Quarterly, Half-yearly, Yearly: due every 1/3/6/12 months from the start date; **Single premium**: no schedule, no grace, ₹0 in **Premiums a year**, hides **Next premium due** and **Grace period (days)** |
| Depends on | Start date |
| Persists | Yes — server |
| Stored in | InsurancePolicy.premiumFrequency |
| Backend effect | Schedule and reminders |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/shared/src/insurance/premiumSchedule.ts:18` |

### Next premium due <!-- S-INS-003 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Insurance → Add policy / Edit** |
| Purpose | The first premium you want tracked; earlier premiums count as paid |
| Default | Blank → today on the server (source: `packages/api/src/services/insurance/insurance.service.ts:494`) |
| Values | A date: unpaid premiums before it become "untracked" |
| Depends on | Hidden for Single premium |
| Persists | Yes — server |
| Stored in | InsurancePolicy.premiumsTrackedFrom (and nextPremiumDue recomputed) |
| Backend effect | Moves the next due date and reminders; on edit sent only when changed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/components/insurance/PolicyFormDialog.tsx:358` |

### Grace period (days) <!-- S-INS-004 -->
| Attribute | Value |
|---|---|
| Control type | Number text |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Days to pay a missed premium before the policy lapses |
| Default | Blank = usual: 30 days (life/health, non-monthly), 15 days (monthly), none otherwise (source: `packages/shared/src/insurance/premiumSchedule.ts:89`) |
| Values | 0–90 days |
| Depends on | Hidden for Single premium |
| Persists | Yes — server |
| Stored in | InsurancePolicy.gracePeriodDays |
| Backend effect | Decides "In grace" vs "May have lapsed" and grace reminders |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/controllers/insurance.controller.ts:80` |

### Critical illness cover <!-- S-INS-005 -->
| Attribute | Value |
|---|---|
| Control type | Select + optional amount |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Records whether the policy pays on a listed illness |
| Default | Not recorded (source: `apps/web/src/components/insurance/PolicyFormDialog.tsx:62`) |
| Values | Not recorded / "Yes — included or added as a rider" (optional amount) / No |
| Depends on | Only life, health and personal-accident types |
| Persists | Yes — server |
| Stored in | InsurancePolicy.criticalIllnessCover, criticalIllnessSumAssured |
| Backend effect | Shown on card and policy page; cleared for other types |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:340` |

## Insurance → Gmail cards

### Find my insurance documents in Gmail (Turn on / Turn off) <!-- S-INS-006 -->
| Attribute | Value |
|---|---|
| Control type | Toggle button per Gmail account |
| Location | **Insurance → Find my insurance documents in Gmail** |
| Purpose | Permission to search that inbox for insurance PDFs |
| Default | Off (source: `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:4`) |
| Values | On: first search looks back 3 years, then a nightly search at 05:30 IST, plus **Scan now**; Off: cancels running searches |
| Depends on | A connected Gmail account |
| Persists | Yes — server |
| Stored in | MailboxAccount.insuranceFetchEnabled, insuranceFetchConsentAt |
| Backend effect | Starts INSURANCE Gmail scan jobs; document reading uses the AI model and the monthly reading budget; every change audit-logged |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `packages/api/src/services/insurance/insuranceGmailFetch.service.ts:58`, `packages/api/src/jobs/insuranceJobs.ts:18` |

### Remember it (encrypted) for future PDFs <!-- S-INS-007 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Insurance → Insurance documents from Gmail → Password protected** |
| Purpose | Save the PDF password so later PDFs open on their own |
| Default | On (source: `apps/web/src/components/insurance/InsuranceDocumentsCard.tsx:59`) |
| Values | On: stored encrypted; Off: used once |
| Depends on | — |
| Persists | Yes — server (when on) |
| Stored in | The user's encrypted document-password store |
| Backend effect | Tries the password on every other locked document |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | `packages/api/src/controllers/insurance.controller.ts:285` |

## Insurance → Tax on your premiums

### Who the policy covers <!-- S-INS-008 -->
| Attribute | Value |
|---|---|
| Control type | Select per health policy |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Which section 126 limit the premium counts towards |
| Default | Not set (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:298`) |
| Values | Not set (not counted), You, spouse and children, Your parents |
| Depends on | Health policies only |
| Persists | Yes — server |
| Stored in | InsurancePolicy.taxBucket |
| Backend effect | Tax summary limits |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:319` |

### Senior citizen (60+) <!-- S-INS-009 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox per health policy |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Raise the limit to ₹50,000 for that bucket |
| Default | Unticked (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:305`) |
| Values | On: ₹50,000 limit for the bucket; Off: ₹25,000 |
| Depends on | Health policies only |
| Persists | Yes — server |
| Stored in | InsurancePolicy.seniorCitizen |
| Backend effect | Tax summary |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/shared/src/insurance/tax.ts:53` |

### Tax summary open state and financial year <!-- S-INS-010 -->
| Attribute | Value |
|---|---|
| Control type | Fold toggle + select |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Show or fold the card; pick the year |
| Default | Folded; current financial year (source: `apps/web/src/components/insurance/TaxSummaryCard.tsx:45`) |
| Values | Open/folded; current FY and the two before |
| Depends on | — |
| Persists | Open state: this device only; year: no |
| Stored in | localStorage `insurance.taxSummary.open` |
| Backend effect | None |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/components/insurance/TaxSummaryCard.tsx:43` |

## Insurance → Coverage check

### Coverage assumptions <!-- S-INS-011 -->
| Attribute | Value |
|---|---|
| Control type | Money fields, years field, checkboxes, Yes/No/Not sure |
| Location | **Insurance → Coverage check** |
| Purpose | Figures behind the life and health verdicts |
| Default | Seeded from your data: income × 12, expenses × 12, support 20 years, loans, child-education goals ticked, savings and investments counted, health benchmark ₹10,00,000, parents "Not sure" (source: `packages/shared/src/insurance/coverage.ts:293`) |
| Values | Change any; verdicts recompute instantly |
| Depends on | — |
| Persists | No — lost when you leave; **Use my recorded figures** resets |
| Stored in | Page state only |
| Backend effect | None |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/pages/insurance/CoveragePage.tsx:43` |

## Insurance → Nominees

### Under 18 <!-- S-INS-012 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox per nominee |
| Location | **Insurance → policy → Nominees → Add/Edit** |
| Purpose | Marks a minor nominee who needs an appointee |
| Default | Unticked (source: `apps/web/src/components/insurance/NomineesCard.tsx:163`) |
| Values | On: **Appointee** required, **Appointee's relation** optional; Off: appointee cleared |
| Depends on | — |
| Persists | Yes — server |
| Stored in | InsurancePolicy.nominees[].isMinor |
| Backend effect | Server requires an appointee |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/insurance/insurance.service.ts:264` |

## PPF & EPF → Entry forms and auto-fetch

### Entry Type (EPF) <!-- S-PF-001 -->
| Attribute | Value |
|---|---|
| Control type | Radio tiles |
| Location | **PPF & EPF → Add → EPF entry** |
| Purpose | Kind of EPF entry |
| Default | Contribution (monthly) (source: `apps/web/src/pages/assetClasses/EPFFormDialog.tsx:154`) |
| Values | Contribution (monthly) and Opening / current balance add to the holding; Withdrawal / settlement reduces it; Annual interest credit is recorded but not added |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Transaction.transactionType |
| Backend effect | Holding recompute |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/assetClasses/EPFFormDialog.tsx:40` |

### Entry Type (PPF) <!-- S-PF-002 -->
| Attribute | Value |
|---|---|
| Control type | Radio tiles |
| Location | **PPF & EPF → Add → PPF entry** |
| Purpose | Kind of PPF entry |
| Default | Annual / partial deposit (source: `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:259`) |
| Values | Deposit and Opening balance add; Withdrawal and Account matured reduce; Yearly interest recorded but not added; deposits show **Account Maturity Date** |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Transaction.transactionType |
| Backend effect | Holding recompute |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/assetClasses/PPFNpsFormDialog.tsx:196` |

### Save credentials (encrypted) <!-- S-PF-003 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **PPF & EPF → Refresh** |
| Purpose | Store the portal UAN and password on the account |
| Default | Off (source: `apps/web/src/pages/pf/PfRefreshDialog.tsx:36`) |
| Values | On: saved encrypted and used by the worker; Off: passed only to this job |
| Depends on | — |
| Persists | Yes — server (when on) |
| Stored in | ProvidentFundAccount.storedCredentials (encrypted blob) |
| Backend effect | The worker prefers the saved blob when no inline credentials are passed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/controllers/pf.controller.ts:152` |

### Snooze 30d <!-- S-PF-004 -->
| Attribute | Value |
|---|---|
| Control type | Button |
| Location | **PPF & EPF → Auto-fetch accounts**, refresh banner |
| Purpose | Silence the refresh reminder for an account |
| Default | Not snoozed (source: `packages/api/prisma/schema.prisma:3464`) |
| Values | Snoozed for 30 days from the click |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ProvidentFundAccount.nudgeSnoozedUntil |
| Backend effect | Dismisses unread refresh alerts; daily job skips the account until the date |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:60` |

### Account type and bank (Link PF Account) <!-- S-PF-005 -->
| Attribute | Value |
|---|---|
| Control type | Toggle + select |
| Location | **PPF & EPF → Link account** |
| Purpose | Which portal the passbook is fetched from |
| Default | EPF; PPF bank SBI (source: `apps/web/src/pages/assetClasses/ProvidentFundPage.tsx:261`) |
| Values | EPF (EPFO), PPF at SBI, India Post, HDFC Bank, ICICI Bank, Axis Bank, Punjab National Bank, Bank of Baroda |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ProvidentFundAccount.type, institution |
| Backend effect | Chooses the scraper adapter |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/controllers/pf.controller.ts:79` |

## Forex → Cash and LRS

### Currency (balance) <!-- S-FX-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → Cash → Add balance / Edit** |
| Purpose | Currency of the balance |
| Default | USD (source: `apps/web/src/pages/forex/ForexCashTab.tsx:263`) |
| Values | USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ForexBalance.currency |
| Backend effect | INR equivalent uses that currency's latest rate |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/forex/constants.ts:3` |

### Purpose (LRS) <!-- S-FX-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → LRS & TCS → Record remittance** |
| Purpose | Reason for the remittance |
| Default | INVESTMENT (source: `apps/web/src/pages/forex/LrsTab.tsx:291`) |
| Values | INVESTMENT, EDUCATION, TRAVEL, GIFT, MAINTENANCE, MEDICAL, OTHER (stored only; no calculation differs) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | LrsRemittance.purpose |
| Backend effect | None beyond storage |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/forex/forex.service.ts:38` |

### Currency (remittance) <!-- S-FX-003 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → LRS & TCS → Record remittance** |
| Purpose | Currency sent |
| Default | USD (same line as S-FX-002) |
| Values | The 11 supported currencies |
| Depends on | FX rate box (blank = latest stored rate for that currency) |
| Persists | Yes — server |
| Stored in | LrsRemittance.currency |
| Backend effect | INR equivalent = amount × rate |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/forex/forex.service.ts:284` |

## Goals → Create goal / Edit goal

### Category <!-- S-GOAL-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Goals → New goal / Edit** |
| Purpose | Kind of goal |
| Default | Custom (source: `apps/web/src/pages/goals/GoalDialog.tsx:79`) |
| Values | Retirement, Child education, Home purchase, Emergency fund (counts only cash, FDs, RDs and post-office savings/RD/TD), FIRE corpus, Vehicle, Travel, Wealth building, Custom |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.category |
| Backend effect | Emergency fund restricts counted holdings; Child education goals are ticked by default in Coverage check |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goalMath.ts:63` |

### Priority <!-- S-GOAL-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Goals → New goal / Edit** |
| Purpose | Label only |
| Default | Medium (source: `apps/web/src/pages/goals/GoalDialog.tsx:80`) |
| Values | High, Medium, Low (badge colour only) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.priority |
| Backend effect | None |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/goals/GoalsPage.tsx:37` |

### Status <!-- S-GOAL-003 -->
| Attribute | Value |
|---|---|
| Control type | Select (edit only) |
| Location | **Goals → Edit** |
| Purpose | Which section the goal is in |
| Default | Active (source: `apps/web/src/pages/goals/GoalDialog.tsx:81`) |
| Values | Active, Achieved (stamps the achieved date), Paused, Abandoned |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.status, achievedAt |
| Backend effect | Achieved date set or cleared on each save |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goals.service.ts:115` |

### Inflation rate (decimal) <!-- S-GOAL-004 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Goals → New goal / Edit** |
| Purpose | Expected inflation for the target |
| Default | 0.06 (source: `apps/web/src/pages/goals/GoalDialog.tsx:84`) |
| Values | Fraction below 10; blank = none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.inflationRate |
| Backend effect | Computes an inflation-adjusted target that no screen shows; the needed return ignores it |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goals.service.ts:210` |

### Expected return (decimal) <!-- S-GOAL-005 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Goals → New goal / Edit** |
| Purpose | The return you expect, to judge on/off track |
| Default | 0.12 (source: `apps/web/src/pages/goals/GoalDialog.tsx:85`) |
| Values | Fraction below 10; blank = no on/off-track verdict |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.expectedReturn |
| Backend effect | **Off-track** when needed return > this |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goals.service.ts:246` |

### Linked portfolios <!-- S-GOAL-006 -->
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | **Goals → New goal / Edit** |
| Purpose | Portfolios whose value counts toward the goal |
| Default | None (source: `apps/web/src/pages/goals/GoalDialog.tsx:89`) |
| Values | Any of your portfolios |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.portfolioIds |
| Backend effect | Current value = initial amount + linked holdings' value |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/goals/goals.service.ts:180` |

## Income → Add income / Edit income

### Income type <!-- S-INC-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Income → Add income / Edit** |
| Purpose | Kind of income; changes the source label and suggestions |
| Default | Salary (source: `apps/web/src/pages/income/IncomeDialog.tsx:33`) |
| Values | Salary, Business, Trading, Freelance, Rental, Interest / Dividend, Capital Gains, Other; Rental, Interest / Dividend and Trading show suggestions |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Income.type |
| Backend effect | None beyond storage (all types count in the total) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/income/incomeTypeMeta.ts:3` |

### Currently active <!-- S-INC-002 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Income → Add income / Edit** |
| Purpose | Whether the income counts now |
| Default | On (source: `apps/web/src/pages/income/IncomeDialog.tsx:37`) |
| Values | On: in **Active** and the total, Health Score and Coverage check; Off: **Inactive**, not counted |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Income.isActive |
| Backend effect | `activeMonthlyIncomeTotal` counts only active entries |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/income/income.service.ts:113` |

## Cash Activity → List

### Direction tab (All / Inflows / Outflows) <!-- S-CASH-001 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Cash Activity** |
| Purpose | Filter entries by direction |
| Default | All (source: `apps/web/src/pages/cashflows/CashFlowsPage.tsx:17`) |
| Values | All, Inflows, Outflows (resets to page 1) |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` query parameter |
| Who can change | Anyone viewing |
| Sources | `apps/web/src/pages/cashflows/CashFlowsPage.tsx:57` |

## Accounting → Chart of Accounts and Vouchers

### Type (account) <!-- S-ACCT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Account nature |
| Default | ASSET (source: `apps/web/src/pages/accounting/AccountingPage.tsx:93`) |
| Values | ASSET and EXPENSE: debits raise the balance; LIABILITY, EQUITY, INCOME: credits raise it; INCOME/EXPENSE feed the P&L |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.type |
| Backend effect | Balance sign and statement placement |
| Who can change | R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/accounting/accounting.service.ts:460` |

### Parent Account <!-- S-ACCT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Where the account sits in the tree |
| Default | None (top-level), or the row's account when added with **+** (source: `apps/web/src/pages/accounting/AccountingPage.tsx:181`) |
| Values | Any of your accounts |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.parentId |
| Backend effect | Tree display; an account with sub-accounts can't be deleted |
| Who can change | R-PRO, R-MANAGER |
| Sources | `packages/api/src/services/accounting/accounting.service.ts:258` |

### Opening Balance (₹) <!-- S-ACCT-003 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Balance brought forward |
| Default | 0 (source: `apps/web/src/pages/accounting/AccountingPage.tsx:93`) |
| Values | Positive decimal on the account's normal side |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.openingBalance |
| Backend effect | Ledger opening, trial balance, balance-sheet difference line |
| Who can change | R-PRO, R-MANAGER |
| Sources | `packages/api/src/schemas/accounting.schema.ts:43` |

### Voucher type <!-- S-ACCT-004 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Vouchers → New Voucher** |
| Purpose | Kind of voucher; sets the number prefix |
| Default | JOURNAL (source: `apps/web/src/pages/accounting/AccountingPage.tsx:218`) |
| Values | JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES; PAYMENT and RECEIPT are included in receipt bundles |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Voucher.type |
| Backend effect | Number uniqueness per type; bundle selection |
| Who can change | R-PRO, R-MANAGER |
| Sources | `packages/api/src/schemas/accounting.schema.ts:20` |

### Voucher type filter <!-- S-ACCT-005 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Vouchers** |
| Purpose | Narrow the list and the receipt bundles |
| Default | All types (source: `apps/web/src/pages/accounting/AccountingPage.tsx:431`) |
| Values | All types or one type |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` parameter for list and bundles |
| Who can change | R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/accounting/AccountingPage.tsx:389` |
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| localStorage `insurance.taxSummary.open` | Whether **Tax on your premiums** is open ("1"/"0") | On fold/unfold | — | No — it is a preference; missing storage means folded |
| React Query cache `insurance-policies`, `insurance-policy`, `insurance-documents`, `insurance-gmail-fetch`, `insurance-tax-summary` (memory) | Policies, documents, Gmail status, tax summary | On page load | After saves in these pages; Gmail status every 5 s while a search runs; otherwise after 30 s on remount | Yes — up to 30 s |
| React Query cache `forex ticker` (memory) | FX rates | On load | Every 30 s | Up to 30 s |
| React Query cache `voucher-next-no` (memory) | Suggested voucher number | When **New Voucher** first renders for a type | Not after a save (defect) | Yes — repeats the same number |
| React Query cache `pf-accounts`, `goals`, `income`, `cashflows`, accounting keys (memory) | Lists | On load | After saves; otherwise 30 s | Up to 30 s |
| Revealed policy number (component state) | Full policy number | On reveal | Cleared when the policy changes or the page unmounts | No |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| `ENABLE_ALERT_CRONS` | `false` disables the 20:45 IST alert scan (premium and claim reminders) | Enabled |
| `ENABLE_INSURANCE_CRONS` | `false` disables the 05:30 IST insurance Gmail search and the startup policy-number encryption | Enabled |
| `APP_ENCRYPTION_KEY` | Purpose: key for policy numbers and other encrypted identifiers | Policy numbers stay unencrypted (startup warning) |
| `ANTHROPIC_API_KEY`, `ENABLE_LLM_PARSER`, `LLM_MODEL` | Purpose: model access for reading insurance documents | Documents stay "Not read yet." |
| `ENABLE_PF_NUDGE_CRON` | `false` disables the daily PF refresh-due alert | Enabled |
| `ENABLE_PF_WORKER` | `false` disables the PF portal fetch worker | Enabled |
| `REDIS_URL` | Queue for PF portal fetches | Local default; without Redis, refresh says "Could not start this right now…" |
| `ENABLE_PRICE_CRONS` | `false` disables the hourly FX sync (and other price jobs) | Enabled |
| `ENABLE_STARTUP_SYNC` | Startup refresh of stale feeds including FX older than 6 hours | See B10 |
<!-- END OPERATOR-CONFIG -->
