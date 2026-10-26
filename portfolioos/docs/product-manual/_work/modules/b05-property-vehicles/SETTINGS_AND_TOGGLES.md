# Settings and Toggles Reference — Property & Vehicles (B05)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Vehicles, Real Estate, Rental

None of these areas has a settings screen of its own; the controls below live on the pages and dialogs named.

<!-- BEGIN SETTINGS -->
## Vehicles → List

### Individual / Family <!-- S-VEH-001 -->
| Attribute | Value |
|---|---|
| Control type | Two-button switch |
| Location | **Asset Classes → Vehicles**, page header |
| Purpose | Show vehicles in one grid or grouped by RC owner name |
| Default | `individual` (source: `apps/web/src/pages/vehicles/VehicleListPage.tsx:36`) |
| Values | **Individual**: one grid · **Family**: sections per owner name ("Unassigned" when empty), largest group first |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage key `vehicles_view_mode` |
| Backend effect | None |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/vehicles/VehicleListPage.tsx:30`, `apps/web/src/pages/vehicles/VehicleListPage.tsx:39` |

## Vehicles → Fuel prices card

### State <!-- S-VEH-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Fuel-price card on **Vehicles** list and vehicle pages |
| Purpose | Choose whose prices to show |
| Default | State code from the first vehicle's RTO (list) or this vehicle's RTO (detail); `MH` if none (source: `apps/web/src/pages/vehicles/FuelPricesCard.tsx:69`) |
| Values | Any state returned by the server list |
| Depends on | — |
| Persists | No |
| Stored in | Page state only |
| Backend effect | `GET /api/vehicles/prices?state=<code>` |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/vehicles/FuelPricesCard.tsx:15`, `apps/web/src/pages/vehicles/FuelPricesCard.tsx:107` |

## Vehicles → Valuation page

### Transaction <!-- S-VEH-003 -->
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Vehicles → Get valuation** → **Vehicle details** |
| Purpose | Price for selling or buying |
| Default | `SELL` (**I want to sell**) (source: `apps/web/src/pages/vehicles/VehicleValuePage.tsx:67`) |
| Values | Sell: multiplier 1.00 (individual) / 0.88 (dealer) · Buy: 1.05 (individual) / 1.10 (dealer) |
| Depends on | S-VEH-004 |
| Persists | No (part of the quote cache key) |
| Stored in | Page state; saved valuations record it in the valuation log |
| Backend effect | Changes the quote and its cache key |
| Who can change | Any signed-in user |
| Sources | `packages/shared/src/valuation/conditionEngine.ts:71`, `packages/api/src/services/valuation/quoteService.ts:41` |

### Counterparty <!-- S-VEH-004 -->
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Vehicles → Get valuation** → **Vehicle details** |
| Purpose | Individual or dealer on the other side |
| Default | `INDIVIDUAL` (source: `apps/web/src/pages/vehicles/VehicleValuePage.tsx:68`) |
| Values | **Individual** · **Dealer** (multipliers as S-VEH-003) |
| Depends on | S-VEH-003 |
| Persists | No |
| Stored in | Page state; valuation log on save |
| Backend effect | As S-VEH-003 |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/vehicles/VehicleValuePage.tsx:234`, `packages/shared/src/valuation/conditionEngine.ts:71` |

### Condition sliders <!-- S-VEH-005 -->
| Attribute | Value |
|---|---|
| Control type | 11 range sliders (Fair, Good, Very Good, Excellent) |
| Location | **Vehicles → Get valuation** → **Condition** (after a quote) |
| Purpose | Adjust the estimate for the vehicle's condition |
| Default | All **Good** (source: `apps/web/src/pages/vehicles/VehicleValuePage.tsx:72`) |
| Values | Stop values Fair 0.75, Good 0.85, Very Good 0.92, Excellent 1.00; weights Engine 0.20, Transmission 0.15, Frame 0.12, Brakes 0.10, Suspension 0.10, Car Exterior 0.09, Electrical 0.08, Wheel and Tyres 0.07, Car Interior 0.05, Steering 0.03, AC 0.01; price = Good × score ÷ 0.85 |
| Depends on | A quote |
| Persists | No; snapshot stored in the valuation log when **Save to my vehicle** is used |
| Stored in | Page state; `VehicleValuationLog.sliderSnapshot` on save |
| Backend effect | None until saved |
| Who can change | Any signed-in user |
| Sources | `packages/shared/src/valuation/conditionEngine.ts:17`, `packages/shared/src/valuation/conditionEngine.ts:32`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:468` |

## Vehicles → Edit vehicle dialog

### Portfolio (vehicle) <!-- S-VEH-006 -->
| Attribute | Value |
|---|---|
| Control type | Portfolio picker |
| Location | Vehicle page → **Edit** → **Portfolio** |
| Purpose | "Optional — group this vehicle under a portfolio." |
| Default | None (source: `packages/api/src/services/vehicles/vehicles.service.ts:151`) |
| Values | Any of your portfolios, or none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Vehicle.portfolioId` |
| Backend effect | Stored only; no B05 screen filters by it (use by other areas not traced) |
| Who can change | Owner of the vehicle (or manager acting for them) |
| Sources | `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:443`, `packages/api/src/services/vehicles/vehicles.service.ts:188` |

## Real Estate → List

### Grid / Map (Real Estate) <!-- S-REST-001 -->
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Asset Classes → Real Estate**, above the cards |
| Purpose | Cards or map of properties |
| Default | `grid` (source: `apps/web/src/components/property/useListView.ts:9`) |
| Values | **Grid**: cards · **Map**: pins with preview cards |
| Depends on | — |
| Persists | This device only (silently not remembered when storage is blocked) |
| Stored in | localStorage key `everypaisa.listView.real-estate` |
| Backend effect | Map view calls `GET /api/property-locations` which may look up up to 3 addresses per call |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/components/property/useListView.ts:5`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:839` |

## Real Estate → Property form

### Status <!-- S-REST-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Add property** / **Edit property** → Identity → **Status** |
| Purpose | How the property is used |
| Default | `SELF_OCCUPIED` (sources: `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:71`, `packages/api/prisma/schema.prisma:3272`) |
| Values | Self-occupied, Second home, Vacant, Rented out, Under construction (also shows the Under construction section), Sold (label only — use **Mark sold**) |
| Depends on | **Make rental** sets Rented out; **Remove from rentals** turns Rented out back to Self-occupied; **Mark sold** sets Sold |
| Persists | Yes — server |
| Stored in | `OwnedProperty.status` |
| Backend effect | Sold properties are excluded from value totals and alerts |
| Who can change | Owner |
| Sources | `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:40`, `packages/api/src/services/realEstate/realEstate.service.ts:504`, `packages/api/src/services/realEstate/realEstateAlerts.ts:31` |

### Portfolio (property) <!-- S-REST-003 -->
| Attribute | Value |
|---|---|
| Control type | Portfolio picker |
| Location | Property form → Identity → **Portfolio** |
| Purpose | Group the property under a portfolio |
| Default | None |
| Values | Any of your portfolios or none |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `OwnedProperty.portfolioId` |
| Backend effect | Copied to the rental record by **Make rental**; alerts carry the portfolio id |
| Who can change | Owner |
| Sources | `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:282`, `packages/api/src/services/realEstate/realEstate.service.ts:214` |

### Tax due month <!-- S-REST-004 -->
| Attribute | Value |
|---|---|
| Control type | Select (January–December or "—") |
| Location | Property form → Property tax & society → **Tax due month** |
| Purpose | When property tax is due each year |
| Default | None ("—") |
| Values | Month 1–12: property-tax alerts 30/15/7/1 days before the 1st of that month · none: no property-tax alerts |
| Depends on | Property active and not Sold |
| Persists | Yes — server |
| Stored in | `OwnedProperty.propertyTaxDueMonth` |
| Backend effect | Drives property-tax alerts in the daily alert scan |
| Who can change | Owner |
| Sources | `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:455`, `packages/api/src/services/realEstate/realEstateAlerts.ts:66` |

## Real Estate / Rental → Location card

### Hand-placed pin <!-- S-REST-005 -->
| Attribute | Value |
|---|---|
| Control type | Map pin (drag/click) with **Place pin**/**Adjust pin**/**Done** and **Use the address** |
| Location | Property page → **Location** |
| Purpose | Fix a wrong or missing address lookup |
| Default | Off — pin comes from the address lookup |
| Values | Hand-placed ("Pinned by you"): kept until reset · reset (**Use the address**): address looked up again |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `latitude`, `longitude`, `locationSource` = "manual" on the property |
| Backend effect | A hand-placed pin is never overwritten by address lookups |
| Who can change | Owner |
| Sources | `apps/web/src/components/property/PropertyLocationCard.tsx:41`, `packages/api/src/services/realEstate/propertyLocation.service.ts:159` |

## Rental → List

### Grid / Map (Rental) <!-- S-RENT-001 -->
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Asset Classes → Rental → Properties**, above the cards |
| Purpose | Cards or map |
| Default | `grid` (source: `apps/web/src/components/property/useListView.ts:9`) |
| Values | **Grid** · **Map** |
| Depends on | — |
| Persists | This device only |
| Stored in | localStorage key `everypaisa.listView.rental` |
| Backend effect | As S-REST-001 for rental properties |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/rental/RentalListPage.tsx:684`, `apps/web/src/components/property/useListView.ts:26` |

## Rental → Tenancy

### Rent credited to <!-- S-RENT-002 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | **Add tenancy** dialog; tenant khata page |
| Purpose | Which bank account the rent lands in |
| Default | "Not tracked" (null) |
| Values | One of your non-closed bank accounts · **Not tracked** |
| Depends on | Bank accounts exist |
| Persists | Yes — server |
| Stored in | `Tenancy.bankAccountId` |
| Backend effect | Later rent/deposit cash flows carry this account (shown in Cash Activity and Tally export); refused for another user's account |
| Who can change | Owner |
| Sources | `apps/web/src/components/rental/RentAccountPicker.tsx:12`, `packages/api/src/services/rental/rental.service.ts:379`, `packages/api/src/services/rental/rentalLedger.service.ts:373` |

### Due day of month <!-- S-RENT-004 -->
| Attribute | Value |
|---|---|
| Control type | Number (1–31) |
| Location | **Add tenancy** dialog |
| Purpose | Day rent is due each month |
| Default | 1 (sources: `apps/web/src/pages/rental/RentalDetailPage.tsx:639`, `packages/api/prisma/schema.prisma:2171`) |
| Values | 1–31; clamped to the last day of shorter months |
| Depends on | — |
| Persists | Yes — server |
| Stored in | `Tenancy.rentDueDay` |
| Backend effect | Sets each receipt's due date, which drives Overdue (due + 7 days), reminders and auto-match windows |
| Who can change | Owner; set once at creation in the web app |
| Sources | `packages/api/src/services/rental/rental.service.ts:178`, `packages/api/src/services/rental/rental.service.ts:408` |

## Rental → Pending tenant reminders

### Send via Email / SMS <!-- S-RENT-003 -->
| Attribute | Value |
|---|---|
| Control type | Two toggle chips |
| Location | **Rental → Properties** → Pending tenant reminders → **Send via** |
| Purpose | Channels for the next **Approve & send** |
| Default | Both on (source: `apps/web/src/pages/rental/RentalRemindersPanel.tsx:526`); a chip is off and disabled when the tenant lacks that contact |
| Values | Email on/off · SMS on/off; both off disables **Approve & send** |
| Depends on | Tenant email / phone; Gmail connection; operator SMS provider |
| Persists | No — one-shot override for this send; the stored per-reminder channels are unchanged |
| Stored in | Request body `channels` |
| Backend effect | Only enabled channels are attempted |
| Who can change | Owner |
| Sources | `apps/web/src/pages/rental/RentalRemindersPanel.tsx:703`, `packages/api/src/services/rental/rental.reminders.service.ts:541` |

## Rental → Tenant khata

### Apply to month <!-- S-RENT-005 -->
| Attribute | Value |
|---|---|
| Control type | Select |
| Location | Khata → **You got**/**You gave** dialog → "Apply to month — leave blank to settle oldest first" |
| Purpose | Pin a credit to a month |
| Default | "Settle oldest first" (blank) |
| Values | Blank: fills the oldest open charge first · a month: fills that month first, remainder spills to oldest |
| Depends on | Tenancy has rent months |
| Persists | Yes — on the entry |
| Stored in | `RentLedgerEntry.forMonth` |
| Backend effect | Changes allocation and therefore month statuses |
| Who can change | Owner |
| Sources | `apps/web/src/pages/rental/TenantKhataPage.tsx:177`, `packages/api/src/services/rental/rentalLedgerMath.ts:1` |
<!-- END SETTINGS -->

## Client-side storage
| Key / cookie | What's stored | Written when | Refreshed when | Can go stale? |
|---|---|---|---|---|
<!-- BEGIN CLIENT-STORAGE -->
| `vehicles_view_mode` (localStorage) | Vehicles list grouping: individual or family | Clicking **Individual**/**Family** | Each click | No server data — per device only |
| `everypaisa.listView.real-estate` (localStorage) | Real Estate list view: grid or map | Clicking **Grid**/**Map** | Each click | Per device only |
| `everypaisa.listView.rental` (localStorage) | Rental list view: grid or map | Clicking **Grid**/**Map** | Each click | Per device only |
<!-- END CLIENT-STORAGE -->

## Operator configuration (not user-facing)
| Env var name | Purpose | Effect when unset |
|---|---|---|
<!-- BEGIN OPERATOR-CONFIG -->
| `ENABLE_VEHICLE_CRONS` | Turns the daily RC refresh and monthly challan scan on/off | Jobs run (only the value "false" disables) |
| `ENABLE_RENTAL_CRONS` | Turns the 01:00 overdue job and 09:00 reminder scan on/off | Jobs run |
| `ENABLE_CATALOG_CRONS` | Monthly vehicle catalogue crawl (5th, 04:00 IST) | Job runs |
| `ENABLE_PARIVAHAN_PORTAL_ADAPTER` | Allows the Parivahan portal source in production | Portal source disabled in production (always allowed outside production) |
| `USE_PORTAL_BROWSER` | Drive a real headed browser for the portal source | Portal source reads a fixture file |
| `PARIVAHAN_PORTAL_FIXTURE_PATH` | Fixture file for the portal source (development) | Portal source fails with "live driver not yet wired" |
| `ENABLE_CHALLAN_ADAPTER` | Allows the headed-browser challan source in production | Browser challan source skipped in production |
| `USE_CHALLAN_BROWSER` | Drive a real browser for challans | Not used |
| `CHALLAN_FIXTURE_PATH` | Fixture file for challans (development) | Fixture step fails and is skipped |
| `MPARIVAHAN_FIXTURE_PATH` | Fixture file for the mParivahan source | A built-in development fixture path is used if that file exists |
| `VAHAN_DEBUG`, `CARINFO_DEBUG` | Extra debug logging of scraper responses | Off |
| `CARINFO_DEBUG_DUMPS`, `CARINFO_DEBUG_DIR` | Save CarInfo page dumps (contain owner PII) and where | Off |
| `NOMINATIM_USER_AGENT` | Identifying User-Agent for OpenStreetMap address lookups | A built-in EveryPaisa user agent |
| `NOMINATIM_MIN_INTERVAL_MS` | Minimum gap between address lookups | 1100 ms |
| `LANDLORD_BRAND_NAME` | Fallback landlord signature in reminder templates | "Your landlord" |
| `RENT_PAYMENT_INSTRUCTIONS` | Fallback payment instructions in reminder templates | Empty |
| `SMS_PROVIDER` | SMS provider for rent reminders (`twilio` or `none`) | `none` — SMS fails with "sms_not_configured" |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` | Purpose: Twilio account and sender for SMS | SMS fails with "twilio_credentials_missing" when provider is twilio |
<!-- END OPERATOR-CONFIG -->
