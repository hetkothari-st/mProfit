[Index](../INDEX.md)

# Real Estate

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Whole application

Real Estate records property you own — flats, houses, villas, plots, commercial units, agricultural land, parking, under-construction units — with its full purchase cost, a manually maintained current value, photos, a map pin, documents, and the capital gain when you sell. It is reached from **Asset Classes → Real Estate** (`/real-estate`). No plan is required. A property you let out can be mirrored into Rental ([F-REST-009](../features/F-REST-009.md)), where tenancies and rent are tracked.

## Features

| ID | Feature | Status | What it does |
|---|---|---|---|
| [F-REST-001](../features/F-REST-001.md) | Real estate list and summary | Live | Lists your properties as cards and, above them, three tiles: Active properties ("of N total"), Portfolio value ("current estimate") and … |
| [F-REST-002](../features/F-REST-002.md) | Grid and map view of properties | Live | Switches the Real Estate or Rental list between cards and a map of all properties with pins; clicking a pin opens a preview card with cover … |
| [F-REST-003](../features/F-REST-003.md) | Add or edit an owned property | Live | A long form ("Add property" / "Edit property") with sections Identity, Specs, Ownership, Purchase cost, Current value, Property tax & … |
| [F-REST-004](../features/F-REST-004.md) | Delete an owned property | Live | Deletes a property after an inline confirmation. |
| [F-REST-005](../features/F-REST-005.md) | Property detail page | Live | Shows one property: name (with a "Sold" tag when sold), type · status, action buttons, the Rentals banner when linked, Photos, three tiles … |
| [F-REST-006](../features/F-REST-006.md) | Update current value | Live | Records the latest market value of the property. |
| [F-REST-007](../features/F-REST-007.md) | Mark property sold | Live | Records the sale date, sale price and optional sale brokerage, flips the status to Sold and makes the property inactive. |
| [F-REST-008](../features/F-REST-008.md) | Capital gain on sale | Live | For a sold property, shows sale price, net proceeds ("after brokerage"), total cost basis, holding period in months (long-term over 24 … |
| [F-REST-009](../features/F-REST-009.md) | Make rental and Remove from rentals | Live | Make rental creates a matching Rental property (name, address, type, purchase date and price, current value, portfolio) linked to this … |
| [F-REST-010](../features/F-REST-010.md) | Property photos | Live | Lets you add up to 20 photos per property, shows them as a mosaic (first five), opens a full-screen viewer, sets the cover photo used on … |
| [F-REST-011](../features/F-REST-011.md) | Property location pin | Live | Shows the property's address beside a map with its pin. |
| [F-REST-012](../features/F-REST-012.md) | Real estate alerts | Live | Creates alerts 30, 15, 7 and 1 day(s) before: the property-tax due date (1st of the chosen Tax due month), the expected possession date of … |
| [F-REST-013](../features/F-REST-013.md) | Linked loan and insurance records | Partial | On the property page, Linked records shows links "Linked loan", "Linked insurance" and "Rented out (rental record)" when the property … |

Settings for this module: [settings/real-estate.md](../settings/real-estate.md)

### What this area doesn't do
- No automatic market valuation of property; the current value is whatever you enter.
- No history of past current values.
- You can't link a home loan or insurance policy to a property in the app.
- You can't undo a sale with one click.
- Capital gain does not apply exemptions (sections 54/54EC/54F), surcharge or cess, and does not file anything.
- Delete is only available from the list page.
