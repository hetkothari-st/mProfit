[Index](../INDEX.md)

# Settings — Vehicles

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-veh-001"></a>
### Individual / Family
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

<a id="s-veh-002"></a>
### State
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

<a id="s-veh-003"></a>
### Transaction
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Vehicles → Get valuation** → **Vehicle details** |
| Purpose | Price for selling or buying |
| Default | `SELL` (**I want to sell**) (source: `apps/web/src/pages/vehicles/VehicleValuePage.tsx:67`) |
| Values | Sell: multiplier 1.00 (individual) / 0.88 (dealer) · Buy: 1.05 (individual) / 1.10 (dealer) |
| Depends on | [S-VEH-004](../settings/vehicles.md#s-veh-004) |
| Persists | No (part of the quote cache key) |
| Stored in | Page state; saved valuations record it in the valuation log |
| Backend effect | Changes the quote and its cache key |
| Who can change | Any signed-in user |
| Sources | `packages/shared/src/valuation/conditionEngine.ts:71`, `packages/api/src/services/valuation/quoteService.ts:41` |

<a id="s-veh-004"></a>
### Counterparty
| Attribute | Value |
|---|---|
| Control type | Two-button toggle |
| Location | **Vehicles → Get valuation** → **Vehicle details** |
| Purpose | Individual or dealer on the other side |
| Default | `INDIVIDUAL` (source: `apps/web/src/pages/vehicles/VehicleValuePage.tsx:68`) |
| Values | **Individual** · **Dealer** (multipliers as [S-VEH-003](../settings/vehicles.md#s-veh-003)) |
| Depends on | [S-VEH-003](../settings/vehicles.md#s-veh-003) |
| Persists | No |
| Stored in | Page state; valuation log on save |
| Backend effect | As [S-VEH-003](../settings/vehicles.md#s-veh-003) |
| Who can change | Any signed-in user |
| Sources | `apps/web/src/pages/vehicles/VehicleValuePage.tsx:234`, `packages/shared/src/valuation/conditionEngine.ts:71` |

<a id="s-veh-005"></a>
### Condition sliders
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

<a id="s-veh-006"></a>
### Portfolio (vehicle)
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
