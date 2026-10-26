# Documentation Gaps — Property & Vehicles (B05)

> Product: EveryPaisa · Generated: 2026-10-23 · Source commit: 9d9025c4
> UI verification: Code-only — not visually verified
> Scope: Module(s): Vehicles, Real Estate, Rental

## Verification limitations
- UI not visually verified: this run was code-only. Labels, messages and layout come from source; maps, sliders, the photo viewer and responsive layouts were not seen.
- Vehicle RC, challan, photo, fuel-price and valuation data come from third-party sites (carinfo.app, VAHAN/Parivahan endpoints, rahastas.in, echallan.parivahan.gov.in, cardekho.com, carwale.com, cars24.com) and OpenStreetMap Nominatim; none was exercised.
- Email (Gmail API) and SMS (Twilio) sending for rent reminders need live credentials; not exercised.

## Unverified claims
| ID | Item | What is unknown | Why it couldn't be verified | Suggested owner action |
|---|---|---|---|---|
<!-- BEGIN UNVERIFIED -->
| F-VEH-003 | CarInfo OTP add flow in production | Whether the server host can run the Playwright browser, whether CarInfo accepts any mobile or only the RC owner's, and whether the in-memory 10-minute session survives multi-instance deploys | Needs a live run; sessions live in process memory (`packages/api/src/lib/playwrightSessions.ts:61`) | Run the flow on production-like infra |
| F-VEH-003 | Error text when **Get OTP** fails | `initiateCarInfoScrape` throws plain errors that the error handler turns into "Internal server error" in production (`packages/api/src/ingestion/vehicle/carinfoPlaywright.ts:110`, `packages/api/src/middleware/errorHandler.ts:114`) | Depends on which statement fails | Wrap in a domain error with a user message |
| F-VEH-008 | RC source chain success rate | Whether CarInfo, mParivahan and Rahastas currently return data | Third-party, runtime only | Monitor the import-failures queue for "vehicle.chain" rows |
| F-VEH-008 | Built-in mParivahan development fixture in production | The adapter returns fixture data for the plates in `fixtures/dev.json` (MH47BT5950, MH47BT5590, KA01AB1234) whenever that file exists at runtime; the build (`tsc`) does not copy JSON, so it probably does not exist in production, but the Docker image was not inspected | `packages/api/src/ingestion/vehicle/mparivahan.ts:29`, `packages/api/src/ingestion/vehicle/mparivahan.ts:363`, `packages/api/package.json:9` | Gate the fixture on NODE_ENV like the portal adapter |
| F-VEH-009 | Stock photo sources | Which image sources the resolver uses and their licence | Resolver internals not traced | Document the photo source |
| F-VEH-010 | Challan sources | Whether CarInfo challan pages and the echallan REST endpoint still answer | Runtime only | Monitor failures |
| F-VEH-012 | Live valuation sources | Whether CarDekho/CarWale/Cars24 scrapes currently work, i.e. how often quotes are "Estimated" | Runtime only | Monitor "valuation.chain" failures |
| F-VEH-014 | Daily RC refresh effect | Whether the job refreshes vehicles successfully in production | Runtime only | Check job logs |
| F-VEH-015 | Monthly challan scan effect | As above | Runtime only | Check job logs |
| F-REST-002 | Map tiles and address lookups | Whether openstreetmap.org tiles and Nominatim are reachable from users' networks and the server; Nominatim usage-policy compliance at scale | External service | Consider a hosted geocoder/tiles at scale |
| F-REST-011 | Same as F-REST-002 for the single-property card | — | External service | — |
| F-RENT-016 | Reminder delivery | Whether Gmail sending and Twilio SMS work in production; SMS defaults to provider "none" | Live credentials | Verify env and a test send |
| D-REST-003 | Documents on property delete | Whether vault documents of a deleted property/rental are removed | Document vault is another batch's component | Owner of the vault to confirm |
<!-- END UNVERIFIED -->

## Implementation ambiguities and possible defects
| ID | Observation | Evidence (path:line) | Question |
|---|---|---|---|
<!-- BEGIN AMBIGUITIES -->
| F-RENT-010 | Defect (data loss): **Undo** on an auto-matched rent month deletes the bank credit's own cash-flow entry. The projection passes its newly created cash flow into the auto-match, the ledger entry stores that id, and undo deletes every cash flow referenced by the month's auto-matched entries — the imported UPI/NEFT credit vanishes from Cash Activity while its event stays PROJECTED pointing at a deleted row | `packages/api/src/ingestion/projection.ts:326`, `packages/api/src/ingestion/projection.ts:286`, `packages/api/src/services/rental/rental.service.ts:1112`, `packages/api/src/services/rental/rental.service.ts:1201` | Should undo only unlink (not delete) a cash flow it did not create? |
| F-RENT-016 | Defect: rejecting a reminder does not stick. REJECTED is in REVIVABLE_STATUSES, so the next scan that selects the same (month, lead day) puts it back in the queue — for overdue months that is every daily 09:00 scan. The code comment says the opposite ("a future scan won't re-create it") | `packages/api/src/services/rental/rental.reminders.service.ts:154`, `packages/api/src/services/rental/rental.reminders.service.ts:163`, `packages/api/src/services/rental/rental.reminders.service.ts:164` | Remove REJECTED from the revivable set? |
| F-REST-009 | Defect: **Remove from rentals** on a rental with tenancies/expenses throws a plain `Error`, which production answers as 500 "Internal server error"; the intended message ("Cannot unlink rental — tenancies or expenses already exist. Delete those first.") never reaches the user, and tenancies cannot be deleted in the web app anyway | `packages/api/src/services/realEstate/realEstate.service.ts:433`, `packages/api/src/middleware/errorHandler.ts:114` | Throw BadRequestError; offer a path to remove tenancies? |
| F-RENT-003 | Defect: deleting a rental property (or tenancy via API) leaves its rent/deposit cash-flow rows behind — `RentLedgerEntry.cashFlowId` is a plain column and the delete does not clean them, so "Rent received — …" inflows stay in Cash Activity | `packages/api/src/services/rental/rental.service.ts:327`, `packages/api/src/services/rental/rental.service.ts:636`, `packages/api/prisma/schema.prisma:2239` | Delete linked cash flows on cascade? |
| F-RENT-003 | Deleting a rental property linked from Real Estate clears the link (default SetNull) but leaves the owned property's status "Rented out" | `packages/api/prisma/schema.prisma:3304`, `packages/api/src/services/rental/rental.service.ts:327` | Reset status like unlink does? |
| F-VEH-013 | Defect: after **Use my car**, the cascade-reset effects run on the newly set category/make/model and blank the Model, Year and Trim selects (the quote itself is kept) | `apps/web/src/pages/vehicles/VehicleValuePage.tsx:97`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:100`, `apps/web/src/pages/vehicles/VehicleValuePage.tsx:145` | Skip the resets when values come from auto-valuation |
| F-VEH-007 | Defect: the edit form drops empty strings before PATCH, so a field cannot be cleared (e.g. a wrong PUC date) | `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:122` | Send null for cleared fields |
| F-VEH-006 | Defect: the detail page renders "Loading…" whenever the vehicle is absent, including after a 404/403, so a bad link never shows an error | `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:226` | Add a not-found state |
| F-VEH-003 | The add wizard has no manual-entry path: the "details" step is reachable only in edit mode, so a vehicle can be added only via CarInfo OTP or SMS paste (or onboarding quick-add) | `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:73`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:221` | Intended? |
| F-REST-005 | For a sold property the tile "Realised gain (raw)" is current value − cost, not sale proceeds − cost | `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:119`, `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:248` | Use sale price when sold |
| F-REST-007 | Changing Status away from Sold in the edit form leaves `isActive` false and keeps sale fields, so the property stays out of alerts | `packages/api/src/services/realEstate/realEstate.service.ts:213`, `packages/api/src/services/realEstate/realEstate.service.ts:323` | Provide an explicit "undo sale"? |
| F-REST-001 | Summary tiles and card gains ignore **My share (%)** (full value and full cost), while capital gain applies the share | `apps/web/src/pages/realEstate/RealEstateListPage.tsx:778`, `packages/api/src/services/realEstate/propertyCapitalGain.ts:99` | Should net worth use the owner's share? |
| F-RENT-002 | Rental dialogs (property, tenancy, expense, khata, contact save, reminders) show `err.message`, i.e. "Request failed with status code 4xx", not the server's reason | `apps/web/src/pages/rental/RentalListPage.tsx:311`, `apps/web/src/pages/rental/RentalDetailPage.tsx:784`, `apps/web/src/pages/rental/RentalDetailPage.tsx:899`, `apps/web/src/pages/rental/TenantKhataPage.tsx:109` | Use apiErrorMessage like Real Estate does |
| F-RENT-009 | Skip / Undo skip / Undo received / Undo auto-match have no onError or success feedback; refusals are silent | `apps/web/src/pages/rental/RentalDetailPage.tsx:231`, `apps/web/src/pages/rental/RentalDetailPage.tsx:243` | Add toasts |
| F-RENT-011 | Expense delete is one click with no confirmation and no undo | `apps/web/src/pages/rental/RentalDetailPage.tsx:1141` | Add confirm like the khata |
| F-RENT-006 | A tenancy without an end date gets only 12 months of receipts; nothing extends the schedule later (receipt generation runs only on create and on end-date extension) | `packages/api/src/services/rental/rental.service.ts:193`, `packages/api/src/services/rental/rental.service.ts:439`, `packages/api/src/services/rental/rental.service.ts:529` | Add a rolling extension job? |
| F-RENT-016 | Only PENDING_APPROVAL reminders are listed; sent/failed history and per-channel errors are stored but never shown | `apps/web/src/pages/rental/RentalRemindersPanel.tsx:937`, `packages/api/src/services/rental/rental.reminders.service.ts:431` | Show history? |
| F-VEH-016 | Expiry alerts fire only when the daily scan lands exactly on day 30/15/7/1; vehicle alerts compute "today" at server-local midnight while real-estate alerts use UTC midnight | `packages/api/src/services/notifications/alerts.service.ts:121`, `packages/api/src/services/notifications/alerts.service.ts:147`, `packages/api/src/services/realEstate/realEstateAlerts.ts:25` | Use "≤ threshold and not yet sent" semantics; one clock |
| F-VEH-010 | Challan totals are summed with JS numbers in the browser (money rule violation), and challans removed at source are never removed | `apps/web/src/pages/vehicles/VehicleDetailPage.tsx:117`, `packages/api/src/services/vehicles/challans.service.ts:158` | Use Decimal; reconcile removals |
| F-VEH-002 | The "Family" toggle groups by RC owner-name text, not by the Family feature's members — users may expect family members' vehicles | `apps/web/src/pages/vehicles/VehicleListPage.tsx:50` | Rename to "By owner"? |
| F-RENT-015 | **Remind** opens WhatsApp with `window.open` after an awaited request; popup blockers may block it | `apps/web/src/pages/rental/RentalListPage.tsx:577`, `apps/web/src/pages/rental/TenantKhataPage.tsx:327` | Open the window first, then set its URL |
<!-- END AMBIGUITIES -->

## Hidden, partial, backend-only, deprecated features
| ID | Feature | Status | Evidence |
|---|---|---|---|
<!-- BEGIN HIDDEN -->
| F-VEH-017 | Linked insurance policies are returned with a vehicle (insurer, type, plan, last 4, next premium, status) but never rendered on the vehicle page | Hidden | `packages/api/src/services/vehicles/vehicles.service.ts:129`, `apps/web/src/api/vehicles.api.ts:62` |
| F-VEH-018 | Vehicle fields the API accepts but no form sets: model, fuel type, owner name, purchase date, purchase price, current value (except via valuation save), current-value source, permit expiry, registration number change | Backend-only | `packages/api/src/controllers/vehicles.controller.ts:32`, `apps/web/src/pages/vehicles/VehicleFormDialog.tsx:374` |
| F-VEH-019 | Parivahan portal OTP adapter (headed browser): disabled in production unless `ENABLE_PARIVAHAN_PORTAL_ADAPTER=true`; without `USE_PORTAL_BROWSER=true` it reads a fixture file; never used by the daily job | Hidden | `packages/api/src/ingestion/vehicle/portal.ts:35`, `packages/api/src/ingestion/vehicle/portal.ts:219`, `packages/api/src/ingestion/vehicle/portal.ts:278` |
| F-REST-013 | Linked loan / insurance on a property: shown when present, but no UI sets them (only the rental link via **Make rental**) | Partial | `apps/web/src/pages/realEstate/RealEstateDetailPage.tsx:387`, `apps/web/src/pages/realEstate/PropertyFormDialog.tsx:103` |
| F-REST-014 | `GET /api/real-estate/summary` — used only by the sidebar value (B10), not by B05 pages | Backend-only | `packages/api/src/routes/realEstate.routes.ts:22`, `apps/web/src/hooks/useSidebarClassValues.ts:29` |
| F-RENT-020 | Edit tenancy terms (rent, end date, due day, notes, active), end a tenancy, delete a tenancy: API exists (`PATCH`/`DELETE /api/rental/tenancies/:id`), web client has `deleteTenancy` but no page calls it; the web only patches contact and bank account | Backend-only | `packages/api/src/routes/rental.routes.ts:57`, `packages/api/src/services/rental/rental.service.ts:463`, `packages/api/src/services/rental/rental.service.ts:634`, `apps/web/src/api/rental/rental.api.ts:278` |
| F-RENT-021 | Landlord name and payment instructions per rental property, and per-account payment instructions, feed reminder text but have no UI | Backend-only | `packages/api/src/controllers/rental.controller.ts:40`, `packages/api/src/services/rental/rental.reminders.service.ts:189`, `packages/api/src/services/notifications/config.service.ts:190` |
| F-RENT-022 | `GET /api/rental/receipts`, `GET /api/rental/expenses`, `POST /api/rental/receipts/mark-overdue`, `PATCH /api/rental/entries/:id` — client methods exist, no page calls them | Backend-only | `packages/api/src/routes/rental.routes.ts:61`, `packages/api/src/routes/rental.routes.ts:67`, `packages/api/src/routes/rental.routes.ts:70`, `packages/api/src/routes/rental.routes.ts:54` |
<!-- END HIDDEN -->

## UI / API permission mismatches
| ID | UI behavior | API behavior | Evidence |
|---|---|---|---|
<!-- BEGIN MISMATCHES -->
| F-RENT-020 | No way to change rent, end or delete a tenancy | Owner may do all of these via the API | `packages/api/src/routes/rental.routes.ts:57`, `packages/api/src/routes/rental.routes.ts:58` |
| F-REST-004 | Not-yours owned property → "Property not found" | Owned property routes answer 404, while vehicle/rental routes answer 403 Forbidden for another user's record | `packages/api/src/services/realEstate/realEstate.service.ts:136`, `packages/api/src/services/vehicles/vehicles.service.ts:135` |
| F-RENT-016 | Managing a family member: the panel lets you approve email reminders | Email sends through the managed person's Gmail connection, which cannot be set while managing (`/api/gmail` is an account route) — sends fail "gmail_not_connected" unless that person connected Gmail themselves | `packages/api/src/services/rental/rental.reminders.service.ts:584`, `packages/api/src/middleware/authenticate.ts:47` |
<!-- END MISMATCHES -->

## Choices made without asking
| Choice | Alternatives | Why |
|---|---|---|
<!-- BEGIN CHOICES -->
| Property photos (F-REST-010), location pin (F-REST-011) and grid/map view (F-REST-002) are documented once under Real Estate IDs and cross-referenced from Rental | Duplicate under RENT IDs | Same shared components and endpoints; one definition avoids drift |
| Automatic jobs and alerts (vehicle refresh, challan scan, expiry/property/rent alerts, reminder scan) are Live features in this batch | Leave to B10 Alerts | Their logic lives in B05 services; the Alerts page itself is a dependency (D-VEH-002, D-REST-002) |
| `/vehicles/value` valuation, catalogue endpoints and the fuel-price card are documented in Vehicles | Separate module | They are reached only from the Vehicles pages |
| The document vault on property pages is a dependency (D-REST-003), not documented | Document here | Shared component owned by the documents area |
| Linked loan/insurance on a property marked Partial | Hidden | The links render and work when present, but cannot be created in the UI |
| No new R- IDs; the Vehicles "Family" grouping and family view behaviour recorded as notes | Define a household role | Brief forbids new R- IDs; behaviour fits existing roles |
| Doc status "Gaps" for features whose behaviour depends on third-party sites or live credentials | Verified | Code was read fully, but production outcome cannot be confirmed code-only |
<!-- END CHOICES -->

## Audit allow-list
| Literal | Where it appears in source | Why it's not real data |
|---|---|---|
<!-- BEGIN ALLOWLIST -->
<!-- END ALLOWLIST -->
