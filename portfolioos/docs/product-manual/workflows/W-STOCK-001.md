[Index](../INDEX.md)

# Record a stock purchase and check it

`W-STOCK-001` · Stocks

**Goal:** Add a stock you bought and see it valued.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) (portfolio owner).
**Before you start:** At least one portfolio.

| # | You do | The app does |
|---|---|---|
| 1 | Open **Asset Classes → Stocks** | Shows holdings or "No equity holdings" |
| 2 | Click **Add transaction** | Opens "Add transaction" ([D-ASSET-002](../dependencies.md#d-asset-002)) |
| 3 | Fill the stock, quantity, price and date; save | Saves; rebuilds the holding; starts a background price refresh |
| 4 | Click **Refresh prices** if LTP shows "—" | "Refreshed N stock prices"; LTP and Value fill in |

**Success:** The stock row shows Qty, Avg cost, LTP "as of …", Value and P&L.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "…is already recorded. Record it again only if this is a second, genuine trade." | Same trade exists | Confirm in the form if it's genuine (the Transactions form offers this) |
| LTP stays "—" | No price for the symbol | Check the symbol; wait for the 16:30 IST end-of-day job |
