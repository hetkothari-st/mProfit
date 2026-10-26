[Index](../INDEX.md)

# Settings — Accounting

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-acct-001"></a>
### Type (account)
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
| Who can change | [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/accounting/accounting.service.ts:460` |

<a id="s-acct-002"></a>
### Parent Account
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
| Who can change | [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/accounting/accounting.service.ts:258` |

<a id="s-acct-003"></a>
### Opening Balance (₹)
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
| Who can change | [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/schemas/accounting.schema.ts:43` |

<a id="s-acct-004"></a>
### Voucher type
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
| Who can change | [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/schemas/accounting.schema.ts:20` |

<a id="s-acct-005"></a>
### Voucher type filter
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
| Who can change | [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/accounting/AccountingPage.tsx:389` |
