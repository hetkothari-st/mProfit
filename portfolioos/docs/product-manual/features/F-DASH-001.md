---
id: F-DASH-001
title: "Dashboard page, portfolio filter and empty state"
module: "Dashboard"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO"
settings: [S-DASH-001]
related: [F-DASH-002, F-DASH-014, F-DASH-015, F-DASH-016, F-DASH-018]
---

[← Dashboard](../modules/dashboard.md) · [Index](../INDEX.md)

# Dashboard page, portfolio filter and empty state

`F-DASH-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro)

**What it does:** Shows the page "Dashboard — Your financial portrait" ("A complete, hand-curated view of every asset, liability, and signal — engineered for investors who read between the lines.") with a portfolio picker, **Export** and **Refresh** at the top. If you have no portfolio yet, it shows "No portfolios yet — Create your first portfolio to start tracking investments and other assets." with **Get started**. It also sends new accounts to the setup wizard.

**Why it exists:** Inferred from behavior: one overview of everything, with an easy way to look at a single portfolio.

**Where to find it:** **Overview → Dashboard** (route `/dashboard`); phone tab **Dashboard**; EveryPaisa logo.

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) ([R-ADMIN](../roles.md#r-admin) by plan). In family view ([R-FAMOWNER](../roles.md#r-famowner), [R-FAMCONTRIB](../roles.md#r-famcontrib), [R-FAMVIEWER](../roles.md#r-famviewer)) the figures are the family's; while managing an account ([R-MANAGER](../roles.md#r-manager)) they are that person's.

**Steps**
1. Open the Dashboard. While loading, grey placeholder blocks show.
2. Pick **All portfolios (N)** or one portfolio in the picker. The cards marked "follows the picker" below update.
3. If you have no portfolios, click **Get started** to open the setup wizard.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Portfolio picker (**All portfolios (N)** / portfolio names) | Select | Narrows portfolio-based cards | Hidden when you have no portfolios |
| **Export** | Button | [F-DASH-015](F-DASH-015.md) | Same |
| **Refresh** | Button | [F-DASH-014](F-DASH-014.md) | Same |
| **Get started** | Button link | Opens `/onboarding` | Only when you have no portfolios |

**Fields and rules:** None.

**Settings and toggles here:** [S-DASH-001](../settings/dashboard.md#s-dash-001) **Dashboard portfolio picker** — **All portfolios (N)** (default each visit) or one portfolio. Follows the picker: Total Net Worth's Investments figure and holdings count, Investment metric cards, Portfolio value over time, Net worth breakdown, Top holdings, the Liabilities' Net after debts (through net worth). Does not follow it: Net worth over time, Recent transactions, Vehicles/Real Estate/Insurance cards, loans and credit cards, the tax strip.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| You are sent to the setup wizard | You have no portfolio and this browser has never finished setup, or your account left setup unfinished | Finish or skip the wizard |
| "No portfolios yet" | No portfolio exists | **Get started**, or create one on Portfolios |

**Limitations:** The picker resets to all portfolios each time you open the Dashboard. The "setup finished" marker is per browser; a new browser with no portfolios on the account is sent to the wizard again.

**How it works:** The page loads `GET /api/portfolios` (family-aware). With at least one portfolio it sets the browser flag `onboarding_v2_done`; with none and no flag it redirects to `/onboarding`. A per-account browser flag `everypaisa.onboarding.inProgress.<userId>` also redirects there. A family banner ([D-DASH-001](../dependencies.md#d-dash-001)) and the Free upgrade banner ([F-DASH-016](F-DASH-016.md)) sit at the top.

**Related features:** [F-DASH-002](F-DASH-002.md) to [F-DASH-018](F-DASH-018.md), [D-DASH-001](../dependencies.md#d-dash-001), [D-DASH-002](../dependencies.md#d-dash-002) (onboarding wizard).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:340`, `apps/web/src/pages/dashboard/DashboardPage.tsx:346`, `apps/web/src/pages/dashboard/DashboardPage.tsx:366`, `apps/web/src/pages/dashboard/DashboardPage.tsx:482`, `apps/web/src/pages/dashboard/DashboardPage.tsx:512`, `apps/web/src/pages/dashboard/DashboardPage.tsx:518`, `apps/web/src/lib/onboardingProgress.ts:12`, `apps/web/src/App.tsx:164`
