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
| Default | Term life (source: @@W/components/insurance/PolicyFormDialog.tsx#type: p?.type ?? 'TERM',@@) |
| Values | Life types count in **Life cover**, the nominee warning and section 123; Health in **Health cover**, section 126 and TPA fields; whole life/endowment/ULIP get **Surrender value**; life, health and personal accident allow critical illness; claim guides follow the type; default grace is 30/15 days only for life and health |
| Depends on | — |
| Persists | Yes — server |
| Stored in | InsurancePolicy.type |
| Backend effect | Recomputes the premium schedule and next due date when changed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/insurance/insurance.service.ts#export const POLICY_TYPES@@, @@S/insurance/premiumSchedule.ts#const LIFE_OR_HEALTH@@ |

### Paid (premium frequency) <!-- S-INS-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Insurance → Add policy / Edit** |
| Purpose | How often the premium is paid |
| Default | Yearly (source: @@W/components/insurance/PolicyFormDialog.tsx#premiumFrequency: p?.premiumFrequency ?? 'ANNUAL',@@) |
| Values | Monthly, Quarterly, Half-yearly, Yearly: due every 1/3/6/12 months from the start date; **Single premium**: no schedule, no grace, ₹0 in **Premiums a year**, hides **Next premium due** and **Grace period (days)** |
| Depends on | Start date |
| Persists | Yes — server |
| Stored in | InsurancePolicy.premiumFrequency |
| Backend effect | Schedule and reminders |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@S/insurance/premiumSchedule.ts#export const PREMIUM_FREQUENCY_MONTHS@@ |

### Next premium due <!-- S-INS-003 -->
| Attribute | Value |
|---|---|
| Control type | Date |
| Location | **Insurance → Add policy / Edit** |
| Purpose | The first premium you want tracked; earlier premiums count as paid |
| Default | Blank → today on the server (source: @@A/services/insurance/insurance.service.ts#premiumsTrackedFrom: toDate(input.nextPremiumDue ?? todayIso()),@@) |
| Values | A date: unpaid premiums before it become "untracked" |
| Depends on | Hidden for Single premium |
| Persists | Yes — server |
| Stored in | InsurancePolicy.premiumsTrackedFrom (and nextPremiumDue recomputed) |
| Backend effect | Moves the next due date and reminders; on edit sent only when changed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@W/components/insurance/PolicyFormDialog.tsx#Premiums before this date count as already paid.@@ |

### Grace period (days) <!-- S-INS-004 -->
| Attribute | Value |
|---|---|
| Control type | Number text |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Days to pay a missed premium before the policy lapses |
| Default | Blank = usual: 30 days (life/health, non-monthly), 15 days (monthly), none otherwise (source: @@S/insurance/premiumSchedule.ts#export function defaultGraceDays@@) |
| Values | 0–90 days |
| Depends on | Hidden for Single premium |
| Persists | Yes — server |
| Stored in | InsurancePolicy.gracePeriodDays |
| Backend effect | Decides "In grace" vs "May have lapsed" and grace reminders |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/controllers/insurance.controller.ts#gracePeriodDays: z.number().int().min(0).max(90)@@ |

### Critical illness cover <!-- S-INS-005 -->
| Attribute | Value |
|---|---|
| Control type | Select + optional amount |
| Location | **Insurance → Add policy / Edit** |
| Purpose | Records whether the policy pays on a listed illness |
| Default | Not recorded (source: @@W/components/insurance/PolicyFormDialog.tsx#criticalIllness: p?.criticalIllnessCover === true@@) |
| Values | Not recorded / "Yes — included or added as a rider" (optional amount) / No |
| Depends on | Only life, health and personal-accident types |
| Persists | Yes — server |
| Stored in | InsurancePolicy.criticalIllnessCover, criticalIllnessSumAssured |
| Backend effect | Shown on card and policy page; cleared for other types |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/insurance/insurance.service.ts#Only life, health and accident policies include critical illness cover@@ |

## Insurance → Gmail cards

### Find my insurance documents in Gmail (Turn on / Turn off) <!-- S-INS-006 -->
| Attribute | Value |
|---|---|
| Control type | Toggle button per Gmail account |
| Location | **Insurance → Find my insurance documents in Gmail** |
| Purpose | Permission to search that inbox for insurance PDFs |
| Default | Off (source: @@A/services/insurance/insuranceGmailFetch.service.ts#Permission is per Gmail account@@) |
| Values | On: first search looks back 3 years, then a nightly search at 05:30 IST, plus **Scan now**; Off: cancels running searches |
| Depends on | A connected Gmail account |
| Persists | Yes — server |
| Stored in | MailboxAccount.insuranceFetchEnabled, insuranceFetchConsentAt |
| Backend effect | Starts INSURANCE Gmail scan jobs; document reading uses the AI model and the monthly reading budget; every change audit-logged |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | @@A/services/insurance/insuranceGmailFetch.service.ts#export async function setInsuranceFetch@@, @@A/jobs/insuranceJobs.ts#'30 5 * * *'@@ |

### Remember it (encrypted) for future PDFs <!-- S-INS-007 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Insurance → Insurance documents from Gmail → Password protected** |
| Purpose | Save the PDF password so later PDFs open on their own |
| Default | On (source: @@W/components/insurance/InsuranceDocumentsCard.tsx#const [remember, setRemember] = useState(true);@@) |
| Values | On: stored encrypted; Off: used once |
| Depends on | — |
| Persists | Yes — server (when on) |
| Stored in | The user's encrypted document-password store |
| Backend effect | Tries the password on every other locked document |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO |
| Sources | @@A/controllers/insurance.controller.ts#remember: z.boolean().default(true),@@ |

## Insurance → Tax on your premiums

### Who the policy covers <!-- S-INS-008 -->
| Attribute | Value |
|---|---|
| Control type | Select per health policy |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Which section 126 limit the premium counts towards |
| Default | Not set (source: @@W/components/insurance/TaxSummaryCard.tsx#<option value="">Not set</option>@@) |
| Values | Not set (not counted), You, spouse and children, Your parents |
| Depends on | Health policies only |
| Persists | Yes — server |
| Stored in | InsurancePolicy.taxBucket |
| Backend effect | Tax summary limits |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/insurance/insurance.service.ts#Only a health policy counts towards the health-insurance deduction@@ |

### Senior citizen (60+) <!-- S-INS-009 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox per health policy |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Raise the limit to ₹50,000 for that bucket |
| Default | Unticked (source: @@W/components/insurance/TaxSummaryCard.tsx#checked={line.seniorCitizen === true}@@) |
| Values | On: ₹50,000 limit for the bucket; Off: ₹25,000 |
| Depends on | Health policies only |
| Persists | Yes — server |
| Stored in | InsurancePolicy.seniorCitizen |
| Backend effect | Tax summary |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@S/insurance/tax.ts#export const HEALTH_SENIOR_LIMIT@@ |

### Tax summary open state and financial year <!-- S-INS-010 -->
| Attribute | Value |
|---|---|
| Control type | Fold toggle + select |
| Location | **Insurance → Tax on your premiums** |
| Purpose | Show or fold the card; pick the year |
| Default | Folded; current financial year (source: @@W/components/insurance/TaxSummaryCard.tsx#function readOpen@@) |
| Values | Open/folded; current FY and the two before |
| Depends on | — |
| Persists | Open state: this device only; year: no |
| Stored in | localStorage `insurance.taxSummary.open` |
| Backend effect | None |
| Who can change | Anyone viewing |
| Sources | @@W/components/insurance/TaxSummaryCard.tsx#const OPEN_KEY@@ |

## Insurance → Coverage check

### Coverage assumptions <!-- S-INS-011 -->
| Attribute | Value |
|---|---|
| Control type | Money fields, years field, checkboxes, Yes/No/Not sure |
| Location | **Insurance → Coverage check** |
| Purpose | Figures behind the life and health verdicts |
| Default | Seeded from your data: income × 12, expenses × 12, support 20 years, loans, child-education goals ticked, savings and investments counted, health benchmark ₹10,00,000, parents "Not sure" (source: @@S/insurance/coverage.ts#export function defaultAssumptions@@) |
| Values | Change any; verdicts recompute instantly |
| Depends on | — |
| Persists | No — lost when you leave; **Use my recorded figures** resets |
| Stored in | Page state only |
| Backend effect | None |
| Who can change | Anyone viewing |
| Sources | @@W/pages/insurance/CoveragePage.tsx#const [edits, setEdits]@@ |

## Insurance → Nominees

### Under 18 <!-- S-INS-012 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox per nominee |
| Location | **Insurance → policy → Nominees → Add/Edit** |
| Purpose | Marks a minor nominee who needs an appointee |
| Default | Unticked (source: @@W/components/insurance/NomineesCard.tsx#Under 18@@) |
| Values | On: **Appointee** required, **Appointee's relation** optional; Off: appointee cleared |
| Depends on | — |
| Persists | Yes — server |
| Stored in | InsurancePolicy.nominees[].isMinor |
| Backend effect | Server requires an appointee |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/insurance/insurance.service.ts#is a minor — add an appointee@@ |

## PPF & EPF → Entry forms and auto-fetch

### Entry Type (EPF) <!-- S-PF-001 -->
| Attribute | Value |
|---|---|
| Control type | Radio tiles |
| Location | **PPF & EPF → Add → EPF entry** |
| Purpose | Kind of EPF entry |
| Default | Contribution (monthly) (source: @@W/pages/assetClasses/EPFFormDialog.tsx#transactionType: 'DEPOSIT',@@) |
| Values | Contribution (monthly) and Opening / current balance add to the holding; Withdrawal / settlement reduces it; Annual interest credit is recorded but not added |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Transaction.transactionType |
| Backend effect | Holding recompute |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@W/pages/assetClasses/EPFFormDialog.tsx#const TXN_LABELS@@ |

### Entry Type (PPF) <!-- S-PF-002 -->
| Attribute | Value |
|---|---|
| Control type | Radio tiles |
| Location | **PPF & EPF → Add → PPF entry** |
| Purpose | Kind of PPF entry |
| Default | Annual / partial deposit (source: @@W/pages/assetClasses/PPFNpsFormDialog.tsx#transactionType: 'DEPOSIT',@@) |
| Values | Deposit and Opening balance add; Withdrawal and Account matured reduce; Yearly interest recorded but not added; deposits show **Account Maturity Date** |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Transaction.transactionType |
| Backend effect | Holding recompute |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@W/pages/assetClasses/PPFNpsFormDialog.tsx#txnTypes: ['DEPOSIT', 'INTEREST_RECEIVED', 'WITHDRAWAL', 'OPENING_BALANCE', 'MATURITY'] as const,@@ |

### Save credentials (encrypted) <!-- S-PF-003 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **PPF & EPF → Refresh** |
| Purpose | Store the portal UAN and password on the account |
| Default | Off (source: @@W/pages/pf/PfRefreshDialog.tsx#const [save, setSave] = useState(false);@@) |
| Values | On: saved encrypted and used by the worker; Off: passed only to this job |
| Depends on | — |
| Persists | Yes — server (when on) |
| Stored in | ProvidentFundAccount.storedCredentials (encrypted blob) |
| Backend effect | The worker prefers the saved blob when no inline credentials are passed |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/controllers/pf.controller.ts#if (saveCredentials && credentials) {@@ |

### Snooze 30d <!-- S-PF-004 -->
| Attribute | Value |
|---|---|
| Control type | Button |
| Location | **PPF & EPF → Auto-fetch accounts**, refresh banner |
| Purpose | Silence the refresh reminder for an account |
| Default | Not snoozed (source: @@P/schema.prisma#nudgeSnoozedUntil DateTime?@@) |
| Values | Snoozed for 30 days from the click |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ProvidentFundAccount.nudgeSnoozedUntil |
| Backend effect | Dismisses unread refresh alerts; daily job skips the account until the date |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@W/pages/assetClasses/ProvidentFundPage.tsx#pfApi.snoozeNudge(accountId, 30)@@ |

### Account type and bank (Link PF Account) <!-- S-PF-005 -->
| Attribute | Value |
|---|---|
| Control type | Toggle + select |
| Location | **PPF & EPF → Link account** |
| Purpose | Which portal the passbook is fetched from |
| Default | EPF; PPF bank SBI (source: @@W/pages/assetClasses/ProvidentFundPage.tsx#useState<PpfInstitution>('SBI')@@) |
| Values | EPF (EPFO), PPF at SBI, India Post, HDFC Bank, ICICI Bank, Axis Bank, Punjab National Bank, Bank of Baroda |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ProvidentFundAccount.type, institution |
| Backend effect | Chooses the scraper adapter |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/controllers/pf.controller.ts#const CreateAccountSchema@@ |

## Forex → Cash and LRS

### Currency (balance) <!-- S-FX-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → Cash → Add balance / Edit** |
| Purpose | Currency of the balance |
| Default | USD (source: @@W/pages/forex/ForexCashTab.tsx#: { currency: 'USD', balance: '0' },@@) |
| Values | USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY |
| Depends on | — |
| Persists | Yes — server |
| Stored in | ForexBalance.currency |
| Backend effect | INR equivalent uses that currency's latest rate |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@W/pages/forex/constants.ts#export const SUPPORTED_CCY@@ |

### Purpose (LRS) <!-- S-FX-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Forex → LRS & TCS → Record remittance** |
| Purpose | Reason for the remittance |
| Default | INVESTMENT (source: @@W/pages/forex/LrsTab.tsx#defaultValues: { remittanceDate: today, currency: 'USD', purpose: 'INVESTMENT' },@@) |
| Values | INVESTMENT, EDUCATION, TRAVEL, GIFT, MAINTENANCE, MEDICAL, OTHER (stored only; no calculation differs) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | LrsRemittance.purpose |
| Backend effect | None beyond storage |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/forex/forex.service.ts#const VALID_PURPOSES@@ |

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
| Sources | @@A/services/forex/forex.service.ts#const inrEquivalent = new Decimal(foreignAmount.toString()).times(fxRate);@@ |

## Goals → Create goal / Edit goal

### Category <!-- S-GOAL-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Goals → New goal / Edit** |
| Purpose | Kind of goal |
| Default | Custom (source: @@W/pages/goals/GoalDialog.tsx#existing?.category ?? 'CUSTOM'@@) |
| Values | Retirement, Child education, Home purchase, Emergency fund (counts only cash, FDs, RDs and post-office savings/RD/TD), FIRE corpus, Vehicle, Travel, Wealth building, Custom |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.category |
| Backend effect | Emergency fund restricts counted holdings; Child education goals are ticked by default in Coverage check |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/goals/goalMath.ts#export function eligibleClassesForGoal@@ |

### Priority <!-- S-GOAL-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Goals → New goal / Edit** |
| Purpose | Label only |
| Default | Medium (source: @@W/pages/goals/GoalDialog.tsx#existing?.priority ?? 'MEDIUM'@@) |
| Values | High, Medium, Low (badge colour only) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.priority |
| Backend effect | None |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@W/pages/goals/GoalsPage.tsx#const PRIORITY_TONE@@ |

### Status <!-- S-GOAL-003 -->
| Attribute | Value |
|---|---|
| Control type | Select (edit only) |
| Location | **Goals → Edit** |
| Purpose | Which section the goal is in |
| Default | Active (source: @@W/pages/goals/GoalDialog.tsx#existing?.status ?? 'ACTIVE'@@) |
| Values | Active, Achieved (stamps the achieved date), Paused, Abandoned |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.status, achievedAt |
| Backend effect | Achieved date set or cleared on each save |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/goals/goals.service.ts#achievedAt: input.status === 'ACHIEVED' ? new Date() : null,@@ |

### Inflation rate (decimal) <!-- S-GOAL-004 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Goals → New goal / Edit** |
| Purpose | Expected inflation for the target |
| Default | 0.06 (source: @@W/pages/goals/GoalDialog.tsx#existing?.inflationRate ?? '0.06'@@) |
| Values | Fraction below 10; blank = none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.inflationRate |
| Backend effect | Computes an inflation-adjusted target that no screen shows; the needed return ignores it |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/goals/goals.service.ts#const inflationAdjustedTarget = calcInflationTarget(@@ |

### Expected return (decimal) <!-- S-GOAL-005 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Goals → New goal / Edit** |
| Purpose | The return you expect, to judge on/off track |
| Default | 0.12 (source: @@W/pages/goals/GoalDialog.tsx#existing?.expectedReturn ?? '0.12'@@) |
| Values | Fraction below 10; blank = no on/off-track verdict |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.expectedReturn |
| Backend effect | **Off-track** when needed return > this |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/goals/goals.service.ts#? requiredCagr <= d(goal.expectedReturn).toNumber()@@ |

### Linked portfolios <!-- S-GOAL-006 -->
| Attribute | Value |
|---|---|
| Control type | Checkboxes |
| Location | **Goals → New goal / Edit** |
| Purpose | Portfolios whose value counts toward the goal |
| Default | None (source: @@W/pages/goals/GoalDialog.tsx#new Set(existing?.portfolioIds ?? [])@@) |
| Values | Any of your portfolios |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Goal.portfolioIds |
| Backend effect | Current value = initial amount + linked holdings' value |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/goals/goals.service.ts#where: { id: { in: goal.portfolioIds }, userId },@@ |

## Income → Add income / Edit income

### Income type <!-- S-INC-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Income → Add income / Edit** |
| Purpose | Kind of income; changes the source label and suggestions |
| Default | Salary (source: @@W/pages/income/IncomeDialog.tsx#existing?.type ?? 'SALARY'@@) |
| Values | Salary, Business, Trading, Freelance, Rental, Interest / Dividend, Capital Gains, Other; Rental, Interest / Dividend and Trading show suggestions |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Income.type |
| Backend effect | None beyond storage (all types count in the total) |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@W/pages/income/incomeTypeMeta.ts#export const INCOME_TYPE_LABEL@@ |

### Currently active <!-- S-INC-002 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox |
| Location | **Income → Add income / Edit** |
| Purpose | Whether the income counts now |
| Default | On (source: @@W/pages/income/IncomeDialog.tsx#existing?.isActive ?? true@@) |
| Values | On: in **Active** and the total, Health Score and Coverage check; Off: **Inactive**, not counted |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Income.isActive |
| Backend effect | `activeMonthlyIncomeTotal` counts only active entries |
| Who can change | R-FREE, R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | @@A/services/income/income.service.ts#export async function activeMonthlyIncomeTotal@@ |

## Cash Activity → List

### Direction tab (All / Inflows / Outflows) <!-- S-CASH-001 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Cash Activity** |
| Purpose | Filter entries by direction |
| Default | All (source: @@W/pages/cashflows/CashFlowsPage.tsx#useState<Tab>('all')@@) |
| Values | All, Inflows, Outflows (resets to page 1) |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` query parameter |
| Who can change | Anyone viewing |
| Sources | @@W/pages/cashflows/CashFlowsPage.tsx#onClick={() => { setTab(t); setPage(1); }}@@ |

## Accounting → Chart of Accounts and Vouchers

### Type (account) <!-- S-ACCT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Account nature |
| Default | ASSET (source: @@W/pages/accounting/AccountingPage.tsx#code: '', name: '', type: 'ASSET' as AccountType@@) |
| Values | ASSET and EXPENSE: debits raise the balance; LIABILITY, EQUITY, INCOME: credits raise it; INCOME/EXPENSE feed the P&L |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.type |
| Backend effect | Balance sign and statement placement |
| Who can change | R-PRO, R-MANAGER |
| Sources | @@A/services/accounting/accounting.service.ts#const isDebitNature@@ |

### Parent Account <!-- S-ACCT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Where the account sits in the tree |
| Default | None (top-level), or the row's account when added with **+** (source: @@W/pages/accounting/AccountingPage.tsx#<option value="">None (top-level)</option>@@) |
| Values | Any of your accounts |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.parentId |
| Backend effect | Tree display; an account with sub-accounts can't be deleted |
| Who can change | R-PRO, R-MANAGER |
| Sources | @@A/services/accounting/accounting.service.ts#Cannot delete account with sub-accounts@@ |

### Opening Balance (₹) <!-- S-ACCT-003 -->
| Attribute | Value |
|---|---|
| Control type | Number |
| Location | **Accounting → Chart of Accounts → Add account** |
| Purpose | Balance brought forward |
| Default | 0 (source: @@W/pages/accounting/AccountingPage.tsx#parentId: '', openingBalance: '0',@@) |
| Values | Positive decimal on the account's normal side |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Account.openingBalance |
| Backend effect | Ledger opening, trial balance, balance-sheet difference line |
| Who can change | R-PRO, R-MANAGER |
| Sources | @@A/schemas/accounting.schema.ts#openingBalance: moneyString.optional(),@@ |

### Voucher type <!-- S-ACCT-004 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Vouchers → New Voucher** |
| Purpose | Kind of voucher; sets the number prefix |
| Default | JOURNAL (source: @@W/pages/accounting/AccountingPage.tsx#initial?.type ?? 'JOURNAL'@@) |
| Values | JOURNAL, PAYMENT, RECEIPT, CONTRA, PURCHASE, SALES; PAYMENT and RECEIPT are included in receipt bundles |
| Depends on | — |
| Persists | Yes — server |
| Stored in | Voucher.type |
| Backend effect | Number uniqueness per type; bundle selection |
| Who can change | R-PRO, R-MANAGER |
| Sources | @@A/schemas/accounting.schema.ts#export const VOUCHER_TYPES@@ |

### Voucher type filter <!-- S-ACCT-005 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Accounting → Vouchers** |
| Purpose | Narrow the list and the receipt bundles |
| Default | All types (source: @@W/pages/accounting/AccountingPage.tsx#<option value="">All types</option>@@) |
| Values | All types or one type |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `type` parameter for list and bundles |
| Who can change | R-PRO, R-MANAGER |
| Sources | @@W/pages/accounting/AccountingPage.tsx#...(filterType ? { type: filterType as VoucherType } : {}),@@ |
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
