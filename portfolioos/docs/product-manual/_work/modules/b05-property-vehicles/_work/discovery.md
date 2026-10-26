# B05 discovery — Property & Vehicles (Real Estate, Rental, Vehicles)

Source commit 9d9025c4 · code-only · routes 53–58, 86, 87 from `_work/global/modules.md`.

## Routes
| Route | Page | Nav |
|---|---|---|
| /vehicles | apps/web/src/pages/vehicles/VehicleListPage.tsx | Asset Classes → Vehicles |
| /vehicles/value | apps/web/src/pages/vehicles/VehicleValuePage.tsx | **Get valuation** button (list + detail) |
| /vehicles/:id | apps/web/src/pages/vehicles/VehicleDetailPage.tsx | card arrow on list |
| /rental | apps/web/src/pages/rental/RentalListPage.tsx | Asset Classes → Rental |
| /rental/:id | apps/web/src/pages/rental/RentalDetailPage.tsx | card click |
| /rental/tenancies/:tenancyId | apps/web/src/pages/rental/TenantKhataPage.tsx | tenancy row / Collections name |
| /real-estate | apps/web/src/pages/realEstate/RealEstateListPage.tsx | Asset Classes → Real Estate |
| /real-estate/:id | apps/web/src/pages/realEstate/RealEstateDetailPage.tsx | card click |

## Backend
- Vehicles: packages/api/src/routes/vehicles.routes.ts, controllers/vehicles.controller.ts, services/vehicles/{vehicles,challans}.service.ts, ingestion/vehicle/* (carinfo, mparivahan, rahastas, portal, sms, challan, photo, carinfoPlaywright), jobs/vehicleJobs.ts, priceFeeds/fuel.service.ts (fuel job in priceJobs 06:30), valuation: routes/valuation.routes.ts, services/valuation/quoteService.ts, ingestion/valuation/chain.ts, packages/shared/src/valuation/*, catalog job jobs/catalogJobs.ts.
- Real estate: routes/realEstate.routes.ts, services/realEstate/{realEstate.service,propertyCapitalGain,realEstateAlerts,propertyPhotos.service,propertyLocation.service}.ts, routes/propertyMedia.routes.ts, lib/nominatim.ts.
- Rental: routes/rental.routes.ts, controllers/{rental,rentalReminders}.controller.ts, services/rental/{rental.service,rentalLedger.service,rentalLedgerMath,rental.reminders.service}.ts, jobs/rentalJobs.ts; alerts in services/notifications/alerts.service.ts (vehicle expiry, rent overdue) run by jobs/alertJobs.ts 20:45 IST.
- No plan gate on any B05 route (grep requireFeature: none). All routes `authenticate`; services filter by req.user.id (managed profile = profile id; family view header ignored).

## Checklist
- [x] Vehicles list/add/SMS/delete/detail/edit/refresh/photo/challans/fuel/valuation/jobs/alerts
- [x] Real estate list/map/form/delete/detail/value/sold/CG/make rental/photos/pin/alerts
- [x] Rental list/collections/property dialog/delete/detail/P&L/tenancy/receipts/mark received/skip/undo/auto-match/expenses/khata/statement/WhatsApp/reminder queue/jobs
- [x] Controls sweep done per page (see inventory Controls in manual)
