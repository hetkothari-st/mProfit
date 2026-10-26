[Index](../INDEX.md)

# Settings — Bank Accounts

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-bank-001"></a>
### Account type
| Attribute | Value |
|---|---|
| Control type | Select (**Type**) |
| Location | Bank Accounts → Add account / Edit |
| Purpose | Kind of account |
| Default | Savings (source: `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:76`) |
| Values | Savings, Current, Salary, Nre, Nro, Od (shown on the tile in capitals) — a label only |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `BankAccount.accountType` |
| Backend effect | None beyond storage |
| Who can change | Account owner |
| Sources | `apps/web/src/pages/bankAccounts/BankAccountDialog.tsx:24`, `packages/api/src/services/banking/bankAccounts.service.ts:26` |

<a id="s-bank-002"></a>
### Account status
| Attribute | Value |
|---|---|
| Control type | Select (**Status**) |
| Location | Bank Accounts → Add account / Edit |
| Purpose | Mark accounts dormant or closed without deleting them |
| Default | Active (source: `packages/api/src/services/banking/bankAccounts.service.ts:192`) |
| Values | Active: counted in **Total balance**, shows "Available balance" · Dormant: counted as Inactive · Closed: counted as Inactive and never matched to e-mail alerts |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `BankAccount.status` |
| Backend effect | Closed accounts are excluded from last-4 matching of bank alerts |
| Who can change | Account owner |
| Sources | `apps/web/src/pages/bankAccounts/BankAccountListPage.tsx:30`, `packages/api/src/services/banking/bankAccounts.service.ts:492` |
