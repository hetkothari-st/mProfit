[Index](../INDEX.md)

# Stocks

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Stocks** page shows your equity and ETF holdings combined across every portfolio, with live-ish prices, and lets you drill into each stock's transactions.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-STOCK-001](../features/F-STOCK-001.md) | Stocks holdings overview | Live | Shows four summary cards (Current value, Invested, Unrealised P&L, Return) and an Equity Holdings table with one row per stock or ETF, … |
| [F-STOCK-002](../features/F-STOCK-002.md) | Add, edit and delete stock transactions | Live | Add transaction opens the app's standard transaction form to record a stock or ETF trade. |
| [F-STOCK-003](../features/F-STOCK-003.md) | Refresh stock prices | Live | Refresh prices fetches current prices for held stocks and re-values holdings, then shows "Refreshed N stock prices". |

### What this area doesn't do
- No stock search, watchlist, price chart or corporate-action screen here.
- No per-portfolio filter on the page; it always aggregates every portfolio.
- No sorting or column filtering on the holdings table.
