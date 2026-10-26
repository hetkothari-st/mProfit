---
id: [F-ANLYT-014](F-ANLYT-014.md)
title: "Benchmark series endpoint (NIFTY 50 + Sensex rebased to 100) with no UI caller"
module: "Analytics"
status: Backend-only
roles: "Authenticated callers"
in_manual: false
---

[← Analytics](../modules/analytics.md) · [Index](../INDEX.md)

# Benchmark series endpoint (NIFTY 50 + Sensex rebased to 100) with no UI caller

`F-ANLYT-014` · Backend-only · Roles: Authenticated callers

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Analytics |
| Page / route | none |
| Actions | API only |
| Settings | — |
| Backend | GET /api/analytics/benchmark |
| Data read / changed | Index prices (read) |
| Sources | ``packages/api/src/routes/analytics.routes.ts:25``, ``packages/api/src/controllers/analytics.controller.ts:80`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
