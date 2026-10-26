[Index](../INDEX.md)

# Settings — Income

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-inc-001"></a>
### Income type
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `apps/web/src/pages/income/incomeTypeMeta.ts:3` |

<a id="s-inc-002"></a>
### Currently active
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
| Who can change | [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro), [R-MANAGER](../roles.md#r-manager) |
| Sources | `packages/api/src/services/income/income.service.ts:113` |
