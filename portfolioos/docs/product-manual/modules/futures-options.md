[Index](../INDEX.md)

# Futures & Options

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Futures & Options** page (sidebar **F & O**) tracks derivative contracts separately from your stock holdings: open and closed positions, live mark-to-market, the trade tape, F&O business P&L by financial year, and closing positions on expiry day. Trades arrive from a connected broker or from imported contract notes.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-FNO-001](../features/F-FNO-001.md) | F&O summary and expiring-soon banner | Live | Shows four cards — Open positions (count), Realized P&L, Unrealized P&L, Expiring 7d (count, amber when above zero) — and, when any open … |
| [F-FNO-002](../features/F-FNO-002.md) | Open and closed positions | Live | The Open (n) and Closed (n) tabs split positions into a Futures Ledger (Contract, Side, Expiry with a days-left badge, Net Qty, Lot, Avg … |
| [F-FNO-003](../features/F-FNO-003.md) | F&O trades tab | Live | The Trades tab shows the full Trade Tape: every F&O trade in the portfolio, newest first, with Date, Side (BUY/SELL), Instrument, Strike, … |
| [F-FNO-004](../features/F-FNO-004.md) | F&O Tax / P&L statement | Live | The Tax / P&L tab shows one card per financial year ("FY <year>": total P&L, "Turnover: … · Trades: N", note "Non-speculative §43(5) · … |
| [F-FNO-005](../features/F-FNO-005.md) | Expiry-day close approvals | Live | On expiry day a server job turns each open contract expiring that day into an "Expiry close" request (status shown as "EXPIRY ?") and … |
| [F-FNO-006](../features/F-FNO-006.md) | Live F&O prices | Live | While the page is open and visible, it asks the server every 5 seconds to re-mark open positions from NSE live derivative quotes. |
| [F-FNO-007](../features/F-FNO-007.md) | Recompute positions | Live | The circular-arrow button (tooltip "Recompute derivative positions"; text "Recompute" on small screens) rebuilds every F&O position in the … |
| [F-FNO-008](../features/F-FNO-008.md) | Connect, log in to and disconnect a broker | Live | The header shows a chip for each supported broker — Kite (Zerodha), Upstox, Angel One — with connect (not set up), login (set up, no live … |
| [F-FNO-009](../features/F-FNO-009.md) | Sync broker trades | Partial | Sync Kite pulls today's F&O trades from your Zerodha account into the current portfolio and shows "Synced — N new trades". |

Settings for this module: [settings/futures-options.md](../settings/futures-options.md)

### What this area doesn't do
- No manual F&O trade entry form on this page (use imports or the Transactions page).
- No portfolio selector; no option-chain or margin screen (the endpoints exist but nothing calls them).
- No automatic broker sync; no Upstox/Angel sync button.
- No way to type a settlement price for expiry close.
