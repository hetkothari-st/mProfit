[Index](../INDEX.md)

# Connect a broker (Zerodha)

`W-CONN-002` · Connections

**Goal:** Let the F&O page sync trades from your broker.
**Who:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro).
**Before you start:** A Kite Connect developer app (API key and secret).

| # | You do | The app does |
|---|---|---|
| 1 | **Tools → Connectors → Zerodha → Configure**, enter API key and secret, **Save** | Stores them encrypted; card shows **Needs login** and the **Server redirect URI** |
| 2 | Register that redirect URI in the Kite developer console | — |
| 3 | **Connect**, log in in the popup | Popup closes; toast "Connected: zerodha" |
| 4 | Sync from the F&O page ([D-CONN-001](../dependencies.md#d-conn-001)) | Imports trades |

**Success:** Card shows **Connected** and the token expiry.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Popup blocked — allow popups for this site" | Browser setting | Allow popups |
| "OAuth state expired — start login again" | More than 10 minutes | **Connect** again |
| "Kite session expired — login again" on **Refresh** | The broker session has ended and Kite has no refresh | **Connect** again |
