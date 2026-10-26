[Index](../INDEX.md)

# Income

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Income** page (sidebar **Overview → Income**, route `/income`) records recurring income — salary, business, trading, freelance, rental, interest/dividend, capital gains or other — as a monthly amount. Health Score, the insurance coverage check and other features use this figure instead of guessing from bank emails. Not plan-gated.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-INC-001](../features/F-INC-001.md) | Income list and total | Live | Shows Total active monthly income and cards in Active and Inactive sections, each with source name, type, Inactive badge, monthly amount … |
| [F-INC-002](../features/F-INC-002.md) | Add or edit income | Live | Add income (or Edit income) records type, source, monthly amount, typical credit day, active flag and notes. |
| [F-INC-003](../features/F-INC-003.md) | Delete income | Live | Deletes an income entry immediately, with no confirmation. |

Settings for this module: [settings/income.md](../settings/income.md)

### What this area doesn't do

- Income isn't detected automatically from bank credits here; it is what you enter.
- No yearly totals, tax treatment or history.
