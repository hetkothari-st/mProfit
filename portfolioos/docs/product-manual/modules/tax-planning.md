[Index](../INDEX.md)

# Tax Planning

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Tax Planning** page (sidebar **Planning → Tax Planning**, route `/tax`; page title "Tax Reports — ITR-aligned capital gains, business income and tax-harvesting across all portfolios") estimates the tax on your investment gains for a financial year, lists the gains the way the income-tax return schedules ask for them, shows which holdings could be sold at a loss to cut tax, and lets you enter the 31-Jan-2018 prices used for grandfathering. It always covers all your portfolios.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-TAX-001](../features/F-TAX-001.md) | Tax page controls | Live | A card with Financial Year, Download reports for (when you can report on others) and a download button that depends on the tab, plus 10 … |
| [F-TAX-002](../features/F-TAX-002.md) | Tax summary (estimated tax by section) | Live | Three cards — Total Realised Gain (FY), Estimated Tax Liability ("Excludes surcharge & cess") and Effective Rate (Tax / Realised Gain) — … |
| [F-TAX-003](../features/F-TAX-003.md) | CA Tax Report (PDF) | Live | Downloads "CA-ready capital gains report" — "One PDF with tax summary, unrealised snapshot, harvesting opportunities, and full transaction … |
| [F-TAX-004](../features/F-TAX-004.md) | Schedule 112A tab and ITR-portal CSV | Live | Lists the FY's long-term sales of listed equity and equity-oriented funds ("Schedule 112A · LTCG on listed equity / equity MF") with Asset, … |
| [F-TAX-005](../features/F-TAX-005.md) | Schedule 112 tab | Live | "Schedule 112 · LTCG on other assets (with indexation)": long-term sales of non-equity assets with an Indexed Cost column. |
| [F-TAX-006](../features/F-TAX-006.md) | STCG, LTCG and Intraday tabs | Live | Three lists for the FY: "Short-Term Capital Gains", "Long-Term Capital Gains" (with Indexed Cost) and "Intraday (Sec. |
| [F-TAX-007](../features/F-TAX-007.md) | F&O (Sec. 43(5)) tab | Live | "F&O Schedule 43 / ITR-3 Schedule BP · FY …": Gross Profit, Gross Loss, Net P&L, Turnover (ICAI), Trades, an audit note, and a … |
| [F-TAX-008](../features/F-TAX-008.md) | Dividend & Interest tab | Live | "Dividends ₹… · Interest ₹… · Maturity ₹… · Total ₹…" and a table Date, Type, Portfolio, Asset, Amount, Narration across all portfolios. |
| [F-TAX-009](../features/F-TAX-009.md) | Tax Harvest tab | Live | Cards Total Unrealised Loss, STCG Loss Available (with "Realised STCG this FY"), LTCG Loss Available (with "Realised LTCG this FY") and a … |
| [F-TAX-010](../features/F-TAX-010.md) | Grandfathering (112A FMV) tab | Live | For the FY's sales of equity bought on or before 31-Jan-2018: cards Rows requiring FMV, Gain without FMV, Gain with FMV ("Using Sec. |

Settings for this module: [settings/tax-planning.md](../settings/tax-planning.md)
