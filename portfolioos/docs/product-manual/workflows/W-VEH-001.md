[Index](../INDEX.md)

# Add a vehicle with CarInfo verification

`W-VEH-001` · Vehicles

**Goal:** Get a vehicle and its RC details into the app.
**Who:** Any signed-in user ([R-FREE](../roles.md#r-free) and above).
**Before you start:** Have the full number plate and a mobile phone that can receive CarInfo's OTP.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Vehicles → Add vehicle** | Opens "Add a vehicle" |
| 2 | Type the **Registration number**, click **Next** | Shows "Owner verification required" |
| 3 | Type a 10-digit mobile, click **Get OTP** | "OTP sent"; shows "Verify OTP" |
| 4 | Type the OTP, click **Verify & Fetch Details** | Creates the vehicle from CarInfo data, runs an automatic RC refresh, shows "Vehicle added", opens the vehicle page |
| 5 | Check the **Expiries** card; click **Edit** to correct dates | Saves with "Vehicle updated" |

**Success:** The vehicle page shows owner, model and expiry dates; "Last refreshed … via carinfo-playwright" (or the source of the follow-up refresh).
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Failed to send OTP" / "Internal server error" | CarInfo page could not be driven | Use **Paste SMS** ([W-VEH-002](W-VEH-002.md)) |
| "Session expired or not found" | More than 10 minutes, or server restarted | Start again |
| "Saved. Could not fetch RC details automatically — retry from the vehicle page." | Follow-up refresh failed | Vehicle page → **Refresh** |
| "Too many vehicle lookups. Please wait a minute." | 5 lookups per minute | Wait a minute |
