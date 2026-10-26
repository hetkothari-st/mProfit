---
id: [F-LOAN-014](F-LOAN-014.md)
title: "Reveal full loan account number (audited, 5/min)"
module: "Loans"
status: Backend-only
roles: "—"
in_manual: false
---

[← Loans](../modules/loans.md) · [Index](../INDEX.md)

# Reveal full loan account number (audited, 5/min)

`F-LOAN-014` · Backend-only · Roles: —

This entry has no section in the product manual (usually a background job, an API with no screen, or a hidden page). What the inventory records:

| | |
|---|---|
| Module | Loans |
| Page / route | none |
| Actions | — |
| Settings | — |
| Backend | POST /api/loans/:id/reveal-account |
| Data read / changed | Loan (read), AuditLog (write) |
| Sources | ``packages/api/src/routes/loans.routes.ts:44``, ``packages/api/src/controllers/loans.controller.ts:162`` |

Gaps and defects: [DOCUMENTATION_GAPS.md](../DOCUMENTATION_GAPS.md).
