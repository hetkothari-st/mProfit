
## Analytics

The **Analytics** page (sidebar **Overview → Analytics**, also on the phone tab bar; route `/analytics`; heading "Your money, in detail") explains your portfolio in charts. **Overview** answers "what is it worth, am I up or down, what is doing badly, and what will March cost me"; **Detail** holds the rest (code comment). Every chart and metric has an "i" button whose text says exactly what the number is and which time frame it follows.

### Analytics page controls <!-- F-ANLYT-001 -->
**What it does:** A portfolio selector (**All portfolios (N)** or one portfolio), period pills **1M**, **3M**, **6M**, **1Y**, **3Y**, **5Y**, **All**, and two views, **Overview** and **Detail**. With no portfolios it shows "No portfolios yet — Create a portfolio and add transactions to unlock analytics." with **Get started**.

**Why it exists:** Lets you scope the analysis to one book and a time window. The view is in the URL "so a view can be linked and reloaded into" (code comment).

**Where to find it:** **Overview → Analytics** (route `/analytics`; `/analytics?view=detail` opens Detail).

**Who can use it:** R-FREE, R-PLUS, R-FAMILY, R-PRO (AI Insights needs R-PLUS); R-MANAGER (managed person's data).

**Steps**
1. Open **Analytics**. Overview loads for all portfolios and 1Y.
2. Choose a portfolio and/or period. Cards reload (loading placeholders show meanwhile).
3. Click **Detail** for the second set of charts; **Overview** to go back.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Portfolio selector | Select | S-ANLYT-001 | — |
| **1M** … **All** | Pills | S-ANLYT-002 | — |
| **Overview** / **Detail** | Tabs | S-ANLYT-003 | — |
| **Get started** | Link | Opens `/onboarding` | Only with no portfolios |
| "i" buttons | Popovers | Explain each card | — |

**Fields and rules:** Not applicable — selectors only.

**Settings and toggles here:** S-ANLYT-001 **Portfolio** — all or one; S-ANLYT-002 **Period** — 30, 90, 180, 365, 1095, 1825 days or all history, used only by cards that say "Follows the period selected at the top."; S-ANLYT-003 **View** — kept in the URL. Portfolio and period reset on reload.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Placeholders never fill | The snapshot request failed (no message is shown) | Reload; in family view choose **All portfolios** |

**Limitations:** In a family view the selector also lists other members' portfolios, but the API accepts only your own (403) — choose **All portfolios** (see DOCUMENTATION_GAPS.md). The data is cached in the browser for 5 minutes (risk for 15).

**How it works:** One call `GET /api/analytics/snapshot?portfolioId&period` returns all cheap widgets; `GET /api/analytics/risk` is fetched only on **Detail**. Period values outside the list are rejected: "Invalid period "…". Use one of: 1M, 3M, 6M, 1Y, 3Y, 5Y, All".

**Related features:** F-ANLYT-002 to F-ANLYT-013, D-ANLYT-001.

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:27`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:50`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:57`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:77`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:97`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:123`, `packages/api/src/controllers/analytics.controller.ts:52`, `packages/api/src/controllers/analytics.controller.ts:67`, `packages/api/src/services/analytics/analytics.service.ts:43`, `apps/web/src/App.tsx:166`

### Headline numbers (KPI cards) <!-- F-ANLYT-002 -->
**What it does:** Three cards: **Current value** ("You put in ₹…"), **Profit if you sold today** (₹ with sign and % of invested) and **Annualised return** (XIRR; hint "XIRR · counts when each rupee went in", or "Needs N more days · so far x%" when history is too short).

**Why it exists:** "The three numbers this page exists to answer: what is it worth, am I up or down, and what return is that." (code comment).

**Where to find it:** **Overview → Analytics → Overview**, top.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001 (not the period — these are as of today).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Annualised return "—" | Less than 90 days of cash flows | Wait; the hint says how many days remain |

**Limitations:** XIRR is suppressed under 90 days of history.

**How it works:** From the snapshot `kpis` block: current value, total cost, unrealised P&L and overall XIRR with a reliability flag (span < 90 days → unreliable).

**Related features:** F-REPORT-008.

**Sources:** `apps/web/src/pages/analytics/widgets/KpiCards.tsx:34`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:41`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:51`, `apps/web/src/pages/analytics/widgets/KpiCards.tsx:62`, `packages/api/src/services/analytics/analytics.service.ts:111`, `apps/web/src/pages/analytics/infoCopy.ts:42`

### Portfolio value over time <!-- F-ANLYT-003 -->
**What it does:** A line chart: solid line = market value of your holdings, dashed line = amount invested in them, over the selected period.

**Why it exists:** "The one chart that tells the whole story" (code comment); the gap between lines is your gain or loss.

**Where to find it:** **Analytics → Overview**, under the KPI cards.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" button | Popover | Definition | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001, S-ANLYT-002.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No history yet" | No valuation points in the period | Choose a longer period |

**Limitations:** Month-end/dated valuation points from transaction replay; not intraday.

**How it works:** Snapshot `portfolioValueLine` for the period's days (All = full history).

**Related features:** F-REPORT-009.

**Sources:** `apps/web/src/pages/analytics/widgets/PerformanceWidgets.tsx:23`, `apps/web/src/pages/analytics/widgets/PerformanceWidgets.tsx:38`, `packages/api/src/services/analytics/analytics.service.ts:656`, `apps/web/src/pages/analytics/infoCopy.ts:74`

### AI Portfolio Insights <!-- F-ANLYT-004 -->
**What it does:** A foldable panel **AI Portfolio Insights**. It shows instant rule-based cards ("Instant · from your data") — an FD maturing within 30 days, and from October to March the total unrealised loss on equity, ETF and mutual fund holdings that could offset gains before 31 March — and, on request, an AI-written narrative with cards by category (Diversification, Tax optimisation, Underperformers, Cash drag, Sector tilt, Risk concentration) and severity (HIGH/MEDIUM/LOW), each possibly with a link to act on it, followed by a disclaimer.

**Why it exists:** A starting point for your own review — "Observations generated by AI from your portfolio data … not financial advice" (info text).

**Where to find it:** **Analytics → Overview**, below the value chart.

**Who can use it:** R-PLUS, R-FAMILY, R-PRO. R-FREE sees the panel blurred behind "AI Insights is locked — Upgrade to Plus to unlock AI Insights." with **View plans**. R-MANAGER: the managed person's data under the manager's plan.

**Steps**
1. Expand the panel if folded (click its title).
2. With no stored insight: click **Generate insights**. A cached result under 24 hours old is reused ("Loaded cached insight (under 24h old).") or a new one is made ("Insights generated.").
3. To force a fresh run, click **Regenerate** (or **Generate** in the header).

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Panel title (chevron) | Toggle | Fold/unfold; remembered on this browser (S-ANLYT-005) | — |
| **Generate insights** | Button | Generate, reusing a result under 24 h old | Disabled while running or when the monthly AI budget is reached |
| **Regenerate** / **Generate** (header) | Button | Always makes a fresh result | Same; hidden when folded |
| Card action link | Link | Opens the relevant page | Only when the card has one |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-ANLYT-005 **Insights panel folded** (this browser only); S-ANLYT-001 and S-ANLYT-002 are sent with the request.

**Results:** A new insight is stored for you (per portfolio or all portfolios) and its estimated cost is added to your monthly AI spend.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Monthly LLM budget reached — New insights are paused until next month, or until the cap is raised in settings." | Your AI spend this month reached the cap (default ₹1,000) | Wait for next month; the cap is operator configuration, not a user setting |
| "AI Insights are disabled (set ENABLE_LLM_INSIGHTS=true)." | Feature off on this server | Operator must enable it |
| "ANTHROPIC_API_KEY is not set — cannot generate insights." | Server not configured | Operator |
| "Monthly LLM cap reached (₹x / ₹y)." | Budget reached at generate time | Wait |
| "No portfolio data available to analyse." | Nothing to analyse | Add holdings |
| "Generate failed" | Request failed | Retry |

**Limitations:** The 24-hour cache is per portfolio scope, not per period. Server configuration messages are shown to users verbatim. The rule-based cards always cover all your portfolios. The panel is still mounted (blurred) for Free users, whose insight requests are refused by the server.

**How it works:** `GET /api/analytics/insights` returns the latest stored insight (any age); `POST /api/analytics/insights/generate {period, force}`; `GET /api/analytics/insights/deterministic`; `GET /api/analytics/insights/spend` (ungated). Generation uses the Anthropic API with model from AppSetting `llm.insights_model` or env `LLM_INSIGHTS_MODEL` (default `claude-sonnet-4-6`), sends your aggregated snapshot (not raw documents), and records cost at $3 input / $15 output per million tokens × FX (AppSetting `llm.usd_inr_fx`, default 90). In non-production the feature is on when an API key exists. Budget: warn ₹500, cap ₹1,000 per month unless overridden.

**Related features:** F-ANLYT-008, D-ANLYT-002.

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:177`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:107`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:146`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:174`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:223`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:254`, `apps/web/src/pages/analytics/widgets/InsightsPanel.tsx:268`, `packages/api/src/routes/analytics.routes.ts:33`, `packages/api/src/services/analytics/analytics.insights.ts:133`, `packages/api/src/services/analytics/analytics.insights.ts:146`, `packages/api/src/services/analytics/analytics.insights.ts:185`, `packages/api/src/services/analytics/analytics.insights.ts:286`, `packages/api/src/services/analytics/analytics.insights.ts:345`, `packages/api/src/services/insights/deterministicInsightsRules.ts:8`, `packages/api/src/services/insights/deterministicInsightsRules.ts:33`, `packages/api/src/ingestion/llm/budget.ts:21`, `packages/api/src/config/env.ts:117`

### Allocation and concentration <!-- F-ANLYT-005 -->
**What it does:** **Allocation by class** — a pie of today's value by asset type. **Concentration** — your largest holdings (up to 10) with each one's share, and a sentence "Your top N holdings are X% of everything you own" (or "Your biggest holding is X% of everything you own" when the listed holdings are the whole portfolio).

**Why it exists:** Shows where the money sits and how much sits in one place. From info text.

**Where to find it:** **Analytics → Overview**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet" | No holdings | — |

**Limitations:** The info text says shares "above 60% is flagged", but the card shows no flag (see DOCUMENTATION_GAPS.md).

**How it works:** Snapshot `allocationByClass` and `concentrationRisk` (top 10 of the holdings treemap by value, with running cumulative %).

**Related features:** F-ANLYT-010.

**Sources:** `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:21`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:100`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:119`, `packages/api/src/services/analytics/analytics.service.ts:230`, `packages/api/src/services/analytics/analytics.service.ts:357`, `apps/web/src/pages/analytics/infoCopy.ts:115`

### Best and worst holdings <!-- F-ANLYT-006 -->
**What it does:** One table of up to 5 biggest losers and 5 biggest gainers ranked by rupees, with Asset, Class, Value, Gain / loss and %.

**Why it exists:** "Ranked by rupees on purpose: a small holding down 40% matters less than a large one down 5%." (info text).

**Where to find it:** **Analytics → Overview**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" button | Popover | Definition | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No holdings yet" | No priced holdings | — |

**Limitations:** The server sends the top 10 gainers and losers by percentage; the page re-ranks only those by rupees, so a large-rupee loser outside the top 10 by percentage is not shown. Holdings without a price are left out.

**How it works:** Snapshot `topWinnersLosers` (n = 10 each, by % gain); browser re-sorts the union by rupee P&L and takes 5 each side.

**Related features:** F-ANLYT-005.

**Sources:** `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:33`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:36`, `packages/api/src/services/analytics/analytics.service.ts:340`

### Tax block: financial year and "What you'll owe" <!-- F-ANLYT-007 -->
**What it does:** Under the heading **Tax**, a financial-year selector (labelled "FY 2026-27" etc.) and the card **What you'll owe**: the tax on gains booked so far in that FY and, when it is ₹10,000 or more, the four advance-tax instalments (15 June 15%, 15 September 45%, 15 December 75%, 15 March 100%) with the cumulative amount due, status ("Nothing due", "x% of the year", or "Missed · ₹… interest") and an estimate of interest on missed instalments at 1% a month (section 234C).

**Why it exists:** "The two things they ask at tax time now live here too: pick the year, and see what is owed on it." (code comment).

**Where to find it:** **Analytics → Overview**, section **Tax**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps**
1. Choose the FY (current FY is always offered, plus years with activity).
2. Read the amount and instalments.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| FY selector | Select | S-ANLYT-004 | — |

**Fields and rules:** Not applicable.

**Settings and toggles here:** S-ANLYT-004 **Tax financial year** — drives only this block and the harvest card.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not work out the tax for FY …" | Request failed | Reload |
| "Nothing to pay on investments for FY … — no gains have been booked." | No gains | — |
| "… covered by exemptions and set-off." | Gains fully exempt or offset | — |
| "… That is under the ₹10,000 mark, so there is nothing to pay in instalments — it settles with your return." | Total below ₹10,000 | — |

**Limitations:** "Covers investment income this app can see — capital gains, intraday and crypto. Salary, TDS already deducted, other income and deductions are not included, so treat it as a floor rather than a tax return." Advance tax already paid is not known to the app. Slab-rated amounts assume 30% unless your slab is recorded.

**How it works:** `GET /api/tax/advance?fy`. Tax is computed as at each instalment date; a gain counts only from the instalment after it is booked (234C proviso). Interest = shortfall × 1% × 3 months for each of the first three instalments, 1 month for the last, once the date has passed. Below ₹10,000 total, nothing is due in instalments (sec 208).

**Related features:** F-TAX-002.

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:196`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:23`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:69`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:103`, `apps/web/src/pages/analytics/widgets/TaxYearWidgets.tsx:146`, `packages/api/src/services/tax/advanceTaxMath.ts:24`, `packages/api/src/services/tax/advanceTaxMath.ts:38`, `packages/api/src/services/tax/advanceTax.service.ts:62`

### Cut your tax bill (harvesting) <!-- F-ANLYT-008 -->
**What it does:** For the current FY only: a sentence with the estimated saving ("Selling the holdings below at a loss before 31 March could reduce this year's tax by about ₹…"), four tiles (**Unrealised loss pool**, **STCG offset available**, **LTCG offset available**, **Taxable gains (FY)**), the tax-before/after working with rates and exemption, and up to 20 loss-making holdings (Asset, Portfolio, Class, Bucket, Unrealised loss). For a past FY the card is replaced by "Harvesting losses only helps for the year you are still in. Switch to FY … to see what you could still do."

**Why it exists:** "Leads with one sentence and a rupee figure, because that is the only part most readers need: what selling your losers before 31 March would save." (code comment).

**Where to find it:** **Analytics → Overview**, under **What you'll owe**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001, S-ANLYT-004 (must be the current FY).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Nothing to harvest — none of your holdings is currently worth less than you paid." | No losses | — |
| "… you have no gains this year for them to cancel out." | No booked gains | — |
| "… the gains you have booked so far are already untaxed." | Gains within exemption | — |

**Limitations:** With one portfolio selected, only the candidate list is limited to that portfolio; the totals and the saving are computed across all your portfolios (see DOCUMENTATION_GAPS.md). "An estimate under current set-off rules — not advice."

**How it works:** Snapshot `taxHarvest` from the same harvest report as F-TAX-009 for the current FY; saving = tax on realised gains before minus after offsetting available losses, at today's equity rates and the FY exemption.

**Related features:** F-TAX-009, W-TAX-002.

**Sources:** `apps/web/src/pages/analytics/AnalyticsPage.tsx:199`, `apps/web/src/pages/analytics/AnalyticsPage.tsx:204`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:106`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:122`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:169`, `packages/api/src/services/analytics/analytics.service.ts:847`, `packages/api/src/services/tax/tax.service.ts:633`

### Capital gains by FY and Income by month <!-- F-ANLYT-009 -->
**What it does:** On **Detail**: **Capital gains by FY** — grouped bars Intraday, STCG, LTCG for the last 6 financial years; **Income by month** — stacked bars Dividend, Interest, Maturity for up to the last 12 months, including interest accrued on fixed deposits, NSC, RD and post-office schemes.

**Why it exists:** Trends in realised gains and income. From info text.

**Where to find it:** **Analytics → Detail**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| Chart tooltips | Hover | Exact amounts | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001; S-ANLYT-002 (income chart only).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No realised gains" / "No income recorded" | No data | — |

**Limitations:** Gains chart: last 6 FYs only.

**How it works:** Snapshot `cgByFy` and `incomeTrend` (period days).

**Related features:** F-REPORT-004, F-REPORT-007.

**Sources:** `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:25`, `apps/web/src/pages/analytics/widgets/TaxWidgets.tsx:62`, `packages/api/src/services/analytics/analytics.service.ts:473`, `packages/api/src/services/analytics/analytics.service.ts:581`, `apps/web/src/pages/analytics/infoCopy.ts:127`

### Sector allocation and XIRR by asset class <!-- F-ANLYT-010 -->
**What it does:** **Sector allocation** — pie of directly held stocks by sector (unknown = Unclassified; slices over 6% labelled). **XIRR by asset class** — bars of annualised return per asset type over the whole holding time (up to 12 classes; green gain, red loss).

**Why it exists:** Sector tilt and which asset types actually earn. From info text.

**Where to find it:** **Analytics → Detail**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No equity holdings to classify" | No direct stocks | — |
| "Not enough cashflows to compute XIRR" | No class has an XIRR | — |

**Limitations:** Mutual funds and other assets are not in the sector pie. Across several portfolios, class XIRR is an invested-weighted average.

**How it works:** Snapshot `sectorAllocation` (from the stock master's sector) and `assetClassXirr`.

**Related features:** F-ANLYT-005.

**Sources:** `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:86`, `apps/web/src/pages/analytics/widgets/AllocationWidgets.tsx:111`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:151`, `apps/web/src/pages/analytics/widgets/ReturnsWidgets.tsx:170`, `packages/api/src/services/analytics/analytics.service.ts:384`, `packages/api/src/services/analytics/analytics.service.ts:777`, `apps/web/src/pages/analytics/infoCopy.ts:118`

### Money in and out; What you own and owe <!-- F-ANLYT-011 -->
**What it does:** **Money in and out** — monthly bars of cash coming back to you (sales, dividends, interest, maturities) against money you put in (buys, SIPs, deposits), last 12 months. **What you own and owe** — You own, You owe, Net worth.

**Why it exists:** Cash direction and the net-worth picture. From info text ("Neither is good or bad — investing steadily sits below").

**Where to find it:** **Analytics → Detail**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001, S-ANLYT-002 (cash chart).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "No cashflow recorded" | No investment cash flows | — |

**Limitations:** Liabilities come from the dashboard net-worth service (loans, cards).

**How it works:** Snapshot `cashflowWaterfall` and `liabilitiesVsAssets` (dashboard net worth: total, liabilities, after liabilities).

**Related features:** D-INTEL-001.

**Sources:** `apps/web/src/pages/analytics/widgets/CashflowWidget.tsx:26`, `apps/web/src/pages/analytics/widgets/LiabilitiesWidget.tsx:15`, `packages/api/src/services/analytics/analytics.service.ts:883`, `packages/api/src/services/analytics/analytics.service.ts:937`, `apps/web/src/pages/analytics/infoCopy.ts:140`

### Risk: swings, worst fall, return correlation <!-- F-ANLYT-012 -->
**What it does:** Cards **How much it swings** (annualised volatility from month-to-month value changes) and **Worst fall** (largest peak-to-trough fall in the period); grid **Return correlation by asset class** (−1 to +1 between pairs of up to 8 largest classes with price history), with "Not shown — no price history: …".

**Why it exists:** Shows how bumpy the ride is and how diversified your asset classes really are. From info text. Sharpe and beta were removed because they are distorted by money you add (code comment).

**Where to find it:** **Analytics → Detail**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps:** Not applicable — view only.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| "i" buttons | Popovers | Definitions | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** S-ANLYT-001, S-ANLYT-002.

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Needs at least two asset classes with price history and 6+ months of data in the selected period." | Not enough data | Choose a longer period |

**Limitations:** Volatility and worst fall use total value, so deposits and withdrawals look like swings. Deposits and other unpriced classes are not in the correlation.

**How it works:** `GET /api/analytics/risk?portfolioId&period` — one monthly valuation pass feeds volatility, max drawdown and class correlation (Pearson over monthly price returns, minimum observations from the server, 6 by default on screen). The NIFTY fetch for beta is capped at 6 seconds.

**Related features:** F-ANLYT-001.

**Sources:** `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:27`, `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:98`, `apps/web/src/pages/analytics/widgets/RiskWidget.tsx:115`, `packages/api/src/controllers/analytics.controller.ts:87`, `packages/api/src/services/analytics/analytics.risk.ts:108`, `packages/api/src/services/analytics/analytics.risk.ts:264`, `apps/web/src/pages/analytics/infoCopy.ts:150`

### What-if: simulate a sale <!-- F-ANLYT-013 -->
**What it does:** Pick a holding, a **Sell qty** and optionally a **Sell price (opt.)**, click **Simulate**: shows Proceeds, the realised gain (labelled Realised STCG / Realised LTCG / Realised gain (mixed)), Est. tax (with rate), Net cash after tax, the split for mixed lots, the share taxed at your slab rate, "Matched N purchase lots oldest-first (FIFO), from <date> · cost basis ₹…", and "This holding: x% → y% of portfolio · N units left (₹…)". Nothing is sold.

**Why it exists:** To preview the tax and concentration effect of a sale before making it. From info text.

**Where to find it:** **Analytics → Detail**, card **What-if: simulate a sale**.

**Who can use it:** R-FREE and up; R-MANAGER.

**Steps**
1. Choose a holding in **Select a holding…** (all your portfolios, units shown).
2. Enter **Sell qty** (placeholder = units held) and optionally a price (placeholder = current price).
3. Click **Simulate**.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Holding** | Select | Holding to sell | — |
| **Sell qty** | Number | Units | — |
| **Sell price (opt.)** | Number | Price; blank = current price | — |
| **Simulate** | Button | Runs the simulation | Disabled until a holding and qty > 0 are set, and while running |

**Fields and rules**
| Field | Type | Required | Format / limits | Default | Error shown (exact) |
|---|---|---|---|---|---|
| Sell qty | Number | Yes | > 0 and ≤ units held | Empty | "Sell quantity must be positive", "Sell quantity exceeds holding" |
| Sell price | Number | No | Decimal | Current price (else value ÷ qty, else average cost) | — |

**Settings and toggles here:** None (ignores the page's portfolio selector).

**Results:** View only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Holding not found" | Holding removed | Reload |
| "holdingId and sellQty are required" | Missing input | Fill both |

**Limitations:** "LTCG figures are approximate (the ₹1.25L exemption applies at the aggregate FY level); … Charges (brokerage, STT, stamp duty) are excluded." (disclaimer shown under the result).

**How it works:** `POST /api/analytics/what-if {holdingId, sellQty, sellPrice}` replays the portfolio's transactions to get open FIFO lots (holdings-only imports count as one short-term lot), prices the sale and taxes each part by its term and asset type at today's rates; non-equity short-term gains use your slab (30% if not on file).

**Related features:** F-ANLYT-008.

**Sources:** `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:18`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:41`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:58`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:83`, `apps/web/src/pages/analytics/widgets/WhatIfSimulator.tsx:144`, `packages/api/src/controllers/analytics.controller.ts:28`, `packages/api/src/services/analytics/whatIf.service.ts:27`, `packages/api/src/services/analytics/whatIf.service.ts:32`, `packages/api/src/services/analytics/whatIf.service.ts:155`, `packages/api/src/services/analytics/whatIf.service.ts:84`

**What this area doesn't do**
- No benchmark comparison is drawn on the page (the API has one, unused).
- No export or download of the charts.
- It doesn't place or record trades — the what-if is a preview only.
- It doesn't show Sharpe ratio or beta.
