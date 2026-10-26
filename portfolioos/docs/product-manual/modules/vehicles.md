[Index](../INDEX.md)

# Vehicles

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

The Vehicles area keeps one card per vehicle you own (identified by its registration number), fetches registration-certificate (RC) details from free public sources, tracks insurance, PUC, fitness, road-tax and permit expiry dates, lists traffic challans, shows state fuel prices and estimates the vehicle's resale value. It is reached from **Asset Classes → Vehicles** in the sidebar (`/vehicles`). No plan is required; every signed-in user can use it on their own data.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-VEH-001](../features/F-VEH-001.md) | Vehicles list | Live | Shows every vehicle on your account as a card with its registration number, make and model, owner name, a shield icon and three expiry rows … |
| [F-VEH-002](../features/F-VEH-002.md) | Individual / Family grouping | Live | Switches the Vehicles list between one flat grid (Individual) and sections grouped by the RC owner name (Family), each headed by the owner … |
| [F-VEH-003](../features/F-VEH-003.md) | Add a vehicle (CarInfo owner verification) | Live | A three-step wizard that takes your registration number and mobile number, has CarInfo send an OTP to that mobile, and on verification … |
| [F-VEH-004](../features/F-VEH-004.md) | Paste VAHAN SMS | Live | Lets you text "VAHAN <reg-no>" to 07738299899, paste the reply, and have the app parse it into the vehicle record — updating an existing … |
| [F-VEH-005](../features/F-VEH-005.md) | Delete a vehicle | Live | Permanently removes a vehicle and its challans. |
| [F-VEH-006](../features/F-VEH-006.md) | Vehicle detail page | Live | Shows one vehicle: header with registration number and shield, description (make model variant), action buttons, a Photo card, a … |
| [F-VEH-007](../features/F-VEH-007.md) | Edit a vehicle | Live | Opens the vehicle form ("Edit vehicle") to change make, variant, year, colour, chassis last 4, the Insurance, PUC/Emission, Fitness … |
| [F-VEH-008](../features/F-VEH-008.md) | Refresh RC details | Live | Re-fetches the vehicle's RC details from a chain of free sources and merges the fresh values into the vehicle, then shows which source … |
| [F-VEH-009](../features/F-VEH-009.md) | Vehicle stock photo | Live | Shows a generic stock image for the vehicle's make and model and lets you look one up again. |
| [F-VEH-010](../features/F-VEH-010.md) | Challans | Live | Fetches traffic challans (e-challans) for the vehicle, stores them, and lists them with filter tabs, counts and rupee totals. |
| [F-VEH-011](../features/F-VEH-011.md) | Fuel and electricity prices | Live | Shows today's petrol, diesel (₹/litre), CNG (₹/kg), LPG (14.2 kg cylinder) and electricity (₹/kWh) prices for a chosen state, with a … |
| [F-VEH-012](../features/F-VEH-012.md) | Vehicle valuation | Live | Estimates a used vehicle's price from category, make, model, year, trim/variant, kilometres, whether you are buying or selling and to/from … |
| [F-VEH-013](../features/F-VEH-013.md) | Use my car and Save to my vehicle | Live | When the valuation page is opened from a vehicle, Use my car (<REG>) fills the inputs from that vehicle and fetches a quote; Save to my … |
| [F-VEH-014](../features/F-VEH-014.md) | Automatic RC refresh | Live | Every day at 02:15 IST the server refreshes RC details for every vehicle that has never been refreshed or was last refreshed more than 7 … |
| [F-VEH-015](../features/F-VEH-015.md) | Monthly challan scan | Live | On the 1st of every month at 03:00 IST the server runs the challan check (F-VEH-010) for every vehicle. |
| [F-VEH-016](../features/F-VEH-016.md) | Vehicle expiry alerts | Live | Creates an alert when a vehicle's PUC, Insurance, Fitness Certificate or Road Tax expires in exactly 30, 15, 7 or 1 day(s), e.g. |

Settings for this module: [settings/vehicles.md](../settings/vehicles.md)

### What this area doesn't do
- You can't add a vehicle by typing its details by hand; adding always goes through the CarInfo OTP or the VAHAN SMS.
- You can't edit model, fuel, owner, purchase date, purchase price, permit expiry or the registration number in the app.
- You can't pay, dispute or delete a challan; challans are read-only.
- You can't upload your own vehicle photo; only stock images.
- The **Family** button does not show other family members' vehicles.
- There is no fuel-log, mileage or service-history tracking.
