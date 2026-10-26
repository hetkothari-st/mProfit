[Index](../INDEX.md)

# Add or update a vehicle from the VAHAN SMS

`W-VEH-002` · Vehicles

**Goal:** Fill RC details when automatic sources fail.
**Who:** Any signed-in user.
**Before you start:** Text "VAHAN <reg-no>" to 07738299899 from your phone and wait for the reply.

| # | You do | The app does |
|---|---|---|
| 1 | **Vehicles → Paste SMS** (or **SMS** on a vehicle) | Opens "Paste VAHAN SMS" |
| 2 | Enter the number, paste the reply, click **Apply SMS** | Parses labelled fields; creates or updates the vehicle |

**Success:** "Vehicle <REG> created from SMS" or "… updated from SMS".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Invalid registration number: …" | Number not in a recognised format | Use the plate without spaces, e.g. MH47BT5950 or 21BH1234AA |
| "SMS does not appear to reference <REG>" | Wrong SMS pasted | Paste the reply for this vehicle |
| Vehicle saved with almost no details | SMS format not recognised | Edit the vehicle by hand |
