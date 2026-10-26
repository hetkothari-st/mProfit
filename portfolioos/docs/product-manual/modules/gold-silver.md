[Index](../INDEX.md)

# Gold & Silver

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The **Gold & Silver** page tracks physical gold, Sovereign Gold Bonds (SGB), gold ETFs and physical silver, values them from a live metal-price feed, and keeps photos of jewellery and coins.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-GOLD-001](../features/F-GOLD-001.md) | Gold & Silver holdings with live valuation | Live | Shows the live rate bar (F-GOLD-002), cards Invested, Current value (with a pulsing "live" dot) and Unrealised P&L (with %), a holdings … |
| [F-GOLD-002](../features/F-GOLD-002.md) | Live gold and silver rate bar | Live | A sticky bar at the top shows the current Gold and Silver price per gram ("/g") at a purity you pick, and "Live · updated <just now | Ns … |
| [F-GOLD-003](../features/F-GOLD-003.md) | Add, edit and delete a gold or silver entry | Live | The "Add Gold / Silver" / "Edit Gold / Silver Entry" dialog records a buy or sale (and for SGBs, interest and maturity), pre-fills today's … |
| [F-GOLD-004](../features/F-GOLD-004.md) | Gold holding detail page | Live | A page per metal holding: photo carousel (previous/next, dots, "N / M", Delete photo), type and portfolio, purity badge and name, ISIN, … |

Settings for this module: [settings/gold-silver.md](../settings/gold-silver.md)

### What this area doesn't do
- No making charges, GST or wastage in the cost; no hallmark/HUID field.
- No price history chart (only cost vs today).
- No platinum or other metals.
