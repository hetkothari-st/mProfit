## Dashboard

The Dashboard (`/dashboard`, also opened by `/` and the logo) is the first page after sign-in: your net worth, liabilities, trends, alerts, holdings and recent activity on one page. Most cards can be narrowed to one portfolio with the picker at the top; the ones that cannot are noted below.

### Dashboard page, portfolio filter and empty state <!-- F-DASH-001 -->

**What it does:** Shows the page "Dashboard — Your financial portrait" ("A complete, hand-curated view of every asset, liability, and signal — engineered for investors who read between the lines.") with a portfolio picker, **Export** and **Refresh** at the top. If you have no portfolio yet, it shows "No portfolios yet — Create your first portfolio to start tracking investments and other assets." with **Get started**. It also sends new accounts to the setup wizard.

**Why it exists:** Inferred from behavior: one overview of everything, with an easy way to look at a single portfolio.

**Where to find it:** **Overview → Dashboard** (route `/dashboard`); phone tab **Dashboard**; EveryPaisa logo.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (R-ADMIN by plan). In family view (R-FAMOWNER, R-FAMCONTRIB, R-FAMVIEWER) the figures are the family's; while managing an account (R-MANAGER) they are that person's.

**Steps**
1. Open the Dashboard. While loading, grey placeholder blocks show.
2. Pick **All portfolios (N)** or one portfolio in the picker. The cards marked "follows the picker" below update.
3. If you have no portfolios, click **Get started** to open the setup wizard.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Portfolio picker (**All portfolios (N)** / portfolio names) | Select | Narrows portfolio-based cards | Hidden when you have no portfolios |
| **Export** | Button | F-DASH-015 | Same |
| **Refresh** | Button | F-DASH-014 | Same |
| **Get started** | Button link | Opens `/onboarding` | Only when you have no portfolios |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-001 **Dashboard portfolio picker** — **All portfolios (N)** (default each visit) or one portfolio. Follows the picker: Total Net Worth's Investments figure and holdings count, Investment metric cards, Portfolio value over time, Net worth breakdown, Top holdings, the Liabilities' Net after debts (through net worth). Does not follow it: Net worth over time, Recent transactions, Vehicles/Real Estate/Insurance cards, loans and credit cards, the tax strip.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| You are sent to the setup wizard | You have no portfolio and this browser has never finished setup, or your account left setup unfinished | Finish or skip the wizard |
| "No portfolios yet" | No portfolio exists | **Get started**, or create one on Portfolios |

**Limitations:** The picker resets to all portfolios each time you open the Dashboard. The "setup finished" marker is per browser; a new browser with no portfolios on the account is sent to the wizard again.

**How it works:** The page loads `GET /api/portfolios` (family-aware). With at least one portfolio it sets the browser flag `onboarding_v2_done`; with none and no flag it redirects to `/onboarding`. A per-account browser flag `everypaisa.onboarding.inProgress.<userId>` also redirects there. A family banner (D-DASH-001) and the Free upgrade banner (F-DASH-016) sit at the top.

**Related features:** F-DASH-002 to F-DASH-018, D-DASH-001, D-DASH-002 (onboarding wizard).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:340`, `apps/web/src/pages/dashboard/DashboardPage.tsx:346`, `apps/web/src/pages/dashboard/DashboardPage.tsx:366`, `apps/web/src/pages/dashboard/DashboardPage.tsx:482`, `apps/web/src/pages/dashboard/DashboardPage.tsx:512`, `apps/web/src/pages/dashboard/DashboardPage.tsx:518`, `apps/web/src/lib/onboardingProgress.ts:12`, `apps/web/src/App.tsx:164`

### Total Net Worth hero <!-- F-DASH-002 -->

**What it does:** The large card at the top shows **Total Net Worth · Consolidated** — hidden as "₹ • • • • • • •" until you click the small eye (**Show net worth**). Beneath it: today's date, your number of holdings and portfolios, and "All accounts" or "Filtered". A breakdown row shows **Investments** and, when they are above zero, **Real Estate**, **Vehicles** and **Sum Assured**.

**Why it exists:** Code comment: hidden by default "so a screen-share or co-worker glance doesn't reveal the headline number".

**Where to find it:** Dashboard, top card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; family roles see the family total.

**Steps**
1. Click the eye next to **Total Net Worth · Consolidated** (**Show net worth**). The amount appears.
2. Click again (**Hide net worth**) to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Show net worth** / **Hide net worth** | Icon toggle | Reveals/hides the headline number | — |
| Tooltip on the label | Text | "Gross: investments + real estate + vehicles, before loans & credit-card liabilities." | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-002 **Net worth eye** — hidden (default every visit) or shown; not remembered. Independent of S-SHELL-006 **Hide values**, which masks the breakdown figures too.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| The card does not appear | Net-worth figures have not loaded or failed | Reload the page |
| Bank balances or a home you own are not in the total | They are not part of this figure (see Limitations) | — |

**Limitations:** Total Net Worth = Investments + Vehicles + Rental property values + money you lent that is still owed to you. It does not include bank account balances or properties recorded on the **Real Estate** page; **Sum Assured** is displayed but not added. The "Real Estate" figure here is the current value of properties on the **Rental** page. Only Investments follows the portfolio picker. Liabilities are not subtracted here — see **Net after debts** (F-DASH-004). See DOCUMENTATION_GAPS.md.

**How it works:** `GET /api/dashboard/net-worth?portfolioId=` returns gross `totalNetWorth`. Investments = sum over holdings of current value, or cost (total invested) when a holding has no price. Vehicles = sum of vehicle current values; rental = sum of rental property current values; loans given = outstanding amounts owed to you (counted only when you may see the LOAN category). In family view the server computes each member's figures (other members' filtered by your asset-class and category permissions) and adds them up. The holdings count comes from the portfolio summaries of the selected portfolio(s).

**Related features:** F-DASH-004, F-DASH-010, F-SHELL-007, D-DASH-003 (Rental), D-DASH-004 (Vehicles).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:314`, `apps/web/src/pages/dashboard/DashboardPage.tsx:540`, `apps/web/src/pages/dashboard/DashboardPage.tsx:544`, `apps/web/src/pages/dashboard/DashboardPage.tsx:562`, `apps/web/src/pages/dashboard/DashboardPage.tsx:608`, `packages/api/src/routes/dashboard.routes.ts:13`, `packages/api/src/services/analytics/dashboard.service.ts:97`, `packages/api/src/services/analytics/dashboard.service.ts:110`, `packages/api/src/services/analytics/dashboard.service.ts:180`, `packages/api/src/services/analytics/dashboard.service.ts:470`, `packages/api/src/services/analytics/dashboard.service.ts:543`

### Dashboard alerts strip <!-- F-DASH-003 -->

**What it does:** Under the hero, up to four urgent items are listed, most urgent first, each with an icon by urgency, title, description and days left ("Overdue" when due today or past). Clicking an item opens its section. A button on the first item folds the strip into one line "N alerts — click to expand".

**Why it exists:** Inferred from behavior: puts expiries and dues that cost money if missed in front of you without opening the Alerts page.

**Where to find it:** Dashboard, below the hero and Portfolio Score card. Shown only when there is at least one item.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; family roles see members' items within their permissions.

**Steps**
1. Click an item ("Open section"). The related page opens.
2. Click the up-arrow on the first item (**Collapse alerts**) to fold the strip; click the folded bar (**Expand alerts**) to show it again.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Alert row ("Open section") | Link | Opens Insurance, Vehicles, Rental, Loans or Alerts | — |
| **Collapse alerts** | Icon button | Folds the strip | First row only |
| "N alerts — click to expand" (**Expand alerts**) | Button | Unfolds | Folded state only |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-005 **Alerts strip folded** — in this visit only; reloading shows it unfolded.

**Results:** None stored; these items are computed live and are separate from the Alerts page.

**Errors and troubleshooting:** None.

**Limitations:** At most 10 items are calculated and 4 shown. Items: vehicle Insurance/PUC/Fitness/Road Tax expiring within 30 days (or already expired); insurance premiums due within 30 days; one item for overdue rent receipts; one for pending traffic challans; each overdue loan EMI; each loan EMI due within 30 days. Credit-card dues, FD maturities and custom reminders are on the Alerts page, not here. In family view, items are listed member by member before the 10-item cut, so one member's items can push out another's.

**How it works:** Urgency: HIGH when 7 days or fewer remain, MEDIUM up to 15 days, LOW beyond; overdue rent and overdue EMIs are always HIGH, challans MEDIUM. Sorted HIGH, MEDIUM, LOW, then by days remaining. Days = whole days from now to the date, rounded up. Links: insurance → `/insurance`; vehicle expiry and challans → `/vehicles`; rent → `/rental`; EMI → `/loans`.

**Related features:** F-ALERT-001, D-DASH-003, D-DASH-004, D-DASH-005 (Insurance), D-DASH-006 (Loans).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:55`, `apps/web/src/pages/dashboard/DashboardPage.tsx:322`, `apps/web/src/pages/dashboard/DashboardPage.tsx:640`, `apps/web/src/pages/dashboard/DashboardPage.tsx:663`, `apps/web/src/pages/dashboard/DashboardPage.tsx:669`, `apps/web/src/pages/dashboard/DashboardPage.tsx:683`, `packages/api/src/services/analytics/dashboard.service.ts:46`, `packages/api/src/services/analytics/dashboard.service.ts:153`, `packages/api/src/services/analytics/dashboard.service.ts:397`, `packages/api/src/services/analytics/dashboard.service.ts:458`, `packages/api/src/services/analytics/dashboard.service.ts:523`, `packages/api/src/services/analytics/dashboard.service.ts:658`

### Liabilities summary (Loans & credit cards) <!-- F-DASH-004 -->

**What it does:** When you owe anything, a card "Liabilities · FY <year> — Loans & credit cards" shows **Net after debts** ("Assets minus liabilities"), **Total outstanding** ("Across all debts"), **Monthly EMI** (with number of loans), **Card balance** (with number of cards) and **Interest paid YTD** (with "Principal: <amount>"). A footer shows "N EMI(s) overdue" and "Next EMI: <lender> on <date> — <amount>".

**Why it exists:** Inferred from behavior: the headline net worth is gross; this card shows what is left after debts.

**Where to find it:** Dashboard, below the alerts strip. Hidden when total liabilities are zero.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; family roles see members' loans/cards only with the LOAN / CREDIT_CARD categories.

**Steps**
1. Read the figures. Click **Manage** to open Loans.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manage** | Link | Opens `/loans` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None stored.

**Errors and troubleshooting:** None.

**Limitations:** Loans and cards are not filtered by the portfolio picker; Net after debts subtracts all liabilities from the (possibly filtered) gross figure. Only ACTIVE loans and ACTIVE credit cards count.

**How it works:** Net after debts = Total Net Worth − (loan outstanding + card outstanding). Loan outstanding = opening balance of the first unpaid instalment in the loan's schedule (the principal when no schedule can be built). Monthly EMI = sum of the EMI amounts of active loans. Card balance = the card's recorded outstanding balance, or, when none is recorded, the total of its pending/partly paid statements. Interest and principal YTD = loan payments dated in the current financial year (April–March) that carry an interest or principal split. The next EMI is the soonest first-unpaid instalment within 30 days; an unpaid instalment dated before today counts as overdue.

**Related features:** F-DASH-002, D-DASH-006, D-DASH-007 (Credit Cards).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:702`, `apps/web/src/pages/dashboard/DashboardPage.tsx:713`, `apps/web/src/pages/dashboard/DashboardPage.tsx:822`, `packages/api/src/services/analytics/dashboard.service.ts:239`, `packages/api/src/services/analytics/dashboard.service.ts:272`, `packages/api/src/services/analytics/dashboard.service.ts:299`, `packages/api/src/services/analytics/dashboard.service.ts:315`, `packages/api/src/services/analytics/dashboard.service.ts:471`

### Net worth over time chart <!-- F-DASH-005 -->

**What it does:** "Trend — Net worth over time" draws your net worth after liabilities from one snapshot per day, with the change over the chosen period ("+₹X (+Y%) this 1Y"). Choose **1M**, **3M**, **6M**, **1Y** (default) or **All**.

**Why it exists:** Code comment: "the 'look how far you've come' dashboard element."

**Where to find it:** Dashboard, below the Liabilities card.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. Always your own figures — not the family's and not the selected portfolio.

**Steps**
1. Click a period button. The chart and change line redraw.
2. Hover (or touch) the line to see the date and value.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **1M**, **3M**, **6M**, **1Y**, **All** | Toggle buttons | Period of 30, 90, 180, 365 days or everything | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-004 **Net worth trend period** — default **1Y**; not remembered.

**Results:** None stored.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Come back tomorrow to see your net worth trend. We snapshot your net worth once a day." | Fewer than 2 snapshots in the period | Wait for more daily snapshots |
| "Couldn't load your net worth trend. Try again shortly." | Request failed | Reload later |
| "N of these days were priced from the last NAVs we had" and an estimate chip | Some snapshots were taken while fund prices were stale | No action — those points are estimates |

**Limitations:** One point per day, taken at 23:45 IST (F-DASH-018); today's changes appear tomorrow. The percentage is blank when the first value is zero. The chart's axis and tooltip are not hidden by **Hide values** — see DOCUMENTATION_GAPS.md.

**How it works:** `GET /api/intelligence/net-worth/history?period=` reads your snapshots from the start of the period (UTC date) onward. Change = last − first net-worth-after-liabilities; percent = change ÷ |first| × 100. Points flagged as not OK are marked "Net worth (estimate)" in the tooltip.

**Related features:** F-DASH-018.

**Sources:** `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:13`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:30`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:124`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:137`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:145`, `apps/web/src/components/dashboard/NetWorthTrendChart.tsx:177`, `packages/api/src/controllers/intelligence.controller.ts:16`, `packages/api/src/services/analytics/netWorthHistory.service.ts:7`, `packages/api/src/services/analytics/netWorthHistory.service.ts:84`

### FX rates strip <!-- F-DASH-006 -->

**What it does:** A thin strip "FX" shows USD/INR, EUR/INR, GBP/INR and JPY/INR with two decimals and a source badge (green for RBI or FRANKFURTER, blue otherwise). Clicking it opens the Forex page.

**Why it exists:** Code comment: "Compact rates strip … quick glance + click-through to /forex".

**Where to find it:** Dashboard, below the net worth chart. Hidden when no rates are available.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Read the rates; click the strip to open `/forex`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| FX strip | Link | Opens `/forex` | Hidden with no rates |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** None.

**Errors and troubleshooting:** None — the strip simply hides.

**Limitations:** Rates are shown, not used in Dashboard totals.

**How it works:** `GET /api/forex/ticker` for the four pairs, refreshed every 30 seconds.

**Related features:** D-DASH-008 (Forex).

**Sources:** `apps/web/src/pages/forex/DashboardFxStrip.tsx:11`, `apps/web/src/pages/forex/DashboardFxStrip.tsx:17`, `apps/web/src/pages/forex/DashboardFxStrip.tsx:24`, `apps/web/src/api/forex.api.ts:197`

### Tax strip (this financial year) <!-- F-DASH-007 -->

**What it does:** "Tax · FY <yyyy-yy>" shows this financial year's **Realised gain**, **Est. tax**, **LTCG exempt** (used / limit, when you have long-term equity gains) and **STCG** (when above zero), with **Report** (downloads a CA-ready capital-gains PDF) and **Details** (opens Tax Planning).

**Why it exists:** Inferred from behavior: a running reminder of tax from sales this year.

**Where to find it:** Dashboard, below the FX strip. Hidden while loading and when both realised gain and estimated tax are zero.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Report**. The button spins, then `capital-gains-tax-<fy>.pdf` downloads.
2. Click **Details** to open `/tax`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report** ("Download CA-ready tax report (PDF)") | Button | Downloads the PDF | Disabled while downloading |
| **Details** | Link | Opens `/tax` | — |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** A PDF file is saved by your browser.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not download the tax report" (or the server's message) | Download failed | Try again |

**Limitations:** Amounts of ₹1 crore or more show as "₹x.xxCr", ₹1 lakh or more as "₹x.xxL", smaller amounts rounded to whole rupees. The LTCG figure turns amber at 90% of the exemption; the red state for 100% never shows (see DOCUMENTATION_GAPS.md). The figures are cached for 10 minutes. The financial year is worked out from the UTC date.

**How it works:** `GET /api/tax/summary?fy=` for the figures; the PDF is fetched from `/api/tax/capital-gains-report` with your session.

**Related features:** D-DASH-009 (Tax Planning).

**Sources:** `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:14`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:31`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:42`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:47`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:61`, `apps/web/src/components/dashboard/DashboardTaxStrip.tsx:138`, `apps/web/src/api/tax.api.ts:279`

### Investment metric cards <!-- F-DASH-008 -->

**What it does:** Four cards: **Portfolio value** ("<n> holdings"), **Total invested** (with "XIRR x% · TWR y%"), **Unrealised P&L** (with percentage) and **Today's change** (with percentage), for the portfolios in the picker.

**Why it exists:** Tooltips state each card's meaning: "Tradable + accrual holdings only. Excludes real estate, vehicles and insurance (those sit in Total Net Worth)."; "Sum of cost basis across all holdings (what you put in)."; "Current value minus invested, across holdings only. Accrual assets contribute earned interest; not annualized."; "Day move on market-priced holdings only (equities, MF, crypto, gold). Accrual/cost assets have no intraday change."

**Where to find it:** Dashboard, below the tax strip.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Card tooltips | Hover text | Explain the figure | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-001 (portfolio picker).

**Results:** None.

**Errors and troubleshooting:** None.

**Limitations:** The XIRR shown is a simple average of each portfolio's XIRR, not a combined XIRR (see DOCUMENTATION_GAPS.md); portfolios with too little history have no XIRR and are left out. TWR is account-wide and ignores the picker. "Today's change" uses the last two prices on record, which may not be today's and yesterday's (e.g. over a weekend). Percent signs show with two decimals; XIRR/TWR with one.

**How it works:** For each selected portfolio `GET /api/portfolios/:id/summary` returns: invested = sum of holding costs; value = sum of current values (cost when unpriced); P&L = value − invested; today's change = Σ (latest price − previous price) × quantity for stocks, mutual funds (NAV), crypto and gold/silver (spot); its % = change ÷ (value − change) × 100. The Dashboard adds the portfolios together exactly (decimal arithmetic). TWR comes from `GET /api/reports/xirr/user`.

**Related features:** F-PORT-004, D-DASH-010 (Reports XIRR).

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:375`, `apps/web/src/pages/dashboard/DashboardPage.tsx:412`, `apps/web/src/pages/dashboard/DashboardPage.tsx:451`, `apps/web/src/pages/dashboard/DashboardPage.tsx:476`, `apps/web/src/pages/dashboard/DashboardPage.tsx:867`, `apps/web/src/pages/dashboard/DashboardPage.tsx:875`, `apps/web/src/pages/dashboard/DashboardPage.tsx:890`, `apps/web/src/pages/dashboard/DashboardPage.tsx:901`, `packages/api/src/services/holdings/portfolio.service.ts:420`, `packages/api/src/services/holdings/portfolio.service.ts:440`, `packages/api/src/services/holdings/portfolio.service.ts:518`, `packages/api/src/services/holdings/portfolio.service.ts:534`

### Portfolio value over time chart <!-- F-DASH-009 -->

**What it does:** "Trajectory — Portfolio value over time" plots the market value of the selected portfolios day by day. Choose **1M**, **3M**, **6M**, **1Y** (default) or **All**.

**Why it exists:** Inferred from behavior: shows how your investments moved over time.

**Where to find it:** Dashboard, left of the Net worth breakdown.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click a period. The chart reloads.
2. Hover for "Market value" on a date.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **1M**, **3M**, **6M**, **1Y**, **All** | Toggle buttons | 30, 90, 180, 365 days, or from your first transaction | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-003 **Portfolio chart period** — default **1Y**; not remembered. S-DASH-001 picker applies. S-SHELL-006 hides the axis and tooltip values ("•••").

**Results:** Missing stock prices for the period may be downloaded and stored for everyone.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add transactions to see your portfolio value over time" | No transactions in the selected portfolios | Add transactions |

**Limitations:** Only stocks are valued at historical daily closing prices; mutual funds and every other holding are carried at cost on past days, and the chart jumps to live values on today's point. Invested money is not plotted. Axis labels use ₹…Cr, ₹…L, ₹…K.

**How it works:** For each selected portfolio, `GET /api/portfolios/:id/historical-valuation?days=` replays transactions in date order (buys add quantity and cost; sells remove average cost; bonus adds quantity at no cost; splits add quantity) and values each day. If stored stock prices cover less than 40% of the expected days, daily prices are fetched from Yahoo first. Today's point is replaced by the live value of current holdings. The Dashboard adds the series of all selected portfolios by date.

**Related features:** F-DASH-008, F-PORT-008.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:47`, `apps/web/src/pages/dashboard/DashboardPage.tsx:306`, `apps/web/src/pages/dashboard/DashboardPage.tsx:386`, `apps/web/src/pages/dashboard/DashboardPage.tsx:943`, `apps/web/src/pages/dashboard/DashboardPage.tsx:990`, `packages/api/src/services/holdings/portfolio.service.ts:690`, `packages/api/src/services/holdings/portfolio.service.ts:705`, `packages/api/src/services/holdings/portfolio.service.ts:762`, `packages/api/src/services/holdings/portfolio.service.ts:838`, `packages/api/src/services/holdings/portfolio.service.ts:874`

### Net worth breakdown pie <!-- F-DASH-010 -->

**What it does:** A ring chart "Net worth breakdown" with one slice per kind of holding (Equity, Mutual Fund, Fixed Deposit, …) plus Vehicles, Real Estate (rental properties) and Loans given, and a list of each slice's value and percentage.

**Why it exists:** Inferred from behavior: shows how your wealth is spread across asset types.

**Where to find it:** Dashboard, right of the portfolio chart.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps:** Not applicable — view only (hover a slice for "<amount> (<percent>%)").

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Slices and legend rows | Chart | Show value and share | Slices with zero value and classes hidden in the sidebar are left out |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-004 (sidebar visibility) hides slices; S-DASH-001 picker narrows the holdings slices.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add holdings to see breakdown" | Nothing to show | Add holdings |
| Hiding **Vehicles** in the sidebar does not remove the Vehicles slice (hiding **Others** does) | Known mapping defect | See DOCUMENTATION_GAPS.md |

**Limitations:** Percentages are of gross net worth (holdings + vehicles + rental + loans given). In family view, slice sizes in the ring use the first member's value for a merged slice while the list shows the combined value — see DOCUMENTATION_GAPS.md.

**How it works:** Uses `allocationBreakdown` from `GET /api/dashboard/net-worth`: holdings grouped by asset class (value or cost when unpriced), then vehicles, rental, loans given, sorted largest first; percent = slice ÷ total × 100.

**Related features:** F-DASH-002, F-SHELL-002.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:218`, `apps/web/src/pages/dashboard/DashboardPage.tsx:503`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1002`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1010`, `packages/api/src/services/analytics/dashboard.service.ts:329`, `packages/api/src/services/analytics/dashboard.service.ts:386`, `packages/api/src/services/analytics/dashboard.service.ts:677`

### Top holdings <!-- F-DASH-011 -->

**What it does:** "Top holdings — Ranked by current value · N positions" lists your 10 largest holdings across the selected portfolios: rank, asset (and symbol), class, quantity, average cost, value, and unrealised P&L with percentage. Clicking a row opens that holding's page or its asset-class page.

**Why it exists:** Inferred from behavior: the positions that matter most at a glance.

**Where to find it:** Dashboard, below the charts.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click a row (or press Enter on it) to open it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Holding row ("Open <name>") | Row link | FD → its FD page; physical gold, gold bond, gold ETF → its gold page; crypto → its crypto page; other classes → their list page (NPS, PMS, AIF, private equity, REIT, InvIT, art, cash, other → **Others**) | Not clickable when the class has no page |
| **View all** | Link | Opens `/holdings` — this address does not exist and shows "This page doesn't exist" | — |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-004 hides classes; S-DASH-001 picker.

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| **View all** shows "This page doesn't exist" | The link points to a page that is not in the app | Use **Portfolios → Inspect**, or the asset-class pages |
| "Add transactions to see your top holdings" | No holdings | Add transactions |

**Limitations:** Ranked by current value, or by cost when there is no price ("cost basis" under the value, "no price" in the P&L column). Non-market holdings show "accrued" (interest-earning) or "at cost" under the P&L (phones: "accr"/"cost"). Quantities show up to 4 decimals.

**How it works:** Holdings of each selected portfolio (`GET /api/portfolios/:id/holdings`) are combined, sorted by value (cost when unpriced), filtered by sidebar visibility, and the first 10 shown.

**Related features:** F-PORT-004, F-SHELL-002.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:259`, `apps/web/src/pages/dashboard/DashboardPage.tsx:418`, `apps/web/src/pages/dashboard/DashboardPage.tsx:502`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1057`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1061`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1226`, `apps/web/src/App.tsx:282`

### Real Estate, Vehicles and Insurance cards <!-- F-DASH-012 -->

**What it does:** Three cards. **Real Estate** (rental properties): Property value, Monthly rent ("active tenancies"), Income YTD, Net P&L YTD and "N overdue receipt(s)". **Vehicles**: Total value, Pending challans ("None" when zero) and up to four "Expiring soon" items, or "All documents up to date". **Insurance**: Total sum assured ("N active policies"), Annual premium ("per year total") and up to four "Upcoming premiums" ("Due now" or days), or "No premiums due in the next 30 days". Each card has **Manage**.

**Why it exists:** Inferred from behavior: summaries of the non-investment parts of your wealth.

**Where to find it:** Dashboard, below Top holdings. The cards follow your sidebar order; a card is hidden when its sidebar entry is hidden.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO; family roles see members' items only with the RENTAL, VEHICLE, INSURANCE categories.

**Steps**
1. Click **Manage** on a card.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Manage** (Real Estate) | Link | Opens `/rental` | Card hidden when **Real Estate** is hidden in the sidebar |
| **Manage** (Vehicles) | Link | Opens `/vehicles` | Card hidden when **Vehicles** is hidden |
| **Manage** (Insurance) | Link | Opens `/insurance` | Card hidden when **Insurance** is hidden |

**Fields and rules:** None.

**Settings and toggles here:** S-SHELL-004 (order and visibility).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No properties added yet." / "No vehicles added yet." / "No policies added yet." | Nothing recorded | Add items on those pages |

**Limitations:** The Real Estate card shows rental properties and opens Rental, but its position and visibility follow the **Real Estate** sidebar entry. Not filtered by the portfolio picker. Item colours: 7 days or fewer red, up to 15 amber, otherwise blue.

**How it works:** Income YTD = rent payment entries since 1 April; Net P&L YTD = that minus property expenses paid since 1 April (deposits and discounts are not income). Monthly rent = rent of active tenancies. Annual premium = each active policy's premium converted to a yearly amount. Upcoming premiums = active policies with next premium due within 30 days.

**Related features:** D-DASH-003, D-DASH-004, D-DASH-005.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:1248`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1309`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1365`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1429`, `packages/api/src/services/analytics/dashboard.service.ts:184`, `packages/api/src/services/analytics/dashboard.service.ts:199`, `packages/api/src/services/analytics/dashboard.service.ts:222`, `packages/api/src/services/analytics/dashboard.service.ts:226`

### Recent transactions card <!-- F-DASH-013 -->

**What it does:** "Recent transactions" lists your 5 latest transactions: name, trade date · type, net amount and quantity @ price. **View all** opens Transactions.

**Why it exists:** Inferred from behavior: quick check that your latest entries or imports landed.

**Where to find it:** Dashboard, bottom.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **View all** to open `/transactions`.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **View all** | Link | Opens `/transactions` | — |

**Fields and rules:** None.

**Settings and toggles here:** None (not filtered by the portfolio picker).

**Results:** None.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Add a manual transaction to see activity here." | No transactions | Add one |

**Limitations:** Rows are not clickable here.

**How it works:** `GET /api/transactions?pageSize=5`, newest trade date first (then newest created).

**Related features:** F-TXN-001.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:381`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1449`, `apps/web/src/pages/dashboard/DashboardPage.tsx:1475`, `packages/api/src/services/holdings/transaction.service.ts:653`

### Refresh prices (dashboard) <!-- F-DASH-014 -->

**What it does:** **Refresh** fetches the latest prices for the stocks you hold and re-values all your holdings, then reloads the Dashboard.

**Why it exists:** Inferred from behavior: prices also update on a schedule (F-PORT-008); this lets you force it.

**Where to find it:** Dashboard header → **Refresh**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Refresh**. A spinner replaces the icon.
2. A message appears: "Updated N price(s) · M holding(s)" or "Data refreshed — no new prices available".

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Refresh** | Button | Refreshes prices | Disabled while running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** Stock prices and your holdings' current values, P&L and price dates are updated.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Refresh failed" (or the server's message) | Price source or server error | Try again later |

**Limitations:** Stock prices come from Yahoo; other holdings are re-valued from the latest stored prices (fund NAVs, crypto, gold arrive by their scheduled jobs).

**How it works:** `POST /api/assets/refresh-prices` → update Yahoo prices for held stocks, then refresh every holding's price; the Dashboard, portfolio and holdings caches are then reloaded.

**Related features:** F-PORT-005, F-PORT-008.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:433`, `apps/web/src/pages/dashboard/DashboardPage.tsx:437`, `apps/web/src/pages/dashboard/DashboardPage.tsx:523`, `packages/api/src/controllers/assets.controller.ts:85`

### Export dashboard report <!-- F-DASH-015 -->

**What it does:** **Export** opens "Download Report" to download the Dashboard as a PDF or Excel file.

**Why it exists:** Inferred from behavior: share or keep a dated snapshot of the Dashboard.

**Where to find it:** Dashboard header → **Export**.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO. In family view you can pick the member (**Report for**); "Whole family" is not offered here.

**Steps**
1. Click **Export**.
2. (Family view) choose **Report for**.
3. Choose **Scope**: **All portfolios combined** or **Specific portfolio** (then pick one).
4. Choose **Format**: **PDF** or **Excel (.xlsx)**.
5. Choose **Appearance**: **Dark** or **Light (print)** ("· current" marks the app's theme).
6. Click **Download**. It reads **Preparing…**, then `everypaisa-dashboard-report<-member>.pdf` or `.xlsx` downloads and the dialog closes.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Report for** | Select | Whose dashboard | Family view only |
| **Scope** | Select | All portfolios or one | — |
| Portfolio picker ("— pick portfolio —") | Select | Chooses the portfolio | Only for **Specific portfolio** |
| **PDF** / **Excel (.xlsx)** | Toggle | File format | — |
| **Dark** / **Light (print)** | Toggle | Colours of the file | — |
| **Cancel** / **Download** | Buttons | Close / download | **Download** disabled while preparing, or for **Specific portfolio** with none picked |

**Fields and rules:** A specific portfolio must be picked when Scope is Specific portfolio.

**Settings and toggles here:** S-DASH-007 **Dashboard export options** — Scope (default All portfolios combined), Format (default PDF), Appearance (default current theme); not remembered.

**Results:** A file is downloaded; it includes "Data as of / Data checks" lines like other reports.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A browser pop-up with an error text | The export failed | Try again; check the portfolio still exists |

**Limitations:** For another family member, the whole book is always exported (Scope is ignored).

**How it works:** `GET /api/reports/dashboard-export?format=&theme=&scope=&portfolioId=`; a specific portfolio must belong to the person the report is about.

**Related features:** D-DASH-010.

**Sources:** `apps/web/src/components/reports/DownloadReportButton.tsx:38`, `apps/web/src/components/reports/DownloadReportButton.tsx:70`, `apps/web/src/components/reports/DownloadReportButton.tsx:175`, `apps/web/src/components/reports/DownloadReportButton.tsx:201`, `apps/web/src/components/reports/DownloadReportButton.tsx:221`, `apps/web/src/components/reports/DownloadReportButton.tsx:246`, `packages/api/src/routes/reports.routes.ts:103`, `packages/api/src/controllers/reports.controller.ts:515`, `packages/api/src/controllers/reports.controller.ts:533`

### Free plan upgrade banner <!-- F-DASH-016 -->

**What it does:** On the Free plan the Dashboard opens with "You're on the Free plan — Upgrade to Plus for the full tax report catalog, AA auto-import, multiple portfolios, and AI insights." with **See plans** and a close button.

**Why it exists:** Code comment: "Free-tier upsell on the Dashboard. Dismissible."

**Where to find it:** Top of the Dashboard (also on the empty Dashboard).

**Who can use it:** R-FREE.

**Steps**
1. Click **See plans** to open Pricing, or × (**Dismiss**) to hide it.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **See plans** | Button link | Opens `/pricing` | — |
| **Dismiss** (×) | Icon button | Hides the banner | — |

**Fields and rules:** None.

**Settings and toggles here:** S-DASH-006 **Upgrade banner dismissed** — per account, on this browser.

**Results:** Dismissed banners stay hidden on this browser for this account.

**Errors and troubleshooting:** None.

**Limitations:** The header **Upgrade** button and sidebar card stay visible.

**How it works:** localStorage `everypaisa.dismissedUpgradeBanner.<userId>` = `"1"`.

**Related features:** F-SHELL-009.

**Sources:** `apps/web/src/components/dashboard/UpgradeBanner.tsx:7`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:23`, `apps/web/src/components/dashboard/UpgradeBanner.tsx:37`

### Gmail connect and scan progress cards <!-- F-DASH-017 -->

**What it does:** If you have not connected Gmail, a card "Auto-import from Gmail — Scan your inbox for contract notes and statements — you approve each document before import." offers **Connect Gmail**. If Gmail is connected and an inbox scan is running, a card "Scanning your Gmail inbox…" shows "<processed> / <total> messages • N financial document(s) found", a progress bar and **Review docs**.

**Why it exists:** Inferred from behavior: invites automatic import and shows its progress where you land.

**Where to find it:** Dashboard, below the alerts strip area.

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO.

**Steps**
1. Click **Connect Gmail**. You are sent to Google to approve access (continued in the Gmail chapter).
2. While a scan runs, click **Review docs** to open Reports → inbox imports.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Connect Gmail** | Button | Starts Google sign-in | Hidden when an active Gmail mailbox exists |
| **Review docs** | Button link | Opens `/reports?tab=inbox-imports` | Shown only while a scan is running |

**Fields and rules:** None.

**Settings and toggles here:** None.

**Results:** See the Gmail chapter (D-DASH-011).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Failed to start Gmail connect" (or the server's message) | Could not get the Google sign-in link | Try again; ask the operator if Google sign-in is configured |

**Limitations:** The progress card disappears when no scan is running.

**How it works:** `GET /api/mailboxes` (active Gmail mailbox?), `GET /api/gmail/auth-url`, and `GET /api/gmail/scan-jobs` polled every 3 seconds while a scan is in PENDING, LISTING, DOWNLOADING or CLASSIFYING.

**Related features:** D-DASH-011.

**Sources:** `apps/web/src/pages/dashboard/DashboardPage.tsx:1499`, `apps/web/src/components/dashboard/ConnectGmailCard.tsx:8`, `apps/web/src/components/dashboard/ConnectGmailCard.tsx:24`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:9`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:18`, `apps/web/src/components/dashboard/GmailScanProgressCard.tsx:49`

### Daily net-worth snapshot <!-- F-DASH-018 -->

**What it does:** Every night at 23:45 India time, EveryPaisa records each active user's net worth (gross, liabilities, net after liabilities and the breakdown) for that day. These records draw the Net worth over time chart.

**Why it exists:** Code comment: "so the dashboard trend chart has a time series to render", scheduled after the last price updates of the day.

**Where to find it:** Not a page; results appear in **Dashboard → Net worth over time**.

**Who can use it:** Runs for every active account automatically.

**Steps:** Not applicable — automatic.

**Controls:** None.

**Fields and rules:** None.

**Settings and toggles here:** None for users. Operators can switch it off (`ENABLE_NET_WORTH_SNAPSHOT_CRON=false`).

**Results:** One snapshot per user per day; running again the same day replaces it.

**Errors and troubleshooting:** None visible — a failure for one user is logged and the others continue.

**Limitations:** Snapshots use your personal figures with all portfolios (no family, no filter). A backend endpoint `POST /api/intelligence/net-worth/snapshot` can take today's snapshot on demand but the app has no button for it.

**How it works:** For each active user, runs the same net-worth calculation as the Dashboard under that user's data context and upserts `NetWorthSnapshot (userId, asOf)`. A second run while one is in progress is skipped.

**Related features:** F-DASH-005.

**Sources:** `packages/api/src/jobs/netWorthSnapshotJob.ts:28`, `packages/api/src/jobs/netWorthSnapshotJob.ts:54`, `packages/api/src/jobs/netWorthSnapshotJob.ts:86`, `packages/api/src/jobs/netWorthSnapshotJob.ts:92`, `packages/api/src/controllers/intelligence.controller.ts:32`

### What this area doesn't do
- The Dashboard cannot be rearranged beyond the sidebar order/visibility of asset classes and the three summary cards.
- There is no "View all holdings" page — the **View all** link on Top holdings goes nowhere.
- Total Net Worth does not include bank balances or properties on the Real Estate page.
- You cannot pick custom date ranges for the charts — only 1M, 3M, 6M, 1Y and All.
- The portfolio picker is not remembered between visits.

