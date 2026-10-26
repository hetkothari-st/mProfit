[Index](../INDEX.md)

# Portfolios

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

A portfolio is a named container for holdings and transactions (for example "Long Term Equity" or "Trading"). Portfolio groups bundle several of your portfolios into one combined read-only view. This chapter also covers the background price feeds and corporate-action processing that value every holding.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-PORT-001](../features/F-PORT-001.md) | Portfolios list | Live | The Portfolios page ("Allocation — Portfolios: Group holdings by goal, strategy, or account. |
| [F-PORT-002](../features/F-PORT-002.md) | Create or edit a portfolio | Live | The dialog "Create a new portfolio" / "Edit portfolio" ("A portfolio groups holdings by strategy, goal, or account.") sets a portfolio's … |
| [F-PORT-003](../features/F-PORT-003.md) | Delete a portfolio | Live | Permanently deletes a portfolio and everything recorded in it. |
| [F-PORT-004](../features/F-PORT-004.md) | Portfolio detail | Live | Shows one portfolio: name and description, four cards (Current value, Invested, Unrealised P&L, Today's change) and a Holdings table with … |
| [F-PORT-005](../features/F-PORT-005.md) | Refresh prices (one portfolio) | Live | Refresh prices re-values this portfolio's holdings from the latest prices and shows "N holdings refreshed". |
| [F-PORT-006](../features/F-PORT-006.md) | Portfolio groups: create, edit, delete | Live | "Create a portfolio group" ("Bundle multiple portfolios (e.g. |
| [F-PORT-007](../features/F-PORT-007.md) | Portfolio group detail | Live | Shows a group: "Members:" chips (each opens that portfolio), cards Combined value, Invested, Unrealised P&L, Today's change, and Combined … |
| [F-PORT-008](../features/F-PORT-008.md) | Scheduled market price feeds | Live | EveryPaisa downloads market prices on a fixed India-time schedule and re-values every user's holdings after each price download, so values, … |
| [F-PORT-009](../features/F-PORT-009.md) | Automatic corporate-action application | Live | After the daily 20:00 corporate-action download, EveryPaisa adds stock splits, bonus issues and cash dividends to the affected stock … |

Settings for this module: [settings/portfolios.md](../settings/portfolios.md)

### What this area doesn't do
- You cannot move a portfolio's holdings to another portfolio in one step (edit each transaction's portfolio instead).
- Portfolio groups cannot mix currencies and cannot include other people's portfolios.
- There is no archive for portfolios — deleting is permanent.
- There is no manual price entry on the portfolio page.
- The corporate-actions report and manual sync endpoints exist on the server but have no screen (see DOCUMENTATION_GAPS.md).
