# services/realEstate/

Owned property (not the rental side; that's `services/rental/`).

- `realEstate.service.ts` — property CRUD.
- `propertyCapitalGain.ts` — capital gain on selling a property.
- `propertyLocation.service.ts` — geocoding (via `lib/nominatim.ts`) and manual pin placement.
- `propertyPhotos.service.ts` — property photos (type-sniffed, stored, served).
- `realEstateAlerts.ts` — property-related alerts.

HTTP: `routes/realEstate.routes.ts`, `routes/propertyMedia.routes.ts`.
