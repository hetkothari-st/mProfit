# Workflows and Troubleshooting — Property & Vehicles (B05)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Vehicles, Real Estate, Rental

<!-- BEGIN WORKFLOWS -->
## Add a vehicle with CarInfo verification <!-- W-VEH-001 -->
**Goal:** Get a vehicle and its RC details into the app.
**Who:** Any signed-in user (R-FREE and above).
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
| "Failed to send OTP" / "Internal server error" | CarInfo page could not be driven | Use **Paste SMS** (W-VEH-002) |
| "Session expired or not found" | More than 10 minutes, or server restarted | Start again |
| "Saved. Could not fetch RC details automatically — retry from the vehicle page." | Follow-up refresh failed | Vehicle page → **Refresh** |
| "Too many vehicle lookups. Please wait a minute." | 5 lookups per minute | Wait a minute |

## Add or update a vehicle from the VAHAN SMS <!-- W-VEH-002 -->
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

## Check a vehicle's challans <!-- W-VEH-003 -->
**Goal:** See pending fines.
**Who:** Any signed-in user.
**Before you start:** The vehicle exists. Optionally set **Chassis (Last 4)** (needed only for the operator-enabled browser source).

| # | You do | The app does |
|---|---|---|
| 1 | Open the vehicle → **Check challans** | Tries CarInfo, then the e-challan site |
| 2 | Read the toast and the table; use **Pending**/**Paid**/**Contested** tabs | Shows counts and totals |

**Success:** "Challan scan: N new, M updated" or "no changes"; new challans also appear for review in the import review queue.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "All challan sources failed — …" | Sources unavailable | Retry later; the monthly scan on the 1st also retries |

## Value a vehicle and save it <!-- W-VEH-004 -->
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

## Add a property and keep its value current <!-- W-REST-001 -->
**Goal:** Record an owned property with full cost and value.
**Who:** Any signed-in user.
**Before you start:** Purchase documents for price, stamp duty, registration, brokerage.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Real Estate → Add property** | Opens the form |
| 2 | Fill **Name *** and **Type ***, purchase costs, **Estimated current value (₹)**, **Tax due month** | — |
| 3 | Click **Add property** | "Property added"; card shows value and gain |
| 4 | Open the property → **Photos** → **Add photos**; check **Location** pin | Photos stored; pin looked up from the address |
| 5 | Later: **Refresh value** → enter value → **Update** | "Current value updated" |

**Success:** Summary tiles show the property in **Portfolio value** and **Unrealised gain**.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Validation failed" | Commas or text in amounts | Use digits only |
| "Couldn't find this address on the map — place the pin yourself" | Address not found | **Place pin** |

## Sell a property and see the capital gain <!-- W-REST-002 -->
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

## Turn an owned property into a rental <!-- W-REST-003 -->
**Goal:** Track tenants for a property you own.
**Who:** Any signed-in user.
**Before you start:** The property exists in Real Estate and is not sold.

| # | You do | The app does |
|---|---|---|
| 1 | Property page → **Make rental** | Creates a linked Rental record; status Rented out; toast with **Undo** |
| 2 | Click **Open rental record** | Opens `/rental/:id` |
| 3 | Continue with W-RENT-001 step 3 | — |

**Success:** Banner "This property is also tracked in Rentals." on the Real Estate page.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Undo failed" / "Internal server error" when removing | The rental has tenancies or expenses | Keep the link (tenancies cannot be deleted in the app) |

## Set up a rental property and tenancy <!-- W-RENT-001 -->
**Goal:** Start tracking rent.
**Who:** Any signed-in user.
**Before you start:** Optional: add the bank account rent goes to (Bank Accounts) so you can pick it.

| # | You do | The app does |
|---|---|---|
| 1 | **Asset Classes → Rental → Add property**, fill **Name *** and **Type**, **Save** | Property card appears |
| 2 | Open the card | Rental property page |
| 3 | **Add tenancy**: tenant name, start date, monthly rent, due day, deposit, email/phone, **Rent credited to** → **Add tenancy** | Generates monthly receipts (to end date, or 12 months); past months 7+ days due are Overdue; deposit goes to the khata |

**Success:** The tenancy card lists months with Expected/Overdue status.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Request failed with status code 422/400" | Invalid value (rent ≤ 0, end before start, commas) | Correct and retry |
| Wrong rent or dates after saving | Terms can't be edited in the app | See DOCUMENTATION_GAPS F-RENT-020 |

## Record rent and fix mistakes <!-- W-RENT-002 -->
**Goal:** Keep the khata accurate.
**Who:** Any signed-in user.
**Before you start:** A tenancy exists.

| # | You do | The app does |
|---|---|---|
| 1 | Rental property page → month row → **Received** → amount, date → **Mark received** | Adds a payment, creates a cash inflow, month becomes Received/Partial |
| 2 | (Duplicate) dialog shows "This rent is already on the khata" | Click **Record it anyway** only for a real second payment |
| 3 | Wrong month? Row → **Undo** | Removes payments pinned to that month and their inflows |
| 4 | Rent-free month? **Skip** (undo with **Undo**) | Month no longer owed |
| 5 | Late fee / discount / deposit refund: tenant name → khata → **You gave** / **You got** | Entry added, balance recomputed |

**Success:** Khata balance shows "Settled up" or the correct "To collect".
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| **Skip** or **Undo** does nothing | Server refused silently (payment exists / not pinned) | Delete the payment in the khata, then retry |
| An auto-matched month is wrong | Bank credit matched the wrong month | **Undo** on that row (note: this also removes the bank credit's cash entry — DOCUMENTATION_GAPS F-RENT-010) |

## Send rent reminders <!-- W-RENT-003 -->
**Goal:** Remind tenants before or after the due date.
**Who:** Any signed-in user. Email needs a connected Gmail with send permission; SMS needs the operator's provider.
**Before you start:** Tenant email and/or phone.

| # | You do | The app does |
|---|---|---|
| 1 | **Rental → Properties** → Pending tenant reminders → **Run scan** (or wait for 09:00 IST) | Queues reminders for months due in 5/3/1/0 days and overdue months |
| 2 | Fix missing contacts with **Edit contact** → **Save contact** | "Tenant contact saved — channels enabled" |
| 3 | Optional **Preview** → edit text → **Save changes** | "Reminder updated" |
| 4 | Pick **Email**/**SMS**, tick reminders, **Approve & send** | "N reminders sent" or per-reason failures |
| Alt | For WhatsApp: **Collections** → **Remind** | Opens WhatsApp with the message |

**Success:** Reminders leave the panel; tenants receive messages.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Connect Gmail in Settings → Email notifications first" | No Gmail | Connect Gmail |
| "Reconnect Gmail in Settings (existing connection is missing the send permission)" | Old Gmail grant | **Reconnect Gmail** in the dialog |
| "SMS provider disabled (DLT-registered SMS provider not yet wired)" | SMS not configured | Use email or WhatsApp |
| A rejected overdue reminder is back the next day | Scan revives rejected reminders | Reject again or settle/skip the month (DOCUMENTATION_GAPS F-RENT-016) |

## Share a tenant statement <!-- W-RENT-004 -->
**Goal:** Give a tenant a written account.
**Who:** Any signed-in user.
**Before you start:** The tenancy has entries.

| # | You do | The app does |
|---|---|---|
| 1 | Tenant name → khata → **Share statement** | Downloads "rent-statement-<tenant>.pdf" |
| 2 | Send the file yourself | — |

**Success:** The PDF shows the period, all rows oldest first, totals and balance due.
**If something goes wrong**
| Symptom / message | Why | How to recover |
|---|---|---|
| "Failed to download statement" | Server error | Retry |
<!-- END WORKFLOWS -->

## General troubleshooting
| Symptom / message | Why | How to recover |
|---|---|---|
<!-- BEGIN TROUBLESHOOTING -->
| Vehicles: "Too many vehicle lookups. Please wait a minute." | **Refresh**, **Check challans** and **Get OTP** share a limit of 5 per minute per user | Wait one minute |
| Vehicles: a vehicle page shows only "Loading…" forever | The vehicle was deleted or the link is not yours (no not-found screen) | Go back to **Vehicles** |
| Vehicle/valuation/challan lookups keep failing | Third-party sites changed or are down; each total failure is logged to the import-failures queue | Use **Paste SMS** for RC details; retry later |
| Rental dialogs show "Request failed with status code 4xx" | These dialogs show the raw request error instead of the server's reason | Re-check amounts (digits only, positive), dates and required fields |
| Rental row buttons (Skip, Undo, expense delete) show no message | These actions have no success/error toasts | Refresh the page to see the result |
| Map shows no tiles | openstreetmap.org blocked on your network | Use **Grid** view |
| Amounts rejected with "Validation failed" (Real Estate) | Commas, minus signs or text in money fields | Enter plain digits, e.g. 4500000 or 4500000.50 |
<!-- END TROUBLESHOOTING -->
