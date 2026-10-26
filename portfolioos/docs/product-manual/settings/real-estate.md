[Index](../INDEX.md)

# Settings — Real Estate

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

<a id="s-rest-001"></a>
### Grid / Map (Real Estate)
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

<a id="s-rest-002"></a>
### Status
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

<a id="s-rest-003"></a>
### Portfolio (property)
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

<a id="s-rest-004"></a>
### Tax due month
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

<a id="s-rest-005"></a>
### Hand-placed pin
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
