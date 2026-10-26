# Settings and Toggles Reference — Advisor, Professional workspace, Split Expenses (B09)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Investment Advisor, Professional workspace, Split Expenses

Professional access rights (what a professional may see and change, and the access window) are set by the account holder on Account Access and documented by B06 (D-CA-001); they are not repeated here.

<!-- BEGIN SETTINGS -->
## Advisor → Risk questionnaire

### Age <!-- S-ADV-001 -->
| Attribute | Value |
|---|---|
| Control type | Number field ("How old are you?") |
| Location | **Overview → Advisor → Tell us how you invest / Retake your risk assessment** |
| Purpose | Applies the age guardrail |
| Default | Blank; on a retake the last answer (`apps/web/src/pages/advisor/RiskQuestionnaire.tsx:159`) |
| Values | Web accepts 18–100; server accepts 1–120 (and null). Age 55 or more caps an Aggressive score at Growth |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers` (new row per submission) |
| Backend effect | Override `AGE_CAP` recorded in `overrides` |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:176`, `packages/api/src/services/analytics/riskProfileMath.ts:85`, `packages/api/src/services/advisor/riskProfile.service.ts:166` |

### Investment horizon <!-- S-ADV-002 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("When will you need most of this money?") |
| Location | **Overview → Advisor →** questionnaire Q2 |
| Purpose | Weight 20 in the risk score |
| Default | None (must choose) |
| Values | Under 3 years (0), 3 to 7 years (0.4), 7 to 15 years (0.75), More than 15 years (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.horizon` |
| Backend effect | Changes score → category → model portfolio |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:29`, `packages/api/src/services/analytics/riskProfileMath.ts:60` |

### Drawdown reaction <!-- S-ADV-003 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("Your portfolio drops 20% in three months. What do you actually do?") |
| Location | Questionnaire Q3 |
| Purpose | Weight 25 (largest) in the risk score |
| Default | None |
| Values | Sell everything (0), Sell some of it (0.35), Hold and do nothing (0.8), Buy more (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.drawdownReaction` |
| Backend effect | Changes score and category |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:36`, `packages/api/src/services/analytics/riskProfileMath.ts:61` |

### Investable share of income <!-- S-ADV-004 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("Roughly what share of your take-home income do you invest each month?") |
| Location | Questionnaire Q4 |
| Purpose | Weight 15 in the risk score |
| Default | None |
| Values | Under 10% (0), 10–20% (0.4), 20–35% (0.75), Over 35% (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.investableShareOfIncome` |
| Backend effect | Changes score and category |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:43`, `packages/api/src/services/analytics/riskProfileMath.ts:62` |

### Objective <!-- S-ADV-005 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("What is this portfolio mainly for?") |
| Location | Questionnaire Q5 |
| Purpose | Weight 20 in the risk score |
| Default | None |
| Values | Protect what I have (0), Generate regular income (0.35), Grow steadily with some safety (0.7), Grow as fast as possible (1) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.objective` |
| Backend effect | Changes score and category |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:50`, `packages/api/src/services/analytics/riskProfileMath.ts:63` |

### Emergency fund <!-- S-ADV-006 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("Do you have an emergency fund you could live on for six months?") |
| Location | Questionnaire Q6 |
| Purpose | Guardrail — not scored |
| Default | None |
| Values | Yes: no change · No, not yet: Aggressive → Growth and Growth → Balanced (recorded as `NO_EMERGENCY_FUND`) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.answers.hasEmergencyFund` |
| Backend effect | Lowers category |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:64`, `packages/api/src/services/analytics/riskProfileMath.ts:120` |

### Tax slab <!-- S-ADV-007 -->
| Attribute | Value |
|---|---|
| Control type | Button group ("Which income-tax slab are you in?") |
| Location | Questionnaire Q7 |
| Purpose | Tax rate used in advice text (for example tax-loss harvesting) |
| Default | None |
| Values | 5% → 5 · 20% → 20 · 30% → 30 · Not sure → unknown (shown "Not sure") |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `RiskProfileAssessment.taxSlabPct` |
| Backend effect | Shown on the profile; engine facts |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/RiskQuestionnaire.tsx:57`, `packages/api/src/services/analytics/riskProfileMath.ts:65` |

## Advisor → Recommendations

### Recommendation status tab <!-- S-ADV-008 -->
| Attribute | Value |
|---|---|
| Control type | Tabs |
| Location | **Overview → Advisor → What to do next** |
| Purpose | Filter the feed |
| Default | `Open` (`apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:33`) |
| Values | Open, Accepted, Snoozed, Done, Dismissed |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | `status` query parameter |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/widgets/RecommendationFeed.tsx:15` |

## Advisor → Override list

### Bucket (override list) <!-- S-ADV-009 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Overview → Advisor → Override list** |
| Purpose | The bucket an approved product is attached to |
| Default | Equity — Domestic (first bucket) (`apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:34`) |
| Values | Equity — Domestic, Equity — International, Debt, Gold, Real assets, Cash equivalent, Other / alternatives |
| Depends on | A risk profile (model portfolio) |
| Persists | The selection no; the added product yes |
| Stored in | `AdvisorApprovedProduct.bucket` |
| Backend effect | Non-empty bucket → engine names your products for that bucket first |
| Who can change | R-PLUS, R-FAMILY, R-PRO, R-MANAGER |
| Sources | `apps/web/src/pages/advisor/ApprovedProductsPanel.tsx:164`, `packages/api/src/services/advisor/productResolution.ts:11` |

## Client books → Chart of accounts

### Account type <!-- S-CA-001 -->
| Attribute | Value |
|---|---|
| Control type | Select (new account only) |
| Location | **Client books → client → Chart of accounts → New account** |
| Purpose | Which statement side the balance falls on |
| Default | Asset (`apps/web/src/components/ca/AccountFormDialog.tsx:45`) |
| Values | Asset, Liability, Income, Expense, Equity |
| Depends on | Client's books right |
| Persists | Yes — server (client's books) |
| Stored in | Client's `Account.type` |
| Backend effect | Cannot be changed later from the page |
| Who can change | R-PROF / R-PRO with books right |
| Sources | `apps/web/src/api/ca.api.ts:419`, `packages/api/src/schemas/accounting.schema.ts:41` |

## Client books → Vouchers

### Voucher type <!-- S-CA-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Client books → client → Vouchers → Post voucher** |
| Purpose | Kind of voucher; also selects the next number series |
| Default | Journal (`apps/web/src/components/ca/VoucherFormDialog.tsx:51`) |
| Values | Journal, Payment, Receipt, Contra, Purchase, Sales |
| Depends on | Books right |
| Persists | Yes — server |
| Stored in | Client's `Voucher.type` |
| Backend effect | Next number fetched per (client, type) |
| Who can change | R-PROF / R-PRO with books right |
| Sources | `apps/web/src/api/ca.api.ts:420`, `packages/api/src/schemas/accounting.schema.ts:56` |

## Client books → Transactions

### Transaction type and asset class <!-- S-CA-003 -->
| Attribute | Value |
|---|---|
| Control type | Two selects |
| Location | **Client books → client → Transactions → Add transaction** |
| Purpose | Kind of trade and asset class; asset class decides which name fields show |
| Default | Buy / Equity (`apps/web/src/components/ca/AddTransactionDialog.tsx:41`) |
| Values | Types: Buy, Sell, SIP, Switch in, Switch out, Dividend payout, Dividend reinvest, Bonus, Split, Redemption · Asset classes: 26 (Equity, Mutual fund, ETF, bonds, deposits, NPS/PPF/EPF, gold/silver, crypto, REIT/InvIT, PMS/AIF/ULIP, foreign equity, real estate, art, cash, other) |
| Depends on | Transactions right |
| Persists | Yes — server |
| Stored in | Client's `Transaction` |
| Backend effect | Mutual fund → scheme fields; Equity/ETF/Foreign equity → symbol fields; others → asset name |
| Who can change | R-PROF / R-PRO with transactions right |
| Sources | `apps/web/src/api/ca.api.ts:394`, `apps/web/src/api/ca.api.ts:406`, `apps/web/src/components/ca/AddTransactionDialog.tsx:72` |

## Client books → Reports

### Report period filters <!-- S-CA-004 -->
| Attribute | Value |
|---|---|
| Control type | Select + three date fields |
| Location | **Client books → client → Reports** |
| Purpose | Parameters for each report (each uses what it needs) |
| Default | Current FY (April–March); As-of and To = today; From blank (`apps/web/src/components/ca/ClientReportsTab.tsx:37`) |
| Values | Financial year: current and 5 previous · dates YYYY-MM-DD |
| Depends on | — |
| Persists | No |
| Stored in | Page state |
| Backend effect | Sent as `fy`, `asOf`, `from`, `to` |
| Who can change | R-PROF, R-PRO |
| Sources | `apps/web/src/components/ca/ClientReportsTab.tsx:81` |

## Split Expenses → New group / group settings

### Group type <!-- S-SPLIT-001 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Tools → Split Expenses → New group** |
| Purpose | Label for the group |
| Default | Trip in the dialog; Other on the server when omitted (`packages/api/src/services/split/groups.service.ts:138`) |
| Values | Trip, Home, Couple, Other (1:1 ledgers are "DIRECT", created by the app) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `SplitGroup.type` |
| Backend effect | DIRECT groups can't change type or members |
| Who can change | Group creator at creation (type change is API-only) |
| Sources | `apps/web/src/pages/split/NewGroupDialog.tsx:15` |

### Group currency <!-- S-SPLIT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **New group → Currency** |
| Purpose | The group's base currency for balances |
| Default | INR (`packages/api/prisma/schema.prisma:5247`) |
| Values | INR, USD, EUR, GBP, AED, SGD, THB, JPY, AUD, CAD |
| Depends on | — |
| Persists | Yes — fixed after creation |
| Stored in | `SplitGroup.baseCurrency` |
| Backend effect | Non-INR groups can't use UPI pay/request links |
| Who can change | At creation only |
| Sources | `apps/web/src/pages/split/NewGroupDialog.tsx:21`, `packages/api/src/services/split/settings.service.ts:66` |

### Simplify debts <!-- S-SPLIT-003 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox ("Simplify debts (fewest payments to settle)") |
| Location | Group → **Settings** |
| Purpose | How suggested payments are computed |
| Default | On (`packages/api/prisma/schema.prisma:5248`) |
| Values | On: fewest payments (largest creditor vs largest debtor) · Off: person-to-person debts from each expense |
| Depends on | Not on 1:1 groups |
| Persists | Yes — server, saved immediately |
| Stored in | `SplitGroup.simplifyDebts` |
| Backend effect | Changes Balances list, friend totals, UPI amounts and reminders |
| Who can change | Any active member |
| Sources | `apps/web/src/pages/split/GroupPage.tsx:174`, `packages/api/src/services/split/settings.service.ts:52` |

### Archive group <!-- S-SPLIT-004 -->
| Attribute | Value |
|---|---|
| Control type | Button (**Archive group** / **Unarchive group**) |
| Location | Group → **Settings** |
| Purpose | Hide a finished group from the home list |
| Default | Not archived |
| Values | Archived: listed under **Show archived** · Unarchived: normal |
| Depends on | Confirmation when balances are unsettled |
| Persists | Yes — server |
| Stored in | `SplitGroup.archivedAt` |
| Backend effect | Archived groups still count in friend balances |
| Who can change | Any active member |
| Sources | `apps/web/src/pages/split/GroupPage.tsx:206`, `packages/api/src/services/split/groups.service.ts:177` |

## Split Expenses → Add / edit expense

### Split mode <!-- S-SPLIT-005 -->
| Attribute | Value |
|---|---|
| Control type | Tabs (**Equally**, **Exact**, **Percent**, **Shares**) |
| Location | **Add expense** dialog → **Split** |
| Purpose | How the amount is divided |
| Default | Equally |
| Values | Equally: ticked people share equally · Exact: amounts must sum to total · Percent: must total 100 · Shares: proportional weights (start at 1) |
| Depends on | — |
| Persists | Yes — per expense |
| Stored in | `SplitExpense.splitMode`, share `rawInput` |
| Backend effect | Allocation in whole paise; leftover paise by member id order |
| Who can change | Group members |
| Sources | `apps/web/src/pages/split/AddExpenseDialog.tsx:18`, `packages/api/src/services/split/allocate.ts:51` |

### Expense currency and exchange rate <!-- S-SPLIT-006 -->
| Attribute | Value |
|---|---|
| Control type | Select + number ("1 <ccy> in <group ccy>") |
| Location | **Add expense** dialog |
| Purpose | Record a bill in another currency |
| Default | Group currency; rate blank = latest stored rate |
| Values | Group currency + 10 listed currencies |
| Depends on | A stored rate when the rate is left blank |
| Persists | Yes — per expense (`fxRate`, `baseAmount`) |
| Stored in | `SplitExpense.currency`, `fxRate` |
| Backend effect | Base amount = amount × rate, rounded half-even to 2 places |
| Who can change | Group members |
| Sources | `apps/web/src/pages/split/AddExpenseDialog.tsx:114`, `packages/api/src/services/split/fx.ts:22` |

## Split Expenses → Split settings

### UPI ID <!-- S-SPLIT-007 -->
| Attribute | Value |
|---|---|
| Control type | Text |
| Location | **Split settings → Payments** |
| Purpose | Where friends pay you; used in your request links |
| Default | Empty (`packages/api/src/services/split/settings.service.ts:12`) |
| Values | name@bank format, or empty to remove |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `SplitSettings.upiId` |
| Backend effect | Shown to members who owe you (after you have taken part in the group) |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:65`, `packages/api/src/services/split/settings.service.ts:26` |

### Home currency <!-- S-SPLIT-008 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Split settings → Defaults** |
| Purpose | Currency of totals and friend balances |
| Default | INR (`packages/api/prisma/schema.prisma:5435`) |
| Values | 10 listed currencies |
| Depends on | Stored exchange rates for conversions |
| Persists | Yes — server |
| Stored in | `SplitSettings.homeCurrency` |
| Backend effect | Friend balances converted at the latest rate ("≈") |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:71`, `packages/api/src/services/split/ledger.service.ts:33` |

### Default portfolio <!-- S-SPLIT-009 -->
| Attribute | Value |
|---|---|
| Control type | Portfolio select ("None") |
| Location | **Split settings → Defaults** |
| Purpose | Portfolio used when you switch on "Add my share to Cash Activity" |
| Default | None |
| Values | One of your portfolios, or None (then you are asked each time) |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `SplitSettings.defaultPortfolioId` |
| Backend effect | Must be your own portfolio |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:77`, `apps/web/src/pages/split/ExpenseExtras.tsx:284` |

### Email about activity <!-- S-SPLIT-010 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox ("Email me about activity in my groups (at most hourly)") |
| Location | **Split settings → Emails** |
| Purpose | Hourly digest of others' changes |
| Default | On (`packages/api/prisma/schema.prisma:5441`) |
| Values | On: digest at :05 each hour when there is news · Off: none |
| Depends on | Server email |
| Persists | Yes — server |
| Stored in | `SplitSettings.emailOnActivity` |
| Backend effect | Activity digest job |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:85`, `packages/api/src/jobs/splitDigestJobs.ts:33` |

### Weekly balance summary <!-- S-SPLIT-011 -->
| Attribute | Value |
|---|---|
| Control type | Checkbox ("Weekly balance summary (Mondays)") |
| Location | **Split settings → Emails** |
| Purpose | Monday 09:00 IST summary of who owes whom |
| Default | Off (`packages/api/prisma/schema.prisma:5442`) |
| Values | On / Off |
| Depends on | Server email |
| Persists | Yes — server |
| Stored in | `SplitSettings.weeklyDigest` |
| Backend effect | Weekly digest job |
| Who can change | The user |
| Sources | `apps/web/src/pages/split/SplitSettingsPage.tsx:89`, `packages/api/src/jobs/splitDigestJobs.ts:34` |

## Split Expenses → Expense page

### Add my share to Cash Activity <!-- S-SPLIT-012 -->
| Attribute | Value |
|---|---|
| Control type | Switch |
| Location | Expense page → **Cash Activity** |
| Purpose | Mirror your share as an outflow in Cash Activity |
| Default | Off |
| Values | On: outflow created and kept in sync · Off: outflow deleted |
| Depends on | S-SPLIT-009 or a portfolio picked on the spot; a non-zero share |
| Persists | Yes — server |
| Stored in | `SplitShareLink` + `CashFlow` |
| Backend effect | Re-synced on expense edits and nightly at 02:30 IST |
| Who can change | Each member for their own share |
| Sources | `apps/web/src/pages/split/ExpenseExtras.tsx:302`, `packages/api/src/services/split/shareLink.service.ts:155` |

## Split Expenses → Settle up

### Payment method <!-- S-SPLIT-013 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Settle up** dialog → **Method** |
| Purpose | Records how a repayment was made |
| Default | Cash (`apps/web/src/pages/split/SettleUpDialog.tsx:96`); Pay via UPI records UPI |
| Values | Cash, UPI, Other |
| Depends on | — |
| Persists | Yes — per payment |
| Stored in | `SplitSettlement.method` |
| Backend effect | None beyond the record |
| Who can change | Group members |
| Sources | `packages/api/src/controllers/split.controller.ts:64` |
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| React Query cache `['advisor','llm-status']` | Whether AI narration is available | Advisor page load | After 5 minutes | Yes, up to 5 minutes after the operator changes the switch |
| React Query cache `['ca','clients']`, `['ca','clients','count']` | Professional's client list / count (sidebar) | Client books / any page with the sidebar | Every 5 s (workspace pages) / 30 s (sidebar) while visible, and on focus | Briefly; access changes made by a client appear within those intervals |
| UPI pay link (`['split','upi-link',…]`) | Payee's UPI link | Pay dialog open | Never cached (cache time 0) | No |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| ENABLE_LLM_ADVISOR_PROSE | Turns on AI narration of recommendations (also needs ANTHROPIC_API_KEY) | Default `false`: **Explain in plain English** is hidden |
| ANTHROPIC_API_KEY | Credential for the AI model used by narration | Narration disabled |
| LLM_ADVISOR_MODEL | Default model for narration (overridable by app setting `llm.advisor_model`) | Default `claude-sonnet-4-6` |
| RIA_VERDICTS_ENABLED | Allows recommendations to name funds from the signed house methodology; requires RIA_PRINCIPAL_OFFICER and RIA_REGISTRATION_NUMBER | Default `false`: category-level or NAV-ranked products only |
| ENABLE_FAMILY | Mounts `/api/ca`, `/api/me/professional-access`, `/api/professional-invitations` | Default `true`; when false the professional workspace API is absent |
| SMTP_HOST, SMTP_USER, SMTP_PASS | Sending invitation, reminder, invite and digest emails | Invitation **Send email** disabled ("copy the link"); split emails not sent |
| FRONTEND_URL | Base of invitation accept links | Links point to the wrong host |
<!-- END OPERATOR-CONFIG -->
