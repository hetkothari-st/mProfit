---
id: [F-RENT-021](F-RENT-021.md)
title: "Landlord name and payment instructions (per property / per account)"
module: "Rental"
status: Backend-only
roles: "—"
in_manual: false
---

[← Rental](../modules/rental.md) · [Index](../INDEX.md)

# Landlord name and payment instructions (per property / per account)

`F-RENT-021` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Rental |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | PATCH /api/rental/properties/:id, notification config |
| Data read / changed | RentalProperty.landlordName/paymentInstructions, UserNotificationConfig.paymentInstructions |
| Sources | ``packages/api/src/controllers/rental.controller.ts:40``, ``packages/api/src/services/rental/rental.reminders.service.ts:189``, ``packages/api/src/services/notifications/config.service.ts:190`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
