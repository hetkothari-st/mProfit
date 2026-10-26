---
id: F-REST-011
title: "Property location pin"
module: "Real Estate"
status: Live
roles: "as F-REST-001"
settings: [S-REST-005]
related: [F-RENT-005, F-REST-002, F-REST-005]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Property location pin

`F-REST-011` · Live · Roles: as [F-REST-001](F-REST-001.md)

**What it does:** Shows the property's address beside a map with its pin. The pin is looked up once from the address; you can place it, drag it, or put it back to the address.

**Why it exists:** Code comment: "Where a property is: its address beside a map with its pin."

**Where to find it:** **Location** section on a Real Estate or Rental property page.

**Who can use it:** All plans.

**Steps**
1. Read the status: "Found from the address", "Approximate — the area, not the exact building", "Pinned by you", "Couldn't find this address on the map — place the pin yourself", or "Add an address, or place the pin yourself".
2. Click **Place pin** (no pin) or **Adjust pin**; the note "Drag the pin, or click the map where the property is." appears. Drag or click; "Pin saved".
3. Click **Done** to stop editing. **Use the address** (only for a hand-placed pin) re-looks up the address ("Pin moved back to the address" or "Pin removed"). **Open map** opens the location on openstreetmap.org.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Place pin** / **Adjust pin** / **Done** | Toggle button | Edit mode | Disabled while loading |
| **Use the address** | Button | Reset to the address lookup | Only for hand-placed pins |
| **Open map** | External link | openstreetmap.org at zoom 17 | Only when there is a pin |

**Fields and rules:** Latitude −90 to 90, longitude −180 to 180 (server): "Latitude must be between -90 and 90" / "Longitude must be between -180 and 180".

**Settings and toggles here:** [S-REST-005](../settings/real-estate.md#s-rest-005) hand-placed pin ("Pinned by you") — kept until you click **Use the address**.

**Results:** The pin is stored on the property and used by the map view ([F-REST-002](F-REST-002.md)).

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| "Could not save the pin" / "Could not reset the pin" | Server error | Retry |
| No pin after adding an address | Lookup failed or found nothing | Place the pin by hand |

**Limitations:** The address text is sent to OpenStreetMap Nominatim, a third-party service. A failed lookup is retried on the next view; a lookup that found nothing is not retried until the address changes.

**How it works:** `GET /api/property-locations/:ownerType/:id` looks the address up only if it changed since the last lookup and no hand-placed pin exists; it tries up to 4 progressively broader parts of the address — the first (full) match is "geocoded", a broader match is "approximate". `PUT` stores a manual pin; `DELETE` clears it and immediately looks the address up again.

**Related features:** [F-REST-002](F-REST-002.md), [F-REST-005](F-REST-005.md), [F-RENT-005](F-RENT-005.md).

**Sources:** `apps/web/src/components/property/PropertyLocationCard.tsx:11`, `apps/web/src/components/property/PropertyLocationCard.tsx:22`, `apps/web/src/components/property/PropertyLocationCard.tsx:113`, `packages/api/src/controllers/propertyMedia.controller.ts:145`, `packages/api/src/services/realEstate/propertyLocation.service.ts:54`, `packages/api/src/services/realEstate/propertyLocation.service.ts:155`, `packages/api/src/services/realEstate/propertyLocation.service.ts:159`
