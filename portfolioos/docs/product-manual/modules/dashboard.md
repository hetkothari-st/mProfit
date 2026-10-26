[Index](../INDEX.md)

# Dashboard

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The Dashboard (`/dashboard`, also opened by `/` and the logo) is the first page after sign-in: your net worth, liabilities, trends, alerts, holdings and recent activity on one page. Most cards can be narrowed to one portfolio with the picker at the top; the ones that cannot are noted below.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-DASH-001](../features/F-DASH-001.md) | Dashboard page, portfolio filter and empty state | Live | Shows the page "Dashboard — Your financial portrait" ("A complete, hand-curated view of every asset, liability, and signal — engineered for … |
| [F-DASH-002](../features/F-DASH-002.md) | Total Net Worth hero | Live | The large card at the top shows Total Net Worth · Consolidated — hidden as "₹ • • • • • • •" until you click the small eye (Show net worth). |
| [F-DASH-003](../features/F-DASH-003.md) | Dashboard alerts strip | Live | Under the hero, up to four urgent items are listed, most urgent first, each with an icon by urgency, title, description and days left … |
| [F-DASH-004](../features/F-DASH-004.md) | Liabilities summary (Loans & credit cards) | Live | When you owe anything, a card "Liabilities · FY <year> — Loans & credit cards" shows Net after debts ("Assets minus liabilities"), Total … |
| [F-DASH-005](../features/F-DASH-005.md) | Net worth over time chart | Live | "Trend — Net worth over time" draws your net worth after liabilities from one snapshot per day, with the change over the chosen period … |
| [F-DASH-006](../features/F-DASH-006.md) | FX rates strip | Live | A thin strip "FX" shows USD/INR, EUR/INR, GBP/INR and JPY/INR with two decimals and a source badge (green for RBI or FRANKFURTER, blue … |
| [F-DASH-007](../features/F-DASH-007.md) | Tax strip (this financial year) | Live | "Tax · FY <yyyy-yy>" shows this financial year's Realised gain, Est. |
| [F-DASH-008](../features/F-DASH-008.md) | Investment metric cards | Live | Four cards: Portfolio value ("<n> holdings"), Total invested (with "XIRR x% · TWR y%"), Unrealised P&L (with percentage) and Today's change … |
| [F-DASH-009](../features/F-DASH-009.md) | Portfolio value over time chart | Live | "Trajectory — Portfolio value over time" plots the market value of the selected portfolios day by day. |
| [F-DASH-010](../features/F-DASH-010.md) | Net worth breakdown pie | Live | A ring chart "Net worth breakdown" with one slice per kind of holding (Equity, Mutual Fund, Fixed Deposit, …) plus Vehicles, Real Estate … |
| [F-DASH-011](../features/F-DASH-011.md) | Top holdings | Live | "Top holdings — Ranked by current value · N positions" lists your 10 largest holdings across the selected portfolios: rank, asset (and … |
| [F-DASH-012](../features/F-DASH-012.md) | Real Estate, Vehicles and Insurance cards | Live | Three cards. |
| [F-DASH-013](../features/F-DASH-013.md) | Recent transactions card | Live | "Recent transactions" lists your 5 latest transactions: name, trade date · type, net amount and quantity @ price. |
| [F-DASH-014](../features/F-DASH-014.md) | Refresh prices (dashboard) | Live | Refresh fetches the latest prices for the stocks you hold and re-values all your holdings, then reloads the Dashboard. |
| [F-DASH-015](../features/F-DASH-015.md) | Export dashboard report | Live | Export opens "Download Report" to download the Dashboard as a PDF or Excel file. |
| [F-DASH-016](../features/F-DASH-016.md) | Free plan upgrade banner | Live | On the Free plan the Dashboard opens with "You're on the Free plan — Upgrade to Plus for the full tax report catalog, AA auto-import, … |
| [F-DASH-017](../features/F-DASH-017.md) | Gmail connect and scan progress cards | Live | If you have not connected Gmail, a card "Auto-import from Gmail — Scan your inbox for contract notes and statements — you approve each … |
| [F-DASH-018](../features/F-DASH-018.md) | Daily net-worth snapshot | Live | Every night at 23:45 India time, EveryPaisa records each active user's net worth (gross, liabilities, net after liabilities and the … |

Settings for this module: [settings/dashboard.md](../settings/dashboard.md)

### What this area doesn't do
- The Dashboard cannot be rearranged beyond the sidebar order/visibility of asset classes and the three summary cards.
- There is no "View all holdings" page — the **View all** link on Top holdings goes nowhere.
- Total Net Worth does not include bank balances or properties on the Real Estate page.
- You cannot pick custom date ranges for the charts — only 1M, 3M, 6M, 1Y and All.
- The portfolio picker is not remembered between visits.
