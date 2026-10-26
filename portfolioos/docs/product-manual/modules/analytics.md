[Index](../INDEX.md)

# Analytics

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Analytics** page (sidebar **Overview → Analytics**, also on the phone tab bar; route `/analytics`; heading "Your money, in detail") explains your portfolio in charts. **Overview** answers "what is it worth, am I up or down, what is doing badly, and what will March cost me"; **Detail** holds the rest (code comment). Every chart and metric has an "i" button whose text says exactly what the number is and which time frame it follows.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-ANLYT-001](../features/F-ANLYT-001.md) | Analytics page controls | Live | A portfolio selector (All portfolios (N) or one portfolio), period pills 1M, 3M, 6M, 1Y, 3Y, 5Y, All, and two views, Overview and Detail. |
| [F-ANLYT-002](../features/F-ANLYT-002.md) | Headline numbers (KPI cards) | Live | Three cards: Current value ("You put in ₹…"), Profit if you sold today (₹ with sign and % of invested) and Annualised return (XIRR; hint … |
| [F-ANLYT-003](../features/F-ANLYT-003.md) | Portfolio value over time | Live | A line chart: solid line = market value of your holdings, dashed line = amount invested in them, over the selected period. |
| [F-ANLYT-004](../features/F-ANLYT-004.md) | AI Portfolio Insights | Live | A foldable panel AI Portfolio Insights. |
| [F-ANLYT-005](../features/F-ANLYT-005.md) | Allocation and concentration | Live | Allocation by class — a pie of today's value by asset type. |
| [F-ANLYT-006](../features/F-ANLYT-006.md) | Best and worst holdings | Live | One table of up to 5 biggest losers and 5 biggest gainers ranked by rupees, with Asset, Class, Value, Gain / loss and %. |
| [F-ANLYT-007](../features/F-ANLYT-007.md) | Tax block: financial year and "What you'll owe" | Live | Under the heading Tax, a financial-year selector (labelled "FY 2026-27" etc.) and the card What you'll owe: the tax on gains booked so far … |
| [F-ANLYT-008](../features/F-ANLYT-008.md) | Cut your tax bill (harvesting) | Live | For the current FY only: a sentence with the estimated saving ("Selling the holdings below at a loss before 31 March could reduce this … |
| [F-ANLYT-009](../features/F-ANLYT-009.md) | Capital gains by FY and Income by month | Live | On Detail: Capital gains by FY — grouped bars Intraday, STCG, LTCG for the last 6 financial years; Income by month — stacked bars Dividend, … |
| [F-ANLYT-010](../features/F-ANLYT-010.md) | Sector allocation and XIRR by asset class | Live | Sector allocation — pie of directly held stocks by sector (unknown = Unclassified; slices over 6% labelled). |
| [F-ANLYT-011](../features/F-ANLYT-011.md) | Money in and out; What you own and owe | Live | Money in and out — monthly bars of cash coming back to you (sales, dividends, interest, maturities) against money you put in (buys, SIPs, … |
| [F-ANLYT-012](../features/F-ANLYT-012.md) | Risk: swings, worst fall, return correlation | Live | Cards How much it swings (annualised volatility from month-to-month value changes) and Worst fall (largest peak-to-trough fall in the … |
| [F-ANLYT-013](../features/F-ANLYT-013.md) | What-if: simulate a sale | Live | Pick a holding, a Sell qty and optionally a Sell price (opt.), click Simulate: shows Proceeds, the realised gain (labelled Realised STCG / … |

Settings for this module: [settings/analytics.md](../settings/analytics.md)
