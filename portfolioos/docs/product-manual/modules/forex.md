[Index](../INDEX.md)

# Forex

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Forex** page (sidebar **Asset Classes → Forex**, route `/forex`) covers money held or moved in foreign currencies: live reference rates, foreign-currency cash balances, currency-pair trading positions with their speculative P&L, foreign shares, and outward remittances under the Liberalised Remittance Scheme (LRS) with tax collected at source (TCS). Forex is an optional asset class: it appears in the sidebar only after you add it with **Add asset class** ([D-FX-001](../dependencies.md#d-fx-001)). Nothing here is plan-gated.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-FX-001](../features/F-FX-001.md) | Live FX rates | Live | The Live FX rates panel shows the latest stored rate for each INR pair (USD, EUR, GBP, JPY, AED, SGD, AUD, CAD, CHF, HKD, CNY → INR) and … |
| [F-FX-002](../features/F-FX-002.md) | Foreign currency balances | Live | The Cash tab lists foreign-currency balances (for example Wise, a foreign bank or a forex card) with currency, account label and last 4 … |
| [F-FX-003](../features/F-FX-003.md) | FX pair positions | Live | The FX pairs tab lists currency-pair positions (for example USDINR or EURUSD) recorded as transactions, with live value from the stored … |
| [F-FX-004](../features/F-FX-004.md) | Forex pair P&L by financial year | Live | The Speculative business income (FOREX_PAIR P&L) table shows, per portfolio, pair and financial year, buy and sell quantity, realised P&L … |
| [F-FX-005](../features/F-FX-005.md) | Foreign equities | Live | The Foreign equities tab lists US and international shares (for example AAPL, MSFT) recorded as transactions, valued with the Yahoo price … |
| [F-FX-006](../features/F-FX-006.md) | LRS utilisation | Live | The LRS utilisation card shows "FY <year> · $used of $250000.00 used", a bar (green, amber above 80%, red at 100%) and "N% of annual LRS … |
| [F-FX-007](../features/F-FX-007.md) | Record or delete an LRS remittance | Live | Record LRS remittance saves an outward remittance (date, purpose, currency, amount, optional FX rate, bank, reference, TCS deducted, … |
| [F-FX-008](../features/F-FX-008.md) | TCS credits | Partial | When TCS credits exist, the TCS credits table lists them (FY, collector, TAN, amount). |

Settings for this module: [settings/forex.md](../settings/forex.md)

### What this area doesn't do

- You can't edit a remittance or add a TCS credit from the app.
- Foreign cash balances are not counted in holdings, the dashboard or net worth (no other service reads them).
- There are no rate alerts or historical rate charts.
