[Index](../INDEX.md)

# Sell a property and see the capital gain

`W-REST-002` · Real Estate

**Goal:** Record a sale and get the section 112 estimate.
**Who:** Any signed-in user.
**Before you start:** The property has a **Purchase date** and purchase costs.

| # | You do | The app does |
|---|---|---|
| 1 | Property page → **Mark sold** | Opens the dialog |
| 2 | Enter **Sale date ***, **Sale price (₹) ***, optional **Sale brokerage (₹)**; click **Mark sold** | Status Sold; "Marked as sold" |
| 3 | Read **Capital gain (section 112)** | Shows holding period, regime and estimated tax |

**Success:** The Capital gain panel shows gain and estimated tax (both options when bought before and sold on/after 23-Jul-2024).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Capital gain unavailable — sale or purchase data missing." | No purchase date | **Edit** → add Purchase date |
| "The indexed figure can't be computed: no Cost Inflation Index for FY …" | Pre-2001 purchase or sale year index not in the app | Use the 12.5% figure or compute separately |
| Sold by mistake | No undo button | Edit status back; sale fields remain — see DOCUMENTATION_GAPS |
