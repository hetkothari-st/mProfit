[Index](../INDEX.md)

# Value a vehicle and save it

`W-VEH-004` · Vehicles

**Goal:** Keep the vehicle's current value up to date.
**Who:** Any signed-in user.
**Before you start:** Make, model and manufacturing year are known (refresh RC first if not).

| # | You do | The app does |
|---|---|---|
| 1 | Vehicle page → **Get valuation** | Opens `/vehicles/value?vehicleId=…` |
| 2 | Choose **I want to sell/buy** and **Individual/Dealer** | — |
| 3 | Click **Use my car (<REG>)** | Fills inputs, fetches a quote ("Pre-filled from …") |
| 4 | Set **Kilometers driven** and click **Get price** if needed; adjust condition sliders | Estimate updates live |
| 5 | Click **Save to my vehicle** | "Saved to <REG>"; vehicle's Current value updated |

**Success:** The vehicle page shows the new **Current value**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Vehicle missing make/model/year — refresh RC first" | RC incomplete | Refresh or edit the vehicle |
| "No catalog entry for …" | Not in the catalogue | Pick the closest make/model/trim in the selects and click **Get price**; **Save to my vehicle** still saves to the vehicle in the link |
| Model/Year/Trim selects look empty after **Use my car** | Known display issue | The quote shown is still correct; Save works |
| "Valuation cache entry not found — re-run quote" | Quote missing | Click **Get price** again |
