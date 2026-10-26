---
id: [F-REPORT-018](F-REPORT-018.md)
title: "Report endpoints with no UI in scope (rebuild capital gains; JSON grandfathering / demat / M2M; provident-fund statement and FY bundle used only by the CA workspace)"
module: "Reports"
status: Backend-only
roles: "Authenticated callers"
in_manual: false
---

[← Reports](../modules/reports.md) · [Index](../INDEX.md)

# Report endpoints with no UI in scope (rebuild capital gains; JSON grandfathering / demat / M2M; provident-fund statement and FY bundle used only by the CA workspace)

`F-REPORT-018` · Backend-only · Roles: Authenticated callers

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Reports |
| Page / route | none |
| Actions | API only |
| Settings | — |
| Backend | POST /api/reports/rebuild-capital-gains; GET /api/reports/grandfathering, demat-holdings, m2m, statement/provident-fund, fy-bundle |
| Data read / changed | CapitalGain (write for rebuild) |
| Sources | ``packages/api/src/routes/reports.routes.ts:97``, ``packages/api/src/routes/reports.routes.ts:111``, ``packages/api/src/routes/reports.routes.ts:117`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
