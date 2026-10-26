[Index](../INDEX.md)

# Cash Activity

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Cash Activity** page (sidebar **Overview → Cash Activity**, route `/cashflows`) shows a 12-month forecast of scheduled money in and out, and the list of cash-flow entries — money-in and money-out records created from approved bank alerts, rent, and split-expense settlements. Not plan-gated.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-CASH-001](../features/F-CASH-001.md) | Scheduled cashflow forecast | Live | The Scheduled cashflow card ("Forecast · next 12 months") shows Expected inflows, Expected outflows and Net, a monthly bar chart of inflows … |
| [F-CASH-002](../features/F-CASH-002.md) | Cash flow entries | Live | Lists cash-flow entries newest first, 50 per page, with All / Inflows / Outflows tabs, Inflows (this page) and Outflows (this page) totals, … |

Settings for this module: [settings/cash-activity.md](../settings/cash-activity.md)

### What this area doesn't do

- You can't add, edit, delete or categorise cash-flow entries.
- No search or date filter on the page (the API has them).
- The forecast isn't adjustable (fixed at 12 months).
