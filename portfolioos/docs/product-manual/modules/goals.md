[Index](../INDEX.md)

# Goals

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Goals** page (sidebar **Planning → Goals**, route `/goals`, page title **Financial goals**) tracks targets such as retirement, a child's education or a FIRE corpus. Each goal has a target amount and date; its progress is a starting amount plus the current value of the portfolios you link to it, and it shows the yearly return you would need to get there. Goals are a **Plus** feature.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-GOAL-001](../features/F-GOAL-001.md) | Goals list and progress | Live | Lists your goals as cards in three sections — Active, Achieved and Paused / abandoned — each with category and priority badges, a progress … |
| [F-GOAL-002](../features/F-GOAL-002.md) | Create or edit a goal | Live | Create goal (or Edit goal) sets name, category, priority, target and initial amounts, target date, status (edit only), inflation rate, … |
| [F-GOAL-003](../features/F-GOAL-003.md) | Delete a goal | Live | Deletes a goal after the browser confirmation "Delete this goal?". |

Settings for this module: [settings/goals.md](../settings/goals.md)

### What this area doesn't do

- No SIP planning or monthly-investment suggestion on this page.
- No goal reminders or alerts.
- Goals don't use family view.
