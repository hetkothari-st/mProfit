# User Roles and Permissions — Property & Vehicles (B05)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Vehicles, Real Estate, Rental

Role definitions are global (see `_work/global/roles.md`); headings are repeated here for traceability.

## Roles
### Signed-out visitor <!-- R-VISITOR -->
### Free user <!-- R-FREE -->
### Plus subscriber <!-- R-PLUS -->
### Family subscriber <!-- R-FAMILY -->
### Pro/Advisor subscriber <!-- R-PRO -->
### Administrator <!-- R-ADMIN -->
### Family owner <!-- R-FAMOWNER -->
### Family contributor <!-- R-FAMCONTRIB -->
### Family viewer <!-- R-FAMVIEWER -->
### Managing a family member's account <!-- R-MANAGER -->
### Professional acting for a client <!-- R-PROF -->
### AI chatbot connection <!-- R-AICONN -->
### Succession nominee <!-- R-NOMINEE -->

## Permission matrix
<!-- BEGIN MATRIX -->
| Page / feature / action | R-VISITOR | R-FREE | R-PLUS | R-FAMILY | R-PRO | R-ADMIN | R-FAMOWNER | R-FAMCONTRIB | R-FAMVIEWER | R-MANAGER | R-PROF | R-AICONN | R-NOMINEE | Enforced by |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| View Vehicles list and detail (F-VEH-001, F-VEH-002, F-VEH-006) | Denied (to /login) | Allowed (own) | Allowed (own) | Allowed (own) | Allowed (own) | Per own plan (no extra powers) | Own data only (family view ignored) | Own data only | Own data only | Managed person's vehicles | n/a (not in Client books) | Read-only via AI connector "Vehicles" area | Denied | `apps/web/src/components/layout/ProtectedRoute.tsx:13`, `packages/api/src/routes/vehicles.routes.ts:23`, `packages/api/src/services/vehicles/vehicles.service.ts:105` |
| Add (CarInfo OTP), SMS paste, edit, delete vehicle (F-VEH-003 to F-VEH-007) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/services/vehicles/vehicles.service.ts:135`, `packages/api/src/lib/playwrightSessions.ts:73` |
| Refresh RC, check challans, CarInfo OTP start (F-VEH-003, F-VEH-008, F-VEH-010) | Denied | Allowed (5/min) | Allowed (5/min) | Allowed (5/min) | Allowed (5/min) | Per own plan | Same as base plan | Same as base plan | Same as base plan | Allowed (limit keyed on user) | n/a | Denied | Denied | `packages/api/src/middleware/rateLimit.ts:280`, `packages/api/src/routes/vehicles.routes.ts:35` |
| Fuel prices (F-VEH-011) | Denied | Allowed | Allowed | Allowed | Allowed | Allowed | Same as base plan | Same as base plan | Same as base plan | Allowed | n/a | Denied | Denied | `packages/api/src/routes/vehicles.routes.ts:30` |
| Vehicle valuation, Use my car, Save to my vehicle (F-VEH-012, F-VEH-013) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own vehicles only | Own vehicles only | Own vehicles only | Managed person's vehicle | n/a | Denied | Denied | `packages/api/src/routes/valuation.routes.ts:24`, `packages/api/src/services/valuation/quoteService.ts:215` |
| Real Estate list, detail, add/edit/delete, value, sold, capital gain, make rental (F-REST-001 to F-REST-009, F-REST-013) | Denied (to /login) | Allowed (own) | Allowed (own) | Allowed (own) | Allowed (own) | Per own plan | Own data only | Own data only | Own data only | Managed person's | n/a | Read-only via AI connector "Property" area | Denied | `packages/api/src/routes/realEstate.routes.ts:19`, `packages/api/src/services/realEstate/realEstate.service.ts:135` |
| Property photos and location pin (F-REST-010, F-REST-011, F-REST-002) | Denied | Allowed (own) | Allowed (own) | Allowed (own) | Allowed (own) | Per own plan | Own only | Own only | Own only | Managed person's | n/a | Denied | Denied | `packages/api/src/routes/propertyMedia.routes.ts:20`, `packages/api/src/services/realEstate/propertyPhotos.service.ts:78` |
| Rental list, detail, tenancies, receipts, khata, expenses, statement, WhatsApp link (F-RENT-001 to F-RENT-015) | Denied (to /login) | Allowed (own) | Allowed (own) | Allowed (own) | Allowed (own) | Per own plan | Own data only | Own data only | Own data only | Managed person's | n/a | Read-only via AI connector "Property" area | Denied | `packages/api/src/routes/rental.routes.ts:35`, `packages/api/src/services/rental/rental.service.ts:245`, `packages/api/src/services/rental/rentalLedger.service.ts:254` |
| Tenant reminders: scan, edit, approve & send, reject (F-RENT-016, F-RENT-017) | Denied | Allowed | Allowed | Allowed | Allowed | Per own plan | Own only | Own only | Own only | Managed person's tenancies; email sends via the managed person's Gmail (Gmail settings route refused while managing) | n/a | Denied | Denied | `packages/api/src/services/rental/rental.reminders.service.ts:479`, `packages/api/src/services/rental/rental.reminders.service.ts:584` |
| Automatic jobs and alerts (F-VEH-014 to F-VEH-016, F-REST-012, F-RENT-018, F-RENT-019) | n/a | Receives results | Receives results | Receives results | Receives results | Receives results | n/a | n/a | n/a | Managed person receives | n/a | n/a | n/a | `packages/api/src/jobs/vehicleJobs.ts:51`, `packages/api/src/jobs/alertJobs.ts:36`, `packages/api/src/jobs/rentalJobs.ts:29` |
<!-- END MATRIX -->

Legend: Allowed · Denied · Conditional (see note). No route in these areas uses a plan gate (`requireFeature`) or a role gate (`requireRole`).

## Notes and mismatches
<!-- BEGIN ROLE-NOTES -->
- No plan gating anywhere in Vehicles, Real Estate or Rental: every route only runs `authenticate`, and services filter by the caller's user id (`packages/api/src/routes/vehicles.routes.ts:23`, `packages/api/src/routes/realEstate.routes.ts:19`, `packages/api/src/routes/rental.routes.ts:35`, `packages/api/src/routes/propertyMedia.routes.ts:20`).
- Family view (`X-Viewing-As-Family`) has no effect here: services query `where: { userId: req.user.id }`, so owners, contributors and viewers see only their own vehicles and properties (`packages/api/src/services/vehicles/vehicles.service.ts:105`, `packages/api/src/services/realEstate/realEstate.service.ts:125`, `packages/api/src/services/rental/rental.service.ts:215`).
- The Vehicles **Family** button groups by the RC owner-name text; it is unrelated to the Family feature (`apps/web/src/pages/vehicles/VehicleListPage.tsx:50`).
- Managing (`X-Act-As`): `req.user` becomes the managed profile, so every read and write lands in the managed person's data (`packages/api/src/middleware/authenticate.ts:54`). Reminder emails are sent through the property owner's (managed person's) Gmail connection (`packages/api/src/services/rental/rental.reminders.service.ts:584`) while `/api/gmail` is refused during managing — a managed profile without its own Gmail will fail with "Connect Gmail in Settings → Email notifications first".
- Ownership failures return 403 Forbidden for vehicles, rental properties, tenancies, receipts, reminders and expenses (`packages/api/src/services/vehicles/vehicles.service.ts:135`, `packages/api/src/services/rental/rental.service.ts:245`) but 404 "Property <id> not found" for owned properties (`packages/api/src/services/realEstate/realEstate.service.ts:136`).
- Valuation quotes are cached globally by vehicle parameters and shared across users; no personal data is in the cache key (`packages/api/src/services/valuation/quoteService.ts:41`).
- The professional workspace (R-PROF) is not served by these routes; whether a CA grant's "VEHICLE"/"RENTAL" categories expose this data inside Client books is B09's scope (`packages/api/src/services/ca/caAccess.service.ts:613`).
<!-- END ROLE-NOTES -->
