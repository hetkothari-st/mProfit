---
id: F-REST-001
title: "Real estate list and summary"
module: "Real Estate"
status: Live
roles: "R-FREE, R-PLUS, R-FAMILY, R-PRO (R-MANAGER: managed person's)"
settings: [S-REST-001]
related: [F-REST-002, F-REST-003, F-REST-004, F-REST-005, F-REST-010]
---

[← Real Estate](../modules/real-estate.md) · [Index](../INDEX.md)

# Real estate list and summary

`F-REST-001` · Live · Roles: [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro) ([R-MANAGER](../roles.md#r-manager): managed person's)

**What it does:** Lists your properties as cards and, above them, three tiles: **Active properties** ("of N total"), **Portfolio value** ("current estimate") and **Unrealised gain** ("value − cost basis").

**Why it exists:** Page subtitle: "Properties you own — homes, plots, commercial. Manual current value, capital-gain on sale, document vault."

**Where to find it:** **Asset Classes → Real Estate** (route `/real-estate`).

**Who can use it:** [R-FREE](../roles.md#r-free), [R-PLUS](../roles.md#r-plus), [R-FAMILY](../roles.md#r-family), [R-PRO](../roles.md#r-pro). [R-MANAGER](../roles.md#r-manager) sees the managed person's properties. Family view does not add other members' properties.

**Steps**
1. Open the page. Placeholder cards show while loading; with none you see "No properties yet" — "Add a property to track purchase cost, current value, documents, and tax obligations." and **Add your first property**.
2. Click a card to open the property ([F-REST-005](F-REST-005.md)). Hover a card to reveal the pencil (**Edit**) and trash (**Delete**) icons.

**Controls**
| Control (exact label) | Type | What it does | Disabled / hidden when |
|---|---|---|---|
| **Download** (report button) | Button | Real-estate report ([D-REST-001](../dependencies.md#d-rest-001)) | — |
| **Add property** / **Add your first property** | Button | Opens the form ([F-REST-003](F-REST-003.md)) | — |
| **Grid** / **Map** | Toggle | [F-REST-002](F-REST-002.md) | Hidden when no properties |
| Pencil (title "Edit") | Icon button | Opens the form with this property | Visible on hover |
| Trash (title "Delete") | Icon button | Starts delete ([F-REST-004](F-REST-004.md)) | Visible on hover; disabled while deleting |
| Card | Link | Opens `/real-estate/:id` | — |

**Fields and rules:** Not applicable — view only.

**Settings and toggles here:** [S-REST-001](../settings/real-estate.md#s-rest-001) **Grid / Map** view, remembered on this device.

**Results:** None — view only.

**Errors and troubleshooting**
| Message / symptom | Cause | Fix |
|---|---|---|
| Card says "Current value not set" | No current value entered | Use **Refresh value** on the property |

**Limitations:** Totals use the full current value and full cost even when **My share** is below 100%. Sold properties are excluded from value, cost and the active count but remain listed (faded, stamped "SOLD").

**How it works:** `GET /api/real-estate/properties` returns your properties newest first. Each card shows a banner — the property's cover photo slideshow when it has photos (with a photo count when more than one), otherwise an illustration for its type — plus type label, a short reference "№ <last 6 of id>", city (or address), name, status label, current value and gain: gain = current value − (purchase price + stamp duty + registration fee + brokerage + other costs); percentage shown only when cost > 0, to 1 decimal. Covers come from `GET /api/property-photos/covers?ownerType=OWNED_PROPERTY`.

**Related features:** [F-REST-002](F-REST-002.md) to [F-REST-005](F-REST-005.md), [F-REST-010](F-REST-010.md).

**Sources:** `apps/web/src/pages/realEstate/RealEstateListPage.tsx:825`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:584`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:651`, `apps/web/src/pages/realEstate/RealEstateListPage.tsx:776`, `packages/shared/src/finance/realEstateMath.ts:15`, `packages/api/src/services/realEstate/realEstate.service.ts:123`
