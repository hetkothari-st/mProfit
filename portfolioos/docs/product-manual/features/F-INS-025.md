---
id: [F-INS-025](F-INS-025.md)
title: "Insurance endpoints and fields without a screen (alerts trigger; status, health-cover details, vehicle, portfolio via API)"
module: "Insurance"
status: Backend-only
roles: "Signed-in callers"
in_manual: false
---

[← Insurance](../modules/insurance.md) · [Index](../INDEX.md)

# Insurance endpoints and fields without a screen (alerts trigger; status, health-cover details, vehicle, portfolio via API)

`F-INS-025` · Backend-only · Roles: Signed-in callers

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Insurance |
| Page / route | none |
| Actions | API only |
| Settings | — |
| Backend | POST /api/insurance/alerts/trigger; PATCH policy fields |
| Data read / changed | Alert, InsurancePolicy (write) |
| Sources | ``packages/api/src/routes/insurance.routes.ts:82``, ``packages/api/src/controllers/insurance.controller.ts:84`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
