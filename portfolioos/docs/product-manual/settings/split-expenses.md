[Index](../INDEX.md)

# Settings — Split Expenses

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-split-001"></a>
### Group type
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

<a id="s-split-002"></a>
### Group currency
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

<a id="s-split-003"></a>
### Simplify debts
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

<a id="s-split-004"></a>
### Archive group
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

<a id="s-split-005"></a>
### Split mode
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

<a id="s-split-006"></a>
### Expense currency and exchange rate
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

<a id="s-split-007"></a>
### UPI ID
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

<a id="s-split-008"></a>
### Home currency
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

<a id="s-split-009"></a>
### Default portfolio
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

<a id="s-split-010"></a>
### Email about activity
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

<a id="s-split-011"></a>
### Weekly balance summary
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

<a id="s-split-012"></a>
### Add my share to Cash Activity
| Attribute | Value |
|---|---|
| Control type | Switch |
| Location | Expense page → **Cash Activity** |
| Purpose | Mirror your share as an outflow in Cash Activity |
| Default | Off |
| Values | On: outflow created and kept in sync · Off: outflow deleted |
| Depends on | [S-SPLIT-009](../settings/split-expenses.md#s-split-009) or a portfolio picked on the spot; a non-zero share |
| Persists | Yes — server |
| Stored in | `SplitShareLink` + `CashFlow` |
| Backend effect | Re-synced on expense edits and nightly at 02:30 IST |
| Who can change | Each member for their own share |
| Sources | `apps/web/src/pages/split/ExpenseExtras.tsx:302`, `packages/api/src/services/split/shareLink.service.ts:155` |

<a id="s-split-013"></a>
### Payment method
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
