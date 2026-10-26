---
id: F-REST-002
title: "Grid and map view of properties"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: [S-RENT-001, S-REST-001]
related: [F-RENT-001, F-REST-001, F-REST-011]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Grid and map view of properties

`F-REST-002` · Live · Roles: as [F-REST-001](F-REST-001.md)

**What it does:** Switches the Real Estate or Rental list between cards and a map of all properties with pins; clicking a pin opens a preview card with cover photo, name, place, value (Real Estate) or "₹…/mo"/"Vacant" (Rental) and **Open**.

**Why it exists:** Inferred from behavior: see where your properties are.

**Where to find it:** **Asset Classes → Real Estate** or **Asset Classes → Rental** (Properties tab), right-aligned **Grid** / **Map** switch.

**Who can use it:** Everyone who can see the list.

**Steps**
1. Click **Map**. A counter shows "Finding your properties…" then "N of M on the map" ("· locating…" while addresses are still being looked up).
2. Click a pin to see its preview; **Open** goes to the property; the × closes the preview.
3. Below the map, properties without a pin are listed: "Not on the map yet: … Add an address, or place the pin from the property's page."

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Grid** / **Map** | Toggle | Switch view | — |
| Pin | Map marker | Selects a property | — |
| **Open** | Link | Opens the property | — |
| Close (×) | Button | Closes the preview | — |

**Fields and rules:** Not applicable — no inputs.

**Settings and toggles here:** [S-REST-001](../settings/real-estate.md#s-rest-001) (Real Estate) and [S-RENT-001](../settings/rental.md#s-rent-001) (Rental): default **Grid**, remembered per page in this browser.

**Results:** Looking up a property's address stores its pin on the property (see [F-REST-011](F-REST-011.md)).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| A property is listed under "Not on the map yet" | No address, or the address was not found | Add an address or place the pin on the property page |

**Limitations:** Each map refresh looks up at most 3 new addresses; the map re-asks every 2.5 seconds while any are pending. Map tiles come from OpenStreetMap; a network block on openstreetmap.org leaves the map blank. Pins marked approximate are placed on the area, not the building.

**How it works:** `GET /api/property-locations?ownerType=OWNED_PROPERTY|RENTAL_PROPERTY` returns each property's pin; for up to 3 properties whose address has never been looked up it queries OpenStreetMap Nominatim (one request at a time, at least 1.1 s apart) and saves the result with the address it came from, so an unchanged address is never looked up again. Rental properties use their single address field; owned properties use address, city, state, pincode and country.

**Related features:** [F-REST-011](F-REST-011.md), [F-REST-001](F-REST-001.md), [F-RENT-001](F-RENT-001.md).

**Sources:** `apps/web/src/components/property/ViewToggle.tsx:10`, `apps/web/src/components/property/useListView.ts:5`, `apps/web/src/components/property/PropertiesMap.tsx:32`, `apps/web/src/components/property/PropertiesMap.tsx:117`, `packages/api/src/services/realEstate/propertyLocation.service.ts:56`, `packages/api/src/services/realEstate/propertyLocation.service.ts:190`, `packages/api/src/lib/nominatim.ts:12`
